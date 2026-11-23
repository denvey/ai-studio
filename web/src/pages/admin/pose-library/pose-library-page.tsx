import { App, AutoComplete, Button, Form, Input, Progress } from "antd";
import type { ColumnsType } from "antd/es/table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CloudDownload, FileJson, Pencil, Plus, RefreshCw, RotateCcw, Search, Square, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Select } from "@/components/ui/base/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
    bulkPoseLibraryItems,
    createPoseLibraryItem,
    deletePoseLibraryItem,
    importPoseLibrary,
    isAdultPoseSystem,
    listAdminPoseLibrary,
    poseLibraryFileUrl,
    previewPoseLibraryPack,
    syncPoseLibraryImages,
    updatePoseLibraryItem,
    POSE_LIBRARY_ANGLES,
    POSE_LIBRARY_DEFAULT_BASE_URL,
    POSE_LIBRARY_UPSTREAM_REPO,
    type AdminPoseLibraryItem,
    type AdminPoseLibrarySystem,
    type PoseLibraryBulkAction,
    type PoseLibraryPackPreview,
    type PoseLibraryStats,
} from "@/services/api/pose-library";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminSearchInput } from "../components/admin-search-input";
import { AdminDataTable, AdminRowActions, AdminStatTile, AdminStatusBadge, AdminTableEmpty, PaginationBar } from "../components/admin-ui";
import { AdminModal } from "../ui/overlays";
import { AdminCheckbox, AdminSwitch, Callout } from "../ui/controls";
import { translate } from "@/i18n";


const SYNC_BATCH = 12;
const statusLabels: Record<AdminPoseLibraryItem["status"], { label: string; tone: "success" | "warning" | "error" }> = {
    ready: { label: translate("canvasPage.syncStatus.synced"), tone: "success" },
    pending: { label: translate("adminPages.poseLibrary.poseLibraryPage.pendingSync"), tone: "warning" },
    failed: { label: translate("adminPages.poseLibrary.poseLibraryPage.syncFailed"), tone: "error" },
};

type SyncProgress = { running: boolean; succeeded: number; failed: number; lastError?: string };

/** 体系数量会随导入增长；折叠并在展开时限高，避免把下方筛选和姿势列表挤出屏幕。 */
export function PoseLibrarySystems({ systems, sourceName, onBulk }: { systems: AdminPoseLibrarySystem[]; sourceName: Map<string, string>; onBulk: (action: PoseLibraryBulkAction, target: AdminPoseLibrarySystem) => void }) {
    return (
        <section className="rounded-[var(--card-radius)] bg-[var(--library-surface)] p-4">
            <details className="pose-library-systems">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
                    <span>{translate("adminPages.poseLibrary.poseLibraryPage.manageByCollection")}</span>
                    <span className="text-xs font-normal text-[var(--text-secondary)]">
                        {systems.length} {translate("adminPages.poseLibrary.poseLibraryPage.collectionsTotal")} {systems.reduce((sum, item) => sum + item.total, 0)} {translate("adminPages.poseLibrary.poseLibraryPage.itemsEnabled")} {systems.reduce((sum, item) => sum + item.enabled, 0)} {translate("account.layout.pagination.item")}
                    </span>
                </summary>
                <div className="mt-2 max-h-60 overflow-y-auto pr-1">
                    <div className="divide-y divide-[var(--border)]">
                        {systems.map((item) => (
                            <div key={`${item.sourceKey}:${item.system}`} className="flex flex-wrap items-center gap-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm">
                                        {item.system}
                                        {isAdultPoseSystem(item.system) ? (
                                            <span className="ml-2">
                                                <AdminStatusBadge label={translate("adminPages.poseLibrary.poseLibraryPage.adultOriented")} tone="warning" />
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="text-xs text-[var(--text-secondary)]">
                                        {sourceName.get(item.sourceKey) || item.sourceKey} {translate("adminPages.poseLibrary.poseLibraryPage.total")} {item.total} {translate("adminPages.poseLibrary.poseLibraryPage.synced")} {item.ready} {translate("adminPages.poseLibrary.poseLibraryPage.enabled")} {item.enabled}
                                    </div>
                                </div>
                                <Button size="small" disabled={item.enabled === item.total} onClick={() => onBulk("enable", item)}>
                                    {translate("adminPages.poseLibrary.poseLibraryPage.enableAll")}
                                </Button>
                                <Button size="small" disabled={item.enabled === 0} onClick={() => onBulk("disable", item)}>
                                    {translate("adminPages.poseLibrary.poseLibraryPage.disableAll")}
                                </Button>
                                {item.sourceKey !== "custom" ? (
                                    <Button size="small" title={translate("adminPages.poseLibrary.poseLibraryPage.ifTheDataDirectoryIsLostOrSourceImagesChange")} onClick={() => onBulk("resync", item)}>
                                        {translate("adminPages.poseLibrary.poseLibraryPage.resync")}
                                    </Button>
                                ) : null}
                                <Button size="small" danger onClick={() => onBulk("delete", item)}>
                                    {translate("common.delete")}
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </details>
        </section>
    );
}

export default function PoseLibraryAdminPage() {
    const { message, modal } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const [source, setSource] = useState("");
    const [system, setSystem] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const debouncedKeyword = useDebouncedValue(keyword.trim(), 250);
    const [importOpen, setImportOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<AdminPoseLibraryItem | null>(null);
    const [sync, setSync] = useState<SyncProgress | null>(null);
    const [liveStats, setLiveStats] = useState<PoseLibraryStats | null>(null);
    const syncAbortRef = useRef<AbortController | null>(null);
    const filtered = Boolean(debouncedKeyword || source || system || status);

    const query = useQuery({
        queryKey: ["admin", "pose-library", debouncedKeyword, source, system, status, page, pageSize],
        queryFn: ({ signal }) => listAdminPoseLibrary({ keyword: debouncedKeyword || undefined, source: source || undefined, system: system || undefined, status: status || undefined, page, pageSize }, signal),
        placeholderData: keepPreviousData,
    });
    const data = query.data;
    const stats = (sync?.running ? liveStats : null) || data?.stats;
    const systems = data?.systems || [];
    const sources = data?.sources || [];
    const sourceName = useMemo(() => new Map(sources.map((item) => [item.key, item.name])), [sources]);
    const reload = () => void query.refetch();

    const runSync = async (retryFailed: boolean) => {
        const controller = new AbortController();
        syncAbortRef.current = controller;
        const progress: SyncProgress = { running: true, succeeded: 0, failed: 0 };
        setSync({ ...progress });
        let retry = retryFailed;
        try {
            for (;;) {
                const result = await syncPoseLibraryImages({ limit: SYNC_BATCH, retryFailed: retry }, controller.signal);
                retry = false;
                progress.succeeded += result.succeeded;
                progress.failed += result.failed;
                if (result.failures?.length) progress.lastError = `${result.failures[0].name}：${result.failures[0].message}`;
                setLiveStats(result.stats);
                setSync({ ...progress });
                if (result.processed === 0 || result.stats.pending === 0) break;
            }
            message.success(translate("adminPages.poseLibrary.poseLibraryPage.syncCompleteSucceeded", { v0: String(progress.succeeded), v1: String(progress.failed ? translate("adminPages.poseLibrary.poseLibraryPage.failed2", { v0: String(progress.failed) }) : "") }));
        } catch (error) {
            if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : translate("adminPages.poseLibrary.poseLibraryPage.imageSyncFailed"));
        } finally {
            syncAbortRef.current = null;
            setSync({ ...progress, running: false });
            reload();
        }
    };

    const runBulk = (action: PoseLibraryBulkAction, target: AdminPoseLibrarySystem) => {
        const verb = { enable: translate("adminPages.poseLibrary.poseLibraryPage.enable"), disable: translate("adminPages.poseLibrary.poseLibraryPage.disable"), delete: translate("common.delete"), resync: translate("adminPages.poseLibrary.poseLibraryPage.markAsPendingSync") }[action];
        const execute = async () => {
            try {
                const result = await bulkPoseLibraryItems({ action, sourceKey: target.sourceKey, system: target.system });
                message.success(translate("adminPages.poseLibrary.poseLibraryPage.items", { v0: String(verb), v1: String(result.affected) }));
                reload();
            } catch (error) {
                message.error(error instanceof Error ? error.message : translate("adminPages.poseLibrary.poseLibraryPage.bulkFailed", { v0: String(verb) }));
            }
        };
        if (action !== "delete") return void execute();
        modal.confirm({
            title: translate("adminPages.poseLibrary.poseLibraryPage.deletePosesIn", { v0: String(target.system), v1: String(target.total) }),
            content: translate("adminPages.poseLibrary.poseLibraryPage.syncedImageFilesOnThisSiteWillAlsoBeDeleted"),
            okText: translate("account.ui.delete.confirm"),
            okButtonProps: { danger: true },
            cancelText: translate("common.cancel"),
            onOk: execute,
        });
    };

    const toggleEnabled = async (item: AdminPoseLibraryItem, enabled: boolean) => {
        try {
            await updatePoseLibraryItem(item.id, { enabled });
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.poseLibrary.poseLibraryPage.updateFailed"));
        }
    };

    const remove = async (item: AdminPoseLibraryItem) => {
        try {
            await deletePoseLibraryItem(item.id);
            message.success(translate("adminPages.poseLibrary.poseLibraryPage.poseDeleted"));
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("library.picker.deleteFailed"));
        }
    };

    const columns: ColumnsType<AdminPoseLibraryItem> = [
        {
            title: translate("account.feedback.image"),
            width: 76,
            render: (_, item) =>
                item.status === "ready" ? (
                    <img className="h-14 w-[42px] rounded-[var(--radius-sm)] bg-[var(--library-cover-surface)] object-contain" src={poseLibraryFileUrl(item)} alt={item.name} loading="lazy" />
                ) : (
                    <span className="grid h-14 w-[42px] place-items-center rounded-[var(--radius-sm)] bg-[var(--library-cover-surface)] text-[var(--fs-label)] text-[var(--text-tertiary)]">—</span>
                ),
        },
        {
            title: translate("adminPages.poseLibrary.poseLibraryPage.pose"),
            render: (_, item) => (
                <div className="min-w-0">
                    <div className="truncate font-medium">
                        {item.code ? <span className="mr-2 font-mono text-xs text-[var(--text-tertiary)]">{item.code}</span> : null}
                        {item.name}
                    </div>
                    <div className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                        {item.system} · {item.category} · {sourceName.get(item.sourceKey) || item.sourceKey}
                    </div>
                </div>
            ),
        },
        { title: translate("adminPages.poseLibrary.poseLibraryPage.view"), dataIndex: "angle", width: 80, align: "center" },
        {
            title: translate("adminPages.poseLibrary.poseLibraryPage.sync"),
            width: 110,
            align: "center",
            render: (_, item) => <AdminStatusBadge label={statusLabels[item.status]?.label || item.status} tone={statusLabels[item.status]?.tone} title={item.error || undefined} />,
        },
        { title: translate("adminPages.poseLibrary.poseLibraryPage.enable"), width: 80, align: "center", render: (_, item) => <AdminSwitch size="sm" checked={item.enabled} aria-label={translate("adminPages.poseLibrary.poseLibraryPage.enable2", { v0: String(item.name) })} onChange={(checked) => void toggleEnabled(item, checked)} /> },
        {
            title: translate("account.settings.runninghub.actions"),
            width: 170,
            align: "center",
            render: (_, item) => (
                <AdminRowActions
                    primary={{ label: translate("account.settings.channels.edit"), icon: <Pencil className="size-3.5" />, onClick: () => setEditing(item) }}
                    actions={[
                        {
                            key: "delete",
                            label: translate("common.delete"),
                            icon: <Trash2 className="size-3.5" />,
                            danger: true,
                            confirm: { title: translate("adminPages.poseLibrary.poseLibraryPage.delete", { v0: String(item.name), v1: String(item.angle) }), description: translate("adminPages.poseLibrary.poseLibraryPage.imagesSavedOnThisSiteWillAlsoBeDeletedCopies"), okText: translate("account.ui.delete.confirm") },
                            onClick: () => remove(item),
                        },
                    ]}
                />
            ),
        },
    ];

    const readyPercent = stats?.total ? Math.round((stats.ready / stats.total) * 100) : 0;
    return (
        <AdminPageFrame
            title={translate("adminPages.poseLibrary.poseLibraryPage.poseLibrary")}
            description={translate("adminPages.poseLibrary.poseLibraryPage.theSourceOfTheCanvasPoseLibraryTheRepositoryIncludes")}
            actions={
                <div className="flex flex-wrap gap-2">
                    <Button icon={<RefreshCw className="size-4" />} loading={query.isFetching && !sync?.running} onClick={reload}>
                        {translate("common.refresh")}
                    </Button>
                    <Button icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                        {translate("adminPages.poseLibrary.poseLibraryPage.addPose")}
                    </Button>
                    <Button type="primary" icon={<FileJson className="size-4" />} onClick={() => setImportOpen(true)}>
                        {translate("adminPages.poseLibrary.poseLibraryPage.importData")}
                    </Button>
                </div>
            }
        >
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <AdminStatTile label={translate("adminPages.poseLibrary.poseLibraryPage.totalPoseImages")} value={stats?.total ?? "—"} detail={stats?.disabled ? translate("adminPages.poseLibrary.poseLibraryPage.imagesDisabled", { v0: String(stats.disabled) }) : undefined} />
                <AdminStatTile label={translate("canvasPage.syncStatus.synced")} value={stats?.ready ?? "—"} detail={stats?.total ? `${readyPercent}%` : undefined} />
                <AdminStatTile label={translate("adminPages.poseLibrary.poseLibraryPage.pendingSync")} value={stats?.pending ?? "—"} />
                <AdminStatTile label={translate("adminPages.poseLibrary.poseLibraryPage.syncFailed")} value={stats?.failed ?? "—"} />
            </section>

            <section className="rounded-[var(--card-radius)] bg-[var(--library-surface)] p-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{translate("adminPages.poseLibrary.poseLibraryPage.imageSync")}</div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{translate("adminPages.poseLibrary.poseLibraryPage.theServerDownloadsThumbnailsAndFullSizeImagesFromThe")} {SYNC_BATCH} {translate("adminPages.poseLibrary.poseLibraryPage.itemsStopAtAnyTimeAndResumeLater")}</p>
                    </div>
                    {sync?.running ? (
                        <Button icon={<Square className="size-3.5" />} onClick={() => syncAbortRef.current?.abort()}>
                            {translate("adminPages.poseLibrary.poseLibraryPage.stop")}
                        </Button>
                    ) : (
                        <>
                            {stats?.failed ? (
                                <Button icon={<RotateCcw className="size-4" />} onClick={() => void runSync(true)}>
                                    {translate("adminPages.poseLibrary.poseLibraryPage.retryFailed")}{stats.failed}）
                                </Button>
                            ) : null}
                            <Button type="primary" icon={<CloudDownload className="size-4" />} disabled={!stats?.pending} onClick={() => void runSync(false)}>
                                {translate("adminPages.poseLibrary.poseLibraryPage.syncImages")}{stats?.pending ? `（${stats.pending}）` : ""}
                            </Button>
                        </>
                    )}
                </div>
                {stats?.total ? (
                    <div className="mt-3">
                        <Progress percent={readyPercent} status={sync?.running ? "active" : undefined} format={() => `${stats.ready}/${stats.total}`} />
                    </div>
                ) : null}
                {sync ? (
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        {sync.running ? translate("adminPages.poseLibrary.poseLibraryPage.syncing") : translate("adminPages.poseLibrary.poseLibraryPage.lastSync")}{translate("adminPages.poseLibrary.poseLibraryPage.succeeded")} {sync.succeeded}{translate("adminPages.poseLibrary.poseLibraryPage.failed")} {sync.failed}
                        {sync.lastError ? translate("adminPages.poseLibrary.poseLibraryPage.latestError", { v0: String(sync.lastError) }) : ""}
                    </p>
                ) : null}
            </section>

            {systems.length ? <PoseLibrarySystems systems={systems} sourceName={sourceName} onBulk={runBulk} /> : null}

            <AdminDataTable<AdminPoseLibraryItem>
                toolbar={
                    <AdminSearchInput
                        allowClear
                        className="app-list-search"
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={keyword}
                        placeholder={translate("adminPages.poseLibrary.poseLibraryPage.searchNameCategoryOrID")}
                        aria-label={translate("adminPages.poseLibrary.poseLibraryPage.searchPoses")}
                        onValueChange={(value) => {
                            setKeyword(value);
                            setPage(1);
                        }}
                    />
                }
                toolbarActive={filtered}
                toolbarFilters={
                    <>
                        <Select
                            ariaLabel={translate("canvasA.assetView.origin")}
                            className="w-52"
                            value={source}
                            options={[{ value: "", label: translate("adminPages.poseLibrary.poseLibraryPage.allSources") }, ...sources.map((item) => ({ value: item.key, label: item.name }))]}
                            onChange={(value: string) => {
                                setSource(value);
                                setPage(1);
                            }}
                        />
                        <Select
                            ariaLabel={translate("adminPages.poseLibrary.poseLibraryPage.collection")}
                            className="w-48"
                            value={system}
                            options={[{ value: "", label: translate("adminPages.poseLibrary.poseLibraryPage.allCollections") }, ...Array.from(new Set(systems.map((item) => item.system))).map((name) => ({ value: name, label: name }))]}
                            onChange={(value: string) => {
                                setSystem(value);
                                setPage(1);
                            }}
                        />
                        <Select
                            ariaLabel={translate("adminPages.poseLibrary.poseLibraryPage.syncStatus")}
                            className="w-32"
                            value={status}
                            options={[
                                { value: "", label: translate("library.ark.expiry.all") },
                                { value: "ready", label: translate("canvasPage.syncStatus.synced") },
                                { value: "pending", label: translate("adminPages.poseLibrary.poseLibraryPage.pendingSync") },
                                { value: "failed", label: translate("adminPages.poseLibrary.poseLibraryPage.syncFailed") },
                            ]}
                            onChange={(value: string) => {
                                setStatus(value);
                                setPage(1);
                            }}
                        />
                    </>
                }
                onReset={() => {
                    setKeyword("");
                    setSource("");
                    setSystem("");
                    setStatus("");
                    setPage(1);
                }}
                empty={<AdminTableEmpty filtered={filtered} title={filtered ? translate("adminPages.poseLibrary.poseLibraryPage.noMatchingPoses") : translate("adminPages.poseLibrary.poseLibraryPage.noPosesImportedYet")} description={filtered ? translate("adminPages.poseLibrary.poseLibraryPage.adjustTheFiltersAndTryAgain") : translate("adminPages.poseLibrary.poseLibraryPage.clickImportDataInTheTopRightAndUploadData")} />}
                footer={
                    <PaginationBar
                        alwaysShow
                        current={page}
                        pageSize={pageSize}
                        total={data?.total || 0}
                        onChange={(next, size) => {
                            setPage(size !== pageSize ? 1 : next);
                            setPageSize(size);
                        }}
                    />
                }
                table={{ rowKey: "id", dataSource: data?.items || [], columns, loading: query.isLoading, pagination: false, size: "small", scroll: { x: 860 } }}
            />

            <PoseLibraryImportModal
                open={importOpen}
                onClose={() => setImportOpen(false)}
                onImported={() => {
                    setImportOpen(false);
                    reload();
                }}
            />
            <PoseLibraryItemModal
                open={createOpen}
                systems={systems}
                onClose={() => setCreateOpen(false)}
                onSaved={() => {
                    setCreateOpen(false);
                    reload();
                }}
            />
            <PoseLibraryItemModal
                open={Boolean(editing)}
                item={editing || undefined}
                systems={systems}
                onClose={() => setEditing(null)}
                onSaved={() => {
                    setEditing(null);
                    reload();
                }}
            />
        </AdminPageFrame>
    );
}

function PoseLibraryImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<PoseLibraryPackPreview | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [baseUrl, setBaseUrl] = useState(POSE_LIBRARY_DEFAULT_BASE_URL);
    const [error, setError] = useState("");
    const [importing, setImporting] = useState(false);

    const reset = () => {
        setFile(null);
        setPreview(null);
        setSelected(new Set());
        setBaseUrl(POSE_LIBRARY_DEFAULT_BASE_URL);
        setError("");
        if (inputRef.current) inputRef.current.value = "";
    };

    const choose = async (next: File | undefined) => {
        setError("");
        setPreview(null);
        setFile(next || null);
        if (!next) return;
        try {
            const parsed = previewPoseLibraryPack(await next.text());
            setPreview(parsed);
            setSelected(new Set(parsed.systems.filter((item) => !isAdultPoseSystem(item.name)).map((item) => item.name)));
            setBaseUrl(parsed.baseUrl || (parsed.format === "ai-pose-gallery-zh" ? POSE_LIBRARY_DEFAULT_BASE_URL : ""));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : translate("adminPages.poseLibrary.poseLibraryPage.unableToParseFile"));
        }
    };

    const submit = async () => {
        if (!file || !preview || !selected.size) return;
        setImporting(true);
        try {
            const result = await importPoseLibrary({ file, baseUrl, systems: Array.from(selected) });
            message.success(translate("adminPages.poseLibrary.poseLibraryPage.importCompleteAddedUpdatedNextClickSyncImages", { v0: String(result.created), v1: String(result.updated), v2: String(result.skipped ? translate("adminPages.poseLibrary.poseLibraryPage.skipped", { v0: String(result.skipped) }) : "") }));
            if (result.invalid?.length) message.warning(result.invalid.join("；"));
            reset();
            onImported();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : translate("adminPages.poseLibrary.poseLibraryPage.importFailed"));
        } finally {
            setImporting(false);
        }
    };

    const selectedCount = preview?.systems.filter((item) => selected.has(item.name)).reduce((sum, item) => sum + item.count, 0) || 0;
    const close = () => {
        if (importing) return;
        reset();
        onClose();
    };
    return (
        <AdminModal
            title={translate("adminPages.poseLibrary.poseLibraryPage.importPoseData")}
            open={open}
            centered
            width="min(640px, calc(100vw - 32px))"
            keyboard={!importing}
            mask={{ closable: !importing }}
            styles={{ body: { maxHeight: "calc(100dvh - 220px)", overflowY: "auto" } }}
            cancelText={translate("common.cancel")}
            cancelButtonProps={{ disabled: importing }}
            okText={selectedCount ? translate("adminPages.poseLibrary.poseLibraryPage.importItems", { v0: String(selectedCount) }) : translate("account.settings.memory.actors.seed")}
            okButtonProps={{ disabled: !preview || !selected.size || !baseUrl.trim() }}
            confirmLoading={importing}
            onOk={() => void submit()}
            onCancel={close}
        >
            <div className="space-y-4">
                <Callout title={translate("adminPages.poseLibrary.poseLibraryPage.importFromAiPoseGalleryZh")}>
                    <ol className="list-decimal space-y-1 pl-4">
                        <li>
                            {translate("canvasB.common.open")}{" "}
                            <a href={`${POSE_LIBRARY_UPSTREAM_REPO}/blob/main/data/pose-zh.json`} target="_blank" rel="noopener noreferrer">
                                data/pose-zh.json
                            </a>
                            {translate("adminPages.poseLibrary.poseLibraryPage.thenClickDownloadRawFileAbout06MBMetadata")}
                        </li>
                        <li>{translate("adminPages.poseLibrary.poseLibraryPage.selectThisFileBelowAndChooseTheCollectionsToImport")}</li>
                        <li>{translate("adminPages.poseLibrary.poseLibraryPage.afterImportingReturnToTheListAndClickSyncImages")}</li>
                    </ol>
                    <p className="mt-2">{translate("adminPages.poseLibrary.poseLibraryPage.yingcePosePackagesFormatYingcePoseLibraryAreAlsoSupported")}</p>
                </Callout>

                <div>
                    <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void choose(event.target.files?.[0])} />
                    <Button icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()}>
                        {file ? translate("adminPages.poseLibrary.poseLibraryPage.chooseAnotherFile") : translate("adminPages.poseLibrary.poseLibraryPage.chooseJSONFile")}
                    </Button>
                    {file ? <span className="ml-3 text-sm text-[var(--text-secondary)]">{file.name}</span> : null}
                    {error ? (
                        <Callout tone="error" className="mt-2">
                            {error}
                        </Callout>
                    ) : null}
                </div>

                {preview ? (
                    <>
                        <div>
                            <div className="text-sm font-medium">{preview.sourceName}</div>
                            <div className="mt-1 text-xs text-[var(--text-secondary)]">{translate("adminPages.poseLibrary.poseLibraryPage.total2")} {preview.total} {translate("adminPages.poseLibrary.poseLibraryPage.itemsSelectByCollection")}</div>
                            <div className="mt-2 space-y-2">
                                {preview.systems.map((item) => (
                                    <div key={item.name} className="flex items-center gap-2">
                                        <AdminCheckbox
                                            checked={selected.has(item.name)}
                                            onChange={(event) =>
                                                setSelected((current) => {
                                                    const next = new Set(current);
                                                    if (event.target.checked) next.add(item.name);
                                                    else next.delete(item.name);
                                                    return next;
                                                })
                                            }
                                        >
                                            {item.name}（{item.count}）
                                        </AdminCheckbox>
                                        {isAdultPoseSystem(item.name) ? <AdminStatusBadge label={translate("adminPages.poseLibrary.poseLibraryPage.adultOriented")} tone="warning" /> : null}
                                    </div>
                                ))}
                            </div>
                            {preview.systems.some((item) => isAdultPoseSystem(item.name) && selected.has(item.name)) ? (
                                <Callout tone="warning" className="mt-3">
                                    {translate("adminPages.poseLibrary.poseLibraryPage.adultCollectionsAreSelectedImportedPosesWillBeVisibleTo")}
                                </Callout>
                            ) : null}
                        </div>
                        <div>
                            <div className="mb-1 text-sm font-medium">{translate("adminPages.poseLibrary.poseLibraryPage.imageSourceURL")}</div>
                            <Input value={baseUrl} placeholder="https://example.com/ai-pose-gallery-zh/" onChange={(event) => setBaseUrl(event.target.value)} />
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">{translate("adminPages.poseLibrary.poseLibraryPage.theThumbsAndImgPathsInTheJSONAreAppended")}</p>
                        </div>
                    </>
                ) : null}
            </div>
        </AdminModal>
    );
}

type ItemFormValues = { name: string; system: string; category: string; angle: string; code: string };

function PoseLibraryItemModal({ open, item, systems, onClose, onSaved }: { open: boolean; item?: AdminPoseLibraryItem; systems: AdminPoseLibrarySystem[]; onClose: () => void; onSaved: () => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<ItemFormValues>();
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const systemOptions = Array.from(new Set(systems.map((entry) => entry.system))).map((value) => ({ value }));

    const save = async () => {
        const values = await form.validateFields();
        if (!item && !file) {
            message.warning(translate("adminPages.poseLibrary.poseLibraryPage.pleaseSelectAPoseImage"));
            return;
        }
        setSaving(true);
        try {
            if (item) await updatePoseLibraryItem(item.id, values);
            else if (file) await createPoseLibraryItem({ ...values, file });
            message.success(item ? translate("adminPages.poseLibrary.poseLibraryPage.poseUpdated") : translate("adminPages.poseLibrary.poseLibraryPage.poseAdded"));
            setFile(null);
            onSaved();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : translate("account.settings.memory.saveFailed"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminModal
            title={item ? translate("adminPages.poseLibrary.poseLibraryPage.editPose") : translate("adminPages.poseLibrary.poseLibraryPage.addPose")}
            open={open}
            okText={translate("common.save")}
            cancelText={translate("common.cancel")}
            confirmLoading={saving}
            onOk={() => void save()}
            onCancel={() => {
                if (saving) return;
                setFile(null);
                onClose();
            }}
            afterOpenChange={(visible) => {
                if (visible) form.setFieldsValue({ name: item?.name || "", system: item?.system || translate("adminPages.poseLibrary.poseLibraryPage.siteCreated"), category: item?.category || "", angle: item?.angle || translate("adminPages.poseLibrary.poseLibraryPage.front"), code: item?.code || "" });
            }}
        >
            <Form form={form} layout="vertical" requiredMark={false}>
                {item ? null : (
                    <Form.Item label={translate("adminPages.poseLibrary.poseLibraryPage.poseImage")} extra={translate("adminPages.poseLibrary.poseLibraryPage.jPEGPNGWebPUpTo20MBAFullBody")}>
                        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                        <Button icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()}>
                            {file ? file.name : translate("account.settings.profile.selectImage")}
                        </Button>
                    </Form.Item>
                )}
                <Form.Item name="name" label={translate("adminPages.poseLibrary.poseLibraryPage.name")} rules={[{ required: true, whitespace: true, message: translate("adminPages.poseLibrary.poseLibraryPage.pleaseEnterAName") }]}>
                    <Input maxLength={160} placeholder={translate("adminPages.poseLibrary.poseLibraryPage.forExampleNaturalStandingPose")} />
                </Form.Item>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Form.Item name="system" label={translate("adminPages.poseLibrary.poseLibraryPage.collection")} rules={[{ required: true, whitespace: true, message: translate("adminPages.poseLibrary.poseLibraryPage.pleaseEnterACollection") }]}>
                        <AutoComplete options={systemOptions} placeholder={translate("adminPages.poseLibrary.poseLibraryPage.forExampleSingleFullBodyStandard")} />
                    </Form.Item>
                    <Form.Item name="category" label={translate("library.picker.category")} rules={[{ required: true, whitespace: true, message: translate("adminPages.poseLibrary.poseLibraryPage.pleaseEnterACategory") }]}>
                        <Input maxLength={80} placeholder={translate("adminPages.poseLibrary.poseLibraryPage.forExampleStanding")} />
                    </Form.Item>
                    <Form.Item name="angle" label={translate("adminPages.poseLibrary.poseLibraryPage.view")}>
                        <Select options={POSE_LIBRARY_ANGLES.map((value) => ({ value, label: value }))} />
                    </Form.Item>
                    <Form.Item name="code" label={translate("adminPages.poseLibrary.poseLibraryPage.iD")} extra={item ? undefined : translate("adminPages.poseLibrary.poseLibraryPage.imagesWithTheSameIDAreMergedAsDifferentViews")}>
                        <Input maxLength={40} placeholder={translate("adminPages.poseLibrary.poseLibraryPage.optionalForExampleC001")} />
                    </Form.Item>
                </div>
            </Form>
        </AdminModal>
    );
}
