import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { App, Button } from "antd";
import { AntTooltip as Tooltip } from "@/components/ui/base/tooltip/ant-tooltip";
import { AlertTriangle, ArrowDownToLine, ArrowUpToLine, BookOpen, BookOpenText, CheckCircle2, Clapperboard, PanelRightClose, PanelRightOpen, Pencil, PenLine, Quote, ScanSearch, Trash2 } from "lucide-react";

import { averageShotSeconds, normalizeStoryboard, PACING_LABEL, TRANSITION_LABEL } from "@/lib/drama/storyboard";
import { getDramaChapter, type DramaDialogueCheck, type DramaEpisodeDetail, type DramaShot, type DramaShotPatch, type DramaStoryboardSettings } from "@/services/api/drama";

import { formatCount, shotVisualLabel, SOURCE_FORMAT_LABEL, sourceFormatOf } from "../drama-shared";
import { SourceEditModal } from "./episode-source";
import { JobDetailModal } from "./job-detail";
import { ShotEditor } from "./segment-dialog";
import type { EpisodeEmpty } from "./storyboard";
import { translate } from "@/i18n";

function storyboardSummary(value: DramaStoryboardSettings) {
    const rules = normalizeStoryboard(value);
    const dialogue = rules.dialogue === "custom" ? translate("drama.studio.scriptView.customCharactersSecondOneLineEverySeconds", { v0: String(rules.speechRate), v1: String(rules.lineSeconds) }) : { dense: translate("drama.studio.scriptView.dense"), standard: translate("library.assets.density.standard"), sparse: translate("drama.studio.scriptView.restrained") }[rules.dialogue];
    const duration = translate("drama.studio.scriptView.averageSShotDialogueSegments", { v0: String(PACING_LABEL[rules.pacing]), v1: String(averageShotSeconds(rules)), v2: String(dialogue), v3: String({ auto: translate("drama.studio.scriptView.smartSegmentation"), fixed: translate("drama.studio.scriptView.fixedS", { v0: String(rules.segmentSeconds) }), range: translate("drama.studio.scriptView.s", { v0: String(rules.segmentMinSeconds), v1: String(rules.segmentMaxSeconds) }) }[rules.segmentMode]) });
    const transition = rules.transition === "auto" ? translate("drama.studio.scriptView.smartTransitions") : translate("drama.studio.scriptView.uniformTransitions", { v0: String(TRANSITION_LABEL[rules.transition]) });
    return `${duration} · ${transition}`;
}

type SceneGroup = { key: string; scene: string; shots: DramaShot[] };

function groupScenes(shots: DramaShot[]): SceneGroup[] {
    const groups: SceneGroup[] = [];
    for (const shot of shots) {
        const last = groups[groups.length - 1];
        if (last && last.scene === shot.scene) last.shots.push(shot);
        else groups.push({ key: shot.id, scene: shot.scene, shots: [shot] });
    }
    return groups;
}

/** 在原文里定位镜头出处；整句找不到时退回前 16 个字，仍找不到就不标注。 */
function locateQuote(text: string, quote: string) {
    const needle = quote.trim().replace(/^[「“"]+|[」”"]+$/g, "");
    if (!needle) return -1;
    const index = text.indexOf(needle);
    if (index >= 0 || needle.length <= 16) return index >= 0 ? index : -1;
    return text.indexOf(needle.slice(0, 16));
}

export function ScriptView({
    projectId,
    detail,
    storyboard,
    currentId,
    busy,
    onCurrent,
    onRescript,
    onPatchShot,
    onInsertShot,
    onDeleteShot,
    onSourceSaved,
    empty,
}: {
    projectId: string;
    detail: DramaEpisodeDetail;
    storyboard: DramaStoryboardSettings;
    currentId: string;
    busy: boolean;
    onCurrent: (id: string) => void;
    onRescript: () => void;
    onPatchShot: (shot: DramaShot, patch: DramaShotPatch) => void;
    onInsertShot: (shot: DramaShot, position: "before" | "after") => void;
    onDeleteShot: (shot: DramaShot) => void;
    /** 原文已保存；rescript=true 时需要按新原文重新改编。 */
    onSourceSaved: (rescript: boolean) => void;
    empty: EpisodeEmpty;
}) {
    const [processOpen, setProcessOpen] = useState(false);
    const [editingChapterId, setEditingChapterId] = useState("");
    const { modal } = App.useApp();
    const { episode, shots, chapters } = detail;
    const format = sourceFormatOf(episode.sourceFormat);
    const [sourceOpen, setSourceOpen] = useState(true);
    const current = shots.find((shot) => shot.id === currentId);
    const scenes = useMemo(() => groupScenes(shots), [shots]);
    const segmentSizes = useMemo(() => {
        const sizes = new Map<number, number>();
        for (const shot of shots) sizes.set(shot.segmentIndex, (sizes.get(shot.segmentIndex) || 0) + 1);
        return sizes;
    }, [shots]);
    const confirmDelete = (shot: DramaShot) =>
        modal.confirm({
            title: translate("drama.studio.scriptView.deleteShot", { v0: String(String(shot.position + 1).padStart(2, "0")) }),
            content: shot.dialogue ? translate("drama.studio.scriptView.thisShotSDialogueWillAlsoBeDeletedTheSegment", { v0: String(shot.dialogue) }) : translate("drama.studio.scriptView.theSegmentSVideoPromptAndVideoWillBeMarked"),
            okText: translate("common.delete"),
            okButtonProps: { danger: true },
            cancelText: translate("common.cancel"),
            centered: true,
            onOk: () => onDeleteShot(shot),
        });
    const confirmRescript = () =>
        modal.confirm({
            title: translate("drama.studio.scriptView.adaptEpisodeAgain", { v0: String(episode.number) }),
            content: translate("drama.studio.scriptView.regenerateTheScriptShotsAndSegmentsFromTheSourceText"),
            okText: translate("drama.studio.scriptView.adaptAgain"),
            cancelText: translate("common.cancel"),
            centered: true,
            onOk: onRescript,
        });

    return (
        <div className={`drama-scriptv ${sourceOpen ? "" : "is-source-hidden"}`}>
            <div className="drama-scriptv-main thin-scrollbar">
                <section className="drama-scriptv-brief">
                    <div className="drama-scriptv-brief-head">
                        <span className="drama-eyebrow">{translate("drama.studio.scriptView.episodeSynopsis")}</span>
                        <span className="drama-scriptv-format" title={SOURCE_FORMAT_LABEL[format].detail}>
                            {translate("drama.studio.scriptView.assets")}{SOURCE_FORMAT_LABEL[format].title}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            {detail.scriptJob ? (
                                <Button size="small" type="text" icon={<ScanSearch className="size-3.5" />} onClick={() => setProcessOpen(true)}>
                                    {translate("drama.studio.scriptView.adaptationHistory")}
                                </Button>
                            ) : null}
                            <Button size="small" type="text" icon={<PenLine className="size-3.5" />} disabled={busy} onClick={confirmRescript}>
                                {translate("drama.studio.scriptView.adaptAgain")}
                            </Button>
                            <Tooltip title={sourceOpen ? translate("drama.studio.scriptView.hideSource") : translate("drama.studio.scriptView.compareWithSource")}>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={sourceOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
                                    aria-pressed={sourceOpen}
                                    aria-label={sourceOpen ? translate("drama.studio.scriptView.hideSource") : translate("drama.studio.scriptView.compareWithSource")}
                                    onClick={() => setSourceOpen((open) => !open)}
                                />
                            </Tooltip>
                        </div>
                    </div>
                    <p className="drama-scriptv-synopsis">{episode.synopsis || translate("drama.studio.scriptView.theEpisodeSynopsisWillAppearAfterAdaptation")}</p>
                    <div className="drama-scriptv-beats">
                        <div>
                            <span>{translate("drama.studio.scriptView.openingHook")}</span>
                            <p>{episode.hook || "—"}</p>
                        </div>
                        <div>
                            <span>{translate("drama.studio.scriptView.closingCliffhanger")}</span>
                            <p>{episode.cliffhanger || "—"}</p>
                        </div>
                    </div>
                    <div className="drama-scriptv-rules">
                        <span>{translate("drama.studio.scriptView.storyboardRules")}</span>
                        <b>{storyboardSummary(storyboard)}</b>
                        <span>
                            {translate("drama.studio.scriptView.actual")} {shots.length} {translate("drama.studio.scriptView.shots")} {(shots.reduce((sum, shot) => sum + shot.durationMs, 0) / 1000).toFixed(0)} {translate("account.settings.models.unitSecond")}
                        </span>
                    </div>
                    {detail.dialogueCheck ? <DialogueCheckNotice check={detail.dialogueCheck} busy={busy} onRescript={confirmRescript} /> : null}
                </section>

                {shots.length ? (
                    <div className="drama-screenplay">
                        {scenes.map((group, sceneIndex) => (
                            <section key={group.key} className="drama-screenplay-scene">
                                <header>
                                    <span className="drama-screenplay-scene-no">{translate("drama.studio.scriptView.scenes")} {sceneIndex + 1}</span>
                                    <strong>{group.scene || translate("drama.studio.scriptView.untitledScene")}</strong>
                                    <span className="drama-screenplay-scene-meta">
                                        {group.shots.length} {translate("drama.studio.scriptView.shots")} {(group.shots.reduce((sum, shot) => sum + shot.durationMs, 0) / 1000).toFixed(0)} {translate("account.settings.models.unitSecond")}
                                    </span>
                                </header>
                                {group.shots.map((shot) => (
                                    <div
                                        key={shot.id}
                                        className="drama-screenplay-shot"
                                        role="button"
                                        tabIndex={0}
                                        aria-current={shot.id === currentId}
                                        onClick={() => {
                                            if (shot.id !== currentId) onCurrent(shot.id);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" && event.target === event.currentTarget) onCurrent(shot.id);
                                        }}
                                    >
                                        <span className="drama-screenplay-index">{String(shot.position + 1).padStart(2, "0")}</span>
                                        <div className="min-w-0">
                                            {shot.id === currentId ? null : (
                                                <span className="drama-screenplay-edit" aria-hidden>
                                                    <Pencil className="size-3.5" />
                                                </span>
                                            )}
                                            <div className="drama-screenplay-tags">
                                                {shot.shotSize ? <span>{shotVisualLabel(shot.shotSize)}</span> : null}
                                                {shot.camera && shot.camera !== "固定" ? <span>{shotVisualLabel(shot.camera)}</span> : null}
                                                <span>{(shot.durationMs / 1000).toFixed(1)}s</span>
                                                {shot.transition && shot.transition !== "cut" ? <span className="is-transition">{TRANSITION_LABEL[shot.transition as keyof typeof TRANSITION_LABEL]}{translate("drama.studio.scriptView.enter")}</span> : null}
                                                {shot.sourceQuote ? (
                                                    <span className="is-source">
                                                        <Quote className="size-3" />
                                                        {translate("drama.studio.scriptView.hasSourceReference")}
                                                    </span>
                                                ) : null}
                                            </div>
                                            {shot.id === currentId ? (
                                                // 选中的镜头直接在剧本里改：失焦保存，改动只让本段提示词与视频过期。
                                                <div className="drama-screenplay-editor" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                                                    <ShotEditor shot={shot} onPatch={(patch) => onPatchShot(shot, patch)} />
                                                    <div className="drama-screenplay-editor-actions">
                                                        <Button size="small" icon={<ArrowUpToLine className="size-3.5" />} disabled={busy} onClick={() => onInsertShot(shot, "before")}>
                                                            {translate("drama.studio.scriptView.insertShotBefore")}
                                                        </Button>
                                                        <Button size="small" icon={<ArrowDownToLine className="size-3.5" />} disabled={busy} onClick={() => onInsertShot(shot, "after")}>
                                                            {translate("drama.studio.scriptView.insertShotAfter")}
                                                        </Button>
                                                        <span className="flex-1" />
                                                        <Tooltip title={(segmentSizes.get(shot.segmentIndex) || 0) <= 1 ? translate("drama.studio.scriptView.thisIsTheSegmentSOnlyShotDeletingItWould") : ""}>
                                                            <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} disabled={busy || (segmentSizes.get(shot.segmentIndex) || 0) <= 1} onClick={() => confirmDelete(shot)}>
                                                                {translate("drama.studio.scriptView.deleteShot2")}
                                                            </Button>
                                                        </Tooltip>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {shot.action ? <p className="drama-screenplay-action">{shot.action}</p> : null}
                                                    {shot.dialogue ? (
                                                        <div className="drama-screenplay-line">
                                                            <b>{shot.speaker || translate("drama.studio.scriptView.narration")}</b>
                                                            <p>{shot.dialogue}</p>
                                                        </div>
                                                    ) : null}
                                                    {!shot.action && !shot.dialogue ? <p className="drama-screenplay-action is-empty">{translate("drama.studio.scriptView.emptyShotClickToAddActionOrDialogue")}</p> : null}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </section>
                        ))}
                    </div>
                ) : (
                    <div className="drama-scriptv-pending">
                        <Clapperboard className="size-7" />
                        <strong>{empty.title}</strong>
                        <span>{empty.text} {translate("drama.studio.scriptView.readTheNovelSourceForThisEpisodeOnTheRight")}</span>
                        {empty.action}
                    </div>
                )}
            </div>
            <JobDetailModal projectId={projectId} job={processOpen ? detail.scriptJob : undefined} onClose={() => setProcessOpen(false)} onLocate={() => undefined} />
            {sourceOpen ? <SourcePane projectId={projectId} chapters={chapters} quote={current?.sourceQuote || ""} onEdit={setEditingChapterId} /> : null}
            <SourceEditModal
                open={Boolean(editingChapterId)}
                projectId={projectId}
                episodeId={episode.id}
                episodeFormat={format}
                chapter={chapters.find((chapter) => chapter.id === editingChapterId)}
                onClose={() => setEditingChapterId("")}
                onSaved={(rescript) => {
                    setEditingChapterId("");
                    onSourceSaved(rescript);
                }}
            />
        </div>
    );
}

/** 原文台词逐句核对：列出没有逐字出现在镜头台词里的原文台词（被删或被改写）。 */
function DialogueCheckNotice({ check, busy, onRescript }: { check: DramaDialogueCheck; busy: boolean; onRescript: () => void }) {
    const [expanded, setExpanded] = useState(false);
    if (!check.sourceLines) return null;
    if (!check.missingCount) {
        return (
            <div className="drama-dialogue-check is-ok">
                <CheckCircle2 className="size-3.5 shrink-0" />
                {translate("drama.sentences.sourceDialoguePreserved", { count: check.sourceLines })}
            </div>
        );
    }
    const shown = expanded ? check.missing : check.missing.slice(0, 3);
    return (
        <div className="drama-dialogue-check" role="status">
            <div className="drama-dialogue-check-head">
                <AlertTriangle className="size-4 shrink-0" />
                <strong>
                    {translate("drama.sentences.sourceDialogueMissing", { total: check.sourceLines, missing: check.missingCount })}
                </strong>
                <span className="flex-1" />
                <Button size="small" disabled={busy} onClick={onRescript}>
                    {translate("drama.studio.scriptView.adaptAgain")}
                </Button>
            </div>
            <span className="drama-dialogue-check-hint">{translate("drama.studio.scriptView.theyMayHaveBeenRemovedOrRewrittenEditAShot")}</span>
            <ul>
                {shown.map((line) => (
                    <li key={line}>「{line}」</li>
                ))}
            </ul>
            {check.missing.length > 3 ? (
                <button type="button" className="drama-link" onClick={() => setExpanded((value) => !value)}>
                    {expanded ? translate("account.feedback.collapse") : translate("drama.studio.scriptView.showAll", { v0: String(check.missingCount > check.missing.length ? translate("drama.studio.scriptView.showingFirstLines", { v0: String(check.missing.length) }) : "") })}
                </button>
            ) : null}
        </div>
    );
}

function SourcePane({ projectId, chapters, quote, onEdit }: { projectId: string; chapters: DramaEpisodeDetail["chapters"]; quote: string; onEdit: (chapterId: string) => void }) {
    const [chapterId, setChapterId] = useState(chapters[0]?.id || "");
    const activeId = chapters.some((chapter) => chapter.id === chapterId) ? chapterId : chapters[0]?.id || "";
    const query = useQuery({ queryKey: ["drama", projectId, "chapter", activeId], queryFn: ({ signal }) => getDramaChapter(projectId, activeId, signal), enabled: Boolean(activeId), staleTime: 300_000 });
    const text = query.data?.chapter.sourceText || "";
    const hit = text && quote ? locateQuote(text, quote) : -1;
    const markRef = useRef<HTMLElement>(null);
    const needleLength = hit >= 0 ? Math.min(quote.trim().length, text.length - hit) : 0;

    useEffect(() => {
        markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [hit, activeId]);

    if (!chapters.length) {
        return (
            <aside className="drama-source">
                <div className="drama-source-empty">
                    <BookOpenText className="size-6" />
                    {translate("drama.studio.scriptView.noSourceChaptersLinkedToThisEpisodeYet")}
                </div>
            </aside>
        );
    }
    return (
        <aside className="drama-source" aria-label={translate("drama.studio.scriptView.novelSource")}>
            <header className="drama-source-head">
                <div className="drama-source-title">
                    <span className="drama-eyebrow">
                        <BookOpen className="size-3.5" />
                        {translate("drama.studio.scriptView.sourceComparison")}
                    </span>
                    {activeId ? (
                        <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={() => onEdit(activeId)}>
                            {translate("drama.studio.scriptView.editSource")}
                        </Button>
                    ) : null}
                </div>
                <div className="drama-source-tabs thin-scrollbar" role="tablist" aria-label={translate("drama.studio.scriptView.sourceChapters")}>
                    {chapters.map((chapter) => (
                        <button key={chapter.id} type="button" role="tab" aria-selected={chapter.id === activeId} onClick={() => setChapterId(chapter.id)}>
                            {chapter.title}
                            <span>{formatCount(chapter.wordCount)} {translate("drama.studio.scriptView.characters")}</span>
                        </button>
                    ))}
                </div>
            </header>
            <div className="drama-source-text thin-scrollbar">
                {query.isLoading ? (
                    <div className="drama-source-empty">{translate("drama.studio.scriptView.loadingSourceText")}</div>
                ) : hit >= 0 ? (
                    <>
                        {text.slice(0, hit)}
                        <mark ref={markRef}>{text.slice(hit, hit + needleLength)}</mark>
                        {text.slice(hit + needleLength)}
                    </>
                ) : (
                    text
                )}
            </div>
            {quote && hit < 0 && text ? (
                <footer className="drama-source-foot">{translate("drama.studio.scriptView.thisShotSSourceIsInAnotherChapterSwitchChapters")}</footer>
            ) : quote ? (
                <footer className="drama-source-foot is-hit">{translate("drama.studio.scriptView.theCurrentShotSSourceTextIsHighlighted")}</footer>
            ) : (
                <footer className="drama-source-foot">{translate("drama.studio.scriptView.selectAShotOnTheLeftToLocateItsSource")}</footer>
            )}
        </aside>
    );
}
