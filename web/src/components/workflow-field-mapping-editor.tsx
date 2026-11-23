import { Button, Collapse, Input, InputNumber, Tag } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useMemo, useState } from "react";

import { Switch } from "@/components/ui/base/switch";
import { ToolButton } from "@/components/ui/base/buttons";
import { ListFilter, ListPlus, Power, PowerOff } from "lucide-react";

import type { WorkflowFieldMapping } from "@/stores/use-config-store";
import { workflowFieldChoiceValues, workflowFieldConfigurationError, workflowFieldNumberBounds, workflowFieldPresetOptions } from "@/lib/model-capabilities";
import { EmptyState } from "@/components/ui/product/empty-state";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

const sourceOptions = [
    { label: translate("shared.workflowFieldMappingEditor.keepWorkflowDefault"), value: "" },
    { label: translate("shared.workflowFieldMappingEditor.taskPrompt"), value: "prompt" },
    { label: translate("shared.workflowFieldMappingEditor.systemPrompt"), value: "systemPrompt" },
    { label: translate("shared.workflowFieldMappingEditor.referenceImage"), value: "referenceImage" },
    { label: translate("library.tasks.params.referenceVideos"), value: "referenceVideo" },
    { label: translate("library.tasks.params.referenceAudios"), value: "referenceAudio" },
    { label: translate("shared.workflowFieldMappingEditor.mask"), value: "mask" },
    { label: translate("shared.workflowFieldMappingEditor.imageSize"), value: "size" },
    { label: translate("shared.workflowFieldMappingEditor.aspectRatio"), value: "aspectRatio" },
    { label: translate("shared.workflowFieldMappingEditor.imageWidth"), value: "width" },
    { label: translate("shared.workflowFieldMappingEditor.imageHeight"), value: "height" },
    { label: translate("library.tasks.params.count"), value: "count" },
    { label: translate("shared.workflowFieldMappingEditor.generationQuality"), value: "quality" },
    { label: translate("shared.workflowFieldMappingEditor.transparentBackground"), value: "transparentBackground" },
    { label: translate("shared.workflowFieldMappingEditor.videoDuration"), value: "videoSeconds" },
    { label: translate("shared.workflowFieldMappingEditor.videoQuality"), value: "vquality" },
    { label: translate("shared.workflowFieldMappingEditor.generateVideoAudio"), value: "videoGenerateAudio" },
    { label: translate("shared.workflowFieldMappingEditor.videoWatermark"), value: "videoWatermark" },
    { label: translate("library.tasks.params.voice"), value: "audioVoice" },
    { label: translate("library.tasks.params.audioFormat"), value: "audioFormat" },
    { label: translate("shared.workflowFieldMappingEditor.speechSpeed"), value: "audioSpeed" },
    { label: translate("shared.workflowFieldMappingEditor.audioInstructions"), value: "audioInstructions" },
] as const;

const fieldTypeOptions = [
    { label: translate("account.settings.modelConfig.capabilities.text"), value: "TEXT" },
    { label: translate("shared.workflowFieldMappingEditor.number"), value: "NUMBER" },
    { label: translate("shared.workflowFieldMappingEditor.slider"), value: "SLIDER" },
    { label: translate("shared.workflowFieldMappingEditor.toggle"), value: "BOOLEAN" },
    { label: translate("shared.workflowFieldMappingEditor.dropdown"), value: "SELECT" },
    { label: translate("account.feedback.image"), value: "IMAGE" },
    { label: translate("account.feedback.video"), value: "VIDEO" },
    { label: translate("account.settings.modelConfig.capabilities.audio"), value: "AUDIO" },
] as const;

type WorkflowFieldMappingEditorProps = {
    fields: WorkflowFieldMapping[];
    onChange: (fields: WorkflowFieldMapping[]) => void;
    disabled?: boolean;
};

export function WorkflowFieldMappingEditor({ fields, onChange, disabled = false }: WorkflowFieldMappingEditorProps) {
    const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);
    const enabledCount = useMemo(() => fields.filter((field) => field.enabled !== false).length, [fields]);
    const controllableFields = useMemo(() => fields.filter((field) => field.safeToOverride !== false), [fields]);
    const enabledControllableCount = useMemo(() => controllableFields.filter((field) => field.enabled !== false).length, [controllableFields]);
    const visibleFields = useMemo(() => fields.flatMap((field, index) => (showOnlyEnabled && field.enabled === false ? [] : [{ field, index }])), [fields, showOnlyEnabled]);
    const updateField = (index: number, patch: Partial<WorkflowFieldMapping>) => {
        onChange(fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...patch } : field)));
    };
    const updateAllFields = (enabled: boolean) => {
        onChange(fields.map((field) => (field.safeToOverride === false ? field : { ...field, enabled })));
    };

    if (!fields.length) {
        return <EmptyState size="compact" description={translate("shared.workflowFieldMappingEditor.noConfigurableFieldsFoundFetchTheWorkflowParametersFirst")} />;
    }

    return (
        <div className="workflow-field-mapping-editor space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-foreground/60">{translate("shared.workflowFieldMappingEditor.summary", { total: fields.length, enabled: enabledCount })}</p>
                <div className="flex flex-wrap items-center gap-1">
                    <Button type="text" size="small" icon={<Power className="size-3.5" />} disabled={disabled || enabledControllableCount === controllableFields.length} onClick={() => updateAllFields(true)}>
                        {translate("shared.workflowFieldMappingEditor.enableAll")}
                    </Button>
                    <Button type="text" size="small" danger icon={<PowerOff className="size-3.5" />} disabled={disabled || enabledControllableCount === 0} onClick={() => updateAllFields(false)}>
                        {translate("shared.workflowFieldMappingEditor.disableAll")}
                    </Button>
                    <ToolButton
                        size="sm"
                        icon={<ListFilter />}
                        active={showOnlyEnabled}
                        label={showOnlyEnabled ? translate("shared.workflowFieldMappingEditor.showAll") : translate("shared.workflowFieldMappingEditor.showEnabledOnly")}
                        onClick={() => setShowOnlyEnabled((current) => !current)}
                    />
                </div>
            </div>
            <Collapse
                size="small"
                items={visibleFields.map(({ field, index }) => {
                    const source = String(field.source || "");
                    const sourceLabel = sourceOptions.find((item) => item.value === source)?.label || source || translate("shared.workflowFieldMappingEditor.keepWorkflowDefault");
                    const enabled = field.enabled !== false;
                    const fieldType = workflowEditorFieldType(field);
                    const numeric = fieldType === "NUMBER" || fieldType === "SLIDER";
                    const choices = workflowFieldChoiceValues(field);
                    const presetOptions = workflowFieldPresetOptions(field);
                    const safeToOverride = field.safeToOverride !== false;
                    const fieldDisabled = disabled || !enabled || !safeToOverride;
                    const configurationError = workflowFieldConfigurationError(field);
                    const roleLabel =
                        field.role === "prompt"
                            ? translate("canvasA.assetView.prompt")
                            : field.role === "media"
                              ? translate("nav.tools.assets")
                              : field.role === "internal"
                                ? translate("shared.workflowFieldMappingEditor.internalParameter")
                                : translate("shared.workflowFieldMappingEditor.businessParameter");
                    return {
                        key: field.id || `${field.nodeId}::${field.fieldName}::${index}`,
                        label: (
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium">{field.label || field.fieldName}</span>
                                <Tooltip title={`${field.nodeId}.${field.fieldName}`}>
                                    <span className="truncate text-xs text-foreground/50">
                                        {field.nodeId}.{field.fieldName}
                                    </span>
                                </Tooltip>
                                <Tag className="ml-auto shrink-0">{sourceLabel}</Tag>
                                <Tag color={safeToOverride ? undefined : "error"} className="shrink-0">
                                    {safeToOverride ? roleLabel : translate("shared.workflowFieldMappingEditor.doNotOverride")}
                                </Tag>
                            </div>
                        ),
                        extra: (
                            <span onClick={(event) => event.stopPropagation()}>
                                <Switch
                                    size="sm"
                                    checked={enabled}
                                    disabled={disabled || !safeToOverride}
                                    aria-label={translate("shared.workflowFieldMappingEditor.enableField", { v0: String(field.label || field.fieldName) })}
                                    onChange={(checked) => updateField(index, { enabled: checked })}
                                />
                            </span>
                        ),
                        children: (
                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                <label className="grid gap-1 text-xs text-foreground/60">
                                    {translate("auth.register.displayName")}
                                    <Input value={field.label || ""} disabled={fieldDisabled} placeholder={field.fieldName} onChange={(event) => updateField(index, { label: event.target.value })} />
                                </label>
                                <label className="grid gap-1 text-xs text-foreground/60">
                                    {translate("shared.workflowFieldMappingEditor.parameterType")}
                                    <Select value={fieldType} disabled={fieldDisabled} options={fieldTypeOptions.map((item) => ({ ...item }))} onChange={(value) => updateField(index, { fieldType: value })} />
                                </label>
                                <label className="grid gap-1 text-xs text-foreground/60">
                                    {translate("shared.workflowFieldMappingEditor.inputSource")}
                                    <Select showSearch value={source} disabled={fieldDisabled} options={sourceOptions.map((item) => ({ ...item }))} optionFilterProp="label" onChange={(value) => updateField(index, sourcePatch(field, value))} />
                                </label>
                                {fieldType === "SELECT" || choices.length || presetOptions.length ? (
                                    <label className="grid gap-1 text-xs text-foreground/60 md:col-span-2 lg:col-span-3">
                                        <span className="flex items-center justify-between gap-2">
                                            <span>{translate("shared.workflowFieldMappingEditor.dropdownOptionsOnePerLine")}</span>
                                            {presetOptions.length ? (
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<ListPlus className="size-3.5" />}
                                                    disabled={fieldDisabled}
                                                    onClick={() => updateField(index, { fieldType: "SELECT", options: presetOptions, optionsSource: "preset" })}
                                                >
                                                    {translate("shared.workflowFieldMappingEditor.commonTemplates")}
                                                </Button>
                                            ) : null}
                                        </span>
                                        <Input.TextArea
                                            autoSize={{ minRows: 2, maxRows: 6 }}
                                            value={choices.map(workflowOptionText).join("\n")}
                                            disabled={fieldDisabled}
                                            placeholder={"1:1\n16:9\n9:16"}
                                            onChange={(event) => updateField(index, { options: parseWorkflowOptions(event.target.value), optionsSource: "manual" })}
                                        />
                                    </label>
                                ) : null}
                                {numeric ? (
                                    <>
                                        <label className="grid gap-1 text-xs text-foreground/60">
                                            {translate("shared.workflowFieldMappingEditor.minimum")}
                                            <InputNumber className="w-full" value={numberOrUndefined(field.min)} max={numberOrUndefined(field.max)} disabled={fieldDisabled} onChange={(value) => updateField(index, { min: value ?? undefined })} />
                                        </label>
                                        <label className="grid gap-1 text-xs text-foreground/60">
                                            {translate("shared.workflowFieldMappingEditor.maximum")}
                                            <InputNumber className="w-full" value={numberOrUndefined(field.max)} min={numberOrUndefined(field.min)} disabled={fieldDisabled} onChange={(value) => updateField(index, { max: value ?? undefined })} />
                                        </label>
                                        <label className="grid gap-1 text-xs text-foreground/60">
                                            {translate("shared.workflowFieldMappingEditor.steps")}
                                            <InputNumber className="w-full" min={0.000001} value={numberOrUndefined(field.step)} disabled={fieldDisabled} onChange={(value) => updateField(index, { step: value ?? undefined })} />
                                        </label>
                                        {configurationError ? <div className="text-xs text-error md:col-span-2 lg:col-span-3">{configurationError}</div> : null}
                                    </>
                                ) : null}
                                {sourceUsesIndex(source) ? (
                                    <label className="grid gap-1 text-xs text-foreground/60">
                                        {source === "referenceImage"
                                            ? translate("shared.workflowFieldMappingEditor.imageSlot")
                                            : source === "referenceVideo"
                                              ? translate("shared.workflowFieldMappingEditor.videoSlot")
                                              : translate("shared.workflowFieldMappingEditor.audioSlot")}
                                        <InputNumber
                                            className="w-full"
                                            min={1}
                                            precision={0}
                                            value={source === "referenceImage" ? Math.max(1, Number(field.imageOrder) || 1) : Math.max(1, (Number(field.sourceIndex) || 0) + 1)}
                                            disabled={fieldDisabled}
                                            onChange={(value) => updateField(index, source === "referenceImage" ? { imageOrder: Number(value) || 1 } : { sourceIndex: Math.max(0, (Number(value) || 1) - 1) })}
                                        />
                                    </label>
                                ) : null}
                                <label className="flex items-center justify-between gap-3 text-xs text-foreground/60">
                                    {translate("shared.workflowFieldMappingEditor.blockGenerationWhenMissing")}
                                    <Switch checked={field.required === true} disabled={fieldDisabled || !source} onChange={(required) => updateField(index, { required })} />
                                </label>
                                {fieldType === "NUMBER" ? (
                                    <label className="flex items-center justify-between gap-3 text-xs text-foreground/60">
                                        {translate("shared.workflowFieldMappingEditor.randomNumberEachTime")}
                                        <Switch checked={field.randomEnabled === true} disabled={fieldDisabled || Boolean(source)} onChange={(randomEnabled) => updateField(index, { randomEnabled })} />
                                    </label>
                                ) : null}
                                {!source ? (
                                    <label className="grid gap-1 text-xs text-foreground/60 md:col-span-2 lg:col-span-3">
                                        {translate("shared.workflowFieldMappingEditor.workflowDefault")}
                                        <DefaultValueInput field={field} disabled={fieldDisabled || field.randomEnabled === true} onChange={(fieldValue) => updateField(index, { fieldValue })} />
                                    </label>
                                ) : null}
                            </div>
                        ),
                    };
                })}
            />
            {showOnlyEnabled && !visibleFields.length ? <EmptyState size="compact" description={translate("shared.workflowFieldMappingEditor.noEnabledFields")} /> : null}
        </div>
    );
}

function DefaultValueInput({ field, disabled, onChange }: { field: WorkflowFieldMapping; disabled: boolean; onChange: (value: unknown) => void }) {
    const fieldType = String(field.fieldType || "").toUpperCase();
    const value = field.fieldValue ?? field.value ?? field.default;
    const bounds = workflowFieldNumberBounds(field);
    const choices = workflowFieldChoiceValues(field);
    if (fieldType === "BOOLEAN" || typeof value === "boolean") {
        return (
            <Select
                value={Boolean(value)}
                disabled={disabled}
                options={[
                    { label: "true", value: true },
                    { label: "false", value: false },
                ]}
                onChange={onChange}
            />
        );
    }
    if (choices.length) {
        return <Select showSearch value={value} disabled={disabled} options={choices.map((option) => ({ label: workflowOptionText(option), value: workflowOptionValue(option) }))} onChange={onChange} />;
    }
    if (fieldType === "NUMBER" || typeof value === "number" || bounds.min !== undefined || bounds.max !== undefined || bounds.step !== undefined) {
        return <InputNumber className="w-full" value={numberOrUndefined(value)} disabled={disabled} min={bounds.min} max={bounds.max} step={bounds.step} onChange={onChange} />;
    }
    return <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={displayValue(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}

function sourcePatch(field: WorkflowFieldMapping, source: string): Partial<WorkflowFieldMapping> {
    if (source === "referenceImage") return { source, bindPrompt: false, sourceAutomatic: false, imageOrder: Math.max(1, Number(field.imageOrder) || 1), sourceIndex: undefined };
    if (source === "referenceVideo" || source === "referenceAudio") return { source, bindPrompt: false, sourceAutomatic: false, sourceIndex: Math.max(0, Number(field.sourceIndex) || 0), imageOrder: undefined };
    return { source, bindPrompt: false, sourceAutomatic: false, sourceIndex: undefined, imageOrder: undefined, required: source ? field.required : false };
}

function sourceUsesIndex(source: string) {
    return source === "referenceImage" || source === "referenceVideo" || source === "referenceAudio";
}

function workflowEditorFieldType(field: WorkflowFieldMapping) {
    const configured = String(field.fieldType || "")
        .trim()
        .toUpperCase();
    if (["FLOAT", "INT", "INTEGER"].includes(configured)) return "NUMBER";
    if (fieldTypeOptions.some((item) => item.value === configured)) return configured;
    const value = field.fieldValue ?? field.value ?? field.default;
    if (typeof value === "boolean") return "BOOLEAN";
    if (typeof value === "number") return "NUMBER";
    return "TEXT";
}

function parseWorkflowOptions(value: string) {
    return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function workflowOptionValue(value: unknown): string | number {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const option = value as Record<string, unknown>;
        for (const key of ["value", "id", "key", "name", "label"]) {
            if (option[key] !== undefined && option[key] !== null) return typeof option[key] === "number" ? option[key] : String(option[key]);
        }
    }
    return typeof value === "number" ? value : String(value ?? "");
}

function workflowOptionText(value: unknown) {
    return String(workflowOptionValue(value));
}

function numberOrUndefined(value: unknown) {
    if (value === undefined || value === null || String(value).trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function displayValue(value: unknown) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}
