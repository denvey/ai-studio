import { buildNodeGenerationContext, type NodeGenerationContext } from "@/components/canvas/canvas-node-generation";
import { canvasGenerationInputPrompt } from "@/lib/canvas/canvas-generation-input-prompt";
import { nodeGenerationPrompt } from "@/lib/canvas/generation-contract";
import type { Asset } from "@/stores/use-asset-store";
import type { CanvasBatchInputSnapshot, CanvasConnection, CanvasNodeData } from "@/types/canvas";
import { translate } from "@/i18n";


/** Snapshot locators and compiled text, never the entire canvas or decoded image bytes. */
export function createCanvasBatchInputSnapshot(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[], assets: Asset[]): CanvasBatchInputSnapshot {
    const prompt = nodeGenerationPrompt(node).trim();
    const context = buildNodeGenerationContext(node.id, nodes, connections, canvasGenerationInputPrompt(node, "image", prompt), assets);
    const referenceImages = context.referenceImages.map((image) => {
        if (!image.storageKey && /^(data:|blob:)/i.test(image.dataUrl || image.url || "")) {
            throw new Error(translate("shared.canvas.canvasBatchInputSnapshot.referenceImageHasNotBeenSavedAsAResourceSave", { v0: String(image.name) }));
        }
        const source = nodes.find((candidate) => candidate.id === image.id);
        const dimensions = { width: image.width || source?.metadata?.naturalWidth, height: image.height || source?.metadata?.naturalHeight };
        return image.storageKey ? { ...image, ...dimensions, dataUrl: "", url: undefined } : { ...image, ...dimensions };
    });
    return { version: 1, prompt, context: structuredClone({ ...context, referenceImages }) };
}

/** Each attempt owns a fresh context, so hydration cannot mutate the persisted snapshot. */
export function resolveCanvasBatchInputContext(snapshot: CanvasBatchInputSnapshot | undefined, buildCurrentContext: () => NodeGenerationContext): NodeGenerationContext {
    return snapshot ? structuredClone(snapshot.context) : buildCurrentContext();
}
