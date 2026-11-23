import type { GenerationTask, TaskStatus } from "@/services/api/task-center";
import { translate } from "@/i18n";


export const statusLabel: Record<TaskStatus, string> = {
    queued: translate("canvasPage.taskStatus.queued"),
    running: translate("canvasB.mediaVersion.generating"),
    succeeded: translate("library.tasks.filter.succeeded"),
    failed: translate("library.assets.batch.failed"),
    cancelled: translate("shared.generationTaskDisplay.cancelled"),
};

type GenerationTaskDisplayTarget = Pick<GenerationTask, "status" | "stage" | "mediaStage" | "progress" | "providerRequestId" | "providerCancelStatus">;

const cancellablePreSubmissionStages = new Set(["queued", "等待队列调度", "后端接管任务", "正在准备创作"]);

/**
 * 只有在第三方请求尚未提交时允许取消。
 *
 * 一旦拿到 providerRequestId、进入取消协调状态，或提交结果不确定，
 * 任务可能已经产生上游费用；所有画布入口必须共用这条规则，避免
 * 活动面板、详情弹窗和任务列表出现不一致。
 */
export function canCancelGenerationTask(task: GenerationTaskDisplayTarget) {
    if (task.status !== "queued" && task.status !== "running") return false;
    if (task.providerRequestId || task.providerCancelStatus || task.mediaStage) return false;
    const stage = (task.stage || "").trim().toLowerCase();
    // Unknown running stages are treated as already submitted. A provider may
    // return a custom stage name, and showing a cancel button in that state is
    // more dangerous than conservatively hiding it after billing may begin.
    if (!stage) return task.status === "queued";
    return cancellablePreSubmissionStages.has(stage);
}

export function mediaDeliverySummary(status: TaskStatus | undefined, stage: GenerationTask["mediaStage"]) {
    if (!stage) return "";
    if (stage === "completed") return translate("shared.generationTaskDisplay.generationSucceededFileSavedAssetRegistered");
    const prefix = stage === "download" || stage === "checkpoint" ? translate("shared.generationTaskDisplay.generationSucceeded") : stage === "register" ? translate("shared.generationTaskDisplay.generationSucceededFileSaved") : translate("shared.generationTaskDisplay.generationSucceededDownloadComplete");
    const action = { download: translate("canvasA.assetView.download"), upload: translate("shared.generationTaskDisplay.uploadToOSS"), local_save: translate("shared.generationTaskDisplay.saveFile"), register: translate("shared.generationTaskDisplay.registerAsset"), checkpoint: translate("shared.generationTaskDisplay.recordRecoveryInformation") }[stage];
    return `${prefix} · ${action}${status === "failed" ? translate("shared.generationTaskDisplay.failed") : status === "cancelled" ? translate("shared.generationTaskDisplay.stopped") : translate("shared.generationTaskDisplay.pending")}`;
}

export function isGenerationTaskSubmissionUncertain(task: GenerationTaskDisplayTarget) {
    return task.stage === "submission_unknown";
}

function generationTaskSaving(task: GenerationTaskDisplayTarget) {
    return Boolean(task.mediaStage && task.mediaStage !== "completed");
}

export type GenerationSavingState = "saving" | "retrying" | "waiting";

/**
 * 保存阶段的细分，取自后端写入的 stage：正常保存、失败后自动重试（作品已生成，保存遇到问题，正在自动恢复）、
 * 等待保存并发（作品已生成，等待保存）。重试必须让用户看得见，不能一律显示成“正在保存”。
 */
export function generationTaskSavingState(stage?: string): GenerationSavingState {
    if (stage?.includes("保存遇到问题")) return "retrying";
    if (stage?.includes("等待保存")) return "waiting";
    return "saving";
}

const savingStageLabels: Record<GenerationSavingState, string> = {
    saving: translate("shared.generationTaskDisplay.generatedSavingToTheAssetLibrary"),
    retrying: translate("shared.generationTaskDisplay.savingEncounteredAProblemRetryingAutomatically"),
    waiting: translate("shared.generationTaskDisplay.generatedWaitingToSave"),
};

export function generationTaskStatusLabel(task: GenerationTaskDisplayTarget) {
    if (generationTaskSaving(task) && task.status === "failed") return translate("shared.create.creationWorkspaceMessages.saveIncomplete");
    if (generationTaskSaving(task) && (task.status === "queued" || task.status === "running")) return translate("canvasA.drawingModal.saving");
    if (isGenerationTaskSubmissionUncertain(task)) return translate("shared.generationTaskDisplay.submissionResultNeedsConfirmation");
    return statusLabel[task.status];
}

export function generationTaskStageLabel(task: GenerationTaskDisplayTarget) {
    if (isGenerationTaskSubmissionUncertain(task)) return translate("shared.generationTaskDisplay.noAutomaticRetryWasMadeToAvoidDuplicateCharges");
    // 状态标签已表达“保存中”，这里补充保存的真实进展（正常保存 / 失败后自动重试 / 等待保存）。
    if (generationTaskSaving(task) && (task.status === "queued" || task.status === "running")) return savingStageLabels[generationTaskSavingState(task.stage)];
    switch (task.stage) {
        case "queued":
        case "等待队列调度":
        case "后端接管任务":
            return translate("shared.generationTaskDisplay.preparingToCreate");
        case "generating":
        case "submitted":
        case "调用生成模型":
        case "正在准备参考素材":
        case "正在连接上游":
        case "作品创作中":
        case "上游生成中":
        case "后台仍在生成":
        case "后台仍在生成图片":
            return translate("shared.generationTaskDisplay.creating");
        case "submitting":
            return translate("shared.generationTaskDisplay.submittingGenerationRequest");
        case "等待上游任务同步":
            return translate("shared.generationTaskDisplay.syncingGenerationProgress");
        case "作品已生成，正在保存":
            return task.status === "failed" ? translate("shared.generationTaskDisplay.generatedSaveIncomplete") : translate("shared.generationTaskDisplay.generatedSavingToTheAssetLibrary");
        default:
            // 供应商自定义的英文阶段（如 provider_processing）对用户没有意义，按任务状态兜底。
            if (task.stage && /^[a-z0-9_.:-]+$/i.test(task.stage)) return task.status === "running" ? translate("shared.generationTaskDisplay.creating") : generationTaskStatusLabel(task);
            return task.stage || generationTaskStatusLabel(task);
    }
}

/**
 * 用户可见的生成阶段。画布节点和首页创作卡片共用同一套阶段与文案，
 * 不在各页面重复翻译后端 stage 字符串。只用于未结束的任务；失败和取消由各自的失败态展示。
 */
export type GenerationPhase = "submitting" | "queued" | "preparing" | "generating" | "saving" | "finalizing" | "uncertain";
export type GenerationMediaKind = "image" | "video" | "audio" | "text";

type GenerationPhaseTarget = { status?: string; stage?: string; mediaStage?: GenerationTask["mediaStage"] };

/** 三段进度依次对应：提交与排队、模型生成、保存到素材库。 */
export const GENERATION_PHASE_STEPS = [translate("shared.generationTaskDisplay.queued"), translate("account.welcome.chapters.motion.label"), translate("common.save")] as const;

const queuedPhaseStages = new Set(["queued", "等待队列调度"]);

/** 平台自己写入的阶段；除此之外的中文 stage 来自上游（例如拼车渠道的“候车 · 前面 3 条”）。 */
const platformStages = new Set([
    "queued",
    "等待队列调度",
    "后端接管任务",
    "正在准备创作",
    "正在准备参考素材",
    "正在准备生成任务",
    "正在创建任务",
    "正在连接上游",
    "submitting",
    "submitted",
    "generating",
    "调用生成模型",
    "作品创作中",
    "上游生成中",
    "后台仍在生成",
    "后台仍在生成图片",
    "等待上游任务同步",
    "作品已生成，正在保存",
    "submission_unknown",
]);

/** 按班次出片的渠道在发车前的排队阶段：这时上游给的百分比不是生成进度。 */
const upstreamQueuePattern = /候车|排队|等待发车|前面\s*\d+\s*条/;

/** 上游给出的可读阶段文案；平台内部阶段、英文代号返回空串。 */
export function upstreamGenerationStage(stage?: string) {
    const value = (stage || "").trim();
    if (!value || platformStages.has(value) || /^[a-z0-9_.:-]+$/i.test(value)) return "";
    return value;
}

function upstreamQueueStage(stage?: string) {
    const value = upstreamGenerationStage(stage);
    return Boolean(value) && upstreamQueuePattern.test(value);
}
const preparingPhaseStages = new Set(["后端接管任务", "正在准备创作", "正在准备参考素材", "正在连接上游", "submitting"]);
const generationKindNoun: Record<GenerationMediaKind, string> = { image: translate("canvasA.mediaNoun.image"), video: translate("canvasA.mediaNoun.video"), audio: translate("canvasA.mediaNoun.audio"), text: translate("canvasA.mediaNoun.text") };

export function generationTaskPhase(task: GenerationPhaseTarget | null | undefined): GenerationPhase {
    if (!task?.status) return "submitting";
    if (task.stage === "submission_unknown") return "uncertain";
    if (task.status === "succeeded") return "finalizing";
    if (task.mediaStage && task.mediaStage !== "completed") return "saving";
    const stage = task.stage || "";
    if (task.status === "queued" || queuedPhaseStages.has(stage) || upstreamQueueStage(stage)) return "queued";
    if (preparingPhaseStages.has(stage)) return "preparing";
    return "generating";
}

/** 当前所在步骤的下标；全部完成（正在载入结果）时等于步骤总数。 */
export function generationPhaseStep(phase: GenerationPhase) {
    switch (phase) {
        case "submitting":
        case "queued":
            return 0;
        case "preparing":
        case "generating":
        case "uncertain":
            return 1;
        case "saving":
            return 2;
        case "finalizing":
            return GENERATION_PHASE_STEPS.length;
    }
}

/** stage 用于细分保存阶段（正常保存 / 自动重试 / 等待保存）；排队与生成中有上游阶段文案时直接展示它。 */
export function generationPhaseLabel(phase: GenerationPhase, kind?: GenerationMediaKind, stage?: string) {
    const noun = kind ? generationKindNoun[kind] : translate("shared.generationTaskDisplay.content");
    switch (phase) {
        case "submitting":
            return translate("shared.generationTaskDisplay.submitting");
        case "queued":
            return upstreamGenerationStage(stage) || translate("canvasPage.taskStatus.queued");
        case "preparing":
            return translate("shared.generationTaskDisplay.preparingToGenerate");
        case "generating":
            return upstreamGenerationStage(stage) || translate("shared.generationTaskDisplay.generating", { v0: String(noun) });
        case "saving": {
            const saving = generationTaskSavingState(stage);
            return saving === "retrying" ? translate("shared.generationTaskDisplay.savingEncounteredAProblemRetrying") : saving === "waiting" ? translate("shared.generationTaskDisplay.waitingToSave") : translate("shared.generationTaskDisplay.saving", { v0: String(noun) });
        }
        case "finalizing":
            return translate("shared.generationTaskDisplay.loading", { v0: String(noun) });
        case "uncertain":
            return translate("shared.generationTaskDisplay.submissionResultNeedsConfirmation");
    }
}

/** 只在能给用户新信息时返回提示，其余阶段返回空串，避免每个状态都堆一行套话。 */
export function generationPhaseHint(phase: GenerationPhase, kind?: GenerationMediaKind, stage?: string) {
    switch (phase) {
        case "queued":
            return translate("shared.generationTaskDisplay.startsAutomaticallyWhenItIsYourTurn");
        case "generating":
            return kind === "video" ? translate("shared.generationTaskDisplay.generationContinuesIfYouLeaveThisPage") : "";
        case "saving": {
            const saving = generationTaskSavingState(stage);
            return saving === "retrying" ? translate("shared.generationTaskDisplay.generatedSavingIsBeingRetriedAutomaticallyWithoutRegenerating") : saving === "waiting" ? translate("shared.generationTaskDisplay.generatedWillSaveAutomaticallyWhenItIsYourTurn") : translate("shared.generationTaskDisplay.generatedSavingToTheAssetLibrary2");
        }
        case "uncertain":
            return translate("shared.generationTaskDisplay.noAutomaticRetryWasMadeToAvoidDuplicateCharges");
        default:
            return "";
    }
}

export function generationTaskShowsProgress(task: GenerationTaskDisplayTarget) {
    if (task.mediaStage && task.mediaStage !== "completed") return false;
    if (isGenerationTaskSubmissionUncertain(task)) return false;
    // 上游还在候车/排队：上游给的百分比不是生成进度，不展示。
    if (upstreamQueueStage(task.stage)) return false;
    // 排队、后端接管和连接供应商都没有真实百分比。只有上游状态响应
    // 已经写回任务后才显示进度，避免所有图片/视频长期停在同一个假数值。
    if (["queued", "等待队列调度", "后端接管任务", "正在准备参考素材", "正在连接上游", "调用生成模型", "作品创作中", "submitting", "submitted"].includes(task.stage || "")) return false;
    return typeof task.progress === "number" && task.progress > 0;
}

export const operationOptions = [
    { label: translate("shared.modelPicker.textToVideo"), value: "text_to_video" },
    { label: translate("shared.modelPicker.imageToVideo"), value: "image_to_video" },
    { label: translate("shared.generationTaskDisplay.multimodalReference"), value: "reference_to_video" },
    { label: translate("shared.modelPicker.videoContinuation"), value: "extend" },
    { label: translate("shared.generationTaskDisplay.localVideoEdit"), value: "inpaint" },
    { label: translate("shared.modelPicker.elementReplacement"), value: "replace_element" },
    { label: translate("shared.generationTaskDisplay.shotAndCameraMoveAdjustment"), value: "camera_motion" },
    { label: translate("shared.modelPicker.styleTransfer"), value: "style_transfer" },
    { label: translate("shared.generationTaskDisplay.audioToVideo"), value: "audio_to_video" },
    { label: translate("shared.generationTaskDisplay.compareResultVersions"), value: "compare_versions" },
];

export const operationLabelByValue = new Map(operationOptions.map((item) => [item.value, item.label]));

export const taskTypeLabel: Record<string, string> = {
    canvas_image: translate("shared.generationTaskDisplay.canvasImageGeneration"),
    canvas_video: translate("shared.generationTaskDisplay.canvasVideo"),
    canvas_audio: translate("shared.generationTaskDisplay.canvasAudio"),
    canvas_text: translate("shared.generationTaskDisplay.canvasText"),
};

export function formatTaskKind(task: GenerationTask) {
    const typeLabel = taskTypeLabel[task.type];
    const operationLabel = task.operation ? operationLabelByValue.get(task.operation) : "";

    if (task.type === "canvas_video" && operationLabel) return `${typeLabel || translate("shared.generationTaskDisplay.canvasVideo")} · ${operationLabel}`;
    if (typeLabel) return typeLabel;
    if (operationLabel) return operationLabel;
    if (task.type.startsWith("video_")) return translate("shared.generationTaskDisplay.videoTask");
    return translate("shared.generationTaskDisplay.generationTask");
}
