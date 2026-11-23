
import { translate } from "@/i18n";
export type ResourceStorageLocation = "oss" | "local" | "none";

export function resourceStorageLocation(storageKey?: string): ResourceStorageLocation {
    if (!storageKey) return "none";
    return storageKey.startsWith("resource:") ? "oss" : "local";
}

export function resourceStorageLabel(storageKey?: string) {
    const location = resourceStorageLocation(storageKey);
    if (location === "oss") return translate("shared.canvas.resourceStorageStatus.uploaded");
    if (location === "local") return translate("shared.canvas.resourceStorageStatus.local");
    return translate("shared.canvas.resourceStorageStatus.notSynced");
}

export function resourceStorageTitle(storageKey?: string) {
    const location = resourceStorageLocation(storageKey);
    if (location === "oss") return translate("shared.canvas.resourceStorageStatus.uploadedToObjectStorageAndSyncedAsAnAccountResource");
    if (location === "local") return translate("shared.canvas.resourceStorageStatus.storedInThisBrowserUsuallyAsAFallbackWhenObject");
    return translate("shared.canvas.resourceStorageStatus.noResourceIdentifierToSyncYet");
}
