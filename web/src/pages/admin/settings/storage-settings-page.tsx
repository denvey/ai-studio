import { AdminPageFrame } from "../components/admin-shell";
import { AlertTriangle, RefreshCw, Database, RotateCcw, HardDrive, Cloud, Check, ShieldCheck, Server, BadgeCheck, Save, Globe2, LocateFixed, KeyRound, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, Switch } from "@/pages/admin/ui/controls";
import { App, Form, Skeleton, Button, Input } from "antd";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "react-router";

import { type OSSConnectionTestResult, changesRequireOSSRetest, getS3PresetHints, S3_PRESET_OPTIONS, type S3Preset, VOLCENGINE_TOS_REGION_HINT } from "@/lib/oss-settings";
import { getAdminOSSSetting, updateAdminOSSSetting, type AdminOSSSetting, testAdminOSSConnection } from "@/services/api/auth";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { AdminStatusBadge, configuredSecretText, SettingsSectionCard } from "../components/admin-ui";
import { accessKeySecretLabel, formValues, formatSettingTime, hasStorageChanges, isAdminOSSSetting, normalizeStoragePayload, providerDraftValues, storageProviderLabel, storageResponseMatches, type StoragePayload, validateStorageDraft, connectionInput, storageConfigurationReady, providerGuidance, accessKeyIdLabel } from "./storage-settings-model";
import { type OSSFormValues, type StorageMode } from "./storage-settings-model";
import { translate } from "@/i18n";


export { type OSSFormValues, type StorageMode, type StoragePayload } from "./storage-settings-model";

const STORAGE_MODES: Array<{ mode: StorageMode; label: string; short: string; description: string }> = [
    { mode: "local", label: translate("adminPages.settings.storageSettingsPage.serverLocal"), short: translate("adminPages.settings.storageSettingsPage.localDisk"), description: translate("adminPages.settings.storageSettingsPage.newResourcesAreWrittenToThisDeploymentSDataDirectory") },
    { mode: "aliyun", label: translate("account.layout.oss.providers.aliyun"), short: translate("adminPages.settings.storageSettingsPage.objectStorage"), description: translate("adminPages.settings.storageSettingsPage.newResourcesAreWrittenToAnAlibabaCloudBucketWith") },
    { mode: "tencent", label: translate("account.layout.oss.providers.tencent"), short: translate("adminPages.settings.storageSettingsPage.objectStorage"), description: translate("adminPages.settings.storageSettingsPage.newResourcesAreWrittenToATencentCloudBucketThe") },
    { mode: "qiniu", label: translate("account.layout.oss.providers.qiniu"), short: translate("adminPages.settings.storageSettingsPage.objectStorage"), description: translate("adminPages.settings.storageSettingsPage.newResourcesAreUploadedToKodoWithoutABoundDomain") },
    { mode: "volcengine", label: translate("account.layout.oss.providers.volcengine"), short: translate("adminPages.settings.storageSettingsPage.objectStorage"), description: translate("adminPages.settings.storageSettingsPage.newResourcesAreWrittenToAVolcengineBucketAnS3") },
    { mode: "s3", label: translate("account.layout.oss.providers.s3"), short: translate("adminPages.settings.storageSettingsPage.objectStorage"), description: translate("adminPages.settings.storageSettingsPage.supportsAWSS3CloudflareR2BackblazeB2RustFSAndCustom") },
];

export default function StorageSettingsPage() {
    const { message, modal } = App.useApp();
    const brandSlug = useAppearanceStore((state) => state.appearance.brandSlug);
    const [setting, setSetting] = useState<AdminOSSSetting | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<OSSConnectionTestResult | null>(null);
    const [testStale, setTestStale] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [draftMode, setDraftMode] = useState<StorageMode>("local");
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [form] = Form.useForm<OSSFormValues>();
    const requestVersionRef = useRef(0);
    const navigationConfirmOpenRef = useRef(false);
    const navigationTriggerRef = useRef<HTMLElement | null>(null);

    const load = useCallback(
        async (initial = false, announce = false) => {
            const requestVersion = ++requestVersionRef.current;
            if (initial) setLoading(true);
            else setRefreshing(true);
            setLoadError("");
            try {
                const result = await getAdminOSSSetting();
                if (requestVersion !== requestVersionRef.current) return;
                if (!isAdminOSSSetting(result.setting)) throw new Error(translate("adminPages.settings.storageSettingsPage.theServerReturnedInvalidStorageSettings"));
                setSetting(result.setting);
                setTestResult(result.setting.testedAt ? { ok: true, testedAt: result.setting.testedAt, testedDigest: result.setting.testedDigest } : null);
                setTestStale(false);
                setDirty(false);
                setSaveError("");
                if (announce) message.success(translate("adminPages.settings.storageSettingsPage.currentPlatformStorageSettingsReloaded"));
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.storageSettingsPage.failedToLoadObjectStorageSettings");
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

    useEffect(() => {
        if (loading || !setting) return;
        const values = formValues(setting);
        form.setFieldsValue(values);
        setDraftMode(values.mode);
    }, [form, loading, setting]);

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
            title: translate("adminPages.settings.storageSettingsPage.discardStorageServiceChanges"),
            content: translate("adminPages.settings.storageSettingsPage.thisPageHasUnsavedStorageLocationOrConnectionSettingsLeaving"),
            okText: translate("adminPages.settings.storageSettingsPage.discardAndLeave"),
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
                    const fallback = document.querySelector<HTMLButtonElement>(".admin-storage-command-actions button");
                    const target = navigationTriggerRef.current?.isConnected ? navigationTriggerRef.current : fallback;
                    target?.focus();
                    navigationTriggerRef.current = null;
                });
            },
        });
    }, [blocker, modal]);

    const resetDraft = () => {
        if (!setting || saving) return;
        const values = formValues(setting);
        form.setFieldsValue(values);
        form.setFields([]);
        setDraftMode(values.mode);
        setDirty(false);
        setSaveError("");
        setTestResult(setting.testedAt ? { ok: true, testedAt: setting.testedAt, testedDigest: setting.testedDigest } : null);
        setTestStale(false);
        message.info(translate("adminPages.settings.storageSettingsPage.unsavedStorageServiceChangesDiscarded"));
    };

    const requestRefresh = () => {
        if (!dirty) {
            void load(false, true);
            return;
        }
        modal.confirm({
            title: translate("adminPages.settings.storageSettingsPage.discardChangesAndReload"),
            content: translate("adminPages.settings.storageSettingsPage.reloadingDiscardsUnsavedStorageFormValuesAndUsesTheServer"),
            okText: translate("adminPages.settings.storageSettingsPage.discardAndRefresh"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => load(false, true),
        });
    };

    const applyMode = (nextMode: StorageMode): OSSFormValues | null => {
        if (!setting) return null;
        const current = form.getFieldsValue(true);
        const nextValues: Partial<OSSFormValues> = { mode: nextMode };
        if (nextMode !== "local") {
            Object.assign(nextValues, providerDraftValues(nextMode, setting, current.pathPrefix));
        }
        form.setFieldsValue(nextValues);
        form.setFields([]);
        setDraftMode(nextMode);
        setDirty(hasStorageChanges({ ...current, ...nextValues }, setting));
        setTestStale(true);
        setSaveError("");
        return { ...current, ...nextValues } as OSSFormValues;
    };

    const requestModeChange = (nextMode: StorageMode) => {
        if (!setting || nextMode === draftMode || saving || refreshing) return;
        applyMode(nextMode);
    };

    const useBrandPathPrefix = () => {
        if (!setting || saving || refreshing) return;
        const current = form.getFieldsValue(true);
        form.setFieldValue("pathPrefix", brandSlug);
        setDirty(hasStorageChanges({ ...current, pathPrefix: brandSlug }, setting));
        setTestStale(true);
        setSaveError("");
    };

    const save = async (values: OSSFormValues) => {
        if (!setting) return;
        const expected = normalizeStoragePayload(values, setting);
        setSaving(true);
        setSaveError("");
        try {
            const result = await updateAdminOSSSetting(expected);
            if (!isAdminOSSSetting(result.setting) || !storageResponseMatches(result.setting, expected)) throw new Error(translate("adminPages.settings.storageSettingsPage.theServerSStorageSettingsDifferFromTheSubmittedValues"));
            setSetting(result.setting);
            const nextValues = formValues(result.setting);
            form.setFieldsValue(nextValues);
            setDraftMode(nextValues.mode);
            setDirty(false);
            setTestResult(result.setting.testedAt ? { ok: true, testedAt: result.setting.testedAt, testedDigest: result.setting.testedDigest } : null);
            setTestStale(false);
            message.success(translate("adminPages.settings.storageSettingsPage.platformStorageSettingsSaved"));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.storageSettingsPage.failedToSaveStorageSettings");
            setSaveError(translate("adminPages.settings.storageSettingsPage.noAutomaticRetryWasMadeReloadTheCurrentSettingsBefore", { v0: String(errorMessage) }));
            message.error(errorMessage);
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const submitSave = async () => {
        if (!setting) return;
        let values: OSSFormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const validationError = validateStorageDraft(values, setting);
        if (validationError) {
            message.error(validationError);
            return;
        }
        try {
            await save(values);
        } catch {
            // 保存错误已在 save 中就地提示。
        }
    };

    const testConnection = async () => {
        if (!setting) return;
        let values: OSSFormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const validationError = validateStorageDraft(values, setting);
        if (validationError) {
            message.error(validationError);
            return;
        }
        if (values.mode === "local") return;
        setTesting(true);
        try {
            const result = await testAdminOSSConnection(connectionInput(values));
            setTestResult(result);
            setTestStale(false);
            result.ok ? message.success(result.message || translate("account.layout.oss.testPassed")) : message.error(result.message || translate("account.layout.oss.testFailed"));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : translate("account.layout.oss.testFailed");
            setTestResult({ ok: false, message: errorMessage });
            setTestStale(false);
            message.error(errorMessage);
        } finally {
            setTesting(false);
        }
    };

    if (loading && !setting) {
        return (
            <AdminPageFrame title={translate("account.layout.oss.provider")} description={translate("adminPages.settings.storageSettingsPage.configureWhereNewResourcesAreStoredByDefault")} scroll>
                <div className="admin-settings-stack admin-storage-settings" aria-label={translate("adminPages.settings.storageSettingsPage.loadingPlatformStorageSettings")} role="status">
                    <div className="admin-storage-loading-card">
                        <Skeleton active paragraph={{ rows: 7 }} />
                    </div>
                </div>
            </AdminPageFrame>
        );
    }

    if (!setting) {
        return (
            <AdminPageFrame title={translate("account.layout.oss.provider")} description={translate("adminPages.settings.storageSettingsPage.configureWhereNewResourcesAreStoredByDefault")} scroll>
                <div className="admin-settings-stack admin-storage-settings">
                    <div className="admin-storage-load-error" role="alert">
                        <span className="admin-storage-load-error-icon">
                            <AlertTriangle className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h2>{translate("adminPages.settings.storageSettingsPage.unableToLoadPlatformStorageSettings")}</h2>
                            <p>{loadError || translate("adminPages.settings.storageSettingsPage.noSettingsAreAvailableToDisplayPleaseTryAgainLater")}</p>
                        </div>
                        <Button icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void load(false, true)}>
                            {translate("auth.register.reload")}
                        </Button>
                    </div>
                </div>
            </AdminPageFrame>
        );
    }

    const currentValues = form.getFieldsValue(true);
    const normalizedDraft = normalizeStoragePayload(currentValues, setting);
    const hasCurrentProviderSecret = draftMode !== "local" && setting.provider === draftMode && setting.hasAccessKeySecret;

    return (
        <AdminPageFrame title={translate("account.layout.oss.provider")} description={translate("adminPages.settings.storageSettingsPage.configureWhereNewResourcesAreStoredByDefault")} scroll>
            <div className="admin-settings-stack admin-storage-settings">
                <div className={cn("admin-storage-command-bar", dirty && "is-dirty")}>
                    <div className="admin-storage-command-copy" aria-live="polite">
                        <span className="admin-storage-command-icon">
                            <Database className="size-4" aria-hidden="true" />
                        </span>
                        <div>
                            <strong>{dirty ? translate("adminPages.settings.storageSettingsPage.unsavedStorageChanges") : translate("adminPages.settings.storageSettingsPage.currentlyUsing", { v0: String(storageProviderLabel(draftMode)) })}</strong>
                            <p>{dirty ? translate("adminPages.settings.storageSettingsPage.savingAffectsOnlyNewResources") : formatSettingTime(setting.updatedAt, translate("adminPages.settings.storageSettingsPage.useSystemDefault"))}</p>
                        </div>
                    </div>
                    <div className="admin-storage-command-actions">
                        {dirty ? (
                            <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                {translate("adminPages.settings.storageSettingsPage.discardChanges")}
                            </Button>
                        ) : null}
                        <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={saving} onClick={requestRefresh}>
                            {translate("library.ark.asset.refresh")}
                        </Button>
                    </div>
                </div>

                {loadError || saveError ? (
                    <div className="admin-storage-inline-alert" role="alert">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                        <span>{saveError || translate("adminPages.settings.storageSettingsPage.thePageStillShowsTheLastSettingsLoadedSuccessfully", { v0: String(loadError) })}</span>
                    </div>
                ) : null}

                <div id="admin-storage-mode" className="admin-settings-anchor">
                    <SettingsSectionCard
                        className="admin-storage-section admin-storage-mode-section"
                        icon={<HardDrive className="size-4" aria-hidden="true" />}
                        title={translate("adminPages.settings.storageSettingsPage.item1ChooseWhereToStoreNewResources")}
                        description={translate("adminPages.settings.storageSettingsPage.chooseAStorageMethodFirstThisDeterminesTheConnectionDetails")}
                        status={<AdminStatusBadge label={dirty ? translate("adminPages.settings.storageSettingsPage.unsaved") : translate("adminPages.settings.storageSettingsPage.currentSetting")} tone={dirty ? "warning" : "info"} />}
                    >
                        <div className="admin-storage-mode-content">
                            <div className="admin-storage-mode-grid" role="radiogroup" aria-label={translate("adminPages.settings.storageSettingsPage.storageLocationForNewResources")}>
                                {STORAGE_MODES.map((item) => (
                                    <button
                                        key={item.mode}
                                        type="button"
                                        role="radio"
                                        aria-checked={draftMode === item.mode}
                                        className={cn("admin-storage-mode-choice", draftMode === item.mode && "is-selected")}
                                        disabled={loading || refreshing || saving}
                                        onClick={() => requestModeChange(item.mode)}
                                    >
                                        <span className="admin-storage-mode-icon">{item.mode === "local" ? <HardDrive className="size-4" aria-hidden="true" /> : <Cloud className="size-4" aria-hidden="true" />}</span>
                                        <span className="admin-storage-mode-copy">
                                            <strong>{item.label}</strong>
                                            <small>{item.description}</small>
                                        </span>
                                        <span className="admin-storage-mode-meta">{item.short}</span>
                                        {draftMode === item.mode ? (
                                            <span className="admin-storage-mode-selected">
                                                <Check className="size-3.5" aria-hidden="true" />
                                                {translate("adminPages.settings.storageSettingsPage.selected")}
                                            </span>
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                            <div className="admin-storage-history-note">
                                <ShieldCheck className="size-4" aria-hidden="true" />
                                <span>{translate("adminPages.settings.storageSettingsPage.continueToStep2AndSaveSavingAffectsOnlyNew")}</span>
                            </div>
                        </div>
                    </SettingsSectionCard>
                </div>

                <div id="admin-storage-access" className="admin-settings-anchor">
                    <SettingsSectionCard
                        className="admin-storage-section admin-storage-configuration-section"
                        icon={draftMode === "local" ? <Server className="size-4" aria-hidden="true" /> : <Cloud className="size-4" aria-hidden="true" />}
                        title={draftMode === "local" ? translate("adminPages.settings.storageSettingsPage.item2ConfigureLocalServerAccess") : translate("adminPages.settings.storageSettingsPage.item2ConfigureAccess", { v0: String(storageProviderLabel(draftMode)) })}
                        description={draftMode === "local" ? translate("adminPages.settings.storageSettingsPage.enterTheServerRootURLBrowsersUseToAccessLocal") : translate("adminPages.settings.storageSettingsPage.enterTheStorageLocationReadEndpointAndServerCredentialsIn")}
                        status={
                            <AdminStatusBadge
                                label={dirty ? translate("adminPages.settings.storageSettingsPage.changed") : storageConfigurationReady(draftMode, normalizedDraft, setting) ? translate("adminPages.settings.storageSettingsPage.configured") : translate("account.settings.modelConfig.capabilities.pending")}
                                tone={dirty ? "warning" : storageConfigurationReady(draftMode, normalizedDraft, setting) ? "success" : "neutral"}
                            />
                        }
                        footer={
                            <>
                                <div className="admin-storage-footer-note">
                                    <BadgeCheck className="size-4" aria-hidden="true" />
                                    <span>{formatSettingTime(setting.updatedAt, translate("adminPages.settings.storageSettingsPage.platformStorageSettingsHaveNotBeenSavedYet"))} {translate("adminPages.settings.storageSettingsPage.savingDoesNotConnectToTheStorageServiceAutomaticallyTest")}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {dirty ? (
                                        <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                            {translate("account.settings.memory.actors.restore")}
                                        </Button>
                                    ) : null}
                                    <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || loading || refreshing} onClick={() => void submitSave()}>
                                        {translate("adminPages.settings.storageSettingsPage.saveChanges")}
                                    </Button>
                                </div>
                            </>
                        }
                    >
                        <Form
                            form={form}
                            layout="vertical"
                            requiredMark={false}
                            disabled={loading || refreshing || saving}
                            onValuesChange={(changedValues) => {
                                const values = form.getFieldsValue(true);
                                setDraftMode(values.mode || "local");
                                setDirty(hasStorageChanges(values, setting));
                                if (changesRequireOSSRetest(changedValues)) setTestStale(true);
                                setSaveError("");
                            }}
                        >
                            <Form.Item name="mode" hidden>
                                <Input />
                            </Form.Item>

                            {draftMode === "local" ? (
                                <div className="admin-storage-form-section">
                                    <FormSectionTitle icon={<Globe2 className="size-4" />} title={translate("adminPages.settings.storageSettingsPage.publicRootURL")} description={translate("adminPages.settings.storageSettingsPage.usedToGenerateShortLivedSignedURLsForLocalResources")} />
                                    <div className="admin-storage-local-field">
                                        <Form.Item name="publicBaseUrl" label={translate("adminPages.settings.storageSettingsPage.serverAddress")} extra={translate("adminPages.settings.storageSettingsPage.supportsLocalLANOrPublicURLsSuchAsHttp192")}>
                                            <div className="admin-storage-address-control">
                                                <Input aria-label={translate("adminPages.settings.storageSettingsPage.serverAddress")} autoComplete="off" inputMode="url" placeholder="https://canvas.example.com" prefix={<Globe2 className="size-4 text-foreground/35" />} />
                                                <Button
                                                    icon={<LocateFixed className="size-4" />}
                                                    onClick={() => {
                                                        const value = window.location.origin;
                                                        form.setFieldValue("publicBaseUrl", value);
                                                        setDirty(hasStorageChanges({ ...form.getFieldsValue(true), publicBaseUrl: value }, setting));
                                                        setSaveError("");
                                                    }}
                                                >
                                                    {translate("adminPages.settings.storageSettingsPage.useCurrentAddress")}
                                                </Button>
                                            </div>
                                        </Form.Item>
                                    </div>
                                    <div className="admin-storage-context-note">
                                        <HardDrive className="size-4" aria-hidden="true" />
                                        <span>{translate("adminPages.settings.storageSettingsPage.localModeSuitsSingleServerOrSharedVolumeDeploymentsThis")}</span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="admin-storage-provider-note">
                                        <Cloud className="size-4" aria-hidden="true" />
                                        <span>{providerGuidance(draftMode)}</span>
                                    </div>

                                    <div className="admin-storage-form-section">
                                        <FormSectionTitle icon={<Database className="size-4" />} title={translate("adminPages.settings.storageSettingsPage.storageLocation")} description={translate("adminPages.settings.storageSettingsPage.theBucketIdentifiesTheContainerThePathPrefixIsolatesThis")} />
                                        {draftMode === "s3" ? (
                                            <Form.Item name="s3Preset" label={translate("account.layout.oss.s3Preset")} extra={getS3PresetHints(form.getFieldValue("s3Preset") || "custom").help}>
                                                <Select
                                                    options={S3_PRESET_OPTIONS}
                                                    onChange={(preset: S3Preset) => {
                                                        const hints = getS3PresetHints(preset);
                                                        form.setFieldsValue({ region: hints.region, endpoint: hints.endpoint });
                                                        setDirty(hasStorageChanges({ ...form.getFieldsValue(true), region: hints.region, endpoint: hints.endpoint, s3Preset: preset }, setting));
                                                        setTestStale(true);
                                                    }}
                                                />
                                            </Form.Item>
                                        ) : null}
                                        <div className="admin-storage-form-grid is-location">
                                            <Form.Item
                                                name="region"
                                                label="Region"
                                                extra={
                                                    draftMode === "tencent"
                                                        ? translate("adminPages.settings.storageSettingsPage.leaveEndpointBlankToGenerateItFromRegionAutomatically")
                                                        : draftMode === "qiniu"
                                                          ? translate("adminPages.settings.storageSettingsPage.usedForS3CompatiblePrivateReadsWhenNoDomainIs")
                                                          : draftMode === "volcengine"
                                                            ? translate("adminPages.settings.storageSettingsPage.leaveEndpointBlankToGenerateItFromRegionAutomaticallyOptions", { v0: String(VOLCENGINE_TOS_REGION_HINT) })
                                                            : translate("adminPages.settings.storageSettingsPage.useTheValueShownInYourCloudProviderSConsole")
                                                }
                                            >
                                                <Input
                                                    autoComplete="off"
                                                    placeholder={
                                                        draftMode === "s3"
                                                            ? getS3PresetHints(form.getFieldValue("s3Preset") || "custom").region
                                                            : draftMode === "tencent"
                                                              ? "ap-guangzhou"
                                                              : draftMode === "qiniu"
                                                                ? "z0 / cn-east-1"
                                                                : draftMode === "volcengine"
                                                                  ? "cn-beijing"
                                                                  : "oss-cn-hangzhou"
                                                    }
                                                />
                                            </Form.Item>
                                            <Form.Item name="bucket" label="Bucket">
                                                <Input autoComplete="off" placeholder={draftMode === "qiniu" ? translate("account.layout.oss.bucketQiniu") : draftMode === "volcengine" ? translate("account.layout.oss.bucketVolcengine") : translate("adminPages.settings.storageSettingsPage.objectStorageBucket")} />
                                            </Form.Item>
                                            <Form.Item label={translate("account.layout.oss.pathPrefix")} extra={translate("adminPages.settings.storageSettingsPage.enterYourOwnValueOrUseTheEnglishBrandID", { v0: String(brandSlug) })}>
                                                <div className="admin-storage-address-control">
                                                    <Form.Item name="pathPrefix" noStyle>
                                                        <Input autoComplete="off" placeholder={translate("adminPages.settings.storageSettingsPage.forExample", { v0: String(brandSlug) })} />
                                                    </Form.Item>
                                                    <Button disabled={saving || refreshing || form.getFieldValue("pathPrefix") === brandSlug} onClick={useBrandPathPrefix}>
                                                        {translate("adminPages.settings.storageSettingsPage.useBrandID")}
                                                    </Button>
                                                </div>
                                            </Form.Item>
                                        </div>
                                    </div>

                                    <div className="admin-storage-form-section">
                                        <FormSectionTitle icon={<Globe2 className="size-4" />} title={translate("adminPages.settings.storageSettingsPage.connectionAndReadEndpoints")} description={translate("adminPages.settings.storageSettingsPage.theEndpointIsUsedForServerWritesACDNOr")} />
                                        <div className="admin-storage-form-grid">
                                            <Form.Item
                                                name="endpoint"
                                                label={draftMode === "qiniu" ? translate("account.layout.oss.uploadEndpoint") : "Endpoint"}
                                                extra={
                                                    draftMode === "s3"
                                                        ? getS3PresetHints(form.getFieldValue("s3Preset") || "custom").help
                                                        : draftMode === "tencent"
                                                          ? translate("adminPages.settings.storageSettingsPage.leaveBlankToGenerateFromRegionOrEnterAFull")
                                                          : draftMode === "volcengine"
                                                            ? translate("adminPages.settings.storageSettingsPage.leaveBlankToGenerateFromRegionNativeEndpointsOrBucket")
                                                            : translate("adminPages.settings.storageSettingsPage.enterACompleteHttpHttpsURLTheServerStillPerforms")
                                                }
                                            >
                                                <Input
                                                    autoComplete="off"
                                                    inputMode="url"
                                                    placeholder={
                                                        draftMode === "s3"
                                                            ? getS3PresetHints(form.getFieldValue("s3Preset") || "custom").endpoint
                                                            : draftMode === "tencent"
                                                              ? "https://cos.ap-guangzhou.myqcloud.com"
                                                              : draftMode === "qiniu"
                                                                ? "https://up-z0.qiniup.com"
                                                                : draftMode === "volcengine"
                                                                  ? "https://tos-s3-cn-beijing.volces.com"
                                                                  : "https://oss-cn-hangzhou.aliyuncs.com"
                                                    }
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name="cdnBaseUrl"
                                                label={draftMode === "qiniu" ? translate("account.layout.oss.cdnQiniu") : translate("adminPages.settings.storageSettingsPage.cDNDomainOptional")}
                                                extra={draftMode === "qiniu" ? translate("adminPages.settings.storageSettingsPage.whenBlankTheDistributionPolicyBelowAppliesTheBrowserDoes") : translate("adminPages.settings.storageSettingsPage.enterOnlyTheDomainRootURLWithoutPathsQueryParameters")}
                                            >
                                                <Input autoComplete="off" inputMode="url" placeholder="https://media.example.com" />
                                            </Form.Item>
                                            <Form.Item name="cdnAuthMode" label={translate("account.layout.oss.cdnAuth")} extra={translate("adminPages.settings.storageSettingsPage.publicIsForPubliclyAccessibleCDNsOrCDNManagedAuthentication")}>
                                                <Select
                                                    options={[
                                                        { label: translate("adminPages.settings.storageSettingsPage.notConfiguredOriginOrFallbackPolicy"), value: "" },
                                                        { label: translate("account.layout.oss.cdnAuthPublic"), value: "public" },
                                                        { label: translate("account.layout.oss.cdnAuthQiniu"), value: "qiniu" },
                                                    ]}
                                                />
                                            </Form.Item>
                                            <Form.Item name="requireCDN" label={translate("account.layout.oss.requireCDN")} valuePropName="checked" extra={translate("adminPages.settings.storageSettingsPage.whenEnabledIncompleteCDNAuthenticationFailsImmediatelyWithoutSilentlyFalling")}>
                                                <Switch checkedChildren={translate("adminPages.settings.storageSettingsPage.strict")} unCheckedChildren={translate("account.layout.oss.requireCDNOff")} />
                                            </Form.Item>
                                            <Form.Item name="allowPrivateProxy" label={translate("account.layout.oss.privateProxy")} valuePropName="checked" extra={translate("account.layout.oss.privateProxyHint")}>
                                                <Switch checkedChildren={translate("account.layout.oss.allow")} unCheckedChildren={translate("account.layout.oss.deny")} />
                                            </Form.Item>
                                        </div>
                                    </div>

                                    <div className="admin-storage-form-section">
                                        <FormSectionTitle icon={<KeyRound className="size-4" />} title={translate("adminPages.settings.storageSettingsPage.serverCredentials")} description={translate("adminPages.settings.storageSettingsPage.credentialsAreUsedOnlyByThisBackendToReadAnd")} />
                                        <div className="admin-storage-form-grid">
                                            <Form.Item name="accessKeyId" label={accessKeyIdLabel(draftMode)}>
                                                <Input autoComplete="off" placeholder={accessKeyIdLabel(draftMode)} />
                                            </Form.Item>
                                            <Form.Item name="accessKeySecret" label={hasCurrentProviderSecret ? `${accessKeySecretLabel(draftMode)}（${configuredSecretText}）` : accessKeySecretLabel(draftMode)} extra={translate("adminPages.settings.storageSettingsPage.enterOnlyWhenAddingOrReplacingThisProviderSCredentials")}>
                                                <Input.Password autoComplete="new-password" placeholder={hasCurrentProviderSecret ? translate("adminPages.settings.storageSettingsPage.leaveBlankToKeepTheCurrentKey") : accessKeySecretLabel(draftMode)} />
                                            </Form.Item>
                                            {draftMode === "s3" ? (
                                                <Form.Item
                                                    name="sessionToken"
                                                    label={setting.provider === "s3" && setting.hasSessionToken ? `Session Token（${configuredSecretText}）` : translate("adminPages.settings.storageSettingsPage.sessionTokenOptional")}
                                                    extra={translate("adminPages.settings.storageSettingsPage.enterWhenUsingTemporaryCredentialsLeaveBlankToRetainThe")}
                                                >
                                                    <Input.Password autoComplete="new-password" placeholder={setting.provider === "s3" && setting.hasSessionToken ? translate("adminPages.settings.storageSettingsPage.leaveBlankToRetainTheExistingToken") : translate("adminPages.settings.storageSettingsPage.temporaryCredentialSessionToken")} />
                                                </Form.Item>
                                            ) : null}
                                        </div>
                                        {draftMode === "s3" ? (
                                            <Form.Item name="pathStyle" label="Path Style" valuePropName="checked" extra={translate("adminPages.settings.storageSettingsPage.whenEnabledForcesPathStyleAccessWhenDisabledTheBackend")}>
                                                <Switch checkedChildren={translate("account.layout.oss.force")} unCheckedChildren={translate("account.layout.oss.auto")} />
                                            </Form.Item>
                                        ) : null}
                                    </div>
                                    <div className="admin-storage-form-section">
                                        <FormSectionTitle icon={<Wifi className="size-4" />} title={translate("adminPages.settings.storageSettingsPage.connectionVerification")} description={translate("adminPages.settings.storageSettingsPage.performsAMinimalReadWriteTestUsingTheCurrentDraft")} />
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Button icon={<Wifi className="size-4" />} loading={testing} disabled={saving || refreshing} onClick={() => void testConnection()}>
                                                {translate("account.layout.oss.test")}
                                            </Button>
                                            <ConnectionTestStatus result={testResult} stale={testStale} />
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="admin-storage-form-section">
                                <FormSectionTitle icon={<ShieldCheck className="size-4" />} title={translate("adminPages.settings.storageSettingsPage.userOwnedStorage")} description={translate("adminPages.settings.storageSettingsPage.allowUsersToConfigurePersonalS3CompatibleStorageWhenA")} />
                                <Form.Item name="allowUserS3" label={translate("adminPages.settings.storageSettingsPage.allowPersonalS3CompatibleStorage")} valuePropName="checked">
                                    <Switch checkedChildren={translate("account.layout.oss.allow")} unCheckedChildren={translate("adminPages.settings.storageSettingsPage.disallow")} />
                                </Form.Item>
                            </div>
                        </Form>
                    </SettingsSectionCard>
                </div>
            </div>
        </AdminPageFrame>
    );
}

function FormSectionTitle({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
    return (
        <div className="admin-storage-form-section-heading">
            <span>{icon}</span>
            <div>
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
        </div>
    );
}

function ConnectionTestStatus({ result, stale }: { result: OSSConnectionTestResult | null; stale: boolean }) {
    if (stale) return <AdminStatusBadge label={translate("adminPages.settings.storageSettingsPage.settingsChangedPleaseTestAgain")} tone="warning" />;
    if (!result) return <AdminStatusBadge label={translate("adminPages.settings.storageSettingsPage.notTested")} tone="neutral" />;
    if (result.ok) return <AdminStatusBadge label={result.testedAt ? translate("adminPages.settings.storageSettingsPage.testPassed", { v0: String(formatSettingTime(result.testedAt, translate("adminPages.settings.storageSettingsPage.justNow"))) }) : translate("account.layout.oss.testPassedShort")} tone="success" />;
    return <AdminStatusBadge label={result.message || translate("account.layout.oss.testFailedShort")} tone="error" />;
}
