import type { ChannelModel, ChannelModelPriceTier, ChannelModelRepriceInput } from "@/services/api/wallet";
import { currentLocale, translate } from "@/i18n";

const validPrice = (value: number | undefined): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function formatModelPrice(value: number | undefined) {
    return validPrice(value) ? (value / 1_000_000).toLocaleString(currentLocale(), { maximumFractionDigits: 6 }) : "—";
}

// 加价率 = (售价 − 成本) ÷ 成本；成本为 0 时无意义。
export function formatModelMarkup(cost: number | undefined, sale: number | undefined) {
    if (!validPrice(cost) || !validPrice(sale) || cost === 0) return "—";
    return `${(((sale - cost) * 100) / cost).toLocaleString(currentLocale(), { maximumFractionDigits: 2 })}%`;
}

export function modelPriceFields(tier: ChannelModelPriceTier, capability: ChannelModel["capability"]) {
    if (tier.billingMode !== "token") return [{ key: "unitPriceMicrocredits" as const, label: "", unit: tier.billingMode === "per_second" ? translate("account.settings.models.unitSecond") : translate("account.settings.models.unitCall") }];
    if (capability === "video") return [{ key: "outputTokenPriceMicrocredits" as const, label: translate("account.feedback.video"), unit: translate("admin.channelModelPricing.millionVideoTokens") }];
    return [
        { key: "inputTokenPriceMicrocredits" as const, label: translate("admin.channelModelPricing.input"), unit: translate("account.settings.models.unitToken") },
        { key: "outputTokenPriceMicrocredits" as const, label: translate("admin.channelModelPricing.output"), unit: translate("account.settings.models.unitToken") },
        { key: "cachedTokenPriceMicrocredits" as const, label: translate("admin.channelModelPricing.cacheRead"), unit: translate("account.settings.models.unitToken") },
        { key: "cacheWriteTokenPriceMicrocredits" as const, label: translate("admin.channelModelPricing.cacheWrite"), unit: translate("account.settings.models.unitToken") },
    ];
}

// 售价 = 成本 × (1 + 加价率)，按所选小数位四舍五入。
export function previewModelRepricing(items: ChannelModel[], markupPercent: number | null, decimalPlaces = 2): ChannelModel[] {
    if (markupPercent === null || !Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 1000 || Math.abs(markupPercent * 100 - Math.round(markupPercent * 100)) > 1e-8) {
        throw new Error(translate("admin.channelModelPricing.enterAMarkupFrom0To1000WithUpTo"));
    }
    if (!items.length || items.length > 100) throw new Error(translate("admin.channelModelPricing.selectBetween1And100Models"));
    if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) throw new Error(translate("admin.channelModelPricing.chooseBetween0And6DecimalPlaces"));
    const multiplier = BigInt(10_000 + Math.round(markupPercent * 100));
    const quantum = BigInt(10 ** (6 - decimalPlaces));
    return items.map((item) => {
        if (!item.priceTiers.some((tier) => tier.enabled)) throw new Error(translate("admin.channelModelPricing.hasNoEnabledSpecifications", { v0: String(item.displayName || item.modelKey) }));
        return {
            ...item,
            priceTiers: item.priceTiers.map((tier) => {
                if (!tier.enabled) return tier;
                const name = `${item.displayName || item.modelKey}（${tier.selectorKey}）`;
                if (!tier.id || !tier.priceConfigured || !tier.costPricing?.configured) throw new Error(translate("admin.channelModelPricing.saveCompleteSpecificationCostAndSellingPriceSettingsFirst", { v0: String(name) }));
                const next = { ...tier };
                for (const { key } of modelPriceFields(tier, item.capability)) {
                    const cost = tier.costPricing[key];
                    if (!validPrice(cost) || cost > 1_000_000_000_000) throw new Error(translate("admin.channelModelPricing.invalidCostPrice", { v0: String(name) }));
                    // Round once at the selected credit precision, with exact half-up ties.
                    const numerator = BigInt(cost) * multiplier;
                    const divisor = BigInt(10_000) * quantum;
                    const sale = Number(((numerator * BigInt(2) + divisor) / (divisor * BigInt(2))) * quantum);
                    if (!validPrice(sale) || (tier.billingMode === "token" && sale > 1_000_000_000_000)) throw new Error(translate("admin.channelModelPricing.theAdjustedSellingPriceExceedsTheLimit", { v0: String(name) }));
                    next[key] = sale;
                }
                return next;
            }),
        };
    });
}

export function saleInputValue(microcredits: number) {
    if (!validPrice(microcredits)) return null;
    const value = BigInt(microcredits);
    return `${value / BigInt(1_000_000)}.${String(value % BigInt(1_000_000)).padStart(6, "0")}`.replace(/\.?0+$/, "");
}

export function parseSaleInput(value: string | null) {
    if (value === null || !/^\d+(?:\.\d{0,6})?$/.test(value)) throw new Error(translate("admin.channelModelPricing.sellingPricesMustBeNonnegativeWithUpTo6Decimal"));
    const [integer, fraction = ""] = value.split(".");
    const amount = Number(BigInt(integer) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0")));
    if (!validPrice(amount)) throw new Error(translate("admin.channelModelPricing.sellingPriceIsOutOfRange"));
    return amount;
}

export type ModelRepriceRow = {
    key: string;
    model: ChannelModel;
    tier: ChannelModelPriceTier;
    field: ReturnType<typeof modelPriceFields>[number];
    sale: string | null;
    manual: boolean;
};

export function modelRepriceRows(items: ChannelModel[]): ModelRepriceRow[] {
    return items.flatMap((model) =>
        model.priceTiers
            .filter((tier) => tier.enabled)
            .flatMap((tier) =>
                modelPriceFields(tier, model.capability).map((field) => ({
                    key: `${tier.id}:${field.key}`,
                    model,
                    tier,
                    field,
                    sale: tier.priceConfigured ? saleInputValue(tier[field.key]) : null,
                    manual: false,
                })),
            ),
    );
}

export function modelRepricePayload(items: ChannelModel[], rows: ModelRepriceRow[]): ChannelModelRepriceInput[] {
    if (!items.length || items.length > 100) throw new Error(translate("admin.channelModelPricing.selectBetween1And100Models"));
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return items.map((item) => {
        const tiers = item.priceTiers.filter((tier) => tier.enabled);
        if (!tiers.length) throw new Error(translate("admin.channelModelPricing.hasNoEnabledSpecifications", { v0: String(item.displayName || item.modelKey) }));
        return {
            modelId: item.id,
            priceVersion: item.priceVersion,
            priceTiers: tiers.map((tier) => {
                if (!tier.id || !tier.priceConfigured || !tier.costPricing?.configured) throw new Error(translate("admin.channelModelPricing.configureSpecificationCostAndSellingPricesFirst", { v0: String(item.displayName || item.modelKey) }));
                const prices: ChannelModelRepriceInput["priceTiers"][number]["prices"] = {};
                for (const { key } of modelPriceFields(tier, item.capability)) {
                    const cost = tier.costPricing[key];
                    if (!validPrice(cost) || cost > 1_000_000_000_000) throw new Error(translate("admin.channelModelPricing.invalidCostPrice", { v0: String(item.displayName || item.modelKey) }));
                    const sale = parseSaleInput(byKey.get(`${tier.id}:${key}`)?.sale ?? null);
                    if (tier.billingMode === "token" && sale > 1_000_000_000_000) throw new Error(translate("admin.channelModelPricing.tokenSellingPricesCannotExceed1000000Credits"));
                    prices[key] = sale;
                }
                return { id: tier.id, priceVersion: tier.priceVersion, prices };
            }),
        };
    });
}
