import { Button } from "antd";
import { ChevronLeft, ChevronRight, Clapperboard, Copy, Download, ImageOff, ImagePlus, SquarePen, X } from "lucide-react";
import { useEffect, useState } from "react";

import { RelativeTime } from "@/components/ui/product/relative-time";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { taskBillingLabel } from "@/lib/generation-task-billing";
import type { GenerationTask } from "@/services/api/task-center";
import type { WorkbenchKind } from "@/services/api/workbench";

import type { WorkbenchOutput } from "./workbench-batches";
import type { GalleryBatch } from "./workbench-gallery";

import { translate } from "@/i18n";
function elapsedLabel(task: GenerationTask) {
    const start = Date.parse(task.startedAt || task.createdAt);
    const end = task.completedAt ? Date.parse(task.completedAt) : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    return seconds < 60 ? translate("ecommerce.workbench.workbenchViewer.s", { v0: String(seconds) }) : translate("ecommerce.workbench.workbenchViewer.mS", { v0: String(Math.floor(seconds / 60)), v1: String(seconds % 60) });
}

function isEditableTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function WorkbenchViewer({
    kind,
    batch,
    outputKey,
    detail,
    presetName,
    onNavigate,
    onClose,
    onDownload,
    onUseAsReference,
    onMakeVideo,
    onReuse,
    onCopyPrompt,
}: {
    kind: WorkbenchKind;
    batch: GalleryBatch | null;
    outputKey: string | null;
    detail?: GenerationTask;
    presetName?: string;
    onNavigate: (output: WorkbenchOutput) => void;
    onClose: () => void;
    onDownload: (output: WorkbenchOutput) => void;
    onUseAsReference?: (output: WorkbenchOutput) => void;
    onMakeVideo?: (output: WorkbenchOutput) => void;
    onReuse: (task: GenerationTask) => void;
    onCopyPrompt: (prompt: string) => void;
}) {
    const outputs = batch?.outputs || [];
    const index = Math.max(
        0,
        outputs.findIndex((item) => item.key === outputKey),
    );
    const output = outputs[index];
    const task = output ? batch?.tasks.find((item) => item.id === output.taskId) : undefined;
    const [size, setSize] = useState<{ key: string; width: number; height: number } | null>(null);
    const [failedKey, setFailedKey] = useState("");
    const open = Boolean(batch && output);
    const prompt = detail?.prompt || task?.prompt || batch?.prompt || "";

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target) || outputs.length < 2) return;
            if (event.key === "ArrowLeft") onNavigate(outputs[(index - 1 + outputs.length) % outputs.length]);
            if (event.key === "ArrowRight") onNavigate(outputs[(index + 1) % outputs.length]);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [index, onNavigate, open, outputs]);

    const billing = detail?.billing || task?.billing;
    const elapsed = task ? elapsedLabel(detail || task) : "";
    const dimensions = output && size?.key === output.key ? `${size.width} × ${size.height}` : output?.width && output.height ? `${output.width} × ${output.height}` : "";

    return (
        <AppModal open={open} flush footer={null} closable={false} centered width="min(1240px, calc(100vw - 32px))" onCancel={onClose} className="wb-viewer-modal" title={null}>
            {batch && output ? (
                <div className="wb-viewer">
                    <div className="wb-viewer-stage">
                        <div className="wb-viewer-canvas">
                            {failedKey === output.key ? (
                                <span className="wb-viewer-empty">
                                    <ImageOff />
                                    <span>{translate("ecommerce.workbench.workbenchViewer.previewUnavailableThisWorkMayHaveBeenDeleted")}</span>
                                </span>
                            ) : output.kind === "video" ? (
                                <video
                                    key={output.key}
                                    src={output.url}
                                    poster={output.posterUrl}
                                    controls
                                    autoPlay
                                    playsInline
                                    onLoadedMetadata={(event) => setSize({ key: output.key, width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
                                    onError={() => setFailedKey(output.key)}
                                />
                            ) : (
                                <img
                                    key={output.key}
                                    src={output.url}
                                    alt={prompt.slice(0, 60) || translate("library.tasks.detail.generated")}
                                    style={output.thumbUrl ? { backgroundImage: `url("${output.thumbUrl}")` } : undefined}
                                    onLoad={(event) => setSize({ key: output.key, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                                    onError={() => setFailedKey(output.key)}
                                />
                            )}
                            {outputs.length > 1 ? (
                                <>
                                    <span className="wb-viewer-counter">
                                        {index + 1} / {outputs.length}
                                    </span>
                                    <button type="button" className="wb-viewer-nav is-prev" data-icon-only aria-label={translate("ecommerce.workbench.workbenchViewer.previous")} onClick={() => onNavigate(outputs[(index - 1 + outputs.length) % outputs.length])}>
                                        <ChevronLeft />
                                    </button>
                                    <button type="button" className="wb-viewer-nav is-next" data-icon-only aria-label={translate("ecommerce.workbench.workbenchViewer.next")} onClick={() => onNavigate(outputs[(index + 1) % outputs.length])}>
                                        <ChevronRight />
                                    </button>
                                </>
                            ) : null}
                        </div>
                        {outputs.length > 1 ? (
                            <div className="wb-viewer-strip" role="listbox" aria-label={translate("ecommerce.workbench.workbenchViewer.worksInThisBatch")}>
                                {outputs.map((item, itemIndex) => (
                                    <button key={item.key} type="button" role="option" aria-selected={item.key === output.key} aria-label={translate("ecommerce.workbench.workbenchViewer.item", { v0: String(itemIndex + 1) })} className={item.key === output.key ? "is-active" : ""} onClick={() => onNavigate(item)}>
                                        {item.thumbUrl ? <img src={item.thumbUrl} alt="" loading="lazy" /> : <span className="wb-viewer-strip-video" />}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <aside className="wb-viewer-info">
                        <header>
                            <div>
                                <span className="wb-viewer-kicker">{kind === "image" ? translate("account.feedback.image") : translate("account.feedback.video")}{translate("ecommerce.workbench.workbenchViewer.works")}</span>
                                <h2>{batch.toolName || translate("ecommerce.workbench.workbenchViewer.freeCreation")}</h2>
                            </div>
                            <button type="button" className="wb-icon-button" data-icon-only aria-label={translate("ecommerce.workbench.workbenchViewer.closePreview")} onClick={onClose}>
                                <X />
                            </button>
                        </header>
                        <div className="wb-viewer-scroll">
                            <section className="wb-viewer-block">
                                <div className="wb-viewer-block-head">
                                    <span>{translate("canvasA.assetView.prompt")}</span>
                                    <button type="button" className="wb-text-link" disabled={!prompt} onClick={() => onCopyPrompt(prompt)}>
                                        <Copy />
                                        {translate("canvasB.common.copy")}
                                    </button>
                                </div>
                                <p className="wb-viewer-prompt">{prompt || translate("ecommerce.workbench.workbenchViewer.noPrompt")}</p>
                            </section>
                            {batch.chips.length ? (
                                <div className="wb-viewer-tags">
                                    {batch.chips.map((chip) => (
                                        <span key={chip} className="wb-tag">
                                            {chip}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                            <dl className="wb-viewer-meta">
                                {batch.modelLabel ? (
                                    <div>
                                        <dt>{translate("canvasA.assetView.model")}</dt>
                                        <dd>{batch.modelLabel}</dd>
                                    </div>
                                ) : null}
                                {presetName ? (
                                    <div>
                                        <dt>{translate("ecommerce.workbench.workbenchViewer.template")}</dt>
                                        <dd>{presetName}</dd>
                                    </div>
                                ) : null}
                                {dimensions ? (
                                    <div>
                                        <dt>{translate("canvasA.assetView.size")}</dt>
                                        <dd>{dimensions} px</dd>
                                    </div>
                                ) : null}
                                <div>
                                    <dt>{translate("ecommerce.workbench.workbenchViewer.created")}</dt>
                                    <dd>
                                        <RelativeTime value={task?.createdAt || batch.createdAt} />
                                    </dd>
                                </div>
                                {elapsed ? (
                                    <div>
                                        <dt>{translate("library.tasks.detail.duration")}</dt>
                                        <dd>{elapsed}</dd>
                                    </div>
                                ) : null}
                                {billing ? (
                                    <div>
                                        <dt>{translate("shell.credits")}</dt>
                                        <dd>{taskBillingLabel(billing)}</dd>
                                    </div>
                                ) : null}
                            </dl>
                        </div>
                        <footer className="wb-viewer-actions">
                            <Button type="primary" icon={<Download />} onClick={() => onDownload(output)}>
                                {translate("canvasA.assetView.download")}{output.kind === "video" ? translate("account.feedback.video") : translate("canvasPage.batchReferences.original")}
                            </Button>
                            <div className="wb-viewer-secondary">
                                {onUseAsReference && output.kind === "image" && output.resourceId ? (
                                    <Button icon={<ImagePlus />} onClick={() => onUseAsReference(output)}>
                                        {translate("ecommerce.workbench.workbenchViewer.useAsReferenceImage")}
                                    </Button>
                                ) : null}
                                {onMakeVideo && output.kind === "image" && output.resourceId ? (
                                    <Button icon={<Clapperboard />} onClick={() => onMakeVideo(output)}>
                                        {translate("ecommerce.workbench.workbenchViewer.makeAVideo")}
                                    </Button>
                                ) : null}
                                {task ? (
                                    <Button icon={<SquarePen />} onClick={() => onReuse(task)}>
                                        {translate("ecommerce.workbench.workbenchViewer.reuseSettings")}
                                    </Button>
                                ) : null}
                            </div>
                        </footer>
                    </aside>
                </div>
            ) : null}
        </AppModal>
    );
}
