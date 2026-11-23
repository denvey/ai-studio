import type { EcommerceDraft, EcommercePlan, EcommerceReference } from "@/services/api/ecommerce";
import { getResourceBlob, refreshResource, resourceStorageKey, uploadResourceFile } from "@/services/api/resources";
import { getActiveUserScope } from "@/lib/user-scope";
import { commerceLayoutReferences, commerceReferenceViewRanges, normalizeReferenceDraft, validateCommerceReferencePlan } from "./reference-plan";
import { activeCommerceReferences } from "./model-context";

import { translate } from "@/i18n";
function ownerGuard(assertCurrent?: () => void) {
    const scope = getActiveUserScope();
    return {
        scope,
        check: () => {
            if (getActiveUserScope() !== scope || scope === "guest") throw new Error(translate("ecommerce.longReferenceMedia.signedInAccountChangedReferenceProcessingStopped"));
            assertCurrent?.();
        },
    };
}

async function readReference(resourceId: string, check: () => void) {
    check();
    const resource = await refreshResource(resourceId);
    check();
    if (resource.kind !== "image" || resource.status !== "ready") throw new Error(translate("ecommerce.longReferenceMedia.theReferenceIsNotReadyUploadItAgainOrRetry"));
    if (resource.width && resource.height && resource.width * resource.height > 100_000_000) throw new Error(translate("ecommerce.longReferenceMedia.theReferenceImageIsTooLargeResizeItAndRetry"));
    // Pixel reads require the authenticated same-origin stream, not a CDN display URL.
    const blob = await getResourceBlob(resourceStorageKey(resourceId), "ecommerce-export");
    check();
    if (!blob) throw new Error(translate("ecommerce.longReferenceMedia.failedToReadTheReferenceImageUploadItAgain"));
    const bitmap = await createImageBitmap(blob);
    try {
        check();
        if (bitmap.width <= 0 || bitmap.height <= 0 || bitmap.width * bitmap.height > 100_000_000) throw new Error(translate("ecommerce.longReferenceMedia.theReferenceImageIsTooLargeResizeItAndRetry"));
    } catch (cause) {
        bitmap.close();
        throw cause;
    }
    return bitmap;
}

export function commerceReferenceCropBounds(width: number, height: number, top: number, bottom: number) {
    if (![width, height, top, bottom].every(Number.isFinite) || width <= 0 || height <= 0 || top < 0 || bottom > 1 || top >= bottom) throw new Error(translate("ecommerce.longReferenceMedia.invalidReferenceScreenCropRange"));
    const y = Math.floor(top * height);
    const cropHeight = Math.min(height, Math.ceil(bottom * height)) - y;
    const scale = Math.min(1, 1600 / width, 4096 / cropHeight);
    return { y, cropHeight, width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(cropHeight * scale)) };
}

async function uploadCrop(bitmap: ImageBitmap, sourceId: string, top: number, bottom: number, label: string, scope: string, check: () => void) {
    const bounds = commerceReferenceCropBounds(bitmap.width, bitmap.height, top, bottom);
    const canvas = document.createElement("canvas");
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    try {
        const context = canvas.getContext("2d");
        if (!context) throw new Error(translate("ecommerce.longReferenceMedia.theBrowserCannotProcessLongImageReferencesUseABrowser"));
        context.drawImage(bitmap, 0, bounds.y, bitmap.width, bounds.cropHeight, 0, 0, bounds.width, bounds.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error(translate("ecommerce.longReferenceMedia.referenceImageCroppingFailed")))), "image/png"));
        check();
        const resource = await uploadResourceFile(blob, "image", { width: bounds.width, height: bounds.height, fileName: `${label}.png`, idempotencyKey: `commerce-ref-v1:${scope}:${sourceId}:${bounds.y}:${bounds.cropHeight}` });
        check();
        if (!resource.id || resource.kind !== "image" || resource.status !== "ready") throw new Error(translate("ecommerce.longReferenceMedia.referenceCropUploadIncompleteRetry"));
        return { resourceId: resource.id, role: "style" as const, name: label, width: bounds.width, height: bounds.height };
    } finally {
        canvas.width = 0;
        canvas.height = 0;
    }
}

export async function prepareCommerceReferenceViews(input: EcommerceDraft, maxImages: number, assertCurrent?: () => void) {
    const draft = normalizeReferenceDraft(input);
    const sources = commerceLayoutReferences(draft);
    const views: Array<EcommerceReference & { sourceResourceId: string; top: number; bottom: number }> = [];
    if (!sources.length) return { draft, views };
    const { scope, check } = ownerGuard(assertCurrent);
    const originalCount = activeCommerceReferences(draft).length;
    const prepared: Array<{ source: EcommerceReference; width: number; height: number; ranges: ReturnType<typeof commerceReferenceViewRanges> }> = [];
    // Inspect sources sequentially to bound bitmap memory; validate the whole batch
    // before creating reading-window resources.
    for (const source of sources) {
        const bitmap = await readReference(source.resourceId, check);
        try {
            prepared.push({ source, width: bitmap.width, height: bitmap.height, ranges: commerceReferenceViewRanges(bitmap.width, bitmap.height) });
        } finally {
            bitmap.close();
        }
    }
    const extra = prepared.reduce((sum, item) => sum + item.ranges.length, 0);
    if (originalCount + extra > maxImages) throw new Error(translate("ecommerce.longReferenceMedia.theseReferencesRequireTheOriginalsAndDetailCropsTotalingInputs", { v0: String(extra), v1: String(originalCount + extra) }));
    for (const [sourceIndex, item] of prepared.entries()) {
        if (!item.ranges.length) continue;
        const bitmap = await readReference(item.source.resourceId, check);
        try {
            for (const [index, range] of item.ranges.entries()) {
                check();
                const crop = await uploadCrop(bitmap, item.source.resourceId, range.top, range.bottom, `借鉴图${sourceIndex + 1}-局部阅读-${index + 1}`, scope, check);
                views.push({ ...crop, sourceResourceId: item.source.resourceId, ...range });
            }
        } finally {
            bitmap.close();
        }
    }
    return { draft: { ...draft, layoutReferences: prepared.map(({ source, width, height }) => ({ ...source, width, height })) }, views };
}

export async function prepareCommerceReferencePlan(draft: EcommerceDraft, plan: EcommercePlan, options: { assertCurrent?: () => void; onSaved?: (plan: EcommercePlan) => Promise<void>; onProgress?: (screen: number, count: number) => void } = {}) {
    if (draft.referenceMode !== "detail") return plan;
    validateCommerceReferencePlan(plan, draft);
    const { scope, check } = ownerGuard(options.assertCurrent);
    let bitmap: ImageBitmap | undefined;
    let bitmapSource = "";
    let next = plan;
    try {
        for (const [index, image] of next.images.entries()) {
            check();
            const screen = image.referenceScreen!;
            if (screen.resourceId) {
                const existing = await refreshResource(screen.resourceId);
                check();
                if (existing.kind !== "image" || existing.status !== "ready") throw new Error(translate("ecommerce.longReferenceMedia.referenceForScreenIsUnavailableReplan", { v0: String(index + 1) }));
                continue;
            }
            if (image.taskId) throw new Error(translate("ecommerce.longReferenceMedia.screenHasAnExistingTaskButNoReferenceCropCheck", { v0: String(index + 1) }));
            options.onProgress?.(index + 1, next.images.length);
            if (!bitmap || bitmapSource !== screen.sourceResourceId) {
                bitmap?.close();
                bitmap = undefined;
                bitmap = await readReference(screen.sourceResourceId, check);
                bitmapSource = screen.sourceResourceId;
            }
            const crop = await uploadCrop(bitmap, screen.sourceResourceId, screen.top, screen.bottom, `第${index + 1}屏版式参考`, scope, check);
            next = { ...next, images: next.images.map((entry, i) => (i === index ? { ...entry, referenceScreen: { ...screen, resourceId: crop.resourceId } } : entry)) };
            if (options.onSaved) {
                await options.onSaved(next);
                check();
            }
        }
        return next;
    } finally {
        bitmap?.close();
    }
}
