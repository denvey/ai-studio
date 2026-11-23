import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Checkbox, Input, InputNumber, Select, Switch } from "antd";
import { AlertCircle, ArrowRight, Brush, CheckCheck, Clapperboard, Film, FolderOpen, Gem, Inbox, Lock, MapPinned, Maximize2, PauseCircle, RefreshCw, RotateCcw, ScrollText, Upload, UserRound, UsersRound, Cpu, PackageCheck, Play } from "lucide-react";

import { CanvasImagePreview } from "@/components/canvas/canvas-image-preview";
import { dramaChoiceKey, dramaVideoRatioIssue } from "@/lib/drama/model-choice";
import { dramaKeys } from "@/lib/drama/drama-query-keys";
import {
    getDramaCastImpact,
    regenerateDramaCast,
    regenerateDramaCasts,
    setDramaCastImage,
    updateDramaCast,
    updateDramaSettings,
    type DramaCapability,
    type DramaCast,
    type DramaCastKind,
    type DramaEpisodeMode,
    type DramaSettings,
    type DramaInboxItem,
    type DramaMediaMode,
    type DramaReviewMode,
    type DramaSummary,
    type DramaTextThinking,
    type DramaVideoContinuity,
} from "@/services/api/drama";

import { aspectRatioValue, CAST_KIND_LABEL, DIALOGUE_LANGUAGE_LABEL, EpisodeGroupField, formatCredits, MEDIA_MODE_LABEL, mediaBusy, MediaThumb, parseList, VIDEO_CONTINUITY_LABEL } from "../drama-shared";
import { AssetSchemePicker } from "../asset-scheme";
import { DramaModelPicker, useDramaModelCatalog } from "../drama-model-picker";
import { DramaAssetImageModels, DramaTextSteps, VideoResolutionField } from "../step-settings";
import { StoryboardRules } from "../storyboard-rules";
import { progressFillStyle } from "@/lib/progress-fill";
import { uploadResourceFile } from "@/services/api/resources";
import { DramaTakeList } from "./take-list";
import { CastLibraryPicker } from "./cast-library-picker";
import { CastVoiceField, CastVoicePreview } from "./cast-voice";
import { CastLooks } from "./cast-looks";
import { translate } from "@/i18n";
import { dramaStyleDisplayName } from "../style-copy";


// 制作台的三个整页视图：设定（角色 / 道具 / 场景）、待处理、制作设置。都在主区域内展示，不使用抽屉遮挡。

// ===== 设定 =====

const CAST_KIND_ICON: Record<DramaCastKind, ReactNode> = { character: <UserRound className="size-6 opacity-30" />, prop: <Gem className="size-6 opacity-30" />, scene: <MapPinned className="size-6 opacity-30" /> };
const CAST_KINDS: DramaCastKind[] = ["character", "prop", "scene"];

type CastFilter = "all" | "failed" | "busy" | "locked";

/** 资产参考图统一横版 16:9；角色按参考图方案的画幅（内置方案均为 16:9）。图片完整显示不裁切，占位与成图同尺寸。 */
const ASSET_IMAGE_RATIO = "16:9";

function castRatio(kind: DramaCastKind, ratios: CastRatios) {
    const ratio = (kind === "character" && ratios.character) || ASSET_IMAGE_RATIO;
    const [width, height] = ratio.split(":").map(Number);
    const orientation = width && height ? (width > height ? "is-wide" : width < height ? "is-tall" : "is-square") : "is-tall";
    return { style: { "--drama-cast-ratio": aspectRatioValue(ratio) } as CSSProperties, orientation };
}

export type CastRatios = { character: string };

const castImageLoading = <span className="drama-cast-media-state is-loading" role="status" aria-label={translate("drama.studio.panels.loadingReferenceImage")} />;
const castImageFailed = (
    <span className="drama-cast-media-state">
        <AlertCircle className="size-3.5" />
        {translate("drama.studio.panels.imageFailedToLoad")}
    </span>
);

export function CastPanel({
    projectId,
    cast,
    ratios,
    focusId,
    retrying,
    assetsPending,
    releasing,
    onFocus,
    onRetry,
    onChanged,
    onReleaseAssets,
    onOpenCanvas,
    canvasOpening,
}: {
    projectId: string;
    cast: DramaCast[];
    ratios: CastRatios;
    focusId: string;
    retrying: boolean;
    assetsPending: boolean;
    releasing: boolean;
    onFocus: (id: string) => void;
    onRetry: () => void;
    onChanged: () => void;
    onReleaseAssets: () => void;
    /** 把设定投送到精修画布（已投送则定位）。 */
    onOpenCanvas: (castId: string) => void;
    /** 正在打开画布的设定 ID。 */
    canvasOpening?: string;
}) {
    const [kind, setKind] = useState<DramaCastKind>("character");
    const [filter, setFilter] = useState<CastFilter>("all");
    const focused = cast.find((item) => item.id === focusId);
    useEffect(() => {
        if (focused) setKind(focused.kind);
    }, [focused]);
    // 造型行（parentId 非空）不在顶层设定列表里单独成卡，而是归到所属角色的详情里。
    const bases = cast.filter((item) => !item.parentId);
    const ofKind = bases.filter((item) => item.kind === kind);
    const failed = bases.filter((item) => item.imageStatus === "failed").length;
    const count = (predicate: (item: DramaCast) => boolean) => ofKind.filter(predicate).length;
    const filters: Array<[CastFilter, string, number]> = [
        ["all", translate("canvasA.toolPicker.all"), ofKind.length],
        ["failed", translate("library.assets.batch.failed"), count((item) => item.imageStatus === "failed")],
        ["busy", translate("canvasB.mediaVersion.generating"), count((item) => mediaBusy(item.imageStatus))],
        ["locked", translate("drama.studio.panels.locked"), count((item) => item.locked)],
    ];
    const list = ofKind.filter((item) => {
        if (filter === "failed") return item.imageStatus === "failed";
        if (filter === "busy") return mediaBusy(item.imageStatus);
        if (filter === "locked") return item.locked;
        return true;
    });
    const active = focused && focused.kind === kind ? focused : list[0];
    const kindRatio = castRatio(kind, ratios);
    return (
        <div className="drama-view drama-cast-layout">
            <section className="drama-view-main">
                <div className="drama-view-head">
                    <div className="drama-tabs" role="tablist" aria-label={translate("drama.studio.panels.designType")}>
                        {CAST_KINDS.map((value) => (
                            <button key={value} type="button" role="tab" className="drama-tab" aria-selected={kind === value} onClick={() => setKind(value)}>
                                {CAST_KIND_LABEL[value]}
                                <span className="drama-tab-count">{bases.filter((item) => item.kind === value).length}</span>
                            </button>
                        ))}
                    </div>
                    <div className="drama-filters" role="group" aria-label={translate("account.layout.list.filter")}>
                        {filters.map(([key, label, value]) => (
                            <button key={key} type="button" className={`drama-filter ${key === "failed" && value ? "is-alert" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                                {label}
                                <b>{value}</b>
                            </button>
                        ))}
                    </div>
                    {failed ? (
                        <Button className="!ml-auto" icon={<RotateCcw className="size-4" />} loading={retrying} onClick={onRetry}>
                            {translate("drama.studio.panels.retryFailedItems")} {failed} {translate("drama.studio.panels.items")}
                        </Button>
                    ) : null}
                </div>
                <div className="drama-view-scroll thin-scrollbar">
                    {assetsPending && cast.some((item) => item.imageStatus === "") ? (
                        <div className="drama-banner is-ready is-flush">
                            <Clapperboard className="size-5 shrink-0 text-[var(--workspace-accent)]" />
                            <div className="drama-banner-text">
                                <strong>{translate("drama.studio.panels.referenceImagesHaveNotBeenGeneratedYet")}</strong>
                                <span>{translate("drama.studio.panels.reviewCharacterPropAndSceneNamesAndAppearancesBeforeGenerating")}</span>
                            </div>
                            <Button type="primary" icon={<Play className="size-4" />} loading={releasing} onClick={onReleaseAssets}>
                                {translate("drama.studio.panels.generateAllReferences")}
                            </Button>
                        </div>
                    ) : null}
                    <div className={`drama-cast-grid ${kindRatio.orientation}`}>
                        {list.map((item) => (
                            <div key={item.id} className="drama-cast-card" aria-current={item.id === active?.id}>
                                <button type="button" className="block w-full text-left" aria-label={translate("drama.studio.panels.edit", { v0: String(item.name) })} onClick={() => onFocus(item.id)}>
                                    <div className="drama-cast-card-media" style={kindRatio.style}>
                                        {item.imageResourceId ? <MediaThumb resourceId={item.imageResourceId} alt={item.name} loading={castImageLoading} failed={castImageFailed} /> : null}
                                        {!item.imageResourceId || mediaBusy(item.imageStatus) || item.imageStatus === "failed" || item.imageStatus === "" ? (
                                            <div className={`drama-shot-placeholder ${mediaBusy(item.imageStatus) ? "is-busy" : ""}`}>
                                                {item.imageStatus === "failed" ? (
                                                    <span className="drama-cast-card-failed">
                                                        <AlertCircle className="size-3.5" />
                                                        {translate("canvasPage.batches.generationFailed")}
                                                    </span>
                                                ) : item.imageResourceId ? (
                                                    translate("drama.studio.panels.updating")
                                                ) : (
                                                    CAST_KIND_ICON[item.kind]
                                                )}
                                            </div>
                                        ) : null}
                                        {item.locked ? (
                                            <span className="drama-shot-flags">
                                                <span className="drama-flag is-lock">
                                                    <Lock className="size-3" />
                                                </span>
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="drama-cast-card-body">
                                        <strong>{item.name}</strong>
                                        <span>{item.role || parseList(item.aliasesJson).join("、") || item.description || "—"}</span>
                                    </div>
                                </button>
                                {item.kind === "character" ? (
                                    <div className="px-2 pb-2">
                                        <CastVoicePreview resourceId={item.voiceSampleResourceId} name={item.name} />
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                    {!list.length ? (
                        <div className="drama-empty">
                            <UserRound className="size-7" />
                            <span>{ofKind.length ? translate("drama.studio.panels.noDesignsMatchTheFilters") : translate("drama.studio.panels.willAppearHereOnceTheStoryBibleIsReady", { v0: String(CAST_KIND_LABEL[kind]) })}</span>
                        </div>
                    ) : null}
                </div>
            </section>
            <aside className="drama-view-side thin-scrollbar">
                {active ? (
                    <CastEditor
                        key={active.id}
                        projectId={projectId}
                        cast={active}
                        looks={cast.filter((item) => item.parentId === active.id)}
                        ratios={ratios}
                        onChanged={onChanged}
                        onOpenCanvas={() => onOpenCanvas(active.id)}
                        canvasOpening={canvasOpening === active.id}
                    />
                ) : (
                    <div className="drama-empty is-compact">
                        <span>{translate("drama.studio.panels.selectADesignToViewItsDetails")}</span>
                    </div>
                )}
            </aside>
        </div>
    );
}

function CastEditor({ projectId, cast, looks, ratios, onChanged, onOpenCanvas, canvasOpening }: { projectId: string; cast: DramaCast; looks: DramaCast[]; ratios: CastRatios; onChanged: () => void; onOpenCanvas: () => void; canvasOpening: boolean }) {
    const { message } = App.useApp();
    const [previewing, setPreviewing] = useState(false);
    const [name, setName] = useState(cast.name);
    const [aliases, setAliases] = useState(parseList(cast.aliasesJson));
    const [appearance, setAppearance] = useState(cast.appearance);
    const [voiceInstructions, setVoiceInstructions] = useState(cast.voiceInstructions);
    const [restyle, setRestyle] = useState(true);
    const impactQuery = useQuery({ queryKey: dramaKeys.castImpact(projectId, cast.id), queryFn: ({ signal }) => getDramaCastImpact(projectId, cast.id, signal) });
    const dirty = name !== cast.name || appearance !== cast.appearance || voiceInstructions !== cast.voiceInstructions || aliases.join("|") !== parseList(cast.aliasesJson).join("|");
    const fields = { name, aliases, appearance, voiceInstructions };
    const save = useMutation({
        mutationFn: () => updateDramaCast(projectId, cast.id, fields),
        onSuccess: () => {
            message.success(translate("drama.studio.panels.designSaved"));
            onChanged();
        },
        onError: (error) => message.error(error instanceof Error ? error.message : translate("account.settings.memory.saveFailed")),
    });
    const lock = useMutation({ mutationFn: (locked: boolean) => updateDramaCast(projectId, cast.id, { locked }), onSuccess: onChanged });
    const regenerate = useMutation({
        mutationFn: async () => {
            if (dirty) await updateDramaCast(projectId, cast.id, fields);
            return regenerateDramaCast(projectId, cast.id, restyle);
        },
        onSuccess: (result) => {
            message.success(result.affectedSegments ? translate("drama.studio.panels.regeneratingReferenceImageSegmentVideosNeedRegeneration", { v0: String(result.affectedSegments) }) : translate("drama.studio.panels.regeneratingReferenceImage"));
            onChanged();
        },
        onError: (error) => message.error(error instanceof Error ? error.message : translate("library.tasks.page.actionFailed")),
    });
    // 上传或从素材库选的形象图直接成为参考图并锁定：不会被重新生成覆盖，剧情段视频按这张图生成。
    const fileRef = useRef<HTMLInputElement>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const imageAdopted = (result: Awaited<ReturnType<typeof setDramaCastImage>>) => {
        if (result.unchanged) message.info(translate("drama.studio.panels.thisImageIsAlreadyInUse"));
        else message.success(result.affectedSegments ? translate("drama.studio.panels.appearanceReplacedAndLockedSegmentVideosNeedRegeneration", { v0: String(result.affectedSegments) }) : translate("drama.studio.panels.appearanceReplacedAndLockedFutureSegmentVideosWillUseThis"));
        onChanged();
    };
    const upload = useMutation({
        mutationFn: async (file: File) => {
            const resource = await uploadResourceFile(file, "image", { fileName: file.name });
            return setDramaCastImage(projectId, cast.id, resource.id, restyle);
        },
        onSuccess: imageAdopted,
        onError: (error) => message.error(error instanceof Error ? error.message : translate("library.assets.batch.uploadFailed")),
    });
    // 素材库选图的失败由选择弹窗内联显示，这里只处理成功。
    const adoptLibraryImage = async (resourceId: string) => imageAdopted(await setDramaCastImage(projectId, cast.id, resourceId, restyle));
    const impact = impactQuery.data;
    const isCharacter = cast.kind === "character";
    const kindLabel = CAST_KIND_LABEL[cast.kind];
    return (
        <div className="drama-editor">
            <div className="drama-cast-hero" style={castRatio(cast.kind, ratios).style}>
                {cast.imageResourceId ? <MediaThumb resourceId={cast.imageResourceId} alt={cast.name} loading={castImageLoading} failed={castImageFailed} /> : null}
                {cast.imageResourceId ? (
                    <button type="button" className="drama-cast-hero-zoom" aria-label={translate("drama.studio.panels.enlargeTheReferenceImageFor", { v0: String(cast.name) })} title={translate("drama.studio.panels.clickToEnlarge")} onClick={() => setPreviewing(true)}>
                        <span className="drama-cast-hero-zoom-hint" aria-hidden="true">
                            <Maximize2 className="size-3.5" />
                        </span>
                    </button>
                ) : null}
                {!cast.imageResourceId || mediaBusy(cast.imageStatus) || cast.imageStatus === "failed" ? (
                    <div className={`drama-shot-placeholder ${mediaBusy(cast.imageStatus) ? "is-busy" : ""}`}>
                        {cast.imageStatus === "failed" ? (
                            <span className="drama-cast-card-failed">
                                <AlertCircle className="size-4" />
                                {translate("drama.studio.panels.referenceImageGenerationFailed")}
                            </span>
                        ) : mediaBusy(cast.imageStatus) ? (
                            translate("drama.studio.panels.generatingReferenceImage")
                        ) : (
                            translate("drama.studio.panels.noReferenceImageYetReviewTheDescriptionAndGenerateOne")
                        )}
                    </div>
                ) : null}
            </div>
            <div className="drama-editor-row">
                <span className="drama-eyebrow">{kindLabel}{translate("drama.studio.panels.designs")}</span>
                <label className="drama-switch-label">
                    <Lock className="size-3.5" />
                    {translate("drama.studio.panels.lockAppearance")}
                    <Switch size="small" checked={cast.locked} loading={lock.isPending} onChange={(checked) => lock.mutate(checked)} />
                </label>
            </div>
            <Field label={translate("drama.studio.panels.name")}>
                <Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} aria-label={translate("drama.studio.panels.name")} />
            </Field>
            {isCharacter ? (
                <Field label={translate("drama.studio.panels.aliasesAndFormsOfAddress")} hint={translate("drama.studio.panels.theseNamesInTheScriptAllReferToThisCharacter")}>
                    <Select mode="tags" className="w-full" value={aliases} onChange={setAliases} tokenSeparators={[",", "，", "、"]} placeholder={translate("library.assets.batch.tagsPlaceholder")} open={false} suffixIcon={null} aria-label={translate("drama.studio.panels.aliasesAndFormsOfAddress")} />
                </Field>
            ) : null}
            <Field label={APPEARANCE_LABEL[cast.kind]} hint={translate("drama.studio.panels.usedForReferencesAndSegmentVideoPrompts")}>
                <Input.TextArea value={appearance} autoSize={{ minRows: 4, maxRows: 10 }} onChange={(event) => setAppearance(event.target.value)} aria-label={APPEARANCE_LABEL[cast.kind]} />
            </Field>
            {isCharacter ? (
                <Field label={translate("drama.studio.panels.voice")} hint={translate("drama.studio.panels.includedInVideoPromptsToGuideTheVideoModelS")}>
                    <Input value={voiceInstructions} placeholder={translate("drama.studio.panels.youngDeterminedVoiceWithAFairlyFastPace")} onChange={(event) => setVoiceInstructions(event.target.value)} aria-label={translate("drama.studio.panels.voice")} />
                </Field>
            ) : null}
            {isCharacter ? (
                <Field label={translate("drama.studio.panels.voiceSample")} hint={translate("drama.studio.panels.videoModelsSupportingReferenceAudioReceiveThisSampleForSegments")}>
                    <CastVoiceField projectId={projectId} cast={cast} restyle={restyle} onChanged={onChanged} />
                </Field>
            ) : null}
            {isCharacter ? <CastLooks projectId={projectId} character={cast} looks={looks} restyle={restyle} onChanged={onChanged} /> : null}
            <div className="drama-editor-impact">
                <Checkbox checked={restyle} onChange={(event) => setRestyle(event.target.checked)}>
                    {translate("canvasA.dramaAdopt.restyle")}
                </Checkbox>
                {impact ? (
                    <span>
                        {impact.episodes} {translate("drama.studio.panels.episodes")} {impact.segments} {translate("drama.studio.panels.segments")}
                    </span>
                ) : null}
            </div>
            <div className="drama-editor-actions">
                <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
                    {translate("drama.studio.panels.saveDesign")}
                </Button>
                <Button icon={<Upload className="size-4" />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                    {translate("drama.studio.panels.uploadAppearanceImage")}
                </Button>
                <Button className="drama-editor-wide" icon={<FolderOpen className="size-4" />} onClick={() => setLibraryOpen(true)}>
                    {translate("drama.studio.panels.chooseFromAssetLibrary")}
                </Button>
                {libraryOpen ? <CastLibraryPicker open={libraryOpen} cast={cast} onClose={() => setLibraryOpen(false)} onPick={adoptLibraryImage} /> : null}
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    aria-label={translate("drama.studio.panels.uploadAnAppearanceImageFor", { v0: String(cast.name) })}
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        if (!file.type.startsWith("image/")) {
                            message.warning(translate("drama.studio.panels.chooseAPNGJPGOrWebPImage"));
                            return;
                        }
                        if (file.size > 20 * 1024 * 1024) {
                            message.warning(translate("drama.studio.panels.imagesMustBe20MBOrSmaller"));
                            return;
                        }
                        upload.mutate(file);
                    }}
                />
                <Button type="primary" className="drama-editor-wide" icon={<RefreshCw className="size-4" />} disabled={cast.locked || mediaBusy(cast.imageStatus)} loading={regenerate.isPending} onClick={() => regenerate.mutate()}>
                    {cast.imageResourceId ? (dirty ? translate("drama.studio.panels.saveAndRegenerate") : translate("drama.studio.panels.regenerate")) : dirty ? translate("drama.studio.panels.saveAndGenerateReference") : translate("drama.studio.panels.generateReferenceImage")}
                </Button>
                <Button className="drama-editor-wide" icon={<Brush className="size-4" />} loading={canvasOpening} onClick={onOpenCanvas}>
                    {translate("drama.studio.panels.refineOnCanvas")}
                </Button>
            </div>
            <p className="drama-editor-note">{translate("drama.studio.panels.previousVersionsRemainInVersionHistoryLockedReferenceImagesWill")}</p>
            <DramaTakeList projectId={projectId} ownerId={cast.id} kind="cast" />
            {previewing && cast.imageResourceId ? <CanvasImagePreview storageKey={`resource:${cast.imageResourceId}`} alt={translate("drama.studio.panels.referenceImage", { v0: String(cast.name), v1: String(kindLabel) })} onClose={() => setPreviewing(false)} /> : null}
        </div>
    );
}

const APPEARANCE_LABEL: Record<DramaCastKind, string> = { character: translate("drama.studio.panels.appearanceDescription"), prop: translate("drama.studio.panels.shapeAndAppearance"), scene: translate("drama.studio.panels.environmentDescription") };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="drama-field">
            <div className="drama-field-label">
                <span>{label}</span>
                {hint ? <small>{hint}</small> : null}
            </div>
            {children}
        </div>
    );
}

// ===== 待处理 =====

type InboxGroup = {
    key: string;
    kind: DramaInboxItem["kind"];
    severity: DramaInboxItem["severity"];
    title: string;
    reason: string;
    items: DramaInboxItem[];
};

const KIND_ORDER: DramaInboxItem["kind"][] = ["paused", "media_ready", "review", "episode_error", "cast_failed", "segment_failed"];
const MEDIA_LABEL: Record<NonNullable<DramaInboxItem["media"]>, string> = { prompt: translate("canvasA.assetView.prompt"), video: translate("account.feedback.video") };

/** 同类、同原因的问题折叠成一组：12 个角色同样的失败只占一张卡。 */
function groupInbox(items: DramaInboxItem[]): InboxGroup[] {
    const groups = new Map<string, InboxGroup>();
    for (const item of items) {
        const reason = item.kind === "review" ? "" : item.detail;
        const key = [item.kind, item.castKind || "", item.media || "", reason].join("|");
        const group = groups.get(key);
        if (group) group.items.push(item);
        else groups.set(key, { key, kind: item.kind, severity: item.severity, title: "", reason, items: [item] });
    }
    for (const group of groups.values()) {
        const count = group.items.length;
        const first = group.items[0];
        if (group.kind === "paused") group.title = translate("drama.studio.panels.productionPaused");
        else if (group.kind === "media_ready") group.title = first.title;
        else if (group.kind === "review") group.title = count > 1 ? translate("drama.studio.panels.episodesHaveVideoPromptsAwaitingReview", { v0: String(count) }) : first.title;
        else if (group.kind === "episode_error") group.title = count > 1 ? translate("drama.studio.panels.episodesEncounteredAdaptationProblems", { v0: String(count) }) : first.title;
        else if (group.kind === "cast_failed") group.title = translate("drama.studio.panels.referenceImagesFailedToGenerate", { v0: String(count), v1: String(CAST_KIND_LABEL[first.castKind || "character"]) });
        else group.title = translate("drama.studio.panels.segmentsFailedToGenerate", { v0: String(count), v1: String(MEDIA_LABEL[first.media || "video"]) });
    }
    return [...groups.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.items.length - a.items.length);
}

const GROUP_ICON: Record<DramaInboxItem["kind"], ReactNode> = {
    paused: <PauseCircle className="size-[18px]" />,
    media_ready: <PackageCheck className="size-[18px]" />,
    review: <CheckCheck className="size-[18px]" />,
    episode_error: <ScrollText className="size-[18px]" />,
    cast_failed: <UserRound className="size-[18px]" />,
    segment_failed: <Film className="size-[18px]" />,
};

const MEDIA_ICON: Record<NonNullable<DramaInboxItem["media"]>, ReactNode> = {
    prompt: <ScrollText className="size-3" />,
    video: <Film className="size-3" />,
};

const CHIP_LIMIT = 24;

export function InboxPanel({
    items,
    castById,
    retrying,
    retryingGroup,
    releasing,
    onRetryAll,
    onRetryGroup,
    onOpen,
    onOpenSettings,
    onReleaseAll,
}: {
    items: DramaInboxItem[];
    castById: Map<string, DramaCast>;
    retrying: boolean;
    retryingGroup: string;
    onRetryAll: () => void;
    onRetryGroup: (key: string, items: DramaInboxItem[]) => void;
    onOpen: (item: DramaInboxItem) => void;
    onOpenSettings: () => void;
    releasing: boolean;
    onReleaseAll: () => void;
}) {
    const groups = useMemo(() => groupInbox(items), [items]);
    const failures = items.filter((item) => item.severity === "error").length;
    const reviews = items.filter((item) => item.kind === "review").length;
    return (
        <div className="drama-view">
            <section className="drama-view-main">
                <div className="drama-view-head">
                    <h2 className="drama-view-title">{translate("account.feedback.status.pending")}</h2>
                    {items.length ? (
                        <div className="drama-inbox-summary">
                            {failures ? (
                                <span className="is-err">
                                    <AlertCircle className="size-3.5" />
                                    {failures} {translate("drama.studio.panels.failedItems")}
                                </span>
                            ) : null}
                            {reviews ? (
                                <span className="is-info">
                                    <CheckCheck className="size-3.5" />
                                    {reviews} {translate("drama.studio.panels.episodesAwaitingReview")}
                                </span>
                            ) : null}
                            <span>{translate("drama.studio.panels.total")} {groups.length} {translate("drama.studio.panels.categories")}</span>
                        </div>
                    ) : null}
                    {failures ? (
                        <Button className="!ml-auto" icon={<RotateCcw className="size-4" />} loading={retrying} onClick={onRetryAll}>
                            {translate("drama.studio.panels.retryAll")}
                        </Button>
                    ) : null}
                </div>
                <div className="drama-view-scroll thin-scrollbar">
                    {groups.length ? (
                        <div className="drama-inbox">
                            {groups.map((group) => {
                                const retryable = group.kind === "cast_failed" || group.kind === "segment_failed";
                                return (
                                    <article key={group.key} className={`drama-inbox-card is-${group.severity}`}>
                                        <header className="drama-inbox-card-head">
                                            <span className={`drama-inbox-icon is-${group.severity}`}>{GROUP_ICON[group.kind]}</span>
                                            <div className="min-w-0 flex-1">
                                                <h3>{group.title}</h3>
                                                {group.kind === "review" ? (
                                                    <p>{translate("drama.studio.panels.reviewSegmentVideoPromptsAndReferenceImagesThenContinueGenerating")}</p>
                                                ) : group.kind === "cast_failed" ? (
                                                    <p>{translate("drama.studio.panels.editTheAppearanceDescriptionAndRegenerateOrRetryNow")}</p>
                                                ) : group.kind === "media_ready" ? (
                                                    <p>{group.items[0].detail}</p>
                                                ) : null}
                                            </div>
                                            <div className="drama-inbox-card-actions">
                                                {group.kind === "paused" ? (
                                                    <Button size="small" onClick={onOpenSettings}>
                                                        {translate("drama.studio.panels.openSettings")}
                                                    </Button>
                                                ) : null}
                                                {group.kind === "media_ready" ? (
                                                    <Button size="small" type="primary" icon={<Play className="size-3.5" />} loading={releasing} onClick={onReleaseAll}>
                                                        {translate("drama.studio.panels.generateAll")}
                                                    </Button>
                                                ) : null}
                                                {retryable ? (
                                                    <Button size="small" icon={<RotateCcw className="size-3.5" />} loading={retryingGroup === group.key} onClick={() => onRetryGroup(group.key, group.items)}>
                                                        {translate("common.retry")}{group.items.length > 1 ? translate("drama.studio.panels.items2", { v0: String(group.items.length) }) : ""}
                                                    </Button>
                                                ) : null}
                                                {group.items.length === 1 && group.kind !== "paused" && group.kind !== "media_ready" ? (
                                                    <Button size="small" type={group.kind === "review" ? "primary" : "default"} onClick={() => onOpen(group.items[0])}>
                                                        {group.kind === "review" ? translate("drama.studio.panels.review") : translate("drama.studio.panels.view")}
                                                        <ArrowRight className="size-3.5" />
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </header>
                                        {group.reason && group.kind !== "media_ready" ? (
                                            <div className="drama-inbox-reason" title={group.reason}>
                                                <span>{translate("drama.studio.panels.reason")}</span>
                                                <code>{group.reason}</code>
                                            </div>
                                        ) : null}
                                        {group.items.length > 1 || group.kind === "cast_failed" ? (
                                            <div className="drama-inbox-chips">
                                                {group.items.slice(0, CHIP_LIMIT).map((item) => (
                                                    <InboxChip key={item.id} item={item} cast={item.castId ? castById.get(item.castId) : undefined} onOpen={onOpen} />
                                                ))}
                                                {group.items.length > CHIP_LIMIT ? <span className="drama-inbox-more">{translate("drama.studio.panels.also")} {group.items.length - CHIP_LIMIT} {translate("library.picker.itemUnit")}</span> : null}
                                            </div>
                                        ) : null}
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="drama-empty is-tall">
                            <Inbox className="size-8" />
                            <strong>{translate("drama.studio.panels.everythingIsOnTrack")}</strong>
                            <span>{translate("drama.studio.panels.nothingNeedsYourAttentionThePipelineWillNotifyYouWhen")}</span>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

function InboxChip({ item, cast, onOpen }: { item: DramaInboxItem; cast?: DramaCast; onOpen: (item: DramaInboxItem) => void }) {
    let content: ReactNode;
    if (item.kind === "cast_failed") {
        content = (
            <>
                <span className="drama-avatar">{cast?.imageResourceId ? <MediaThumb resourceId={cast.imageResourceId} alt="" /> : item.title.slice(0, 1)}</span>
                {item.title}
            </>
        );
    } else if (item.kind === "segment_failed") {
        content = (
            <>
                {item.media ? MEDIA_ICON[item.media] : null}{translate("drama.sentences.episodeSegment", { episode: item.episodeNumber, segment: item.segmentIndex + 1 })}
            </>
        );
    } else if (item.kind === "review") {
        content = (
            <>
                <Clapperboard className="size-3" />
                {item.title}
            </>
        );
    } else {
        content = item.title;
    }
    return (
        <button type="button" className={`drama-inbox-chip ${item.kind === "cast_failed" ? "has-avatar" : ""}`} title={item.detail} onClick={() => onOpen(item)}>
            {content}
        </button>
    );
}

// ===== 制作设置 =====

const CAPABILITY_META: Record<DramaCapability, { label: string; hint: string }> = {
    text: { label: translate("drama.studio.panels.defaultTextModel"), hint: translate("drama.studio.panels.episodePlanningAndTextStepsWithoutASpecificModel") },
    image: { label: translate("drama.studio.panels.defaultImageModel"), hint: translate("drama.studio.panels.referencesWithoutASpecificModel") },
    video: { label: translate("drama.studio.panels.segmentVideo"), hint: translate("drama.studio.panels.oneVideoWithDialogueAndSoundEffectsPerSegmentModels") },
};
const REVIEW_LABEL: Record<DramaReviewMode, { title: string; detail: string }> = {
    sample: { title: translate("drama.studio.panels.reviewPilotFirst"), detail: translate("drama.studio.panels.continueRemainingEpisodesAfterTheEpisode1FinalCutIs") },
    every: { title: translate("drama.studio.panels.reviewEveryEpisode"), detail: translate("drama.studio.panels.pauseBeforeEachEpisodeSVideosToReviewSegmentPrompts") },
    auto: { title: translate("drama.studio.panels.fullyAutomatic"), detail: translate("drama.studio.panels.runThroughTheFinalCutWithoutPausing") },
};
const CONCURRENCY = [2, 4, 6, 8, 12, 16];

export function SettingsPanel({ projectId, summary, cast, onChanged }: { projectId: string; summary: DramaSummary; cast: DramaCast[]; onChanged: () => void }) {
    const { message, modal } = App.useApp();
    const current = summary.production.settings;
    const [settings, setSettings] = useState(current);
    const [budget, setBudget] = useState(summary.production.budgetMicrocredits / 1_000_000);
    useEffect(() => {
        setSettings(summary.production.settings);
        setBudget(summary.production.budgetMicrocredits / 1_000_000);
    }, [summary.production.settings, summary.production.budgetMicrocredits]);
    const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(current) || Math.round(budget * 1_000_000) !== summary.production.budgetMicrocredits, [budget, current, settings, summary.production.budgetMicrocredits]);
    const save = useMutation({
        mutationFn: () => updateDramaSettings(projectId, { settings, budgetMicrocredits: Math.max(0, Math.round((budget || 0) * 1_000_000)) }),
        onSuccess: () => {
            message.success(translate("drama.studio.panels.settingsSavedNewTasksWillUseTheUpdatedConfiguration"));
            onChanged();
        },
        onError: (error) => message.error(error instanceof Error ? error.message : translate("account.settings.memory.saveFailed")),
    });
    const [restyleSegments, setRestyleSegments] = useState(true);
    const regenerateAll = useMutation({
        mutationFn: (kind: DramaCastKind) => regenerateDramaCasts(projectId, kind, restyleSegments),
        onSuccess: (result, kind) => {
            message.success(translate("drama.studio.panels.recreatedReferenceImagesWithTheCurrentScheme", { v0: String(result.queued), v1: String(CAST_KIND_LABEL[kind]), v2: String(result.skipped ? translate("drama.studio.panels.areLockedOrAlreadyGenerating", { v0: String(result.skipped) }) : ""), v3: String(result.affectedSegments ? translate("drama.studio.panels.segmentsNeedRegeneration", { v0: String(result.affectedSegments) }) : "") }));
            onChanged();
        },
        onError: (error) => message.error(error instanceof Error ? error.message : translate("library.tasks.page.actionFailed")),
    });
    const catalogQuery = useDramaModelCatalog();
    const videoOption = catalogQuery.data?.options.video?.find((option) => dramaChoiceKey(option.choice) === dramaChoiceKey(settings.models.video));
    // 角色参考图用单独指定的模型，没有就用默认图片模型；参考图方案按它检查角色画幅。
    const characterImage = dramaChoiceKey(settings.models.characterImage) ? settings.models.characterImage : settings.models.image;
    const imageOption = catalogQuery.data?.options.image?.find((option) => dramaChoiceKey(option.choice) === dramaChoiceKey(characterImage));
    const videoRatioProblem = dramaVideoRatioIssue(videoOption, current.aspectRatio);
    const setModels = (patch: Partial<DramaSettings["models"]>) => setSettings({ ...settings, models: { ...settings.models, ...patch } });
    const continuity: DramaVideoContinuity = settings.videoContinuity || "tail_frame";
    const sampleCharacter = cast.find((item) => item.kind === "character" && item.appearance);
    const sampleScene = cast.find((item) => item.kind === "scene" && item.appearance);
    const countOf = (kind: DramaCastKind) => cast.filter((item) => item.kind === kind).length;
    const spent = summary.production.spentMicrocredits;
    const held = summary.production.heldMicrocredits || 0;
    const budgetMicro = Math.round((budget || 0) * 1_000_000);
    // 预算占用与后端判断同一口径：已扣费加冻结中的订单。
    const usage = budgetMicro > 0 ? Math.min(1, (spent + held) / budgetMicro) : 0;
    return (
        <div className="drama-view">
            <section className="drama-view-main">
                <div className="drama-view-head">
                    <h2 className="drama-view-title">{translate("drama.studio.panels.productionSettings")}</h2>
                    <span className="drama-view-sub">{dirty ? translate("drama.studio.panels.unsavedChanges") : translate("drama.studio.panels.changesOnlyAffectTasksStartedAfterward")}</span>
                    <div className="ml-auto flex gap-2">
                        <Button
                            disabled={!dirty}
                            onClick={() => {
                                setSettings(current);
                                setBudget(summary.production.budgetMicrocredits / 1_000_000);
                            }}
                        >
                            {translate("canvasA.characterStudio.revert")}
                        </Button>
                        <Button type="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
                            {translate("drama.studio.panels.saveSettings")}
                        </Button>
                    </div>
                </div>
                <div className="drama-view-scroll thin-scrollbar">
                    <div className="drama-cfg">
                        <div className="drama-cfg-main">
                            <EpisodeModeCard summary={summary} settings={settings} onChange={(patch) => setSettings({ ...settings, ...patch })} />
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("drama.studio.panels.storyboardRules")} detail={translate("drama.studio.panels.appliesToFutureAdaptationsUseAdaptAgainOnTheScript")} icon={<Clapperboard className="size-4" />} />
                                <StoryboardRules
                                    value={settings.storyboard}
                                    onChange={(storyboard) => setSettings({ ...settings, storyboard })}
                                    episodeSeconds={settings.episodeSeconds}
                                    onEpisodeSecondsChange={(episodeSeconds) => setSettings({ ...settings, episodeSeconds })}
                                    maxVideoSeconds={videoOption?.maxVideoSeconds}
                                    videoModelLabel={settings.models.video?.label}
                                    bare
                                />
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("drama.studio.panels.textStages")} detail={translate("drama.studio.panels.setReasoningIntentTextModelAndWritingSkillForEach")} icon={<ScrollText className="size-4" />} />
                                <DramaTextSteps
                                    models={settings.models}
                                    onModelsChange={setModels}
                                    skills={{ bible: settings.bibleSkill, script: settings.scriptSkill, prompt: settings.promptSkill }}
                                    onSkillChange={(step, value) => setSettings({ ...settings, [step === "bible" ? "bibleSkill" : step === "script" ? "scriptSkill" : "promptSkill"]: value })}
                                    textThinking={settings.textThinking || {}}
                                    onThinkingChange={(step, level) => setSettings({ ...settings, textThinking: { ...settings.textThinking, [step]: level === "auto" ? undefined : level } as DramaTextThinking })}
                                />
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("canvasPage.connection.referenceImage")} detail={translate("drama.studio.panels.referenceImagesAccompanySegmentVideoRequestsToKeepCharactersAnd")} icon={<UsersRound className="size-4" />} />
                                <DramaAssetImageModels models={settings.models} onModelsChange={setModels} assets={settings.assets} onAssetsChange={(assets) => setSettings({ ...settings, assets })} />
                                <AssetSchemePicker
                                    value={settings.assets}
                                    onChange={(assets) => setSettings({ ...settings, assets })}
                                    sample={{ style: settings.stylePrompt, characterName: sampleCharacter?.name, characterAppearance: sampleCharacter?.appearance, sceneName: sampleScene?.name, sceneAppearance: sampleScene?.appearance }}
                                    imageModel={imageOption}
                                />
                                <div className="drama-settings-regen">
                                    <div>
                                        <strong>{translate("drama.studio.panels.recreateExistingReferencesWithTheCurrentScheme")}</strong>
                                        <span>
                                            {CAST_KINDS.map((kind) => translate("drama.sentences.referenceTypeCount", { count: countOf(kind), kind: CAST_KIND_LABEL[kind] })).join(" · ")}{translate("drama.studio.panels.lockedDesignsWillStayUnchanged")}{dirty ? translate("drama.studio.panels.saveTheSettingsFirst") : ""}
                                        </span>
                                    </div>
                                    <Checkbox checked={restyleSegments} onChange={(event) => setRestyleSegments(event.target.checked)}>
                                        {translate("drama.studio.panels.alsoRegenerateSegmentVideosThatReferenceThem")}
                                    </Checkbox>
                                    {CAST_KINDS.map((kind) => (
                                        <Button
                                            key={kind}
                                            disabled={dirty || !countOf(kind)}
                                            loading={regenerateAll.isPending && regenerateAll.variables === kind}
                                            onClick={() =>
                                                modal.confirm({
                                                    title: translate("drama.studio.panels.recreateReferenceImagesWithTheCurrentScheme", { v0: String(countOf(kind)), v1: String(CAST_KIND_LABEL[kind]) }),
                                                    content: translate("drama.studio.panels.everyReferenceImageWillBeRegeneratedAndChargedPreviousVersions", { v0: String(restyleSegments ? translate("drama.studio.panels.andCompletedSegmentVideosReferencingThemWillNeedRegeneration") : "") }),
                                                    okText: translate("drama.studio.panels.recreate"),
                                                    cancelText: translate("common.cancel"),
                                                    centered: true,
                                                    onOk: () => regenerateAll.mutateAsync(kind),
                                                })
                                            }
                                        >
                                            {translate("drama.studio.panels.redo")}{CAST_KIND_LABEL[kind]}
                                        </Button>
                                    ))}
                                </div>
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("drama.studio.panels.productionModels")} detail={translate("drama.studio.panels.onlyPlatformModelsThatSupportUnattendedExecutionAreListed")} icon={<Cpu className="size-4" />} />
                                <div className="drama-cfg-models">
                                    {(Object.keys(CAPABILITY_META) as DramaCapability[]).map((capability) => (
                                        <div key={capability} className="drama-cfg-model">
                                            <div className="drama-cfg-model-label">
                                                <strong>{CAPABILITY_META[capability].label}</strong>
                                                <small>{CAPABILITY_META[capability].hint}</small>
                                            </div>
                                            <DramaModelPicker
                                                capability={capability}
                                                value={settings.models[capability]}
                                                aspectRatio={current.aspectRatio}
                                                videoResolution={settings.videoResolution}
                                                placeholder={translate("drama.studio.panels.selectAModel", { v0: String(CAPABILITY_META[capability].label) })}
                                                onChange={(choice) => setModels({ [capability]: choice })}
                                            />
                                        </div>
                                    ))}
                                    <div className="drama-cfg-model">
                                        <div className="drama-cfg-model-label">
                                            <strong>{translate("drama.studio.panels.videoResolution")}</strong>
                                            <small>{translate("drama.studio.panels.appliesToSegmentVideosSubmittedAfterward")}</small>
                                        </div>
                                        <VideoResolutionField option={videoOption} value={settings.videoResolution} onChange={(videoResolution) => setSettings({ ...settings, videoResolution })} />
                                    </div>
                                </div>
                                {videoRatioProblem ? <p className="drama-cfg-note">{translate("drama.sentences.modelRatioBlocked", { issue: videoRatioProblem })}</p> : null}
                                {videoOption?.generateAudio === false ? <p className="drama-cfg-note">{translate("drama.studio.panels.theCurrentVideoModelDoesNotGenerateSynchronizedAudioSegment")}</p> : null}
                            </section>
                        </div>
                        <aside className="drama-cfg-side">
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("drama.studio.panels.production")} detail={translate("drama.studio.panels.setWhenProductionStarts")} />
                                <dl className="drama-cfg-kv">
                                    <div>
                                        <dt>{translate("drama.studio.panels.frameSize")}</dt>
                                        <dd>{current.aspectRatio}</dd>
                                    </div>
                                    <div>
                                        <dt>{translate("drama.studio.panels.visualStyle")}</dt>
                                        <dd title={dramaStyleDisplayName(current.styleName || "")}>{current.styleName ? dramaStyleDisplayName(current.styleName) : "—"}</dd>
                                    </div>
                                    <div>
                                        <dt>{translate("drama.studio.panels.dialogueLanguage")}</dt>
                                        <dd>{DIALOGUE_LANGUAGE_LABEL[current.language] || current.language}</dd>
                                    </div>
                                </dl>
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("drama.studio.panels.reviewMode")} detail={translate("drama.studio.panels.pauseOnlyAtKeyCheckpoints")} />
                                <CompactRadios
                                    label={translate("drama.studio.panels.reviewMode")}
                                    value={settings.reviewMode}
                                    options={(Object.keys(REVIEW_LABEL) as DramaReviewMode[]).map((mode) => ({ value: mode, ...REVIEW_LABEL[mode] }))}
                                    onChange={(reviewMode) => setSettings({ ...settings, reviewMode })}
                                />
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("drama.studio.panels.generationMode")} detail={settings.mediaMode === "manual" ? translate("drama.studio.panels.episodesAwaitingVideoGeneration", { v0: String(summary.episodes.filter((episode) => episode.awaitingMedia).length) }) : undefined} />
                                <CompactRadios
                                    label={translate("drama.studio.panels.generationMode")}
                                    value={settings.mediaMode}
                                    options={(Object.keys(MEDIA_MODE_LABEL) as DramaMediaMode[]).map((mode) => ({ value: mode, ...MEDIA_MODE_LABEL[mode] }))}
                                    onChange={(mediaMode) => setSettings({ ...settings, mediaMode })}
                                />
                                {settings.mediaMode !== current.mediaMode && settings.mediaMode === "manual" ? <p className="drama-cfg-note">{translate("drama.studio.panels.inManualModeUnapprovedEpisodesPauseAtTheirCurrentStage")}</p> : null}
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("drama.studio.panels.segmentContinuity")} detail={translate("drama.studio.panels.determinesWhetherSegmentsInAnEpisodeCanGenerateConcurrently")} />
                                <CompactRadios
                                    label={translate("drama.studio.panels.segmentContinuity")}
                                    value={continuity}
                                    options={(Object.keys(VIDEO_CONTINUITY_LABEL) as DramaVideoContinuity[]).map((mode) => ({ value: mode, ...VIDEO_CONTINUITY_LABEL[mode] }))}
                                    onChange={(videoContinuity) => setSettings({ ...settings, videoContinuity })}
                                />
                                {continuity === "tail_frame" && videoOption && !videoOption.tailFrameChain ? <p className="drama-cfg-note">{translate("drama.studio.panels.theCurrentVideoModelDoesNotSupportImageToVideo")}</p> : null}
                                {continuity !== (current.videoContinuity || "tail_frame") ? <p className="drama-cfg-note">{translate("drama.studio.panels.existingSegmentPromptsKeepTheirOriginalApproachYouCanRewrite")}</p> : null}
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("drama.studio.panels.concurrentGenerations")} detail={translate("drama.studio.panels.textReferenceImagesAndSegmentVideosAreCountedSeparatelyWithin")} />
                                <div className="drama-tabs drama-cfg-seg" role="radiogroup" aria-label={translate("drama.studio.panels.concurrentGenerations")}>
                                    {CONCURRENCY.map((value) => (
                                        <button key={value} type="button" role="radio" className="drama-tab" aria-checked={settings.concurrency === value} onClick={() => setSettings({ ...settings, concurrency: value })}>
                                            {value}
                                        </button>
                                    ))}
                                </div>
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("drama.studio.panels.maximumReferencesPerSegment")} detail={translate("drama.studio.panels.limitForAutomaticReferenceSelectionPrioritizingCharacters0UsesThe")} />
                                <InputNumber className="!w-full" min={0} max={20} precision={0} value={settings.referenceLimit || 0} onChange={(value) => setSettings({ ...settings, referenceLimit: value || 0 })} suffix={translate("canvasA.characterLibrary.pageItem")} aria-label={translate("drama.studio.panels.maximumReferencesPerSegment")} />
                                <p className="drama-cfg-note">{translate("drama.studio.panels.designsBeyondThisLimitUseTextDescriptionsWithoutImagesTo")}</p>
                            </section>
                            <section className="drama-cfg-card">
                                <SettingsTitle title={translate("drama.studio.panels.budgetLimit")} detail={translate("drama.studio.panels.item0MeansUnlimitedIncludesRefinementCanvasCostsProductionPausesAt")} />
                                <InputNumber className="!w-full" min={0} precision={0} value={budget} onChange={(value) => setBudget(value || 0)} suffix={translate("shell.credits")} aria-label={translate("drama.studio.panels.budgetLimit")} />
                                <div className="drama-budget-meter">
                                    <div className="drama-budget-track">
                                        <span className={usage >= 0.9 ? "is-warn" : ""} style={progressFillStyle(budgetMicro ? Math.max(usage * 100, spent + held ? 2 : 0) : 0)} />
                                    </div>
                                    <span>
                                        {translate("drama.studio.panels.spent")} <b>{formatCredits(spent)}</b>
                                        {held > 0 ? translate("drama.studio.panels.reserved", { v0: String(formatCredits(held)) }) : ""}
                                        {budgetMicro ? ` / ${formatCredits(budgetMicro)}` : (" " + translate("drama.studio.panels.unlimitedBudget"))}
                                    </span>
                                </div>
                                {summary.production.canvasSpentMicrocredits > 0 ? (
                                    <p className="drama-cfg-note">
                                        {translate("drama.studio.panels.ofWhichPipeline")} {formatCredits(Math.max(0, spent - summary.production.canvasSpentMicrocredits))}{translate("drama.studio.panels.refinementCanvas")} {formatCredits(summary.production.canvasSpentMicrocredits)}。
                                    </p>
                                ) : null}
                            </section>
                        </aside>
                    </div>
                </div>
            </section>
        </div>
    );
}

const EPISODE_MODE_OPTIONS: Array<{ value: DramaEpisodeMode; title: string; detail: string }> = [
    { value: "chapter", title: translate("drama.studio.panels.groupByChapter"), detail: translate("drama.studio.panels.splitInChapterOrderWithNChaptersPerEpisode") },
    { value: "auto", title: translate("drama.studio.panels.automaticEpisodeSplitting"), detail: translate("drama.studio.panels.planEpisodesAroundTheStoryMergingOrSplittingChapters") },
];

/**
 * 分集方式：只影响还没分集的章节。分集完成后已有的集可能写好了剧本，不再重新分组，
 * 之后用“逐集追加”继续；剧本与分镜作品总是每章一集。
 */
function EpisodeModeCard({ summary, settings, onChange }: { summary: DramaSummary; settings: DramaSettings; onChange: (patch: Pick<DramaSettings, "episodeMode" | "chaptersPerEpisode">) => void }) {
    const { production, episodes } = summary;
    const novel = (summary.project.sourceType || "novel") === "novel";
    const editable = novel && !production.planDone;
    const mode = settings.episodeMode || (production.planDone ? undefined : "auto");
    const perEpisode = settings.chaptersPerEpisode || 1;
    const current = !novel ? translate("drama.studio.panels.oneChapterPerEpisodeScriptsAndStoryboardsUseHeadings") : settings.episodeMode === "chapter" ? (perEpisode > 1 ? translate("drama.studio.panels.chapterBasedChaptersPerEpisode", { v0: String(perEpisode) }) : translate("drama.studio.panels.chapterBasedOneChapterPerEpisode")) : settings.episodeMode === "auto" ? translate("drama.studio.panels.automaticEpisodeSplitting") : translate("drama.studio.panels.episodesPlanned");
    return (
        <section className="drama-cfg-card">
            <SettingsTitle title={translate("drama.studio.panels.episodeGrouping")} detail={editable ? translate("drama.studio.panels.onlyAffectsUnplannedChaptersAppliesOnTheNextSchedulingCycle") : translate("drama.studio.panels.episodePlanningIsCompleteAndCannotChangeAddNewEpisodes")} icon={<Film className="size-4" />} />
            {editable ? (
                <div className="grid gap-3">
                    <CompactRadios label={translate("drama.studio.panels.episodeGrouping")} value={mode || "auto"} options={EPISODE_MODE_OPTIONS} onChange={(value) => onChange({ episodeMode: value, chaptersPerEpisode: value === "chapter" ? perEpisode : undefined })} />
                    {mode === "chapter" ? <EpisodeGroupField value={perEpisode} onChange={(value) => onChange({ episodeMode: "chapter", chaptersPerEpisode: value })} chapterCount={Math.max(0, production.chapterCount - production.planCursor)} /> : null}
                    {production.planCursor > 0 ? (
                        <p className="drama-cfg-note">
                            {translate("drama.studio.panels.first")} {production.planCursor} {translate("drama.studio.panels.chaptersSplitInto")} {episodes.length} {translate("drama.studio.panels.episodesUnchanged")}
                        </p>
                    ) : null}
                </div>
            ) : (
                <p className="drama-cfg-note">
                    {current} {translate("drama.studio.panels.total2")} {production.chapterCount} {translate("drama.studio.panels.chapters")} {episodes.length} {translate("drama.studio.panels.episodes2")}
                </p>
            )}
        </section>
    );
}

/** 侧栏里的紧凑单选列表：一行标题，说明作为次要文字，选中态只改边框和底色。 */
function CompactRadios<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: Array<{ value: V; title: string; detail: string }>; onChange: (value: V) => void }) {
    return (
        <div className="drama-cfg-radios" role="radiogroup" aria-label={label}>
            {options.map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className="drama-cfg-radio" onClick={() => onChange(option.value)}>
                    <span className="drama-radio" aria-hidden />
                    <span className="min-w-0">
                        <strong>{option.title}</strong>
                        <small>{option.detail}</small>
                    </span>
                </button>
            ))}
        </div>
    );
}

function SettingsTitle({ title, detail, icon }: { title: string; detail?: string; icon?: ReactNode }) {
    return (
        <div className="drama-settings-title">
            <h3>
                {icon}
                {title}
            </h3>
            {detail ? <span>{detail}</span> : null}
        </div>
    );
}
