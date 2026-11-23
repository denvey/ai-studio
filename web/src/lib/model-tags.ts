import { translate } from "@/i18n";
export const modelTagColors = [
    { value: "purple", label: translate("shared.modelTags.purple") },
    { value: "blue", label: translate("shared.modelTags.blue") },
    { value: "green", label: translate("shared.modelTags.green") },
    { value: "gold", label: translate("shared.modelTags.gold") },
    { value: "orange", label: translate("shared.modelTags.orange") },
    { value: "pink", label: translate("shared.canvas.canvasAppearance.pink") },
] as const;

export type ModelTag = { text: string; color: (typeof modelTagColors)[number]["value"] };

/** 参考输入上限标签（图×N · 视×N · 音×N）：视频模型的参考素材与文本模型的识图 / 视频识别共用一种写法。 */
export function referenceCapabilityTag(references?: { maxImages?: number; maxVideos?: number; maxAudios?: number }): ModelTag | undefined {
    if (!references) return undefined;
    const counts = [
        [translate("shared.modelTags.img"), references.maxImages],
        [translate("shared.modelTags.vid"), references.maxVideos],
        [translate("shared.modelTags.aud"), references.maxAudios],
    ] as const;
    const text = counts
        .filter(([, count]) => typeof count === "number" && Number.isFinite(count) && count > 0)
        .map(([label, count]) => `${label}×${count}`)
        .join(" · ");
    return text ? { text, color: "green" } : undefined;
}
