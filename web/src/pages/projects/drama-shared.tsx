import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { InputNumber } from "antd";
import { AlertTriangle } from "lucide-react";

import { CachedResourceImage } from "@/components/cached-resource-image";
import { getResourceAccess, resolveResourceAccessURL, resourceFileUrl, type ResourceAccessVariant } from "@/services/api/resources";
import type { DramaEpisodeRow, DramaEpisodeStage, DramaMediaMode, DramaMediaStatus, DramaSourceFormat, DramaVideoContinuity } from "@/services/api/drama";
import { currentLocale, translate } from "@/i18n";

export const PIPELINE_STEPS: Array<{ key: Exclude<DramaEpisodeStage, "queued" | "review" | "done">; label: string }> = [
    { key: "script", label: translate("drama.dramaShared.script") },
    { key: "prompts", label: translate("drama.dramaShared.segmentPrompts") },
    { key: "video", label: translate("account.feedback.video") },
    { key: "render", label: translate("drama.dramaShared.finalCut") },
];

const STAGE_INDEX: Record<DramaEpisodeStage, number> = { queued: -1, script: 0, prompts: 1, review: 2, video: 2, render: 3, done: 4 };

export const STAGE_LABEL: Record<DramaEpisodeStage, string> = {
    queued: translate("canvasPage.taskStatus.queued"),
    script: translate("drama.dramaShared.adaptScript"),
    prompts: translate("drama.dramaShared.writeSegmentPrompts"),
    review: translate("drama.dramaShared.awaitingReview"),
    video: translate("drama.dramaShared.generateVideo"),
    render: translate("drama.dramaShared.renderFinalCut"),
    done: translate("library.tasks.filter.succeeded"),
};

export { DRAMA_CAST_KIND_LABEL as CAST_KIND_LABEL, DRAMA_STATUS_LABEL as STATUS_LABEL, formatDramaCredits as formatCredits } from "@/lib/drama/drama-format";

export const DIALOGUE_LANGUAGE_LABEL: Record<string, string> = {
    中文普通话: translate("drama.labels.language.mandarin"),
    粤语: translate("drama.labels.language.cantonese"),
    英语: translate("drama.labels.language.english"),
    日语: translate("drama.labels.language.japanese"),
};

const SHOT_VISUAL_LABEL: Record<string, string> = {
    特写: translate("drama.labels.shotSize.closeUp"),
    近景: translate("drama.labels.shotSize.mediumCloseUp"),
    中景: translate("drama.labels.shotSize.medium"),
    全景: translate("drama.labels.shotSize.full"),
    远景: translate("drama.labels.shotSize.wide"),
    固定: translate("drama.labels.camera.static"),
    推: translate("drama.labels.camera.pushIn"),
    拉: translate("drama.labels.camera.pullBack"),
    摇: translate("drama.labels.camera.pan"),
    跟: translate("drama.labels.camera.track"),
    环绕: translate("drama.labels.camera.orbit"),
    升降: translate("drama.labels.camera.crane"),
    手持: translate("drama.labels.camera.handheld"),
};

/** 只翻译模型约定值的显示标签，保存与提交仍使用原值。 */
export function shotVisualLabel(value: string | undefined) {
    return SHOT_VISUAL_LABEL[value || ""] || value || "";
}

/** 段落衔接方式的文案：新建页与设置页共用。 */
export const VIDEO_CONTINUITY_LABEL: Record<DramaVideoContinuity, { title: string; detail: string }> = {
    tail_frame: { title: translate("drama.dramaShared.lastFrameChaining"), detail: translate("drama.dramaShared.fromSegment2OnwardUseThePreviousSegmentSLast") },
    parallel: { title: translate("drama.dramaShared.parallelGeneration"), detail: translate("drama.dramaShared.generateEachSegmentIndependentlyFromCharacterAndSceneReferencesAll") },
};

/** 生成节奏的文案：新建页与设置页共用。 */
export const MEDIA_MODE_LABEL: Record<DramaMediaMode, { title: string; detail: string }> = {
    manual: { title: translate("drama.dramaShared.prepareScriptsAndPromptsThenGenerateManually"), detail: translate("drama.dramaShared.generateTextOnlyStoryBibleEpisodePlanScriptsStoryboardsDesigns") },
    auto: { title: translate("drama.dramaShared.fullyAutomaticProduction"), detail: translate("drama.dramaShared.afterTheScriptAutomaticallyGenerateReferencesAndSegmentVideosWith") },
};

/** 素材类型文案：新建页、追加单集与原文编辑共用。placeholder 是粘贴框的格式提示。 */
export const SOURCE_FORMAT_LABEL: Record<DramaSourceFormat, { title: string; detail: string; placeholder: string; guide: string[] }> = {
    novel: {
        title: translate("drama.dramaShared.novelSource"),
        detail: translate("drama.dramaShared.adaptSourceTextIntoShotsPreservingQuotedDialogueWordFor"),
        placeholder: translate("drama.dramaShared.pasteTheNovelTextDialogueInQuotationMarksWillBe"),
        guide: [
            translate("drama.dramaShared.dialogueInOrIsPreservedWordForWord"),
            translate("drama.dramaShared.turnNarrationAndInnerThoughtsIntoFilmableActionsAndExpressions"),
            translate("drama.dramaShared.useOnlyOriginalSentencesForNarrationDoNotInventNew"),
        ],
    },
    script: {
        title: translate("drama.dramaShared.script"),
        detail: translate("drama.dramaShared.breakAnExistingScriptIntoShotsWithoutChangingAnyDialogue"),
        placeholder: translate("drama.dramaShared.pasteTheEpisodeScriptExampleFormat1"),
        guide: [
            translate("drama.dramaShared.oneLinePerUtteranceCharacterDialogueOrCharacterExpressionDialogue"),
            translate("drama.dramaShared.startActionAndVisualDescriptionLinesWith"),
            translate("drama.dramaShared.writeNarrationAsAllDialogueIsPreservedVerbatim"),
        ],
    },
    storyboard: {
        title: translate("account.welcome.chapters.shots.label"),
        detail: translate("drama.dramaShared.importAnExistingStoryboardTableAndPreserveItsOriginalShots"),
        placeholder: translate("drama.dramaShared.pasteAStoryboardTableInMarkdownOrCopiedFromA"),
        guide: [
            translate("drama.dramaShared.theFirstRowContainsHeadersSceneCharacterShotSizeCamera"),
            translate("drama.dramaShared.importMarkdownTablesOrContentCopiedFromExcelDirectlyWithout"),
            translate("drama.dramaShared.separateMultipleDialogueLinesInACellWithBrTo"),
        ],
    },
};

/** 每集章数：1 为每章一集；集数随章数实时换算。新建页与设置页共用。 */
export function EpisodeGroupField({ value, onChange, chapterCount, error, disabled }: { value: number; onChange: (value: number) => void; chapterCount?: number; error?: string; disabled?: boolean }) {
    return (
        <div className="drama-episode-group">
            <span>{translate("drama.dramaShared.chaptersPerEpisode")}</span>
            <InputNumber size="small" min={1} max={12} precision={0} value={value} disabled={disabled} onChange={(next) => onChange(Math.max(1, Math.min(12, Number(next) || 1)))} aria-label={translate("drama.dramaShared.chaptersPerEpisode")} />
            {chapterCount ? <small>{translate("drama.sentences.episodeGroupTotal", { chapters: chapterCount, episodes: Math.ceil(chapterCount / value) })}</small> : null}
            {error ? (
                <p className="drama-episode-group-error" role="alert">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {error}
                </p>
            ) : null}
        </div>
    );
}

export function sourceFormatOf(value: string | undefined): DramaSourceFormat {
    return value === "script" || value === "storyboard" ? value : "novel";
}

export function SourceFormatPicker({ value, onChange, disabled, row }: { value: DramaSourceFormat; onChange: (value: DramaSourceFormat) => void; disabled?: boolean; row?: boolean }) {
    return (
        <div className={`drama-media-modes ${row ? "is-row" : ""}`} role="radiogroup" aria-label={translate("library.assets.page.kindFilter")}>
            {(Object.keys(SOURCE_FORMAT_LABEL) as DramaSourceFormat[]).map((format) => (
                <button key={format} type="button" role="radio" aria-checked={value === format} className="drama-media-mode" disabled={disabled} onClick={() => onChange(format)}>
                    <span className="drama-radio" />
                    <span>
                        <strong>{SOURCE_FORMAT_LABEL[format].title}</strong>
                        <span>{SOURCE_FORMAT_LABEL[format].detail}</span>
                    </span>
                </button>
            ))}
        </div>
    );
}

export type EpisodeTone = "done" | "active" | "review" | "error" | "idle" | "ready";

export function episodeTone(episode: DramaEpisodeRow): EpisodeTone {
    if (episode.error || episode.stats.failed > 0) return "error";
    if (episode.awaitingMedia) return "ready";
    if (episode.stage === "review") return "review";
    if (episode.stage === "done" && !episode.finalStale) return "done";
    if (episode.stage === "queued") return "idle";
    return "active";
}

export function episodeStatusText(episode: DramaEpisodeRow) {
    if (episode.error) return translate("drama.dramaShared.needsAttention");
    if (episode.awaitingMedia) return translate("drama.dramaShared.scriptReadyShotsAwaitingVisuals", { v0: String(episode.shotCount) });
    if (episode.stage === "done" && episode.finalStale) return translate("drama.dramaShared.modifiedAwaitingNewRender");
    const { stats } = episode;
    switch (episode.stage) {
        case "prompts":
            return stats.segments ? translate("drama.dramaShared.prompts", { v0: String(stats.promptReady), v1: String(stats.segments) }) : STAGE_LABEL.prompts;
        case "video":
            return stats.segments ? translate("drama.dramaShared.videos", { v0: String(stats.videoReady), v1: String(stats.segments) }) : STAGE_LABEL.video;
        case "done":
            return translate("drama.dramaShared.completed", { v0: String(formatDuration(episode.durationMs)) });
    }
    return STAGE_LABEL[episode.stage];
}

/** 每个流水线步骤的完成度：0 未开始、0-1 进行中、1 完成。 */
export function stepProgress(episode: DramaEpisodeRow, step: (typeof PIPELINE_STEPS)[number]["key"]) {
    const current = STAGE_INDEX[episode.stage];
    const index = PIPELINE_STEPS.findIndex((item) => item.key === step);
    if (episode.stage === "done" && !episode.finalStale) return 1;
    if (current > index) return 1;
    if (current < index) return 0;
    const total = Math.max(episode.stats.segments, 1);
    if (step === "prompts") return Math.max(0.08, episode.stats.promptReady / total);
    if (step === "video") return Math.max(0.08, episode.stats.videoReady / total);
    return 0.35;
}

export function StagePips({ episode, size = "sm" }: { episode: DramaEpisodeRow; size?: "sm" | "md" }) {
    const tone = episodeTone(episode);
    return (
        <span className={`drama-pips is-${size} is-${tone}`} aria-hidden>
            {PIPELINE_STEPS.map((step) => {
                const progress = stepProgress(episode, step.key);
                return (
                    <span key={step.key} className="drama-pip" title={step.label}>
                        <span className="drama-pip-fill" style={{ "--pip": progress } as CSSProperties} />
                    </span>
                );
            })}
        </span>
    );
}

export function formatDuration(ms: number) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    return minutes ? translate("drama.dramaShared.mS", { v0: String(minutes), v1: String(String(seconds % 60).padStart(2, "0")) }) : translate("drama.dramaShared.s", { v0: String(seconds) });
}

export function formatClock(ms: number) {
    const seconds = Math.max(0, ms / 1000);
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

export function formatCount(value: number) {
    const locale = currentLocale();
    if (locale === "zh-CN" && value >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}万`;
    return new Intl.NumberFormat(locale, value >= 10_000 ? { notation: "compact", maximumFractionDigits: 1 } : undefined).format(value);
}

export function aspectRatioValue(aspect: string) {
    const [width, height] = aspect.split(":").map(Number);
    return width && height ? `${width} / ${height}` : "9 / 16";
}

export function resourceUrl(id?: string) {
    return id ? resourceFileUrl(id) : "";
}

/** 加载失败后的自动重试间隔：访问地址过期、缩略图尚未生成或解码排队超时多是暂时的。 */
const THUMB_RETRY_DELAYS_MS = [1500, 5000];

/**
 * 资源缩略图。加载失败会自动重试两次，之后显示 failed（缺省为 fallback）；
 * loading 是加载中的占位（缺省为 fallback）。
 */
export function MediaThumb({ resourceId, alt, className, fallback, loading, failed }: { resourceId?: string; alt: string; className?: string; fallback?: ReactNode; loading?: ReactNode; failed?: ReactNode }) {
    const [retry, setRetry] = useState({ resourceId, attempt: 0 });
    const attempt = retry.resourceId === resourceId ? retry.attempt : 0;
    if (!resourceId) return <>{fallback ?? null}</>;
    const pending = loading ?? fallback ?? null;
    const delay = THUMB_RETRY_DELAYS_MS[attempt];
    const failure =
        delay === undefined ? (
            (failed ?? fallback ?? null)
        ) : (
            <ThumbRetry delayMs={delay} onRetry={() => setRetry({ resourceId, attempt: attempt + 1 })}>
                {pending}
            </ThumbRetry>
        );
    return <CachedResourceImage key={`${resourceId}:${attempt}`} storageKey={`resource:${resourceId}`} alt={alt} className={className} variant="thumbnail" fallback={failure} loadingFallback={pending} draggable={false} />;
}

function ThumbRetry({ delayMs, onRetry, children }: { delayMs: number; onRetry: () => void; children: ReactNode }) {
    const [handler] = useState(() => onRetry);
    useEffect(() => {
        const timer = window.setTimeout(handler, delayMs);
        return () => window.clearTimeout(timer);
    }, [delayMs, handler]);
    return <>{children}</>;
}

export function mediaBusy(status: DramaMediaStatus) {
    return status === "queued" || status === "running";
}

export function parseList(raw: string | undefined): string[] {
    try {
        const value: unknown = JSON.parse(raw || "[]");
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    } catch {
        return [];
    }
}

/** 把 SRT 转成浏览器 <track> 需要的 WebVTT。 */
export function srtToVtt(srt: string) {
    return `WEBVTT\n\n${srt.replace(/\r/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}

/** 解析资源的授权播放地址；视频优先使用浏览器兼容的播放副本。 */
export function useResourceMediaUrl(resourceId: string | undefined, variant: ResourceAccessVariant = "original") {
    const [url, setUrl] = useState("");
    useEffect(() => {
        setUrl("");
        if (!resourceId) return;
        let active = true;
        void getResourceAccess(`resource:${resourceId}`, "display", variant)
            .catch(() => getResourceAccess(`resource:${resourceId}`, "display", "original"))
            .then((access) => {
                if (active) setUrl(resolveResourceAccessURL(access.url));
            })
            .catch(() => {
                if (active) setUrl(resourceUrl(resourceId));
            });
        return () => {
            active = false;
        };
    }, [resourceId, variant]);
    return url;
}

export async function downloadResource(resourceId: string, fileName: string) {
    const access = await getResourceAccess(`resource:${resourceId}`, "download", "original", fileName);
    const anchor = document.createElement("a");
    anchor.href = resolveResourceAccessURL(access.url);
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

export function downloadText(content: string, fileName: string, mime = "text/plain") {
    const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
