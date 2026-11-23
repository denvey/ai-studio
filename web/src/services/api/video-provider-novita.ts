import { imageToDataUrl } from "@/services/image-storage";
import { modelOptionName } from "@/stores/use-config-store";
import { isPublicMediaUrl } from "./video-validation";
import { normalizeSeedanceDuration } from "@/lib/seedance-video";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

import type { RequestOptions, ResolvedAiConfig, VideoGenerationTask, VideoGenerationTaskState } from "./video-contracts";
import type { VideoProviderDeps } from "./video-provider-deps";
import { translate } from "@/i18n";


type NovitaVideoResult = { task?: { status?: string; reason?: string }; videos?: Array<{ video_url?: string }> };

export async function createNovitaVideoTask(deps: VideoProviderDeps, config: ResolvedAiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (references.length > 1 || videoReferences.length || audioReferences.length) throw new Error(translate("shared.api.videoProviderNovita.novitaVideoSupportsOnly1StartingImageWithoutReferenceVideo"));
    if (references.length && options?.videoEditOperation === "reference_to_video") throw new Error(translate("shared.api.videoProviderNovita.novitaVideoDoesNotSupportCharacterOrStyleReferenceImages"));
    const payload: Record<string, unknown> = {
        model: modelOptionName(model),
        prompt: prompt.trim(),
        duration: normalizeNovitaVideoDuration(config.videoSeconds),
    };
    if (references[0]) {
        payload.image = isPublicMediaUrl(references[0].url || "") ? references[0].url : await imageToDataUrl(references[0]);
    } else {
        payload.aspect_ratio = normalizeNovitaVideoRatio(config.size);
    }
    try {
        const created = await deps.transport.post<{ task_id?: string }>(novitaVideoUrl(config, "/video/create"), payload, options);
        if (!created.task_id) throw new Error(translate("shared.api.videoProviderNovita.theNovitaVideoAPIReturnedNoTaskID"));
        return { id: created.task_id, provider: "novita", model };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, translate("shared.api.videoProviderNovita.failedToCreateTheNovitaVideoTask")));
    }
}

export async function pollNovitaVideoTask(deps: VideoProviderDeps, config: ResolvedAiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const result = await deps.transport.get<NovitaVideoResult>(novitaVideoUrl(config, `/async/task-result?task_id=${encodeURIComponent(task.id)}`), options);
        const status = result.task?.status || "";
        if (status === "TASK_STATUS_SUCCEED") {
            const url = result.videos?.[0]?.video_url || "";
            if (!url) return { status: "failed", error: translate("shared.api.videoProviderNovita.theNovitaVideoTaskCompletedButReturnedNoVideoURL") };
            return { status: "completed", result: await deps.response.videoResultFromUrl(url, options) };
        }
        if (status === "TASK_STATUS_FAILED") return { status: "failed", error: result.task?.reason || translate("shared.api.videoProviderNovita.videoGenerationFailed") };
        return { status: "pending" };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, translate("shared.api.videoProviderNovita.failedToQueryTheNovitaVideoTask")));
    }
}

function novitaVideoUrl(config: ResolvedAiConfig, path: string) {
    return `${config.baseUrl.replace(/\/+$/, "")}${path}`;
}

function normalizeNovitaVideoDuration(value: string) {
    return normalizeSeedanceDuration(value) >= 8 ? "10" : "5";
}

function normalizeNovitaVideoRatio(value: string) {
    return value === "16:9" || value === "9:16" || value === "1:1" ? value : "16:9";
}
