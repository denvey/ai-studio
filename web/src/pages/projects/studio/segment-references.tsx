import { useRef, useState, type ReactNode } from "react";
import { App, Button, Input, Popover } from "antd";
import { ArrowDown, ArrowUp, Check, Library, Plus, RotateCcw, Search, Trash2, Upload, ZoomIn } from "lucide-react";

import { CanvasImagePreview } from "@/components/canvas/canvas-image-preview";
import type { DramaCast, DramaSegment, DramaSegmentReferencePatch, DramaShot } from "@/services/api/drama";
import { uploadResourceFile } from "@/services/api/resources";
import { MediaThumb, parseList } from "../drama-shared";
import { CastLibraryPicker } from "./cast-library-picker";
import { CastVoicePreview } from "./cast-voice";
import { referenceMissingReason } from "./segment-parts";
import { translate } from "@/i18n";

const ASSET_KINDS = ["character", "scene", "prop"] as const;
const KIND_LABEL = {
    character: translate("drama.studio.segmentReferences.characters"),
    scene: translate("drama.studio.segmentReferences.scene"),
    prop: translate("drama.studio.segmentReferences.props"),
    image: translate("drama.studio.segmentReferences.additionalImages"),
};
type AssetKind = keyof typeof KIND_LABEL;
type Reference = DramaSegment["request"]["references"][number];

function moved<T>(items: T[], from: number, to: number) {
    const result = [...items];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item);
    return result;
}

function castName(cast: DramaCast) {
    return `${cast.name}${cast.lookName ? ` · ${cast.lookName}` : ""}`;
}

/** 分组只改变展示；保存的 ID 顺序仍是提示词编号和模型发送顺序。 */
export function ReferenceBoard({
    segment,
    shots,
    castById,
    busy: saving,
    onSave,
    onOpenCast,
}: {
    segment: DramaSegment;
    shots: DramaShot[];
    castById: Map<string, DramaCast>;
    busy: boolean;
    onSave: (patch: DramaSegmentReferencePatch) => Promise<unknown>;
    onOpenCast: (id: string) => void;
}) {
    const { message } = App.useApp();
    const [menuOpen, setMenuOpen] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [voiceDraft, setVoiceDraft] = useState<string[] | null>(null);
    const [preview, setPreview] = useState<{ resourceId: string; name: string }>();
    const fileRef = useRef<HTMLInputElement>(null);
    const busy = saving || uploading;
    const openPreview = (image: { resourceId: string; name: string }) => {
        setMenuOpen(false);
        setPreview(image);
    };
    const { request } = segment;
    const ids = request.references.filter((ref) => ref.castId).map((ref) => ref.castId);
    const images = request.references.filter((ref) => !ref.castId && ref.resourceId).map((ref) => ({ resourceId: ref.resourceId!, name: ref.name }));
    const refsById = new Map(request.references.filter((ref) => ref.castId).map((ref) => [ref.castId, ref]));
    const selectedVoices = voiceDraft ?? (request.audioReferences || []).map((voice) => voice.castId);
    const audioLimit = request.modelMaxAudios || 0;
    const save = (patch: DramaSegmentReferencePatch) => {
        // 父层 mutation 显示错误；失败后保留服务端选择和本地尚未保存的音色。
        void onSave(patch).catch(() => {});
    };
    const saveIDs = (next: string[]) => save({ referenceCastIds: next });
    const toggleCast = (cast: DramaCast) => {
        if (ids.includes(cast.id)) saveIDs(ids.filter((id) => id !== cast.id));
        else {
            const last = ids.findLastIndex((id) => castById.get(id)?.kind === cast.kind);
            const next = [...ids];
            next.splice(last < 0 ? next.length : last + 1, 0, cast.id);
            saveIDs(next);
        }
    };
    const addImage = async (resourceId: string, name: string) => {
        if (request.references.some((ref) => ref.resourceId === resourceId)) {
            message.info(translate("drama.studio.segmentReferences.thisReferenceImageIsAlreadyAddedToTheSegment"));
            return;
        }
        await onSave({ referenceImages: [...images, { resourceId, name }] });
    };
    const upload = async (file: File) => {
        if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
            message.error(translate("drama.studio.segmentReferences.chooseAnImageNoLargerThan20MB"));
            return;
        }
        setUploading(true);
        try {
            const resource = await uploadResourceFile(file, "image", { fileName: file.name });
            await addImage(resource.id, file.name.replace(/\.[^.]+$/, ""));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("drama.studio.segmentReferences.failedToAddReferenceImage"));
        } finally {
            setUploading(false);
        }
    };

    const activeKinds = [...new Set(ids.map((id) => castById.get(id)?.kind).filter((kind): kind is DramaCast["kind"] => Boolean(kind)))];
    const groupOrder = [...activeKinds, ...ASSET_KINDS.filter((kind) => !activeKinds.includes(kind))];
    const groupedIDs = (kind: DramaCast["kind"]) => ids.filter((id) => castById.get(id)?.kind === kind);
    const moveGroup = (kind: DramaCast["kind"], direction: number) => {
        const index = activeKinds.indexOf(kind);
        saveIDs(moved(activeKinds, index, index + direction).flatMap(groupedIDs));
    };
    const moveCast = (cast: DramaCast, direction: number) => {
        const group = groupedIDs(cast.kind);
        const reordered = moved(group, group.indexOf(cast.id), group.indexOf(cast.id) + direction);
        saveIDs(activeKinds.flatMap((kind) => (kind === cast.kind ? reordered : groupedIDs(kind))));
    };

    const visible = new Set(ids);
    for (const shot of shots) {
        for (const id of [...parseList(shot.castIdsJson), ...parseList(shot.lookCastIdsJson), ...parseList(shot.propIdsJson), shot.sceneCastId || ""]) {
            if (id) visible.add(id);
        }
    }
    // 没选参考图的说话人仍需保留人物卡，让音色可以独立关闭。
    for (const id of new Set([...selectedVoices, ...(request.audioReferences || []).map((voice) => voice.castId)])) {
        if (!ids.some((castId) => (castById.get(castId)?.parentId || castId) === id)) visible.add(id);
    }
    for (const id of visible) {
        const parentId = castById.get(id)?.parentId;
        if (parentId && !ids.includes(parentId)) visible.delete(parentId);
    }
    const voiceControls = (cast: DramaCast) => {
        const character = cast.parentId ? castById.get(cast.parentId) : cast;
        if (!character || character.kind !== "character") return null;
        const selected = selectedVoices.includes(character.id);
        const audio = request.audioReferences?.find((voice) => voice.castId === character.id);
        return (
            <div className="drama-sdx-asset-voice" aria-label={translate("drama.studio.segmentReferences.voice", { v0: String(character.name) })}>
                <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={translate("drama.studio.segmentReferences.voice2", { v0: String(selected ? translate("common.close") : translate("drama.studio.segmentReferences.enable")), v1: String(character.name) })}
                    disabled={busy || (!selected && (!character.voiceSampleResourceId || selectedVoices.length >= audioLimit))}
                    onClick={() => setVoiceDraft(selected ? selectedVoices.filter((id) => id !== character.id) : [...selectedVoices, character.id])}
                >
                    {selected ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                    {translate("library.tasks.params.voice")}
                    {selected ? translate("drama.studio.segmentReferences.enabled") : translate("account.feedback.status.closed")}
                </button>
                <CastVoicePreview resourceId={character.voiceSampleResourceId} name={character.name} />
                <small>
                    {voiceDraft !== null
                        ? translate("drama.studio.segmentReferences.unsavedVoiceChanges")
                        : audio
                          ? audio.sent
                              ? translate("drama.studio.segmentReferences.sentWithRequest", { v0: String(audio.label) })
                              : audio.note
                          : !character.voiceSampleResourceId
                            ? translate("drama.studio.segmentReferences.attachAudioInTheCharacterDesign")
                            : cast.parentId
                              ? translate("drama.studio.segmentReferences.useTheBaseCharacterSVoice")
                              : ""}
                </small>
            </div>
        );
    };
    const renderCast = (cast: DramaCast) => {
        const ref = refsById.get(cast.id);
        const group = groupedIDs(cast.kind);
        const index = group.indexOf(cast.id);
        return (
            <AssetCard
                key={cast.id}
                name={castName(cast)}
                kind={KIND_LABEL[cast.kind]}
                resourceId={ref?.resourceId || cast.imageResourceId}
                badge={ref?.label}
                checked={Boolean(ref)}
                disabled={busy}
                note={
                    ref
                        ? ref.sent
                            ? translate("drama.studio.segmentReferences.sentWithRequest2")
                            : translate("drama.studio.segmentReferences.imageNotAttached", { v0: String(referenceMissingReason(segment, cast, ref.resourceId)) })
                        : translate("drama.studio.segmentReferences.referenceImageNotSelected")
                }
                onToggle={() => toggleCast(cast)}
                onOpen={() => onOpenCast(cast.id)}
                onPreview={openPreview}
                onRaise={index > 0 ? () => moveCast(cast, -1) : undefined}
                onLower={index >= 0 && index < group.length - 1 ? () => moveCast(cast, 1) : undefined}
            >
                {voiceControls(cast)}
            </AssetCard>
        );
    };
    const renderImage = (ref: Reference) => {
        const index = images.findIndex((image) => image.resourceId === ref.resourceId);
        return (
            <AssetCard
                key={ref.resourceId}
                name={ref.name}
                kind={KIND_LABEL.image}
                resourceId={ref.resourceId}
                badge={ref.label}
                checked
                disabled={busy}
                note={ref.sent ? translate("drama.studio.segmentReferences.sentWithRequest2") : translate("drama.studio.segmentReferences.imageNotAttached", { v0: String(referenceMissingReason(segment, undefined, ref.resourceId)) })}
                onToggle={() => save({ referenceImages: images.filter((image) => image.resourceId !== ref.resourceId) })}
                onPreview={openPreview}
                onRaise={index > 0 ? () => save({ referenceImages: moved(images, index, index - 1) }) : undefined}
                onLower={index < images.length - 1 ? () => save({ referenceImages: moved(images, index, index + 1) }) : undefined}
            />
        );
    };
    const first = segment.index === 0 && !request.firstFrameResourceId && !request.firstFramePending;
    const voiceActions = (
        <>
            {segment.audioReferenceMode === "custom" ? (
                <Button size="small" type="text" disabled={busy || voiceDraft !== null} onClick={() => save({ autoAudioReferences: true })}>
                    {translate("drama.studio.segmentReferences.restoreAutomaticVoices")}
                </Button>
            ) : null}
            {voiceDraft !== null ? (
                <>
                    <Button
                        size="small"
                        disabled={busy || selectedVoices.length > audioLimit}
                        onClick={() => {
                            void onSave({ audioCastIds: selectedVoices })
                                .then(() => setVoiceDraft(null))
                                .catch(() => {});
                        }}
                    >
                        {translate("drama.studio.segmentReferences.saveVoiceSelection")}
                    </Button>
                    <Button size="small" type="text" disabled={busy} onClick={() => setVoiceDraft(null)}>
                        {translate("drama.studio.segmentReferences.cancelChanges")}
                    </Button>
                </>
            ) : null}
        </>
    );
    return (
        <section className="drama-sdx-section" aria-label={translate("drama.studio.segmentReferences.segmentReferenceAssets")}>
            <div className="drama-sdx-section-head">
                <span className="drama-sdx-count">
                    {translate("drama.studio.segmentReferences.segmentReferences")} {request.references.filter((ref) => ref.sent).length}/{request.references.length}
                </span>
                <small>
                    {segment.referenceMode === "custom" ? translate("drama.studio.segmentReferences.selectedManually") : translate("drama.studio.segmentReferences.selectedAutomaticallyFromShots")} {translate("drama.studio.segmentReferences.segmentLimit")}{" "}
                    {request.referenceCapacity} {translate("canvasA.characterLibrary.pageItem")}
                    {request.modelMaxImages ? translate("drama.studio.segmentReferences.modelLimitImagesIncludingFirstFrame", { v0: String(request.modelMaxImages) }) : ""}
                </small>
                {segment.referenceMode === "custom" ? (
                    <Button size="small" type="text" disabled={busy} icon={<RotateCcw className="size-3.5" />} onClick={() => save({ autoReferences: true })}>
                        {translate("drama.studio.segmentReferences.restoreAutomaticReferences")}
                    </Button>
                ) : null}
            </div>
            <div className="drama-sdx-assets-foot">
                <Popover
                    trigger="click"
                    placement="bottomLeft"
                    destroyOnHidden
                    open={menuOpen}
                    onOpenChange={setMenuOpen}
                    content={
                        <AssetMenu
                            casts={[...castById.values()]}
                            images={request.references.filter((ref) => !ref.castId)}
                            ids={ids}
                            busy={busy}
                            renderCast={renderCast}
                            renderImage={renderImage}
                            voiceActions={
                                voiceDraft !== null ? (
                                    <>
                                        <small>
                                            {translate("library.tasks.params.voice")} {selectedVoices.length}/{audioLimit}
                                        </small>
                                        {voiceActions}
                                    </>
                                ) : null
                            }
                            onLibrary={() => {
                                setMenuOpen(false);
                                setLibraryOpen(true);
                            }}
                            onUpload={() => fileRef.current?.click()}
                        />
                    }
                >
                    <Button size="small" icon={<Search className="size-3.5" />} aria-expanded={menuOpen}>
                        {translate("drama.studio.segmentReferences.manageReferenceAssets")}
                    </Button>
                </Popover>
                <Button size="small" icon={<Library className="size-3.5" />} disabled={busy} onClick={() => setLibraryOpen(true)}>
                    {translate("canvasB.mention.assetLibrary")}
                </Button>
                <Button size="small" icon={<Upload className="size-3.5" />} loading={uploading} disabled={busy} onClick={() => fileRef.current?.click()}>
                    {translate("canvasPage.batchReferences.uploadLabel")}
                </Button>
                <small>{translate("drama.studio.segmentReferences.reorderCategoriesAndCardsAsNeededRemovingAnAssetOnly")}</small>
            </div>
            <div className="drama-sdx-frame-note">
                {request.firstFrameResourceId ? (
                    <button
                        type="button"
                        aria-label={translate("drama.studio.segmentReferences.previewPreviousSegmentSLastFrame")}
                        onClick={() => setPreview({ resourceId: request.firstFrameResourceId!, name: translate("drama.studio.segmentReferences.previousSegmentSLastFrame") })}
                    >
                        <MediaThumb resourceId={request.firstFrameResourceId} alt={translate("drama.studio.segmentReferences.previousSegmentSLastFrame")} />
                    </button>
                ) : null}
                <span>
                    {first
                        ? translate("drama.studio.segmentReferences.openingSegmentNoFirstFrameGeneratedFromPromptAndReferences")
                        : request.firstFrameResourceId
                          ? translate("drama.studio.segmentReferences.firstFrameLastFrameOfSegment", { v0: String(segment.index) })
                          : translate("drama.studio.segmentReferences.firstFrameWaitingForSegmentVideo", { v0: String(segment.index) })}
                </span>
            </div>
            {groupOrder.map((kind) => {
                const group = [...ids.map((id) => castById.get(id)).filter((cast): cast is DramaCast => Boolean(cast)), ...[...castById.values()].filter((cast) => visible.has(cast.id) && !ids.includes(cast.id))].filter((cast) => cast.kind === kind);
                const index = activeKinds.indexOf(kind);
                return (
                    <section className="drama-sdx-asset-group" aria-label={translate("drama.studio.segmentReferences.references", { v0: String(KIND_LABEL[kind]) })} key={kind}>
                        <div className="drama-sdx-group-head">
                            <strong>{KIND_LABEL[kind]}</strong>
                            <small>
                                {groupedIDs(kind).length} {translate("drama.studio.segmentReferences.references2")}
                            </small>
                            <Button
                                size="small"
                                type="text"
                                disabled={busy || index <= 0}
                                aria-label={translate("drama.studio.segmentReferences.moveGroupEarlier", { v0: String(KIND_LABEL[kind]) })}
                                icon={<ArrowUp className="size-3.5" />}
                                onClick={() => moveGroup(kind, -1)}
                            />
                            <Button
                                size="small"
                                type="text"
                                disabled={busy || index < 0 || index === activeKinds.length - 1}
                                aria-label={translate("drama.studio.segmentReferences.moveGroupLater", { v0: String(KIND_LABEL[kind]) })}
                                icon={<ArrowDown className="size-3.5" />}
                                onClick={() => moveGroup(kind, 1)}
                            />
                        </div>
                        {kind === "character" ? (
                            <div className="drama-sdx-assets-foot">
                                <small>
                                    {translate("library.tasks.params.voice")} {selectedVoices.length}/{audioLimit} ·{" "}
                                    {segment.audioReferenceMode === "custom" ? translate("drama.studio.segmentReferences.selectedManually2") : translate("drama.studio.segmentReferences.enabledAutomaticallyFromDialogue")} ·{" "}
                                    {audioLimit ? translate("drama.studio.segmentReferences.theCurrentModelSupportsNoMoreThanVoices", { v0: String(audioLimit) }) : translate("drama.studio.segmentReferences.theCurrentModelDoesNotSupportReferenceVoices")}
                                </small>
                                {voiceActions}
                            </div>
                        ) : null}
                        {kind === "character" && selectedVoices.length > audioLimit ? <p className="drama-sdx-hint is-error">{translate("drama.studio.segmentReferences.theSelectedVoicesExceedTheModelSLimitDisableSome")}</p> : null}
                        {group.length ? <div className="drama-sdx-assets">{group.map(renderCast)}</div> : <p className="drama-sdx-hint">{translate("drama.sentences.noReferences", { kind: KIND_LABEL[kind] })}</p>}
                    </section>
                );
            })}
            {images.length ? (
                <section className="drama-sdx-asset-group" aria-label={translate("drama.studio.segmentReferences.additionalImageReferences")}>
                    <div className="drama-sdx-group-head">
                        <strong>{translate("drama.studio.segmentReferences.additionalImages")}</strong>
                        <small>{translate("drama.studio.segmentReferences.placedAfterDesignReferences")}</small>
                    </div>
                    <div className="drama-sdx-assets">{request.references.filter((ref) => !ref.castId).map(renderImage)}</div>
                </section>
            ) : null}
            <small className="drama-sdx-hint">{translate("drama.studio.segmentReferences.reorderingChangesReferenceNumbersModelWrittenPromptsMustBeRewritten")}</small>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(file);
                }}
            />
            <CastLibraryPicker open={libraryOpen} cast={{ kind: "character", name: segment.title }} segment onClose={() => setLibraryOpen(false)} onPick={addImage} />
            {preview ? <CanvasImagePreview storageKey={`resource:${preview.resourceId}`} alt={preview.name} onClose={() => setPreview(undefined)} /> : null}
        </section>
    );
}

/** 二级资产菜单保留已选项；搜索角色名、别名或造型名后可直接添加或移除。 */
function AssetMenu({
    casts,
    images,
    ids,
    busy,
    renderCast,
    renderImage,
    voiceActions,
    onLibrary,
    onUpload,
}: {
    casts: DramaCast[];
    images: Reference[];
    ids: string[];
    busy: boolean;
    renderCast: (cast: DramaCast) => ReactNode;
    renderImage: (ref: Reference) => ReactNode;
    voiceActions: ReactNode;
    onLibrary: () => void;
    onUpload: () => void;
}) {
    const [kind, setKind] = useState<AssetKind | "all">("all");
    const [query, setQuery] = useState("");
    const needle = query.trim().toLocaleLowerCase();
    const matches = (text: string) => text.toLocaleLowerCase().includes(needle);
    const filteredCasts = casts.filter((cast) => (kind === "all" || cast.kind === kind) && matches(`${castName(cast)} ${parseList(cast.aliasesJson).join(" ")}`));
    const filteredImages = kind === "all" || kind === "image" ? images.filter((ref) => matches(ref.name)) : [];
    return (
        <div className="drama-root drama-sdx-asset-menu" aria-label={translate("drama.studio.segmentReferences.searchReferenceAssets")}>
            <Input
                allowClear
                value={query}
                prefix={<Search className="size-3.5" />}
                placeholder={translate("drama.studio.segmentReferences.searchCharactersAliasesLooksScenesOrProps")}
                aria-label={translate("canvasA.assetView.searchPlaceholder")}
                onChange={(event) => setQuery(event.target.value)}
            />
            <nav className="drama-sdx-asset-menu-kinds" aria-label={translate("drama.studio.segmentReferences.assetCategory")}>
                {(["all", ...ASSET_KINDS, "image"] as const).map((value) => (
                    <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                        {value === "all" ? translate("canvasA.toolPicker.all") : KIND_LABEL[value]}
                    </button>
                ))}
            </nav>
            <div className="drama-sdx-asset-menu-results">
                {filteredCasts.map(renderCast)}
                {filteredImages.map(renderImage)}
                {!filteredCasts.length && !filteredImages.length ? <p className="drama-sdx-hint">{translate("drama.studio.segmentReferences.noMatchingAssetsTryOtherKeywordsOrAddAssetsFrom")}</p> : null}
            </div>
            <div className="drama-sdx-assets-foot">
                <small>
                    {translate("drama.studio.segmentReferences.added")} {ids.length + images.length} {translate("drama.studio.segmentReferences.itemsUseCardButtonsToAddOrRemove")}
                </small>
                <Button size="small" disabled={busy} onClick={onLibrary}>
                    {translate("canvasB.mention.assetLibrary")}
                </Button>
                <Button size="small" disabled={busy} onClick={onUpload}>
                    {translate("canvasPage.batchReferences.uploadLabel")}
                </Button>
            </div>
            {voiceActions ? <div className="drama-sdx-assets-foot">{voiceActions}</div> : null}
        </div>
    );
}

function AssetCard({
    name,
    kind,
    resourceId,
    badge,
    checked,
    disabled,
    note,
    onToggle,
    onOpen,
    onPreview,
    onRaise,
    onLower,
    children,
}: {
    name: string;
    kind: string;
    resourceId?: string;
    badge?: string;
    checked: boolean;
    disabled: boolean;
    note: string;
    onToggle: () => void;
    onOpen?: () => void;
    onPreview: (image: { resourceId: string; name: string }) => void;
    onRaise?: () => void;
    onLower?: () => void;
    children?: ReactNode;
}) {
    return (
        <article className={`drama-sdx-asset ${checked ? "is-checked" : ""}`} aria-label={translate("drama.studio.segmentReferences.assets", { v0: String(name) })}>
            <button
                type="button"
                className="drama-sdx-asset-thumb"
                disabled={!resourceId}
                aria-label={translate("drama.studio.segmentReferences.enlarge", { v0: String(name) })}
                onClick={() => {
                    if (resourceId) onPreview({ resourceId, name });
                }}
            >
                {resourceId ? <MediaThumb resourceId={resourceId} alt={name} /> : <span>{translate("drama.sentences.noReferenceImage", { kind })}</span>}
                {badge ? <em>{badge}</em> : null}
                {resourceId ? <ZoomIn className="drama-sdx-asset-zoom size-4" /> : null}
            </button>
            {onOpen ? (
                <button type="button" className="drama-sdx-asset-text" onClick={onOpen} aria-label={translate("drama.studio.segmentReferences.viewDesign", { v0: String(name) })}>
                    <b>{name}</b>
                </button>
            ) : (
                <strong className="drama-sdx-asset-text">{name}</strong>
            )}
            <small className="drama-sdx-asset-note">{note}</small>
            <div className="drama-sdx-asset-actions">
                <Button
                    size="small"
                    type="text"
                    icon={checked ? <Trash2 className="size-3.5" /> : <Plus className="size-3.5" />}
                    disabled={disabled}
                    aria-label={checked ? translate("drama.studio.segmentReferences.removeReferenceImage", { v0: String(name) }) : translate("drama.studio.segmentReferences.addReferenceImage", { v0: String(name) })}
                    onClick={onToggle}
                >
                    {checked ? translate("canvasB.common.remove") : translate("canvasB.common.add")}
                </Button>
                {checked ? (
                    <>
                        <Button size="small" type="text" disabled={disabled || !onRaise} icon={<ArrowUp className="size-3.5" />} aria-label={translate("drama.studio.segmentReferences.moveEarlier", { v0: String(name) })} onClick={onRaise} />
                        <Button size="small" type="text" disabled={disabled || !onLower} icon={<ArrowDown className="size-3.5" />} aria-label={translate("drama.studio.segmentReferences.moveLater", { v0: String(name) })} onClick={onLower} />
                    </>
                ) : null}
            </div>
            {children}
        </article>
    );
}
