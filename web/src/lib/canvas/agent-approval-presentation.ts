import type { AgentApprovalPreview, AgentApprovalPreviewItem, AgentApprovalPreviewOperation } from "@/services/api/agent";
import { translate } from "@/i18n";


type RecordValue = Record<string, unknown>;

export type AgentApprovalPresentation = AgentApprovalPreview & { source: "server" | "fallback" };

function record(value: unknown): RecordValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function text(value: unknown, max = 240): string {
    if (typeof value !== "string") return "";
    const compact = value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
    return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function approvalArguments(value: unknown): RecordValue | null {
    if (typeof value !== "string") return record(value);
    try {
        return record(JSON.parse(value));
    } catch {
        return null;
    }
}

function shortReference(value: unknown): string {
    const id = text(value, 80);
    if (!id) return translate("shared.canvas.agentApprovalPresentation.unknownTarget");
    return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function nodeTypeLabel(value: unknown): string {
    const type = text(value, 32).toLowerCase();
    return ({ text: translate("account.settings.modelConfig.capabilities.text"), markdown: "Markdown", image: translate("account.feedback.image"), video: translate("account.feedback.video"), audio: translate("account.settings.modelConfig.capabilities.audio"), frame: translate("shared.canvas.agentApprovalPresentation.frame"), script: translate("shared.canvas.agentApprovalPresentation.script"), character: translate("canvasA.characterNode.card") } as Record<string, string>)[type] || (type ? translate("shared.workflowGraphEditor.node") : "");
}

function fieldLabel(key: string, nodeType: string): string {
    if (key === "title") return translate("shared.canvas.agentApprovalPresentation.nodeName");
    if (key === "content") return ["image", "video", "audio"].includes(nodeType.toLowerCase()) ? translate("shared.canvas.agentApprovalPresentation.nextPrompt") : translate("shared.canvas.agentApprovalPresentation.body");
    return key === "composerContent" ? translate("shared.canvas.agentApprovalPresentation.nextPrompt") : translate("shared.canvas.agentApprovalPresentation.configuredFields");
}

function operation(value: unknown): AgentApprovalPreviewOperation | null {
    return value === "add_node" || value === "update_node" || value === "connect_nodes" || value === "arrange_nodes" || value === "generate_media" || value === "generate_media_item" || value === "build_board" || value === "create_storyboard" || value === "edit_storyboard" || value === "create_character" || value === "plan_step" || value === "adopt_drama_media" ? value : null;
}

function normalizeServerPreview(value: unknown): AgentApprovalPresentation | null {
    const source = record(value);
    if (!source || !Array.isArray(source.items)) return null;
    const rawItems = source.items;
    const items: AgentApprovalPreviewItem[] = [];
    for (const raw of rawItems) {
        const item = record(raw);
        const op = operation(item?.operation);
        const summary = text(item?.summary);
        if (!item || !op || !summary) continue;
        items.push({
            operation: op,
            nodeId: text(item.nodeId, 120) || undefined,
            nodeTitle: text(item.nodeTitle, 120) || undefined,
            resultTitle: text(item.resultTitle, 120) || undefined,
            nodeType: text(item.nodeType, 32) || undefined,
            nodeTypeLabel: text(item.nodeTypeLabel, 48) || undefined,
            targetNodeId: text(item.targetNodeId, 120) || undefined,
            targetNodeTitle: text(item.targetNodeTitle, 120) || undefined,
            targetNodeType: text(item.targetNodeType, 32) || undefined,
            fields: Array.isArray(item.fields) ? item.fields.map((field) => text(field, 64)).filter(Boolean).slice(0, 12) : undefined,
            details: Array.isArray(item.details) ? item.details.map((detail) => text(detail, 180)).filter(Boolean).slice(0, 12) : undefined,
            summary,
        });
    }
    const title = text(source.title, 120);
    const description = text(source.description, 500);
    if (!title || !description || !items.length) return null;
    return { kind: text(source.kind, 64) || "agent_approval", title, description, items, source: "server" };
}

function canvasFallback(args: RecordValue | null): AgentApprovalPresentation {
    const rawOps = Array.isArray(args?.ops) ? args.ops : [];
    const items: AgentApprovalPreviewItem[] = [];
    for (const raw of rawOps) {
        const op = record(raw);
        const kind = operation(op?.type);
        if (!op || !kind || kind === "generate_media") continue;
        const type = text(op.nodeType, 32).toLowerCase();
        const label = nodeTypeLabel(type);
        if (kind === "add_node") {
            const title = text(op.title, 120) || translate("shared.canvas.agentApprovalPresentation.untitled", { v0: String(label || translate("shared.workflowGraphEditor.node")) });
            items.push({ operation: kind, nodeTitle: title, nodeType: type || undefined, nodeTypeLabel: label || undefined, fields: [translate("shared.canvas.agentApprovalPresentation.nodeName"), type === "text" || type === "markdown" ? translate("shared.canvas.agentApprovalPresentation.body") : translate("shared.canvas.agentApprovalPresentation.initialContent")], summary: translate("shared.canvas.agentApprovalPresentation.add", { v0: String(label || translate("shared.workflowGraphEditor.node")), v1: String(title) }) });
            continue;
        }
        if (kind === "update_node") {
            const patch = record(op.patch);
            const id = shortReference(op.id);
            const fields = patch ? Object.keys(patch).map((key) => fieldLabel(key, type)).filter(Boolean) : [];
            const resultTitle = text(patch?.title, 120);
            const target = translate("shared.canvas.agentApprovalPresentation.targetNodeReference", { v0: String(id) });
            items.push({ operation: kind, nodeTitle: target, nodeType: type || undefined, nodeTypeLabel: label || undefined, resultTitle: resultTitle || undefined, fields: fields.length ? [...new Set(fields)] : [translate("shared.canvas.agentApprovalPresentation.configuredFields")], summary: translate("shared.canvas.agentApprovalPresentation.updateOf", { v0: String(label || translate("shared.workflowGraphEditor.node")), v1: String(target), v2: String(fields.length ? [...new Set(fields)].join("、") : translate("shared.canvas.agentApprovalPresentation.configuredFields")), v3: String(resultTitle ? translate("shared.canvas.agentApprovalPresentation.renamedTo", { v0: String(resultTitle) }) : "") }) });
            continue;
        }
        const from = shortReference(op.fromNodeId);
        const to = shortReference(op.toNodeId);
        items.push({ operation: kind, nodeTitle: translate("shared.canvas.agentApprovalPresentation.sourceReference", { v0: String(from) }), targetNodeTitle: translate("shared.canvas.agentApprovalPresentation.targetReference", { v0: String(to) }), summary: translate("shared.canvas.agentApprovalPresentation.connectSourceReferenceTargetReference", { v0: String(from), v1: String(to) }) });
    }
    const counts = items.reduce<Record<string, number>>((out, item) => { out[item.operation] = (out[item.operation] || 0) + 1; return out; }, {});
    const parts = [counts.add_node ? translate("shared.canvas.agentApprovalPresentation.addNodes", { v0: String(counts.add_node) }) : "", counts.update_node ? translate("shared.canvas.agentApprovalPresentation.updateNodes", { v0: String(counts.update_node) }) : "", counts.connect_nodes ? translate("shared.canvas.agentApprovalPresentation.createReferenceConnections", { v0: String(counts.connect_nodes) }) : ""].filter(Boolean);
    return { source: "fallback", kind: "canvas_mutation", title: translate("shared.canvas.agentApprovalPresentation.confirmCanvasChanges"), description: parts.length ? translate("shared.canvas.agentApprovalPresentation.agentPlansToThisPastApprovalHasNoCanvasSnapshot", { v0: String(parts.join("，")) }) : translate("shared.canvas.agentApprovalPresentation.approvalParametersAreIncompleteAndTheTargetsCannotBeConfirmed"), items, };
}

function mediaFallback(args: RecordValue | null, payload: RecordValue | null): AgentApprovalPresentation {
    const mode = text(args?.mode, 32).toLowerCase();
    const type = mode === "video" ? translate("account.feedback.video") : mode === "image" ? translate("account.feedback.image") : mode === "audio" ? translate("account.settings.modelConfig.capabilities.audio") : translate("shared.canvas.agentApprovalPresentation.media");
    const references = Array.isArray(args?.referenceNodeIds) ? args.referenceNodeIds.filter((id) => typeof id === "string") : [];
    const title = text(args?.title, 120) || translate("shared.canvas.agentApprovalPresentation.untitled", { v0: String(type) });
    const details = [text(payload?.modelName) ? translate("shared.canvas.agentApprovalPresentation.model", { v0: String(text(payload?.modelName)) }) : text(args?.channelModelKey) || text(args?.logicalModelId) ? translate("shared.canvas.agentApprovalPresentation.model", { v0: String(text(args?.channelModelKey) || text(args?.logicalModelId)) }) : "", references.length ? translate("shared.canvas.agentApprovalPresentation.referenceCanvasAssetsAndCreateConnections", { v0: String(references.length) }) : translate("shared.canvas.agentApprovalPresentation.noCanvasMediaAssetsReferenced"), typeof args?.durationSeconds === "number" && args.durationSeconds > 0 ? translate("shared.canvas.agentApprovalPresentation.durationSeconds", { v0: String(args.durationSeconds) }) : "", text(args?.size) ? translate("shared.canvas.agentApprovalPresentation.aspectRatio", { v0: String(text(args?.size, 40)) }) : "", text(args?.quality) ? translate("shared.canvas.agentApprovalPresentation.quality", { v0: String(text(args?.quality, 40)) }) : "", typeof args?.videoGenerateAudio === "boolean" ? translate("shared.canvas.agentApprovalPresentation.audio", { v0: String(args.videoGenerateAudio ? translate("shared.canvas.agentApprovalPresentation.on") : translate("common.close")) }) : ""].filter(Boolean);
    return { source: "fallback", kind: "media_generation", title: translate("shared.canvas.agentApprovalPresentation.confirmGeneration", { v0: String(type) }), description: translate("shared.canvas.agentApprovalPresentation.draftNodesAndReferenceConnectionsHaveBeenCreatedGenerationHas", { v0: String(type) }), items: [{ operation: "generate_media", nodeTitle: title, nodeType: mode || undefined, nodeTypeLabel: type, details, summary: translate("shared.canvas.agentApprovalPresentation.generate", { v0: String(type), v1: String(title) }) }] };
}

export function agentApprovalPresentation(detail: unknown): AgentApprovalPresentation {
    const payload = record(detail);
    const serverPreview = normalizeServerPreview(payload?.preview);
    if (serverPreview) return serverPreview;
    const call = record(payload?.call);
    const fn = record(call?.function);
    const name = text(fn?.name) || text(payload?.toolName);
    const args = approvalArguments(fn?.arguments ?? payload?.arguments);
    if (name === "canvas_apply_ops") return canvasFallback(args);
    if (name === "generate_media") return mediaFallback(args, payload);
    return { source: "fallback", kind: "agent_approval", title: translate("shared.canvas.agentApprovalPresentation.confirmOperation"), description: translate("shared.canvas.agentApprovalPresentation.agentRequestedAnOperationButItsApprovalParametersCouldNot"), items: [] };
}
