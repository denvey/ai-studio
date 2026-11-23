import { App, Button, Input, Skeleton } from "antd";
import { Switch } from "@/pages/admin/ui/controls";
import { AlertTriangle, BadgeCheck, CircleCheck, CloudDownload, KeyRound, RefreshCw, RotateCcw, Save, Server, ShieldCheck, Trash2, Wifi } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "react-router";

import { cn } from "@/lib/utils";
import { getAdminLibTVSetting, testAdminLibTV, updateAdminLibTVSetting, type AdminLibTVSetting } from "@/services/api/libtv";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, configuredSecretText, SettingsSectionCard } from "../components/admin-ui";
import { currentLocale, translate } from "@/i18n";

type ConnectionTestStatus = "idle" | "testing" | "success" | "error";

export default function LibTVSettingsPage() {
    const { message, modal } = App.useApp();
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const [setting, setSetting] = useState<AdminLibTVSetting | null>(null);
    const [enabled, setEnabled] = useState(false);
    const [token, setToken] = useState("");
    const [clearTokenDraft, setClearTokenDraft] = useState(false);
    const [testUuid, setTestUuid] = useState("");
    const [testStatus, setTestStatus] = useState<ConnectionTestStatus>("idle");
    const [testError, setTestError] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const requestVersionRef = useRef(0);
    const navigationConfirmOpenRef = useRef(false);
    const navigationTriggerRef = useRef<HTMLElement | null>(null);

    const draftHasToken = Boolean(token.trim()) || Boolean(setting?.hasToken && !clearTokenDraft);
    const dirty = Boolean(setting && (enabled !== setting.enabled || Boolean(token.trim()) || clearTokenDraft));
    const enabledDirty = Boolean(setting && enabled !== setting.enabled);
    const credentialDraftLabel = token.trim()
        ? setting?.hasToken
            ? translate("adminPages.settings.libtvSettingsPage.pendingReplacement")
            : translate("adminPages.settings.libtvSettingsPage.pendingAddition")
        : clearTokenDraft
          ? translate("adminPages.settings.libtvSettingsPage.pendingRemoval")
          : setting?.hasToken
            ? translate("adminPages.settings.libtvSettingsPage.configured")
            : translate("account.layout.oss.cdnAuthNone");

    const load = useCallback(
        async (initial = false, announce = false) => {
            const requestVersion = ++requestVersionRef.current;
            if (initial) setLoading(true);
            else setRefreshing(true);
            setLoadError("");
            try {
                const result = await getAdminLibTVSetting();
                if (requestVersion !== requestVersionRef.current) return;
                if (!isAdminLibTVSetting(result.setting)) throw new Error(translate("adminPages.settings.libtvSettingsPage.theServerReturnedInvalidLibTVSettings"));
                setSetting(result.setting);
                setEnabled(result.setting.enabled);
                setToken("");
                setClearTokenDraft(false);
                setSaveError("");
                setTestStatus("idle");
                setTestError("");
                if (announce) message.success(translate("adminPages.settings.libtvSettingsPage.thirdPartySettingsReloaded"));
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.libtvSettingsPage.failedToLoadThirdPartySettings");
                setLoadError(errorMessage);
                if (!initial) message.error(errorMessage);
            } finally {
                if (requestVersion === requestVersionRef.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [message],
    );

    useEffect(() => {
        void load(true);
        return () => {
            requestVersionRef.current += 1;
        };
    }, [load]);

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
            title: translate("adminPages.settings.libtvSettingsPage.discardThirdPartySettingsChanges"),
            content: translate("adminPages.settings.libtvSettingsPage.thisPageHasUnsavedLibTVCredentialOrImportPolicyDrafts"),
            okText: translate("adminPages.settings.libtvSettingsPage.discardAndLeave"),
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
                    const fallback = document.querySelector<HTMLButtonElement>(".admin-third-party-command-actions button");
                    const target = navigationTriggerRef.current?.isConnected ? navigationTriggerRef.current : fallback;
                    target?.focus();
                    navigationTriggerRef.current = null;
                });
            },
        });
    }, [blocker, modal]);

    const resetDraft = () => {
        if (!setting || saving) return;
        setEnabled(setting.enabled);
        setToken("");
        setClearTokenDraft(false);
        setSaveError("");
        message.info(translate("adminPages.settings.libtvSettingsPage.unsavedThirdPartySettingsChangesDiscarded"));
    };

    const requestRefresh = () => {
        if (!dirty) {
            void load(false, true);
            return;
        }
        modal.confirm({
            title: translate("adminPages.settings.libtvSettingsPage.discardChangesAndReload"),
            content: translate("adminPages.settings.libtvSettingsPage.reloadingDiscardsTheCurrentLibTVCredentialsAndImportSwitchDrafts"),
            okText: translate("adminPages.settings.libtvSettingsPage.discardAndRefresh"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => load(false, true),
        });
    };

    const changeToken = (nextToken: string) => {
        setToken(nextToken);
        if (nextToken.trim()) setClearTokenDraft(false);
        setSaveError("");
    };

    const changeEnabled = (nextEnabled: boolean) => {
        if (nextEnabled && !draftHasToken) {
            message.warning(translate("adminPages.settings.libtvSettingsPage.pleaseEnterALibTVTokenBeforeEnablingCanvasImport"));
            return;
        }
        if (!setting || saving || nextEnabled === enabled) return;
        setEnabled(nextEnabled);
        setSaveError("");
    };

    const markTokenForRemoval = () => {
        setToken("");
        setClearTokenDraft(true);
        setEnabled(false);
        setSaveError("");
        message.info(translate("adminPages.settings.libtvSettingsPage.tokenMarkedForRemovalServerSettingsRemainUnchangedUntilYou"));
    };

    const restoreTokenDraft = () => {
        setClearTokenDraft(false);
        setSaveError("");
    };

    async function save() {
        if (!setting) return;
        const nextEnabled = enabled;
        const nextToken = token.trim();
        const clearToken = clearTokenDraft;
        const expectedHasToken = nextToken ? true : clearToken ? false : setting.hasToken;
        if (nextEnabled && !expectedHasToken) {
            message.error(translate("adminPages.settings.libtvSettingsPage.aTokenIsRequiredToEnableLibTVCanvasImport"));
            return;
        }
        setSaving(true);
        setSaveError("");
        try {
            const result = await updateAdminLibTVSetting({ enabled: nextEnabled, token: nextToken || undefined, clearToken: clearToken || undefined });
            if (!isAdminLibTVSetting(result.setting) || result.setting.enabled !== nextEnabled || result.setting.hasToken !== expectedHasToken) {
                throw new Error(translate("adminPages.settings.libtvSettingsPage.theServerSLibTVSettingsDifferFromTheSubmittedValues"));
            }
            setSetting(result.setting);
            setEnabled(result.setting.enabled);
            setToken("");
            setClearTokenDraft(false);
            setTestStatus("idle");
            setTestError("");
            message.success(translate("adminPages.settings.libtvSettingsPage.thirdPartySettingsSaved"));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.libtvSettingsPage.failedToSaveThirdPartySettings");
            setSaveError(translate("adminPages.settings.libtvSettingsPage.noAutomaticRetryWasMadeReloadTheCurrentSettingsBefore", { v0: String(errorMessage) }));
            message.error(errorMessage);
            throw error;
        } finally {
            setSaving(false);
        }
    }

    const submitSave = async () => {
        if (!setting || !dirty) return;
        const nextToken = token.trim();
        const expectedHasToken = nextToken ? true : clearTokenDraft ? false : setting.hasToken;
        if (enabled && !expectedHasToken) {
            message.error(translate("adminPages.settings.libtvSettingsPage.aTokenIsRequiredToEnableLibTVCanvasImport"));
            return;
        }
        try {
            await save();
        } catch {
            // 保存错误已在 save 中就地提示。
        }
    };

    const test = async () => {
        const uuid = testUuid.trim();
        if (!setting?.hasToken) {
            message.error(translate("adminPages.settings.libtvSettingsPage.pleaseSaveTheLibTVTokenBeforeVerifyingTheConnection"));
            return;
        }
        if (!uuid) {
            message.error(translate("adminPages.settings.libtvSettingsPage.pleaseEnterALibTVCanvasUUIDToVerify"));
            return;
        }
        setTestStatus("testing");
        setTestError("");
        try {
            await testAdminLibTV(uuid);
            setTestStatus("success");
            message.success(translate("adminPages.settings.libtvSettingsPage.theSavedLibTVTokenCanReadThisCanvas"));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.libtvSettingsPage.libTVConnectionVerificationFailed");
            setTestStatus("error");
            setTestError(errorMessage);
            message.error(errorMessage);
        }
    };

    if (loading && !setting) {
        return (
            <AdminPageFrame title={translate("adminPages.settings.libtvSettingsPage.thirdPartySettings")} description={translate("adminPages.settings.libtvSettingsPage.configurePlatformCredentialsThenChooseWhetherToAllowUserImports")} scroll>
                <div className="admin-settings-stack admin-third-party-settings" aria-label={translate("adminPages.settings.libtvSettingsPage.loadingThirdPartySettings")} role="status">
                    <div className="admin-third-party-command-bar">
                        <Skeleton active title={{ width: 190 }} paragraph={false} />
                    </div>
                    <div className="admin-third-party-loading-card">
                        <Skeleton active paragraph={{ rows: 8 }} />
                    </div>
                </div>
            </AdminPageFrame>
        );
    }

    if (!setting) {
        return (
            <AdminPageFrame title={translate("adminPages.settings.libtvSettingsPage.thirdPartySettings")} description={translate("adminPages.settings.libtvSettingsPage.configurePlatformCredentialsThenChooseWhetherToAllowUserImports")} scroll>
                <div className="admin-settings-stack admin-third-party-settings">
                    <div className="admin-third-party-load-error" role="alert">
                        <span className="admin-third-party-load-error-icon">
                            <AlertTriangle className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h2>{translate("adminPages.settings.libtvSettingsPage.unableToLoadThirdPartySettings")}</h2>
                            <p>{loadError || translate("adminPages.settings.libtvSettingsPage.noSettingsAreAvailableToDisplayPleaseTryAgainLater")}</p>
                        </div>
                        <Button icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void load(false, true)}>
                            {translate("auth.register.reload")}
                        </Button>
                    </div>
                </div>
            </AdminPageFrame>
        );
    }

    return (
        <AdminPageFrame title={translate("adminPages.settings.libtvSettingsPage.thirdPartySettings")} description={translate("adminPages.settings.libtvSettingsPage.configurePlatformCredentialsThenChooseWhetherToAllowUserImports")} scroll>
            <div className="admin-settings-stack admin-third-party-settings">
                <div className={cn("admin-third-party-command-bar", dirty && "is-dirty")}>
                    <div className="admin-third-party-command-copy" aria-live="polite">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <strong>{dirty ? translate("adminPages.settings.libtvSettingsPage.thirdPartySettingsHaveUnsavedChanges") : translate("adminPages.settings.libtvSettingsPage.thirdPartySettingsAreSyncedWithTheServer")}</strong>
                                <AdminStatusBadge label={dirty ? translate("adminPages.settings.libtvSettingsPage.notYetApplied") : translate("adminPages.settings.libtvSettingsPage.currentServerValue")} tone={dirty ? "warning" : "neutral"} />
                            </div>
                            <p>
                                {dirty
                                    ? translate("adminPages.settings.libtvSettingsPage.credentialsAndImportSettingsAreKeptAsDraftsOnThis")
                                    : translate("adminPages.settings.libtvSettingsPage.onlyLibTVIsCurrentlySupportedPlaintextCredentialsAreSubmittedTo")}
                            </p>
                        </div>
                    </div>
                    <div className="admin-third-party-command-actions">
                        {dirty ? (
                            <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                {translate("adminPages.settings.libtvSettingsPage.discardChanges")}
                            </Button>
                        ) : null}
                        <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={saving} onClick={requestRefresh}>
                            {translate("library.ark.asset.refresh")}
                        </Button>
                    </div>
                </div>

                {loadError || saveError ? (
                    <div className="admin-third-party-inline-alert" role="alert">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                        <span>{saveError || translate("adminPages.settings.libtvSettingsPage.thePageStillShowsTheLastSettingsLoadedSuccessfully", { v0: String(loadError) })}</span>
                    </div>
                ) : null}

                <div id="admin-third-party-libtv" className="admin-settings-anchor">
                    <SettingsSectionCard
                        className="admin-third-party-section admin-third-party-credential-section"
                        icon={<KeyRound className="size-4" aria-hidden="true" />}
                        title={translate("adminPages.settings.libtvSettingsPage.item1ConfigureLibTVServerCredentials")}
                        description={translate("adminPages.settings.libtvSettingsPage.theTokenIsSentOnlyToTheServerAfterSaving", { v0: String(brandName) })}
                        status={<AdminStatusBadge label={credentialDraftLabel} tone={clearTokenDraft ? "warning" : draftHasToken ? "success" : "neutral"} />}
                        footer={!draftHasToken ? <ThirdPartySaveFooter setting={setting} dirty={dirty} saving={saving} refreshing={refreshing} onReset={resetDraft} onSave={submitSave} /> : undefined}
                    >
                        <div className="admin-third-party-provider">
                            <div className="admin-third-party-provider-heading">
                                <span className="admin-third-party-provider-mark">L</span>
                                <div>
                                    <strong>LibTV</strong>
                                    <p>{translate("adminPages.settings.libtvSettingsPage.canvasProjectReadAccess")}</p>
                                </div>
                            </div>
                            <div className="admin-third-party-provider-tags">
                                <AdminStatusBadge label={translate("adminPages.settings.libtvSettingsPage.serverProxy")} tone="info" />
                                <AdminStatusBadge label={translate("adminPages.settings.libtvSettingsPage.readOnlyExternalCanvasAccess")} tone="neutral" />
                                <AdminStatusBadge
                                    label={draftHasToken ? translate("adminPages.settings.libtvSettingsPage.credentialsReady") : translate("adminPages.settings.libtvSettingsPage.credentialsMissing")}
                                    tone={draftHasToken ? "success" : "warning"}
                                />
                            </div>
                        </div>
                        <div className="admin-third-party-credential-panel">
                            <label className="admin-third-party-field-label" htmlFor="admin-libtv-token">
                                LibTV Token
                            </label>
                            <Input.Password
                                id="admin-libtv-token"
                                value={token}
                                onChange={(event) => changeToken(event.target.value)}
                                placeholder={
                                    setting.hasToken && !clearTokenDraft
                                        ? configuredSecretText
                                        : clearTokenDraft
                                          ? translate("adminPages.settings.libtvSettingsPage.markedForRemovalEnterANewTokenToReplaceIt")
                                          : translate("adminPages.settings.libtvSettingsPage.enterLibTVToken")
                                }
                                disabled={saving || refreshing}
                                autoComplete="new-password"
                                aria-describedby="admin-libtv-token-help"
                            />
                            <div id="admin-libtv-token-help" className="admin-third-party-credential-state">
                                <span className={cn("admin-third-party-credential-indicator", draftHasToken && "is-ready", clearTokenDraft && "is-warning")}>
                                    {draftHasToken ? <CircleCheck className="size-4" aria-hidden="true" /> : <AlertTriangle className="size-4" aria-hidden="true" />}
                                    {credentialDraftLabel}
                                </span>
                                <p>
                                    {token.trim()
                                        ? setting.hasToken
                                            ? translate("adminPages.settings.libtvSettingsPage.savingReplacesTheServerCredentialThisValueHasNotBeen")
                                            : translate("adminPages.settings.libtvSettingsPage.savingAddsTheServerCredentialThisValueHasNotBeen")
                                        : clearTokenDraft
                                          ? translate("adminPages.settings.libtvSettingsPage.savingRemovesTheTokenAndDisablesTheImportEntry")
                                          : setting.hasToken
                                            ? translate("adminPages.settings.libtvSettingsPage.savingABlankValueRetainsTheExistingServerToken")
                                            : translate("adminPages.settings.libtvSettingsPage.noTokenIsConfiguredLibTVCannotBeEnabledOrVerified")}
                                </p>
                            </div>
                            <div className="admin-third-party-credential-actions">
                                {clearTokenDraft ? (
                                    <Button icon={<RotateCcw className="size-4" />} disabled={saving || refreshing} onClick={restoreTokenDraft}>
                                        {translate("adminPages.settings.libtvSettingsPage.undoRemoval")}
                                    </Button>
                                ) : setting.hasToken ? (
                                    <Button danger icon={<Trash2 className="size-4" />} disabled={saving || refreshing} onClick={markTokenForRemoval}>
                                        {translate("adminPages.settings.libtvSettingsPage.markForRemoval")}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </SettingsSectionCard>
                </div>

                {draftHasToken ? (
                    <div id="admin-third-party-access" className="admin-settings-anchor">
                        <SettingsSectionCard
                            className="admin-third-party-section admin-third-party-access-section"
                            icon={<CloudDownload className="size-4" aria-hidden="true" />}
                            title={translate("adminPages.settings.libtvSettingsPage.item2AllowUsersToImportLibTVCanvases")}
                            description={translate("adminPages.settings.libtvSettingsPage.controlWhetherRegularUsersCanStartNewLibTVCanvasImports")}
                            status={
                                <AdminStatusBadge
                                    label={
                                        enabledDirty
                                            ? enabled
                                                ? translate("adminPages.settings.libtvSettingsPage.pendingEnable")
                                                : translate("adminPages.settings.libtvSettingsPage.pendingDisable")
                                            : enabled
                                              ? translate("adminPages.settings.libtvSettingsPage.entryEnabled")
                                              : translate("adminPages.settings.libtvSettingsPage.entryDisabled")
                                    }
                                    tone={enabledDirty ? "warning" : enabled ? "success" : "neutral"}
                                />
                            }
                            footer={<ThirdPartySaveFooter setting={setting} dirty={dirty} saving={saving} refreshing={refreshing} onReset={resetDraft} onSave={submitSave} />}
                        >
                            <div className="admin-third-party-policy-control">
                                <div>
                                    <strong>{enabled ? translate("adminPages.settings.libtvSettingsPage.allowNewLibTVImports") : translate("adminPages.settings.libtvSettingsPage.disableNewLibTVImports")}</strong>
                                    <p>
                                        {enabled
                                            ? translate("adminPages.settings.libtvSettingsPage.afterSavingTheServerUsesTheSavedTokenToRead")
                                            : translate("adminPages.settings.libtvSettingsPage.existingImportedNodesAndConnectionsAreRetainedWithoutDeletionOr")}
                                    </p>
                                </div>
                                <div className="admin-third-party-policy-switch">
                                    <span>{enabled ? translate("adminPages.settings.libtvSettingsPage.on") : translate("common.close")}</span>
                                    <Switch aria-label={translate("adminPages.settings.libtvSettingsPage.allowUsersToImportLibTVCanvases")} checked={enabled} disabled={saving || refreshing} onChange={changeEnabled} />
                                </div>
                            </div>
                            <div className="admin-third-party-flow" aria-label={translate("adminPages.settings.libtvSettingsPage.libTVCanvasImportFlow")}>
                                <FlowStep icon={<KeyRound className="size-4" />} label={translate("adminPages.settings.libtvSettingsPage.serverCredentials")} detail={translate("adminPages.settings.libtvSettingsPage.tokenIsNeverReturned")} />
                                <span aria-hidden="true">→</span>
                                <FlowStep icon={<Wifi className="size-4" />} label={translate("adminPages.settings.libtvSettingsPage.readCanvas")} detail={translate("adminPages.settings.libtvSettingsPage.requestByUUID")} />
                                <span aria-hidden="true">→</span>
                                <FlowStep
                                    icon={<CloudDownload className="size-4" />}
                                    label={translate("adminPages.settings.libtvSettingsPage.importInto", { v0: String(brandName) })}
                                    detail={translate("adminPages.settings.libtvSettingsPage.createNodesAndConnections")}
                                />
                            </div>
                        </SettingsSectionCard>
                    </div>
                ) : null}

                {setting.hasToken && !clearTokenDraft ? (
                    <div id="admin-third-party-test" className="admin-settings-anchor">
                        <SettingsSectionCard
                            className="admin-third-party-section admin-third-party-test-card"
                            icon={<Wifi className="size-4" aria-hidden="true" />}
                            title={translate("adminPages.settings.libtvSettingsPage.item3VerifySavedLibTVCredentials")}
                            description={translate("adminPages.settings.libtvSettingsPage.makeAReadOnlyRequestUsingTheTokenCurrentlySaved", { v0: String(brandName) })}
                            status={<TestStatus status={testStatus} />}
                        >
                            <div className="admin-third-party-test-controls">
                                <div className="admin-third-party-test-input">
                                    <label htmlFor="admin-libtv-test-uuid">{translate("adminPages.settings.libtvSettingsPage.accessibleLibTVCanvasUUID")}</label>
                                    <Input
                                        id="admin-libtv-test-uuid"
                                        value={testUuid}
                                        onChange={(event) => {
                                            setTestUuid(event.target.value);
                                            setTestStatus("idle");
                                            setTestError("");
                                        }}
                                        placeholder={translate("adminPages.settings.libtvSettingsPage.enterCanvasUUIDForThisReadOnlyCheck")}
                                        disabled={testStatus === "testing"}
                                    />
                                </div>
                                <Button icon={<Wifi className="size-4" />} loading={testStatus === "testing"} disabled={!setting.hasToken || saving || refreshing} onClick={() => void test()}>
                                    {translate("adminPages.settings.libtvSettingsPage.verifyConnection")}
                                </Button>
                            </div>
                            <div className={cn("admin-third-party-test-note", testStatus === "error" && "is-error", testStatus === "success" && "is-success")} role={testStatus === "error" ? "alert" : "status"}>
                                {testStatus === "success" ? <BadgeCheck className="size-4" aria-hidden="true" /> : testStatus === "error" ? <AlertTriangle className="size-4" aria-hidden="true" /> : <Server className="size-4" aria-hidden="true" />}
                                <span>
                                    {testStatus === "success"
                                        ? translate("adminPages.settings.libtvSettingsPage.verificationSucceededTheSavedServerTokenCanReadThisCanvas")
                                        : testStatus === "error"
                                          ? translate("adminPages.settings.libtvSettingsPage.verificationFailed", { v0: String(testError) })
                                          : token.trim()
                                            ? setting.hasToken
                                                ? translate("adminPages.settings.libtvSettingsPage.theNewTokenHasNotBeenSavedThisVerificationStill")
                                                : translate("adminPages.settings.libtvSettingsPage.theEnteredTokenHasNotBeenSavedSaveChangesBefore")
                                            : translate("adminPages.settings.libtvSettingsPage.verificationMakesARealExternalReadOnlyRequestButDoes")}
                                </span>
                            </div>
                        </SettingsSectionCard>
                    </div>
                ) : null}
            </div>
        </AdminPageFrame>
    );
}

function ThirdPartySaveFooter({ setting, dirty, saving, refreshing, onReset, onSave }: { setting: AdminLibTVSetting; dirty: boolean; saving: boolean; refreshing: boolean; onReset: () => void; onSave: () => Promise<void> }) {
    return (
        <div className="admin-third-party-footer">
            <div className="admin-third-party-footer-note">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <span>
                    {formatSettingTime(setting.updatedAt, translate("adminPages.settings.libtvSettingsPage.libTVSettingsHaveNotBeenSaved"))} {translate("adminPages.settings.libtvSettingsPage.savingDoesNotReadExternalCanvases")}
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {dirty ? (
                    <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={onReset}>
                        {translate("account.settings.memory.actors.restore")}
                    </Button>
                ) : null}
                <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || refreshing} onClick={() => void onSave()}>
                    {translate("adminPages.settings.libtvSettingsPage.saveChanges")}
                </Button>
            </div>
        </div>
    );
}

function FlowStep({ icon, label, detail }: { icon: ReactNode; label: string; detail: string }) {
    return (
        <div className="admin-third-party-flow-step">
            <span>{icon}</span>
            <div>
                <strong>{label}</strong>
                <small>{detail}</small>
            </div>
        </div>
    );
}

function TestStatus({ status }: { status: ConnectionTestStatus }) {
    if (status === "testing") return <AdminStatusBadge label={translate("adminPages.settings.libtvSettingsPage.verifying")} tone="info" />;
    if (status === "success") return <AdminStatusBadge label={translate("adminPages.settings.libtvSettingsPage.verificationSucceeded")} tone="success" />;
    if (status === "error") return <AdminStatusBadge label={translate("adminPages.settings.libtvSettingsPage.verificationFailed2")} tone="error" />;
    return <AdminStatusBadge label={translate("adminPages.settings.libtvSettingsPage.notVerifiedInThisSession")} tone="neutral" />;
}

function isAdminLibTVSetting(value: unknown): value is AdminLibTVSetting {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<AdminLibTVSetting>;
    return typeof candidate.enabled === "boolean" && typeof candidate.hasToken === "boolean" && (candidate.updatedAt === undefined || typeof candidate.updatedAt === "string");
}

function hasValidSettingTime(value?: string) {
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp > 0;
}

function formatSettingTime(value: string | undefined, fallback: string) {
    if (!hasValidSettingTime(value)) return fallback;
    return translate("adminPages.settings.libtvSettingsPage.updated", { v0: String(new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value as string))) });
}
