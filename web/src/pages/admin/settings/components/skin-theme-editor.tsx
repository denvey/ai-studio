import { Button, Form, Input, InputNumber } from "antd";
import { IconButton, SegmentedControl, Select, Tooltip } from "@/pages/admin/ui/controls";
import { Check, Copy, LockKeyhole, Moon, Plus, Sun, Trash2, Palette } from "lucide-react";
import { useMemo, useState } from "react";

import { SKIN_COLOR_GROUPS, SKIN_COMPONENT_NUMBER_FIELDS, SKIN_BUTTON_COLOR_FIELDS, getSkinButtonAppearance, skinSwatches, skinDisplayName, skinDisplayDescription, type SkinButtonFill, type SkinComponentTokens, type SkinDefinition, type SkinModeTokens, type SkinThemeMode } from "@/lib/skin-themes";
import { cn } from "@/lib/utils";
import { AdminStatusBadge } from "@/pages/admin/components/admin-ui";
import { translate } from "@/i18n";


export function SkinThemeEditor({
    themes,
    selectedID,
    disabled,
    onSelect,
    onCreate,
    onDuplicate,
    onDelete,
    onChange,
}: {
    themes: SkinDefinition[];
    selectedID: string;
    disabled: boolean;
    onSelect: (id: string) => void;
    onCreate: () => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    onChange: (theme: SkinDefinition) => void;
}) {
    const [mode, setMode] = useState<SkinThemeMode>("light");
    const selected = useMemo(() => themes.find((theme) => theme.id === selectedID) || themes[0], [selectedID, themes]);
    if (!selected) return null;
    const editorDisabled = disabled || selected.locked;
    const buttonFill = selected.tokens.buttons[mode];
    const updateButton = (patch: Partial<SkinButtonFill>) => onChange({ ...selected, tokens: { ...selected.tokens,
        buttons: { ...selected.tokens.buttons, [mode]: { ...buttonFill, ...patch } },
    } });

    const updateIdentity = (patch: Partial<Pick<SkinDefinition, "name" | "description">>) => onChange({ ...selected, ...patch });
    const updateColor = (key: keyof SkinModeTokens, value: string) =>
        onChange({
            ...selected,
            tokens: { ...selected.tokens, [mode]: { ...selected.tokens[mode], [key]: value.trim().toLowerCase() } },
        });
    const updateComponent = <Key extends keyof SkinComponentTokens>(key: Key, value: SkinComponentTokens[Key]) => onChange({ ...selected, tokens: { ...selected.tokens, components: { ...selected.tokens.components, [key]: value } } });

    return (
        <div className="admin-skin-workspace">
            <div className="admin-skin-library-toolbar">
                <div>
                    <strong>{translate("adminPages.settings.skinThemeEditor.themeLibrary")}</strong>
                    <span>{translate("adminPages.settings.skinThemeEditor.total")} {themes.length} {translate("adminPages.settings.skinThemeEditor.themesUpTo16")}</span>
                </div>
                <div>
                    <Button icon={<Plus className="size-3.5" />} disabled={disabled || themes.length >= 16} onClick={onCreate}>
                        {translate("adminPages.settings.skinThemeEditor.createFromDefault")}
                    </Button>
                    <Button icon={<Copy className="size-3.5" />} disabled={disabled || themes.length >= 16} onClick={() => onDuplicate(selected.id)}>
                        {translate("adminPages.settings.skinThemeEditor.duplicateCurrent")}
                    </Button>
                </div>
            </div>

            <div className="admin-skin-library" role="radiogroup" aria-label={translate("adminPages.settings.skinThemeEditor.chooseSiteWideTheme")}>
                {themes.map((theme) => {
                    const active = theme.id === selected.id;
                    const swatches = skinSwatches(theme);
                    return (
                        <article key={theme.id} className={cn("admin-skin-card", active && "is-selected")}>
                            <button type="button" className="admin-skin-card-select" role="radio" aria-checked={active} disabled={disabled} onClick={() => onSelect(theme.id)}>
                                <span className="admin-skin-card-preview" aria-hidden="true" style={{ background: theme.tokens.dark.canvas, borderRadius: theme.tokens.components.cardRadius }}>
                                    <span style={{ background: theme.tokens.dark.surface, borderRadius: theme.tokens.components.inputRadius }}>
                                        {swatches.map((color, index) => (
                                            <i key={`${color}-${index}`} style={{ background: color }} />
                                        ))}
                                    </span>
                                </span>
                                <span className="admin-skin-card-copy">
                                    <strong>{skinDisplayName(theme)}</strong>
                                    <small>{skinDisplayDescription(theme) || translate("adminPages.settings.skinThemeEditor.noDescription")}</small>
                                </span>
                                {theme.locked ? <LockKeyhole className="admin-skin-card-lock" aria-label={translate("adminPages.settings.skinThemeEditor.theSystemDefaultThemeCannotBeEdited")} /> : null}
                                {active ? (
                                    <span className="admin-skin-card-check" aria-hidden="true">
                                        <Check />
                                    </span>
                                ) : null}
                            </button>
                            <div className="admin-skin-card-actions">
                                <Tooltip title={translate("adminPages.settings.skinThemeEditor.duplicateThisTheme")}>
                                    <IconButton size="sm" variant="ghost" icon={Copy} aria-label={translate("adminPages.settings.skinThemeEditor.duplicate", { v0: String(skinDisplayName(theme)) })} disabled={disabled || themes.length >= 16} onClick={() => onDuplicate(theme.id)} />
                                </Tooltip>
                                <Tooltip title={theme.locked ? translate("adminPages.settings.skinThemeEditor.theSystemDefaultThemeCannotBeDeleted") : translate("adminPages.settings.skinThemeEditor.deleteThisTheme")}>
                                    <Button
                                        className="admin-skin-delete-button"
                                        type="primary"
                                        danger
                                        size="small"
                                        aria-label={translate("adminPages.settings.skinThemeEditor.delete", { v0: String(skinDisplayName(theme)) })}
                                        icon={<Trash2 className="size-3.5" />}
                                        disabled={disabled || theme.locked}
                                        onClick={() => onDelete(theme.id)}
                                    />
                                </Tooltip>
                            </div>
                        </article>
                    );
                })}
            </div>

            <div className="admin-skin-editor">
                <div className="admin-skin-editor-heading">
                    <div>
                        <span>{translate("adminPages.settings.skinThemeEditor.currentlyEditing")}</span>
                        <strong>{skinDisplayName(selected)}</strong>
                    </div>
                    <AdminStatusBadge label={selected.locked ? translate("adminPages.settings.skinThemeEditor.systemDefaultReadOnly") : translate("adminPages.settings.skinThemeEditor.customTheme")} tone={selected.locked ? "neutral" : "info"} />
                </div>

                {selected.locked ? (
                    <div className="admin-skin-locked-note">
                        <LockKeyhole className="size-4" aria-hidden="true" />
                        <span>{translate("adminPages.settings.skinThemeEditor.classicBlackAndWhiteUsesMonochromeBaseColorsAndPurple")}</span>
                    </div>
                ) : null}

                <Form className="admin-appearance-form admin-skin-identity-form" layout="vertical" requiredMark={false} disabled={editorDisabled}>
                    <div className="admin-appearance-form-grid">
                        <Form.Item label={translate("adminPages.settings.skinThemeEditor.themeName")} extra={translate("adminPages.settings.skinThemeEditor.item140CharactersCanBeChangedAtAnyTime")}>
                            <Input value={skinDisplayName(selected)} maxLength={40} showCount onChange={(event) => updateIdentity({ name: event.target.value })} />
                        </Form.Item>
                        <Form.Item label={translate("adminPages.settings.skinThemeEditor.themeDescription")} extra={translate("adminPages.settings.skinThemeEditor.usedToIdentifyTheThemeInTheLibraryDoesNot")}>
                            <Input value={skinDisplayDescription(selected)} maxLength={100} showCount onChange={(event) => updateIdentity({ description: event.target.value })} />
                        </Form.Item>
                    </div>
                </Form>

                <div className="admin-skin-mode-bar">
                    <div>
                        <strong>{translate("adminPages.settings.skinThemeEditor.colorSystem")}</strong>
                        <span>{translate("adminPages.settings.skinThemeEditor.controlsWithTheSamePurposeShareTheFollowingSemanticColors")}</span>
                    </div>
                    <SegmentedControl<SkinThemeMode>
                        ariaLabel={translate("adminPages.settings.skinThemeEditor.themePreviewMode")}
                        value={mode}
                        options={[
                            {
                                label: (
                                    <span className="admin-skin-mode-label">
                                        <Sun />
                                        {translate("settings.preferences.themeLight")}
                                    </span>
                                ),
                                value: "light",
                            },
                            {
                                label: (
                                    <span className="admin-skin-mode-label">
                                        <Moon />
                                        {translate("settings.preferences.themeDark")}
                                    </span>
                                ),
                                value: "dark",
                            },
                        ]}
                        onChange={setMode}
                    />
                </div>

                <SkinThemePreview theme={selected} mode={mode} />

                <details className="admin-skin-token-group" open>
                    <summary><span>{translate("adminPages.settings.skinThemeEditor.primaryButtonFill")}</span><small>{translate("adminPages.settings.skinThemeEditor.previewThemeMode", { mode: mode === "light" ? translate("settings.preferences.themeLight") : translate("settings.preferences.themeDark") })}</small></summary>
                    <div className="admin-skin-component-grid">
                        <label className="admin-skin-number-field">
                            <span>{translate("adminPages.settings.skinThemeEditor.fillType")}</span>
                            <Select value={buttonFill.mode} disabled={editorDisabled}
                                options={[{ label: translate("adminPages.settings.skinThemeEditor.solidPrimaryActionColor"), value: "solid" }, { label: translate("adminPages.settings.skinThemeEditor.gradient"), value: "gradient" }]}
                                onChange={(value) => updateButton({ mode: value })} />
                        </label>
                        {buttonFill.mode === "gradient" ? <label className="admin-skin-number-field">
                            <span>{translate("adminPages.settings.skinThemeEditor.gradientAngle")}</span>
                            <InputNumber aria-label={translate("adminPages.settings.skinThemeEditor.gradientAngle")} value={buttonFill.angle} min={0} max={360} precision={0} addonAfter="°" disabled={editorDisabled}
                                onChange={(value) => { if (typeof value === "number") updateButton({ angle: value }); }} />
                        </label> : null}
                    </div>
                    {buttonFill.mode === "gradient" ? <div className="admin-skin-color-grid">
                        {SKIN_BUTTON_COLOR_FIELDS.map(({ key, label }) => <ColorTokenField key={key} label={label} help={translate("adminPages.settings.skinThemeEditor.affectsOnlyPrimaryButtonsWithoutChangingSelectionsSwitchesOrDestructive")} value={buttonFill[key]} disabled={editorDisabled}
                            onChange={(value) => updateButton({ [key]: value.trim().toLowerCase() })} />)}
                    </div> : null}
                </details>

                <div className="admin-skin-color-groups">
                    {SKIN_COLOR_GROUPS.map((group, index) => (
                        <details key={group.key} className="admin-skin-token-group" open={index < 2}>
                            <summary>
                                <span>{group.label}</span>
                                <small>{group.fields.length} {translate("library.picker.itemUnit")}</small>
                            </summary>
                            <div className="admin-skin-color-grid">
                                {group.fields.map((field) => (
                                    <ColorTokenField key={field.key} label={field.label} help={field.help} value={selected.tokens[mode][field.key]} disabled={editorDisabled} onChange={(value) => updateColor(field.key, value)} />
                                ))}
                            </div>
                        </details>
                    ))}
                </div>

                <details className="admin-skin-token-group admin-skin-component-group" open>
                    <summary>
                        <span>{translate("adminPages.settings.skinThemeEditor.controlSizesCornersAndFeedback")}</span>
                        <small>{translate("adminPages.settings.skinThemeEditor.item17Settings")}</small>
                    </summary>
                    <div className="admin-skin-component-grid">
                        {SKIN_COMPONENT_NUMBER_FIELDS.map((field) => (
                            <label key={field.key} className="admin-skin-number-field">
                                <span>{field.label}</span>
                                <InputNumber
                                    value={selected.tokens.components[field.key]}
                                    min={field.min}
                                    max={field.max}
                                    step={field.step || 1}
                                    addonAfter={field.suffix || undefined}
                                    disabled={editorDisabled}
                                    onChange={(value) => {
                                        if (typeof value === "number") updateComponent(field.key, value);
                                    }}
                                />
                            </label>
                        ))}
                        <label className="admin-skin-number-field">
                            <span>{translate("adminPages.settings.skinThemeEditor.shadowStyle")}</span>
                            <Select
                                value={selected.tokens.components.shadowStyle}
                                disabled={editorDisabled}
                                options={[
                                    { label: translate("adminPages.settings.skinThemeEditor.noShadow"), value: "none" },
                                    { label: translate("adminPages.settings.skinThemeEditor.softShadow"), value: "soft" },
                                    { label: translate("adminPages.settings.skinThemeEditor.strongShadow"), value: "strong" },
                                ]}
                                onChange={(value) => updateComponent("shadowStyle", value)}
                            />
                        </label>
                    </div>
                </details>
            </div>
        </div>
    );
}

function ColorTokenField({ label, help, value, disabled, onChange }: { label: string; help: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
    const pickerValue = /^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{8}$/i.test(value) ? value.slice(0, 7) : "#000000";
    return (
        <div className="admin-skin-color-field">
            <span>
                <strong>{label}</strong>
                <small>{help}</small>
            </span>
            <span className="admin-skin-color-control">
                <input type="color" value={pickerValue} disabled={disabled} aria-label={translate("adminPages.settings.skinThemeEditor.colorPicker", { v0: String(label) })} title={translate("adminPages.settings.skinThemeEditor.choose", { v0: String(label) })} onChange={(event) => onChange(event.target.value)} />
                <Input value={value} maxLength={9} disabled={disabled} spellCheck={false} status={/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) ? undefined : "error"} onChange={(event) => onChange(event.target.value)} />
            </span>
        </div>
    );
}

function SkinThemePreview({ theme, mode }: { theme: SkinDefinition; mode: SkinThemeMode }) {
    const color = theme.tokens[mode];
    const button = getSkinButtonAppearance(theme, mode);
    const component = theme.tokens.components;
    const shadow = component.shadowStyle === "none" ? "none" : component.shadowStyle === "strong" ? "0 18px 44px #0000003d" : "0 10px 28px #00000024";
    return (
        <div className="admin-skin-live-preview" style={{ background: color.canvas, color: color.text, borderColor: color.border, borderRadius: component.cardRadius }}>
            <div className="admin-skin-live-preview-card" style={{ background: color.surface, borderColor: color.border, borderRadius: component.cardRadius, boxShadow: shadow }}>
                <span className="admin-skin-live-preview-icon" style={{ background: color.surfaceSubtle, color: color.iconActive, borderRadius: component.inputRadius }}>
                    <Palette />
                </span>
                <div>
                    <strong>{translate("adminPages.settings.skinThemeEditor.combinedControlPreview")}</strong>
                    <small style={{ color: color.textMuted }}>{translate("adminPages.settings.skinThemeEditor.buttonsInputsSelectionsAndStatusesAllUseTheSameTheme")}</small>
                </div>
                <span className="admin-skin-live-preview-status" style={{ background: color.selected, color: color.selectedForeground, borderRadius: component.menuRadius }}>
                    {translate("adminPages.settings.skinThemeEditor.selected")}
                </span>
                <span className="admin-skin-live-preview-menu" style={{ background: color.selected, color: color.selectedForeground, borderRadius: component.menuRadius }}>
                    {translate("adminPages.settings.skinThemeEditor.adminMenu")}
                </span>
                <span
                    className="admin-skin-live-preview-input"
                    style={{ height: component.controlHeight, background: color.control, borderColor: color.controlBorder, borderWidth: component.borderWidth, borderRadius: component.inputRadius, color: color.textMuted }}
                >
                    {translate("adminPages.settings.skinThemeEditor.inputStates")}
                </span>
                <span className="admin-skin-live-preview-button" style={{ height: component.controlHeight, background: button.background, color: button.foreground, borderRadius: component.buttonRadius, fontWeight: component.buttonFontWeight }}>
                    {translate("adminPages.settings.skinThemeEditor.primaryAction")}
                </span>
                <span className="admin-skin-live-preview-switches" aria-label={translate("adminPages.settings.skinThemeEditor.switchOnAndOffStatePreview")}>
                    <i className="is-on" style={{ background: color.switchChecked }}>
                        <b style={{ background: color.switchCheckedHandle }} />
                    </i>
                    <i style={{ background: color.switchUnchecked }}>
                        <b style={{ background: color.switchUncheckedHandle }} />
                    </i>
                </span>
                <span className="admin-skin-live-preview-danger" style={{ background: color.danger, color: color.dangerForeground, borderRadius: component.buttonRadius }}>
                    {translate("common.delete")}
                </span>
                <span className="admin-skin-live-preview-signals">
                    <i style={{ background: color.success }} />
                    <i style={{ background: color.warning }} />
                    <i style={{ background: color.danger }} />
                    <i style={{ background: color.info }} />
                </span>
            </div>
        </div>
    );
}
