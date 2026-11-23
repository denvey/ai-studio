import { useMemo } from "react";

import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { useExternalAssetSources } from "@/hooks/use-external-asset-sources";
import { ASSET_CATEGORY_LABELS, normalizeAssetCategory } from "@/lib/asset-category";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import type { DramaCast } from "@/services/api/drama";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

import { CAST_KIND_LABEL } from "../drama-shared";
import { translate } from "@/i18n";

const CATEGORY_LABELS: Record<string, string> = { all: translate("canvasA.assetPicker.allAssets"), ...ASSET_CATEGORY_LABELS };

/** 素材里能当设定参考图的：图片；角色设定还可以用角色卡的当前形象。 */
function pickableReason(asset: Asset, character: boolean) {
    if (asset.kind === "image") return undefined;
    if (asset.kind === "entity" && character) return asset.data.coverStorageKey ? undefined : translate("drama.studio.castLibraryPicker.thisCharacterCardHasNoAppearanceImageYet");
    return character ? translate("drama.studio.castLibraryPicker.onlyImagesOrCharacterCardsCanBeUsed") : translate("drama.studio.castLibraryPicker.onlyImagesCanBeUsed");
}

/**
 * 选中素材对应的服务端图片资源。已在服务端的素材直接复用同一资源；只存在本机的素材先上传，
 * 上传没有真正落到服务端时报错，不把本机缓存当成已保存。
 */
async function pickedImageResourceId(item: AssetLibraryPickerItem) {
    if (item.external) {
        const url = item.external.item.fileUrl;
        if (item.external.item.kind !== "image" || !url) throw new Error(translate("drama.studio.castLibraryPicker.isNotAReadableImage", { v0: String(item.title) }));
        return uploadedResourceId(await uploadImage(url));
    }
    const asset = item.asset;
    if (asset?.kind === "entity") {
        const id = resourceIdFromStorageKey(asset.data.coverStorageKey);
        if (!id) throw new Error(translate("drama.studio.castLibraryPicker.characterCardHasNoSavedPortraitYet", { v0: String(item.title) }));
        return id;
    }
    if (asset?.kind !== "image") throw new Error(translate("drama.studio.castLibraryPicker.isNotAnImage", { v0: String(item.title) }));
    const direct = resourceIdFromStorageKey(asset.data.storageKey);
    if (direct) return direct;
    const blob = asset.data.storageKey ? await getImageBlob(asset.data.storageKey) : null;
    const source = blob || asset.data.dataUrl || asset.coverUrl;
    if (!source) throw new Error(translate("drama.studio.castLibraryPicker.theImageFileForNoLongerExists", { v0: String(item.title) }));
    return uploadedResourceId(await uploadImage(source));
}

function uploadedResourceId(uploaded: Awaited<ReturnType<typeof uploadImage>>) {
    const id = resourceIdFromStorageKey(uploaded.storageKey);
    if (uploaded.pendingRemoteUpload || !id) throw new Error(translate("drama.studio.castLibraryPicker.theImageCouldNotBeUploadedToTheServerTry", { v0: String(uploaded.remoteUploadError ? `：${uploaded.remoteUploadError}` : "") }));
    return id;
}

/** 从素材库挑一张图作为设定参考图；选中后与上传形象图一样直接替换并锁定。 */
export function CastLibraryPicker({ open, cast, onClose, onPick, segment = false }: { open: boolean; cast: Pick<DramaCast, "kind" | "name">; onClose: () => void; onPick: (resourceId: string, name: string) => Promise<unknown>; segment?: boolean }) {
    const assets = useAssetStore((state) => state.assets);
    const externalAssetSources = useExternalAssetSources(open);
    const character = cast.kind === "character";
    const items = useMemo<AssetLibraryPickerItem[]>(
        () => [
            ...assets
                .filter((asset) => asset.kind === "image" || (character && asset.kind === "entity"))
                .map((asset) => ({
                    id: asset.id,
                    title: asset.title,
                    category: normalizeAssetCategory(asset.category),
                    archived: asset.status === "archived",
                    kindLabel: asset.kind === "entity" ? translate("canvasA.characterNode.card") : translate("account.feedback.image"),
                    mediaKind: "image" as const,
                    asset,
                    searchText: (asset.tags || []).join(" "),
                    disabledReason: pickableReason(asset, character),
                })),
            ...externalAssetSources.items.map((item) => ({ ...item, disabledReason: item.external?.item.kind === "image" ? item.disabledReason : translate("drama.studio.castLibraryPicker.onlyImagesCanBeUsed") })),
        ],
        [assets, character, externalAssetSources.items],
    );
    return (
        <AssetLibraryPickerModal
            remoteLibrary
            acceptRemoteItems
            allowCharacters={character}
            remoteKind={character ? undefined : "image"}
            remoteItemDisabledReason={(asset) => pickableReason(asset, character)}
            mediaKinds={["image"]}
            multiple={false}
            open={open}
            items={items}
            categoryLabels={{ ...CATEGORY_LABELS, ...externalAssetSources.categoryLabels }}
            folders={externalAssetSources.folders}
            title={segment ? translate("drama.studio.castLibraryPicker.addSegmentReferenceImage") : translate("drama.studio.castLibraryPicker.chooseAReferenceFor", { v0: String(cast.name), v1: String(CAST_KIND_LABEL[cast.kind]) })}
            eyebrow={translate("drama.studio.castLibraryPicker.dramaDesigns")}
            confirmLabel={() => (segment ? translate("drama.studio.castLibraryPicker.addToSegmentReferences") : translate("drama.studio.castLibraryPicker.useAsReferenceAndLock"))}
            emptyDescription={character ? translate("drama.studio.castLibraryPicker.addImagesOrCharacterCardsToTheAssetLibraryFirst") : translate("drama.studio.castLibraryPicker.addImagesToTheAssetLibraryFirst")}
            footerNote={
                externalAssetSources.error ||
                (segment ? translate("drama.studio.castLibraryPicker.addingAnImageOnlyAffectsThisSegmentRemovingAReference") : translate("drama.studio.castLibraryPicker.theSelectedImageReplacesTheCurrentReferenceAndIsLocked"))
            }
            onClose={onClose}
            onConfirm={async (ids, pickedItems) => {
                const pool = new Map([...items, ...(pickedItems || [])].map((item) => [item.id, item]));
                const item = ids[0] ? pool.get(ids[0]) : undefined;
                if (!item) throw new Error(translate("drama.studio.castLibraryPicker.selectAnImage"));
                await onPick(await pickedImageResourceId(item), item.title);
                onClose();
            }}
        />
    );
}
