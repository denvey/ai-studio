
import { translate } from "@/i18n";
export type UpdateBlock = {
    id: string;
    type: "text" | "image" | "video";
    text: string;
    resourceId: string;
    caption: string;
    layout: "full" | "half";
    mediaUrl?: string;
};
export type UpdateRelease = { id: string; version: string; title: string; date: string; blocks: UpdateBlock[] };
export type UpdateAnnouncement = { enabled: boolean; currentVersion: string; releases: UpdateRelease[] };
export const DEFAULT_UPDATE_ANNOUNCEMENT: UpdateAnnouncement = { enabled: false, currentVersion: "", releases: [] };

export function normalizeUpdateAnnouncement(value?: UpdateAnnouncement | null): UpdateAnnouncement {
    return { ...DEFAULT_UPDATE_ANNOUNCEMENT, ...value, releases: Array.isArray(value?.releases) ? value.releases : [] };
}

export function updateAnnouncementVersion(value: UpdateAnnouncement | undefined, builtInVersion: string) {
    return value?.enabled ? value.currentVersion : `v${builtInVersion.replace(/^v/, "")}`;
}

export function moveUpdateItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
    const destination = index + direction;
    if (index < 0 || index >= items.length || destination < 0 || destination >= items.length) return items;
    const result = [...items];
    [result[index], result[destination]] = [result[destination], result[index]];
    return result;
}

export function validateUpdateAnnouncement(value: UpdateAnnouncement): string | undefined {
    if (value.enabled && (!value.currentVersion.trim() || !value.releases.length)) return translate("shared.updateAnnouncement.enterTheCurrentVersionAndAddAnnouncementContentBeforeEnabling");
    if (value.enabled && !value.releases.some((release) => release.version.trim() === value.currentVersion.trim())) return translate("shared.updateAnnouncement.theCurrentVersionMustMatchAnAnnouncementVersionYouHave");
    if (value.releases.length > 30) return translate("shared.updateAnnouncement.youCanAddUpTo30AnnouncementVersions");
    const versions = new Set<string>();
    let totalBytes = 0;
    for (const release of value.releases) {
        const version = release.version.trim();
        if (!version || Array.from(version).length > 40) return translate("shared.updateAnnouncement.eachAnnouncementVersionNumberMustContain140Characters");
        if (versions.has(version)) return translate("shared.updateAnnouncement.announcementVersionNumbersMustBeUnique");
        versions.add(version);
        if (!release.blocks.length || release.blocks.length > 50) return translate("shared.updateAnnouncement.eachVersionMustContain150ContentBlocks");
        for (const block of release.blocks) {
            if (block.type === "text" && !block.text.trim()) return translate("shared.updateAnnouncement.enterTextOrRemoveTheEmptyContentBlock");
            if (block.type !== "text" && !block.resourceId) return translate("shared.updateAnnouncement.uploadAnImageOrVideoOrRemoveTheEmptyContent");
            totalBytes += new TextEncoder().encode(block.text.trim() + block.caption.trim()).length;
        }
    }
    if (totalBytes > 200000) return translate("shared.updateAnnouncement.totalAnnouncementContentCannotExceed200KB");
}
