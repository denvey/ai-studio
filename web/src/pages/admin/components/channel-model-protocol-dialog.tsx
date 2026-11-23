import { useState } from "react";
import { Alert, App } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import { ModelProtocolBrowser } from "@/components/model-protocol-browser";
import type { ModelProtocolDefinition, ProtocolCapability } from "@/lib/model-protocols";
import { updateAdminAllChannelModelsProtocol, updateAdminChannelModelsProtocol, type ChannelModel } from "@/services/api/wallet";
import { translate } from "@/i18n";

/** 批量切换所选模型的调用协议；协议只能在同一能力内切换，能力配置与价格档由后端按新协议校验。
 * 不传 channelId 时为跨渠道切换，所选模型可来自不同系统渠道。 */
export function ChannelModelProtocolDialog({
    channelId,
    items,
    protocols,
    protocolLoading,
    protocolError,
    onClose,
    onSaved,
}: {
    channelId?: string;
    items: ChannelModel[];
    protocols: ModelProtocolDefinition[];
    protocolLoading: boolean;
    protocolError: string;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const { message } = App.useApp();
    const capabilities = Array.from(new Set(items.map((item) => item.capability)));
    const capability = capabilities.length === 1 && capabilities[0] ? (capabilities[0] as ProtocolCapability) : undefined;
    const [protocol, setProtocol] = useState<string | undefined>(() => {
        const current = Array.from(new Set(items.map((item) => item.protocol)));
        return current.length === 1 ? current[0] : undefined;
    });
    const [saving, setSaving] = useState(false);
    const unchanged = items.every((item) => item.protocol === protocol);

    const save = async () => {
        if (!protocol || !capability || unchanged || saving) return;
        setSaving(true);
        try {
            const ids = items.map((item) => item.id);
            const result = channelId ? await updateAdminChannelModelsProtocol(channelId, ids, protocol) : await updateAdminAllChannelModelsProtocol(ids, protocol);
            message.success(translate("admin.channelModelProtocolDialog.updatedRequestProtocolsForModels", { v0: String(result.updated) }));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : translate("admin.channelModelProtocolDialog.failedToChangeProtocolsInBulk"));
            setSaving(false);
            return;
        }
        try {
            await onSaved();
        } catch {
            message.warning(translate("admin.channelModelProtocolDialog.protocolsSavedButTheListCouldNotBeRefreshedRefresh"));
        } finally {
            setSaving(false);
            onClose();
        }
    };

    return (
        <AdminModal
            title={translate("admin.channelModelProtocolDialog.changeRequestProtocolModels", { v0: String(items.length) })}
            open
            centered
            width={760}
            onCancel={onClose}
            closable={!saving}
            mask={{ closable: !saving }}
            keyboard={!saving}
            confirmLoading={saving}
            cancelButtonProps={{ disabled: saving }}
            okButtonProps={{ disabled: !capability || !protocol || unchanged || protocolLoading || Boolean(protocolError) }}
            okText={translate("admin.channelModelProtocolDialog.saveProtocol")}
            onOk={() => void save()}
        >
            {capability ? (
                <div className="flex flex-col gap-3">
                    <ModelProtocolBrowser capability={capability} protocols={protocols} loading={protocolLoading} error={protocolError} disabled={saving} value={protocol} onChange={setProtocol} />
                    <Alert
                        type="info"
                        showIcon
                        title={translate("admin.channelModelProtocolDialog.capabilityParametersAndPriceTiersKeepTheirCurrentValuesRather")}
                    />
                </div>
            ) : (
                <Alert type="warning" showIcon title={translate("admin.channelModelProtocolDialog.theSelectedModelsHaveDifferentOrUnconfiguredCapabilitiesProtocolsCan")} />
            )}
        </AdminModal>
    );
}
