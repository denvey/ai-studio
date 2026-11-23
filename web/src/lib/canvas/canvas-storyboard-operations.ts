import type { CanvasOperation, CanvasSnapshot } from "./canvas-operation-contract";
import { createStoryboardRow } from "./canvas-project-domain";
import type { StoryboardRow } from "@/types/canvas";
import { inspectStoryboardReadiness } from "./canvas-storyboard-context";
import { createShortDramaPipeline } from "./canvas-short-drama";
import { translate } from "@/i18n";


export function buildAgentStoryboardDraft(input: { title: string; prompt: string; x: number; y: number }): CanvasOperation[] {
    if (!input.title.trim() || !input.prompt.trim()) throw new Error(translate("shared.canvas.canvasStoryboardOperations.theNodeAwaitingShotBreakdownRequiresATitleAndOriginal"));
    const node = createShortDramaPipeline({ x: input.x - 180, y: input.y }).nodes[2];
    return [{ type: "add_node", id: node.id, nodeType: node.type, title: input.title, position: node.position, width: node.width, height: node.height,
        metadata: { ...node.metadata, composerContent: input.prompt, workflowDescription: "待专业拆镜，尚未生成镜头" } }];
}

const textFields = ["plotDescription", "dialogue", "videoMotionPrompt", "imageGenerationPrompt", "camera", "motion", "shotSize", "emotion", "lightingAndAtmosphere", "audioEffects", "narrativeIntent", "viewerPOV", "performanceBlocking", "timeBeats", "continuityOut", "negativePrompt"] as const;

export function validateAgentStoryboardCreation(ops: CanvasOperation[]) {
    for (const op of ops) {
        if (op.type !== "add_node" || op.nodeType !== "script") continue;
        const rows = op.metadata?.storyboard?.rows;
        if (!Array.isArray(rows) || !rows.length || rows.length > 100 || rows.some((row) => !Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0 || !row.videoMotionPrompt?.trim())) throw new Error(translate("shared.canvas.canvasStoryboardOperations.storyboardNodesMustContainActualShotRowsUseScriptShots"));
    }
    return ops;
}

export function readAgentStoryboard(snapshot: CanvasSnapshot, nodeId: string) {
    const node = snapshot.nodes.find((item) => item.id === nodeId && item.type === "script");
    if (!node) throw new Error(translate("shared.canvas.canvasStoryboardOperations.noStoryboardScriptNodeWasFoundOnThisCanvasFind"));
    return { node, rows: node.metadata?.storyboard?.rows || [], readiness: inspectStoryboardReadiness(snapshot.nodes) };
}

export function buildAgentStoryboardOperations(snapshot: CanvasSnapshot, input: Record<string, unknown>): CanvasOperation[] {
    if (typeof input.nodeId !== "string") throw new Error(translate("shared.canvas.canvasStoryboardOperations.aStoryboardNodeIdIsRequired"));
    const { node, rows } = readAgentStoryboard(snapshot, input.nodeId);
    const action = input.action;
    const rowId = typeof input.rowId === "string" ? input.rowId : "";
    const index = rows.findIndex((row) => row.id === rowId);
    let next = rows.slice();
    if (action === "remove") {
        if (index < 0) throw new Error(translate("shared.canvas.canvasStoryboardOperations.theStoryboardRowDoesNotExistReadTheStoryboardTable"));
        // Removing a row never deletes its existing generated assets.
        next.splice(index, 1);
    } else if (action === "append" || action === "update") {
        if (action === "update" && index < 0) throw new Error(translate("shared.canvas.canvasStoryboardOperations.theStoryboardRowDoesNotExistReadTheStoryboardTable"));
        const raw = input.patch;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(translate("shared.canvas.canvasStoryboardOperations.aStoryboardContentPatchIsRequired"));
        const data = raw as Record<string, unknown>;
        const patch: Partial<StoryboardRow> = {};
        for (const [key, value] of Object.entries(data)) {
            if (key === "durationSeconds") {
                if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(translate("shared.canvas.canvasStoryboardOperations.shotDurationMustBeANumberGreaterThanZero"));
                patch.durationSeconds = value;
            } else if (textFields.includes(key as typeof textFields[number])) {
                if (typeof value !== "string" || value.length > 20_000) throw new Error(translate("shared.canvas.canvasStoryboardOperations.storyboardFieldRequiresTextOfAtMost20000Characters", { v0: String(key) }));
                patch[key as typeof textFields[number]] = value;
            } else throw new Error(translate("shared.canvas.canvasStoryboardOperations.fieldCannotBeChangedThroughStoryboardEditingTheSystemManages", { v0: String(key) }));
        }
        if (!Object.keys(patch).length) throw new Error(translate("shared.canvas.canvasStoryboardOperations.noStoryboardChangesProvided"));
        if (action === "append") {
            if (rows.length >= 100) throw new Error(translate("shared.canvas.canvasStoryboardOperations.aStoryboardTableSupportsUpTo100Rows"));
            if (!patch.videoMotionPrompt?.trim() && !patch.plotDescription?.trim()) throw new Error(translate("shared.canvas.canvasStoryboardOperations.newShotsRequireAVisualDescriptionOrVideoPrompt"));
            next.push(createStoryboardRow(rows.length + 1, patch));
        } else next[index] = { ...rows[index], ...patch };
    } else throw new Error(translate("shared.canvas.canvasStoryboardOperations.storyboardOperationMustBeAppendUpdateOrRemove"));
    next = next.map((row, i) => ({ ...row, shotNumber: i + 1 }));
    return [{ type: "update_node", id: node.id, metadata: { storyboard: {
        rows: next,
        visibleColumns: node.metadata?.storyboard?.visibleColumns || ["shotNumber", "durationSeconds", "videoMotionPrompt", "dialogue", "assets"],
        referenceNodeIds: node.metadata?.storyboard?.referenceNodeIds || [],
    } } }];
}
