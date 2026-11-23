import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, InputNumber } from "antd";
import { AlertTriangle, X } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal";
import { DEFAULT_SELECTED_CHAPTERS, groupChapterEpisodes } from "@/lib/drama/chapter-selection";
import { dramaKeys } from "@/lib/drama/drama-query-keys";
import { EPISODE_GROUP_CHARS, EPISODE_SOURCE_CHARS } from "@/lib/drama/novel-parse";
import { getDramaChapter, listDramaChapters, produceDramaChapters, type DramaChapterRef } from "@/services/api/drama";

import { ChapterPickList, type ChapterPickItem } from "../chapter-pick-list";
import { formatCount } from "../drama-shared";
import { translate } from "@/i18n";

const MAX_CHAPTERS_PER_EPISODE = 12;

/**
 * 原著章节：导入时没选中的章节保存为预留章节，在这里继续加入制作。加入后按章节顺序建成新的集追加在末尾，
 * 调度循环随后写剧本；新出现的角色、道具与场景在写剧本时即时建档。
 */
export function ChapterPickerModal({
    open,
    projectId,
    defaultPerEpisode,
    blockedReason,
    onClose,
    onProduced,
}: {
    open: boolean;
    projectId: string;
    defaultPerEpisode: number;
    blockedReason?: string;
    onClose: () => void;
    onProduced: (episodeIds: string[]) => void;
}) {
    const { message } = App.useApp();
    const chaptersQuery = useQuery({ queryKey: dramaKeys.chapters(projectId), queryFn: ({ signal }) => listDramaChapters(projectId, signal), enabled: open });
    const chapters = useMemo(() => chaptersQuery.data?.chapters || [], [chaptersQuery.data]);
    // 默认选“接下来”的几章：从第一个预留章节起连续的预留章节。
    const [picked, setPicked] = useState<{ source: DramaChapterRef[]; chapters: Set<number> } | null>(null);
    const selection = useMemo(() => {
        if (picked?.source === chapters) return picked.chapters;
        const reserved = chapters.flatMap((chapter, index) => (chapter.reserved ? [index] : []));
        return new Set(reserved.slice(0, DEFAULT_SELECTED_CHAPTERS));
    }, [chapters, picked]);
    const [perEpisode, setPerEpisode] = useState<number | null>(null);
    const size = perEpisode ?? Math.max(1, defaultPerEpisode);
    const [previewIndex, setPreviewIndex] = useState<number>();
    const firstReserved = chapters.findIndex((chapter) => chapter.reserved);
    const preview = chapters[previewIndex ?? (firstReserved >= 0 ? firstReserved : 0)];
    const previewQuery = useQuery({ queryKey: [...dramaKeys.chapters(projectId), preview?.id], queryFn: ({ signal }) => getDramaChapter(projectId, preview!.id, signal), enabled: open && Boolean(preview), staleTime: 60_000 });

    const items = useMemo<ChapterPickItem[]>(
        () =>
            chapters.map((chapter) => ({
                key: chapter.id,
                title: chapter.title,
                words: chapter.wordCount,
                warn: chapter.reserved && chapter.wordCount > EPISODE_SOURCE_CHARS,
                disabled: !chapter.reserved,
                note: chapter.reserved ? undefined : chapter.episodeNumber ? translate("drama.studio.chapterPicker.episode2", { v0: String(chapter.episodeNumber) }) : translate("drama.studio.chapterPicker.joined"),
            })),
        [chapters],
    );
    const chosen = useMemo(() => [...selection].filter((index) => chapters[index]?.reserved).sort((left, right) => left - right), [chapters, selection]);
    const groups = useMemo(
        () =>
            groupChapterEpisodes(
                chosen.map((index) => ({ position: chapters[index].position, chars: chapters[index].wordCount })),
                size,
            ),
        [chapters, chosen, size],
    );
    const longChapters = chosen.filter((index) => chapters[index].wordCount > EPISODE_SOURCE_CHARS).length;
    const oversized = groups.find((group) => group.chars > EPISODE_GROUP_CHARS);
    const reservedCount = items.filter((item) => !item.disabled).length;
    const problem = blockedReason
        ? blockedReason
        : longChapters
          ? translate("drama.studio.chapterPicker.selectedChaptersExceed10000CharactersEachSplitTheirSource", { v0: String(longChapters), v1: String(EPISODE_SOURCE_CHARS / 10_000) })
          : oversized
            ? translate("drama.studio.chapterPicker.totalsCharactersEachEpisodeSSourceIsLimitedToCharacters", { v0: String(oversized.label), v1: String(formatCount(oversized.chars)), v2: String(formatCount(EPISODE_GROUP_CHARS)) })
            : "";

    const produce = useMutation({
        mutationFn: () => produceDramaChapters(projectId, { chapterIds: chosen.map((index) => chapters[index].id), chaptersPerEpisode: size }),
        onSuccess: (result) => {
            message.success(translate("drama.studio.chapterPicker.addedChaptersAndCreatedEpisodesAdaptationStarted", { v0: String(chosen.length), v1: String(result.episodeIds.length) }));
            setPicked(null);
            onProduced(result.episodeIds);
        },
        onError: (error) => message.error(error instanceof Error ? error.message : translate("drama.studio.chapterPicker.failedToAddToProduction")),
    });

    return (
        <AppModal open={open} onCancel={onClose} footer={null} title={null} closable={false} flush centered width="min(1120px, calc(100vw - 48px))" rootClassName="drama-root" aria-label={translate("drama.studio.chapterPicker.originalChapters")}>
            <div className="drama-composer">
                <header className="drama-composer-head">
                    <div className="min-w-0">
                        <strong>{translate("drama.studio.chapterPicker.originalChapters")}</strong>
                        <span>{translate("drama.studio.chapterPicker.selectChaptersOmittedDuringImportToAppendNewEpisodesIn")}</span>
                    </div>
                    <Button type="text" icon={<X className="size-4" />} aria-label={translate("common.close")} onClick={onClose} />
                </header>
                <div className="drama-composer-body drama-chapter-picker-body">
                    <aside className="drama-chapter-picker-side">
                        {chaptersQuery.isLoading ? (
                            <div className="drama-empty is-compact">{translate("drama.studio.chapterPicker.loadingOriginalChapterList")}</div>
                        ) : chaptersQuery.isError ? (
                            <div className="drama-empty is-compact">
                                {translate("drama.studio.chapterPicker.failedToLoadTheOriginalChapterList")}
                                <Button size="small" onClick={() => void chaptersQuery.refetch()}>
                                    {translate("common.retry")}
                                </Button>
                            </div>
                        ) : (
                            <ChapterPickList items={items} selected={selection} onChange={(next) => setPicked({ source: chapters, chapters: next })} previewIndex={previewIndex ?? firstReserved} onPreview={setPreviewIndex} quickLabel={translate("drama.studio.chapterPicker.next")} />
                        )}
                    </aside>
                    <section className="drama-composer-editor">
                        {problem ? (
                            <div className="drama-composer-notice" role="alert">
                                <AlertTriangle className="size-4 shrink-0" />
                                {problem}
                            </div>
                        ) : null}
                        <div className="drama-chapter-picker-preview thin-scrollbar" aria-label={translate("drama.studio.chapterPicker.sourcePreview")}>
                            {preview ? (
                                <>
                                    <h3>
                                        {preview.title}
                                        <small>
                                            {formatCount(preview.wordCount)} {translate("drama.studio.chapterPicker.characters")}{preview.reserved ? (" " + translate("drama.studio.chapterPicker.notInProduction")) : preview.episodeNumber ? translate("drama.studio.chapterPicker.episode", { v0: String(preview.episodeNumber) }) : ""}
                                        </small>
                                    </h3>
                                    <p>{previewQuery.isLoading ? translate("drama.studio.chapterPicker.loadingSourceText") : previewQuery.isError ? translate("drama.studio.chapterPicker.failedToLoadSourceText") : (previewQuery.data?.chapter.sourceText || "").slice(0, 8000)}</p>
                                </>
                            ) : (
                                <p>{translate("drama.studio.chapterPicker.noOriginalChapters")}</p>
                            )}
                        </div>
                    </section>
                </div>
                <footer className="drama-composer-foot">
                    <span className="drama-chapter-picker-size">
                        {translate("drama.studio.chapterPicker.perEpisode")}
                        <InputNumber size="small" min={1} max={MAX_CHAPTERS_PER_EPISODE} precision={0} value={size} onChange={(value) => setPerEpisode(value || 1)} aria-label={translate("drama.studio.chapterPicker.chaptersPerEpisode")} />{translate("drama.studio.chapterPicker.chapters")}
                    </span>
                    <span className="drama-composer-count">{reservedCount ? translate("drama.studio.chapterPicker.chaptersNotInProductionSelectedChaptersWillCreateEpisodes", { v0: String(formatCount(reservedCount)), v1: String(formatCount(chosen.length)), v2: String(formatCount(groups.length)) }) : translate("drama.studio.chapterPicker.allOriginalChaptersAreInProduction")}</span>
                    <span className="flex-1" />
                    <Button onClick={onClose}>{translate("common.cancel")}</Button>
                    <Button type="primary" disabled={!chosen.length || Boolean(problem)} loading={produce.isPending} onClick={() => produce.mutate()}>
                        {translate("drama.studio.chapterPicker.addToProduction")}
                    </Button>
                </footer>
            </div>
        </AppModal>
    );
}
