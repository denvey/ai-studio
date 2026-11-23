import { Select } from "antd";
import { mediaTransportLabel, type ReferenceMediaTransport } from "@/lib/media-transport";
import { translate } from "@/i18n";

export function MediaTransportFields({ value = {}, onChange, channel }: { value?: ReferenceMediaTransport; onChange?: (value: ReferenceMediaTransport) => void; channel?: ReferenceMediaTransport }) {
    const model = channel !== undefined;
    return (
        <div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(
                    [
                        ["image", translate("library.tasks.params.referenceImages")],
                        ["audio", translate("library.tasks.params.referenceAudios")],
                        ["video", translate("library.tasks.params.referenceVideos")],
                    ] as const
                ).map(([kind, label]) => (
                    <label key={kind} className="flex flex-col gap-2">
                        <span>{label}</span>
                        <Select
                            aria-label={translate("admin.mediaTransportFields.transport", { v0: String(label) })}
                            value={value[kind] || (model ? "inherit" : "protocol")}
                            onChange={(mode) => onChange?.({ ...value, [kind]: mode })}
                            options={[...(model ? [{ value: "inherit", label: translate("admin.mediaTransportFields.useChannelSetting", { v0: String(mediaTransportLabel(channel?.[kind])) }) }] : []), { value: "protocol", label: translate("admin.mediaTransportFields.protocolDefault") }, { value: "url", label: "URL" }, { value: "base64", label: "Base64" }]}
                        />
                    </label>
                ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{translate("admin.mediaTransportFields.configureHowReferenceAssetsAreSentUpstreamThisDoesNot")}</p>
        </div>
    );
}
