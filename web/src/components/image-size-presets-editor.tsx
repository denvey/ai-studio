import { useId, useState } from "react";
import { Button, Input, InputNumber } from "antd";
import { Check, Plus } from "lucide-react";
import { Switch } from "@/components/ui/base/switch";
import "./image-size-picker.css";
import type { ImageCapabilityConfig } from "@/lib/model-capabilities";
import { DEFAULT_IMAGE_RATIOS, IMAGE_RATIOS, imageResolutionTiers, imagePresetForRatio, imageResolutionUsesQuality, imageSizeConfigWithPresets, imageSizePresets, imageTierAvailable } from "@/lib/image-size-presets";
import { validateImageSize } from "@/services/api/image-validation";
import type { ImageResolutionTier } from "@/lib/image-resolution-tiers";
import { translate } from "@/i18n";

export function ImageSizePresetsEditor({
    profile,
    disabled,
    onChange,
    tiers,
    ratios: allowedRatios,
    allowCustomRatio = true,
    grouped = true,
}: {
    profile: ImageCapabilityConfig;
    disabled?: boolean;
    onChange: (size: ImageCapabilityConfig["size"]) => void;
    tiers?: string[];
    ratios?: string[];
    allowCustomRatio?: boolean;
    grouped?: boolean;
}) {
    const IMAGE_RESOLUTIONS = tiers ?? imageResolutionTiers(profile);
    const presets = imageSizePresets(profile);
    const defaultOptions = profile.size.values.length ? profile.size.values : [...new Set(presets.map((preset) => (profile.size.parameter === "aspect_ratio" ? preset.ratio : preset.size)).filter(Boolean))];
    const id = useId();
    const [drafts, setDrafts] = useState<Partial<Record<ImageResolutionTier, string>>>({});
    const [errors, setErrors] = useState<Partial<Record<ImageResolutionTier, string>>>({});
    const candidate = (tier: string, ratio: string) => {
        const existing = presets.find((preset) => preset.tier === tier && preset.ratio === ratio);
        if (existing) return existing;
        try {
            return imagePresetForRatio(tier, ratio);
        } catch {
            return { tier, ratio, width: 0, height: 0, size: "" };
        }
    };
    const toggleTier = (tier: ImageResolutionTier, ratios: string[], enabled: boolean) => {
        if (disabled) return;
        update(tier, enabled ? ratios : []);
    };
    const update = (tier: ImageResolutionTier, ratios: string[]) => {
        if (disabled) return false;
        try {
            const next = [
                ...new Map(
                    ratios.map((ratio) => {
                        if (!/^\d+[:：]\d+$/.test(ratio) || ratio.split(/[:：]/).some((part) => Number(part) <= 0)) throw new Error(translate("shared.imageSizePresetsEditor.enterAPositiveAspectRatioSuchAs169"));
                        const preset = candidate(tier, ratio);
                        return [preset.ratio, preset] as const;
                    }),
                ).values(),
            ];
            onChange(imageSizeConfigWithPresets(profile, [...presets.filter((preset) => preset.tier !== tier), ...next]));
            setErrors((current) => ({ ...current, [tier]: "" }));
            return true;
        } catch (reason) {
            setErrors((current) => ({ ...current, [tier]: reason instanceof Error ? reason.message : translate("shared.imageSizePresetsEditor.invalidAspectRatioFormat") }));
            return false;
        }
    };
    const editDimensions = (tier: ImageResolutionTier, ratio: string, field: "width" | "height", rawValue: number | null) => {
        if (disabled) return;
        const value = rawValue == null ? NaN : Math.round(rawValue);
        const selected = presets.find((preset) => preset.tier === tier && preset.ratio === ratio);
        if (!selected || !Number.isInteger(value) || value <= 0) {
            setErrors((current) => ({ ...current, [tier]: translate("shared.imageSizePresetsEditor.enterAPositiveIntegerPixelValue") }));
            return;
        }
        const width = field === "width" ? value : selected.width;
        const height = field === "height" ? value : selected.height;
        try {
            if (width > 0 && height > 0) validateImageSize(width, height, !profile.parameters);
            const next = presets.map((preset) => (preset === selected ? { ...preset, width, height, size: `${width}x${height}` } : preset));
            onChange(imageSizeConfigWithPresets(profile, next));
            setErrors((current) => ({ ...current, [tier]: "" }));
        } catch (reason) {
            setErrors((current) => ({ ...current, [tier]: reason instanceof Error ? reason.message : translate("shared.imageSizePresetsEditor.invalidPixelDimensions") }));
        }
    };
    const addRatio = (tier: ImageResolutionTier) => {
        const ratios = (drafts[tier] || "")
            .split(/[,，\n]/)
            .map((value) => value.trim())
            .filter(Boolean);
        if (!ratios.length) return;
        if (update(tier, [...presets.filter((preset) => preset.tier === tier).map((preset) => preset.ratio), ...ratios])) {
            setDrafts((current) => ({ ...current, [tier]: "" }));
        }
    };
    return (
        <div className="image-size-presets-editor">
            <p className="image-size-editor-intro">{translate("shared.imageSizePresetsEditor.selectSupportedRatiosClickAgainToRemoveOneExistingExact")}</p>
            {IMAGE_RESOLUTIONS.map((tier) => {
                const items = presets.filter((preset) => preset.tier === tier);
                const ratios = [...new Set([...(allowedRatios ?? IMAGE_RATIOS), ...items.map((item) => item.ratio)])];
                return (
                    <section
                        key={tier}
                        className={`image-size-preset-group${grouped ? "" : " is-ungrouped"}`}
                        aria-label={grouped ? undefined : translate("shared.imageSizePresetsEditor.aspectRatioSettings")}
                        aria-labelledby={grouped ? `${id}-${tier}-title` : undefined}
                    >
                        {grouped ? (
                            <header className="image-size-preset-heading">
                                <div className="image-size-preset-heading-label">
                                    <strong id={`${id}-${tier}-title`}>{tier.toUpperCase()}</strong>
                                    <span>{items.length ? translate("shared.imageSizePresetsEditor.aspectRatios", { v0: String(items.length) }) : translate("account.layout.oss.notEnabled")}</span>
                                    {!profile.parameters ? (
                                        <Switch
                                            size="sm"
                                            checked={items.length > 0}
                                            disabled={disabled}
                                            aria-label={translate("shared.imageSizePresetsEditor.enableSpecifications", { v0: String(tier.toUpperCase()) })}
                                            onChange={(enabled) => toggleTier(tier, ratios, enabled)}
                                        />
                                    ) : null}
                                </div>
                                {!items.length && DEFAULT_IMAGE_RATIOS.some((ratio) => ratios.includes(ratio)) ? (
                                    <Button
                                        size="small"
                                        disabled={disabled}
                                        onClick={() =>
                                            update(
                                                tier,
                                                DEFAULT_IMAGE_RATIOS.filter((ratio) => ratios.includes(ratio)),
                                            )
                                        }
                                    >
                                        {translate("shared.imageSizePresetsEditor.chooseCommonAspectRatios")}
                                    </Button>
                                ) : null}
                            </header>
                        ) : null}
                        <div className="image-size-preset-body">
                            {items.some((item) => !item.width || !item.height || !item.size) ? (
                                <p role="alert" className="image-size-error">
                                    {translate("shared.imageSizePresetsEditor.enterTheWidthAndHeightForEachSelectedRatioThen")}
                                </p>
                            ) : null}
                            {imageResolutionUsesQuality(profile) && !imageTierAvailable(profile, tier) ? <p className="image-size-hint">{translate("shared.imageSizePresetsEditor.configureTheQualityValueForThisResolutionBeforeMakingIt")}</p> : null}
                            <div
                                className="image-size-preset-options"
                                role="group"
                                aria-label={grouped ? translate("shared.imageSizePresetsEditor.aspectRatiosSupportedBy", { v0: String(tier.toUpperCase()) }) : translate("shared.imageSizePresetsEditor.supportedAspectRatios")}
                            >
                                {ratios.map((ratio) => {
                                    const selected = items.find((item) => item.ratio === ratio);
                                    const dimensions = selected || candidate(tier, ratio);
                                    return (
                                        <div key={ratio} className="image-size-preset-option-wrap">
                                            <button
                                                type="button"
                                                disabled={disabled}
                                                aria-pressed={Boolean(selected)}
                                                aria-label={grouped ? `${tier.toUpperCase()} ${ratio}` : ratio}
                                                className="image-size-preset-option"
                                                title={`${ratio}${dimensions.width && dimensions.height ? ` · ${dimensions.width} × ${dimensions.height} px` : ""}${selected ? " " + translate("shared.imageSizePresetsEditor.clickToRemove") : " " + translate("shared.imageSizePresetsEditor.clickToAdd")}`}
                                                onClick={() => update(tier, selected ? items.filter((item) => item.ratio !== ratio).map((item) => item.ratio) : [...items.map((item) => item.ratio), ratio])}
                                            >
                                                <span className="image-size-preset-option-label">
                                                    <span>{ratio}</span>
                                                    {selected ? <Check size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                                                </span>
                                                <small>{dimensions.width && dimensions.height ? `${dimensions.width} × ${dimensions.height}` : translate("shared.imageSizePresetsEditor.setSize")}</small>
                                            </button>
                                            {selected ? (
                                                <div className="image-size-preset-dimensions" aria-label={translate("shared.imageSizePresetsEditor.exactPixelDimensions", { v0: String(tier.toUpperCase()), v1: String(ratio) })}>
                                                    <label>
                                                        <span>{translate("shared.imageSizePresetsEditor.w")}</span>
                                                        <InputNumber
                                                            controls={false}
                                                            min={1}
                                                            precision={0}
                                                            value={selected.width || null}
                                                            disabled={disabled}
                                                            aria-label={translate("shared.imageSizePresetsEditor.widthInPixels", { v0: String(grouped ? tier.toUpperCase() + " " : ""), v1: String(ratio) })}
                                                            onChange={(value) => editDimensions(tier, ratio, "width", value)}
                                                        />
                                                    </label>
                                                    <span aria-hidden="true">×</span>
                                                    <label>
                                                        <span>{translate("shared.imageSizePresetsEditor.high")}</span>
                                                        <InputNumber
                                                            controls={false}
                                                            min={1}
                                                            precision={0}
                                                            value={selected.height || null}
                                                            disabled={disabled}
                                                            aria-label={translate("shared.imageSizePresetsEditor.heightInPixels", { v0: String(grouped ? tier.toUpperCase() + " " : ""), v1: String(ratio) })}
                                                            onChange={(value) => editDimensions(tier, ratio, "height", value)}
                                                        />
                                                    </label>
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                            {allowCustomRatio ? (
                                <div className="image-size-preset-add">
                                    <Input
                                        aria-label={translate("shared.imageSizePresetsEditor.customAspectRatio", { v0: String(tier.toUpperCase()) })}
                                        aria-invalid={Boolean(errors[tier])}
                                        aria-describedby={errors[tier] ? `${id}-${tier}-error` : undefined}
                                        disabled={disabled}
                                        placeholder={translate("shared.imageSizePresetsEditor.anotherRatioSuchAs1711")}
                                        value={drafts[tier] || ""}
                                        onChange={(event) => {
                                            setDrafts((current) => ({ ...current, [tier]: event.target.value }));
                                            setErrors((current) => ({ ...current, [tier]: "" }));
                                        }}
                                        onPressEnter={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            addRatio(tier);
                                        }}
                                    />
                                    <Button disabled={disabled || !drafts[tier]?.trim()} icon={<Plus size={14} />} onClick={() => addRatio(tier)} aria-label={translate("shared.imageSizePresetsEditor.addAAspectRatio", { v0: String(tier.toUpperCase()) })}>
                                        {translate("canvasB.common.add")}
                                    </Button>
                                </div>
                            ) : null}
                            {errors[tier] ? (
                                <p id={`${id}-${tier}-error`} role="alert" className="image-size-error">
                                    {errors[tier]}
                                </p>
                            ) : null}
                        </div>
                    </section>
                );
            })}
            <div className="image-size-defaults">
                <div className="image-size-defaults-heading">
                    <strong>{translate("shared.imageSizePresetsEditor.defaultOutput")}</strong>
                    <span>{translate("shared.imageSizePresetsEditor.initialSizeWhenAUserSelectsThisModel")}</span>
                </div>
                <div className="image-size-default-options" role="group" aria-label={translate("shared.imageSizePresetsEditor.defaultOutput")}>
                    {defaultOptions.map((value) => {
                        const preset = presets.find((item) => (profile.size.parameter === "aspect_ratio" ? item.ratio === value : item.size === value));
                        const label = value === "auto" ? translate("account.layout.oss.auto") : preset && profile.size.parameter === "size" ? `${grouped ? preset.tier.toUpperCase() + " · " : ""}${preset.ratio}` : value;
                        return (
                            <button
                                key={value}
                                type="button"
                                disabled={disabled}
                                aria-pressed={profile.size.default === value}
                                title={value}
                                aria-label={translate("shared.imageSizePresetsEditor.defaultOutput2", { v0: String(label), v1: String(value) })}
                                onClick={() => onChange({ ...profile.size, default: value })}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
