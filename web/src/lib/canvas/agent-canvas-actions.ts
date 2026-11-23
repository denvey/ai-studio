import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { translate } from "@/i18n";


export type AgentCanvasAction = { nodeId: string; title: string; nodeType: string; action: string; fields?: string[]; resultTitle?: string; targetNodeId?: string; targetTitle?: string; targetNodeType?: string };

export function agentRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function agentToolArguments(detail: unknown) {
    const value = agentRecord(detail).arguments;
    if (typeof value !== "string") return agentRecord(value);
    try { return agentRecord(JSON.parse(value)); } catch { return {}; }
}

export function agentCanvasActions(toolName: string, detail: unknown, references: CanvasResourceReference[] = []): AgentCanvasAction[] {
    const payload = agentRecord(detail);
    const result = agentRecord(payload.result);
    const args = agentToolArguments(detail);
    const actions: AgentCanvasAction[] = [];
    const add = (id: unknown, title: unknown, kind: unknown, action: string, details: Partial<AgentCanvasAction> = {}) => {
        if (typeof id !== "string" || !id || actions.some((item) => item.nodeId === id && item.action === action)) return;
        const reference = references.find((item) => item.nodeId === id);
        actions.push({ nodeId: id, title: typeof title === "string" && title ? title : reference?.title || id, nodeType: typeof kind === "string" ? kind : reference?.kind || "", action, ...details });
    };
    if (Array.isArray(payload.actions)) {
        for (const value of payload.actions) {
            const action = agentRecord(value);
            add(action.nodeId, action.title, action.nodeType, String(action.action || "updated"), {
                fields: Array.isArray(action.fields) ? action.fields.filter((field): field is string => typeof field === "string") : undefined,
                resultTitle: typeof action.resultTitle === "string" ? action.resultTitle : undefined,
                targetNodeId: typeof action.targetNodeId === "string" ? action.targetNodeId : undefined,
                targetTitle: typeof action.targetTitle === "string" ? action.targetTitle : undefined,
                targetNodeType: typeof action.targetNodeType === "string" ? action.targetNodeType : undefined,
            });
        }
        return actions;
    }
    const failed = payload.eventType === "tool_failed";
    if (toolName === "generate_media") {
        const submitted = payload.eventType === "generation_task_created";
        const action = failed ? "failed" : submitted ? "generating" : "generated";
        add(result.nodeId || payload.nodeId || args.nodeId, payload.title || args.title, payload.mode || args.mode, action);
        if (!failed || result.taskSubmitted === true) {
            const ids = payload.referenceNodeIds || args.referenceNodeIds;
            if (Array.isArray(ids)) for (const id of ids) add(id, undefined, undefined, "referenced");
        }
    } else if (toolName === "canvas_get_state" && !failed && Array.isArray(result.nodes)) {
        for (const value of result.nodes) { const node = agentRecord(value); add(node.id, node.title, node.type, "read"); }
    } else if (toolName === "canvas_inspect_image" && !failed) {
        // 看图回执：reuseObservation 是复用账本里的观察（没有再附图）、repeat 是读循环护栏
        // （只回执文字）。两者都没有把画面送出去，所以不能报成"查看了…画面"。
        if (result.reuseObservation === true) add(result.nodeId, result.title, "image", "reused");
        else if (result.repeat !== true) {
            add(result.nodeId, result.title, "image", "viewed");
            if (Array.isArray(result.batchImages)) for (const value of result.batchImages) { const image = agentRecord(value); add(image.nodeId, image.title, "image", "viewed"); }
        }
    } else if (toolName === "canvas_apply_ops" && !failed && Array.isArray(args.ops)) {
        for (const value of args.ops) {
            const op = agentRecord(value);
            if (op.type === "connect_nodes") {
                add(op.fromNodeId, undefined, undefined, "referenced");
                add(op.toNodeId, undefined, undefined, "updated");
            } else add(op.id, op.title, op.nodeType, op.type === "add_node" ? "created" : "updated");
        }
    }
    return actions;
}

export function agentCanvasActionLabel(action: AgentCanvasAction) {
    const kind = ({ image: translate("account.feedback.image"), video: translate("account.feedback.video"), audio: translate("account.settings.modelConfig.capabilities.audio"), text: translate("account.settings.modelConfig.capabilities.text"), markdown: "Markdown", script: translate("account.welcome.chapters.shots.label"), character: translate("canvasA.characterNode.card") } as Record<string, string>)[action.nodeType] || "";
    if (action.action === "referenced" && action.targetTitle) {
        const targetKind = ({ image: translate("account.feedback.image"), video: translate("account.feedback.video"), audio: translate("account.settings.modelConfig.capabilities.audio"), text: translate("account.settings.modelConfig.capabilities.text"), markdown: "Markdown", script: translate("account.welcome.chapters.shots.label"), character: translate("canvasA.characterNode.card") } as Record<string, string>)[action.targetNodeType || ""] || "";
        return translate("shared.canvas.agentCanvasActions.createReferenceNodeNode", { v0: String(kind), v1: String(action.title), v2: String(targetKind), v3: String(action.targetTitle) });
    }
    // read 的动词必须是"存在式"：canvas_get_state 只读到清单，说成"读取了图片节点"会被读成看过画面。
    const verb = ({ created: translate("shared.canvas.agentCanvasActions.created"), updated: translate("shared.canvas.agentCanvasActions.updated"), referenced: translate("shared.canvas.agentCanvasActions.referenced"), read: translate("shared.canvas.agentCanvasActions.canvasContains"), viewed: translate("shared.canvas.agentCanvasActions.viewed"), reused: translate("shared.canvas.agentCanvasActions.reusedObservation"), generating: translate("shared.canvas.agentCanvasActions.generationSubmitted"), generated: translate("shared.canvas.agentCanvasActions.generated"), failed: translate("shared.canvas.agentCanvasActions.generationIncomplete") } as Record<string, string>)[action.action] || translate("shared.canvas.agentCanvasActions.locate");
    const fieldText = action.fields?.length ? translate("shared.canvas.agentCanvasActions.changes", { v0: String(action.fields.join("、")) }) : "";
    const titleText = action.resultTitle ? translate("shared.canvas.agentCanvasActions.renamedTo", { v0: String(action.resultTitle) }) : "";
    return translate("shared.canvas.agentCanvasActions.node", { v0: String(verb), v1: String(kind), v2: String(action.title), v3: String(fieldText), v4: String(titleText) });
}
