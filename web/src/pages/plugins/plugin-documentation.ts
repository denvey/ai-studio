import type { PluginManifest, PluginManifestV2 } from "@/lib/plugins/plugin-types";
import { ART_CRITIQUE_PLUGIN_ID } from "@/lib/art-critique/contracts";
import { translate } from "@/i18n";

const permissionLabels: Record<string, string> = {
    "canvas.read": translate("shared.plugins.readCanvas"),
    "canvas.write": translate("shared.plugins.editCanvas"),
    "asset.read": translate("shared.plugins.readingAssets"),
    "asset.search": translate("library.picker.search"),
    "asset.import": translate("shared.plugins.importAssets"),
    "asset.upload": translate("shared.plugins.uploadAssets"),
    "generation.run": translate("shared.plugins.runGeneration"),
    "ai.text": translate("shared.plugins.callConfiguredTextVisionModels"),
    "external.open": translate("shared.plugins.openExternalDetails"),
};

export function pluginPermissionLabel(permission: string) {
    return permissionLabels[permission] || permission;
}

export function pluginDisplayDescription(manifest: PluginManifest | PluginManifestV2) {
    return manifest.id === ART_CRITIQUE_PLUGIN_ID ? translate("shared.plugins.builtin.aiArtCritique.displayDescription") : manifest.description;
}

export function getPluginDocumentation(manifest: PluginManifest | PluginManifestV2) {
    if (manifest.documentation?.trim()) return manifest.documentation.trim();

    const capabilities = manifest.permissions.map(pluginPermissionLabel);
    return [
        `# ${manifest.name}`,
        "",
        pluginDisplayDescription(manifest) || translate("shared.plugins.pluginDocumentation.thisPluginHasNoDescription"),
        "",
        translate("shared.plugins.pluginDocumentation.pluginInformation"),
        "",
        translate("shared.plugins.pluginDocumentation.author", { v0: String(manifest.author || translate("shared.plugins.pluginDocumentation.notSpecified")) }),
        translate("shared.plugins.pluginDocumentation.version", { v0: String(manifest.version) }),
        translate("shared.plugins.pluginDocumentation.capabilities", { v0: String(capabilities.join("、") || translate("shared.plugins.pluginDocumentation.notSpecified")) }),
        "",
        manifest.contributes.providers?.length ? translate("shared.plugins.pluginDocumentation.thisPluginHasNoIntegrationDocumentationAskTheAuthorTo") : translate("shared.plugins.pluginDocumentation.thisPluginCurrentlyHasNoSeparateUsageDocumentation"),
    ].join("\n");
}
