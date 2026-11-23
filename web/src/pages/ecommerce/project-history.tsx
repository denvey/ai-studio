import { App, Modal } from "antd";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, FolderOpen, Images, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppModal } from "@/components/ui/product/app-modal";
import { deleteEcommerceProjects, listEcommerceProjectPage, projectDraft, projectPlan, type EcommerceProject } from "@/services/api/ecommerce";
import { parseBackendGenerationResult } from "@/services/api/generation-task";
import { resourceStorageKey, resolveResourceVariantUrl } from "@/services/api/resources";
import type { GenerationTask } from "@/services/api/task-center";

import { currentLocale, translate } from "@/i18n";
const statusLabels: Record<string, string> = {
    draft: translate("ecommerce.projectHistory.draft"),
    planning: translate("ecommerce.projectHistory.planning"),
    awaiting_confirmation: translate("ecommerce.projectHistory.awaitingConfirmation"),
    running: translate("canvasB.mediaVersion.generating"),
    queued: translate("canvasPage.taskStatus.queued"),
    partial_success: translate("ecommerce.projectHistory.partiallyComplete"),
    completed: translate("library.tasks.filter.succeeded"),
    failed: translate("canvasPage.batches.generationFailed"),
    cancelled: translate("ecommerce.projectHistory.cancelled"),
};

export function ecommerceHistoryCovers(project: EcommerceProject, tasks: Record<string, GenerationTask>): string[] {
    const generated = (projectPlan(project)?.images || []).flatMap((image) => {
        const task = image.taskId ? tasks[image.taskId] : undefined;
        if (task?.status !== "succeeded") return [];
        let output;
        try {
            output = parseBackendGenerationResult(task).images?.[0];
        } catch {
            /* A completed task may expose only its persisted preview. */
        }
        const src = output?.storageKey ? resolveResourceVariantUrl(output.storageKey, "thumbnail") : task.previewKind !== "video" ? task.previewUrl || output?.dataUrl : undefined;
        return src ? [src] : [];
    });
    const references = projectDraft(project).references;
    const product = Array.isArray(references) ? references.find((reference) => reference.role === "primary" && reference.resourceId) : undefined;
    return [...new Set([...generated, ...(product ? [resolveResourceVariantUrl(resourceStorageKey(product.resourceId), "thumbnail")] : [])])];
}

function ProjectCard({
    project,
    tasks,
    active,
    index,
    selecting,
    selected,
    disabled,
    onOpen,
    onSelect,
    onDelete,
}: {
    project: EcommerceProject;
    tasks: Record<string, GenerationTask>;
    active: boolean;
    index: number;
    selecting: boolean;
    selected: boolean;
    disabled: boolean;
    onOpen: (project: EcommerceProject) => void;
    onSelect: (id: string) => void;
    onDelete: (project: EcommerceProject) => void;
}) {
    const [failed, setFailed] = useState<string[]>([]);
    const candidates = useMemo(() => ecommerceHistoryCovers(project, tasks), [project, tasks]);
    const cover = candidates.find((candidate) => !failed.includes(candidate));
    const title = project.name?.trim() || projectDraft(project).productName?.trim() || translate("ecommerce.projectHistory.untitledProduct");
    const date = new Date(project.updatedAt);
    const updated = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(currentLocale(), { month: "2-digit", day: "2-digit" });
    return (
        <div className={`ecommerce-project-tile${selecting ? " is-selecting" : ""}`}>
            <button
                type="button"
                className="ecommerce-project-card"
                style={{ animationDelay: `${Math.min(index, 11) * 32}ms` }}
                aria-current={active ? "true" : undefined}
                aria-pressed={selecting ? selected : undefined}
                aria-label={
                    selecting
                        ? translate("ecommerce.projectHistory.project", { v0: String(selected ? translate("ecommerce.projectHistory.clearSelection") : translate("ecommerce.projectHistory.select")), v1: String(title) })
                        : translate("ecommerce.projectHistory.openProject", { v0: String(title) })
                }
                disabled={disabled}
                onClick={() => (selecting ? onSelect(project.id) : onOpen(project))}
            >
                <span className="ecommerce-project-cover">
                    {cover ? (
                        <img src={cover} alt={translate("ecommerce.projectHistory.projectCover", { v0: String(title) })} loading="lazy" decoding="async" onError={() => setFailed((values) => [...values, cover])} />
                    ) : (
                        <span className="ecommerce-project-cover-empty">
                            <Images size={27} strokeWidth={1.5} />
                            <span>{candidates.length ? translate("ecommerce.projectHistory.coverTemporarilyUnavailable") : translate("ecommerce.projectHistory.noProductImagesYet")}</span>
                        </span>
                    )}
                </span>
                <span className="ecommerce-project-card-body">
                    <span className="ecommerce-project-title" title={title}>
                        {title}
                    </span>
                    <span className="ecommerce-project-meta">
                        <span className={`ecommerce-project-status ecommerce-project-status-${project.status}`}>{statusLabels[project.status] || translate("ecommerce.projectHistory.saved")}</span>
                        {updated ? (
                            <time dateTime={project.updatedAt} title={date.toLocaleString(currentLocale())}>
                                {updated}
                            </time>
                        ) : null}
                    </span>
                </span>
                {selecting ? (
                    <span className="ecommerce-project-check" aria-hidden="true">
                        {selected ? <Check size={15} strokeWidth={2.6} /> : null}
                    </span>
                ) : (
                    <ArrowUpRight className="ecommerce-project-open-icon" size={17} aria-hidden="true" />
                )}
            </button>
            {!selecting ? (
                <button
                    type="button"
                    className="ecommerce-project-delete"
                    aria-label={translate("ecommerce.projectHistory.deleteProject", { v0: String(title) })}
                    title={translate("ecommerce.projectHistory.deleteProject2")}
                    disabled={disabled}
                    onClick={() => onDelete(project)}
                >
                    <Trash2 size={15} strokeWidth={1.8} />
                </button>
            ) : null}
        </div>
    );
}

type DeleteTarget = { kind: "one" | "selected" | "all"; ids: string[]; count: number; name?: string };

export function EcommerceProjectHistory({
    open,
    tasks,
    activeProjectId,
    deletionDisabled = false,
    onClose,
    onOpen,
    onDeleted,
}: {
    open: boolean;
    tasks: Record<string, GenerationTask>;
    activeProjectId?: string;
    deletionDisabled?: boolean;
    onClose: () => void;
    onOpen: (project: EcommerceProject) => void;
    onDeleted: (ids: string[], all: boolean) => void;
}) {
    const { message } = App.useApp();
    const [projects, setProjects] = useState<EcommerceProject[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
    const [deleting, setDeleting] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    useEffect(() => {
        if (!open) {
            setSelecting(false);
            setSelected(new Set());
            setDeleteTarget(null);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setError("");
        void listEcommerceProjectPage(page, pageSize)
            .then((result) => {
                if (cancelled) return;
                setProjects(result.projects || []);
                setTotal(result.total || 0);
                if (scrollRef.current) scrollRef.current.scrollTop = 0;
                if (result.total > 0 && page > Math.ceil(result.total / pageSize)) setPage(Math.ceil(result.total / pageSize));
            })
            .catch((cause) => {
                if (!cancelled) setError(cause instanceof Error ? cause.message : translate("ecommerce.projectHistory.failedToLoadProjectsRetry"));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, page, pageSize, retry]);

    const first = total ? (page - 1) * pageSize + 1 : 0;
    const last = Math.min(page * pageSize, total);
    const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => Math.max(1, Math.min(page - 2, pageCount - 4)) + index);
    const pageSelected = projects.length > 0 && projects.every((project) => selected.has(project.id));
    const toggleSelected = (id: string) =>
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const togglePage = () =>
        setSelected((current) => {
            const next = new Set(current);
            for (const project of projects) {
                if (pageSelected) next.delete(project.id);
                else next.add(project.id);
            }
            return next;
        });
    const confirmDelete = async () => {
        if (!deleteTarget || deleting) return;
        setDeleting(true);
        try {
            const all = deleteTarget.kind === "all";
            const result = await deleteEcommerceProjects({ ...(all ? { all: true } : { ids: deleteTarget.ids }), expectedTotal: deleteTarget.count });
            onDeleted(deleteTarget.ids, all);
            setDeleteTarget(null);
            setSelected(new Set());
            setSelecting(false);
            setRetry((value) => value + 1);
            message.success(translate("ecommerce.projectHistory.deletedProjects", { v0: String(result.deleted) }));
        } catch (cause) {
            setDeleteTarget(null);
            setRetry((value) => value + 1);
            message.error(cause instanceof Error ? cause.message : translate("ecommerce.projectHistory.deleteFailedRefreshAndRetry"));
        } finally {
            setDeleting(false);
        }
    };
    return (
        <AppModal
            flush
            open={open}
            onCancel={() => {
                if (!deleting) onClose();
            }}
            footer={null}
            title={null}
            closable={false}
            centered
            width="min(1120px, calc(100vw - 32px))"
            rootClassName="ecommerce-history-root"
            className="ecommerce-history-modal"
            transitionName="ecommerce-history-motion"
            maskTransitionName="ecommerce-history-mask"
            aria-label={translate("ecommerce.projectHistory.projectHistory")}
        >
            <section className="ecommerce-history" aria-label={translate("ecommerce.projectHistory.myEcommerceProjects")}>
                <header className="ecommerce-history-heading">
                    <div className="ecommerce-history-emblem">
                        <FolderOpen size={23} strokeWidth={1.55} />
                    </div>
                    <div className="ecommerce-history-heading-copy">
                        <span>COMMERCE / PROJECT LIBRARY</span>
                        <h2>{translate("ecommerce.projectHistory.myEcommerceProjects")}</h2>
                        <p>{translate("ecommerce.projectHistory.chooseAProjectToContinueYourPreviousWork")}</p>
                    </div>
                    <button type="button" className="ecommerce-history-close" aria-label={translate("ecommerce.projectHistory.closeProjectHistory")} disabled={deleting} onClick={onClose}>
                        <X size={19} />
                    </button>
                </header>
                <div className="ecommerce-history-controls">
                    <div className="ecommerce-history-actions">
                        <span className="ecommerce-history-count">
                            <strong>{total}</strong> {translate("ecommerce.projectHistory.projects")}
                        </span>
                        {total > 0 ? (
                            <button
                                type="button"
                                className={`ecommerce-history-action${selecting ? " is-active" : ""}`}
                                disabled={loading || deleting || deletionDisabled}
                                onClick={() => {
                                    setSelecting((value) => !value);
                                    setSelected(new Set());
                                }}
                            >
                                {selecting ? translate("ecommerce.projectHistory.finishManaging") : translate("ecommerce.projectHistory.manageSelection")}
                            </button>
                        ) : null}
                        {selecting ? (
                            <>
                                <span className="ecommerce-history-selected">
                                    {translate("ecommerce.projectHistory.selected")} {selected.size}
                                </span>
                                <button type="button" className="ecommerce-history-action" disabled={loading || deleting || !projects.length} onClick={togglePage}>
                                    {pageSelected ? translate("ecommerce.projectHistory.deselectThisPage") : translate("ecommerce.projectHistory.selectThisPage")}
                                </button>
                                <button type="button" className="ecommerce-history-action ecommerce-history-danger" disabled={deleting || !selected.size} onClick={() => setDeleteTarget({ kind: "selected", ids: [...selected], count: selected.size })}>
                                    {translate("ecommerce.projectHistory.deleteSelected")}
                                </button>
                            </>
                        ) : null}
                    </div>
                    <div className="ecommerce-history-actions">
                        <label className="ecommerce-history-page-size">
                            {translate("ecommerce.projectHistory.itemsPerPage")}{" "}
                            <select
                                aria-label={translate("ecommerce.projectHistory.projectsPerPage")}
                                value={pageSize}
                                disabled={loading || deleting}
                                onChange={(event) => {
                                    setPageSize(Number(event.target.value) as 20 | 50 | 100);
                                    setPage(1);
                                }}
                            >
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>{" "}
                            {translate("ecommerce.projectHistory.items")}
                        </label>
                        {total > 0 ? (
                            <button type="button" className="ecommerce-history-action ecommerce-history-danger" disabled={loading || deleting || deletionDisabled} onClick={() => setDeleteTarget({ kind: "all", ids: [], count: total })}>
                                {translate("ecommerce.projectHistory.deleteAll")}
                            </button>
                        ) : null}
                    </div>
                </div>
                <div ref={scrollRef} className="ecommerce-history-scroll" data-canvas-wheel-scroll>
                    {loading ? (
                        <div className="ecommerce-history-message" role="status">
                            <span className="ecommerce-history-loader" />
                            {translate("ecommerce.projectHistory.organizingProjectRecords")}
                        </div>
                    ) : error ? (
                        <div className="ecommerce-history-message" role="alert">
                            <strong>{translate("ecommerce.projectHistory.failedToLoadProjects")}</strong>
                            <span>{error}</span>
                            <button type="button" onClick={() => setRetry((value) => value + 1)}>
                                {translate("account.layout.state.reload")}
                            </button>
                        </div>
                    ) : projects.length ? (
                        <div className="ecommerce-history-list">
                            {projects.map((project, index) => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    tasks={tasks}
                                    active={project.id === activeProjectId}
                                    index={index}
                                    selecting={selecting}
                                    selected={selected.has(project.id)}
                                    disabled={deleting || deletionDisabled}
                                    onOpen={onOpen}
                                    onSelect={toggleSelected}
                                    onDelete={(item) => setDeleteTarget({ kind: "one", ids: [item.id], count: 1, name: item.name?.trim() || translate("ecommerce.projectHistory.untitledProduct") })}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="ecommerce-history-message">
                            <FolderOpen size={32} strokeWidth={1.3} />
                            <strong>{translate("ecommerce.projectHistory.noPreviousProjectsYet")}</strong>
                            <span>{translate("ecommerce.projectHistory.projectsWillAppearHereAfterYouSaveProductDetailsOr")}</span>
                        </div>
                    )}
                </div>
                <footer className="ecommerce-history-footer">
                    <span>
                        {translate("ecommerce.projectHistory.show")} {first}–{last} / {total}
                        {selecting && selected.size ? translate("ecommerce.projectHistory.selectedAcrossPages", { v0: String(selected.size) }) : ""}
                    </span>
                    <nav className="ecommerce-history-pagination" aria-label={translate("ecommerce.projectHistory.projectPagination")}>
                        <button type="button" aria-label={translate("account.layout.pagination.prev")} disabled={page <= 1 || loading || deleting} onClick={() => setPage((value) => value - 1)}>
                            <ChevronLeft size={17} />
                        </button>
                        {pages.map((number) => (
                            <button
                                key={number}
                                type="button"
                                aria-label={translate("ecommerce.projectHistory.page", { v0: String(number) })}
                                aria-current={page === number ? "page" : undefined}
                                disabled={loading || deleting}
                                onClick={() => setPage(number)}
                            >
                                {number}
                            </button>
                        ))}
                        <button type="button" aria-label={translate("account.layout.pagination.next")} disabled={page >= pageCount || loading || deleting} onClick={() => setPage((value) => value + 1)}>
                            <ChevronRight size={17} />
                        </button>
                    </nav>
                </footer>
            </section>
            <Modal
                className="ecommerce-delete-confirm"
                open={Boolean(deleteTarget)}
                title={
                    deleteTarget?.kind === "all"
                        ? translate("ecommerce.projectHistory.deleteAllEcommerceProjects")
                        : deleteTarget?.kind === "one"
                          ? translate("ecommerce.projectHistory.deleteThisProject")
                          : translate("ecommerce.projectHistory.deleteSelectedProjects", { v0: String(deleteTarget?.count || 0) })
                }
                centered
                okText={deleting ? translate("ecommerce.projectHistory.deleting") : translate("account.ui.delete.confirm")}
                okButtonProps={{ danger: true, loading: deleting }}
                cancelText={translate("common.cancel")}
                cancelButtonProps={{ disabled: deleting }}
                closable={!deleting}
                mask={{ closable: !deleting }}
                keyboard={!deleting}
                onOk={() => void confirmDelete()}
                onCancel={() => {
                    if (!deleting) setDeleteTarget(null);
                }}
            >
                <p>
                    {deleteTarget?.kind === "all"
                        ? translate("ecommerce.projectHistory.allEcommerceProjectsInYourAccountWillBeDeletedIncluding", { v0: String(deleteTarget.count) })
                        : deleteTarget?.kind === "one"
                          ? translate("ecommerce.projectHistory.willBeDeleted", { v0: String(deleteTarget.name) })
                          : translate("ecommerce.projectHistory.theEcommerceProjectsSelectedAcrossPagesWillBeDeleted", { v0: String(deleteTarget?.count || 0) })}
                </p>
                <p>{translate("ecommerce.projectHistory.deletedProjectsCannotBeRestoredGeneratedImagesRemainInThe")}</p>
            </Modal>
        </AppModal>
    );
}
