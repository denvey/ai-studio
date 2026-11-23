// 预演台右侧检查器：物体、灯光、镜头、变换与骨骼旋转字段，以及场景列表的小控件。

import {
    type PrevisAspectRatio,
    type PrevisCamera,
    type PrevisCameraMove,
    type PrevisHumanoidBone,
    type PrevisLight,
    type PrevisObject,
    type PrevisActorArchetype,
    type PrevisPose,
    type PrevisQuat,
    type PrevisScene,
    type PrevisShot,
    type PrevisShotSize,
    type PrevisTransform,
    type PrevisVec3,
} from "@/types/previs";
import { type PrevisModeCapabilities } from "@/lib/canvas/previs/previs-modes";
import { PREVIS_ACTOR_ARCHETYPES, PREVIS_ACTOR_COLORS, previsActorProfileForArchetype, previsBoneLabel } from "@/lib/canvas/previs/previs-scene";
import { PREVIS_ASPECT_RATIOS, previsAspectOption, previsHorizontalFov } from "@/lib/canvas/previs/previs-optics";
import { Button, ColorPicker, Dropdown, Input, InputNumber, type MenuProps, Slider } from "antd";
import { Select } from "@/components/ui/base/select";
import { Switch } from "@/components/ui/base/switch";
import { Camera, Check, Copy, Focus, Pause, Play, Plus, Route, Trash2, TriangleAlert, Video } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Euler, Quaternion } from "three";
import { releasePrevisFocusAfterPointer } from "@/lib/canvas/previs/previs-shortcuts";
import { isPrevisStandardActor, PREVIS_MANNEQUIN_HEIGHT } from "@/lib/canvas/previs/previs-mannequin";
import { dropPrevisObjectToGround, isPrevisObjectOnGround } from "@/lib/canvas/previs/previs-grounding";

/** 演员色板：一行 8 个高区分度颜色，其余颜色用取色器/十六进制输入，避免两行杂乱色块。 */
const PREVIS_ACTOR_SWATCHES: readonly string[] = ["#2f7de1", "#d84949", "#dfae3f", "#34a276", "#8b5cf6", "#f97316", "#06b6d4", "#8a93a0"];
import { PREVIS_MOTION_IDS, PREVIS_MOTIONS, previsMotionsOverlap } from "@/lib/canvas/previs/previs-motion";
import type { PrevisActorMotion, PrevisMotionId } from "@/types/previs";
import { translate } from "@/i18n";

function displayPrevisMotionLabel(id: PrevisMotionId) {
    return translate(`canvasTools.previs.motionLabels.${id}`);
}

export function displayPrevisActorArchetypeLabel(archetype?: PrevisActorArchetype) {
    const value = PREVIS_ACTOR_ARCHETYPES.find((item) => item.value === archetype)?.value || "adult";
    return translate(`canvasTools.previs.actorArchetypes.${value}`);
}

/**
 * 标准人偶的动作库：点击动作即在当前播放头插入片段；移动步态由走位自动推导，不需要手动添加。
 * 上半身动作（招手、说话…）可以叠加在走路上，整身动作同层互斥并给出冲突提示。
 */
function ActorMotionSection({ object, playhead, onUpdate }: { object: PrevisObject; playhead: number; onUpdate: (patch: Partial<PrevisObject>) => void }) {
    const motions = object.motions || [];
    const sorted = motions.toSorted((left, right) => left.start - right.start);
    const add = (motion: PrevisMotionId) => {
        const definition = PREVIS_MOTIONS[motion];
        const next: PrevisActorMotion = { id: `motion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, motion, start: Math.max(0, Number(playhead.toFixed(2))), duration: definition.duration, intensity: 1 };
        onUpdate({ motions: [...motions, next] });
    };
    const patch = (id: string, value: Partial<PrevisActorMotion>) => onUpdate({ motions: motions.map((item) => (item.id === id ? { ...item, ...value } : item)) });
    const remove = (id: string) => onUpdate({ motions: motions.filter((item) => item.id !== id) });
    return (
        <section className="previs-pose-section" aria-label={translate("canvasTools.previs.previsInspectors.actionLibrary")}>
            <div className="previs-pose-grid">
                {PREVIS_MOTION_IDS.map((id) => (
                    <button
                        key={id}
                        type="button"
                        className="previs-pose-button"
                        title={`${displayPrevisMotionLabel(id)} (${PREVIS_MOTIONS[id].layer === "upper" ? translate("canvasTools.previs.previsInspectors.upperBodyCanCombineWithWalking") : translate("canvasTools.previs.previsInspectors.fullBody")})`}
                        onClick={(event) => {
                            releasePrevisFocusAfterPointer(event);
                            add(id);
                        }}
                    >
                        {displayPrevisMotionLabel(id)}
                    </button>
                ))}
            </div>
            <div className="text-[var(--fs-tiny)] opacity-55">{translate("canvasTools.previs.previsInspectors.charactersStepAndRunAutomaticallyDuringBlockingMovementNoNeed")}</div>
            {sorted.length ? (
                <ul className="previs-motion-list">
                    {sorted.map((item) => {
                        const conflict = previsMotionsOverlap(motions, item, item.id);
                        return (
                            <li key={item.id} className={`previs-motion-row ${conflict ? "is-conflict" : ""}`}>
                                <span className="previs-motion-row__name" title={conflict ? translate("canvasTools.previs.previsInspectors.overlapsAnActionOnTheSameLayerTheLaterAction") : undefined}>
                                    {displayPrevisMotionLabel(item.motion)}
                                    {conflict ? <TriangleAlert role="img" aria-label={translate("canvasTools.previs.previsInspectors.overlappingActions")} className="ml-1 inline-block size-3.5 align-[-0.125em] text-[var(--status-warning)]" /> : null}
                                </span>
                                <InputNumber size="small" aria-label={translate("canvasTools.previs.previsInspectors.startSeconds")} min={0} max={60} step={0.1} value={item.start} addonAfter="s" onChange={(start) => patch(item.id, { start: Math.max(0, Number(start) || 0) })} />
                                <InputNumber size="small" aria-label={translate("canvasTools.previs.previsInspectors.durationSeconds")} min={0.2} max={60} step={0.1} value={item.duration} addonAfter={translate("canvasTools.previs.previsInspectors.length")} onChange={(duration) => patch(item.id, { duration: Math.max(0.2, Number(duration) || 0.2) })} />
                                <Slider className="previs-motion-row__intensity" aria-label={translate("canvasTools.previs.previsInspectors.intensity")} min={0.2} max={1.6} step={0.05} value={item.intensity ?? 1} onChange={(intensity) => patch(item.id, { intensity })} />
                                <button type="button" className="previs-motion-row__remove" aria-label={translate("canvasTools.previs.previsInspectors.deleteAction", { v0: String(displayPrevisMotionLabel(item.motion)) })} onClick={() => remove(item.id)}>
                                    <Trash2 className="size-3" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </section>
    );
}

const PREVIS_HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function normalizePrevisHexColor(value: string, fallback = "#ffffff") {
    const trimmed = value.trim().toLowerCase();
    if (!PREVIS_HEX_COLOR_PATTERN.test(trimmed)) return fallback;
    if (trimmed.length === 4)
        return `#${trimmed
            .slice(1)
            .split("")
            .map((part) => part + part)
            .join("")}`;
    return trimmed;
}

function HexColorInput({ value, onChange, label = translate("canvasTools.previs.previsInspectors.hexColor") }: { value: string; onChange: (value: string) => void; label?: string }) {
    const normalized = normalizePrevisHexColor(value);
    const [draft, setDraft] = useState(normalized);
    useEffect(() => setDraft(normalized), [normalized]);
    const commit = () => {
        const next = normalizePrevisHexColor(draft, "");
        if (!next) {
            setDraft(normalized);
            return;
        }
        setDraft(next);
        onChange(next);
    };
    return <Input size="small" aria-label={label} value={draft} maxLength={9} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onPressEnter={commit} placeholder="#RRGGBB" />;
}

export const poseOptions: Array<{ label: string; value: PrevisPose }> = [
    { label: translate("canvasTools.previs.previsInspectors.standing"), value: "stand" },
    { label: translate("canvasTools.previs.previsInspectors.tPose"), value: "t_pose" },
    { label: translate("canvasTools.previs.previsInspectors.walk"), value: "walk" },
    { label: translate("canvasTools.previs.previsInspectors.run"), value: "run" },
    { label: translate("canvasTools.previs.previsInspectors.seated"), value: "sit" },
    { label: translate("canvasTools.previs.previsInspectors.crouch"), value: "squat" },
    { label: translate("canvasTools.previs.previsInspectors.kneelOnOneKnee"), value: "kneel_single" },
    { label: translate("canvasTools.previs.previsInspectors.kneelOnBothKnees"), value: "kneel_double" },
    { label: translate("canvasTools.previs.previsInspectors.handsOnHips"), value: "hands_hips" },
    { label: translate("canvasTools.previs.previsInspectors.lean"), value: "lean" },
    { label: translate("canvasTools.previs.previsInspectors.bow"), value: "bow" },
    { label: translate("canvasTools.previs.previsInspectors.thinking"), value: "think" },
    { label: translate("canvasTools.previs.previsInspectors.fight"), value: "fight" },
    { label: translate("canvasTools.previs.previsInspectors.kick"), value: "kick" },
    { label: translate("canvasTools.previs.previsInspectors.throw"), value: "throw" },
    { label: translate("canvasTools.previs.previsInspectors.pushIn"), value: "push" },
    { label: translate("canvasTools.previs.previsInspectors.wave"), value: "wave" },
    { label: translate("canvasTools.previs.previsInspectors.reachOut"), value: "reach" },
    { label: translate("canvasTools.previs.previsInspectors.armsCrossed"), value: "arms_crossed" },
    { label: translate("canvasTools.previs.previsInspectors.lookingAtPhone"), value: "phone" },
];

export function displayPrevisPoseLabel(pose: PrevisPose) {
    return pose === "neutral" ? translate("canvasTools.previs.neutralPose") : poseOptions.find((option) => option.value === pose)?.label || pose;
}

export const poseEditBones: PrevisHumanoidBone[] = ["head", "spine", "leftUpperArm", "leftLowerArm", "rightUpperArm", "rightLowerArm", "leftUpperLeg", "rightUpperLeg"];

export const shotSizeOptions = [
    { label: translate("canvasTools.previs.previsInspectors.extremeWideShot"), value: "extreme_wide" },
    { label: translate("canvasTools.previs.previsInspectors.longShot"), value: "wide" },
    { label: translate("canvasTools.previs.previsInspectors.fullBodyShot"), value: "full" },
    { label: translate("canvasTools.previs.previsInspectors.mediumShot"), value: "medium" },
    { label: translate("canvasTools.previs.previsInspectors.mediumCloseUp"), value: "close_up" },
    { label: translate("canvasTools.previs.previsInspectors.extremeCloseUp"), value: "extreme_close_up" },
];

export const cameraMoveOptions = [
    { label: translate("canvasA.skillLibrary.pin"), value: "static" },
    { label: translate("canvasTools.previs.previsInspectors.pushIn"), value: "push_in" },
    { label: translate("canvasTools.previs.previsInspectors.zoomOut"), value: "pull_out" },
    { label: translate("canvasTools.previs.previsInspectors.panLeft"), value: "pan_left" },
    { label: translate("canvasTools.previs.previsInspectors.panRight"), value: "pan_right" },
    { label: translate("canvasTools.previs.previsInspectors.tiltUp"), value: "tilt_up" },
    { label: translate("canvasTools.previs.previsInspectors.tiltDown"), value: "tilt_down" },
    { label: translate("canvasTools.previs.previsInspectors.orbitLeft"), value: "orbit_left" },
    { label: translate("canvasTools.previs.previsInspectors.orbitRight"), value: "orbit_right" },
    { label: translate("canvasTools.previs.previsInspectors.handheld"), value: "handheld" },
];

type ObjectInspectorTab = "animate" | "pose" | "props";

/**
 * 对象检查器：按标签分组，而不是一长串字段。
 * - 摆场：属性（变换/体型/外观）+ 姿态（演员）。
 * - 动画：动画（引导式三步：走位 → 动作 → 预览，手动关键帧收在「高级」）+ 姿态 + 属性。
 */
export function ObjectInspector({
    object,
    rendered,
    playhead,
    selectedBone,
    capabilities,
    playing,
    pathDrawing,
    onSelectBone,
    onUpdate,
    onTransformEdit,
    onBoneRotationStage,
    onBoneRotationCommit,
    onAddKeyframe,
    onTogglePlay,
    onToggleDrawPath,
    onClearPath,
    onDuplicate,
    onDelete,
}: {
    object: PrevisObject;
    rendered: PrevisTransform;
    playhead: number;
    selectedBone: string | null;
    capabilities: PrevisModeCapabilities;
    playing: boolean;
    pathDrawing: boolean;
    onSelectBone: (bone: string | null) => void;
    onUpdate: (patch: Partial<PrevisObject>) => void;
    onTransformEdit: (transform: PrevisTransform) => void;
    onBoneRotationStage: (rotation: PrevisQuat) => void;
    onBoneRotationCommit: () => void;
    onAddKeyframe: () => void;
    onTogglePlay: () => void;
    onToggleDrawPath: () => void;
    onClearPath: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    const motionClips = object.motionClips || [];
    const activeMotionClip = motionClips.find((clip) => clip.id === object.activeMotionClipId);
    const isActor = object.kind === "actor" || object.primitive === "character";
    const mappedBones = Object.keys(object.rig?.boneMap || {}) as PrevisHumanoidBone[];
    const poseBones = mappedBones.length ? mappedBones : poseEditBones;
    const selectedBoneId = selectedBone as PrevisHumanoidBone | null;
    const selectedBoneRotation = selectedBoneId ? object.boneOverrides?.[selectedBoneId] || ([0, 0, 0, 1] as PrevisQuat) : null;
    const updateActiveMotion = (patch: Partial<NonNullable<PrevisObject["motionClips"]>[number]>) => activeMotionClip && onUpdate({ motionClips: motionClips.map((clip) => (clip.id === activeMotionClip.id ? { ...clip, ...patch } : clip)) });
    const applyPose = (pose: PrevisPose) => onUpdate({ pose, activeMotionClipId: undefined, boneOverrides: {} });
    const resetSelectedBone = () => {
        if (!selectedBoneId) return;
        const boneOverrides = { ...(object.boneOverrides || {}) };
        delete boneOverrides[selectedBoneId];
        onUpdate({ boneOverrides });
    };
    const profile = { ...previsActorProfileForArchetype(object.archetype || "adult"), ...(object.actorProfile || {}) };
    const updateProfile = (patch: Partial<typeof profile>) => onUpdate({ actorProfile: { ...profile, ...patch } });
    const grounded = isPrevisObjectOnGround(object, rendered);
    const hasPath = Boolean(object.motionPath) || object.keyframes.length > 1;
    const motionCount = object.motions?.length || 0;
    const boneKeyCount = object.boneTracks?.reduce((sum, track) => sum + track.keyframes.length, 0) || 0;

    const tabs: Array<{ id: ObjectInspectorTab; label: string }> = [
        ...(capabilities.timeline ? [{ id: "animate" as const, label: translate("canvasTools.previs.previsInspectors.animation") }] : []),
        { id: "props", label: translate("canvasTools.previs.previsInspectors.properties") },
        ...(isActor && capabilities.bones ? [{ id: "pose" as const, label: translate("canvasTools.previs.previsInspectors.pose") }] : []),
    ];
    const [tab, setTab] = useState<ObjectInspectorTab>(tabs[0].id);
    // 换对象或换模式时回到该模式的首个标签：进入动画默认看动画步骤。
    useEffect(() => setTab(capabilities.timeline ? "animate" : "props"), [capabilities.timeline, object.id]);
    const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;

    return (
        <Inspector title={object.name} onTitleChange={(name) => onUpdate({ name })} onDuplicate={onDuplicate} onDelete={onDelete}>
            {tabs.length > 1 ? (
                <div className="previs-inspector-tabs" role="tablist" aria-label={translate("canvasTools.previs.previsInspectors.propertyCategory")}>
                    {tabs.map((item) => (
                        <button key={item.id} type="button" role="tab" aria-selected={activeTab === item.id} className={`previs-inspector-tab ${activeTab === item.id ? "is-active" : ""}`} onClick={() => setTab(item.id)}>
                            {item.label}
                        </button>
                    ))}
                </div>
            ) : null}

            {activeTab === "animate" ? (
                <>
                    {isActor ? (
                        <div className="previs-anim-guide">
                            <GuideStep index={1} title={translate("canvasTools.previs.previsInspectors.blocking")} done={hasPath} hint={translate("canvasTools.previs.previsInspectors.dragOnTheGroundInTopViewToDrawA")}>
                                <div className="previs-anim-guide__actions">
                                    <Button size="small" type={pathDrawing ? "primary" : "default"} icon={<Route className="size-3.5" />} onClick={onToggleDrawPath}>
                                        {pathDrawing ? translate("canvasTools.previs.previsInspectors.cancelDrawing") : hasPath ? translate("canvasTools.previs.previsInspectors.redrawBlockingPath") : translate("canvasTools.previs.previsInspectors.drawBlockingPath")}
                                    </Button>
                                    {hasPath ? (
                                        <Button size="small" type="text" onClick={onClearPath}>
                                            {translate("canvasTools.previs.previsInspectors.clearBlocking")}
                                        </Button>
                                    ) : null}
                                </div>
                            </GuideStep>
                            {isPrevisStandardActor(object) ? (
                                <GuideStep index={2} title={translate("canvasTools.previs.previsInspectors.motion")} done={motionCount > 0} hint={translate("canvasTools.previs.previsInspectors.moveTheTimelinePlayheadToTheActionStartTimeCurrently", { v0: String(playhead.toFixed(1)) })}>
                                    <ActorMotionSection object={object} playhead={playhead} onUpdate={onUpdate} />
                                </GuideStep>
                            ) : null}
                            <GuideStep index={isPrevisStandardActor(object) ? 3 : 2} title={translate("account.feedback.preview")} hint={translate("canvasTools.previs.previsInspectors.playTheEntireShotToCheckWhetherMovementAndActions")}>
                                <Button size="small" block icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} onClick={onTogglePlay}>
                                    {playing ? translate("canvasA.outbox.pause") : translate("canvasC.timelinePreview.play")}
                                </Button>
                            </GuideStep>
                        </div>
                    ) : (
                        <div className="previs-inspector-note">{translate("canvasTools.previs.previsInspectors.animatePropsWithKeyframesMoveThePlayheadToATime")}</div>
                    )}
                    {motionClips.length ? (
                        <InspectorGroup title={translate("canvasTools.previs.previsInspectors.builtInModelAnimations")}>
                            <Select
                                className="w-full"
                                size="small"
                                value={object.activeMotionClipId || ""}
                                options={[{ label: translate("canvasTools.previs.previsInspectors.staticPose"), value: "" }, ...motionClips.map((clip) => ({ label: clip.name, value: clip.id }))]}
                                onChange={(activeMotionClipId) => onUpdate({ activeMotionClipId: activeMotionClipId || undefined })}
                            />
                            {activeMotionClip ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <Field label={translate("canvasTools.previs.previsInspectors.playbackSpeed")}>
                                        <InputNumber className="w-full" size="small" min={0.1} max={4} step={0.1} value={activeMotionClip.playbackRate} onChange={(playbackRate) => updateActiveMotion({ playbackRate: playbackRate || 1 })} />
                                    </Field>
                                    <Field label={translate("canvasTools.previs.previsInspectors.loop")}>
                                        <Switch checked={activeMotionClip.loop} onChange={(loop) => updateActiveMotion({ loop })} />
                                    </Field>
                                </div>
                            ) : null}
                        </InspectorGroup>
                    ) : null}
                    {/* 记录关键帧属于动画模式；摆场不默认制造关键帧。 */}
                    {capabilities.keyframes ? (
                        <details className="previs-inspector-advanced" open={!isActor}>
                            <summary>{isActor ? translate("canvasTools.previs.previsInspectors.advancedManualKeyframes") : translate("canvasTools.previs.previsInspectors.keyframes")}</summary>
                            <div className="previs-inspector-advanced__body">
                                <Button size="small" block icon={<Focus className="size-3.5" />} onClick={onAddKeyframe}>
                                    {selectedBone ? translate("canvasTools.previs.previsInspectors.recordCurrentBodyPartAtS", { v0: String(playhead.toFixed(1)) }) : translate("canvasTools.previs.previsInspectors.recordAKeyframeAtS", { v0: String(playhead.toFixed(1)) })}
                                </Button>
                                <div className="previs-inspector-note">
                                    {translate("canvasTools.inline.previsInspectors.positionKeyframesBonesKeyframesEnableAutoKeyframeOnTheTimeline", { v0: String(object.keyframes.length), v1: String(boneKeyCount) })}
                                </div>
                            </div>
                        </details>
                    ) : null}
                </>
            ) : null}

            {activeTab === "pose" ? (
                <InspectorGroup title={translate("canvasTools.previs.previsInspectors.pose2")} hint={displayPrevisPoseLabel(object.pose || "stand")}>
                    <div className="previs-pose-grid">
                        {poseOptions.map((option) => (
                            <button key={option.value} type="button" className={`previs-pose-button ${object.pose === option.value && !object.activeMotionClipId ? "is-active" : ""}`} title={option.label} onClick={() => applyPose(option.value)}>
                                {option.label}
                            </button>
                        ))}
                    </div>
                    {poseBones.length ? (
                        <Field label={translate("canvasTools.previs.previsInspectors.fineTuneBodyPartsOrClickJointsDirectlyInThe")}>
                            <Select
                                className="w-full"
                                size="small"
                                allowClear
                                placeholder={translate("canvasTools.previs.previsInspectors.selectBodyPart")}
                                value={selectedBone || undefined}
                                options={poseBones.map((bone) => ({ label: previsBoneLabel(bone), value: bone }))}
                                onChange={(bone) => onSelectBone(bone || null)}
                            />
                        </Field>
                    ) : null}
                    {selectedBoneId && selectedBoneRotation ? (
                        <>
                            <BoneRotationFields rotation={selectedBoneRotation} onChange={onBoneRotationStage} onChangeComplete={onBoneRotationCommit} />
                            <Button size="small" block onClick={resetSelectedBone}>
                                {translate("canvasTools.previs.previsInspectors.resetCurrentBodyPart")}
                            </Button>
                        </>
                    ) : null}
                    <Button size="small" block onClick={() => applyPose("stand")}>
                        {translate("canvasTools.previs.previsInspectors.resetPose")}
                    </Button>
                </InspectorGroup>
            ) : null}

            {activeTab === "props" ? (
                <>
                    <InspectorGroup title={translate("canvasTools.previs.previsInspectors.position")} hint={isActor ? translate("canvasTools.previs.previsInspectors.yIsTheHeightOfTheFeetAboveTheGround") : undefined}>
                        <TransformFields transform={rendered} onChange={onTransformEdit} scaleLabel={isActor ? translate("canvasB.sizePicker.placeholder") : translate("canvasTools.previs.previsInspectors.size")} scaleUnit={isActor ? "×" : translate("canvasTools.previs.scaleFactorUnit")} scaleAxisLabels={isActor ? undefined : ["W", "H", "D"]} />
                        <Button size="small" block disabled={grounded} onClick={() => onTransformEdit(dropPrevisObjectToGround({ ...object, transform: rendered, keyframes: [] }).transform)}>
                            {translate("canvasTools.previs.previsInspectors.snapToGround")}
                        </Button>
                    </InspectorGroup>
                    {isActor ? (
                        <InspectorGroup title={translate("canvasTools.previs.previsInspectors.bodyShape")}>
                            <Field label={translate("canvasTools.previs.previsInspectors.characterArchetype")}>
                                <Select
                                    className="w-full"
                                    size="small"
                                    value={object.archetype || "adult"}
                                    options={PREVIS_ACTOR_ARCHETYPES.map((item) => ({ label: displayPrevisActorArchetypeLabel(item.value), value: item.value }))}
                                    onChange={(archetype: PrevisActorArchetype) => onUpdate({ archetype, actorProfile: previsActorProfileForArchetype(archetype) })}
                                />
                            </Field>
                            <ProfileSlider label={translate("canvasTools.previs.previsInspectors.height")} min={0.5} max={1.5} value={profile.height} suffix={`${(profile.height * PREVIS_MANNEQUIN_HEIGHT).toFixed(2)}m`} onChange={(height) => updateProfile({ height })} />
                            <ProfileSlider label={translate("canvasTools.previs.previsInspectors.shoulderWidth")} min={0.6} max={1.5} value={profile.shoulderWidth} onChange={(shoulderWidth) => updateProfile({ shoulderWidth })} />
                            <ProfileSlider label={translate("canvasTools.previs.previsInspectors.torso")} min={0.7} max={1.3} value={profile.torsoRatio} onChange={(torsoRatio) => updateProfile({ torsoRatio })} />
                            <ProfileSlider label={translate("canvasTools.previs.previsInspectors.head")} min={0.7} max={1.5} value={profile.headRatio} onChange={(headRatio) => updateProfile({ headRatio })} />
                        </InspectorGroup>
                    ) : null}
                    <InspectorGroup title={translate("canvasA.characterStudio.groups.appearance")}>
                        <ColorRow value={object.color} swatches={isActor ? PREVIS_ACTOR_SWATCHES : undefined} label={isActor ? translate("canvasTools.previs.previsInspectors.characterHexColor") : translate("canvasTools.previs.previsInspectors.hexColor")} onChange={(color) => onUpdate({ color })} />
                        <div className="previs-inspector-toggles">
                            <label className="previs-inspector-toggle">
                                <span>{translate("canvasTools.previs.previsInspectors.visible")}</span>
                                <Switch checked={object.visible} onChange={(visible) => onUpdate({ visible })} />
                            </label>
                            <label className="previs-inspector-toggle">
                                <span>{translate("canvasTools.previs.previsInspectors.castShadows")}</span>
                                <Switch checked={object.castShadow} onChange={(castShadow) => onUpdate({ castShadow })} />
                            </label>
                        </div>
                    </InspectorGroup>
                </>
            ) : null}
        </Inspector>
    );
}

/** 引导步骤：编号 + 标题 + 一句话说明 + 操作。完成后编号变成对勾。 */
function GuideStep({ index, title, hint, done = false, children }: { index: number; title: string; hint: string; done?: boolean; children: ReactNode }) {
    return (
        <section className={`previs-anim-step ${done ? "is-done" : ""}`} aria-label={translate("canvasTools.previs.previsInspectors.step", { v0: String(index), v1: String(title) })}>
            <div className="previs-anim-step__head">
                <span className="previs-anim-step__index" aria-hidden="true">
                    {done ? <Check className="size-3" /> : index}
                </span>
                <span className="previs-anim-step__title">{title}</span>
                {done ? <span className="previs-anim-step__state">{translate("canvasTools.previs.previsInspectors.configured")}</span> : <span className="previs-anim-step__state">{translate("account.settings.diagnostics.optional")}</span>}
            </div>
            <p className="previs-anim-step__hint">{hint}</p>
            {children}
        </section>
    );
}

function ColorRow({ value, swatches, label, onChange }: { value: string; swatches?: readonly string[]; label: string; onChange: (color: string) => void }) {
    return (
        <div className="previs-color-row">
            {swatches?.map((color) => (
                <button
                    key={color}
                    type="button"
                    className={`previs-actor-color ${value.toLowerCase() === color ? "is-active" : ""}`}
                    style={{ background: color }}
                    aria-label={translate("canvasTools.previs.previsInspectors.setColor", { v0: String(color) })}
                    aria-pressed={value.toLowerCase() === color}
                    onClick={() => onChange(color)}
                />
            ))}
            <ColorPicker value={normalizePrevisHexColor(value)} size="small" onChange={(color) => onChange(color.toHexString())} />
            <div className="previs-color-row__hex">
                <HexColorInput value={value} onChange={onChange} label={label} />
            </div>
        </div>
    );
}

const LIGHT_TYPE_OPTIONS = [
    { label: translate("canvasTools.previs.previsInspectors.directionalLightSun"), value: "directional" },
    { label: translate("canvasTools.previs.previsInspectors.pointLightBulb"), value: "point" },
    { label: translate("canvasTools.previs.previsInspectors.spotlight"), value: "spot" },
    { label: translate("canvasTools.previs.previsInspectors.ambientLight"), value: "ambient" },
];

export function LightInspector({ light, onUpdate, onDelete }: { light: PrevisLight; onUpdate: (patch: Partial<PrevisLight>) => void; onDelete: () => void }) {
    return (
        <Inspector title={light.name} onTitleChange={(name) => onUpdate({ name })} onDelete={onDelete}>
            <InspectorGroup title={translate("canvasTools.previs.previsInspectors.light")}>
                <Field label={translate("account.settings.runninghub.kind")}>
                    <Select className="w-full" size="small" value={light.type} options={LIGHT_TYPE_OPTIONS} onChange={(type) => onUpdate({ type })} />
                </Field>
                <ProfileSlider label={translate("canvasTools.previs.previsInspectors.strength")} min={0} max={10} step={0.1} value={light.intensity} suffix={light.intensity.toFixed(1)} onChange={(intensity) => onUpdate({ intensity })} />
                <ColorRow value={light.color} swatches={LIGHT_SWATCHES} label={translate("canvasTools.previs.previsInspectors.lightHexColor")} onChange={(color) => onUpdate({ color })} />
                {light.type !== "ambient" ? (
                    <label className="previs-inspector-toggle">
                        <span>{translate("canvasTools.previs.previsInspectors.castShadows")}</span>
                        <Switch checked={light.castShadow} onChange={(castShadow) => onUpdate({ castShadow })} />
                    </label>
                ) : null}
            </InspectorGroup>
            {light.type !== "ambient" ? (
                <InspectorGroup title={translate("canvasTools.previs.previsInspectors.position")}>
                    <Vec3Field label={translate("canvasTools.previs.previsInspectors.position")} unit="m" value={light.transform.position} onChange={(position) => onUpdate({ transform: { ...light.transform, position } })} />
                </InspectorGroup>
            ) : null}
        </Inspector>
    );
}

const LIGHT_SWATCHES: readonly string[] = ["#ffffff", "#ffe2b8", "#ffc58a", "#9cc7ff", "#c3b5ff", "#ff9b8a"];
const FOCAL_PRESETS = [18, 24, 35, 50, 85, 135];

/**
 * 镜头检查器：没选中对象时显示。
 * 画面（机位/景别/画幅/时长）→ 镜头（焦段/光圈）→ 机位（对齐视图/坐标）→ 运镜 → 镜头意图。
 * 运镜生成与关键帧只在动画模式出现；摆场模式只选运镜语义（会写进提示词）。
 */
export function ShotInspector({
    shot,
    camera,
    cameras,
    capabilities,
    pathDrawing,
    onUpdateShot,
    onUpdateCamera,
    onAddCameraKeyframe,
    onApplyCameraMove,
    onAlignCameraToView,
    onToggleDrawPath,
}: {
    shot: PrevisShot;
    camera: PrevisCamera | null;
    cameras: PrevisScene["cameras"];
    capabilities: PrevisModeCapabilities;
    pathDrawing: boolean;
    onUpdateShot: (patch: Partial<PrevisShot>) => void;
    onUpdateCamera: (patch: Partial<PrevisCamera>) => void;
    onAddCameraKeyframe: () => void;
    onApplyCameraMove: () => void;
    onAlignCameraToView: () => void;
    onToggleDrawPath: () => void;
}) {
    const setFocal = (focalLength: number) => onUpdateCamera({ focalLength, fov: previsHorizontalFov(focalLength) });
    return (
        <Inspector title={shot.name} onTitleChange={(name) => onUpdateShot({ name })}>
            <InspectorGroup title={translate("canvasTools.previs.previsInspectors.everyFrame")}>
                <Field label={translate("canvasTools.previs.previsInspectors.useCamera")}>
                    <Select className="w-full" size="small" value={shot.cameraId} options={cameras.map((item) => ({ label: item.name, value: item.id }))} onChange={(cameraId) => onUpdateShot({ cameraId })} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                    <Field label={translate("canvasTools.previs.previsInspectors.shotSize")}>
                        <Select className="w-full" size="small" value={shot.shotSize} options={shotSizeOptions} onChange={(shotSize: PrevisShotSize) => onUpdateShot({ shotSize })} />
                    </Field>
                    <Field label={translate("canvasTools.previs.previsInspectors.frameSize")}>
                        <Select
                            className="w-full"
                            size="small"
                            value={previsAspectOption(shot.aspectRatio).value}
                            options={PREVIS_ASPECT_RATIOS.map((item) => ({ label: item.label, value: item.value }))}
                            onChange={(aspectRatio: PrevisAspectRatio) => onUpdateShot({ aspectRatio })}
                        />
                    </Field>
                    <Field label={translate("canvasA.assetView.duration")}>
                        <InputNumber className="w-full" size="small" min={0.5} max={60} step={0.5} value={shot.duration} addonAfter={translate("canvasTools.previs.previsInspectors.second")} onChange={(value) => onUpdateShot({ duration: value || 5 })} />
                    </Field>
                    <Field label={translate("canvasTools.previs.previsInspectors.frameRate")}>
                        <Select className="w-full" size="small" value={shot.fps} options={[24, 25, 30].map((fps) => ({ label: `${fps} fps`, value: fps }))} onChange={(fps: 24 | 25 | 30) => onUpdateShot({ fps })} />
                    </Field>
                </div>
            </InspectorGroup>
            {camera ? (
                <>
                    <InspectorGroup title={translate("canvasTools.previs.previsInspectors.shot")} hint={`${camera.focalLength}mm · f/${camera.aperture}`}>
                        <div className="previs-focal-chips" role="group" aria-label={translate("canvasTools.previs.previsInspectors.commonFocalLengths")}>
                            {FOCAL_PRESETS.map((value) => (
                                <button key={value} type="button" className={`previs-focal-chip ${camera.focalLength === value ? "is-active" : ""}`} aria-pressed={camera.focalLength === value} onClick={() => setFocal(value)}>
                                    {value}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <Field label={translate("canvasTools.previs.previsInspectors.focalLength")}>
                                <InputNumber className="w-full" size="small" min={12} max={200} value={camera.focalLength} onChange={(focalLength) => setFocal(focalLength || 35)} />
                            </Field>
                            <Field label={translate("canvasTools.previs.previsInspectors.apertureF")}>
                                <InputNumber className="w-full" size="small" min={0.7} max={32} step={0.1} value={camera.aperture} onChange={(aperture) => onUpdateCamera({ aperture: aperture || 2.8 })} />
                            </Field>
                            <Field label={translate("canvasTools.previs.previsInspectors.focusDistanceM")}>
                                <InputNumber className="w-full" size="small" min={0.1} max={200} step={0.1} value={camera.focusDistance} onChange={(focusDistance) => onUpdateCamera({ focusDistance: focusDistance || 5 })} />
                            </Field>
                        </div>
                    </InspectorGroup>
                    <InspectorGroup title={translate("canvasTools.previs.previsInspectors.cameraPosition")}>
                        <Button size="small" block icon={<Camera className="size-3.5" />} onClick={onAlignCameraToView}>
                            {translate("canvasTools.previs.previsInspectors.alignTheCameraToTheCurrentView")}
                        </Button>
                        <div className="previs-inspector-note">{translate("canvasTools.previs.previsInspectors.navigateToTheDesiredAngleIn3DViewThenClick")}</div>
                        <details className="previs-inspector-advanced">
                            <summary>{translate("canvasTools.previs.previsInspectors.exactCoordinates")}</summary>
                            <div className="previs-inspector-advanced__body">
                                <Vec3Field label={translate("canvasTools.previs.previsInspectors.cameraPosition2")} unit="m" value={camera.transform.position} onChange={(position) => onUpdateCamera({ transform: { ...camera.transform, position } })} />
                                <Vec3Field label={translate("canvasTools.previs.previsInspectors.focus")} unit="m" value={camera.target} onChange={(target) => onUpdateCamera({ target })} />
                            </div>
                        </details>
                    </InspectorGroup>
                </>
            ) : null}
            <InspectorGroup title={translate("canvasA.toolPicker.motion.short")} hint={capabilities.timeline ? undefined : translate("canvasTools.previs.previsInspectors.switchToAnimationToGenerateCameraMovement")}>
                <Select className="w-full" size="small" value={shot.cameraMove} options={cameraMoveOptions} onChange={(cameraMove: PrevisCameraMove) => onUpdateShot({ cameraMove })} />
                {capabilities.timeline && camera ? (
                    <>
                        <div className="previs-anim-guide__actions">
                            <Button size="small" icon={<Video className="size-3.5" />} disabled={shot.cameraMove === "static"} title={translate("canvasTools.previs.previsInspectors.generateStartAndEndKeyframesFromTheSelectedCameraMovement")} onClick={onApplyCameraMove}>
                                {translate("canvasTools.previs.previsInspectors.generateCameraMovement")}
                            </Button>
                            <Button size="small" type={pathDrawing ? "primary" : "default"} icon={<Route className="size-3.5" />} onClick={onToggleDrawPath}>
                                {pathDrawing ? translate("canvasTools.previs.previsInspectors.cancelDrawing") : translate("canvasTools.previs.previsInspectors.drawCameraPath")}
                            </Button>
                        </div>
                        {capabilities.keyframes ? (
                            <details className="previs-inspector-advanced">
                                <summary>{translate("canvasTools.previs.previsInspectors.advancedManualKeyframes")}</summary>
                                <div className="previs-inspector-advanced__body">
                                    <Button size="small" block icon={<Focus className="size-3.5" />} onClick={onAddCameraKeyframe}>
                                        {translate("canvasTools.previs.previsInspectors.recordACameraKeyframe")}
                                    </Button>
                                    <div className="previs-inspector-note">{translate("canvasTools.previs.previsInspectors.positionTheCameraAtDifferentTimesAndRecordEachPosition")}</div>
                                </div>
                            </details>
                        ) : null}
                    </>
                ) : null}
            </InspectorGroup>
            <InspectorGroup title={translate("canvasTools.previs.previsInspectors.shotIntent")}>
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={shot.prompt} placeholder={translate("canvasTools.previs.previsInspectors.characterPerformanceActionsAndNarrativeGoalsAddedToTheGeneration")} onChange={(event) => onUpdateShot({ prompt: event.target.value })} />
            </InspectorGroup>
        </Inspector>
    );
}

export function Inspector({ title, children, onTitleChange, onDuplicate, onDelete }: { title: string; children: ReactNode; onTitleChange: (value: string) => void; onDuplicate?: () => void; onDelete?: () => void }) {
    return (
        <div className="space-y-3 p-3">
            <div className="flex items-center gap-2">
                <Input variant="borderless" value={title} className="min-w-0 flex-1 px-0 font-medium" onChange={(event) => onTitleChange(event.target.value)} />
                {onDuplicate ? (
                    <IconButton label={translate("canvasB.common.copy")} onClick={onDuplicate}>
                        <Copy className="size-4" />
                    </IconButton>
                ) : null}
                {onDelete ? (
                    <IconButton label={translate("common.delete")} onClick={onDelete}>
                        <Trash2 className="size-4" />
                    </IconButton>
                ) : null}
            </div>
            {children}
        </div>
    );
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * 位置（米）、旋转（度，存档仍是弧度）、比例三行，每个输入都带 X/Y/Z 轴标记。
 * 低于地面的高度在提交时由落地规则拉回，这里不做只读限制。
 */
export function TransformFields({
    transform,
    onChange,
    scaleLabel = translate("canvasTools.previs.previsInspectors.zoom"),
    scaleUnit,
    scaleAxisLabels,
}: {
    transform: PrevisTransform;
    onChange: (transform: PrevisTransform) => void;
    scaleLabel?: string;
    scaleUnit?: string;
    scaleAxisLabels?: [string, string, string];
}) {
    const degrees = transform.rotation.map((value) => value * RAD_TO_DEG) as PrevisVec3;
    return (
        <>
            <Vec3Field label={translate("canvasTools.previs.previsInspectors.position")} unit="m" value={transform.position} onChange={(position) => onChange({ ...transform, position })} />
            <Vec3Field label={translate("canvasTools.previs.previsInspectors.rotate")} unit="°" value={degrees} step={5} precision={1} onChange={(rotation) => onChange({ ...transform, rotation: rotation.map((value) => value / RAD_TO_DEG) as PrevisVec3 })} />
            <Vec3Field label={scaleLabel} unit={scaleUnit} value={transform.scale} step={0.1} axisLabels={scaleAxisLabels} onChange={(scale) => onChange({ ...transform, scale })} />
        </>
    );
}

/** 检查器分组：小标题 + 可选右侧提示，组间留白与分隔线由 CSS 负责。 */
export function InspectorGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <section className="previs-inspector-group" aria-label={title}>
            <div className="previs-inspector-group__title">
                <span>{title}</span>
                {hint ? <span className="previs-inspector-group__hint">{hint}</span> : null}
            </div>
            <div className="previs-inspector-group__body">{children}</div>
        </section>
    );
}

function ProfileSlider({ label, min, max, step = 0.01, value, suffix, onChange }: { label: string; min: number; max: number; step?: number; value: number; suffix?: string; onChange: (value: number) => void }) {
    return (
        <div className="previs-profile-slider">
            <span className="previs-profile-slider__label">{label}</span>
            <Slider className="m-0" min={min} max={max} step={step} value={value} aria-label={label} onChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? value) : next)} />
            <span className="previs-profile-slider__value">{suffix ?? value.toFixed(2)}</span>
        </div>
    );
}

export function BoneRotationFields({ rotation, onChange, onChangeComplete }: { rotation: PrevisQuat; onChange: (rotation: PrevisQuat) => void; onChangeComplete: () => void }) {
    const initialDegrees = useMemo(() => {
        const euler = new Euler().setFromQuaternion(new Quaternion(...rotation), "XYZ");
        return [euler.x, euler.y, euler.z].map((value) => Number(((value * 180) / Math.PI).toFixed(1))) as PrevisVec3;
    }, [rotation]);
    const [degrees, setDegrees] = useState<PrevisVec3>(initialDegrees);
    const lastEmittedRotation = useRef<PrevisQuat | null>(null);
    useEffect(() => {
        if (lastEmittedRotation.current && samePrevisQuaternion(rotation, lastEmittedRotation.current)) {
            lastEmittedRotation.current = null;
            return;
        }
        setDegrees(initialDegrees);
    }, [initialDegrees, rotation]);
    const updateAxis = (index: number, value: number) => {
        const next = degrees.map((entry, entryIndex) => (entryIndex === index ? value : entry)) as PrevisVec3;
        const radians = next.map((entry) => (entry * Math.PI) / 180) as PrevisVec3;
        const nextRotation = new Quaternion().setFromEuler(new Euler(radians[0], radians[1], radians[2], "XYZ")).toArray() as PrevisQuat;
        setDegrees(next);
        lastEmittedRotation.current = nextRotation;
        onChange(nextRotation);
    };
    return (
        <Field label={translate("canvasTools.previs.previsInspectors.boneRotationLocalAngle")}>
            <div className="space-y-2">
                {degrees.map((value, index) => (
                    <div key={index} className="grid grid-cols-[18px_minmax(0,1fr)_48px] items-center gap-2">
                        <span className="text-[var(--fs-tiny)] font-medium opacity-65">{["X", "Y", "Z"][index]}</span>
                        <Slider className="m-0" min={-180} max={180} step={1} value={value} onChange={(next) => updateAxis(index, Array.isArray(next) ? (next[0] ?? 0) : next)} onChangeComplete={onChangeComplete} />
                        <span className="text-right text-[var(--fs-tiny)] tabular-nums opacity-65">{value.toFixed(1)}°</span>
                    </div>
                ))}
            </div>
        </Field>
    );
}

export function samePrevisQuaternion(left: PrevisQuat, right: PrevisQuat) {
    const directDistance = left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0);
    const inverseDistance = left.reduce((sum, value, index) => sum + Math.abs(value + right[index]), 0);
    return Math.min(directDistance, inverseDistance) < 0.0001;
}

const VEC3_AXES = ["X", "Y", "Z"] as const;

export function Vec3Field({
    label,
    value,
    step = 0.1,
    precision = 2,
    unit,
    axisLabels,
    onChange,
}: {
    label: string;
    value: PrevisVec3;
    step?: number;
    precision?: number;
    unit?: string;
    axisLabels?: [string, string, string];
    onChange: (value: PrevisVec3) => void;
}) {
    return (
        <div className="previs-vec3">
            <span className="previs-vec3__label">
                {label}
                {unit ? <span className="previs-vec3__unit">{unit}</span> : null}
            </span>
            <div className="previs-vec3__inputs">
                {value.map((item, index) => {
                    const axis = axisLabels?.[index] ?? VEC3_AXES[index];
                    return (
                        <label key={index} className={`previs-vec3__axis previs-vec3__axis--${VEC3_AXES[index].toLowerCase()}`}>
                            <span className="previs-vec3__axis-tag" aria-hidden="true">
                                {axis}
                            </span>
                            <InputNumber
                                className="w-full"
                                size="small"
                                variant="borderless"
                                step={step}
                                aria-label={`${label} ${axis}`}
                                value={Number(item.toFixed(precision))}
                                onChange={(next) => onChange(value.map((entry, itemIndex) => (itemIndex === index ? Number(next) || 0 : entry)) as PrevisVec3)}
                            />
                        </label>
                    );
                })}
            </div>
        </div>
    );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-[var(--fs-label)] opacity-55">{label}</span>
            {children}
        </label>
    );
}

export function PanelTitle({ title, action }: { title: string; action?: ReactNode }) {
    return (
        <div className="flex h-9 items-center px-3 text-[var(--fs-tiny)] font-semibold uppercase opacity-55">
            <span className="flex-1">{title}</span>
            {action}
        </div>
    );
}

/**
 * 场景列表行。选择按钮点完必须释放焦点：
 *「点选对象 -> 按 Delete」是 delete-selected 快捷键的主流程，
 * 焦点留在按钮上会让守卫把 Delete 吃掉。
 */
export function SceneRow({ active, icon, label, onClick, onDelete }: { active?: boolean; icon: ReactElement; label: string; onClick: () => void; onDelete?: () => void }) {
    return (
        <div className={`flex h-8 w-full items-center gap-1 px-1 text-left text-xs transition ${active ? "bg-black/10 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5"}`}>
            <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left"
                onClick={(event) => {
                    onClick();
                    releasePrevisFocusAfterPointer(event);
                }}
            >
                <span className="[&>svg]:size-3.5">{icon}</span>
                <span className="truncate">{label}</span>
            </button>
            {onDelete ? (
                <button
                    type="button"
                    aria-label={translate("canvasTools.previs.previsInspectors.delete", { v0: String(label) })}
                    title={translate("canvasTools.previs.previsInspectors.delete", { v0: String(label) })}
                    className="grid size-6 shrink-0 place-items-center rounded opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                    onClick={(event) => {
                        event.stopPropagation();
                        onDelete();
                        releasePrevisFocusAfterPointer(event);
                    }}
                >
                    <Trash2 className="size-3.5" />
                </button>
            ) : null}
        </div>
    );
}

export function AddMenuButton({ label, items }: { label: string; items: MenuProps["items"] }) {
    return (
        <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items }}>
            <button type="button" aria-label={label} title={label} className="grid size-8 shrink-0 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10">
                <Plus className="size-3.5" />
            </button>
        </Dropdown>
    );
}

export function QuickAdd({ label, icon, onClick }: { label: string; icon: ReactElement; onClick: () => void }) {
    return (
        <button
            type="button"
            className="flex h-8 items-center gap-2 border px-2 text-[var(--fs-tiny)] transition hover:bg-black/5 dark:hover:bg-white/5"
            onClick={(event) => {
                onClick();
                releasePrevisFocusAfterPointer(event);
            }}
        >
            <span className="[&>svg]:size-3.5">{icon}</span>
            <span className="truncate">{label}</span>
        </button>
    );
}

export function IconButton({ label, disabled, children, onClick }: { label: string; disabled?: boolean; children: ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            className="grid size-8 shrink-0 place-items-center rounded-md transition hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
            onClick={(event) => {
                onClick();
                releasePrevisFocusAfterPointer(event);
            }}
        >
            {children}
        </button>
    );
}
