import { useState } from "react";
import { Button, Checkbox, Form, Input, InputNumber, Switch, type FormInstance } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/base/select";
import { priceCurrencyUnit } from "@/services/api/user-groups";
import type { ChannelModelFormValues as FormValues } from "./channel-model-editor-form";
import { validateTokenPriceRules } from "./channel-model-editor-form";
import { defaultTokenPriceRule, tokenRuleClockMinutes, tokenRulesMatchingNow, type PriceTierFormValues, type TokenPriceRuleFormValues } from "./channel-model-price-tier-form";
import { currentLocale, translate } from "@/i18n";

const weekdayOptions = [
    translate("admin.channelModelTokenRules.mon"),
    translate("admin.channelModelTokenRules.tue"),
    translate("admin.channelModelTokenRules.wed"),
    translate("admin.channelModelTokenRules.thu"),
    translate("admin.channelModelTokenRules.fri"),
    translate("admin.channelModelTokenRules.sat"),
    translate("admin.channelModelTokenRules.sun"),
].map((label, index) => ({ label, value: index + 1 }));

/**
 * 文本 Token 价格档的分时与上下文价格。规则挂在某个 Token 价格档上：时段按任务创建时的上海时间锁定，
 * 上下文档位按上游真实输入 Token 结算；按顺序取首条命中，未命中时用该价格档的基础 Token 单价。
 */
export function TokenPriceRulesSection({ form, onDirty }: { form: FormInstance<FormValues>; onDirty: () => void }) {
    const tiers: PriceTierFormValues[] = Form.useWatch("priceTiers", form) || [];
    const priceUnit = priceCurrencyUnit(Form.useWatch("priceCurrency", form));
    const tokenTierIndexes = tiers.flatMap((tier, index) => (tier?.billingMode === "token" ? [index] : []));
    const [preferredTier, setPreferredTier] = useState<number>();
    const tierIndex = preferredTier !== undefined && tokenTierIndexes.includes(preferredTier) ? preferredTier : tokenTierIndexes[0];
    const rules: TokenPriceRuleFormValues[] = Form.useWatch(["priceTiers", tierIndex ?? 0, "tokenRules"], form) || [];
    const enabled = Form.useWatch(["priceTiers", tierIndex ?? 0, "tokenRulesEnabled"], form) === true;
    if (tierIndex === undefined) return null;
    const tier = tiers[tierIndex];
    const matching = tokenRulesMatchingNow(rules);
    const statusLabel = !enabled
        ? translate("admin.channelModelTokenRules.disabledAllRequestsUseTheBasePrice")
        : matching.length
          ? translate("admin.channelModelTokenRules.currentTimeSlotMatchesRules", { v0: String(matching.map((index) => index + 1).join("、")) })
          : translate("admin.channelModelTokenRules.noCurrentTimeSlotMatchUsingTheBasePrice");
    return (
        <section className="admin-model-editor-section" aria-label={translate("admin.channelModelTokenRules.timeAndContextPricing")}>
            <div className="admin-token-rules-header">
                <header className="admin-model-editor-section-heading">
                    <h2>{translate("admin.channelModelTokenRules.timeAndContextPricing")}</h2>
                    <p>{translate("admin.channelModelTokenRules.setSeparateTokenPricesByShanghaiTimeSlotAndInput")}</p>
                </header>
                <div className="admin-price-tier-toggle">
                    <span>{translate("admin.channelModelTokenRules.enableExtension")}</span>
                    <Form.Item noStyle name={["priceTiers", tierIndex, "tokenRulesEnabled"]} valuePropName="checked">
                        <Switch aria-label={translate("admin.channelModelTokenRules.enableTimeAndContextPricing")} onChange={onDirty} />
                    </Form.Item>
                </div>
            </div>
            <div className="admin-model-editor-section-content admin-token-rules-content">
                <div className="admin-token-rules-toolbar">
                    {tokenTierIndexes.length > 1 ? (
                        <label className="admin-token-rules-tier-picker">
                            <span>{translate("admin.channelModelTokenRules.baseTokenPriceTier")}</span>
                            <Select value={tierIndex} onChange={(value) => setPreferredTier(Number(value))} options={tokenTierIndexes.map((index) => ({ value: index, label: tierLabel(tiers[index], index) }))} />
                        </label>
                    ) : (
                        <span className="admin-token-rules-tier-name">
                            {translate("admin.channelModelTokenRules.basePriceTier")}
                            {tierLabel(tier, tierIndex)}
                        </span>
                    )}
                    <span className="admin-price-tier-cost-badge" role="status">
                        {statusLabel}
                    </span>
                </div>
                <Form.List
                    name={["priceTiers", tierIndex, "tokenRules"]}
                    rules={[
                        {
                            validator: async (_, value) => {
                                validateTokenPriceRules(form.getFieldValue(["priceTiers", tierIndex]), value);
                            },
                        },
                    ]}
                >
                    {(fields, { add, remove }, { errors }) => (
                        <div className="admin-price-tier-list-shell">
                            {fields.length ? (
                                <div className="admin-price-tier-list" aria-label={translate("admin.channelModelTokenRules.timeAndContextPricingRules")}>
                                    {fields.map((field, ordinal) => (
                                        <TokenPriceRuleCard
                                            key={field.key}
                                            form={form}
                                            path={["priceTiers", tierIndex, "tokenRules", field.name]}
                                            name={field.name}
                                            ordinal={ordinal + 1}
                                            priceUnit={priceUnit}
                                            onDirty={onDirty}
                                            onRemove={() => {
                                                onDirty();
                                                remove(field.name);
                                            }}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="admin-token-rules-empty">{translate("admin.channelModelTokenRules.noRulesYetAddRulesToSetDifferentUnitPrices")}</p>
                            )}
                            <div className="admin-price-tier-list-footer">
                                <Button
                                    className="admin-model-editor-add-tier"
                                    type="dashed"
                                    block
                                    icon={<Plus className="size-4" />}
                                    onClick={() => {
                                        onDirty();
                                        add(defaultTokenPriceRule(tier));
                                    }}
                                >
                                    {translate("admin.channelModelTokenRules.addTimeSlotTier")}
                                </Button>
                                <Form.ErrorList errors={errors} />
                            </div>
                        </div>
                    )}
                </Form.List>
            </div>
        </section>
    );
}

function tierLabel(tier: PriceTierFormValues | undefined, index: number) {
    return `${String(index + 1).padStart(2, "0")} · ${tier?.matchMode === "default" ? translate("admin.channelModelTokenRules.defaultTokenPriceTier") : translate("admin.channelModelTokenRules.specificationTokenPriceTier")}`;
}

function TokenPriceRuleCard({ form, path, name, ordinal, priceUnit, onDirty, onRemove }: { form: FormInstance<FormValues>; path: (string | number)[]; name: number; ordinal: number; priceUnit: string; onDirty: () => void; onRemove: () => void }) {
    const rule: TokenPriceRuleFormValues | undefined = Form.useWatch(path, form);
    const enabled = rule?.enabled !== false;
    const min = rule?.minInputTokens || 0;
    const max = rule?.maxInputTokens || 0;
    const summary =
        max > 0
            ? translate("admin.channelModelTokenRules.inputTokens", { v0: String(min.toLocaleString(currentLocale())), v1: String(max.toLocaleString(currentLocale())) })
            : translate("admin.channelModelTokenRules.inputTokensOrMore", { v0: String(min.toLocaleString(currentLocale())) });
    return (
        <article className="admin-price-tier-card">
            <header className="admin-price-tier-card-header">
                <div className="admin-price-tier-card-heading">
                    <span className="admin-price-tier-card-index">{String(ordinal).padStart(2, "0")}</span>
                    <div className="admin-price-tier-card-heading-copy">
                        <div className="admin-price-tier-card-title">{enabled ? translate("admin.channelModelTokenRules.includedInBilling") : translate("admin.channelModelTokenRules.excludedFromBilling")}</div>
                        <div className="admin-price-tier-card-summary">{summary}</div>
                    </div>
                </div>
                <div className="admin-price-tier-card-actions">
                    <Form.Item noStyle name={[name, "enabled"]} valuePropName="checked">
                        <Switch aria-label={translate("admin.channelModelTokenRules.includeRuleInBilling", { v0: String(ordinal) })} onChange={onDirty} />
                    </Form.Item>
                    <Button type="text" danger aria-label={translate("admin.channelModelTokenRules.deleteRule", { v0: String(ordinal) })} icon={<Trash2 className="size-3.5" />} onClick={onRemove}>
                        {translate("common.delete")}
                    </Button>
                </div>
            </header>
            <div className="admin-token-rule-body">
                <div className="admin-token-rule-column">
                    <Form.Item
                        className="mb-0"
                        name={[name, "weekdays"]}
                        label={translate("admin.channelModelTokenRules.daysOfWeek")}
                        rules={[{ required: true, type: "array", min: 1, message: translate("admin.channelModelTokenRules.selectAtLeastOneDay") }]}
                    >
                        <Checkbox.Group options={weekdayOptions} />
                    </Form.Item>
                    <div className="admin-token-rule-pair">
                        <Form.Item className="mb-0" name={[name, "start"]} label={translate("admin.channelModelTokenRules.start")} rules={[{ validator: async (_, value) => clockRule(value, false) }]}>
                            <Input inputMode="numeric" maxLength={5} placeholder="00:00" />
                        </Form.Item>
                        <Form.Item className="mb-0" name={[name, "end"]} label={translate("admin.channelModelTokenRules.end")} rules={[{ validator: async (_, value) => clockRule(value, true) }]}>
                            <Input inputMode="numeric" maxLength={5} placeholder="24:00" />
                        </Form.Item>
                    </div>
                </div>
                <div className="admin-token-rule-column">
                    <span className="admin-token-rule-label">{translate("admin.channelModelTokenRules.inputContext")}</span>
                    <div className="admin-token-rule-range">
                        <span aria-hidden>≥</span>
                        <Form.Item noStyle name={[name, "minInputTokens"]}>
                            <InputNumber aria-label={translate("admin.channelModelTokenRules.minimumInputContextInclusive")} className="w-full" min={0} precision={0} step={1000} />
                        </Form.Item>
                        <span>Token</span>
                    </div>
                    <div className="admin-token-rule-range">
                        <span aria-hidden>&lt;</span>
                        <Form.Item noStyle name={[name, "maxInputTokens"]}>
                            <InputNumber
                                aria-label={translate("admin.channelModelTokenRules.maximumInputContextExclusiveLeaveBlankForNoLimit")}
                                className="w-full"
                                min={1}
                                precision={0}
                                step={1000}
                                placeholder={translate("admin.channelModelTokenRules.noLimit")}
                            />
                        </Form.Item>
                        <span>Token</span>
                    </div>
                </div>
                <div className="admin-token-rule-prices">
                    {(
                        [
                            ["inputTokenPrice", translate("admin.channelModelTokenRules.input")],
                            ["outputTokenPrice", translate("admin.channelModelTokenRules.output")],
                            ["cachedTokenPrice", translate("admin.channelModelTokenRules.cacheRead")],
                            ["cacheWriteTokenPrice", translate("admin.channelModelTokenRules.cacheWrite")],
                        ] as const
                    ).map(([field, label]) => (
                        <Form.Item
                            key={field}
                            className="admin-price-tier-unit-price mb-0"
                            name={[name, field]}
                            label={translate("admin.channelModelTokenRules.millionTokens", { v0: String(label), v1: String(priceUnit) })}
                            rules={[{ required: true, message: translate("admin.channelModelTokenRules.enterThePrice", { v0: String(label) }) }]}
                        >
                            <InputNumber className="w-full" min={0} max={1_000_000} precision={6} step={0.1} />
                        </Form.Item>
                    ))}
                </div>
            </div>
        </article>
    );
}

function clockRule(value: unknown, end: boolean) {
    if (tokenRuleClockMinutes(String(value ?? ""), end) === null) throw new Error(end ? translate("admin.channelModelTokenRules.useHHMMFormatNoLaterThan2400") : translate("admin.channelModelTokenRules.useHHMMFormat00002359"));
}
