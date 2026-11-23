import { useState } from "react";
import { Alert, App, Button, InputNumber, Table } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import { repriceAdminAllChannelModels, repriceAdminChannelModels, type ChannelModel } from "@/services/api/wallet";
import { specificationLabel } from "./channel-model-cost-summary";
import { formatModelMarkup, formatModelPrice, modelRepricePayload, modelRepriceRows, parseSaleInput, previewModelRepricing, type ModelRepriceRow } from "./channel-model-pricing";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

type RepriceModel = ChannelModel & { channelName?: string };

/** 不传 channelId 时为跨渠道调价，所选模型可来自不同系统渠道。 */
export function ChannelModelRepriceDialog({ channelId, channelName, items, onClose, onSaved }: { channelId?: string; channelName?: string; items: RepriceModel[]; onClose: () => void; onSaved: () => Promise<void> }) {
    const { message } = App.useApp();
    const [margin, setMargin] = useState<number | null>(null);
    const [decimalPlaces, setDecimalPlaces] = useState(2);
    const [rows, setRows] = useState(() => modelRepriceRows(items));
    const [calculationError, setCalculationError] = useState("");
    const [saving, setSaving] = useState(false);
    let validationError = "";
    try {
        modelRepricePayload(items, rows);
    } catch (cause) {
        validationError = cause instanceof Error ? cause.message : translate("admin.channelModelRepriceDialog.invalidSellingPrice");
    }
    const original = new Map(modelRepriceRows(items).map((row) => [row.key, row.sale]));
    const changed = rows.filter((row) => {
        try {
            return parseSaleInput(row.sale) !== parseSaleInput(original.get(row.key) ?? null);
        } catch {
            return false;
        }
    }).length;
    const recalculate = (nextMargin: number | null, places: number) => {
        setMargin(nextMargin);
        setDecimalPlaces(places);
        if (nextMargin === null) {
            setCalculationError("");
            return;
        }
        try {
            setRows(modelRepriceRows(previewModelRepricing(items, nextMargin, places)));
            setCalculationError("");
        } catch (cause) {
            setCalculationError(cause instanceof Error ? cause.message : translate("admin.channelModelRepriceDialog.unableToCalculateSellingPrices"));
        }
    };
    const save = async () => {
        if (validationError || calculationError || !changed || saving) return;
        setSaving(true);
        try {
            const payload = modelRepricePayload(items, rows);
            const result = channelId ? await repriceAdminChannelModels(channelId, payload) : await repriceAdminAllChannelModels(payload);
            message.success(translate("admin.channelModelRepriceDialog.savedSellingPricesForModels", { v0: String(result.updated) }));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : translate("admin.channelModelRepriceDialog.bulkPriceAdjustmentFailed"));
            setSaving(false);
            return;
        }
        try {
            await onSaved();
        } catch {
            message.warning(translate("admin.channelModelRepriceDialog.pricesSavedButTheListCouldNotBeRefreshedRefresh"));
        } finally {
            setSaving(false);
            onClose();
        }
    };
    return (
        <AdminModal
            title={translate("admin.channelModelRepriceDialog.bulkPriceAdjustmentModels", { v0: String(items.length) })}
            open
            centered
            width={1180}
            rootClassName="admin-model-reprice-modal"
            onCancel={onClose}
            closable={!saving}
            mask={{ closable: !saving }}
            keyboard={!saving}
            confirmLoading={saving}
            cancelButtonProps={{ disabled: saving }}
            okButtonProps={{ disabled: Boolean(validationError || calculationError) || !changed }}
            okText={translate("admin.channelModelRepriceDialog.saveSellingPrices", { v0: String(changed ? translate("admin.channelModelRepriceDialog.items", { v0: String(changed) }) : "") })}
            onOk={() => void save()}
        >
            <div className="admin-model-reprice">
                <div className="admin-model-reprice-controls">
                    <div className="admin-model-reprice-field">
                        <label htmlFor="reprice-margin">{translate("admin.channelModelRepriceDialog.markup")}</label>
                        <InputNumber
                            id="reprice-margin"
                            aria-label={translate("admin.channelModelRepriceDialog.markup")}
                            size="large"
                            value={margin}
                            onChange={(value) => recalculate(value, decimalPlaces)}
                            min={0}
                            max={1000}
                            step={5}
                            suffix="%"
                            placeholder={translate("admin.channelModelRepriceDialog.enterAPercentage")}
                            disabled={saving}
                        />
                    </div>
                    <div className="admin-model-reprice-field">
                        <label htmlFor="reprice-decimals">{translate("admin.channelModelRepriceDialog.decimalPlaces")}</label>
                        <Select
                            id="reprice-decimals"
                            aria-label={translate("admin.channelModelRepriceDialog.decimalPlaces")}
                            size="large"
                            value={decimalPlaces}
                            disabled={saving}
                            onChange={(value) => recalculate(margin, value)}
                            options={Array.from({ length: 7 }, (_, value) => ({ value, label: translate("admin.channelModelRepriceDialog.decimalPlaces2", { v0: String(value) }) }))}
                        />
                    </div>
                    <Button size="large" disabled={saving || margin === null} onClick={() => recalculate(margin, decimalPlaces)}>
                        {translate("admin.channelModelRepriceDialog.recalculate")}
                    </Button>
                    <div className="admin-model-reprice-formula">
                        <strong>{translate("admin.channelModelRepriceDialog.calculatedFromCostAndRounded")}</strong>
                        <span>{translate("admin.channelModelRepriceDialog.newSellingPriceCostPrice1Markup")}</span>
                    </div>
                </div>
                <p className="admin-model-reprice-note">{translate("admin.channelModelRepriceDialog.changingTheMarkupOrDecimalPlacesOrClickingRecalculateRecalculates")}</p>
                <div className="admin-model-reprice-list-heading">
                    <strong>{translate("admin.channelModelRepriceDialog.modelPrice")}</strong>
                    <span>
                        {rows.length} {translate("admin.channelModelRepriceDialog.billingItemsModified")} {changed} {translate("library.picker.itemUnit")}
                    </span>
                </div>
                <ChannelModelRepriceTable
                    items={items}
                    rows={rows}
                    channelName={channelName}
                    decimalPlaces={decimalPlaces}
                    disabled={saving}
                    onSaleChange={(key, value) => setRows((current) => current.map((entry) => (entry.key === key ? { ...entry, sale: value, manual: true } : entry)))}
                />
                {calculationError || validationError ? <Alert type="warning" showIcon title={calculationError || validationError} /> : null}
                <p className="admin-model-reprice-note">{translate("admin.channelModelRepriceDialog.onlySellingPricesOfEnabledSpecificationsAreChangedCostsAnd")}</p>
            </div>
        </AdminModal>
    );
}

export function ChannelModelRepriceTable({
    items,
    rows,
    channelName,
    decimalPlaces,
    disabled,
    onSaleChange,
}: {
    items: RepriceModel[];
    rows: ModelRepriceRow[];
    channelName?: string;
    decimalPlaces: number;
    disabled: boolean;
    onSaleChange: (key: string, value: string | null) => void;
}) {
    const byModel = new Map<string, ModelRepriceRow[]>();
    for (const row of rows) {
        const group = byModel.get(row.model.id) ?? [];
        group.push(row);
        byModel.set(row.model.id, group);
    }
    return (
        <Table<RepriceModel>
            className="admin-model-reprice-table"
            rowKey="id"
            dataSource={items}
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: 1040 }}
            locale={{ emptyText: translate("admin.channelModelRepriceDialog.noSelectedModels") }}
            columns={[
                { title: translate("admin.channelModelRepriceDialog.modelDisplayName"), width: 180, render: (_, model) => <strong>{model.displayName || model.modelKey}</strong> },
                {
                    title: translate("admin.channelModelRepriceDialog.channelDisplayNameUpstreamModelID"),
                    width: 220,
                    render: (_, model) => (
                        <div className="admin-model-reprice-identity">
                            <span>{channelName ? model.channelLabel || channelName : [model.channelName, model.channelLabel].filter(Boolean).join(" · ")}</span>
                            <small className="admin-monospace">{model.providerModelKey || model.modelKey}</small>
                        </div>
                    ),
                },
                // One model per table row; the shared grid keeps each specification and its prices aligned even when labels wrap.
                {
                    title: translate("admin.channelModelRepriceDialog.specifications"),
                    width: 140,
                    onCell: () => ({ colSpan: 3, className: "admin-model-reprice-spec-cell" }),
                    render: (_, model) => (
                        <div className="admin-model-reprice-specs">
                            {(byModel.get(model.id) ?? []).map((row) => {
                                let sale: number | undefined;
                                try {
                                    sale = parseSaleInput(row.sale);
                                } catch {
                                    /* Incomplete input remains visible and blocks saving. */
                                }
                                const cost = row.tier.costPricing?.configured ? row.tier.costPricing[row.field.key] : undefined;
                                return (
                                    <div key={row.key} className="admin-model-reprice-spec-row">
                                        <div className="admin-model-reprice-identity">
                                            <span>{specificationLabel(row.tier)}</span>
                                            {row.field.label && <small>{row.field.label}</small>}
                                            {row.tier.providerModelKey && row.tier.providerModelKey !== (model.providerModelKey || model.modelKey) && (
                                                <small className="admin-monospace">
                                                    {translate("admin.channelModelRepriceDialog.upstream")}
                                                    {row.tier.providerModelKey}
                                                </small>
                                            )}
                                        </div>
                                        <div className="admin-model-reprice-identity">
                                            <span>{cost === undefined ? translate("admin.channelModelRepriceDialog.costNotConfigured") : formatModelPrice(cost)}</span>
                                            <small>
                                                {translate("admin.channelModelRepriceDialog.credits")} {row.field.unit}
                                            </small>
                                        </div>
                                        <div className="admin-model-reprice-sale">
                                            <InputNumber<string>
                                                stringMode
                                                aria-label={translate("admin.channelModelRepriceDialog.sellingPrice", { v0: String(model.displayName || model.modelKey), v1: String(specificationLabel(row.tier)), v2: String(row.field.label) })}
                                                size="middle"
                                                value={row.sale}
                                                min="0"
                                                step={String(10 ** -decimalPlaces)}
                                                disabled={disabled}
                                                status={sale === undefined ? "error" : undefined}
                                                onChange={(value) => onSaleChange(row.key, value)}
                                            />
                                            <small>
                                                {row.manual ? translate("admin.channelModelRepriceDialog.manuallyEdited") + " " : ""}
                                                {translate("admin.channelModelRepriceDialog.markup2")} {formatModelMarkup(cost, sale)}
                                            </small>
                                        </div>
                                    </div>
                                );
                            })}
                            {!byModel.get(model.id)?.length && <div className="admin-model-reprice-no-spec">{translate("admin.channelModelRepriceDialog.noEnabledSpecifications")}</div>}
                        </div>
                    ),
                },
                { title: translate("admin.channelModelRepriceDialog.costPrice"), width: 160, onCell: () => ({ colSpan: 0 }) },
                { title: translate("admin.channelModelRepriceDialog.sellingPriceCredits"), width: 340, onCell: () => ({ colSpan: 0 }) },
            ]}
        />
    );
}
