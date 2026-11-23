import { App, Button, Space } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Pencil, Power, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { ModelIcon } from "@/components/model-picker";
import { Select } from "@/components/ui/base/select";
import { type ModelProtocolDefinition } from "@/lib/model-protocols";
import { fetchPluginProviderCatalog } from "@/services/api/plugin-catalog";
import { listAdminAllChannelModels, setAdminChannelModelEnabled, type AdminChannelModelHealth, type AdminChannelModelListItem } from "@/services/api/wallet";
import type { ModelChannel } from "@/stores/use-config-store";
import { AdminBatchBar, AdminDataTable, AdminStatusBadge, AdminTableEmpty, PaginationBar } from "../components/admin-ui";
import { AdminSearchInput } from "../components/admin-search-input";
import { ChannelModelCostSummary } from "../components/channel-model-cost-summary";
import { ChannelModelEditor } from "../components/channel-model-editor";
import { ChannelModelHealthCell, channelModelHealthKey } from "../components/channel-model-health";
import { ChannelModelRepriceDialog } from "../components/channel-model-reprice-dialog";
import { ChannelModelProtocolDialog } from "../components/channel-model-protocol-dialog";
import { currentLocale, translate } from "@/i18n";

type StatusFilter = "all" | "enabled" | "disabled" | "unhealthy";

const capabilityOptions = [
    { label: translate("admin.channels.allChannelModelsPanel.allCapabilities"), value: "all" },
    { label: translate("account.settings.modelConfig.capabilities.text"), value: "text" },
    { label: translate("account.feedback.image"), value: "image" },
    { label: translate("account.feedback.video"), value: "video" },
    { label: translate("account.settings.modelConfig.capabilities.audio"), value: "audio" },
];

/**
 * 跨渠道模型视图：按模型名称一次查遍全部系统渠道。
 * 同一模型在不同渠道的行相邻排列，便于直接比较价格、稳定性和启停状态。
 */
export function AllChannelModelsPanel({
    channels,
    health,
    healthLoading,
    onChanged,
    onOpenChannel,
}: {
    channels: ModelChannel[];
    health: Map<string, AdminChannelModelHealth>;
    healthLoading: boolean;
    onChanged: () => Promise<void>;
    onOpenChannel: (channelId: string) => void;
}) {
    const { message, modal } = App.useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const keyword = searchParams.get("q") || "";
    const capability = searchParams.get("capability") || "all";
    const status = (searchParams.get("modelStatus") as StatusFilter) || "all";
    const channelFilter = searchParams.get("modelChannel") || "all";
    const [items, setItems] = useState<AdminChannelModelListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [retry, setRetry] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [editing, setEditing] = useState<AdminChannelModelListItem | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [repriceItems, setRepriceItems] = useState<AdminChannelModelListItem[]>([]);
    const [protocolItems, setProtocolItems] = useState<AdminChannelModelListItem[]>([]);
    const [protocols, setProtocols] = useState<ModelProtocolDefinition[]>([]);
    const [protocolLoading, setProtocolLoading] = useState(true);
    const [protocolError, setProtocolError] = useState("");

    const updateFilter = (patch: Record<string, string>) => {
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                Object.entries(patch).forEach(([key, value]) => {
                    if (!value || value === "all") next.delete(key);
                    else next.set(key, value);
                });
                return next;
            },
            { replace: true },
        );
        setPage(1);
    };

    useEffect(() => {
        let active = true;
        setLoading(true);
        setLoadError("");
        void listAdminAllChannelModels()
            .then((result) => active && setItems(result.models))
            .catch((error) => active && setLoadError(error instanceof Error ? error.message : translate("admin.channels.allChannelModelsPanel.failedToLoadModels")))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [retry]);

    const loadProtocols = async () => {
        setProtocolLoading(true);
        setProtocolError("");
        try {
            setProtocols(await fetchPluginProviderCatalog("admin.system-channel"));
        } catch (error) {
            setProtocols([]);
            setProtocolError(error instanceof Error ? error.message : translate("admin.channels.allChannelModelsPanel.unableToLoadTheProtocolCatalog"));
        } finally {
            setProtocolLoading(false);
        }
    };

    useEffect(() => {
        void loadProtocols();
    }, []);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return items
            .filter((item) => {
                if (query && !`${item.modelKey} ${item.providerModelKey} ${item.displayName} ${item.channelLabel || ""}`.toLowerCase().includes(query)) return false;
                if (capability !== "all" && item.capability !== capability) return false;
                if (channelFilter !== "all" && item.channelId !== channelFilter) return false;
                if (status === "enabled" && !(item.enabled && item.channelEnabled)) return false;
                if (status === "disabled" && item.enabled && item.channelEnabled) return false;
                if (status === "unhealthy") {
                    const stats = health.get(channelModelHealthKey(item.channelId, item.modelKey));
                    if (!stats || stats.successRate24h === null || stats.successRate24h >= 0.8) return false;
                }
                return true;
            })
            .sort(
                (left, right) => (left.displayName || left.modelKey).localeCompare(right.displayName || right.modelKey, currentLocale()) || left.modelKey.localeCompare(right.modelKey) || left.channelName.localeCompare(right.channelName, currentLocale()),
            );
    }, [capability, channelFilter, health, items, keyword, status]);

    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
    const enabledCount = filtered.filter((item) => item.enabled && item.channelEnabled).length;

    const applyEnabled = async (item: AdminChannelModelListItem, enabled: boolean) => {
        setTogglingId(item.id);
        try {
            await setAdminChannelModelEnabled(item.channelId, item.id, enabled);
            setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, enabled } : entry)));
            await onChanged();
            message.success(enabled ? translate("admin.channels.allChannelModelsPanel.modelEnabled") : translate("admin.channels.allChannelModelsPanel.modelDisabled"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channels.allChannelModelsPanel.failedToUpdateModelStatus"));
        } finally {
            setTogglingId(null);
        }
    };

    const toggleEnabled = (item: AdminChannelModelListItem) => {
        if (!item.enabled) {
            void applyEnabled(item, true);
            return;
        }
        modal.confirm({
            title: translate("admin.channels.allChannelModelsPanel.disableIn", { v0: String(item.channelName), v1: String(item.displayName || item.modelKey) }),
            content: translate("admin.channels.allChannelModelsPanel.newTasksWillStopUsingThisModelOnThisChannel"),
            okText: translate("admin.channels.allChannelModelsPanel.confirmDeactivation"),
            cancelText: translate("common.cancel"),
            okButtonProps: { danger: true },
            onOk: () => applyEnabled(item, false),
        });
    };

    const openEditor = (item: AdminChannelModelListItem) => setEditing(item);

    const editingChannel = editing ? channels.find((channel) => channel.id === editing.channelId) : undefined;

    const columns: ColumnsType<AdminChannelModelListItem> = [
        {
            title: translate("canvasA.assetView.model"),
            width: 240,
            fixed: "left",
            render: (_, item) => (
                <div className="flex min-w-0 items-center gap-2">
                    <span className="admin-channel-model-icon">
                        <ModelIcon model={item.modelKey} icon={item.icon} />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate font-medium" title={item.displayName || item.modelKey}>
                            {item.displayName || item.modelKey}
                        </div>
                        <div className="admin-monospace truncate text-xs text-foreground/45">{item.modelKey}</div>
                    </div>
                </div>
            ),
        },
        {
            title: translate("admin.channels.allChannelModelsPanel.channel"),
            width: 170,
            render: (_, item) => (
                <div className="min-w-0">
                    <button type="button" className="admin-table-primary-link truncate" onClick={() => onOpenChannel(item.channelId)} title={translate("admin.channels.allChannelModelsPanel.viewInChannel")}>
                        {item.channelName}
                    </button>
                    {!item.channelEnabled ? <div className="text-xs text-foreground/45">{translate("admin.channels.allChannelModelsPanel.channelDisabled")}</div> : null}
                </div>
            ),
        },
        {
            title: translate("admin.channels.allChannelModelsPanel.capability"),
            dataIndex: "capability",
            width: 72,
            render: (value: string) => capabilityOptions.find((option) => option.value === value)?.label || translate("account.settings.modelConfig.capabilities.pending"),
        },
        {
            title: translate("admin.channels.allChannelModelsPanel.reliability24h"),
            key: "health",
            width: 150,
            render: (_, item) => <ChannelModelHealthCell health={health.get(channelModelHealthKey(item.channelId, item.modelKey))} loading={healthLoading} />,
        },
        { title: translate("admin.channels.allChannelModelsPanel.tierCostSellingPriceMarkup"), width: 300, render: (_, item) => <ChannelModelCostSummary item={item} /> },
        {
            title: translate("library.tasks.detail.status"),
            width: 90,
            render: (_, item) =>
                item.enabled ? (
                    item.channelEnabled ? (
                        <AdminStatusBadge label={translate("account.layout.oss.switchOn")} tone="success" />
                    ) : (
                        <AdminStatusBadge label={translate("admin.channels.allChannelModelsPanel.channelDisabled2")} tone="warning" />
                    )
                ) : (
                    <AdminStatusBadge label={translate("account.layout.oss.switchOff")} tone="neutral" />
                ),
        },
        {
            title: translate("account.settings.runninghub.actions"),
            width: 150,
            fixed: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => openEditor(item)}>
                        {translate("account.settings.channels.edit")}
                    </Button>
                    <Button size="small" danger={item.enabled} icon={<Power className="size-3.5" />} loading={togglingId === item.id} disabled={togglingId !== null && togglingId !== item.id} onClick={() => toggleEnabled(item)}>
                        {item.enabled ? translate("account.layout.oss.switchOff") : translate("account.layout.oss.switchOn")}
                    </Button>
                </Space>
            ),
        },
    ];

    const hasFilters = Boolean(keyword || capability !== "all" || status !== "all" || channelFilter !== "all");

    return (
        <div className="admin-all-models">
            <AdminDataTable
                toolbar={
                    <AdminSearchInput
                        allowClear
                        autoFocus
                        className="app-list-search"
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={keyword}
                        aria-label={translate("admin.channels.allChannelModelsPanel.searchAllChannelsByModelName")}
                        placeholder={translate("admin.channels.allChannelModelsPanel.searchAllChannelsByModelNameKeyOrUpstreamID")}
                        onValueChange={(value) => updateFilter({ q: value })}
                    />
                }
                toolbarFilters={
                    <>
                        <Select aria-label={translate("admin.channels.allChannelModelsPanel.filterByModelCapability")} className="w-28" value={capability} options={capabilityOptions} onChange={(value) => updateFilter({ capability: value })} />
                        <Select
                            aria-label={translate("admin.channels.allChannelModelsPanel.filterByModelStatus")}
                            className="w-44"
                            value={status}
                            options={[
                                { label: translate("library.ark.expiry.all"), value: "all" },
                                { label: translate("admin.channels.allChannelModelsPanel.availableModelAndChannelEnabled"), value: "enabled" },
                                { label: translate("admin.channels.allChannelModelsPanel.unavailable"), value: "disabled" },
                                { label: translate("admin.channels.allChannelModelsPanel.item24hSuccessRateBelow80"), value: "unhealthy" },
                            ]}
                            onChange={(value) => updateFilter({ modelStatus: value })}
                        />
                        <Select
                            aria-label={translate("admin.channels.allChannelModelsPanel.filterByChannel")}
                            className="w-40"
                            showSearch
                            optionFilterProp="label"
                            value={channelFilter}
                            options={[{ label: translate("admin.channels.allChannelModelsPanel.allChannels"), value: "all" }, ...channels.map((channel) => ({ label: channel.name, value: channel.id }))]}
                            onChange={(value) => updateFilter({ modelChannel: value })}
                        />
                    </>
                }
                toolbarActive={hasFilters}
                onReset={() => updateFilter({ q: "", capability: "", modelStatus: "", modelChannel: "" })}
                trailing={
                    <span className="text-xs text-foreground/50 tabular-nums">
                        {loading ? translate("admin.channels.allChannelModelsPanel.loading") : translate("admin.channels.allChannelModelsPanel.modelsAvailable", { v0: String(filtered.length), v1: String(enabledCount) })}
                    </span>
                }
                batchActions={
                    <AdminBatchBar count={selectedIds.length} onClear={() => setSelectedIds([])}>
                        <Button size="small" disabled={loading || Boolean(loadError)} onClick={() => setRepriceItems(items.filter((item) => selectedIds.includes(item.id)))}>
                            {translate("admin.channels.allChannelModelsPanel.bulkPriceAdjustment")}
                        </Button>
                        <Button size="small" disabled={loading || Boolean(loadError)} onClick={() => setProtocolItems(items.filter((item) => selectedIds.includes(item.id)))}>
                            {translate("admin.channels.allChannelModelsPanel.changeProtocol")}
                        </Button>
                    </AdminBatchBar>
                }
                table={{
                    className: "app-data-table",
                    rowKey: "id",
                    size: "small",
                    loading,
                    rowSelection: {
                        selectedRowKeys: selectedIds,
                        preserveSelectedRowKeys: true,
                        onChange: (keys) => {
                            const next = keys.map(String);
                            if (next.length > 100) message.warning(translate("admin.channels.allChannelModelsPanel.selectUpTo100ModelsAtATime"));
                            setSelectedIds(next.slice(0, 100));
                        },
                    },
                    columns,
                    dataSource: paged,
                    pagination: false,
                    scroll: { x: 1220 },
                }}
                empty={
                    loadError ? (
                        <div className="admin-inline-load-error" role="status">
                            <span>
                                {translate("admin.channels.allChannelModelsPanel.modelListTemporarilyUnavailable")}
                                {loadError}
                            </span>
                            <Button size="small" onClick={() => setRetry((value) => value + 1)}>
                                {translate("common.retry")}
                            </Button>
                        </div>
                    ) : (
                        <AdminTableEmpty filtered={hasFilters} title={hasFilters ? undefined : translate("admin.channels.allChannelModelsPanel.noChannelModelsYet")} />
                    )
                }
                footer={
                    <PaginationBar
                        alwaysShow
                        current={page}
                        pageSize={pageSize}
                        total={filtered.length}
                        onChange={(nextPage, nextPageSize) => {
                            setPage(nextPageSize !== pageSize ? 1 : nextPage);
                            setPageSize(nextPageSize);
                        }}
                    />
                }
            />
            {protocolItems.length > 0 && (
                <ChannelModelProtocolDialog
                    items={protocolItems}
                    protocols={protocols}
                    protocolLoading={protocolLoading}
                    protocolError={protocolError}
                    onClose={() => setProtocolItems([])}
                    onSaved={async () => {
                        setSelectedIds([]);
                        setRetry((value) => value + 1);
                        await onChanged();
                    }}
                />
            )}
            {repriceItems.length > 0 && (
                <ChannelModelRepriceDialog
                    items={repriceItems}
                    onClose={() => setRepriceItems([])}
                    onSaved={async () => {
                        setSelectedIds([]);
                        setRetry((value) => value + 1);
                        await onChanged();
                    }}
                />
            )}
            {editing && editingChannel ? (
                <ChannelModelEditor
                    channel={editingChannel}
                    editing={editing}
                    protocols={protocols}
                    protocolLoading={protocolLoading}
                    protocolError={protocolError}
                    onRetryProtocols={() => void loadProtocols()}
                    onClose={() => setEditing(null)}
                    onSaved={async () => {
                        setRetry((value) => value + 1);
                        await onChanged();
                    }}
                />
            ) : null}
        </div>
    );
}
