import { App, Button, Input, Skeleton, type InputRef } from "antd";
import { AlertTriangle, Brush, KeyRound, RefreshCw, RotateCcw, Save, Shapes } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router";

import { drawingEngineLabel, isDrawingEngineAvailable, type CanvasDrawingEngine, type CanvasDrawingEngineSetting } from "@/lib/canvas/canvas-drawing-engine";
import { cn } from "@/lib/utils";
import { getAdminDrawingEngineSetting, updateAdminDrawingEngineSetting } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";
import { translate } from "@/i18n";


type DrawingEngineDraft = {
    defaultEngine: CanvasDrawingEngine;
    tldrawLicenseKey: string;
};

const engineOptions: Array<{
    value: CanvasDrawingEngine;
    title: string;
    description: string;
}> = [
    {
        value: "excalidraw",
        title: "Excalidraw",
        description: translate("adminPages.settings.drawingEngineSettingsPage.noLicenseRequiredSuitableForSketchesStructuralAnnotationsAndLightweight"),
    },
    {
        value: "tldraw",
        title: "tldraw",
        description: translate("adminPages.settings.drawingEngineSettingsPage.requiresABrowserLicenseKeyAlsoUsedToOpenExisting"),
    },
];

export default function DrawingEngineSettingsPage() {
    const { message, modal } = App.useApp();
    const setDrawingEngine = useUserStore((state) => state.setDrawingEngine);
    const [savedSetting, setSavedSetting] = useState<CanvasDrawingEngineSetting | null>(null);
    const [draft, setDraft] = useState<DrawingEngineDraft | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const requestVersionRef = useRef(0);
    const navigationConfirmOpenRef = useRef(false);
    const navigationTriggerRef = useRef<HTMLElement | null>(null);
    const licenseInputRef = useRef<InputRef>(null);

    const load = useCallback(
        async (initial = false, announce = false) => {
            const requestVersion = ++requestVersionRef.current;
            if (initial) setLoading(true);
            else setRefreshing(true);
            setLoadError("");
            try {
                const result = await getAdminDrawingEngineSetting();
                const setting = parseDrawingEngineSetting(result.setting);
                if (requestVersion !== requestVersionRef.current) return;
                setSavedSetting(setting);
                setDraft(toDraft(setting));
                setDrawingEngine(setting);
                setSaveError("");
                if (announce) message.success(translate("adminPages.settings.drawingEngineSettingsPage.currentDrawingToolSettingsReloaded"));
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.drawingEngineSettingsPage.failedToLoadDrawingToolSettings");
                setLoadError(errorMessage);
                if (!initial) message.error(errorMessage);
            } finally {
                if (requestVersion === requestVersionRef.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [message, setDrawingEngine],
    );

    useEffect(() => {
        void load(true);
        return () => {
            requestVersionRef.current += 1;
        };
    }, [load]);

    const normalizedDraft = draft ? normalizeDraft(draft) : null;
    const dirtyFields = useMemo(() => {
        if (!savedSetting || !normalizedDraft) return [];
        const fields: Array<"defaultEngine" | "tldrawLicenseKey"> = [];
        if (savedSetting.defaultEngine !== normalizedDraft.defaultEngine) fields.push("defaultEngine");
        if ((savedSetting.tldrawLicenseKey || "").trim() !== normalizedDraft.tldrawLicenseKey) fields.push("tldrawLicenseKey");
        return fields;
    }, [normalizedDraft, savedSetting]);
    const dirty = dirtyFields.length > 0;
    const blocker = useBlocker(dirty && !saving);

    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (!dirty || saving) return;
            event.preventDefault();
        };
        window.addEventListener("beforeunload", beforeUnload);
        return () => window.removeEventListener("beforeunload", beforeUnload);
    }, [dirty, saving]);

    useEffect(() => {
        if (blocker.state !== "blocked" || navigationConfirmOpenRef.current) return;
        navigationConfirmOpenRef.current = true;
        navigationTriggerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        modal.confirm({
            title: translate("adminPages.settings.drawingEngineSettingsPage.discardDrawingToolChanges"),
            content: translate("adminPages.settings.drawingEngineSettingsPage.thereAreUnsavedChangesLeavingDiscardsTheDraft", { v0: String(dirtyFields.length) }),
            okText: translate("adminPages.settings.drawingEngineSettingsPage.discardAndLeave"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => {
                navigationConfirmOpenRef.current = false;
                navigationTriggerRef.current = null;
                blocker.proceed();
            },
            onCancel: () => {
                navigationConfirmOpenRef.current = false;
                blocker.reset();
                window.requestAnimationFrame(() => {
                    const fallback = document.querySelector<HTMLButtonElement>(".admin-drawing-command-actions button");
                    const target = navigationTriggerRef.current?.isConnected ? navigationTriggerRef.current : fallback;
                    target?.focus();
                    navigationTriggerRef.current = null;
                });
            },
        });
    }, [blocker, dirtyFields.length, modal]);

    const tldrawAvailable = draft ? isDrawingEngineAvailable("tldraw", draft.tldrawLicenseKey) : false;
    const draftHasStoredLicense = Boolean(normalizedDraft?.tldrawLicenseKey);
    const usingEnvironmentLicense = tldrawAvailable && !draftHasStoredLicense;
    const selectedEngineAvailable = draft ? isDrawingEngineAvailable(draft.defaultEngine, draft.tldrawLicenseKey) : false;

    const resetDraft = () => {
        if (!savedSetting || saving) return;
        setDraft(toDraft(savedSetting));
        setSaveError("");
        message.info(translate("adminPages.settings.drawingEngineSettingsPage.unsavedChangesOnThisPageDiscarded"));
    };

    const requestRefresh = () => {
        if (!dirty) {
            void load(false, true);
            return;
        }
        modal.confirm({
            title: translate("adminPages.settings.drawingEngineSettingsPage.discardChangesAndReload"),
            content: translate("adminPages.settings.drawingEngineSettingsPage.thereAreUnsavedChangesReloadingDiscardsTheDraftAndUses", { v0: String(dirtyFields.length) }),
            okText: translate("adminPages.settings.drawingEngineSettingsPage.discardAndRefresh"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => load(false, true),
        });
    };

    const selectEngine = (engine: CanvasDrawingEngine) => {
        if (!draft || saving) return;
        setDraft({ ...draft, defaultEngine: engine });
        setSaveError("");
    };

    async function save(override?: DrawingEngineDraft) {
        const expected = normalizeDraft(override || draft || { defaultEngine: "excalidraw", tldrawLicenseKey: "" });
        const hasChanges = Boolean(savedSetting && (savedSetting.defaultEngine !== expected.defaultEngine || (savedSetting.tldrawLicenseKey || "").trim() !== expected.tldrawLicenseKey));
        if (!savedSetting || !hasChanges || saving) return;
        if (!isDrawingEngineAvailable(expected.defaultEngine, expected.tldrawLicenseKey)) {
            setSaveError(translate("adminPages.settings.drawingEngineSettingsPage.theSelectedTldrawEditorIsUnavailableConfigureItsLicenseOr"));
            licenseInputRef.current?.focus();
            throw new Error(translate("adminPages.settings.drawingEngineSettingsPage.pleaseConfigureATldrawLicenseKeyFirst"));
        }
        setSaving(true);
        setSaveError("");
        try {
            const result = await updateAdminDrawingEngineSetting(expected);
            const setting = parseDrawingEngineSetting(result.setting);
            if (setting.defaultEngine !== expected.defaultEngine || (setting.tldrawLicenseKey || "").trim() !== expected.tldrawLicenseKey) {
                throw new Error(translate("adminPages.settings.drawingEngineSettingsPage.theServerSDrawingToolSettingsDifferFromTheSubmitted"));
            }
            setSavedSetting(setting);
            setDraft(toDraft(setting));
            setDrawingEngine(setting);
            message.success(translate("adminPages.settings.drawingEngineSettingsPage.drawingToolSettingsSaved"));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.drawingEngineSettingsPage.failedToSaveDrawingToolSettings");
            setSaveError(translate("adminPages.settings.drawingEngineSettingsPage.noAutomaticRetryWasMadeReloadTheCurrentSettingsBefore", { v0: String(errorMessage) }));
            message.error(errorMessage);
            throw error;
        } finally {
            setSaving(false);
        }
    }

    const submitSave = async () => {
        try {
            await save();
        } catch {
            // 校验或保存错误已在 save 中就地提示。
        }
    };

    if (loading && !draft) {
        return (
            <AdminPageFrame title={translate("adminPages.settings.drawingEngineSettingsPage.drawingTools")} description={translate("adminPages.settings.drawingEngineSettingsPage.manageTheDefaultEditorForNewDrawingsAndTldrawLicensing")} scroll>
                <div className="admin-settings-stack admin-drawing-settings" aria-label={translate("adminPages.settings.drawingEngineSettingsPage.loadingDrawingToolSettings")} role="status">
                    <div className="admin-drawing-command-bar">
                        <Skeleton active title={{ width: 180 }} paragraph={false} />
                    </div>
                    <div className="admin-drawing-loading-card">
                        <Skeleton active paragraph={{ rows: 5 }} />
                    </div>
                </div>
            </AdminPageFrame>
        );
    }

    if (!draft || !savedSetting) {
        return (
            <AdminPageFrame title={translate("adminPages.settings.drawingEngineSettingsPage.drawingTools")} description={translate("adminPages.settings.drawingEngineSettingsPage.manageTheDefaultEditorForNewDrawingsAndTldrawLicensing")} scroll>
                <div className="admin-settings-stack admin-drawing-settings">
                    <div className="admin-drawing-load-error" role="alert">
                        <span className="admin-drawing-load-error-icon">
                            <AlertTriangle className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h2>{translate("adminPages.settings.drawingEngineSettingsPage.unableToLoadDrawingToolSettings")}</h2>
                            <p>{loadError || translate("adminPages.settings.drawingEngineSettingsPage.noSettingsAreAvailableToDisplayPleaseTryAgainLater")}</p>
                        </div>
                        <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load(true)}>
                            {translate("auth.register.reload")}
                        </Button>
                    </div>
                </div>
            </AdminPageFrame>
        );
    }

    const licenseStatus = draftHasStoredLicense ? translate("adminPages.settings.drawingEngineSettingsPage.configuredInAdminPanel") : usingEnvironmentLicense ? translate("adminPages.settings.drawingEngineSettingsPage.providedByDeploymentEnvironment") : translate("account.layout.oss.cdnAuthNone");

    return (
        <AdminPageFrame title={translate("adminPages.settings.drawingEngineSettingsPage.drawingTools")} description={translate("adminPages.settings.drawingEngineSettingsPage.manageTheDefaultEditorForNewDrawingsAndTldrawLicensing")} scroll>
            <div className="admin-settings-stack admin-drawing-settings">
                <div className={cn("admin-drawing-command-bar", dirty && "is-dirty")}>
                    <div className="admin-drawing-command-copy" aria-live="polite">
                        <div className="flex flex-wrap items-center gap-2">
                            <strong>{dirty ? translate("adminPages.settings.drawingEngineSettingsPage.unsavedChanges", { v0: String(dirtyFields.length) }) : translate("adminPages.settings.drawingEngineSettingsPage.drawingToolSettingsSynced")}</strong>
                            <AdminStatusBadge label={dirty ? translate("adminPages.settings.drawingEngineSettingsPage.notYetApplied") : savedSetting.configured ? translate("adminPages.settings.drawingEngineSettingsPage.serverSettings") : translate("adminPages.settings.drawingEngineSettingsPage.systemDefault")} tone={dirty ? "warning" : "neutral"} />
                        </div>
                    </div>
                    <div className="admin-drawing-command-actions">
                        {dirty ? (
                            <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                {translate("adminPages.settings.drawingEngineSettingsPage.discardChanges")}
                            </Button>
                        ) : null}
                        <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={saving} onClick={requestRefresh}>
                            {translate("library.ark.asset.refresh")}
                        </Button>
                        <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || !selectedEngineAvailable} onClick={() => void submitSave()}>
                            {translate("adminPages.settings.drawingEngineSettingsPage.saveChanges")}
                        </Button>
                    </div>
                </div>

                {loadError || saveError ? (
                    <div className="admin-drawing-inline-alert" role="alert">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                        <span>{saveError || translate("adminPages.settings.drawingEngineSettingsPage.thePageStillShowsTheLastSettingsLoadedSuccessfully", { v0: String(loadError) })}</span>
                    </div>
                ) : null}

                <div className="admin-drawing-section-grid">
                    <div id="admin-drawing-default-engine" className="admin-settings-anchor">
                        <SettingsSectionCard
                            icon={<Brush className="size-4" aria-hidden="true" />}
                            title={translate("adminPages.settings.drawingEngineSettingsPage.item1ChooseTheDefaultEditorForNewDrawings")}
                            description={translate("adminPages.settings.drawingEngineSettingsPage.appliesOnlyToNewDrawingsExistingNodesAreNotConverted")}
                            status={<AdminStatusBadge label={drawingEngineLabel(draft.defaultEngine)} tone={selectedEngineAvailable ? "info" : "warning"} />}
                        >
                            <div className="admin-drawing-engine-grid" role="group" aria-label={translate("adminPages.settings.drawingEngineSettingsPage.chooseTheDefaultEditorForNewDrawings")}>
                                {engineOptions.map((option) => {
                                    const available = isDrawingEngineAvailable(option.value, draft.tldrawLicenseKey);
                                    const selected = draft.defaultEngine === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            className={cn("admin-drawing-engine-choice", selected && "is-selected", !available && "is-unavailable")}
                                            aria-label={translate("adminPages.settings.drawingEngineSettingsPage.setAsTheDefaultEditorForNewDrawings", { v0: String(option.title), v1: String(available ? "" : translate("adminPages.settings.drawingEngineSettingsPage.configureTheLicenseBeforeSaving")) })}
                                            aria-pressed={selected}
                                            disabled={saving}
                                            onClick={() => selectEngine(option.value)}
                                        >
                                            <span className="admin-drawing-engine-choice-heading">
                                                <span className="admin-drawing-engine-choice-icon">{option.value === "excalidraw" ? <Shapes className="size-4" aria-hidden="true" /> : <Brush className="size-4" aria-hidden="true" />}</span>
                                                <span className="min-w-0 flex-1">
                                                    <strong>{option.title}</strong>
                                                </span>
                                                <AdminStatusBadge label={selected ? translate("adminPages.settings.drawingEngineSettingsPage.selected") : available ? translate("account.settings.channels.ready") : translate("adminPages.settings.drawingEngineSettingsPage.licenseRequired")} tone={selected ? "info" : available ? "success" : "warning"} />
                                            </span>
                                            <span className="admin-drawing-engine-choice-description">{option.description}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </SettingsSectionCard>
                    </div>

                    <div id="admin-drawing-tldraw-license" className="admin-settings-anchor">
                        <SettingsSectionCard
                            icon={<KeyRound className="size-4" aria-hidden="true" />}
                            title={translate("adminPages.settings.drawingEngineSettingsPage.item2ConfigureTldrawLicensingIfNeeded")}
                            description={translate("adminPages.settings.drawingEngineSettingsPage.configureThisWhenSelectingTldrawOrOpeningExistingTldrawDrawings")}
                            status={<AdminStatusBadge label={licenseStatus} tone={tldrawAvailable ? "success" : "warning"} />}
                        >
                            <div className="admin-drawing-license-layout">
                                <div className="admin-drawing-license-field">
                                    <label htmlFor="admin-tldraw-license-key">tldraw License Key</label>
                                    <Input.Password
                                        ref={licenseInputRef}
                                        id="admin-tldraw-license-key"
                                        value={draft.tldrawLicenseKey}
                                        onChange={(event) => {
                                            setDraft({ ...draft, tldrawLicenseKey: event.target.value });
                                            setSaveError("");
                                        }}
                                        placeholder={translate("adminPages.settings.drawingEngineSettingsPage.enterTheBrowserTldrawLicenseKey")}
                                        disabled={saving}
                                        autoComplete="new-password"
                                        aria-describedby="admin-tldraw-license-help"
                                    />
                                    <p id="admin-tldraw-license-help">{translate("adminPages.settings.drawingEngineSettingsPage.leaveBlankToUseTheDeploymentEnvironmentLicenseTldrawIs")}</p>
                                </div>
                            </div>
                        </SettingsSectionCard>
                    </div>
                </div>
            </div>
        </AdminPageFrame>
    );
}

function toDraft(setting: CanvasDrawingEngineSetting): DrawingEngineDraft {
    return {
        defaultEngine: setting.defaultEngine,
        tldrawLicenseKey: setting.tldrawLicenseKey || "",
    };
}

function normalizeDraft(draft: DrawingEngineDraft): DrawingEngineDraft {
    return {
        defaultEngine: draft.defaultEngine,
        tldrawLicenseKey: draft.tldrawLicenseKey.trim(),
    };
}

function parseDrawingEngineSetting(value: unknown): CanvasDrawingEngineSetting {
    if (!value || typeof value !== "object") throw new Error(translate("adminPages.settings.drawingEngineSettingsPage.invalidDrawingToolSettingsResponse"));
    const record = value as Record<string, unknown>;
    if (record.defaultEngine !== "excalidraw" && record.defaultEngine !== "tldraw") throw new Error(translate("adminPages.settings.drawingEngineSettingsPage.drawingToolSettingsAreMissingAValidDefaultEditor"));
    if (record.tldrawLicenseKey !== undefined && typeof record.tldrawLicenseKey !== "string") throw new Error(translate("adminPages.settings.drawingEngineSettingsPage.invalidTldrawLicenseFormatInDrawingToolSettings"));
    return {
        defaultEngine: record.defaultEngine,
        tldrawLicenseKey: typeof record.tldrawLicenseKey === "string" ? record.tldrawLicenseKey : "",
        configured: typeof record.configured === "boolean" ? record.configured : undefined,
        updatedBy: typeof record.updatedBy === "string" ? record.updatedBy : undefined,
        createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    };
}
