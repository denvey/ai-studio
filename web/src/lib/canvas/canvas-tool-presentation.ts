import type { ToolScope } from "@/services/api/tools";
import { translate } from "@/i18n";

// 各子 Tab 的独立标签集，与 backend internal/tools/seed/tools.json 的 tags 对齐
export const SUB_TAB_TAGS: Record<"style" | "motion", Array<{ id: string; label: string }>> = {
    style: [
        { id: "period", label: translate("shared.canvas.canvasToolPresentation.periodCostume") },
        { id: "city", label: translate("shared.canvas.canvasToolPresentation.urban") },
        { id: "decade", label: translate("shared.canvas.canvasToolPresentation.period") },
        { id: "life", label: translate("shared.canvas.canvasToolPresentation.everydayLife") },
        { id: "science_fiction", label: translate("shared.canvas.canvasToolPresentation.sciFi") },
        { id: "type", label: translate("account.settings.runninghub.kind") },
        { id: "poetic", label: translate("shared.canvas.canvasToolPresentation.impressionistic") },
        { id: "animation", label: translate("shared.canvas.canvasToolPresentation.animation") },
        { id: "drawing", label: translate("shared.canvas.canvasToolPresentation.painting") },
        { id: "myth", label: translate("shared.canvas.canvasToolPresentation.mythology") },
    ],
    motion: [
        { id: "basic", label: translate("shared.canvas.canvasToolPresentation.basicControls") },
        { id: "follow", label: translate("shared.canvas.canvasToolPresentation.characterTracking") },
        { id: "reveal", label: translate("shared.canvas.canvasToolPresentation.revealTransitions") },
        { id: "emotion", label: translate("shared.canvas.canvasToolPresentation.emotionalEmphasis") },
        { id: "aerial", label: translate("shared.canvas.canvasToolPresentation.aerialMovement") },
    ],
};

type FeedTab = ToolScope;

export const FEED_TABS: Array<{ id: FeedTab; label: string }> = [
    { id: "public", label: translate("shared.canvas.canvasToolPresentation.public") },
    { id: "favorites", label: translate("shared.inspirations.inspirationDetailModal.favorite") },
    { id: "custom", label: translate("account.settings.models.scopeCustom") },
];

export function toAbsoluteUrl(value?: string) {
    const text = (value || "").trim();
    if (/^https?:\/\//i.test(text)) return text;
    if (text.startsWith("/") && !text.startsWith("//")) return new URL(text, window.location.origin).href;
    return "";
}
