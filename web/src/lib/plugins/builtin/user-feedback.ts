import { registerPlugin } from "../plugin-registry";
import { PLUGIN_API_VERSION, type RegisteredPlugin } from "../plugin-types";
import { usePluginStore } from "@/stores/use-plugin-store";
import { translate } from "@/i18n";

export const USER_FEEDBACK_PLUGIN_ID = "user-feedback";

export const userFeedbackPlugin: RegisteredPlugin = {
    manifest: {
        id: USER_FEEDBACK_PLUGIN_ID,
        name: translate("account.feedback.buttonLabel"),
        version: "1.0.0",
        publishedAt: "2026-10-20",
        updatedAt: "2026-10-20",
        apiVersion: PLUGIN_API_VERSION,
        description: translate("shared.plugins.builtin.userFeedback.addsAFeedbackButtonAtTheBottomRightOfThe"),
        author: translate("shared.plugins.builtin.userFeedback.yingceCommunity"),
        surfaces: ["hybrid"],
        permissions: ["canvas.read"],
        trusted: true,
        contributes: { usageObservers: ["user-feedback"] },
    },
};

registerPlugin(userFeedbackPlugin);

export function useUserFeedbackEnabled(): boolean {
    return usePluginStore((state) => {
        const pluginState = state.pluginStates[USER_FEEDBACK_PLUGIN_ID];
        if (pluginState && typeof pluginState.effectiveEnabled === "boolean") {
            return pluginState.effectiveEnabled;
        }
        const installation = state.installations.find((item) => item.manifest.id === USER_FEEDBACK_PLUGIN_ID);
        if (installation && typeof installation.enabled === "boolean") {
            return installation.enabled;
        }
        return true;
    });
}
