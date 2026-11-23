import { Form, InputNumber, Switch, type FormInstance } from "antd";
import type { ChannelModelFormValues } from "./channel-model-editor-form";
import { translate } from "@/i18n";

export function CreditCostFields({
    index,
    form,
    billingMode,
    isVideo,
    referenceVideoBilling = false,
}: {
    index: number;
    form: FormInstance<ChannelModelFormValues>;
    billingMode: string;
    isVideo: boolean;
    /** 视频模型开启参考视频计费时，按秒档和视频 Token 档另填一套带参考视频的成本价；按次档不需要。 */
    referenceVideoBilling?: boolean;
}) {
    const configured = Form.useWatch(["priceTiers", index, "costConfigured"], form) === true;
    const referenceVideoCost = isVideo && referenceVideoBilling && (billingMode === "per_second" || billingMode === "token");
    const fields =
        billingMode === "token"
            ? isVideo
                ? [
                      ["costOutputTokenPrice", translate("admin.creditCostFields.creditsMillionVideoTokens")],
                      ...(referenceVideoCost ? [["costReferenceVideoOutputTokenPrice", translate("admin.creditCostFields.withReferenceVideoCreditsMillionVideoTokens")]] : []),
                  ]
                : [
                      ["costInputTokenPrice", translate("admin.creditCostFields.inputMillionTokens")],
                      ["costOutputTokenPrice", translate("admin.creditCostFields.outputMillionTokens")],
                      ["costCachedTokenPrice", translate("admin.creditCostFields.cacheReadMillionTokens")],
                      ["costCacheWriteTokenPrice", translate("admin.creditCostFields.cacheWriteMillionTokens")],
                  ]
            : [
                  ["costUnitPrice", billingMode === "per_second" ? translate("admin.creditCostFields.creditsSecond") : translate("admin.creditCostFields.creditsRequest")],
                  ...(referenceVideoCost ? [["costReferenceVideoUnitPrice", translate("admin.creditCostFields.withReferenceVideoCreditsSecond")]] : []),
              ];
    return (
        <section className="admin-price-tier-cost-panel" aria-label={translate("admin.creditCostFields.creditCostSettings")}>
            <header className="admin-price-tier-cost-header">
                <div className="admin-price-tier-cost-heading">
                    <div className="admin-price-tier-cost-title">
                        <span>{translate("admin.creditCostFields.creditCost")}</span>
                        <span className="admin-price-tier-cost-badge">{translate("admin.creditCostFields.visibleToAdministratorsOnly")}</span>
                    </div>
                    <p>{referenceVideoCost ? translate("admin.creditCostFields.enterCostsUsingTheCurrentBillingMethodRequestsWithReference") : translate("admin.creditCostFields.enterCostsUsingTheCurrentBillingMethodUserSellingPrices")}</p>
                </div>
                <Form.Item className="admin-price-tier-cost-switch mb-0" name={[index, "costConfigured"]} valuePropName="checked">
                    <Switch aria-label={translate("admin.creditCostFields.configureCreditCostPrice")} />
                </Form.Item>
            </header>
            {configured ? (
                <div className={billingMode === "token" && !isVideo ? "admin-price-tier-cost-grid admin-price-tier-cost-token-grid" : "admin-price-tier-cost-grid"}>
                    {fields.map(([field, label]) => (
                        <Form.Item key={field} className="mb-0" name={[index, field]} label={label} rules={[{ required: true, message: translate("admin.creditCostFields.enterTheCreditCostPrice") }]}>
                            <InputNumber className="w-full" min={0} max={1_000_000} precision={6} step={0.1} />
                        </Form.Item>
                    ))}
                </div>
            ) : null}
        </section>
    );
}
