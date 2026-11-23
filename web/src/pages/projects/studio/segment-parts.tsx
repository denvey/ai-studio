import { AntTooltip as Tooltip } from "@/components/ui/base/tooltip/ant-tooltip";
import { AlertCircle, Check, Film, Loader2 } from "lucide-react";

import type { DramaCast, DramaSegment } from "@/services/api/drama";

import { aspectRatioValue, CAST_KIND_LABEL, mediaBusy, MediaThumb, useResourceMediaUrl } from "../drama-shared";
import { translate } from "@/i18n";

// 剧情段的共用展示：状态、视频、生成依据（首帧 + 参考图）。分镜卡片与镜头弹窗共用，保证两处说法一致。

export function secondsLabel(ms: number) {
    const seconds = Math.round(ms / 100) / 10;
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}

export type SegmentTone = "idle" | "busy" | "ready" | "stale" | "failed" | "blocked";

/** 等待原因的短标签：取冒号或括号前的部分，完整原因放在提示里。 */
export function videoWaitLabel(wait: string) {
    return wait.split(/[：（]/)[0] || wait;
}

/** 剧情段当前处于哪一步，以及用户下一步该做什么。detail 是需要悬停查看的完整原因。 */
export function segmentState(segment: DramaSegment): { tone: SegmentTone; label: string; detail?: string } {
    const writing = segment.promptStatus === "queued" || segment.promptStatus === "running";
    if (segment.promptStatus === "failed") return { tone: "failed", label: translate("drama.studio.segmentParts.promptWritingFailed") };
    // 视频已入库但尾帧等后处理失败：视频本身可看，重试只重新处理已有视频。
    if (segment.videoStatus === "failed") return segment.videoReprocessable ? { tone: "failed", label: translate("drama.studio.segmentParts.videoPostProcessingFailed") } : { tone: "failed", label: translate("drama.studio.segmentParts.videoGenerationFailed") };
    // 撰写作业已排队但还没提交（同时生成数或账号上限已满）：显示真实原因，不冒充“撰写中”。
    if (writing && segment.promptJob?.status === "queued" && segment.promptJob.wait) return { tone: "blocked", label: videoWaitLabel(segment.promptJob.wait), detail: segment.promptJob.wait };
    if (writing) return { tone: "busy", label: translate("drama.studio.segmentParts.writingPrompt") };
    if (segment.promptStatus === "none") return { tone: "idle", label: translate("drama.studio.segmentParts.awaitingPrompt") };
    if (segment.promptStatus === "stale" && !segment.custom) return { tone: "stale", label: translate("drama.studio.segmentParts.promptOutdated") };
    // 已请求但调度还没提交：显示真实的等待原因，不冒充“生成中”。
    if (segment.videoStatus === "queued" && segment.videoWait) return { tone: "blocked", label: videoWaitLabel(segment.videoWait), detail: segment.videoWait };
    if (segment.videoStatus === "queued" && segment.videoJob?.status !== "running") return { tone: "busy", label: translate("drama.studio.segmentParts.queuedForSubmission") };
    if (mediaBusy(segment.videoStatus)) {
        if (segment.request.firstFramePending) return { tone: "blocked", label: translate("drama.studio.segmentParts.waitingForPreviousSegment") };
        // 按班次出片的渠道会先候车，显示上游给出的真实阶段，而不是笼统的“生成中”。
        const stage = segment.videoJob?.status === "running" ? segment.videoJob.providerStage : undefined;
        return stage ? { tone: "busy", label: stage, detail: translate("drama.studio.segmentParts.providerProgress", { v0: String(stage) }) } : { tone: "busy", label: translate("drama.studio.segmentParts.generatingVideo") };
    }
    if (segment.videoStatus === "ready") return { tone: "ready", label: translate("create.status.videoGenerated") };
    if (segment.videoStatus === "stale") return { tone: "stale", label: translate("drama.studio.segmentParts.videoNeedsRegeneration") };
    return { tone: "idle", label: translate("drama.studio.segmentParts.awaitingVideoGeneration") };
}

export function promptReady(segment: DramaSegment) {
    return segment.custom || segment.promptStatus === "ready";
}

export function SegmentStatus({ segment }: { segment: DramaSegment }) {
    const state = segmentState(segment);
    return (
        <span className={`drama-sg-status is-${state.tone}`} title={state.detail}>
            {state.tone === "busy" ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : state.tone === "failed" ? (
                <AlertCircle className="size-3" aria-hidden />
            ) : state.tone === "ready" ? (
                <Check className="size-3" aria-hidden />
            ) : (
                <i aria-hidden />
            )}
            {state.label}
        </span>
    );
}

export function SegmentVideo({ segment, aspectRatio, className = "" }: { segment: DramaSegment; aspectRatio: string; className?: string }) {
    const viewable = segment.videoStatus === "ready" || segment.videoStatus === "stale" || segment.videoStatus === "failed";
    const url = useResourceMediaUrl(viewable ? segment.videoResourceId : undefined, "playback");
    const state = segmentState(segment);
    return (
        <div className={`drama-sg-video ${className}`} style={{ aspectRatio: aspectRatioValue(aspectRatio) }}>
            {url ? (
                <video key={url} src={url} controls playsInline preload="metadata" />
            ) : (
                <span className={`drama-sg-video-empty ${state.tone === "busy" ? "is-busy" : ""}`}>
                    <Film className="size-5" aria-hidden />
                    <span>{state.label}</span>
                    <small>{secondsLabel(segment.durationMs)} {translate("drama.studio.segmentParts.dialogueAndSoundEffectsAreGeneratedByTheVideoModel")}</small>
                </span>
            )}
        </div>
    );
}

/**
 * 生成依据：首帧（第 2 段起是上一段视频的最后一帧）和随请求发送的参考图。
 * 参考图编号与提示词里的“参考图N”一致；未附图的设定说明原因。
 */
/** 参考图未随请求发送的原因；与后端 prepareDramaSegment 的判断一致。 */
export function referenceMissingReason(segment: DramaSegment, cast: DramaCast | undefined, resourceId?: string) {
    if (cast?.imageStatus === "failed") return translate("drama.studio.segmentParts.referenceImageGenerationFailed");
    if (mediaBusy(cast?.imageStatus || "")) return translate("drama.studio.segmentParts.generatingReferenceImage");
    if (cast ? !cast.imageResourceId || cast.imageStatus !== "ready" : !resourceId) return translate("drama.studio.segmentParts.referenceImageNotGenerated");
    // 生成方式未确定：视频模型不可用或时长超限，本段暂不能生成，原因见本段提示。
    if (!segment.request.operation) return translate("drama.studio.segmentParts.thisSegmentCannotBeGeneratedYet");
    if (segment.request.operation === "text_to_video") return translate("drama.studio.segmentParts.theModelUsesTextToVideoAndDoesNotAccept");
    return segment.request.referenceLimited ? translate("drama.studio.segmentParts.exceedsTheSegmentReferenceLimit") : translate("drama.studio.segmentParts.exceedsTheModelReferenceLimit");
}

export function SegmentInputs({ segment, castById, compact = false, frameOnly = false, onOpenCast }: { segment: DramaSegment; castById: Map<string, DramaCast>; compact?: boolean; frameOnly?: boolean; onOpenCast?: (id: string) => void }) {
    const { request } = segment;
    const first = segment.index === 0 && !request.firstFrameResourceId && !request.firstFramePending;
    return (
        <div className={`drama-sg-inputs ${compact ? "is-compact" : ""}`}>
            <Tooltip title={translate("drama.studio.segmentParts.firstFrame", { v0: String(first ? translate("drama.studio.segmentParts.openingSegmentGeneratedFromPromptAndReferences") : request.firstFrameResourceId ? translate("drama.studio.segmentParts.lastFrameOfSegmentVideo", { v0: String(segment.index) }) : translate("drama.studio.segmentParts.useTheLastFrameOnceSegmentVideoIsReady", { v0: String(segment.index) })) })} mouseEnterDelay={0.3}>
                <div className="drama-sg-input is-frame">
                    <span className="drama-sg-thumb is-frame">
                        {request.firstFrameResourceId ? <MediaThumb resourceId={request.firstFrameResourceId} alt={translate("drama.studio.segmentParts.lastFrameOfPreviousSegment")} /> : <span className="drama-sg-thumb-empty">{first ? translate("drama.studio.segmentParts.opening") : translate("drama.studio.segmentParts.waiting")}</span>}
                        <em>{translate("canvasC.videoPromptTools.startFrame")}</em>
                    </span>
                    {compact ? null : (
                        <span className="drama-sg-input-text">
                            <b>{translate("canvasC.videoPromptTools.startFrame")}</b>
                            <small>{first ? translate("drama.studio.segmentParts.openingSegmentGeneratedFromThePrompt") : request.firstFrameResourceId ? translate("drama.studio.segmentParts.lastFrameOfSegment", { v0: String(segment.index) }) : translate("drama.studio.segmentParts.waitingForSegmentVideo", { v0: String(segment.index) })}</small>
                        </span>
                    )}
                </div>
            </Tooltip>
            {(frameOnly ? [] : request.references).map((ref) => {
                const cast = castById.get(ref.castId);
                const reason = ref.sent ? "" : referenceMissingReason(segment, cast, ref.resourceId);
                const body = (
                    <>
                        <span className={`drama-sg-thumb is-wide ${ref.sent ? "" : "is-missing"}`}>
                            {ref.resourceId || cast?.imageResourceId ? <MediaThumb resourceId={ref.resourceId || cast!.imageResourceId!} alt={ref.name} /> : <span className="drama-sg-thumb-empty">{CAST_KIND_LABEL[ref.kind]}</span>}
                            <em>{ref.label.replace(translate("canvasPage.connection.referenceImage"), translate("drama.studio.segmentParts.image"))}</em>
                        </span>
                        {compact ? null : (
                            <span className="drama-sg-input-text">
                                <b>{ref.name}</b>
                                <small>
                                    {CAST_KIND_LABEL[ref.kind]} · {ref.sent ? translate("drama.studio.segmentParts.sentWithRequest") : translate("drama.studio.segmentParts.imageNotAttached", { v0: String(reason) })}
                                </small>
                            </span>
                        )}
                    </>
                );
                return (
                    <Tooltip key={ref.castId || ref.resourceId} title={`${ref.label} · ${CAST_KIND_LABEL[ref.kind]} · ${ref.name}${ref.sent ? "" : translate("drama.studio.segmentParts.imageNotAttachedGeneratedFromTextDesign", { v0: String(reason) })}`} mouseEnterDelay={0.3}>
                        {onOpenCast && ref.castId ? (
                            <button type="button" className={`drama-sg-input ${ref.sent ? "" : "is-missing"}`} onClick={() => onOpenCast(ref.castId)}>
                                {body}
                            </button>
                        ) : (
                            <span className={`drama-sg-input ${ref.sent ? "" : "is-missing"}`}>{body}</span>
                        )}
                    </Tooltip>
                );
            })}
        </div>
    );
}
