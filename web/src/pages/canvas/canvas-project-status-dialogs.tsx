import { useEffect, useState } from "react";
import { Button, Modal } from "antd";
import { XCircle } from "lucide-react";

import { CanvasImagePreview } from "@/components/canvas/canvas-image-preview";
import { TaskDetailItem } from "./canvas-project-feedback";
import { canCancelGenerationTask, generationTaskShowsProgress, generationTaskStageLabel } from "@/lib/generation-task-display";
import { formatTaskLog, type GenerationTask, type TaskLog } from "@/services/api/task-center";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { VideoPlayer } from "@/components/video-player";
import { AppModal } from "@/components/ui/product/app-modal";
import { modelDisplayName, useEffectiveConfig } from "@/stores/use-config-store";
import { resolveMediaUrl } from "@/services/file-storage";
import { translate } from "@/i18n";

type CanvasProjectStatusDialogsProps = {
    theme: { node: { stroke: string; panel: string; muted: string; fill: string } };
    task: GenerationTask | null;
    taskLogs: TaskLog[];
    taskLoading: boolean;
    onCloseTask: () => void;
    onCancelTask?: (task: GenerationTask) => void;
    superResolveNode: CanvasNodeData | null;
    onCloseSuperResolve: () => void;
    previewNode: CanvasNodeData | null;
    onClosePreview: () => void;
    clearConfirmOpen: boolean;
    onCancelClear: () => void;
    onConfirmClear: () => void;
};

export function CanvasProjectStatusDialogs({ theme, task, taskLogs, taskLoading, superResolveNode, previewNode, clearConfirmOpen, onCloseTask, onCancelTask, onCloseSuperResolve, onClosePreview, onCancelClear, onConfirmClear }: CanvasProjectStatusDialogsProps) {
    const config = useEffectiveConfig();
    return (
        <>
            <Modal title={translate("library.tasks.detail.title")} open={Boolean(task)} footer={null} width="min(920px, calc(100vw - 32px))" onCancel={onCloseTask}>
                {task ? (
                    <div className="space-y-4 text-sm">
                        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                            <TaskDetailItem label={translate("canvasA.activeTasks.stage")} value={generationTaskStageLabel(task)} />
                            {generationTaskShowsProgress(task) ? <TaskDetailItem label={translate("canvasTools.canvasProjectStatusDialogs.progress")} value={`${task.progress ?? 0}%`} /> : null}
                            <TaskDetailItem label={translate("canvasA.assetView.model")} value={task.model ? modelDisplayName(config, task.model) : translate("canvasTools.canvasProjectStatusDialogs.defaultModel")} />
                            <TaskDetailItem label={translate("library.tasks.detail.taskId")} value={task.id} />
                            <TaskDetailItem label={translate("library.tasks.detail.createdAt")} value={formatTaskTime(task.createdAt)} />
                            <TaskDetailItem label={translate("library.tasks.detail.startedAt")} value={formatTaskTime(task.startedAt)} />
                            <TaskDetailItem label={translate("library.tasks.detail.completedAt")} value={formatTaskTime(task.completedAt)} />
                            <TaskDetailItem label={translate("library.tasks.detail.duration")} value={formatTaskDuration(task)} />
                        </div>
                        <div>
                            <div className="mb-2 text-xs font-semibold" style={{ color: theme.node.muted }}>
                                {translate("canvasA.assetView.prompt")}
                            </div>
                            <div className="h-32 overflow-y-auto whitespace-pre-wrap rounded-lg p-3 text-xs leading-5" style={{ background: theme.node.fill }}>
                                {task.prompt || translate("canvasTools.canvasProjectStatusDialogs.notRecorded")}
                            </div>
                        </div>
                        <TaskGenerationParameters inputJson={task.inputJson} theme={theme} />
                        {onCancelTask && canCancelGenerationTask(task) ? (
                            <div className="flex justify-end">
                                <Button danger icon={<XCircle className="size-4" />} onClick={() => onCancelTask(task)}>
                                    {translate("canvasA.activeTasks.cancel")}
                                </Button>
                            </div>
                        ) : null}
                        <div>
                            <div className="mb-2 text-xs font-semibold" style={{ color: theme.node.muted }}>
                                {translate("canvasTools.canvasProjectStatusDialogs.taskLog")}
                            </div>
                            <pre className="max-h-64 overflow-auto rounded-lg bg-neutral-950 p-3 text-[var(--fs-label)] leading-5 text-neutral-100">
                                {taskLoading ? translate("canvasTools.canvasProjectStatusDialogs.loading") : taskLogs.length ? taskLogs.map((log) => `[${new Date(log.createdAt).toLocaleString()}] ${log.level.toUpperCase()} ${formatTaskLog(log)}`).join("\n") : translate("library.tasks.detail.noLogs")}
                            </pre>
                        </div>
                    </div>
                ) : null}
            </Modal>

            <Modal title={translate("canvasTools.canvasProjectStatusDialogs.aIUpscale")} open={Boolean(superResolveNode?.metadata?.content)} centered footer={null} onCancel={onCloseSuperResolve}>
                <div className="py-8 text-center text-base font-medium">{translate("canvasTools.canvasProjectStatusDialogs.notImplementedYet")}</div>
            </Modal>

            <AppModal
                title={translate("library.tasks.row.videoPreview")}
                open={Boolean(previewNode?.type === CanvasNodeType.Video && (previewNode.metadata?.content || previewNode.metadata?.storageKey))}
                centered
                onCancel={onClosePreview}
                footer={null}
                width="min(1200px, calc(100vw - 32px))"
                flush
                styles={{ body: { display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "84vh", overflow: "hidden", background: "var(--workspace-canvas-deep)" } }}
            >
                {previewNode?.type === CanvasNodeType.Video && (previewNode.metadata?.content || previewNode.metadata?.storageKey) ? (
                    <ResolvedCanvasVideoPreview node={previewNode} />
                ) : null}
            </AppModal>

            {previewNode?.type === CanvasNodeType.Image && (previewNode.metadata?.content || previewNode.metadata?.storageKey) ? (
                <CanvasImagePreview
                    src={previewNode.metadata.content}
                    storageKey={previewNode.metadata.storageKey}
                    alt={previewNode.title || translate("account.feedback.image")}
                    onClose={onClosePreview}
                />
            ) : null}

            <Modal
                title={translate("canvasTools.canvasProjectStatusDialogs.clearTheCanvas")}
                open={clearConfirmOpen}
                centered
                onCancel={onCancelClear}
                footer={
                    <>
                        <Button onClick={onCancelClear}>{translate("common.cancel")}</Button>
                        <Button danger type="primary" onClick={onConfirmClear}>
                            {translate("canvasA.outbox.clear")}
                        </Button>
                    </>
                }
            >
                <p className="text-sm opacity-60">{translate("canvasTools.canvasProjectStatusDialogs.thisDeletesEveryNodeAndConnectionOnThisCanvas")}</p>
            </Modal>
        </>
    );
}

function ResolvedCanvasVideoPreview({ node }: { node: CanvasNodeData }) {
    const [src, setSrc] = useState(node.metadata?.storageKey ? "" : node.metadata?.content || "");
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setSrc(node.metadata?.storageKey ? "" : node.metadata?.content || "");
        setFailed(false);
        void resolveMediaUrl(node.metadata?.storageKey, node.metadata?.content || "")
            .then((url) => {
                if (!cancelled) {
                    setSrc(url);
                    setFailed(!url);
                }
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [node.metadata?.content, node.metadata?.storageKey]);

    if (failed) return <div className="grid min-h-72 w-full place-items-center text-sm text-white/55">{translate("canvasTools.canvasProjectStatusDialogs.failedToObtainVideoURLCloseAndTryAgain")}</div>;
    if (!src) return <div className="grid min-h-72 w-full place-items-center text-sm text-white/55">{translate("canvasTools.canvasProjectStatusDialogs.loadingVideo")}</div>;
    return <VideoPlayer src={src} mimeType={node.metadata?.mimeType} title={node.title || translate("library.tasks.row.videoPreview")} hasAudio={typeof node.metadata?.hasAudio === "boolean" ? node.metadata.hasAudio : undefined} className="max-h-[84vh] max-w-full bg-black" />;
}

function TaskGenerationParameters({ inputJson, theme }: { inputJson?: string; theme: CanvasProjectStatusDialogsProps["theme"] }) {
    const fields = taskParameterRows(inputJson);
    return (
        <div>
            <div className="mb-2 text-xs font-semibold" style={{ color: theme.node.muted }}>{translate("canvasTools.canvasProjectStatusDialogs.generationParameters")}</div>
            {fields.length ? (
                <div className="grid grid-cols-2 gap-x-5 gap-y-1 rounded-lg border p-3 sm:grid-cols-3" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                    {fields.map((field) => <TaskDetailItem key={field.label} label={field.label} value={field.value} />)}
                </div>
            ) : (
                <div className="rounded-lg p-3 text-xs" style={{ background: theme.node.fill, color: theme.node.muted }}>{translate("library.tasks.params.empty")}</div>
            )}
        </div>
    );
}

function taskParameterRows(inputJson?: string) {
    if (!inputJson) return [] as Array<{ label: string; value: string }>;
    let input: Record<string, unknown>;
    try {
        const parsed: unknown = JSON.parse(inputJson);
        input = asRecord(parsed);
    } catch {
        return [] as Array<{ label: string; value: string }>;
    }
    const config = asRecord(input.config);
    const rows: Array<{ label: string; value: string }> = [];
    const add = (label: string, value: unknown) => {
        if (value === undefined || value === null || value === "") return;
        rows.push({ label, value: String(value) });
    };
    add(translate("library.tasks.params.size"), config.size);
    add(translate("library.tasks.params.resolution"), config.vquality || config.quality);
    add(translate("canvasTools.canvasProjectStatusDialogs.seconds"), config.videoSeconds === undefined ? undefined : translate("canvasTools.canvasProjectStatusDialogs.s", { v0: String(config.videoSeconds) }));
    add(translate("library.tasks.params.count"), config.count);
    add(translate("library.tasks.params.audio"), booleanLabel(config.videoGenerateAudio));
    add(translate("library.tasks.params.watermark"), booleanLabel(config.videoWatermark));
    add(translate("library.tasks.params.voice"), config.audioVoice);
    add(translate("library.tasks.params.audioFormat"), config.audioFormat);
    add(translate("library.tasks.params.audioSpeed"), config.audioSpeed);
    addReference(translate("canvasTools.canvasProjectStatusDialogs.referenceImages"), input.referenceImages, translate("account.feedback.image"));
    addReference(translate("canvasTools.canvasProjectStatusDialogs.referenceVideos"), input.referenceVideos, translate("account.feedback.video"));
    addReference(translate("canvasTools.canvasProjectStatusDialogs.referenceAudio"), input.referenceAudios, translate("account.settings.modelConfig.capabilities.audio"));
    return rows;

    function addReference(label: string, value: unknown, kind: string) {
        if (!Array.isArray(value) || !value.length) return;
        const names = value
            .map((item) => (typeof item === "object" && item !== null && "name" in item ? String((item as { name?: unknown }).name || "") : ""))
            .filter(Boolean);
        const suffix = names.length ? `（${names.slice(0, 3).join("、")}${names.length > 3 ? "…" : ""}）` : "";
        rows.push({ label, value: translate("canvasTools.canvasProjectStatusDialogs.referenceCount", { v0: String(value.length), v1: String(kind), v2: String(suffix) }) });
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function booleanLabel(value: unknown) {
    if (value === true || value === "true") return translate("canvasTools.canvasProjectStatusDialogs.enable");
    if (value === false || value === "false") return translate("common.close");
    return "";
}

function formatTaskTime(value?: string) {
    if (!value) return translate("canvasTools.canvasProjectStatusDialogs.notRecorded");
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

function formatTaskDuration(task: GenerationTask) {
    const start = Date.parse(task.startedAt || task.createdAt);
    const end = task.completedAt ? Date.parse(task.completedAt) : task.status === "queued" || task.status === "running" ? Date.now() : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return task.completedAt ? translate("canvasTools.canvasProjectStatusDialogs.notRecorded") : translate("canvasTools.canvasProjectStatusDialogs.incomplete");
    const milliseconds = Math.max(0, end - start);
    const totalSeconds = Math.round(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? translate("canvasTools.canvasProjectStatusDialogs.mS", { v0: String(minutes), v1: String(seconds) }) : translate("canvasTools.canvasProjectStatusDialogs.s2", { v0: String(seconds) });
}
