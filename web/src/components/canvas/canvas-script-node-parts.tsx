// 分镜脚本节点的流水线状态条、生成批次详情与编辑器小控件。

import { type CanvasStoryboardPipelineProgress, pipelineStatusLabel, type StoryboardPipelineStage } from "@/lib/canvas/canvas-storyboard-progress";
import { canvasThemes } from "@/lib/canvas-theme";
import { type CanvasGenerationBatch, type CanvasGenerationBatchItem, type CanvasGenerationBatchItemStatus, type CanvasNodeStatus, type StoryboardRow } from "@/types/canvas";
import { Fragment } from "react";
import { generationErrorMessage, isContentModerationError } from "@/lib/generation-error";
import { Tooltip } from "@/components/ui/base/tooltip";
import { RefreshCw } from "lucide-react";
import { translate } from "@/i18n";

export function storyboardStepState(stage: StoryboardPipelineStage): "done" | "current" | "error" | "idle" {
    if (stage.failed > 0 && stage.success === 0) return "error";
    if (stage.success > 0) return "done";
    if (stage.loading > 0 || stage.incomplete > 0) return "current";
    return "idle";
}

export function StoryboardMiniPipeline({ pipeline, theme, rows }: { pipeline: CanvasStoryboardPipelineProgress; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; rows: StoryboardRow[] }) {
    const steps: Array<{ key: string; label: string; state: "done" | "current" | "error" | "idle"; hint: string }> = [
        { key: "script", label: translate("account.welcome.chapters.shots.label"), state: rows.length > 0 ? "done" : "idle", hint: rows.length > 0 ? translate("canvasTools.canvasScriptNodeParts.shots", { v0: String(rows.length) }) : translate("canvasTools.canvasScriptNodeParts.shotsToAdd") },
        { key: "images", label: translate("canvasTools.canvasScriptNodeParts.storyboardFrameOptional"), state: storyboardStepState(pipeline.images), hint: pipelineStatusLabel(pipeline.images) },
        { key: "videos", label: translate("account.feedback.video"), state: storyboardStepState(pipeline.videos), hint: pipelineStatusLabel(pipeline.videos) },
        {
            key: "final",
            label: translate("canvasTools.canvasScriptNodeParts.mergeIntoACut"),
            state: pipeline.final.success > 0 ? "done" : pipeline.final.failed > 0 ? "error" : pipeline.final.loading > 0 || pipeline.successfulVideoNodeIds.length >= 2 ? "current" : "idle",
            hint: pipelineStatusLabel(pipeline.final),
        },
    ];
    return (
        <div
            className="flex h-9 shrink-0 items-center justify-center overflow-hidden border-b px-4"
            style={{ borderColor: theme.node.stroke, background: theme.node.fill }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {steps.map((step, index) => (
                <Fragment key={step.key}>
                    {index > 0 ? <span className="mx-2 h-px min-w-3.5 flex-1 max-w-20" style={{ background: theme.node.stroke }} /> : null}
                    <span
                        className="flex items-center gap-2 whitespace-nowrap text-[var(--fs-tiny)]"
                        title={step.hint}
                        style={{
                            color: step.state === "done" ? theme.node.muted : step.state === "current" ? theme.accent.primary : step.state === "error" ? theme.accent.danger : theme.node.faint,
                            fontWeight: step.state === "current" || step.state === "error" ? 700 : 500,
                        }}
                    >
                        <span
                            className="size-2 shrink-0 rounded-full"
                            style={{
                                background: step.state === "done" ? theme.node.activeStroke : step.state === "current" ? theme.accent.primary : step.state === "error" ? theme.accent.danger : theme.node.stroke,
                                boxShadow: step.state === "current" ? `0 0 0 3px ${theme.accent.primarySoft}` : undefined,
                            }}
                        />
                        {step.label}
                    </span>
                </Fragment>
            ))}
        </div>
    );
}

export function GenerationBatchDetails({ batch, rows, onRetryItem }: { batch: CanvasGenerationBatch; rows: StoryboardRow[]; onRetryItem: (itemId: string) => void }) {
    const shotByRowId = new Map(rows.map((row) => [row.id, row.shotNumber]));
    return (
        <div className="w-80" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{translate("canvasTools.inline.canvasScriptNodeParts.details", { v0: String(generationBatchModeLabel(batch)) })}</span>
                <span className="text-xs text-foreground/50">{translate("canvasTools.inline.canvasScriptNodeParts.items", { v0: String(batch.items.length) })}</span>
            </div>
            <div className="thin-scrollbar max-h-72 overflow-y-auto">
                {batch.items.map((item) => {
                    const requiresPromptChange = isContentModerationError(item.errorDetails);
                    return (
                        <div key={item.id} className="flex min-h-9 items-center gap-2 border-t border-foreground/10 py-2 first:border-t-0">
                            <span className="w-14 shrink-0 text-xs font-medium">{translate("canvasTools.inline.canvasScriptNodeParts.shot", { v0: String(shotByRowId.get(item.rowId) || "--") })}</span>
                            <span className="min-w-0 flex-1 truncate text-xs text-foreground/60" title={item.errorDetails ? generationErrorMessage(item.errorDetails) : undefined}>
                                {generationBatchItemLabel(item)}
                                {item.retryCount ? translate("canvasTools.canvasScriptNodeParts.retry", { v0: String(item.retryCount) }) : ""}
                            </span>
                            {item.status === "failed" ? (
                                <Tooltip title={requiresPromptChange ? translate("canvasTools.canvasScriptNodeParts.editThePromptBeforeRetryingThisShot") : translate("canvasTools.canvasScriptNodeParts.retryThisShotOnly")}>
                                    <button
                                        type="button"
                                        className="grid size-7 shrink-0 place-items-center rounded outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                                        onClick={() => onRetryItem(item.id)}
                                        aria-label={translate("canvasTools.canvasScriptNodeParts.retryShot", { v0: String(shotByRowId.get(item.rowId) || "") })}
                                    >
                                        <RefreshCw className="size-3.5" />
                                    </button>
                                </Tooltip>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function generationBatchModeLabel(batch: CanvasGenerationBatch) {
    return batch.mode === "storyboard_video" ? translate("nav.sidebar.toolboxVideo") : batch.mode === "storyboard_image" ? translate("canvasTools.canvasScriptNodeParts.storyboardFrameGeneration") : translate("canvasTools.canvasScriptNodeParts.actionBoardGeneration");
}

export function generationBatchSummary(batch: CanvasGenerationBatch) {
    const count = (status: CanvasGenerationBatchItemStatus) => batch.items.filter((item) => item.status === status).length;
    const generating = count("submitting") + count("queued") + count("running");
    const stopped = count("cancelled");
    return translate("canvasTools.canvasScriptNodeParts.completedFailedGeneratingWaiting", { v0: String(generationBatchModeLabel(batch)), v1: String(batch.status === "completed" ? translate("account.payment.done") : batch.status === "cancelled" ? translate("create.status.stopped") : translate("canvasTools.canvasScriptNodeParts.inProgress")), v2: String(count("succeeded")), v3: String(batch.items.length), v4: String(count("failed")), v5: String(generating), v6: String(count("waiting")), v7: String(stopped ? translate("canvasTools.canvasScriptNodeParts.stopped", { v0: String(stopped) }) : "") });
}

export function generationBatchItemLabel(item: CanvasGenerationBatchItem) {
    if (item.costUncertain) return translate("canvasTools.canvasScriptNodeParts.chargePendingConfirmation");
    if (isContentModerationError(item.errorDetails)) return translate("canvasTools.canvasScriptNodeParts.reviewFailedReviseThePrompt");
    const labels: Record<CanvasGenerationBatchItemStatus, string> = { waiting: translate("canvasTools.canvasScriptNodeParts.waiting"), submitting: translate("canvasTools.canvasScriptNodeParts.submitting"), queued: translate("canvasTools.canvasScriptNodeParts.queued"), running: translate("canvasB.mediaVersion.generating"), succeeded: translate("canvasTools.canvasScriptNodeParts.success"), failed: translate("library.assets.batch.failed"), cancelled: translate("create.status.stopped") };
    return labels[item.status];
}

export function batchItemTone(item?: CanvasGenerationBatchItem): CanvasNodeStatus | undefined {
    if (!item) return undefined;
    if (item.status === "succeeded") return "success";
    if (item.status === "failed" || item.status === "cancelled") return "error";
    if (item.status === "waiting") return "idle";
    return "loading";
}
