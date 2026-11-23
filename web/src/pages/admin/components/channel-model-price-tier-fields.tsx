import { Alert, Button, Form, Input, InputNumber, Segmented, Switch, type FormInstance } from "antd";
import { Trash2 } from "lucide-react";
import type { ModelCapabilityConfig } from "@/lib/model-capabilities";
import { modelProtocolSupportsTokenBilling, type ModelProtocol } from "@/lib/model-protocols";
import type { ModelCapabilityChoice as EditableCapability } from "@/components/model-protocol-picker";
import type { ChannelModelFormValues as FormValues } from "./channel-model-editor-form";
import { normalizeUpstreamModelKey } from "./channel-model-price-tier-form";
import { CreditCostFields } from "./credit-cost-fields";
import { priceCurrencyUnit } from "@/services/api/user-groups";
import { Select } from "@/components/ui/base/select";
import { ImageParameterInput } from "@/components/image-parameter-fields";
import { imageResolutionTiers } from "@/lib/image-size-presets";
// 价格档分辨率按后端保存口径（2k→1440p、4k→2160p）取值，已存档位才能正确回显。
import { normalizeTierResolution } from "@/lib/model-pricing";
import { translate } from "@/i18n";

export function PriceTierFields({
    index,
    ordinal,
    form,
    capability,
    protocol,
    capabilityConfig,
    modelUpstream,
    onDirty,
    onRemove,
}: {
    index: number;
    ordinal: number;
    form: FormInstance<FormValues>;
    capability: EditableCapability | undefined;
    protocol: ModelProtocol | undefined;
    capabilityConfig?: ModelCapabilityConfig;
    modelUpstream: string;
    onDirty: () => void;
    onRemove: () => void;
}) {
    const billingMode = Form.useWatch(["priceTiers", index, "billingMode"], form) || "fixed_request";
    const priceCurrency = Form.useWatch("priceCurrency", form);
    const priceUnit = priceCurrencyUnit(priceCurrency);
    const matchMode = Form.useWatch(["priceTiers", index, "matchMode"], form) || "default";
    const priceConfigured = Form.useWatch(["priceTiers", index, "priceConfigured"], form) !== false;
    const tierEnabled = Form.useWatch(["priceTiers", index, "enabled"], form) !== false;
    const tierUpstream = normalizeUpstreamModelKey(Form.useWatch(["priceTiers", index, "providerModelKey"], form));
    // 统一价格档不展示上游键输入，但历史数据可能固化了独立键；它与模型级不一致时会
    // 静默改变实际发往供应商的模型，必须显式提示并允许一键恢复“跟随模型默认”。
    const staleTierUpstream = matchMode === "default" && tierUpstream && modelUpstream && tierUpstream !== modelUpstream ? tierUpstream : "";
    const video = capabilityConfig?.video;
    const image = capabilityConfig?.image;
    const resolutionOptions = Array.from(new Set([...(video?.resolutions || []), ...(protocol === "autodl-comfyui" ? video?.fixedScreenSpec?.resolutions || [] : [])]));
    const tokenEnabled = modelProtocolSupportsTokenBilling(capability, protocol);
    const isVideo = capability === "video";
    const isAudio = capability === "audio";
    const isDurationPriced = isVideo || isAudio;
    const isImage = capability === "image";
    const referenceVideoBillingValue = Form.useWatch("referenceVideoBilling", form);
    const referenceVideoBilling = isVideo && referenceVideoBillingValue === true;
    const referenceVideoPriced = referenceVideoBilling && (billingMode === "per_second" || billingMode === "token");
    return (
        <article className="admin-price-tier-card">
            <header className="admin-price-tier-card-header">
                <Form.Item name={[index, "priceConfigured"]} hidden valuePropName="checked">
                    <Switch />
                </Form.Item>
                <Form.Item name={[index, "enabled"]} hidden valuePropName="checked">
                    <Switch />
                </Form.Item>
                <div className="admin-price-tier-card-heading">
                    <span className="admin-price-tier-card-index">{String(ordinal).padStart(2, "0")}</span>
                    <div className="admin-price-tier-card-heading-copy">
                        <div className="admin-price-tier-card-title">{matchMode === "default" ? translate("admin.channelModelPriceTierFields.defaultPrice") : translate("admin.channelModelPriceTierFields.specificationPrice", { v0: String(ordinal) })}</div>
                        <div className="admin-price-tier-card-summary">{matchMode === "default" ? translate("admin.channelModelPriceTierFields.useTheSamePriceForAllRequests") : isVideo ? translate("admin.channelModelPriceTierFields.matchByGenerationModeAndResolution") : translate("admin.channelModelPriceTierFields.matchByGenerationModeQualityResolutionOrSize")}</div>
                    </div>
                </div>
                <div className="admin-price-tier-card-actions">
                    <div className="admin-price-tier-toggle">
                        <span title={translate("admin.channelModelPriceTierFields.whenDisabledSettingsAreRetainedButExcludedFromUserRequests")}>{translate("admin.channelModelPriceTierFields.availableToUsers")}</span>
                        <Switch
                            aria-label={translate("admin.channelModelPriceTierFields.availableToUsers")}
                            checked={priceConfigured && tierEnabled}
                            onChange={(checked) => {
                                onDirty();
                                form.setFieldValue(["priceTiers", index, "priceConfigured"], checked);
                                form.setFieldValue(["priceTiers", index, "enabled"], checked);
                            }}
                        />
                    </div>
                    <Button type="text" danger aria-label={translate("admin.channelModelPriceTierFields.deletePriceTier", { v0: String(ordinal) })} icon={<Trash2 className="size-3.5" />} onClick={onRemove}>
                        {translate("common.delete")}
                    </Button>
                </div>
            </header>
            <div className="admin-price-tier-card-body">
                <section className="admin-price-tier-mode-row">
                    <div className="admin-price-tier-panel-heading">
                        <div>
                            <h3>{translate("admin.channelModelPriceTierFields.scope")}</h3>
                            <p>{translate("admin.channelModelPriceTierFields.applyToAllRequestsOrMatchSpecificGenerationSettings")}</p>
                        </div>
                    </div>
                    <Form.Item className="admin-price-tier-mode-control mb-0" name={[index, "matchMode"]} rules={[{ required: true }]}>
                        <Segmented
                            block
                            aria-label={translate("admin.channelModelPriceTierFields.pricingRuleScope")}
                            options={[
                                { label: translate("admin.channelModelPriceTierFields.flatPrice"), value: "default" },
                                { label: translate("admin.channelModelPriceTierFields.specificationPricing"), value: "advanced" },
                            ]}
                        />
                    </Form.Item>
                </section>
                <div className={`admin-price-tier-workspace ${matchMode === "default" ? "is-default" : "is-advanced"}`}>
                    {matchMode !== "default" && (
                        <section className="admin-price-tier-panel admin-price-tier-conditions-panel">
                            <div className="admin-price-tier-panel-heading">
                                <div>
                                    <h3>{translate("admin.channelModelPriceTierFields.matchConditions")}</h3>
                                    <p>{translate("admin.channelModelPriceTierFields.useThisPriceWhenTheFollowingConditionsMatchMoreSpecific")}</p>
                                </div>
                            </div>
                            <div className="admin-price-tier-match-grid">
                                <Form.Item className="mb-0" name={[index, "operation"]} label={translate("admin.channelModelPriceTierFields.generationMode")} rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.selectAGenerationMode") }]}>
                                    <Select options={operationOptions(capability)} />
                                </Form.Item>
                                {isVideo ? (
                                    <Form.Item className="mb-0" name={[index, "resolution"]} label={translate("library.tasks.params.resolution")} rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.selectAResolution") }]}>
                                        <Select options={[{ label: translate("admin.channelModelPriceTierFields.anyResolution"), value: "*" }, ...resolutionOptions.map((value) => ({ label: value.toUpperCase(), value: normalizeTierResolution(value) }))]} />
                                    </Form.Item>
                                ) : null}
                                {isVideo && video?.processing ? (
                                    <Form.Item className="mb-0" name={[index, "fpsBand"]} label={translate("admin.channelModelPriceTierFields.outputFrameRateTier")} tooltip={translate("admin.channelModelPriceTierFields.videoProcessingIsPricedByOutputFrameRateKeepingThe")}>
                                        <Select options={fpsBandOptions} />
                                    </Form.Item>
                                ) : null}
                                {isImage && image?.parameters
                                    ? image.parameters
                                          .filter((field) => field.enabled !== false && field.pricing)
                                          .map((field) => (
                                              <Form.Item key={field.name} className="mb-0" name={[index, "imageSelector", field.name]} label={field.label}>
                                                  <ImagePriceParameterInput field={field} />
                                              </Form.Item>
                                          ))
                                    : null}
                                {isImage && !image?.parameters && (image?.resolution?.supported || (image && imageResolutionTiers(image).length > 0)) ? (
                                    <Form.Item className="mb-0" name={[index, "imageResolution"]} label={translate("admin.channelModelPriceTierFields.upstreamResolution")} rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.selectAnUpstreamResolution") }]}>
                                        <Select
                                            options={[
                                                { label: translate("admin.channelModelPriceTierFields.anyResolution"), value: "*" },
                                                ...[...new Set([...(image?.resolution?.supported ? image.resolution.values : imageResolutionTiers(image!)), "1.5k"])].map((value) => ({ label: value.toUpperCase(), value })),
                                            ]}
                                        />
                                    </Form.Item>
                                ) : null}
                                {isImage && !image?.parameters && image?.quality.supported ? (
                                    <Form.Item className="mb-0" name={[index, "quality"]} label={translate("admin.channelModelPriceTierFields.quality")} rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.selectAQuality") }]}>
                                        <Select options={[{ label: translate("admin.channelModelPriceTierFields.anyQuality"), value: "*" }, ...image.quality.values.map((value) => ({ label: value.toUpperCase(), value }))]} />
                                    </Form.Item>
                                ) : null}
                                {isImage && !image?.parameters && image?.size.parameter !== "none" ? (
                                    <Form.Item className="mb-0" name={[index, "size"]} label={translate("admin.channelModelPriceTierFields.aspectRatioSize")}>
                                        <Input placeholder={translate("admin.channelModelPriceTierFields.anyOr111691024x1024")} />
                                    </Form.Item>
                                ) : null}
                                <Form.Item className="admin-price-tier-upstream mb-0" name={[index, "providerModelKey"]} label={translate("admin.channelModelPriceTierFields.upstreamModelIDForMatchingRequests")}>
                                    <Input placeholder={translate("admin.channelModelPriceTierFields.leaveBlankToUseTheModelSDefaultUpstreamID")} />
                                </Form.Item>
                            </div>
                        </section>
                    )}
                    <section className="admin-price-tier-panel admin-price-tier-selling-panel">
                        <div className="admin-price-tier-panel-heading">
                            <div>
                                <h3>{translate("admin.channelModelPriceTierFields.sellingPrice")}</h3>
                                <p>{priceCurrency !== "USD" && priceCurrency !== "CNY" ? translate("admin.channelModelPriceTierFields.setTheCreditsUsersSpendOnACompletedGeneration") : translate("admin.channelModelPriceTierFields.enterTheSellingPriceInChargesAreConvertedToCredits", { v0: String(priceUnit) })}</p>
                            </div>
                        </div>
                        <div className="admin-price-tier-billing-grid">
                            <Form.Item className="admin-price-tier-billing-mode mb-0" name={[index, "billingMode"]} label={translate("admin.channelModelPriceTierFields.billingMode")} rules={[{ required: true }]}>
                                <Segmented
                                    className="w-full"
                                    options={[
                                        { label: translate("admin.channelModelPriceTierFields.perCall"), value: "fixed_request" },
                                        { label: translate("admin.channelModelPriceTierFields.perSecond"), value: "per_second", disabled: !isDurationPriced },
                                        { label: isVideo ? translate("admin.channelModelPriceTierFields.videoTokens") : "Token", value: "token", disabled: !tokenEnabled },
                                    ]}
                                />
                            </Form.Item>
                            {billingMode === "token" ? (
                                isVideo ? (
                                    <Form.Item className="admin-price-tier-unit-price mb-0" name={[index, "outputTokenPrice"]} label={translate("admin.channelModelPriceTierFields.millionVideoTokens", { v0: String(priceUnit) })} rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.enterTheVideoTokenPrice") }]}>
                                        <InputNumber className="w-full" min={0} max={1_000_000} precision={6} step={0.1} />
                                    </Form.Item>
                                ) : (
                                    <div className="admin-price-tier-token-grid">
                                        <Form.Item className="admin-price-tier-unit-price mb-0" name={[index, "inputTokenPrice"]} label={translate("admin.channelModelPriceTierFields.inputMillionTokens", { v0: String(priceUnit) })} rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.enterTheInputTokenPrice") }]}>
                                            <InputNumber className="w-full" min={0} max={1_000_000} precision={6} step={0.1} />
                                        </Form.Item>
                                        <Form.Item className="admin-price-tier-unit-price mb-0" name={[index, "outputTokenPrice"]} label={translate("admin.channelModelPriceTierFields.outputMillionTokens", { v0: String(priceUnit) })} rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.enterTheOutputTokenPrice") }]}>
                                            <InputNumber className="w-full" min={0} max={1_000_000} precision={6} step={0.1} />
                                        </Form.Item>
                                        <Form.Item className="admin-price-tier-unit-price mb-0" name={[index, "cachedTokenPrice"]} label={translate("admin.channelModelPriceTierFields.cacheReadMillionTokens", { v0: String(priceUnit) })} rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.enterTheCacheReadPrice") }]}>
                                            <InputNumber className="w-full" min={0} max={1_000_000} precision={6} step={0.1} />
                                        </Form.Item>
                                        <Form.Item
                                            className="admin-price-tier-unit-price mb-0"
                                            name={[index, "cacheWriteTokenPrice"]}
                                            label={translate("admin.channelModelPriceTierFields.cacheWriteMillionTokens", { v0: String(priceUnit) })}
                                            tooltip={translate("admin.channelModelPriceTierFields.inputTokensUsedToCreatePromptCachesEGClaude")}
                                            rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.enterTheCacheWritePrice") }]}
                                        >
                                            <InputNumber className="w-full" min={0} max={1_000_000} precision={6} step={0.1} />
                                        </Form.Item>
                                    </div>
                                )
                            ) : (
                                <Form.Item
                                    className="admin-price-tier-unit-price mb-0"
                                    name={[index, "unitPrice"]}
                                    label={billingMode === "per_second" ? translate("admin.channelModelPriceTierFields.sellingPricePerSecond", { v0: String(priceUnit) }) : translate("admin.channelModelPriceTierFields.sellingPricePerRequest", { v0: String(priceUnit) })}
                                    rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.enterTheSellingPrice") }]}
                                >
                                    <InputNumber className="w-full" min={0} max={1_000_000} precision={6} step={0.1} />
                                </Form.Item>
                            )}
                        </div>
                        {referenceVideoPriced ? (
                            <div className="admin-price-tier-billing-grid">
                                <Form.Item
                                    className="admin-price-tier-unit-price mb-0"
                                    name={[index, billingMode === "token" ? "referenceVideoOutputTokenPrice" : "referenceVideoUnitPrice"]}
                                    label={billingMode === "token" ? translate("admin.channelModelPriceTierFields.withReferenceVideoMillionVideoTokens", { v0: String(priceUnit) }) : translate("admin.channelModelPriceTierFields.pricePerSecondWithReferenceVideo", { v0: String(priceUnit) })}
                                    tooltip={billingMode === "token" ? translate("admin.channelModelPriceTierFields.requestsWithReferenceVideosUseTokenUsageIncludingReferenceDuration") : translate("admin.channelModelPriceTierFields.requestsWithReferenceVideosUseGeneratedSecondsReferenceSecondsMeasured")}
                                    rules={[{ required: true, message: translate("admin.channelModelPriceTierFields.enterThePriceWithReferenceVideo") }]}
                                >
                                    <InputNumber className="w-full" min={0} max={1_000_000} precision={6} step={0.1} />
                                </Form.Item>
                            </div>
                        ) : null}
                        {isVideo && billingMode === "token" ? (
                            <div className="admin-price-tier-helper" role="note">
                                <strong>{translate("admin.channelModelPriceTierFields.videoTokenBilling")}</strong>
                                <span>
                                    {referenceVideoBilling ? translate("admin.channelModelPriceTierFields.estimateWidthHeight24FpsOutputDurationReferenceVideoDuration") : translate("admin.channelModelPriceTierFields.estimateWidthHeight24FpsOutputDuration1024ReferenceVideos")}
                                    {translate("admin.channelModelPriceTierFields.billingUsesValidUpstreamUsageWhenAvailableOtherwiseTheFormula")}
                                </span>
                            </div>
                        ) : null}
                        <CreditCostFields index={index} form={form} billingMode={billingMode} isVideo={isVideo} referenceVideoBilling={referenceVideoBilling} />
                    </section>
                </div>
                {staleTierUpstream ? (
                    <Alert
                        className="admin-price-tier-alert"
                        type="warning"
                        showIcon
                        title={translate("admin.channelModelPriceTierFields.thisFlatPriceTierStillUsesASeparateUpstreamModel")}
                        description={translate("admin.channelModelPriceTierFields.requestsMatchingThisTierUseInsteadOfTheModelS", { v0: String(staleTierUpstream), v1: String(modelUpstream) })}
                        action={
                            <Button
                                size="small"
                                onClick={() => {
                                    onDirty();
                                    form.setFieldValue(["priceTiers", index, "providerModelKey"], "");
                                }}
                            >
                                {translate("admin.channelModelPriceTierFields.clearAndUseModelDefault")}
                            </Button>
                        }
                    />
                ) : null}
            </div>
        </article>
    );
}

function ImagePriceParameterInput({ field, value, onChange }: { field: import("@/lib/image-parameters").ImageParameter; value?: string; onChange?: (value?: string) => void }) {
    // 分辨率字段始终提供 1.5K：声明式 Seedream 档位包含它，旧定价也需要能选中。
    if (field.name === "imageResolution") {
        const standardChoices = ["1k", "1.5k", "2k", "4k"];
        const values = field.values?.length ? [...new Set([...field.values.map(String), "1.5k"])] : standardChoices;
        return <Select allowClear placeholder={translate("admin.channelModelPriceTierFields.any")} value={value} options={[{ label: translate("admin.channelModelPriceTierFields.anyResolution"), value: "*" }, ...values.map((v) => ({ label: v.toUpperCase(), value: v }))]} onChange={onChange} />;
    }
    const typed = value === undefined || value === "" || value === "*" ? undefined : field.type === "boolean" ? value === "true" : field.type === "number" || field.type === "integer" ? Number(value) : value;
    if (field.type === "boolean")
        return (
            <Select
                allowClear
                placeholder={translate("admin.channelModelPriceTierFields.any")}
                value={value}
                options={[
                    { label: translate("admin.channelModelPriceTierFields.on"), value: "true" },
                    { label: translate("common.close"), value: "false" },
                ]}
                onChange={onChange}
            />
        );
    return <ImageParameterInput field={field} value={typed} onChange={(next) => onChange?.(next === undefined ? undefined : String(next))} />;
}

const fpsBandOptions = [
    { label: translate("admin.channelModelPriceTierFields.anyFrameRate"), value: "*" },
    { label: "≤30fps", value: "le30" },
    { label: "30–60fps", value: "le60" },
    { label: "60–120fps", value: "le120" },
];

function operationOptions(capability: EditableCapability | undefined) {
    const options = [{ label: translate("admin.channelModelPriceTierFields.anyGenerationMode"), value: "*" }];
    if (capability === "image") return [...options, { label: translate("admin.channelModelPriceTierFields.textToImage"), value: "text_to_image" }, { label: translate("admin.channelModelPriceTierFields.imageToImage"), value: "image_to_image" }];
    if (capability === "video") return [...options, { label: translate("admin.channelModelPriceTierFields.textToVideo"), value: "text_to_video" }, { label: translate("admin.channelModelPriceTierFields.imageToVideo"), value: "image_to_video" }, { label: translate("admin.channelModelPriceTierFields.videoToVideo"), value: "video_to_video" }, { label: translate("admin.channelModelPriceTierFields.qualityEnhancement"), value: "enhance" }];
    if (capability === "text") return [...options, { label: translate("admin.channelModelPriceTierFields.textGeneration"), value: "text_generation" }];
    return options;
}
