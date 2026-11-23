import { useId } from "react";
import { Input, InputNumber, Radio } from "antd";
import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { audioFormatOptionsForConfig, audioSpeedLabel, audioVoiceOptionsForConfig, isDoubaoAudioConfig, normalizeAudioFormatForConfig, normalizeAudioSpeedValue, normalizeAudioVoiceForConfig } from "@/lib/audio-generation";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasAudioSettingKey } from "@/components/canvas/canvas-audio-settings-popover";
import { translate } from "@/i18n";


type AudioSettingsPanelProps = { config: AiConfig; onConfigChange: (key: CanvasAudioSettingKey, value: string) => void; theme: CanvasTheme; showTitle?: boolean; className?: string };

export function AudioSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[var(--panel-width-compact)] space-y-4" }: AudioSettingsPanelProps) {
    const listId = useId();
    const doubao = isDoubaoAudioConfig(config);
    const voice = normalizeAudioVoiceForConfig(config, config.audioVoice);
    const voices = audioVoiceOptionsForConfig(config);
    const currentVoice = voices.some((item) => item.value === voice) ? voices : [{ value: voice, label: voice || translate("canvasA.audioSettings.noVoice") }, ...voices];
    const formats = audioFormatOptionsForConfig(config);
    const format = normalizeAudioFormatForConfig(config, config.audioFormat);
    const speed = normalizeAudioSpeedValue(config.audioSpeed);
    const selectVoice = (value: string) => onConfigChange("audioVoice", value);
    return (
        <ImageSettingsTheme theme={theme}>
            <section className={className} style={{ color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} aria-label={translate("shared.audioSettingsPanel.audioGenerationSettings")}>
                {showTitle ? <h3 className="text-base font-semibold">{translate("canvasA.audioSettings.label")}</h3> : null}
                <fieldset className="space-y-2">
                    <legend className="mb-2 text-xs" style={{ color: theme.node.muted }}>
                        {translate("library.tasks.params.voice")}
                    </legend>
                    {doubao ? (
                        <>
                            <p className="text-xs leading-5" style={{ color: theme.node.muted }}>
                                {translate("shared.audioSettingsPanel.generateFromThePromptWithoutReferenceMediaConnectUpTo")}
                            </p>
                            <Input aria-label={translate("shared.audioSettingsPanel.doubaoVoiceID")} value={voice} allowClear placeholder={translate("shared.audioSettingsPanel.leaveBlankToUseThePromptOrEnterAnAvailable")} onChange={(event) => selectVoice(event.target.value.trim())} />
                            <p className="text-xs leading-5" style={{ color: theme.node.muted }}>
                                {translate("shared.audioSettingsPanel.enterAVoiceOrClonedVoiceIDEnabledForThis")}
                            </p>
                        </>
                    ) : (
                        <>
                            <Input aria-label={translate("shared.audioSettingsPanel.providerVoiceID")} value={config.audioVoice || ""} list={listId} placeholder={translate("shared.audioSettingsPanel.enterAProviderVoiceID")} onChange={(event) => selectVoice(event.target.value)} />
                            <datalist id={listId}>
                                {currentVoice.map((item) => (
                                    <option value={item.value} key={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </datalist>
                            <Radio.Group aria-label={translate("shared.audioSettingsPanel.commonVoices")} value={voice} onChange={(event) => selectVoice(event.target.value)} options={currentVoice} className="flex flex-wrap gap-2" />
                        </>
                    )}
                </fieldset>
                <fieldset>
                    <legend className="mb-2 text-xs" style={{ color: theme.node.muted }}>
                        {translate("library.tasks.params.audioFormat")}
                    </legend>
                    <Radio.Group aria-label={translate("library.tasks.params.audioFormat")} value={format} options={formats} onChange={(event) => onConfigChange("audioFormat", event.target.value)} className="flex flex-wrap gap-2" />
                </fieldset>
                <fieldset className="space-y-2">
                    <legend className="mb-2 text-xs" style={{ color: theme.node.muted }}>
                        {translate("shared.audioSettingsPanel.speed")}
                    </legend>
                    <Radio.Group aria-label={translate("shared.audioSettingsPanel.commonSpeakingRates")} value={speed} options={["0.75", "1", "1.25", "1.5"].map((value) => ({ value, label: audioSpeedLabel(value) }))} onChange={(event) => onConfigChange("audioSpeed", event.target.value)} />
                    <InputNumber
                        aria-label={translate("shared.audioSettingsPanel.customSpeakingRate")}
                        min={0.25}
                        max={4}
                        step={0.05}
                        value={Number(speed)}
                        className="w-full"
                        onChange={(value) => {
                            if (value !== null) onConfigChange("audioSpeed", normalizeAudioSpeedValue(String(value)));
                        }}
                    />
                    {doubao ? <p className="text-xs leading-5" style={{ color: theme.node.muted }}>{translate("shared.audioSettingsPanel.item1xIsTheNormalSpeakingRateARestrainedOrQuiet")}</p> : null}
                </fieldset>
                {doubao ? (
                    <details className="space-y-2 text-xs" style={{ color: theme.node.muted }}>
                        <summary className="cursor-pointer">{translate("shared.audioSettingsPanel.writingDoubaoPrompts")}</summary>
                        <p className="leading-5">{translate("shared.audioSettingsPanel.enterVoiceInstructionsAndDialogueInTheNodeSPrompt")}</p>
                        <p className="leading-5">{translate("shared.audioSettingsPanel.suggestedStructureDeliveryEmotionAndPacingExactDialogueUseA")}</p>
                        <p className="leading-5">{translate("shared.audioSettingsPanel.forExampleSpeakInANaturalFriendlyToneAtA")}</p>
                        <p className="leading-5">{translate("shared.audioSettingsPanel.audioReferencesAfterConnectingMediaUseAudio1Audio2AndAudio3")}</p>
                        <p className="leading-5">{translate("shared.audioSettingsPanel.imageReferencesConnectAtMost1ImageAndSpecifyThe")}</p>
                        <p className="leading-5">{translate("shared.audioSettingsPanel.theCurrentDoubaoProtocolDoesNotSendSeparateVoiceInstructions")}</p>
                    </details>
                ) : (
                    <label className="flex flex-col gap-2 text-xs" style={{ color: theme.node.muted }}>
                        {translate("shared.audioSettingsPanel.voiceCommand")}
                        <Input.TextArea aria-label={translate("shared.audioSettingsPanel.voiceCommand")} rows={3} value={config.audioInstructions || ""} placeholder={translate("shared.audioSettingsPanel.forExampleANaturalWarmNarration")} onChange={(event) => onConfigChange("audioInstructions", event.target.value)} />
                    </label>
                )}
            </section>
        </ImageSettingsTheme>
    );
}
