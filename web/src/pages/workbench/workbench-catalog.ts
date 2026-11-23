import type { WorkbenchKind, WorkbenchReferenceSlot } from "@/services/api/workbench";

import { translate } from "@/i18n";
export const workbenchCategories = [
    { value: "recommended", label: translate("ecommerce.workbench.workbenchCatalog.recommended") },
    { value: "people", label: translate("ecommerce.workbench.workbenchCatalog.people") },
    { value: "ecommerce", label: translate("ecommerce.workbench.workbenchCatalog.ecommerce") },
    { value: "product", label: translate("ecommerce.workbench.workbenchCatalog.product") },
    { value: "drama-character", label: translate("ecommerce.workbench.workbenchCatalog.dramaCharacters") },
    { value: "drama-scene", label: translate("ecommerce.workbench.workbenchCatalog.dramaScenes") },
    { value: "storyboard", label: translate("ecommerce.workbench.workbenchCatalog.dramaStoryboards") },
    { value: "short-video", label: translate("ecommerce.workbench.workbenchCatalog.shortVideos") },
    { value: "scene", label: translate("ecommerce.workbench.workbenchCatalog.scenes") },
    { value: "enhancement", label: translate("ecommerce.workbench.workbenchCatalog.enhance") },
];

export function workbenchCategoryLabel(id: string) {
    return workbenchCategories.find((category) => category.value === id)?.label || id;
}

export function workbenchModeOptions(kind: WorkbenchKind) {
    return kind === "image"
        ? [
              { value: "image", label: translate("nav.sidebar.toolboxImage") },
              { value: "image_edit", label: translate("ecommerce.workbench.workbenchCatalog.imageEditing") },
          ]
        : [{ value: "video", label: translate("nav.sidebar.toolboxVideo") }];
}

export const workbenchMediaLabel = (kind: string) => (kind === "image" ? translate("account.feedback.image") : kind === "video" ? translate("account.feedback.video") : translate("account.settings.modelConfig.capabilities.audio"));

/** 用户可读的输入约束文案，避免在下拉标签里堆叠过长说明。 */
export function workbenchSlotRequirement(slot: WorkbenchReferenceSlot) {
    const media = slot.mediaTypes.map(workbenchMediaLabel).join(" / ");
    if (slot.required || slot.minCount > 0) return translate("ecommerce.workbench.workbenchCatalog.required", { v0: String(media), v1: String(slot.minCount), v2: String(slot.maxCount) });
    return translate("ecommerce.workbench.workbenchCatalog.optionalUpTo", { v0: String(media), v1: String(slot.maxCount) });
}
