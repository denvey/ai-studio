import { useRef, useState } from "react";
import { App, Button } from "antd";
import { Clapperboard, Download, Film, Scissors } from "lucide-react";

import type { DramaEpisodeDetail } from "@/services/api/drama";

import { aspectRatioValue, downloadResource, formatDuration, MediaThumb, STAGE_LABEL, useResourceMediaUrl } from "../drama-shared";
import { JianyingDraftModal } from "./asset-transfer";
import { secondsLabel } from "./segment-parts";
import { translate } from "@/i18n";

/** 成片：各剧情段视频按顺序拼接，保留视频模型生成的对白与音效。片段条可跳到对应段并打开该段详情。 */
export function FinalView({
    projectId,
    title,
    detail,
    aspectRatio,
    onOpenSegment,
    onOpenCut,
    cutOpening,
}: {
    projectId: string;
    title: string;
    detail: DramaEpisodeDetail;
    aspectRatio: string;
    onOpenSegment: (index: number) => void;
    /** 把各段视频按成片顺序载入精修画布的时间线，在画布里精剪。 */
    onOpenCut: () => void;
    cutOpening: boolean;
}) {
    const { episode, segments } = detail;
    const { message } = App.useApp();
    const [exportingDraft, setExportingDraft] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const url = useResourceMediaUrl(episode.finalResourceId, "playback");
    const readySegments = segments.filter((segment) => segment.videoResourceId && (segment.videoStatus === "ready" || segment.videoStatus === "stale")).length;
    const starts: number[] = [];
    segments.reduce((cursor, segment) => {
        starts.push(cursor);
        return cursor + (segment.request.seconds || segment.durationMs / 1000);
    }, 0);
    const download = () => {
        if (!episode.finalResourceId) return;
        void downloadResource(episode.finalResourceId, translate("drama.studio.finalView.episodeMp4", { v0: String(title), v1: String(episode.number) })).catch((error) => message.error(error instanceof Error ? error.message : translate("canvasA.assetView.downloadFailed")));
    };
    return (
        <div className="drama-finalv">
            <div className="drama-finalv-stage">
                <div className="drama-finalv-player" style={{ aspectRatio: aspectRatioValue(aspectRatio) }}>
                    {url ? (
                        <video ref={videoRef} key={url} src={url} controls playsInline />
                    ) : (
                        <div className="drama-finalv-empty">
                            <Film className="size-6" aria-hidden />
                            <span>{STAGE_LABEL[episode.stage]} {translate("drama.studio.finalView.rendersAutomaticallyWhenAllSegmentVideosAreReady")}</span>
                        </div>
                    )}
                </div>
                <div className="drama-filmstrip thin-scrollbar">
                    {segments.map((segment, position) => (
                        <button
                            key={segment.id || segment.index}
                            type="button"
                            className="drama-filmstrip-item"
                            title={segment.title}
                            onClick={() => {
                                if (videoRef.current) videoRef.current.currentTime = starts[position];
                                onOpenSegment(segment.index);
                            }}
                        >
                            <MediaThumb resourceId={segment.tailFrameResourceId} alt={segment.title} fallback={<span className="drama-filmstrip-empty" />} />
                            <span>
                                {translate("drama.sentences.segmentTime", { number: segment.index + 1, time: secondsLabel(segment.durationMs) })}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
            <aside className="drama-finalv-side">
                <h2>
                    {translate("drama.sentences.episodeTitle", { number: episode.number, title: episode.title })}
                </h2>
                <p>
                    {formatDuration(episode.durationMs)} · {segments.length} {translate("drama.studio.finalView.storySegmentsDialogueAndSoundEffectsComeFromTheVideo")}
                </p>
                {episode.finalStale ? (
                    <p className="drama-finalv-stale" role="status">
                        {translate("drama.studio.finalView.theContentHasChangedThisFinalCutIsThePrevious")}
                    </p>
                ) : null}
                <Button icon={<Download className="size-4" />} disabled={!episode.finalResourceId} onClick={download}>
                    {translate("drama.studio.finalView.downloadFinalCut")}
                </Button>
                <Button icon={<Scissors className="size-4" />} disabled={!readySegments} loading={cutOpening} onClick={onOpenCut}>
                    {translate("drama.studio.finalView.editOnCanvas")}
                </Button>
                <Button icon={<Clapperboard className="size-4" />} disabled={!readySegments} onClick={() => setExportingDraft(true)} title={readySegments ? translate("drama.studio.finalView.exportAJianyingProDraftToContinueEditingInJianying") : translate("drama.studio.finalView.thisEpisodeHasNoCompletedSegmentVideosYet")}>
                    {translate("drama.studio.finalView.exportJianyingDraft")}
                </Button>
                {readySegments ? <p className="drama-editor-note">{translate("drama.studio.finalView.load")} {readySegments} {translate("drama.studio.finalView.segmentVideosIntoTheRefinementCanvasTimelineInFinalCut")}</p> : null}
            </aside>
            {exportingDraft ? <JianyingDraftModal open projectId={projectId} episodeId={episode.id} episodeLabel={translate("drama.studio.finalView.episode", { v0: String(episode.number) })} readySegments={readySegments} onClose={() => setExportingDraft(false)} /> : null}
        </div>
    );
}
