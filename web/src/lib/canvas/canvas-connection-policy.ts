import { audioModelForConnection, audioReferenceCapacity, doubaoAudioInputError, isDoubaoAudioModel, maxModelInputCapacity, resolveCompatibleModel, type ModelInputSummary } from "@/lib/model-selection";
import { getNodeAcceptedInputKinds, getNodeGenerationMode, getNodeInputKind, getNodeMaxInputCount } from "@/lib/canvas/node-registry";
import { readNodeGenerationSpec, resolveGenerationSelection } from "@/lib/canvas/generation-contract";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { translate } from "@/i18n";


type ConnectionCandidate = Pick<CanvasConnection, "fromNodeId" | "toNodeId">;
type CanvasConnectionPolicyOptions = {
    // 仅跳过参考素材数量上限，媒体类型不兼容仍然拒绝。
    ignoreCapacity?: boolean;
};

export function canvasConnectionError(config: AiConfig, nodes: CanvasNodeData[], connections: CanvasConnection[], candidate: ConnectionCandidate, options: CanvasConnectionPolicyOptions = {}) {
    const target = nodes.find((node) => node.id === candidate.toNodeId);
    if (!target) return translate("shared.canvas.canvasConnectionPolicy.connectionTargetNodeNotFound");
    if (target.type === CanvasNodeType.BatchTable && target.metadata?.locked) return translate("shared.canvas.canvasConnectionPolicy.theBatchCreationTableIsLocked");
    const acceptedInputKinds = getNodeAcceptedInputKinds(target.type);
    if (acceptedInputKinds.length) {
        const source = nodes.find((node) => node.id === candidate.fromNodeId);
        const sourceKind = source ? getNodeInputKind(source.type) : undefined;
        const isMediaConversion = target.type === CanvasNodeType.MediaConversion;
        const hasAcceptedSource = isMediaConversion
            ? source?.type === CanvasNodeType.Image || source?.type === CanvasNodeType.Video
            : Boolean(sourceKind && acceptedInputKinds.includes(sourceKind));
        if (!sourceKind || !hasAcceptedSource) {
            const labels = acceptedInputKinds.map(acceptedInputKindLabel).join(translate("common.or"));
            const targetLabel = isMediaConversion ? translate("shared.canvas.canvasConnectionPolicy.conversion") : target.type === CanvasNodeType.BatchTable ? translate("shared.canvas.nodeRegistry.definitions.builtinNodes.batchCreationTable") : labels;
            return translate("shared.canvas.canvasConnectionPolicy.nodesOnlyAcceptInput", { v0: String(targetLabel), v1: String(labels) });
        }
        const maxInputCount = getNodeMaxInputCount(target.type);
        if (maxInputCount) {
            const inputCount = new Set(
                [...connections, { id: "candidate", ...candidate }]
                    .filter((connection) => connection.toNodeId === target.id)
                    .map((connection) => connection.fromNodeId),
            ).size;
            if (inputCount > maxInputCount) return translate("shared.canvas.canvasConnectionPolicy.nodesAcceptUpToInputs", { v0: String(isMediaConversion ? translate("shared.canvas.canvasConnectionPolicy.conversion") : translate("canvasB.mediaVersion.current")), v1: String(maxInputCount) });
        }
    }
    const mode = getNodeGenerationMode(target);
    if (!mode) return "";
    const input = connectionInputSummary(target.id, nodes, connections, candidate);
    const visualInputCount = input.imageCount + input.characterCount;

    if (mode === "image") {
        if (input.videoCount > 0) return translate("shared.canvas.canvasConnectionPolicy.imageGenerationNodesCannotConnectToReferenceVideos");
        if (input.audioCount > 0) return translate("shared.canvas.canvasConnectionPolicy.imageGenerationNodesCannotConnectToReferenceAudio");
        return options.ignoreCapacity ? "" : capacityError(config, mode, "image", visualInputCount, translate("canvasPage.connection.referenceImage"));
    }
    if (mode === "video") {
        return options.ignoreCapacity ? "" : capacityError(config, mode, "image", visualInputCount, translate("canvasPage.connection.referenceImage")) || capacityError(config, mode, "video", input.videoCount, translate("library.tasks.params.referenceVideos")) || capacityError(config, mode, "audio", input.audioCount, translate("library.tasks.params.referenceAudios"));
    }
    if (mode === "text" && input.audioCount > 0) return translate("shared.canvas.canvasConnectionPolicy.textGenerationNodesCannotConnectToReferenceAudio");
    if (mode === "audio") {
        const model = routedAudioModel(config, target, input);
        if (isDoubaoAudioModel(config, model)) return doubaoAudioInputError(input);
        if (input.imageCount > 0 || input.videoCount > 0) return translate("shared.canvas.canvasConnectionPolicy.audioGenerationNodesCannotConnectToReferenceImagesOrVideos");
        if (input.characterCount > 1) return translate("shared.canvas.canvasConnectionPolicy.characterVoiceoverAcceptsOnlyOneCharacterCardAtATime");
        const maxAudios = audioReferenceCapacity(config, model);
        if (input.audioCount > maxAudios) {
            return maxAudios > 0 ? translate("shared.canvas.canvasConnectionPolicy.audioGenerationNodesAcceptUpToAudioReferences", { v0: String(maxAudios) }) : translate("shared.canvas.canvasConnectionPolicy.theCurrentAudioModelDoesNotSupportAudioReferences");
        }
    }
    return "";
}

function routedAudioModel(config: AiConfig, target: CanvasNodeData, input: ModelInputSummary) {
    const generationSpec = readNodeGenerationSpec(target);
    const selectedModel = generationSpec?.mode === "audio" ? resolveGenerationSelection(config, generationSpec.modelSelection) : "";
    const explicit = audioModelForConnection(config, selectedModel || target.metadata?.model || "");
    // 同名模型组会在生成时改选到能接受当前参考的成员。连线必须按这个结果判断，
    // 不能拿组里一个不支持图片的模型把豆包音频挡掉。
    return resolveCompatibleModel(config, explicit, { capability: "audio", input }) || explicit;
}

function acceptedInputKindLabel(kind: "image" | "video" | "audio" | "text" | "table_data") {
    if (kind === "image") return translate("account.feedback.image");
    if (kind === "video") return translate("account.feedback.video");
    if (kind === "audio") return translate("account.settings.modelConfig.capabilities.audio");
    if (kind === "table_data") return translate("shared.canvas.canvasConnectionPolicy.multidimensionalTable");
    return translate("account.settings.modelConfig.capabilities.text");
}

export function connectionInputSummary(targetNodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], candidate?: ConnectionCandidate): ModelInputSummary {
    const sourceIds = new Set([...connections, ...(candidate ? [{ id: "candidate", ...candidate }] : [])].filter((connection) => connection.toNodeId === targetNodeId).map((connection) => connection.fromNodeId));
    const input: ModelInputSummary = { textCount: 0, imageCount: 0, videoCount: 0, audioCount: 0, characterCount: 0 };
    sourceIds.forEach((sourceId) => {
        const source = nodes.find((node) => node.id === sourceId);
        if (!source) return;
        // 生成配置与背板不是参考素材，不参与容量计数——这一步必须早于角色卡判定，
        // 否则一个带角色元数据的配置/背板节点会被多算成角色。
        const inputKind = getNodeInputKind(source.type);
        if (!inputKind) return;
        // 角色卡是跨类型覆盖：落在可计数类型上时改记为角色。
        if (source.metadata?.workflowKind === "character") input.characterCount += 1;
        else if (inputKind !== "table_data") {
            input[`${inputKind}Count`] += 1;
            if (inputKind === "video") (input.videoDurationsMs ??= []).push(Math.max(0, Math.round(Number(source.metadata?.durationMs) || 0)));
        }
    });
    return input;
}

function capacityError(config: AiConfig, capability: "image" | "video", kind: "image" | "video" | "audio", count: number, label: string) {
    const maximum = maxModelInputCapacity(config, capability, kind);
    if (maximum === null || count <= maximum) return "";
    const unit = kind === "image" ? translate("canvasA.characterLibrary.pageItem") : translate("shared.plugins.builtin.editor.editorExport.items");
    return maximum > 0 ? translate("shared.canvas.canvasConnectionPolicy.configuredModelsSupportUpTo", { v0: String(maximum), v1: String(unit), v2: String(label) }) : translate("shared.canvas.canvasConnectionPolicy.noConfiguredModelSupports", { v0: String(label) });
}
