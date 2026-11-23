import { ChoiceBrowser } from "./choice-browser";
import type { ModelProtocolDefinition, ProtocolCapability } from "@/lib/model-protocols";
import { translate } from "@/i18n";


export function ModelProtocolBrowser({
    capability,
    protocols,
    ...props
}: {
    capability?: ProtocolCapability;
    protocols: ModelProtocolDefinition[];
    value?: string;
    onChange?: (value: string) => void;
    loading?: boolean;
    error?: string;
    disabled?: boolean;
    id?: string;
}) {
    const options = protocols
        .filter((protocol) => (!capability || protocol.capability === capability) && protocol.enabled !== false)
        .map((protocol) => ({
            value: protocol.value,
            label: protocol.label,
            subtitle: protocol.create,
            vendor: protocol.vendor,
            searchText: protocol.value,
            details: [
                { label: translate("shared.modelProtocolBrowser.request"), value: <code>{protocol.create}</code> },
                { label: translate("shared.modelProtocolBrowser.requestBody"), value: protocol.contentType },
                { label: translate("shared.modelProtocolBrowser.response"), value: protocol.poll ? translate("shared.plugins.asyncPolling") : translate("shared.modelProtocolPicker.synchronousResponse") },
                { label: translate("canvasA.assetView.origin"), value: protocol.media },
                ...(protocol.imageParameters ? [{ label: translate("shared.modelProtocolBrowser.imageParameters"), value: protocol.imageParameters.map((p) => p.label).join("、") }] : []),
            ],
        }));

    return <ChoiceBrowser key={capability || "all"} {...props} label={translate("shared.modelProtocolBrowser.aPIProtocol")} placeholder={translate("shared.modelProtocolBrowser.searchProtocolNameProviderOrRequestPath")} options={options} />;
}
