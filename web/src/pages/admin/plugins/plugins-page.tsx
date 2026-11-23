import { App, Button, Input } from "antd";
import { Switch } from "@/pages/admin/ui/controls";
import { AlipayCircleFilled, WechatFilled } from "@ant-design/icons";
import { ZHIFUFM_LOGO_SRC } from "@/components/payment-brand-icons";
import type { ColumnsType } from "antd/es/table";
import { CloudUpload, FileText, PlugZap, RefreshCw, Search, Trash2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PaginationBar } from "@/pages/admin/components/admin-ui";
import "@/lib/plugins/builtin";
import { EAGLE_PLUGIN_ID } from "@/lib/plugins/builtin/eagle";
import { RUNNINGHUB_PLUGIN_ID } from "@/lib/plugins/builtin/workflows";
import { isOfficialApplicationPluginId } from "@/lib/plugins/official-applications";
import { listRegisteredPlugins } from "@/lib/plugins/plugin-registry";
import { fetchAdminPlugins, setPluginPlatformAvailability, uninstallPlugin, uploadPlugin, type AdminPluginState, type BackendPlugin, type PluginManagement } from "@/services/api/plugins";
import { UploadPluginModal } from "@/pages/plugins/plugin-documentation-modals";

import { AdminPageFrame } from "../components/admin-shell";
import { AdminDataTable, AdminStatusBadge, AdminTableEmpty } from "../components/admin-ui";
import { Select } from "@/components/ui/base/select";
import { AdminPluginDetailModal, type AdminPluginDetail } from "./plugin-detail-modal";
import { currentLocale, translate } from "@/i18n";

type AdminPluginItem = AdminPluginDetail;

export default function AdminPluginsPage() {
    const { message, modal } = App.useApp();
    const [plugins, setPlugins] = useState<BackendPlugin[]>([]);
    const [states, setStates] = useState<Record<string, AdminPluginState>>({});
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState("");
    const [uploadOpen, setUploadOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [kind, setKind] = useState<"all" | "application" | "protocol" | "payment" | "uploaded">("all");
    const [availability, setAvailability] = useState<"all" | "available" | "unavailable">("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [detailId, setDetailId] = useState("");

    const reload = async () => {
        setLoading(true);
        try {
            const result = await fetchAdminPlugins();
            setPlugins(result.plugins);
            setStates(result.states);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.plugins.pluginsPage.failedToLoadPluginManagementData"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void reload();
    }, []);

    const items = useMemo(() => mergePlugins(plugins), [plugins]);
    // 按 ID 取当前数据：刷新或切换开关后详情跟着更新，卸载后自动关闭。
    const detailItem = useMemo(() => items.find((item) => item.manifest.id === detailId) || null, [detailId, items]);
    const filtered = useMemo(() => {
        const keyword = search.trim().toLocaleLowerCase();
        return items.filter((item) => {
            if (kind === "uploaded" && item.management.origin !== "uploaded") return false;
            if (kind !== "all" && kind !== "uploaded" && item.management.kind !== kind) return false;
            const available = states[item.manifest.id]?.platformAvailable ?? item.status === "enabled";
            if (availability === "available" && !available) return false;
            if (availability === "unavailable" && available) return false;
            if (!keyword) return true;
            return [item.manifest.name, item.manifest.id, item.manifest.description, item.manifest.author].filter(Boolean).join(" ").toLocaleLowerCase().includes(keyword);
        });
    }, [availability, items, kind, search, states]);

    useEffect(() => {
        setPage((current) => Math.min(current, Math.max(1, Math.ceil(filtered.length / pageSize))));
    }, [filtered.length, pageSize]);

    const changeAvailability = async (item: AdminPluginItem, available: boolean) => {
        setSavingId(item.manifest.id);
        try {
            const state = await setPluginPlatformAvailability(item.manifest.id, available);
            setStates((current) => ({ ...current, [item.manifest.id]: state }));
            message.success(translate("adminPages.plugins.pluginsPage.availabilityChanged", { name: item.manifest.name, status: available ? translate("adminPages.plugins.pluginsPage.available") : translate("adminPages.plugins.pluginsPage.disabled") }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.plugins.pluginsPage.failedToUpdatePluginAvailability"));
        } finally {
            setSavingId("");
        }
    };

    const upload = async (file: File) => {
        try {
            await uploadPlugin(file);
            setUploadOpen(false);
            message.success(translate("adminPages.plugins.pluginsPage.customPluginInstalled"));
            await reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.plugins.pluginsPage.failedToInstallPlugin"));
        }
    };

    const remove = (item: AdminPluginItem) => {
        modal.confirm({
            title: translate("adminPages.plugins.pluginsPage.uninstall", { v0: String(item.manifest.name) }),
            content: translate("adminPages.plugins.pluginsPage.thePluginPackagePlatformStateAndAllUserActivationRecords"),
            okText: translate("adminPages.plugins.pluginsPage.confirmUninstall"),
            okButtonProps: { danger: true },
            cancelText: translate("common.cancel"),
            onOk: async () => {
                try {
                    await uninstallPlugin(item.manifest.id);
                    message.success(translate("adminPages.plugins.pluginsPage.customPluginUninstalled"));
                    await reload();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("adminPages.plugins.pluginsPage.failedToUninstallPlugin"));
                    throw error;
                }
            },
        });
    };

    const applicationCount = items.filter((item) => item.management.kind === "application").length;
    const protocolCount = items.filter((item) => item.management.kind === "protocol").length;
    const paymentCount = items.filter((item) => item.management.kind === "payment").length;
    const unavailableCount = items.filter((item) => !(states[item.manifest.id]?.platformAvailable ?? item.status === "enabled")).length;
    const hasFilters = Boolean(search.trim() || kind !== "all" || availability !== "all");
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    const columns: ColumnsType<AdminPluginItem> = [
        {
            title: translate("adminPages.plugins.pluginsPage.plugin"),
            key: "plugin",
            width: 410,
            render: (_, item) => (
                <div className="flex min-w-0 items-center gap-3">
                    <PluginBrandIcon pluginId={item.manifest.id} />
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-baseline gap-2">
                            <button
                                type="button"
                                className="min-w-0 truncate rounded-sm text-left font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--control-focus-ring)]"
                                title={translate("adminPages.plugins.pluginsPage.viewDetails", { v0: String(item.manifest.name) })}
                                onClick={() => setDetailId(item.manifest.id)}
                            >
                                {item.manifest.name}
                            </button>
                            <span className="shrink-0 text-xs text-foreground/42">v{item.manifest.version}</span>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs">
                            <span className="max-w-44 shrink-0 truncate font-mono text-[var(--fs-label)] text-foreground/42" title={item.manifest.id}>
                                {item.manifest.id}
                            </span>
                            <span className="text-foreground/20" aria-hidden="true">
                                ·
                            </span>
                            <span className={`truncate ${item.error ? "text-status-error" : "text-foreground/52"}`} title={item.error || item.manifest.description || translate("adminPages.plugins.pluginsPage.noPluginDescriptionProvided")}>
                                {item.error || item.manifest.description || translate("adminPages.plugins.pluginsPage.noPluginDescriptionProvided")}
                            </span>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            title: translate("account.settings.runninghub.kind"),
            key: "type",
            width: 160,
            align: "center",
            render: (_, item) => (
                <div>
                    <AdminStatusBadge label={managementLabel(item.management)} tone={item.management.origin === "uploaded" ? "warning" : item.management.kind === "application" ? "info" : "neutral"} />
                    {!item.manifest.trusted ? (
                        <div className="mt-2">
                            <AdminStatusBadge label={translate("adminPages.plugins.pluginsPage.sourceNotVerified")} tone="warning" />
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: translate("adminPages.plugins.pluginsPage.scope"),
            key: "scope",
            width: 180,
            align: "center",
            render: (_, item) =>
                item.management.activationScope === "user" ? (
                    <div>
                        <div className="font-medium text-foreground/78">{translate("adminPages.plugins.pluginsPage.usersEnableIndividually")}</div>
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-foreground/48">
                            <UsersRound className="size-3.5" aria-hidden="true" />
                            {states[item.manifest.id]?.enabledUserCount || 0} {translate("adminPages.plugins.pluginsPage.usersEnabled")}
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="font-medium text-foreground/78">{translate("adminPages.plugins.pluginsPage.appliesGlobally")}</div>
                        <div className="mt-1 text-xs text-foreground/48">{translate("adminPages.plugins.pluginsPage.controlledByAdministrators")}</div>
                    </div>
                ),
        },
        {
            title: translate("adminPages.plugins.pluginsPage.platformStatus"),
            key: "status",
            width: 170,
            align: "center",
            render: (_, item) => {
                const available = states[item.manifest.id]?.platformAvailable ?? item.status === "enabled";
                return (
                    <div className="flex items-center justify-center gap-3">
                        <AdminStatusBadge label={available ? translate("adminPages.plugins.pluginsPage.available") : translate("adminPages.plugins.pluginsPage.disabled")} tone={available ? "success" : "neutral"} />
                        <Switch
                            className="plugin-state-switch"
                            loading={savingId === item.manifest.id}
                            checked={available}
                            aria-label={translate("adminPages.plugins.pluginsPage.currently", {
                                v0: String(item.manifest.name),
                                v1: String(available ? translate("adminPages.plugins.pluginsPage.availableOnThePlatformClickToDisable") : translate("adminPages.plugins.pluginsPage.disabledOnThePlatformClickToEnable")),
                            })}
                            onChange={(checked) => void changeAvailability(item, checked)}
                        />
                    </div>
                );
            },
        },
        {
            title: translate("account.settings.runninghub.actions"),
            key: "actions",
            width: 128,
            align: "center",
            render: (_, item) => (
                <div className="flex items-center justify-center gap-1">
                    <Button
                        type="text"
                        size="small"
                        aria-label={translate("adminPages.plugins.pluginsPage.viewDetails", { v0: String(item.manifest.name) })}
                        icon={<FileText className="size-3.5" aria-hidden="true" />}
                        onClick={() => setDetailId(item.manifest.id)}
                    >
                        {translate("account.layout.banner.details")}
                    </Button>
                    {item.management.origin === "uploaded" ? (
                        <Button
                            danger
                            type="text"
                            size="small"
                            aria-label={translate("adminPages.plugins.pluginsPage.uninstall2", { v0: String(item.manifest.name) })}
                            icon={<Trash2 className="size-3.5" aria-hidden="true" />}
                            onClick={() => remove(item)}
                        />
                    ) : (
                        <span title={translate("adminPages.plugins.pluginsPage.builtInPluginsCannotBeUninstalled")}>
                            <Button type="text" size="small" disabled aria-label={translate("adminPages.plugins.pluginsPage.isBuiltInAndCannotBeUninstalled", { v0: String(item.manifest.name) })} icon={<Trash2 className="size-3.5" aria-hidden="true" />} />
                        </span>
                    )}
                </div>
            ),
        },
    ];

    return (
        <AdminPageFrame
            title={translate("adminPages.plugins.pluginsPage.pluginManagement")}
            description={translate("adminPages.plugins.pluginsPage.managePlatformAvailabilityCustomPluginInstallationAndUserAccess")}
            actions={
                <>
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void reload()}>
                        {translate("common.refresh")}
                    </Button>
                    <Button type="primary" icon={<CloudUpload className="size-4" />} onClick={() => setUploadOpen(true)}>
                        {translate("adminPages.plugins.pluginsPage.uploadPlugin")}
                    </Button>
                </>
            }
        >
            <div className="my-4 grid min-h-16 grid-cols-2 divide-x divide-border/70 overflow-hidden rounded-lg border border-border/70 bg-card sm:grid-cols-5">
                <OverviewItem label={translate("adminPages.plugins.pluginsPage.allPlugins")} value={items.length} />
                <OverviewItem label={translate("adminPages.plugins.pluginsPage.officialApps")} value={applicationCount} />
                <OverviewItem label={translate("adminPages.plugins.pluginsPage.systemProtocols")} value={protocolCount} />
                <OverviewItem label={translate("adminPages.plugins.pluginsPage.paymentProtocols")} value={paymentCount} />
                <OverviewItem label={translate("adminPages.plugins.pluginsPage.disabledOnPlatform")} value={unavailableCount} tone={unavailableCount ? "warning" : "default"} />
            </div>
            <AdminDataTable
                toolbar={
                    <Input
                        className="app-list-search"
                        allowClear
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={search}
                        aria-label={translate("adminPages.plugins.pluginsPage.searchPlugins")}
                        placeholder={translate("adminPages.plugins.pluginsPage.searchPluginNameIDOrAuthor")}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                    />
                }
                toolbarFilters={
                    <>
                        <Select
                            aria-label={translate("adminPages.plugins.pluginsPage.filterPluginType")}
                            className="w-44"
                            value={kind}
                            onChange={(value) => {
                                setKind(value);
                                setPage(1);
                            }}
                            options={[
                                { value: "all", label: translate("library.tasks.page.allKinds") },
                                { value: "application", label: translate("adminPages.plugins.pluginsPage.officialAppPlugins") },
                                { value: "protocol", label: translate("adminPages.plugins.pluginsPage.systemProtocolPlugins") },
                                { value: "payment", label: translate("adminPages.plugins.pluginsPage.paymentProtocolPlugins") },
                                { value: "uploaded", label: translate("adminPages.plugins.pluginsPage.uploadedCustomPlugins") },
                            ]}
                        />
                        <Select
                            aria-label={translate("adminPages.plugins.pluginsPage.filterPluginStatus")}
                            className="w-32"
                            value={availability}
                            onChange={(value) => {
                                setAvailability(value);
                                setPage(1);
                            }}
                            options={[
                                { value: "all", label: translate("library.ark.expiry.all") },
                                { value: "available", label: translate("adminPages.plugins.pluginsPage.platformEnabled") },
                                { value: "unavailable", label: translate("adminPages.plugins.pluginsPage.platformDisabled") },
                            ]}
                        />
                    </>
                }
                toolbarActive={hasFilters}
                onReset={() => {
                    setSearch("");
                    setKind("all");
                    setAvailability("all");
                    setPage(1);
                }}
                skeletonColumns={5}
                table={{ className: "app-data-table", size: "small", sticky: true, rowKey: (item) => item.manifest.id, loading, columns, dataSource: paginated, pagination: false, scroll: { x: 1120 } }}
                empty={<AdminTableEmpty filtered={hasFilters} title={hasFilters ? undefined : translate("adminPages.plugins.pluginsPage.noManageablePluginsYet")} />}
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
            <UploadPluginModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUpload={upload} />
            <AdminPluginDetailModal
                plugin={detailItem}
                state={detailItem ? states[detailItem.manifest.id] : undefined}
                typeLabel={detailItem ? managementLabel(detailItem.management) : ""}
                icon={detailItem ? <PluginBrandIcon pluginId={detailItem.manifest.id} /> : null}
                onClose={() => setDetailId("")}
            />
        </AdminPageFrame>
    );
}

function OverviewItem({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" }) {
    return (
        <div className="flex min-w-0 items-center gap-3 px-4 py-3">
            <div className={`text-xl font-semibold tabular-nums ${tone === "warning" ? "text-status-warning" : "text-foreground"}`}>{value}</div>
            <div className="truncate text-xs text-foreground/52">{label}</div>
        </div>
    );
}

function PluginBrandIcon({ pluginId }: { pluginId: string }) {
    if (pluginId === "official-payment-wechat-native") {
        return (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#07c160]/10 text-[#07c160]">
                <WechatFilled className="text-lg" aria-hidden />
            </span>
        );
    }
    if (pluginId === "official-payment-alipay-page") {
        return (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#1677ff]/10 text-[#1677ff]">
                <AlipayCircleFilled className="text-lg" aria-hidden />
            </span>
        );
    }
    if (pluginId === "official-payment-zhifufm") {
        return (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg overflow-hidden border border-border/40 bg-card shadow-xs">
                <img src={ZHIFUFM_LOGO_SRC} alt={translate("adminPages.plugins.pluginsPage.payFM")} className="size-full object-contain select-none pointer-events-none rounded-lg" />
            </span>
        );
    }
    return (
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground/65">
            <PlugZap className="size-4" aria-hidden="true" />
        </span>
    );
}

function mergePlugins(remote: BackendPlugin[]): AdminPluginItem[] {
    const byId = new Map<string, AdminPluginItem>();
    for (const plugin of listRegisteredPlugins()) {
        const application = isOfficialApplicationPluginId(plugin.manifest.id);
        byId.set(plugin.manifest.id, {
            manifest: plugin.manifest,
            source: plugin.source || "bundled",
            management: {
                origin: "official",
                kind: application ? "application" : "protocol",
                activationScope: application ? "user" : "system",
                configurationScope: application ? (plugin.manifest.id === EAGLE_PLUGIN_ID || plugin.manifest.id === RUNNINGHUB_PLUGIN_ID ? "user" : "none") : "system",
            },
        });
    }
    for (const plugin of remote) byId.set(plugin.manifest.id, plugin);
    return [...byId.values()].sort((left, right) => managementOrder(left.management) - managementOrder(right.management) || left.manifest.name.localeCompare(right.manifest.name, currentLocale()));
}

function managementOrder(value: PluginManagement) {
    if (value.kind === "application") return 0;
    if (value.kind === "payment") return 1;
    if (value.origin === "official") return 2;
    return 3;
}

function managementLabel(value: PluginManagement) {
    if (value.origin === "uploaded") return translate("adminPages.plugins.pluginsPage.customPlugin");
    if (value.kind === "application") return translate("adminPages.plugins.pluginsPage.officialApps");
    return value.kind === "payment" ? translate("adminPages.plugins.pluginsPage.systemPaymentProtocol") : translate("adminPages.plugins.pluginsPage.systemProtocols");
}
