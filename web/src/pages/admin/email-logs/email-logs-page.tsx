import { Alert, Button, DatePicker } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { RefreshCw, RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Select } from "@/components/ui/base/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listAdminEmailLogs, type EmailLog, type EmailLogPage, type EmailLogPurpose, type EmailLogStatus } from "@/services/api/email";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminSearchInput } from "../components/admin-search-input";
import { AdminDataTable, AdminStatusBadge, AdminTableEmpty, PaginationBar } from "../components/admin-ui";
import "./email-logs-page.css";
import { translate } from "@/i18n";

export const emailPurposeLabels: Record<EmailLogPurpose, string> = {
    registration: translate("adminPages.emailLogs.emailLogsPage.registrationVerificationCode"),
    password_reset: translate("auth.panel.recoveryTitle"),
    verification: translate("adminPages.emailLogs.emailLogsPage.identityVerificationCode"),
    profile_email: translate("adminPages.emailLogs.emailLogsPage.emailChangeVerificationCode"),
    email_changed: translate("adminPages.emailLogs.emailLogsPage.emailChangeNotification"),
    test: translate("adminPages.emailLogs.emailLogsPage.testEmail"),
    consumption_report: translate("adminPages.emailLogs.emailLogsPage.dailyUsageReport"),
};

const statusMeta: Record<EmailLogStatus, { label: string; tone: "success" | "error" | "neutral" }> = {
    sent: { label: translate("adminPages.emailLogs.emailLogsPage.delivered"), tone: "success" },
    failed: { label: translate("adminPages.emailLogs.emailLogsPage.couldNotSend"), tone: "error" },
    skipped: { label: translate("adminPages.emailLogs.emailLogsPage.notSent"), tone: "neutral" },
};

const stageLabels: Record<string, string> = {
    connect: translate("adminPages.emailLogs.emailLogsPage.connectToServer"),
    connect_tls: translate("adminPages.emailLogs.emailLogsPage.tLSConnection"),
    greeting: translate("adminPages.emailLogs.emailLogsPage.waitForGreeting"),
    starttls: translate("adminPages.emailLogs.emailLogsPage.sTARTTLSHandshake"),
    auth: translate("adminPages.emailLogs.emailLogsPage.sMTPLogin"),
    mail_from: translate("adminPages.emailLogs.emailLogsPage.validateSender"),
    rcpt_to: translate("adminPages.emailLogs.emailLogsPage.validateRecipient"),
    data: translate("adminPages.emailLogs.emailLogsPage.startTransfer"),
    write_body: translate("adminPages.emailLogs.emailLogsPage.writeMessageBody"),
    finish_data: translate("adminPages.emailLogs.emailLogsPage.submitMessageBody"),
    quit: translate("adminPages.emailLogs.emailLogsPage.endSession"),
};

export default function EmailLogsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const keyword = searchParams.get("keyword") || "";
    const purpose = searchParams.get("purpose") || "";
    const status = searchParams.get("status") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const rawPage = Number(searchParams.get("page") || 1);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const rawSize = Number(searchParams.get("pageSize") || 20);
    const pageSize = [20, 50, 100].includes(rawSize) ? rawSize : 20;
    const debouncedKeyword = useDebouncedValue(keyword);
    const [data, setData] = useState<EmailLogPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const filtered = Boolean(keyword || purpose || status || from || to);

    const update = (patch: Record<string, string | number>, replace = false) => {
        const next = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(patch)) {
            if (value === "" || (key === "page" && value === 1) || (key === "pageSize" && value === 20)) next.delete(key);
            else next.set(key, String(value));
        }
        setSearchParams(next, { replace });
    };

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        void listAdminEmailLogs({ keyword: debouncedKeyword || undefined, purpose: purpose || undefined, status: status || undefined, from: from || undefined, to: to || undefined, page, pageSize }, controller.signal)
            .then((result) => {
                if (controller.signal.aborted) return;
                setData(result);
                if (page > 1 && result.logs.length === 0) update({ page: 1 }, true);
            })
            .catch((cause) => {
                if (controller.signal.aborted) return;
                setData(null);
                setError(cause instanceof Error ? cause.message : translate("adminPages.emailLogs.emailLogsPage.failedToLoadEmailDeliveryRecords"));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [debouncedKeyword, purpose, status, from, to, page, pageSize, retry]);

    const columns: ColumnsType<EmailLog> = [
        { title: translate("adminPages.emailLogs.emailLogsPage.time"), width: 170, render: (_, log) => <span className="font-mono text-xs">{dayjs(log.createdAt).format("YYYY-MM-DD HH:mm:ss")}</span> },
        { title: translate("adminPages.emailLogs.emailLogsPage.recipient"), width: 230, render: (_, log) => <span className="break-all">{log.recipient || "—"}</span> },
        { title: translate("account.settings.runninghub.kind"), width: 140, render: (_, log) => emailPurposeLabels[log.purpose] ?? log.purpose },
        { title: translate("adminPages.emailLogs.emailLogsPage.result"), width: 100, render: (_, log) => <AdminStatusBadge label={statusMeta[log.status]?.label ?? log.status} tone={statusMeta[log.status]?.tone ?? "neutral"} /> },
        {
            title: translate("adminPages.emailLogs.emailLogsPage.reasonFailedStep"),
            render: (_, log) =>
                log.status === "sent" ? (
                    <span className="text-foreground/40">{log.durationMs ? translate("adminPages.emailLogs.emailLogsPage.tookSeconds", { v0: String((log.durationMs / 1000).toFixed(1)) }) : "—"}</span>
                ) : (
                    <div className="admin-email-log-reason" title={log.reason}>
                        {log.stage ? <span className="admin-email-log-stage">{stageLabels[log.stage] ?? log.stage}</span> : null}
                        <span>{log.reason || "—"}</span>
                    </div>
                ),
        },
        {
            title: translate("library.assets.form.title"),
            width: 260,
            render: (_, log) => (
                <span className="line-clamp-1 text-foreground/60" title={log.subject}>
                    {log.subject || "—"}
                </span>
            ),
        },
    ];

    const stats = data?.last24h ?? {};
    const failedRecently = (stats.failed ?? 0) > 0;

    return (
        <AdminPageFrame
            title={translate("adminPages.emailLogs.emailLogsPage.emailDeliveryLogs")}
            description={translate("adminPages.emailLogs.emailLogsPage.deliveryResultForEachSystemEmailRetainedFor90Days")}
            actions={
                <div className="flex items-center gap-2">
                    <Link to="/admin/settings/email">
                        <Button>{translate("adminPages.emailLogs.emailLogsPage.emailServiceSettings")}</Button>
                    </Link>
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => setRetry((value) => value + 1)}>
                        {translate("common.refresh")}
                    </Button>
                </div>
            }
        >
            <div className="admin-email-log-stats" aria-label={translate("adminPages.emailLogs.emailLogsPage.deliveryOverviewForTheLast24Hours")}>
                {(["sent", "failed", "skipped"] as const).map((key) => (
                    <button type="button" key={key} className="admin-email-log-stat" aria-pressed={status === key} onClick={() => update({ status: status === key ? "" : key, page: 1 })}>
                        <span>{translate("adminPages.emailLogs.emailLogsPage.statusInLastDay", { status: statusMeta[key].label })}</span>
                        <strong data-tone={statusMeta[key].tone}>{stats[key] ?? 0}</strong>
                    </button>
                ))}
            </div>
            {failedRecently ? (
                <Alert type="warning" showIcon title={translate("adminPages.emailLogs.emailLogsPage.someEmailsFailedToSendInTheLast24Hours")} description={translate("adminPages.emailLogs.emailLogsPage.commonCausesUseAnAppPasswordRatherThanYourLogin")} />
            ) : null}
            {error ? (
                <Alert
                    type="error"
                    showIcon
                    title={translate("adminPages.emailLogs.emailLogsPage.failedToLoadEmailDeliveryLogs")}
                    description={error}
                    action={
                        <Button size="small" onClick={() => setRetry((value) => value + 1)}>
                            {translate("common.retry")}
                        </Button>
                    }
                />
            ) : null}
            <AdminDataTable<EmailLog>
                toolbar={
                    <div className="admin-email-log-filters">
                        <AdminSearchInput
                            allowClear
                            className="admin-email-log-search"
                            prefix={<Search className="size-4 text-foreground/40" />}
                            value={keyword}
                            placeholder={translate("adminPages.emailLogs.emailLogsPage.searchRecipientAddressSubjectOrUserID")}
                            aria-label={translate("adminPages.emailLogs.emailLogsPage.searchEmailDeliveryLogs")}
                            onValueChange={(value) => update({ keyword: value, page: 1 }, true)}
                        />
                        <Select
                            ariaLabel={translate("adminPages.emailLogs.emailLogsPage.emailType")}
                            value={purpose}
                            options={[{ value: "", label: translate("library.tasks.page.allKinds") }, ...Object.entries(emailPurposeLabels).map(([value, label]) => ({ value, label }))]}
                            onChange={(value) => update({ purpose: value, page: 1 })}
                        />
                        <Select
                            ariaLabel={translate("adminPages.emailLogs.emailLogsPage.deliveryResult")}
                            value={status}
                            options={[{ value: "", label: translate("adminPages.emailLogs.emailLogsPage.allResults") }, ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))]}
                            onChange={(value) => update({ status: value, page: 1 })}
                        />
                        <DatePicker.RangePicker
                            showTime
                            format="YYYY-MM-DD HH:mm:ss"
                            aria-label={translate("adminPages.emailLogs.emailLogsPage.deliveryTimeRange")}
                            value={[from && dayjs(from).isValid() ? dayjs(from) : null, to && dayjs(to).isValid() ? dayjs(to) : null]}
                            placeholder={[translate("adminPages.emailLogs.emailLogsPage.startTime"), translate("adminPages.emailLogs.emailLogsPage.endTime")]}
                            onChange={(dates) => update({ from: dates?.[0]?.toISOString() || "", to: dates?.[1]?.toISOString() || "", page: 1 })}
                        />
                        <Button type="text" disabled={!filtered} icon={<RotateCcw className="size-3.5" />} onClick={() => update({ keyword: "", purpose: "", status: "", from: "", to: "", page: 1 })}>
                            {translate("account.layout.list.reset")}
                        </Button>
                    </div>
                }
                empty={
                    error ? (
                        <AdminTableEmpty title={translate("adminPages.emailLogs.emailLogsPage.logsAreTemporarilyUnavailable")} description={translate("adminPages.emailLogs.emailLogsPage.tryAgainNoQueryResultsAreCurrentlyDisplayed")} />
                    ) : (
                        <AdminTableEmpty
                            filtered={filtered}
                            title={filtered ? translate("adminPages.emailLogs.emailLogsPage.noMatchingDeliveryLogs") : translate("adminPages.emailLogs.emailLogsPage.noEmailDeliveryLogsYet")}
                            description={filtered ? translate("adminPages.emailLogs.emailLogsPage.adjustTheFiltersAndTryAgain") : translate("adminPages.emailLogs.emailLogsPage.logsAppearHereAfterUsersRequestVerificationCodesResetPasswords")}
                        />
                    )
                }
                footer={<PaginationBar alwaysShow current={page} pageSize={pageSize} total={data?.total ?? 0} onChange={(next, size) => update({ page: next, pageSize: size })} />}
                table={{ rowKey: "id", dataSource: data?.logs ?? [], columns, loading, pagination: false, scroll: { x: 1300 }, size: "small" }}
            />
        </AdminPageFrame>
    );
}
