import type { CanvasOperation, CanvasSnapshot } from "@/lib/canvas/canvas-operation-contract";
import { buildCanvasWorkflowOps } from "@/lib/canvas/canvas-workflow-builder";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import type { ResponseInputMessage } from "@/services/api/image";
import { generationErrorMessage } from "@/lib/generation-error";
import { dynamicCreativePlan, type CreativeDynamicPlan } from "./creative-plan";
import { normalizeCreativeField } from "./creative-agent-contract";
import { CREATIVE_SCENARIOS, type CreativeAnswers, type CreativeBrief, type CreativeGenerationItem, type CreativePlan, type CreativeProposal, type CreativeQuestionRequest, type CreativeScenarioId } from "./creative-agent-contract";
import { translate } from "@/i18n";

export type CreativeReference = { id: string; title: string; kind: "image" | "text"; assetId?: string; storageKey?: string; text?: string; mimeType?: string; width?: number; height?: number };
export type CreativeMessage = { id: string; role: "user" | "assistant"; text: string; question?: CreativeQuestionRequest; answers?: CreativeAnswers; proposal?: CreativeProposal };
export type CreativeMediaState = { ref: string; nodeId: string; attempt: number; submissionId?: string; taskId?: string; status: "pending" | "queued" | "running" | "ready" | "failed" | "write_failed"; storageKey?: string; error?: string; failureKind?: "generation" | "observation" };
export type CreativeAgentState = {
    schemaVersion: 1; scene: CreativeScenarioId; brief: CreativeBrief; messages: CreativeMessage[];
    references: CreativeReference[]; selectedSkillIds: string[]; textModel?: string;
    questions?: CreativeQuestionRequest; answers?: CreativeAnswers; proposal?: CreativeProposal;
    operations?: CanvasOperation[]; canvasApplied?: boolean; pendingEdits?: CanvasOperation[];
    pendingRedo?: { ref: string; attempt: number; proposalVersion: number };
    media: CreativeMediaState[]; pendingPayment?: string[];
    planning?: { itemKey: string; submissionId?: string; protocol: ResponseInputMessage[]; model?: string; prompt?: string; consumed?: boolean };
    modelCalls: number; error?: string; externalInteractionPresented?: boolean;
    dynamicPlan?: CreativeDynamicPlan;
    modificationRequested?: boolean;
};
export const initialCreativeState = (): CreativeAgentState => ({ schemaVersion: 1, scene: "general", brief: {}, messages: [], references: [], selectedSkillIds: [], media: [], modelCalls: 0 });
export function readCreativeState(value: Record<string, unknown>): CreativeAgentState {
    if (value.schemaVersion !== 1 || !Array.isArray(value.messages) || !Array.isArray(value.media) || !Object.hasOwn(CREATIVE_SCENARIOS, String(value.scene))) throw new Error(translate("ecommerce.creation.creativeAgentState.theCreativeSessionVersionOrContentIsInvalidAndCannot"));
    return value as unknown as CreativeAgentState;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
function required(value: unknown, name: string) { const text = str(value); if (!text) throw new Error(translate("ecommerce.creation.creativeAgentState.theProposalIsMissing", { v0: String(name) })); return text; }

export function mergeCreativeBrief(brief: CreativeBrief, raw: unknown, _scene: CreativeScenarioId, latestUserInput = ""): CreativeBrief {
    const next = { ...brief };
    for (const candidate of Array.isArray(raw) ? raw : []) {
        const field = record(candidate);
        const fieldName = normalizeCreativeField(field.field);
        if (!fieldName) continue;
        const value = field.value;
        if (!(typeof value === "string" || typeof value === "number" && Number.isFinite(value) || Array.isArray(value) && value.every((item) => typeof item === "string"))) continue;
        const source = ["user", "asset", "default"].includes(str(field.source)) ? field.source as "user" | "asset" | "default" : "inferred";
        const status = ["confirmed", "unparsed", "conflict"].includes(str(field.status)) ? field.status as "confirmed" | "unparsed" | "conflict" : "inferred";
        if (next[fieldName]?.status === "confirmed" && (source !== "user" || !["confirmed", "conflict"].includes(status))) continue;
        if (next[fieldName]?.status === "confirmed" && JSON.stringify(next[fieldName]!.value) !== JSON.stringify(value)) {
            const evidence = str(field.evidence);
            if (!evidence || !latestUserInput.includes(evidence)) continue;
        }
        next[fieldName] = { value, source, status: source === "inferred" && status === "confirmed" ? "inferred" : status };
    }
    return next;
}

export function normalizeCreativeProposal(raw: unknown, id: string, version: number, config: AiConfig, references: CreativeReference[] = []): CreativeProposal<{ existingAssets: Record<string, CreativeReference> }> {
    const data = record(raw), workflow = record(data.workflow);
    const existingAssets: Record<string, CreativeReference> = {};
    if (!Array.isArray(workflow.nodes) || workflow.nodes.length < 1 || workflow.nodes.length > 20) throw new Error(translate("ecommerce.creation.creativeAgentState.theProposalMustContain1To20NodesWithClear"));
    const nodes = workflow.nodes.map((value) => {
        const node = record(value), kind = str(node.kind);
        if (!["text", "image", "video", "styleboard", "story_input", "script"].includes(kind)) throw new Error(translate("ecommerce.creation.creativeAgentState.thisProposalNodeTypeIsUnavailableReadTheCapabilityCatalog"));
        const content = str(node.content), prompt = str(node.prompt);
        const assetId = str(node.assetId), ref = required(node.ref, translate("ecommerce.creation.fields.nodeRef"));
        if (assetId) {
            const asset = references.find((item) => item.id === assetId && item.kind === "image" && resourceIdFromStorageKey(item.storageKey));
            if (kind !== "image" || !asset) throw new Error(translate("ecommerce.creation.creativeAgentState.anExistingImageReferencedByTheProposalIsUnavailable"));
            existingAssets[ref] = asset;
        }
        if (!assetId && (["text", "story_input"].includes(kind) ? !content : ["image", "video"].includes(kind) && !prompt)) throw new Error(translate("ecommerce.creation.creativeAgentState.textNodesRequireBodyTextMediaNodesRequireGenerationPrompts"));
        const shots = Array.isArray(node.shots) ? node.shots.map((value) => { const shot = record(value); const durationSeconds = Number(shot.durationSeconds); if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error(translate("ecommerce.creation.creativeAgentState.shotDurationMustBeGreaterThanZero")); return { durationSeconds, videoMotionPrompt: required(shot.videoMotionPrompt, translate("ecommerce.creation.fields.shotPrompt")), dialogue: str(shot.dialogue) }; }) : undefined;
        if (shots && shots.length > 100) throw new Error(translate("ecommerce.creation.creativeAgentState.aStoryboardCanContainAtMost100Rows"));
        if (kind === "script" && !shots?.length) throw new Error(translate("ecommerce.creation.creativeAgentState.aStoryboardProposalMustProvideNonemptyScriptShotsWithDurationSeconds"));
        return { ref: required(node.ref, translate("ecommerce.creation.fields.nodeRef")), kind: kind as "text" | "image" | "video" | "styleboard" | "story_input" | "script", title: required(node.title, translate("ecommerce.creation.fields.nodeTitle")), content, prompt, shots, runGeneration: false, referenceRefs: Array.isArray(node.referenceRefs) ? node.referenceRefs.map(String) : [], referenceNodeIds: Array.isArray(node.referenceNodeIds) ? node.referenceNodeIds.map(String) : [] };
    });
    const refs = new Set(nodes.map((node) => node.ref));
    if (refs.size !== nodes.length) throw new Error(translate("ecommerce.creation.creativeAgentState.duplicateProposalNodeReferences"));
    const generationItems: CreativeGenerationItem[] = (Array.isArray(data.generationItems) ? data.generationItems : []).map((value) => {
        const item = record(value), ref = required(item.ref, translate("ecommerce.creation.fields.target")), node = nodes.find((candidate) => candidate.ref === ref);
        if (!node || (node.kind !== "image" && node.kind !== "video") || node.kind !== item.mode || existingAssets[ref]) throw new Error(translate("ecommerce.creation.creativeAgentState.generationTasksDoNotMatchMediaNodesExistingAssetsMust"));
        const model = required(item.model, translate("ecommerce.creation.fields.model"));
        if (!selectableModelsByCapability(config, node.kind).includes(model)) throw new Error(translate("ecommerce.creation.creativeAgentState.nodeRequiresAModelTheSelectedModelDoesNotSupport", {
                    v0: String(node.title),
                    v1: translate(node.kind === "video" ? "ecommerce.creation.fields.video" : "ecommerce.creation.fields.image"),
                    v2: String(model),
                    v3: String(node.kind),
                }));
        const referenceRefs: string[] = [];
        const referenceNodeIds = new Set<string>();
        const inputReferences = new Set([
            ...node.referenceRefs, ...node.referenceNodeIds,
            ...(Array.isArray(item.referenceRefs) ? item.referenceRefs.map(String) : []),
        ]);
        for (const reference of inputReferences) {
            const planned = nodes.find((candidate) => candidate.ref === reference);
            if (planned) {
                if (reference === ref || planned.kind !== "image") throw new Error(translate("ecommerce.creation.creativeAgentState.referenceOfNodeMustPointToAnotherImageNode", { v0: String(node.title), v1: String(reference) }));
                referenceRefs.push(reference);
            } else {
                const existing = references.find((asset) => asset.id === reference && asset.kind === "image" && resourceIdFromStorageKey(asset.storageKey));
                if (!existing) throw new Error(translate("ecommerce.creation.creativeAgentState.imageReferencedByNodeIsNotInThisProposalOr", { v0: String(node.title), v1: String(reference) }));
                referenceNodeIds.add(existing.id);
            }
        }
        // A model may repeat a real canvas ID in both reference fields. Keep one verified input.
        node.referenceNodeIds = [...referenceNodeIds];
        const seconds = item.seconds === undefined ? undefined : Number(item.seconds);
        const result = { ref, mode: node.kind, model, size: str(item.size) || undefined, seconds, quality: str(item.quality) || undefined, referenceRefs };
        assertCreativeMediaCapability(result, config, referenceRefs.length + node.referenceNodeIds.length);
        node.referenceRefs = referenceRefs;
        return result;
    });
    const mediaRefs = generationItems.map((item) => item.ref);
    if (new Set(mediaRefs).size !== mediaRefs.length) throw new Error(translate("ecommerce.creation.creativeAgentState.theProposalContainsDuplicateGenerationItemsRefValuesEachMediaNode"));
    const missing = nodes.filter((node) => (node.kind === "image" || node.kind === "video") && !existingAssets[node.ref] && !mediaRefs.includes(node.ref));
    if (missing.length) throw new Error(translate("ecommerce.creation.creativeAgentState.theProposalIsMissingMediaGenerationSettingsCompleteGenerationItemsThese", { v0: String(missing.map((node) => `${node.title}（ref=${node.ref}，mode=${node.kind}）`).join("、")) }));
    // 引用图的循环依赖会造成永远没有可执行批次。
    const visited = new Set<string>(), visiting = new Set<string>();
    const visit = (ref: string) => { if (visiting.has(ref)) throw new Error(translate("ecommerce.creation.creativeAgentState.theProposalContainsCircularAssetDependencies")); if (visited.has(ref)) return; visiting.add(ref); generationItems.find((item) => item.ref === ref)?.referenceRefs?.forEach(visit); visiting.delete(ref); visited.add(ref); };
    mediaRefs.forEach(visit);
    const edges = (Array.isArray(workflow.edges) ? workflow.edges : []).map((value) => { const edge = record(value); const from = str(edge.from), to = str(edge.to); if (!refs.has(from) || !refs.has(to) || from === to) throw new Error(translate("ecommerce.creation.creativeAgentState.invalidProposalConnectionReferences")); return { from, to }; });
    return { id, version, title: required(data.title, translate("ecommerce.creation.fields.title")), summary: required(data.summary, translate("ecommerce.creation.fields.summary")), markdown: required(data.markdown, translate("ecommerce.creation.fields.content")), deliverables: Array.isArray(data.deliverables) ? data.deliverables.map(String) : [], workflow: { title: str(data.title), nodes: nodes.map((node) => existingAssets[node.ref] ? { ...node, prompt: `引用已有素材：${node.title}` } : node), edges, autoRun: false }, generationItems, extra: { existingAssets } };
}

export function assertCreativeMediaCapability(item: CreativeGenerationItem, config: AiConfig, referenceCount: number) {
    const capability = modelCapabilityConfigFor(config, item.model);
    if (item.mode === "video") {
        const video = capability.video;
        if (!video) throw new Error(translate("ecommerce.creation.creativeAgentState.theCurrentVideoModelLacksVerifiableCapabilitySettings"));
        const seconds = Number(item.seconds);
        const duration = video.duration;
        const allowed = duration.selection === "enum" ? duration.values?.includes(seconds) : seconds >= (duration.min ?? 0) && seconds <= (duration.max ?? 0) && (seconds - (duration.min ?? 0)) % (duration.step || 1) === 0;
        if (!Number.isFinite(seconds) || !allowed) throw new Error(translate("ecommerce.creation.creativeAgentState.theCurrentVideoModelDoesNotSupportSecondsAdjustThe", { v0: String(item.seconds ?? translate("ecommerce.creation.fields.unspecified")) }));
        if (!item.size || !video.ratios.includes(item.size)) throw new Error(translate("ecommerce.creation.creativeAgentState.theCurrentVideoModelDoesNotSupportTheAspectRatio", { v0: String(item.size || translate("ecommerce.creation.fields.unspecified")) }));
        if (referenceCount < video.references.minImages || referenceCount > video.references.maxImages) throw new Error(translate("ecommerce.creation.creativeAgentState.theCurrentVideoModelRequiresToReferenceImagesThisProposal", { v0: String(video.references.minImages), v1: String(video.references.maxImages), v2: String(referenceCount) }));
    } else {
        if (!capability.image) throw new Error(translate("ecommerce.creation.creativeAgentState.theCurrentImageModelLacksVerifiableCapabilitySettings"));
        if (referenceCount > capability.image.references.maxImages) throw new Error(translate("ecommerce.creation.creativeAgentState.theReferenceImageCountExceedsTheModelSCapability"));
        if (item.size && !capability.image.size.allowCustom && !capability.image.size.values.includes(item.size)) throw new Error(translate("ecommerce.creation.creativeAgentState.theCurrentImageModelDoesNotSupportSize", { v0: String(item.size) }));
    }
}

export function creativeProposalOps(runId: string, proposal: CreativeProposal, snapshot: CanvasSnapshot, config: AiConfig): CanvasOperation[] {
    const ops = buildCanvasWorkflowOps(proposal.workflow, snapshot, config, `creation:${runId}:v${proposal.version}`);
    const columns = new Map<string, number>();
    const visiting = new Set<string>();
    const column = (ref: string): number => {
        if (visiting.has(ref)) throw new Error(translate("ecommerce.creation.creativeAgentState.theWorkflowContainsCircularConnectionsAndCannotBeArrangedAutomatically"));
        if (columns.has(ref)) return columns.get(ref)!;
        visiting.add(ref);
        const parents = [...(proposal.workflow.edges || []).filter((edge) => edge.to === ref).map((edge) => edge.from), ...(proposal.workflow.nodes.find((node) => node.ref === ref)?.referenceRefs || [])];
        const value = parents.length ? Math.max(...parents.map((parent) => column(parent))) + 1 : 0;
        visiting.delete(ref); columns.set(ref, value); return value;
    };
    const originX = snapshot.nodes.length ? Math.max(...snapshot.nodes.map((node) => node.position.x + node.width)) + 160 : 80;
    const rows = new Map<number, number>();
    return ops.filter((op) => op.type !== "select_nodes").map((op) => {
        if (op.type !== "add_node") return op;
        const node = proposal.workflow.nodes.find((item) => op.id === creativeNodeId(runId, proposal.version, item.ref));
        const item = proposal.generationItems.find((item) => item.ref === node?.ref);
        const asset = (proposal.extra as { existingAssets?: Record<string, CreativeReference> } | undefined)?.existingAssets?.[node?.ref || ""];
        const depth = column(node!.ref), y = rows.get(depth) || 80;
        rows.set(depth, y + (op.height || 405) + 120);
        return { ...op, position: { x: originX + depth * 880, y }, ...(asset?.width && asset.height ? { width: Math.min(asset.width, 720), height: Math.min(asset.width, 720) * asset.height / asset.width } : {}), metadata: { ...op.metadata, creationRunId: runId, creationProposalVersion: proposal.version, ...(item ? { model: item.model, size: item.size, seconds: item.seconds === undefined ? undefined : String(item.seconds), ...(item.mode === "video" ? { vquality: item.quality } : { quality: item.quality }) } : {}), ...(asset ? { content: resourceFileUrl(resourceIdFromStorageKey(asset.storageKey)!), storageKey: asset.storageKey, assetId: asset.assetId || asset.id, mimeType: asset.mimeType, naturalWidth: asset.width, naturalHeight: asset.height, status: "success" } : {}) } };
    });
}
export function assertCreativeBriefSpecifications(proposal: CreativeProposal, brief: CreativeBrief) {
    const seconds = brief.seconds?.status === "confirmed" ? Number(String(brief.seconds.value).match(/\d+(?:\.\d+)?/)?.[0]) : undefined;
    const ratio = brief.aspectRatio?.status === "confirmed" ? String(brief.aspectRatio.value).match(/\d+\s*[:：]\s*\d+/)?.[0].replace(/[\s：]/g, (char) => char === "：" ? ":" : "") : undefined;
    for (const item of proposal.generationItems) {
        if (item.mode === "video" && seconds && item.seconds !== seconds) throw new Error(translate("ecommerce.creation.creativeAgentState.theProposalDurationDiffersFromTheConfirmedSecondsEditThe", { v0: String(seconds) }));
        if (ratio) {
            const expected = ratio.split(":").map(Number);
            const actual = item.size?.trim().match(item.mode === "image" ? /^(\d+(?:\.\d+)?)\s*[:：x×]\s*(\d+(?:\.\d+)?)$/i : /^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)$/);
            const width = Number(actual?.[1]), height = Number(actual?.[2]);
            if (!(width > 0 && height > 0) || Math.abs(width * expected[1] - height * expected[0]) > 1e-6) throw new Error(translate("ecommerce.creation.creativeAgentState.theProposalAspectRatioDiffersFromTheConfirmedEditThe", { v0: String(ratio) }));
        }
    }
}
export const creativeNodeId = (runId: string, version: number, ref: string) => `creation:${runId}:v${version}:node:${encodeURIComponent(ref)}`;
export function creativeVideoSpecificationError(item: CreativeGenerationItem | undefined, output: { durationMs?: number; width?: number; height?: number }): string | undefined {
    if (item?.mode !== "video") return;
    if (item.seconds && output.durationMs && Math.abs(output.durationMs - item.seconds * 1000) > 250) return translate("ecommerce.creation.validation.durationMismatch", { actual:(output.durationMs / 1000).toFixed(2), expected:item.seconds});
    const ratio = item.size?.match(/^(\d+):(\d+)$/);
    if (ratio && output.width && output.height && Math.abs(output.width / output.height / (Number(ratio[1]) / Number(ratio[2])) - 1) > 0.02) return translate("ecommerce.creation.validation.ratioMismatch", { width:output.width, height:output.height, ratio:item.size});
}
export function creativePlan(state: CreativeAgentState): CreativePlan | undefined {
    if (state.dynamicPlan) return dynamicCreativePlan(state);
    if (!state.proposal && !state.questions) return undefined;
    return { id: state.proposal?.id ?? state.questions!.interactionId, steps: [
        { id: "brief", title: translate("ecommerce.creation.creativeAgentState.understandRequirements"), status: state.questions?.status === "pending" ? "waiting" : "completed" },
        { id: "proposal", title: translate("ecommerce.creation.creativeAgentState.confirmCreativeProposal"), status: state.canvasApplied ? "completed" : state.proposal ? "waiting" : "pending" },
        ...state.media.map((item) => ({ id: item.ref, title: state.proposal?.workflow.nodes.find((node) => node.ref === item.ref)?.title || item.ref, status: item.status === "ready" ? "completed" as const : item.status === "failed" || item.status === "write_failed" ? "failed" as const : item.status === "running" || item.status === "queued" ? "running" as const : item.submissionId ? "waiting" as const : "pending" as const, nodeIds: [item.nodeId], detail: item.error ? generationErrorMessage(item.error) : undefined })),
    ] };
}
