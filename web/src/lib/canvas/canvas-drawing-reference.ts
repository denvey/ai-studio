import { loadCanvasDrawingRender, saveCanvasDrawingRenderPublication } from "@/lib/canvas/canvas-drawing-storage";
import { resourceFileUrl, resourceIdFromStorageKey, resourceStorageKey, uploadResourceFile } from "@/services/api/resources";
import type { ReferenceImage } from "@/types/image";
import { translate } from "@/i18n";


export async function resolveCanvasDrawingReference(projectId: string, image: ReferenceImage): Promise<ReferenceImage> {
    const source = image.source;
    if (!source || source.kind !== "drawing") return image;
    if (!source.shapeCount) throw new Error(translate("shared.canvas.canvasDrawingReference.drawingIsEmptyFinishTheDrawingBeforeGenerating", { v0: String(image.name) }));

    const render = await loadCanvasDrawingRender(projectId, source.drawingId);
    if (!render || render.revision !== source.revision) {
        throw new Error(translate("shared.canvas.canvasDrawingReference.drawingHasNoRenderedImageForTheCurrentVersionOpen", { v0: String(image.name) }));
    }

    if (resourceIdFromStorageKey(render.storageKey)) {
        return {
            ...image,
            dataUrl: "",
            url: render.url,
            storageKey: render.storageKey,
            type: render.mimeType,
        };
    }

    const drawingChangedError = new Error(translate("shared.canvas.canvasDrawingReference.theDrawingChangedWhileUploadingGenerateAgain"));
    try {
        const resource = await uploadResourceFile(render.blob, "image", {
            width: render.width,
            height: render.height,
            fileName: `drawing-${source.drawingId}-r${source.revision}.png`,
        });
        const storageKey = resourceStorageKey(resource.id);
        const url = resource.publicUrl || resourceFileUrl(resource.id);
        const saved = await saveCanvasDrawingRenderPublication(projectId, source.drawingId, source.revision, { storageKey, url });
        if (!saved) throw drawingChangedError;
        return { ...image, dataUrl: "", url, storageKey, type: resource.mimeType || render.mimeType };
    } catch (error) {
        if (error === drawingChangedError) throw error;
        throw new Error(error instanceof Error ? translate("shared.canvas.canvasDrawingReference.failedToUploadTheDrawingReferenceImage", { v0: String(error.message) }) : translate("shared.canvas.canvasDrawingReference.failedToUploadTheDrawingReferenceImage2"));
    }
}
