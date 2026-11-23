import { App, Button, Form, Input, InputNumber, Skeleton } from "antd";
import { Select } from "@/components/ui/base/select";
import { AdminSegmented, Switch } from "@/pages/admin/ui/controls";
import { AlertTriangle, CloudUpload, Coins, KeyRound, RefreshCw, RotateCcw, Save, UsersRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useSearchParams } from "react-router";

import { cn } from "@/lib/utils";
import { getAdminArkPrivateAssetSetting, updateAdminArkPrivateAssetSetting, type AdminArkPrivateAssetSetting } from "@/services/api/auth";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, configuredSecretText, SettingsSectionCard } from "../components/admin-ui";
import { ArkAdminGroupsTab } from "./ark-assets/ark-admin-groups-tab";
import { ArkAdminReviewsTab } from "./ark-assets/ark-admin-reviews-tab";
import "./ark-assets/ark-admin.css";
import { translate } from "@/i18n";


type ArkSite = AdminArkPrivateAssetSetting["site"];
type ArkTab = "groups" | "reviews" | "settings";

const MICRO_PER_CREDIT = 1_000_000;
const PAGE_DESCRIPTION = translate("adminPages.settings.arkPrivateAssetsSettingsPage.manageHumanVirtualAndCopyrightedIPAssetGroupsUnderThe");

type ArkPrivateAssetForm = {
    enabled: boolean;
    realEnabled: boolean;
    virtualEnabled: boolean;
    realGroupLimit: number;
    virtualGroupLimit: number;
    billingEnabled: boolean;
    realGroupPrice: number;
    virtualGroupPrice: number;
    realReviewRequired: boolean;
    virtualReviewRequired: boolean;
    realAuthorizationDays: number;
    site: ArkSite;
    callbackBaseUrl: string;
    region: string;
    projectName: string;
    accessKeyId: string;
    accessKeySecret: string;
};

type ArkPrivateAssetPayload = Pick<
    AdminArkPrivateAssetSetting,
    | "enabled"
    | "realEnabled"
    | "virtualEnabled"
    | "realGroupLimit"
    | "virtualGroupLimit"
    | "billingEnabled"
    | "realGroupPriceMicrocredits"
    | "virtualGroupPriceMicrocredits"
    | "realReviewRequired"
    | "virtualReviewRequired"
    | "realAuthorizationDays"
    | "site"
    | "callbackBaseUrl"
    | "region"
    | "projectName"
    | "accessKeyId"
    | "accessKeySecret"
>;

// 站点决定控制面域名与推理 Base URL；Region 由管理员按开通情况手动填写。
const ARK_SITE_META: Record<ArkSite, { label: string; regionPlaceholder: string; controlPlane: (region: string) => string; inference: string }> = {
    volcengine: {
        label: translate("adminPages.settings.arkPrivateAssetsSettingsPage.volcengineChina"),
        regionPlaceholder: "cn-beijing",
        controlPlane: (region) => `https://ark.${region || "<region>"}.volcengineapi.com`,
        inference: "https://ark.cn-beijing.volces.com/api/v3",
    },
    byteplus: {
        label: translate("adminPages.settings.arkPrivateAssetsSettingsPage.bytePlusInternational"),
        regionPlaceholder: "ap-southeast-1",
        controlPlane: (region) => `https://ark.${region || "<region>"}.byteplusapi.com`,
        inference: "https://ark.ap-southeast.bytepluses.com/api/v3",
    },
};

const ARK_TABS: Array<{ value: ArkTab; label: string }> = [
    { value: "groups", label: translate("library.ark.certify.groupLabel") },
    { value: "reviews", label: translate("adminPages.settings.arkPrivateAssetsSettingsPage.uploadReview") },
    { value: "settings", label: translate("account.settings.channels.configure") },
];

/** 方舟素材库：素材组 / 上传审核 / 配置三个视图；配置有未保存草稿时切换视图不丢失，离开页面会确认。 */
export default function ArkPrivateAssetsSettingsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get("tab");
    const tab: ArkTab = requestedTab === "reviews" || requestedTab === "settings" ? requestedTab : "groups";
    const selectTab = (next: ArkTab) => {
        const params = new URLSearchParams(searchParams);
        if (next === "groups") params.delete("tab");
        else params.set("tab", next);
        setSearchParams(params, { replace: true });
    };
    return (
        <AdminPageFrame title={translate("settings.sections.ark-assets.label")} description={PAGE_DESCRIPTION} actions={<AdminSegmented<ArkTab> ariaLabel={translate("adminPages.settings.arkPrivateAssetsSettingsPage.arkAssetLibraryView")} value={tab} onChange={selectTab} options={ARK_TABS} />} scroll>
            <div className="admin-ark-tabs-body">
                {tab === "groups" ? <ArkAdminGroupsTab onOpenReviews={() => selectTab("reviews")} /> : null}
                {tab === "reviews" ? <ArkAdminReviewsTab /> : null}
                {/* 配置表单常驻挂载：切到其他视图时保留草稿。 */}
                <div hidden={tab !== "settings"}>
                    <ArkPrivateAssetsSettingsForm />
                </div>
            </div>
        </AdminPageFrame>
    );
}

function ArkPrivateAssetsSettingsForm() {
    const { message, modal } = App.useApp();
    const [setting, setSetting] = useState<AdminArkPrivateAssetSetting | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [form] = Form.useForm<ArkPrivateAssetForm>();
    const requestVersionRef = useRef(0);
    const navigationConfirmOpenRef = useRef(false);
    const navigationTriggerRef = useRef<HTMLElement | null>(null);
    const watchedValues = Form.useWatch([], form) as Partial<ArkPrivateAssetForm> | undefined;
    const draftEnabled = watchedValues?.enabled === true;
    const draftRealEnabled = watchedValues?.realEnabled === true;
    const draftVirtualEnabled = watchedValues?.virtualEnabled === true;
    const draftBillingEnabled = watchedValues?.billingEnabled === true;
    const draftSite: ArkSite = watchedValues?.site === "byteplus" ? "byteplus" : "volcengine";
    const siteMeta = ARK_SITE_META[draftSite];

    const load = useCallback(
        async (initial = false, announce = false) => {
            const requestVersion = ++requestVersionRef.current;
            if (initial) setLoading(true);
            else setRefreshing(true);
            setLoadError("");
            try {
                const result = await getAdminArkPrivateAssetSetting();
                if (requestVersion !== requestVersionRef.current) return;
                if (!isAdminArkPrivateAssetSetting(result.setting)) throw new Error(translate("adminPages.settings.arkPrivateAssetsSettingsPage.theServerReturnedInvalidArkAssetLibrarySettings"));
                setSetting(result.setting);
                setDirty(false);
                setSaveError("");
                if (announce) message.success(translate("adminPages.settings.arkPrivateAssetsSettingsPage.arkAssetLibrarySettingsReloaded"));
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.arkPrivateAssetsSettingsPage.failedToLoadArkAssetLibrarySettings");
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
        form.setFieldsValue(toFormValues(setting));
    }, [form, loading, setting]);

    // 同一页面内切换视图只改查询参数，不算离开。
    const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);

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
            title: translate("adminPages.settings.arkPrivateAssetsSettingsPage.discardArkAssetLibraryChanges"),
            content: translate("adminPages.settings.arkPrivateAssetsSettingsPage.thisPageHasUnsavedSyncAccessFeeOrIAMCredential"),
            okText: translate("adminPages.settings.arkPrivateAssetsSettingsPage.discardAndLeave"),
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
                    const fallback = document.querySelector<HTMLButtonElement>(".admin-ark-command-actions button");
                    const target = navigationTriggerRef.current?.isConnected ? navigationTriggerRef.current : fallback;
                    target?.focus();
                    navigationTriggerRef.current = null;
                });
            },
        });
    }, [blocker, modal]);

    const resetDraft = () => {
        if (!setting || saving) return;
        form.setFieldsValue(toFormValues(setting));
        form.setFields([]);
        setDirty(false);
        setSaveError("");
        message.info(translate("adminPages.settings.arkPrivateAssetsSettingsPage.unsavedArkAssetLibraryChangesDiscarded"));
    };

    const requestRefresh = () => {
        if (!dirty) {
            void load(false, true);
            return;
        }
        modal.confirm({
            title: translate("adminPages.settings.arkPrivateAssetsSettingsPage.discardChangesAndReload"),
            content: translate("adminPages.settings.arkPrivateAssetsSettingsPage.reloadingDiscardsTheCurrentSettingsDraftAndUsesTheServer"),
            okText: translate("adminPages.settings.arkPrivateAssetsSettingsPage.discardAndRefresh"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => load(false, true),
        });
    };

    const save = async (values: ArkPrivateAssetForm) => {
        if (!setting) return;
        const expected = normalizeArkPrivateAssetPayload(values);
        const expectedHasSecret = nextSecretPresence(expected, setting);
        setSaving(true);
        setSaveError("");
        try {
            const result = await updateAdminArkPrivateAssetSetting(expected);
            if (!isAdminArkPrivateAssetSetting(result.setting) || !arkPrivateAssetResponseMatches(result.setting, expected, expectedHasSecret)) {
                throw new Error(translate("adminPages.settings.arkPrivateAssetsSettingsPage.theServerSArkAssetLibrarySettingsDifferFromThe"));
            }
            setSetting(result.setting);
            form.setFieldsValue(toFormValues(result.setting));
            setDirty(false);
            message.success(translate("adminPages.settings.arkPrivateAssetsSettingsPage.arkAssetLibrarySettingsSaved"));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.arkPrivateAssetsSettingsPage.failedToSaveArkAssetLibrarySettings");
            setSaveError(translate("adminPages.settings.arkPrivateAssetsSettingsPage.noAutomaticRetryWasMadeReloadTheCurrentSettingsBefore", { v0: String(errorMessage) }));
            message.error(errorMessage);
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const submitSave = async () => {
        if (!setting) return;
        let values: ArkPrivateAssetForm;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const validationError = validateArkPrivateAssetDraft(values, setting);
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

    if (loading && !setting) {
        return (
            <div className="admin-settings-stack admin-ark-settings" aria-label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.loadingArkAssetLibrarySettings")} role="status">
                <div className="admin-ark-command-bar">
                    <Skeleton active title={{ width: 190 }} paragraph={false} />
                </div>
                <div className="admin-ark-loading-card">
                    <Skeleton active paragraph={{ rows: 7 }} />
                </div>
            </div>
        );
    }

    if (!setting) {
        return (
            <div className="admin-settings-stack admin-ark-settings">
                <div className="admin-ark-load-error" role="alert">
                    <span className="admin-ark-load-error-icon">
                        <AlertTriangle className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                        <h2>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.unableToLoadArkAssetLibrarySettings")}</h2>
                        <p>{loadError || translate("adminPages.settings.arkPrivateAssetsSettingsPage.noSettingsAreAvailableToDisplayPleaseTryAgainLater")}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void load(false, true)}>
                        {translate("auth.register.reload")}
                    </Button>
                </div>
            </div>
        );
    }

    const currentValues = watchedValues || form.getFieldsValue(true);
    const normalizedDraft = normalizeArkPrivateAssetPayload(currentValues);
    const usableSecret = hasUsableSecret(normalizedDraft, setting);
    const projectReady = Boolean(normalizedDraft.region && normalizedDraft.projectName);
    const credentialsReady = Boolean(normalizedDraft.accessKeyId && usableSecret);
    const prerequisitesReady = projectReady && credentialsReady;
    const userGroupsOpen = draftRealEnabled || draftVirtualEnabled;

    return (
        <div className="admin-settings-stack admin-ark-settings">
            <div className={cn("admin-ark-command-bar", dirty && "is-dirty")}>
                <div className="admin-ark-command-copy" aria-live="polite">
                    <div className="flex flex-wrap items-center gap-2">
                        <strong>{dirty ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.arkAssetLibraryHasUnsavedChanges") : translate("adminPages.settings.arkPrivateAssetsSettingsPage.arkAssetLibrarySettingsSynced")}</strong>
                        <AdminStatusBadge label={dirty ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.notYetApplied") : translate("adminPages.settings.arkPrivateAssetsSettingsPage.serverSettings")} tone={dirty ? "warning" : "neutral"} />
                    </div>
                </div>
                <div className="admin-ark-command-actions">
                    {dirty ? (
                        <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                            {translate("adminPages.settings.arkPrivateAssetsSettingsPage.discardChanges")}
                        </Button>
                    ) : null}
                    <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={saving} onClick={requestRefresh}>
                        {translate("library.ark.asset.refresh")}
                    </Button>
                    <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || loading || refreshing} onClick={() => void submitSave()}>
                        {translate("adminPages.settings.arkPrivateAssetsSettingsPage.saveChanges")}
                    </Button>
                </div>
            </div>

            {loadError || saveError ? (
                <div className="admin-ark-inline-alert" role="alert">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                    <span>{saveError || translate("adminPages.settings.arkPrivateAssetsSettingsPage.thePageStillShowsTheLastSettingsLoadedSuccessfully", { v0: String(loadError) })}</span>
                </div>
            ) : null}

            <Form
                form={form}
                layout="vertical"
                requiredMark={false}
                disabled={loading || refreshing || saving}
                onValuesChange={(_, values: ArkPrivateAssetForm) => {
                    let nextValues = values;
                    if ((values.enabled || values.realEnabled || values.virtualEnabled) && !arkPrivateAssetPrerequisitesReady(values, setting)) {
                        form.setFieldsValue({ enabled: false, realEnabled: false, virtualEnabled: false });
                        nextValues = { ...values, enabled: false, realEnabled: false, virtualEnabled: false };
                    }
                    setDirty(hasArkPrivateAssetChanges(nextValues, setting));
                    setSaveError("");
                }}
            >
                <div id="admin-ark-credentials" className="admin-settings-anchor">
                    <SettingsSectionCard
                        className="admin-ark-section admin-ark-configuration-section"
                        icon={<KeyRound className="size-4" aria-hidden="true" />}
                        title={translate("adminPages.settings.arkPrivateAssetsSettingsPage.item1ConfigureTheArkProjectAndIAMCredentials")}
                        description={translate("adminPages.settings.arkPrivateAssetsSettingsPage.credentialsAreStoredOnlyOnTheServerAndUsedTo")}
                        status={<AdminStatusBadge label={prerequisitesReady ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.configured") : translate("account.settings.modelConfig.capabilities.pending")} tone={prerequisitesReady ? "success" : "neutral"} />}
                    >
                        <div className="admin-ark-form-grid">
                            <Form.Item name="site" label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.arkSite")} extra={translate("adminPages.settings.arkPrivateAssetsSettingsPage.inferenceChannelBaseURLReference", { v0: String(siteMeta.inference) })}>
                                <Select options={(Object.keys(ARK_SITE_META) as ArkSite[]).map((value) => ({ value, label: ARK_SITE_META[value].label }))} aria-label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.arkSite")} />
                            </Form.Item>
                            <Form.Item name="region" label="Region" extra={translate("adminPages.settings.arkPrivateAssetsSettingsPage.controlPlaneURLEnterARegionWithTheAssetLibrary", { v0: String(siteMeta.controlPlane(normalizedDraft.region)) })}>
                                <Input autoComplete="off" placeholder={siteMeta.regionPlaceholder} />
                            </Form.Item>
                            <Form.Item name="projectName" label="Ark ProjectName">
                                <Input autoComplete="off" placeholder={translate("adminPages.settings.arkPrivateAssetsSettingsPage.arkProjectName")} />
                            </Form.Item>
                            <Form.Item name="accessKeyId" label="IAM AccessKey">
                                <Input autoComplete="off" prefix={<KeyRound className="size-4 text-foreground/35" />} placeholder={translate("adminPages.settings.arkPrivateAssetsSettingsPage.storedOnlyOnTheServer")} />
                            </Form.Item>
                            <Form.Item name="accessKeySecret" label={setting.hasAccessKeySecret ? `IAM SecretKey（${configuredSecretText}）` : "IAM SecretKey"} extra={setting.hasAccessKeySecret ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.leaveBlankToRetainTheExistingSecretIfTheAccessKey") : undefined}>
                                <Input.Password autoComplete="new-password" placeholder={setting.hasAccessKeySecret ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.leaveBlankToKeepTheCurrentKey") : translate("adminPages.settings.arkPrivateAssetsSettingsPage.storedOnlyOnTheServer")} />
                            </Form.Item>
                        </div>
                    </SettingsSectionCard>
                </div>

                {prerequisitesReady || draftEnabled ? (
                    <div id="admin-ark-policy" className="admin-settings-anchor">
                        <SettingsSectionCard
                            className="admin-ark-section admin-ark-policy-section"
                            icon={<CloudUpload className="size-4" aria-hidden="true" />}
                            title={translate("adminPages.settings.arkPrivateAssetsSettingsPage.item2EnableTrustedAssetSync")}
                            description={translate("adminPages.settings.arkPrivateAssetsSettingsPage.whenEnabledEligibleSeedanceReferenceImagesAreImportedIntoThe")}
                            status={<AdminStatusBadge label={draftEnabled ? translate("account.layout.oss.enabled") : translate("adminPages.settings.arkPrivateAssetsSettingsPage.disabled")} tone={draftEnabled ? "success" : "neutral"} />}
                        >
                            <div className="admin-ark-policy-control">
                                <div className="admin-ark-policy-copy">
                                    <strong>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.automaticallyImportTrustedReferenceAssets")}</strong>
                                    <p>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.disablingStopsNewAssetSyncsWithoutDeletingExistingAssetsOr")}</p>
                                </div>
                                <div className="admin-ark-policy-switch">
                                    <span>{draftEnabled ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.enable") : translate("adminPages.settings.arkPrivateAssetsSettingsPage.disable")}</span>
                                    <Form.Item name="enabled" valuePropName="checked" noStyle>
                                        <Switch aria-label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.enableTrustedAssetSyncTakesEffectAfterSaving")} />
                                    </Form.Item>
                                </div>
                            </div>
                        </SettingsSectionCard>
                    </div>
                ) : null}

                {prerequisitesReady || userGroupsOpen ? (
                    <>
                        <div id="admin-ark-groups" className="admin-settings-anchor">
                            <SettingsSectionCard
                                className="admin-ark-section admin-ark-policy-section"
                                icon={<UsersRound className="size-4" aria-hidden="true" />}
                                title={translate("adminPages.settings.arkPrivateAssetsSettingsPage.item3AllowUserAssetGroups")}
                                description={translate("adminPages.settings.arkPrivateAssetsSettingsPage.usersCreateGroupsInSettingsArkAssetLibraryHumanGroups")}
                                status={<AdminStatusBadge label={userGroupsOpen ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.available") : translate("adminPages.settings.arkPrivateAssetsSettingsPage.unavailable")} tone={userGroupsOpen ? "success" : "neutral"} />}
                            >
                                <div className="admin-ark-policy-control">
                                    <div className="admin-ark-policy-copy">
                                        <strong>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.humanAssetGroups")}</strong>
                                        <p>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.verificationResultsAreSentToTheCallbackURLAtApi")}</p>
                                    </div>
                                    <div className="admin-ark-policy-switch">
                                        <span>{draftRealEnabled ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.available2") : translate("common.close")}</span>
                                        <Form.Item name="realEnabled" valuePropName="checked" noStyle>
                                            <Switch aria-label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.enableHumanAssetLibraryTakesEffectAfterSaving")} />
                                        </Form.Item>
                                    </div>
                                </div>
                                <div className="admin-ark-policy-control">
                                    <div className="admin-ark-policy-copy">
                                        <strong>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.virtualAssetGroups")}</strong>
                                        <p>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.forAIGeneratedOrDrawnVirtualCharactersImagesInThe")}</p>
                                    </div>
                                    <div className="admin-ark-policy-switch">
                                        <span>{draftVirtualEnabled ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.available2") : translate("common.close")}</span>
                                        <Form.Item name="virtualEnabled" valuePropName="checked" noStyle>
                                            <Switch aria-label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.enableVirtualAssetGroupsTakesEffectAfterSaving")} />
                                        </Form.Item>
                                    </div>
                                </div>
                                <Form.Item name="callbackBaseUrl" label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.identityVerificationCallbackURL")} extra={translate("adminPages.settings.arkPrivateAssetsSettingsPage.publicSiteRootURLSuchAsHttpsCanvasExampleCom")} className="mt-4">
                                    <Input autoComplete="off" placeholder="https://canvas.example.com" />
                                </Form.Item>
                                <div className="admin-ark-number-grid">
                                    <Form.Item name="realGroupLimit" label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.humanAssetGroupsPerPerson")} extra={translate("adminPages.settings.arkPrivateAssetsSettingsPage.includesVerificationSessionsInProgress")} rules={[{ required: true, type: "number", min: 1, max: 200, message: translate("adminPages.settings.arkPrivateAssetsSettingsPage.pleaseEnter1200") }]}>
                                        <InputNumber min={1} max={200} precision={0} className="w-full" />
                                    </Form.Item>
                                    <Form.Item name="virtualGroupLimit" label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.virtualAssetGroupsPerPerson")} rules={[{ required: true, type: "number", min: 1, max: 200, message: translate("adminPages.settings.arkPrivateAssetsSettingsPage.pleaseEnter1200") }]}>
                                        <InputNumber min={1} max={200} precision={0} className="w-full" />
                                    </Form.Item>
                                    <Form.Item name="realAuthorizationDays" label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.humanAuthorizationValidityDays")} extra={translate("adminPages.settings.arkPrivateAssetsSettingsPage.startsWhenVerificationCompletesUploadsAndGenerationAreDisabledAfter")} rules={[{ required: true, type: "number", min: 1, max: 3650, message: translate("adminPages.settings.arkPrivateAssetsSettingsPage.pleaseEnter13650") }]}>
                                        <InputNumber min={1} max={3650} precision={0} className="w-full" />
                                    </Form.Item>
                                </div>
                                <div className="admin-ark-policy-control">
                                    <div className="admin-ark-policy-copy">
                                        <strong>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.uploadReview")}</strong>
                                        <p>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.whenEnabledImagesUploadedToUserCreatedGroupsEnterUpload")}</p>
                                    </div>
                                    <div className="admin-ark-policy-switch">
                                        <span>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.human")}</span>
                                        <Form.Item name="realReviewRequired" valuePropName="checked" noStyle>
                                            <Switch aria-label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.requireReviewForHumanAssetGroupUploadsTakesEffectAfter")} />
                                        </Form.Item>
                                        <span>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.virtual")}</span>
                                        <Form.Item name="virtualReviewRequired" valuePropName="checked" noStyle>
                                            <Switch aria-label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.requireReviewForVirtualAssetGroupUploadsTakesEffectAfter")} />
                                        </Form.Item>
                                    </div>
                                </div>
                            </SettingsSectionCard>
                        </div>
                        <div id="admin-ark-billing" className="admin-settings-anchor">
                            <SettingsSectionCard
                                className="admin-ark-section admin-ark-policy-section"
                                icon={<Coins className="size-4" aria-hidden="true" />}
                                title={translate("adminPages.settings.arkPrivateAssetsSettingsPage.item4AssetGroupFees")}
                                description={translate("adminPages.settings.arkPrivateAssetsSettingsPage.aOneTimePlatformCreditFeePerGroupForHuman")}
                                status={<AdminStatusBadge label={draftBillingEnabled ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.paid") : translate("adminPages.settings.arkPrivateAssetsSettingsPage.free")} tone={draftBillingEnabled ? "info" : "neutral"} />}
                            >
                                <div className="admin-ark-policy-control">
                                    <div className="admin-ark-policy-copy">
                                        <strong>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.groupCreationFees")}</strong>
                                        <p>{translate("adminPages.settings.arkPrivateAssetsSettingsPage.appliesOnlyToUserCreatedGroupsAdminCreatedPlatformGroups")}</p>
                                    </div>
                                    <div className="admin-ark-policy-switch">
                                        <span>{draftBillingEnabled ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.paid") : translate("adminPages.settings.arkPrivateAssetsSettingsPage.free")}</span>
                                        <Form.Item name="billingEnabled" valuePropName="checked" noStyle>
                                            <Switch aria-label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.enableAssetGroupFeesTakesEffectAfterSaving")} />
                                        </Form.Item>
                                    </div>
                                </div>
                                {draftBillingEnabled ? (
                                    <div className="admin-ark-form-grid">
                                        <Form.Item name="realGroupPrice" label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.humanAssetGroupCreditsGroup")} rules={[{ required: true, type: "number", min: 0, max: 1_000_000, message: translate("adminPages.settings.arkPrivateAssetsSettingsPage.pleaseEnter01000000") }]}>
                                            <InputNumber min={0} max={1_000_000} precision={2} className="w-full" />
                                        </Form.Item>
                                        <Form.Item name="virtualGroupPrice" label={translate("adminPages.settings.arkPrivateAssetsSettingsPage.virtualAssetGroupCreditsGroup")} rules={[{ required: true, type: "number", min: 0, max: 1_000_000, message: translate("adminPages.settings.arkPrivateAssetsSettingsPage.pleaseEnter01000000") }]}>
                                            <InputNumber min={0} max={1_000_000} precision={2} className="w-full" />
                                        </Form.Item>
                                    </div>
                                ) : null}
                            </SettingsSectionCard>
                        </div>
                    </>
                ) : null}
            </Form>
        </div>
    );
}

function toFormValues(setting: AdminArkPrivateAssetSetting): ArkPrivateAssetForm {
    return {
        enabled: setting.enabled,
        realEnabled: setting.realEnabled,
        virtualEnabled: setting.virtualEnabled,
        realGroupLimit: setting.realGroupLimit,
        virtualGroupLimit: setting.virtualGroupLimit,
        billingEnabled: setting.billingEnabled,
        realGroupPrice: setting.realGroupPriceMicrocredits / MICRO_PER_CREDIT,
        virtualGroupPrice: setting.virtualGroupPriceMicrocredits / MICRO_PER_CREDIT,
        realReviewRequired: setting.realReviewRequired,
        virtualReviewRequired: setting.virtualReviewRequired,
        realAuthorizationDays: setting.realAuthorizationDays,
        site: setting.site === "byteplus" ? "byteplus" : "volcengine",
        callbackBaseUrl: setting.callbackBaseUrl || "",
        region: setting.region || "",
        projectName: setting.projectName || "",
        accessKeyId: setting.accessKeyId || "",
        accessKeySecret: "",
    };
}

function wholeNumber(value: unknown, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
}

function normalizeArkPrivateAssetPayload(values: Partial<ArkPrivateAssetForm>): ArkPrivateAssetPayload {
    return {
        enabled: Boolean(values.enabled),
        realEnabled: Boolean(values.realEnabled),
        virtualEnabled: Boolean(values.virtualEnabled),
        realGroupLimit: wholeNumber(values.realGroupLimit, 0),
        virtualGroupLimit: wholeNumber(values.virtualGroupLimit, 0),
        billingEnabled: Boolean(values.billingEnabled),
        realGroupPriceMicrocredits: Math.max(0, Math.round(Number(values.realGroupPrice || 0) * MICRO_PER_CREDIT)),
        virtualGroupPriceMicrocredits: Math.max(0, Math.round(Number(values.virtualGroupPrice || 0) * MICRO_PER_CREDIT)),
        realReviewRequired: Boolean(values.realReviewRequired),
        virtualReviewRequired: Boolean(values.virtualReviewRequired),
        realAuthorizationDays: wholeNumber(values.realAuthorizationDays, 0),
        site: values.site === "byteplus" ? "byteplus" : "volcengine",
        callbackBaseUrl: values.callbackBaseUrl?.trim().replace(/\/+$/, "") || "",
        region: values.region?.trim().toLowerCase() || "",
        projectName: values.projectName?.trim() || "",
        accessKeyId: values.accessKeyId?.trim() || "",
        accessKeySecret: values.accessKeySecret?.trim() || "",
    };
}

const COMPARED_FIELDS = [
    "enabled",
    "realEnabled",
    "virtualEnabled",
    "realGroupLimit",
    "virtualGroupLimit",
    "billingEnabled",
    "realGroupPriceMicrocredits",
    "virtualGroupPriceMicrocredits",
    "realReviewRequired",
    "virtualReviewRequired",
    "realAuthorizationDays",
    "site",
    "callbackBaseUrl",
    "region",
    "projectName",
    "accessKeyId",
] as const;

function hasArkPrivateAssetChanges(values: Partial<ArkPrivateAssetForm>, setting: AdminArkPrivateAssetSetting | null) {
    if (!setting) return false;
    const draft = normalizeArkPrivateAssetPayload(values);
    const saved = normalizeArkPrivateAssetPayload(toFormValues(setting));
    return draft.accessKeySecret !== "" || COMPARED_FIELDS.some((field) => draft[field] !== saved[field]);
}

function validateArkPrivateAssetDraft(values: ArkPrivateAssetForm, setting: AdminArkPrivateAssetSetting) {
    const draft = normalizeArkPrivateAssetPayload(values);
    if (draft.callbackBaseUrl && !/^https?:\/\/[^/?#]+$/i.test(draft.callbackBaseUrl)) return translate("adminPages.settings.arkPrivateAssetsSettingsPage.identityVerificationCallbackURLMustBeASiteRootURL");
    if (draft.realGroupLimit < 1 || draft.realGroupLimit > 200 || draft.virtualGroupLimit < 1 || draft.virtualGroupLimit > 200) return translate("adminPages.settings.arkPrivateAssetsSettingsPage.assetGroupLimitPerPersonMustBeBetween1And");
    if (draft.realAuthorizationDays < 1 || draft.realAuthorizationDays > 3650) return translate("adminPages.settings.arkPrivateAssetsSettingsPage.humanAuthorizationValidityMustBeBetween1And3650Days");
    if (!draft.enabled && !draft.realEnabled && !draft.virtualEnabled) return "";
    if (!draft.region) return translate("adminPages.settings.arkPrivateAssetsSettingsPage.pleaseEnterTheArkRegion");
    if (!draft.projectName) return translate("adminPages.settings.arkPrivateAssetsSettingsPage.pleaseEnterTheArkProjectName");
    if (!draft.accessKeyId) return translate("adminPages.settings.arkPrivateAssetsSettingsPage.pleaseEnterTheArkAssetLibraryIAMAccessKey");
    if (!hasUsableSecret(draft, setting)) return draft.accessKeyId !== setting.accessKeyId ? translate("adminPages.settings.arkPrivateAssetsSettingsPage.enterTheMatchingSecretKeyWhenChangingTheIAMAccessKey") : translate("adminPages.settings.arkPrivateAssetsSettingsPage.pleaseEnterTheArkAssetLibraryIAMSecretKey");
    return "";
}

function hasUsableSecret(values: ArkPrivateAssetPayload, setting: AdminArkPrivateAssetSetting) {
    return Boolean(values.accessKeySecret || (values.accessKeyId === setting.accessKeyId && setting.hasAccessKeySecret));
}

function arkPrivateAssetPrerequisitesReady(values: Partial<ArkPrivateAssetForm>, setting: AdminArkPrivateAssetSetting) {
    const draft = normalizeArkPrivateAssetPayload(values);
    return Boolean(draft.region && draft.projectName && draft.accessKeyId && hasUsableSecret(draft, setting));
}

function nextSecretPresence(values: ArkPrivateAssetPayload, setting: AdminArkPrivateAssetSetting) {
    if (values.accessKeySecret) return true;
    return values.accessKeyId === setting.accessKeyId && setting.hasAccessKeySecret;
}

function arkPrivateAssetResponseMatches(setting: AdminArkPrivateAssetSetting, expected: ArkPrivateAssetPayload, expectedHasSecret: boolean) {
    const saved = normalizeArkPrivateAssetPayload(toFormValues(setting));
    return COMPARED_FIELDS.every((field) => saved[field] === expected[field]) && setting.hasAccessKeySecret === expectedHasSecret;
}

function isAdminArkPrivateAssetSetting(value: unknown): value is AdminArkPrivateAssetSetting {
    if (!value || typeof value !== "object") return false;
    const setting = value as Partial<AdminArkPrivateAssetSetting>;
    return (
        typeof setting.enabled === "boolean" &&
        typeof setting.realEnabled === "boolean" &&
        typeof setting.virtualEnabled === "boolean" &&
        typeof setting.billingEnabled === "boolean" &&
        typeof setting.realGroupLimit === "number" &&
        typeof setting.virtualGroupLimit === "number" &&
        typeof setting.realGroupPriceMicrocredits === "number" &&
        typeof setting.virtualGroupPriceMicrocredits === "number" &&
        typeof setting.realAuthorizationDays === "number" &&
        typeof setting.site === "string" &&
        typeof setting.region === "string" &&
        typeof setting.projectName === "string" &&
        typeof setting.accessKeyId === "string" &&
        typeof setting.hasAccessKeySecret === "boolean"
    );
}
