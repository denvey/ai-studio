import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { App, Button, Dropdown } from "antd";
import { ArrowLeft, Brush, CheckCheck, Clapperboard, FileDown, FileUp, Film, Inbox, Package, Pause, Pencil, Play, ScrollText, Settings2, UsersRound } from "lucide-react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { WorkspaceErrorState, WorkspaceLoadingState } from "@/components/layout/workspace-state";
import {
    approveDramaEpisode,
    deleteDramaShot,
    generateDramaSegments,
    insertDramaShot,
    pauseDrama,
    reprocessDramaSegmentVideo,
    regenerateDramaCast,
    releaseDramaMedia,
    renameDramaEpisode,
    rescriptDramaEpisode,
    retryFailedDrama,
    startDrama,
    updateDramaSegment,
    updateDramaSegmentReferences,
    writeDramaSegmentPrompts,
    updateDramaShot,
    type DramaEpisodeRow,
    type DramaInboxItem,
    type DramaJob,
    type DramaModelChoice,
    type DramaSegment,
    type DramaShot,
    type DramaShotPatch,
} from "@/services/api/drama";

import { formatCount, formatDuration, sourceFormatOf, StagePips, STAGE_LABEL, STATUS_LABEL } from "./drama-shared";
import { CastPanel, InboxPanel, SettingsPanel } from "./studio/panels";
import { EpisodeDeleteModal } from "./studio/episode-delete-modal";
import { EpisodeRail } from "./studio/episode-rail";
import { AddEpisodeModal, type EpisodePlacement } from "./studio/episode-source";
import { AssetImportModal, AssetPackageModal } from "./studio/asset-transfer";
import { ChapterPickerModal } from "./studio/chapter-picker";
import { FinalView } from "./studio/final-view";
import { StudioGenesis } from "./studio/genesis";
import { SegmentDialog } from "./studio/segment-dialog";
import { QueueBar } from "./studio/queue-bar";
import { ScriptView } from "./studio/script-view";
import { Storyboard, type EpisodeEmpty } from "./studio/storyboard";
import { isTypingTarget, useDramaCast, useDramaEpisode, useDramaInvalidate, useDramaSummary, useOpenDramaCanvas } from "./studio/use-studio";
import { progressFillStyle } from "@/lib/progress-fill";
import "./drama.css";
import { translate } from "@/i18n";

type Tab = "board" | "script" | "final";
type StudioView = "production" | "cast" | "inbox" | "settings";

// 提示条在单行里会截断说明，正文同时放进悬停提示。
const AWAITING_MEDIA_BANNER = {
    title: translate("drama.detail.theScriptAndVideoPromptsAreReadyNoVideosHave"),
    text: translate("drama.detail.reviewTheStoryShotBreakdownDesignsAndSegmentVideoPrompts"),
};

export default function DramaStudioPage() {
    const { projectId = "", episodeId: routeEpisodeId = "" } = useParams();
    const navigate = useNavigate();
    const { message, modal } = App.useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = (["board", "script", "final"].includes(searchParams.get("tab") || "") ? searchParams.get("tab") : "board") as Tab;
    const shotParam = searchParams.get("shot") || "";
    const view = (["cast", "inbox", "settings"].includes(searchParams.get("view") || "") ? searchParams.get("view") : "production") as StudioView;
    const castFocus = searchParams.get("cast") || "";
    const [renaming, setRenaming] = useState(false);
    const [adding, setAdding] = useState(false);
    // 有值时“添加一集”弹窗插到这一集前后，否则追加到末尾。
    const [placement, setPlacement] = useState<EpisodePlacement>();
    const [deleting, setDeleting] = useState<DramaEpisodeRow | null>(null);
    const [pickingChapters, setPickingChapters] = useState(false);
    const [assetDialog, setAssetDialog] = useState<"export" | "import" | null>(null);
    // 窄屏只显示一栏：集列表与制作区用分段切换（宽屏两栏并排，不受影响）。
    const [mobilePane, setMobilePane] = useState<"episodes" | "production">("production");
    const invalidate = useDramaInvalidate(projectId);

    const summaryQuery = useDramaSummary(projectId);
    const summary = summaryQuery.data;
    const canvas = useOpenDramaCanvas(summary);
    const episodes = summary?.episodes || [];
    const episodeId = episodes.some((episode) => episode.id === routeEpisodeId) ? routeEpisodeId : (episodes.find((episode) => episode.stage === "review") || episodes.find((episode) => episode.stage !== "done") || episodes[0])?.id || "";
    const episodeRow = episodes.find((episode) => episode.id === episodeId);
    const awaitingCount = episodes.filter((episode) => episode.awaitingMedia).length;
    const running = summary?.production.status === "running";
    const episodeQuery = useDramaEpisode(projectId, episodeId, Boolean(running || (summary?.jobCounts.running || 0) > 0));
    const detail = episodeQuery.data?.episode.id === episodeId ? episodeQuery.data : undefined;
    const { cast, byId: castById } = useDramaCast(projectId, Boolean(running));
    const shots = useMemo(() => detail?.shots || [], [detail]);
    const currentShot = shots.find((shot) => shot.id === shotParam);

    const setParams = useCallback(
        (patch: Record<string, string | null>) => {
            const next = new URLSearchParams(searchParams);
            for (const [key, value] of Object.entries(patch)) {
                if (value) next.set(key, value);
                else next.delete(key);
            }
            setSearchParams(next, { replace: true });
        },
        [searchParams, setSearchParams],
    );
    const selectEpisode = useCallback(
        (id: string) => {
            navigate({ pathname: `/projects/${projectId}/e/${id}`, search: tab === "board" ? "" : `?tab=${tab}` });
        },
        [navigate, projectId, tab],
    );
    const segmentParam = searchParams.get("segment");
    const openSegmentIndex = segmentParam !== null && /^\d+$/.test(segmentParam) ? Number(segmentParam) : undefined;
    // 剧情段弹窗的打开状态放在地址里，刷新或从待处理跳转都能直接回到同一段、同一镜头。
    const openSegment = useCallback((index: number | null, shotId?: string) => setParams({ segment: index === null ? null : String(index), shot: index === null ? null : shotId || null }), [setParams]);
    const openView = useCallback((next: StudioView, extra: Record<string, string | null> = {}) => setParams({ view: next === "production" ? null : next, cast: null, ...extra }), [setParams]);

    // [ / ] 切换上一集 / 下一集。
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key !== "[" && event.key !== "]") return;
            const index = episodes.findIndex((episode) => episode.id === episodeId);
            const next = episodes[index + (event.key === "]" ? 1 : -1)];
            if (next) selectEpisode(next.id);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [episodeId, episodes, selectEpisode]);

    const errorMessage = (error: unknown, fallback: string) => message.error(error instanceof Error ? error.message : fallback);
    const toggleRun = useMutation({
        mutationFn: () => (running ? pauseDrama(projectId) : startDrama(projectId)),
        onSuccess: () => {
            invalidate(episodeId);
            message.success(running ? translate("drama.detail.pausedRunningTasksWillFinishBeforeStopping") : translate("drama.detail.productionResumed"));
        },
        onError: (error) => errorMessage(error, translate("library.tasks.page.actionFailed")),
    });
    const patchShot = useMutation({
        mutationFn: ({ shot, patch }: { shot: DramaShot; patch: DramaShotPatch }) => updateDramaShot(projectId, shot.id, patch),
        onSuccess: () => {
            invalidate(episodeId);
            message.success(translate("drama.detail.savedThisSegmentSPromptAndVideoAreNowOutdated"));
        },
        onError: (error) => errorMessage(error, translate("account.settings.memory.saveFailed")),
    });
    const insertShot = useMutation({
        mutationFn: ({ shot, position }: { shot: DramaShot; position: "before" | "after" }) => insertDramaShot(projectId, shot.id, position),
        onSuccess: ({ shot }) => {
            invalidate(episodeId);
            setParams({ shot: shot.id });
            message.success(translate("drama.detail.emptyShotInsertedAfterAddingActionOrDialogueRewriteThis"));
        },
        onError: (error) => errorMessage(error, translate("drama.detail.insertionFailed")),
    });
    const removeShot = useMutation({
        mutationFn: (shot: DramaShot) => deleteDramaShot(projectId, shot.id),
        onSuccess: () => {
            invalidate(episodeId);
            setParams({ shot: null });
            message.success(translate("drama.detail.shotDeletedThisSegmentSPromptAndVideoAreNow"));
        },
        onError: (error) => errorMessage(error, translate("library.picker.deleteFailed")),
    });
    const saveSegment = useMutation({
        mutationFn: ({ segment, override }: { segment: DramaSegment; override: string }) => updateDramaSegment(projectId, episodeId, segment.index, override),
        onSuccess: (_, { override }) => {
            invalidate(episodeId);
            message.success(override ? translate("drama.detail.fullVideoPromptSaved") : translate("drama.detail.modelWrittenVersionRestored"));
        },
        onError: (error) => errorMessage(error, translate("account.settings.memory.saveFailed")),
    });
    const saveReferences = useMutation({
        mutationFn: ({ segment, patch }: { segment: DramaSegment; patch: Parameters<typeof updateDramaSegmentReferences>[3] }) => updateDramaSegmentReferences(projectId, episodeId, segment.index, patch),
        onSuccess: async () => {
            // 二级菜单支持连续添加；等服务端选择刷新后再允许下一次修改。
            await invalidate(episodeId);
            message.success(translate("drama.detail.segmentReferencesAndVoicesSavedCheckTheReferenceNumbersIn"));
        },
        onError: (error) => errorMessage(error, translate("account.settings.memory.saveFailed")),
    });
    const writeSegment = useMutation({
        mutationFn: (indexes: number[]) => writeDramaSegmentPrompts(projectId, episodeId, indexes),
        onSuccess: (result) => {
            invalidate(episodeId);
            message.success(translate("drama.detail.startedWritingVideoPromptsForSegments", { v0: String(result.queued) }));
        },
        onError: (error) => errorMessage(error, translate("library.tasks.page.actionFailed")),
    });
    const approve = useMutation({
        mutationFn: () => approveDramaEpisode(projectId, episodeId),
        onSuccess: () => {
            invalidate(episodeId);
            message.success(episodeRow?.number === 1 && summary?.production.settings.reviewMode === "sample" ? translate("drama.detail.pilotApprovedAutomaticProductionStartedForAllEpisodes") : translate("drama.detail.approvedVideoGenerationStarted"));
        },
        onError: (error) => errorMessage(error, translate("library.tasks.page.actionFailed")),
    });
    const generateSegments = useMutation({
        mutationFn: ({ segments, videoModel }: { segments: number[]; videoModel?: DramaModelChoice }) => generateDramaSegments(projectId, episodeId, segments, videoModel),
        onSuccess: (result, { segments }) => {
            invalidate(episodeId);
            const label = segments.length > 1 ? translate("drama.detail.segments", { v0: String(segments.length) }) : translate("drama.detail.segment", { v0: String(segments[0] + 1) });
            message.success(translate("drama.detail.addedToTheQueueSegmentVideos", { v0: String(label), v1: String(result.queued) }));
        },
        onError: (error) => errorMessage(error, translate("canvasPage.batches.generationFailed")),
    });
    const reprocessSegment = useMutation({
        mutationFn: (segmentIndex: number) => reprocessDramaSegmentVideo(projectId, episodeId, segmentIndex),
        onSuccess: (_, segmentIndex) => {
            invalidate(episodeId);
            message.success(translate("drama.detail.reprocessingVideoForSegment", { v0: String(segmentIndex + 1) }));
        },
        onError: (error) => {
            invalidate(episodeId);
            errorMessage(error, translate("drama.detail.reprocessingFailed"));
        },
    });
    const rescript = useMutation({
        mutationFn: () => rescriptDramaEpisode(projectId, episodeId),
        onSuccess: () => {
            invalidate(episodeId);
            setParams({ shot: null, segment: null });
            message.success(running ? translate("drama.detail.adaptingThisEpisodeAgain") : translate("drama.detail.productionResumedAdaptingThisEpisodeAgain"));
        },
        // 剧本已重置但恢复制作被拒（如预算或模型不可用）时，也要刷新到真实状态。
        onError: (error) => {
            invalidate(episodeId);
            errorMessage(error, translate("library.tasks.page.actionFailed"));
        },
    });
    const retry = useMutation({
        mutationFn: () => retryFailedDrama(projectId),
        onSuccess: (result) => {
            invalidate(episodeId);
            message.success(translate("drama.detail.itemsRequeued", { v0: String(result.segments + result.casts) }));
        },
        onError: (error) => errorMessage(error, translate("drama.detail.retryFailed")),
    });
    // 收件箱按组重试：设定重做参考图（不连带剧情段），剧情段失败统一重新排队。
    const [retryingGroup, setRetryingGroup] = useState("");
    const retryGroup = useMutation({
        mutationFn: async ({ items }: { key: string; items: DramaInboxItem[] }) => {
            const castIds = items.filter((item) => item.kind === "cast_failed" && item.castId).map((item) => item.castId!);
            await Promise.all(castIds.map((id) => regenerateDramaCast(projectId, id, false)));
            if (items.some((item) => item.kind === "segment_failed")) await retryFailedDrama(projectId);
            return items.length;
        },
        onMutate: ({ key }) => setRetryingGroup(key),
        onSettled: () => setRetryingGroup(""),
        onSuccess: (count) => {
            invalidate(episodeId);
            message.success(translate("drama.detail.itemsRequeued", { v0: String(count) }));
        },
        onError: (error) => errorMessage(error, translate("drama.detail.retryFailed")),
    });
    // 手动模式：先看剧本、设定与段提示词，确认后再逐集或全部开始生成参考图与段视频。
    const release = useMutation({
        mutationFn: ({ target, episodeIds }: { target: "assets" | "episodes" | "all"; episodeIds?: string[] }) => releaseDramaMedia(projectId, target, episodeIds),
        onSuccess: (_, { target }) => {
            invalidate(episodeId);
            message.success(target === "assets" ? translate("drama.detail.startedGeneratingCharacterPropAndSceneReferences") : target === "all" ? translate("drama.detail.startedGeneratingReferencesAndSegmentVideosForAllEpisodes") : translate("drama.detail.startedGeneratingReferencesAndSegmentVideosForThisEpisode"));
        },
        onError: (error) => errorMessage(error, translate("library.tasks.page.actionFailed")),
    });
    const confirmReleaseAll = () =>
        modal.confirm({
            title: translate("drama.detail.startGeneratingVideosForEpisodes", { v0: String(awaitingCount) }),
            content: translate("drama.detail.generateCharacterPropAndSceneReferencesThenSegmentVideosWith"),
            okText: translate("drama.detail.startAll"),
            cancelText: translate("drama.detail.reviewFirst"),
            centered: true,
            onOk: () => release.mutateAsync({ target: "all" }),
        });
    const rename = useMutation({
        mutationFn: (title: string) => renameDramaEpisode(projectId, episodeId, title),
        onSuccess: () => {
            invalidate(episodeId);
            setRenaming(false);
        },
        onError: (error) => errorMessage(error, translate("canvasB.common.renameFailed")),
    });
    const busy = approve.isPending || rescript.isPending || generateSegments.isPending || release.isPending || insertShot.isPending || removeShot.isPending || saveReferences.isPending;

    const openInbox = (item: DramaInboxItem) => {
        if (item.castId) {
            openView("cast", { cast: item.castId });
            return;
        }
        if (item.kind === "paused") {
            openView("settings");
            return;
        }
        if (item.episodeId) navigate({ pathname: `/projects/${projectId}/e/${item.episodeId}`, search: item.kind === "segment_failed" ? `?segment=${item.segmentIndex}` : "" });
    };
    const jumpToJob = (job: DramaJob) => {
        if (job.episodeId) navigate({ pathname: `/projects/${projectId}/e/${job.episodeId}`, search: "" });
    };

    // 直接打开草稿的制作台地址时回到创建页，草稿参数都在那里编辑。
    if (summary?.production.hasDraftForm) return <Navigate to={`/projects/new?draft=${encodeURIComponent(summary.project.id)}`} replace />;
    if (summaryQuery.isLoading)
        return (
            <WorkspacePage>
                <WorkspaceLoadingState label={translate("drama.detail.openingProductionStudio")} />
            </WorkspacePage>
        );
    if (summaryQuery.isError || !summary)
        return (
            <WorkspacePage>
                <WorkspaceErrorState title={translate("drama.detail.productionUnavailable")} description={translate("drama.detail.theProductionDoesNotExistHasBeenDeletedOrIs")} actionLabel={translate("drama.detail.backToProductions")} onRetry={() => navigate("/projects")} />
            </WorkspacePage>
        );

    const { production } = summary;
    const runLabel = running ? translate("canvasA.outbox.pause") : production.status === "draft" ? translate("drama.detail.startProduction") : translate("drama.detail.resumeProduction");
    const doneEpisodes = episodes.filter((episode) => episode.stage === "done" && !episode.finalStale).length;
    const progress = episodes.length ? doneEpisodes / episodes.length : 0;
    const aspectRatio = production.settings.aspectRatio;
    const sampleReview = production.settings.reviewMode === "sample" && !production.sampleApproved && detail?.episode.number === 1 && detail.episode.stage === "done" && !detail.episode.finalStale;
    const reviewing = sampleReview || (production.settings.reviewMode === "every" && detail?.episode.stage === "review");
    const reviewBanner = sampleReview
        ? { title: translate("drama.detail.theEpisode1PilotIsReadyReviewItsVisualStyle"), text: translate("drama.detail.reviewThePilotOnTheFinalCutTabApproveIt") }
        : { title: translate("drama.detail.thisEpisodeSVideoPromptsAreReadyForYourApproval"), text: translate("drama.detail.reviewEachSegmentSPromptAndReferencesEditShotScripts") };
    // 手动模式下流水线可能在“运行”却无事可做：明确告诉用户在等他放行。
    const waitingForMedia = awaitingCount > 0 && !(summary.jobCounts.running || summary.jobCounts.queued) && production.status === "running";
    // 本集还没有镜头时按真实状态说明：失败、暂停、未开始、排队都不能显示成“正在编写”。
    const episodeEmpty: EpisodeEmpty = detail?.episode.error
        ? {
              title: translate("drama.detail.failedToWriteThisEpisodeSScript"),
              text: translate("drama.detail.seeTheErrorAboveAdaptThisEpisodeAgainOrRetry"),
              active: false,
              action: (
                  <Button type="primary" loading={rescript.isPending} onClick={() => rescript.mutate()}>
                      {translate("drama.detail.readaptThisEpisode")}
                  </Button>
              ),
          }
        : production.status === "paused"
          ? {
                title: translate("drama.detail.productionIsPausedScriptWritingHasNotStartedForThis"),
                text: translate("drama.detail.resumingProductionImmediatelyStartsWritingThisEpisodeSScriptAnd"),
                active: false,
                action: (
                    <Button type="primary" icon={<Play className="size-4" />} loading={toggleRun.isPending} onClick={() => toggleRun.mutate()}>
                        {translate("drama.detail.resumeProduction")}
                    </Button>
                ),
            }
          : production.status === "draft"
            ? { title: translate("drama.detail.productionHasNotStarted"), text: translate("drama.detail.selectStartProductionInTheUpperRightToWriteScripts"), active: false }
            : detail?.episode.stage === "queued"
              ? { title: translate("drama.detail.queuedForAdaptation"), text: translate("drama.detail.onlyAFewEpisodesAreAdaptedAtATimeThis"), active: false }
              : { title: translate("drama.detail.writingScriptAndStoryboard"), text: translate("drama.detail.theScriptIsSplitIntoStorySegmentsEachGeneratingA"), active: true };
    const sampleWaiting = production.settings.reviewMode === "sample" && !production.sampleApproved && episodeRow && episodeRow.number !== 1 && ["prompts", "review", "video"].includes(episodeRow.stage);

    return (
        <WorkspacePage className="!overflow-hidden" fluid scroll={false}>
            <div className="drama-root drama-studio">
                <header className="drama-topbar">
                    <Link to="/projects">
                        <Button type="text" shape="circle" icon={<ArrowLeft className="size-4" />} aria-label={translate("drama.detail.backToProductions")} />
                    </Link>
                    <div className="drama-topbar-title">
                        <h1 title={summary.project.name}>{summary.project.name}</h1>
                        {waitingForMedia ? (
                            <span className="drama-chip is-ready">
                                <span className="drama-dot" />
                                {translate("drama.detail.scriptReadyAwaitingVideoGeneration")}
                            </span>
                        ) : (
                            <span className={`drama-chip is-${production.status}`}>
                                <span className="drama-dot" />
                                {STATUS_LABEL[production.status]}
                            </span>
                        )}
                    </div>
                    {episodes.length ? (
                        <div className="drama-topbar-progress">
                            <span className="drama-meter" aria-label={translate("drama.detail.finalCutProgress", { v0: String(Math.round(progress * 100)) })}>
                                <span style={progressFillStyle(Math.max(progress * 100, 2))} />
                            </span>
                            <span>
                                {doneEpisodes}/{episodes.length} {translate("drama.detail.completedEpisodes")}{production.planDone ? "" : (" " + translate("drama.detail.planningEpisodes"))}
                            </span>
                            <span>· {formatCount(production.chapterCount)} {translate("drama.detail.sourceChapters")}</span>
                        </div>
                    ) : null}
                    <nav className="drama-nav" aria-label={translate("drama.detail.studioView")}>
                        <button type="button" className="drama-nav-item" aria-current={view === "production" ? "page" : undefined} onClick={() => openView("production")}>
                            <Clapperboard className="size-4" />
                            {translate("drama.detail.production")}
                        </button>
                        <button type="button" className="drama-nav-item" aria-current={view === "cast" ? "page" : undefined} onClick={() => openView("cast")}>
                            <UsersRound className="size-4" />
                            {translate("drama.detail.designs")}{summary.castCount ? <span className="drama-nav-count">{summary.castCount}</span> : null}
                        </button>
                        <button type="button" className="drama-nav-item" aria-current={view === "inbox" ? "page" : undefined} onClick={() => openView("inbox")}>
                            <Inbox className="size-4" />
                            {translate("account.feedback.status.pending")}{summary.inbox.length ? <span className="drama-nav-count is-alert">{summary.inbox.length > 99 ? "99+" : summary.inbox.length}</span> : null}
                        </button>
                        <button type="button" className="drama-nav-item" aria-current={view === "settings" ? "page" : undefined} onClick={() => openView("settings")}>
                            <Settings2 className="size-4" />
                            {translate("nav.tools.settings")}
                        </button>
                    </nav>
                    {/* 窄屏只保留图标（全部生成保留集数），文字由 aria-label 与 title 提供。 */}
                    <div className="drama-topbar-actions">
                        <Dropdown
                            trigger={["click"]}
                            placement="bottomRight"
                            menu={{
                                items: [
                                    { key: "export", icon: <FileDown className="size-3.5" />, label: translate("drama.detail.exportAllAssetsInOnePackage"), onClick: () => setAssetDialog("export") },
                                    { key: "import", icon: <FileUp className="size-3.5" />, label: translate("drama.detail.importAssetPackage"), onClick: () => setAssetDialog("import") },
                                ],
                            }}
                        >
                            <Button icon={<Package className="size-4" />} aria-label={translate("drama.detail.assetPackage")} title={translate("drama.detail.exportDesignsVideosAndPromptsAsAPackageOrApply")}>
                                <span className="drama-topbar-action-label">{translate("drama.detail.assetPackage")}</span>
                            </Button>
                        </Dropdown>
                        <Button icon={<Brush className="size-4" />} loading={canvas.opening === "canvas"} onClick={() => void canvas.open()} aria-label={translate("drama.detail.refinementCanvas")} title={translate("drama.detail.openThisDramaSRefinementCanvasSendDesignsSegmentsOr")}>
                            <span className="drama-topbar-action-label">{translate("drama.detail.refinementCanvas")}</span>
                        </Button>
                        {awaitingCount ? (
                            <Button
                                icon={<Play className="size-4" />}
                                loading={release.isPending && release.variables?.target === "all"}
                                onClick={confirmReleaseAll}
                                aria-label={translate("drama.detail.generateAllVideosEpisodes", { v0: String(awaitingCount) })}
                                title={translate("drama.detail.generateAllVideosEpisodes", { v0: String(awaitingCount) })}
                            >
                                <span className="drama-topbar-action-label">{translate("drama.detail.generateAllVideos")} </span>
                                {awaitingCount} {translate("drama.detail.episodes")}
                            </Button>
                        ) : null}
                        {production.status !== "completed" ? (
                            <Button type={running ? "default" : "primary"} icon={running ? <Pause className="size-4" /> : <Play className="size-4" />} loading={toggleRun.isPending} onClick={() => toggleRun.mutate()} aria-label={runLabel} title={runLabel}>
                                <span className="drama-topbar-action-label">{runLabel}</span>
                            </Button>
                        ) : null}
                    </div>
                </header>

                {view === "cast" ? (
                    <CastPanel
                        projectId={projectId}
                        cast={cast}
                        ratios={{ character: production.settings.assets.characterRatio }}
                        focusId={castFocus}
                        retrying={retry.isPending}
                        assetsPending={production.settings.mediaMode === "manual" && !production.assetsReleased}
                        releasing={release.isPending && release.variables?.target === "assets"}
                        onReleaseAssets={() => release.mutate({ target: "assets" })}
                        onFocus={(id) => setParams({ cast: id })}
                        onRetry={() => retry.mutate()}
                        onChanged={() => invalidate(episodeId)}
                        onOpenCanvas={(castId) => void canvas.open({ kind: "cast", castId })}
                        canvasOpening={canvas.opening?.startsWith("cast:") ? canvas.opening.slice("cast:".length) : undefined}
                    />
                ) : view === "inbox" ? (
                    <InboxPanel
                        items={summary.inbox}
                        castById={castById}
                        retrying={retry.isPending}
                        retryingGroup={retryingGroup}
                        releasing={release.isPending}
                        onRetryAll={() => retry.mutate()}
                        onRetryGroup={(key, items) => retryGroup.mutate({ key, items })}
                        onOpen={openInbox}
                        onOpenSettings={() => openView("settings")}
                        onReleaseAll={confirmReleaseAll}
                    />
                ) : view === "settings" ? (
                    <SettingsPanel projectId={projectId} summary={summary} cast={cast} onChanged={() => invalidate(episodeId)} />
                ) : !episodes.length ? (
                    <StudioGenesis summary={summary} />
                ) : (
                    <div className={`drama-body is-inspector-hidden ${openSegmentIndex !== undefined ? "is-covered" : ""}`} data-mobile-pane={mobilePane}>
                        <div className="drama-mobile-tabs">
                            <SegmentedControl<"episodes" | "production">
                                block
                                size="sm"
                                ariaLabel={translate("drama.detail.switchBetweenEpisodeListAndWorkspace")}
                                value={mobilePane}
                                onChange={setMobilePane}
                                options={[
                                    { label: translate("drama.detail.episodes2", { v0: String(episodes.length) }), value: "episodes" },
                                    { label: translate("drama.detail.production"), value: "production" },
                                ]}
                            />
                        </div>
                        <EpisodeRail
                            episodes={episodes}
                            currentId={episodeId}
                            planning={!production.planDone}
                            reservedChapters={production.reservedChapterCount}
                            onSelect={(id) => {
                                selectEpisode(id);
                                setMobilePane("production");
                            }}
                            onAdd={() => {
                                setPlacement(undefined);
                                setAdding(true);
                            }}
                            onInsert={(episode, position) => {
                                setPlacement({ anchorId: episode.id, anchorNumber: episode.number, position });
                                setAdding(true);
                            }}
                            onDelete={setDeleting}
                            onPickChapters={() => setPickingChapters(true)}
                        />
                        <main className="drama-main">
                            {episodeRow ? (
                                <div className="drama-ep-header">
                                    <div className="drama-ep-heading">
                                        <div className="drama-eyebrow">
                                            {translate("drama.sentences.episodeStage", { number: episodeRow.number, stage: STAGE_LABEL[episodeRow.stage] })}
                                        </div>
                                        {renaming ? (
                                            <div className="drama-title-editor">
                                                <input
                                                    className="drama-title-input"
                                                    autoFocus
                                                    defaultValue={episodeRow.title}
                                                    maxLength={60}
                                                    aria-label={translate("drama.detail.episodeTitle")}
                                                    disabled={rename.isPending}
                                                    onFocus={(event) => event.currentTarget.select()}
                                                    onBlur={(event) => {
                                                        const title = event.target.value.trim();
                                                        if (title && title !== episodeRow.title) rename.mutate(title);
                                                        else setRenaming(false);
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter") event.currentTarget.blur();
                                                        if (event.key === "Escape") setRenaming(false);
                                                    }}
                                                />
                                                <span className="drama-title-hint">{translate("drama.detail.enterToSaveEscToCancel")}</span>
                                            </div>
                                        ) : (
                                            <h2 title={episodeRow.title}>
                                                {episodeRow.title}
                                                <button type="button" className="drama-title-edit" aria-label={translate("drama.detail.renameEpisode")} onClick={() => setRenaming(true)}>
                                                    <Pencil className="size-3.5" />
                                                </button>
                                            </h2>
                                        )}
                                        <p>
                                            <span>{episodeRow.shotCount} {translate("drama.detail.shots")}</span>
                                            {episodeRow.durationMs ? <span>{formatDuration(episodeRow.durationMs)}</span> : null}
                                            <StagePips episode={episodeRow} size="md" />
                                        </p>
                                    </div>
                                    <div className="drama-tabs" role="tablist" aria-label={translate("drama.detail.view")}>
                                        <button type="button" role="tab" className="drama-tab" aria-selected={tab === "script"} onClick={() => setParams({ tab: "script" })}>
                                            <ScrollText className="size-3.5" />
                                            {translate("drama.detail.script")}
                                        </button>
                                        <button type="button" role="tab" className="drama-tab" aria-selected={tab === "board"} onClick={() => setParams({ tab: null })}>
                                            <Clapperboard className="size-3.5" />
                                            {translate("account.welcome.chapters.shots.label")}
                                        </button>
                                        <button type="button" role="tab" className="drama-tab" aria-selected={tab === "final"} onClick={() => setParams({ tab: "final" })}>
                                            <Film className="size-3.5" />
                                            {translate("drama.detail.finalCut")}
                                        </button>
                                    </div>
                                    <Button
                                        size="small"
                                        icon={<Brush className="size-3.5" />}
                                        disabled={!episodeRow.stats.segments}
                                        loading={canvas.opening === `episode:${episodeRow.id}`}
                                        onClick={() => void canvas.open({ kind: "episode", episodeId: episodeRow.id })}
                                        title={episodeRow.stats.segments ? translate("drama.detail.sendEverySegmentInThisEpisodeToTheRefinementCanvas") : translate("drama.detail.thisEpisodeHasNoStorySegmentsYet")}
                                    >
                                        {translate("drama.detail.openThisEpisodeOnCanvas")}
                                    </Button>
                                </div>
                            ) : null}
                            <div className="drama-banners">
                                {production.status === "paused" ? (
                                    <div className="drama-banner">
                                        <div className="drama-banner-text">
                                            <strong>{translate("drama.detail.productionPaused")}</strong>
                                            <span title={production.pauseReason || undefined}>{production.pauseReason || translate("drama.detail.noNewGenerationTasksWillBeDispatchedReadaptingGeneratingVideos")}</span>
                                        </div>
                                        <Button size="small" type="primary" icon={<Play className="size-3.5" />} loading={toggleRun.isPending} onClick={() => toggleRun.mutate()}>
                                            {translate("drama.detail.resumeProduction")}
                                        </Button>
                                    </div>
                                ) : null}
                                {episodeRow?.awaitingMedia ? (
                                    <div className="drama-banner is-ready">
                                        <Clapperboard className="size-5 shrink-0 text-[var(--workspace-accent)]" />
                                        <div className="drama-banner-text" title={`${AWAITING_MEDIA_BANNER.title}\n${AWAITING_MEDIA_BANNER.text}`}>
                                            <strong>{AWAITING_MEDIA_BANNER.title}</strong>
                                            <span>{AWAITING_MEDIA_BANNER.text}</span>
                                        </div>
                                        <div className="flex shrink-0 gap-2">
                                            {tab !== "script" ? <Button onClick={() => setParams({ tab: "script" })}>{translate("drama.detail.viewScriptAndSource")}</Button> : null}
                                            <Button
                                                type="primary"
                                                icon={<Play className="size-4" />}
                                                loading={release.isPending && release.variables?.target === "episodes"}
                                                onClick={() => release.mutate({ target: "episodes", episodeIds: [episodeRow.id] })}
                                            >
                                                {translate("drama.detail.generateEpisodeVideos")}
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                                {reviewing ? (
                                    <div className="drama-banner is-info">
                                        <CheckCheck className="size-5 shrink-0 text-[var(--workspace-accent)]" />
                                        <div className="drama-banner-text" title={`${reviewBanner.title}\n${reviewBanner.text}`}>
                                            <strong>{reviewBanner.title}</strong>
                                            <span>{reviewBanner.text}</span>
                                        </div>
                                        <Button type="primary" loading={approve.isPending} onClick={() => approve.mutate()}>
                                            {sampleReview ? translate("drama.detail.approvePilotAndContinueProduction") : translate("drama.detail.approveAndGenerateVideos")}
                                        </Button>
                                    </div>
                                ) : null}
                                {sampleWaiting ? (
                                    <div className="drama-banner is-info">
                                        <div className="drama-banner-text">
                                            <strong>{translate("drama.detail.scriptReadyAwaitingPilotApproval")}</strong>
                                            <span>{translate("drama.detail.afterYouApproveTheEpisode1PilotThisEpisodeS")}</span>
                                        </div>
                                        <Button size="small" onClick={() => selectEpisode(episodes[0].id)}>
                                            {translate("drama.detail.reviewPilot")}
                                        </Button>
                                    </div>
                                ) : null}
                                {detail?.episode.error ? (
                                    <div className="drama-banner is-error">
                                        <div className="drama-banner-text">
                                            <strong>{translate("drama.detail.thisEpisodeNeedsAttention")}</strong>
                                            <span>{detail.episode.error}</span>
                                        </div>
                                        <span className="text-[var(--fs-tiny)] text-foreground/50">{translate("drama.detail.useRetryAllInTheQueueAtTheBottom")}</span>
                                    </div>
                                ) : null}
                            </div>
                            <div className="drama-scroll thin-scrollbar">
                                {!detail ? (
                                    <WorkspaceLoadingState label={translate("drama.detail.loadingEpisode")} rows={2} />
                                ) : tab === "board" ? (
                                    <Storyboard
                                        shots={shots}
                                        segments={detail.segments}
                                        aspectRatio={aspectRatio}
                                        castById={castById}
                                        defaultVideoModel={production.settings.models.video}
                                        videoResolution={production.settings.videoResolution}
                                        busy={busy}
                                        keyboardEnabled={openSegmentIndex === undefined && view === "production"}
                                        onOpen={openSegment}
                                        onGenerate={(segments, videoModel) => generateSegments.mutate({ segments, videoModel })}
                                        onReprocess={(index) => reprocessSegment.mutate(index)}
                                        reprocessing={reprocessSegment.isPending ? reprocessSegment.variables : undefined}
                                        onWritePrompts={(indexes) => writeSegment.mutate(indexes)}
                                        empty={episodeEmpty}
                                    />
                                ) : tab === "script" ? (
                                    <ScriptView
                                        projectId={projectId}
                                        detail={detail}
                                        storyboard={production.settings.storyboard}
                                        currentId={currentShot?.id || ""}
                                        busy={busy}
                                        onCurrent={(id) => setParams({ shot: id })}
                                        onRescript={() => rescript.mutate()}
                                        onPatchShot={(shot, patch) => patchShot.mutate({ shot, patch })}
                                        onInsertShot={(shot, position) => insertShot.mutate({ shot, position })}
                                        onDeleteShot={(shot) => removeShot.mutate(shot)}
                                        onSourceSaved={(again) => {
                                            invalidate(episodeId);
                                            if (again) rescript.mutate();
                                        }}
                                        empty={episodeEmpty}
                                    />
                                ) : (
                                    <FinalView
                                        projectId={projectId}
                                        title={summary.project.name}
                                        detail={detail}
                                        aspectRatio={aspectRatio}
                                        onOpenSegment={(index) => setParams({ tab: null, segment: String(index), shot: null })}
                                        onOpenCut={() => void canvas.open({ kind: "cut", episodeId: detail.episode.id })}
                                        cutOpening={canvas.opening === `cut:${detail.episode.id}`}
                                    />
                                )}
                            </div>
                        </main>
                        <SegmentDialog
                            detail={tab === "board" ? detail : undefined}
                            segmentIndex={openSegmentIndex}
                            shotId={currentShot?.id}
                            castById={castById}
                            aspectRatio={aspectRatio}
                            busy={busy}
                            writing={writeSegment.isPending}
                            onClose={() => openSegment(null)}
                            onNavigate={openSegment}
                            onPatchShot={(shot, patch) => patchShot.mutate({ shot, patch })}
                            onInsertShot={(shot, position) => insertShot.mutate({ shot, position })}
                            onDeleteShot={(shot) => removeShot.mutate(shot)}
                            onSavePrompt={(segment, override) => saveSegment.mutate({ segment, override })}
                            onSaveReferences={(segment, patch) => saveReferences.mutateAsync({ segment, patch })}
                            onWritePrompt={(segment) => writeSegment.mutate([segment.index])}
                            onGenerate={(segment, videoModel) => generateSegments.mutate({ segments: [segment.index], videoModel })}
                            reprocessing={reprocessSegment.isPending}
                            onReprocess={(segment) => reprocessSegment.mutate(segment.index)}
                            defaultVideoModel={production.settings.models.video}
                            videoResolution={production.settings.videoResolution}
                            onOpenCast={(id) => openView("cast", { cast: id, segment: null, shot: null })}
                            onOpenCanvas={(segment) => void canvas.open({ kind: "segment", episodeId, segmentIndex: segment.index })}
                            canvasOpening={Boolean(canvas.opening?.startsWith("segment:"))}
                        />
                    </div>
                )}

                <QueueBar projectId={projectId} summary={summary} retrying={retry.isPending} onRetry={() => retry.mutate()} onJump={jumpToJob} />
                <AddEpisodeModal
                    open={adding}
                    projectId={projectId}
                    nextNumber={placement ? placement.anchorNumber + (placement.position === "after" ? 1 : 0) : (episodes[episodes.length - 1]?.number || 0) + 1}
                    placement={placement}
                    defaultFormat={sourceFormatOf((placement ? episodes.find((episode) => episode.id === placement.anchorId) : episodes[episodes.length - 1])?.sourceFormat)}
                    blockedReason={production.planDone ? undefined : translate("drama.detail.earlierChaptersAreStillBeingPlannedIntoEpisodesOnceFinished", { v0: String(placement ? translate("drama.detail.insert") : translate("drama.detail.append")) })}
                    onClose={() => setAdding(false)}
                    onAdded={(id) => {
                        setAdding(false);
                        invalidate(id, { renumbered: Boolean(placement) });
                        selectEpisode(id);
                    }}
                />
                <EpisodeDeleteModal
                    projectId={projectId}
                    episode={deleting}
                    blockedReason={!production.planDone ? translate("drama.detail.earlierChaptersAreStillBeingPlannedIntoEpisodesDeletionIs") : episodes.length <= 1 ? translate("drama.detail.aProductionMustKeepAtLeastOneEpisodeDeleteThe") : undefined}
                    onClose={() => setDeleting(null)}
                    onDeleted={(id) => {
                        setDeleting(null);
                        // 删掉当前集时停在原位置的下一集，没有下一集时回到上一集。
                        const index = episodes.findIndex((episode) => episode.id === id);
                        const neighbor = episodes[index + 1] || episodes[index - 1];
                        if (id === episodeId && neighbor) selectEpisode(neighbor.id);
                        invalidate(undefined, { renumbered: true, removedEpisodeId: id });
                    }}
                />
                {pickingChapters ? (
                    <ChapterPickerModal
                        open={pickingChapters}
                        projectId={projectId}
                        defaultPerEpisode={production.settings.chaptersPerEpisode || 1}
                        blockedReason={production.planDone ? undefined : translate("drama.detail.earlierChaptersAreStillBeingPlannedIntoEpisodesAddMore")}
                        onClose={() => setPickingChapters(false)}
                        onProduced={(ids) => {
                            setPickingChapters(false);
                            invalidate(ids[0]);
                            if (ids[0]) selectEpisode(ids[0]);
                        }}
                    />
                ) : null}
                {assetDialog === "export" ? <AssetPackageModal open projectId={projectId} episodes={episodes} onClose={() => setAssetDialog(null)} /> : null}
                {assetDialog === "import" ? <AssetImportModal open projectId={projectId} onClose={() => setAssetDialog(null)} /> : null}
            </div>
        </WorkspacePage>
    );
}
