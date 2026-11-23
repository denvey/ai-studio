import { Button, Select } from "antd";
import { TriangleAlert } from "lucide-react";

import { dramaChoiceKey, dramaVideoResolutionIssue } from "@/lib/drama/model-choice";
import { formatVideoResolutionLabel, videoResolutionComparisonKey } from "@/lib/video-generation-options";
import type { DramaAssetSettings, DramaCastKind, DramaModelChoice, DramaModelOption, DramaModelOverride, DramaModels, DramaSkillRef, DramaTextThinking } from "@/services/api/drama";
import { THINKING_REQUEST_OPTIONS, type ThinkingRequest } from "@/lib/text-thinking";

import { DramaModelPicker, useDramaModelCatalog } from "./drama-model-picker";
import { PromptSkillField, type DramaSkillStep } from "./prompt-skill";
import { translate } from "@/i18n";

// 制作步骤的模型与技能：每个文字步骤一行（文本模型 + 写作技能），每类参考图一行（图片模型 + 分辨率）。
// 单独指定的模型为空时沿用“制作模型”里的默认模型，行内显示实际会用哪个。

const TEXT_STEPS: Array<{ step: DramaSkillStep; override: DramaModelOverride; label: string; hint: string }> = [
    { step: "bible", override: "bibleText", label: translate("drama.stepSettings.assetExtraction"), hint: translate("drama.stepSettings.extractCharactersPropsScenesAndProductionWideVisualRulesFrom") },
    { step: "script", override: "scriptText", label: translate("drama.stepSettings.storyboardBreakdown"), hint: translate("drama.stepSettings.adaptEachEpisodeIntoAShotListTheLongestAnd") },
    { step: "prompt", override: "promptText", label: translate("drama.stepSettings.videoPrompt"), hint: translate("drama.stepSettings.writeAFullVideoPromptForEachStorySegmentFrom") },
];

const IMAGE_KINDS: Array<{ kind: DramaCastKind; override: DramaModelOverride; resolution: "resolution" | "propResolution" | "sceneResolution"; label: string; hint: string }> = [
    { kind: "character", override: "characterImage", resolution: "resolution", label: translate("account.welcome.chapters.world.label"), hint: translate("drama.stepSettings.aspectRatioFollowsTheReferenceScheme") },
    { kind: "prop", override: "propImage", resolution: "propResolution", label: translate("drama.stepSettings.props"), hint: translate("drama.stepSettings.item169SingleItemView") },
    { kind: "scene", override: "sceneImage", resolution: "sceneResolution", label: translate("drama.stepSettings.scene"), hint: translate("drama.stepSettings.item169WideViewOfTheSpace") },
];

export type DramaStepSkills = { bible?: DramaSkillRef; script?: DramaSkillRef; prompt?: DramaSkillRef };
type DramaTextStep = keyof NonNullable<DramaTextThinking>;

const SKILL_FIELD: Record<DramaSkillStep, keyof DramaStepSkills> = { bible: "bible", script: "script", prompt: "prompt" };

function overrideOf(models: Partial<DramaModels> | undefined, key: DramaModelOverride) {
    const choice = models?.[key];
    return dramaChoiceKey(choice) ? choice : undefined;
}

function tierLabel(tier: string) {
    return tier.toUpperCase();
}

/** 一行里的模型选择：未单独指定时占位显示默认模型，指定后可一键恢复跟随默认。 */
function OverridePicker({ capability, value, fallback, onChange }: { capability: "text" | "image"; value?: DramaModelChoice; fallback?: DramaModelChoice; onChange: (choice?: DramaModelChoice) => void }) {
    return (
        <div className="drama-step-model">
            <DramaModelPicker capability={capability} size="sm" showPrice={false} value={value} placeholder={translate("drama.stepSettings.useDefault", { v0: String(fallback?.label ? ` · ${fallback.label}` : "") })} onChange={onChange} />
            {value ? (
                <Button size="small" type="text" onClick={() => onChange(undefined)}>
                    {translate("drama.stepSettings.useDefault2")}
                </Button>
            ) : null}
        </div>
    );
}

/** 文字步骤：资产提取、分镜拆分、视频提示词各自的文本模型与写作技能。 */
export function DramaTextSteps({
    models,
    onModelsChange,
    skills,
    onSkillChange,
    textThinking,
    onThinkingChange,
}: {
    models?: Partial<DramaModels>;
    onModelsChange: (patch: Partial<DramaModels>) => void;
    skills: DramaStepSkills;
    onSkillChange: (step: DramaSkillStep, value?: DramaSkillRef) => void;
    textThinking: DramaTextThinking;
    onThinkingChange: (step: DramaTextStep, value: ThinkingRequest) => void;
}) {
    return (
        <div className="drama-steps" role="list" aria-label={translate("drama.stepSettings.textStages")}>
            <div className="drama-step-row" role="listitem">
                <div className="drama-step-label">
                    <strong>{translate("drama.stepSettings.episodePlanning")}</strong>
                    <small>{translate("drama.stepSettings.organizeChaptersIntoConsecutiveEpisodesDuringAutomaticNovelAdaptation")}</small>
                </div>
                <div className="drama-step-field">
                    <span className="drama-step-caption">{translate("drama.stepSettings.textModel")}</span>
                    <small className="drama-step-note">
                        {translate("drama.stepSettings.useProductionModel")}
                        {models?.text?.label ? ` · ${models.text.label}` : ""}
                    </small>
                </div>
                <div className="drama-step-field">
                    <span className="drama-step-caption">{translate("nav.sidebar.skills")}</span>
                    <small className="drama-step-note">{translate("drama.stepSettings.builtInEpisodePlanningRules")}</small>
                </div>
                <div className="drama-step-field">
                    <span className="drama-step-caption">{translate("drama.stepSettings.thinkingLevel")}</span>
                    <Select aria-label={translate("drama.stepSettings.episodePlanningThinkingLevel")} value={textThinking.plan || "auto"} options={THINKING_REQUEST_OPTIONS} onChange={(value) => onThinkingChange("plan", value)} />
                </div>
            </div>
            {TEXT_STEPS.map((item) => (
                <div key={item.step} className="drama-step-row" role="listitem">
                    <div className="drama-step-label">
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                    </div>
                    <div className="drama-step-field">
                        <span className="drama-step-caption">{translate("drama.stepSettings.textModel")}</span>
                        <OverridePicker capability="text" value={overrideOf(models, item.override)} fallback={models?.text} onChange={(choice) => onModelsChange({ [item.override]: choice || {} })} />
                    </div>
                    <div className="drama-step-field">
                        <span className="drama-step-caption">{translate("nav.sidebar.skills")}</span>
                        <PromptSkillField compact step={item.step} value={skills[SKILL_FIELD[item.step]]} onChange={(value) => onSkillChange(item.step, value)} />
                    </div>
                    <div className="drama-step-field">
                        <span className="drama-step-caption">{translate("drama.stepSettings.thinkingLevel")}</span>
                        <Select
                            aria-label={translate("drama.stepSettings.thinkingLevel2", { v0: String(item.label) })}
                            value={textThinking[item.step] || "auto"}
                            options={THINKING_REQUEST_OPTIONS}
                            onChange={(value) => onThinkingChange(item.step, value)}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

/** 参考图：角色、道具、场景各自的图片模型与分辨率。分辨率档位取自该类实际使用的图片模型。 */
export function DramaAssetImageModels({
    models,
    onModelsChange,
    assets,
    onAssetsChange,
}: {
    models?: Partial<DramaModels>;
    onModelsChange: (patch: Partial<DramaModels>) => void;
    assets?: DramaAssetSettings;
    onAssetsChange: (assets: DramaAssetSettings) => void;
}) {
    const catalog = useDramaModelCatalog().data;
    const optionFor = (choice?: DramaModelChoice) => catalog?.options.image?.find((option) => dramaChoiceKey(option.choice) === dramaChoiceKey(choice));
    return (
        <div className="drama-steps" role="list" aria-label={translate("drama.stepSettings.referenceImageModelsAndResolutions")}>
            {IMAGE_KINDS.map((item) => {
                const override = overrideOf(models, item.override);
                const option = optionFor(override || models?.image);
                const tiers = option?.imageResolutions || [];
                const value = assets?.[item.resolution] || "";
                return (
                    <div key={item.kind} className="drama-step-row is-image" role="listitem">
                        <div className="drama-step-label">
                            <strong>{item.label}</strong>
                            <small>{item.hint}</small>
                        </div>
                        <div className="drama-step-field">
                            <span className="drama-step-caption">{translate("drama.stepSettings.imageModel")}</span>
                            <OverridePicker capability="image" value={override} fallback={models?.image} onChange={(choice) => onModelsChange({ [item.override]: choice || {} })} />
                        </div>
                        <div className="drama-step-field">
                            <span className="drama-step-caption">{translate("library.tasks.params.resolution")}</span>
                            {!option ? (
                                <small className="drama-step-note">{translate("drama.stepSettings.availableAfterSelectingAnImageModel")}</small>
                            ) : tiers.length ? (
                                <div className="drama-tabs drama-res-tabs" role="radiogroup" aria-label={translate("drama.stepSettings.referenceResolution", { v0: String(item.label) })}>
                                    <button type="button" role="radio" className="drama-tab" aria-checked={!value} disabled={!assets} onClick={() => assets && onAssetsChange({ ...assets, [item.resolution]: undefined })}>
                                        {translate("canvasB.common.default")}
                                        {option.defaultImageResolution ? ` · ${tierLabel(option.defaultImageResolution)}` : ""}
                                    </button>
                                    {tiers.map((tier) => (
                                        <button key={tier} type="button" role="radio" className="drama-tab" aria-checked={value === tier} disabled={!assets} onClick={() => assets && onAssetsChange({ ...assets, [item.resolution]: tier })}>
                                            {tierLabel(tier)}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <small className="drama-step-note">{translate("drama.stepSettings.thisModelHasNoResolutionPresetsAndUsesItsDefault")}</small>
                            )}
                            {value && option && !tiers.includes(value) ? (
                                <p className="drama-step-warn" role="alert">
                                    <TriangleAlert className="size-3.5" />
                                    {translate("drama.stepSettings.thisModelDoesNotSupport")} {tierLabel(value)}
                                    {translate("drama.stepSettings.savingWillBeRejectedChooseAnotherOption")}
                                </p>
                            ) : null}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** 剧情段视频分辨率：取自视频模型声明的档位；“模型默认”不发分辨率，由模型按默认档位出片。 */
export function VideoResolutionField({ option, value, onChange }: { option?: DramaModelOption; value?: string; onChange: (value?: string) => void }) {
    if (!option) {
        return value ? (
            <div className="drama-step-model">
                <small className="drama-step-note">
                    {translate("drama.stepSettings.specified")} {formatVideoResolutionLabel(value)}
                </small>
                <Button size="small" type="text" onClick={() => onChange(undefined)}>
                    {translate("drama.stepSettings.resetToDefault")}
                </Button>
            </div>
        ) : (
            <small className="drama-step-note">{translate("drama.stepSettings.availableAfterSelectingAVideoModel")}</small>
        );
    }
    const values = option.videoResolutions || [];
    const issue = dramaVideoResolutionIssue(option, value);
    if (!values.length && !value) return <small className="drama-step-note">{translate("drama.stepSettings.thisModelHasNoSelectableResolutionsAndUsesItsDefault")}</small>;
    return (
        <div className="drama-step-field">
            <div className="drama-tabs drama-res-tabs" role="radiogroup" aria-label={translate("drama.stepSettings.videoResolution")}>
                <button type="button" role="radio" className="drama-tab" aria-checked={!value} onClick={() => onChange(undefined)}>
                    {translate("canvasB.common.default")}
                    {option.defaultVideoResolution ? ` · ${formatVideoResolutionLabel(option.defaultVideoResolution)}` : ""}
                </button>
                {values.map((item) => (
                    <button key={item} type="button" role="radio" className="drama-tab" aria-checked={Boolean(value) && videoResolutionComparisonKey(value) === videoResolutionComparisonKey(item)} onClick={() => onChange(item)}>
                        {formatVideoResolutionLabel(item)}
                    </button>
                ))}
            </div>
            {issue ? (
                <p className="drama-step-warn" role="alert">
                    <TriangleAlert className="size-3.5" />
                    {translate("drama.stepSettings.currentVideoModel")}
                    {issue}
                    {translate("drama.stepSettings.savingWillBeRejectedChooseAnotherOption")}
                </p>
            ) : (
                <small className="drama-step-note">{translate("drama.stepSettings.higherResolutionsAreClearerAndCostMorePerSegmentOrientation")}</small>
            )}
        </div>
    );
}
