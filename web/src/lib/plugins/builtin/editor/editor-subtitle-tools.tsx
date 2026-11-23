// SRT 导入导出（复用 srt-parser）+ 「从节点重建字幕片段」命令（快照契约：
// 节点 subtitleEntries 权威 → 重建时间线字幕快照，替换过期快照，单向显式同步）。
// 时间线字幕片段是节点字幕的只读快照；AI 高亮只写权威节点字幕。
// 当前预览不渲染字幕高亮，因此本工具不重复发起 AI 请求，避免产生两份互相漂移的结果。

import { useMemo, useState } from "react";

import { useEditorStoreContext } from "@/components/editor/editor-context";
import { parseSrt, serializeSrtEntries } from "@/lib/timeline/srt-parser";
import { getSubtitleTracks } from "@/lib/timeline/timeline-tracks";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import type { SrtEntry, TimelineClip } from "@/types/timeline";
import { translate } from "@/i18n";


const DEFAULT_SRT_NODE_ID = "srt-import";

export function EditorSubtitleTools() {
    const { project, dispatch } = useEditorStoreContext();
    const [srtText, setSrtText] = useState("");
    const [message, setMessage] = useState<string | null>(null);

    const subtitleClips = useMemo(
        () => (project?.clips ?? []).filter((c) => c.kind === "subtitle").sort((a, b) => a.startMs - b.startMs),
        [project],
    );
    const subtitleTracks = useMemo(() => (project ? getSubtitleTracks(project.tracks) : []), [project]);

    // SRT 导入：解析文本 → rebuildSubtitleClips 以 DEFAULT_SRT_NODE_ID 为权威节点重建
    // 字幕快照。确定性 id（nodeId:subtitle:index）保证重复导入原地替换，不堆积漂移。
    const importSrt = () => {
        const entries = parseSrt(srtText);
        if (entries.length === 0) {
            setMessage(translate("shared.plugins.builtin.editor.editorSubtitleTools.noValidSRTEntriesFound"));
            return;
        }
        dispatch({
            op: "rebuildSubtitleClips",
            payload: { nodeId: DEFAULT_SRT_NODE_ID, entries, trackId: subtitleTracks[0]?.id },
        });
        setMessage(translate("shared.plugins.builtin.editor.editorSubtitleTools.rebuiltSubtitleSnapshotsFromNode", { v0: String(DEFAULT_SRT_NODE_ID), v1: String(entries.length) }));
    };

    // SRT 导出：当前时间线字幕快照 → 序列化 → 下载 .srt（往返一致）。
    const exportSrt = () => {
        if (subtitleClips.length === 0) {
            setMessage(translate("shared.plugins.builtin.editor.editorSubtitleTools.thereAreNoSubtitleClipsOnTheTimeline"));
            return;
        }
        const entries: SrtEntry[] = subtitleClips.map((clip, idx) => ({
            index: clip.subtitleEntryIndex ?? idx + 1,
            startMs: clip.startMs,
            endMs: clip.startMs + clip.durationMs,
            text: clip.text ?? "",
        }));
        const content = serializeSrtEntries(entries);
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "subtitles.srt";
        a.click();
        URL.revokeObjectURL(url);
        setMessage(translate("shared.plugins.builtin.editor.editorSubtitleTools.exportedSubtitles", { v0: String(entries.length) }));
    };

    return (
        <div className="flex h-full flex-col bg-[var(--previs-sequencer-surface)]">
            <div className="director-scroll min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-3 rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-control-hover)] p-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--previs-dock-fg-strong)]">{translate("shared.plugins.builtin.editor.editorSubtitleTools.timelineSubtitles")}</span>
                        <span className="text-[var(--fs-label)] text-[var(--previs-dock-fg)]/60">{subtitleClips.length} {translate("account.layout.pagination.item")}</span>
                    </div>
                    {subtitleClips.length === 0 ? (
                        <p className="mt-2 text-[var(--fs-label)] leading-relaxed text-[var(--previs-dock-fg)]/55">{translate("shared.plugins.builtin.editor.editorSubtitleTools.noSubtitleSnapshotYetPasteAndImportSRTToRebuild")}</p>
                    ) : (
                        <ul className="mt-2 space-y-1">
                            {subtitleClips.slice(0, 6).map((clip) => (
                                <SubtitleRow key={clip.id} clip={clip} />
                            ))}
                            {subtitleClips.length > 6 && (
                                <li className="pt-1 text-[var(--fs-label)] text-[var(--previs-dock-fg)]/50">{translate("shared.plugins.builtin.editor.editorSubtitleTools.total")} {subtitleClips.length} {translate("account.layout.pagination.item")}</li>
                            )}
                        </ul>
                    )}
                </div>

                <label className="mb-3 block">
                    <span className="mb-1 block text-[var(--fs-label)] text-[var(--previs-dock-fg)]/70">{translate("shared.plugins.builtin.editor.editorSubtitleTools.sRTTextImport")}</span>
                    <textarea
                        value={srtText}
                        onChange={(e) => setSrtText(e.target.value)}
                        rows={8}
                        placeholder={translate("shared.plugins.builtin.editor.editorSubtitleTools.item1000000500000002500Hello")}
                        className="w-full resize-y rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-control-hover)] px-2 py-2 font-mono text-[var(--fs-label)] leading-relaxed text-[var(--previs-dock-fg-strong)] outline-none focus:border-[var(--workspace-accent)]/60"
                    />
                </label>

                <div className="mb-3 flex gap-2">
                    <button
                        type="button"
                        onClick={importSrt}
                        disabled={!srtText.trim()}
                        className="flex-1 rounded-md bg-[var(--previs-accent)] px-2 py-2 text-xs font-medium text-[var(--previs-on-accent)] hover:bg-[var(--previs-accent-hover)] disabled:opacity-40"
                    >
                        {translate("shared.plugins.builtin.editor.editorSubtitleTools.importRebuildSubtitles")}
                    </button>
                    <button
                        type="button"
                        onClick={exportSrt}
                        disabled={subtitleClips.length === 0}
                        className="flex-1 rounded-md border border-[var(--previs-sequencer-border)] px-2 py-2 text-xs text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)] disabled:opacity-40"
                    >
                        {translate("shared.plugins.builtin.editor.editorSubtitleTools.exportSRT")}
                    </button>
                </div>

                <div className="rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-control-hover)] p-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--previs-dock-fg-strong)]">{translate("shared.plugins.builtin.editor.editorSubtitleTools.aIHighlighting")}</span>
                        <span className="rounded-full bg-[var(--previs-dock-active-surface)] px-2 py-0.5 text-[var(--fs-label)] text-[var(--previs-dock-fg)]/80">{translate("account.settings.channels.ready")}</span>
                    </div>
                    <p className="mt-2 text-[var(--fs-label)] leading-relaxed text-[var(--previs-dock-fg)]/55">
                        {translate("shared.plugins.builtin.editor.editorSubtitleTools.aISubtitleHighlightingAndKeywordAnnotationsAreAvailableInThe")}
                    </p>
                </div>

                {message && <p className="mt-2 text-[var(--fs-label)] text-[var(--previs-dock-fg)]/70">{message}</p>}
            </div>
        </div>
    );
}


function SubtitleRow({ clip }: { clip: TimelineClip }) {
    return (
        <li className="flex items-baseline gap-2 rounded border border-[var(--previs-sequencer-border)]/70 bg-[var(--previs-control-hover)]/60 px-2 py-1">
            <span className="shrink-0 tabular-nums text-[var(--fs-label)] text-[var(--previs-dock-fg)]/60">
                {formatTimelineTime(clip.startMs)} – {formatTimelineTime(clip.startMs + clip.durationMs)}
            </span>
            <span className="truncate text-[var(--fs-label)] text-[var(--previs-dock-fg)]/80">{clip.text ?? ""}</span>
        </li>
    );
}
