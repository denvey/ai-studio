import type { CanvasNodeData } from "@/types/canvas";
import { translate } from "@/i18n";


export const MEDIA_CONVERSION_SCHEMA_VERSION = 1 as const;

export const MEDIA_CONVERSION_NODE_TYPE = "media-conversion" as const;

export type MediaConversionOperation = "grayscale" | "edge-canny" | "lineart" | "depth" | "pose" | "cutout";
export type MediaConversionStatus = "idle" | "processing" | "completed" | "stale" | "skipped" | "unavailable" | "error";
export type MediaConversionOutputKind = "image" | "video";

export type MediaConversionNodeState = {
    schemaVersion: typeof MEDIA_CONVERSION_SCHEMA_VERSION;
    operation: MediaConversionOperation;
    status: MediaConversionStatus;
    sourceNodeId?: string;
    sourceFingerprint?: string;
    outputKind?: MediaConversionOutputKind;
    resultStorageKey?: string;
    resultWidth?: number;
    resultHeight?: number;
    detectedPeople?: number;
    errorCode?: string;
    errorMessage?: string;
    startedAt?: string;
    updatedAt?: string;
};

export const MEDIA_CONVERSION_OPERATION_LABELS: Record<MediaConversionOperation, string> = {
    grayscale: translate("shared.mediaConversion.contracts.grayscale"),
    "edge-canny": translate("shared.mediaConversion.contracts.cannyEdges"),
    lineart: translate("shared.mediaConversion.contracts.aILineArt"),
    depth: translate("shared.mediaConversion.contracts.depthMap"),
    pose: translate("shared.mediaConversion.contracts.poseSkeleton"),
    cutout: translate("shared.mediaConversion.contracts.backgroundRemoval"),
};

export const MEDIA_CONVERSION_OPERATION_DESCRIPTIONS: Record<MediaConversionOperation, string> = {
    grayscale: translate("shared.mediaConversion.contracts.standardImageProcessingForInspectingTonalContrast"),
    "edge-canny": translate("shared.mediaConversion.contracts.standardImageProcessingForExtractingClearEdges"),
    lineart: translate("shared.mediaConversion.contracts.localControlNetAuxLineArtPreprocessingRequiresASeparatelyDeployed"),
    depth: translate("shared.mediaConversion.contracts.localDepthAnythingV2SmallRequiresASeparatelyDeployedLocal"),
    pose: translate("shared.mediaConversion.contracts.localOpenPoseBodyPosePreprocessingRequiresASeparatelyDeployedLocal"),
    cutout: translate("shared.mediaConversion.contracts.requiresAnInstalledAndVerifiedLocalBackgroundRemovalModel"),
};

export function createDefaultMediaConversionState(): MediaConversionNodeState {
    return {
        schemaVersion: MEDIA_CONVERSION_SCHEMA_VERSION,
        operation: "edge-canny",
        status: "idle",
    };
}

export function mediaConversionSourceFingerprint(node: CanvasNodeData) {
    const metadata = node.metadata;
    const source = [
        node.id,
        metadata?.storageKey || "",
        compactSource(metadata?.content || metadata?.previewContent || ""),
        metadata?.mimeType || "",
        metadata?.bytes || "",
        metadata?.naturalWidth || "",
        metadata?.naturalHeight || "",
        metadata?.durationMs || "",
    ].join("|");
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function mediaConversionOperationLabel(operation: MediaConversionOperation) {
    return MEDIA_CONVERSION_OPERATION_LABELS[operation];
}

export function mediaConversionOperationDescription(operation: MediaConversionOperation) {
    return MEDIA_CONVERSION_OPERATION_DESCRIPTIONS[operation];
}

export function isLocalImageOperation(operation: MediaConversionOperation) {
    return operation === "grayscale" || operation === "edge-canny";
}

function compactSource(value: string) {
    if (value.length <= 2048) return value;
    return `${value.slice(0, 1024)}|${value.slice(-1024)}|${value.length}`;
}
