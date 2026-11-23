import { useEffect, useState } from "react";
import { App, Button, Descriptions, Progress, Skeleton, Tabs } from "antd";
import { AdminDrawer } from "@/pages/admin/ui/overlays";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatCredits } from "@/constant/credits";
import { IconButton } from "@/pages/admin/ui/controls";
import { AdminDataTable, AdminEmpty, AdminStatusBadge, AdminTableEmpty, PaginationBar, type AdminStatusTone } from "./admin-ui";
import { AdminUserStoragePanel } from "./admin-user-storage-panel";
import { getAdminUserDetail, listAdminUserAuditEvents, listAdminUserLedger, listAdminUserTasks, type AdminAuditEvent, type AdminUserDetail, type AdminUserTask } from "@/services/api/auth";
import type { CreditLedgerEntry } from "@/services/api/wallet";
import { currentLocale, translate } from "@/i18n";

export function AdminUserDetailDrawer({ userId, onClose, previousUserId, nextUserId, onNavigate }: { userId: string | null; onClose: () => void; previousUserId?: string; nextUserId?: string; onNavigate?: (userId: string) => void }) {
    const { message } = App.useApp();
    const [detail, setDetail] = useState<AdminUserDetail | null>(null);
    const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
    const [tasks, setTasks] = useState<AdminUserTask[]>([]);
    const [events, setEvents] = useState<AdminAuditEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [ledgerPage, setLedgerPage] = useState(1);
    const [ledgerTotal, setLedgerTotal] = useState(0);
    const [taskPage, setTaskPage] = useState(1);
    const [taskTotal, setTaskTotal] = useState(0);
    const [auditPage, setAuditPage] = useState(1);
    const [auditTotal, setAuditTotal] = useState(0);

    useEffect(() => {
        if (!userId) return;
        let active = true;
        setLoading(true);
        setDetail(null);
        setLedgerPage(1);
        setTaskPage(1);
        setAuditPage(1);
        void getAdminUserDetail(userId)
            .then((nextDetail) => {
                if (active) setDetail(nextDetail);
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : translate("admin.adminUserDetailDrawer.failedToLoadUserDetails")))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [message, userId]);

    useEffect(() => {
        if (!userId) return;
        let active = true;
        void listAdminUserLedger(userId, { page: ledgerPage, pageSize: 20 })
            .then((result) => {
                if (active) {
                    setLedger(result.entries);
                    setLedgerTotal(result.total);
                }
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : translate("admin.adminUserDetailDrawer.failedToLoadCreditTransactions")));
        return () => {
            active = false;
        };
    }, [ledgerPage, message, userId]);
    useEffect(() => {
        if (!userId) return;
        let active = true;
        void listAdminUserTasks(userId, { page: taskPage, pageSize: 20 })
            .then((result) => {
                if (active) {
                    setTasks(result.tasks);
                    setTaskTotal(result.total);
                }
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : translate("admin.adminUserDetailDrawer.failedToLoadTaskRecords")));
        return () => {
            active = false;
        };
    }, [message, taskPage, userId]);
    useEffect(() => {
        if (!userId) return;
        let active = true;
        void listAdminUserAuditEvents(userId, { page: auditPage, pageSize: 20 })
            .then((result) => {
                if (active) {
                    setEvents(result.events);
                    setAuditTotal(result.total);
                }
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : translate("admin.adminUserDetailDrawer.failedToLoadAdminActions")));
        return () => {
            active = false;
        };
    }, [auditPage, message, userId]);

    return (
        <AdminDrawer
            title={detail ? translate("admin.adminUserDetailDrawer.userDetails", { v0: String(detail.user.displayName || detail.user.username) }) : translate("admin.adminUserDetailDrawer.userDetails2")}
            open={Boolean(userId)}
            onClose={onClose}
            size="min(920px, 100vw)"
            rootClassName="admin-drawer"
            extra={onNavigate ? (
                <div className="flex items-center gap-1">
                    <IconButton size="sm" variant="ghost" aria-label={translate("admin.adminUserDetailDrawer.previousUser")} disabled={!previousUserId} icon={ChevronLeft} onClick={() => previousUserId && onNavigate(previousUserId)} />
                    <IconButton size="sm" variant="ghost" aria-label={translate("admin.adminUserDetailDrawer.nextUser")} disabled={!nextUserId} icon={ChevronRight} onClick={() => nextUserId && onNavigate(nextUserId)} />
                </div>
            ) : null}
        >
            {loading && !detail ? (
                <Skeleton active paragraph={{ rows: 10 }} />
            ) : detail ? (
                <Tabs
                    items={[
                        {
                            key: "overview",
                            label: translate("admin.adminUserDetailDrawer.accountOverview"),
                            children: (
                                <div className="space-y-5">
                                    <Descriptions
                                        bordered
                                        size="small"
                                        column={{ xs: 1, sm: 2 }}
                                        items={[
                                            { key: "username", label: translate("auth.register.username"), children: `@${detail.user.username}` },
                                            { key: "email", label: translate("auth.verification.email"), children: detail.user.email || translate("admin.adminUserDetailDrawer.notFilledIn") },
                                            { key: "role", label: translate("account.welcome.chapters.world.label"), children: detail.user.role === "admin" ? translate("shell.account.admin") : translate("admin.adminUserDetailDrawer.regularUser") },
                                            { key: "status", label: translate("library.tasks.detail.status"), children: <AdminStatusBadge label={detail.user.status === "active" ? translate("account.layout.oss.switchOn") : translate("account.layout.oss.switchOff")} tone={detail.user.status === "active" ? "success" : "neutral"} /> },
                                            { key: "available", label: translate("shell.account.availableCredits"), children: formatCredits(detail.account.availableMicrocredits) },
                                            { key: "recharge", label: translate("admin.adminUserDetailDrawer.totalCreditsPurchased"), children: formatCredits(detail.counts.rechargeMicrocredits) },
                                            { key: "checkin", label: translate("admin.adminUserDetailDrawer.totalCheckInCredits"), children: formatCredits(detail.counts.checkinMicrocredits) },
                                            { key: "reserved", label: translate("admin.adminUserDetailDrawer.heldCredits"), children: formatCredits(detail.account.reservedMicrocredits) },
                                            { key: "created", label: translate("admin.adminUserDetailDrawer.registeredAt"), children: formatTime(detail.user.createdAt) },
                                            { key: "login", label: translate("admin.adminUserDetailDrawer.lastSignIn"), children: formatTime(detail.user.lastLoginAt) },
                                        ]}
                                    />
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        {Object.entries({ 积分流水: detail.counts.ledgerEntries, 生成任务: detail.counts.tasks, 上游请求: detail.counts.apiCalls, 管理操作: detail.counts.auditEvents }).map(([label, value]) => (
                                            <div key={label} className="rounded-md border border-border p-3">
                                                <div className="text-xs text-foreground/50">{label}</div>
                                                <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div>
                                        <div className="mb-3 text-sm font-medium">{translate("admin.adminUserDetailDrawer.resourceAndQuotaUsage")}</div>
                                        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                                            {quotaUsageItems(detail).map((item) => (
                                                <div key={item.label}>
                                                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                                                        <span className="text-foreground/60">{item.label}</span>
                                                        <span className="shrink-0 tabular-nums text-foreground/75">{item.display}</span>
                                                    </div>
                                                    <Progress percent={Math.min(100, item.limit > 0 ? Math.round(item.value / item.limit * 100) : 0)} size="small" showInfo={false} status={item.value >= item.limit ? "exception" : "normal"} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            key: "storage",
                            label: translate("admin.adminUserDetailDrawer.storageSpace"),
                            children: <AdminUserStoragePanel userId={detail.user.id} />,
                        },
                        {
                            key: "ledger",
                            label: translate("admin.adminUserDetailDrawer.creditTransaction", { v0: String(detail.counts.ledgerEntries) }),
                            children: (
                                <AdminDataTable
                                    table={{
                                        rowKey: "id",
                                        size: "small",
                                        dataSource: ledger,
                                        pagination: false,
                                        columns: [
                                        { title: translate("admin.adminUserDetailDrawer.time"), dataIndex: "createdAt", width: 170, render: formatTime },
                                        { title: translate("account.settings.runninghub.kind"), dataIndex: "type", width: 130 },
                                        { title: translate("admin.adminUserDetailDrawer.change"), dataIndex: "amountMicrocredits", width: 120, align: "right", render: (value) => formatCredits(value) },
                                        { title: translate("library.ark.virtualFlow.descriptionLabel"), dataIndex: "note", ellipsis: true },
                                        ],
                                        scroll: { x: 720 },
                                    }}
                                    empty={<AdminTableEmpty />}
                                    footer={<PaginationBar alwaysShow current={ledgerPage} pageSize={20} total={ledgerTotal} onChange={(page) => setLedgerPage(page)} pageSizeOptions={[20]} />}
                                />
                            ),
                        },
                        {
                            key: "tasks",
                            label: translate("admin.adminUserDetailDrawer.generationTask", { v0: String(detail.counts.tasks) }),
                            children: (
                                <AdminDataTable
                                    table={{
                                        rowKey: "id",
                                        size: "small",
                                        dataSource: tasks,
                                        pagination: false,
                                        columns: [
                                        { title: translate("admin.adminUserDetailDrawer.time"), dataIndex: "createdAt", width: 170, render: formatTime },
                                        { title: translate("account.settings.runninghub.kind"), dataIndex: "type", width: 180 },
                                        { title: translate("canvasA.assetView.model"), dataIndex: "model", width: 180, ellipsis: true },
                                        { title: translate("library.tasks.detail.status"), dataIndex: "status", width: 100, render: (value) => <AdminStatusBadge label={value || translate("admin.adminUserDetailDrawer.unknown")} tone={taskStatusTone(value)} /> },
                                        { title: translate("admin.adminUserDetailDrawer.stage"), dataIndex: "stage", ellipsis: true },
                                        ],
                                        scroll: { x: 820 },
                                    }}
                                    empty={<AdminTableEmpty />}
                                    footer={<PaginationBar alwaysShow current={taskPage} pageSize={20} total={taskTotal} onChange={(page) => setTaskPage(page)} pageSizeOptions={[20]} />}
                                />
                            ),
                        },
                        {
                            key: "audit",
                            label: translate("admin.adminUserDetailDrawer.adminAction", { v0: String(detail.counts.auditEvents) }),
                            children: (
                                <AdminDataTable
                                    table={{
                                        rowKey: "id",
                                        size: "small",
                                        dataSource: events,
                                        pagination: false,
                                        columns: [
                                        { title: translate("admin.adminUserDetailDrawer.time"), dataIndex: "createdAt", width: 170, render: formatTime },
                                        { title: translate("shell.account.admin"), dataIndex: "actorUserId", width: 160, ellipsis: true },
                                        { title: translate("admin.adminUserDetailDrawer.motion"), dataIndex: "action", width: 160 },
                                        { title: translate("admin.adminUserDetailDrawer.summary"), dataIndex: "summary", ellipsis: true },
                                        ],
                                        scroll: { x: 720 },
                                    }}
                                    empty={<AdminTableEmpty />}
                                    footer={<PaginationBar alwaysShow current={auditPage} pageSize={20} total={auditTotal} onChange={(page) => setAuditPage(page)} pageSizeOptions={[20]} />}
                                />
                            ),
                        },
                    ]}
                />
            ) : (
                <AdminEmpty size="compact" title={translate("admin.adminUserDetailDrawer.noUserDetails")} />
            )}
        </AdminDrawer>
    );
}

function formatTime(value?: string) {
    return value ? new Date(value).toLocaleString(currentLocale(), { hour12: false }) : "--";
}

function taskStatusTone(value?: string): AdminStatusTone {
    const normalized = String(value || "").toLowerCase();
    if (["completed", "succeeded", "success", "done"].includes(normalized)) return "success";
    if (["failed", "error", "cancelled", "canceled"].includes(normalized)) return "error";
    if (["running", "processing", "pending", "queued"].includes(normalized)) return "warning";
    return "neutral";
}

function quotaUsageItems(detail: AdminUserDetail) {
    const structuredBytes = detail.storageUsage.assetBytes + detail.storageUsage.canvasBytes;
    const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;
    const number = (value: number) => new Intl.NumberFormat(currentLocale()).format(value);
    return [
        // 有效容量包含已购扩容；旧响应缺少 storageCapacity 时退回全局基础容量。
        {
            label: detail.storageCapacity?.readOnly ? translate("admin.adminUserDetailDrawer.resourcesAndAttachmentsReadOnly") : detail.storageCapacity?.overLimit ? translate("admin.adminUserDetailDrawer.resourcesAndAttachmentsOverQuotaGracePeriod") : translate("admin.adminUserDetailDrawer.resourcesAndAttachments"),
            value: detail.storedFileBytes,
            limit: detail.storageCapacity?.totalBytes ?? detail.quota.storedFileGB * 1024 ** 3,
            display: `${bytes(detail.storedFileBytes)} / ${bytes(detail.storageCapacity?.totalBytes ?? detail.quota.storedFileGB * 1024 ** 3)}`,
        },
        { label: translate("admin.adminUserDetailDrawer.uploadedTodayUTC"), value: detail.dailyUploadBytes, limit: detail.quota.dailyUploadMB * 1024 ** 2, display: `${bytes(detail.dailyUploadBytes)} / ${detail.quota.dailyUploadMB} MB` },
        { label: translate("admin.adminUserDetailDrawer.canvasAssetAndSessionData"), value: structuredBytes, limit: detail.quota.structuredDataMB * 1024 ** 2, display: `${bytes(structuredBytes)} / ${detail.quota.structuredDataMB} MB` },
        { label: translate("admin.adminUserDetailDrawer.taskAndRequestLogData"), value: detail.storageUsage.taskBytes, limit: detail.quota.taskDataGB * 1024 ** 3, display: `${bytes(detail.storageUsage.taskBytes)} / ${detail.quota.taskDataGB} GB` },
        { label: translate("admin.adminUserDetailDrawer.assets"), value: detail.storageUsage.assetCount, limit: detail.quota.assetCount, display: `${number(detail.storageUsage.assetCount)} / ${number(detail.quota.assetCount)}` },
        { label: translate("admin.adminUserDetailDrawer.canvases"), value: detail.storageUsage.canvasCount, limit: detail.quota.canvasCount, display: `${number(detail.storageUsage.canvasCount)} / ${number(detail.quota.canvasCount)}` },
        { label: translate("admin.adminUserDetailDrawer.taskHistoryEntries"), value: detail.storageUsage.taskCount, limit: detail.quota.taskCount, display: `${number(detail.storageUsage.taskCount)} / ${number(detail.quota.taskCount)}` },
        { label: translate("admin.adminUserDetailDrawer.upstreamRequestLogs"), value: detail.storageUsage.apiCallCount, limit: detail.quota.apiCallLogCount, display: `${number(detail.storageUsage.apiCallCount)} / ${number(detail.quota.apiCallLogCount)}` },
    ];
}
