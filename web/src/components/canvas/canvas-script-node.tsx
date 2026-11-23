import { Button, Input, InputNumber, Modal, Segmented, Table } from "antd";
import { CanvasAnchoredDropdown as Dropdown } from "./canvas-anchored-dropdown";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { CheckboxGroup } from "@/components/ui/base/checkbox";
import type { MenuProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Check, ChevronDown, ChevronUp, Clapperboard, Copy, Expand, Film, Grid3X3, Image as ImageIcon, ListTree, Merge, MoreHorizontal, Plus, RefreshCw, Send, Square, Trash2, Video } from "lucide-react";

import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { StoryboardAssetsCell } from "@/components/canvas/storyboard-assets-cell";
import { ModelPicker } from "@/components/model-picker";
import { buildGenerationConfig } from "@/lib/canvas/canvas-project-generation";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { type CanvasStoryboardPipelineProgress } from "@/lib/canvas/canvas-storyboard-progress";
import { generationErrorMessage } from "@/lib/generation-error";
import { generationTaskShowsProgress, generationTaskStageLabel } from "@/lib/generation-task-display";
import { navigateToSettings } from "@/lib/settings-navigation";
import { canvasThemes } from "@/lib/canvas-theme";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { STORYBOARD_COMPOSER_MIN_HEIGHT, STORYBOARD_HEADER_HEIGHT, STORYBOARD_ROW_HEIGHT, storyboardTableHeight } from "@/lib/canvas/canvas-storyboard-layout";
import type { CanvasGenerationBatch, CanvasNodeData, CanvasWorkspaceMode, StoryboardColumn, StoryboardRow, StoryboardShotCount, StoryboardShotDuration, StoryboardVideoInputMode } from "@/types/canvas";
import type { TaskStatus } from "@/services/api/task-center";
import { Select } from "@/components/ui/base/select";
import { GenerationBatchDetails, StoryboardMiniPipeline, batchItemTone, generationBatchItemLabel, generationBatchSummary } from "./canvas-script-node-parts";
import { translate } from "@/i18n";

const STORYBOARD_PROMPT_MIN_HEIGHT = 40;
const STORYBOARD_PROMPT_MAX_HEIGHT = 116;
const SCRIPT_GRID_TEMPLATE = "64px 76px minmax(300px, 1.55fr) minmax(220px, 1fr) 180px";
const EMPTY_STORYBOARD_ROWS: StoryboardRow[] = [];
const DEFAULT_STORYBOARD_COLUMNS: StoryboardColumn[] = ["shotNumber", "durationSeconds", "videoMotionPrompt", "dialogue", "assets"];
const LEGACY_STORYBOARD_COLUMNS: StoryboardColumn[] = ["shotNumber", "durationSeconds", "plotDescription", "dialogue"];
const PREVIOUS_DEFAULT_STORYBOARD_COLUMNS: StoryboardColumn[] = ["shotNumber", "plotDescription", "videoMotionPrompt", "dialogue"];

function resolveStoryboardVisibleColumns(columns?: StoryboardColumn[]) {
    const isLegacyDefault = columns?.length === LEGACY_STORYBOARD_COLUMNS.length && LEGACY_STORYBOARD_COLUMNS.every((column) => columns.includes(column));
    const isPreviousDefault = columns?.length === PREVIOUS_DEFAULT_STORYBOARD_COLUMNS.length && PREVIOUS_DEFAULT_STORYBOARD_COLUMNS.every((column) => columns.includes(column));
    if (!columns?.length || isLegacyDefault || isPreviousDefault) {
        return DEFAULT_STORYBOARD_COLUMNS;
    }
    return columns;
}

const columnOptions: Array<{ label: string; value: StoryboardColumn }> = [
    { label: translate("canvasTools.canvasScriptNode.no"), value: "shotNumber" },
    { label: translate("canvasA.assetView.duration"), value: "durationSeconds" },
    { label: translate("canvasTools.canvasScriptNode.frameDescription"), value: "plotDescription" },
    { label: translate("canvasTools.canvasScriptNode.dialogueVoiceOver"), value: "dialogue" },
    { label: translate("canvasTools.canvasScriptNode.shotIntent"), value: "narrativeIntent" },
    { label: translate("canvasTools.canvasScriptNode.audienceView"), value: "viewerPOV" },
    { label: translate("canvasTools.canvasScriptNode.performanceBlocking"), value: "performanceBlocking" },
    { label: translate("canvasTools.canvasScriptNode.shotSize"), value: "shotSize" },
    { label: translate("canvasTools.canvasScriptNode.emotion"), value: "emotion" },
    { label: translate("canvasTools.canvasScriptNode.lightingAndMood"), value: "lightingAndAtmosphere" },
    { label: translate("canvasTools.canvasScriptNode.soundEffects"), value: "audioEffects" },
    { label: translate("canvasTools.canvasScriptNode.shotDesign"), value: "camera" },
    { label: translate("canvasA.toolPicker.motion.short"), value: "motion" },
    { label: translate("canvasTools.canvasScriptNode.timingBeats"), value: "timeBeats" },
    { label: translate("canvasTools.canvasScriptNode.imagePrompt"), value: "imageGenerationPrompt" },
    { label: translate("canvasTools.canvasScriptNode.videoPrompt"), value: "videoMotionPrompt" },
    { label: translate("canvasTools.canvasScriptNode.relatedAssets"), value: "assets" },
    { label: translate("canvasTools.canvasScriptNode.continuityOut"), value: "continuityOut" },
    { label: translate("canvasTools.canvasScriptNode.negativeNotes"), value: "negativePrompt" },
];

export function CanvasScriptNodeContent({
    node,
    nodes,
    batch,
    pipeline,
    scale,
    mentionReferences,
    onOpen,
    onCreateImageNodes,
    onCreateVideoNodes,
    onGenerateImages,
    onGenerateVideos,
    onVideoInputModeChange,
    onMergeVideos,
    onCreateActionBoards,
    onRetryBatch,
    onRetryBatchItem,
    onStopBatch,
    onAddRow,
    onRemoveRow,
    onUpdateRow,
    onEditAssets,
    onPromptChange,
    onGenerateScript,
    onModelChange,
    onShotDurationChange,
    onShotCountChange,
    onComposerHeightChange,
    onConnectStart,
    onScrollTopChange,
    workspaceMode = "professional",
}: {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    batch?: CanvasGenerationBatch;
    pipeline: CanvasStoryboardPipelineProgress;
    scale: number;
    mentionReferences: CanvasResourceReference[];
    onOpen: () => void;
    onCreateImageNodes: () => void;
    onCreateVideoNodes: () => void;
    onGenerateImages: (rowIds: string[]) => void;
    onGenerateVideos: (rowIds: string[]) => void;
    onVideoInputModeChange: (mode: StoryboardVideoInputMode) => void;
    onMergeVideos: () => void;
    onCreateActionBoards: () => void;
    onRetryBatch: (batchId: string) => void;
    onRetryBatchItem: (batchId: string, itemId: string) => void;
    onStopBatch: (batchId: string) => void;
    onAddRow: () => void;
    onRemoveRow: (rowId: string) => void;
    onUpdateRow: (rowId: string, patch: Partial<StoryboardRow>) => void;
    onEditAssets: (rowId: string) => void;
    onPromptChange: (prompt: string) => boolean | void;
    onGenerateScript: (prompt: string) => void;
    onModelChange: (model: string) => void;
    onShotDurationChange: (duration: StoryboardShotDuration) => void;
    onShotCountChange: (count: StoryboardShotCount) => void;
    onComposerHeightChange: (height: number) => void;
    onConnectStart: (event: ReactPointerEvent, rowId: string, handleType: "source" | "target") => void;
    onScrollTopChange: (scrollTop: number) => void;
    workspaceMode?: CanvasWorkspaceMode;
}) {
    const theme = canvasThemes[useActiveTheme()];
    const effectiveConfig = useEffectiveConfig();
    const generationConfig = buildGenerationConfig(effectiveConfig, node, "text");
    const simpleMode = workspaceMode === "simple";
    const rows = node.metadata?.storyboard?.rows || [];
    const prompt = node.metadata?.composerContent || "";
    const [scrollTop, setScrollTop] = useState(0);
    const composerHeightChangeRef = useRef(onComposerHeightChange);
    const reportedComposerHeightRef = useRef<number | null>(null);
    const composerHeight = node.metadata?.storyboardComposerHeight || STORYBOARD_COMPOSER_MIN_HEIGHT;
    const tableHeight = storyboardTableHeight(node.height, composerHeight);
    const totalDuration = rows.reduce((sum, row) => sum + (Number(row.durationSeconds) || 0), 0);
    const shotDuration = node.metadata?.storyboardShotDuration || "auto";
    const shotCount = node.metadata?.storyboardShotCount || "auto";
    const videoInputMode = node.metadata?.storyboardVideoInputMode || "direct";
    const batchItemByRowId = useMemo(() => new Map((batch?.items || []).map((item) => [item.rowId, item])), [batch?.items]);
    const batchSummary = batch ? generationBatchSummary(batch) : null;
    const hasFailedBatchItems = Boolean(batch?.items.some((item) => item.status === "failed"));
    const hasWaitingBatchItems = Boolean(batch?.items.some((item) => item.status === "waiting" || item.status === "submitting"));
    const hasActiveBatchItems = Boolean(batch?.items.some((item) => item.status === "waiting" || item.status === "submitting" || item.status === "queued" || item.status === "running"));
    const taskStatus = node.metadata?.taskStatus;
    const displayStatus: TaskStatus = taskStatus === "queued" || taskStatus === "succeeded" || taskStatus === "failed" || taskStatus === "cancelled" ? taskStatus : "running";
    const displayTask = node.metadata?.taskId
        ? {
              provider: node.metadata.taskProvider,
              status: displayStatus,
              stage: node.metadata.taskStage,
              officialStatus: node.metadata.taskOfficialStatus,
              errorCode: node.metadata.taskErrorCode,
          }
        : null;
    const taskFeedback =
        node.metadata?.status === "loading"
            ? displayTask
                ? `${generationTaskStageLabel(displayTask)}${generationTaskShowsProgress(displayTask) && typeof node.metadata.taskProgress === "number" ? ` · ${node.metadata.taskProgress}%` : ""}`
                : translate("canvasTools.canvasScriptNode.creatingTheTask")
            : node.metadata?.status === "error"
              ? generationErrorMessage(node.metadata.errorDetails)
              : "";
    const [batchDetailsOpen, setBatchDetailsOpen] = useState(false);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const pipelineDisabled = !rows.length || node.metadata?.status === "loading" || hasActiveBatchItems;
    const missingImages = Math.max(0, pipeline.images.total - pipeline.images.created);
    const missingVideos = Math.max(0, pipeline.videos.total - pipeline.videos.created);
    const canMerge = pipeline.successfulVideoNodeIds.length >= 2 && pipeline.final.success === 0;
    const allRowIds = pipeline.rows.map((item) => item.row.id);
    const moreMenuItems: MenuProps["items"] = [
        {
            key: "generate-images",
            icon: <ImageIcon className="size-3.5" />,
            label: translate("canvasTools.canvasScriptNode.generateTheMissingStoryboardFrames"),
            disabled: pipelineDisabled || pipeline.images.incomplete === 0,
            onClick: () => onGenerateImages(allRowIds),
        },
        {
            key: "generate-videos",
            icon: <Video className="size-3.5" />,
            label: translate("canvasTools.canvasScriptNode.generateTheMissingVideos"),
            disabled: pipelineDisabled || pipeline.videos.incomplete === 0,
            onClick: () => onGenerateVideos(allRowIds),
        },
        {
            key: "merge",
            icon: <Merge className="size-3.5" />,
            label: pipeline.final.success
                ? translate("canvasTools.canvasScriptNode.theCutIsReady")
                : pipeline.successfulVideoNodeIds.length >= 2
                  ? translate("canvasTools.canvasScriptNode.mergeClips", { v0: String(pipeline.successfulVideoNodeIds.length) })
                  : translate("canvasTools.canvasScriptNode.mergeIntoACutNeedsAtLeast2Clips"),
            disabled: !canMerge,
            onClick: () => onMergeVideos(),
        },
        { type: "divider" },
        {
            key: "video-input",
            icon: <Film className="size-3.5" />,
            label: translate("canvasTools.canvasScriptNode.videoInputMode"),
            children: [
                {
                    key: "video-input-direct",
                    icon: videoInputMode === "direct" ? <Check className="size-3.5" /> : <span aria-hidden="true" className="inline-block size-3.5" />,
                    label: translate("canvasTools.canvasScriptNode.generateDirectly"),
                    onClick: () => onVideoInputModeChange("direct"),
                },
                {
                    key: "video-input-keyframe",
                    icon: videoInputMode === "keyframe" ? <Check className="size-3.5" /> : <span aria-hidden="true" className="inline-block size-3.5" />,
                    label: translate("canvasTools.canvasScriptNode.firstFrameFirst"),
                    onClick: () => onVideoInputModeChange("keyframe"),
                },
            ],
        },
        ...(!simpleMode
            ? [
                  { type: "divider" as const },
                  {
                      key: "create-image-nodes",
                      icon: <Grid3X3 className="size-3.5" />,
                      label: missingImages ? translate("canvasTools.canvasScriptNode.createImageNodes", { v0: String(missingImages) }) : translate("canvasTools.canvasScriptNode.imageNodeCreated"),
                      disabled: pipelineDisabled || missingImages === 0,
                      onClick: () => onCreateImageNodes(),
                  },
                  {
                      key: "create-video-nodes",
                      icon: <Film className="size-3.5" />,
                      label: missingVideos ? translate("canvasTools.canvasScriptNode.createVideoNodes", { v0: String(missingVideos) }) : translate("canvasTools.canvasScriptNode.videoNodeCreated"),
                      disabled: pipelineDisabled || missingVideos === 0,
                      onClick: () => onCreateVideoNodes(),
                  },
                  { key: "action-boards", icon: <Grid3X3 className="size-3.5" />, label: translate("canvasTools.canvasScriptNode.generateA12PanelActionBreakdown"), disabled: !rows.length || hasActiveBatchItems, onClick: () => onCreateActionBoards() },
              ]
            : []),
        ...(batch
            ? [
                  { type: "divider" as const },
                  { key: "retry", icon: <RefreshCw className="size-3.5" />, label: translate("canvasTools.canvasScriptNode.retryFailures"), disabled: !hasFailedBatchItems, onClick: () => onRetryBatch(batch.id) },
                  { key: "stop", icon: <Square className="size-3.5" />, label: translate("canvasTools.canvasScriptNode.stopRemainingTasks"), disabled: !hasWaitingBatchItems, onClick: () => onStopBatch(batch.id) },
                  { key: "details", icon: <ListTree className="size-3.5" />, label: translate("canvasTools.canvasScriptNode.viewBatchDetails"), onClick: () => setBatchDetailsOpen(true) },
              ]
            : []),
    ];
    const submitPrompt = () => {
        const value = prompt.trim();
        if (value && node.metadata?.status !== "loading") onGenerateScript(value);
    };
    useLayoutEffect(() => {
        composerHeightChangeRef.current = onComposerHeightChange;
    }, [onComposerHeightChange]);
    const resizePrompt = useCallback((contentHeight: number) => {
        const promptHeight = Math.min(STORYBOARD_PROMPT_MAX_HEIGHT, Math.max(STORYBOARD_PROMPT_MIN_HEIGHT, contentHeight));
        const composerHeight = promptHeight + 64;
        if (reportedComposerHeightRef.current === composerHeight) return;
        reportedComposerHeightRef.current = composerHeight;
        composerHeightChangeRef.current(composerHeight);
    }, []);

    return (
        <div className="relative flex h-full w-full flex-col overflow-visible" style={{ color: theme.node.text }} onDoubleClick={(event) => event.stopPropagation()}>
            <div className="relative flex h-10 shrink-0 items-center gap-2 rounded-t-[16px] border-b px-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                <Clapperboard className="size-4" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={node.title || translate("canvasTools.canvasScriptNode.storyboard")}>
                    {node.title || translate("canvasTools.canvasScriptNode.storyboard")}
                </span>
                {taskFeedback ? (
                    <span className="min-w-0 max-w-[38%] truncate text-[var(--fs-label)] font-medium" title={taskFeedback} style={{ color: node.metadata?.status === "error" ? theme.accent.danger : theme.node.muted }}>
                        {taskFeedback}
                    </span>
                ) : batchSummary ? (
                    <span className="min-w-0 max-w-[42%] truncate text-[var(--fs-label)] font-medium" title={batchSummary} style={{ color: batch?.status === "partial_failed" ? theme.accent.danger : theme.node.muted }}>
                        {batchSummary}
                    </span>
                ) : null}
                <span className="text-[var(--fs-caption)] font-semibold tabular-nums" style={{ color: theme.node.muted }}>
                    {translate("canvasTools.inline.canvasScriptNode.shotsS", { v0: String(rows.length), v1: String(totalDuration) })}
                </span>
                <Tooltip title={translate("canvasTools.canvasScriptNode.fullScreenEditing")}>
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                        style={{ "--tw-ring-color": theme.node.muted } as CSSProperties}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            onOpen();
                        }}
                        aria-label={translate("canvasTools.canvasScriptNode.fullScreenEditing")}
                    >
                        <Expand className="size-3.5" />
                    </button>
                </Tooltip>
                <Dropdown open={moreMenuOpen} onOpenChange={setMoreMenuOpen} menu={{ items: moreMenuItems, onClick: () => setMoreMenuOpen(false) }} trigger={["click"]} placement="bottomRight">
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                        style={{ "--tw-ring-color": theme.node.muted } as CSSProperties}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            setMoreMenuOpen(true);
                        }}
                        aria-label={translate("canvasB.common.moreActions")}
                    >
                        <MoreHorizontal className="size-3.5" />
                    </button>
                </Dropdown>
            </div>
            {batch ? (
                <Modal title={translate("canvasTools.canvasScriptNode.batchDetails")} open={batchDetailsOpen} onCancel={() => setBatchDetailsOpen(false)} footer={null} width={560} centered destroyOnHidden>
                    <GenerationBatchDetails batch={batch} rows={rows} onRetryItem={(itemId) => onRetryBatchItem(batch.id, itemId)} />
                </Modal>
            ) : null}
            <StoryboardMiniPipeline pipeline={pipeline} theme={theme} rows={rows} />
            <div className="storyboard-header-gutter grid h-9 shrink-0 items-center border-b text-xs font-semibold" style={{ borderColor: theme.node.stroke, color: theme.node.muted, gridTemplateColumns: SCRIPT_GRID_TEMPLATE }}>
                <HeaderCell borderColor={theme.node.stroke} align="center">
                    {translate("canvasTools.canvasScriptNode.no")}
                </HeaderCell>
                <HeaderCell borderColor={theme.node.stroke} align="center">
                    {translate("canvasA.assetView.duration")}
                </HeaderCell>
                <HeaderCell borderColor={theme.node.stroke}>{translate("canvasTools.canvasScriptNode.videoPrompt")}</HeaderCell>
                <HeaderCell borderColor={theme.node.stroke}>{translate("canvasTools.canvasScriptNode.dialogueVoiceOver")}</HeaderCell>
                <span className="px-3">{translate("canvasTools.canvasScriptNode.relatedAssets")}</span>
            </div>
            <div
                data-canvas-wheel-scroll
                data-canvas-wheel-intent
                tabIndex={0}
                role="region"
                aria-label={translate("canvasTools.canvasScriptNode.shotList")}
                className="storyboard-scrollbar min-h-0 flex-1 overflow-y-scroll overflow-x-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset"
                style={{ "--tw-ring-color": theme.node.muted } as CSSProperties}
                onScroll={(event) => {
                    const next = event.currentTarget.scrollTop;
                    setScrollTop(next);
                    onScrollTopChange(next);
                }}
                onWheel={(event) => event.stopPropagation()}
            >
                {rows.length ? (
                    rows.map((row) => (
                        <div key={row.id} className="relative grid border-b" style={{ height: STORYBOARD_ROW_HEIGHT, borderColor: theme.node.stroke, gridTemplateColumns: SCRIPT_GRID_TEMPLATE }}>
                            <div className="flex flex-col items-center justify-center gap-0.5 border-r tabular-nums" style={{ color: theme.node.muted, borderColor: theme.node.stroke }}>
                                <div className="flex items-center gap-0.5">
                                    <span className="text-sm">{row.shotNumber}</span>
                                    <Dropdown
                                        trigger={["click"]}
                                        menu={{ items: [{ key: "delete", label: translate("canvasTools.canvasScriptNode.deleteShot"), icon: <Trash2 className="size-3.5" />, danger: true, disabled: rows.length <= 1, onClick: () => onRemoveRow(row.id) }] }}
                                    >
                                        <button
                                            type="button"
                                            className="grid size-5 place-items-center rounded outline-none opacity-45 transition hover:bg-black/5 hover:opacity-100 focus-visible:ring-2 dark:hover:bg-white/10"
                                            aria-label={translate("canvasTools.canvasScriptNode.shotActions", { v0: String(row.shotNumber) })}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <MoreHorizontal className="size-3" />
                                        </button>
                                    </Dropdown>
                                </div>
                                {batchItemByRowId.get(row.id) ? (
                                    <span className="max-w-14 truncate text-[var(--fs-micro)] leading-3" title={generationBatchItemLabel(batchItemByRowId.get(row.id)!)}>
                                        {generationBatchItemLabel(batchItemByRowId.get(row.id)!)}
                                    </span>
                                ) : null}
                            </div>
                            <CompactDurationInput value={row.durationSeconds} borderColor={theme.node.stroke} onChange={(durationSeconds) => onUpdateRow(row.id, { durationSeconds })} />
                            <CompactInput
                                value={row.videoMotionPrompt}
                                placeholder={translate("canvasTools.canvasScriptNode.describeVideoMotionCameraMovementAndActions")}
                                onChange={(value) => onUpdateRow(row.id, { videoMotionPrompt: value })}
                                borderColor={theme.node.stroke}
                            />
                            <CompactInput value={row.dialogue} placeholder={translate("canvasTools.canvasScriptNode.dialogueOrVoiceOver")} onChange={(value) => onUpdateRow(row.id, { dialogue: value })} borderColor={theme.node.stroke} />
                            <div className="flex h-full min-w-0 items-center px-3">
                                <StoryboardAssetsCell bindings={row.assetBindings || []} nodes={nodes} onEdit={() => onEditAssets(row.id)} disabled={node.metadata?.locked} />
                            </div>
                        </div>
                    ))
                ) : (
                    <button
                        type="button"
                        className="grid h-full min-h-36 w-full place-items-center"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            onAddRow();
                        }}
                    >
                        <span className="flex flex-col items-center gap-2">
                            <span className="text-sm font-semibold">{translate("canvasTools.canvasScriptNode.addTheFirstShot")}</span>
                            <span className="text-[var(--fs-label)] font-medium" style={{ color: theme.node.faint }}>
                                {translate("canvasTools.canvasScriptNode.connectASynopsisProjectStyleNodeFirstOrTypeA")}
                            </span>
                        </span>
                    </button>
                )}
            </div>
            <div className="flex h-9 shrink-0 items-center justify-center border-b" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                    style={{ "--tw-ring-color": theme.node.muted } as CSSProperties}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        onAddRow();
                    }}
                >
                    <Plus className="size-3.5" />
                    {translate("canvasTools.canvasScriptNode.addRow")}
                </button>
            </div>
            <div className="relative grid shrink-0 grid-rows-[minmax(0,1fr)_28px] gap-2 rounded-b-[16px] p-2" style={{ height: composerHeight, background: theme.node.panel }}>
                <CanvasResourceMentionTextarea
                    rows={1}
                    references={mentionReferences}
                    aria-label={translate("canvasTools.canvasScriptNode.shotStoryAndProjectSetup")}
                    containerClassName="h-full min-h-0 overflow-hidden"
                    className="thin-scrollbar h-full min-h-0 w-full touch-pan-y resize-none overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border bg-transparent px-3 py-2 text-sm leading-5 outline-none transition placeholder:opacity-45 focus:ring-1"
                    style={{ borderColor: theme.node.stroke, color: theme.node.text, "--tw-ring-color": theme.node.muted } as CSSProperties}
                    value={prompt}
                    readOnly={Boolean(node.metadata?.locked)}
                    placeholder={translate("canvasTools.canvasScriptNode.enterAScriptOrStoryWithRequirementsSuchAsTotal")}
                    onContentSizeChange={resizePrompt}
                    onChange={(value) => {
                        if (node.metadata?.locked || onPromptChange(value) === false) return false;
                        return true;
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            submitPrompt();
                        }
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
                <div className="flex min-w-0 items-center justify-end gap-2" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    <Tooltip title={translate("canvasTools.canvasScriptNode.scriptGenerationNeedsTextUnderstandingAndStructuredOutputSoOnly")} placement="topLeft">
                        <div className="mr-auto min-w-36 max-w-56 flex-1">
                            <ModelPicker
                                className="!h-7 !w-full !min-w-0 !text-[var(--fs-tiny)] !font-normal [&_img]:!size-3 [&_.lucide]:!size-3"
                                fullWidth
                                config={generationConfig}
                                value={generationConfig.model}
                                capability="text"
                                placeholder={translate("canvasTools.canvasScriptNode.chooseATextModel")}
                                showSelectedPrice={false}
                                onChange={onModelChange}
                                onMissingConfig={() => navigateToSettings({ continueCreation: true })}
                            />
                        </div>
                    </Tooltip>
                    {simpleMode ? (
                        <span className="text-[var(--fs-label)]" style={{ color: theme.node.muted }}>
                            {translate("canvasTools.canvasScriptNode.autoSplitAutoDuration")}
                        </span>
                    ) : (
                        <Select<StoryboardShotCount>
                            className="min-w-24"
                            size="small"
                            value={shotCount}
                            disabled={node.metadata?.status === "loading"}
                            options={[
                                { value: "auto", label: translate("canvasTools.canvasScriptNode.autoSplit") },
                                ...Array.from({ length: 10 }, (_, index) => ({ value: String(index + 1) as StoryboardShotCount, label: translate("canvasTools.canvasScriptNode.shots2", { v0: String(index + 1) }) })),
                            ]}
                            popupMatchSelectWidth={false}
                            onChange={onShotCountChange}
                        />
                    )}
                    {simpleMode ? null : (
                        <Select<StoryboardShotDuration>
                            className="min-w-24"
                            size="small"
                            value={shotDuration}
                            disabled={node.metadata?.status === "loading"}
                            options={[
                                { value: "auto", label: translate("canvasTools.canvasScriptNode.automaticShotDuration") },
                                { value: "5", label: translate("canvasTools.canvasScriptNode.item5SecondsPerShot") },
                                { value: "10", label: translate("canvasTools.canvasScriptNode.item10SecondsPerShot") },
                                { value: "15", label: translate("canvasTools.canvasScriptNode.item15SecondsPerShot") },
                                { value: "30", label: translate("canvasTools.canvasScriptNode.item30SecondsPerShot") },
                            ]}
                            popupMatchSelectWidth={false}
                            onChange={onShotDurationChange}
                        />
                    )}
                    <Button
                        shape="circle"
                        icon={<Send className="size-4" />}
                        disabled={!prompt.trim() || node.metadata?.status === "loading"}
                        loading={node.metadata?.status === "loading"}
                        style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={submitPrompt}
                    />
                </div>
                <RowHandle
                    side="left"
                    top={composerHeight / 2}
                    scale={scale}
                    tone="idle"
                    theme={theme}
                    title={translate("canvasTools.canvasScriptNode.connectATextNodeAsTheProjectSetup")}
                    onPointerDown={(event) => onConnectStart(event, "context", "target")}
                />
            </div>
            {rows.map((row, index) => {
                const top = STORYBOARD_HEADER_HEIGHT + index * STORYBOARD_ROW_HEIGHT + STORYBOARD_ROW_HEIGHT / 2 - scrollTop;
                if (top < STORYBOARD_HEADER_HEIGHT + 4 || top > STORYBOARD_HEADER_HEIGHT + tableHeight - 4) return null;
                return (
                    <div key={`ports-${row.id}`}>
                        <RowHandle side="left" top={top} scale={scale} tone={batchItemTone(batchItemByRowId.get(row.id)) || row.status} theme={theme} onPointerDown={(event) => onConnectStart(event, row.id, "target")} />
                        <RowHandle side="right" top={top} scale={scale} tone={batchItemTone(batchItemByRowId.get(row.id)) || row.status} theme={theme} onPointerDown={(event) => onConnectStart(event, row.id, "source")} />
                    </div>
                );
            })}
        </div>
    );
}

export function CanvasScriptEditor({
    node,
    nodes,
    open,
    onClose,
    onUpdateRows,
    onEditAssets,
    onVisibleColumnsChange,
    onGenerateImages,
    onGenerateVideos,
    onVideoInputModeChange,
}: {
    node: CanvasNodeData | null;
    nodes: CanvasNodeData[];
    open: boolean;
    onClose: () => void;
    onUpdateRows: (rows: StoryboardRow[]) => void;
    onEditAssets: (rowId: string) => void;
    onVisibleColumnsChange: (columns: StoryboardColumn[]) => void;
    onGenerateImages: (rowIds: string[]) => void;
    onGenerateVideos: (rowIds: string[]) => void;
    onVideoInputModeChange: (mode: StoryboardVideoInputMode) => void;
}) {
    const [query, setQuery] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const rows = node?.metadata?.storyboard?.rows || EMPTY_STORYBOARD_ROWS;
    const visibleColumns = resolveStoryboardVisibleColumns(node?.metadata?.storyboard?.visibleColumns);
    const videoInputMode = node?.metadata?.storyboardVideoInputMode || "direct";
    const nodeById = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);
    const filteredRows = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return keyword
            ? rows.filter((row) =>
                  [
                      row.plotDescription,
                      row.dialogue,
                      row.camera,
                      row.motion,
                      row.timeBeats,
                      row.imageGenerationPrompt,
                      row.videoMotionPrompt,
                      row.negativePrompt,
                      ...(row.assetBindings || []).map((binding) => nodeById.get(binding.nodeId)?.title || ""),
                  ].some((value) =>
                      String(value || "")
                          .toLowerCase()
                          .includes(keyword),
                  ),
              )
            : rows;
    }, [nodeById, query, rows]);
    useEffect(() => {
        setSelectedIds((current) => {
            const next = current.filter((id) => rows.some((row) => row.id === id));
            return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
        });
    }, [rows]);
    const updateRow = (rowId: string, patch: Partial<StoryboardRow>) => onUpdateRows(rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
    const moveRow = (rowId: string, direction: -1 | 1) => {
        const index = rows.findIndex((row) => row.id === rowId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) return;
        const next = [...rows];
        [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
        onUpdateRows(next.map((row, rowIndex) => ({ ...row, shotNumber: rowIndex + 1 })));
    };
    const duplicateRow = (row: StoryboardRow) => {
        const index = rows.findIndex((item) => item.id === row.id);
        const next = [...rows];
        next.splice(index + 1, 0, { ...row, id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, imageNodeId: undefined, videoNodeId: undefined, status: "idle" });
        onUpdateRows(next.map((item, rowIndex) => ({ ...item, shotNumber: rowIndex + 1 })));
    };
    const removeRow = (rowId: string) => onUpdateRows(rows.filter((row) => row.id !== rowId).map((row, index) => ({ ...row, shotNumber: index + 1 })));

    const columns: ColumnsType<StoryboardRow> = columnOptions
        .filter((option) => visibleColumns.includes(option.value))
        .map((option) => ({
            title: option.label,
            dataIndex: option.value,
            key: option.value,
            width:
                option.value === "shotNumber"
                    ? 72
                    : option.value === "durationSeconds"
                      ? 100
                      : option.value === "assets"
                        ? 220
                        : option.value === "plotDescription" || option.value === "dialogue" || option.value === "timeBeats" || option.value.endsWith("Prompt")
                          ? 260
                          : 170,
            fixed: option.value === "shotNumber" ? ("left" as const) : undefined,
            render: (_: unknown, row: StoryboardRow) =>
                option.value === "shotNumber" ? (
                    <span className="font-semibold">{row.shotNumber}</span>
                ) : option.value === "durationSeconds" ? (
                    <InputNumber min={1} max={60} value={row.durationSeconds} addonAfter="s" onChange={(value) => updateRow(row.id, { durationSeconds: Number(value) || 1 })} />
                ) : option.value === "assets" ? (
                    <StoryboardAssetsCell bindings={row.assetBindings || []} nodes={nodes} onEdit={() => onEditAssets(row.id)} disabled={node?.metadata?.locked} />
                ) : option.value === "shotSize" ? (
                    <Select
                        className="w-full"
                        value={row.shotSize || undefined}
                        placeholder={translate("canvasTools.canvasScriptNode.chooseAShotSize")}
                        options={[
                            { value: "特写", label: translate("canvasTools.canvasScriptNode.shotSizeOptions.closeUp") },
                            { value: "近景", label: translate("canvasTools.canvasScriptNode.shotSizeOptions.mediumCloseUp") },
                            { value: "中景", label: translate("canvasTools.canvasScriptNode.shotSizeOptions.medium") },
                            { value: "全景", label: translate("canvasTools.canvasScriptNode.shotSizeOptions.full") },
                            { value: "远景", label: translate("canvasTools.canvasScriptNode.shotSizeOptions.long") },
                        ]}
                        onChange={(shotSize) => updateRow(row.id, { shotSize })}
                    />
                ) : (
                    <Input.TextArea
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        value={String(row[option.value] || "")}
                        placeholder={translate("canvasTools.canvasScriptNode.enter", { v0: String(option.label) })}
                        onChange={(event) => updateRow(row.id, { [option.value]: event.target.value } as Partial<StoryboardRow>)}
                    />
                ),
        }));
    columns.push({
        title: translate("account.settings.runninghub.actions"),
        key: "actions",
        dataIndex: "shotNumber",
        width: 150,
        fixed: "right" as const,
        render: (_: unknown, row: StoryboardRow) => (
            <div className="flex gap-1">
                <SmallButton title={translate("canvasTools.canvasScriptNode.moveUp")} onClick={() => moveRow(row.id, -1)}>
                    <ChevronUp className="size-3.5" />
                </SmallButton>
                <SmallButton title={translate("canvasTools.canvasScriptNode.moveDown")} onClick={() => moveRow(row.id, 1)}>
                    <ChevronDown className="size-3.5" />
                </SmallButton>
                <SmallButton title={translate("canvasB.common.copy")} onClick={() => duplicateRow(row)}>
                    <Copy className="size-3.5" />
                </SmallButton>
                <SmallButton title={translate("common.delete")} onClick={() => removeRow(row.id)}>
                    <Trash2 className="size-3.5" />
                </SmallButton>
            </div>
        ),
    });

    return (
        <Modal title={node?.title || translate("canvasTools.canvasScriptNode.storyboard")} open={open} onCancel={onClose} footer={null} width="min(1480px, calc(100vw - 40px))" centered destroyOnHidden>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input.Search className="w-72" allowClear placeholder={translate("canvasTools.canvasScriptNode.filterByFrameDialogueOrPrompt")} value={query} onChange={(event) => setQuery(event.target.value)} />
                <CheckboxGroup className="script-column-picker" options={columnOptions} value={visibleColumns} onChange={(values) => onVisibleColumnsChange(values)} />
                <span className="min-w-0 flex-1" />
                <Button icon={<Plus className="size-4" />} onClick={() => onUpdateRows([...rows, editorRow(rows.length + 1)])}>
                    {translate("canvasTools.canvasScriptNode.addShot")}
                </Button>
                <Button icon={<ImageIcon className="size-4" />} disabled={!selectedIds.length} onClick={() => onGenerateImages(selectedIds)}>
                    {translate("canvasTools.inline.canvasScriptNode.generate", { v0: String(videoInputMode === "keyframe" ? translate("canvasC.videoPromptTools.startFrame") : translate("canvasTools.canvasScriptNode.storyboardFrame")) })}
                </Button>
                <Segmented<StoryboardVideoInputMode>
                    value={videoInputMode}
                    options={[
                        { value: "direct", label: translate("canvasTools.canvasScriptNode.generateDirectly") },
                        { value: "keyframe", label: translate("canvasTools.canvasScriptNode.firstFrameFirst") },
                    ]}
                    onChange={onVideoInputModeChange}
                />
                <Button type="primary" icon={<Film className="size-4" />} disabled={!selectedIds.length} onClick={() => onGenerateVideos(selectedIds)}>
                    {videoInputMode === "keyframe" ? translate("canvasTools.canvasScriptNode.confirmTheFirstFrameAndGenerate") : translate("canvasTools.canvasScriptNode.generateVideo")}
                </Button>
            </div>
            <Table<StoryboardRow>
                rowKey="id"
                size="small"
                bordered
                sticky
                pagination={false}
                scroll={{ x: Math.max(900, columns.length * 180), y: "calc(78vh - 170px)" }}
                dataSource={filteredRows}
                columns={columns}
                rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys.map(String)) }}
            />
        </Modal>
    );
}

function CompactInput({ value, placeholder, borderColor, onChange }: { value: string; placeholder: string; borderColor: string; onChange: (value: string) => void }) {
    return (
        <textarea
            className="thin-scrollbar h-full w-full resize-none overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words border-r bg-transparent px-4 py-2 text-xs leading-5 outline-none transition placeholder:opacity-35 focus:bg-black/[0.02] dark:focus:bg-white/[0.025]"
            style={{ borderColor }}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        />
    );
}

function CompactDurationInput({ value, borderColor, onChange }: { value: number; borderColor: string; onChange: (value: number) => void }) {
    return (
        <label className="flex h-full items-center justify-center gap-1 border-r text-xs tabular-nums text-foreground/60" style={{ borderColor }}>
            <input
                type="number"
                min={1}
                max={60}
                value={value}
                className="w-9 bg-transparent text-right outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label={translate("canvasTools.canvasScriptNode.shotDurationSeconds")}
                onChange={(event) => onChange(Math.max(1, Math.min(60, Number(event.target.value) || 1)))}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            />
            {translate("canvasTools.canvasScriptNode.second")}
        </label>
    );
}

function HeaderCell({ children, borderColor, align = "left" }: { children: ReactNode; borderColor: string; align?: "left" | "center" }) {
    return (
        <span className={`flex h-full items-center border-r px-4 ${align === "center" ? "justify-center text-center" : "justify-start"}`} style={{ borderColor }}>
            {children}
        </span>
    );
}

function SmallButton({ title, children, onClick, disabled }: { title: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className="grid size-7 shrink-0 place-items-center rounded opacity-65 transition enabled:hover:bg-black/5 enabled:hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25 dark:enabled:hover:bg-white/10"
            title={title}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
        >
            {children}
        </button>
    );
}

function editorRow(shotNumber: number): StoryboardRow {
    return {
        id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shotNumber,
        durationSeconds: 6,
        plotDescription: "",
        dialogue: "",
        characters: [],
        narrativeIntent: "",
        viewerPOV: "",
        performanceBlocking: "",
        shotSize: "",
        emotion: "",
        lightingAndAtmosphere: "",
        audioEffects: "",
        camera: "",
        motion: "",
        timeBeats: "",
        imageGenerationPrompt: "",
        videoMotionPrompt: "",
        mustHave: [],
        optionalDetails: [],
        continuityOut: "",
        negativePrompt: "",
        assetBindings: [],
        status: "idle",
    };
}

function RowHandle({
    side,
    top,
    scale,
    tone,
    theme,
    title,
    onPointerDown,
}: {
    side: "left" | "right";
    top: number;
    scale: number;
    tone?: StoryboardRow["status"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    title?: string;
    onPointerDown: (event: ReactPointerEvent) => void;
}) {
    const color = tone === "loading" ? theme.accent.primary : tone === "error" ? theme.accent.danger : tone === "success" ? theme.node.activeStroke : theme.node.muted;
    const inverseHitScale = 1 / Math.max(scale, 0.05);
    return (
        <button
            type="button"
            aria-label={title || translate("canvasTools.canvasScriptNode.connector", { v0: String(side === "left" ? translate("canvasTools.canvasScriptNode.input") : translate("canvasTools.canvasScriptNode.output")) })}
            title={title || `${side === "left" ? translate("canvasTools.canvasScriptNode.bringInAReference") : translate("canvasTools.canvasScriptNode.connectToAnImageVideoOrGenerationNode")}`}
            className={`canvas-connection-handle absolute z-[var(--node-z-handle)] flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 ${side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}`}
            style={{ top, width: 32 * inverseHitScale, height: 32 * inverseHitScale, "--tw-ring-color": theme.accent.primary } as CSSProperties}
            onPointerDown={onPointerDown}
        >
            <span className="block size-2.5 rounded-full border-2 shadow-sm transition-opacity duration-150 hover:opacity-80" style={{ boxSizing: "border-box", borderColor: theme.node.panel, background: color }} />
        </button>
    );
}
