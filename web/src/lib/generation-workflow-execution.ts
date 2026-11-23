import { normalizeRunningHubCapability, type AiConfig, type RunningHubCapability, type RunningHubWorkflowKind, type WorkflowFieldMapping } from "@/stores/use-config-store";
import { workflowProviderPluginEnabled } from "@/lib/plugins/builtin/workflows";
import { usePluginStore } from "@/stores/use-plugin-store";
import { translate } from "@/i18n";


export type GenerationWorkflowMode = "text" | "image" | "video" | "audio";

export type GenerationWorkflowExecution = {
	provider: "runninghub";
    kind: RunningHubWorkflowKind;
    capability: RunningHubCapability;
    interfaceType: string;
    name: string;
    taskModel: string;
    providerModel: string;
    workflowId: string;
    webappId: string;
    workflowJson: Record<string, unknown>;
    workflowFields: WorkflowFieldMapping[];
};

// 画布样式计划、任务记录和后端协议必须共用同一个工作流选择结果，避免再次回退到普通模型。
export function resolveGenerationWorkflowExecution(config: AiConfig, mode: GenerationWorkflowMode): GenerationWorkflowExecution | null {
    const workflowProvider = mode === "text" ? "model" : config.taskWorkflowProvider || "model";
    if (workflowProvider === "model") return null;

    if (workflowProvider === "runninghub") {
        if (!workflowProviderPluginEnabled(usePluginStore.getState().runtimeStatuses, "runninghub")) throw new Error(translate("shared.generationWorkflowExecution.theRunningHubWorkflowPluginIsNotEnabled"));
        const runningHub = config.runningHub;
        const workflowId = runningHub.workflowId.trim();
        const kind = runningHub.selectedKind === "app" ? "app" : "workflow";
        // RunningHub 工作流的参数拉取、提交和轮询固定使用积分 API Key；企业级 Key 只用于素材上传。
        const apiKey = runningHub.apiKey;
        if (!runningHub.enabled || !runningHub.baseUrl.trim() || !apiKey.trim() || !workflowId) {
            throw new Error(translate("shared.generationWorkflowExecution.runningHubWorkflowConfigurationIsIncompleteEnterACreditsAPIKey"));
        }
        const workflow = runningHub.workflows.find((item) => item.workflowId.trim() === workflowId && (item.kind === "app" ? "app" : "workflow") === kind);
        if (!workflow) throw new Error(translate("shared.generationWorkflowExecution.theCurrentRunningHubWorkflowEntryDoesNotExistSelectA"));
        const capability = normalizeRunningHubCapability(workflow.capability, normalizeRunningHubCapability(runningHub.capability));
        assertWorkflowCapability("RunningHub", capability, mode);
        const webappId = kind === "app" ? (workflow.webappId || workflow.workflowId).trim() : "";
        const name = workflow.title?.trim() || webappId || workflowId;
        return {
            provider: "runninghub",
            kind,
            capability,
            interfaceType: `runninghub-workflow-${capability}`,
            name,
            taskModel: workflowTaskModel("RunningHub · ", name),
            providerModel: workflowId,
            workflowId: kind === "workflow" ? workflowId : "",
            webappId,
            workflowJson: workflow.workflowJson || {},
            workflowFields: workflow.fields || [],

		};
	}

	throw new Error(translate("shared.generationWorkflowExecution.unknownWorkflowProvider"));
}

function assertWorkflowCapability(providerName: string, capability: RunningHubCapability, mode: GenerationWorkflowMode) {
    if (capability === mode) return;
    const capabilityName = workflowCapabilityName(capability);
    const modeName = workflowCapabilityName(mode);
    throw new Error(translate("shared.generationWorkflowExecution.theSavedEntryIsForButThisNodeGeneratesSelect", { v0: String(providerName), v1: String(capabilityName), v2: String(modeName) }));
}

function workflowCapabilityName(value: GenerationWorkflowMode) {
    if (value === "video") return translate("account.feedback.video");
    if (value === "audio") return translate("account.settings.modelConfig.capabilities.audio");
    if (value === "text") return translate("account.settings.modelConfig.capabilities.text");
    return translate("account.feedback.image");
}

function workflowTaskModel(prefix: string, name: string) {
    return `${prefix}${Array.from(name)
        .slice(0, Math.max(0, 120 - prefix.length))
        .join("")}`;
}
