import { listZipEntries, readZipEntry, type ZipEntry } from "@/lib/zip-entries";
import { getDrama, getDramaEpisode, listDramaCast, setDramaCastImage, updateDramaCast, updateDramaCastLook, updateDramaSegment, updateDramaShot, type DramaCast, type DramaCastKind, type DramaShotPatch } from "@/services/api/drama";
import { uploadResourceFile } from "@/services/api/resources";
import { translate } from "@/i18n";


// 资产包导入：浏览器按 ZIP 中央目录只读取清单与要用的图片，按设定类型与名称、集号与段号
// 套用到当前作品。全部写入都走现有的短剧接口，归属与校验由后端负责；视频与声音样本不导入。

export const DRAMA_ASSET_PACKAGE_FORMAT = "yingce.drama-asset-package";
const MANIFEST_FILE = "资产清单.json";
const MAX_MANIFEST_BYTES = 20 << 20;

export type DramaAssetManifestCast = {
    kind: DramaCastKind;
    name: string;
    aliases?: string[];
    role?: string;
    description?: string;
    appearance?: string;
    voiceInstructions?: string;
    lookName?: string;
    image?: string;
    voiceSample?: string;
    imagePrompt?: string;
};

export type DramaAssetManifest = {
    format: string;
    version: number;
    exportedAt: string;
    drama: { name: string; aspectRatio: string };
    includes: { media: boolean; prompts: boolean };
    cast: DramaAssetManifestCast[];
    episodes: Array<{
        number: number;
        title: string;
        synopsis?: string;
        final?: string;
        segments: Array<{ index: number; title: string; seconds?: number; video?: string; videoPrompt?: string; customPrompt?: boolean }>;
        shots: Array<{ position: number; segmentIndex: number; imagePrompt?: string; videoPrompt?: string }>;
    }>;
};

export type DramaAssetPackage = {
    file: Blob;
    manifest: DramaAssetManifest;
    /** 清单里的路径（以导出时的根目录开头）→ 压缩包里的实际条目；兼容用户解压后重新压缩改变了根目录。 */
    entry: (path: string | undefined) => ZipEntry | undefined;
};

export type DramaAssetImportOptions = { castImages: boolean; castText: boolean; segmentPrompts: boolean; shotPrompts: boolean };

export type DramaAssetImportOperation =
    | { kind: "cast-image"; label: string; castId: string; entry: ZipEntry; fileName: string; mime: string }
    | { kind: "cast-text"; label: string; castId: string; look: boolean; appearance?: string; description?: string }
    | { kind: "shot-prompt"; label: string; shotId: string; patch: DramaShotPatch }
    | { kind: "segment-prompt"; label: string; episodeId: string; index: number; prompt: string };

export type DramaAssetImportPlan = { operations: DramaAssetImportOperation[]; skipped: string[] };

export async function openDramaAssetPackage(file: Blob): Promise<DramaAssetPackage> {
    const entries = await listZipEntries(file);
    const manifestEntry = entries.filter((item) => item.name === MANIFEST_FILE || item.name.endsWith(`/${MANIFEST_FILE}`)).sort((left, right) => left.name.length - right.name.length)[0];
    if (!manifestEntry) throw new Error(translate("shared.dramaAssetImport.theArchiveDoesNotContainSelectADramaAssetPackage", { v0: String(MANIFEST_FILE) }));
    if (manifestEntry.size > MAX_MANIFEST_BYTES) throw new Error(translate("shared.dramaAssetImport.theAssetManifestIsTooLargeToRead"));
    let manifest: DramaAssetManifest;
    try {
        manifest = JSON.parse(await (await readZipEntry(file, manifestEntry)).text()) as DramaAssetManifest;
    } catch {
        throw new Error(translate("shared.dramaAssetImport.theAssetManifestIsNotValidJSONTheArchiveMay"));
    }
    if (manifest?.format !== DRAMA_ASSET_PACKAGE_FORMAT || typeof manifest.version !== "number") throw new Error(translate("shared.dramaAssetImport.notAYingceDramaAssetPackage"));
    if (manifest.version > 1) throw new Error(translate("shared.dramaAssetImport.theAssetPackageIsFromANewerVersionOfYingce"));
    if (!Array.isArray(manifest.cast) || !Array.isArray(manifest.episodes)) throw new Error(translate("shared.dramaAssetImport.theAssetManifestIsMissingSettingsOrTheEpisodeList"));
    const byName = new Map(entries.map((item) => [item.name, item]));
    const prefix = manifestEntry.name.slice(0, manifestEntry.name.length - MANIFEST_FILE.length);
    return {
        file,
        manifest,
        entry: (path) => {
            if (!path) return undefined;
            // 清单路径形如「导出根目录/设定/…」，去掉第一段后接到清单实际所在目录。
            const relative = path.split("/").slice(1).join("/");
            return byName.get(prefix + relative) || byName.get(path);
        },
    };
}

const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

function castKey(kind: string, name: string, look = "") {
    return `${kind}\u0000${name.trim()}\u0000${look.trim()}`;
}

function castLabel(item: Pick<DramaAssetManifestCast, "kind" | "name" | "lookName">) {
    const kind = { character: translate("library.picker.kind.character"), scene: translate("shared.assetCategory.scene"), prop: translate("shared.drama.dramaFormat.prop") }[item.kind] || translate("shared.dramaAssetImport.design");
    return `${kind}「${item.name}${item.lookName ? ` · ${item.lookName}` : ""}」`;
}

/** 对照当前作品生成导入计划；只读取接口，不写入任何内容。 */
export async function planDramaAssetImport(projectId: string, pkg: DramaAssetPackage, options: DramaAssetImportOptions): Promise<DramaAssetImportPlan> {
    const operations: DramaAssetImportOperation[] = [];
    const skipped: string[] = [];
    if (options.castImages || options.castText) {
        const { cast } = await listDramaCast(projectId);
        const names = new Map(cast.map((item) => [item.id, item.name]));
        const current = new Map<string, DramaCast>();
        for (const item of cast) current.set(item.parentId ? castKey(item.kind, names.get(item.parentId) || item.name, item.lookName || item.name) : castKey(item.kind, item.name), item);
        for (const item of pkg.manifest.cast) {
            const label = castLabel(item);
            const target = current.get(castKey(item.kind, item.name, item.lookName));
            if (!target) {
                skipped.push(translate("shared.dramaAssetImport.thisProductionHasNoDesignWithTheSameName", { v0: String(label) }));
                continue;
            }
            if (options.castImages && item.image) {
                const entry = pkg.entry(item.image);
                const extension = item.image.split(".").pop()?.toLowerCase() || "";
                if (!entry) skipped.push(translate("shared.dramaAssetImport.theReferenceImageIsMissingFromTheArchive", { v0: String(label) }));
                else if (!IMAGE_MIME[extension]) skipped.push(translate("shared.dramaAssetImport.theReferenceImageFormatIsNotSupported", { v0: String(label) }));
                else operations.push({ kind: "cast-image", label: translate("shared.dramaAssetImport.referenceImage", { v0: String(label) }), castId: target.id, entry, fileName: item.image.split("/").pop() || `cast.${extension}`, mime: IMAGE_MIME[extension] });
            }
            if (options.castText) {
                const appearance = item.appearance?.trim() && item.appearance.trim() !== target.appearance.trim() ? item.appearance.trim() : undefined;
                const description = !target.parentId && item.description?.trim() && item.description.trim() !== target.description.trim() ? item.description.trim() : undefined;
                if (appearance || description) operations.push({ kind: "cast-text", label: translate("shared.dramaAssetImport.appearanceAndDescription", { v0: String(label) }), castId: target.id, look: Boolean(target.parentId), appearance, description });
            }
        }
    }
    if (options.segmentPrompts || options.shotPrompts) {
        if (!pkg.manifest.includes?.prompts) skipped.push(translate("shared.dramaAssetImport.theAssetPackageWasExportedWithoutPromptsPromptImportWas"));
        else {
            const summary = await getDrama(projectId);
            const episodes = new Map(summary.episodes.map((item) => [item.number, item]));
            for (const source of pkg.manifest.episodes) {
                const row = episodes.get(source.number);
                if (!row) {
                    skipped.push(translate("shared.dramaAssetImport.episodeThisEpisodeDoesNotExistInTheCurrentProduction", { v0: String(source.number) }));
                    continue;
                }
                const detail = await getDramaEpisode(projectId, row.id);
                if (options.shotPrompts) {
                    if (detail.shots.length !== source.shots.length) skipped.push(translate("shared.dramaAssetImport.episodeShotPromptsShotCountsDoNotMatchInThe", { v0: String(source.number), v1: String(source.shots.length), v2: String(detail.shots.length) }));
                    else
                        source.shots.forEach((shot, index) => {
                            const target = detail.shots[index];
                            const patch: DramaShotPatch = {};
                            if (shot.imagePrompt?.trim() && shot.imagePrompt.trim() !== target.imagePrompt.trim()) patch.imagePrompt = shot.imagePrompt.trim();
                            if (shot.videoPrompt?.trim() && shot.videoPrompt.trim() !== target.videoPrompt.trim()) patch.videoPrompt = shot.videoPrompt.trim();
                            if (Object.keys(patch).length) operations.push({ kind: "shot-prompt", label: translate("shared.dramaAssetImport.episodeShotPrompts", { v0: String(source.number), v1: String(index + 1) }), shotId: target.id, patch });
                        });
                }
                if (options.segmentPrompts) {
                    const segments = new Map(detail.segments.map((item) => [item.index, item]));
                    for (const segment of source.segments) {
                        const prompt = segment.videoPrompt?.trim();
                        if (!prompt) continue;
                        const target = segments.get(segment.index);
                        if (!target) skipped.push(translate("shared.dramaAssetImport.episodeSegmentThisSegmentDoesNotExistInTheCurrent", { v0: String(source.number), v1: String(segment.index + 1) }));
                        else if (prompt !== target.videoPrompt.trim()) operations.push({ kind: "segment-prompt", label: translate("shared.dramaAssetImport.episodeSegmentVideoPrompt", { v0: String(source.number), v1: String(segment.index + 1) }), episodeId: row.id, index: segment.index, prompt });
                    }
                }
            }
        }
    }
    // 先写镜头再写段提示词：镜头修改会让模型撰写的段提示词过期，而导入的段提示词作为手动改写保留。
    const order: Record<DramaAssetImportOperation["kind"], number> = { "cast-image": 0, "cast-text": 1, "shot-prompt": 2, "segment-prompt": 3 };
    operations.sort((left, right) => order[left.kind] - order[right.kind]);
    return { operations, skipped };
}

export type DramaAssetImportResult = { succeeded: number; failed: Array<{ label: string; message: string }> };

/** 逐项写入；单项失败记录原因后继续，最终把成功数与失败项交给界面展示。 */
export async function applyDramaAssetImport(projectId: string, pkg: DramaAssetPackage, plan: DramaAssetImportPlan, onProgress?: (done: number, total: number) => void): Promise<DramaAssetImportResult> {
    const result: DramaAssetImportResult = { succeeded: 0, failed: [] };
    let done = 0;
    for (const operation of plan.operations) {
        try {
            if (operation.kind === "cast-image") {
                const blob = await readZipEntry(pkg.file, operation.entry, operation.mime);
                const resource = await uploadResourceFile(blob, "image", { fileName: operation.fileName });
                await setDramaCastImage(projectId, operation.castId, resource.id, false);
            } else if (operation.kind === "cast-text") {
                if (operation.look) await updateDramaCastLook(projectId, operation.castId, { appearance: operation.appearance });
                else await updateDramaCast(projectId, operation.castId, { ...(operation.appearance ? { appearance: operation.appearance } : {}), ...(operation.description ? { description: operation.description } : {}) });
            } else if (operation.kind === "shot-prompt") {
                await updateDramaShot(projectId, operation.shotId, operation.patch);
            } else {
                await updateDramaSegment(projectId, operation.episodeId, operation.index, operation.prompt);
            }
            result.succeeded++;
        } catch (error) {
            result.failed.push({ label: operation.label, message: error instanceof Error ? error.message : translate("shared.dramaAssetImport.failedToSave") });
        }
        done++;
        onProgress?.(done, plan.operations.length);
    }
    return result;
}
