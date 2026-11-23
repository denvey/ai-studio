import { applyCanvasConnectionPromptSync, buildCanvasNodeMentionReferenceMap, buildCanvasResourceReferences } from "./canvas-resource-references";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { translate } from "@/i18n";


export function connectCanvasTextMention(nodes: CanvasNodeData[], connections: CanvasConnection[], targetId: string, sourceId: string, connectionId: string) {
    const target = nodes.find((node) => node.id === targetId);
    const source = buildCanvasResourceReferences(nodes, connections).find((reference) => reference.nodeId === sourceId && reference.kind === "text");
    if (!target || !source || sourceId === targetId || target.metadata?.locked) throw new Error(translate("shared.canvas.canvasTextMention.unableToReferenceThisTextNode"));
    const configId = connections.find((edge) => edge.fromNodeId === targetId && nodes.find((node) => node.id === edge.toNodeId)?.type === CanvasNodeType.Config)?.toNodeId;
    const configReferences = configId ? buildCanvasNodeMentionReferenceMap(nodes, connections).get(configId) : [];
    const receiverId = configReferences?.some((reference) => reference.nodeId !== targetId) ? configId! : targetId;
    if (nodes.find((node) => node.id === receiverId)?.metadata?.locked) throw new Error(translate("shared.canvas.canvasTextMention.referencesOnALockedNodeCannotBeChanged"));
    const pending = [receiverId];
    const visited = new Set<string>();
    while (pending.length) {
        const id = pending.pop()!;
        if (id === sourceId) throw new Error(translate("shared.canvas.canvasTextMention.thisReferenceWouldCreateAConnectionCycle"));
        if (visited.has(id)) continue;
        visited.add(id);
        pending.push(...connections.filter((edge) => edge.fromNodeId === id).map((edge) => edge.toNodeId));
    }
    const nextConnections = connections.some((edge) => edge.fromNodeId === sourceId && edge.toNodeId === receiverId) ? connections : [...connections, { id: connectionId, fromNodeId: sourceId, toNodeId: receiverId }];
    const nextNodes = applyCanvasConnectionPromptSync(nodes, connections, nodes, nextConnections);
    const reference = buildCanvasNodeMentionReferenceMap(nextNodes, nextConnections).get(targetId)?.find((item) => item.nodeId === sourceId);
    if (!reference) throw new Error(translate("shared.canvas.canvasTextMention.textReferenceWasNotCreated"));
    return { nodes: nextNodes, connections: nextConnections, reference };
}
