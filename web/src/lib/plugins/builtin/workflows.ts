import { registerPlugin } from "../plugin-registry";
import { PLUGIN_API_VERSION, type PluginManifest, type RegisteredPlugin } from "../plugin-types";
import { translate } from "@/i18n";


export const RUNNINGHUB_PLUGIN_ID = "runninghub-workflow-provider";

export type WorkflowProvider = "runninghub";

export function workflowPluginId(provider: WorkflowProvider) {
	return RUNNINGHUB_PLUGIN_ID;
}

export function workflowProviderPluginEnabled(statuses: Record<string, string>, provider: WorkflowProvider) {
    return statuses[workflowPluginId(provider)] === "enabled";
}

function workflowContributions(providerId: string, label: string) {
    return (["image", "video", "audio"] as const).map((capability) => ({
        id: `${providerId}-${capability}`,
        label: `${label} · ${{ image: translate("account.feedback.image"), video: translate("account.feedback.video"), audio: translate("account.settings.modelConfig.capabilities.audio") }[capability]}`,
        providerId,
        capability,
        parameters: [],
    }));
}

const runningHubManifest: PluginManifest = {
        id: RUNNINGHUB_PLUGIN_ID,
        name: translate("settings.sections.runninghub.label"),
        version: "1.0.0",
        publishedAt: "2026-08-25",
        updatedAt: "2026-08-25",
        apiVersion: PLUGIN_API_VERSION,
        description: translate("shared.plugins.builtin.workflows.loadAndRunRunningHubWorkflowsAndAppsOnTheCanvas"),
        documentation:
            translate("shared.plugins.builtin.workflows.runningHubWorkflowsThisPluginConnectsRunningHubWorkflowsAndAppsTo"),
        author: translate("library.tasks.model.internalAgent"),
        surfaces: ["node", "settings"],
        permissions: ["generation.run", "external.open"],
        trusted: true,
        runtime: { backend: "trusted-backend", web: "trusted-backend" },
        contributes: { workflows: workflowContributions(RUNNINGHUB_PLUGIN_ID, "RunningHub") },
};

registerPlugin({ manifest: runningHubManifest } satisfies RegisteredPlugin);
