import { extractCharacterBreakdownJson, parseCharacterBreakdown, type CharacterBreakdown } from "./canvas-character-reference";
import { translate } from "@/i18n";


export type ChapterAssetDefinition = { name: string; description: string; prompt: string };
export type ChapterAssetBreakdown = { characters: CharacterBreakdown[]; scenes: ChapterAssetDefinition[]; props: ChapterAssetDefinition[] };

export function parseChapterAssetBreakdown(raw: string): ChapterAssetBreakdown {
    const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const value: unknown = extractCharacterBreakdownJson(text, true);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(translate("shared.canvas.chapterAssetBreakdown.theChapterAssetResultMustBeAJSONObject"));
    const payload = value as Record<string, unknown>;
    if (!Array.isArray(payload.characters) || !Array.isArray(payload.scenes) || !Array.isArray(payload.props)) {
        throw new Error(translate("shared.canvas.chapterAssetBreakdown.theChapterAssetResultIsMissingCharacterSceneOrProp"));
    }
    const parseAssets = (items: unknown[], label: string): ChapterAssetDefinition[] => items.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(translate("shared.canvas.chapterAssetBreakdown.invalidAssetFormat", { v0: String(label) }));
        const asset = item as Record<string, unknown>;
        for (const key of ["name", "description", "prompt"]) {
            if (typeof asset[key] !== "string" || !asset[key].trim()) throw new Error(translate("shared.canvas.chapterAssetBreakdown.assetIsMissingAValid", { v0: String(label), v1: String(key) }));
        }
        return { name: (asset.name as string).trim(), description: (asset.description as string).trim(), prompt: (asset.prompt as string).trim() };
    });
    return {
        characters: payload.characters.length ? parseCharacterBreakdown(JSON.stringify({ characters: payload.characters })) : [],
        scenes: parseAssets(payload.scenes, "场景"),
        props: parseAssets(payload.props, "道具"),
    };
}
