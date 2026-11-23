import { useMemo } from "react";

import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { ASSET_CATEGORY_LABELS, normalizeAssetCategory } from "@/lib/asset-category";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

import { translate } from "@/i18n";
const CATEGORY_LABELS: Record<string, string> = { all: translate("canvasA.assetPicker.allAssets"), ...ASSET_CATEGORY_LABELS };

export type PickedWorkbenchAsset = { resourceId: string; kind: "image" | "video" | "audio"; name: string };

type MediaKind = PickedWorkbenchAsset["kind"];

function disabledReason(asset: Asset, accept: readonly MediaKind[]) {
    if ((asset.kind === "image" || asset.kind === "video" || asset.kind === "audio") && accept.includes(asset.kind)) return undefined;
    return translate("ecommerce.workbench.workbenchAssetPicker.onlyCanBeUsedHere", {
        v0: String(accept.map((kind) => (kind === "image" ? translate("account.feedback.image") : kind === "video" ? translate("account.feedback.video") : translate("account.settings.modelConfig.capabilities.audio"))).join("、")),
    });
}

/**
 * 选中素材对应的服务端资源。已同步的素材直接复用资源 ID；只在本机的图片先上传，
 * 没有真正落到服务端时报错，不把本机缓存当成可提交的参考素材。视频、音频必须已同步。
 */
async function pickedResource(item: AssetLibraryPickerItem): Promise<PickedWorkbenchAsset> {
    const asset = item.asset;
    if (!asset || (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio")) throw new Error(translate("ecommerce.workbench.workbenchAssetPicker.cannotBeUsedAsAReferenceAsset", { v0: String(item.title) }));
    const direct = resourceIdFromStorageKey(asset.data.storageKey);
    if (direct) return { resourceId: direct, kind: asset.kind, name: item.title };
    if (asset.kind !== "image") throw new Error(translate("ecommerce.workbench.workbenchAssetPicker.hasNotSyncedToTheServerYetTryAgainLater", { v0: String(item.title) }));
    const blob = asset.data.storageKey ? await getImageBlob(asset.data.storageKey) : null;
    const source = blob || asset.data.dataUrl || asset.coverUrl;
    if (!source) throw new Error(translate("ecommerce.workbench.workbenchAssetPicker.theImageFileForNoLongerExists", { v0: String(item.title) }));
    const uploaded = await uploadImage(source);
    const id = resourceIdFromStorageKey(uploaded.storageKey);
    if (uploaded.pendingRemoteUpload || !id) throw new Error(translate("ecommerce.workbench.workbenchAssetPicker.couldNotBeUploadedToTheServerTryAgainLater", { v0: String(item.title), v1: String(uploaded.remoteUploadError ? `：${uploaded.remoteUploadError}` : "") }));
    return { resourceId: id, kind: "image", name: item.title };
}

export function WorkbenchAssetPicker({ open, accept, maxCount, slotName, onClose, onPick }: { open: boolean; accept: readonly MediaKind[]; maxCount: number; slotName?: string; onClose: () => void; onPick: (assets: PickedWorkbenchAsset[]) => void }) {
    const assets = useAssetStore((state) => state.assets);
    const items = useMemo<AssetLibraryPickerItem[]>(
        () =>
            assets
                .filter((asset) => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio")
                .map((asset) => ({
                    id: asset.id,
                    title: asset.title,
                    category: normalizeAssetCategory(asset.category),
                    archived: asset.status === "archived",
                    kindLabel: asset.kind === "video" ? translate("account.feedback.video") : asset.kind === "audio" ? translate("account.settings.modelConfig.capabilities.audio") : translate("account.feedback.image"),
                    asset,
                    searchText: (asset.tags || []).join(" "),
                    disabledReason: disabledReason(asset, accept),
                })),
        [accept, assets],
    );
    const onlyImages = accept.length === 1 && accept[0] === "image";
    return (
        <AssetLibraryPickerModal
            remoteLibrary
            acceptRemoteItems
            remoteKind={onlyImages ? "image" : undefined}
            remoteItemDisabledReason={(asset) => disabledReason(asset, accept)}
            mediaKinds={[...accept]}
            multiple={maxCount > 1}
            open={open}
            items={items}
            categoryLabels={CATEGORY_LABELS}
            title={slotName ? translate("ecommerce.workbench.workbenchAssetPicker.chooseFromTheAssetLibrary", { v0: String(slotName) }) : translate("ecommerce.workbench.workbenchAssetPicker.chooseReferenceAssetsFromTheLibrary")}
            eyebrow={translate("ecommerce.workbench.workbenchAssetPicker.productAssets")}
            confirmLabel={(count) => (count ? translate("ecommerce.workbench.workbenchAssetPicker.useAssets", { v0: String(count) }) : translate("ecommerce.workbench.workbenchAssetPicker.useSelectedAssets"))}
            emptyDescription={translate("ecommerce.workbench.workbenchAssetPicker.uploadProductImagesToTheAssetLibraryFirstThenSelect")}
            footerNote={maxCount > 1 ? translate("ecommerce.workbench.workbenchAssetPicker.selectUpToMoreExtraSelectionsWillNotBeAdded", { v0: String(maxCount) }) : translate("ecommerce.workbench.workbenchAssetPicker.chooseOneAsset")}
            onClose={onClose}
            onConfirm={async (ids, pickedItems) => {
                const pool = new Map([...items, ...(pickedItems || [])].map((item) => [item.id, item]));
                const chosen = ids
                    .map((id) => pool.get(id))
                    .filter((item): item is AssetLibraryPickerItem => Boolean(item))
                    .slice(0, Math.max(1, maxCount));
                if (!chosen.length) throw new Error(translate("ecommerce.workbench.workbenchAssetPicker.chooseAnAsset"));
                const resolved = await Promise.all(chosen.map(pickedResource));
                onPick(resolved);
                onClose();
            }}
        />
    );
}
