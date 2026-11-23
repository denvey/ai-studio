import axios from "axios";
import { readFileAsDataUrl } from "@/lib/image-utils";

import type { ApiEnvelope, ApiVideoResponse, RequestOptions, SeedanceTask, VideoGenerationResult } from "./video-contracts";
import { translate } from "@/i18n";

export function videoTaskId(payload: { id?: string; request_id?: string; task_id?: string }) {
    return payload.id || payload.request_id || payload.task_id || "";
}

export function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, translate("shared.api.videoResponse.theAPIReturnedNoVideoTask"));
}

export function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, translate("shared.api.videoResponse.theSeedanceAPIReturnedNoTask"));
}

export function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0) throw new Error(payload.msg || translate("errors.requestFailed"));
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

export function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return translate("errors.canceled");
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; code?: number }>(error)) {
        const responseData = error.response?.data;
        return responseData?.msg || responseData?.error?.message || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return translate("errors.canceled");
    return error instanceof Error ? error.message : fallback;
}

export function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return translate("shared.api.videoResponse.authenticationFailedCheckYourAPIKeyPlanPermissionsOrModel");
    if (status === 429) return translate("shared.api.videoResponse.theRequestWasRateLimitedOrYourQuotaIsExhausted");
    return status ? `${fallback}（${status}）` : fallback;
}

export async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || translate("shared.api.videoResponse.videoDownloadFailed"));
    if (payload.error?.message) throw new Error(payload.error.message);
}

export function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (aborted: boolean) => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
            if (aborted) reject(new DOMException("Aborted", "AbortError"));
            else resolve();
        };
        const cancel = () => finish(true);
        if (signal?.aborted) {
            cancel();
            return;
        }
        signal?.addEventListener("abort", cancel, { once: true });
        timer = setTimeout(() => finish(false), ms);
    });
}

export async function blobToDataUrl(blob: Blob) {
    try {
        return await readFileAsDataUrl(blob);
    } catch {
        throw new Error(translate("shared.api.videoResponse.failedToReadTheLocalAsset"));
    }
}

export async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

export type VideoResponseTools = {
    assertVideoBlob: typeof assertVideoBlob;
    blobToDataUrl: typeof blobToDataUrl;
    delay: typeof delay;
    readAxiosError: typeof readAxiosError;
    unwrapEnvelope: typeof unwrapEnvelope;
    unwrapEnvelopeRecord: typeof unwrapEnvelopeRecord;
    unwrapSeedanceTask: typeof unwrapSeedanceTask;
    unwrapVideoResponse: typeof unwrapVideoResponse;
    videoResultFromUrl: typeof videoResultFromUrl;
    videoTaskId: typeof videoTaskId;
};

function unwrapEnvelopeRecord(value: ApiEnvelope<Record<string, unknown>>): Record<string, unknown> {
    if (value && typeof value === "object" && "data" in value && value.data && typeof value.data === "object") return value.data as Record<string, unknown>;
    return value as Record<string, unknown>;
}

export const videoResponseTools: VideoResponseTools = {
    assertVideoBlob,
    blobToDataUrl,
    delay,
    readAxiosError,
    unwrapEnvelope,
    unwrapEnvelopeRecord,
    unwrapSeedanceTask,
    unwrapVideoResponse,
    videoResultFromUrl,
    videoTaskId,
};
