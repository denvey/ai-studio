import { Input, Select } from "antd";
import type { EcommerceDraft } from "@/services/api/ecommerce";
import { creationOptions } from "./type-config";

import { translate } from "@/i18n";
import { commerceUiText } from "./ui-text";
export function CreationOptions({ draft, onChange, className = "ecommerce-field" }: { draft: EcommerceDraft; onChange: (value: Record<string, string>) => void; className?: string }) {
    return (
        <div className="ecommerce-creation-options" aria-label={translate("ecommerce.creationOptions.settingsForTheCurrentCreationType")}>
            {(creationOptions[draft.imageType] || []).map((item) => (
                <label className={className} key={item.key}>
                    <span>
                        {commerceUiText(item.label)}
                        {item.required ? " " + translate("ecommerce.creationOptions.required") : ""}
                    </span>
                    {item.choices ? (
                        <Select
                            aria-label={commerceUiText(item.label)}
                            allowClear
                            placeholder={translate("ecommerce.creationOptions.plannedByTheAgentFromYourMaterials")}
                            value={draft.typeOptions?.[item.key] || undefined}
                            options={item.choices.map((value) => ({ value, label: commerceUiText(value) }))}
                            onChange={(value) => onChange({ ...draft.typeOptions, [item.key]: value || "" })}
                        />
                    ) : (
                        <Input.TextArea
                            rows={2}
                            value={draft.typeOptions?.[item.key] || ""}
                            placeholder={item.placeholder ? commerceUiText(item.placeholder) : undefined}
                            onChange={(event) => onChange({ ...draft.typeOptions, [item.key]: event.target.value })}
                        />
                    )}
                </label>
            ))}
        </div>
    );
}
