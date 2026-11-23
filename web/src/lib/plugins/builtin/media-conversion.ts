import { MEDIA_CONVERSION_NODE_TYPE } from "@/lib/media-conversion/contracts";

import { registerPlugin } from "../plugin-registry";
import { PLUGIN_API_VERSION, type PluginManifest, type RegisteredPlugin } from "../plugin-types";
import { translate } from "@/i18n";

export const MEDIA_CONVERSION_PLUGIN_ID = "media-conversion";

const manifest: PluginManifest = {
    apiVersion: PLUGIN_API_VERSION,
    id: MEDIA_CONVERSION_PLUGIN_ID,
    name: translate("shared.plugins.builtin.mediaConversion.mediaConversionNode"),
    version: "0.1.0",
    publishedAt: "2026-09-08",
    updatedAt: "2026-09-08",
    description: translate("shared.plugins.builtin.mediaConversion.addsAnImageConversionNodeSupportingGrayscaleCannyEdgesAI"),
    documentation: translate("shared.plugins.builtin.mediaConversion.mediaConversionNodeConnectAnImageToAConversionNode"),
    author: translate("shared.plugins.builtin.mediaConversion.yingceTeam"),
    surfaces: ["node"],
    permissions: ["canvas.read", "canvas.write", "media.read"],
    trusted: true,
    runtime: { web: "declarative" },
    contributes: {
        transforms: [
            {
                id: MEDIA_CONVERSION_NODE_TYPE,
                input: "media",
                output: "media",
                runtime: "declarative",
            },
        ],
    },
};

export const mediaConversionPlugin: RegisteredPlugin = { manifest };

registerPlugin(mediaConversionPlugin);
