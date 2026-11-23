import { Select } from "antd";
import type { EcommerceDraft } from "@/services/api/ecommerce";
import { commerceAllowsText, creativeControlFields, normalizeCreativeOptions } from "./creative-controls";
import { ecommerceTypeConfig } from "./type-config";
import { commercePlatformListingMain } from "./platform-style";

import { translate } from "@/i18n";
import { commerceUiText } from "./ui-text";
export function CreativeOptionsPanel({ draft, onChange }: { draft: EcommerceDraft; onChange: (patch: Partial<EcommerceDraft>) => void }) {
    const selected = normalizeCreativeOptions(draft);
    const platformNoText = commercePlatformListingMain(draft.platform, draft.imageType, draft.typeOptions?.purpose);
    const fixedNoText = Boolean(ecommerceTypeConfig[draft.imageType]?.noText) || draft.cloneOptions?.copyMode === "none" || platformNoText;
    const allowsText = commerceAllowsText(draft);
    return (
        <section className="ecommerce-creative-options" aria-label={translate("ecommerce.creativeOptionsPanel.copyAndVisualSettings")}>
            <div className="ecommerce-creative-grid">
                {creativeControlFields.map((field) => (
                    <label className="ecommerce-field" key={field.key}>
                        <span>{commerceUiText(field.label)}</span>
                        <Select<string>
                            variant="filled"
                            aria-label={commerceUiText(field.label)}
                            value={!allowsText && field.key === "textMode" ? "none" : selected[field.key]}
                            options={field.options.map((option) => ({ ...option, label: commerceUiText(option.label) }))}
                            disabled={field.key === "textMode" ? fixedNoText : !allowsText && ["copyTone", "fontStyle", "informationDensity"].includes(field.key)}
                            onChange={(value) => onChange({ creativeOptions: { ...selected, [field.key]: value }, ...(field.key === "textMode" ? { noText: value === "none" } : {}) })}
                        />
                    </label>
                ))}
            </div>
            {!allowsText ? (
                <p className="ecommerce-creative-note">
                    {platformNoText
                        ? translate("ecommerce.creativeOptionsPanel.listingMainImagesOnThisPlatformMustHaveAPure")
                        : fixedNoText
                          ? translate("ecommerce.creativeOptionsPanel.thisCreationTypeUsesImagesWithoutAddedTextTheProduct")
                          : translate("ecommerce.creativeOptionsPanel.noAddedTextSelectedCopyAndFontSettingsAreSaved")}
                </p>
            ) : null}
        </section>
    );
}
