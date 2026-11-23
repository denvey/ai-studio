import type { Asset } from "@/stores/use-asset-store";

/** Deterministic file checks only. Product fidelity and platform compliance need visual review. */
import { translate } from "@/i18n";
export function inspectCommerceImageAsset(asset: Asset, expectedRatio: string): string[] {
    if (asset.kind !== "image") return [translate("ecommerce.quality.theGeneratedAssetIsNotAnImage")];
    const { width, height, bytes, mimeType } = asset.data;
    const issues: string[] = [];
    if (!/^image\/(png|jpeg|webp)$/i.test(mimeType)) issues.push(translate("ecommerce.quality.fileFormatNeedsReview"));
    if (!Number.isFinite(bytes) || bytes < 1024) issues.push(translate("ecommerce.quality.unexpectedFileSize"));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        issues.push(translate("ecommerce.quality.imageDimensionsCannotBeRead"));
        return issues;
    }
    const ratio = expectedRatio.split(":").map(Number);
    if (ratio.length === 2 && ratio.every((value) => Number.isFinite(value) && value > 0)) {
        const target = ratio[0] / ratio[1];
        if (Math.abs(width / height - target) / target > 0.08) issues.push(translate("ecommerce.quality.aspectRatioDoesNotMatch", { v0: String(expectedRatio) }));
    }
    return issues;
}
