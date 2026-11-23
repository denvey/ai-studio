import { ImageSizePresetsEditor } from "./image-size-presets-editor";
import { imageSizeConfigWithPresets, imageSizePresets } from "@/lib/image-size-presets";
import { Input, InputNumber } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { Checkbox } from "@/components/ui/base/checkbox";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import type { ReactNode } from "react";
import {
    THINKING_LEVELS,
    THINKING_LEVEL_LABELS,
    THINKING_PRESETS,
    thinkingLevelsFor,
    thinkingPresetConfig,
    withThinkingLevels,
    type TextThinkingConfig,
    type ThinkingLevel,
    type ThinkingMode,
    type ThinkingSwitchKind,
    type ThinkingIntensityKind,
} from "@/lib/text-thinking";

import {
    DEFAULT_VIDEO_PROCESSING_MAX_SOURCE_SECONDS,
    defaultImageCapabilityConfig,
    defaultModelCapabilityConfig,
    normalizeModelCapabilityConfig,
    type ImageCapabilityConfig,
    type ImageResponseFormat,
    type ModelCapabilityConfig,
    type TextCapabilityConfig,
    type VideoCapabilityConfig,
} from "@/lib/model-capabilities";
import type { ModelProtocol, ModelProtocolWorkflow } from "@/lib/model-protocols";
import { ImageParameterSchemaEditor, ImageParameterSizeEditor } from "@/components/image-parameter-fields";
import { updateImageParameterSchema, resolveImageParameters, type ImageParameter } from "@/lib/image-parameters";
import { cleanVideoScreenSpecValues, findProtocolWorkflow, resolveWorkflowVideoScreenSpec, updateWorkflowVideoScreenSpec } from "@/lib/video-screen-specs";
import { VIDEO_RESOLUTION_CAPABILITY_OPTIONS } from "@/lib/video-generation-options";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";


const ratioOptions = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const operationOptions = [
    { label: translate("shared.modelCapabilityEditor.textToVideo"), value: "text_to_video" },
    { label: translate("shared.modelCapabilityEditor.imageToVideo"), value: "image_to_video" },
    { label: translate("shared.modelCapabilityEditor.multimodalReferences"), value: "reference_to_video" },
    { label: translate("shared.modelCapabilityEditor.videoContinuation"), value: "extend" },
    { label: translate("shared.modelCapabilityEditor.localEdit"), value: "inpaint" },
    { label: translate("shared.modelCapabilityEditor.elementReplacement"), value: "replace_element" },
    { label: translate("shared.modelCapabilityEditor.cameraMoveAdjustment"), value: "camera_motion" },
    { label: translate("shared.modelCapabilityEditor.styleTransfer"), value: "style_transfer" },
    { label: translate("shared.modelCapabilityEditor.audioToVideo"), value: "audio_to_video" },
    { label: translate("shared.modelCapabilityEditor.qualityEnhancement"), value: "enhance" },
];

function ImageSizeHelp() {
    return <p className="text-[var(--fs-label)] leading-relaxed text-foreground/60">{translate("shared.modelCapabilityEditor.configureSupportedAspectRatiosForEachResolutionSizesAreConverted")}</p>;
}

type Props = {
    value?: ModelCapabilityConfig;
    onChange?: (value: ModelCapabilityConfig) => void;
    protocol?: ModelProtocol;
    capability?: "text" | "image" | "video";
    model?: string;
    workflows?: ModelProtocolWorkflow[];
    imageParameters?: ImageParameter[];
    disabled?: boolean;
    section?: "all" | "protocol" | "references";
};

export function ModelCapabilityEditor({ value, onChange, protocol, capability = "video", model = "", workflows = [], imageParameters, disabled = false, section = "all" }: Props) {
    if (capability === "text") {
        return <TextCapabilityEditor value={value} onChange={onChange} protocol={protocol} disabled={disabled} section={section} />;
    }
    if (capability === "image") {
        return <ImageCapabilityEditor value={value} onChange={onChange} protocol={protocol} model={model} imageParameters={imageParameters} disabled={disabled} section={section} />;
    }
    const workflow = findProtocolWorkflow(workflows, protocol, model);
    const storedProfile = normalizeModelCapabilityConfig(value || defaultModelCapabilityConfig(protocol, model)).video!;
    const autoDL = protocol === "autodl-comfyui";
    const profile = autoDL ? resolveWorkflowVideoScreenSpec(storedProfile, workflow) : storedProfile;
    const update = (patch: Partial<VideoCapabilityConfig>) => onChange?.({ version: 1, video: { ...profile, ...patch } });
    const updateReferences = (patch: Partial<VideoCapabilityConfig["references"]>) => update({ references: { ...profile.references, ...patch } });
    const updateDuration = (patch: Partial<VideoCapabilityConfig["duration"]>) => update({ duration: { ...profile.duration, ...patch } });
    const durationValues = (profile.duration.values || []).join(",");
    const resolutionOptions = Array.from(new Set([...VIDEO_RESOLUTION_CAPABILITY_OPTIONS, ...profile.resolutions]));
    const autoDLSpecFields = <AutoDLScreenSpecFields profile={profile} workflow={workflow} disabled={disabled} onChange={(video) => onChange?.({ version: 1, video })} />;
    // 视频处理模型（画质增强等）：帧率策略与源视频时长上限；生成模型不显示。
    const processing = profile.processing;
    const processingFields = processing ? (
        <div className="grid gap-3 sm:grid-cols-2">
            <Field label={translate("shared.modelCapabilityEditor.frameRatePolicy")}>
                <Select
                    className="w-full"
                    disabled={disabled}
                    value={processing.fpsPolicy}
                    options={[
                        { label: translate("shared.modelCapabilityEditor.keepTheSourceFrameRateReserveAtThe30Fps"), value: "keep_source" },
                        { label: translate("shared.modelCapabilityEditor.letUsersChooseTheFrameRate"), value: "user_select" },
                    ]}
                    onChange={(fpsPolicy) =>
                        update({ processing: fpsPolicy === "user_select" ? { ...processing, fpsPolicy, fpsOptions: processing.fpsOptions?.length ? processing.fpsOptions : [30, 60] } : { fpsPolicy, maxSourceSeconds: processing.maxSourceSeconds } })
                    }
                />
            </Field>
            {processing.fpsPolicy === "user_select" ? (
                <Field label={translate("shared.modelCapabilityEditor.availableFrameRates15120CommaSeparated")}>
                    <Input disabled={disabled} value={(processing.fpsOptions || []).join(",")} placeholder={translate("shared.modelCapabilityEditor.forExample3060")} onChange={(event) => update({ processing: { ...processing, fpsOptions: parseIntegerList(event.target.value) } })} />
                </Field>
            ) : null}
            <NumberField
                label={translate("shared.modelCapabilityEditor.maximumSourceVideoDurationInSeconds", { v0: String(DEFAULT_VIDEO_PROCESSING_MAX_SOURCE_SECONDS) })}
                value={processing.maxSourceSeconds || DEFAULT_VIDEO_PROCESSING_MAX_SOURCE_SECONDS}
                min={1}
                max={DEFAULT_VIDEO_PROCESSING_MAX_SOURCE_SECONDS}
                disabled={disabled}
                onChange={(value) => update({ processing: { ...processing, maxSourceSeconds: value || DEFAULT_VIDEO_PROCESSING_MAX_SOURCE_SECONDS } })}
            />
        </div>
    ) : null;

    if (section === "references") {
        return (
            <div className="admin-capability-reference-editor">
                <div className="admin-capability-reference-grid">
                    <ReferenceCard title={translate("shared.modelCapabilityEditor.imageReferences")} description={translate("shared.modelCapabilityEditor.firstFrameReferenceImageAndMultiImageInputLimits")}>
                        <NumberField label={translate("shared.modelCapabilityEditor.minimumImageReferences")} value={profile.references.minImages} min={0} max={profile.references.maxImages} disabled={disabled} onChange={(value) => updateReferences({ minImages: value || 0 })} />
                        <NumberField
                            label={translate("shared.modelCapabilityEditor.maxImageReferences")}
                            value={profile.references.maxImages}
                            min={0}
                            disabled={disabled}
                            onChange={(value) => {
                                const maxImages = value || 0;
                                updateReferences({ maxImages, minImages: Math.min(profile.references.minImages, maxImages) });
                            }}
                        />
                        <NumberField label={translate("shared.modelCapabilityEditor.maximumImageSizeMB")} value={bytesToMB(profile.references.maxImageBytes)} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxImageBytes: mbToBytes(value) })} />
                    </ReferenceCard>
                    <ReferenceCard title={translate("shared.modelCapabilityEditor.audioReferences")} description={translate("shared.modelCapabilityEditor.audioInputAndSynchronizedOutputLimits")}>
                        <NumberField label={translate("shared.modelCapabilityEditor.maxAudioReferences")} value={profile.references.maxAudios} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxAudios: value || 0 })} />
                        <NumberField label={translate("shared.modelCapabilityEditor.maximumAudioFileSizeMB")} value={bytesToMB(profile.references.maxAudioBytes)} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxAudioBytes: mbToBytes(value) })} />
                        <NumberField label={translate("shared.modelCapabilityEditor.maximumAudioDurationInSeconds")} value={profile.references.maxAudioDurationSeconds} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxAudioDurationSeconds: value || 0 })} />
                        <BooleanField label={translate("shared.modelCapabilityEditor.syncAudio")} value={profile.generateAudio} disabled={disabled} onChange={(generateAudio) => update({ generateAudio })} />
                    </ReferenceCard>
                    <ReferenceCard title={translate("shared.modelCapabilityEditor.videoReferences")} description={translate("shared.modelCapabilityEditor.videoCountSizeAndDurationLimits")}>
                        <NumberField label={translate("shared.modelCapabilityEditor.maxVideoReferences")} value={profile.references.maxVideos} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxVideos: value || 0 })} />
                        <NumberField label={translate("shared.modelCapabilityEditor.maximumVideoFileSizeMB")} value={bytesToMB(profile.references.maxVideoBytes)} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxVideoBytes: mbToBytes(value) })} />
                        <NumberField label={translate("shared.modelCapabilityEditor.maximumVideoDurationInSeconds")} value={profile.references.maxVideoDurationSeconds} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxVideoDurationSeconds: value || 0 })} />
                    </ReferenceCard>
                    <ReferenceCard title={translate("shared.modelCapabilityEditor.generalLimits")} description={translate("shared.modelCapabilityEditor.basicConstraintsSharedByAllVideoRequests")}>
                        <NumberField label={translate("shared.modelCapabilityEditor.maximumPromptCharacters")} value={profile.references.promptMaxChars} min={1} disabled={disabled} onChange={(value) => updateReferences({ promptMaxChars: value || 1 })} />
                        <BooleanField label={translate("library.tasks.params.watermark")} value={profile.watermark} disabled={disabled} onChange={(watermark) => update({ watermark })} />
                    </ReferenceCard>
                </div>
            </div>
        );
    }

    if (section === "protocol") {
        return (
            <div className="admin-capability-protocol-editor">
                <div className="admin-capability-protocol-grid">
                    <ProtocolParameterCard step="01" title={translate("shared.modelCapabilityEditor.generationMode")} description={translate("shared.modelCapabilityEditor.allowedTaskTypesAndTheDefaultTask")}>
                        <Field label={translate("shared.modelCapabilityEditor.supportedModes")}>
                            <Select
                                mode="multiple"
                                className="w-full"
                                disabled={disabled}
                                value={profile.operations}
                                options={operationOptions}
                                onChange={(operations) => update({ operations, defaultOperation: operations.includes(profile.defaultOperation) ? profile.defaultOperation : operations[0] || "text_to_video" })}
                            />
                        </Field>
                        <Field label={translate("shared.modelCapabilityEditor.defaultMode")}>
                            <Select
                                className="w-full"
                                disabled={disabled}
                                value={profile.defaultOperation}
                                options={operationOptions.filter((item) => profile.operations.includes(item.value))}
                                onChange={(defaultOperation) => update({ defaultOperation })}
                            />
                        </Field>
                    </ProtocolParameterCard>
                    <ProtocolParameterCard step="02" title={translate("shared.modelCapabilityEditor.outputDuration")} description={translate("shared.modelCapabilityEditor.availableDurationsInSecondsAndTheDefaultDuration")}>
                        <SegmentedControl
                            block
                            disabled={disabled}
                            value={profile.duration.selection}
                            options={[
                                { label: translate("shared.modelCapabilityEditor.range"), value: "range" },
                                { label: translate("shared.modelCapabilityEditor.fixedValue"), value: "enum" },
                            ]}
                            onChange={(value) =>
                                updateDuration(
                                    value === "enum"
                                        ? { selection: "enum", values: profile.duration.values?.length ? profile.duration.values : [profile.duration.default] }
                                        : { selection: "range", min: profile.duration.min || 1, max: profile.duration.max || 15, step: profile.duration.step || 1 },
                                )
                            }
                        />
                        {profile.duration.selection === "enum" ? (
                            <Field label={translate("shared.modelCapabilityEditor.fixedDurationSeconds")}>
                                <Input
                                    disabled={disabled}
                                    value={durationValues}
                                    placeholder={translate("shared.modelCapabilityEditor.eG510")}
                                    onChange={(event) => updateDuration({ values: parseIntegerList(event.target.value), default: parseIntegerList(event.target.value)[0] || profile.duration.default })}
                                />
                            </Field>
                        ) : (
                            <div className="admin-capability-duration-grid">
                                <NumberField label={translate("shared.modelCapabilityEditor.shortest")} value={profile.duration.min} min={1} disabled={disabled} onChange={(value) => updateDuration({ min: value || 1 })} />
                                <NumberField label={translate("shared.modelCapabilityEditor.longest")} value={profile.duration.max} min={1} disabled={disabled} onChange={(value) => updateDuration({ max: value || 1 })} />
                                <NumberField label={translate("shared.modelCapabilityEditor.steps")} value={profile.duration.step} min={1} disabled={disabled} onChange={(value) => updateDuration({ step: value || 1 })} />
                                <NumberField label={translate("canvasB.common.default")} value={profile.duration.default} min={1} disabled={disabled} onChange={(value) => updateDuration({ default: value || 1 })} />
                            </div>
                        )}
                    </ProtocolParameterCard>
                    <ProtocolParameterCard step="03" title={translate("shared.modelCapabilityEditor.videoSpecifications")} description={translate("shared.modelCapabilityEditor.aspectRatioResolutionAndDefaultOutputSettings")}>
                        {autoDL ? (
                            autoDLSpecFields
                        ) : (
                            <div className="admin-capability-spec-grid">
                                <Field label={translate("shared.modelCapabilityEditor.supportedAspectRatios")}>
                                    <Select
                                        mode="multiple"
                                        className="w-full"
                                        disabled={disabled}
                                        value={profile.ratios}
                                        options={ratioOptions.map((item) => ({ label: item, value: item }))}
                                        onChange={(ratios) => update({ ratios, defaultRatio: ratios.includes(profile.defaultRatio) ? profile.defaultRatio : ratios[0] || "16:9" })}
                                    />
                                </Field>
                                <Field label={translate("shared.modelCapabilityEditor.defaultRatio")}>
                                    <Select className="w-full" disabled={disabled} value={profile.defaultRatio} options={profile.ratios.map((item) => ({ label: item, value: item }))} onChange={(defaultRatio) => update({ defaultRatio })} />
                                </Field>
                                <Field label={translate("shared.modelCapabilityEditor.outputResolution")}>
                                    <Select
                                        mode="tags"
                                        className="admin-capability-tags w-full"
                                        disabled={disabled}
                                        value={profile.resolutions}
                                        tokenSeparators={[","]}
                                        placeholder={translate("shared.modelCapabilityEditor.selectOrEnterAModelPreset")}
                                        options={resolutionOptions.map((item) => ({ label: item.toUpperCase(), value: item }))}
                                        onChange={(resolutions) => update({ resolutions, defaultResolution: resolutions.includes(profile.defaultResolution) ? profile.defaultResolution : resolutions[0] || "" })}
                                    />
                                </Field>
                                <Field label={translate("shared.modelCapabilityEditor.defaultResolution")}>
                                    <Select
                                        className="w-full"
                                        disabled={disabled}
                                        value={profile.defaultResolution}
                                        options={profile.resolutions.map((item) => ({ label: item.toUpperCase(), value: item }))}
                                        onChange={(defaultResolution) => update({ defaultResolution })}
                                    />
                                </Field>
                            </div>
                        )}
                    </ProtocolParameterCard>
                    {processingFields ? (
                        <ProtocolParameterCard step="04" title={translate("shared.modelCapabilityEditor.videoProcessing")} description={translate("shared.modelCapabilityEditor.frameRatePolicyAndSourceDurationLimitTasksArePolled")}>
                            {processingFields}
                        </ProtocolParameterCard>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div className="admin-capability-editor space-y-3 rounded-md bg-muted/10 p-3">
            <div className="admin-capability-editor-heading flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="text-sm font-medium">{translate("shared.modelCapabilityEditor.videoCapabilityParameters")}</div>
                    <div className="mt-0.5 text-[var(--fs-tiny)] text-foreground/48">{translate("shared.modelCapabilityEditor.theseParametersApplyToTheCreatePageTheCanvasAnd")}</div>
                </div>
                <span className="text-[var(--fs-tiny)] text-foreground/40">{translate("shared.modelCapabilityEditor.theProtocolTemplateCanStillBeAdjusted")}</span>
            </div>

            <CapabilityGroup title={translate("account.feedback.video")} description={translate("shared.modelCapabilityEditor.generationModesOutputSpecificationsAndVideoReferenceLimits")}>
                <CapabilityBlock title={translate("shared.modelCapabilityEditor.generationMode")}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={translate("shared.modelCapabilityEditor.supportedModes")}>
                            <Select
                                mode="multiple"
                                className="w-full"
                                disabled={disabled}
                                value={profile.operations}
                                options={operationOptions}
                                onChange={(operations) => update({ operations, defaultOperation: operations.includes(profile.defaultOperation) ? profile.defaultOperation : operations[0] || "text_to_video" })}
                            />
                        </Field>
                        <Field label={translate("shared.modelCapabilityEditor.defaultMode")}>
                            <Select
                                className="w-full"
                                disabled={disabled}
                                value={profile.defaultOperation}
                                options={operationOptions.filter((item) => profile.operations.includes(item.value))}
                                onChange={(defaultOperation) => update({ defaultOperation })}
                            />
                        </Field>
                    </div>
                </CapabilityBlock>
                <CapabilityBlock title={translate("shared.modelCapabilityEditor.outputDuration")}>
                    <SegmentedControl
                        block
                        disabled={disabled}
                        value={profile.duration.selection}
                        options={[
                            { label: translate("shared.modelCapabilityEditor.range"), value: "range" },
                            { label: translate("shared.modelCapabilityEditor.fixedValue"), value: "enum" },
                        ]}
                        onChange={(value) =>
                            updateDuration(
                                value === "enum"
                                    ? { selection: "enum", values: profile.duration.values?.length ? profile.duration.values : [profile.duration.default] }
                                    : { selection: "range", min: profile.duration.min || 1, max: profile.duration.max || 15, step: profile.duration.step || 1 },
                            )
                        }
                    />
                    {profile.duration.selection === "enum" ? (
                        <Field label={translate("shared.modelCapabilityEditor.fixedDurationSeconds")}>
                            <Input
                                disabled={disabled}
                                value={durationValues}
                                placeholder={translate("shared.modelCapabilityEditor.eG510")}
                                onChange={(event) => updateDuration({ values: parseIntegerList(event.target.value), default: parseIntegerList(event.target.value)[0] || profile.duration.default })}
                            />
                        </Field>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <NumberField label={translate("shared.modelCapabilityEditor.shortest")} value={profile.duration.min} min={1} disabled={disabled} onChange={(value) => updateDuration({ min: value || 1 })} />
                            <NumberField label={translate("shared.modelCapabilityEditor.longest")} value={profile.duration.max} min={1} disabled={disabled} onChange={(value) => updateDuration({ max: value || 1 })} />
                            <NumberField label={translate("shared.modelCapabilityEditor.steps")} value={profile.duration.step} min={1} disabled={disabled} onChange={(value) => updateDuration({ step: value || 1 })} />
                            <NumberField label={translate("canvasB.common.default")} value={profile.duration.default} min={1} disabled={disabled} onChange={(value) => updateDuration({ default: value || 1 })} />
                        </div>
                    )}
                </CapabilityBlock>
                <CapabilityBlock title={translate("shared.modelCapabilityEditor.videoSpecifications")}>
                    {autoDL ? (
                        autoDLSpecFields
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label={translate("shared.modelCapabilityEditor.aspectRatio")}>
                                <Select
                                    mode="multiple"
                                    className="w-full"
                                    disabled={disabled}
                                    value={profile.ratios}
                                    options={ratioOptions.map((item) => ({ label: item, value: item }))}
                                    onChange={(ratios) => update({ ratios, defaultRatio: ratios.includes(profile.defaultRatio) ? profile.defaultRatio : ratios[0] || "16:9" })}
                                />
                            </Field>
                            <Field label={translate("shared.modelCapabilityEditor.defaultRatio")}>
                                <Select className="w-full" disabled={disabled} value={profile.defaultRatio} options={profile.ratios.map((item) => ({ label: item, value: item }))} onChange={(defaultRatio) => update({ defaultRatio })} />
                            </Field>
                            <Field label={translate("shared.modelCapabilityEditor.outputResolution")}>
                                <Select
                                    mode="tags"
                                    className="admin-capability-tags w-full"
                                    disabled={disabled}
                                    value={profile.resolutions}
                                    tokenSeparators={[","]}
                                    placeholder={translate("shared.modelCapabilityEditor.chooseAStandardResolutionOrEnterAModelSpecificValue")}
                                    options={resolutionOptions.map((item) => ({ label: item.toUpperCase(), value: item }))}
                                    onChange={(resolutions) => update({ resolutions, defaultResolution: resolutions.includes(profile.defaultResolution) ? profile.defaultResolution : resolutions[0] || "" })}
                                />
                            </Field>
                            <Field label={translate("shared.modelCapabilityEditor.defaultResolution")}>
                                <Select
                                    className="w-full"
                                    disabled={disabled}
                                    value={profile.defaultResolution}
                                    options={profile.resolutions.map((item) => ({ label: item.toUpperCase(), value: item }))}
                                    onChange={(defaultResolution) => update({ defaultResolution })}
                                />
                            </Field>
                        </div>
                    )}
                </CapabilityBlock>
                {processingFields ? <CapabilityBlock title={translate("shared.modelCapabilityEditor.videoProcessing")}>{processingFields}</CapabilityBlock> : null}
                {section === "all" ? (
                    <CapabilityBlock title={translate("shared.modelCapabilityEditor.videoReferences")}>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <NumberField label={translate("shared.modelCapabilityEditor.maxVideoReferences")} value={profile.references.maxVideos} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxVideos: value || 0 })} />
                            <NumberField label={translate("shared.modelCapabilityEditor.maximumVideoFileSizeMB")} value={bytesToMB(profile.references.maxVideoBytes)} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxVideoBytes: mbToBytes(value) })} />
                            <NumberField label={translate("shared.modelCapabilityEditor.maximumVideoDurationInSeconds")} value={profile.references.maxVideoDurationSeconds} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxVideoDurationSeconds: value || 0 })} />
                        </div>
                    </CapabilityBlock>
                ) : null}
            </CapabilityGroup>

            {section === "all" ? (
                <>
                    <CapabilityGroup title={translate("account.feedback.image")} description={translate("shared.modelCapabilityEditor.firstFrameReferenceImageAndMultiImageInputConstraints")}>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <NumberField label={translate("shared.modelCapabilityEditor.minimumImageReferences")} value={profile.references.minImages} min={0} max={profile.references.maxImages} disabled={disabled} onChange={(value) => updateReferences({ minImages: value || 0 })} />
                            <NumberField
                                label={translate("shared.modelCapabilityEditor.maxImageReferences")}
                                value={profile.references.maxImages}
                                min={0}
                                disabled={disabled}
                                onChange={(value) => {
                                    const maxImages = value || 0;
                                    updateReferences({ maxImages, minImages: Math.min(profile.references.minImages, maxImages) });
                                }}
                            />
                            <NumberField label={translate("shared.modelCapabilityEditor.maximumImageSizeMB")} value={bytesToMB(profile.references.maxImageBytes)} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxImageBytes: mbToBytes(value) })} />
                        </div>
                    </CapabilityGroup>

                    <CapabilityGroup title={translate("account.settings.modelConfig.capabilities.audio")} description={translate("shared.modelCapabilityEditor.audioReferencesAndSynchronizedAudioInVideoOutput")}>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <NumberField label={translate("shared.modelCapabilityEditor.maxAudioReferences")} value={profile.references.maxAudios} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxAudios: value || 0 })} />
                            <NumberField label={translate("shared.modelCapabilityEditor.maximumAudioFileSizeMB")} value={bytesToMB(profile.references.maxAudioBytes)} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxAudioBytes: mbToBytes(value) })} />
                            <NumberField label={translate("shared.modelCapabilityEditor.maximumAudioDurationInSeconds")} value={profile.references.maxAudioDurationSeconds} min={0} disabled={disabled} onChange={(value) => updateReferences({ maxAudioDurationSeconds: value || 0 })} />
                        </div>
                        <BooleanField label={translate("shared.modelCapabilityEditor.syncAudio")} value={profile.generateAudio} disabled={disabled} onChange={(generateAudio) => update({ generateAudio })} />
                    </CapabilityGroup>

                    <CapabilityGroup title={translate("shared.modelCapabilityEditor.generalLimits")} description={translate("shared.modelCapabilityEditor.requestAndOutputConstraintsSharedAcrossMediaTypes")}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <NumberField label={translate("shared.modelCapabilityEditor.maximumPromptCharacters")} value={profile.references.promptMaxChars} min={1} disabled={disabled} onChange={(value) => updateReferences({ promptMaxChars: value || 1 })} />
                            <BooleanField label={translate("library.tasks.params.watermark")} value={profile.watermark} disabled={disabled} onChange={(watermark) => update({ watermark })} />
                        </div>
                    </CapabilityGroup>
                </>
            ) : null}
        </div>
    );
}

function TextCapabilityEditor({ value, onChange, protocol, disabled, section }: Pick<Props, "value" | "onChange" | "protocol" | "disabled" | "section">) {
    const profile = normalizeModelCapabilityConfig(value || defaultModelCapabilityConfig(protocol)).text!;
    const update = (patch: Partial<TextCapabilityConfig>) => {
        onChange?.({ version: 1, text: { ...profile, ...patch } });
    };
    const updateReferences = (patch: Partial<TextCapabilityConfig["references"]>) => {
        update({ references: { ...profile.references, ...patch } });
    };
    // 视频识别是否开启只看 maxVideos > 0：路由、能力校验和模型标签都读这一个值，不再另存布尔值。
    const videoUnderstanding = profile.references.maxVideos > 0;
    const videoFields = (
        <>
            <Checkbox
                className="admin-capability-video-toggle items-start"
                checked={videoUnderstanding}
                disabled={Boolean(disabled)}
                onChange={(event) => updateReferences({ maxVideos: event.target.checked ? Math.max(1, profile.references.maxVideos) : 0 })}
            >
                <span className="grid gap-0.5">
                    <span className="text-xs font-medium">{translate("shared.modelCapabilityEditor.supportsVideoUnderstanding")}</span>
                    <span className="text-[var(--fs-tiny)] leading-5 text-foreground/45">{translate("shared.modelCapabilityEditor.enableThisToLetTheModelReceiveReferenceVideosFor")}</span>
                </span>
            </Checkbox>
            {videoUnderstanding ? (
                <>
                    <NumberField label={translate("shared.modelCapabilityEditor.maximumVideosToAnalyze")} value={profile.references.maxVideos} min={1} max={100} disabled={Boolean(disabled)} onChange={(next) => updateReferences({ maxVideos: Math.max(1, next || 1) })} />
                    <NumberField label={translate("shared.modelCapabilityEditor.maximumVideoFileSizeMB")} value={bytesToMB(profile.references.maxVideoBytes)} min={0} disabled={Boolean(disabled)} onChange={(next) => updateReferences({ maxVideoBytes: mbToBytes(next) })} />
                </>
            ) : null}
        </>
    );

    if (section === "protocol") {
        return (
            <div className="admin-capability-editor space-y-3 rounded-md bg-muted/20 p-3">
                <CapabilityGroup title={translate("shared.modelCapabilityEditor.responseMode")} description={translate("shared.modelCapabilityEditor.chooseHowResponsesAreRequestedFromTheUpstreamTextModel")}>
                    <ParameterField
                        label={translate("shared.modelCapabilityEditor.sSEStreaming")}
                        description={translate("shared.modelCapabilityEditor.whenEnabledSendStreamTrueAndReceiveTextIncrementallyWhen")}
                        supported={profile.streaming !== false}
                        disabled={Boolean(disabled)}
                        onChange={(streaming) => update({ streaming })}
                    />
                </CapabilityGroup>
                <TextThinkingEditor value={profile.thinking} disabled={Boolean(disabled)} onChange={(thinking) => update({ thinking })} />
            </div>
        );
    }

    if (section === "references") {
        const contextWindowFields = (
            <CapabilityGroup title={translate("shared.modelCapabilityEditor.contextCapacity")} description={translate("shared.modelCapabilityEditor.thisDefinesTheUpstreamTextModelSCapacityAndThe")}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField label={translate("shared.modelCapabilityEditor.contextWindowTokens")} value={profile.contextWindowTokens} min={4_096} max={10_000_000} disabled={Boolean(disabled)} onChange={(next) => update({ contextWindowTokens: next || 4_096 })} />
                    <NumberField label={translate("shared.modelCapabilityEditor.maximumOutputTokens")} value={profile.maxOutputTokens} min={256} max={1_000_000} disabled={Boolean(disabled)} onChange={(next) => update({ maxOutputTokens: next || 256 })} />
                </div>
            </CapabilityGroup>
        );
        return (
            <div className="admin-capability-reference-editor">
                {contextWindowFields}
                <div className="admin-capability-reference-grid is-three">
                    <ReferenceCard title={translate("shared.modelCapabilityEditor.imageUnderstanding")} description={translate("shared.modelCapabilityEditor.item0MeansImageUnderstandingIsUnsupportedAPositiveValueDisplays")}>
                        <NumberField label={translate("shared.modelCapabilityEditor.maximumImagesToAnalyze")} value={profile.references.maxImages} min={0} max={100} disabled={Boolean(disabled)} onChange={(next) => updateReferences({ maxImages: next || 0 })} />
                        <NumberField label={translate("shared.modelCapabilityEditor.maximumImageSizeMB")} value={bytesToMB(profile.references.maxImageBytes)} min={0} disabled={Boolean(disabled)} onChange={(next) => updateReferences({ maxImageBytes: mbToBytes(next) })} />
                    </ReferenceCard>
                    <ReferenceCard title={translate("shared.modelCapabilityEditor.videoUnderstanding")} description={translate("shared.modelCapabilityEditor.disabledByDefaultWhenEnabledTheModelListDisplaysVideos")}>
                        {videoFields}
                    </ReferenceCard>
                    <ReferenceCard title={translate("shared.modelCapabilityEditor.generalLimits")} description={translate("shared.modelCapabilityEditor.basicConstraintsSharedByAllTextRequests")}>
                        <NumberField label={translate("shared.modelCapabilityEditor.maximumPromptCharacters")} value={profile.references.promptMaxChars} min={1} max={1_000_000} disabled={Boolean(disabled)} onChange={(next) => updateReferences({ promptMaxChars: next || 1 })} />
                    </ReferenceCard>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-capability-editor space-y-3 rounded-md bg-muted/20 p-3">
            <div>
                <div className="text-sm font-medium">{translate("shared.modelCapabilityEditor.textUnderstandingCapabilities")}</div>
                <div className="mt-0.5 text-[var(--fs-tiny)] text-foreground/48">{translate("shared.modelCapabilityEditor.imageAndVideoSupportIsNotAssumedTheseRequestsAre")}</div>
            </div>
            <CapabilityGroup title={translate("shared.modelCapabilityEditor.contextCapacity")} description={translate("shared.modelCapabilityEditor.thisDefinesTheUpstreamTextModelSCapacityAndThe")}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField label={translate("shared.modelCapabilityEditor.contextWindowTokens")} value={profile.contextWindowTokens} min={4_096} max={10_000_000} disabled={Boolean(disabled)} onChange={(next) => update({ contextWindowTokens: next || 4_096 })} />
                    <NumberField label={translate("shared.modelCapabilityEditor.maximumOutputTokens")} value={profile.maxOutputTokens} min={256} max={1_000_000} disabled={Boolean(disabled)} onChange={(next) => update({ maxOutputTokens: next || 256 })} />
                </div>
            </CapabilityGroup>
            <CapabilityGroup title={translate("shared.modelCapabilityEditor.imageUnderstanding")} description={translate("shared.modelCapabilityEditor.item0MeansImageUnderstandingIsUnsupportedAPositiveValueDisplays")}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField label={translate("shared.modelCapabilityEditor.maximumImagesToAnalyze")} value={profile.references.maxImages} min={0} max={100} disabled={Boolean(disabled)} onChange={(next) => updateReferences({ maxImages: next || 0 })} />
                    <NumberField label={translate("shared.modelCapabilityEditor.maximumImageSizeMB")} value={bytesToMB(profile.references.maxImageBytes)} min={0} disabled={Boolean(disabled)} onChange={(next) => updateReferences({ maxImageBytes: mbToBytes(next) })} />
                </div>
            </CapabilityGroup>
            <CapabilityGroup title={translate("shared.modelCapabilityEditor.videoUnderstanding")} description={translate("shared.modelCapabilityEditor.disabledByDefaultWhenEnabledTheModelListDisplaysVideos")}>
                <div className="grid gap-3 sm:grid-cols-2">{videoFields}</div>
            </CapabilityGroup>
            <CapabilityGroup title={translate("shared.modelCapabilityEditor.generalLimits")} description={translate("shared.modelCapabilityEditor.basicConstraintsSharedByAllTextRequests")}>
                <NumberField label={translate("shared.modelCapabilityEditor.maximumPromptCharacters")} value={profile.references.promptMaxChars} min={1} max={1_000_000} disabled={Boolean(disabled)} onChange={(next) => updateReferences({ promptMaxChars: next || 1 })} />
            </CapabilityGroup>
        </div>
    );
}

function ImageCapabilityEditor({ value, onChange, protocol, model, imageParameters, disabled, section }: Required<Pick<Props, "model" | "disabled">> & Pick<Props, "value" | "onChange" | "protocol" | "section" | "imageParameters">) {
    const stored = normalizeModelCapabilityConfig(value || { version: 1, image: defaultImageCapabilityConfig(protocol, model) }).image!;
    const profile = imageParameters ? resolveImageParameters(stored, imageParameters, model) : stored;
    const update = (patch: Partial<ImageCapabilityConfig>) => onChange?.({ version: 1, image: { ...profile, ...patch } });
    const updateReferences = (patch: Partial<ImageCapabilityConfig["references"]>) => update({ references: { ...profile.references, ...patch } });
    const updateSize = (patch: Partial<ImageCapabilityConfig["size"]>) => update({ size: { ...profile.size, ...patch } });
    const updateQuality = (patch: Partial<ImageCapabilityConfig["quality"]>) => update({ quality: { ...profile.quality, ...patch } });

    if (section !== "references" && profile.parameters) {
        const definitions = imageParameters || profile.parameters;
        const size = profile.parameters.find((p) => p.name === "size");
        return (
            <div className="space-y-4">
                <ImageParameterSchemaEditor
                    definitions={definitions}
                    parameters={profile.parameters.filter((p) => p.name === "imageResolution")}
                    disabled={disabled}
                    onChange={(parameters) =>
                        onChange?.({
                            version: 1,
                            image: updateImageParameterSchema(
                                profile,
                                profile.parameters!.map((p) => parameters.find((next) => next.name === p.name) || p),
                                definitions,
                            ),
                        })
                    }
                />
                {size ? <ImageParameterSizeEditor profile={profile} definition={definitions.find((p) => p.name === "size") || size} disabled={disabled} onChange={(image) => onChange?.({ version: 1, image })} /> : null}
                <ImageParameterSchemaEditor
                    definitions={definitions}
                    parameters={profile.parameters.filter((p) => p.name !== "size" && p.name !== "imageResolution")}
                    disabled={disabled}
                    onChange={(parameters) =>
                        onChange?.({
                            version: 1,
                            image: updateImageParameterSchema(
                                profile,
                                profile.parameters!.map((p) => parameters.find((next) => next.name === p.name) || p),
                            ),
                        })
                    }
                />
                <ImageResponseFormatEditor value={profile.responseFormat} disabled={disabled} onChange={(responseFormat) => update({ responseFormat })} />
            </div>
        );
    }

    if (section === "references") {
        return (
            <div className="admin-capability-reference-editor">
                <div className="admin-capability-reference-grid is-two">
                    <ReferenceCard title={translate("shared.modelCapabilityEditor.imageReferences")} description={translate("shared.modelCapabilityEditor.referenceImagesFileSizeLimitsAndMaskSupport")}>
                        <NumberField label={translate("shared.modelCapabilityEditor.maxReferenceImages")} value={profile.references.maxImages} min={0} disabled={disabled} onChange={(maxImages) => updateReferences({ maxImages: maxImages || 0 })} />
                        <NumberField label={translate("shared.modelCapabilityEditor.maxImageSizeMB")} value={bytesToMB(profile.references.maxImageBytes)} min={0} disabled={disabled} onChange={(maxImageBytes) => updateReferences({ maxImageBytes: mbToBytes(maxImageBytes) })} />
                        <ParameterField label={translate("shared.modelCapabilityEditor.maskEditing")} description={translate("shared.modelCapabilityEditor.allowMasksInImageEditingRequests")} supported={profile.references.maskSupported} disabled={disabled} onChange={(maskSupported) => updateReferences({ maskSupported })} />
                    </ReferenceCard>
                    <ReferenceCard title={translate("shared.modelCapabilityEditor.generalLimits")} description={translate("shared.modelCapabilityEditor.basicConstraintsSharedByAllImageRequests")}>
                        <NumberField label={translate("shared.modelCapabilityEditor.maximumPromptCharacters")} value={profile.references.promptMaxChars} min={1} disabled={disabled} onChange={(promptMaxChars) => updateReferences({ promptMaxChars: promptMaxChars || 1 })} />
                    </ReferenceCard>
                </div>
            </div>
        );
    }

    if (section === "protocol") {
        return (
            <div className="admin-capability-protocol-editor admin-image-protocol-editor">
                <div className="admin-capability-protocol-grid admin-image-protocol-grid">
                    <ProtocolParameterCard step="01" title={translate("shared.modelCapabilityEditor.sizeParameters")} description={translate("shared.modelCapabilityEditor.setAvailableAspectRatiosForEachResolutionBySelectingOr")} className="admin-image-size-card">
                        <div className="admin-image-size-intro">
                            <SegmentedControl
                                block
                                disabled={disabled}
                                value={profile.size.parameter}
                                options={[
                                    { label: translate("shared.modelCapabilityEditor.doNotSend"), value: "none" },
                                    { label: "size", value: "size" },
                                    { label: "aspect_ratio", value: "aspect_ratio" },
                                ]}
                                onChange={(value) => {
                                    const parameter = value as ImageCapabilityConfig["size"]["parameter"];
                                    updateSize(
                                        parameter === "none"
                                            ? { parameter, values: [], presets: undefined, default: "auto", allowCustom: false }
                                            : imageSizeConfigWithPresets({ ...profile, size: { ...profile.size, parameter } }, imageSizePresets(profile)),
                                    );
                                }}
                            />
                            <ImageSizeHelp />
                        </div>
                        {profile.size.parameter !== "none" ? (
                            <>
                                <ImageSizePresetsEditor profile={profile} disabled={disabled} onChange={updateSize} />
                                <ParameterField label={translate("shared.modelCapabilityEditor.allowCustomValues")} description={translate("shared.modelCapabilityEditor.allowSizesOutsideTheSupportedValues")} supported={profile.size.allowCustom} disabled={disabled} onChange={(allowCustom) => updateSize({ allowCustom })} />
                            </>
                        ) : null}
                    </ProtocolParameterCard>
                    <ProtocolParameterCard step="02" title={translate("shared.modelCapabilityEditor.outputCount")} description={translate("shared.modelCapabilityEditor.setTheNumberOfImagesGeneratedPerRequest")}>
                        <NumberField label={translate("shared.modelCapabilityEditor.imagesPerGeneration")} value={profile.maxOutputs} min={1} disabled={disabled} onChange={(maxOutputs) => update({ maxOutputs: maxOutputs || 1 })} />
                    </ProtocolParameterCard>
                    <ProtocolParameterCard step="03" title={translate("shared.modelCapabilityEditor.optionalParameters")} description={translate("shared.modelCapabilityEditor.qualityBackgroundAndResponseFormatSettings")}>
                        <ParameterField label={translate("shared.modelCapabilityEditor.imageQuality")} description={translate("shared.modelCapabilityEditor.sendTheQualityParameter")} supported={profile.quality.supported} disabled={disabled} onChange={(supported) => updateQuality({ supported })} />
                        {profile.quality.supported ? (
                            <div className="admin-capability-spec-grid">
                                <Field label={translate("shared.modelCapabilityEditor.supportedQualityValues")}>
                                    <Select
                                        mode="tags"
                                        className="admin-capability-tags w-full"
                                        disabled={disabled}
                                        value={profile.quality.values}
                                        tokenSeparators={[","]}
                                        placeholder={translate("shared.modelCapabilityEditor.forExampleAutoLowMediumHigh1k2k4k")}
                                        onChange={(values) => updateQuality({ values, default: values.includes(profile.quality.default) ? profile.quality.default : values[0] || "auto" })}
                                    />
                                </Field>
                                <Field label={translate("shared.modelCapabilityEditor.defaultQuality")}>
                                    <Select
                                        className="w-full"
                                        disabled={disabled}
                                        value={profile.quality.default}
                                        options={profile.quality.values.map((item) => ({ label: item, value: item }))}
                                        onChange={(defaultValue) => updateQuality({ default: defaultValue })}
                                    />
                                </Field>
                            </div>
                        ) : null}
                        <BooleanField label={translate("shared.modelCapabilityEditor.transparentBackground")} value={profile.transparentBackground} disabled={disabled} onChange={(transparentBackground) => update({ transparentBackground })} />
                        <ImageResponseFormatEditor value={profile.responseFormat} disabled={disabled} onChange={(responseFormat) => update({ responseFormat })} />
                        <ParameterField label="output_format" description={translate("shared.modelCapabilityEditor.sendPNGOutputFormat")} supported={profile.outputFormat.supported} disabled={disabled} onChange={(supported) => update({ outputFormat: { supported } })} />
                    </ProtocolParameterCard>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-capability-editor space-y-3 rounded-md bg-muted/10 p-3">
            <div className="admin-capability-editor-heading flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="text-sm font-medium">{translate("shared.modelCapabilityEditor.imageCapabilityParameters")}</div>
                    <div className="mt-0.5 text-[var(--fs-tiny)] text-foreground/48">{translate("shared.modelCapabilityEditor.bothTheGenerationUIAndBackendRequestsClampParametersTo")}</div>
                </div>
                <span className="text-[var(--fs-tiny)] text-foreground/40">{translate("shared.modelCapabilityEditor.appliesToTheCurrentModelOnly")}</span>
            </div>

            <CapabilityGroup title={translate("account.feedback.image")} description={translate("shared.modelCapabilityEditor.referenceImageMaskAndImageInputConstraints")}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField label={translate("shared.modelCapabilityEditor.maxReferenceImages")} value={profile.references.maxImages} min={0} disabled={disabled} onChange={(maxImages) => updateReferences({ maxImages: maxImages || 0 })} />
                    <NumberField label={translate("shared.modelCapabilityEditor.maxImageSizeMB")} value={bytesToMB(profile.references.maxImageBytes)} min={0} disabled={disabled} onChange={(maxImageBytes) => updateReferences({ maxImageBytes: mbToBytes(maxImageBytes) })} />
                </div>
                <ParameterField label={translate("shared.modelCapabilityEditor.maskEditing")} description={translate("shared.modelCapabilityEditor.allowCallingTheImageEditingAPIWithAMask")} supported={profile.references.maskSupported} disabled={disabled} onChange={(maskSupported) => updateReferences({ maskSupported })} />
            </CapabilityGroup>

            <CapabilityGroup title={translate("shared.modelCapabilityEditor.outputSpecifications")} description={translate("shared.modelCapabilityEditor.imageCountPerRequestSizeParametersAndDefaults")}>
                <CapabilityBlock title={translate("library.tasks.params.count")}>
                    <NumberField label={translate("shared.modelCapabilityEditor.imagesPerGeneration")} value={profile.maxOutputs} min={1} disabled={disabled} onChange={(maxOutputs) => update({ maxOutputs: maxOutputs || 1 })} />
                </CapabilityBlock>
                <CapabilityBlock title={translate("shared.modelCapabilityEditor.sizeParameters")}>
                    <ImageSizeHelp />
                    <SegmentedControl
                        block
                        disabled={disabled}
                        value={profile.size.parameter}
                        options={[
                            { label: translate("shared.modelCapabilityEditor.doNotSend"), value: "none" },
                            { label: "size", value: "size" },
                            { label: "aspect_ratio", value: "aspect_ratio" },
                        ]}
                        onChange={(value) => {
                            const parameter = value as ImageCapabilityConfig["size"]["parameter"];
                            updateSize(
                                parameter === "none" ? { parameter, values: [], presets: undefined, default: "auto", allowCustom: false } : imageSizeConfigWithPresets({ ...profile, size: { ...profile.size, parameter } }, imageSizePresets(profile)),
                            );
                        }}
                    />
                    {profile.size.parameter !== "none" ? (
                        <>
                            <ImageSizePresetsEditor profile={profile} disabled={disabled} onChange={updateSize} />
                            <ParameterField label={translate("shared.modelCapabilityEditor.allowCustomValues")} description={translate("shared.modelCapabilityEditor.letUsersEnterSizesOutsideTheSupportedValues")} supported={profile.size.allowCustom} disabled={disabled} onChange={(allowCustom) => updateSize({ allowCustom })} />
                        </>
                    ) : null}
                </CapabilityBlock>
            </CapabilityGroup>

            <CapabilityGroup title={translate("shared.modelCapabilityEditor.optionalParameters")} description={translate("shared.modelCapabilityEditor.optionalCapabilitiesSuchAsQualityBackgroundAndResponseFormat")}>
                <ParameterField label={translate("shared.modelCapabilityEditor.imageQuality")} description={translate("shared.modelCapabilityEditor.sendTheQualityParameter")} supported={profile.quality.supported} disabled={disabled} onChange={(supported) => updateQuality({ supported })} />
                {profile.quality.supported ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={translate("shared.modelCapabilityEditor.supportedQualityValues")}>
                            <Select
                                mode="tags"
                                className="admin-capability-tags w-full"
                                disabled={disabled}
                                value={profile.quality.values}
                                tokenSeparators={[","]}
                                placeholder={translate("shared.modelCapabilityEditor.forExampleAutoLowMediumHigh1k2k4k")}
                                onChange={(values) => updateQuality({ values, default: values.includes(profile.quality.default) ? profile.quality.default : values[0] || "auto" })}
                            />
                        </Field>
                        <Field label={translate("shared.modelCapabilityEditor.defaultQuality")}>
                            <Select
                                className="w-full"
                                disabled={disabled}
                                value={profile.quality.default}
                                options={profile.quality.values.map((item) => ({ label: item, value: item }))}
                                onChange={(defaultValue) => updateQuality({ default: defaultValue })}
                            />
                        </Field>
                    </div>
                ) : null}
                <BooleanField label={translate("shared.modelCapabilityEditor.transparentBackground")} value={profile.transparentBackground} disabled={disabled} onChange={(transparentBackground) => update({ transparentBackground })} />
                <div className="grid gap-3 sm:grid-cols-2">
                    <ImageResponseFormatEditor value={profile.responseFormat} disabled={disabled} onChange={(responseFormat) => update({ responseFormat })} />
                    <ParameterField label="output_format" description={translate("shared.modelCapabilityEditor.sendPNGOutputFormat")} supported={profile.outputFormat.supported} disabled={disabled} onChange={(supported) => update({ outputFormat: { supported } })} />
                </div>
            </CapabilityGroup>

            <CapabilityGroup title={translate("shared.modelCapabilityEditor.generalLimits")} description={translate("shared.modelCapabilityEditor.basicConstraintsSharedByAllImageRequests")}>
                <NumberField label={translate("shared.modelCapabilityEditor.maximumPromptCharacters")} value={profile.references.promptMaxChars} min={1} disabled={disabled} onChange={(promptMaxChars) => updateReferences({ promptMaxChars: promptMaxChars || 1 })} />
            </CapabilityGroup>
        </div>
    );
}

const thinkingModeOptions: Array<{ label: string; value: ThinkingMode }> = [
    { label: translate("shared.modelCapabilityEditor.unsupported"), value: "none" },
    { label: translate("shared.modelCapabilityEditor.toggle"), value: "toggle" },
    { label: translate("shared.modelCapabilityEditor.levels"), value: "levels" },
    { label: translate("shared.modelCapabilityEditor.thinkingRequired"), value: "always" },
];

const thinkingSwitchOptions: Array<{ label: string; value: ThinkingSwitchKind }> = [
    { label: translate("shared.modelCapabilityEditor.alwaysEnabledOmitToggle"), value: "none" },
    { label: translate("shared.modelCapabilityEditor.omitThinkingFieldsWhenDisabled"), value: "omit" },
    { label: "effort = none", value: "effort-none" },
    { label: "enable_thinking = true / false", value: "enable-flag" },
    { label: translate("shared.modelCapabilityEditor.thinkingTypeEnabledValueDisabled"), value: "thinking-type" },
    { label: translate("shared.modelCapabilityEditor.budget0"), value: "budget-zero" },
];
const thinkingIntensityOptions: Array<{ label: string; value: ThinkingIntensityKind }> = [
    { label: translate("shared.modelCapabilityEditor.sendToggleOnlyOmitEffort"), value: "none" },
    { label: translate("shared.modelCapabilityEditor.effortEnum"), value: "effort" },
    { label: translate("shared.modelCapabilityEditor.tokenBudget"), value: "budget" },
    { label: "Gemini thinkingLevel", value: "gemini-level" },
    { label: translate("shared.modelCapabilityEditor.modelNameSuffix"), value: "model-suffix" },
];
const thinkingIntensityFields = {
    effort: ["reasoning_effort", "reasoning.effort", "output_config.effort"],
    budget: ["thinking_budget", "reasoning.max_tokens", "thinking.budget_tokens", "generationConfig.thinkingConfig.thinkingBudget"],
};

// 预设只是起点；管理员可按真实型号修改档位、开关、上游取值和预算。
// 保存时后端按接口格式校验，预设展开后的完整配置随模型保存。
function TextThinkingEditor({ value, disabled, onChange }: { value?: TextThinkingConfig; disabled: boolean; onChange: (value: TextThinkingConfig | undefined) => void }) {
    const preset = THINKING_PRESETS.find((item) => item.id === value?.preset);
    const levels = value ? thinkingLevelsFor(value) : [];
    const enabledLevels = value?.mode === "always" ? THINKING_LEVELS.filter((level) => level !== "off") : THINKING_LEVELS;
    const setLevels = (next: ThinkingLevel[]) => {
        if (!value) return;
        onChange(withThinkingLevels(value, next));
    };
    return (
        <CapabilityGroup title={translate("shared.modelCapabilityEditor.thinkingLevel")} description={translate("shared.modelCapabilityEditor.whenUnconfiguredKeepThePreviousToggleBehaviorEnabledStandardLevel")}>
            <Field label={translate("canvasB.nineGrid.presets")}>
                <Select
                    className="w-full"
                    allowClear
                    placeholder={translate("shared.modelCapabilityEditor.unconfiguredKeepPreviousBehavior")}
                    disabled={disabled}
                    value={value?.preset || (value ? "custom" : undefined)}
                    options={[...THINKING_PRESETS.map((item) => ({ label: item.label, value: item.id })), { label: translate("account.settings.models.scopeCustom"), value: "custom" }]}
                    onChange={(id?: string) =>
                        onChange(!id ? undefined : id === "custom" ? { ...(value || { mode: "levels", levels: ["off", "low", "medium", "high"], switch: { kind: "omit" }, intensity: { kind: "effort" } }), preset: undefined } : thinkingPresetConfig(id))
                    }
                />
            </Field>
            {preset ? <p className="text-[var(--fs-tiny)] leading-5 text-foreground/45">{preset.hint}</p> : null}
            {value ? (
                <>
                    <Field label={translate("shared.modelCapabilityEditor.thinkingMode")}>
                        <SegmentedControl
                            block
                            disabled={disabled}
                            value={value.mode}
                            options={thinkingModeOptions}
                            onChange={(mode) => {
                                const next = withThinkingLevels(value, mode === "always" ? levels.filter((level) => level !== "off") : levels);
                                onChange({ ...next, mode: mode as ThinkingMode, switch: mode === "always" && next.switch.kind === "omit" ? { kind: "none" } : next.switch });
                            }}
                        />
                    </Field>
                    {value.mode !== "none" ? (
                        <>
                            <Field label={translate("shared.modelCapabilityEditor.supportedLevels")}>
                                <Select
                                    mode="multiple"
                                    className="w-full"
                                    disabled={disabled}
                                    value={levels}
                                    options={enabledLevels.map((level) => ({ label: THINKING_LEVEL_LABELS[level], value: level }))}
                                    onChange={(next: ThinkingLevel[]) => setLevels(next)}
                                />
                            </Field>
                            <Field label={translate("shared.modelCapabilityEditor.defaultLevel")}>
                                <Select
                                    className="w-full"
                                    disabled={disabled}
                                    value={value.default || ""}
                                    options={[{ label: translate("shared.modelCapabilityEditor.omitUseProviderDefault"), value: "" }, ...levels.map((level) => ({ label: THINKING_LEVEL_LABELS[level], value: level }))]}
                                    onChange={(next: ThinkingLevel | "") => onChange({ ...value, default: next })}
                                />
                            </Field>
                            <details className="space-y-3">
                                <summary className="cursor-pointer text-xs text-foreground/60">{translate("shared.modelCapabilityEditor.advancedProtocolMapping")}</summary>
                                <p className="text-[var(--fs-tiny)] leading-5 text-foreground/45">{translate("shared.modelCapabilityEditor.configureTheProviderSActualCapabilitiesProtocolFieldsAreValidated")}</p>
                                <Field label={translate("shared.modelCapabilityEditor.toggleFormat")}>
                                    <Select className="w-full" disabled={disabled} value={value.switch.kind} options={thinkingSwitchOptions} onChange={(kind: ThinkingSwitchKind) => onChange({ ...value, switch: { kind } })} />
                                </Field>
                                {value.switch.kind === "thinking-type" ? (
                                    <Field label={translate("shared.modelCapabilityEditor.thinkingTypeWhenEnabled")}>
                                        <Select
                                            className="w-full"
                                            disabled={disabled}
                                            value={value.switch.onValue || "enabled"}
                                            options={["enabled", "auto", "adaptive"].map((item) => ({ label: item, value: item }))}
                                            onChange={(onValue: string) => onChange({ ...value, switch: { ...value.switch, onValue } })}
                                        />
                                    </Field>
                                ) : null}
                                <Field label={translate("shared.modelCapabilityEditor.effortFormat")}>
                                    <Select className="w-full" disabled={disabled} value={value.intensity.kind} options={thinkingIntensityOptions} onChange={(kind: ThinkingIntensityKind) => onChange({ ...value, intensity: { kind } })} />
                                </Field>
                                {value.intensity.kind === "effort" || value.intensity.kind === "budget" ? (
                                    <Field label={translate("shared.modelCapabilityEditor.targetField")}>
                                        <Select
                                            className="w-full"
                                            disabled={disabled}
                                            value={value.intensity.field || ""}
                                            options={[{ label: translate("shared.modelCapabilityEditor.selectAutomaticallyForTheAPIFormat"), value: "" }, ...thinkingIntensityFields[value.intensity.kind].map((field) => ({ label: field, value: field }))]}
                                            onChange={(field: string) => onChange({ ...value, intensity: { ...value.intensity, field } })}
                                        />
                                    </Field>
                                ) : null}
                                {value.intensity.kind === "none"
                                    ? null
                                    : levels
                                          .filter((level) => level !== "off")
                                          .map((level) => (
                                              <Field key={level} label={`${THINKING_LEVEL_LABELS[level]} · ${value.intensity.kind === "budget" ? translate("shared.modelCapabilityEditor.tokenBudget") : value.intensity.kind === "model-suffix" ? translate("shared.modelCapabilityEditor.modelNameSuffix") : translate("shared.modelCapabilityEditor.providerValue")}`}>
                                                  {value.intensity.kind === "budget" ? (
                                                      <InputNumber
                                                          className="w-full"
                                                          disabled={disabled}
                                                          min={1024}
                                                          precision={0}
                                                          placeholder={translate("shared.modelCapabilityEditor.leaveBlankToCalculateFromTheCurrentOutputLimit")}
                                                          value={value.intensity.budgets?.[level]}
                                                          onChange={(budget: number | null) => {
                                                              const budgets = { ...value.intensity.budgets };
                                                              if (budget === null) delete budgets[level];
                                                              else budgets[level] = budget;
                                                              onChange({ ...value, intensity: { ...value.intensity, budgets } });
                                                          }}
                                                      />
                                                  ) : (
                                                      <Input
                                                          disabled={disabled}
                                                          placeholder={value.intensity.kind === "model-suffix" ? translate("shared.modelCapabilityEditor.forExampleThinkingRequired") : level}
                                                          value={value.intensity.values?.[level] || ""}
                                                          onChange={(event) => {
                                                              const values = { ...value.intensity.values };
                                                              const wireValue = event.target.value.trim();
                                                              if (wireValue) values[level] = wireValue;
                                                              else delete values[level];
                                                              onChange({ ...value, intensity: { ...value.intensity, values } });
                                                          }}
                                                      />
                                                  )}
                                              </Field>
                                          ))}
                            </details>
                        </>
                    ) : null}
                </>
            ) : null}
        </CapabilityGroup>
    );
}

function CapabilityGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <details open className="admin-capability-group rounded-lg bg-muted/10 p-3">
            <summary className="cursor-pointer list-none pr-5">
                <span className="admin-capability-group-title block text-xs font-semibold text-foreground/70">{title}</span>
                {description ? <span className="admin-capability-group-description mt-0.5 block text-[var(--fs-tiny)] font-normal text-foreground/45">{description}</span> : null}
            </summary>
            <div className="mt-3 space-y-2">{children}</div>
        </details>
    );
}

function CapabilityBlock({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="admin-capability-block">
            <div className="admin-capability-block-title">{title}</div>
            <div className="space-y-2">{children}</div>
        </section>
    );
}

function ReferenceCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
    return (
        <section className="admin-capability-reference-card">
            <header className="admin-capability-reference-card-heading">
                <h3>{title}</h3>
                <p>{description}</p>
            </header>
            <div className="admin-capability-reference-fields">{children}</div>
        </section>
    );
}

function ProtocolParameterCard({ step, title, description, children, className = "" }: { step: string; title: string; description: string; children: ReactNode; className?: string }) {
    return (
        <section className={`admin-capability-protocol-card ${className}`}>
            <header className="admin-capability-protocol-card-heading">
                <span>{step}</span>
                <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>
            </header>
            <div className="admin-capability-protocol-fields">{children}</div>
        </section>
    );
}

function AutoDLScreenSpecFields({ profile, workflow, disabled, onChange }: { profile: VideoCapabilityConfig; workflow?: ModelProtocolWorkflow; disabled: boolean; onChange: (profile: VideoCapabilityConfig) => void }) {
    if (!profile.fixedScreenSpec?.resolutions.length) {
        return <p className="text-[var(--fs-label)] text-foreground/60">{translate("shared.modelCapabilityEditor.autoDLResolutionPresetsCouldNotBeLoadedRefreshToReload")}</p>;
    }
    // 预设来自插件；管理员可输入上游工作流支持的其他分辨率标签。
    const options = cleanVideoScreenSpecValues([...profile.fixedScreenSpec.resolutions, ...profile.resolutions]);
    return (
        <div className="admin-capability-spec-grid">
            <Field label={translate("shared.modelCapabilityEditor.outputResolution")}>
                <Select
                    ariaLabel={translate("shared.modelCapabilityEditor.outputResolution")}
                    mode="tags"
                    className="admin-capability-tags w-full"
                    disabled={disabled}
                    value={profile.resolutions}
                    placeholder={translate("shared.modelCapabilityEditor.selectAPresetOrEnterAResolutionAndPressEnter")}
                    tokenSeparators={[",", "，"]}
                    options={options.map((item) => ({ label: item, value: item }))}
                    onChange={(values: string[]) => {
                        const resolutions = cleanVideoScreenSpecValues(values);
                        const defaultResolution = resolutions.includes(profile.defaultResolution) ? profile.defaultResolution : resolutions[0] || "";
                        onChange(updateWorkflowVideoScreenSpec(profile, workflow, { resolutions, defaultResolution }));
                    }}
                />
            </Field>
            <Field label={translate("shared.modelCapabilityEditor.defaultResolution")}>
                <Select
                    ariaLabel={translate("shared.modelCapabilityEditor.defaultResolution")}
                    className="w-full"
                    disabled={disabled}
                    value={profile.defaultResolution || undefined}
                    options={profile.resolutions.map((item) => ({ label: item, value: item }))}
                    onChange={(defaultResolution: string) => onChange(updateWorkflowVideoScreenSpec(profile, workflow, { defaultResolution }))}
                />
            </Field>
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block min-w-0">
            <span className="mb-1 block text-[var(--fs-tiny)] text-foreground/48">{label}</span>
            {children}
        </label>
    );
}

function NumberField({ label, value, min, max, disabled, onChange }: { label: string; value?: number; min: number; max?: number; disabled: boolean; onChange: (value: number | null) => void }) {
    return (
        <label className="admin-capability-number-field block min-w-0">
            <span className="admin-capability-field-label mb-2 block text-xs text-foreground/62">{label}</span>
            <InputNumber className="w-full" disabled={disabled} min={min} max={max} precision={0} value={value} onChange={onChange} />
        </label>
    );
}

function BooleanField({ label, value, disabled, onChange }: { label: string; value: { supported: boolean; default: boolean }; disabled: boolean; onChange: (value: { supported: boolean; default: boolean }) => void }) {
    return (
        <div className="admin-capability-boolean-field flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
            <div className="min-w-0">
                <div className="text-xs font-medium">{label}</div>
                <div className="text-[var(--fs-tiny)] text-foreground/45">{translate("shared.modelCapabilityEditor.supportedParametersAndDefaults")}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <label className="grid justify-items-center gap-1 text-[var(--fs-tiny)] text-foreground/45">
                    <span>{translate("shared.modelCapabilityEditor.supported")}</span>
                    <Switch aria-label={translate("shared.modelCapabilityEditor.supports", { v0: String(label) })} size="sm" disabled={disabled} checked={value.supported} onChange={(supported) => onChange({ ...value, supported })} />
                </label>
                <label className="grid justify-items-center gap-1 text-[var(--fs-tiny)] text-foreground/45">
                    <span>{translate("canvasB.common.default")}</span>
                    <Switch aria-label={translate("shared.modelCapabilityEditor.default", { v0: String(label) })} size="sm" disabled={disabled || !value.supported} checked={value.default} onChange={(defaultValue) => onChange({ ...value, default: defaultValue })} />
                </label>
            </div>
        </div>
    );
}

function ParameterField({ label, description, supported, disabled, onChange }: { label: string; description: string; supported: boolean; disabled: boolean; onChange: (supported: boolean) => void }) {
    return (
        <div className="admin-capability-parameter-field flex min-h-12 items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
            <div className="min-w-0">
                <div className="break-all text-xs font-medium">{label}</div>
                <div className="mt-0.5 text-[var(--fs-tiny)] leading-5 text-foreground/45">{description}</div>
            </div>
            <label className="grid shrink-0 justify-items-center gap-1 text-[var(--fs-tiny)] text-foreground/45">
                <span>{translate("shared.modelCapabilityEditor.supported")}</span>
                <Switch aria-label={translate("shared.modelCapabilityEditor.supports", { v0: String(label) })} size="sm" disabled={disabled} checked={supported} onChange={onChange} />
            </label>
        </div>
    );
}

function ImageResponseFormatEditor({ value, disabled, onChange }: { value: ImageCapabilityConfig["responseFormat"]; disabled: boolean; onChange: (value: ImageCapabilityConfig["responseFormat"]) => void }) {
    const defaultValue: ImageResponseFormat = value.default || "auto";
    return (
        <div className="admin-image-response-format-editor space-y-2">
            <ParameterField label="response_format" description={translate("shared.modelCapabilityEditor.sendTheResponseFormatToTheProviderWhenDisabledLet")} supported={value.supported} disabled={disabled} onChange={(supported) => onChange({ supported, default: supported ? defaultValue : "auto" })} />
            {value.supported ? (
                <Field label={translate("shared.modelCapabilityEditor.defaultResponseFormat")}>
                    <SegmentedControl
                        block
                        disabled={disabled}
                        value={defaultValue}
                        options={[
                            { label: translate("account.layout.oss.auto"), value: "auto" },
                            { label: "Base64", value: "b64_json" },
                            { label: "URL", value: "url" },
                        ]}
                        onChange={(next) => onChange({ supported: true, default: next as ImageResponseFormat })}
                    />
                </Field>
            ) : null}
        </div>
    );
}

function bytesToMB(value: number) {
    return value ? Math.round((value / (1024 * 1024)) * 10) / 10 : 0;
}

function mbToBytes(value: number | null) {
    return Math.max(0, Math.round(Number(value || 0) * 1024 * 1024));
}

function parseIntegerList(value: string) {
    return Array.from(
        new Set(
            value
                .split(",")
                .map((item) => Number(item.trim()))
                .filter((item) => Number.isInteger(item) && item > 0),
        ),
    ).sort((left, right) => left - right);
}
