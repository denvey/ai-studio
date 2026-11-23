import { memo, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Film, Image as ImageIcon, LayoutGrid, LoaderCircle, LocateFixed, Scissors, Send } from "lucide-react";
import { Link } from "react-router";

import { CachedResourceImage } from "@/components/cached-resource-image";
import type { DramaCanvasPresence } from "@/lib/canvas/drama-canvas-projection";
import { DRAMA_CAST_KIND_LABEL, DRAMA_STATUS_LABEL, dramaCastDisplayName, formatDramaCredits } from "@/lib/drama/drama-format";
import { dramaKeys } from "@/lib/drama/drama-query-keys";
import { getDramaEpisode, type DramaCast, type DramaEpisodeRow, type DramaSegment, type DramaSummary } from "@/services/api/drama";
import { translate } from "@/i18n";

// 精修画布的短剧侧栏：列出作品的设定与分集，按需投送到画布或定位已投送的节点。
// 数据只读，写入都经由画布节点的“采用到短剧”。

type CanvasDramaSidebarProps = {
    summary: DramaSummary;
    cast: DramaCast[] | undefined;
    presence: DramaCanvasPresence;
    busyKey: string | null;
    onProjectCast: (castId: string) => void;
    onProjectSegment: (episodeId: string, segmentIndex: number) => void;
    onProjectEpisode: (episodeId: string) => void;
    onProjectFinal: (episodeId: string) => void;
    onOpenCut: (episodeId: string) => void;
};

const CAST_ORDER: Record<DramaCast["kind"], number> = { character: 0, scene: 1, prop: 2 };

export const CanvasDramaSidebar = memo(function CanvasDramaSidebar({ summary, cast, presence, busyKey, onProjectCast, onProjectSegment, onProjectEpisode, onProjectFinal, onOpenCut }: CanvasDramaSidebarProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const dramaId = summary.project.id;
    const studioPath = `/projects/${encodeURIComponent(dramaId)}`;
    const orderedCast = useMemo(() => [...(cast || [])].sort((left, right) => CAST_ORDER[left.kind] - CAST_ORDER[right.kind] || left.position - right.position), [cast]);
    const { production } = summary;

    if (collapsed) {
        return (
            <aside
                className="canvas-project-sidebar is-collapsed relative z-[var(--z-panel)] hidden w-11 shrink-0 flex-col items-center border-r border-border bg-background/94 py-2 backdrop-blur-xl lg:flex"
                aria-label={translate("canvasTools.canvasDramaSidebar.dramaSidebar")}
            >
                <button
                    type="button"
                    className="grid size-7 place-items-center rounded-md text-foreground/55 hover:bg-surface-hover"
                    title={translate("canvasTools.canvasDramaSidebar.expandDramaSidebar")}
                    aria-label={translate("canvasTools.canvasDramaSidebar.expandDramaSidebar")}
                    onClick={() => setCollapsed(false)}
                >
                    <ChevronRight className="size-4" />
                </button>
                <Link
                    to={studioPath}
                    className="canvas-project-sidebar-back-link mt-2 grid size-7 place-items-center rounded-md text-foreground/55 hover:bg-surface-hover"
                    title={translate("canvasTools.canvasDramaSidebar.openDramaStudio")}
                    aria-label={translate("canvasTools.canvasDramaSidebar.openDramaStudio")}
                >
                    <Clapperboard className="size-4" />
                </Link>
            </aside>
        );
    }

    return (
        <aside
            className="canvas-project-sidebar canvas-drama-sidebar relative z-[var(--z-panel)] hidden w-[var(--canvas-sidebar-width)] shrink-0 flex-col border-r border-border bg-background/94 backdrop-blur-xl lg:flex"
            aria-label={translate("canvasTools.canvasDramaSidebar.dramaSidebar")}
        >
            <header className="canvas-project-sidebar-header flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
                <Link to={studioPath} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-xs font-semibold" title={translate("canvasTools.canvasDramaSidebar.openDramaStudio2", { v0: String(summary.project.name) })}>
                    <Clapperboard className="size-3.5 shrink-0" />
                    <span className="min-w-0">
                        <span className="block truncate">{summary.project.name}</span>
                        <span className="block text-[var(--fs-micro)] font-normal text-foreground/42">{translate("canvasTools.inline.canvasDramaSidebar.canvasRefinement", { v0: String(DRAMA_STATUS_LABEL[production.status]) })}</span>
                    </span>
                </Link>
                <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded-md text-foreground/45 hover:bg-surface-hover"
                    title={translate("canvasTools.canvasDramaSidebar.collapseDramaSidebar")}
                    aria-label={translate("canvasTools.canvasDramaSidebar.collapseDramaSidebar")}
                    onClick={() => setCollapsed(true)}
                >
                    <ChevronLeft className="size-4" />
                </button>
            </header>

            <div className="canvas-project-sidebar-chapter-scroll thin-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-2" data-canvas-wheel-scroll>
                <section aria-labelledby="canvas-drama-cast-heading">
                    <h2 id="canvas-drama-cast-heading" className="canvas-project-sidebar-section-heading flex h-9 items-center gap-2 px-3 text-[var(--fs-label)] font-medium">
                        <ImageIcon className="size-3.5" />
                        {translate("canvasA.dramaAdopt.cast")} <span className="tabular-nums text-foreground/32">{orderedCast.length}</span>
                    </h2>
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5 px-2">
                        {cast === undefined ? <SidebarNote>{translate("canvasA.dramaAdopt.loadingCast")}</SidebarNote> : null}
                        {cast && !orderedCast.length ? <SidebarNote>{translate("canvasTools.canvasDramaSidebar.charactersLocationsAndPropsWillAppearWhenTheStoryBible")}</SidebarNote> : null}
                        {orderedCast.map((item) => {
                            const placed = presence.cast.has(item.id);
                            const busy = busyKey === `cast:${item.id}`;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    className="canvas-project-sidebar-chapter-row group flex h-11 items-center gap-2 px-1 text-left text-xs"
                                    disabled={Boolean(busyKey)}
                                    onClick={() => onProjectCast(item.id)}
                                    title={
                                        placed
                                            ? translate("canvasTools.canvasDramaSidebar.locateOnTheCanvas", { v0: String(dramaCastDisplayName(item)) })
                                            : translate("canvasTools.canvasDramaSidebar.sendReferenceImagesForToTheCanvas", { v0: String(dramaCastDisplayName(item)) })
                                    }
                                >
                                    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[var(--r-sm)] bg-foreground/[.05] text-foreground/30">
                                        {item.imageResourceId ? (
                                            <CachedResourceImage storageKey={`resource:${item.imageResourceId}`} variant="thumbnail" alt="" className="size-full object-cover" draggable={false} fallback={<ImageIcon className="size-3.5" />} />
                                        ) : (
                                            <ImageIcon className="size-3.5" />
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-foreground/78">{dramaCastDisplayName(item)}</span>
                                        <span className="block truncate text-[var(--fs-micro)] text-foreground/38">
                                            {DRAMA_CAST_KIND_LABEL[item.kind]}
                                            {item.imageResourceId ? "" : " " + translate("canvasTools.canvasDramaSidebar.noReferenceImagesYet")}
                                        </span>
                                    </span>
                                    <RowState placed={placed} stale={Boolean(presence.cast.get(item.id))} busy={busy} />
                                </button>
                            );
                        })}
                    </div>
                </section>

                <section aria-labelledby="canvas-drama-episode-heading" className="mt-2">
                    <h2 id="canvas-drama-episode-heading" className="canvas-project-sidebar-section-heading flex h-9 items-center gap-2 px-3 text-[var(--fs-label)] font-medium">
                        <Film className="size-3.5" />
                        {translate("canvasA.dramaAdopt.episode")} <span className="tabular-nums text-foreground/32">{summary.episodes.length}</span>
                    </h2>
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5 px-2">
                        {!summary.episodes.length ? <SidebarNote>{translate("canvasTools.canvasDramaSidebar.episodesWillAppearHereWhenEpisodePlanningIsComplete")}</SidebarNote> : null}
                        {summary.episodes.map((episode) => (
                            <EpisodeItem
                                key={episode.id}
                                dramaId={dramaId}
                                episode={episode}
                                expanded={expandedId === episode.id}
                                onToggle={() => setExpandedId((current) => (current === episode.id ? null : episode.id))}
                                presence={presence}
                                busyKey={busyKey}
                                running={production.status === "running"}
                                onProjectSegment={onProjectSegment}
                                onProjectEpisode={onProjectEpisode}
                                onProjectFinal={onProjectFinal}
                                onOpenCut={onOpenCut}
                            />
                        ))}
                    </div>
                </section>
            </div>

            <footer className="canvas-project-sidebar-assets shrink-0 border-t border-border/70 p-2">
                <div className="px-1 pb-2 text-[var(--fs-micro)] leading-5 text-foreground/50">
                    <div className="flex items-center justify-between gap-2">
                        <span>{translate("canvasTools.canvasDramaSidebar.creditsUsed")}</span>
                        <span className="tabular-nums text-foreground/72">
                            {formatDramaCredits(production.spentMicrocredits)}
                            {production.budgetMicrocredits > 0 ? ` / ${formatDramaCredits(production.budgetMicrocredits)}` : ""}
                        </span>
                    </div>
                    {production.canvasSpentMicrocredits > 0 ? (
                        <div className="flex items-center justify-between gap-2">
                            <span>{translate("canvasTools.canvasDramaSidebar.canvasRefinementIncluded")}</span>
                            <span className="tabular-nums">{formatDramaCredits(production.canvasSpentMicrocredits)}</span>
                        </div>
                    ) : null}
                </div>
                <Link to={studioPath} className="canvas-project-sidebar-assets-button flex h-9 w-full items-center gap-2 rounded-md border border-border/45 px-2 text-xs text-foreground/65">
                    <Clapperboard className="size-3.5 text-foreground/42" />
                    <span className="flex-1 text-left">{translate("canvasTools.canvasDramaSidebar.openDramaStudio")}</span>
                    <ArrowUpRight className="size-3.5 text-foreground/42" />
                </Link>
            </footer>
        </aside>
    );
});

function EpisodeItem({
    dramaId,
    episode,
    expanded,
    onToggle,
    presence,
    busyKey,
    running,
    onProjectSegment,
    onProjectEpisode,
    onProjectFinal,
    onOpenCut,
}: {
    dramaId: string;
    episode: DramaEpisodeRow;
    expanded: boolean;
    onToggle: () => void;
    presence: DramaCanvasPresence;
    busyKey: string | null;
    running: boolean;
    onProjectSegment: (episodeId: string, segmentIndex: number) => void;
    onProjectEpisode: (episodeId: string) => void;
    onProjectFinal: (episodeId: string) => void;
    onOpenCut: (episodeId: string) => void;
}) {
    const detailQuery = useQuery({
        queryKey: dramaKeys.episode(dramaId, episode.id),
        queryFn: ({ signal }) => getDramaEpisode(dramaId, episode.id, signal),
        enabled: expanded,
        staleTime: 15_000,
        refetchInterval: expanded && running ? 15_000 : false,
    });
    const segments = useMemo(() => [...(detailQuery.data?.segments || [])].sort((left, right) => left.index - right.index), [detailQuery.data?.segments]);
    const panelId = `canvas-drama-episode-${episode.id}`;
    const finalPlaced = presence.final.has(episode.id);
    const busy = Boolean(busyKey);
    const status = episodeSummary(episode);
    return (
        <div>
            <button type="button" className="canvas-project-sidebar-chapter-row flex h-11 w-full items-center gap-2 px-1 text-left text-xs" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
                <ChevronDown className={`size-3.5 shrink-0 text-foreground/35 transition-transform motion-reduce:transition-none ${expanded ? "" : "-rotate-90"}`} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground/78">
                        <span className="tabular-nums text-foreground/45">{translate("canvasTools.inline.canvasDramaSidebar.episode", { v0: String(episode.number) })}</span> {episode.title}
                    </span>
                    <span className={`block truncate text-[var(--fs-micro)] ${status.error ? "" : "text-foreground/38"}`} style={status.error ? { color: "var(--status-error)" } : undefined}>
                        {status.text}
                    </span>
                </span>
                {presence.final.get(episode.id) ? <StaleDot /> : null}
            </button>
            {expanded ? (
                <div id={panelId} className="min-w-0 pb-2 pl-5">
                    <div className="mb-1 grid grid-cols-3 gap-1">
                        <SidebarAction
                            icon={<LayoutGrid className="size-3" />}
                            label={translate("canvasTools.canvasDramaSidebar.sendEntireEpisode")}
                            busy={busyKey === `episode:${episode.id}`}
                            disabled={busy || !episode.stats.segments}
                            title={translate("canvasTools.canvasDramaSidebar.sendAllStorySegmentsInThisEpisodeToTheCanvas")}
                            onClick={() => onProjectEpisode(episode.id)}
                        />
                        <SidebarAction
                            icon={finalPlaced ? <LocateFixed className="size-3" /> : <Film className="size-3" />}
                            label={finalPlaced ? translate("canvasTools.canvasDramaSidebar.locateFinalVideo") : translate("canvasTools.canvasDramaSidebar.finalCut")}
                            busy={busyKey === `final:${episode.id}`}
                            disabled={busy || (!finalPlaced && !episode.finalResourceId)}
                            title={episode.finalResourceId || finalPlaced ? translate("canvasTools.canvasDramaSidebar.sendTheFinalVideoOfThisEpisodeToTheCanvas") : translate("canvasTools.canvasDramaSidebar.thisEpisodeHasNoFinalVideoYet")}
                            onClick={() => onProjectFinal(episode.id)}
                        />
                        <SidebarAction
                            icon={<Scissors className="size-3" />}
                            label={translate("canvasTools.canvasDramaSidebar.edit")}
                            busy={busyKey === `cut:${episode.id}`}
                            disabled={busy || !episode.stats.videoReady}
                            title={episode.stats.videoReady ? translate("canvasTools.canvasDramaSidebar.loadStorySegmentVideosIntoTheCanvasTimelineInOrder") : translate("canvasTools.canvasDramaSidebar.noStorySegmentVideosAvailableToEditYet")}
                            onClick={() => onOpenCut(episode.id)}
                        />
                    </div>
                    {detailQuery.isLoading ? <SidebarNote>{translate("canvasA.dramaAdopt.loadingSegments")}</SidebarNote> : null}
                    {detailQuery.isError ? <SidebarNote tone="error">{translate("canvasTools.canvasDramaSidebar.failedToLoadStorySegmentsPleaseTryAgainLater")}</SidebarNote> : null}
                    {detailQuery.data && !segments.length ? <SidebarNote>{translate("canvasTools.canvasDramaSidebar.storySegmentsWillAppearWhenTheScriptAndStoryboardAre")}</SidebarNote> : null}
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                        {segments.map((segment) => {
                            const placed = presence.segment.has(segment.id);
                            return (
                                <button
                                    key={segment.id}
                                    type="button"
                                    className="canvas-project-sidebar-chapter-row group flex h-9 items-center gap-2 px-1 text-left text-xs"
                                    disabled={busy}
                                    onClick={() => onProjectSegment(episode.id, segment.index)}
                                    title={placed ? translate("canvasTools.canvasDramaSidebar.locateThisStorySegmentOnTheCanvas") : translate("canvasTools.canvasDramaSidebar.sendThisStorySegmentReferenceImagesFirstFrameVideoAnd")}
                                >
                                    <SegmentStatusDot segment={segment} />
                                    <span className="min-w-0 flex-1 truncate text-foreground/72">
                                        <span className="tabular-nums text-foreground/42">{segment.index + 1}</span> {segment.title}
                                    </span>
                                    <RowState placed={placed} stale={Boolean(presence.segment.get(segment.id))} busy={busyKey === `segment:${episode.id}:${segment.index}`} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function episodeSummary(episode: DramaEpisodeRow) {
    if (episode.error || episode.stats.failed > 0) return { text: translate("canvasTools.canvasDramaSidebar.needsAttention"), error: true };
    if (episode.finalResourceId && !episode.finalStale) return { text: translate("canvasTools.canvasDramaSidebar.finalVideoReady"), error: false };
    if (episode.finalResourceId && episode.finalStale) return { text: translate("canvasTools.canvasDramaSidebar.modifiedRecompositionNeeded"), error: false };
    if (episode.stats.segments) return { text: translate("canvasTools.canvasDramaSidebar.videosSegments", { v0: String(episode.stats.videoReady), v1: String(episode.stats.segments) }), error: false };
    return { text: episode.stage === "queued" ? translate("canvasPage.taskStatus.queued") : translate("canvasTools.canvasDramaSidebar.preparingScript"), error: false };
}

const SEGMENT_STATUS_TONE: Partial<Record<DramaSegment["videoStatus"], { color: string; label: string }>> = {
    ready: { color: "var(--status-success)", label: translate("create.status.videoGenerated") },
    stale: { color: "var(--status-warning)", label: translate("canvasTools.canvasDramaSidebar.videoNeedsToBeRegenerated") },
    running: { color: "var(--status-loading)", label: translate("canvasTools.canvasDramaSidebar.generatingVideo") },
    queued: { color: "var(--status-loading)", label: translate("canvasTools.canvasDramaSidebar.videoQueued") },
    failed: { color: "var(--status-error)", label: translate("canvasTools.canvasDramaSidebar.videoGenerationFailed") },
};

function SegmentStatusDot({ segment }: { segment: DramaSegment }) {
    const tone = SEGMENT_STATUS_TONE[segment.videoStatus];
    return (
        <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: tone?.color || "color-mix(in srgb, var(--foreground) 18%, transparent)" }}
            role="img"
            aria-label={tone?.label || translate("canvasTools.canvasDramaSidebar.videoNotGenerated")}
            title={tone?.label || translate("canvasTools.canvasDramaSidebar.videoNotGenerated")}
        />
    );
}

function RowState({ placed, stale, busy }: { placed: boolean; stale: boolean; busy: boolean }) {
    if (busy) return <LoaderCircle className="size-3.5 shrink-0 animate-spin text-foreground/45 motion-reduce:animate-none" aria-label={translate("canvasTools.canvasDramaSidebar.sending")} />;
    return (
        <span className="flex shrink-0 items-center gap-1">
            {stale ? <StaleDot /> : null}
            {placed ? (
                <LocateFixed className="size-3.5 text-foreground/32 group-hover:text-[var(--workspace-accent)]" aria-label={translate("canvasTools.canvasDramaSidebar.alreadyOnCanvas")} />
            ) : (
                <Send className="size-3.5 text-foreground/25 group-hover:text-[var(--workspace-accent)]" aria-label={translate("canvasTools.canvasDramaSidebar.sendToCanvas")} />
            )}
        </span>
    );
}

function StaleDot() {
    return (
        <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: "var(--status-warning)" }}
            role="img"
            aria-label={translate("canvasTools.canvasDramaSidebar.aNewerVersionIsAvailableInTheDramaStudio")}
            title={translate("canvasTools.canvasDramaSidebar.aNewerVersionIsAvailableInTheDramaStudioSync")}
        />
    );
}

function SidebarAction({ icon, label, title, busy, disabled, onClick }: { icon: ReactNode; label: string; title: string; busy: boolean; disabled: boolean; onClick: () => void }) {
    return (
        <button type="button" className="canvas-drama-sidebar-action inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-md border px-1.5 text-[var(--fs-micro)] font-medium" disabled={disabled} title={title} onClick={onClick}>
            <span className="grid shrink-0 place-items-center">{busy ? <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" /> : icon}</span>
            <span className="min-w-0 truncate">{label}</span>
        </button>
    );
}

function SidebarNote({ children, tone }: { children: ReactNode; tone?: "error" }) {
    return (
        <p className="px-1 py-2 text-[var(--fs-micro)] leading-5 text-foreground/40" style={tone === "error" ? { color: "var(--status-error)" } : undefined}>
            {children}
        </p>
    );
}
