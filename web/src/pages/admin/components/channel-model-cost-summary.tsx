import { imageQualityLabel } from "@/lib/image-quality";
import type { ChannelModel, ChannelModelPriceTier } from "@/services/api/wallet";
import { priceCurrencyUnit } from "@/services/api/user-groups";
import { AdminStatusBadge } from "./admin-ui";
import { formatModelMarkup, formatModelPrice, modelPriceFields } from "./channel-model-pricing";
import { translate } from "@/i18n";

export function ChannelModelCostSummary({ item }: { item: ChannelModel }) {
    const tiers = item.priceTiers?.filter((tier) => tier.enabled) || [];
    if (!tiers.length) return <AdminStatusBadge label={translate("admin.channelModelCostSummary.noEnabledSpecificationTiers")} tone="warning" />;
    const renderTier = (tier: ChannelModelPriceTier) => (
        <div className="admin-model-cost-tier" key={tier.id}>
            <div className="admin-model-cost-spec">{specificationLabel(tier)}</div>
            <div className="admin-model-cost-value">{priceLabel(tier, item.capability, item.priceCurrency)}</div>
        </div>
    );
    return (
        <div className="admin-model-cost-summary">
            {tiers.slice(0, 3).map(renderTier)}
            {tiers.length > 3 ? (
                <details className="admin-model-cost-more">
                    <summary>{translate("admin.channelModelCostSummary.other")} {tiers.length - 3} {translate("admin.channelModelCostSummary.specificationPrices")}</summary>
                    {tiers.slice(3).map(renderTier)}
                </details>
            ) : null}
        </div>
    );
}

function priceLabel(tier: ChannelModelPriceTier, capability: ChannelModel["capability"], currency?: ChannelModel["priceCurrency"]) {
    const saleUnit = priceCurrencyUnit(currency);
    return modelPriceFields(tier, capability).map(({ key, label, unit }) => {
        const cost = tier.costPricing?.configured ? tier.costPricing[key] : undefined;
        const sale = tier.priceConfigured ? tier[key] : undefined;
        return (
            <div key={key}>
                <span>{label ? `${label} ` : ""}{tier.costPricing?.configured ? formatModelPrice(cost) : translate("admin.channelModelCostSummary.costNotConfigured")} / {tier.priceConfigured ? formatModelPrice(sale) : translate("admin.channelModelCostSummary.sellingPriceNotConfigured")}</span>
                {/* 货币计价时售价与积分成本单位不同，加价率依赖分组兑换比例，不在这里推算。 */}
                <span className="admin-model-cost-unit">{currency !== "USD" && currency !== "CNY" ? translate("admin.channelModelCostSummary.creditsMarkup", { v0: String(unit), v1: String(formatModelMarkup(cost, sale)) }) : translate("admin.channelModelCostSummary.costInCreditsSellingPricePer", { v0: String(saleUnit), v1: String(unit) })}</span>
            </div>
        );
    });
}

export function specificationLabel(tier: ChannelModelPriceTier) {
    const selector = tier.selector || {};
    const specific = (value?: string) => (value && value !== "*" ? value : "");
    const operation = specific(selector.operation);
    const resolution = specific(selector.vquality) || specific(tier.resolution);
    const duration = specific(selector.videoSeconds) || (tier.videoSeconds ? String(tier.videoSeconds) : "");
    const operations: Record<string, string> = { text_to_image: translate("admin.channelModelCostSummary.textToImage"), image_to_image: translate("admin.channelModelCostSummary.imageToImage"), text_to_video: translate("admin.channelModelCostSummary.textToVideo"), image_to_video: translate("admin.channelModelCostSummary.imageToVideo"), video_to_video: translate("admin.channelModelCostSummary.videoToVideo"), text_generation: translate("admin.channelModelCostSummary.textGeneration") };
    return (
        [
            operation ? operations[operation] || operation : "",
            imageQualityLabel(specific(selector.quality)),
            imageQualityLabel(specific(selector.resolution)),
            specific(selector.size),
            resolution.toUpperCase(),
            duration ? translate("admin.channelModelCostSummary.s", { v0: String(duration) }) : "",
            specific(selector.imageCount) ? translate("admin.channelModelCostSummary.referenceImages", { v0: String(selector.imageCount) }) : "",
            selector.videoGenerateAudio === "true" ? translate("admin.channelModelCostSummary.withAudio") : selector.videoGenerateAudio === "false" ? translate("admin.channelModelCostSummary.withoutAudio") : "",
        ]
            .filter(Boolean)
            .join(" / ") || translate("admin.channelModelCostSummary.defaultSpecification")
    );
}
