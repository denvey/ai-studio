import { nanoid } from "nanoid";

import { batchCellConnectionError, parseBatchCellHandle } from "@/lib/canvas/canvas-batch-references";
import type { CanvasConnectionDropTarget } from "@/lib/canvas/canvas-connection-hit";
import { canvasConnectionError } from "@/lib/canvas/canvas-connection-policy";
import { normalizeConnection } from "@/lib/canvas/canvas-project-domain";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ConnectionHandle, type Position } from "@/types/canvas";
import { translate } from "@/i18n";


export type CanvasBatchConnectionPreview = {
    sourceNodeIds: string[];
    targetNodeId: string | null;
    targetHandleId?: string;
    targetAnchorRatio?: number;
    mouseWorld: Position;
    status: "idle" | "valid" | "partial" | "invalid";
};

export type BatchConnectionPlanOptions = {
    sourceNodeIds: string[];
    targetNodeId: string;
    targetHandleId?: string;
    targetAnchorRatio?: number;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    config: AiConfig;
    // 创建聚合节点时保留完整图结构；生成提交阶段再按模型能力截取参考素材。
    allowCapacityOverflow?: boolean;
};

export type BatchConnectionSkip = {
    nodeId: string;
    reason: string;
};

export type BatchConnectionPlan = {
    connected: string[];
    duplicates: string[];
    skipped: BatchConnectionSkip[];
    connections: CanvasConnection[];
};

export type BatchConnectionCreateRequest = {
    batchSourceNodeIds: string[];
    connection: ConnectionHandle;
    position: Position;
};

export function buildBatchConnectionCreateRequest(sourceNodeIds: string[], nodes: CanvasNodeData[], position: Position): BatchConnectionCreateRequest | null {
    const eligibleSourceNodeIds = Array.from(new Set(sourceNodeIds)).filter((nodeId) => {
        const node = nodes.find((item) => item.id === nodeId);
        return Boolean(node && !batchSourceRestriction(node));
    });
    const firstSourceNodeId = eligibleSourceNodeIds[0];
    if (!firstSourceNodeId) return null;
    return {
        batchSourceNodeIds: eligibleSourceNodeIds,
        connection: { nodeId: firstSourceNodeId, handleType: "source" },
        position,
    };
}

export function hasBatchConnectionCandidate(sourceNodeIds: string[], targetNodeId: string, nodes: CanvasNodeData[]) {
    return sourceNodeIds.some((sourceNodeId) => {
        const source = nodes.find((node) => node.id === sourceNodeId);
        return Boolean(source && !batchSourceRestriction(source) && normalizeConnection(source.id, targetNodeId, nodes, "source"));
    });
}

export function planBatchConnections({ sourceNodeIds, targetNodeId, targetHandleId, targetAnchorRatio, nodes, connections, config, allowCapacityOverflow = false }: BatchConnectionPlanOptions): BatchConnectionPlan {
    const connected: string[] = [];
    const duplicates: string[] = [];
    const skipped: BatchConnectionSkip[] = [];
    const nextConnections: CanvasConnection[] = [];
    const workingConnections = [...connections];
    const seenSourceIds = new Set<string>();

    sourceNodeIds.forEach((sourceNodeId) => {
        if (seenSourceIds.has(sourceNodeId)) return;
        seenSourceIds.add(sourceNodeId);

        const source = nodes.find((node) => node.id === sourceNodeId);
        if (!source) {
            skipped.push({ nodeId: sourceNodeId, reason: translate("shared.canvas.canvasBatchConnection.connectionSourceNodeNotFound") });
            return;
        }
        const sourceRestriction = batchSourceRestriction(source);
        if (sourceRestriction) {
            skipped.push({ nodeId: source.id, reason: sourceRestriction });
            return;
        }
        if (source.id === targetNodeId) {
            skipped.push({ nodeId: source.id, reason: translate("shared.canvas.canvasBatchConnection.theTargetNodeCannotConnectToItself") });
            return;
        }

        const normalized = normalizeConnection(source.id, targetNodeId, nodes, "source");
        if (!normalized) {
            skipped.push({ nodeId: source.id, reason: translate("shared.canvas.canvasBatchConnection.theseNodesCannotBeConnected") });
            return;
        }

        const fromHandleId = normalized.fromNodeId === source.id ? undefined : targetHandleId;
        const toHandleId = normalized.toNodeId === targetNodeId ? targetHandleId : undefined;
        const duplicate = workingConnections.some((connection) => connection.fromNodeId === normalized.fromNodeId && connection.toNodeId === normalized.toNodeId && connection.fromHandleId === fromHandleId && connection.toHandleId === toHandleId);
        if (duplicate) {
            duplicates.push(source.id);
            return;
        }

        const policyError = canvasConnectionError(config, nodes, workingConnections, normalized, { ignoreCapacity: allowCapacityOverflow });
        if (policyError) {
            skipped.push({ nodeId: source.id, reason: policyError });
            return;
        }

        const connection: CanvasConnection = {
            id: nanoid(),
            ...normalized,
            fromHandleId,
            toHandleId,
            fromAnchorRatio: normalized.fromNodeId === source.id ? 0.5 : targetAnchorRatio,
            toAnchorRatio: normalized.toNodeId === targetNodeId ? targetAnchorRatio : 0.5,
        };
        workingConnections.push(connection);
        nextConnections.push(connection);
        connected.push(source.id);
    });

    return { connected, duplicates, skipped, connections: nextConnections };
}

/** 批量连接落到参考格时的判定：一个参考格只放一张图片，其余沿用参考格自身的检查。 */
export function batchCellSourcesError(nodes: CanvasNodeData[], sourceNodeIds: string[], tableId: string, handleId?: string) {
    return sourceNodeIds.length !== 1 ? translate("shared.canvas.canvasBatchConnection.eachReferenceCellAcceptsOnlyOneImage") : batchCellConnectionError(nodes, sourceNodeIds[0], tableId, handleId);
}

const NO_BATCH_CONNECTION = translate("canvasPage.connection.noConnections");

/**
 * 批量连接落在连不上的节点上时说明原因。只有分镜脚本、批量创作表没对准端口的两句是新写的，
 * 其余沿用参考格判定和 planBatchConnections 的跳过原因。
 */
export function batchConnectionRejectReason({
    sourceNodeIds,
    target,
    nodes,
    connections,
    config,
}: {
    sourceNodeIds: string[];
    target: Pick<CanvasConnectionDropTarget, "handleId" | "rejectedNodeId">;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    config: AiConfig;
}) {
    const rejectedNodeId = target.rejectedNodeId;
    if (!rejectedNodeId) return NO_BATCH_CONNECTION;
    if (parseBatchCellHandle(target.handleId)) return batchCellSourcesError(nodes, sourceNodeIds, rejectedNodeId, target.handleId) || NO_BATCH_CONNECTION;
    const rejected = nodes.find((node) => node.id === rejectedNodeId);
    if (rejected?.type === CanvasNodeType.Script && !target.handleId) return translate("shared.canvas.canvasBatchConnection.pointToARowInTheStoryboardScript");
    if (rejected?.type === CanvasNodeType.BatchTable && !target.handleId) return translate("shared.canvas.canvasBatchConnection.pointToAReferenceImageConnectionOnTheLeftOf");
    const plan = planBatchConnections({ sourceNodeIds, targetNodeId: rejectedNodeId, targetHandleId: target.handleId, nodes, connections, config });
    return plan.skipped[0]?.reason || NO_BATCH_CONNECTION;
}

/**
 * 把当前选择展开成批量连接源：选中的背板用其内部素材代替，背板本身不能作连接源。
 * 保持选择顺序，背板子节点按画布顺序紧随其后，重复的节点只保留一次。
 */
export function expandBatchSourceNodeIds(selectedNodeIds: Iterable<string>, nodes: CanvasNodeData[]) {
    const result: string[] = [];
    const seen = new Set<string>();
    const push = (node: CanvasNodeData | undefined) => {
        if (!node || seen.has(node.id) || batchSourceRestriction(node)) return;
        seen.add(node.id);
        result.push(node.id);
    };
    for (const id of selectedNodeIds) {
        const node = nodes.find((item) => item.id === id);
        if (node?.type === CanvasNodeType.Frame) nodes.filter((item) => item.parentId === node.id).forEach(push);
        else push(node);
    }
    return result;
}

export function batchSourceRestriction(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Frame) return translate("shared.canvas.canvasBatchConnection.backdropsCannotBeConnectionSources");
    if (node.type === CanvasNodeType.Script) return translate("shared.canvas.canvasBatchConnection.connectStoryboardScriptsByRow");
    if (node.type === CanvasNodeType.Config) return translate("shared.canvas.canvasBatchConnection.generationSettingsCannotBeAnAggregateConnectionSource");
    return "";
}
