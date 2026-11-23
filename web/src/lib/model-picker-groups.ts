import { groupModelsByDisplayName, isDirectSystemModel, type DisplayModelGroup } from "@/lib/model-selection";
import { modelIcon, modelOptionName, PUBLIC_MODEL_CATALOG_ID, resolveModelChannel, type AiConfig } from "@/stores/use-config-store";
import { translate } from "@/i18n";

export type ModelPickerGroup = {
    key: string;
    label: string;
    icon: string;
    scope: "platform" | "personal" | "";
    kind: "product" | "channel";
    models: DisplayModelGroup[];
};

export { isDirectSystemModel } from "@/lib/model-selection";

export function modelPickerGroupScopeLabel(scope: ModelPickerGroup["scope"]) {
    return scope === "platform" ? translate("shared.modelPickerGroups.platformService") : scope === "personal" ? translate("shared.modelPickerGroups.myModels") : "";
}

export function modelChannelLabel(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(value));
    if (channel.scope === "system") return cost?.channelLabel?.trim() || modelOptionName(value);
    return cost?.channelLabel?.trim() || channel.name || translate("account.settings.channels.unnamed");
}

// 一级按已设置的模型展示名跨渠道聚合，空值归入未分类；二级保留独立调用与售价。
export function groupModelsForPicker(config: AiConfig, options: string[]): ModelPickerGroup[] {
    const groups = new Map<string, ModelPickerGroup>();
    for (const channel of config.channels) {
        const models = options.filter((value) => resolveModelChannel(config, value).id === channel.id);
        const directModels = models.filter((value) => isDirectSystemModel(config, value));
        for (const value of directModels) {
            const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(value));
            const label = cost?.displayName?.trim() || translate("account.settings.models.uncategorized");
            const key = JSON.stringify(["product", label]);
            let group = groups.get(key);
            if (!group) {
                group = { key, label, icon: modelIcon(config, value), scope: "platform", kind: "product", models: [] };
                groups.set(key, group);
            }
            group.models.push({ key: value, label: modelChannelLabel(config, value), models: [value] });
        }
        const otherModels = models.filter((value) => !isDirectSystemModel(config, value));
        if (otherModels.length) {
            const key = JSON.stringify(["channel", channel.id]);
            groups.set(key, {
                key,
                label: channel.scope === "system" ? translate("account.settings.models.systemModel") : channel.name || translate("account.settings.channels.unnamed"),
                icon: modelIcon(config, otherModels[0]),
                scope: channel.id === PUBLIC_MODEL_CATALOG_ID ? "" : "personal",
                kind: "channel",
                models: groupModelsByDisplayName(config, otherModels),
            });
        }
    }
    return Array.from(groups.values());
}
