import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { App, Button, Skeleton } from "antd";
import { Switch } from "@/pages/admin/ui/controls";
import { AlertTriangle, ArrowUpRight, Boxes, Clapperboard, Coins, CornerDownRight, History, ImageIcon, MonitorCog, PlugZap, Quote, RadioTower, RefreshCw, ShieldCheck, ShoppingBag, SlidersHorizontal, Video, Wallet } from "lucide-react";

import { Link } from "react-router";

import { cn } from "@/lib/utils";
import { getAdminFeatureAvailability, updateAdminFeatureAvailability } from "@/services/api/auth";
import { useUserStore, type FeatureAvailability } from "@/stores/use-user-store";
import { AdminStatusBadge } from "./admin-ui";
import { InspirationFeedRow } from "./inspiration-feed-row";
import "./feature-availability-panel.css";
import { translate } from "@/i18n";

type FeatureKey =
    | "shortDramaEnabled"
    | "taskCenterEnabled"
    | "creditsEnabled"
    | "customChannelsEnabled"
    | "inspirationSourcesVisible"
    | "frontendModelsEnabled"
    | "pluginCenterEnabled"
    | "systemPluginsVisibleToUsers"
    | "imageWorkbenchEnabled"
    | "videoWorkbenchEnabled"
    | "ecommerceEnabled"
    | "ecommerceVideoEnabled";

/** 跨分组的依赖：开关本身可以打开，但缺少这一项时功能只部分可用。 */
type FeatureRequirement = { key: FeatureKey; effect: string };

type FeatureRow = {
    key: FeatureKey;
    title: string;
    /** 前台用户在哪里看到它，让管理员把开关和真实入口对上。 */
    location: string;
    description: string;
    icon: ReactNode;
    requires?: FeatureRequirement[];
    /** 只在上级开启时才有意义的子开关，渲染在上级下方。 */
    children?: FeatureRow[];
    link?: { to: string; label: string };
};

type FeatureGroup = {
    id: string;
    title: string;
    description: string;
    icon: ReactNode;
    rows: FeatureRow[];
};

const editableFeatureKeys: FeatureKey[] = [
    "shortDramaEnabled",
    "taskCenterEnabled",
    "creditsEnabled",
    "customChannelsEnabled",
    "inspirationSourcesVisible",
    "imageWorkbenchEnabled",
    "videoWorkbenchEnabled",
    "ecommerceEnabled",
    "ecommerceVideoEnabled",
    "frontendModelsEnabled",
    "pluginCenterEnabled",
    "systemPluginsVisibleToUsers",
];

const featureGroups: FeatureGroup[] = [
    {
        id: "creation",
        title: translate("admin.featureAvailabilityPanel.creationFeatures"),
        description: translate("admin.featureAvailabilityPanel.chooseWhichCreationToolsAppearInTheUserSidebar"),
        icon: <MonitorCog className="size-4" aria-hidden="true" />,
        rows: [
            {
                key: "shortDramaEnabled",
                title: translate("nav.tools.projects"),
                location: translate("admin.featureAvailabilityPanel.sidebarShortDramaProduction"),
                description: translate("admin.featureAvailabilityPanel.disablingHidesTheEntryExistingProjectsAreRetained"),
                icon: <Clapperboard className="size-4" aria-hidden="true" />,
            },
            {
                key: "imageWorkbenchEnabled",
                title: translate("nav.sidebar.toolboxImage"),
                location: translate("admin.featureAvailabilityPanel.sidebarImageGeneration"),
                description: translate("admin.featureAvailabilityPanel.alsoRequiredForTheEcommerceAgentToGenerateProductImages"),
                icon: <ImageIcon className="size-4" aria-hidden="true" />,
            },
            {
                key: "videoWorkbenchEnabled",
                title: translate("nav.sidebar.toolboxVideo"),
                location: translate("admin.featureAvailabilityPanel.sidebarVideoGeneration"),
                description: translate("admin.featureAvailabilityPanel.alsoRequiredForProductVideosExistingCreationsAreRetainedWhen"),
                icon: <Video className="size-4" aria-hidden="true" />,
            },
            {
                key: "ecommerceEnabled",
                title: translate("nav.sidebar.ecommerce"),
                location: translate("admin.featureAvailabilityPanel.sidebarEcommerceAgent"),
                description: translate("admin.featureAvailabilityPanel.disablingHidesTheEntryAndPreventsNewProductCreationsExisting"),
                icon: <ShoppingBag className="size-4" aria-hidden="true" />,
                requires: [{ key: "imageWorkbenchEnabled", effect: translate("admin.featureAvailabilityPanel.usersCannotGenerateProductImages") }],
                link: { to: "/admin/ecommerce/agent", label: translate("admin.featureAvailabilityPanel.eCommerceAgentSettings") },
                children: [
                    {
                        key: "ecommerceVideoEnabled",
                        title: translate("admin.featureAvailabilityPanel.productVideos"),
                        location: translate("admin.featureAvailabilityPanel.insideEcommerceAgent"),
                        description: translate("admin.featureAvailabilityPanel.createVideosFromProductImages"),
                        icon: <Clapperboard className="size-4" aria-hidden="true" />,
                        requires: [{ key: "videoWorkbenchEnabled", effect: translate("admin.featureAvailabilityPanel.productVideosCannotBeGenerated") }],
                    },
                ],
            },
        ],
    },
    {
        id: "tools",
        title: translate("admin.featureAvailabilityPanel.pluginsAndHistory"),
        description: translate("admin.featureAvailabilityPanel.pluginAccessAndCreationHistoryPages"),
        icon: <PlugZap className="size-4" aria-hidden="true" />,
        rows: [
            {
                key: "pluginCenterEnabled",
                title: translate("admin.featureAvailabilityPanel.pluginCenter"),
                location: translate("admin.featureAvailabilityPanel.sidebarPlugins"),
                description: translate("admin.featureAvailabilityPanel.disablingHidesTheEntryAndPreventsUsersFromRunningPlugins"),
                icon: <PlugZap className="size-4" aria-hidden="true" />,
                children: [
                    {
                        key: "systemPluginsVisibleToUsers",
                        title: translate("admin.featureAvailabilityPanel.showSystemPlugins"),
                        location: translate("admin.featureAvailabilityPanel.insidePluginCenter"),
                        description: translate("admin.featureAvailabilityPanel.showSystemProtocolPluginsAndAdministratorUploadedPluginsToRegular"),
                        icon: <ShieldCheck className="size-4" aria-hidden="true" />,
                    },
                ],
            },
            {
                key: "taskCenterEnabled",
                title: translate("admin.featureAvailabilityPanel.taskCenter"),
                location: translate("admin.featureAvailabilityPanel.sidebarCreationHistory"),
                description: translate("admin.featureAvailabilityPanel.disablingOnlyHidesTheHistoryPageGenerationTasksContinue"),
                icon: <History className="size-4" aria-hidden="true" />,
            },
        ],
    },
    {
        id: "models",
        title: translate("admin.featureAvailabilityPanel.modelsAndBilling"),
        description: translate("admin.featureAvailabilityPanel.modelSourcesAvailableToUsersAndWhetherGenerationCostsCredits"),
        icon: <Wallet className="size-4" aria-hidden="true" />,
        rows: [
            {
                key: "customChannelsEnabled",
                title: translate("admin.featureAvailabilityPanel.customChannel"),
                location: translate("admin.featureAvailabilityPanel.settingsChannels"),
                description: translate("admin.featureAvailabilityPanel.allowUsersToAddTheirOwnModelChannelsAndAPI"),
                icon: <RadioTower className="size-4" aria-hidden="true" />,
            },
            {
                key: "creditsEnabled",
                title: translate("admin.featureAvailabilityPanel.creditBilling"),
                location: translate("admin.featureAvailabilityPanel.accountMenuCredits"),
                description: translate("admin.featureAvailabilityPanel.whenDisabledNewTasksNoLongerDeductCreditsExistingBalances"),
                icon: <Coins className="size-4" aria-hidden="true" />,
            },
        ],
    },
    {
        id: "assist",
        title: translate("admin.featureAvailabilityPanel.pageExtras"),
        description: translate("admin.featureAvailabilityPanel.pageElementsThatDoNotAffectGenerationCapabilities"),
        icon: <SlidersHorizontal className="size-4" aria-hidden="true" />,
        rows: [
            {
                key: "inspirationSourcesVisible",
                title: translate("admin.featureAvailabilityPanel.assetAttribution"),
                location: translate("admin.featureAvailabilityPanel.creationHomeInspiration"),
                description: translate("admin.featureAvailabilityPanel.showInspirationSourceAttributionAndSourceFilters"),
                icon: <Quote className="size-4" aria-hidden="true" />,
            },
        ],
    },
];

const allFeatureRows = featureGroups.flatMap((group) => group.rows.flatMap((row) => [row, ...(row.children || [])]));
const featureByKey = new Map(allFeatureRows.map((item) => [item.key, item]));
const parentByKey = new Map(allFeatureRows.flatMap((row) => (row.children || []).map((child) => [child.key, row.key] as const)));

type RowState = "on" | "off" | "partial" | "blocked";

function rowState(features: FeatureAvailability, row: FeatureRow): RowState {
    const parent = parentByKey.get(row.key);
    if (parent && !features[parent]) return "blocked";
    if (!features[row.key]) return "off";
    return unmetRequirements(features, row).length ? "partial" : "on";
}

function unmetRequirements(features: FeatureAvailability, row: FeatureRow) {
    return (row.requires || []).filter((requirement) => !features[requirement.key]);
}

function groupRows(group: FeatureGroup) {
    return group.rows.flatMap((row) => [row, ...(row.children || [])]);
}

function rowDomId(key: FeatureKey) {
    return `admin-feature-${key}`;
}

/** 依赖提示里的名称可点：滚到对应开关并聚焦，修改仍只在那一行完成。 */
function focusFeatureRow(key: FeatureKey) {
    const row = document.getElementById(rowDomId(key));
    if (!row) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    row.querySelector<HTMLButtonElement>("button[role='switch']")?.focus({ preventScroll: true });
}

export default function FeatureAvailabilityPanel() {
    const { message, modal } = App.useApp();
    const setGlobalFeatures = useUserStore((state) => state.setFeatures);
    const [savedFeatures, setSavedFeatures] = useState<FeatureAvailability | null>(null);
    const [draftFeatures, setDraftFeatures] = useState<FeatureAvailability | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [savingKey, setSavingKey] = useState<FeatureKey | null>(null);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const requestVersionRef = useRef(0);
    const saving = savingKey !== null;

    const load = useCallback(
        async (initial = false, announce = false) => {
            const requestVersion = ++requestVersionRef.current;
            if (initial) setLoading(true);
            else setRefreshing(true);
            setLoadError("");
            try {
                const result = await getAdminFeatureAvailability();
                const value = parseFeatureAvailability(result.features);
                if (requestVersion !== requestVersionRef.current) return;
                setSavedFeatures(value);
                setDraftFeatures(value);
                setGlobalFeatures(value);
                setSaveError("");
                if (announce) message.success(translate("admin.featureAvailabilityPanel.reloadedCurrentFeatureStates"));
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                const errorMessage = error instanceof Error ? error.message : translate("admin.featureAvailabilityPanel.failedToLoadFeatureAvailabilitySettings");
                setLoadError(errorMessage);
                if (!initial) message.error(errorMessage);
            } finally {
                if (requestVersion === requestVersionRef.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [message, setGlobalFeatures],
    );

    useEffect(() => {
        void load(true);
        return () => {
            requestVersionRef.current += 1;
        };
    }, [load]);

    const setFeature = async (key: FeatureKey, enabled: boolean) => {
        if (!savedFeatures || saving || savedFeatures[key] === enabled) return;
        const previous = savedFeatures;
        const expected = { ...savedFeatures, [key]: enabled };
        setDraftFeatures(expected);
        setSavingKey(key);
        setSaveError("");
        try {
            const result = await updateAdminFeatureAvailability(toEditablePayload(expected));
            const value = parseFeatureAvailability(result.features);
            if (!sameEditableFeatures(value, expected)) throw new Error(translate("admin.featureAvailabilityPanel.theFeatureStatesReturnedByTheServerDifferFromWhat"));
            setSavedFeatures(value);
            setDraftFeatures(value);
            setGlobalFeatures(value);
            const title = key === "frontendModelsEnabled" ? translate("admin.featureAvailabilityPanel.modelSource") : featureByKey.get(key)?.title || translate("admin.featureAvailabilityPanel.features");
            message.success(key === "frontendModelsEnabled" ? translate("admin.featureAvailabilityPanel.switchedTo", { v0: String(title), v1: String(enabled ? translate("admin.featureAvailabilityPanel.publicModelCatalog") : translate("admin.featureAvailabilityPanel.systemChannel")) }) : translate("admin.featureAvailabilityPanel.isNowTheChangeTakesEffectImmediatelyForUsers", { v0: String(title), v1: String(enabled ? translate("admin.featureAvailabilityPanel.on") : translate("common.close")) }));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : translate("admin.featureAvailabilityPanel.failedToSaveFeatureAvailabilitySettings");
            setDraftFeatures(previous);
            setSaveError(translate("admin.featureAvailabilityPanel.thePreviousStateHasBeenRestored", { v0: String(errorMessage) }));
            message.error(errorMessage);
        } finally {
            setSavingKey(null);
        }
    };

    const requestFeatureChange = (key: FeatureKey, enabled: boolean) => {
        if (!savedFeatures || saving || savedFeatures[key] === enabled) return;
        if (key === "creditsEnabled" && !enabled) {
            modal.confirm({
                title: translate("admin.featureAvailabilityPanel.turnOffUserCredits"),
                content: translate("admin.featureAvailabilityPanel.afterSavingNewlyCreatedTasksAndSystemChannelRequestsNo"),
                okText: translate("admin.featureAvailabilityPanel.confirmClose"),
                cancelText: translate("common.cancel"),
                okButtonProps: { danger: true },
                onOk: () => setFeature(key, false),
            });
            return;
        }
        if (key === "frontendModelsEnabled" && !enabled) {
            modal.confirm({
                title: translate("admin.featureAvailabilityPanel.disableThePublicModelCatalog"),
                content: translate("admin.featureAvailabilityPanel.whenDisabledUsersSelectModelsConfiguredInSystemChannelsDirectly"),
                okText: translate("admin.featureAvailabilityPanel.confirmClose"),
                cancelText: translate("common.cancel"),
                okButtonProps: { danger: true },
                onOk: () => setFeature(key, false),
            });
            return;
        }
        void setFeature(key, enabled);
    };

    if (loading && !draftFeatures) {
        return (
            <div className="admin-settings-stack admin-feature-availability afp" aria-label={translate("admin.featureAvailabilityPanel.loadingFeatureAvailabilitySettings")} role="status">
                <div className="admin-feature-command-bar">
                    <Skeleton active title={{ width: 180 }} paragraph={false} />
                </div>
                {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="afp-group is-loading">
                        <Skeleton active title={{ width: 120 }} paragraph={{ rows: 3 }} />
                    </div>
                ))}
            </div>
        );
    }

    if (!draftFeatures || !savedFeatures) {
        return (
            <div className="admin-settings-stack admin-feature-availability afp">
                <div className="admin-feature-load-error" role="alert">
                    <span className="admin-feature-load-error-icon">
                        <AlertTriangle className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                        <h2>{translate("admin.featureAvailabilityPanel.unableToLoadFeatureAvailabilitySettings")}</h2>
                        <p>{loadError || translate("admin.featureAvailabilityPanel.noSettingsAreAvailableToDisplayTryAgainLater")}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load(true)}>
                        {translate("auth.register.reload")}
                    </Button>
                </div>
            </div>
        );
    }

    const states = allFeatureRows.map((row) => rowState(draftFeatures, row));
    const openCount = states.filter((state) => state === "on" || state === "partial").length;
    const partialCount = states.filter((state) => state === "partial").length;

    return (
        <div className="admin-settings-stack admin-feature-availability afp">
            <div className="admin-feature-command-bar">
                <div className="afp-command-copy" aria-live="polite">
                    <strong>{saving ? translate("admin.featureAvailabilityPanel.saving") : translate("admin.featureAvailabilityPanel.changesSaveAutomaticallyAndTakeEffectImmediately")}</strong>
                    <AdminStatusBadge label={translate("admin.featureAvailabilityPanel.enabled", { v0: String(openCount), v1: String(allFeatureRows.length) })} tone="neutral" />
                    {partialCount ? <AdminStatusBadge label={translate("admin.featureAvailabilityPanel.featuresHaveMissingDependencies", { v0: String(partialCount) })} tone="warning" /> : null}
                    {!savedFeatures.configured ? <AdminStatusBadge label={translate("admin.featureAvailabilityPanel.systemDefault")} tone="neutral" /> : null}
                </div>
                <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={saving} onClick={() => void load(false, true)}>
                    {translate("library.ark.asset.refresh")}
                </Button>
            </div>

            {loadError || saveError ? (
                <div className="admin-feature-inline-alert" role="alert">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                    <span>{saveError || translate("admin.featureAvailabilityPanel.thePageStillShowsTheLastSuccessfullyLoadedState", { v0: String(loadError) })}</span>
                </div>
            ) : null}

            {featureGroups.map((group) => {
                const rows = groupRows(group);
                const enabled = rows.filter((row) => draftFeatures[row.key] && rowState(draftFeatures, row) !== "blocked").length;
                return (
                    <section key={group.id} className="afp-group" aria-labelledby={`afp-group-${group.id}`}>
                        <header className="afp-group-header">
                            <span className="afp-group-icon">{group.icon}</span>
                            <div className="afp-group-copy">
                                <h2 id={`afp-group-${group.id}`}>{group.title}</h2>
                                <p>{group.description}</p>
                            </div>
                            <AdminStatusBadge label={translate("admin.featureAvailabilityPanel.enabled", { v0: String(enabled), v1: String(rows.length) })} tone={enabled === rows.length ? "success" : "neutral"} />
                        </header>
                        <div className="afp-list">
                            {group.id === "models" ? <ModelSourceRow draft={draftFeatures} saving={saving} onChange={requestFeatureChange} /> : null}
                            {group.rows.map((row) => (
                                <div key={row.key} className="afp-tree">
                                    <FeatureRowView row={row} draft={draftFeatures} savingKey={savingKey} onChange={requestFeatureChange} />
                                    {row.children?.map((child) => (
                                        <FeatureRowView key={child.key} row={child} draft={draftFeatures} savingKey={savingKey} onChange={requestFeatureChange} nested />
                                    ))}
                                </div>
                            ))}
                            {group.id === "assist" ? <InspirationFeedRow /> : null}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

function FeatureRowView({ row, draft, savingKey, onChange, nested = false }: { row: FeatureRow; draft: FeatureAvailability; savingKey: FeatureKey | null; onChange: (key: FeatureKey, enabled: boolean) => void; nested?: boolean }) {
    const state = rowState(draft, row);
    const parentKey = parentByKey.get(row.key);
    const parentTitle = parentKey ? featureByKey.get(parentKey)?.title : "";
    const missing = state === "partial" ? unmetRequirements(draft, row) : [];
    const badge =
        state === "on" ? (
            <AdminStatusBadge label={translate("admin.featureAvailabilityPanel.enabled2")} tone="success" />
        ) : state === "partial" ? (
            <AdminStatusBadge label={translate("admin.featureAvailabilityPanel.missingDependencies")} tone="warning" />
        ) : state === "blocked" ? (
            <AdminStatusBadge label={translate("admin.featureAvailabilityPanel.enableFirst", { v0: String(parentTitle) })} tone="neutral" />
        ) : (
            <AdminStatusBadge label={translate("account.feedback.status.closed")} tone="neutral" />
        );

    return (
        <article id={rowDomId(row.key)} className={cn("afp-row", nested && "is-nested", state === "off" && "is-off", state === "blocked" && "is-blocked")}>
            <div className="afp-row-main">
                {nested ? <CornerDownRight className="afp-row-branch size-4" aria-hidden="true" /> : null}
                <span className="afp-row-icon">{row.icon}</span>
                <div className="afp-row-copy">
                    <div className="afp-row-title">
                        <strong>{row.title}</strong>
                        <span className="afp-location">{row.location}</span>
                    </div>
                    <p>
                        {row.description}
                        {row.link ? (
                            <Link to={row.link.to} className="afp-link">
                                {row.link.label}
                                <ArrowUpRight className="size-3" aria-hidden="true" />
                            </Link>
                        ) : null}
                    </p>
                    {missing.map((requirement) => (
                        <p key={requirement.key} className="afp-row-warning">
                            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                            <span>
                                <button type="button" className="afp-dep-link" onClick={() => focusFeatureRow(requirement.key)}>
                                    {featureByKey.get(requirement.key)?.title}
                                </button>
                                {translate("admin.featureAvailabilityPanel.disabled")}{requirement.effect}
                            </span>
                        </p>
                    ))}
                </div>
            </div>
            <div className="afp-row-control">
                {badge}
                <Switch
                    // 上级关闭时子开关不生效，按关闭显示；保存的值不变，上级重新开启后恢复。
                    checked={state !== "blocked" && draft[row.key]}
                    loading={savingKey === row.key}
                    disabled={savingKey !== null || state === "blocked"}
                    onChange={(checked) => onChange(row.key, checked)}
                    aria-label={translate("admin.featureAvailabilityPanel.savedImmediatelyWhenToggled", { v0: String(row.title) })}
                />
            </div>
        </article>
    );
}

function ModelSourceRow({ draft, saving, onChange }: { draft: FeatureAvailability; saving: boolean; onChange: (key: FeatureKey, enabled: boolean) => void }) {
    const options = [
        { value: false, label: translate("admin.featureAvailabilityPanel.systemChannel") },
        { value: true, label: translate("admin.featureAvailabilityPanel.publicModelCatalog") },
    ];
    return (
        <article id={rowDomId("frontendModelsEnabled")} className="afp-row">
            <div className="afp-row-main">
                <span className="afp-row-icon">
                    <Boxes className="size-4" aria-hidden="true" />
                </span>
                <div className="afp-row-copy">
                    <div className="afp-row-title">
                        <strong>{translate("admin.featureAvailabilityPanel.modelSource")}</strong>
                        <span className="afp-location">{translate("admin.featureAvailabilityPanel.allModelSelectors")}</span>
                    </div>
                    <p>
                        {draft.frontendModelsEnabled ? translate("admin.featureAvailabilityPanel.usersOnlySeeModelsCuratedInThePublicModelCatalog") : translate("admin.featureAvailabilityPanel.usersSelectEnabledModelsDirectlyFromSystemChannels")}
                        <Link to="/admin/models" className="afp-link">
                            {translate("admin.featureAvailabilityPanel.configurePublicModels")}
                            <ArrowUpRight className="size-3" aria-hidden="true" />
                        </Link>
                    </p>
                </div>
            </div>
            <div className="afp-row-control">
                <div className="afp-source" role="radiogroup" aria-label={translate("admin.featureAvailabilityPanel.chooseTheUserModelSource")}>
                    {options.map((option) => (
                        <button
                            key={option.label}
                            type="button"
                            role="radio"
                            aria-checked={draft.frontendModelsEnabled === option.value}
                            disabled={saving}
                            className={cn(draft.frontendModelsEnabled === option.value && "is-selected")}
                            onClick={() => onChange("frontendModelsEnabled", option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>
        </article>
    );
}

function toEditablePayload(features: FeatureAvailability) {
    return {
        shortDramaEnabled: features.shortDramaEnabled,
        taskCenterEnabled: features.taskCenterEnabled,
        creditsEnabled: features.creditsEnabled,
        customChannelsEnabled: features.customChannelsEnabled,
        inspirationSourcesVisible: features.inspirationSourcesVisible,
        imageWorkbenchEnabled: features.imageWorkbenchEnabled,
        videoWorkbenchEnabled: features.videoWorkbenchEnabled,
        ecommerceEnabled: features.ecommerceEnabled,
        ecommerceVideoEnabled: features.ecommerceVideoEnabled,
        frontendModelsEnabled: features.frontendModelsEnabled,
        pluginCenterEnabled: features.pluginCenterEnabled,
        systemPluginsVisibleToUsers: features.systemPluginsVisibleToUsers,
    };
}

function sameEditableFeatures(left: FeatureAvailability, right: FeatureAvailability) {
    return editableFeatureKeys.every((key) => left[key] === right[key]);
}

function parseFeatureAvailability(value: unknown): FeatureAvailability {
    if (!value || typeof value !== "object") throw new Error(translate("admin.featureAvailabilityPanel.invalidFeatureAvailabilityResponseFormat"));
    const record = value as Record<string, unknown>;
    for (const key of editableFeatureKeys) {
        if (typeof record[key] !== "boolean") throw new Error(translate("admin.featureAvailabilityPanel.theFeatureAvailabilityResponseHasNoValidToggleStates"));
    }
    return {
        welcomeEnabled: record.welcomeEnabled as boolean,
        shortDramaEnabled: record.shortDramaEnabled as boolean,
        taskCenterEnabled: record.taskCenterEnabled as boolean,
        creditsEnabled: record.creditsEnabled as boolean,
        customChannelsEnabled: record.customChannelsEnabled as boolean,
        inspirationSourcesVisible: record.inspirationSourcesVisible as boolean,
        imageWorkbenchEnabled: record.imageWorkbenchEnabled as boolean,
        videoWorkbenchEnabled: record.videoWorkbenchEnabled as boolean,
        ecommerceEnabled: record.ecommerceEnabled as boolean,
        ecommerceVideoEnabled: record.ecommerceVideoEnabled as boolean,
        frontendModelsEnabled: record.frontendModelsEnabled as boolean,
        pluginCenterEnabled: record.pluginCenterEnabled as boolean,
        systemPluginsVisibleToUsers: record.systemPluginsVisibleToUsers as boolean,
        configured: typeof record.configured === "boolean" ? record.configured : undefined,
        updatedBy: typeof record.updatedBy === "string" ? record.updatedBy : undefined,
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    };
}
