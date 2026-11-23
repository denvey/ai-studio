import { useEffect, useState } from "react";
import { Dropdown, Input, InputNumber, Slider } from "antd";
import { ChevronDown, Film, TriangleAlert } from "lucide-react";

import {
    averageShotSeconds,
    clampEpisodeSeconds,
    DIALOGUE_LIMITS,
    DIALOGUE_PRESETS,
    dialogueRule,
    DIRECTION_LEVEL_MAX,
    DIRECTION_LEVEL_MIN,
    EPISODE_PRESETS,
    formatEpisodeSeconds,
    lineTarget,
    longestLineSeconds,
    MAX_EPISODE_SECONDS,
    MAX_SEGMENT_SECONDS,
    MIN_EPISODE_SECONDS,
    MIN_SEGMENT_SECONDS,
    MIN_TRANSITION_MS,
    normalizeStoryboard,
    parseEpisodeSeconds,
    segmentLimits,
    segmentTargetSeconds,
    shotTarget,
    TRANSITION_LABEL,
    type DialogueRule,
    type SegmentLimits,
} from "@/lib/drama/storyboard";
import type { DramaDialogue, DramaPacing, DramaSegmentMode, DramaStoryboardSettings } from "@/services/api/drama";
import { translate } from "@/i18n";

/** 单集时长：可直接输入“5分钟 / 300 / 2:30”，也可点右侧从常用时长里选。 */
export function EpisodeDurationInput({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
    const [text, setText] = useState(formatEpisodeSeconds(value));
    const [error, setError] = useState("");
    const [open, setOpen] = useState(false);
    useEffect(() => setText(formatEpisodeSeconds(value)), [value]);
    const commit = (raw: string) => {
        const parsed = parseEpisodeSeconds(raw);
        if (parsed === null) {
            setError(translate("drama.storyboardRules.enter905minOr230"));
            setText(formatEpisodeSeconds(value));
            return;
        }
        const seconds = clampEpisodeSeconds(parsed);
        setError(seconds !== parsed ? translate("drama.storyboardRules.episodeDurationAdjustedToTheAllowedRange", { v0: String(formatEpisodeSeconds(MIN_EPISODE_SECONDS)), v1: String(formatEpisodeSeconds(MAX_EPISODE_SECONDS)) }) : "");
        onChange(seconds);
        setText(formatEpisodeSeconds(seconds));
    };
    return (
        <div className="drama-field">
            <Dropdown
                open={open}
                onOpenChange={setOpen}
                trigger={["click"]}
                placement="bottomLeft"
                menu={{
                    selectable: true,
                    selectedKeys: [String(value)],
                    items: EPISODE_PRESETS.map((seconds) => ({
                        key: String(seconds),
                        label: (
                            <span className="drama-duration-option">
                                <span>{formatEpisodeSeconds(seconds)}</span>
                                <small>{seconds} {translate("account.settings.models.unitSecond")}</small>
                            </span>
                        ),
                    })),
                    onClick: ({ key }) => {
                        setOpen(false);
                        setError("");
                        onChange(Number(key));
                    },
                }}
            >
                <Input
                    value={text}
                    placeholder={translate("drama.storyboardRules.eG905Or230")}
                    aria-label={translate("drama.storyboardRules.episodeDuration")}
                    onChange={(event) => {
                        setText(event.target.value);
                        setError("");
                    }}
                    onBlur={() => commit(text)}
                    onPressEnter={(event) => {
                        commit(text);
                        setOpen(false);
                        (event.target as HTMLInputElement).blur();
                    }}
                    suffix={<ChevronDown className={`size-3.5 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />}
                />
            </Dropdown>
            {error ? <small className="drama-field-error">{error}</small> : <small className="drama-field-hint">{translate("drama.storyboardRules.about")} {Math.round((value / 60) * 10) / 10} {translate("drama.storyboardRules.minutesOrTypeADuration")}</small>}
        </div>
    );
}

const SEGMENT_MODES: Array<{ value: DramaSegmentMode; label: string; detail: string }> = [
    { value: "auto", label: translate("drama.storyboardRules.adaptive"), detail: translate("drama.storyboardRules.splitAtSceneChangesAndDramaticTurnsWithinTheVideo") },
    { value: "fixed", label: translate("drama.storyboardRules.fixed"), detail: translate("drama.storyboardRules.useAFixedDurationPerSegmentSplittingAcrossScenesIf") },
    { value: "range", label: translate("drama.storyboardRules.range"), detail: translate("drama.storyboardRules.keepSegmentsWithinTheChosenRangeAndSplitAtScene") },
];

/** 剧情段切法的一句话说明，分镜规则卡与剧本页共用。 */
export function segmentRuleLabel(limits: SegmentLimits) {
    if (limits.mode === "fixed") return translate("drama.storyboardRules.secondsPerSegment", { v0: String(limits.max) });
    if (limits.mode === "range") return translate("drama.storyboardRules.secondsPerSegment2", { v0: String(limits.min), v1: String(limits.max) });
    return limits.max ? translate("drama.storyboardRules.smartSegmentationUpToSecondsPerSegment", { v0: String(limits.max) }) : translate("drama.storyboardRules.smartSegmentation");
}
/** 与后端 production.pacingRules 一致，从快到慢。 */
const PACING: Array<{ value: DramaPacing; label: string; detail: string }> = [
    { value: "rapid", label: translate("drama.storyboardRules.veryFast"), detail: translate("drama.storyboardRules.rapid153SecondShotsWithDenseCutsAt") },
    { value: "fast", label: translate("drama.storyboardRules.fast"), detail: translate("drama.storyboardRules.mostly24SecondShotsWithRapidCutsDuringConflict") },
    { value: "standard", label: translate("library.assets.density.standard"), detail: translate("drama.storyboardRules.mostly25SecondShotsKeyDialogueCanExtendTo") },
    { value: "relaxed", label: translate("drama.storyboardRules.relaxed"), detail: translate("drama.storyboardRules.mostly36SecondShotsEmotionalScenesCanExtendTo") },
    { value: "slow", label: translate("drama.storyboardRules.slow"), detail: translate("drama.storyboardRules.longer48SecondShotsWithAtmosphericCutaways") },
];
/** 具体数值由 dialogueRule 给出，这里只写适用场景。 */
const DIALOGUE: Array<{ value: DramaDialogue; label: string; detail: string }> = [
    { value: "dense", label: translate("drama.storyboardRules.dense"), detail: translate("drama.storyboardRules.forHighImpactDramasAndConfrontations") },
    { value: "standard", label: translate("library.assets.density.standard"), detail: translate("drama.storyboardRules.forMostStories") },
    { value: "sparse", label: translate("drama.storyboardRules.restrained"), detail: translate("drama.storyboardRules.moreRoomForActionAndAtmosphere") },
    { value: "custom", label: translate("account.settings.models.scopeCustom"), detail: translate("drama.storyboardRules.setSpeechRateLineIntervalCharactersPerLineAndBreathing") },
];

/** 对白参数的一句话说明：直接写出语速，回答“这一档说多快”。 */
function dialogueRuleText(rule: DialogueRule) {
    return translate("drama.storyboardRules.aboutOneLineEverySecondsUpToCharactersPerLine", { v0: String(rule.lineSeconds), v1: String(rule.lineMaxRunes), v2: String(rule.speechRate), v3: String(rule.linePauseMs / 1000) });
}
/** 1–10 档按五段说明，与后端 production.performanceBands / cameraBands 同一口径：1–2、3–4、5–6、7–8、9–10。 */
type LevelBand = { label: string; detail: string };
const PERFORMANCE_BANDS: LevelBand[] = [
    { label: translate("drama.storyboardRules.subtle"), detail: translate("drama.storyboardRules.nearlyImpassiveWithEmotionConveyedThroughEyesBreathingAndTiny") },
    { label: translate("drama.storyboardRules.restrained"), detail: translate("drama.storyboardRules.subtlePreciseExpressionsEmotionThroughEyesAndPausesWithLower") },
    { label: translate("drama.storyboardRules.natural"), detail: translate("drama.storyboardRules.expressionsFollowTheDialogueWithVariedEmphasisPaceAndPauses") },
    { label: translate("drama.storyboardRules.expressive"), detail: translate("drama.storyboardRules.wideEyesClenchedTeethSneersAndTearfulEyesDuringConflict") },
    { label: translate("drama.storyboardRules.exaggerated"), detail: translate("drama.storyboardRules.boldEmotionAndClearlyReadableGesturesWithShoutingSobbingAnd") },
];
const CAMERA_BANDS: LevelBand[] = [
    { label: translate("drama.storyboardRules.static"), detail: translate("drama.storyboardRules.mostlyLockedOffShotsWithVerySlowPushInsComposition") },
    { label: translate("drama.storyboardRules.steady"), detail: translate("drama.storyboardRules.mostlyLockedOffShotsAndSlowPushInsOrPullbacks") },
    { label: translate("library.assets.density.standard"), detail: translate("drama.storyboardRules.useCameraMovementToSupportEmotionShotReverseShotAnd") },
    { label: translate("drama.storyboardRules.dynamic"), detail: translate("drama.storyboardRules.fastPushInsTrackingAndLowAnglesAtConflictAnd") },
    { label: translate("drama.storyboardRules.intense"), detail: translate("drama.storyboardRules.frequentRapidPushInsAndPullbacksWhipPansHandheldTracking") },
];
const TRANSITIONS: Array<{ value: DramaStoryboardSettings["transition"]; label: string; detail: string }> = [
    { value: "auto", label: translate("drama.storyboardRules.adaptive"), detail: translate("drama.storyboardRules.hardCutsByDefaultDipsToBlackForSceneChanges") },
    { value: "cut", label: TRANSITION_LABEL.cut, detail: translate("drama.storyboardRules.useHardCutsThroughout") },
    { value: "fadeblack", label: TRANSITION_LABEL.fadeblack, detail: translate("drama.storyboardRules.dipToBlackBetweenEveryShot") },
    { value: "fadewhite", label: TRANSITION_LABEL.fadewhite, detail: translate("drama.storyboardRules.briefWhiteFlashBetweenEveryShot") },
];

/** 有限档位滑杆：每档一个刻度，只能停在刻度上，下方说明当前档位。 */
function ChoiceSlider<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: Array<{ value: V; label: string; detail: string }>; onChange: (value: V) => void }) {
    const index = Math.max(
        0,
        options.findIndex((item) => item.value === value),
    );
    const current = options[index];
    return (
        <div className="drama-sbrules-level">
            <Slider
                className="drama-sbrules-slider"
                min={0}
                max={options.length - 1}
                step={1}
                marks={Object.fromEntries(options.map((item, position) => [position, item.label]))}
                value={index}
                tooltip={{ open: false }}
                aria-label={label}
                aria-valuetext={current.label}
                onChange={(next) => onChange(options[Number(next)]?.value ?? current.value)}
            />
            <span className="drama-sbrules-hint">
                {current.label}：{current.detail}
            </span>
        </div>
    );
}

/** 1–10 档滑杆：刻度标出五段名称，右侧显示当前档位，下方说明这一段在提示词里意味着什么。 */
function LevelSlider({ label, value, bands, onChange }: { label: string; value: number; bands: LevelBand[]; onChange: (value: number) => void }) {
    const band = bands[Math.min(bands.length - 1, Math.floor((value - DIRECTION_LEVEL_MIN) / 2))];
    const marks = Object.fromEntries(bands.map((item, index) => [DIRECTION_LEVEL_MIN + index * 2 + (index === bands.length - 1 ? 1 : 0), item.label]));
    return (
        <div className="drama-sbrules-level">
            <div className="drama-sbrules-level-track">
                <Slider
                    className="drama-sbrules-slider"
                    min={DIRECTION_LEVEL_MIN}
                    max={DIRECTION_LEVEL_MAX}
                    step={1}
                    marks={marks}
                    value={value}
                    tooltip={{ formatter: (next) => `${next} · ${bands[Math.min(bands.length - 1, Math.floor(((next ?? value) - DIRECTION_LEVEL_MIN) / 2))].label}` }}
                    aria-label={label}
                    aria-valuetext={translate("drama.storyboardRules.level", { v0: String(value), v1: String(band.label) })}
                    onChange={(next) => onChange(Number(next))}
                />
                <b className="drama-sbrules-level-value">
                    {value}
                    <small>/{DIRECTION_LEVEL_MAX}</small>
                </b>
            </div>
            <span className="drama-sbrules-hint">
                {band.label}：{band.detail}
            </span>
        </div>
    );
}

function Segmented<V extends string | number>({ label, value, options, onChange }: { label: string; value: V; options: Array<{ value: V; label: string; detail?: string }>; onChange: (value: V) => void }) {
    return (
        <div className="drama-tabs is-block" role="radiogroup" aria-label={label}>
            {options.map((item) => (
                <button key={String(item.value)} type="button" role="radio" className="drama-tab" aria-checked={value === item.value} title={item.detail} onClick={() => onChange(item.value)}>
                    {item.label}
                </button>
            ))}
        </div>
    );
}

/**
 * 分镜规则：决定剧情段多长、段内镜头节奏、台词密度与转场。改编剧本前设置，之后修改对新改编的集生效。
 * onEpisodeSecondsChange 有值时把“单集时长”作为第一行放进来；bare 用于已有外框的卡片内。
 */
export function StoryboardRules({
    value,
    onChange,
    episodeSeconds,
    onEpisodeSecondsChange,
    maxVideoSeconds,
    videoModelLabel,
    bare,
}: {
    value?: DramaStoryboardSettings;
    onChange: (value: DramaStoryboardSettings) => void;
    episodeSeconds: number;
    onEpisodeSecondsChange?: (seconds: number) => void;
    maxVideoSeconds?: number;
    videoModelLabel?: string;
    bare?: boolean;
}) {
    const rules = normalizeStoryboard(value);
    const set = (patch: Partial<DramaStoryboardSettings>) => onChange(normalizeStoryboard({ ...rules, ...patch }));
    const dialogue = dialogueRule(rules);
    const longest = longestLineSeconds(dialogue);
    // 第一次切到自定义时从当前档位的数值起步；填过的自定义值保留。
    const chooseDialogue = (next: DramaDialogue) => {
        if (next !== "custom" || rules.dialogue === "custom") return set({ dialogue: next });
        const base = DIALOGUE_PRESETS[rules.dialogue];
        set({ dialogue: next, speechRate: rules.speechRate || base.speechRate, lineSeconds: rules.lineSeconds || base.lineSeconds, lineMaxRunes: rules.lineMaxRunes || base.lineMaxRunes, linePauseMs: rules.linePauseMs || base.linePauseMs });
    };
    const dialogueNumber = (key: keyof DialogueRule, label: string, prefix: string, suffix: string, step: number, precision: number) => (
        <InputNumber
            className="drama-sbrules-number is-wide"
            size="small"
            min={DIALOGUE_LIMITS[key].min}
            max={DIALOGUE_LIMITS[key].max}
            step={step}
            precision={precision}
            value={dialogue[key]}
            prefix={prefix}
            suffix={suffix}
            aria-label={label}
            onChange={(next) => {
                if (typeof next === "number") set({ [key]: next } as Partial<DramaStoryboardSettings>);
            }}
        />
    );
    const limits = segmentLimits(rules, maxVideoSeconds);
    const target = segmentTargetSeconds(limits);
    const modelName = videoModelLabel || translate("drama.storyboardRules.videoModel");
    // 用户填的秒数超过模型单次上限时按上限执行，明确告诉用户而不是静默改值。
    const requested = rules.segmentMode === "fixed" ? rules.segmentSeconds : rules.segmentMode === "range" ? rules.segmentMaxSeconds : 0;
    const capped = Boolean(maxVideoSeconds && requested > maxVideoSeconds);
    const number = (value: number, onValue: (seconds: number) => void, label: string, bounds: { min: number; max: number }) => (
        <InputNumber
            className="drama-sbrules-number"
            size="small"
            min={bounds.min}
            max={bounds.max}
            precision={0}
            value={value}
            suffix={translate("account.settings.models.unitSecond")}
            aria-label={label}
            onChange={(next) => {
                if (typeof next === "number") onValue(next);
            }}
        />
    );
    return (
        <div className={`drama-sbrules ${bare ? "is-bare" : ""}`}>
            {onEpisodeSecondsChange ? (
                <div className="drama-sbrules-row">
                    <span className="drama-sbrules-label">{translate("drama.storyboardRules.episodeDuration")}</span>
                    <div className="drama-sbrules-duration">
                        <EpisodeDurationInput value={episodeSeconds} onChange={onEpisodeSecondsChange} />
                    </div>
                </div>
            ) : null}
            <div className="drama-sbrules-row">
                <span className="drama-sbrules-label">{translate("drama.storyboardRules.storySegment")}</span>
                <div className="drama-sbrules-segment">
                    <Segmented label={translate("drama.storyboardRules.storySegmentSplitting")} value={rules.segmentMode} options={SEGMENT_MODES} onChange={(segmentMode) => set({ segmentMode })} />
                    {rules.segmentMode === "fixed" ? number(rules.segmentSeconds, (segmentSeconds) => set({ segmentSeconds }), translate("drama.storyboardRules.segmentDuration"), { min: MIN_SEGMENT_SECONDS, max: MAX_SEGMENT_SECONDS }) : null}
                    {rules.segmentMode === "range" ? (
                        <>
                            {number(rules.segmentMinSeconds, (segmentMinSeconds) => set({ segmentMinSeconds }), translate("drama.storyboardRules.minimumSegmentDuration"), { min: MIN_SEGMENT_SECONDS, max: rules.segmentMaxSeconds })}
                            <span className="drama-sbrules-dash">{translate("drama.storyboardRules.to")}</span>
                            {number(rules.segmentMaxSeconds, (segmentMaxSeconds) => set({ segmentMaxSeconds }), translate("drama.storyboardRules.maximumSegmentDuration"), { min: rules.segmentMinSeconds, max: MAX_SEGMENT_SECONDS })}
                        </>
                    ) : null}
                    <span className="drama-sbrules-hint">
                        {rules.segmentMode === "auto"
                            ? maxVideoSeconds
                                ? translate("drama.storyboardRules.splitBySceneAndConflictWithEachSegmentUpTo", { v0: String(maxVideoSeconds), v1: String(modelName) })
                                : translate("drama.storyboardRules.splitBySceneAndConflictWithinTheVideoModelS")
                            : SEGMENT_MODES.find((item) => item.value === rules.segmentMode)?.detail}
                    </span>
                </div>
            </div>
            <div className="drama-sbrules-row">
                <span className="drama-sbrules-label">{translate("drama.storyboardRules.shotPacing")}</span>
                <ChoiceSlider label={translate("drama.storyboardRules.shotPacing")} value={rules.pacing} options={PACING} onChange={(pacing) => set({ pacing })} />
            </div>
            <div className="drama-sbrules-row">
                <span className="drama-sbrules-label">{translate("drama.storyboardRules.dialogueDensity")}</span>
                <div className="drama-sbrules-segment">
                    <Segmented label={translate("drama.storyboardRules.dialogueDensity")} value={rules.dialogue} options={DIALOGUE} onChange={chooseDialogue} />
                    {rules.dialogue === "custom" ? (
                        <>
                            {dialogueNumber("speechRate", translate("drama.storyboardRules.speechRateCharactersPerSecond"), translate("drama.storyboardRules.speed"), translate("drama.storyboardRules.charactersS"), 0.1, 1)}
                            {dialogueNumber("lineSeconds", translate("drama.storyboardRules.averageSecondsBetweenLines"), translate("drama.storyboardRules.every"), translate("drama.storyboardRules.secondsPerLine"), 0.5, 1)}
                            {dialogueNumber("lineMaxRunes", translate("drama.storyboardRules.maximumCharactersPerLine"), translate("drama.storyboardRules.perLine"), translate("drama.storyboardRules.charactersMax"), 1, 0)}
                            {dialogueNumber("linePauseMs", translate("drama.storyboardRules.pauseAfterDialogueMilliseconds"), translate("drama.storyboardRules.dialoguePause"), translate("drama.storyboardRules.ms"), 50, 0)}
                        </>
                    ) : null}
                    <span className="drama-sbrules-hint">
                        {DIALOGUE.find((item) => item.value === rules.dialogue)?.label}：{dialogueRuleText(dialogue)}
                        {rules.dialogue === "custom" ? translate("drama.storyboardRules.theLongestLineTakesAboutSeconds", { v0: String(longest) }) : `，${DIALOGUE.find((item) => item.value === rules.dialogue)?.detail}`}
                    </span>
                </div>
            </div>
            {rules.dialogue === "custom" && longest > dialogue.lineSeconds ? (
                <p className="drama-sbrules-warn">
                    <TriangleAlert className="size-3.5 shrink-0" />
                    {translate("drama.storyboardRules.perLine")} {dialogue.lineMaxRunes} {translate("drama.storyboardRules.charactersAt")} {dialogue.speechRate} {translate("drama.storyboardRules.charactersSTakesAbout")} {longest} {translate("drama.storyboardRules.secondsLongerThanThe")} {dialogue.lineSeconds} {translate("drama.storyboardRules.secondsBetweenLinesSoActualDialogueWillBeLessFrequent")}
                </p>
            ) : null}
            <div className="drama-sbrules-row">
                <span className="drama-sbrules-label">{translate("drama.storyboardRules.performanceIntensity")}</span>
                <LevelSlider label={translate("drama.storyboardRules.performanceIntensity")} value={rules.performance} bands={PERFORMANCE_BANDS} onChange={(performance) => set({ performance })} />
            </div>
            <div className="drama-sbrules-row">
                <span className="drama-sbrules-label">{translate("drama.storyboardRules.cameraMovementIntensity")}</span>
                <LevelSlider label={translate("drama.storyboardRules.cameraMovementIntensity")} value={rules.cameraMotion} bands={CAMERA_BANDS} onChange={(cameraMotion) => set({ cameraMotion })} />
            </div>
            <div className="drama-sbrules-row">
                <span className="drama-sbrules-label">{translate("drama.storyboardRules.transition")}</span>
                <Segmented label={translate("drama.storyboardRules.shotTransition")} value={rules.transition} options={TRANSITIONS} onChange={(transition) => set({ transition })} />
            </div>
            {rules.transition !== "cut" ? (
                <div className="drama-sbrules-row">
                    <span className="drama-sbrules-label">{translate("drama.storyboardRules.transitionDuration")}</span>
                    <InputNumber className="drama-sbrules-number" min={MIN_TRANSITION_MS} max={1500} step={50} value={rules.transitionMs} onChange={(next) => set({ transitionMs: next || MIN_TRANSITION_MS })} suffix={translate("drama.storyboardRules.ms")} aria-label={translate("drama.storyboardRules.transitionDuration")} />
                    <span className="drama-sbrules-hint">{TRANSITIONS.find((item) => item.value === rules.transition)?.detail}</span>
                </div>
            ) : null}
            <div className="drama-sbrules-summary">
                <Film className="size-3.5" />
                <span>
                    {translate("drama.storyboardRules.perEpisodeAbout")} <b>{shotTarget(rules, episodeSeconds)}</b> {translate("drama.storyboardRules.shotsAndAtLeast")} <b>{lineTarget(rules, episodeSeconds)}</b> {translate("drama.storyboardRules.linesOfDialogue")}
                    {target ? (
                        <>
                            {" "}
                            · {segmentRuleLabel(limits)}，{limits.mode === "auto" ? translate("drama.storyboardRules.atLeast") : translate("drama.storyboardRules.about")} <b>{Math.max(1, Math.ceil(episodeSeconds / target))}</b> {translate("drama.storyboardRules.segmentsAbout")} <b>{Math.max(1, Math.round(target / averageShotSeconds(rules)))}</b> {translate("drama.storyboardRules.shots")}
                        </>
                    ) : null}
                </span>
            </div>
            {capped ? (
                <p className="drama-sbrules-warn">
                    <TriangleAlert className="size-3.5 shrink-0" />
                    {modelName}{translate("drama.storyboardRules.maximumPerGeneration")} {maxVideoSeconds} {translate("drama.storyboardRules.seconds")}{rules.segmentMode === "fixed" ? translate("drama.storyboardRules.storySegmentsAreSplitAtSeconds", { v0: String(maxVideoSeconds) }) : translate("drama.storyboardRules.theStorySegmentLimitIsSeconds", { v0: String(maxVideoSeconds) })}。
                </p>
            ) : null}
        </div>
    );
}
