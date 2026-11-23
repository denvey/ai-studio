import type { DramaCast, DramaCastKind, DramaStatus } from "@/services/api/drama";
import { translate, currentLocale } from "@/i18n";

// 短剧文案与数字格式：制作台和精修画布共用，避免两边各写一份。

export const DRAMA_CAST_KIND_LABEL: Record<DramaCastKind | "image", string> = { character: translate("library.picker.kind.character"), prop: translate("shared.drama.dramaFormat.prop"), scene: translate("shared.assetCategory.scene"), image: translate("account.feedback.image") };

export const DRAMA_STATUS_LABEL: Record<DramaStatus, string> = { draft: translate("shared.drama.dramaFormat.notStarted"), running: translate("shared.drama.dramaFormat.inProduction"), paused: translate("shared.drama.dramaFormat.paused"), completed: translate("library.tasks.filter.succeeded") };

export function dramaCastDisplayName(cast: Pick<DramaCast, "name" | "lookName">) {
    return cast.lookName ? `${cast.name} · ${cast.lookName}` : cast.name;
}

export function formatDramaCredits(microcredits: number) {
    const credits = microcredits / 1_000_000;
    const locale = currentLocale();
    if (locale === "zh-CN" && credits >= 10_000) return `${(credits / 10_000).toFixed(credits >= 100_000 ? 0 : 1)}万`;
    return credits.toLocaleString(locale, { notation: credits >= 10_000 ? "compact" : "standard", maximumFractionDigits: credits >= 100 ? 0 : 2 });
}
