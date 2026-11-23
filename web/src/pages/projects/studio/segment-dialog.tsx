import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Button, Input, InputNumber, Popover, Select } from "antd";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { AntTooltip as Tooltip } from "@/components/ui/base/tooltip/ant-tooltip";
import { AlertTriangle, Brush, Check, ChevronLeft, ChevronRight, Copy, Info, Loader2, Pencil, Play, Plus, RotateCcw, Trash2, X, PenLine } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal";
import { TRANSITION_LABEL } from "@/lib/drama/storyboard";
import type { DramaCast, DramaEpisodeDetail, DramaModelChoice, DramaSegment, DramaSegmentReferencePatch, DramaShot, DramaShotPatch, DramaTransition } from "@/services/api/drama";
import { ReferenceBoard } from "./segment-references";
import { dramaChoiceKey } from "@/lib/drama/model-choice";

import { DramaModelPicker, useDramaModelCatalog } from "../drama-model-picker";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { dramaSegmentQuoteMissing, dramaSegmentVideoRequirements, dramaVideoOptionFor, SEGMENT_NO_QUOTE_HINT } from "./segment-quote";

import { CAST_KIND_LABEL, formatCredits, mediaBusy, MediaThumb, shotVisualLabel } from "../drama-shared";
import { promptReady, secondsLabel, SegmentStatus, SegmentVideo, videoWaitLabel } from "./segment-parts";
import { DramaTakeList } from "./take-list";
import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { translate } from "@/i18n";

const SHOT_SIZES = ["特写", "近景", "中景", "全景", "远景"];
const CAMERAS = ["固定", "推", "拉", "摇", "跟", "环绕", "升降", "手持"];

const PROMPT_NOTICE: Record<DramaSegment["promptStatus"], string> = {
    none: translate("drama.studio.segmentDialog.thisSegmentSVideoPromptHasNotBeenWrittenYet"),
    queued: translate("drama.studio.segmentDialog.queuedForWriting"),
    running: translate("drama.studio.segmentDialog.writingThisSegmentSVideoPrompt"),
    ready: "",
    stale: translate("drama.studio.segmentDialog.shotsOrDesignsInThisSegmentChangedThePromptIs"),
    failed: translate("drama.studio.segmentDialog.writingFailed"),
};

const OPERATION_LABEL: Record<DramaSegment["request"]["operation"], string> = {
    image_to_video: translate("drama.studio.segmentDialog.imageToVideoPreviousSegmentSLastFrameAsFirst"),
    reference_to_video: translate("drama.studio.segmentDialog.referenceToVideo"),
    text_to_video: translate("drama.studio.segmentDialog.textToVideo"),
    "": translate("drama.studio.segmentDialog.undetermined"),
};

type Props = {
    detail?: DramaEpisodeDetail;
    segmentIndex?: number;
    shotId?: string;
    castById: Map<string, DramaCast>;
    aspectRatio: string;
    busy: boolean;
    writing: boolean;
    onClose: () => void;
    onNavigate: (segmentIndex: number, shotId?: string) => void;
    onPatchShot: (shot: DramaShot, patch: DramaShotPatch) => void;
    /** 在镜头前后插入空镜头；不传时不显示插入入口。 */
    onInsertShot?: (shot: DramaShot, position: "before" | "after") => void;
    /** 删除镜头；剧情段唯一的镜头不能删。 */
    onDeleteShot?: (shot: DramaShot) => void;
    onSavePrompt: (segment: DramaSegment, override: string) => void;
    /** 指定本段参考图；null 恢复按镜头自动取。 */
    onSaveReferences: (segment: DramaSegment, patch: DramaSegmentReferencePatch) => Promise<unknown>;
    onWritePrompt: (segment: DramaSegment) => void;
    onGenerate: (segment: DramaSegment, model?: DramaModelChoice) => void;
    reprocessing: boolean;
    onReprocess: (segment: DramaSegment) => void;
    defaultVideoModel: DramaModelChoice;
    /** 作品指定的视频分辨率；换模型时给不出的置灰。 */
    videoResolution?: string;
    onOpenCast: (castId: string) => void;
    /** 把本段投送到精修画布（已投送则定位），在画布上换首尾帧、延长或重新生成后采用回来。 */
    onOpenCanvas: (segment: DramaSegment) => void;
    canvasOpening: boolean;
};

/**
 * 剧情段弹窗（生成节点）：上方是本段的生成控制（视频模型、时长、画幅与操作），
 * 接着是本段使用的参考资产（可逐个勾选）、生成依据回执与按时间排开的镜头脚本，最后是提交时发送的完整提示词；
 * 右侧固定本段视频、处理状态与版本记录。
 */
export function SegmentDialog({
    detail,
    segmentIndex,
    shotId,
    castById,
    aspectRatio,
    busy,
    writing,
    reprocessing,
    defaultVideoModel,
    videoResolution,
    onClose,
    onNavigate,
    onPatchShot,
    onInsertShot,
    onDeleteShot,
    onSavePrompt,
    onSaveReferences,
    onWritePrompt,
    onGenerate,
    onReprocess,
    onOpenCast,
    onOpenCanvas,
    canvasOpening,
}: Props) {
    const segments = detail?.segments || [];
    const position = segments.findIndex((item) => item.index === segmentIndex);
    const segment = position >= 0 ? segments[position] : undefined;
    const shots = segment ? (detail?.shots || []).filter((shot) => shot.segmentIndex === segment.index) : [];
    return (
        <AppModal
            open={Boolean(segment)}
            onCancel={onClose}
            footer={null}
            title={null}
            closable={false}
            flush
            centered
            width="min(1360px, calc(100vw - 48px))"
            rootClassName="drama-root drama-sd-root"
            aria-label={segment ? translate("drama.studio.segmentDialog.segment", { v0: String(segment.index + 1) }) : translate("drama.studio.segmentDialog.storySegment")}
        >
            {segment && detail ? (
                <div className="drama-sd">
                    <header className="drama-sd-head">
                        <div className="min-w-0">
                            <div className="drama-eyebrow">
                                {translate("drama.sentences.segmentMeta", {
                                    episode: detail.episode.number,
                                    segment: segment.index + 1,
                                    total: segments.length,
                                    shots: shots.length ? `${shots[0].position + 1}–${shots[shots.length - 1].position + 1}` : "—",
                                })}
                            </div>
                            <div className="drama-sd-title">
                                <h2>{segment.title}</h2>
                                <span className="drama-sdx-total">
                                    {translate("drama.studio.segmentDialog.totalDuration")} {secondsLabel(segment.durationMs)}
                                </span>
                                <SegmentStatus segment={segment} />
                            </div>
                        </div>
                        <div className="drama-sd-nav">
                            <Button icon={<Brush className="size-4" />} loading={canvasOpening} onClick={() => onOpenCanvas(segment)}>
                                {translate("drama.studio.segmentDialog.refineOnCanvas")}
                            </Button>
                            <Tooltip title={translate("drama.studio.segmentDialog.previousSegment")}>
                                <Button icon={<ChevronLeft className="size-4" />} aria-label={translate("drama.studio.segmentDialog.previousSegment")} disabled={position <= 0} onClick={() => onNavigate(segments[position - 1].index)} />
                            </Tooltip>
                            <Tooltip title={translate("drama.studio.segmentDialog.nextSegment")}>
                                <Button icon={<ChevronRight className="size-4" />} aria-label={translate("drama.studio.segmentDialog.nextSegment")} disabled={position >= segments.length - 1} onClick={() => onNavigate(segments[position + 1].index)} />
                            </Tooltip>
                            <Button type="text" icon={<X className="size-4" />} aria-label={translate("common.close")} onClick={onClose} />
                        </div>
                    </header>
                    <div className="drama-sdx-body">
                        <main className="drama-sdx-main thin-scrollbar">
                            <SegmentToolbar
                                key={segment.id}
                                segment={segment}
                                aspectRatio={aspectRatio}
                                busy={busy}
                                writing={writing}
                                defaultVideoModel={defaultVideoModel}
                                videoResolution={videoResolution}
                                onGenerate={(model) => onGenerate(segment, model)}
                                onWritePrompt={() => onWritePrompt(segment)}
                            />
                            <SegmentPrompt segment={segment} castById={castById} writing={writing} onSave={(override) => onSavePrompt(segment, override)} onWrite={() => onWritePrompt(segment)} />
                            <ReferenceBoard key={segment.id} segment={segment} shots={shots} castById={castById} busy={busy} onSave={(patch) => onSaveReferences(segment, patch)} onOpenCast={onOpenCast} />
                            <SegmentReceipt segment={segment} />
                            <section className="drama-sdx-section" aria-label={translate("drama.studio.segmentDialog.shotsInThisSegment")}>
                                <div className="drama-sdx-section-head">
                                    <strong>{translate("drama.studio.segmentDialog.shotsInThisSegment")}</strong>
                                    <small>{translate("drama.studio.segmentDialog.editingShotsRequiresRegeneratingThisSegmentSPromptAndVideo")}</small>
                                </div>
                                <ol className="drama-sdx-shots">
                                    {shots.map((item, index) => (
                                        <ShotCard
                                            key={item.id}
                                            shot={item}
                                            number={index + 1}
                                            startMs={shots.slice(0, index).reduce((sum, previous) => sum + previous.durationMs, 0)}
                                            castById={castById}
                                            editing={item.id === shotId}
                                            busy={busy}
                                            deletable={shots.length > 1}
                                            onEdit={() => onNavigate(segment.index, item.id === shotId ? undefined : item.id)}
                                            onPatch={(patch) => onPatchShot(item, patch)}
                                            onInsert={onInsertShot ? (where) => onInsertShot(item, where) : undefined}
                                            onDelete={onDeleteShot ? () => onDeleteShot(item) : undefined}
                                        />
                                    ))}
                                </ol>
                            </section>
                        </main>
                        <aside className="drama-sdx-side thin-scrollbar" aria-label={translate("drama.studio.segmentDialog.segmentVideo")}>
                            <div className="drama-sdx-side-head">
                                <strong>{translate("drama.sentences.segmentVideo", { number: segment.index + 1 })}</strong>
                                <SegmentStatus segment={segment} />
                            </div>
                            <SegmentVideo segment={segment} aspectRatio={aspectRatio} />
                            {segment.videoStatus === "failed" && segment.videoError ? (
                                <div className="drama-sd-error">
                                    <strong>{segment.videoReprocessable ? translate("drama.studio.segmentDialog.videoGeneratedButPostProcessingFailed") : translate("drama.studio.segmentDialog.videoGenerationFailed")}</strong>
                                    <span>{segment.videoError}</span>
                                    {segment.videoReprocessable ? (
                                        <>
                                            <span>{translate("drama.studio.segmentDialog.reprocessingOnlyAffectsThisGeneratedVideoItWillNotRegenerate")}</span>
                                            <div className="drama-sd-error-actions">
                                                <Button size="small" icon={<RotateCcw className="size-3.5" />} loading={reprocessing} disabled={busy} onClick={() => onReprocess(segment)}>
                                                    {translate("drama.studio.segmentDialog.reprocessVideo")}
                                                </Button>
                                            </div>
                                        </>
                                    ) : null}
                                </div>
                            ) : null}
                            {segment.videoStatus === "queued" && segment.videoWait ? (
                                <div className="drama-sd-error is-wait" role="status">
                                    <strong>{translate("drama.studio.segmentDialog.videoNotSubmittedYet")}</strong>
                                    <span>{segment.videoWait}</span>
                                </div>
                            ) : null}
                            <dl className="drama-sdx-facts">
                                <div>
                                    <dt>{translate("drama.studio.segmentDialog.includedInFinalCut")}</dt>
                                    <dd>{segment.videoSeconds ? translate("drama.studio.segmentDialog.s", { v0: String(segment.videoSeconds) }) : "—"}</dd>
                                </div>
                                <div>
                                    <dt>{translate("drama.studio.segmentDialog.previousCost")}</dt>
                                    <dd>{segment.videoJob ? translate("drama.studio.segmentDialog.credits", { v0: String(formatCredits(segment.videoJob.costMicrocredits)) }) : "—"}</dd>
                                </div>
                            </dl>
                            <DramaTakeList projectId={detail.episode.projectId} ownerId={segment.id} kind="video" />
                        </aside>
                    </div>
                </div>
            ) : null}
        </AppModal>
    );
}

/** 生成控制条：本段视频模型（只对本段生效）、时长与画幅，以及撰写提示词、复制全文与生成视频。 */
function SegmentToolbar({
    segment,
    aspectRatio,
    busy,
    writing,
    defaultVideoModel,
    videoResolution,
    onGenerate,
    onWritePrompt,
}: {
    segment: DramaSegment;
    aspectRatio: string;
    busy: boolean;
    writing: boolean;
    defaultVideoModel: DramaModelChoice;
    videoResolution?: string;
    onGenerate: (model?: DramaModelChoice) => void;
    onWritePrompt: () => void;
}) {
    const { message } = App.useApp();
    const baseline = segment.videoModel?.logicalModelId || segment.videoModel?.modelKey ? segment.videoModel : defaultVideoModel;
    const [choice, setChoice] = useState<DramaModelChoice>(baseline);
    const changed = dramaChoiceKey(choice) !== dramaChoiceKey(baseline);
    const config = useEffectiveConfig();
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const catalogQuery = useDramaModelCatalog();
    const chosenOption = dramaVideoOptionFor(catalogQuery.data?.options.video, choice);
    const chosenAudioLimit = changed ? chosenOption?.maxAudios : segment.request.modelMaxAudios;
    const quoteMissing = creditsEnabled && dramaSegmentQuoteMissing(config, choice, dramaSegmentVideoRequirements(segment.request, dramaVideoOptionFor(catalogQuery.data?.options.video, choice), changed, videoResolution));
    const running = mediaBusy(segment.videoStatus);
    const writingNow = segment.promptStatus === "queued" || segment.promptStatus === "running";
    const sent = [segment.request.header, segment.videoPrompt.trim()].filter(Boolean).join("\n\n");
    const generateLabel = running
        ? segment.videoStatus === "queued" && segment.videoWait
            ? videoWaitLabel(segment.videoWait)
            : segment.request.firstFramePending
              ? translate("drama.studio.segmentDialog.queuedWaitingForSegment", { v0: String(segment.index) })
              : translate("drama.studio.segmentDialog.generatingVideo")
        : segment.videoResourceId && segment.videoStatus !== ""
          ? translate("drama.studio.segmentDialog.regenerateVideo")
          : translate("drama.studio.segmentDialog.generateSegmentVideo");
    return (
        <section className="drama-sdx-toolbar" aria-label={translate("drama.studio.segmentDialog.generationSettings")}>
            <div className="drama-sdx-toolbar-row">
                <DramaModelPicker capability="video" size="sm" value={choice} onChange={setChoice} placeholder={translate("drama.studio.segmentDialog.videoModel")} className="drama-sdx-model" aspectRatio={aspectRatio} videoResolution={videoResolution} />
                <Tooltip
                    title={
                        segment.request.maxVideoSeconds
                            ? translate("drama.studio.segmentDialog.usesThisSegmentSShotDurationModelLimitSecondsPer", { v0: String(segment.request.maxVideoSeconds) })
                            : translate("drama.studio.segmentDialog.usesThisSegmentSShotDuration")
                    }
                >
                    <span className="drama-sdx-chip">{segment.request.seconds ? `${segment.request.seconds}s` : secondsLabel(segment.durationMs)}</span>
                </Tooltip>
                <Tooltip title={translate("drama.studio.segmentDialog.aspectRatioFollowsTheProductionSettingsAndCannotChangeAfter")}>
                    <span className="drama-sdx-chip">{aspectRatio}</span>
                </Tooltip>
                {changed ? <span className="drama-sdx-chip is-accent">{translate("drama.studio.segmentDialog.changeSegmentModel")}</span> : null}
            </div>
            <div className="drama-sdx-toolbar-row">
                <Button size="small" icon={<PenLine className="size-3.5" />} loading={writing} disabled={busy || writingNow} onClick={onWritePrompt}>
                    {segment.promptStatus === "none" ? translate("drama.studio.segmentDialog.writePrompt") : translate("drama.studio.segmentDialog.rewritePrompt")}
                </Button>
                <Button
                    size="small"
                    icon={<Copy className="size-3.5" />}
                    disabled={!segment.videoPrompt}
                    onClick={() =>
                        void navigator.clipboard.writeText(sent).then(
                            () => message.success(translate("drama.studio.segmentDialog.fullSubmittedTextCopied")),
                            () => message.error(translate("canvasB.common.copyFailed")),
                        )
                    }
                >
                    {translate("drama.studio.segmentDialog.copyFullSubmittedText")}
                </Button>
                <span className="drama-sdx-spacer" />
                <Button
                    type="primary"
                    size="small"
                    icon={running ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Play className="size-3.5" />}
                    disabled={busy || !promptReady(segment) || running || Boolean(segment.request.unknownReferences?.length) || quoteMissing}
                    onClick={() => onGenerate(changed ? choice : undefined)}
                >
                    {generateLabel}
                </Button>
            </div>
            {!promptReady(segment) && !running ? <p className="drama-sdx-hint">{translate("drama.studio.segmentDialog.thePromptMustBeReadyBeforeGeneratingAVideo")}</p> : null}
            {changed && chosenAudioLimit !== undefined ? (
                <p className="drama-sdx-hint">
                    {translate("drama.studio.segmentDialog.selectedModel")}
                    {chosenAudioLimit ? translate("drama.studio.segmentDialog.supportsUpToReferenceVoices", { v0: String(chosenAudioLimit) }) : translate("drama.studio.segmentDialog.doesNotSupportReferenceVoices")}
                    {translate("drama.studio.segmentDialog.referencePanelSubmissionStatusesUpdateAfterTheModelIsApplied")}
                </p>
            ) : null}
            {quoteMissing && !running ? <p className="drama-sdx-hint is-error">{SEGMENT_NO_QUOTE_HINT}</p> : null}
            {segment.request.unknownReferences?.length ? (
                <p className="drama-sdx-hint is-error">
                    {translate("drama.studio.segmentDialog.inThePrompt")} {segment.request.unknownReferences.join("、")} {translate("drama.studio.segmentDialog.isNotAReferenceForThisSegmentCorrectTheNumber")}
                </p>
            ) : null}
        </section>
    );
}

type ReceiptRow = { tone: "ok" | "warn" | "info"; label: string; value: ReactNode };

/** 生成依据回执：本段实际会发送什么、按什么方式生成；与提交时同一函数计算。 */
function SegmentReceipt({ segment }: { segment: DramaSegment }) {
    const { request } = segment;
    const references = request.references.length;
    const sent = request.references.filter((ref) => ref.sent).length;
    const first = segment.index === 0 && !request.firstFrameResourceId && !request.firstFramePending;
    const promptText = segment.custom
        ? translate("drama.studio.segmentDialog.editedManually")
        : {
              none: translate("drama.studio.segmentDialog.notWritten"),
              queued: translate("drama.studio.segmentDialog.queuedForWriting2"),
              running: translate("drama.studio.segmentDialog.writing"),
              ready: translate("drama.studio.segmentDialog.ready"),
              stale: translate("drama.studio.segmentDialog.outdatedRewriteRequired"),
              failed: translate("drama.studio.segmentDialog.writingFailed"),
          }[segment.promptStatus];
    // 读到视频模型能力时才有画面与声音参数（aspectRatio 与它们一起填写）。
    const outputRows: ReceiptRow[] = request.aspectRatio
        ? [
              {
                  tone: request.size || request.resolution ? "ok" : "warn",
                  label: translate("drama.studio.segmentDialog.visuals"),
                  value: request.resolution
                      ? translate("drama.studio.segmentDialog.generatedAt", { v0: String(request.aspectRatio), v1: String(request.resolution) })
                      : request.size
                        ? request.aspectRatio
                        : translate("drama.studio.segmentDialog.unsupportedByTheSelectedModel", { v0: String(request.aspectRatio) }),
              },
              {
                  tone: request.generateAudio ? "ok" : "warn",
                  label: translate("canvasA.characterStudio.tabVoice"),
                  value: request.generateAudio ? translate("drama.studio.segmentDialog.theModelGeneratesDialogueAndSoundEffectsWithTheVideo") : translate("drama.studio.segmentDialog.theSelectedModelHasNoAudioOutputThisSegmentVideo"),
              },
          ]
        : [];
    const rows: ReceiptRow[] = [
        {
            tone: sent === references ? "ok" : "warn",
            label: translate("drama.studio.segmentDialog.referencesSent"),
            value: translate("drama.studio.segmentDialog.images", { v0: String(sent), v1: String(references), v2: String(references > sent ? translate("drama.studio.segmentDialog.missingImagesUseTextDesigns") : "") }),
        },
        {
            tone: first || request.firstFrameResourceId ? "ok" : "warn",
            label: translate("canvasC.videoPromptTools.startFrame"),
            value: first
                ? translate("drama.studio.segmentDialog.openingSegmentNoFirstFrame")
                : request.firstFrameResourceId
                  ? translate("drama.studio.segmentDialog.lastFrameOfSegmentVideo", { v0: String(segment.index) })
                  : translate("drama.studio.segmentDialog.waitingForSegmentVideo", { v0: String(segment.index) }),
        },
        { tone: "info", label: translate("drama.studio.segmentDialog.generationMethod"), value: OPERATION_LABEL[request.operation] },
        {
            tone: "info",
            label: translate("canvasA.assetView.duration"),
            value: translate("drama.studio.segmentDialog.seconds", {
                v0: String(request.seconds || Math.round(segment.durationMs / 1000)),
                v1: String(request.maxVideoSeconds ? translate("drama.studio.segmentDialog.modelLimitSPerGeneration", { v0: String(request.maxVideoSeconds) }) : ""),
            }),
        },
        ...outputRows,
        { tone: "info", label: translate("drama.studio.segmentDialog.videoModel"), value: segment.videoModel?.label || translate("drama.studio.segmentDialog.productionDefault") },
        { tone: promptReady(segment) ? "ok" : "warn", label: translate("canvasA.assetView.prompt"), value: promptText },
    ];
    return (
        <section className="drama-sdx-receipt" aria-label={translate("drama.studio.segmentDialog.generationInputReceipt")}>
            <strong>{translate("drama.studio.segmentDialog.generationInputReceipt")}</strong>
            <ul>
                {rows.map((row) => (
                    <li key={row.label} className={`is-${row.tone}`}>
                        {row.tone === "ok" ? <Check className="size-3.5" aria-hidden /> : row.tone === "warn" ? <AlertTriangle className="size-3.5" aria-hidden /> : <Info className="size-3.5" aria-hidden />}
                        <span>{row.label}：</span>
                        <b>{row.value}</b>
                    </li>
                ))}
                {request.warning ? (
                    <li className="is-warn">
                        <AlertTriangle className="size-3.5" aria-hidden />
                        <b>{request.warning}</b>
                    </li>
                ) : null}
            </ul>
        </section>
    );
}

/** 文本里出现的设定名高亮显示，方便核对镜头里的人物、道具与场景。 */
function HighlightCast({ text, names }: { text: string; names: string[] }) {
    if (!text || !names.length) return <>{text}</>;
    const pattern = new RegExp(`(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return (
        <>
            {text.split(pattern).map((part, index) =>
                names.includes(part) ? (
                    <mark key={index} className="drama-sdx-mention">
                        {part}
                    </mark>
                ) : (
                    part
                ),
            )}
        </>
    );
}

/** 一个镜头：类型、时间段与操作，下面直接列出景别、运镜、画面、动作与台词；编辑时展开表单。 */
function ShotCard({
    shot,
    number,
    startMs,
    castById,
    editing,
    busy,
    deletable,
    onEdit,
    onPatch,
    onInsert,
    onDelete,
}: {
    shot: DramaShot;
    number: number;
    startMs: number;
    castById: Map<string, DramaCast>;
    editing: boolean;
    busy: boolean;
    deletable: boolean;
    onEdit: () => void;
    onPatch: (patch: DramaShotPatch) => void;
    onInsert?: (where: "before" | "after") => void;
    onDelete?: () => void;
}) {
    const { modal } = App.useApp();
    const names = useMemo(
        () =>
            [...castById.values()]
                .map((cast) => cast.name)
                .filter((name) => name.length >= 2)
                .sort((left, right) => right.length - left.length),
        [castById],
    );
    const rows: Array<[string, string]> = [
        [
            translate("drama.studio.segmentDialog.shotSize"),
            [
                shotVisualLabel(shot.shotSize),
                shot.camera ? translate("drama.studio.segmentDialog.camera", { v0: shotVisualLabel(shot.camera) }) : "",
                shot.transition && shot.transition !== "cut" && shot.position > 0 ? translate("drama.studio.segmentDialog.transition2", { v0: String(TRANSITION_LABEL[shot.transition]) }) : "",
            ]
                .filter(Boolean)
                .join(" · "),
        ],
        [translate("drama.studio.segmentDialog.scene"), shot.scene],
        [translate("drama.studio.segmentDialog.visuals"), shot.imagePrompt],
        [translate("drama.studio.segmentDialog.motion"), shot.action],
        [translate("drama.studio.segmentDialog.movement"), shot.videoPrompt],
        [translate("drama.studio.segmentDialog.dialogue2"), shot.dialogue ? `${shot.speaker || translate("drama.studio.segmentDialog.narration")}：${shot.dialogue}` : translate("canvasB.common.none")],
    ];
    return (
        <li className={`drama-sdx-shot ${editing ? "is-editing" : ""}`}>
            <div className="drama-sdx-shot-head">
                <b className="drama-sdx-shot-index">{number}</b>
                <span className="drama-sdx-chip">{shot.dialogue ? translate("drama.studio.segmentDialog.dialogueShot") : translate("drama.studio.segmentDialog.actionShot")}</span>
                <span className="drama-sdx-shot-time">
                    {secondsLabel(startMs)}–{secondsLabel(startMs + shot.durationMs)}
                </span>
                <span className="drama-sdx-shot-duration">{secondsLabel(shot.durationMs)}</span>
                <span className="drama-sdx-spacer" />
                {onInsert ? (
                    <Tooltip title={translate("drama.studio.segmentDialog.insertEmptyShotAfter")}>
                        <Button size="small" icon={<Plus className="size-3.5" />} disabled={busy} onClick={() => onInsert("after")}>
                            {translate("drama.studio.segmentDialog.shots")}
                        </Button>
                    </Tooltip>
                ) : null}
                {onDelete ? (
                    <Tooltip title={deletable ? translate("drama.studio.segmentDialog.deleteShot") : translate("drama.studio.segmentDialog.theSegmentSOnlyShotCannotBeDeleted")}>
                        <Button
                            size="small"
                            icon={<Trash2 className="size-3.5" />}
                            aria-label={translate("drama.studio.segmentDialog.deleteShot")}
                            disabled={busy || !deletable}
                            onClick={() =>
                                modal.confirm({
                                    title: translate("drama.studio.segmentDialog.deleteShot2", { v0: String(number) }),
                                    content: translate("drama.studio.segmentDialog.theSegmentSPromptAndVideoWillNeedRegenerationAfter"),
                                    okText: translate("common.delete"),
                                    okButtonProps: { danger: true },
                                    cancelText: translate("common.cancel"),
                                    centered: true,
                                    onOk: onDelete,
                                })
                            }
                        />
                    </Tooltip>
                ) : null}
                <Button size="small" type={editing ? "primary" : "default"} icon={<Pencil className="size-3.5" />} aria-pressed={editing} onClick={onEdit}>
                    {editing ? translate("account.payment.done") : translate("account.settings.channels.edit")}
                </Button>
            </div>
            {editing ? (
                <ShotEditor key={shot.id} shot={shot} onPatch={onPatch} />
            ) : (
                <dl className="drama-sdx-shot-body">
                    {rows
                        .filter(([, value]) => value)
                        .map(([label, value]) => (
                            <div key={label}>
                                <dt>{label}</dt>
                                <dd>
                                    <HighlightCast text={value} names={names} />
                                </dd>
                            </div>
                        ))}
                </dl>
            )}
        </li>
    );
}

// 与服务端 production.referenceTokenPattern 一致：“@参考图1”“参考图 1”保存时都会归一成“参考图1”。
const REFERENCE_TOKEN = /@?参考图\s*(\d+)/g;

/** 正文里引用到的参考图编号，以及不属于本段的编号（超出参考图数量）。 */
function referenceUsage(text: string, count: number) {
    const used = new Set<number>();
    const unknown: string[] = [];
    for (const match of text.matchAll(REFERENCE_TOKEN)) {
        const number = Number(match[1]);
        if (number >= 1 && number <= count) used.add(number);
        else if (!unknown.includes(`参考图${match[1]}`)) unknown.push(`参考图${match[1]}`);
    }
    return { used, unknown };
}

const PROMPT_EDITOR_MIN = 260;
const PROMPT_EDITOR_MAX = 560;

/**
 * 完整视频提示词：与画布视频节点的提示词面板一致，正文里的“参考图N”显示为带缩略图的引用，输入 @ 可插入本段参考图。
 * 提交时系统在正文前追加参考图对应说明（上方列出），视频模型靠同一个“参考图N”把名称与图片对上。
 */
function SegmentPrompt({ segment, castById, writing, onSave, onWrite }: { segment: DramaSegment; castById: Map<string, DramaCast>; writing: boolean; onSave: (override: string) => void; onWrite: () => void }) {
    const [draft, setDraft] = useState(segment.videoPrompt);
    const [editorHeight, setEditorHeight] = useState(PROMPT_EDITOR_MIN);
    const [showHeader, setShowHeader] = useState(false);
    useEffect(() => setDraft(segment.videoPrompt), [segment.videoPrompt]);
    const busy = segment.promptStatus === "queued" || segment.promptStatus === "running";
    const notice = segment.custom && segment.promptStatus === "stale" ? "" : PROMPT_NOTICE[segment.promptStatus];
    const dirty = draft.trim() !== segment.videoPrompt.trim();
    const { request } = segment;
    const references = useMemo<CanvasResourceReference[]>(
        () =>
            request.references.map((ref) => {
                const resourceId = ref.resourceId || castById.get(ref.castId)?.imageResourceId;
                return {
                    id: `drama-ref:${ref.castId || ref.resourceId}`,
                    nodeId: "",
                    kind: "image",
                    label: ref.label,
                    title: `${ref.name} · ${CAST_KIND_LABEL[ref.kind]}${ref.sent ? "" : translate("drama.studio.segmentDialog.imageNotAttached")}`,
                    storageKey: resourceId ? `resource:${resourceId}` : undefined,
                    mentionToken: ref.label,
                    active: true,
                };
            }),
        [castById, request.references],
    );
    const usage = useMemo(() => referenceUsage(draft, request.references.length), [draft, request.references.length]);
    // 与服务端一致按字符（码点）计：参考图说明 + 空行 + 正文。
    const sentChars = Array.from([request.header, draft.trim()].filter(Boolean).join("\n\n")).length;
    const overLimit = Boolean(request.promptMaxChars && sentChars > request.promptMaxChars);
    const unmentioned = request.references.filter((_, index) => !usage.used.has(index + 1));
    const commit = () => {
        const next = draft.trim();
        if (!dirty) return;
        if (!next) {
            setDraft(segment.videoPrompt);
            return;
        }
        onSave(next === segment.generated.trim() ? "" : next);
    };
    return (
        <section className="drama-sdx-section drama-sdx-prompt" aria-label={translate("drama.studio.segmentDialog.fullVideoPrompt")}>
            <div className="drama-sdx-section-head">
                <strong>{translate("drama.studio.segmentDialog.fullVideoPrompt")}</strong>
                {segment.custom ? <span className="drama-sdx-chip is-accent">{translate("drama.studio.segmentDialog.editedManually")}</span> : null}
                <small>{translate("drama.studio.segmentDialog.nInTheTextRefersToThisSegmentSReferences")}</small>
                {segment.custom ? (
                    <Button size="small" type="text" icon={<RotateCcw className="size-3.5" />} onClick={() => onSave("")}>
                        {translate("drama.studio.segmentDialog.restoreModelVersion")}
                    </Button>
                ) : null}
            </div>
            {notice && segment.videoPrompt ? <PromptNotice segment={segment} text={notice} /> : null}
            {request.header ? (
                <div className="drama-sdx-prefix" aria-label={translate("drama.studio.segmentDialog.referenceInstructionsPrependedOnSubmission")}>
                    <div className="drama-sdx-prefix-head">
                        <span>{translate("drama.studio.segmentDialog.prependedAutomaticallyOnSubmission")}</span>
                        <button type="button" className="drama-sdx-link" aria-expanded={showHeader} onClick={() => setShowHeader((value) => !value)}>
                            {showHeader ? translate("drama.studio.segmentDialog.hideSource") : translate("drama.studio.segmentDialog.viewSourceText")}
                        </button>
                    </div>
                    <div className="drama-sdx-prefix-refs">
                        {segment.index > 0 ? <span className="drama-sdx-prefix-ref is-frame">{translate("drama.studio.segmentDialog.firstFrameLastFrameOfPreviousSegmentNotNumbered")}</span> : null}
                        {request.references.map((ref, index) => {
                            const resourceId = ref.resourceId || castById.get(ref.castId)?.imageResourceId;
                            const caption = ref.sent ? `${ref.label}：${ref.name}` : translate("drama.studio.segmentDialog.imageNotAttachedGeneratedFromTextDesign", { v0: String(ref.label), v1: String(ref.name) });
                            const chip = (
                                <span
                                    key={ref.castId || ref.resourceId}
                                    className={`drama-sdx-prefix-ref ${ref.sent ? "" : "is-missing"} ${usage.used.has(index + 1) ? "" : "is-unused"}`}
                                    title={resourceId ? undefined : caption}
                                    tabIndex={resourceId ? 0 : undefined}
                                    aria-label={caption}
                                >
                                    <span className="drama-sdx-prefix-thumb">{resourceId ? <MediaThumb resourceId={resourceId} alt="" /> : null}</span>
                                    <b>{ref.label}</b>
                                    {ref.name}
                                </span>
                            );
                            if (!resourceId) return chip;
                            return (
                                <Popover
                                    key={ref.castId || ref.resourceId}
                                    trigger={["hover", "focus"]}
                                    mouseEnterDelay={0.2}
                                    placement="bottom"
                                    content={
                                        <figure className="drama-sdx-prefix-preview">
                                            <CachedResourceImage storageKey={`resource:${resourceId}`} alt={caption} eager draggable={false} />
                                            <figcaption>{caption}</figcaption>
                                        </figure>
                                    }
                                >
                                    {chip}
                                </Popover>
                            );
                        })}
                    </div>
                    {showHeader ? <pre>{request.header}</pre> : null}
                </div>
            ) : null}
            {!segment.videoPrompt && !draft && !busy ? (
                <div className="drama-sd-write">
                    <span>
                        {notice}
                        {segment.promptStatus === "failed" && segment.promptError ? `：${segment.promptError}` : ""}
                    </span>
                    <Button size="small" type="primary" icon={<PenLine className="size-3.5" />} loading={writing} onClick={onWrite}>
                        {segment.promptStatus === "none" ? translate("drama.studio.segmentDialog.writeWithModel") : translate("drama.studio.segmentDialog.rewrite")}
                    </Button>
                </div>
            ) : null}
            {segment.videoPrompt || draft || !busy ? (
                <div className="drama-sdx-editor" style={{ height: Math.min(PROMPT_EDITOR_MAX, Math.max(PROMPT_EDITOR_MIN, editorHeight + 4)) }}>
                    <CanvasResourceMentionTextarea
                        value={draft}
                        references={references}
                        onChange={(next) => {
                            setDraft(next);
                        }}
                        onSubmit={commit}
                        sendOnEnter={false}
                        onContentSizeChange={setEditorHeight}
                        mentionMenuLabels={{ connected: translate("drama.studio.segmentDialog.segmentReferenceImages") }}
                        className="drama-sdx-editor-input thin-scrollbar"
                        style={{ color: "var(--foreground)" }}
                        aria-label={translate("drama.studio.segmentDialog.fullVideoPrompt")}
                        placeholder={translate("drama.studio.segmentDialog.youCanAlsoWriteTheFullSegmentVideoPromptHere")}
                        onBlur={commit}
                        onKeyDown={(event) => {
                            if (event.key === "Escape" && dirty) {
                                event.stopPropagation();
                                setDraft(segment.videoPrompt);
                            }
                        }}
                    />
                </div>
            ) : (
                <div className="drama-sd-empty">
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                    <span>{notice}</span>
                    <small>{translate("drama.studio.segmentDialog.appearsAutomaticallyWhenReady")}</small>
                </div>
            )}
            {usage.unknown.length ? (
                <p className="drama-sg-note is-error" role="alert">
                    {translate("drama.sentences.unknownSegmentReference", { references: usage.unknown.join(", "), count: request.references.length })}
                </p>
            ) : draft && unmentioned.length ? (
                <p className="drama-sg-note">{translate("drama.sentences.unmentionedReferences", { references: unmentioned.map((ref) => `${ref.label} (${ref.name})`).join(", ") })}</p>
            ) : null}
            {overLimit ? (
                <p className="drama-sg-note is-error" role="alert">
                    {translate("drama.sentences.segmentCharacterLimit", { count: sentChars, limit: request.promptMaxChars })}
                    {segment.custom ? translate("drama.studio.segmentDialog.shortenTheManuallyEditedPromptBeforeGeneratingAVideo") : translate("drama.studio.segmentDialog.thePromptWillBeRewrittenToFitTheLimitBefore")}
                </p>
            ) : null}
            <div className="drama-sd-pane-foot">
                {dirty ? <span className="is-dirty">{translate("drama.studio.segmentDialog.unsavedLeaveTheFieldOrPressToSaveEscTo")}</span> : <span>{translate("drama.studio.segmentDialog.editTheTextDirectlyChangesSaveWhenFocusLeavesThe")}</span>}
                <span className={overLimit ? "is-over" : undefined} title={translate("drama.studio.segmentDialog.usesTheVideoModelSValidationRuleReferenceInstructionsPrompt")}>
                    {translate("drama.studio.segmentDialog.fullSubmittedText")} {sentChars}
                    {request.promptMaxChars ? ` / ${request.promptMaxChars}` : ""} {translate("drama.studio.segmentDialog.characters2")}
                </span>
            </div>
        </section>
    );
}

function PromptNotice({ segment, text }: { segment: DramaSegment; text: ReactNode }) {
    const busy = segment.promptStatus === "queued" || segment.promptStatus === "running";
    return (
        <div className={`drama-sd-notice is-${segment.promptStatus}`}>
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            <span>
                {text}
                {segment.promptStatus === "failed" && segment.promptError ? `：${segment.promptError}` : ""}
            </span>
        </div>
    );
}

/** 单个镜头的剧本内容；镜头是撰写段提示词的素材，不再单独生成媒体。 */
export function ShotEditor({ shot, onPatch }: { shot: DramaShot; onPatch: (patch: DramaShotPatch) => void }) {
    return (
        <div className="drama-sd-form">
            <FieldText label={translate("drama.studio.segmentDialog.dialogue")} value={shot.dialogue} placeholder={translate("drama.studio.segmentDialog.noDialogue")} onSave={(value) => onPatch({ dialogue: value })} />
            <div className="drama-sd-row">
                <label className="drama-sd-field">
                    <span className="drama-sd-label">
                        <span>{translate("drama.studio.segmentDialog.speaker")}</span>
                    </span>
                    <Input
                        defaultValue={shot.speaker}
                        key={`${shot.id}-speaker-${shot.speaker}`}
                        placeholder={translate("drama.studio.segmentDialog.narration")}
                        aria-label={translate("drama.studio.segmentDialog.speaker")}
                        onBlur={(event) => {
                            if (event.target.value.trim() !== shot.speaker) onPatch({ speaker: event.target.value });
                        }}
                    />
                </label>
                <label className="drama-sd-field">
                    <span className="drama-sd-label">
                        <span>{translate("canvasA.assetView.duration")}</span>
                    </span>
                    <InputNumber
                        key={`${shot.id}-${shot.durationMs}`}
                        className="!w-full"
                        min={1}
                        max={60}
                        step={0.5}
                        precision={1}
                        defaultValue={shot.durationMs / 1000}
                        suffix={translate("account.settings.models.unitSecond")}
                        aria-label={translate("drama.studio.segmentDialog.shotDuration")}
                        onBlur={(event) => {
                            const seconds = Number(event.target.value);
                            if (Number.isFinite(seconds) && Math.abs(seconds * 1000 - shot.durationMs) >= 50) onPatch({ durationSeconds: seconds });
                        }}
                        onPressEnter={(event) => (event.target as HTMLInputElement).blur()}
                    />
                </label>
            </div>
            <div className="drama-sd-row is-three">
                <label className="drama-sd-field">
                    <span className="drama-sd-label">
                        <span>{translate("drama.studio.segmentDialog.shotSize")}</span>
                    </span>
                    <Select
                        className="w-full"
                        value={shot.shotSize || undefined}
                        placeholder={translate("account.layout.oss.auto")}
                        aria-label={translate("drama.studio.segmentDialog.shotSize")}
                        options={SHOT_SIZES.map((value) => ({ value, label: shotVisualLabel(value) }))}
                        onChange={(value) => onPatch({ shotSize: value })}
                    />
                </label>
                <label className="drama-sd-field">
                    <span className="drama-sd-label">
                        <span>{translate("canvasA.toolPicker.motion.short")}</span>
                    </span>
                    <Select
                        className="w-full"
                        value={shot.camera || undefined}
                        placeholder={translate("account.layout.oss.auto")}
                        aria-label={translate("canvasA.toolPicker.motion.short")}
                        options={CAMERAS.map((value) => ({ value, label: shotVisualLabel(value) }))}
                        onChange={(value) => onPatch({ camera: value })}
                    />
                </label>
                <label className="drama-sd-field">
                    <span className="drama-sd-label">
                        <span>{translate("drama.studio.segmentDialog.transition")}</span>
                    </span>
                    <Select
                        className="w-full"
                        value={(shot.transition || "cut") as DramaTransition}
                        aria-label={translate("drama.studio.segmentDialog.transition")}
                        options={(Object.keys(TRANSITION_LABEL) as DramaTransition[]).map((value) => ({ value, label: TRANSITION_LABEL[value] }))}
                        disabled={shot.position === 0}
                        onChange={(value) => onPatch({ transition: value })}
                    />
                </label>
            </div>
            <FieldText label={translate("drama.studio.segmentDialog.motion")} value={shot.action} rows={2} onSave={(value) => onPatch({ action: value })} />
            <FieldText label={translate("drama.studio.segmentDialog.openingFrame")} value={shot.imagePrompt} rows={2} onSave={(value) => onPatch({ imagePrompt: value })} />
            {shot.sourceQuote ? (
                <div className="drama-sd-quote">
                    <span className="drama-sd-label">
                        <span>{translate("drama.studio.segmentDialog.sourceText")}</span>
                    </span>
                    <p>「{shot.sourceQuote}」</p>
                </div>
            ) : null}
        </div>
    );
}

function FieldText({ label, value, placeholder, rows = 1, onSave }: { label: string; value: string; placeholder?: string; rows?: number; onSave: (value: string) => void }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    return (
        <label className="drama-sd-field">
            <span className="drama-sd-label">
                <span>{label}</span>
                {draft !== value ? <small className="is-dirty">{translate("account.settings.prompts.unsaved")}</small> : null}
            </span>
            <Input.TextArea
                value={draft}
                placeholder={placeholder}
                autoSize={{ minRows: rows, maxRows: 5 }}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                    if (draft.trim() !== value.trim()) onSave(draft);
                }}
            />
        </label>
    );
}
