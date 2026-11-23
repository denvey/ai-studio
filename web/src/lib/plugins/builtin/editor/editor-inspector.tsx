// 读取选中片段（store.selectedClipId），属性编辑经 setClipProperty 命令入队
// 并进入统一撤销历史；检查器不直接修改 project，避免绕过命令校验和持久化。

import { useEffect, useState } from "react";

import { useEditorStoreContext } from "@/components/editor/editor-context";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import type { TimelineClip } from "@/types/timeline";
import { translate } from "@/i18n";


export function EditorInspector() {
    const { project, selectedClipId, dispatch, selectClip } = useEditorStoreContext();
    const clip = project?.clips.find((c) => c.id === selectedClipId) ?? null;

    if (!clip) {
        return (
            <div className="flex h-full flex-col bg-[var(--previs-sequencer-surface)]">
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
                    <p className="text-xs text-[var(--previs-dock-fg)]/60">{translate("shared.plugins.builtin.editor.editorInspector.noClipSelected")}</p>
                    <p className="max-w-[180px] text-[var(--fs-label)] leading-relaxed text-[var(--previs-dock-fg)]/45">{translate("shared.plugins.builtin.editor.editorInspector.clickAClipOnTheTimelineToEditItsProperties")}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-[var(--previs-sequencer-surface)]">
            <div className="director-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <SectionTitle>{translate("shared.plugins.builtin.editor.editorInspector.clip")}</SectionTitle>
                <ClipSummary clip={clip} />
                <SectionTitle>{translate("shared.plugins.builtin.editor.editorInspector.general")}</SectionTitle>
                <PropertyField
                    label={translate("shared.plugins.builtin.editor.editorInspector.name")}
                    value={clip.title ?? clip.nodeId ?? clip.id}
                    onChange={(value) => dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { title: value } } })}
                />
                {clip.kind === "subtitle" && (
                    <PropertyField
                        label={translate("shared.plugins.builtin.editor.editorInspector.subtitleText")}
                        value={clip.text ?? ""}
                        onChange={(value) => dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { text: value } } })}
                    />
                )}
                {clip.kind === "audio" && (
                    <PropertyField
                        label={translate("shared.plugins.builtin.editor.editorInspector.volume")}
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={clip.volume ?? 1}
                        formatValue={(v) => `${Math.round(v * 100)}%`}
                        onChange={(value) => dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { volume: Number(value) } } })}
                    />
                )}
                {(clip.kind === "video" || clip.kind === "audio") && (
                    <>
                        <SectionTitle>{translate("shared.plugins.builtin.editor.editorInspector.transition")}</SectionTitle>
                        <PropertyField
                            label={translate("shared.plugins.builtin.editor.editorInspector.fadeIn")}
                            type="range"
                            min={0}
                            max={2000}
                            step={50}
                            value={clip.fadeInMs ?? 0}
                            formatValue={(v) => `${(v / 1000).toFixed(1)}s`}
                            onChange={(value) => dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { fadeInMs: Number(value) } } })}
                        />
                        <PropertyField
                            label={translate("shared.plugins.builtin.editor.editorInspector.fadeOut")}
                            type="range"
                            min={0}
                            max={2000}
                            step={50}
                            value={clip.fadeOutMs ?? 0}
                            formatValue={(v) => `${(v / 1000).toFixed(1)}s`}
                            onChange={(value) => dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { fadeOutMs: Number(value) } } })}
                        />
                    </>
                )}
            </div>
            <div className="shrink-0 border-t border-[var(--previs-sequencer-border)] p-2">
                <button
                    type="button"
                    onClick={() => selectClip(null)}
                    className="w-full rounded-md border border-[var(--previs-sequencer-border)] py-2 text-xs text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)]"
                >
                    {translate("shared.plugins.builtin.editor.editorInspector.clearSelection")}
                </button>
            </div>
        </div>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="mb-2 mt-4 text-[var(--fs-label)] font-medium uppercase tracking-wider text-[var(--previs-dock-fg)]/45 first:mt-0">
            {children}
        </h3>
    );
}

function ClipSummary({ clip }: { clip: TimelineClip }) {
    const kindLabel: Record<TimelineClip["kind"], string> = {
        video: translate("account.feedback.video"),
        audio: translate("account.settings.modelConfig.capabilities.audio"),
        subtitle: translate("shared.plugins.builtin.editor.editorInspector.subtitles"),
        text: translate("account.settings.modelConfig.capabilities.text"),
        image: translate("account.feedback.image"),
    };
    return (
        <div>
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--previs-dock-fg-strong)]">{kindLabel[clip.kind] ?? clip.kind}</span>
                <span className="font-mono text-[var(--fs-label)] text-[var(--previs-dock-fg)]/40">#{clip.id.slice(-6)}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[var(--fs-label)]">
                <div className="flex items-baseline justify-between gap-2">
                    <dt className="shrink-0 text-[var(--previs-dock-fg)]/45">{translate("shared.plugins.builtin.editor.editorInspector.start")}</dt>
                    <dd className="tabular-nums text-[var(--previs-dock-fg)]/80">{formatTimelineTime(clip.startMs)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <dt className="shrink-0 text-[var(--previs-dock-fg)]/45">{translate("canvasA.assetView.duration")}</dt>
                    <dd className="tabular-nums text-[var(--previs-dock-fg)]/80">{formatTimelineTime(clip.durationMs)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <dt className="shrink-0 text-[var(--previs-dock-fg)]/45">{translate("shared.plugins.builtin.editor.editorInspector.sourceStart")}</dt>
                    <dd className="tabular-nums text-[var(--previs-dock-fg)]/80">{formatTimelineTime(clip.sourceStartMs ?? 0)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <dt className="shrink-0 text-[var(--previs-dock-fg)]/45">{translate("shared.plugins.builtin.editor.editorInspector.end")}</dt>
                    <dd className="tabular-nums text-[var(--previs-dock-fg)]/80">{formatTimelineTime(clip.startMs + clip.durationMs)}</dd>
                </div>
            </dl>
        </div>
    );
}

function PropertyField({
    label,
    value,
    onChange,
    type = "text",
    min,
    max,
    step,
    formatValue,
}: {
    label: string;
    value: string | number;
    onChange: (value: string) => void;
    type?: "text" | "range";
    min?: number;
    max?: number;
    step?: number;
    formatValue?: (value: number) => string;
}) {
    const [localValue, setLocalValue] = useState<string>(String(value));
    useEffect(() => setLocalValue(String(value)), [value]);

    const displayValue = type === "range" && formatValue ? formatValue(Number(localValue)) : localValue;

    return (
        <div className="mb-3">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[var(--fs-label)] text-[var(--previs-dock-fg)]/70">{label}</span>
                {type === "range" && (
                    <span className="tabular-nums text-[var(--fs-label)] text-[var(--previs-dock-fg)]/50">{displayValue}</span>
                )}
            </div>
            {type === "range" ? (
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={Number(localValue)}
                    onChange={(e) => {
                        setLocalValue(e.target.value);
                        onChange(e.target.value);
                    }}
                    className="editor-slider"
                />
            ) : (
                <input
                    type="text"
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onBlur={() => {
                        if (localValue !== String(value)) onChange(localValue);
                    }}
                    className="h-7 w-full rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] px-2 text-xs text-[var(--previs-dock-fg-strong)] outline-none transition-colors focus:border-[var(--previs-dock-fg-strong)]/40"
                />
            )}
        </div>
    );
}
