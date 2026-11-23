import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { App, Button, Input, InputNumber } from "antd";
import { AlertCircle, Check, Pencil, Plus, Shirt, Trash2, X, Play, Upload, Library } from "lucide-react";

import { addDramaCastLook, deleteDramaCastLook, updateDramaCastLook, regenerateDramaCast, setDramaCastImage, updateDramaCast, type DramaCast } from "@/services/api/drama";
import { uploadResourceFile } from "@/services/api/resources";
import { CastLibraryPicker } from "./cast-library-picker";

import { mediaBusy, MediaThumb } from "../drama-shared";
import { translate } from "@/i18n";

const MAX_LOOKS = 6;
type LookInput = { lookName: string; appearance: string; imagePrompt: string; fromChapter?: number; toChapter?: number };

function chapterLabel(from?: number, to?: number) {
    if (from && to) return translate("drama.studio.castLooks.chapters", { v0: String(from), v1: String(to) });
    if (from) return translate("drama.studio.castLooks.fromChapter", { v0: String(from) });
    if (to) return translate("drama.studio.castLooks.beforeChapter", { v0: String(to) });
    return translate("drama.studio.castLooks.allChapters");
}

/** 一套造型的编辑表单（新增或修改共用）。 */
function LookForm({ initial, submitting, onCancel, onSubmit }: { initial?: DramaCast; submitting: boolean; onCancel: () => void; onSubmit: (value: LookInput) => void }) {
    const [name, setName] = useState(initial?.lookName || "");
    const [appearance, setAppearance] = useState(initial?.appearance || "");
    const [imagePrompt, setImagePrompt] = useState(initial?.imagePrompt || "");
    const [from, setFrom] = useState<number | null>(initial?.lookFromChapter || null);
    const [to, setTo] = useState<number | null>(initial?.lookToChapter || null);
    const valid = name.trim() && appearance.trim();
    return (
        <div className="drama-look-form">
            <Input value={name} maxLength={60} placeholder={translate("drama.studio.castLooks.lookNameEGApprenticeOrCEO")} aria-label={translate("drama.studio.castLooks.lookName")} onChange={(event) => setName(event.target.value)} />
            <Input.TextArea
                value={appearance}
                maxLength={1000}
                autoSize={{ minRows: 2, maxRows: 5 }}
                placeholder={translate("drama.studio.castLooks.clothingHairstyleAndMakeupForThisLookFacialFeaturesStay")}
                aria-label={translate("drama.studio.castLooks.lookAppearance")}
                onChange={(event) => setAppearance(event.target.value)}
            />
            <label className="drama-field-label">{translate("drama.studio.castLooks.lookGenerationPrompt")}</label>
            <Input.TextArea
                value={imagePrompt}
                maxLength={12000}
                autoSize={{ minRows: 3, maxRows: 8 }}
                placeholder={translate("drama.studio.castLooks.customizeClothingMakeupHairstyleCompositionAndOtherImageRequirementsLeave")}
                aria-label={translate("drama.studio.castLooks.lookGenerationPrompt")}
                onChange={(event) => setImagePrompt(event.target.value)}
            />
            <small>{translate("drama.studio.castLooks.theBasePortraitKeepsTheCharacterConsistentConfirmingOnlySaves")}</small>
            <div className="drama-look-form-range">
                <span>{translate("drama.studio.castLooks.defaultChapterRange")}</span>
                <InputNumber size="small" min={0} precision={0} value={from} placeholder={translate("drama.studio.castLooks.firstChapter")} aria-label={translate("drama.studio.castLooks.firstChapter")} onChange={(value) => setFrom(value)} />
                <span>{translate("drama.studio.castLooks.to")}</span>
                <InputNumber size="small" min={0} precision={0} value={to} placeholder={translate("drama.studio.castLooks.lastChapter")} aria-label={translate("drama.studio.castLooks.lastChapter")} onChange={(value) => setTo(value)} />
                <small>{translate("drama.studio.castLooks.setAnEndpointTo0OrLeaveItBlankFor")}</small>
            </div>
            <div className="drama-look-form-actions">
                <Button size="small" icon={<X className="size-3.5" />} onClick={onCancel}>
                    {translate("common.cancel")}
                </Button>
                <Button
                    size="small"
                    type="primary"
                    icon={<Check className="size-3.5" />}
                    loading={submitting}
                    disabled={!valid}
                    onClick={() => onSubmit({ lookName: name.trim(), appearance: appearance.trim(), imagePrompt: imagePrompt.trim(), fromChapter: from ?? 0, toChapter: to ?? 0 })}
                >
                    {translate("drama.studio.castLooks.confirmAndSave")}
                </Button>
            </div>
        </div>
    );
}

/**
 * 角色造型（多妆造）：一个角色可有多套造型（如散修 / 外门弟子 / 内门弟子 / 长老），每套有自己的外观与参考图，
 * 以角色本体参考图为底图生成以保持同一张脸。写剧本时按本集章节选默认造型，AI 也会按剧情在镜头里换造型。
 */
export function CastLooks({ projectId, character, looks, restyle, onChanged }: { projectId: string; character: DramaCast; looks: DramaCast[]; restyle: boolean; onChanged: () => void }) {
    const { message, modal } = App.useApp();
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string>();
    const [libraryLook, setLibraryLook] = useState<DramaCast>();
    const fileRef = useRef<HTMLInputElement>(null);
    const uploadLookRef = useRef<DramaCast | undefined>(undefined);
    const done = (text: string, affected?: number) => {
        message.success(affected ? translate("drama.studio.castLooks.segmentVideosNeedRegeneration", { v0: String(text), v1: String(affected) }) : text);
        setAdding(false);
        setEditingId(undefined);
        onChanged();
    };
    const add = useMutation({
        mutationFn: (value: LookInput) => addDramaCastLook(projectId, character.id, value),
        onSuccess: () => done(translate("drama.studio.castLooks.lookSavedUploadACustomImageOrGenerateAnImage")),
        onError: (error) => message.error(error instanceof Error ? error.message : translate("drama.studio.castLooks.failedToAdd")),
    });
    const update = useMutation({
        mutationFn: ({ id, value }: { id: string; value: LookInput }) => updateDramaCastLook(projectId, id, { ...value, restyleSegments: restyle }),
        onSuccess: (result) => done(translate("drama.studio.castLooks.lookUpdated"), result.affectedSegments),
        onError: (error) => message.error(error instanceof Error ? error.message : translate("drama.studio.castLooks.updateFailed")),
    });
    const remove = useMutation({
        mutationFn: (id: string) => deleteDramaCastLook(projectId, id, restyle),
        onSuccess: (result) => done(translate("drama.studio.castLooks.lookDeletedReferencingShotsNowUseTheBaseCharacter"), result.affectedSegments),
        onError: (error) => message.error(error instanceof Error ? error.message : translate("library.picker.deleteFailed")),
    });
    const generate = useMutation({
        mutationFn: async (look: DramaCast) => {
            if (look.locked) await updateDramaCast(projectId, look.id, { locked: false });
            return regenerateDramaCast(projectId, look.id, restyle);
        },
        onSuccess: (result) => done(translate("drama.studio.castLooks.lookImageGenerationRequested"), result.affectedSegments),
        onError: (error) => message.error(error instanceof Error ? error.message : translate("canvasPage.batches.generationFailed")),
    });
    const upload = useMutation({
        mutationFn: async ({ look, file }: { look: DramaCast; file: File }) => {
            const resource = await uploadResourceFile(file, "image", { fileName: file.name });
            return setDramaCastImage(projectId, look.id, resource.id, restyle);
        },
        onSuccess: (result) => done(translate("drama.studio.castLooks.customLookImageSavedAndLocked"), result.affectedSegments),
        onError: (error) => message.error(error instanceof Error ? error.message : translate("library.assets.batch.uploadFailed")),
    });
    const busy = add.isPending || update.isPending || remove.isPending || generate.isPending || upload.isPending;
    return (
        <div className="drama-field">
            <div className="drama-field-label">
                <span>{translate("drama.studio.castLooks.looksCostumeAndMakeup")}</span>
                <small>{translate("drama.sentences.appearanceLimit", { max: MAX_LOOKS, count: looks.length })}</small>
            </div>
            <div className="drama-looks">
                {looks.map((look) =>
                    editingId === look.id ? (
                        <LookForm key={look.id} initial={look} submitting={update.isPending} onCancel={() => setEditingId(undefined)} onSubmit={(value) => update.mutate({ id: look.id, value })} />
                    ) : (
                        <div key={look.id} className="drama-look-item">
                            <div className="drama-look">
                                <span className="drama-look-thumb">
                                    {look.imageResourceId ? <MediaThumb resourceId={look.imageResourceId} alt={look.lookName || translate("drama.studio.castLooks.look")} /> : <Shirt className="size-4 opacity-40" />}
                                    {mediaBusy(look.imageStatus) ? <span className="drama-look-busy" aria-label={translate("drama.studio.castLooks.generatingReferenceImage")} /> : null}
                                    {look.imageStatus === "failed" ? <AlertCircle className="size-3.5 text-[var(--status-error)]" aria-label={translate("drama.studio.castLooks.referenceImageGenerationFailed")} /> : null}
                                </span>
                                <span className="drama-look-body">
                                    <b className="truncate">{look.lookName || translate("drama.studio.castLooks.untitledLook")}</b>
                                    <small>{chapterLabel(look.lookFromChapter, look.lookToChapter)}</small>
                                    <small>
                                        {look.imageStatus === "draft"
                                            ? translate("drama.studio.castLooks.savedGenerateOrUploadAnImage")
                                            : look.locked
                                              ? translate("drama.studio.castLooks.customImageLocked")
                                              : look.imagePrompt
                                                ? translate("drama.studio.castLooks.usingCustomPrompt")
                                                : translate("drama.studio.castLooks.generateFromAppearance")}
                                    </small>
                                </span>
                                <span className="drama-look-actions">
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<Pencil className="size-3.5" />}
                                        aria-label={translate("drama.studio.castLooks.editLook", { v0: String(look.lookName) })}
                                        disabled={busy || mediaBusy(look.imageStatus)}
                                        onClick={() => setEditingId(look.id)}
                                    />
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<Trash2 className="size-3.5" />}
                                        aria-label={translate("drama.studio.castLooks.deleteLook", { v0: String(look.lookName) })}
                                        disabled={busy}
                                        onClick={() => remove.mutate(look.id)}
                                    />
                                </span>
                            </div>
                            <div className="drama-look-form-actions">
                                <Button size="small" icon={<Library className="size-3.5" />} disabled={busy || mediaBusy(look.imageStatus)} onClick={() => setLibraryLook(look)}>
                                    {translate("canvasB.mention.assetLibrary")}
                                </Button>
                                <Button
                                    size="small"
                                    icon={<Upload className="size-3.5" />}
                                    disabled={busy || mediaBusy(look.imageStatus)}
                                    onClick={() => {
                                        uploadLookRef.current = look;
                                        fileRef.current?.click();
                                    }}
                                >
                                    {translate("drama.studio.castLooks.customImage")}
                                </Button>
                                <Button
                                    size="small"
                                    icon={<Play className="size-3.5" />}
                                    disabled={busy || mediaBusy(look.imageStatus) || character.imageStatus !== "ready" || !character.imageResourceId}
                                    title={!character.imageResourceId ? translate("drama.studio.castLooks.generateOrUploadTheBaseCharacterPortraitFirst") : undefined}
                                    onClick={() => {
                                        if (look.locked)
                                            modal.confirm({
                                                title: translate("drama.studio.castLooks.regenerateThisLookImage"),
                                                content: translate("drama.studio.castLooks.unlockTheCurrentCustomImageAndGenerateANewImage"),
                                                okText: translate("drama.studio.castLooks.unlockAndGenerate"),
                                                cancelText: translate("common.cancel"),
                                                onOk: () => generate.mutateAsync(look),
                                            });
                                        else generate.mutate(look);
                                    }}
                                >
                                    {look.imageResourceId ? translate("drama.studio.castLooks.regenerate") : translate("drama.studio.castLooks.generateLookImage")}
                                </Button>
                            </div>
                        </div>
                    ),
                )}
                {adding ? (
                    <LookForm submitting={add.isPending} onCancel={() => setAdding(false)} onSubmit={(value) => add.mutate(value)} />
                ) : looks.length < MAX_LOOKS ? (
                    <Button size="small" icon={<Plus className="size-3.5" />} disabled={busy} onClick={() => setAdding(true)}>
                        {translate("drama.studio.castLooks.addLook")}
                    </Button>
                ) : null}
            </div>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    const look = uploadLookRef.current;
                    if (!file || !look) return;
                    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
                        message.error(translate("drama.studio.castLooks.chooseAnImageNoLargerThan20MB"));
                        return;
                    }
                    modal.confirm({
                        title: translate("drama.studio.castLooks.useTheCustomImageFor", { v0: String(look.lookName) }),
                        content: translate("drama.studio.castLooks.confirmToSaveAndLockThisImageWithoutCallingA"),
                        okText: translate("drama.studio.castLooks.confirmAndSave"),
                        cancelText: translate("common.cancel"),
                        onOk: () => upload.mutateAsync({ look, file }),
                    });
                }}
            />
            {libraryLook ? (
                <CastLibraryPicker
                    open
                    cast={libraryLook}
                    onClose={() => setLibraryLook(undefined)}
                    onPick={async (resourceId) => {
                        const result = await setDramaCastImage(projectId, libraryLook.id, resourceId, restyle);
                        done(translate("drama.studio.castLooks.customLookImageSavedAndLocked"), result.affectedSegments);
                    }}
                />
            ) : null}
        </div>
    );
}
