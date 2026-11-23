import type { ProviderCatalogModel, ProviderCatalogPriceTier, ProviderCatalogProvider } from "@/services/api/provider-catalog";
import { currentLocale, translate } from "@/i18n";

// 与后端 providercatalog.ApplyMarkup 保持一致：售价 = 成本 × (1 + 加价率)，向上取整到 microcredit。
export function applyMarkup(cost: number, markupPercent: number) {
    if (!Number.isSafeInteger(cost) || cost <= 0) return 0;
    const basisPoints = BigInt(Math.round(markupPercent * 100));
    const numerator = BigInt(cost) * (BigInt(10_000) + basisPoints);
    const quotient = numerator / BigInt(10_000);
    return Number(numerator % BigInt(10_000) === BigInt(0) ? quotient : quotient + BigInt(1));
}

export function validMarkup(value: number | null | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

export function formatCredits(microcredits: number) {
    return (microcredits / 1_000_000).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export type TierPriceLine = { label: string; cost: number; sale: number };

// 列出一个规格档需要展示的价格项；视频 token 只有输出价。
export function tierPriceLines(capability: ProviderCatalogModel["capability"], tier: ProviderCatalogPriceTier, markupPercent: number): TierPriceLine[] {
    if (tier.billingMode !== "token") {
        const unit = tier.billingMode === "per_second" ? translate("admin.channels.providerCatalogPricing.perSecond") : translate("admin.channels.providerCatalogPricing.perRequest");
        return [{ label: unit, cost: tier.costUnitMicrocredits, sale: applyMarkup(tier.costUnitMicrocredits, markupPercent) }];
    }
    if (capability === "video") return [{ label: translate("admin.channels.providerCatalogPricing.perMillionVideoTokens"), cost: tier.costOutputMicrocredits, sale: applyMarkup(tier.costOutputMicrocredits, markupPercent) }];
    const lines = [
        { label: translate("admin.channels.providerCatalogPricing.inputMillionTokens"), cost: tier.costInputMicrocredits },
        { label: translate("admin.channels.providerCatalogPricing.outputMillionTokens"), cost: tier.costOutputMicrocredits },
    ];
    if (tier.costCachedMicrocredits > 0) lines.push({ label: translate("admin.channels.providerCatalogPricing.cachedMillionTokens"), cost: tier.costCachedMicrocredits });
    return lines.map((line) => ({ ...line, sale: applyMarkup(line.cost, markupPercent) }));
}

const selectorLabels: Record<string, (value: string) => string> = {
    operation: (value) =>
        ({
            text_to_video: translate("admin.channels.providerCatalogPricing.fromText"),
            image_to_video: translate("admin.channels.providerCatalogPricing.fromImage"),
            text_to_image: translate("admin.channels.providerCatalogPricing.textToImage"),
            image_to_image: translate("admin.channels.providerCatalogPricing.imageToImage"),
        })[value] || value,
    vquality: (value) => value,
    videoSeconds: (value) => `${value}s`,
    quality: (value) => value.toUpperCase(),
    resolution: (value) => value.toUpperCase(),
    size: (value) => value,
    videoGenerateAudio: (value) => (value === "true" ? translate("admin.channels.providerCatalogPricing.withAudio") : translate("admin.channels.providerCatalogPricing.withoutAudio")),
};

export function tierSpecLabel(tier: ProviderCatalogPriceTier) {
    const parts = Object.entries(tier.selector || {})
        .filter(([, value]) => value && value !== "*")
        .map(([key, value]) => (selectorLabels[key] ? selectorLabels[key](value) : `${key}=${value}`));
    return parts.length ? parts.join(" · ") : translate("admin.channels.providerCatalogPricing.defaultSpecification");
}

export function formatWindow(provider: Pick<ProviderCatalogProvider, "startsAt" | "endsAt" | "permanent">) {
    if (provider.permanent) return translate("admin.channels.providerCatalogPricing.ongoingPromotionNoExpiration");
    const format = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
    return translate("admin.channels.providerCatalogPricing.to", { v0: String(format(provider.startsAt)), v1: String(format(provider.endsAt)) });
}

export function promotionExpiry(provider: Pick<ProviderCatalogProvider, "endsAt" | "permanent">, now = Date.now()) {
    if (provider.permanent) return translate("admin.channels.providerCatalogPricing.alwaysDisplayed");
    const end = new Date(provider.endsAt);
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(end);
    const days = Math.ceil((end.getTime() - now) / 86_400_000);
    return translate("admin.channels.providerCatalogPricing.expiresBeijingTime", {
        v0: String(date),
        v1: String(days > 0 ? translate("admin.channels.providerCatalogPricing.daysRemaining", { v0: String(days) }) : translate("admin.channels.providerCatalogPricing.expired")),
    });
}

export function matchesProvider(provider: ProviderCatalogProvider, keyword: string) {
    const query = keyword.trim().toLowerCase();
    if (!query) return true;
    const haystack = [provider.name, provider.summary, provider.baseUrl, provider.website, ...provider.models.flatMap((item) => [item.displayName, item.modelKey])].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
}
