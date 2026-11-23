import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { App, Button, Input, Modal, Typography } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { AudioLines, CalendarDays, CheckCircle2, Clock3, CreditCard, ExternalLink, Film, FolderOpen, Image as ImageIcon, MessageSquareText, PlugZap, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/ui/product/empty-state";
import { PageHeader } from "@/components/layout/workspace-page";
import { listRegisteredPlugins } from "@/lib/plugins/plugin-registry";
import "@/lib/plugins/builtin";
import { EAGLE_PLUGIN_ID } from "@/lib/plugins/builtin/eagle";
import { PROMPT_OPTIMIZER_PLUGIN_ID } from "@/lib/plugins/builtin/prompt-optimizer";
import { RUNNINGHUB_PLUGIN_ID } from "@/lib/plugins/builtin/workflows";
import { isOfficialApplicationPluginId } from "@/lib/plugins/official-applications";
import type { PluginManifest, PluginManifestV2, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import { getEagleLibrary, type EagleFolder } from "@/services/api/eagle";
import { fetchPlugins, setUserPluginEnabled, type BackendPlugin, type PluginState } from "@/services/api/plugins";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { usePluginStore } from "@/stores/use-plugin-store";
import { useUserStore } from "@/stores/use-user-store";

import { PluginDetailsModal } from "./plugin-documentation-modals";
import { pluginDisplayDescription } from "./plugin-documentation";
import "./plugins.css";
import { Select } from "@/components/ui/base/select";
import { currentLocale, translate } from "@/i18n";


const categoryLabels: Record<string, string> = {
    provider: translate("shared.plugins.modelChannels"),
    "payment-provider": translate("shared.plugins.paymentProtocols"),
    "canvas-node": translate("canvasB.mention.canvasNodes"),
    workflow: translate("library.tasks.model.workflow"),
    transform: translate("shared.plugins.mediaConversion"),
    "asset-source": translate("create.page.sourcesSummary"),
    "ai-capability": translate("shared.plugins.aICapabilities"),
    "usage-observer": translate("shared.plugins.usageMonitoring"),
    agent: translate("shared.plugins.agent"),
    "import-export": translate("shared.plugins.importAndExport"),
};

const surfaceLabels: Record<string, string> = {
    node: translate("canvasB.mention.canvasNodes"),
    fullscreen: translate("shared.plugins.fullscreenWorkbench"),
    hybrid: translate("shared.plugins.hybridIntegration"),
    "asset-source": translate("canvasB.mention.assetLibrary"),
};

const permissionLabels: Record<string, string> = {
    "canvas.read": translate("shared.plugins.readCanvas"),
    "canvas.write": translate("shared.plugins.editCanvas"),
    "asset.read": translate("shared.plugins.readingAssets"),
    "asset.search": translate("library.picker.search"),
    "asset.import": translate("shared.plugins.importAssets"),
    "asset.upload": translate("shared.plugins.uploadAssets"),
    "generation.run": translate("shared.plugins.runGeneration"),
    "ai.text": translate("shared.plugins.callConfiguredTextVisionModels"),
    "media.read": translate("shared.plugins.readInputMedia"),
    "external.open": translate("shared.plugins.openExternalDetails"),
};

const pluginDateFormatter = new Intl.DateTimeFormat(currentLocale(), { year: "numeric", month: "short", day: "numeric" });

const protocolSectionMeta = [
    { key: "text", label: translate("shared.plugins.textProtocols"), description: translate("shared.plugins.chatReasoningAndStreamingResponses"), icon: MessageSquareText },
    { key: "image", label: translate("shared.plugins.imageProtocols"), description: translate("shared.plugins.generationEditingAndReferenceImages"), icon: ImageIcon },
    { key: "video", label: translate("shared.plugins.videoProtocols"), description: translate("shared.plugins.taskCreationPollingAndMediaResults"), icon: Film },
    { key: "audio", label: translate("shared.plugins.audioProtocols"), description: translate("shared.plugins.speechAndAsynchronousAudioTasks"), icon: AudioLines },
    { key: "payment", label: translate("shared.plugins.paymentProtocols"), description: translate("shared.plugins.paymentsOrderQueriesOrderClosureAndReconciliation"), icon: CreditCard },
] as const;

export default function PluginsPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const user = useUserStore((state) => state.user);
    const features = useUserStore((state) => state.features);
    const installations = usePluginStore((state) => state.installations);
    const ensurePlugin = usePluginStore((state) => state.ensurePlugin);
    const setEnabled = usePluginStore((state) => state.setEnabled);
    const setRuntimeStatuses = usePluginStore((state) => state.setRuntimeStatuses);
    const setPluginStates = usePluginStore((state) => state.setPluginStates);
    const pluginStates = usePluginStore((state) => state.pluginStates);
    const updateConfig = usePluginStore((state) => state.updateConfig);
    const builtinPlugins = useMemo(() => listRegisteredPlugins(), []);
    const [backendPlugins, setBackendPlugins] = useState<BackendPlugin[]>([]);
    const [backendPluginsLoading, setBackendPluginsLoading] = useState(false);
    const [settingsPluginId, setSettingsPluginId] = useState<string | null>(null);
    const [detailsPluginId, setDetailsPluginId] = useState<string | null>(null);
    const [detailsRestoreFocus, setDetailsRestoreFocus] = useState(false);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
    const [trustFilter, setTrustFilter] = useState<"all" | "trusted">("all");
    const [eagleBaseUrl, setEagleBaseUrl] = useState("http://localhost:41595");
    const [eagleAutoUploadGenerated, setEagleAutoUploadGenerated] = useState(true);
    const [eagleGeneratedFolderId, setEagleGeneratedFolderId] = useState("");
    const [eagleFolders, setEagleFolders] = useState<EagleFolder[]>([]);
    const [eagleFoldersLoading, setEagleFoldersLoading] = useState(false);
    const [eagleFoldersError, setEagleFoldersError] = useState("");

    useEffect(() => {
        for (const plugin of builtinPlugins) ensurePlugin(plugin.manifest);
    }, [builtinPlugins, ensurePlugin]);

    const reloadBackendPlugins = async () => {
        setBackendPluginsLoading(true);
        try {
            const result = await fetchPlugins();
            setBackendPlugins(result.plugins);
            setPluginStates(result.states);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.plugins.failedToLoadPluginCenter"));
            setBackendPlugins([]);
        } finally {
            setBackendPluginsLoading(false);
        }
    };

    useEffect(() => {
        void reloadBackendPlugins();
    }, [user?.id]);

    const remotePlugins = useMemo(() => backendPlugins.map(toRegisteredPlugin), [backendPlugins]);
    const registeredPlugins = useMemo(() => {
        const byId = new Map(builtinPlugins.map((plugin) => [plugin.manifest.id, plugin]));
        for (const plugin of remotePlugins) byId.set(plugin.manifest.id, plugin);
        return [...byId.values()];
    }, [builtinPlugins, remotePlugins]);
    const backendPluginById = useMemo(() => new Map(backendPlugins.map((plugin) => [plugin.manifest.id, plugin])), [backendPlugins]);

    const eagle = installations.find((item) => item.manifest.id === EAGLE_PLUGIN_ID);

    useEffect(() => {
        const configured = eagle?.config.baseUrl;
        if (typeof configured === "string" && configured.trim()) setEagleBaseUrl(configured);
        const autoUpload = eagle?.config.autoUploadGenerated;
        setEagleAutoUploadGenerated(autoUpload !== false && autoUpload !== "false");
        const folderId = eagle?.config.generatedFolderId;
        setEagleGeneratedFolderId(typeof folderId === "string" ? folderId : "");
    }, [eagle?.config.baseUrl, eagle?.config.autoUploadGenerated, eagle?.config.generatedFolderId]);

    const filteredPlugins = useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase();
        return registeredPlugins.filter((plugin) => {
            const state = pluginStates[plugin.manifest.id];
            const isApplicationPlugin = backendPluginById.get(plugin.manifest.id)?.management.kind === "application" || isOfficialApplicationPluginId(plugin.manifest.id);
            if (user?.role !== "admin" && !features.systemPluginsVisibleToUsers && !isApplicationPlugin) return false;
            const installation = installations.find((item) => item.manifest.id === plugin.manifest.id);
            const enabled = state?.effectiveEnabled ?? Boolean(installation?.enabled);
            const manifest = plugin.manifest;
            const contributionKinds = contributionKindsFor(manifest);
            const searchableText = [manifest.name, pluginDisplayDescription(manifest), manifest.description, manifest.author, manifest.id, ...contributionKinds.map((kind) => categoryLabels[kind] || kind)].filter(Boolean).join(" ").toLocaleLowerCase();
            if (normalizedSearch && !searchableText.includes(normalizedSearch)) return false;
            if (categoryFilter !== "all" && !pluginMatchesCategory(manifest, categoryFilter)) return false;
            if (trustFilter === "trusted" && !manifest.trusted) return false;
            if (statusFilter === "enabled" && !enabled) return false;
            if (statusFilter === "disabled" && enabled) return false;
            return true;
        });
    }, [backendPluginById, categoryFilter, features.systemPluginsVisibleToUsers, installations, pluginStates, registeredPlugins, search, statusFilter, trustFilter, user?.role]);

    const pluginSections = useMemo(
        () =>
            [
                ...protocolSectionMeta.map((section) => ({ ...section, plugins: filteredPlugins.filter((plugin) => pluginMatchesCategory(plugin.manifest, section.key)) })),
                { key: "other", label: translate("shared.plugins.appPlugins"), description: translate("shared.plugins.canvasAssetAndWorkflowExtensions"), icon: PlugZap, plugins: filteredPlugins.filter((plugin) => pluginMatchesCategory(plugin.manifest, "other")) },
            ].filter((section) => categoryFilter === "all" || section.key === categoryFilter),
        [categoryFilter, filteredPlugins],
    );

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const selectCategory = (key: string) => {
        setCategoryFilter(key);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    };

    const categoryCounts = useMemo(() => {
        const visiblePlugins = registeredPlugins.filter((plugin) => user?.role === "admin" || features.systemPluginsVisibleToUsers || isOfficialApplicationPluginId(plugin.manifest.id));
        const counts: Record<string, number> = { all: visiblePlugins.length, text: 0, image: 0, video: 0, audio: 0, payment: 0, other: 0 };
        for (const plugin of visiblePlugins) {
            for (const section of protocolSectionMeta) {
                if (pluginMatchesCategory(plugin.manifest, section.key)) counts[section.key] += 1;
            }
            if (pluginMatchesCategory(plugin.manifest, "other")) counts.other += 1;
        }
        return counts;
    }, [features.systemPluginsVisibleToUsers, registeredPlugins, user?.role]);

    const settingsPlugin = settingsPluginId ? registeredPlugins.find((plugin) => plugin.manifest.id === settingsPluginId) : undefined;
    const settingsInstallation = settingsPlugin ? installations.find((item) => item.manifest.id === settingsPlugin.manifest.id) : undefined;
    const settingsEnabled = settingsPlugin ? (pluginStates[settingsPlugin.manifest.id]?.effectiveEnabled ?? Boolean(settingsInstallation?.enabled)) : false;
    const detailsPlugin = detailsPluginId ? registeredPlugins.find((plugin) => plugin.manifest.id === detailsPluginId) : undefined;

    const hasPluginConfiguration = (plugin: RegisteredPlugin) => Boolean(plugin.manifest.configuration?.fields?.length);
    const canConfigurePlugin = (plugin: RegisteredPlugin) => Boolean(pluginStates[plugin.manifest.id]?.canConfigure) && (hasPluginConfiguration(plugin) || plugin.manifest.id === RUNNINGHUB_PLUGIN_ID);

    const isPluginEnabled = (plugin: RegisteredPlugin, installation = installations.find((item) => item.manifest.id === plugin.manifest.id)) => pluginStates[plugin.manifest.id]?.effectiveEnabled ?? Boolean(installation?.enabled);

    const togglePlugin = async (plugin: RegisteredPlugin, enabled: boolean) => {
        try {
            const next = await setUserPluginEnabled(plugin.manifest.id, enabled);
            setEnabled(plugin.manifest.id, enabled);
            setPluginStates({ ...usePluginStore.getState().pluginStates, [next.pluginId]: next });
            if (next.pluginId === RUNNINGHUB_PLUGIN_ID) {
                setRuntimeStatuses({ ...usePluginStore.getState().runtimeStatuses, [next.pluginId]: next.effectiveEnabled ? "enabled" : "disabled" });
            }
            message.success(`${plugin.manifest.name}${enabled ? translate("account.layout.oss.enabled") : translate("shared.plugins.disabled")}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.plugins.failedToUpdatePluginStatus"));
        }
    };

    const loadEagleFolders = async (url = eagleBaseUrl) => {
        setEagleFoldersLoading(true);
        setEagleFoldersError("");
        try {
            const result = await getEagleLibrary(url.trim().replace(/\/$/, ""));
            setEagleFolders(result.library.folders || []);
        } catch (reason) {
            setEagleFoldersError(reason instanceof Error ? reason.message : translate("shared.plugins.failedToLoadEagleFolders"));
            setEagleFolders([]);
        } finally {
            setEagleFoldersLoading(false);
        }
    };

    const saveEagleConfig = () => {
        const baseUrl = eagleBaseUrl.trim().replace(/\/$/, "");
        if (!/^https?:\/\//i.test(baseUrl)) {
            message.error(translate("shared.plugins.eagleURLMustStartWithHttpOrHttps"));
            return;
        }
        updateConfig(EAGLE_PLUGIN_ID, { baseUrl, autoUploadGenerated: eagleAutoUploadGenerated, generatedFolderId: eagleGeneratedFolderId });
        message.success(translate("shared.plugins.eaglePluginSettingsSaved"));
    };

    return (
        <main className="app-workspace-page plugins-page flex h-full min-h-0 flex-col text-foreground">
            <div ref={scrollContainerRef} className="app-workspace-scroll min-h-0 flex-1 overflow-y-auto">
                <div className="plugins-page-layout">
                    <aside className="plugins-sidebar" aria-label={translate("shared.plugins.pluginCategories")}>
                        <div className="plugins-sidebar-heading">
                            <PageHeader title={translate("shared.plugins.pluginCenter")} description={translate("shared.plugins.connectModelsAssetsAndWorkflowsToExpandYourCreativeTools")} />
                        </div>
                        <nav className="plugins-sidebar-nav">
                            <button type="button" className={`plugins-sidebar-item${categoryFilter === "all" ? " is-active" : ""}`} aria-current={categoryFilter === "all" ? "page" : undefined} onClick={() => selectCategory("all")}>
                                <span className="plugins-sidebar-item-label">
                                    <PlugZap className="size-4" />
                                    {translate("shared.plugins.allPlugins")}
                                </span>
                                <span>{categoryCounts.all}</span>
                            </button>
                            {protocolSectionMeta.map((section) => {
                                const SectionIcon = section.icon;
                                return (
                                    <button
                                        key={section.key}
                                        type="button"
                                        className={`plugins-sidebar-item${categoryFilter === section.key ? " is-active" : ""}`}
                                        aria-current={categoryFilter === section.key ? "page" : undefined}
                                        onClick={() => selectCategory(section.key)}
                                    >
                                        <span className="plugins-sidebar-item-label">
                                            <SectionIcon className="size-4" />
                                            {section.label}
                                        </span>
                                        <span>{categoryCounts[section.key] || 0}</span>
                                    </button>
                                );
                            })}
                            <button type="button" className={`plugins-sidebar-item${categoryFilter === "other" ? " is-active" : ""}`} aria-current={categoryFilter === "other" ? "page" : undefined} onClick={() => selectCategory("other")}>
                                <span className="plugins-sidebar-item-label">
                                    <PlugZap className="size-4" />
                                    {translate("shared.plugins.appPlugins")}
                                </span>
                                <span>{categoryCounts.other}</span>
                            </button>
                        </nav>
                    </aside>
                    <div className="plugins-page-content">
                        <CollectionToolbar label={translate("shared.plugins.filterPlugins")} trailing={<div className="plugins-toolbar-actions">
                                <Button icon={<RefreshCw className="size-4" />} loading={backendPluginsLoading} onClick={() => void reloadBackendPlugins()}>
                                    {translate("shared.plugins.refreshPlugins")}
                                </Button>
                                {user?.role === "admin" ? (
                                    <Button type="primary" onClick={() => navigate("/admin/plugins")}>
                                        {translate("shared.plugins.adminPluginManagement")}
                                    </Button>
                                ) : null}
                            </div>}>
                            <Input
                                className="plugins-search"
                                prefix={<Search className="size-4 text-foreground/38" aria-hidden="true" />}
                                value={search}
                                allowClear
                                placeholder={translate("shared.plugins.searchPluginNamesDescriptionsOrAuthors")}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                            <Select
                                className="plugins-filter"
                                value={statusFilter}
                                options={[
                                    { value: "all", label: translate("library.ark.expiry.all") },
                                    { value: "enabled", label: translate("account.layout.oss.enabled") },
                                    { value: "disabled", label: translate("shared.plugins.disabled") },
                                ]}
                                onChange={(value) => setStatusFilter(value as "all" | "enabled" | "disabled")}
                                aria-label={translate("shared.plugins.filterByStatus")}
                            />
                            <Select
                                className="plugins-filter"
                                value={trustFilter}
                                options={[
                                    { value: "all", label: translate("shared.plugins.allSources") },
                                    { value: "trusted", label: translate("shared.plugins.trustedPlugins") },
                                ]}
                                onChange={(value) => setTrustFilter(value as "all" | "trusted")}
                                aria-label={translate("shared.plugins.filterBySource")}
                            />
                        </CollectionToolbar>

                        {filteredPlugins.length ? (
                            <div className="plugins-sections">
                                {pluginSections.map((section) => {
                                    const SectionIcon = section.icon;
                                    return (
                                        <section
                                            key={section.key}
                                            id={`plugin-section-${section.key}`}
                                            className="plugin-section"
                                            data-category={section.key === "image" ? "creative" : section.key === "video" ? "drama" : section.key === "audio" ? "social" : section.key === "payment" ? "ecommerce" : undefined}
                                        >
                                            <header className="plugin-section-heading">
                                                <span className="plugin-section-icon">
                                                    <SectionIcon className="size-4" />
                                                </span>
                                                <div>
                                                    <h2>{section.label}</h2>
                                                    <p>{section.description}</p>
                                                </div>
                                                <span className="plugin-section-count">{section.plugins.length}</span>
                                            </header>
                                            {section.plugins.length ? (
                                                <div className="plugins-grid">
                                                    {section.plugins.map((plugin) => {
                                                        const installation = installations.find((item) => item.manifest.id === plugin.manifest.id);
                                                        const remote = backendPluginById.get(plugin.manifest.id);
                                                        const enabled = isPluginEnabled(plugin, installation);
                                                        const trusted = Boolean(plugin.manifest.trusted);
                                                        const state = pluginStates[plugin.manifest.id];
                                                        const sourceKind = pluginSourceKind(plugin, state);
                                                        const sourceLabel = translate(`shared.plugins.${sourceKind}Plugin`);
                                                        const canConfigure = canConfigurePlugin(plugin);
                                                        return (
                                                            <section key={plugin.manifest.id} className={`product-collection-card plugin-card library-card-surface${trusted ? " is-trusted" : ""}`}>
                                                                <button
                                                                    type="button"
                                                                    className="plugin-card-main"
                                                                    aria-label={translate("shared.plugins.viewDocumentation", { v0: String(plugin.manifest.name) })}
                                                                    onClick={(event) => {
                                                                        const openedByKeyboard = event.detail === 0;
                                                                        setDetailsRestoreFocus(openedByKeyboard);
                                                                        setDetailsPluginId(plugin.manifest.id);
                                                                        if (!openedByKeyboard) event.currentTarget.blur();
                                                                    }}
                                                                >
                                                                    <div className="plugin-card-heading">
                                                                        <span className={`plugin-icon-tile${trusted ? " is-trusted" : ""}`} aria-hidden="true">
                                                                            <SectionIcon className="size-5" />
                                                                        </span>
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="plugin-card-title-row">
                                                                                <h3>{plugin.manifest.name}</h3>
                                                                                <span className="plugin-version">v{plugin.manifest.version}</span>
                                                                            </div>
                                                                            <div className="plugin-card-labels">
                                                                                <span className={`plugin-source-label${sourceKind === "system" ? " is-system" : ""}`}>{sourceLabel}</span>
                                                                                {trusted ? (
                                                                                    <span className="plugin-trust-label">
                                                                                        <ShieldCheck className="size-3.5" />
                                                                                        {translate("shared.plugins.trustedPlugins")}
                                                                                    </span>
                                                                                ) : null}
                                                                                <span className="plugin-category-label">
                                                                                    {contributionKindsFor(plugin.manifest)
                                                                                        .map((kind) => categoryLabels[kind] ?? kind)
                                                                                        .join(" · ")}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <p className="plugin-card-description">{pluginDisplayDescription(plugin.manifest)}</p>

                                                                    <div className="plugin-card-meta">
                                                                        <span>
                                                                            <CalendarDays className="size-3.5" />
                                                                            {translate("shared.plugins.published")} {formatPluginDate(plugin.manifest.publishedAt)}
                                                                        </span>
                                                                        <span>
                                                                            <Clock3 className="size-3.5" />
                                                                            {translate("canvasA.assetView.updated")} {formatPluginDate(plugin.manifest.updatedAt)}
                                                                        </span>
                                                                    </div>

                                                                    <div className="plugin-card-tags">
                                                                        {(plugin.manifest.surfaces || []).map((surface) => (
                                                                            <span key={surface}>{surfaceLabels[surface] ?? surface}</span>
                                                                        ))}
                                                                        {providerCapabilitiesFor(plugin.manifest).map((capability) => (
                                                                            <span key={capability}>{capabilityLabel(capability)}</span>
                                                                        ))}
                                                                        {plugin.manifest.contributes.providers?.some((provider) => provider.poll) ? <span>{translate("shared.plugins.asyncPolling")}</span> : null}
                                                                        <span>{plugin.manifest.permissions.length} {translate("shared.plugins.capabilities")}</span>
                                                                    </div>
                                                                </button>

                                                                <div className="plugin-card-actions">
                                                                    <span role="status" className={`settings-channel-status ${enabled ? "is-ready" : ""}`}>
                                                                        <i aria-hidden="true" />
                                                                        {!state?.platformAvailable && state?.blockedReason ? state.blockedReason : enabled ? translate("account.layout.oss.enabled") : translate("shared.plugins.disabled")}
                                                                    </span>
                                                                    <Switch
                                                                        className="plugin-state-switch"
                                                                        disabled={!state?.canToggle}
                                                                        checked={enabled}
                                                                        aria-label={translate("shared.plugins.currently", { v0: String(plugin.manifest.name), v1: String(enabled ? translate("shared.plugins.enabledClickToDisable") : translate("shared.plugins.disabledClickToEnable")) })}
                                                                        title={state?.blockedReason}
                                                                        onChange={(checked) => void togglePlugin(plugin, checked)}
                                                                    />
                                                                    {canConfigure ? (
                                                                        <Button
                                                                            className="plugin-settings-button"
                                                                            icon={<Settings2 className="size-4" />}
                                                                            aria-expanded={settingsPluginId === plugin.manifest.id}
                                                                            aria-haspopup="dialog"
                                                                            onClick={() => setSettingsPluginId(plugin.manifest.id)}
                                                                        >
                                                                            {translate("nav.tools.settings")}
                                                                        </Button>
                                                                    ) : null}
                                                                </div>

                                                                {installation?.lastError || remote?.error ? (
                                                                    <Typography.Text type="danger" className="plugin-error" role="alert">
                                                                        {installation?.lastError || remote?.error}
                                                                    </Typography.Text>
                                                                ) : null}
                                                            </section>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="plugin-section-empty-hint">
                                                    <span>{translate("shared.plugins.noPluginsOfThisTypeYet")}</span>
                                                </div>
                                            )}
                                        </section>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyState
                                className="min-h-[260px] rounded-[var(--plugins-card-radius)] bg-foreground/[0.03]"
                                icon={SlidersHorizontal}
                                title={translate("shared.plugins.noMatchingPlugins")}
                                description={translate("shared.plugins.tryClearingTheSearchOrBroadeningYourFilters")}
                                action={
                                    <Button
                                        onClick={() => {
                                            setSearch("");
                                            setCategoryFilter("all");
                                            setStatusFilter("all");
                                            setTrustFilter("all");
                                        }}
                                    >
                                        {translate("account.layout.state.clearFilters")}
                                    </Button>
                                }
                            />
                        )}

                        <Modal
                            className="workspace-modal workspace-modal-wide plugin-settings-modal"
                            title={settingsPlugin ? translate("shared.plugins.settings", { v0: String(settingsPlugin.manifest.name) }) : null}
                            open={Boolean(settingsPlugin)}
                            centered
                            footer={null}
                            destroyOnHidden
                            onCancel={() => setSettingsPluginId(null)}
                            styles={{ body: { maxHeight: "min(72vh, 760px)", overflowY: "auto", overscrollBehavior: "contain" } }}
                        >
                            {settingsPlugin ? (
                                <div className="plugin-settings-panel plugin-settings-modal-panel">
                                    <div className="plugin-settings-heading">
                                        <div>
                                            <p>{translate("shared.plugins.onlySettingsSupportedByThisPluginAreShown")}</p>
                                        </div>
                                        {settingsPlugin.manifest.trusted ? (
                                            <span className="plugin-trust-label">
                                                <ShieldCheck className="size-3.5" />
                                                {translate("shared.plugins.trustedPlugins")}
                                            </span>
                                        ) : (
                                            <span className="plugin-category-label">{translate("shared.plugins.thirdPartyPlugin")}</span>
                                        )}
                                    </div>

                                    {settingsPlugin.manifest.id === EAGLE_PLUGIN_ID ? (
                                        <>
                                            <div className="plugin-settings-fields">
                                                <div className="min-w-0">
                                                    <label htmlFor="eagle-base-url">{translate("shared.plugins.eagleLocalAPIURL")}</label>
                                                    <Input id="eagle-base-url" aria-label={translate("shared.plugins.eagleLocalAPIURL")} value={eagleBaseUrl} onChange={(event) => setEagleBaseUrl(event.target.value)} placeholder="http://localhost:41595" />
                                                    <p>{translate("shared.plugins.eagleMustBeRunningOnThisDevice")}{brandName}{translate("shared.plugins.thePluginReadsAndWritesOriginalEagleFilesDirectly")}</p>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="plugin-setting-label-row">
                                                        <label htmlFor="eagle-auto-upload-generated">{translate("shared.plugins.automaticallyArchiveGeneratedResults")}</label>
                                                        <Switch id="eagle-auto-upload-generated" checked={eagleAutoUploadGenerated} onChange={setEagleAutoUploadGenerated} aria-label={translate("shared.plugins.automaticallyArchiveGeneratedResultsToEagle")} />
                                                    </div>
                                                    <p>{translate("shared.plugins.automaticallyWriteSuccessfulImageVideoAndAudioResultsToEagle")}{brandName}{translate("shared.plugins.localAssetsAreKept")}</p>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="plugin-setting-label-row">
                                                        <label htmlFor="eagle-generated-folder">{translate("shared.plugins.resultDestinationFolder")}</label>
                                                        <Button type="link" size="small" loading={eagleFoldersLoading} onClick={() => void loadEagleFolders()}>
                                                            {translate("shared.plugins.loadFolders")}
                                                        </Button>
                                                    </div>
                                                    <Select
                                                        id="eagle-generated-folder"
                                                        aria-label={translate("shared.plugins.resultDestinationFolder")}
                                                        showSearch
                                                        allowClear
                                                        value={eagleGeneratedFolderId || undefined}
                                                        placeholder={translate("shared.plugins.eagleRootFolder")}
                                                        optionFilterProp="label"
                                                        options={[{ value: "__root__", label: translate("shared.plugins.eagleRootFolder") }, ...eagleFolderOptions(eagleFolders)]}
                                                        onChange={(value) => setEagleGeneratedFolderId(value === "__root__" || !value ? "" : value)}
                                                    />
                                                    <p>{eagleFoldersError || translate("shared.plugins.writesToEagleSRootFolderByDefaultSelectA")}</p>
                                                </div>
                                            </div>
                                            <div className="plugin-settings-actions">
                                                <Button type="primary" icon={<CheckCircle2 className="size-4" />} onClick={saveEagleConfig}>
                                                    {translate("shared.plugins.saveSettings")}
                                                </Button>
                                                <Button icon={<FolderOpen className="size-4" />} disabled={!settingsEnabled} onClick={() => navigate("/plugins/eagle")}>
                                                    {translate("shared.plugins.openEagleAssetLibrary")}
                                                </Button>
                                                <Button icon={<ExternalLink className="size-4" />} href="https://api.eagle.cool/" target="_blank">
                                                    {translate("shared.plugins.viewAPI")}
                                                </Button>
                                            </div>
                                        </>
                                    ) : settingsPlugin.manifest.id === PROMPT_OPTIMIZER_PLUGIN_ID ? (
                                        <div className="rounded-[var(--r-md)] border border-border/60 bg-muted/25 px-3 py-3 text-[var(--fs-body)] leading-6 text-foreground/70">
                                            <p>{translate("shared.plugins.useOptimizeInTheCreationPageOrThePromptEditor")}</p>
                                            <p className="mt-2 text-[var(--fs-micro)] text-foreground/50">{translate("shared.plugins.thePluginOnlyReplacesThePromptInTheCurrentInput")}</p>
                                        </div>
                                    ) : settingsPlugin.manifest.id === RUNNINGHUB_PLUGIN_ID ? (
                                        <div className="plugin-settings-empty">
                                            <p>{translate("shared.plugins.manageTheRunningHubAPIKeyWorkflowAppAndFieldMappings")}</p>
                                            <Button
                                                type="primary"
                                                icon={<ExternalLink className="size-4" />}
                                                onClick={() => {
                                                    setSettingsPluginId(null);
                                                    navigate("/settings?section=runninghub");
                                                }}
                                            >
                                                {translate("shared.plugins.openWorkflowSettings")}
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="plugin-settings-empty">
                                            {translate("shared.plugins.contributionsIntegrationLocationsAndPermissionsTakeEffectAutomaticallyAccordingTo", { v0: String(contributionKindsFor(settingsPlugin.manifest)
                                                    .map((kind) => categoryLabels[kind] || kind)
                                                    .join("、") || translate("shared.plugins.notDeclared")) })}
                                        </div>
                                    )}

                                    <div className="plugin-permissions">
                                        <div>
                                            <span>{translate("shared.plugins.integrationLocations")}</span>
                                            {(settingsPlugin.manifest.surfaces || []).map((surface) => surfaceLabels[surface] ?? surface).join("、") || translate("shared.plugins.determinedByContributionPoints")}
                                        </div>
                                        <div>
                                            <span>{translate("shared.plugins.pluginCapabilities")}</span>
                                            {settingsPlugin.manifest.permissions.map((permission) => permissionLabels[permission] ?? permission).join("、")}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </Modal>
                        <PluginDetailsModal plugin={detailsPlugin} restoreFocus={detailsRestoreFocus} onClose={() => setDetailsPluginId(null)} />
                    </div>
                </div>
            </div>
        </main>
    );
}

function formatPluginDate(value?: string) {
    if (!value) return translate("shared.plugins.notRecorded");
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? pluginDateFormatter.format(timestamp) : translate("shared.plugins.notRecorded");
}

function toRegisteredPlugin(plugin: BackendPlugin): RegisteredPlugin {
    return { manifest: plugin.manifest, source: plugin.source };
}

function pluginSourceKind(plugin: RegisteredPlugin, state?: PluginState) {
    if (plugin.source === "uploaded") return "custom";
    if (plugin.source === "system") return "system";
    if (state?.canToggle || isOfficialApplicationPluginId(plugin.manifest.id)) return "official";
    return "system";
}

function contributionKindsFor(manifest: PluginManifest | PluginManifestV2): string[] {
    const contributions = manifest.contributes;
    const kinds: string[] = [];
    if (contributions.providers?.length) kinds.push("provider");
    if (contributions.paymentProviders?.length) kinds.push("payment-provider");
    if (contributions.workflows?.length) kinds.push("workflow");
    if (contributions.canvasNodes?.length) kinds.push("canvas-node");
    if (contributions.transforms?.length) kinds.push("transform");
    if (contributions.assetSources?.length) kinds.push("asset-source");
    if (contributions.aiCapabilities?.length) kinds.push("ai-capability");
    if (contributions.usageObservers?.length) kinds.push("usage-observer");
    if (contributions.agents?.length) kinds.push("agent");
    if (contributions.importExport?.length) kinds.push("import-export");
    return kinds;
}

function providerCapabilitiesFor(manifest: PluginManifest | PluginManifestV2) {
    return [...new Set((manifest.contributes.providers || []).flatMap((provider) => provider.capabilities))];
}

function pluginMatchesCategory(manifest: PluginManifest | PluginManifestV2, category: string) {
    const providerCapabilities = providerCapabilitiesFor(manifest);
    const isPaymentProtocol = Boolean(manifest.contributes.paymentProviders?.length);
    if (category === "payment") return isPaymentProtocol;
    if (category === "other") return !isPaymentProtocol && providerCapabilities.length === 0;
    return providerCapabilities.includes(category as "text" | "image" | "video" | "audio");
}

function capabilityLabel(value: string) {
    return ({ text: translate("account.settings.modelConfig.capabilities.text"), image: translate("account.feedback.image"), video: translate("account.feedback.video"), audio: translate("account.settings.modelConfig.capabilities.audio") } as Record<string, string>)[value] || value;
}

function eagleFolderOptions(folders: EagleFolder[]) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const pathFor = (folder: EagleFolder) => {
        const path: string[] = [];
        const seen = new Set<string>();
        let current: EagleFolder | undefined = folder;
        while (current && !seen.has(current.id)) {
            seen.add(current.id);
            path.unshift(current.name);
            current = current.parentId ? byId.get(current.parentId) : undefined;
        }
        return path.join(" / ");
    };
    return folders.map((folder) => ({ value: folder.id, label: pathFor(folder) })).sort((left, right) => left.label.localeCompare(right.label, currentLocale()));
}
