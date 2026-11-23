import { Button, Popover } from "antd";
import { Check, Images, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { parseBackendGenerationResult } from "@/services/api/generation-task";
import { resolveResourceVariantUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import type { GenerationTask } from "@/services/api/task-center";
import type { EcommerceCreativeDirection, EcommerceDraft, EcommercePlan, EcommercePlanImage } from "@/services/api/ecommerce";
import type { AiConfig } from "@/stores/use-config-store";
import { imageTypes, displayLabelOf } from "./catalog";
import { SingleImageEditor } from "./result-gallery";
import { commerceCopyHasDirections } from "./consumer-copy";
import { commerceCanvasImages } from "./continuation";
import { writeCommerceImageTransfer } from "./image-transfer";

import { currentLocale, translate } from "@/i18n";
function imageSource(task?: GenerationTask) {
    if (!task || task.status !== "succeeded") return undefined;
    try {
        const result = parseBackendGenerationResult(task)?.images?.[0];
        if (result?.storageKey) return resolveResourceVariantUrl(result.storageKey, "thumbnail");
        if (result?.dataUrl) return result.dataUrl;
    } catch {
        /* Persisted previews may be unavailable for older tasks. */
    }
    return task.previewUrl;
}

export function EcommerceAgentFeed({
    direction,
    plan,
    tasks,
    config,
    draft,
    imageModels,
    imageCost,
    onRegenerate,
    onRetry,
    onFocus,
}: {
    direction: EcommerceCreativeDirection | null;
    plan: EcommercePlan | null;
    tasks: Record<string, GenerationTask>;
    config: AiConfig;
    draft: EcommerceDraft;
    imageModels: string[];
    imageCost: number | null;
    onRegenerate: (image: EcommercePlanImage) => Promise<void>;
    onRetry: (image: EcommercePlanImage) => void;
    onFocus: (id: string) => void;
}) {
    const [editing, setEditing] = useState<string>();
    const [expanded, setExpanded] = useState<string>();
    const complete = plan?.images.filter((image) => image.taskId && imageSource(tasks[image.taskId])).length || 0;
    const total = commerceCanvasImages(plan).length;
    const submitted = plan?.images.some((image) => image.taskId);
    const active = submitted && plan?.images.some((image) => image.taskId && (!tasks[image.taskId] || !["succeeded", "failed", "cancelled"].includes(tasks[image.taskId].status)));
    return (
        <div className="commerce-agent-feed">
            {direction ? (
                <div className="commerce-direction-choice">
                    <small>{translate("ecommerce.agentFeed.creativeDirectionSelected")}</small>
                    <strong>{direction.name}</strong>
                    <span>{direction.summary.split(" 知识约束：{")[0]}</span>
                </div>
            ) : null}
            {plan && active ? (
                <section className="commerce-generation-message" role="status" aria-label={translate("ecommerce.agentFeed.imageGenerationProgress")}>
                    <header>
                        <span className="commerce-generation-glyph">
                            <Sparkles size={17} />
                        </span>
                        <strong>{translate("ecommerce.agentFeed.aIGenerationInProgress")}</strong>
                        <span>
                            {complete} / {total}
                        </span>
                    </header>
                    <div className="commerce-generation-visual">
                        <span className="commerce-yoru-glow" />
                        <Sparkles size={34} aria-label={translate("ecommerce.agentFeed.creating")} />
                        <span className="commerce-generation-particles" aria-hidden="true" />
                    </div>
                    <div className="commerce-generation-track" aria-label={translate("ecommerce.agentFeed.ofImagesCompleted", { v0: String(complete), v1: String(total) })}>
                        <span style={{ width: `${total ? (complete / total) * 100 : 0}%` }} />
                    </div>
                    <p>
                        <LoaderCircle size={14} className="commerce-planning-spin" />
                        {translate("ecommerce.agentFeed.xiaoyeIsCreatingCompletedImagesWillAppearHereAndOn")}
                    </p>
                </section>
            ) : null}
            {commerceCanvasImages(plan).map((image, index) => {
                const task = image.taskId ? tasks[image.taskId] : undefined;
                const src = imageSource(task);
                let resourceId = image.resourceId;
                try {
                    resourceId ||= task ? resourceIdFromStorageKey(parseBackendGenerationResult(task)?.images?.[0]?.storageKey) : undefined;
                } catch {
                    /* Legacy previews still provide their URL. */
                }
                if (!src && task && ["failed", "cancelled"].includes(task.status))
                    return (
                        <section className="commerce-generated-card" key={image.id} role="alert">
                            <header>
                                <span className="commerce-generation-glyph">
                                    <Images size={16} />
                                </span>
                                <strong>
                                    {translate("ecommerce.agentFeed.image")} {index + 1} {translate("ecommerce.agentFeed.incomplete")}
                                </strong>
                            </header>
                            <p>{task.error || translate("ecommerce.agentFeed.theTaskCouldNotFinishYouCanRetryThisImage")}</p>
                            <Button size="small" onClick={() => onRetry(image)}>
                                {task.canRecoverMedia ? translate("ecommerce.agentFeed.saveAgainNoCharge") : translate("ecommerce.agentFeed.retryThisImage")}
                            </Button>
                        </section>
                    );
                if (!src) return null;
                return (
                    <section className="commerce-generated-card" key={`${image.id}:${image.taskId}`} aria-label={translate("ecommerce.agentFeed.imageResult", { v0: String(index + 1) })}>
                        <header>
                            <span className="commerce-generation-glyph">
                                <Check size={16} />
                            </span>
                            <strong>{translate("ecommerce.agentFeed.generateImage")}</strong>
                            <small>
                                {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                            </small>
                        </header>
                        <p>
                            {displayLabelOf(imageTypes, image.imageType)}
                            <span> · {image.ratio}</span>
                        </p>
                        <button type="button" className="commerce-generated-preview" onClick={() => onFocus(image.id)} aria-label={translate("ecommerce.agentFeed.selectImageOnTheCanvas", { v0: String(index + 1) })}>
                            <img
                                src={src}
                                alt={translate("ecommerce.agentFeed.productImage", { v0: String(index + 1) })}
                                draggable
                                onDragStart={(event) => writeCommerceImageTransfer(event.dataTransfer, { resourceId, name: translate("ecommerce.agentFeed.imageResult", { v0: String(index + 1) }), url: src })}
                            />
                        </button>
                        <footer>
                            <Popover
                                open={editing === image.id}
                                onOpenChange={(open) => setEditing(open ? image.id : undefined)}
                                trigger="click"
                                placement="rightTop"
                                destroyOnHidden
                                content={<SingleImageEditor key={`${image.id}:${image.taskId}`} config={config} draft={image.sourceDraft || draft} image={image} imageModels={imageModels} onClose={() => setEditing(undefined)} onGenerate={onRegenerate} />}
                            >
                                <Button size="small" icon={<RotateCcw size={14} />} onClick={() => setEditing(image.id)}>
                                    {translate("ecommerce.agentFeed.regenerate")}
                                    {imageCost == null ? "" : translate("ecommerce.agentFeed.aboutCredits", { v0: String(imageCost.toLocaleString(currentLocale(), { maximumFractionDigits: 3 })) })}
                                </Button>
                            </Popover>
                            <Button size="small" icon={<Images size={14} />} onClick={() => setExpanded((id) => (id === image.id ? undefined : image.id))} aria-expanded={expanded === image.id}>
                                {translate("ecommerce.agentFeed.viewCopy")}
                            </Button>
                        </footer>
                        {expanded === image.id ? (
                            <div className="commerce-generated-plan">
                                <strong>{translate("ecommerce.agentFeed.performanceExperiencePlan")}</strong>
                                <p>{image.performanceAngle || translate("ecommerce.agentFeed.describeTheExperienceThroughVisibleStructureAndActualUseSpecific")}</p>
                                <strong>{translate("ecommerce.agentFeed.informationComponents")}</strong>
                                <p>{image.informationComponent || translate("ecommerce.agentFeed.arrangeHeadingsDetailInsetsOrSceneAnnotationsForThisImage")}</p>
                                <strong>{translate("ecommerce.agentFeed.imageCopy")}</strong>
                                <p style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{!image.copy || commerceCopyHasDirections(image.copy) ? translate("ecommerce.agentFeed.describeTheTextYouWantWhenRegenerating") : image.copy}</p>
                            </div>
                        ) : null}
                    </section>
                );
            })}
        </div>
    );
}
