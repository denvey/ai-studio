import { Alert, App, Button, Input } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import type { ColumnsType } from "antd/es/table";
import { Download, Eye, Search, Trash2 } from "lucide-react";
import { saveAs } from "file-saver";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { PaginationBar } from "@/pages/admin/components/admin-ui";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminResourceFileUrl, deleteAdminResources, downloadAdminResource, getAdminStorageStats, listAdminResources, type AdminStorageResource, type AdminStorageStats } from "@/services/api/admin-storage";
import { AdminBatchBar, AdminDataTable, AdminFilterChip, AdminStatTile, AdminStatusBadge, AdminTableEmpty } from "./admin-ui";
import { Select } from "@/components/ui/base/select";
import { AdminSearchInput } from "./admin-search-input";
import { currentLocale, translate } from "@/i18n";

const pageSizes = [20, 50, 100];

export default function StorageResourcesPanel() {
    const { message, modal } = App.useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const keyword = searchParams.get("filter") || "";
    const kind = normalizeOption(searchParams.get("kind"), ["image", "video", "audio", "file", "live2d"]);
    const status = normalizeOption(searchParams.get("status"), ["pending", "ready", "failed", "deleted"]);
    const provider = normalizeOption(searchParams.get("provider"), ["local", "aliyun", "tencent", "qiniu", "volcengine", "s3"]);
    const userQuery = searchParams.get("user") || searchParams.get("userId") || "";
    const page = positiveInt(searchParams.get("page"), 1);
    const pageSize = normalizePageSize(searchParams.get("pageSize"));
    const debouncedKeyword = useDebouncedValue(keyword);
    const debouncedUserQuery = useDebouncedValue(userQuery);
    const [resources, setResources] = useState<AdminStorageResource[]>([]);
    const [stats, setStats] = useState<AdminStorageStats | null>(null);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [previewing, setPreviewing] = useState<AdminStorageResource | null>(null);
    const [downloadingId, setDownloadingId] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [deleting, setDeleting] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const requestSequence = useRef(0);
    const hasFilters = Boolean(keyword || userQuery || kind !== "all" || status !== "all" || provider !== "all");

    const updateUrl = (patch: Record<string, string | number>, replace = false) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(patch).forEach(([key, value]) => {
            const isDefault = ((key === "filter" || key === "user" || key === "userId") && value === "") || (["kind", "status", "provider"].includes(key) && value === "all") || (key === "page" && value === 1) || (key === "pageSize" && value === 20);
            if (isDefault) next.delete(key);
            else next.set(key, String(value));
        });
        setSearchParams(next, { replace });
    };

    useEffect(() => {
        const controller = new AbortController();
        void getAdminStorageStats(controller.signal)
            .then(setStats)
            .catch((error) => {
                if (error instanceof DOMException && error.name === "AbortError") return;
                message.error(error instanceof Error ? error.message : translate("admin.storageResourcesPanel.failedToLoadStorageStatistics"));
            });
        return () => controller.abort();
    }, [refreshKey]);

    useEffect(() => {
        const sequence = ++requestSequence.current;
        const controller = new AbortController();
        setLoading(true);
        void listAdminResources(
            {
                keyword: debouncedKeyword || undefined,
                kind: kind === "all" ? undefined : kind,
                status: status === "all" ? undefined : status,
                provider: provider === "all" ? undefined : provider,
                user: debouncedUserQuery || undefined,
                userId: debouncedUserQuery || undefined,
                page,
                pageSize: pageSize,
            },
            controller.signal,
        )
            .then((result) => {
                if (sequence !== requestSequence.current) return;
                setResources(result.items);
                setTotal(result.total);
                if (result.total > 0 && result.items.length === 0 && page > 1) updateUrl({ page: 1 }, true);
            })
            .catch((error) => {
                if (error instanceof DOMException && error.name === "AbortError") return;
                if (sequence === requestSequence.current) message.error(error instanceof Error ? error.message : translate("admin.storageResourcesPanel.failedToLoadResources"));
            })
            .finally(() => sequence === requestSequence.current && setLoading(false));
        return () => controller.abort();
    }, [debouncedKeyword, debouncedUserQuery, kind, status, provider, page, pageSize, refreshKey]);

    const columns = useMemo<ColumnsType<AdminStorageResource>>(
        () => [
            {
                title: translate("admin.storageResourcesPanel.resources"),
                width: 260,
                render: (_, resource) => (
                    <div className="min-w-0">
                        <div className="truncate font-medium text-foreground/85" title={resource.objectKey}>
                            {fileName(resource.objectKey) || resource.id}
                        </div>
                        <div className="admin-monospace truncate text-foreground/42" title={resource.id}>
                            {resource.id}
                        </div>
                    </div>
                ),
            },
            {
                title: translate("admin.storageResourcesPanel.users"),
                width: 170,
                render: (_, resource) => (
                    <div className="min-w-0">
                        <div className="truncate text-foreground/78">{resource.userName || resource.userId}</div>
                        <div className="admin-monospace truncate text-foreground/38" title={resource.userId}>
                            {resource.userId}
                        </div>
                    </div>
                ),
            },
            { title: translate("account.settings.runninghub.kind"), dataIndex: "kind", width: 92, render: (value) => kindLabel(value) },
            { title: translate("library.tasks.detail.status"), dataIndex: "status", width: 104, render: (value) => <AdminStatusBadge label={statusLabel(value)} tone={statusTone(value)} /> },
            { title: translate("admin.storageResourcesPanel.storage"), dataIndex: "provider", width: 110, render: (value) => providerLabel(value) },
            { title: translate("canvasA.assetView.fileSize"), dataIndex: "size", width: 110, render: (value) => <span className="tabular-nums">{formatBytes(value)}</span> },
            { title: translate("admin.storageResourcesPanel.specifications"), width: 135, render: (_, resource) => resourceDimensions(resource) },
            { title: translate("library.tasks.detail.createdAt"), dataIndex: "createdAt", width: 170, render: formatTime },
            {
                title: translate("account.settings.runninghub.actions"),
                width: 220,
                align: "right",
                fixed: "right",
                render: (_, resource) => (
                    <div className="flex justify-end gap-1">
                        <Button type="text" size="small" icon={<Eye className="size-3.5" />} disabled={resource.status !== "ready"} onClick={() => setPreviewing(resource)}>
                            {translate("account.feedback.preview")}
                        </Button>
                        <Button type="text" size="small" icon={<Download className="size-3.5" />} loading={downloadingId === resource.id} disabled={resource.status !== "ready"} onClick={() => void download(resource)}>
                            {translate("canvasA.assetView.download")}
                        </Button>
                        <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} disabled={deleting} onClick={() => confirmDelete([resource.id])}>
                            {translate("common.delete")}
                        </Button>
                    </div>
                ),
            },
        ],
        [downloadingId, deleting],
    );

    const download = async (resource: AdminStorageResource) => {
        setDownloadingId(resource.id);
        try {
            const blob = await downloadAdminResource(resource);
            saveAs(blob, fileName(resource.objectKey) || resource.id);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.storageResourcesPanel.failedToDownloadTheResource"));
        } finally {
            setDownloadingId("");
        }
    };

    const confirmDelete = (resourceIds: string[]) => {
        const uniqueIds = Array.from(new Set(resourceIds));
        modal.confirm({
            title: uniqueIds.length > 1 ? translate("admin.storageResourcesPanel.deleteTheSelectedResources", { v0: String(uniqueIds.length) }) : translate("admin.storageResourcesPanel.deleteThisResource"),
            content: translate("admin.storageResourcesPanel.theSystemFirstChecksReferencesFromAnnouncementsAssetsCanvasesProjects"),
            okText: uniqueIds.length > 1 ? translate("admin.storageResourcesPanel.checkAndDelete") : translate("account.ui.delete.confirm"),
            cancelText: translate("common.cancel"),
            okButtonProps: { danger: true },
            onOk: async () => {
                setDeleting(true);
                try {
                    const result = await deleteAdminResources(uniqueIds);
                    setSelectedIds([]);
                    setRefreshKey((value) => value + 1);
                    if (result.deleted.length > 0) message.success(translate("admin.storageResourcesPanel.deletedResources", { v0: String(result.deleted.length) }));
                    if (result.blocked.length > 0) {
                        modal.warning({
                            title: result.deleted.length > 0 ? translate("admin.storageResourcesPanel.someResourcesWereNotDeleted") : translate("admin.storageResourcesPanel.resourcesWereNotDeleted"),
                            content: <DeleteBlockedSummary blocked={result.blocked} />,
                            okText: translate("admin.storageResourcesPanel.gotIt"),
                        });
                    }
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("admin.storageResourcesPanel.failedToDeleteResources"));
                    throw error;
                } finally {
                    setDeleting(false);
                }
            },
        });
    };

    return (
        <div className="space-y-4 pt-4">
            <div className="grid overflow-hidden rounded-md border border-border sm:grid-cols-2 xl:grid-cols-4">
                <AdminStatTile label={translate("admin.storageResourcesPanel.resourceRecords")} value={stats ? stats.resourceCount.toLocaleString() : "--"} detail={stats ? translate("admin.storageResourcesPanel.available", { v0: String(stats.readyCount.toLocaleString()) }) : undefined} />
                <AdminStatTile label={translate("admin.storageResourcesPanel.logicalSize")} value={stats ? formatBytes(stats.logicalBytes) : "--"} detail={translate("admin.storageResourcesPanel.includesFailedAndPendingRecords")} />
                <AdminStatTile label={translate("admin.storageResourcesPanel.availablePhysicalSize")} value={stats ? formatBytes(stats.physicalBytes) : "--"} detail={translate("admin.storageResourcesPanel.readyResourcesOnly")} />
                <AdminStatTile label={translate("admin.storageResourcesPanel.storageBreakdown")} value={stats ? formatBytes(stats.remoteBytes) : "--"} detail={stats ? translate("admin.storageResourcesPanel.localRemote", { v0: String(formatBytes(stats.localBytes)) }) : undefined} />
            </div>
            {stats?.offload && (stats.offload.pending > 0 || stats.offload.failed > 0) ? <OffloadAlert offload={stats.offload} /> : null}
            <AdminDataTable
                toolbar={
                    <div className="admin-storage-resource-filters">
                        <AdminSearchInput
                            aria-label={translate("admin.storageResourcesPanel.searchResources")}
                            autoComplete="off"
                            allowClear
                            className="app-list-search"
                            prefix={<Search className="size-4 text-foreground/40" />}
                            value={keyword}
                            placeholder={translate("admin.storageResourcesPanel.resourceIDOrObjectPath")}
                            onValueChange={(value) => updateUrl({ filter: value, page: 1 }, true)}
                        />
                        <AdminSearchInput aria-label={translate("admin.storageResourcesPanel.filterByUsernameNicknameEmailOrUserID")} autoComplete="off" allowClear className="w-64" value={userQuery} placeholder={translate("admin.storageResourcesPanel.usernameNicknameEmailUserID")} onValueChange={(value) => updateUrl({ user: value, userId: "", page: 1 }, true)} />
                        <Select aria-label={translate("admin.storageResourcesPanel.filterResourceType")} className="w-32" value={kind} onChange={(value) => updateUrl({ kind: value, page: 1 })} options={kindOptions} />
                        <Select aria-label={translate("admin.storageResourcesPanel.filterResourceStatus")} className="w-32" value={status} onChange={(value) => updateUrl({ status: value, page: 1 })} options={statusOptions} />
                        <Select aria-label={translate("admin.storageResourcesPanel.filterStorageType")} className="w-36" value={provider} onChange={(value) => updateUrl({ provider: value, page: 1 })} options={providerOptions} />
                    </div>
                }
                toolbarActiveFilters={
                    <>
                        {keyword ? <AdminFilterChip label={translate("admin.storageResourcesPanel.search", { v0: String(keyword) })} onRemove={() => updateUrl({ filter: "", page: 1 })} /> : null}
                        {userQuery ? <AdminFilterChip label={translate("admin.storageResourcesPanel.user", { v0: String(userQuery) })} onRemove={() => updateUrl({ user: "", userId: "", page: 1 })} /> : null}
                        {kind !== "all" ? <AdminFilterChip label={translate("admin.storageResourcesPanel.type", { v0: String(kindLabel(kind)) })} onRemove={() => updateUrl({ kind: "all", page: 1 })} /> : null}
                        {status !== "all" ? <AdminFilterChip label={translate("admin.storageResourcesPanel.status", { v0: String(statusLabel(status)) })} onRemove={() => updateUrl({ status: "all", page: 1 })} /> : null}
                        {provider !== "all" ? <AdminFilterChip label={translate("admin.storageResourcesPanel.storage2", { v0: String(providerLabel(provider)) })} onRemove={() => updateUrl({ provider: "all", page: 1 })} /> : null}
                    </>
                }
                toolbarActive={hasFilters}
                onReset={() => updateUrl({ filter: "", user: "", userId: "", kind: "all", status: "all", provider: "all", page: 1 })}
                batchActions={
                    <AdminBatchBar count={selectedIds.length} onClear={() => setSelectedIds([])}>
                        <Button danger size="small" icon={<Trash2 className="size-3.5" />} loading={deleting} onClick={() => confirmDelete(selectedIds)}>
                            {translate("admin.storageResourcesPanel.bulkDelete")}
                        </Button>
                    </AdminBatchBar>
                }
                skeletonColumns={9}
                table={{
                    className: "app-data-table",
                    size: "small",
                    rowKey: "id",
                    loading,
                    columns,
                    dataSource: resources,
                    rowSelection: {
                        selectedRowKeys: selectedIds,
                        preserveSelectedRowKeys: true,
                        onChange: (keys) => {
                            const next = keys.map(String);
                            if (next.length > 100) message.warning(translate("admin.storageResourcesPanel.selectUpTo100ResourcesAtATime"));
                            setSelectedIds(next.slice(0, 100));
                        },
                    },
                    pagination: false,
                    scroll: { x: 1390 },
                }}
                empty={<AdminTableEmpty filtered={hasFilters} title={hasFilters ? undefined : translate("admin.storageResourcesPanel.noResourceRecords")} description={hasFilters ? undefined : translate("admin.storageResourcesPanel.uploadedOrGeneratedResourcesAppearHere")} />}
                footer={<PaginationBar alwaysShow current={page} pageSize={pageSize} total={total} onChange={(nextPage, nextSize) => updateUrl({ page: nextSize !== pageSize ? 1 : nextPage, pageSize: nextSize })} />}
            />
            <AdminModal
                title={previewing ? fileName(previewing.objectKey) || translate("admin.storageResourcesPanel.resourcePreview") : translate("admin.storageResourcesPanel.resourcePreview")}
                open={Boolean(previewing)}
                width={880}
                onCancel={() => setPreviewing(null)}
                footer={
                    previewing ? (
                        <Button icon={<Download className="size-4" />} loading={downloadingId === previewing.id} onClick={() => void download(previewing)}>
                            {translate("admin.storageResourcesPanel.downloadOriginalFile")}
                        </Button>
                    ) : null
                }
                destroyOnHidden
            >
                {previewing ? <ResourcePreview resource={previewing} /> : null}
            </AdminModal>
        </div>
    );
}

function DeleteBlockedSummary({ blocked }: { blocked: Array<{ id: string; reason: string; references: Array<{ kind: string; id: string; title: string }> }> }) {
    return (
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1 text-sm">
            {blocked.map((item) => (
                <div key={item.id} className="rounded-md border border-border px-3 py-2">
                    <div className="admin-monospace break-all text-foreground/75">{item.id}</div>
                    <div className="mt-1 text-foreground/55">{item.reason}</div>
                    {item.references.length > 0 ? (
                        <div className="mt-1 text-xs text-foreground/45">
                            {item.references
                                .slice(0, 4)
                                .map((reference) => `${reference.kind}「${reference.title || reference.id}」`)
                                .join("、")}
                            {item.references.length > 4 ? translate("admin.storageResourcesPanel.andOtherLocations", { v0: String(item.references.length) }) : ""}
                        </div>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

function ResourcePreview({ resource }: { resource: AdminStorageResource }) {
    const url = adminResourceFileUrl(resource.id);
    if (resource.kind === "image" || resource.mimeType.startsWith("image/")) return <img className="mx-auto max-h-[65vh] max-w-full object-contain" src={url} alt={fileName(resource.objectKey) || translate("admin.storageResourcesPanel.resourcePreview")} />;
    if (resource.kind === "video" || resource.mimeType.startsWith("video/")) return <video className="mx-auto max-h-[65vh] max-w-full bg-black" src={url} controls playsInline />;
    if (resource.kind === "audio" || resource.mimeType.startsWith("audio/"))
        return (
            <div className="py-12">
                <audio className="w-full" src={url} controls />
            </div>
        );
    return <div className="rounded-md border border-border bg-muted/20 px-5 py-10 text-center text-sm text-foreground/55">{translate("admin.storageResourcesPanel.thisFileTypeCannotBePreviewedInlineDownloadItTo")}</div>;
}

const kindOptions = [
    { label: translate("library.tasks.page.allKinds"), value: "all" },
    { label: translate("account.feedback.image"), value: "image" },
    { label: translate("account.feedback.video"), value: "video" },
    { label: translate("account.settings.modelConfig.capabilities.audio"), value: "audio" },
    { label: translate("admin.storageResourcesPanel.file"), value: "file" },
    { label: translate("admin.storageResourcesPanel.live2DModel"), value: "live2d" },
];
const statusOptions = [
    { label: translate("library.ark.expiry.all"), value: "all" },
    { label: translate("account.feedback.status.pending"), value: "pending" },
    { label: translate("admin.storageResourcesPanel.ready"), value: "ready" },
    { label: translate("library.assets.batch.failed"), value: "failed" },
    { label: translate("canvasB.historyDrawer.deleted"), value: "deleted" },
];
const providerOptions = [
    { label: translate("admin.storageResourcesPanel.allStorage"), value: "all" },
    { label: translate("admin.storageResourcesPanel.local"), value: "local" },
    { label: translate("account.layout.oss.providers.aliyun"), value: "aliyun" },
    { label: translate("account.layout.oss.providers.tencent"), value: "tencent" },
    { label: translate("account.layout.oss.providers.qiniu"), value: "qiniu" },
    { label: translate("account.layout.oss.providers.volcengine"), value: "volcengine" },
    { label: "S3", value: "s3" },
];

function normalizeOption(value: string | null, values: string[]) {
    return value && values.includes(value) ? value : "all";
}
function positiveInt(value: string | null, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function normalizePageSize(value: string | null) {
    const parsed = positiveInt(value, 20);
    return pageSizes.includes(parsed) ? parsed : 20;
}
function fileName(objectKey: string) {
    return objectKey.split("/").filter(Boolean).at(-1) || "";
}
function kindLabel(kind: string) {
    return ({ image: translate("account.feedback.image"), video: translate("account.feedback.video"), audio: translate("account.settings.modelConfig.capabilities.audio"), file: translate("admin.storageResourcesPanel.file"), live2d: "Live2D" } as Record<string, string>)[kind] || kind || translate("admin.storageResourcesPanel.unknown");
}
function statusLabel(status: string) {
    return ({ pending: translate("account.feedback.status.pending"), ready: translate("admin.storageResourcesPanel.ready"), failed: translate("library.assets.batch.failed"), deleted: translate("canvasB.historyDrawer.deleted") } as Record<string, string>)[status] || status || translate("admin.storageResourcesPanel.unknown");
}
function statusTone(status: string): "neutral" | "success" | "warning" | "error" {
    return status === "ready" ? "success" : status === "pending" ? "warning" : status === "failed" ? "error" : "neutral";
}
function providerLabel(provider: string) {
    return ({ local: translate("admin.storageResourcesPanel.local"), aliyun: translate("account.layout.oss.providers.aliyun"), tencent: translate("account.layout.oss.providers.tencent"), qiniu: translate("account.layout.oss.providers.qiniu"), volcengine: translate("account.layout.oss.providers.volcengine"), s3: "S3" } as Record<string, string>)[provider] || provider || translate("admin.storageResourcesPanel.local");
}
function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** unit;
    return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
function formatTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString(currentLocale(), { hour12: false });
}
function resourceDimensions(resource: AdminStorageResource) {
    if (resource.width > 0 && resource.height > 0)
        return (
            <span className="tabular-nums">
                {resource.width} × {resource.height}
            </span>
        );
    if (resource.durationMs > 0) return <span className="tabular-nums">{formatDuration(resource.durationMs)}</span>;
    return <span className="text-foreground/30">--</span>;
}
function formatDuration(durationMs: number) {
    const seconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}:${String(seconds % 60).padStart(2, "0")}` : translate("admin.storageResourcesPanel.s", { v0: String(seconds) });
}

function OffloadAlert({ offload }: { offload: AdminStorageStats["offload"] }) {
    const parts = [translate("admin.storageResourcesPanel.creationsAwaitingSyncToObjectStorage", { v0: String(offload.pending.toLocaleString()), v1: String(formatBytes(offload.pendingBytes)) })];
    if (offload.oldestPending) parts.push(translate("admin.storageResourcesPanel.oldestSavedAt", { v0: String(new Date(offload.oldestPending).toLocaleString(currentLocale(), { hour12: false })) }));
    if (offload.lastErrorCode) parts.push(translate("admin.storageResourcesPanel.latestError", { v0: String(offload.lastErrorCode) }));
    const failed = offload.failed > 0 ? translate("admin.storageResourcesPanel.localFilesForAnotherCreationsAreMissingAndCannotSync", { v0: String(offload.failed.toLocaleString()) }) : undefined;
    return <Alert type={offload.failed > 0 ? "error" : "warning"} showIcon message={translate("admin.storageResourcesPanel.objectStorageWritesFailedSomeCreationsAreTemporarilyStoredOn")} description={[parts.join("；") + translate("admin.storageResourcesPanel.userAccessIsUnaffectedFilesWillSyncAutomaticallyWhenStorage"), failed].filter(Boolean).join(" ")} />;
}
