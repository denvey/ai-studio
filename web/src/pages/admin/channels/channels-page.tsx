import { App, Button, Form, Input, InputNumber, Segmented, Spin, Switch } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import { ChevronRight, Copy, Download, Pencil, Plus, Power, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { AdminSearchInput } from "../components/admin-search-input";

import { ChannelHeadersEditor, validateChannelHeaders } from "@/components/channel-headers-editor";
import { refreshSystemChannels } from "@/lib/user-session";
import { createAdminChannel, deleteAdminChannel, duplicateAdminChannel, exportAdminChannels, importAdminChannels, listAdminChannels, updateAdminChannel, type SystemChannelExport } from "@/services/api/auth";
import { type ChannelHeader, type ModelChannel } from "@/stores/use-config-store";
import { useAdminContext } from "../admin-context";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminRowActions, AdminStatusBadge, AdminTableEmpty, configuredSecretText } from "../components/admin-ui";
import { MediaTransportFields } from "../components/media-transport-fields";
import { ChannelModelManager } from "../components/channel-model-manager";
import { formatRate, healthTone, useChannelModelHealth } from "../components/channel-model-health";
import { AllChannelModelsPanel } from "./all-channel-models-panel";
import { ChannelOrderDialog } from "../components/channel-order-dialog";
import { selectChannelWorkspace } from "./channel-workspace-state";
import { ProviderCatalogWizard } from "./provider-catalog-wizard";
import "./channels-page.css";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

type ChannelFormValues = {
    mediaTransport?: ModelChannel["mediaTransport"];
    name: string;
    baseUrl: string;
    apiKey?: string;
    secretKey?: string;
    headers?: ChannelHeader[];
    useGlobalConcurrency?: boolean;
    concurrencyLimit?: number;
    enabled?: boolean;
    proxyUrl?: string;
};

export function adminChannelSavePayload(values: ChannelFormValues) {
    return {
        name: values.name.trim(),
        mediaTransport: values.mediaTransport || {},
        baseUrl: values.baseUrl.trim(),
        apiKey: values.apiKey?.trim() || "",
        secretKey: values.secretKey?.trim() || "",
        headers: values.headers || [],
        useGlobalConcurrency: values.useGlobalConcurrency !== false,
        concurrencyLimit: values.useGlobalConcurrency === false ? values.concurrencyLimit : undefined,
        enabled: values.enabled !== false,
        proxyUrl: values.proxyUrl?.trim() || "",
    };
}

export default function ChannelsPage() {
    const { message, modal } = App.useApp();
    const { reloadReferences } = useAdminContext();
    const [searchParams, setSearchParams] = useSearchParams();
    const keyword = searchParams.get("filter") || "";
    const status = normalizeStatus(searchParams.get("status"));
    const selectedChannelId = searchParams.get("channel");
    const view = searchParams.get("view") === "models" ? "models" : "channels";
    const { health, loading: healthLoading, reload: reloadHealth } = useChannelModelHealth();
    // 渠道级 24 小时成功率：按渠道汇总各模型的生成请求，用于左侧列表快速发现异常渠道。
    const channelHealth = new Map<string, { requests: number; succeeded: number }>();
    health.forEach((item) => {
        const current = channelHealth.get(item.channelId) || { requests: 0, succeeded: 0 };
        channelHealth.set(item.channelId, { requests: current.requests + item.requests24h, succeeded: current.succeeded + item.succeeded24h });
    });
    const [channels, setChannels] = useState<ModelChannel[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<ModelChannel | null>(null);
    const [saving, setSaving] = useState(false);
    const [duplicatingChannelId, setDuplicatingChannelId] = useState<string | null>(null);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [transferring, setTransferring] = useState(false);
    const importInputRef = useRef<HTMLInputElement>(null);
    const requestSequence = useRef(0);
    const [form] = Form.useForm<ChannelFormValues>();
    const useGlobalConcurrency = Form.useWatch("useGlobalConcurrency", form) !== false;
    const hasFilters = Boolean(keyword || status !== "all");
    const { visibleChannels, selectedChannel } = selectChannelWorkspace(channels, keyword, status, selectedChannelId);

    const updateUrl = (patch: Record<string, string | number>, replace = false) => {
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.delete("page");
                next.delete("pageSize");
                Object.entries(patch).forEach(([key, value]) => {
                    if (value === "" || (key === "status" && value === "all")) next.delete(key);
                    else next.set(key, String(value));
                });
                return next;
            },
            { replace },
        );
    };

    const reload = async () => {
        const sequence = ++requestSequence.current;
        setLoading(true);
        setLoadError("");
        try {
            // The navigation needs every channel, not just the API's default first 20.
            const result = await listAdminChannels({ page: 1, pageSize: 100 });
            const nextChannels = [...result.channels];
            for (let page = 2; nextChannels.length < result.total; page += 1) {
                if (sequence !== requestSequence.current) return;
                const next = await listAdminChannels({ page, pageSize: 100 });
                if (!next.channels.length) throw new Error(translate("admin.channels.channelsPage.theChannelListHasChangedReloadToContinue"));
                nextChannels.push(...next.channels);
            }
            if (sequence !== requestSequence.current) return;
            setChannels(Array.from(new Map(nextChannels.map((channel) => [channel.id, channel])).values()));
        } catch (error) {
            if (sequence === requestSequence.current) setLoadError(error instanceof Error ? error.message : translate("admin.channels.channelsPage.failedToLoadChannels"));
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    };

    useEffect(() => {
        void reload();
        return () => {
            requestSequence.current += 1;
        };
    }, []);

    const syncChannels = async () => {
        void reloadHealth();
        await reloadReferences();
        try {
            await refreshSystemChannels();
        } catch (error) {
            message.warning(
                error instanceof Error ? translate("admin.channels.channelsPage.savedOnTheServerButSyncingTheSettingsFailed", { v0: String(error.message) }) : translate("admin.channels.channelsPage.savedOnTheServerButSyncingTheSettingsFailedReopen"),
            );
        }
    };

    const openDrawer = (channel?: ModelChannel) => {
        setEditingChannel(channel || null);
        form.resetFields();
        form.setFieldsValue(
            channel
                ? {
                      name: channel.name,
                      mediaTransport: channel.mediaTransport || {},
                      baseUrl: channel.baseUrl,
                      apiKey: "",
                      secretKey: "",
                      headers: channel.headers || [],
                      useGlobalConcurrency: !channel.concurrencyLimit,
                      concurrencyLimit: channel.concurrencyLimit || undefined,
                      enabled: channel.enabled !== false,
                      proxyUrl: channel.proxyUrl || "",
                  }
                : { name: "", baseUrl: "", apiKey: "", secretKey: "", headers: [], useGlobalConcurrency: true, concurrencyLimit: undefined, enabled: true, proxyUrl: "" },
        );
        setDrawerOpen(true);
    };

    const closeDrawer = () => {
        if (saving) return;
        if (!form.isFieldsTouched()) {
            setDrawerOpen(false);
            return;
        }
        modal.confirm({
            title: translate("admin.channels.channelsPage.discardChannelChanges"),
            content: translate("admin.channels.channelsPage.unsavedConnectionDetailsWillBeLost"),
            okText: translate("admin.channels.channelsPage.discardChanges"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => setDrawerOpen(false),
        });
    };

    const save = async () => {
        const values = await form.validateFields();
        const headerError = validateChannelHeaders(values.headers);
        if (headerError) {
            message.error(headerError);
            return;
        }
        if (!editingChannel && !values.apiKey?.trim()) {
            message.error(translate("admin.channels.channelsPage.enterAnAPIKeyOrAccessKey"));
            return;
        }
        setSaving(true);
        try {
            const payload = adminChannelSavePayload(values);
            const { channel } = await (editingChannel ? updateAdminChannel(editingChannel.id, payload) : createAdminChannel(payload));
            setChannels((current) => (editingChannel ? current.map((item) => (item.id === channel.id ? channel : item)) : [...current, channel]));
            updateUrl({ channel: channel.id, filter: "", status: "all" }, true);
            await syncChannels();
            setDrawerOpen(false);
            form.resetFields();
            await reload();
            message.success(editingChannel ? translate("admin.channels.channelsPage.systemChannelUpdated") : translate("admin.channels.channelsPage.systemChannelCreated"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channels.channelsPage.failedToSaveSystemChannel"));
        } finally {
            setSaving(false);
        }
    };

    const toggleChannel = async (channel: ModelChannel) => {
        try {
            await updateAdminChannel(channel.id, { enabled: channel.enabled === false });
            await syncChannels();
            await reload();
            message.success(channel.enabled === false ? translate("admin.channels.channelsPage.systemChannelEnabled") : translate("admin.channels.channelsPage.systemChannelDisabled"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channels.channelsPage.failedToUpdateSystemChannel"));
        }
    };

    const duplicateChannel = async (channel: ModelChannel) => {
        setDuplicatingChannelId(channel.id);
        try {
            const { channel: duplicated } = await duplicateAdminChannel(channel.id);
            setChannels((current) => [...current, duplicated]);
            updateUrl({ channel: duplicated.id, filter: "", status: "all" }, true);
            await syncChannels();
            await reload();
            message.success(translate("admin.channels.channelsPage.systemChannelCopied"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channels.channelsPage.failedToDuplicateTheSystemChannel"));
        } finally {
            setDuplicatingChannelId(null);
        }
    };

    // 导出文件不含任何密钥；ids 为空时导出全部系统渠道。
    const exportChannels = async (target?: ModelChannel) => {
        setTransferring(true);
        try {
            const exported = await exportAdminChannels(target ? [target.id] : []);
            const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const stamp = new Date().toISOString().slice(0, 10);
            link.href = url;
            link.download = target ? `system-channel-${target.name}-${stamp}.json` : `system-channels-${stamp}.json`;
            link.click();
            URL.revokeObjectURL(url);
            message.success(translate("admin.channels.channelsPage.exportedChannelsSecretsExcluded", { v0: String(exported.channels.length) }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channels.channelsPage.failedToExportSystemChannels"));
        } finally {
            setTransferring(false);
        }
    };

    const importChannels = async (file: File) => {
        let payload: SystemChannelExport;
        try {
            payload = JSON.parse(await file.text()) as SystemChannelExport;
        } catch {
            message.error(translate("admin.channels.channelsPage.theImportFileIsNotValidJSON"));
            return;
        }
        if (payload?.format !== "yingce.system-channels" || !Array.isArray(payload.channels)) {
            message.error(translate("admin.channels.channelsPage.thisIsNotASystemChannelExportFile"));
            return;
        }
        const names = payload.channels.map((item) => item.name).filter(Boolean);
        modal.confirm({
            title: translate("admin.channels.channelsPage.importSystemChannels", { v0: String(names.length) }),
            content: (
                <div className="space-y-2 text-sm">
                    <p>
                        {names.slice(0, 8).join("、")}
                        {names.length > 8 ? translate("admin.channels.channelsPage.andOthers", { v0: String(names.length) }) : ""}
                    </p>
                    <p className="text-foreground/60">{translate("admin.channels.channelsPage.mergeByChannelNameExistingChannelsKeepTheirSecretsAnd")}</p>
                </div>
            ),
            okText: translate("admin.channels.channelsPage.startImport"),
            onOk: async () => {
                setTransferring(true);
                try {
                    const result = await importAdminChannels(payload);
                    await syncChannels();
                    await reload();
                    const summary = translate("admin.channels.channelsPage.createdChannelsUpdatedChannelsAndSavedModels", { v0: String(result.createdChannels.length), v1: String(result.updatedChannels.length), v2: String(result.savedModels) });
                    if (result.errors.length) {
                        modal.warning({
                            title: translate("admin.channels.channelsPage.importCompletedWithSomeFailures"),
                            width: 640,
                            content: (
                                <div className="space-y-2 text-sm">
                                    <p>{summary}</p>
                                    <ul className="max-h-64 list-disc space-y-1 overflow-auto pl-5 text-destructive">
                                        {result.errors.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            ),
                        });
                    } else {
                        message.success(result.createdChannels.length ? translate("admin.channels.channelsPage.enterAPIKeysBeforeEnablingNewChannels", { v0: String(summary) }) : summary);
                    }
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("admin.channels.channelsPage.failedToImportSystemChannels"));
                } finally {
                    setTransferring(false);
                }
            },
        });
    };

    const removeChannel = async (channel: ModelChannel) => {
        try {
            await deleteAdminChannel(channel.id);
            await syncChannels();
            await reload();
            message.success(translate("admin.channels.channelsPage.systemChannelDeleted"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channels.channelsPage.failedToDeleteSystemChannel"));
        }
    };

    // 渠道操作全部外露：编辑、复制、导出、启停、删除，危险操作仍二次确认。
    const channelActions = (channel: ModelChannel) => (
        <AdminRowActions
            primary={{ label: translate("account.settings.channels.edit"), icon: <Pencil className="size-3.5" />, onClick: () => openDrawer(channel) }}
            visibleActionCount={4}
            actions={[
                { key: "duplicate", label: translate("canvasB.common.copy"), icon: <Copy className="size-3.5" />, disabled: Boolean(duplicatingChannelId), onClick: () => duplicateChannel(channel) },
                { key: "export", label: translate("admin.channels.channelsPage.export"), icon: <Download className="size-3.5" />, disabled: transferring, onClick: () => exportChannels(channel) },
                {
                    key: "toggle",
                    label: channel.enabled !== false ? translate("account.layout.oss.switchOff") : translate("account.layout.oss.switchOn"),
                    icon: <Power className="size-3.5" />,
                    danger: channel.enabled !== false,
                    confirm: {
                        title: channel.enabled !== false ? translate("admin.channels.channelsPage.disableThisSystemChannel") : translate("admin.channels.channelsPage.enableThisSystemChannel"),
                        description: channel.enabled !== false ? translate("admin.channels.channelsPage.onceDisabledNewTasksStopUsingThisChannelButIt") : translate("admin.channels.channelsPage.onceEnabledFullyConfiguredModelsRejoinTheSetOfAvailable"),
                        okText: channel.enabled !== false ? translate("admin.channels.channelsPage.confirmDeactivation") : translate("admin.channels.channelsPage.confirmEnable"),
                    },
                    onClick: () => toggleChannel(channel),
                },
                {
                    key: "delete",
                    label: translate("common.delete"),
                    icon: <Trash2 className="size-3.5" />,
                    danger: true,
                    confirm: {
                        title: translate("admin.channels.channelsPage.deleteThisSystemChannel"),
                        description: translate("admin.channels.channelsPage.onceDeletedTheChannelAndItsModelsNoLongerAppear"),
                        okText: translate("account.ui.delete.confirm"),
                    },
                    onClick: () => removeChannel(channel),
                },
            ]}
        />
    );

    return (
        <AdminPageFrame title={translate("admin.channels.channelsPage.channelsAndModels")} description={translate("admin.channels.channelsPage.manageConnectionsAndModelsByChannelOrSwitchToAll")}>
            <Segmented
                className="admin-channel-view-switch"
                aria-label={translate("admin.channels.channelsPage.channelAndModelView")}
                value={view}
                onChange={(value) => updateUrl({ view: value === "models" ? "models" : "" })}
                options={[
                    { label: translate("admin.channels.channelsPage.byChannel"), value: "channels" },
                    { label: translate("library.tasks.page.allModels"), value: "models" },
                ]}
            />
            {view === "models" ? (
                <AllChannelModelsPanel channels={channels} health={health} healthLoading={healthLoading} onChanged={syncChannels} onOpenChannel={(channelId) => updateUrl({ view: "", channel: channelId, filter: "", status: "all" })} />
            ) : (
                <div className="admin-channel-workspace">
                    <aside className="admin-channel-sidebar" aria-label={translate("admin.channels.channelsPage.systemChannel")}>
                        <div className="admin-channel-sidebar-header">
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="font-semibold">{translate("admin.channels.channelsPage.channel")}</h2>
                                <span className="admin-channel-count">{hasFilters ? `${visibleChannels.length} / ${channels.length}` : channels.length}</span>
                            </div>
                            <Button block type="primary" icon={<Plus className="size-4" />} onClick={() => setWizardOpen(true)}>
                                {translate("account.settings.channels.add")}
                            </Button>
                            <div className="grid grid-cols-2 gap-2">
                                <Button size="small" icon={<Upload className="size-3.5" />} loading={transferring} onClick={() => importInputRef.current?.click()}>
                                    {translate("account.settings.memory.actors.seed")}
                                </Button>
                                <Button
                                    size="small"
                                    icon={<Download className="size-3.5" />}
                                    disabled={transferring || !channels.length}
                                    onClick={() => void exportChannels()}
                                    title={translate("admin.channels.channelsPage.exportAllSystemChannelsWithoutAPIKeysOrOtherSecrets")}
                                >
                                    {translate("admin.channels.channelsPage.exportAll")}
                                </Button>
                            </div>
                            <input
                                ref={importInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                aria-label={translate("admin.channels.channelsPage.chooseASystemChannelImportFile")}
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    if (file) void importChannels(file);
                                }}
                            />
                            <AdminSearchInput
                                id="admin-channel-search"
                                aria-label={translate("admin.channels.channelsPage.searchSystemChannels")}
                                autoComplete="off"
                                allowClear
                                prefix={<Search className="size-4 text-foreground/40" />}
                                value={keyword}
                                placeholder={translate("admin.channels.channelsPage.searchChannelNameOrURL")}
                                onValueChange={(value) => updateUrl({ filter: value }, true)}
                            />
                            <Select
                                aria-label={translate("admin.channels.channelsPage.filterByChannelStatus")}
                                value={status}
                                onChange={(value) => updateUrl({ status: value })}
                                options={[
                                    { label: translate("library.ark.expiry.all"), value: "all" },
                                    { label: translate("account.layout.oss.enabled"), value: "enabled" },
                                    { label: translate("admin.channels.channelsPage.disabled"), value: "disabled" },
                                ]}
                            />
                        </div>
                        <div className="admin-channel-list" aria-busy={loading}>
                            {loadError ? (
                                <div className="admin-channel-load-error" role="alert">
                                    <p>{loadError}</p>
                                    <Button size="small" onClick={() => void reload()}>
                                        {translate("admin.channels.channelsPage.reloadChannels")}
                                    </Button>
                                </div>
                            ) : null}
                            {loading ? (
                                <div className="admin-channel-loading" role="status" aria-label={translate("admin.channels.channelsPage.loadingChannels")}>
                                    <Spin size="small" />
                                </div>
                            ) : null}
                            {visibleChannels.map((channel) => (
                                <button type="button" key={channel.id} className="admin-channel-item" aria-pressed={selectedChannel?.id === channel.id} aria-controls="admin-channel-models" onClick={() => updateUrl({ channel: channel.id })}>
                                    <span className="admin-channel-item-topline">
                                        <span className="admin-channel-item-name" title={channel.name}>
                                            {channel.name}
                                        </span>
                                        <ChevronRight className="admin-channel-item-arrow size-3.5" aria-hidden="true" />
                                    </span>
                                    <span className="admin-channel-item-meta">
                                        <span>
                                            {channel.models?.length || 0} {translate("admin.channels.channelsPage.models")}
                                        </span>
                                        <ChannelHealthBadge stats={channelHealth.get(channel.id)} />
                                        <span className="admin-channel-item-status" data-enabled={channel.enabled !== false}>
                                            {channel.enabled !== false ? translate("account.layout.oss.enabled") : translate("admin.channels.channelsPage.disabled")}
                                        </span>
                                    </span>
                                </button>
                            ))}
                            {!loading && !loadError && !visibleChannels.length ? (
                                <AdminTableEmpty
                                    filtered={hasFilters}
                                    title={hasFilters ? undefined : translate("admin.channels.channelsPage.noSystemChannelsYet")}
                                    action={hasFilters ? <Button onClick={() => updateUrl({ filter: "", status: "all" })}>{translate("account.layout.state.clearFilters")}</Button> : undefined}
                                />
                            ) : null}
                        </div>
                        <div className="admin-channel-sidebar-footer">
                            <ChannelOrderDialog
                                onSaved={async () => {
                                    await syncChannels();
                                    await reload();
                                }}
                            />
                        </div>
                    </aside>
                    <section
                        id="admin-channel-models"
                        className="admin-channel-detail"
                        aria-label={selectedChannel ? translate("admin.channels.channelsPage.manageModelsIn", { v0: String(selectedChannel.name) }) : translate("admin.channels.channelsPage.channelModelManagement")}
                    >
                        {selectedChannel ? (
                            <>
                                <header className="admin-channel-detail-header">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="admin-channel-detail-title">{selectedChannel.name}</h2>
                                            <AdminStatusBadge
                                                label={selectedChannel.enabled !== false ? translate("account.layout.oss.enabled") : translate("admin.channels.channelsPage.disabled")}
                                                tone={selectedChannel.enabled !== false ? "success" : "neutral"}
                                            />
                                        </div>
                                        <p className="admin-channel-detail-url" title={selectedChannel.baseUrl}>
                                            {selectedChannel.baseUrl}
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/50">
                                            <span>
                                                {selectedChannel.hasApiKey
                                                    ? selectedChannel.hasSecretKey
                                                        ? translate("admin.channels.channelsPage.aKSKConfigured")
                                                        : translate("admin.channels.channelsPage.aPIKeyConfigured")
                                                    : translate("admin.channels.channelsPage.credentialsNotConfigured")}
                                            </span>
                                            <span>
                                                {translate("admin.channels.channelsPage.concurrencyLimit")}
                                                {selectedChannel.concurrencyLimit || translate("admin.channels.channelsPage.followSystem")}
                                            </span>
                                            {selectedChannel.catalogProviderId ? (
                                                <span>
                                                    {translate("admin.channels.channelsPage.sourceProviderCatalog")} {selectedChannel.catalogProviderId}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                    {channelActions(selectedChannel)}
                                </header>
                                <ChannelModelManager
                                    key={selectedChannel.id}
                                    channel={selectedChannel}
                                    health={health}
                                    healthLoading={healthLoading}
                                    onChanged={async () => {
                                        await syncChannels();
                                        await reload();
                                    }}
                                />
                            </>
                        ) : (
                            <AdminTableEmpty
                                title={
                                    loading
                                        ? translate("admin.channels.channelsPage.loadingChannels")
                                        : loadError
                                          ? translate("admin.channels.channelsPage.channelsAreTemporarilyUnavailable")
                                          : hasFilters
                                            ? translate("admin.channels.channelsPage.noMatchingChannels")
                                            : translate("admin.channels.channelsPage.addAChannelToStartManagingModels")
                                }
                                description={
                                    loading
                                        ? translate("admin.channels.channelsPage.channelModelsWillAppearHereWhenLoadingFinishes")
                                        : loadError
                                          ? translate("admin.channels.channelsPage.retryLoadingFromThePanelOnTheLeft")
                                          : hasFilters
                                            ? translate("admin.channels.channelsPage.adjustTheSearchOrStatusFilterOnTheLeft")
                                            : translate("admin.channels.channelsPage.addAChannelOnTheLeftAndConfigureItsConnection")
                                }
                            />
                        )}
                    </section>
                </div>
            )}
            <AdminModal
                className="workspace-modal workspace-modal-wide admin-channel-modal"
                rootClassName="admin-channel-modal-root"
                title={editingChannel ? translate("admin.channels.channelsPage.editSystemChannel") : translate("admin.channels.channelsPage.addSystemChannel")}
                open={drawerOpen}
                width={760}
                centered
                onCancel={closeDrawer}
                mask={{ closable: !saving }}
                destroyOnHidden
                footer={
                    <div className="flex justify-end gap-2">
                        <Button onClick={closeDrawer}>{translate("common.cancel")}</Button>
                        <Button type="primary" loading={saving} onClick={() => void save()}>
                            {translate("common.save")}
                        </Button>
                    </div>
                }
            >
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="name" label={translate("account.settings.channels.name")} rules={[{ required: true, message: translate("admin.channels.channelsPage.enterAChannelName") }]}>
                        <Input placeholder={translate("admin.channels.channelsPage.eGOpenAIOfficialChannel")} />
                    </Form.Item>
                    <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, message: translate("account.settings.channels.baseUrlRequired") }]}>
                        <Input placeholder={translate("admin.channels.channelsPage.enterTheCloudChannelBaseURL")} />
                    </Form.Item>
                    <Form.Item
                        name="apiKey"
                        label={editingChannel ? `API Key / Access Key（${configuredSecretText}）` : "API Key / Access Key"}
                        rules={editingChannel ? [] : [{ required: true, message: translate("admin.channels.channelsPage.enterAnAPIKeyOrAccessKey") }]}
                        extra={translate("admin.channels.channelsPage.forOpenAICompatibleProtocolsEnterAnAPIKeyForThe")}
                    >
                        <Input.Password autoComplete="new-password" placeholder={editingChannel ? translate("admin.channels.channelsPage.leaveBlankToKeepTheCurrentCredentials") : translate("admin.channels.channelsPage.aPIKeyOrAccessKey")} />
                    </Form.Item>
                    <Form.Item
                        name="secretKey"
                        label={editingChannel ? `Secret Key（${channelSecretText(editingChannel)}）` : translate("account.settings.channels.secretKey")}
                        extra={translate("admin.channels.channelsPage.requiredOnlyForAKSKSignedProtocolsSuchAsOfficial")}
                    >
                        <Input.Password autoComplete="new-password" placeholder={editingChannel ? translate("admin.channels.channelsPage.leaveBlankToKeepTheCurrentSecretKey") : "IAM Secret Key"} />
                    </Form.Item>
                    <div className="mb-6">
                        <Form.Item name="headers" noStyle>
                            <ChannelHeadersEditor />
                        </Form.Item>
                    </div>
                    <Form.Item name="proxyUrl" label={translate("admin.channels.channelsPage.proxyURL")} extra={translate("admin.channels.channelsPage.configureAnOutboundProxyForThisChannelSupportsSocks5Socks5h")}>
                        <Input placeholder={translate("admin.channels.channelsPage.forExampleSocks51270011080OrHttp")} />
                    </Form.Item>
                    <Form.Item name="mediaTransport" label={translate("admin.channels.channelsPage.referenceMediaDelivery")} extra={translate("admin.channels.channelsPage.usedAsThisChannelSDefaultIndividualModelsCanOverride")}>
                        <MediaTransportFields />
                    </Form.Item>
                    <Form.Item name="useGlobalConcurrency" label={translate("admin.channels.channelsPage.followTheSystemConcurrencySetting")} valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Form.Item
                        name="concurrencyLimit"
                        label={translate("admin.channels.channelsPage.maximumChannelConcurrency")}
                        extra={translate("admin.channels.channelsPage.backgroundTasksAndSystemProxyRequestsShareThisChannelLimit")}
                        rules={
                            useGlobalConcurrency
                                ? []
                                : [
                                      { required: true, message: translate("admin.channels.channelsPage.enterTheMaximumChannelConcurrency") },
                                      { type: "number", min: 1, max: 999, message: translate("admin.channels.channelsPage.enterAnIntegerBetween1And999") },
                                  ]
                        }
                    >
                        <InputNumber className="w-full" min={1} max={999} precision={0} disabled={useGlobalConcurrency} placeholder={useGlobalConcurrency ? translate("admin.channels.channelsPage.useSystemDefault") : "1-999"} />
                    </Form.Item>
                    <Form.Item name="enabled" label={translate("account.layout.oss.switchOn")} valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </AdminModal>
            <ProviderCatalogWizard
                open={wizardOpen}
                onClose={() => setWizardOpen(false)}
                onCustom={() => {
                    setWizardOpen(false);
                    openDrawer();
                }}
                onInstalled={async (channel) => {
                    setWizardOpen(false);
                    updateUrl({ channel: channel.id, filter: "", status: "all" }, true);
                    await syncChannels();
                    await reload();
                }}
            />
        </AdminPageFrame>
    );
}

function ChannelHealthBadge({ stats }: { stats?: { requests: number; succeeded: number } }) {
    if (!stats || stats.requests === 0) return null;
    const rate = stats.succeeded / stats.requests;
    return (
        <span className="admin-channel-item-health" data-tone={healthTone(rate, stats.requests)} title={translate("admin.channels.channelsPage.generationRequestsInThePast24HoursSucceeded", { v0: String(stats.requests), v1: String(stats.succeeded) })}>
            {formatRate(rate)}
        </span>
    );
}

function normalizeStatus(value: string | null): "all" | "enabled" | "disabled" {
    return value === "enabled" || value === "disabled" ? value : "all";
}
function channelSecretText(channel: ModelChannel) {
    return channel.hasSecretKey ? translate("admin.channels.channelsPage.configuredLeaveBlankToKeepUnchanged") : translate("account.layout.oss.cdnAuthNone");
}
