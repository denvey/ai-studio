import { useState, type ReactNode } from "react";
import { Button, Checkbox, Typography } from "antd";
import { ArrowDownToLine, Clapperboard, Image as ImageIcon, RotateCcw, Trash2 } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import type { GenerationTask } from "@/services/api/task-center";
import type { EcommerceDraft, EcommercePlan, EcommercePlanImage } from "@/services/api/ecommerce";
import type { AiConfig } from "@/stores/use-config-store";
import { parseBackendGenerationResult } from "@/services/api/generation-task";
import { resolveResourceVariantUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import type { EcommerceExportItem } from "./export";
import { imageTypes, displayLabelOf } from "./catalog";
import { commerceUiText } from "./ui-text";
import { commerceCanvasAspect } from "./canvas-layout";
import { CommerceGeneratingArtwork, CommerceResultImage } from "./result-image";
import { SingleImageEditor, imageResultAsset } from "./result-gallery";
import "./output-gallery.css";

import { translate } from "@/i18n";
type OutputImage = { image: EcommercePlanImage; index: number; task?: GenerationTask; src?: string; assetId?: string; resourceId?: string };

type OutputFilter = "all" | "active" | "done" | "failed";
const filters: Array<[OutputFilter, string]> = [
    ["all", translate("canvasA.toolPicker.all")],
    ["active", translate("canvasB.mediaVersion.inProgress")],
    ["done", translate("library.tasks.filter.succeeded")],
    ["failed", translate("library.assets.batch.failed")],
];

export function EcommerceOutputGallery({
    config,
    draft,
    plan,
    tasks,
    imageModels,
    qualityIssues,
    selected,
    onSelect,
    onDownload,
    onRemove,
    onRegenerate,
    onRetry,
    generationPending,
    regeneratingIds = new Set<string>(),
    regenerationPreviews = {},
    stage,
    stageActive = false,
    nextStep,
    exportCount = 0,
    exportDisabled = false,
    onExport,
    preparedDownload,
    progress,
    onMakeVideo,
}: {
    config: AiConfig;
    draft: EcommerceDraft;
    plan: EcommercePlan | null;
    tasks: Record<string, GenerationTask>;
    imageModels: string[];
    qualityIssues?: Record<string, string[]>;
    selected: Set<string>;
    onSelect: (id: string) => void;
    onDownload: (item: EcommerceExportItem) => void;
    onRemove: (image: EcommercePlanImage) => Promise<void>;
    onRegenerate: (image: EcommercePlanImage) => Promise<void>;
    onRetry: (image: EcommercePlanImage) => void;
    generationPending: boolean;
    regeneratingIds?: Set<string>;
    regenerationPreviews?: Record<string, string>;
    /** 本轮流程：已发送的需求、视觉方向、方案审阅与进度，显示在作品之上。 */
    stage?: ReactNode;
    stageActive?: boolean;
    /** 空态里告诉用户下一步做什么。 */
    nextStep?: string;
    exportCount?: number;
    exportDisabled?: boolean;
    onExport?: () => void;
    preparedDownload?: { url: string; fileName: string };
    /** 流程进度条，固定在作品区顶部。 */
    progress?: ReactNode;
    /** 开放商品视频时：把这张图带到视频生成做首帧。 */
    onMakeVideo?: (resourceId: string) => void;
}) {
    const [preview, setPreview] = useState<OutputImage | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [filter, setFilter] = useState<OutputFilter>("all");
    const images = [...(plan?.previousImages || []), ...(plan?.images || [])];
    const stateOf = (image: EcommercePlanImage, pending: boolean): OutputFilter => {
        const task = image.taskId ? tasks[image.taskId] : undefined;
        if (task?.status === "succeeded" || (!task && image.deliveryStatus === "delivered")) return "done";
        if (task && ["failed", "cancelled"].includes(task.status)) return "failed";
        return regenerationPending(image, tasks, pending, regeneratingIds) ? "active" : "all";
    };
    const counts = { active: 0, done: 0, failed: 0 };
    for (const image of plan?.images || []) {
        const state = stateOf(image, generationPending);
        if (state !== "all") counts[state] += 1;
    }
    for (const image of plan?.previousImages || []) {
        const state = stateOf(image, false);
        if (state !== "all") counts[state] += 1;
    }
    const visible = (image: EcommercePlanImage, pending: boolean) => filter === "all" || stateOf(image, pending) === filter;
    const card = (image: EcommercePlanImage, index: number, pending: boolean) => (
        <OutputCard
            key={image.id}
            image={image}
            index={index}
            task={image.taskId ? tasks[image.taskId] : undefined}
            selected={selected.has(image.id)}
            working={regenerationPending(image, tasks, pending, regeneratingIds)}
            src={outputSource(image, tasks) || (pending ? regenerationPreviews[image.id] : undefined)}
            assetId={image.taskId ? imageResultAsset(tasks[image.taskId]) : undefined}
            resourceId={resourceFor(image, tasks)}
            issues={qualityIssues?.[image.taskId ? imageResultAsset(tasks[image.taskId]) || "" : ""]}
            onSelect={() => onSelect(image.id)}
            onPreview={(value) => setPreview(value)}
            onDownload={onDownload}
            onRetry={() => onRetry(image)}
            onEdit={() => setEditing(image.id)}
            onRemove={() => void onRemove(image)}
            onMakeVideo={onMakeVideo}
        />
    );
    const current = (plan?.images || []).map((image, index) => ({ image, index })).filter(({ image }) => visible(image, generationPending));
    const previous = (plan?.previousImages || []).map((image, index) => ({ image, index })).filter(({ image }) => visible(image, false));

    return (
        <section className="commerce-output-gallery" aria-label={translate("ecommerce.outputGallery.productGallery")}>
            <header className="commerce-output-gallery-header">
                <div className="commerce-output-title">
                    <h2>{translate("ecommerce.outputGallery.plansAndWorks")}</h2>
                    <span>
                        {counts.done} {translate("ecommerce.outputGallery.imagesComplete")}{counts.active ? translate("ecommerce.outputGallery.imagesInProgress", { v0: String(counts.active) }) : ""}
                        {counts.failed ? translate("ecommerce.outputGallery.imagesFailed", { v0: String(counts.failed) }) : ""}
                    </span>
                </div>
                <div className="commerce-output-tools">
                    {images.length ? (
                        <div className="commerce-output-filters" role="group" aria-label={translate("ecommerce.outputGallery.filterWorksByStatus")}>
                            {filters.map(([value, label]) => (
                                <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                                    {label}
                                    {value !== "all" && counts[value] ? <span>{counts[value]}</span> : null}
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {preparedDownload ? (
                        <Button size="small" href={preparedDownload.url} download={preparedDownload.fileName}>
                            {translate("ecommerce.outputGallery.downloadPackagedFiles")}
                        </Button>
                    ) : null}
                    {onExport ? (
                        <Button size="small" icon={<ArrowDownToLine size={14} />} disabled={!exportCount || exportDisabled} onClick={onExport} aria-label={translate("ecommerce.outputGallery.exportImages", { v0: String(exportCount) })}>
                            {selected.size ? translate("ecommerce.outputGallery.exportSelected", { v0: String(exportCount) }) : exportCount > 1 ? translate("ecommerce.outputGallery.exportAll", { v0: String(exportCount) }) : translate("ecommerce.outputGallery.export")}
                        </Button>
                    ) : null}
                </div>
            </header>
            {progress}
            <div className="commerce-output-scroll" data-canvas-wheel-scroll>
                {stageActive ? <div className="ecs-stage">{commerceUiText(stage)}</div> : null}
                {!images.length ? (
                    stageActive ? null : (
                        <div className="commerce-output-empty" role="status">
                            <span className="commerce-output-empty-mark" aria-hidden="true">
                                <ImageIcon size={22} strokeWidth={1.6} />
                            </span>
                            <strong>{translate("ecommerce.outputGallery.thisRoundSPlansAndWorksWillAppearHere")}</strong>
                            <span>{nextStep || translate("ecommerce.outputGallery.chooseAScenarioOnTheRightAddProductImagesAnd")}</span>
                        </div>
                    )
                ) : (
                    <div className="commerce-output-batches">
                        {current.length ? (
                            <section className="commerce-output-batch" aria-label={translate("ecommerce.outputGallery.currentCreationBatch")}>
                                <header>
                                    <strong>{plan!.images.length > 1 ? translate("ecommerce.outputGallery.thisRoundSWorks") : translate("ecommerce.outputGallery.thisCreation")}</strong>
                                    <span>{plan!.images.length} {translate("canvasA.characterLibrary.pageItem")}</span>
                                </header>
                                <div className="commerce-output-grid">{current.map(({ image, index }) => card(image, index, generationPending))}</div>
                            </section>
                        ) : null}
                        {previous.length ? (
                            <section className="commerce-output-batch" aria-label={translate("ecommerce.outputGallery.previousProductWorks")}>
                                <header>
                                    <strong>{translate("ecommerce.outputGallery.previousWorks")}</strong>
                                    <span>{plan!.previousImages!.length} {translate("canvasA.characterLibrary.pageItem")}</span>
                                </header>
                                <div className="commerce-output-grid">{previous.map(({ image, index }) => card(image, index, false))}</div>
                            </section>
                        ) : null}
                        {!current.length && !previous.length ? <p className="commerce-output-filter-empty">{translate("ecommerce.outputGallery.noMatchingWorks", { status: filters.find(([value]) => value === filter)?.[1]})}</p> : null}
                    </div>
                )}
            </div>
            {preview ? (
                <AppModal open onCancel={() => setPreview(null)} footer={null} width="min(1120px, calc(100vw - 32px))" title={`${String(preview.index + 1).padStart(2, "0")} · ${displayLabelOf(imageTypes, preview.image.imageType)}`}>
                    <div className="commerce-output-preview">
                        <CommerceResultImage ratio={commerceCanvasAspect(preview.image.ratio)} src={preview.src || ""} alt={translate("ecommerce.outputGallery.productImagePreview", { v0: String(preview.index + 1) })} />
                        <section>
                            {preview.image.copy ? <p>{preview.image.copy}</p> : null}
                            <Typography.Text type="secondary">{preview.image.prompt}</Typography.Text>
                            <dl>
                                <div>
                                    <dt>{translate("ecommerce.outputGallery.purpose")}</dt>
                                    <dd>{displayLabelOf(imageTypes, preview.image.imageType)}</dd>
                                </div>
                                <div>
                                    <dt>{translate("canvasA.assetView.model")}</dt>
                                    <dd>{preview.image.imageModel}</dd>
                                </div>
                                <div>
                                    <dt>{translate("canvasA.assetView.size")}</dt>
                                    <dd>
                                        {preview.image.ratio} · {preview.image.resolution}
                                    </dd>
                                </div>
                            </dl>
                            {preview.assetId ? (
                                <Button type="primary" icon={<ArrowDownToLine size={14} />} onClick={() => onDownload({ image: preview.image, index: preview.index, assetId: preview.assetId!, resourceId: preview.resourceId })}>
                                    {translate("ecommerce.outputGallery.downloadOriginalImage")}
                                </Button>
                            ) : null}
                        </section>
                    </div>
                </AppModal>
            ) : null}
            {editing
                ? (() => {
                      const image = images.find((item) => item.id === editing);
                      if (!image) return null;
                      return (
                          <AppModal open onCancel={() => setEditing(null)} footer={null} width="min(600px, calc(100vw - 32px))" title={translate("ecommerce.outputGallery.editImage", { v0: String(images.indexOf(image) + 1) })}>
                              <SingleImageEditor config={config} draft={image.sourceDraft || draft} image={image} imageModels={imageModels} onClose={() => setEditing(null)} onGenerate={onRegenerate} />
                          </AppModal>
                      );
                  })()
                : null}
        </section>
    );
}

function OutputCard({
    image,
    index,
    task,
    selected,
    working,
    src,
    assetId,
    resourceId,
    issues,
    onSelect,
    onPreview,
    onDownload,
    onRetry,
    onEdit,
    onRemove,
    onMakeVideo,
}: {
    image: EcommercePlanImage;
    index: number;
    task?: GenerationTask;
    selected: boolean;
    working: boolean;
    src?: string;
    assetId?: string;
    resourceId?: string;
    issues?: string[];
    onSelect: () => void;
    onPreview: (image: OutputImage) => void;
    onDownload: (item: EcommerceExportItem) => void;
    onRetry: () => void;
    onEdit: () => void;
    onRemove: () => void;
    onMakeVideo?: (resourceId: string) => void;
}) {
    const failed = Boolean(task && ["failed", "cancelled"].includes(task.status));
    const status =
        task?.status === "succeeded"
            ? translate("library.tasks.filter.succeeded")
            : task?.status === "failed"
              ? translate("canvasPage.batches.generationFailed")
              : task?.status === "cancelled"
                ? translate("ecommerce.outputGallery.cancelled")
                : working
                  ? task?.status === "queued"
                      ? translate("canvasPage.taskStatus.queued")
                      : task?.stage || translate("canvasB.mediaVersion.generating")
                  : image.deliveryStatus === "delivered"
                    ? translate("library.tasks.filter.succeeded")
                    : translate("ecommerce.outputGallery.awaitingGeneration");
    const title = `${String(index + 1).padStart(2, "0")} · ${displayLabelOf(imageTypes, image.imageType)}`;
    return (
        <article className={`commerce-output-card${selected ? " is-selected" : ""}`} data-ecommerce-image-id={image.id} data-status={failed ? "failed" : working ? "working" : status === translate("library.tasks.filter.succeeded") ? "done" : "idle"}>
            <div className="commerce-output-card-frame">
                <button type="button" className="commerce-output-card-media" disabled={!src} onClick={() => src && onPreview({ image, index, src, assetId, resourceId })} aria-label={translate("ecommerce.outputGallery.previewImage", { v0: String(index + 1) })}>
                    {src ? (
                        <CommerceResultImage ratio={commerceCanvasAspect(image.ratio)} src={src} alt={translate("ecommerce.outputGallery.generationResult", { v0: String(displayLabelOf(imageTypes, image.imageType)) })} loading="lazy" />
                    ) : working ? (
                        <CommerceGeneratingArtwork queued={!image.taskId || task?.status === "queued"} label={String(index + 1).padStart(2, "0")} />
                    ) : (
                        <span className="commerce-output-empty-card">{task?.error || translate("ecommerce.outputGallery.waitingToGenerate")}</span>
                    )}
                </button>
                <span className="commerce-output-card-check">
                    <Checkbox checked={selected} onChange={onSelect} aria-label={translate("ecommerce.outputGallery.selectImage", { v0: String(index + 1) })} />
                </span>
            </div>
            <div className="commerce-output-card-meta">
                <span className="commerce-output-card-title" title={image.goal || image.theme || title}>
                    <strong>{title}</strong>
                    {image.goal || image.theme ? <small>{image.goal || image.theme}</small> : null}
                </span>
                <span className="commerce-output-status">{status}</span>
            </div>
            {image.copy ? <p className="commerce-output-card-copy">{image.copy}</p> : null}
            {issues?.length ? <p className="commerce-output-issue">{translate("ecommerce.outputGallery.reviewNeeded")}{issues.join("；")}</p> : null}
            <footer>
                {failed ? (
                    <Button size="small" onClick={onRetry}>
                        {task!.canRecoverMedia ? translate("ecommerce.outputGallery.saveAgain") : translate("common.retry")}
                    </Button>
                ) : null}
                <Button size="small" type="text" icon={<RotateCcw size={14} />} onClick={onEdit}>
                    {translate("ecommerce.outputGallery.editThisImage")}
                </Button>
                {assetId && resourceId && onMakeVideo ? (
                    <Button size="small" type="text" icon={<Clapperboard size={14} />} onClick={() => onMakeVideo(resourceId)}>
                        {translate("ecommerce.outputGallery.makeAVideo")}
                    </Button>
                ) : null}
                {assetId && resourceId ? <Button size="small" type="text" icon={<ArrowDownToLine size={14} />} aria-label={translate("ecommerce.outputGallery.downloadImage", { v0: String(index + 1) })} onClick={() => onDownload({ image, index, assetId, resourceId })} /> : null}
                <Button size="small" type="text" icon={<Trash2 size={14} />} aria-label={translate("ecommerce.outputGallery.removeImageFromThisRound", { v0: String(index + 1) })} onClick={onRemove} />
            </footer>
        </article>
    );
}

function outputSource(image: EcommercePlanImage, tasks: Record<string, GenerationTask>) {
    const task = image.taskId ? tasks[image.taskId] : undefined;
    try {
        const output = task?.status === "succeeded" ? parseBackendGenerationResult(task)?.images?.[0] : undefined;
        if (output?.storageKey) return resolveResourceVariantUrl(output.storageKey, "thumbnail");
        if (output?.dataUrl || task?.previewUrl) return output?.dataUrl || task?.previewUrl;
        if (image.resourceId) return resolveResourceVariantUrl(image.resourceId, "thumbnail");
    } catch {
        if (task?.previewUrl) return task.previewUrl;
    }
    return undefined;
}

function resourceFor(image: EcommercePlanImage, tasks: Record<string, GenerationTask>) {
    const task = image.taskId ? tasks[image.taskId] : undefined;
    try {
        return resourceIdFromStorageKey(task && parseBackendGenerationResult(task)?.images?.[0]?.storageKey) || image.resourceId;
    } catch {
        return image.resourceId;
    }
}

function regenerationPending(image: EcommercePlanImage, tasks: Record<string, GenerationTask>, generationPending: boolean, regeneratingIds: Set<string>) {
    const task = image.taskId ? tasks[image.taskId] : undefined;
    return regeneratingIds.has(image.id) || Boolean(image.taskId && (!task || ["queued", "running"].includes(task.status))) || (!image.taskId && generationPending);
}
