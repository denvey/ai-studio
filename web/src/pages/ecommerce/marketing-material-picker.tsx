import { Check, Minus, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { EcommerceDraft } from "@/services/api/ecommerce";
import { imageSizeLabel } from "./catalog";
import { commerceUiText } from "./ui-text";
import { CommerceHint } from "./commerce-hint";
import { automaticMarketingSelections, marketingCategories, marketingMaterialById, marketingMaterials, parseMarketingSelections, recommendMarketingSelections, type MarketingSelection } from "./marketing-materials";

import { translate } from "@/i18n";
export function MarketingMaterialPicker({ draft, ratios, onChange, onClose }: { draft: EcommerceDraft; ratios: string[]; onChange: (selections: MarketingSelection[]) => void; onClose: () => void }) {
    const [category, setCategory] = useState<string>(() => marketingMaterialById.get(parseMarketingSelections(draft)[0]?.id)?.category || marketingCategories[0]);
    const available = ratios.length ? ratios : [draft.ratio];
    const savedSelections = parseMarketingSelections(draft);
    const selections = automaticMarketingSelections(savedSelections, available, draft.ratio);
    const selected = new Map(selections.map((item) => [item.id, item]));
    const count = selections.reduce((sum, item) => sum + item.count, 0);
    useEffect(() => {
        if ((draft.typeOptions?.materialPlan || "[]") !== JSON.stringify(selections)) onChange(selections);
    }, [draft.typeOptions?.materialPlan, available.join("|"), draft.ratio]);
    const update = (id: string, change: (entry: MarketingSelection | undefined) => MarketingSelection | undefined) => {
        const next = change(selected.get(id));
        onChange([...selections.filter((item) => item.id !== id), ...(next ? [next] : [])]);
    };
    return (
        <div className="commerce-material-picker" aria-label={translate("ecommerce.marketingMaterialPicker.marketingMaterialSettings")}>
            <nav className="commerce-material-categories" aria-label={translate("ecommerce.marketingMaterialPicker.materialCategory")}>
                {marketingCategories.map((name) => {
                    const selectedCount = selections.filter((entry) => marketingMaterialById.get(entry.id)?.category === name).reduce((sum, entry) => sum + entry.count, 0);
                    return (
                        <CommerceHint key={name} text={category === name ? translate("ecommerce.marketingMaterialPicker.configuringSelectUpTo15Images", { v0: commerceUiText(name) }) : translate("ecommerce.marketingMaterialPicker.switchToCurrentCategorySelectionsWillBeCleared", { v0: commerceUiText(name) })} placement="right">
                            <button
                                type="button"
                                aria-current={category === name ? "true" : undefined}
                                onClick={() => {
                                    if (category !== name) {
                                        setCategory(name);
                                        if (count) onChange([]);
                                    }
                                }}
                            >
                                {commerceUiText(name)}
                                {selectedCount ? ` (${selectedCount})` : ""}
                            </button>
                        </CommerceHint>
                    );
                })}
            </nav>
            <div className="commerce-material-main">
                <header>
                    <div className="commerce-material-actions">
                        <CommerceHint text={translate("ecommerce.marketingMaterialPicker.recommendSuitableMaterialsInTheCurrentCategoryBasedOnThe")}>
                            <button type="button" onClick={() => onChange(recommendMarketingSelections([draft.instruction, draft.productName, draft.scene].join(" "), category, available))}>
                                <Sparkles size={14} />
                                {translate("ecommerce.marketingMaterialPicker.smartSelection")}
                            </button>
                        </CommerceHint>
                        <CommerceHint text={translate("ecommerce.marketingMaterialPicker.clearCurrentMaterialsAndChooseANewCreationMix")}>
                            <button type="button" onClick={() => onChange([])} disabled={!count}>
                                <RotateCcw size={14} />
                                {translate("account.layout.list.reset")}
                            </button>
                        </CommerceHint>
                        <span>
                            {translate("ecommerce.marketingMaterialPicker.selected")} {count}
                            <i> / 15</i>
                        </span>
                    </div>
                    <CommerceHint text={translate("ecommerce.marketingMaterialPicker.collapseMaterialSettingsSelectionsAreKept")}>
                        <button type="button" className="commerce-material-close" aria-label={translate("ecommerce.marketingMaterialPicker.closeMaterialSettings")} onClick={onClose}>
                            <X size={15} />
                        </button>
                    </CommerceHint>
                </header>
                <div className="commerce-material-grid">
                    {marketingMaterials
                        .filter((item) => item.category === category)
                        .map((item) => {
                            const choice = selected.get(item.id);
                            const active = Boolean(choice);
                            const autoSelection = automaticMarketingSelections([{ id: item.id, count: 1, ratio: item.ratio }], available, draft.ratio)[0];
                            const visibleRatio = commerceUiText(imageSizeLabel(choice?.ratio || autoSelection.ratio));
                            return (
                                <div key={item.id} className={`commerce-material-tile${active ? " is-selected" : ""}`}>
                                    <CommerceHint text={active ? translate("ecommerce.marketingMaterialPicker.deselectToRemoveAllImagesOfThisMaterial", { v0: commerceUiText(item.name) }) : count >= 15 ? translate("ecommerce.marketingMaterialPicker.the15ImageLimitIsReachedReduceOtherMaterialsFirst") : translate("ecommerce.marketingMaterialPicker.selectToGenerateOneImageByDefaultWithAnAspect", { v0: commerceUiText(item.name) })}>
                                        <button
                                            type="button"
                                            className="commerce-material-select"
                                            aria-pressed={active}
                                            aria-label={`${active ? translate("common.cancel") : translate("ecommerce.marketingMaterialPicker.select")} ${commerceUiText(item.name)}`}
                                            disabled={!active && count >= 15}
                                            onClick={() => update(item.id, (entry) => (entry ? undefined : autoSelection))}
                                        >
                                            <span className="commerce-material-check">{active ? <Check size={13} strokeWidth={2.6} /> : null}</span>
                                            <span>{commerceUiText(item.name)}</span>
                                        </button>
                                    </CommerceHint>
                                    {active ? (
                                        <div className="commerce-material-controls">
                                            <CommerceHint text={translate("ecommerce.marketingMaterialPicker.reduceToImages", { v0: commerceUiText(item.name), v1: String(Math.max(1, choice!.count - 1)) })}>
                                                <button type="button" aria-label={translate("ecommerce.marketingMaterialPicker.removeOne", { v0: commerceUiText(item.name) })} disabled={choice!.count <= 1} onClick={() => update(item.id, (entry) => (entry && entry.count > 1 ? { ...entry, count: entry.count - 1 } : entry))}>
                                                    <Minus size={13} />
                                                </button>
                                            </CommerceHint>
                                            <span>{choice!.count}</span>
                                            <CommerceHint text={count >= 15 ? translate("ecommerce.marketingMaterialPicker.the15ImageLimitIsReached") : translate("ecommerce.marketingMaterialPicker.addOneImage", { v0: commerceUiText(item.name) })}>
                                                <button type="button" aria-label={translate("ecommerce.marketingMaterialPicker.addOne", { v0: commerceUiText(item.name) })} disabled={count >= 15} onClick={() => update(item.id, (entry) => (entry ? { ...entry, count: entry.count + 1 } : undefined))}>
                                                    <Plus size={13} />
                                                </button>
                                            </CommerceHint>
                                        </div>
                                    ) : null}
                                    <span className="commerce-material-ratio" aria-label={translate("ecommerce.marketingMaterialPicker.automaticRatio", { v0: commerceUiText(item.name), v1: String(visibleRatio) })}>
                                        {visibleRatio}
                                    </span>
                                </div>
                            );
                        })}
                </div>
                <p>{translate("ecommerce.marketingMaterialPicker.aspectRatiosAreMatchedAutomaticallyToTheCurrentImageModel")}</p>
            </div>
        </div>
    );
}
