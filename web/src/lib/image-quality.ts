
import { translate } from "@/i18n";
const IMAGE_QUALITY_LABELS: Record<string, string> = {
    auto: translate("account.layout.oss.auto"),
    low: translate("shared.imageQuality.low"),
    medium: translate("shared.imageQuality.medium"),
    high: translate("shared.imageSizePresetsEditor.high"),
    xhigh: translate("shared.imageQuality.ultra"),
    max: translate("shared.imageQuality.maximum"),
    "1k": "1K",
    "2k": "2K",
    "4k": "4K",
};

export function imageQualityLabel(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    return IMAGE_QUALITY_LABELS[normalized] || value;
}

export function imageQualityDescription(value: string) {
    switch (String(value || "").trim().toLowerCase()) {
        case "auto":
            return translate("shared.imageQuality.decidedByTheModel");
        case "low":
            return translate("shared.imageQuality.fasterGeneration");
        case "medium":
            return translate("shared.imageQuality.balanced");
        case "high":
            return translate("shared.imageQuality.prioritizeSpeed");
        case "xhigh":
            return translate("shared.imageQuality.prioritizeQuality");
        case "max":
            return translate("shared.imageQuality.prioritizeDetail");
        case "1k":
            return translate("shared.imageQuality.standardDefinition");
        case "2k":
            return translate("shared.imageQuality.higherClarity");
        case "4k":
            return translate("shared.imageQuality.maximumClarity");
        default:
            return translate("shared.create.creationWorkspace.qualityResolutionSupportedByTheModel");
    }
}

export function isImageResolutionTier(value: string) {
    return ["1k", "2k", "4k"].includes(String(value || "").trim().toLowerCase());
}
