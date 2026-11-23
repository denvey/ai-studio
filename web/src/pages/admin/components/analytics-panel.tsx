import { Alert, App, Button, DatePicker, Tabs, Tag } from "antd";
import { Tooltip } from "@/pages/admin/ui/controls";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { AlertTriangle, BarChart3, CircleDollarSign, Clock3, Gauge, RefreshCw, UsersRound, Workflow } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { useSearchParams } from "react-router";

import { ListToolbar, PaginationBar, AdminDataTable, AdminExportButton, AdminFilterChip, AdminStatusBadge, AdminTableEmpty, type AdminStatusTone } from "./admin-ui";
import { exportAdminAnalytics, getAdminAnalytics, listAdminUsers, type AdminReferenceData, type AdminAnalytics, type AnalyticsFilters } from "@/services/api/auth";
import { analyticsFinanceColumns, formatCredits, formatFinanceCost, formatFinanceMargin } from "./analytics-finance";
import { formatCountDelta, formatNumber, formatRateDelta } from "./analytics-trend-delta";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

function failureTypeLabel(value: string) {
    const keys: Record<string, string> = {
        内容审核: "moderation",
        超时: "timeout",
        鉴权失败: "authentication",
        限流: "rateLimit",
        请求参数: "parameters",
        上游服务: "upstream",
        网络或客户端: "network",
        未知错误: "unknown",
    };
    const key = keys[value];
    return key ? translate(`admin.analyticsFailureTypes.${key}`) : value;
}

type Props = {
    users: AdminReferenceData["users"];
    channels: AdminReferenceData["channels"];
};

type TrendMetric = "volume" | "quality" | "activity";
type AnalysisTab = "models" | "users" | "failures";
type RangePreset = "7d" | "30d" | "60d";

const capabilityOptions = [
    { label: translate("account.settings.modelConfig.capabilities.text"), value: "text" },
    { label: translate("account.feedback.image"), value: "image" },
    { label: translate("account.feedback.video"), value: "video" },
    { label: translate("account.settings.modelConfig.capabilities.audio"), value: "audio" },
];

export default function AnalyticsPanel({ users, channels }: Props) {
    const { message } = App.useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const [rangePreset, setRangePreset] = useState<RangePreset | undefined>(() => initialRangePreset(searchParams));
    const [range, setRange] = useState<[Dayjs, Dayjs]>(() => initialAnalyticsRange(searchParams, rangePreset));
    const [userId, setUserId] = useState(searchParams.get("userId") || undefined);
    const [model, setModel] = useState(searchParams.get("model") || undefined);
    const [channelId, setChannelId] = useState(searchParams.get("channelId") || undefined);
    const [capability, setCapability] = useState(searchParams.get("capability") || undefined);
    const [data, setData] = useState<AdminAnalytics | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const requestSequence = useRef(0);
    const [userOptions, setUserOptions] = useState(users);
    const [searchingUsers, setSearchingUsers] = useState(false);
    const [modelPage, setModelPage] = useState(1);
    const [userPage, setUserPage] = useState(1);
    const [failurePage, setFailurePage] = useState(1);
    const [trendMetric, setTrendMetric] = useState<TrendMetric>("volume");
    const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("models");
    const analyticsPageSize = 20;

    const filters = useMemo<AnalyticsFilters>(
        () => ({
            from: range[0].format("YYYY-MM-DD"),
            to: range[1].format("YYYY-MM-DD"),
            userId,
            model,
            channelId,
            capability,
        }),
        [capability, channelId, model, range, userId],
    );

    const reload = useCallback(async () => {
        const sequence = ++requestSequence.current;
        setLoading(true);
        setLoadError("");
        setData(null);
        try {
            const analytics = await getAdminAnalytics(filters);
            if (sequence !== requestSequence.current) return;
            setData(analytics);
        } catch (error) {
            if (sequence !== requestSequence.current) return;
            const text = error instanceof Error ? error.message : translate("admin.analyticsPanel.failedToLoadStatistics");
            setLoadError(text);
            message.error(text);
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    }, [filters, message]);

    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(filters)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }
        if (rangePreset) next.set("rangePreset", rangePreset);
        else next.delete("rangePreset");
        setSearchParams(next, { replace: true });
        void reload();
        return () => {
            requestSequence.current += 1;
        };
    }, [filters, rangePreset]);

    useEffect(() => {
        setModelPage(1);
        setUserPage(1);
        setFailurePage(1);
    }, [filters]);

    useEffect(() => {
        setUserOptions(users);
    }, [users]);

    const searchUsers = async (keyword: string) => {
        setSearchingUsers(true);
        try {
            const result = await listAdminUsers({ keyword: keyword.trim() || undefined, page: 1, pageSize: 50 });
            setUserOptions(result.users);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.analyticsPanel.userSearchFailed"));
        } finally {
            setSearchingUsers(false);
        }
    };

    const modelOptions = useMemo(() => {
        const names = new Set<string>();
        channels.forEach((channel) => channel.models?.forEach((name) => names.add(name)));
        data?.models.forEach((item) => item.model !== "未识别" && names.add(item.model));
        return [...names].sort().map((name) => ({ label: name, value: name }));
    }, [channels, data?.models]);

    const modelColumns: ColumnsType<AdminAnalytics["models"][number]> = [
        {
            title: translate("canvasA.assetView.model"),
            dataIndex: "model",
            fixed: "left",
            width: 210,
            render: (value, row) => (
                <div>
                    <div className="font-medium">{value === "未识别" ? translate("admin.apiLogDetailDrawer.unrecognizedModel") : value}</div>
                    <div className="mt-1">
                        <Tag className="admin-analytics-capability-tag">{capabilityLabel(row.capability)}</Tag>
                    </div>
                </div>
            ),
        },
        { title: translate("admin.analyticsPanel.tasksRequests"), width: 120, render: (_, row) => `${row.tasks} / ${row.requests}` },
        { title: translate("admin.analyticsPanel.users"), dataIndex: "uniqueUsers", width: 80 },
        { title: translate("admin.analyticsPanel.taskSuccessRate"), dataIndex: "taskSuccessRate", width: 110, render: percent },
        { title: translate("admin.analyticsPanel.requestSuccessRate"), dataIndex: "requestSuccessRate", width: 110, render: percent },
        { title: "P50 / P95", width: 145, render: (_, row) => `${formatDuration(row.p50DurationMs)} / ${formatDuration(row.p95DurationMs)}` },
        { title: translate("admin.analyticsPanel.tokensInOutCached"), width: 190, render: (_, row) => (row.usageAvailable ? `${formatNumber(row.inputTokens)} / ${formatNumber(row.outputTokens)} / ${formatNumber(row.cachedTokens)}` : "--") },
        { title: translate("admin.analyticsPanel.mediaVideoSeconds"), width: 125, render: (_, row) => `${row.mediaCount} / ${row.videoSeconds}` },
        ...analyticsFinanceColumns,
    ];

    const userColumns: ColumnsType<AdminAnalytics["users"][number]> = [
        {
            title: translate("admin.analyticsPanel.users"),
            dataIndex: "name",
            width: 180,
            render: (name, row) => (
                <div>
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-foreground/45">{row.userId}</div>
                </div>
            ),
        },
        { title: translate("admin.analyticsPanel.activeDays"), dataIndex: "activeDays", width: 95 },
        { title: translate("nav.tools.tasks"), dataIndex: "tasks", width: 80 },
        { title: translate("admin.analyticsPanel.agentMessages"), dataIndex: "agentMessages", width: 105 },
        { title: translate("admin.analyticsPanel.canvasActiveDays"), dataIndex: "canvasDays", width: 120 },
        { title: translate("admin.analyticsPanel.assetsResources"), width: 110, render: (_, row) => `${row.assets} / ${row.resources}` },
        { title: translate("admin.analyticsPanel.commonModels"), dataIndex: "commonModel", ellipsis: true, render: (value) => value || "--" },
    ];

    const failureColumns: ColumnsType<AdminAnalytics["failures"][number]> = [
        { title: translate("admin.analyticsPanel.errorType"), dataIndex: "type", width: 120, render: (value) => <AdminStatusBadge label={failureTypeLabel(value)} tone={value === "超时" ? "warning" : "error"} /> },
        { title: translate("canvasA.assetView.model"), dataIndex: "model", width: 220, render: (value) => (value === "未识别" ? translate("admin.apiLogDetailDrawer.unrecognizedModel") : value) },
        { title: translate("admin.analyticsPanel.count"), dataIndex: "count", width: 90 },
        { title: translate("admin.analyticsPanel.recentErrors"), dataIndex: "lastError", ellipsis: true, render: (value) => <Tooltip title={value}>{value || "--"}</Tooltip> },
        { title: translate("admin.analyticsPanel.mostRecent"), dataIndex: "lastSeenAt", width: 170, render: (value) => dayjs(value).format("YYYY-MM-DD HH:mm") },
    ];

    const trend = data?.trend || [];
    const currentTrend = trend[trend.length - 1];
    const previousTrend = trend[trend.length - 2];
    const modelRows = data?.models || [];
    const userRows = data?.users || [];
    const failureRows = data?.failures || [];
    const failureTotal = failureRows.reduce((sum, item) => sum + item.count, 0);
    const topFailure = failureRows.reduce<AdminAnalytics["failures"][number] | undefined>((current, item) => (!current || item.count > current.count ? item : current), undefined);
    const finance = data?.kpi.finance;
    const financeUnavailable = data !== null && (!finance || modelRows.some((row) => !row.finance));
    const trendHasData = trendMetric === "volume" ? trend.some((item) => item.tasks > 0 || item.requests > 0) : trendMetric === "quality" ? trend.some((item) => item.requests > 0) : trend.some((item) => item.activeUsers > 0);
    const trendTitle = trendMetric === "volume" ? translate("admin.analyticsPanel.taskAndRequestTrends") : trendMetric === "quality" ? translate("admin.analyticsPanel.requestQualityTrends") : translate("admin.analyticsPanel.userActivityTrends");
    const pageRows = <T,>(rows: T[], page: number) => rows.slice((page - 1) * analyticsPageSize, page * analyticsPageSize);

    const applyRangePreset = (preset: RangePreset) => {
        const end = dayjs();
        const start = preset === "7d" ? end.subtract(6, "day") : preset === "30d" ? end.subtract(29, "day") : end.subtract(59, "day");
        setRangePreset(preset);
        setRange([start, end]);
    };

    const openAnalysis = (tab: AnalysisTab) => {
        setAnalysisTab(tab);
        window.requestAnimationFrame(() => document.getElementById("admin-analytics-analysis")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
    };

    return (
        <div className="admin-analytics-panel" aria-busy={loading}>
            <ListToolbar
                className="admin-analytics-toolbar"
                active={Boolean(userId || model || channelId || capability)}
                activeFilters={
                    <>
                        {userId ? <AdminFilterChip label={translate("admin.analyticsPanel.user", { v0: String(userOptions.find((user) => user.id === userId)?.displayName || userId) })} onRemove={() => setUserId(undefined)} /> : null}
                        {model ? <AdminFilterChip label={translate("admin.analyticsPanel.model", { v0: String(model) })} onRemove={() => setModel(undefined)} /> : null}
                        {channelId ? <AdminFilterChip label={translate("admin.analyticsPanel.channel", { v0: String(channels.find((channel) => channel.id === channelId)?.name || channelId) })} onRemove={() => setChannelId(undefined)} /> : null}
                        {capability ? <AdminFilterChip label={translate("admin.analyticsPanel.capability", { v0: String(capabilityLabel(capability)) })} onRemove={() => setCapability(undefined)} /> : null}
                    </>
                }
                onReset={() => {
                    setUserId(undefined);
                    setModel(undefined);
                    setChannelId(undefined);
                    setCapability(undefined);
                }}
                trailing={
                    <>
                        <div className="admin-analytics-range-picker" role="group" aria-label={translate("account.settings.diagnostics.range")}>
                            <span className="sr-only">{translate("account.settings.diagnostics.range")}</span>
                            <DatePicker.RangePicker
                                allowClear={false}
                                value={range}
                                onChange={(value) => {
                                    if (value?.[0] && value?.[1]) {
                                        setRangePreset(undefined);
                                        setRange([value[0], value[1]]);
                                    }
                                }}
                            />
                        </div>
                        <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void reload()}>
                            {translate("common.refresh")}
                        </Button>
                        <AdminExportButton exportFile={() => exportAdminAnalytics(filters)} fileName={() => `usage-${filters.from}-${filters.to}.csv`} label={translate("admin.analyticsPanel.exportCSV")} />
                    </>
                }
                filters={
                    <>
                        <FilterSelect
                            label={translate("admin.analyticsPanel.users")}
                            value={userId}
                            onChange={setUserId}
                            options={userOptions.map((user) => ({ label: user.displayName || user.username, value: user.id }))}
                            filterOption={false}
                            loading={searchingUsers}
                            onSearch={(value) => void searchUsers(value)}
                        />
                        <FilterSelect label={translate("canvasA.assetView.model")} value={model} onChange={setModel} options={modelOptions} width={210} />
                        <FilterSelect label={translate("admin.analyticsPanel.channel2")} value={channelId} onChange={setChannelId} options={channels.map((channel) => ({ label: channel.name, value: channel.id }))} />
                        <FilterSelect label={translate("admin.analyticsPanel.capability2")} value={capability} onChange={setCapability} options={capabilityOptions} />
                    </>
                }
            >
                <div className="admin-analytics-range-presets" role="group" aria-label={translate("admin.analyticsPanel.quickDateRanges")}>
                    {(
                        [
                            ["7d", translate("admin.analyticsPanel.item7Days")],
                            ["30d", translate("admin.analyticsPanel.item30Days")],
                            ["60d", translate("admin.analyticsPanel.item60Days")],
                        ] as const
                    ).map(([value, label]) => (
                        <button key={value} type="button" className={rangePreset === value ? "is-active" : undefined} aria-pressed={rangePreset === value} onClick={() => applyRangePreset(value)}>
                            {label}
                        </button>
                    ))}
                </div>
            </ListToolbar>

            {financeUnavailable && <Alert type="warning" showIcon title={translate("admin.analyticsPanel.theBackendDidNotReturnCompleteFinancialStatisticsMissingAmounts")} />}
            {loadError && (
                <Alert
                    type="error"
                    showIcon
                    title={translate("admin.analyticsPanel.failedToLoadStatistics2")}
                    description={loadError}
                    action={
                        <Button size="small" onClick={() => void reload()}>
                            {translate("common.retry")}
                        </Button>
                    }
                />
            )}

            <section className="admin-analytics-health-grid" aria-label={translate("admin.analyticsPanel.operationalHealth")}>
                <AnalyticsHealthCard
                    icon={<UsersRound className="size-4" />}
                    label={translate("admin.analyticsPanel.activeUsers")}
                    value={data ? formatNumber(data.kpi.activeUsers) : "--"}
                    trend={formatCountDelta(currentTrend?.activeUsers, previousTrend?.activeUsers)}
                    detail={data ? translate("admin.analyticsPanel.dailyWeeklyMonthly", { v0: String(formatNumber(data.kpi.dau)), v1: String(formatNumber(data.kpi.wau)), v2: String(formatNumber(data.kpi.mau)) }) : undefined}
                />
                <AnalyticsHealthCard
                    icon={<CircleDollarSign className="size-4" />}
                    label={translate("admin.analyticsPanel.totalUserBalance")}
                    value={data ? formatCredits(data.kpi.totalBalanceMicrocredits ?? 0) : "--"}
                    detail={translate("admin.analyticsPanel.currentAvailableCreditBalanceAcrossAllUsers")}
                />
                <AnalyticsHealthCard
                    icon={<CircleDollarSign className="size-4" />}
                    label={translate("admin.analyticsPanel.usageInSelectedPeriod")}
                    value={finance ? formatCredits(finance.revenueMicrocredits) : "--"}
                    detail={finance ? translate("admin.analyticsPanel.revenueFromSettledOrders", { v0: String(formatNumber(finance.settledOrders)) }) : undefined}
                />
                <AnalyticsHealthCard
                    icon={<Workflow className="size-4" />}
                    label={translate("canvasA.activeTasks.title")}
                    value={data ? formatNumber(data.kpi.generationTasks) : "--"}
                    trend={formatCountDelta(currentTrend?.tasks, previousTrend?.tasks)}
                    detail={data ? translate("admin.analyticsPanel.modelGenerationRequests", { v0: String(formatNumber(data.kpi.upstreamRequests)) }) : undefined}
                />
                <AnalyticsHealthCard
                    icon={<Gauge className="size-4" />}
                    label={translate("admin.analyticsPanel.serviceQuality")}
                    value={data && data.kpi.upstreamRequests > 0 ? percent(data.kpi.successRate) : "--"}
                    trend={formatRateDelta(currentTrend?.requestSuccessRate, previousTrend?.requestSuccessRate)}
                    detail={data ? (data.kpi.upstreamRequests ? translate("admin.analyticsPanel.modelGenerationRequestSuccessRate") : translate("admin.analyticsPanel.noRequestsInTheSelectedRange")) : undefined}
                    tone={!data || !data.kpi.upstreamRequests ? "neutral" : data.kpi.successRate < 90 ? "warning" : "success"}
                />
                <AnalyticsHealthCard
                    icon={<Clock3 className="size-4" />}
                    label={translate("admin.analyticsPanel.p95RequestDuration")}
                    value={data && data.kpi.upstreamRequests > 0 ? formatDuration(data.kpi.p95DurationMs) : "--"}
                    detail={translate("admin.analyticsPanel.modelGenerationRequestsExcludingStatusQueriesAndDownloads")}
                />
                <AnalyticsHealthCard
                    icon={<Workflow className="size-4" />}
                    label={translate("admin.analyticsPanel.currentlyQueued")}
                    value={data ? formatNumber(data.kpi.currentQueuedTasks) : "--"}
                    detail={translate("admin.analyticsPanel.liveSnapshotNotAHistoricalTotal")}
                    tone={data?.kpi.currentQueuedTasks ? "warning" : "neutral"}
                />
                <AnalyticsHealthCard
                    icon={<CircleDollarSign className="size-4" />}
                    label={translate("admin.analyticsPanel.costAndProfitCredits")}
                    value={
                        finance ? (
                            <dl className="admin-analytics-finance-values">
                                <div>
                                    <dt>{translate("admin.analyticsPanel.cost")}</dt>
                                    <dd>{formatFinanceCost(finance)}</dd>
                                </div>
                                <div>
                                    <dt>{translate("admin.analyticsPanel.profit")}</dt>
                                    <dd>{formatCredits(finance.profitMicrocredits)}</dd>
                                </div>
                                <div>
                                    <dt>{translate("admin.analyticsPanel.profitMargin")}</dt>
                                    <dd>{formatFinanceMargin(finance.profitMargin)}</dd>
                                </div>
                            </dl>
                        ) : (
                            "--"
                        )
                    }
                    detail={finance ? translate("admin.analyticsPanel.costRecordedForSettledOrders", { v0: String(finance.costedOrders), v1: String(finance.settledOrders) }) : undefined}
                    tone={finance && (finance.costedOrders < finance.settledOrders || (finance.profitMicrocredits ?? 0) < 0) ? "warning" : "neutral"}
                />
            </section>

            <div className="admin-analytics-overview-grid">
                <section className="admin-analytics-trend-section" aria-labelledby="admin-analytics-trend-title">
                    <div className="admin-analytics-section-heading">
                        <div>
                            <h2 id="admin-analytics-trend-title">{trendTitle}</h2>
                            <p>
                                {trendMetric === "volume"
                                    ? translate("admin.analyticsPanel.generationTasksAndModelGenerationRequestsAreCountedSeparatelyStatus")
                                    : trendMetric === "quality"
                                      ? translate("admin.analyticsPanel.successRateIsCalculatedFromModelGenerationRequestsDatesWithout")
                                      : translate("admin.analyticsPanel.activeUsersAreCountedOncePerCalendarDay")}
                            </p>
                        </div>
                        <div className="admin-analytics-trend-switch" role="group" aria-label={translate("admin.analyticsPanel.trendMetric")}>
                            {(
                                [
                                    ["volume", translate("account.settings.memory.usage")],
                                    ["quality", translate("admin.analyticsPanel.quality")],
                                    ["activity", translate("admin.analyticsPanel.active")],
                                ] as const
                            ).map(([value, label]) => (
                                <button key={value} type="button" className={trendMetric === value ? "is-active" : undefined} aria-pressed={trendMetric === value} onClick={() => setTrendMetric(value)}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {trendHasData ? (
                        <div className="admin-analytics-chart" role="img" aria-label={translate("admin.analyticsPanel.chart", { v0: String(trendTitle) })}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={data?.trend || []} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                                    <CartesianGrid stroke="currentColor" className="text-foreground/10" vertical={false} />
                                    <XAxis dataKey="day" tickFormatter={(value) => value.slice(5)} tick={{ fontSize: 11 }} />
                                    {trendMetric === "quality" ? <YAxis yAxisId="primary" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} /> : <YAxis yAxisId="primary" allowDecimals={false} tick={{ fontSize: 11 }} />}
                                    <ChartTooltip labelFormatter={(value) => translate("admin.analyticsPanel.date", { v0: String(value) })} />
                                    {trendMetric === "volume" ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
                                    {trendMetric === "volume" ? (
                                        <>
                                            <Area yAxisId="primary" type="monotone" dataKey="tasks" name={translate("canvasA.activeTasks.title")} stroke="var(--admin-chart-primary)" fill="var(--admin-chart-primary)" fillOpacity={0.1} />
                                            <Area
                                                yAxisId="primary"
                                                type="monotone"
                                                dataKey="requests"
                                                name={translate("admin.analyticsPanel.generationRequests")}
                                                stroke="var(--admin-chart-secondary)"
                                                fill="var(--admin-chart-secondary)"
                                                fillOpacity={0.08}
                                            />
                                        </>
                                    ) : null}
                                    {trendMetric === "quality" ? (
                                        <Line yAxisId="primary" type="monotone" dataKey="requestSuccessRate" name={translate("admin.analyticsPanel.successRate")} stroke="var(--admin-chart-warning)" dot={false} strokeWidth={2} />
                                    ) : null}
                                    {trendMetric === "activity" ? (
                                        <Area yAxisId="primary" type="monotone" dataKey="activeUsers" name={translate("admin.analyticsPanel.activeUsers")} stroke="var(--admin-chart-primary)" fill="var(--admin-chart-primary)" fillOpacity={0.1} />
                                    ) : null}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="admin-analytics-empty-chart">
                            <span>
                                <BarChart3 className="size-5" />
                            </span>
                            <div className="font-medium">
                                {!data
                                    ? loading
                                        ? translate("admin.analyticsPanel.loadingTrends")
                                        : translate("admin.analyticsPanel.trendDataUnavailable")
                                    : translate("admin.analyticsPanel.noDataForThisPeriod", {
                                          v0: String(trendMetric === "quality" ? translate("admin.analyticsPanel.quality") : trendMetric === "activity" ? translate("admin.analyticsPanel.active") : translate("admin.analyticsPanel.usage")),
                                      })}
                            </div>
                            <p>{loadError ? translate("admin.analyticsPanel.tryAgainMissingDataCannotBeUsedToAssessOperational") : translate("admin.analyticsPanel.groupedByCalendarDayAdjustTheDateRangeOrFilters")}</p>
                        </div>
                    )}
                </section>

                <aside className="admin-analytics-attention" aria-labelledby="admin-analytics-attention-title">
                    <div className="admin-analytics-attention-heading">
                        <div>
                            <h2 id="admin-analytics-attention-title">{translate("admin.analyticsPanel.needsAttention")}</h2>
                            <p>{translate("admin.analyticsPanel.operationalConditionsThatMayNeedActionAreShownFirst")}</p>
                        </div>
                        <AdminStatusBadge
                            label={!data ? translate("admin.analyticsPanel.statusUnknown") : failureTotal > 0 ? translate("admin.analyticsPanel.errors", { v0: String(formatNumber(failureTotal)) }) : translate("admin.analyticsPanel.noErrorsRecorded")}
                            tone={!data ? "neutral" : failureTotal > 0 ? "warning" : "success"}
                        />
                    </div>
                    <div className="admin-analytics-attention-list">
                        <AnalyticsAttentionItem
                            icon={<AlertTriangle className="size-4" />}
                            label={translate("admin.analyticsPanel.failedRequests")}
                            value={data ? formatNumber(failureTotal) : "--"}
                            description={!data ? translate("admin.analyticsPanel.dataNotReady") : topFailure ? `${topFailure.type} · ${topFailure.model}` : translate("admin.analyticsPanel.noErrorsRecordedInThisPeriod")}
                            tone={!data ? "neutral" : failureTotal > 0 ? "warning" : "success"}
                            onClick={failureTotal > 0 ? () => openAnalysis("failures") : undefined}
                        />
                        <AnalyticsAttentionItem
                            icon={<Clock3 className="size-4" />}
                            label={translate("admin.analyticsPanel.currentQueue")}
                            value={data ? formatNumber(data.kpi.currentQueuedTasks) : "--"}
                            description={!data ? translate("admin.analyticsPanel.dataNotReady") : data.kpi.currentQueuedTasks ? translate("admin.analyticsPanel.generationTasksAreWaitingToRun") : translate("admin.analyticsPanel.noQueuedGenerationTasks")}
                            tone={!data ? "neutral" : data.kpi.currentQueuedTasks ? "warning" : "success"}
                        />
                        <AnalyticsAttentionItem
                            icon={<CircleDollarSign className="size-4" />}
                            label={translate("admin.analyticsPanel.ordersWithCostData")}
                            value={finance ? `${finance.costedOrders}/${finance.settledOrders}` : "--"}
                            description={
                                !finance
                                    ? translate("admin.analyticsPanel.financialStatisticsNotYetAvailable")
                                    : finance.settledOrders
                                      ? finance.costedOrders === finance.settledOrders
                                          ? translate("admin.analyticsPanel.costDataIsCompleteForSettledOrders")
                                          : translate("admin.analyticsPanel.ordersLackACostSnapshotOrValidUsage", { v0: String(finance.settledOrders - finance.costedOrders) })
                                      : translate("admin.analyticsPanel.noSettledOrdersInThisPeriod")
                            }
                            tone={finance && finance.costedOrders < finance.settledOrders ? "warning" : "neutral"}
                            onClick={() => openAnalysis("models")}
                        />
                    </div>
                </aside>
            </div>

            <section id="admin-analytics-analysis" className="admin-analytics-analysis-section">
                <div className="admin-analytics-analysis-heading">
                    <div>
                        <h2>{translate("admin.analyticsPanel.detailedAnalysis")}</h2>
                        <p>{translate("admin.analyticsPanel.reviewThisPeriodByModelUserOrErrorType")}</p>
                    </div>
                </div>
                <Tabs
                    activeKey={analysisTab}
                    onChange={(key) => setAnalysisTab(key as AnalysisTab)}
                    className="admin-analytics-tabs"
                    items={[
                        {
                            key: "models",
                            label: translate("admin.analyticsPanel.modelAnalytics"),
                            children: (
                                <AdminDataTable
                                    table={{ rowKey: (row) => `${row.model}:${row.capability}`, size: "small", loading, columns: modelColumns, dataSource: pageRows(modelRows, modelPage), pagination: false, scroll: { x: 1600 } }}
                                    empty={<AdminTableEmpty />}
                                    skeletonColumns={12}
                                    footer={<PaginationBar alwaysShow current={modelPage} pageSize={analyticsPageSize} total={modelRows.length} onChange={(page) => setModelPage(page)} pageSizeOptions={[analyticsPageSize]} />}
                                />
                            ),
                        },
                        {
                            key: "users",
                            label: translate("admin.analyticsPanel.userActivity"),
                            children: (
                                <AdminDataTable
                                    table={{ rowKey: "userId", size: "small", loading, columns: userColumns, dataSource: pageRows(userRows, userPage), pagination: false, scroll: { x: 900 } }}
                                    empty={<AdminTableEmpty />}
                                    skeletonColumns={7}
                                    footer={<PaginationBar alwaysShow current={userPage} pageSize={analyticsPageSize} total={userRows.length} onChange={(page) => setUserPage(page)} pageSizeOptions={[analyticsPageSize]} />}
                                />
                            ),
                        },
                        {
                            key: "failures",
                            label: translate("admin.analyticsPanel.anomalyLocation", { v0: String(data?.failures.length ? ` (${data.failures.reduce((sum, item) => sum + item.count, 0)})` : "") }),
                            children: (
                                <AdminDataTable
                                    table={{ rowKey: (row) => `${row.type}:${row.model}`, size: "small", loading, columns: failureColumns, dataSource: pageRows(failureRows, failurePage), pagination: false, scroll: { x: 900 } }}
                                    empty={<AdminTableEmpty />}
                                    skeletonColumns={5}
                                    footer={<PaginationBar alwaysShow current={failurePage} pageSize={analyticsPageSize} total={failureRows.length} onChange={(page) => setFailurePage(page)} pageSizeOptions={[analyticsPageSize]} />}
                                />
                            ),
                        },
                    ]}
                />
            </section>
        </div>
    );
}

function AnalyticsHealthCard({ icon, label, value, trend, detail, tone = "neutral" }: { icon: ReactNode; label: string; value: ReactNode; trend?: { value: string; tone?: AdminStatusTone }; detail?: string; tone?: AdminStatusTone }) {
    return (
        <article className="admin-analytics-health-card" data-tone={tone}>
            <div className="admin-analytics-health-card-heading">
                <span aria-hidden="true">{icon}</span>
                <span>{label}</span>
            </div>
            <div className="admin-analytics-health-card-value">{value}</div>
            <div className="admin-analytics-health-card-meta">
                {trend ? <AdminStatusBadge label={trend.value} tone={trend.tone || "neutral"} /> : null}
                {detail ? <span>{detail}</span> : null}
            </div>
        </article>
    );
}

function AnalyticsAttentionItem({ icon, label, value, description, tone = "neutral", onClick }: { icon: ReactNode; label: string; value: ReactNode; description: string; tone?: AdminStatusTone; onClick?: () => void }) {
    const content = (
        <>
            <span className="admin-analytics-attention-icon" aria-hidden="true">
                {icon}
            </span>
            <span className="admin-analytics-attention-copy">
                <span className="admin-analytics-attention-label">{label}</span>
                <span className="admin-analytics-attention-description">{description}</span>
            </span>
            <strong>{value}</strong>
        </>
    );

    return onClick ? (
        <button type="button" className="admin-analytics-attention-item is-action" data-tone={tone} onClick={onClick}>
            {content}
        </button>
    ) : (
        <div className="admin-analytics-attention-item" data-tone={tone}>
            {content}
        </div>
    );
}

function FilterSelect({
    label,
    value,
    onChange,
    options,
    width = 150,
    filterOption = true,
    loading,
    onSearch,
}: {
    label: string;
    value?: string;
    onChange: (value?: string) => void;
    options: Array<{ label: string; value: string }>;
    width?: number;
    filterOption?: boolean;
    loading?: boolean;
    onSearch?: (value: string) => void;
}) {
    return (
        <div>
            <div className="mb-1 text-xs text-foreground/55">{label}</div>
            <Select
                aria-label={translate("admin.analyticsPanel.filters", { v0: String(label) })}
                allowClear
                showSearch
                optionFilterProp="label"
                filterOption={filterOption}
                loading={loading}
                placeholder={translate("canvasA.toolPicker.all")}
                value={value}
                onChange={onChange}
                onSearch={onSearch}
                options={options}
                style={{ width }}
            />
        </div>
    );
}

function capabilityLabel(value: string) {
    return capabilityOptions.find((item) => item.value === value)?.label || translate("account.settings.models.uncategorized");
}

function percent(value: number | null) {
    if (value === null || value === undefined) return "--";
    return `${Number(value).toFixed(1)}%`;
}

function formatDuration(value: number) {
    if (!value) return "--";
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

function filterDate(value: string | null, fallback: Dayjs) {
    if (!value) return fallback;
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed : fallback;
}

function resolveRangePreset(range: [Dayjs, Dayjs]): RangePreset | undefined {
    const end = dayjs();
    if (!range[1].isSame(end, "day")) return undefined;
    if (range[0].isSame(end.subtract(6, "day"), "day")) return "7d";
    if (range[0].isSame(end.subtract(29, "day"), "day")) return "30d";
    if (range[0].isSame(end.subtract(59, "day"), "day")) return "60d";
    return undefined;
}

function parseRangePreset(value: string | null): RangePreset | undefined {
    return value === "7d" || value === "30d" || value === "60d" ? value : undefined;
}

function initialRangePreset(searchParams: URLSearchParams): RangePreset | undefined {
    const explicit = parseRangePreset(searchParams.get("rangePreset"));
    if (explicit) return explicit;
    if (searchParams.has("from") || searchParams.has("to")) return resolveRangePresetFromQuery(searchParams.get("from"), searchParams.get("to"));
    return "30d";
}

function initialAnalyticsRange(searchParams: URLSearchParams, preset: RangePreset | undefined): [Dayjs, Dayjs] {
    const end = dayjs();
    if (preset) {
        const days = preset === "7d" ? 6 : preset === "30d" ? 29 : 59;
        return [end.subtract(days, "day"), end];
    }
    return [filterDate(searchParams.get("from"), end.subtract(29, "day")), filterDate(searchParams.get("to"), end)];
}

function resolveRangePresetFromQuery(from: string | null, to: string | null): RangePreset | undefined {
    const start = from ? dayjs(from) : null;
    const end = to ? dayjs(to) : null;
    if (!start?.isValid() || !end?.isValid()) return undefined;
    return resolveRangePreset([start, end]);
}
