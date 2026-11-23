import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { App, Button, Checkbox, Input, Progress } from "antd";
import { AlertTriangle, FileArchive, X } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal";
import { dramaKeys } from "@/lib/drama/drama-query-keys";
import type { DramaEpisodeRow } from "@/services/api/drama";
import { applyDramaAssetImport, openDramaAssetPackage, planDramaAssetImport, type DramaAssetImportOptions, type DramaAssetImportPlan, type DramaAssetImportResult, type DramaAssetPackage } from "@/services/drama-asset-import";
import { defaultJianyingDraftRoot, exportDramaAssetPackage, exportDramaJianyingDraft, jianyingDraftRootProblem, savedJianyingDraftRoot, saveJianyingDraftRoot } from "@/services/drama-export";
import { translate } from "@/i18n";

/** 一键打包资产：全剧设定总会打包；剧集只能选已拆出分镜的。导出不消耗积分。 */
export function AssetPackageModal({ open, projectId, episodes, onClose }: { open: boolean; projectId: string; episodes: DramaEpisodeRow[]; onClose: () => void }) {
    const { message } = App.useApp();
    const selectable = useMemo(() => episodes.filter((episode) => episode.shotCount > 0), [episodes]);
    const [picked, setPicked] = useState<Set<string> | null>(null);
    const selected = picked ?? new Set(selectable.map((episode) => episode.id));
    const [media, setMedia] = useState(true);
    const [prompts, setPrompts] = useState(true);
    const chosen = selectable.filter((episode) => selected.has(episode.id));
    const segments = chosen.reduce((sum, episode) => sum + (episode.stats.segments || 0), 0);
    const toggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setPicked(next);
    };
    const submit = () => {
        exportDramaAssetPackage(projectId, { episodeIds: chosen.map((episode) => episode.id), media, prompts }, (text) => message.error(text));
        message.info(media ? translate("drama.studio.assetTransfer.packagingForBrowserDownloadPackagesWithVideosCanBeLarge") : translate("drama.studio.assetTransfer.packagingPromptsForBrowserDownload"));
        onClose();
    };
    return (
        <AppModal open={open} onCancel={onClose} footer={null} title={null} closable={false} flush centered width="min(640px, calc(100vw - 32px))" rootClassName="drama-root" aria-label={translate("drama.studio.assetTransfer.exportAllAssetsInOnePackage")}>
            <div className="drama-composer drama-transfer">
                <header className="drama-composer-head">
                    <div className="min-w-0">
                        <strong>{translate("drama.studio.assetTransfer.exportAllAssetsInOnePackage")}</strong>
                        <span>{translate("drama.studio.assetTransfer.characterSceneAndPropDesignsAreAlwaysIncludedOnlyEpisodes")}</span>
                    </div>
                    <Button type="text" icon={<X className="size-4" />} aria-label={translate("common.close")} onClick={onClose} />
                </header>
                <div className="drama-transfer-body thin-scrollbar">
                    <div className="drama-transfer-row">
                        <span className="drama-composer-label">{translate("drama.studio.assetTransfer.episodes")}</span>
                        <Button size="small" disabled={!selectable.length} onClick={() => setPicked(chosen.length === selectable.length ? new Set() : new Set(selectable.map((episode) => episode.id)))}>
                            {chosen.length === selectable.length && selectable.length ? translate("drama.studio.assetTransfer.deselectAll") : translate("drama.studio.assetTransfer.selectAll")}
                        </Button>
                    </div>
                    {episodes.length ? (
                        <div className="drama-transfer-episodes" role="group" aria-label={translate("drama.studio.assetTransfer.selectEpisodes")}>
                            {episodes.map((episode) => {
                                const disabled = episode.shotCount <= 0;
                                return (
                                    <button
                                        key={episode.id}
                                        type="button"
                                        className="drama-transfer-episode"
                                        aria-pressed={selected.has(episode.id) && !disabled}
                                        disabled={disabled}
                                        title={disabled ? translate("drama.studio.assetTransfer.noStoryboardBreakdownYet") : episode.title}
                                        onClick={() => toggle(episode.id)}
                                    >
                                        {translate("drama.sentences.episodeHeading", { number: String(episode.number).padStart(2, "0") })}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="drama-transfer-note">{translate("drama.studio.assetTransfer.thisProductionHasNoEpisodesYetOnlyDesignsWillBe")}</p>
                    )}
                    <div className="drama-transfer-options">
                        <Checkbox checked={media} onChange={(event) => setMedia(event.target.checked)}>
                            {translate("drama.studio.assetTransfer.mediaDesignReferenceImagesCharacterVoiceSamplesSegmentVideosAnd")}
                        </Checkbox>
                        <Checkbox checked={prompts} onChange={(event) => setPrompts(event.target.checked)}>
                            {translate("drama.studio.assetTransfer.promptsSegmentVideoPromptsShotVisualsAndMotionDescriptionsAnd")}
                        </Checkbox>
                    </div>
                    <p className="drama-transfer-note">{translate("drama.studio.assetTransfer.theArchiveSJsonRecordsAllDesignsAndStoryboardStructure")}</p>
                </div>
                <footer className="drama-composer-foot">
                    <span className="drama-composer-count">
                        {translate("drama.studio.assetTransfer.selected")} {chosen.length} {translate("drama.studio.assetTransfer.episodes2")}{media && segments ? translate("drama.studio.assetTransfer.aboutStorySegments", { v0: String(segments) }) : ""}
                    </span>
                    <span className="flex-1" />
                    <Button onClick={onClose}>{translate("common.cancel")}</Button>
                    <Button type="primary" disabled={!media && !prompts} onClick={submit}>
                        {translate("drama.studio.assetTransfer.confirmExport")}
                    </Button>
                </footer>
            </div>
        </AppModal>
    );
}

const IMPORT_DEFAULTS: DramaAssetImportOptions = { castImages: true, castText: false, segmentPrompts: true, shotPrompts: false };

/** 导入资产包：按设定类型与名称、集号与段号匹配当前作品，先预览再写入。 */
export function AssetImportModal({ open, projectId, onClose }: { open: boolean; projectId: string; onClose: () => void }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement>(null);
    const [pkg, setPkg] = useState<DramaAssetPackage>();
    const [fileName, setFileName] = useState("");
    const [opening, setOpening] = useState(false);
    const [options, setOptions] = useState(IMPORT_DEFAULTS);
    const [plan, setPlan] = useState<{ source: DramaAssetPackage; options: DramaAssetImportOptions; value?: DramaAssetImportPlan; error?: string }>();
    const [progress, setProgress] = useState<{ done: number; total: number }>();
    const [result, setResult] = useState<DramaAssetImportResult>();
    const importing = Boolean(progress) && !result;
    const prompts = pkg?.manifest.includes?.prompts === true;

    useEffect(() => {
        if (!pkg || result) return;
        let active = true;
        planDramaAssetImport(projectId, pkg, options)
            .then((value) => active && setPlan({ source: pkg, options, value }))
            .catch((error) => active && setPlan({ source: pkg, options, error: error instanceof Error ? error.message : translate("drama.studio.assetTransfer.failedToLoadTheCurrentProduction") }));
        return () => {
            active = false;
        };
    }, [options, pkg, projectId, result]);
    const currentPlan = plan?.source === pkg && plan?.options === options ? plan : undefined;

    const reset = () => {
        setPkg(undefined);
        setFileName("");
        setPlan(undefined);
        setProgress(undefined);
        setResult(undefined);
        setOptions(IMPORT_DEFAULTS);
    };
    const close = () => {
        if (importing) return;
        reset();
        onClose();
    };
    const choose = async (file: File | undefined) => {
        if (!file) return;
        setOpening(true);
        try {
            const opened = await openDramaAssetPackage(file);
            setPkg(opened);
            setFileName(file.name);
            setPlan(undefined);
            setResult(undefined);
            setProgress(undefined);
            const hasPrompts = opened.manifest.includes?.prompts === true;
            setOptions({ ...IMPORT_DEFAULTS, segmentPrompts: hasPrompts, shotPrompts: false });
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("drama.studio.assetTransfer.unableToReadAssetPackage"));
        } finally {
            setOpening(false);
        }
    };
    const run = async () => {
        if (!pkg || !currentPlan?.value?.operations.length) return;
        setProgress({ done: 0, total: currentPlan.value.operations.length });
        const outcome = await applyDramaAssetImport(projectId, pkg, currentPlan.value, (done, total) => setProgress({ done, total }));
        setResult(outcome);
        void queryClient.invalidateQueries({ queryKey: dramaKeys.summary(projectId) });
        if (outcome.failed.length) message.warning(translate("drama.studio.assetTransfer.importedItemsFailed", { v0: String(outcome.succeeded), v1: String(outcome.failed.length) }));
        else message.success(translate("drama.studio.assetTransfer.importedItems", { v0: String(outcome.succeeded) }));
    };
    const counts = useMemo(() => {
        const operations = currentPlan?.value?.operations || [];
        return {
            images: operations.filter((item) => item.kind === "cast-image").length,
            texts: operations.filter((item) => item.kind === "cast-text").length,
            segments: operations.filter((item) => item.kind === "segment-prompt").length,
            shots: operations.filter((item) => item.kind === "shot-prompt").length,
        };
    }, [currentPlan]);
    const option = (key: keyof DramaAssetImportOptions) => ({ checked: options[key], disabled: importing || Boolean(result), onChange: (event: { target: { checked: boolean } }) => setOptions({ ...options, [key]: event.target.checked }) });

    return (
        <AppModal open={open} onCancel={close} footer={null} title={null} closable={false} flush centered width="min(680px, calc(100vw - 32px))" rootClassName="drama-root" aria-label={translate("drama.studio.assetTransfer.importAssetPackage")}>
            <div className="drama-composer drama-transfer">
                <header className="drama-composer-head">
                    <div className="min-w-0">
                        <strong>{translate("drama.studio.assetTransfer.importAssetPackage")}</strong>
                        <span>{translate("drama.studio.assetTransfer.applyAYingceAssetPackageToThisProductionDesignsAre")}</span>
                    </div>
                    <Button type="text" icon={<X className="size-4" />} aria-label={translate("common.close")} disabled={importing} onClick={close} />
                </header>
                <div className="drama-transfer-body thin-scrollbar">
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".zip,application/zip"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void choose(file);
                        }}
                    />
                    <div className="drama-transfer-file">
                        <FileArchive className="size-5 shrink-0" aria-hidden />
                        <div className="min-w-0 flex-1">
                            {pkg ? (
                                <>
                                    <strong title={fileName}>{fileName}</strong>
                                    <span>
                                        {translate("drama.sentences.importPackage", { name: pkg.manifest.drama.name, cast: pkg.manifest.cast.length, episodes: pkg.manifest.episodes.length })}{prompts ? (" " + translate("drama.studio.assetTransfer.includesPrompts")) : (" " + translate("drama.studio.assetTransfer.noPrompts"))}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <strong>{translate("drama.studio.assetTransfer.chooseAssetPackageZip")}</strong>
                                    <span>{translate("drama.studio.assetTransfer.onlyTheAssetManifestAndRequiredImagesAreReadLarge")}</span>
                                </>
                            )}
                        </div>
                        <Button loading={opening} disabled={importing} onClick={() => inputRef.current?.click()}>
                            {pkg ? translate("account.settings.profile.reselect") : translate("drama.studio.assetTransfer.chooseFile")}
                        </Button>
                    </div>
                    {pkg ? (
                        <>
                            <div className="drama-transfer-options">
                                <Checkbox {...option("castImages")}>{translate("drama.studio.assetTransfer.designReferencesReplaceTheCurrentReferenceImageForMatchingNames")}</Checkbox>
                                <Checkbox {...option("castText")}>{translate("drama.studio.assetTransfer.designAppearanceAndDescriptionsReplaceTextForMatchingNames")}</Checkbox>
                                <Checkbox {...option("segmentPrompts")} disabled={!prompts || importing || Boolean(result)}>
                                    {translate("drama.studio.assetTransfer.segmentVideoPromptsSaveAsCustomPromptsForTheMatching")}
                                </Checkbox>
                                <Checkbox {...option("shotPrompts")} disabled={!prompts || importing || Boolean(result)}>
                                    {translate("drama.studio.assetTransfer.shotVisualsAndMotionDescriptionsOnlyForEpisodesWithMatching")}
                                </Checkbox>
                            </div>
                            <p className="drama-transfer-note">{translate("drama.studio.assetTransfer.existingSegmentVideosAreNotRegeneratedAutomaticallyReferenceNumbersSuch")}</p>
                            <div className="drama-transfer-plan" role="status">
                                {currentPlan?.error ? (
                                    <span className="drama-transfer-problem">
                                        <AlertTriangle className="size-4 shrink-0" />
                                        {currentPlan.error}
                                    </span>
                                ) : !currentPlan ? (
                                    <span>{translate("drama.studio.assetTransfer.matchingAgainstThisProduction")}</span>
                                ) : (
                                    <span>
                                        {translate("drama.studio.assetTransfer.willWrite")} {currentPlan.value!.operations.length} {translate("drama.studio.assetTransfer.itemsReferenceImages")} {counts.images} {translate("drama.studio.assetTransfer.designText")} {counts.texts} {translate("drama.studio.assetTransfer.segmentPrompts")} {counts.segments} {translate("drama.studio.assetTransfer.shotPrompts")} {counts.shots}
                                    </span>
                                )}
                                {progress ? <Progress percent={Math.round((progress.done / Math.max(progress.total, 1)) * 100)} size="small" /> : null}
                                {currentPlan?.value?.skipped.length ? (
                                    <details>
                                        <summary>{translate("drama.studio.assetTransfer.skip")} {currentPlan.value.skipped.length} {translate("library.picker.itemUnit")}</summary>
                                        <ul>
                                            {currentPlan.value.skipped.map((item) => (
                                                <li key={item}>{item}</li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : null}
                                {result?.failed.length ? (
                                    <details open>
                                        <summary>{translate("library.assets.batch.failed")} {result.failed.length} {translate("library.picker.itemUnit")}</summary>
                                        <ul>
                                            {result.failed.map((item) => (
                                                <li key={item.label}>
                                                    {item.label}：{item.message}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : null}
                            </div>
                        </>
                    ) : null}
                </div>
                <footer className="drama-composer-foot">
                    <span className="drama-composer-count">{result ? translate("drama.studio.assetTransfer.completeItemsSucceeded", { v0: String(result.succeeded), v1: String(result.failed.length ? translate("drama.studio.assetTransfer.failed", { v0: String(result.failed.length) }) : "") }) : progress ? translate("drama.studio.assetTransfer.importing", { v0: String(progress.done), v1: String(progress.total) }) : ""}</span>
                    <span className="flex-1" />
                    {result ? (
                        <Button type="primary" onClick={close}>
                            {translate("account.payment.done")}
                        </Button>
                    ) : (
                        <>
                            <Button disabled={importing} onClick={close}>
                                {translate("common.cancel")}
                            </Button>
                            <Button type="primary" loading={importing} disabled={!currentPlan?.value?.operations.length} onClick={() => void run()}>
                                {translate("drama.studio.assetTransfer.startImport")}
                            </Button>
                        </>
                    )}
                </footer>
            </div>
        </AppModal>
    );
}

/** 导出剪映草稿：素材按用户本机的剪映草稿目录写成绝对路径，解压到该目录后剪映首页即可打开。 */
export function JianyingDraftModal({ open, projectId, episodeId, episodeLabel, readySegments, onClose }: { open: boolean; projectId: string; episodeId: string; episodeLabel: string; readySegments: number; onClose: () => void }) {
    const { message } = App.useApp();
    const [root, setRoot] = useState(() => savedJianyingDraftRoot() || defaultJianyingDraftRoot());
    const [captions, setCaptions] = useState(true);
    const problem = jianyingDraftRootProblem(root);
    const submit = () => {
        if (problem) return;
        saveJianyingDraftRoot(root);
        exportDramaJianyingDraft(projectId, episodeId, { draftRoot: root, captions }, (text) => message.error(text));
        message.info(translate("drama.studio.assetTransfer.preparingTheJianyingDraftYourBrowserWillStartTheDownload"));
        onClose();
    };
    return (
        <AppModal open={open} onCancel={onClose} footer={null} title={null} closable={false} flush centered width="min(640px, calc(100vw - 32px))" rootClassName="drama-root" aria-label={translate("drama.studio.assetTransfer.exportJianyingDraft")}>
            <div className="drama-composer drama-transfer">
                <header className="drama-composer-head">
                    <div className="min-w-0">
                        <strong>{translate("drama.studio.assetTransfer.exportJianyingDraft2")} {episodeLabel}</strong>
                        <span>{readySegments} {translate("drama.studio.assetTransfer.segmentVideosArePlacedOnTheMainTrackInFinal")}</span>
                    </div>
                    <Button type="text" icon={<X className="size-4" />} aria-label={translate("common.close")} onClick={onClose} />
                </header>
                <div className="drama-transfer-body thin-scrollbar">
                    <label className="drama-composer-field">
                        <span className="drama-composer-label">{translate("drama.studio.assetTransfer.jianyingDraftsFolder")}</span>
                        <Input value={root} onChange={(event) => setRoot(event.target.value)} status={problem ? "warning" : undefined} spellCheck={false} />
                        <span className={problem ? "drama-transfer-problem" : "drama-transfer-note"}>{problem || translate("drama.studio.assetTransfer.findThisInJianyingProUnderGlobalSettingsDraftLocation")}</span>
                    </label>
                    <div className="drama-transfer-options">
                        <Checkbox checked={captions} onChange={(event) => setCaptions(event.target.checked)}>
                            {translate("drama.studio.assetTransfer.includeADialogueSubtitleTrackTimedFromShotDurationsWith")}
                        </Checkbox>
                    </div>
                    <ol className="drama-transfer-steps">
                        <li>{translate("drama.studio.assetTransfer.closeJianyingAndExtractTheDownloadedArchiveIntoTheFolder")}</li>
                        <li>{translate("drama.studio.assetTransfer.reopenJianyingAndOpenTheMatchingDraftFromTheHome")}</li>
                        <li>{translate("drama.studio.assetTransfer.ifMediaIsMissingTheExtractionLocationDoesNotMatch")}</li>
                    </ol>
                </div>
                <footer className="drama-composer-foot">
                    <span className="flex-1" />
                    <Button onClick={onClose}>{translate("common.cancel")}</Button>
                    <Button type="primary" disabled={Boolean(problem) || !readySegments} onClick={submit}>
                        {translate("drama.studio.assetTransfer.exportDraft")}
                    </Button>
                </footer>
            </div>
        </AppModal>
    );
}
