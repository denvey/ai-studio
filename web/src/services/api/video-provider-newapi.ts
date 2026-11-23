import { modelCapabilityConfigFor, videoResolutionRequest } from "@/lib/model-capabilities";
import { boolConfig } from "@/lib/seedance-video";
import { getResourceInputURL } from "@/services/api/resources";
import { modelOptionName } from "@/stores/use-config-store";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { ReferenceImage } from "@/types/image";

import type { ApiEnvelope, ApiVideoResponse, RequestOptions, ResolvedAiConfig, VideoGenerationTask, VideoGenerationTaskState } from "./video-contracts";
import type { VideoProviderDeps } from "./video-provider-deps";
import { normalizeVideoSeconds, normalizeVideoSize } from "./video-validation";
import { translate } from "@/i18n";


export async function createVideoGenerationsTask(deps: VideoProviderDeps, config: ResolvedAiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const profile = modelCapabilityConfigFor(config, model).video!;
    const { maxImages, maxVideos, maxAudios } = profile.references;
    if (references.length > maxImages || videoReferences.length > maxVideos || audioReferences.length > maxAudios) {
        throw new Error(translate("shared.api.videoProviderNewapi.theCurrentNewAPIVideoGenerationsModelSupportsUpToReference", { v0: String(maxImages), v1: String(maxVideos), v2: String(maxAudios) }));
    }
    if (audioReferences.length > 0 && videoReferences.length === 0) throw new Error(translate("shared.api.videoProviderNewapi.newAPIVideoGenerationsRequiresAtLeast1ReferenceVideoWhen"));
    const [imageUrls, videoUrls, audioUrls] = await Promise.all([
        Promise.all(references.map((item) => resolveVideoGenerationsUrl(item.url || item.dataUrl, item.storageKey))),
        Promise.all(videoReferences.map((item) => resolveVideoGenerationsUrl(item.url, item.storageKey))),
        Promise.all(audioReferences.map((item) => resolveVideoGenerationsUrl(item.url, item.storageKey))),
    ]);
    const resolution = newAPIVideoResolutionRequest(profile, config.vquality, modelOptionName(model));
    const payload = {
        model: modelOptionName(model),
        prompt: prompt.trim(),
        seconds: normalizeVideoSeconds(config.videoSeconds),
        aspect_ratio: normalizeVideoSize(config.size) || "16:9",
        ...(resolution ? { resolution } : {}),
        ...(profile.generateAudio.supported ? { generate_audio: boolConfig(config.videoGenerateAudio, profile.generateAudio.default) } : {}),
        ...(imageUrls.length ? { image_urls: imageUrls } : {}),
        ...(videoUrls.length ? { video_urls: videoUrls } : {}),
        ...(audioUrls.length ? { audio_urls: audioUrls } : {}),
    };
    try {
        const created = deps.response.unwrapVideoResponse(await deps.transport.post<ApiVideoResponse>(deps.transport.apiUrl("/video/generations"), payload, options));
        const id = deps.response.videoTaskId(created);
        if (!id) throw new Error(translate("shared.api.videoProviderNewapi.newAPIVideoGenerationsReturnedNoTaskID"));
        return { id, provider: "video-generations", model };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, translate("shared.api.videoProviderNewapi.failedToCreateNewAPIVideoGenerationsTask")));
    }
}

export async function pollVideoGenerationsTask(deps: VideoProviderDeps, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const raw = await deps.transport.get<ApiEnvelope<Record<string, unknown>>>(deps.transport.apiUrl(`/video/generations/${encodeURIComponent(task.id)}`), options);
        const state = deps.response.unwrapEnvelopeRecord(raw);
        const status = String(state.status || "").toUpperCase();
        if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED") {
            const url = String(state.result_url || state.video_url || state.url || "");
            if (!url) return { status: "failed", error: translate("shared.api.videoProviderNewapi.theVideoTaskFinishedButReturnedNoVideoURL") };
            return { status: "completed", result: await deps.response.videoResultFromUrl(url, options) };
        }
        if (status === "FAILURE" || status === "FAILED" || status === "CANCELLED") return { status: "failed", error: String(state.fail_reason || state.error || translate("shared.api.videoProviderNewapi.videoGenerationFailed")) };
        return { status: "pending" };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, translate("shared.api.videoProviderNewapi.failedToQueryNewAPIVideoGenerationsTask")));
    }
}

function newAPIVideoResolutionRequest(profile: NonNullable<ReturnType<typeof modelCapabilityConfigFor>["video"]>, value: string, model: string) {
    if (model.trim().toLowerCase() === "grok-video-1.5-1080p") return "1080p";
    return videoResolutionRequest(profile, value);
}

async function resolveVideoGenerationsUrl(value: string | undefined, storageKey?: string) {
    if (storageKey?.startsWith("resource:")) return getResourceInputURL(storageKey);
    if (isPublicMediaUrl(value || "")) return String(value);
    throw new Error(translate("shared.api.videoProviderNewapi.newAPIVideoGenerationsReferencesRequirePublicURLsSaveTheAssets"));
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}
