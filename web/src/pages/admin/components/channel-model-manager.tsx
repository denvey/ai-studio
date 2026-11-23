import { useEffect, useState } from "react";
import { App, Button, Checkbox, Input, Popconfirm, Space } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import { AntTooltip as Tooltip } from "@/components/ui/base/tooltip/ant-tooltip";
import type { ColumnsType } from "antd/es/table";
import { Copy, Pencil, Plus, Power, RefreshCw, Search, Trash2 } from "lucide-react";

import { PaginationBar } from "@/pages/admin/components/admin-ui";
import { ModelIcon } from "@/components/model-picker";
import { modelProtocolDefinition, modelProtocolLabel, type ModelProtocol } from "@/lib/model-protocols";
import { fetchPluginProviderCatalog } from "@/services/api/plugin-catalog";
import { deleteAdminChannelModel, deleteAdminChannelModels, fetchAdminChannelModels, importAdminChannelModels, listAdminChannelModels, setAdminChannelModelEnabled, type AdminChannelModelHealth, type ChannelModel } from "@/services/api/wallet";
import { ChannelModelHealthCell, channelModelHealthKey } from "./channel-model-health";
import type { ModelChannel } from "@/stores/use-config-store";
import { ChannelModelEditor } from "./channel-model-editor";
import { AdminBatchBar, AdminDataTable, AdminFilterChip, AdminStatusBadge, AdminTableEmpty } from "./admin-ui";
import { ChannelOrderDialog } from "./channel-order-dialog";
import { ChannelModelCostSummary } from "./channel-model-cost-summary";
import { ChannelModelRepriceDialog } from "./channel-model-reprice-dialog";
import { ChannelModelProtocolDialog } from "./channel-model-protocol-dialog";
import { deselectVisibleModels, filterImportModels, normalizeFetchModelKey, selectExistingImportModels, selectVisibleModels } from "./channel-model-import-selection";
import { duplicateChannelModelValues, type ChannelModelFormValues } from "./channel-model-editor-form";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

export function ChannelModelManager({ channel, onChanged, health, healthLoading }: { channel: ModelChannel; onChanged: () => void | Promise<void>; health?: Map<string, AdminChannelModelHealth>; healthLoading?: boolean }) {
    const { message, modal } = App.useApp();
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [items, setItems] = useState<ChannelModel[]>([]);
    const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
    const [deletingSelected, setDeletingSelected] = useState(false);
    const [repriceItems, setRepriceItems] = useState<ChannelModel[]>([]);
    const [protocolItems, setProtocolItems] = useState<ChannelModel[]>([]);
    const [editing, setEditing] = useState<ChannelModel | null>(null);
    const [copyDraft, setCopyDraft] = useState<ChannelModelFormValues | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [fetching, setFetching] = useState(false);
    const [fetchPreviewOpen, setFetchPreviewOpen] = useState(false);
    const [fetchPreviewModels, setFetchPreviewModels] = useState<string[]>([]);
    const [selectedFetchModels, setSelectedFetchModels] = useState<string[]>([]);
    const [fetchKeyword, setFetchKeyword] = useState("");
    const [importing, setImporting] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [capability, setCapability] = useState<ChannelModel["capability"] | "all">("all");
    const [status, setStatus] = useState<"all" | "enabled" | "disabled" | "unhealthy">("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [availableProtocols, setAvailableProtocols] = useState<import("@/lib/model-protocols").ModelProtocolDefinition[]>([]);
    const [protocolLoading, setProtocolLoading] = useState(true);
    const [protocolError, setProtocolError] = useState("");
    const loadProtocols = async () => {
        setProtocolLoading(true);
        setProtocolError("");
        try {
            setAvailableProtocols(await fetchPluginProviderCatalog("admin.system-channel"));
        } catch (error) {
            setAvailableProtocols([]);
            setProtocolError(error instanceof Error ? error.message : translate("admin.channelModelManager.unableToLoadTheProtocolCatalog"));
        } finally {
            setProtocolLoading(false);
        }
    };
    const reload = async () => {
        if (!channel) return;
        setLoading(true);
        setLoadError("");
        try {
            const models = (await listAdminChannelModels(channel.id)).models;
            const availableIDs = new Set(models.map((item) => item.id));
            setItems(models);
            setSelectedModelIds((current) => current.filter((id) => availableIDs.has(id)));
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : translate("admin.channelModelManager.failedToLoadChannelModels"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void reload();
        void loadProtocols();
        setEditing(null);
        setCopyDraft(null);
        setEditorOpen(false);
        setSelectedModelIds([]);
        setRepriceItems([]);
        resetFetchPreview();
        setKeyword("");
        setCapability("all");
        setStatus("all");
        setPage(1);
    }, [channel.id]);

    const fetchModels = async () => {
        setFetching(true);
        try {
            const result = await fetchAdminChannelModels(channel.id);
            if (result.models.length === 0) {
                message.warning(translate("admin.channelModelManager.upstreamReturnedNoAvailableModels"));
                return;
            }
            setFetchPreviewModels(result.models);
            setSelectedFetchModels(
                selectExistingImportModels(
                    result.models,
                    items.flatMap((item) => [item.modelKey, item.providerModelKey].filter(Boolean)),
                ),
            );
            setFetchPreviewOpen(true);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channelModelManager.failedToFetchModels"));
        } finally {
            setFetching(false);
        }
    };

    const closeFetchPreview = () => {
        if (importing) return;
        resetFetchPreview();
    };

    const resetFetchPreview = () => {
        setFetchPreviewOpen(false);
        setFetchPreviewModels([]);
        setSelectedFetchModels([]);
        setFetchKeyword("");
    };

    const importSelectedModels = async () => {
        if (!selectedFetchModels.length) return;
        if (!selectedNewFetchModels.length) {
            message.info(translate("admin.channelModelManager.allSelectedModelsAlreadyExistThereAreNoNewModels"));
            resetFetchPreview();
            return;
        }
        setImporting(true);
        try {
            const result = await importAdminChannelModels(channel.id, selectedFetchModels);
            await reload();
            await onChanged();
            resetFetchPreview();
            if (result.added > 0) message.success(translate("admin.channelModelManager.importedModelsConfigurePricingBeforeEnablingNewlyAddedModels", { v0: String(result.added) }));
            else message.info(translate("admin.channelModelManager.allSelectedModelsAlreadyExistNoModelsWereAdded"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channelModelManager.failedToImportModels"));
        } finally {
            setImporting(false);
        }
    };

    const startCreate = () => {
        setEditing(null);
        setCopyDraft(null);
        setEditorOpen(true);
    };
    const startEdit = (item: ChannelModel) => {
        setEditing(item);
        setCopyDraft(null);
        setEditorOpen(true);
    };
    const startCopy = (item: ChannelModel) => {
        setEditing(null);
        setCopyDraft(duplicateChannelModelValues(item, availableProtocols));
        setEditorOpen(true);
    };

    const remove = async (item: ChannelModel) => {
        try {
            await deleteAdminChannelModel(channel.id, item.id);
            await reload();
            await onChanged();
            message.success(translate("admin.channelModelManager.modelDeleted"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channelModelManager.failedToDeleteModel"));
        }
    };

    const applyEnabled = async (item: ChannelModel, enabled: boolean) => {
        setTogglingId(item.id);
        try {
            await setAdminChannelModelEnabled(channel.id, item.id, enabled);
            setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, enabled } : entry)));
            await onChanged();
            message.success(enabled ? translate("admin.channelModelManager.modelEnabled") : translate("admin.channelModelManager.modelDisabled"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channelModelManager.failedToUpdateModelStatus"));
        } finally {
            setTogglingId(null);
        }
    };

    // 停用会让新任务不再路由到该模型，需要确认；启用没有破坏性，直接执行。
    const toggleEnabled = (item: ChannelModel) => {
        if (!item.enabled) {
            void applyEnabled(item, true);
            return;
        }
        modal.confirm({
            title: translate("admin.channelModelManager.disableModel", { v0: String(item.displayName || item.modelKey) }),
            content: translate("admin.channelModelManager.newTasksWillStopUsingThisModelPublicModelsReferencing"),
            okText: translate("admin.channelModelManager.confirmDeactivation"),
            cancelText: translate("common.cancel"),
            okButtonProps: { danger: true },
            onOk: () => applyEnabled(item, false),
        });
    };

    const confirmBatchRemove = () => {
        if (!selectedModelIds.length) return;
        const count = selectedModelIds.length;
        modal.confirm({
            title: translate("admin.channelModelManager.deleteTheSelectedModels", { v0: String(count) }),
            content: translate("admin.channelModelManager.deletedModelsDisappearFromTheListAndCannotBeRestored"),
            okText: translate("admin.channelModelManager.bulkDelete"),
            cancelText: translate("common.cancel"),
            okButtonProps: { danger: true },
            onOk: async () => {
                setDeletingSelected(true);
                try {
                    const result = await deleteAdminChannelModels(channel.id, selectedModelIds);
                    setSelectedModelIds([]);
                    setPage(1);
                    await reload();
                    await onChanged();
                    message.success(translate("admin.channelModelManager.deletedModels", { v0: String(result.deleted) }));
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("admin.channelModelManager.failedToDeleteModelsInBulk"));
                } finally {
                    setDeletingSelected(false);
                }
            },
        });
    };
    const columns: ColumnsType<ChannelModel> = [
        {
            title: translate("canvasA.assetView.model"),
            width: 240,
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
                        {item.channelLabel ? <div className="truncate text-xs text-foreground/60">{translate("admin.channelModelManager.channelDisplayName")}{item.channelLabel}</div> : null}
                        {item.providerModelKey && item.providerModelKey !== item.modelKey ? <div className="admin-monospace truncate text-xs text-foreground/35">{translate("admin.channelModelManager.upstream")}{item.providerModelKey}</div> : null}
                    </div>
                </div>
            ),
        },
        { title: translate("admin.channelModelManager.capability"), dataIndex: "capability", width: 80, render: capabilityLabel },
        { title: translate("admin.channelModelManager.reliability24h"), key: "health", width: 150, render: (_, item) => <ChannelModelHealthCell health={health?.get(channelModelHealthKey(channel.id, item.modelKey))} loading={healthLoading} /> },
        {
            title: translate("account.settings.modelConfig.protocol"),
            dataIndex: "protocol",
            width: 190,
            render: (value: ModelProtocol) =>
                value ? (
                    <div>
                        <div className="text-xs font-medium">{modelProtocolLabel(value, availableProtocols)}</div>
                        <div className="truncate text-[var(--fs-tiny)] text-foreground/45">{modelProtocolDefinition(value, availableProtocols)?.create}</div>
                    </div>
                ) : (
                    <AdminStatusBadge label={translate("account.settings.modelConfig.capabilities.pending")} tone="warning" />
                ),
        },
        { title: translate("admin.channelModelManager.tierCostSellingPriceMarkup"), width: 310, render: (_, item) => <ChannelModelCostSummary item={item} /> },
        { title: translate("canvasA.assetView.version"), dataIndex: "priceVersion", width: 75, render: (value) => `v${value}` },
        { title: translate("library.tasks.detail.status"), dataIndex: "enabled", width: 85, render: (enabled) => <AdminStatusBadge label={enabled ? translate("account.layout.oss.switchOn") : translate("account.layout.oss.switchOff")} tone={enabled ? "success" : "neutral"} /> },
        {
            title: translate("account.settings.runninghub.actions"),
            width: 206,
            fixed: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Button size="small" icon={<Pencil className="size-3.5" />} disabled={deletingSelected} onClick={() => startEdit(item)}>
                        {translate("account.settings.channels.edit")}
                    </Button>
                    <Button size="small" danger={item.enabled} icon={<Power className="size-3.5" />} loading={togglingId === item.id} disabled={deletingSelected || (togglingId !== null && togglingId !== item.id)} onClick={() => toggleEnabled(item)}>
                        {item.enabled ? translate("account.layout.oss.switchOff") : translate("account.layout.oss.switchOn")}
                    </Button>
                    <Tooltip title={translate("admin.channelModelManager.duplicateModel")}>
                        <Button size="small" aria-label={translate("admin.channelModelManager.duplicateModel2", { v0: String(item.displayName || item.modelKey) })} disabled={deletingSelected} icon={<Copy className="size-3.5" />} onClick={() => startCopy(item)} />
                    </Tooltip>
                    <Popconfirm title={translate("admin.channelModelManager.deleteModel")} description={translate("admin.channelModelManager.modelsUsedByPublicSupplyRoutesOrOngoingTasksCannot")} okText={translate("common.delete")} cancelText={translate("common.cancel")} onConfirm={() => void remove(item)}>
                        <Button size="small" danger disabled={deletingSelected} title={translate("admin.channelModelManager.deleteModel")} aria-label={translate("admin.channelModelManager.deleteModel")} icon={<Trash2 className="size-3.5" />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const filteredItems = items.filter((item) => {
        const query = keyword.trim().toLowerCase();
        if (query && !`${item.modelKey} ${item.providerModelKey} ${item.displayName} ${item.channelLabel || ""}`.toLowerCase().includes(query)) return false;
        if (capability !== "all" && item.capability !== capability) return false;
        if (status === "enabled" && !item.enabled) return false;
        if (status === "disabled" && item.enabled) return false;
        if (status === "unhealthy") {
            const stats = health?.get(channelModelHealthKey(channel.id, item.modelKey));
            if (!stats || stats.successRate24h === null || stats.successRate24h >= 0.8) return false;
        }
        return true;
    });
    const pagedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
    const existingFetchModelKeys = new Set(items.flatMap((item) => [item.modelKey, item.providerModelKey].filter(Boolean).map(normalizeFetchModelKey)));
    const selectedNewFetchModels = selectedFetchModels.filter((name) => !existingFetchModelKeys.has(normalizeFetchModelKey(name)));
    const selectedExistingFetchCount = selectedFetchModels.length - selectedNewFetchModels.length;
    const fetchKeywordQuery = fetchKeyword.trim().toLowerCase();
    const visibleFetchModels = filterImportModels(fetchPreviewModels, fetchKeyword);
    const allVisibleFetchModelsSelected = visibleFetchModels.length > 0 && visibleFetchModels.every((name) => selectedFetchModels.includes(name));
    const selectedVisibleFetchCount = visibleFetchModels.filter((name) => selectedFetchModels.includes(name)).length;
    const fetchModelOptions = visibleFetchModels.map((name) => ({
        label: <span className="break-all">{name}</span>,
        value: name,
    }));

    return (
        <div className="admin-channel-model-manager">
            <div className="admin-channel-model-toolbar">
                <div>
                    <h3 className="admin-channel-model-heading">
                        {translate("admin.channelModelManager.modelManagement")} <span className="admin-channel-count">{items.length}</span>
                    </h3>
                    <p className="admin-channel-model-hint">{translate("admin.channelModelManager.reliabilityIncludesModelGenerationRequestsOnlySelectModelsToAdjust")}</p>
                </div>
                <Space wrap>
                    <ChannelOrderDialog
                        channelId={channel.id}
                        onSaved={async () => {
                            await reload();
                            await onChanged();
                        }}
                    />
                    <Button loading={fetching} icon={<RefreshCw className="size-4" />} onClick={() => void fetchModels()}>
                        {translate("account.settings.channels.fetch")}
                    </Button>
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={startCreate}>
                        {translate("admin.channelModelManager.addModel")}
                    </Button>
                </Space>
            </div>
            {loadError ? (
                <div className="admin-channel-load-error" role="alert">
                    <span>{loadError}</span>
                    <Button size="small" onClick={() => void reload()}>
                        {translate("admin.channelModelManager.reloadModels")}
                    </Button>
                </div>
            ) : null}
            <AdminDataTable
                empty={
                    <AdminTableEmpty
                        title={loadError ? translate("admin.channelModelManager.failedToLoadModels") : items.length ? translate("admin.channelModelManager.noMatchingModels") : translate("admin.channelModelManager.thisChannelHasNoModelsYet")}
                        description={loadError ? translate("admin.channelModelManager.theModelListIsCurrentlyUnavailableTryLoadingItAgain") : items.length ? translate("admin.channelModelManager.adjustYourSearchOrFiltersAndTryAgain") : translate("admin.channelModelManager.clickFetchModelsAboveToImportFromUpstreamOrAdd")}
                    />
                }
                toolbar={
                    <Input
                        allowClear
                        className="app-list-search"
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={keyword}
                        placeholder={translate("admin.channelModelManager.searchModelIdentifierOrDisplayName")}
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                    />
                }
                toolbarActiveFilters={
                    <>
                        {keyword ? (
                            <AdminFilterChip
                                label={translate("admin.channelModelManager.search", { v0: String(keyword) })}
                                onRemove={() => {
                                    setKeyword("");
                                    setPage(1);
                                }}
                            />
                        ) : null}
                        {capability !== "all" ? (
                            <AdminFilterChip
                                label={translate("admin.channelModelManager.capability2", { v0: String(capability) })}
                                onRemove={() => {
                                    setCapability("all");
                                    setPage(1);
                                }}
                            />
                        ) : null}
                        {status !== "all" ? (
                            <AdminFilterChip
                                label={translate("admin.channelModelManager.status", { v0: String(status === "enabled" ? translate("account.layout.oss.enabled") : status === "disabled" ? translate("admin.channelModelManager.disabled") : translate("admin.channelModelManager.successRateBelow80")) })}
                                onRemove={() => {
                                    setStatus("all");
                                    setPage(1);
                                }}
                            />
                        ) : null}
                    </>
                }
                toolbarActive={Boolean(keyword || capability !== "all" || status !== "all")}
                toolbarFilters={
                    <>
                        <Select
                            className="w-32"
                            value={capability}
                            onChange={(value) => {
                                setCapability(value);
                                setPage(1);
                            }}
                            options={[
                                { label: translate("admin.channelModelManager.allCapabilities"), value: "all" },
                                { label: translate("account.settings.modelConfig.capabilities.text"), value: "text" },
                                { label: translate("account.feedback.image"), value: "image" },
                                { label: translate("account.feedback.video"), value: "video" },
                                { label: translate("account.settings.modelConfig.capabilities.audio"), value: "audio" },
                            ]}
                        />
                        <Select
                            aria-label={translate("admin.channelModelManager.filterByModelStatus")}
                            className="w-44"
                            value={status}
                            onChange={(value) => {
                                setStatus(value);
                                setPage(1);
                            }}
                            options={[
                                { label: translate("library.ark.expiry.all"), value: "all" },
                                { label: translate("account.layout.oss.enabled"), value: "enabled" },
                                { label: translate("admin.channelModelManager.disabled"), value: "disabled" },
                                { label: translate("admin.channelModelManager.item24hSuccessRateBelow80"), value: "unhealthy" },
                            ]}
                        />
                    </>
                }
                onReset={() => {
                    setKeyword("");
                    setCapability("all");
                    setStatus("all");
                    setPage(1);
                }}
                batchActions={
                    <AdminBatchBar count={selectedModelIds.length} onClear={() => setSelectedModelIds([])}>
                        <Button size="small" disabled={deletingSelected || loading || Boolean(loadError)} onClick={() => setRepriceItems(items.filter((item) => selectedModelIds.includes(item.id)))}>
                            {translate("admin.channelModelManager.bulkPriceAdjustment")}
                        </Button>
                        <Button size="small" disabled={deletingSelected || loading || Boolean(loadError)} onClick={() => setProtocolItems(items.filter((item) => selectedModelIds.includes(item.id)))}>
                            {translate("admin.channelModelManager.changeProtocol")}
                        </Button>
                        <Button danger size="small" icon={<Trash2 className="size-3.5" />} loading={deletingSelected} onClick={confirmBatchRemove}>
                            {translate("admin.channelModelManager.bulkDelete")}
                        </Button>
                    </AdminBatchBar>
                }
                table={{
                    className: "app-data-table",
                    rowKey: "id",
                    size: "small",
                    loading,
                    rowSelection: {
                        selectedRowKeys: selectedModelIds,
                        preserveSelectedRowKeys: true,
                        onChange: (keys) => {
                            const next = keys.map(String);
                            if (next.length > 100) message.warning(translate("admin.channelModelManager.selectUpTo100ModelsAtATime"));
                            setSelectedModelIds(next.slice(0, 100));
                        },
                    },
                    columns,
                    dataSource: pagedItems,
                    pagination: false,
                    scroll: { x: 1300 },
                }}
                footer={
                    <PaginationBar
                        alwaysShow
                        current={page}
                        pageSize={pageSize}
                        total={filteredItems.length}
                        onChange={(nextPage, nextPageSize) => {
                            setPage(nextPageSize !== pageSize ? 1 : nextPage);
                            setPageSize(nextPageSize);
                        }}
                    />
                }
            />
            {protocolItems.length > 0 && (
                <ChannelModelProtocolDialog
                    channelId={channel.id}
                    items={protocolItems}
                    protocols={availableProtocols}
                    protocolLoading={protocolLoading}
                    protocolError={protocolError}
                    onClose={() => setProtocolItems([])}
                    onSaved={async () => {
                        setSelectedModelIds([]);
                        await reload();
                        await onChanged();
                    }}
                />
            )}
            {repriceItems.length > 0 && (
                <ChannelModelRepriceDialog
                    channelId={channel.id}
                    channelName={channel.name}
                    items={repriceItems}
                    onClose={() => setRepriceItems([])}
                    onSaved={async () => {
                        setSelectedModelIds([]);
                        await reload();
                        await onChanged();
                    }}
                />
            )}
            <AdminModal
                title={translate("admin.channelModelManager.selectModelsToImport")}
                open={fetchPreviewOpen}
                centered
                width={720}
                rootClassName="admin-model-import-modal"
                onCancel={closeFetchPreview}
                maskClosable={!importing}
                closable={!importing}
                footer={[
                    <Button key="cancel" disabled={importing} onClick={closeFetchPreview}>
                        {translate("common.cancel")}
                    </Button>,
                    <Button key="confirm" type="primary" loading={importing} disabled={!selectedFetchModels.length} onClick={() => void importSelectedModels()}>
                        {translate("admin.channelModelManager.confirmImport")}
                    </Button>,
                ]}
            >
                <div className="space-y-3">
                    <p className="m-0 text-sm text-foreground/65">{translate("admin.channelModelManager.upstreamReturned")} {fetchPreviewModels.length} {translate("admin.channelModelManager.modelsExistingModelsAreSelectedByDefaultNewModelsAre")}</p>
                    <Input
                        allowClear
                        autoFocus
                        className="app-list-search"
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={fetchKeyword}
                        placeholder={translate("admin.channelModelManager.searchModelIDsEGMinimaxOrSd25")}
                        aria-label={translate("admin.channelModelManager.searchUpstreamModels")}
                        disabled={importing}
                        onChange={(event) => setFetchKeyword(event.target.value)}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/25 px-3 py-2">
                        <span className="text-sm font-medium text-foreground/70" aria-live="polite">
                            {translate("admin.channelModelManager.selected")} {selectedFetchModels.length} / {fetchPreviewModels.length} {translate("admin.channelModelManager.models")}
                            {fetchKeywordQuery ? translate("admin.channelModelManager.matchesSelected", { v0: String(visibleFetchModels.length), v1: String(selectedVisibleFetchCount) }) : ""}
                        </span>
                        <Space size={4}>
                            <Button size="small" disabled={importing || !visibleFetchModels.length || allVisibleFetchModelsSelected} onClick={() => setSelectedFetchModels((current) => selectVisibleModels(current, visibleFetchModels))}>
                                {fetchKeywordQuery ? translate("admin.channelModelManager.selectAllMatches", { v0: String(visibleFetchModels.length) }) : translate("admin.channelModelManager.selectAll")}
                            </Button>
                            <Button size="small" disabled={importing || selectedVisibleFetchCount === 0} onClick={() => setSelectedFetchModels((current) => deselectVisibleModels(current, visibleFetchModels))}>
                                {fetchKeywordQuery ? translate("admin.channelModelManager.deselectMatching") : translate("admin.channelModelManager.clearAll")}
                            </Button>
                        </Space>
                    </div>
                    <div className="max-h-[min(60vh,520px)] overflow-y-auto rounded-md border border-border/70 p-3">
                        {visibleFetchModels.length ? (
                            <Checkbox.Group
                                className="channel-model-import-picker grid w-full grid-cols-1 gap-2 sm:grid-cols-2"
                                value={selectedFetchModels}
                                options={fetchModelOptions}
                                disabled={importing}
                                onChange={(values) => setSelectedFetchModels(values as string[])}
                            />
                        ) : (
                            <p className="m-0 py-6 text-center text-sm text-foreground/55">{translate("admin.channelModelManager.noAssetsMatching")}{fetchKeyword.trim()}{translate("admin.channelModelManager.models2")}</p>
                        )}
                    </div>
                    <div className="text-xs text-foreground/50">
                        {selectedNewFetchModels.length > 0 ? translate("admin.channelModelManager.newModelsWillBeImported", { v0: String(selectedNewFetchModels.length) }) : translate("admin.channelModelManager.allSelectedModelsAlreadyExist")}
                        {selectedExistingFetchCount > 0 ? translate("admin.channelModelManager.existingModelsAreAlsoSelected", { v0: String(selectedExistingFetchCount) }) : ""}
                    </div>
                </div>
            </AdminModal>
            {editorOpen && (
                <ChannelModelEditor
                    channel={channel}
                    editing={editing}
                    draftValues={copyDraft ?? undefined}
                    protocols={availableProtocols}
                    protocolLoading={protocolLoading}
                    protocolError={protocolError}
                    onRetryProtocols={() => void loadProtocols()}
                    onClose={() => {
                        setEditorOpen(false);
                        setCopyDraft(null);
                        setEditing(null);
                    }}
                    onSaved={async () => {
                        await reload();
                        await onChanged();
                    }}
                />
            )}
        </div>
    );
}

function capabilityLabel(value: ChannelModel["capability"]) {
    return { text: translate("account.settings.modelConfig.capabilities.text"), image: translate("account.feedback.image"), video: translate("account.feedback.video"), audio: translate("account.settings.modelConfig.capabilities.audio"), "": translate("account.settings.modelConfig.capabilities.pending") }[value];
}
