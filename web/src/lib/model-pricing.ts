import { modelRequestOptions, resolveVideoOperation, type ModelRequirements } from "@/lib/model-selection";
import { videoResolutionComparisonKey } from "@/lib/video-generation-options";
import { imagePriceSelector, normalizeImagePriceSelector } from "@/lib/image-pricing";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import type { LogicalModelQuote, ModelQuoteRequest, ModelRequestIntent } from "@/services/api/logical-models";
import { modelOptionName, resolveModelChannel, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { currentLocale, translate } from "@/i18n";

export type ModelPriceTier = NonNullable<NonNullable<AiConfig["channels"][number]["modelCosts"]>[number]["logicalPriceTiers"]>[number];

type ModelCreditCost = {
    model: string;
    pricePolicy?: "channel" | "unified";
    billingMode: "fixed_request" | "per_second" | "token";
    unitPriceMicrocredits: number;
    logicalPriceTiers?: ModelPriceTier[];
};

export function requestCreditCost(options: { channelMode: string; modelCosts?: ModelCreditCost[]; model: string; count?: string | number; seconds?: string | number; capability?: ModelCapability; config?: AiConfig; requirements?: ModelRequirements }) {
    if (options.channelMode !== "remote") return null;
    const cost = options.modelCosts?.find((item) => item.model === options.model) || null;
    if (!cost) return null;
    if (cost.pricePolicy === "channel") {
        if (!options.config) return null;
        const tiers = priceTiersForCurrentSelection(cost.logicalPriceTiers || [], options.capability, options.config, options.requirements);
        if (!tiers.length) return null;
        const first = tiers[0];
        if (!first || first.billingMode === "token") return null;
        // 同一精确规格可能来自多个逻辑路由；只有价格一致时才可在客户端安全展示。
        if (tiers.some((tier) => tier.billingMode !== first.billingMode || tier.unitPriceMicrocredits !== first.unitPriceMicrocredits)) return null;
        return creditAmount(first.billingMode, first.unitPriceMicrocredits, options.count, options.seconds);
    }
    // Token 订单由服务端按请求体预授权并在 usage 返回后结算，前端不展示无依据的固定价格。
    if (cost.billingMode === "token") return null;
    return creditAmount(cost.billingMode, cost.unitPriceMicrocredits, options.count, options.seconds);
}

export function priceTiersForCurrentSelection(tiers: ModelPriceTier[], capability: ModelCapability | undefined, config: AiConfig, requirements?: ModelRequirements) {
    const requested = priceSelectorForRequest(capability, config, requirements);
    let bestScore = -1;
    let matched: ModelPriceTier[] = [];
    for (const tier of tiers) {
        const selector = priceSelectorForTier(tier, Boolean(modelCapabilityConfigFor(config, config.model || config.imageModel).image?.parameters));
        const conditions = Object.entries(selector).filter(([, value]) => value && value !== "*");
        if (conditions.some(([key, value]) => requested[key] !== value)) continue;
        const score = conditions.length;
        if (score > bestScore) {
            bestScore = score;
            matched = [tier];
        } else if (score === bestScore) {
            matched.push(tier);
        }
    }
    return matched;
}

export function priceTierSummaryLabel(tiers: ModelPriceTier[], capability?: ModelCapability) {
    const unitPrices = (billingMode: ModelPriceTier["billingMode"]) =>
        tiers
            .filter((tier) => tier.billingMode === billingMode)
            .map((tier) => tier.unitPriceMicrocredits / 1_000_000)
            .filter((value) => Number.isFinite(value) && value >= 0);
    const fixedRequestValues = unitPrices("fixed_request");
    const perSecondValues = unitPrices("per_second");
    // 分时与上下文规则也计入输出价区间，用户看到的是可能被收取的全部输出单价。
    const tokenTiers = tiers.filter((tier) => tier.billingMode === "token");
    const tokenValues = tokenTiers
        .flatMap((tier) => [tier.outputTokenPriceMicrocredits, ...(tier.tokenPriceRules || []).map((rule) => rule.outputTokenPriceMicrocredits)])
        .map((value) => value / 1_000_000)
        .filter((value) => Number.isFinite(value) && value >= 0);
    const timeBased = tokenTiers.some((tier) => tier.tokenPriceRules?.length);
    return (
        [
            fixedRequestValues.length ? formatPriceRange(fixedRequestValues, translate("shell.credits")) : "",
            perSecondValues.length ? formatPriceRange(perSecondValues, translate("shared.modelPricing.creditsSecond")) : "",
            tokenValues.length
                ? `${capability === "video" ? "" : translate("shared.videoSettingsPanel.output") + " "}${formatPriceRange(tokenValues, capability === "video" ? translate("shared.modelPicker.creditsMillionVideoTokens") : translate("shared.modelPricing.creditsMillionTokens"))}${timeBased ? " " + translate("shared.modelPricing.timeBased") : ""}`
                : "",
        ]
            .filter(Boolean)
            .join(" · ") || translate("account.layout.oss.cdnAuthNone")
    );
}

function weekdayLabel(day: number) {
    return new Intl.DateTimeFormat(currentLocale(), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, day)));
}

/** 一条分时与上下文规则的用户可读说明，例如「周一至周五 00:30–08:30 · 输入 ≥ 32,000 Token：输入 1 / 输出 2 积分/百万 Token」。 */
export function tokenPriceRuleDescription(rule: NonNullable<ModelPriceTier["tokenPriceRules"]>[number]) {
    const days = [...(rule.weekdays || [])].sort((a, b) => a - b);
    const contiguous = days.length > 2 && days.every((day, index) => index === 0 || day === days[index - 1] + 1);
    const dayLabel =
        days.length === 7 ? translate("shared.modelPricing.everyDay") : contiguous ? translate("shared.modelPricing.weekdayRange", { first: weekdayLabel(days[0]), last: weekdayLabel(days[days.length - 1]) }) : days.map(weekdayLabel).join(", ");
    const format = (value: number) => value.toLocaleString(currentLocale());
    const context =
        rule.maxInputTokens > 0
            ? translate("shared.modelPricing.inputTokens", { v0: String(format(rule.minInputTokens)), v1: String(format(rule.maxInputTokens)) })
            : rule.minInputTokens > 0
              ? translate("shared.modelPricing.inputTokens2", { v0: String(format(rule.minInputTokens)) })
              : "";
    const price = (value: number) => (value / 1_000_000).toLocaleString(currentLocale(), { maximumFractionDigits: 6 });
    return translate("shared.modelPricing.inputOutputCachedInputCreditsMillionTokens", {
        v0: String([`${dayLabel} ${rule.start}–${rule.end}`, context].filter(Boolean).join(" · ")),
        v1: String(price(rule.inputTokenPriceMicrocredits)),
        v2: String(price(rule.outputTokenPriceMicrocredits)),
        v3: String(price(rule.cachedTokenPriceMicrocredits)),
    });
}

export function formatPriceRange(values: number[], suffix: string) {
    const unique = Array.from(new Set(values)).sort((left, right) => left - right);
    const format = (value: number) => value.toLocaleString(currentLocale(), { maximumFractionDigits: 6 });
    return unique.length === 1 ? `${format(unique[0])} ${suffix}` : `${format(unique[0])}-${format(unique[unique.length - 1])} ${suffix}`;
}

export function modelQuoteDescription(quote: LogicalModelQuote) {
    const amount = (quote.amountMicrocredits / 1_000_000).toLocaleString(currentLocale(), { maximumFractionDigits: 6 });
    const descriptions = [translate("shared.modelPricing.costCredits", { v0: String(quote.estimated ? translate("shared.modelPricing.estimated") : translate("shared.modelPricing.current")), v1: String(amount) })];
    const breakdown = referenceVideoQuoteBreakdown(quote.referenceVideo);
    if (breakdown) descriptions.push(breakdown);
    const estimate = quote.videoTokenEstimate;
    if (estimate) {
        descriptions.push(
            translate("shared.modelPricing.formulaEstimateVideoTokensWithAnExtraReservedByThe", {
                v0: String(estimate.formulaTokens.toLocaleString(currentLocale())),
                v1: String(estimate.reservationMarginPercent),
                v2: String(estimate.reservedTokens.toLocaleString(currentLocale())),
            }),
        );
        if (estimate.referenceDurationEstimated && !breakdown) descriptions.push(translate("shared.modelPricing.unknownReferenceVideoDurationIsEstimatedAt15Seconds"));
        if (estimate.dimensionsEstimated) descriptions.push(translate("shared.modelPricing.actualAspectRatioIsNotYetKnownDimensionsAreEstimated"));
    }
    if (quote.billingMode === "token") descriptions.push(estimate ? translate("shared.modelPricing.theEstimateIsNotACostCapSuccessfulTasksAre") : translate("shared.modelPricing.theEstimateIsNotACostCapFinalBillingUses"));
    return descriptions.join("；");
}

/**
 * 通用入口的报价请求：直连系统渠道的文本 / 图片模型在前端按价格档位直接算价，不发服务端报价；
 * 逻辑模型和直连视频模型（Token / 时长计费）才需要服务端报价。
 */
export function modelQuoteRequest(config: AiConfig, value: string, capability?: ModelCapability, requirements?: ModelRequirements): ModelQuoteRequest | undefined {
    if (!capability || !value) return undefined;
    const channel = resolveModelChannel(config, value);
    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(value));
    if (channel.scope === "system" && cost && !cost.logicalModelId && capability !== "video") return undefined;
    return systemModelQuoteRequest(config, value, capability, requirements);
}

/**
 * 任意系统模型（逻辑模型或直连渠道模型、任意能力）的服务端报价请求。
 * 必须先拿到服务端报价才允许提交的流程（例如电商 Agent 的分析与整套出图）用这个入口。
 */
export function systemModelQuoteRequest(config: AiConfig, value: string, capability?: ModelCapability, requirements?: ModelRequirements): ModelQuoteRequest | undefined {
    if (!capability || !value) return undefined;
    const channel = resolveModelChannel(config, value);
    if (channel.scope !== "system") return undefined;
    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(value));
    if (!cost) return undefined;
    const input = requirements?.input;
    const intent: ModelRequestIntent = {
        capability,
        operation: capability === "image" ? imagePriceOperation(requirements) : capability === "video" && input ? resolveVideoOperation(input, requirements?.videoOperation) : requirements?.videoOperation,
        inputs: {
            image: (input?.imageCount || 0) + (input?.characterCount || 0),
            video: input?.videoCount || 0,
            audio: input?.audioCount || 0,
        },
        options: {
            ...modelRequestOptions(config, capability),
            ...(requirements?.options || {}),
            ...(requirements?.videoSeconds ? { videoSeconds: Number(requirements.videoSeconds) } : {}),
            ...(requirements?.imageSize ? { size: requirements.imageSize } : {}),
        },
    };
    const durations = referenceVideoQuoteDurations(input);
    if (capability === "video" && durations) intent.referenceVideoDurationsMs = durations;
    return cost.logicalModelId ? { logicalModelID: cost.logicalModelId, intent } : { channelId: channel.id, modelKey: modelOptionName(value), intent };
}

// 只有全部参考视频时长都已知时才提交给报价接口；任一未知时交给后端按上限预估并标明。
function referenceVideoQuoteDurations(input: ModelRequirements["input"]) {
    const durations = input?.videoDurationsMs;
    if (!input?.videoCount || durations?.length !== input.videoCount) return undefined;
    return durations.every((value) => Number.isSafeInteger(value) && value > 0 && value <= 3_600_000) ? durations : undefined;
}

type ReferenceVideoBillingCost = { capability?: ModelCapability; referenceVideoBilling?: boolean; logicalPriceTiers?: ModelPriceTier[] };

/**
 * 视频模型的参考视频计费标签。开关关闭或带参考视频价格全为 0（免费）时标“参考视频不计费”，作为卖点展示。
 * 非视频模型返回空串。
 */
export function referenceVideoBillingLabel(cost: ReferenceVideoBillingCost | undefined) {
    if (!cost || cost.capability !== "video") return "";
    const billed = cost.referenceVideoBilling === true && (cost.logicalPriceTiers || []).some((tier) => (tier.referenceVideoUnitPriceMicrocredits || 0) > 0 || (tier.referenceVideoOutputTokenPriceMicrocredits || 0) > 0);
    return billed ? translate("shared.modelPricing.referenceVideosBilledSeparately") : translate("shared.modelPricing.referenceVideosFreeOfCharge");
}

function formatSeconds(value: number) {
    return value.toLocaleString(currentLocale(), { maximumFractionDigits: 1 });
}

/** 报价构成，例如“生成 5 秒 + 参考视频 8 秒（参考视频另计费）”。 */
export function referenceVideoQuoteBreakdown(reference: LogicalModelQuote["referenceVideo"]) {
    if (!reference || reference.count <= 0) return "";
    const seconds = reference.billedSeconds > 0 ? reference.billedSeconds : reference.referenceSeconds;
    const referenceText = seconds > 0 ? translate("shared.modelPricing.referenceVideoSeconds", { v0: String(formatSeconds(seconds)) }) : translate("shared.modelPricing.referenceVideos", { v0: String(reference.count) });
    const status = reference.billed
        ? reference.estimated
            ? translate("shared.modelPricing.referenceVideosBilledSeparatelyUnknownDurationEstimatedAt15Seconds")
            : translate("shared.modelPricing.referenceVideosBilledSeparately")
        : translate("shared.modelPricing.referenceVideosFreeOfCharge");
    return translate("shared.modelPricing.generateSeconds", { v0: String(formatSeconds(reference.generatedSeconds)), v1: String(referenceText), v2: String(status) });
}

function creditAmount(billingMode: "fixed_request" | "per_second", unitPriceMicrocredits: number, count?: string | number, seconds?: string | number) {
    const quantity = billingMode === "per_second" ? Math.max(1, Math.floor(Math.abs(Number(seconds)) || 1)) : Math.max(1, Math.floor(Math.abs(Number(count)) || 1));
    return (unitPriceMicrocredits / 1_000_000) * quantity;
}

function priceSelectorForRequest(capability: ModelCapability | undefined, config: AiConfig, requirements?: ModelRequirements) {
    const requested: Record<string, string> = {};
    if (capability === "video") {
        const input = requirements?.input;
        if (input) {
            const imageCount = (input.imageCount || 0) + (input.characterCount || 0);
            requested.operation = input.videoCount > 0 ? "video_to_video" : imageCount > 0 ? "image_to_video" : resolveVideoOperation(input, requirements?.videoOperation);
            if (imageCount > 0) requested.imageCount = String(imageCount);
        } else if (requirements?.videoOperation) requested.operation = requirements.videoOperation;
        const options: Record<string, unknown> = { ...modelRequestOptions(config, "video"), ...requirements?.options, ...(requirements?.videoSeconds ? { videoSeconds: Number(requirements.videoSeconds) } : {}) };
        const resolution = normalizeTierResolution(String(options.vquality ?? ""));
        if (resolution !== "*") requested.vquality = resolution;
        const seconds = Math.max(0, Math.floor(Number(options.videoSeconds) || 0));
        if (seconds > 0) requested.videoSeconds = String(seconds);
        if (options.videoGenerateAudio === true || options.videoGenerateAudio === "true") requested.videoGenerateAudio = "true";
        if (options.videoGenerateAudio === false || options.videoGenerateAudio === "false") requested.videoGenerateAudio = "false";
    }
    if (capability === "image") {
        requested.operation = imagePriceOperation(requirements);
        const options: Record<string, unknown> = { ...modelRequestOptions(config, "image"), ...requirements?.options, ...(requirements?.imageSize ? { size: requirements.imageSize } : {}) };
        const profile = modelCapabilityConfigFor(config, config.model || config.imageModel)?.image;
        if (profile?.parameters) {
            for (const field of profile.parameters) {
                if (field.enabled !== false && field.pricing && options[field.name] !== undefined) requested[field.name] = String(options[field.name]);
            }
            return requested;
        }
        const imageQuality = String(options.quality ?? "")
            .trim()
            .toLowerCase();
        const imageSize = String(options.size ?? "").trim();
        Object.assign(requested, imagePriceSelector(imageQuality, imageSize, modelCapabilityConfigFor(config, config.model || config.imageModel)?.image));
    }
    return requested;
}

function imagePriceOperation(requirements?: ModelRequirements) {
    const input = requirements?.input;
    return (input?.imageCount || 0) + (input?.characterCount || 0) > 0 ? "image_to_image" : "text_to_image";
}

function priceSelectorForTier(tier: ModelPriceTier, declaredParameters = false) {
    const selector = normalizeImagePriceSelector({ ...(tier.selector || {}) }, declaredParameters);
    if (!Object.keys(selector).length) {
        const resolution = normalizeTierResolution(tier.resolution);
        if (resolution !== "*") selector.vquality = resolution;
        if (tier.videoSeconds > 0) selector.videoSeconds = String(tier.videoSeconds);
    }
    return selector;
}

export function normalizeTierResolution(value: string) {
    const raw = String(value || "").trim();
    if (!raw || raw === "*") return "*";
    return videoResolutionComparisonKey(raw);
}
