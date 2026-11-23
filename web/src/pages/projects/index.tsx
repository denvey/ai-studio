import { useDeferredValue, useEffect, useRef, useState, type DragEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Dropdown, Input } from "antd";
import { BookOpenText, ClipboardPaste, Clapperboard, ExternalLink, FileUp, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState, WorkspaceNoResultsState } from "@/components/layout/workspace-state";
import { deleteDrama, listDramas, type DramaListItem, type DramaStatus } from "@/services/api/drama";

import { formatCredits, MediaThumb, STATUS_LABEL } from "./drama-shared";
import { progressFillStyle } from "@/lib/progress-fill";
import { RelativeTime } from "@/components/ui/product/relative-time";
import "./drama.css";
import { translate } from "@/i18n";
import { dramaStyleDisplayName } from "./style-copy";

const PAGE_SIZES = [24, 48, 96];
const PIPELINE = [
    translate("drama.page.parseChapters"),
    translate("drama.page.buildCharactersPropsAndScenes"),
    translate("drama.page.episodeAdaptationAndSegmentPrompts"),
    translate("drama.page.generateVideoByStorySegment"),
    translate("drama.page.renderFinalCut"),
];
const STATUS_FILTERS: Array<{ value: DramaStatus | "all"; label: string }> = [
    { value: "all", label: translate("canvasA.toolPicker.all") },
    { value: "running", label: translate("drama.page.inProduction") },
    { value: "paused", label: translate("drama.page.paused") },
    { value: "completed", label: translate("library.tasks.filter.succeeded") },
    { value: "draft", label: translate("drama.page.notStarted") },
];
const ACCEPT = ".txt,.md,.markdown,text/plain,text/markdown";

export default function DramaListPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message, modal } = App.useApp();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<DramaStatus | "all">("all");
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const search = useDeferredValue(keyword.trim());
    useEffect(() => setPage(1), [search, status, pageSize]);

    const query = useQuery({
        queryKey: ["dramas", { page, pageSize, search, status }],
        queryFn: ({ signal }) => listDramas({ page, pageSize, q: search || undefined, status: status === "all" ? undefined : status }, signal),
        placeholderData: keepPreviousData,
        refetchInterval: (state) => (state.state.data?.items.some((item) => item.status === "running") ? 8_000 : false),
    });
    const remove = useMutation({
        mutationFn: deleteDrama,
        onSuccess: () => {
            message.success(translate("drama.page.productionDeleted"));
            void queryClient.invalidateQueries({ queryKey: ["dramas"] });
        },
        onError: (error) => message.error(error instanceof Error ? error.message : translate("library.picker.deleteFailed")),
    });
    const data = query.data;
    const counts = data?.statusCounts || {};
    const total = counts.all ?? 0;
    const filtered = Boolean(search || status !== "all");
    const openFile = (file: File) => navigate("/projects/new", { state: { file } });
    const confirmDelete = (item: DramaListItem) => {
        modal.confirm({
            title: translate("drama.page.delete", { v0: String(item.project.name) }),
            content: translate("drama.page.theNovelSourceScriptsStoryboardsAndFinalCutRecordsWill"),
            okText: translate("common.delete"),
            okButtonProps: { danger: true },
            cancelText: translate("common.cancel"),
            centered: true,
            onOk: () => remove.mutateAsync(item.project.id),
        });
    };
    // 整页都能拖入小说：列表页不再单独放一块上传区占位置。
    const dragProps = {
        onDragOver: (event: DragEvent) => {
            if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                setDragging(true);
            }
        },
        onDragLeave: (event: DragEvent) => {
            if (event.currentTarget === event.target) setDragging(false);
        },
        onDrop: (event: DragEvent) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) openFile(file);
        },
    };

    if (query.isLoading)
        return (
            <WorkspacePage className="studio-collection-page">
                <WorkspaceLoadingState label={translate("drama.page.loadingProductions")} />
            </WorkspacePage>
        );
    if (query.isError && !data)
        return (
            <WorkspacePage className="studio-collection-page">
                <WorkspaceErrorState description={translate("drama.page.theProductionListIsTemporarilyUnavailable")} onRetry={() => void query.refetch()} />
            </WorkspacePage>
        );

    const actions = (
        <div className="collection-header-actions">
            <Button icon={<ClipboardPaste />} onClick={() => navigate("/projects/new?paste=1")}>
                {translate("drama.page.pasteSourceText")}
            </Button>
            <Button type="primary" icon={<Plus />} onClick={() => fileRef.current?.click()}>
                {translate("drama.page.uploadNovel")}
            </Button>
        </div>
    );

    return (
        <WorkspacePage className="studio-collection-page drama-library">
            <div className="drama-root" {...dragProps}>
                <div className="studio-band">
                    <PageHeader
                        title={translate("drama.page.shortDramas")}
                        description={translate("drama.page.uploadANovelToAutomaticallyAdaptItPlanEpisodesBuild")}
                        meta={
                            <span className="app-projects-header-meta">
                                {total} {translate("drama.page.productions")}
                            </span>
                        }
                        actions={total ? actions : undefined}
                    />
                    {total ? (
                        <CollectionToolbar
                            label={translate("drama.page.shortDramaBrowsingTools")}
                            active={filtered}
                            onReset={() => {
                                setKeyword("");
                                setStatus("all");
                            }}
                        >
                            <Input
                                prefix={<Search />}
                                value={keyword}
                                allowClear
                                placeholder={translate("drama.page.searchProductionNames")}
                                aria-label={translate("drama.page.searchProductionNames")}
                                onChange={(event) => setKeyword(event.target.value)}
                            />
                            <div className="drama-library-status" role="radiogroup" aria-label={translate("drama.page.filterByStatus")}>
                                {STATUS_FILTERS.map((item) => {
                                    const count = item.value === "all" ? total : counts[item.value] || 0;
                                    if (item.value !== "all" && !count && status !== item.value) return null;
                                    return (
                                        <button key={item.value} type="button" role="radio" aria-checked={status === item.value} className={`drama-library-status-item is-${item.value}`} onClick={() => setStatus(item.value)}>
                                            {item.value !== "all" ? <span className="drama-dot" /> : null}
                                            {item.label}
                                            <b>{count}</b>
                                        </button>
                                    );
                                })}
                            </div>
                        </CollectionToolbar>
                    ) : null}
                </div>

                {!total ? (
                    <UploadHero onPick={() => fileRef.current?.click()} onPaste={() => navigate("/projects/new?paste=1")} />
                ) : data?.items.length ? (
                    <>
                        <div className={`drama-library-grid ${query.isPlaceholderData ? "is-stale" : ""}`}>
                            {data.items.map((item) => (
                                <DramaCard key={item.project.id} item={item} onDelete={() => confirmDelete(item)} />
                            ))}
                        </div>
                        <PaginationBar
                            current={page}
                            pageSize={pageSize}
                            total={data.total}
                            itemLabel={translate("drama.page.productions")}
                            pageSizeOptions={PAGE_SIZES}
                            onChange={(next, size) => {
                                setPage(next);
                                setPageSize(size);
                            }}
                        />
                    </>
                ) : (
                    <WorkspaceNoResultsState
                        icon="projects"
                        query={keyword}
                        description={translate("drama.page.tryAnotherProductionNameOrClearTheStatusFilter")}
                        onClear={() => {
                            setKeyword("");
                            setStatus("all");
                        }}
                    />
                )}

                {dragging ? (
                    <div className="drama-library-drop" aria-hidden>
                        <div>
                            <FileUp className="size-8" />
                            <strong>{translate("drama.page.dropToStartANewShortDrama")}</strong>
                            <span>{translate("drama.page.tXTMarkdownWithAutomaticEncodingAndChapterDetection")}</span>
                        </div>
                    </div>
                ) : null}
                <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) openFile(file);
                        event.target.value = "";
                    }}
                />
            </div>
        </WorkspacePage>
    );
}

/** 还没有作品时的上传引导；有作品后整页都可拖入，不再常驻占位。 */
function UploadHero({ onPick, onPaste }: { onPick: () => void; onPaste: () => void }) {
    return (
        <div className="drama-drop drama-library-hero">
            <span className="drama-drop-icon">
                <BookOpenText className="size-7" />
            </span>
            <h2>{translate("drama.page.dropANovelToStartMakingAShortDrama")}</h2>
            <p>{translate("drama.page.supportsTXTMarkdownUpTo6MillionCharactersChooseA")}</p>
            <div className="flex flex-wrap justify-center gap-2">
                <Button type="primary" size="large" icon={<FileUp className="size-4" />} onClick={onPick}>
                    {translate("drama.page.chooseNovelFile")}
                </Button>
                <Button size="large" icon={<ClipboardPaste className="size-4" />} onClick={onPaste}>
                    {translate("drama.page.pasteSourceText")}
                </Button>
            </div>
            <div className="drama-drop-steps">
                {PIPELINE.map((step, index) => (
                    <span key={step}>
                        <b>{index + 1}</b>
                        {step}
                    </span>
                ))}
            </div>
        </div>
    );
}

function DramaCover({ item }: { item: DramaListItem }) {
    const covers = (item.coverResourceIds?.length ? item.coverResourceIds : item.coverResourceId ? [item.coverResourceId] : []).slice(0, 4);
    if (!covers.length) {
        return (
            <div className="drama-library-cover is-empty">
                <span className="drama-library-glyph">{item.project.name.slice(0, 1)}</span>
                <Clapperboard className="drama-library-empty-icon" />
            </div>
        );
    }
    return (
        <div className={`drama-library-cover is-${covers.length}`}>
            {covers.map((id) => (
                <span key={id}>
                    <MediaThumb resourceId={id} alt="" />
                </span>
            ))}
        </div>
    );
}

function DramaCard({ item, onDelete }: { item: DramaListItem; onDelete: () => void }) {
    const progress = item.episodeCount ? Math.round((item.doneCount / item.episodeCount) * 100) : 0;
    const needsAction = item.status === "paused" && Boolean(item.pauseReason);
    // 保存了创建页表单的草稿回到创建页继续编辑，其余进入制作台。
    const href = item.hasDraftForm ? `/projects/new?draft=${encodeURIComponent(item.project.id)}` : `/projects/${item.project.id}`;
    const stage = item.episodeCount
        ? translate("drama.page.episodesRendered", { v0: String(item.doneCount), v1: String(item.episodeCount) })
        : item.status === "running"
          ? translate("drama.page.adaptingNovel")
          : item.status === "draft"
            ? translate("drama.page.notStarted2")
            : translate("drama.page.awaitingEpisodePlan");
    return (
        <article className={`drama-library-card is-${item.status}`}>
            <Link to={href} className="drama-library-open" aria-label={translate("drama.page.open", { v0: String(item.project.name) })}>
                <DramaCover item={item} />
                <span className={`drama-chip drama-library-badge is-${needsAction ? "paused" : item.status}`}>
                    <span className="drama-dot" />
                    {needsAction ? translate("drama.page.needsAttention") : STATUS_LABEL[item.status]}
                </span>
                <div className="drama-library-body">
                    <h3 title={item.project.name}>{item.project.name}</h3>
                    <div className="drama-library-meta">
                        {item.styleName ? <span>{dramaStyleDisplayName(item.styleName)}</span> : null}
                        <span>{item.aspectRatio}</span>
                        <RelativeTime value={item.updatedAt || item.project.updatedAt} />
                    </div>
                    <div className="drama-library-progress">
                        <span className="drama-library-progress-bar">
                            <span style={progressFillStyle(Math.max(progress, item.episodeCount && progress === 0 ? 2 : progress))} />
                        </span>
                        <span className="drama-library-progress-text">
                            <b>{stage}</b>
                            {item.spentMicrocredits ? (
                                <span>
                                    {formatCredits(item.spentMicrocredits)} {translate("shell.credits")}
                                </span>
                            ) : null}
                        </span>
                    </div>
                    {needsAction ? (
                        <p className="drama-library-alert" title={item.pauseReason}>
                            {item.pauseReason}
                        </p>
                    ) : null}
                </div>
            </Link>
            <div className="drama-library-menu">
                <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{
                        items: [
                            { key: "open", icon: <ExternalLink className="size-3.5" />, label: <Link to={href}>{item.hasDraftForm ? translate("drama.page.editDraft") : translate("drama.page.openStudio")}</Link> },
                            { type: "divider" },
                            { key: "delete", danger: true, icon: <Trash2 className="size-3.5" />, label: translate("drama.page.deleteProduction"), onClick: onDelete },
                        ],
                    }}
                >
                    <button type="button" className="product-icon-button" aria-label={translate("drama.page.moreActionsFor", { v0: String(item.project.name) })}>
                        <MoreHorizontal />
                    </button>
                </Dropdown>
            </div>
        </article>
    );
}
