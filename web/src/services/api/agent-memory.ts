import { http, compactApiParams } from "./request";
import { translate } from "@/i18n";


/** 长期记忆文件：每个用户一份，分「关于用户」和「工作笔记」，Agent 自己维护，每次修改可撤销。 */
export type AgentMemorySection = "user" | "notes";

export type AgentMemoryMode = "auto" | "review" | "off";

export type AgentMemoryEntry = {
    id: string;
    section: AgentMemorySection;
    text: string;
    source?: string;
    originRunId?: string;
    createdAt: string;
    updatedAt: string;
};

export type AgentMemoryDocument = {
    mode: AgentMemoryMode;
    capacity: number;
    charCount: number;
    revision: number;
    entries: AgentMemoryEntry[];
    pendingCount: number;
    updatedAt: string;
};

export type AgentMemoryDocChange = {
    kind: "add" | "replace" | "remove";
    id: string;
    section: AgentMemorySection;
    before?: string;
    after?: string;
};

export type AgentMemoryDocRevision = {
    id: string;
    actor: "agent" | "user" | "restore" | "seed" | string;
    runId?: string;
    status: "applied" | "pending" | "rejected";
    summary: string;
    baseRevision: number;
    revision: number;
    changes: AgentMemoryDocChange[];
    canUndo: boolean;
    createdAt: string;
    decidedAt?: string;
    restoredAt?: string;
};

export type AgentMemoryEntryInput = { id?: string; section: AgentMemorySection; text: string };

export const AGENT_MEMORY_SECTIONS: Array<{ key: AgentMemorySection; label: string; hint: string }> = [
    { key: "user", label: translate("canvasA.memoryCard.sectionUser"), hint: translate("shared.api.agentMemory.namePreferencesHabitsAndCommonSettings") },
    { key: "notes", label: translate("canvasA.memoryCard.sectionNotes"), hint: translate("shared.api.agentMemory.provenMethodsLessonsLearnedAndProjectConventions") },
];

export const AGENT_MEMORY_MODES: Array<{ value: AgentMemoryMode; label: string; description: string }> = [
    { value: "auto", label: translate("shared.api.agentMemory.applyAutomatically"), description: translate("shared.api.agentMemory.agentMemoriesTakeEffectImmediatelyAndCanBeUndoneAnytime") },
    { value: "review", label: translate("shared.api.agentMemory.requireMyConfirmation"), description: translate("shared.api.agentMemory.agentChangesWaitForYourConfirmation") },
    { value: "off", label: translate("common.close"), description: translate("shared.api.agentMemory.doNotUseOrModifyMemoryExistingContentIsPreserved") },
];

export function getAgentMemory(signal?: AbortSignal) {
    return http.get<AgentMemoryDocument>("/agent/memory", { signal, timeout: 15_000 });
}

export function saveAgentMemory(revision: number, entries: AgentMemoryEntryInput[]) {
    return http.put<AgentMemoryDocument>("/agent/memory", { revision, entries }, { timeout: 15_000 });
}

export function updateAgentMemoryMode(mode: AgentMemoryMode) {
    return http.patch<AgentMemoryDocument>("/agent/memory/settings", { mode }, { timeout: 15_000 });
}

export function listAgentMemoryRevisions(status?: AgentMemoryDocRevision["status"], limit = 50, signal?: AbortSignal) {
    return http.get<{ revisions: AgentMemoryDocRevision[] }>("/agent/memory/revisions", {
        params: compactApiParams({ status, limit }),
        signal,
        timeout: 15_000,
    });
}

export function undoAgentMemoryRevision(id: string) {
    return http.post<AgentMemoryDocument>(`/agent/memory/revisions/${encodeURIComponent(id)}/undo`, {}, { timeout: 15_000 });
}

export function decideAgentMemoryRevision(id: string, decision: "approve" | "reject") {
    return http.post<AgentMemoryDocument>(`/agent/memory/revisions/${encodeURIComponent(id)}/decide`, { decision }, { timeout: 15_000 });
}
