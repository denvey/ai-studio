import type { CanvasFolderTheme } from "@/types/canvas";
import { translate } from "@/i18n";

export const CANVAS_FOLDER_THEME_OPTIONS: ReadonlyArray<{
    key: CanvasFolderTheme;
    label: string;
    cover: string;
}> = [
    { key: "aurora", label: translate("shared.canvas.canvasFolderTheme.redAndBlueGlow"), cover: "/images/canvas/folder-default-cover.png" },
    { key: "obsidian", label: translate("shared.canvas.canvasFolderTheme.obsidianSilverBlue"), cover: "/images/canvas/folder-theme-obsidian.png" },
    { key: "ember", label: translate("shared.canvas.canvasFolderTheme.moltenGoldAndFlame"), cover: "/images/canvas/folder-theme-ember.png" },
    { key: "pearl", label: translate("shared.canvas.canvasFolderTheme.pearlMist"), cover: "/images/canvas/folder-theme-pearl.png" },
];

export function resolveCanvasFolderTheme(value?: string): CanvasFolderTheme {
    return CANVAS_FOLDER_THEME_OPTIONS.some((theme) => theme.key === value) ? (value as CanvasFolderTheme) : "aurora";
}

export function resolveCanvasFolderThemeCover(theme?: string, customCover?: string) {
    const custom = customCover?.trim();
    if (custom) return custom;
    const resolved = resolveCanvasFolderTheme(theme);
    return CANVAS_FOLDER_THEME_OPTIONS.find((item) => item.key === resolved)!.cover;
}
