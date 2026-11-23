import { hasUsableLayerTransparency, imageLayerGenerationConfig, MAX_GROUP_PIXELS, parseImageLayerGeneration, parseExperimentalLayerTargets, validateImageLayerOutput, type ImageLayerGeneration } from "@/lib/canvas/canvas-image-layers";
import { imageLayerRemovalPrompt } from "@/lib/canvas/canvas-image-layer-plan";
import { inspectImageLayer, normalizeImageLayerCanvas } from "@/services/canvas-image-layer-compositor";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { resolveImageLayerExtractions, type ImageLayerExtraction } from "@/lib/canvas/canvas-image-layer-strategy";
import { extractImageLayerFromSource } from "@/services/canvas-image-layer-source";
import { translate } from "@/i18n";

export type ImageLayerStage = "extract" | "remove-background";
type LayerImage = { dataUrl: string; storageKey?: string; width?: number; height?: number; bytes?: number; mimeType?: string };
export type ImageLayerStageRequest = {
    index: number;
    stage: ImageLayerStage;
    prompt: string;
    config: AiConfig;
    reference: ReferenceImage;
    canvas?: { width: number; height: number };
};

/** 各层独立并发；去背景只依赖本层提取，不依赖其他层或底图。 */
export async function runImageLayerExtraction({
    source,
    targets,
    extractions,
    removeFromBackground,
    generations,
    config,
    removalConfig,
    signal,
    assertActive,
    runStage,
    onProgress,
    onLocalResult,
    onLayerError,
}: {
    source: ReferenceImage;
    targets: string[];
    extractions?: ImageLayerExtraction[];
    removeFromBackground?: boolean[];
    generations: ImageLayerGeneration[];
    config: AiConfig;
    removalConfig?: AiConfig;
    signal: AbortSignal;
    assertActive(index: number): void;
    runStage(request: ImageLayerStageRequest): Promise<{ images?: LayerImage[] }>;
    onProgress?(index: number, phase: ImageLayerStage | "complete" | "error"): void;
    onLocalResult?(index: number, image: LayerImage): Promise<void>;
    onLayerError?(index: number, error: unknown): void;
}) {
    parseExperimentalLayerTargets(targets.join("\n"));
    if (!Array.isArray(generations) || generations.length !== targets.length) throw new Error(translate("shared.canvasImageLayerExtraction.theNumberOfPerLayerGenerationParametersDoesNotMatch"));
    const layerGenerations = generations.map((generation, index) => parseImageLayerGeneration(generation, index));
    const methods = resolveImageLayerExtractions(targets.length, extractions, removeFromBackground);
    if (methods.some((extraction) => extraction.method !== "generate") && !onLocalResult) throw new Error(translate("shared.canvasImageLayerExtraction.theSourceExtractionSaveCallbackIsMissingNoModelRequest"));
    if (signal.aborted) throw new DOMException("拆层已停止", "AbortError");
    const sourceInfo = await inspectImageLayer(source);
    if (!sourceInfo.nonempty) throw new Error(translate("shared.canvasImageLayerExtraction.theSourceImageIsEmptyAndFullyTransparent"));
    const canvas = { width: sourceInfo.width, height: sourceInfo.height };
    if (canvas.width * canvas.height * targets.length > MAX_GROUP_PIXELS) throw new Error(translate("shared.canvasImageLayerExtraction.totalLayerPixelsExceedTheProcessingLimit"));
    const check = (index: number) => {
        if (signal.aborted) throw new DOMException("拆层已停止", "AbortError");
        assertActive(index);
    };
    const inspect = async (images: LayerImage[] | undefined) => {
        if (images?.length !== 1) throw new Error(translate("shared.canvasImageLayerExtraction.eachLayerExtractionMustReturnOneSeparateImageNotA"));
        const { image, info } = await normalizeImageLayerCanvas(images[0], canvas);
        if (!info.nonempty) throw new Error(translate("shared.canvasImageLayerExtraction.theExtractedResultIsAnEmptyFullyTransparentLayer"));
        return { image, info };
    };
    const outcomes = await Promise.allSettled(
        targets.map(async (_, index) => {
            try {
                check(index);
                onProgress?.(index, "extract");
                if (methods[index].method !== "generate") {
                    const image = await extractImageLayerFromSource(source, methods[index], canvas);
                    check(index);
                    await onLocalResult!(index, image);
                    check(index);
                    onProgress?.(index, "complete");
                    return;
                }
                let result = await inspect((await runStage({ index, stage: "extract", prompt: layerGenerations[index].prompt, config: imageLayerGenerationConfig(config, layerGenerations[index], index), reference: source, canvas })).images);
                check(index);
                if (index > 0 && !hasUsableLayerTransparency(result.info) && removalConfig) {
                    check(index);
                    onProgress?.(index, "remove-background");
                    result = await inspect(
                        (
                            await runStage({
                                index,
                                stage: "remove-background",
                                prompt: imageLayerRemovalPrompt(targets[index]),
                                config: { ...removalConfig, count: "1", transparentBackground: "true" },
                                canvas,
                                reference: { id: `${source.id}-layer-${index}`, name: `${targets[index].slice(0, 60)}.png`, type: result.image.mimeType || "image/png", ...result.image },
                            })
                        ).images,
                    );
                    check(index);
                }
                validateImageLayerOutput(result.info);
                onProgress?.(index, "complete");
            } catch (error) {
                onLayerError?.(index, error);
                onProgress?.(index, "error");
                throw error;
            }
        }),
    );
    if (signal.aborted) throw new DOMException("拆层已停止", "AbortError");
    const failures = outcomes.flatMap((outcome, index) => (outcome.status === "rejected" ? [`${targets[index]}：${outcome.reason instanceof Error ? outcome.reason.message : translate("shared.canvasImageLayerExtraction.layerGenerationFailed")}`] : []));
    if (failures.length) throw new Error(translate("shared.canvasImageLayerExtraction.layersFailedValidationOtherLayerResultsArePreserved", { v0: String(failures.length), v1: String(targets.length), v2: String(failures.join("；")) }));
}
