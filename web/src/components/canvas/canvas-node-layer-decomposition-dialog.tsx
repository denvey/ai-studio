import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Input, Tag } from "antd";
import { Layers3, Plus, RotateCcw, X } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { AppModal } from "@/components/ui/product/app-modal";
import { selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import { defaultImageParamsForModel } from "@/lib/model-selection";
import { imageLayerOutputSize, imageLayerPlannerError, type ImageLayerPlan } from "@/lib/canvas/canvas-image-layer-plan";
import { supportsExperimentalLayerExtraction, supportsLayerDecomposition } from "@/lib/canvas/canvas-image-layers";
import type { ImageLayerExtraction } from "@/lib/canvas/canvas-image-layer-strategy";
import { navigateToSettings } from "@/lib/settings-navigation";
import { translate } from "@/i18n";

export type CanvasImageLayerDecompositionPayload = {
    prompt: string;
    plannerModel: string;
    regions?: Array<[number, number, number, number]>;
    experimentalTargets?: string[];
    extractions?: ImageLayerExtraction[];
    removeFromBackground?: boolean[];
    backgroundRemovalModel?: string;
    planning?: Pick<ImageLayerPlan, "model" | "taskId">;
    independentMaterials?: boolean;
    generationConfig?: Partial<Pick<AiConfig, "model" | "imageModel" | "size" | "quality">>;
};

const DEFAULT_PROMPT = "拆出完整不透明背景和必要的独立前景。背景移除已拆内容并修补，保留其他环境与设计结构；框内完整照片或场景保留内部内容，不拆碎。前景保持原始比例、位置和细节，使用真实透明背景；不扩展原图画幅。";

export function CanvasNodeLayerDecompositionDialog({
    dataUrl,
    open,
    config,
    sourceSize,
    onClose,
    onConfirm,
}: {
    dataUrl: string;
    open: boolean;
    config: AiConfig;
    sourceSize?: { width: number; height: number };
    onClose: () => void;
    onConfirm: (payload: CanvasImageLayerDecompositionPayload) => void;
}) {
    const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
    const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number }>();
    const [generationConfig, setGenerationConfig] = useState<AiConfig>(config);
    const [plannerModel, setPlannerModel] = useState("");
    const [regions, setRegions] = useState<Array<[number, number, number, number]>>([]);
    const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null);
    const [draft, setDraft] = useState<[number, number, number, number] | null>(null);
    const imageFrameRef = useRef<HTMLDivElement>(null);
    const configRef = useRef(config);
    configRef.current = config;

    useEffect(() => {
        if (!open) return;
        const current = configRef.current;
        const models = [current.imageModel, current.model, ...selectableModelsByCapability(current, "image")];
        const model = models.find((value) => supportsLayerDecomposition(current, value || "")) || models.find((value) => supportsExperimentalLayerExtraction(current, value || "")) || "";
        setGenerationConfig({ ...current, model, imageModel: model, ...defaultImageParamsForModel(current, model) });
        setPlannerModel([current.textModel, ...selectableModelsByCapability(current, "text")].find((value) => value && !imageLayerPlannerError(current, value)) || "");
        setPrompt(DEFAULT_PROMPT);
        setMeasuredSize(undefined);
        setRegions([]);
        setDrawing(null);
        setDraft(null);
    }, [dataUrl, open]);

    const selectedModel = generationConfig.imageModel || generationConfig.model;
    const supported = supportsLayerDecomposition(config, selectedModel) || supportsExperimentalLayerExtraction(config, selectedModel);
    const plannerError = imageLayerPlannerError(config, plannerModel);
    const outputSize = imageLayerOutputSize(config, selectedModel, sourceSize || measuredSize);
    const outputSizeError = supported && !outputSize ? translate("canvasTools.canvasNodeLayerDecompositionDialog.theSelectedModelHasNoSizeMatchingTheOriginalAspect") : "";

    const point = (event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = imageFrameRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return {
            x: Math.max(0, Math.min(1000, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 1000)),
            y: Math.max(0, Math.min(1000, ((event.clientY - rect.top) / Math.max(1, rect.height)) * 1000)),
        };
    };
    const finishBox = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!drawing) return;
        const next = point(event);
        const box = next ? [Math.min(drawing.x, next.x), Math.min(drawing.y, next.y), Math.max(drawing.x, next.x), Math.max(drawing.y, next.y)] : draft;
        if (box && box[2] - box[0] >= 2 && box[3] - box[1] >= 2) setRegions((current) => [...current, box.map(Math.round) as [number, number, number, number]]);
        setDrawing(null);
        setDraft(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <AppModal flush open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} centered width={1120} title={translate("canvasB.imageTools.layerDecompositionLabel")}>
            <div className="grid max-h-[82vh] gap-6 overflow-y-auto p-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" data-canvas-no-zoom>
                <div className="grid min-h-[260px] place-items-center overflow-hidden rounded-xl bg-black/5 p-3 dark:bg-white/[0.04] md:min-h-[480px]">
                    <div
                        ref={imageFrameRef}
                        aria-label={translate("canvasTools.canvasNodeLayerDecompositionDialog.selectFocusAreas")}
                        className="relative inline-block max-h-[60vh] max-w-full touch-none select-none"
                        onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            const next = point(event);
                            if (!next) return;
                            event.preventDefault();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setDrawing(next);
                            setDraft([next.x, next.y, next.x, next.y]);
                        }}
                        onPointerMove={(event) => {
                            if (!drawing) return;
                            const next = point(event);
                            if (next) setDraft([Math.min(drawing.x, next.x), Math.min(drawing.y, next.y), Math.max(drawing.x, next.x), Math.max(drawing.y, next.y)]);
                        }}
                        onPointerUp={finishBox}
                        onPointerCancel={() => {
                            setDrawing(null);
                            setDraft(null);
                        }}
                    >
                        <img
                            src={dataUrl}
                            alt={translate("canvasTools.canvasNodeLayerDecompositionDialog.imageToSplit")}
                            className="block max-h-[60vh] max-w-full object-contain"
                            draggable={false}
                            onLoad={(event) => setMeasuredSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                        />
                        <div className="pointer-events-none absolute inset-0">
                            {regions.map((region, index) => (
                                <RegionBox key={`${region.join("-")}-${index}`} region={region} label={index + 1} />
                            ))}
                            {draft ? <RegionBox region={draft} label={regions.length + 1} draft /> : null}
                        </div>
                    </div>
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                    <div>
                        <h3 className="text-lg font-semibold">{translate("canvasTools.canvasNodeLayerDecompositionDialog.splitImageIntoLayers")}</h3>
                        <p className="mt-2 text-sm opacity-60">{translate("canvasTools.canvasNodeLayerDecompositionDialog.dragOnTheImageToSelectFocusAreasAIWill")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {regions.length ? <Tag color="blue">{translate("canvasTools.inline.canvasNodeLayerDecompositionDialog.areasSelected", { v0: String(regions.length) })}</Tag> : <span className="rounded-md bg-black/5 px-2 py-1 text-xs dark:bg-white/5">{translate("canvasTools.canvasNodeLayerDecompositionDialog.noAreasSelectedSplitBasedOnDescription")}</span>}
                        {regions.length ? (
                            <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => setRegions([])}>
                                {translate("canvasTools.canvasNodeLayerDecompositionDialog.clearSelection")}
                            </Button>
                        ) : (
                            <span className="text-xs opacity-55">
                                <Plus className="mr-1 inline size-3" />
                                {translate("canvasTools.canvasNodeLayerDecompositionDialog.dragOnTheImageToAddASelection")}
                            </span>
                        )}
                    </div>
                    <Input.TextArea aria-label={translate("canvasTools.canvasNodeLayerDecompositionDialog.layerSplittingInstructions")} rows={5} value={prompt} placeholder={translate("canvasTools.canvasNodeLayerDecompositionDialog.describeWhatToSplit")} onChange={(event) => setPrompt(event.target.value)} />
                    <div className="space-y-2">
                        <div className="text-sm font-medium opacity-75">{translate("canvasTools.canvasNodeLayerDecompositionDialog.visualPlanningModel")}</div>
                        <ModelPicker
                            config={config}
                            value={plannerModel}
                            capability="text"
                            fullWidth
                            showSelectedPrice
                            placeholder={translate("canvasTools.canvasNodeLayerDecompositionDialog.selectVisualPlanningModel")}
                            modelFilter={(model) => !imageLayerPlannerError(config, model)}
                            onMissingConfig={() => navigateToSettings({ continueCreation: true })}
                            onChange={setPlannerModel}
                        />
                        {plannerError ? (
                            <p role="alert" className="text-xs text-red-500">
                                {plannerError}
                            </p>
                        ) : null}
                    </div>
                    <div className="space-y-2">
                        <div className="text-sm font-medium opacity-75">{translate("canvasTools.canvasNodeLayerDecompositionDialog.layerSplittingModel")}</div>
                        <ModelPicker
                            config={{ ...config, model: selectedModel, imageModel: selectedModel }}
                            value={selectedModel}
                            capability="image"
                            fullWidth
                            showSelectedPrice
                            placeholder={translate("canvasTools.canvasNodeLayerDecompositionDialog.selectLayerSplittingModel")}
                            modelFilter={(model) => supportsLayerDecomposition(config, model) || supportsExperimentalLayerExtraction(config, model)}
                            onMissingConfig={() => navigateToSettings({ continueCreation: true })}
                            onChange={(model) => setGenerationConfig((current) => ({ ...current, model, imageModel: model, ...defaultImageParamsForModel(current, model) }))}
                        />
                        {!supported ? (
                            <p role="alert" className="text-xs text-red-500">
                                {translate("canvasPage.mediaTools.selectLayerModel")}
                            </p>
                        ) : null}
                        {outputSizeError ? (
                            <p role="alert" className="text-xs text-red-500">
                                {outputSizeError}
                            </p>
                        ) : null}
                    </div>
                    <div className="mt-auto flex justify-end gap-2 pt-2">
                        <Button icon={<X className="size-4" />} onClick={onClose}>
                            {translate("common.cancel")}
                        </Button>
                        <Button
                            type="primary"
                            icon={<Layers3 className="size-4" />}
                            disabled={!prompt.trim() || !supported || !dataUrl || Boolean(drawing) || Boolean(plannerError) || Boolean(outputSizeError)}
                            onClick={() => {
                                const scopePrompt = `${prompt.trim()}\n自动拆分：根据实际图像结构选择必要图层，不固定题材或层数；保留完整底图，避免过度拆碎。`;
                                const selectedPrompt = regions.length
                                    ? `${scopePrompt}\n\n重点处理用户框选的区域。选区坐标（图像 0-1000 坐标系）：${regions.map((region, index) => `区域${index + 1} <bbox>${region.join(" ")}</bbox>`).join("；")}`
                                    : scopePrompt;
                                const models = [config.imageModel, config.model, ...selectableModelsByCapability(config, "image")];
                                onConfirm({
                                    prompt: selectedPrompt,
                                    plannerModel,
                                    regions,
                                    independentMaterials: false,
                                    backgroundRemovalModel: models.find((value) => supportsExperimentalLayerExtraction(config, value || "") && !supportsLayerDecomposition(config, value || "")),
                                    generationConfig: { model: selectedModel, imageModel: selectedModel, size: outputSize, quality: generationConfig.quality },
                                });
                            }}
                        >
                            {translate("canvasTools.canvasNodeLayerDecompositionDialog.startSplitting")}
                        </Button>
                    </div>
                </div>
            </div>
        </AppModal>
    );
}

function RegionBox({ region, label, draft = false }: { region: [number, number, number, number]; label: number; draft?: boolean }) {
    const [x1, y1, x2, y2] = region;
    return (
        <div
            className={`absolute rounded-sm border-2 ${draft ? "border-dashed border-blue-500 bg-blue-500/10" : "border-solid border-amber-400 bg-amber-400/10"}`}
            style={{ left: `${x1 / 10}%`, top: `${y1 / 10}%`, width: `${(x2 - x1) / 10}%`, height: `${(y2 - y1) / 10}%` }}
        >
            <span className="absolute -left-0.5 -top-0.5 grid size-5 -translate-y-1/2 -translate-x-1/2 place-items-center rounded-full bg-amber-400 text-[var(--fs-label)] font-semibold text-black shadow">{label}</span>
        </div>
    );
}
