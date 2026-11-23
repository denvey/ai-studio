import { Alert, App, Button, DatePicker, Segmented } from "antd";
import { IconButton } from "@/pages/admin/ui/controls";
import { AdminModal } from "@/pages/admin/ui/overlays";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { Download, Eye, Play, Search, RefreshCw } from "lucide-react";
import { saveAs } from "file-saver";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { PaginationBar } from "@/pages/admin/components/admin-ui";
import { MediaPreview } from "@/components/media-preview";
import { formatCredits } from "@/constant/credits";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { mediaDeliverySummary } from "@/lib/generation-task-display";
import { batchRecoverAdminApiLogs, exportAdminApiLogs, listAdminApiLogs, type ApiCallLog } from "@/services/api/auth";
import { ApiLogDetailDrawer } from "../components/api-log-detail-drawer";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminBatchBar, AdminDataTable, AdminExportButton, AdminFilterChip, AdminStatusBadge, AdminTableEmpty } from "../components/admin-ui";
import { logBillingLabel, logStatus, normalizeLogView, videoRecoveryAvailable } from "./log-view";
import "./logs-page.css";
import { Select } from "@/components/ui/base/select";
import { AdminSearchInput } from "../components/admin-search-input";
import { useAdminContext } from "../admin-context";
import { useAdminUserOptions } from "../components/use-admin-user-options";
import { currentLocale, translate } from "@/i18n";

// 后端单次查询最多覆盖 366 天（含首尾），超出时服务端会静默截断，所以在界面上直接拒绝。
const MAX_RANGE_DAYS = 366;

export default function LogsPage() {
    const { message, modal } = App.useApp();
    const { references } = useAdminContext();
    const [searchParams, setSearchParams] = useSearchParams();
    const keyword = searchParams.get("filter") || "";
    const view = normalizeLogView(searchParams.get("view"));
    const status = normalizeStatus(searchParams.get("status"));
    const recordType = searchParams.get("recordType") === "download" ? "download" : searchParams.get("recordType") === "all" ? "all" : "request";
    const capability = normalizeCapability(searchParams.get("capability"));
    const fromDay = normalizeDay(searchParams.get("from"));
    const toDay = normalizeDay(searchParams.get("to"));
    const userId = searchParams.get("userId") || "";
    const modelFilter = searchParams.get("model") || "";
    const channelId = searchParams.get("channelId") || "";
    const page = positiveInt(searchParams.get("page"), 1);
    const pageSize = normalizePageSize(searchParams.get("pageSize"));
    const debouncedKeyword = useDebouncedValue(keyword);
    const userOptions = useAdminUserOptions(userId || undefined);
    const channelOptions = useMemo(() => references.channels.map((channel) => ({ value: channel.id, label: channel.name })), [references.channels]);
    const modelOptions = useMemo(() => {
        const names = new Set<string>();
        references.channels.forEach((channel) => channel.models?.forEach((name) => names.add(name)));
        if (modelFilter) names.add(modelFilter);
        return [...names].sort().map((name) => ({ value: name, label: name }));
    }, [modelFilter, references.channels]);
    // 服务端按 UTC 自然日截取（含结束日）。未显式选择时不提交，由服务端取近 30 个 UTC 日，
    // 界面同时按 UTC 日历显示这个默认范围，保证看到的范围与实际查询一致。
    const defaultRange = useMemo(utcDefaultRange, []);
    const explicitRange = Boolean(fromDay && toDay);
    const rangeParams = explicitRange ? { from: fromDay, to: toDay } : {};
    const queryFilters = {
        recordType,
        capability: capability === "all" ? undefined : capability,
        keyword: debouncedKeyword || undefined,
        status: status === "all" ? undefined : status,
        userId: userId || undefined,
        model: modelFilter || undefined,
        channelId: channelId || undefined,
        ...rangeParams,
    } as const;
    const [logs, setLogs] = useState<ApiCallLog[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [retry, setRetry] = useState(0);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [detailLogId, setDetailLogId] = useState<string | null>(null);
    const [batchRecovering, setBatchRecovering] = useState(false);
    const [mediaPreview, setMediaPreview] = useState<{ url: string; kind: "image" | "video"; title: string } | null>(null);
    const requestSequence = useRef(0);
    const hasFilters = Boolean(keyword || status !== "all" || recordType !== "request" || capability !== "all" || explicitRange || userId || modelFilter || channelId);

    const updateUrl = (patch: Record<string, string | number>, replace = false) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(patch).forEach(([key, value]) => {
            const isDefault = value === "" || (key === "status" && value === "all") || (key === "recordType" && value === "request") || (key === "capability" && value === "all") || (key === "page" && value === 1) || (key === "pageSize" && value === 20);
            if (isDefault) next.delete(key);
            else next.set(key, String(value));
        });
        setSearchParams(next, { replace });
    };

    useEffect(() => {
        const sequence = ++requestSequence.current;
        setLoading(true);
        setLoadError("");
        setLogs([]);
        setTotal(0);
        setSelectedIds([]);
        void listAdminApiLogs({ ...queryFilters, page, pageSize })
            .then((result) => {
                if (sequence !== requestSequence.current) return;
                setLogs(result.logs);
                setTotal(result.total);
                setSelectedIds([]);
                if (result.total > 0 && result.logs.length === 0 && page > 1) updateUrl({ page: 1 }, true);
            })
            .catch((error) => {
                if (sequence !== requestSequence.current) return;
                const text = error instanceof Error ? error.message : translate("adminPages.logs.logsPage.failedToLoadRequestDetails2");
                setLoadError(text);
                message.error(text);
            })
            .finally(() => sequence === requestSequence.current && setLoading(false));
        return () => {
            requestSequence.current += 1;
        };
    }, [debouncedKeyword, status, recordType, capability, fromDay, toDay, userId, modelFilter, channelId, page, pageSize, retry]);

    const fullColumns: ColumnsType<ApiCallLog> = [
        {
            title: translate("adminPages.logs.logsPage.time"),
            width: 168,
            render: (_, log) => (
                <button type="button" className="admin-log-detail-link" aria-label={translate("adminPages.logs.logsPage.viewRequestDetails", { v0: String(log.id) })} onClick={() => setDetailLogId(log.id)}>
                    {formatTime(log.startedAt || log.createdAt)}
                </button>
            ),
        },
        {
            title: translate("adminPages.logs.logsPage.users"),
            width: 180,
            render: (_, log) => (
                <div className="min-w-0">
                    <div className="truncate font-medium text-foreground/85">{log.userDisplayName || log.userAccount || translate("adminPages.logs.logsPage.unknownUser")}</div>
                    <div className="truncate text-xs text-foreground/45">{log.userAccount ? `@${log.userAccount}` : translate("adminPages.logs.logsPage.noAccountRecorded")}</div>
                </div>
            ),
        },
        {
            title: translate("adminPages.logs.logsPage.channelModel"),
            width: 230,
            render: (_, log) => (
                <div className="min-w-0">
                    <div className="truncate text-foreground/78">{log.channelName || translate("adminPages.logs.logsPage.noChannelRecorded")}</div>
                    <div className="truncate text-xs text-foreground/45" title={log.model}>
                        {log.model || translate("adminPages.logs.logsPage.unrecognizedModel")}
                    </div>
                </div>
            ),
        },
        { title: translate("adminPages.logs.logsPage.capability"), dataIndex: "capability", width: 88, render: capabilityText },
        {
            title: translate("adminPages.logs.logsPage.result"),
            width: 118,
            render: (_, log) => <MediaResult log={log} onPreview={(url, kind) => setMediaPreview({ url, kind, title: translate("adminPages.logs.logsPage.result2", { v0: String(capabilityText(log.capability)) }) })} />,
        },
        { title: translate("adminPages.logs.logsPage.requestStageStatus"), width: 160, render: (_, log) => <CallStatus log={log} /> },
        {
            title: translate("adminPages.logs.logsPage.errorMessage"),
            width: 260,
            render: (_, log) =>
                log.status === "failed" || log.error || log.errorCode ? (
                    <div className="min-w-0" title={[log.errorCode, log.error].filter(Boolean).join(" · ")}>
                        <div className="truncate text-xs font-medium text-red-500">{log.errorCode || `HTTP ${log.statusCode || translate("library.assets.batch.failed")}`}</div>
                        <div className="line-clamp-2 text-xs leading-5 text-foreground/55">{log.error || translate("adminPages.logs.logsPage.upstreamReturnedNoErrorDetails")}</div>
                    </div>
                ) : (
                    <span className="text-foreground/30">--</span>
                ),
        },
        { title: translate("library.tasks.detail.duration"), dataIndex: "durationMs", width: 112, render: (value) => <span className="tabular-nums">{formatDuration(value)}</span> },
        { title: translate("adminPages.logs.logsPage.creditCalculation"), width: 195, render: (_, log) => <BillingSummary log={log} /> },
        {
            title: "Tokens",
            width: 166,
            render: (_, log) =>
                log.usageAvailable ? (
                    <div className="space-y-0.5 text-xs tabular-nums">
                        <div>
                            <span className="text-foreground/40">{translate("adminPages.logs.logsPage.input")}</span> {log.inputTokens.toLocaleString(currentLocale())}
                        </div>
                        <div>
                            <span className="text-foreground/40">{translate("adminPages.logs.logsPage.output")}</span> {log.outputTokens.toLocaleString(currentLocale())}
                        </div>
                        {log.cachedTokens > 0 ? (
                            <div>
                                <span className="text-foreground/40">{translate("adminPages.logs.logsPage.cacheHits")}</span> {log.cachedTokens.toLocaleString(currentLocale())}
                            </div>
                        ) : null}
                        {(log.cacheWriteTokens ?? 0) > 0 ? (
                            <div>
                                <span className="text-foreground/40">{translate("adminPages.logs.logsPage.cacheWrites")}</span> {(log.cacheWriteTokens ?? 0).toLocaleString(currentLocale())}
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <span className="text-foreground/35">{translate("adminPages.logs.logsPage.notReturned")}</span>
                ),
        },
    ];

    const identityColumns: ColumnsType<ApiCallLog> = [
        {
            title: translate("adminPages.logs.logsPage.timeDetails"),
            key: "time",
            width: 142,
            render: (_, log) => (
                <button
                    type="button"
                    className="admin-log-detail-link"
                    title={formatTime(log.startedAt || log.createdAt)}
                    aria-label={translate("adminPages.logs.logsPage.viewRequestDetails", { v0: String(log.id) })}
                    onClick={() => setDetailLogId(log.id)}
                >
                    {formatCompactTime(log.startedAt || log.createdAt)}
                </button>
            ),
        },
        { title: translate("library.tasks.detail.status"), key: "status", width: 88, render: (_, log) => <AdminStatusBadge {...logStatus(log)} /> },
        { title: translate("canvasA.assetView.model"), dataIndex: "model", width: 170, ellipsis: true, render: (value) => value || translate("adminPages.logs.logsPage.unrecognizedModel") },
        { title: translate("adminPages.logs.logsPage.channel"), dataIndex: "channelName", width: 116, ellipsis: true, render: (value) => value || translate("adminPages.logs.logsPage.noChannelRecorded") },
        {
            title: translate("adminPages.logs.logsPage.users"),
            key: "user",
            width: 110,
            ellipsis: true,
            render: (_, log) => <span title={[log.userDisplayName, log.userAccount].filter(Boolean).join(" · ")}>{log.userDisplayName || log.userAccount || translate("adminPages.logs.logsPage.unknownUser")}</span>,
        },
    ];
    const compactColumns: ColumnsType<ApiCallLog> =
        view === "billing"
            ? [
                  ...identityColumns,
                  { title: translate("adminPages.logs.logsPage.preauthorization"), key: "reserved", align: "right", width: 100, render: (_, log) => (log.billable && log.billingAvailable ? formatCredits(log.billingReservedMicrocredits) : "—") },
                  {
                      title: translate("adminPages.logs.logsPage.charged"),
                      key: "settled",
                      align: "right",
                      width: 100,
                      render: (_, log) => (log.billable && log.billingAvailable && log.billingSettledMicrocredits !== undefined ? formatCredits(log.billingSettledMicrocredits) : "—"),
                  },
                  {
                      title: translate("adminPages.logs.logsPage.costInCredits"),
                      key: "cost",
                      align: "right",
                      width: 108,
                      render: (_, log) =>
                          log.creditCostMicrocredits !== undefined ? formatCredits(log.creditCostMicrocredits) : log.creditCostConfigured ? translate("adminPages.logs.logsPage.pendingCalculation") : translate("account.layout.oss.cdnAuthNone"),
                  },
                  { title: translate("adminPages.logs.logsPage.billingStatus"), key: "billingStatus", width: 100, render: (_, log) => logBillingLabel(log) },
                  {
                      title: translate("adminPages.logs.logsPage.tokensInOut"),
                      key: "usage",
                      width: 142,
                      render: (_, log) => (log.usageAvailable ? `${log.inputTokens.toLocaleString(currentLocale())} / ${log.outputTokens.toLocaleString(currentLocale())}` : translate("adminPages.logs.logsPage.notReturned")),
                  },
              ]
            : [
                  ...identityColumns,
                  { title: translate("adminPages.logs.logsPage.stage"), key: "kind", width: 90, render: (_, log) => requestKindText(log.requestKind) },
                  { title: translate("library.tasks.detail.duration"), dataIndex: "durationMs", align: "right", width: 90, render: formatDuration },
                  {
                      title: translate("adminPages.logs.logsPage.errorSummary"),
                      key: "error",
                      ellipsis: true,
                      render: (_, log) => (
                          <span className={logStatus(log).tone === "error" ? "admin-log-error" : undefined} title={[log.errorCode, log.error].filter(Boolean).join(" · ")}>
                              {[log.errorCode, log.error].filter(Boolean).join(" · ") ||
                                  (logStatus(log).tone === "error" ? translate("adminPages.logs.logsPage.hTTPNoDetailsReturned", { v0: String(log.statusCode || translate("library.assets.batch.failed")) }) : "—")}
                          </span>
                      ),
                  },
              ];
    const baseColumns = view === "all" ? fullColumns : compactColumns;
    const columns: ColumnsType<ApiCallLog> = [
        ...baseColumns,
        {
            title: translate("account.settings.runninghub.actions"),
            key: "actions",
            width: 126,
            fixed: "right",
            render: (_, log) =>
                videoRecoveryAvailable(log) ? (
                    <Button type="link" size="small" icon={<RefreshCw className="size-3.5" />} onClick={() => setDetailLogId(log.id)}>
                        {translate("adminPages.logs.logsPage.recoverTasks")}
                    </Button>
                ) : (
                    <span className="text-foreground/30">--</span>
                ),
        },
    ];

    const applyDateRange = (start: Dayjs | null, end: Dayjs | null) => {
        if (start && end && end.diff(start, "day") + 1 > MAX_RANGE_DAYS) {
            message.warning(translate("adminPages.logs.logsPage.youCanQueryAtMostDaysAtATimeNarrow", { v0: String(MAX_RANGE_DAYS) }));
            return;
        }
        updateUrl({ from: start && end ? start.format("YYYY-MM-DD") : "", to: start && end ? end.format("YYYY-MM-DD") : "", page: 1 });
    };

    const runBatchRecovery = async () => {
        const selectedLogs = logs.filter((log) => selectedIds.includes(log.id));
        const videoIds = selectedLogs.filter(videoRecoveryAvailable).map((log) => log.id);
        const skipped = selectedIds.length - videoIds.length;
        if (videoIds.length === 0) {
            message.info(translate("adminPages.logs.logsPage.theSelectedRecordsContainNoRecoverableFailedVideoTasks"));
            return;
        }
        setBatchRecovering(true);
        try {
            const result = await batchRecoverAdminApiLogs(videoIds);
            const totalSkipped = skipped + result.skipped;
            modal.info({
                title: translate("adminPages.logs.logsPage.batchRecoveryResults"),
                width: 560,
                content: (
                    <div className="max-h-[50vh] space-y-2 overflow-auto">
                        <div className="mb-3">{translate("adminPages.logs.logsPage.bulkRecoveryCounts", { succeeded: result.success, failed: result.failed, skipped: totalSkipped })}</div>
                        {result.items.map((item) => (
                            <div key={item.logId} className="rounded border border-border/70 px-3 py-2 text-xs">
                                <div className="font-mono">{item.logId}</div>
                                <div>
                                    {item.recovered
                                        ? translate("adminPages.logs.logsPage.success")
                                        : item.error?.startsWith("跳过")
                                          ? item.error
                                          : item.providerStatus
                                            ? translate("adminPages.logs.logsPage.stillGenerating", { v0: String(item.providerStatus) })
                                            : translate("adminPages.logs.logsPage.failed", { v0: String(item.error || translate("adminPages.logs.logsPage.notRecovered")) })}
                                </div>
                            </div>
                        ))}
                    </div>
                ),
            });
            if (result.success > 0) window.dispatchEvent(new CustomEvent("wallet:updated"));
            setRetry((value) => value + 1);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.logs.logsPage.bulkRecoveryFailed"));
        } finally {
            setBatchRecovering(false);
        }
    };

    return (
        <AdminPageFrame
            title={translate("adminPages.logs.logsPage.requestDetails")}
            description={translate("adminPages.logs.logsPage.modelGenerationAndResultDownloadRecordsOnlyBillableCallsConsume")}
            actions={
                <>
                    <Button
                        icon={<RefreshCw className="size-4" />}
                        loading={loading}
                        onClick={() => {
                            setLoading(true);
                            setRetry((value) => value + 1);
                        }}
                    >
                        {translate("adminPages.logs.logsPage.refreshList")}
                    </Button>
                    <AdminExportButton
                        exportFile={() => exportAdminApiLogs(queryFilters)}
                        fileName={() => translate("adminPages.logs.logsPage.requestDetailsCsv", { v0: String(new Date().toISOString().slice(0, 10)) })}
                        label={translate("adminPages.logs.logsPage.exportCurrentFilter")}
                        successMessage={translate("adminPages.logs.logsPage.exportedRequestDetailsForTheCurrentFilter")}
                        errorMessage={translate("adminPages.logs.logsPage.failedToExportRequestDetails")}
                    />
                </>
            }
        >
            {loadError ? (
                <Alert
                    type="error"
                    showIcon
                    title={translate("adminPages.logs.logsPage.failedToLoadRequestDetails")}
                    description={loadError}
                    action={
                        <Button size="small" onClick={() => setRetry((value) => value + 1)}>
                            {translate("common.retry")}
                        </Button>
                    }
                />
            ) : null}
            <AdminDataTable
                className={view === "all" ? "admin-logs-full" : "admin-logs-compact"}
                trailing={
                    <Segmented
                        aria-label={translate("adminPages.logs.logsPage.requestDetailsView")}
                        value={view}
                        onChange={(value) => updateUrl({ view: value })}
                        options={[
                            { label: translate("adminPages.logs.logsPage.troubleshoot"), value: "troubleshoot" },
                            { label: translate("canvasC.taskItem.billing"), value: "billing" },
                            { label: translate("adminPages.logs.logsPage.allFields"), value: "all" },
                        ]}
                    />
                }
                toolbar={
                    <AdminSearchInput
                        allowClear
                        className="app-list-search"
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={keyword}
                        placeholder={translate("adminPages.logs.logsPage.searchUserChannelModelPathOrRequestID")}
                        onValueChange={(value) => updateUrl({ filter: value, page: 1 }, true)}
                    />
                }
                toolbarActiveFilters={
                    <>
                        {keyword ? <AdminFilterChip label={translate("adminPages.logs.logsPage.search", { v0: String(keyword) })} onRemove={() => updateUrl({ filter: "", page: 1 })} /> : null}
                        {status !== "all" ? (
                            <AdminFilterChip
                                label={translate("adminPages.logs.logsPage.result3", { v0: String(status === "succeeded" ? translate("adminPages.logs.logsPage.success") : translate("library.assets.batch.failed")) })}
                                onRemove={() => updateUrl({ status: "all", page: 1 })}
                            />
                        ) : null}
                        {capability !== "all" ? <AdminFilterChip label={translate("adminPages.logs.logsPage.capability2", { v0: String(capabilityText(capability)) })} onRemove={() => updateUrl({ capability: "all", page: 1 })} /> : null}
                    </>
                }
                toolbarFilters={
                    <>
                        <DatePicker.RangePicker
                            aria-label={translate("adminPages.logs.logsPage.requestDateRange")}
                            value={explicitRange ? [dayjs(fromDay), dayjs(toDay)] : [dayjs(defaultRange.from), dayjs(defaultRange.to)]}
                            prefix={
                                <span className="text-xs text-foreground/50" title={translate("adminPages.logs.logsPage.filterByUTCCalendarDaysIncludingTheEndDateDefaults")}>
                                    UTC
                                </span>
                            }
                            placeholder={[translate("adminPages.logs.logsPage.startDate"), translate("adminPages.logs.logsPage.endDate")]}
                            disabledDate={(day) => day.format("YYYY-MM-DD") > defaultRange.to}
                            onChange={(dates) => applyDateRange(dates?.[0] || null, dates?.[1] || null)}
                        />
                        <Select
                            aria-label={translate("adminPages.logs.logsPage.filterByUser")}
                            className="w-44"
                            allowClear
                            showSearch
                            filterOption={false}
                            placeholder={translate("adminPages.logs.logsPage.allUsers")}
                            loading={userOptions.searching}
                            value={userId || undefined}
                            options={userOptions.options}
                            onSearch={userOptions.onSearch}
                            onChange={(value) => updateUrl({ userId: value || "", page: 1 })}
                        />
                        <Select
                            aria-label={translate("adminPages.logs.logsPage.filterByModel")}
                            className="w-48"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder={translate("library.tasks.page.allModels")}
                            value={modelFilter || undefined}
                            options={modelOptions}
                            onChange={(value) => updateUrl({ model: value || "", page: 1 })}
                        />
                        <Select
                            aria-label={translate("adminPages.logs.logsPage.filterByChannel")}
                            className="w-40"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder={translate("adminPages.logs.logsPage.allChannels")}
                            value={channelId || undefined}
                            options={channelOptions}
                            onChange={(value) => updateUrl({ channelId: value || "", page: 1 })}
                        />
                        <Select
                            aria-label={translate("adminPages.logs.logsPage.recordType")}
                            className="w-32"
                            value={recordType}
                            onChange={(value) => updateUrl({ recordType: value, page: 1 })}
                            options={[
                                { label: translate("adminPages.logs.logsPage.requestsOnly"), value: "request" },
                                { label: translate("adminPages.logs.logsPage.downloadsOnly"), value: "download" },
                                { label: translate("adminPages.logs.logsPage.allRecords"), value: "all" },
                            ]}
                        />
                        <Select
                            aria-label={translate("adminPages.logs.logsPage.capabilityType")}
                            className="w-28"
                            value={capability}
                            onChange={(value) => updateUrl({ capability: value, page: 1 })}
                            options={[
                                { label: translate("adminPages.logs.logsPage.allCapabilities"), value: "all" },
                                { label: translate("account.settings.modelConfig.capabilities.text"), value: "text" },
                                { label: translate("account.feedback.image"), value: "image" },
                                { label: translate("account.feedback.video"), value: "video" },
                                { label: translate("account.settings.modelConfig.capabilities.audio"), value: "audio" },
                            ]}
                        />
                        <Select
                            aria-label={translate("adminPages.logs.logsPage.requestResult")}
                            className="w-32"
                            value={status}
                            onChange={(value) => updateUrl({ status: value, page: 1 })}
                            options={[
                                { label: translate("adminPages.logs.logsPage.allResults"), value: "all" },
                                { label: translate("adminPages.logs.logsPage.success"), value: "succeeded" },
                                { label: translate("library.assets.batch.failed"), value: "failed" },
                            ]}
                        />
                    </>
                }
                toolbarActive={hasFilters}
                onReset={() => updateUrl({ filter: "", status: "all", recordType: "request", capability: "all", from: "", to: "", userId: "", model: "", channelId: "", page: 1 })}
                batchActions={
                    <AdminBatchBar count={selectedIds.length} onClear={() => setSelectedIds([])}>
                        <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={batchRecovering} onClick={() => void runBatchRecovery()}>
                            {translate("adminPages.logs.logsPage.batchRecovery")}
                        </Button>
                        <AdminExportButton
                            type="primary"
                            size="small"
                            exportFile={() => exportAdminApiLogs({ recordType, ids: selectedIds })}
                            fileName={() => translate("adminPages.logs.logsPage.requestDetailsSelectedCsv", { v0: String(selectedIds.length) })}
                            label={translate("adminPages.logs.logsPage.exportSelected")}
                            successMessage={translate("adminPages.logs.logsPage.exportedSelectedRequestRecords", { v0: String(selectedIds.length) })}
                            errorMessage={translate("adminPages.logs.logsPage.failedToExportRequestDetails")}
                        />
                    </AdminBatchBar>
                }
                skeletonColumns={10}
                table={{
                    className: "app-data-table",
                    size: "small",
                    rowKey: "id",
                    loading,
                    rowSelection: { columnWidth: 36, selectedRowKeys: selectedIds, preserveSelectedRowKeys: false, onChange: (keys) => setSelectedIds(keys.map(String)) },
                    onRow: (log) => ({
                        onClick: (event) => {
                            if ((event.target as HTMLElement).closest("button,a,input,.ant-checkbox-wrapper")) return;
                            setDetailLogId(log.id);
                        },
                        className: "admin-table-clickable-row",
                    }),
                    columns,
                    tableLayout: "fixed",
                    dataSource: logs,
                    pagination: false,
                    scroll: { x: view === "all" ? 1901 : view === "billing" ? 1338 : 1186 },
                }}
                empty={loadError ? <span role="status">{translate("adminPages.logs.logsPage.dataIsTemporarilyUnavailableTryAgain")}</span> : <AdminTableEmpty filtered={hasFilters} />}
                footer={<PaginationBar alwaysShow current={page} pageSize={pageSize} total={total} onChange={(nextPage, nextSize) => updateUrl({ page: nextSize !== pageSize ? 1 : nextPage, pageSize: nextSize })} />}
            />
            <ApiLogDetailDrawer logId={detailLogId} onClose={() => setDetailLogId(null)} onLogUpdated={(next) => setLogs((items) => items.map((item) => (item.id === next.id ? next : item)))} />
            <AdminModal
                title={mediaPreview?.title || translate("adminPages.logs.logsPage.mediaPreview")}
                open={Boolean(mediaPreview)}
                width={880}
                onCancel={() => setMediaPreview(null)}
                footer={
                    mediaPreview ? (
                        <Button icon={<Download className="size-4" />} onClick={() => downloadMedia(mediaPreview.url, mediaPreview.kind)}>
                            {translate("adminPages.logs.logsPage.downloadOriginalFile")}
                        </Button>
                    ) : null
                }
            >
                {mediaPreview ? (
                    <MediaPreview
                        src={mediaPreview.url}
                        kind={mediaPreview.kind}
                        alt={mediaPreview.title}
                        controls={mediaPreview.kind === "video"}
                        className="max-h-[72vh] w-full bg-black object-contain"
                        fallbackClassName="min-h-[360px] rounded-lg bg-black/90 text-white/55"
                    />
                ) : null}
            </AdminModal>
        </AdminPageFrame>
    );
}

function positiveInt(value: string | null, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function normalizePageSize(value: string | null) {
    const parsed = positiveInt(value, 20);
    return [20, 50, 100].includes(parsed) ? parsed : 20;
}
function normalizeCapability(value: string | null): "all" | "text" | "image" | "video" | "audio" {
    return value === "text" || value === "image" || value === "video" || value === "audio" ? value : "all";
}
function normalizeDay(value: string | null) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const parsed = dayjs(value);
    return parsed.isValid() && parsed.format("YYYY-MM-DD") === value ? value : "";
}
// 与后端默认一致：结束于当前 UTC 日，含首尾共 30 天。
function utcDefaultRange() {
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29));
    return { from: start.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
}
function normalizeStatus(value: string | null): "all" | "succeeded" | "failed" {
    return value === "succeeded" || value === "failed" ? value : "all";
}
function formatTime(value?: string) {
    return value ? new Date(value).toLocaleString(currentLocale(), { hour12: false }) : "--";
}
function formatCompactTime(value: string) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString(currentLocale(), { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
function capabilityText(value: string) {
    return (
        (
            { text: translate("account.settings.modelConfig.capabilities.text"), image: translate("account.feedback.image"), video: translate("account.feedback.video"), audio: translate("account.settings.modelConfig.capabilities.audio") } as Record<
                string,
                string
            >
        )[value] || translate("adminPages.logs.logsPage.unknown")
    );
}
function formatDuration(value: number) {
    if (value < 1_000) return `${value} ms`;
    if (value < 60_000) return translate("adminPages.logs.logsPage.s", { v0: String((value / 1_000).toFixed(value < 10_000 ? 1 : 0)) });
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.round((value % 60_000) / 1_000);
    return translate("adminPages.logs.logsPage.mS", { v0: String(minutes), v1: String(seconds) });
}

function BillingSummary({ log }: { log: ApiCallLog }) {
    if (!log.billable) return <span className="text-foreground/45">{translate("adminPages.logs.logsPage.notBilled")}</span>;
    if (!log.billingAvailable) return <span className="text-foreground/35">{translate("adminPages.logs.logsPage.noCreditsCharged")}</span>;
    const status = log.billingStatus || "reserved";
    const statusLabel = (
        {
            settled: translate("adminPages.logs.logsPage.settled"),
            refunded: translate("adminPages.logs.logsPage.refunded"),
            uncertain: translate("adminPages.logs.logsPage.pendingReview"),
            running: translate("library.tasks.filter.active"),
            reserved: translate("adminPages.logs.logsPage.preauthorized2"),
        } as const
    )[status];
    return (
        <div>
            <div className="tabular-nums">
                {translate("adminPages.logs.logsPage.preauthorized")}
                {formatCredits(log.billingReservedMicrocredits)} {translate("shell.credits")}
            </div>
            <div className="tabular-nums">
                {translate("adminPages.logs.logsPage.charged2")}
                {log.billingSettledMicrocredits !== undefined ? translate("adminPages.logs.logsPage.credits", { v0: String(formatCredits(log.billingSettledMicrocredits)) }) : translate("adminPages.logs.logsPage.notSettled")}
            </div>
            <div className="tabular-nums text-xs text-foreground/60">
                {translate("adminPages.logs.logsPage.costPrice")}
                {log.creditCostMicrocredits !== undefined
                    ? translate("adminPages.logs.logsPage.credits", { v0: String(formatCredits(log.creditCostMicrocredits)) })
                    : log.creditCostConfigured
                      ? translate("adminPages.logs.logsPage.pendingCalculation")
                      : translate("account.layout.oss.cdnAuthNone")}
            </div>
            <div className="text-xs text-foreground/40">{statusLabel}</div>
        </div>
    );
}

function MediaResult({ log, onPreview }: { log: ApiCallLog; onPreview: (url: string, kind: "image" | "video") => void }) {
    const url = log.mediaPreviewUrl;
    const kind = log.mediaPreviewKind;
    const [unavailableUrl, setUnavailableUrl] = useState("");
    if (!url || (kind !== "image" && kind !== "video")) return <span className="text-foreground/30">--</span>;
    const previewUnavailable = unavailableUrl === url;
    return (
        <div className="flex w-[90px] items-center gap-2">
            <button
                type="button"
                title={
                    previewUnavailable
                        ? translate("adminPages.logs.logsPage.previewUnavailableTheAssetMayHaveBeenDeleted")
                        : translate("adminPages.logs.logsPage.preview", { v0: String(kind === "video" ? translate("account.feedback.video") : translate("account.feedback.image")) })
                }
                aria-label={
                    previewUnavailable
                        ? translate("adminPages.logs.logsPage.previewUnavailableTheAssetMayHaveBeenDeleted")
                        : translate("adminPages.logs.logsPage.preview", { v0: String(kind === "video" ? translate("account.feedback.video") : translate("account.feedback.image")) })
                }
                disabled={previewUnavailable}
                className="group relative h-11 w-16 shrink-0 overflow-hidden rounded border border-border/75 bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onPreview(url, kind)}
            >
                <MediaPreview
                    src={url}
                    kind={kind}
                    alt={translate("library.tasks.detail.generated")}
                    loading="lazy"
                    className="size-full object-cover"
                    fallbackClassName="text-white/55"
                    fallbackLabel={translate("library.tasks.row.previewUnavailable")}
                    onUnavailable={() => setUnavailableUrl(url)}
                />
                {!previewUnavailable ? (
                    <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100">
                        {kind === "video" ? <Play className="size-4 fill-current" /> : <Eye className="size-4" />}
                    </span>
                ) : null}
                {!previewUnavailable && log.mediaCount > 1 ? <span className="absolute bottom-0.5 right-0.5 rounded-sm bg-black/65 px-1 text-[var(--fs-micro)] leading-4 text-white">{log.mediaCount}</span> : null}
            </button>
            <IconButton size="sm" variant="ghost" icon={Download} onClick={() => downloadMedia(url, kind)} title={translate("adminPages.logs.logsPage.downloadOriginalFile")} aria-label={translate("adminPages.logs.logsPage.downloadOriginalFile")} />
        </div>
    );
}

function downloadMedia(url: string, kind: "image" | "video") {
    saveAs(url, `api-call-${kind}.${kind === "video" ? "mp4" : "png"}`);
}

function CallStatus({ log }: { log: ApiCallLog }) {
    return (
        <div>
            <div className="mb-1 text-xs font-medium text-foreground/70">{requestKindText(log.requestKind)}</div>
            <AdminStatusBadge {...logStatus(log)} />
            {log.mediaStage ? <div className="mt-1 text-xs text-foreground/60">{mediaDeliverySummary(log.taskStatus, log.mediaStage)}</div> : null}
            {log.capability === "video" ? (
                <div className="mt-1 text-xs tabular-nums text-foreground/45">
                    {translate("adminPages.logs.logsPage.polled")} {log.pollCount || 0} {translate("account.settings.models.unitCall")}
                </div>
            ) : null}
        </div>
    );
}

function requestKindText(value: ApiCallLog["requestKind"]) {
    const labels: Partial<Record<ApiCallLog["requestKind"], string>> = {
        create: translate("adminPages.logs.logsPage.modelGeneration"),
        poll: translate("adminPages.logs.logsPage.statusQuery"),
        download: translate("adminPages.logs.logsPage.resultDownload"),
        upload: translate("adminPages.logs.logsPage.uploadToOSS"),
        local_save: translate("adminPages.logs.logsPage.saveFile"),
        local_fallback: translate("adminPages.logs.logsPage.localFallbackSave"),
        offload: translate("adminPages.logs.logsPage.syncToOSS"),
        register: translate("adminPages.logs.logsPage.registerAsset"),
        repair: translate("adminPages.logs.logsPage.repairResult"),
    };
    return labels[value] || translate("adminPages.logs.logsPage.upstreamRequest");
}
