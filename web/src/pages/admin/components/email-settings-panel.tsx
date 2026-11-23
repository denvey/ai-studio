import { App, Button, Form, Input, InputNumber, Popover, Skeleton } from "antd";
import { Select } from "@/pages/admin/ui/controls";
import { Switch } from "@/pages/admin/ui/controls";
import { AlertTriangle, AtSign, BadgeCheck, KeyRound, MailCheck, RefreshCw, RotateCcw, Save, ScrollText, Send, Server } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker } from "react-router";

import { cn } from "@/lib/utils";
import { sendAdminTestEmail } from "@/services/api/email";
import { getAdminEmailSetting, updateAdminEmailSetting, type EmailSetting } from "@/services/api/wallet";
import { useUserStore } from "@/stores/use-user-store";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { AdminStatusBadge, configuredSecretText, SettingsSectionCard } from "./admin-ui";
import "./email-test-popover.css";
import { currentLocale, translate } from "@/i18n";

type EmailFormValues = Pick<EmailSetting, "enabled" | "host" | "port" | "username" | "password" | "encryption" | "fromEmail" | "fromName"> & {
    registrationAllowedDomains: string;
};

type NormalizedEmailFormValues = Omit<EmailFormValues, "registrationAllowedDomains"> & {
    registrationAllowedDomains: string[];
};

export default function EmailSettingsPanel() {
    const { message, modal } = App.useApp();
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const [setting, setSetting] = useState<EmailSetting | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [draftEnabled, setDraftEnabled] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [form] = Form.useForm<EmailFormValues>();
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
                const result = await getAdminEmailSetting();
                if (requestVersion !== requestVersionRef.current) return;
                if (!isEmailSetting(result.setting)) throw new Error(translate("admin.emailSettingsPanel.theServerReturnedAnInvalidEmailConfiguration"));
                setSetting(result.setting);
                setDirty(false);
                setSaveError("");
                if (announce) message.success(translate("admin.emailSettingsPanel.reloadedTheCurrentEmailServiceConfiguration"));
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                const errorMessage = error instanceof Error ? error.message : translate("admin.emailSettingsPanel.failedToLoadEmailSettings");
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
        form.setFieldsValue(toEmailFormValues(setting));
        setDraftEnabled(setting.enabled);
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
            title: translate("admin.emailSettingsPanel.discardEmailServiceChanges"),
            content: translate("admin.emailSettingsPanel.theSMTPFormHasUnsavedChangesThatWillBeLost"),
            okText: translate("admin.emailSettingsPanel.discardAndLeave"),
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
                    const fallback = document.querySelector<HTMLButtonElement>(".admin-email-command-actions button");
                    const target = navigationTriggerRef.current?.isConnected ? navigationTriggerRef.current : fallback;
                    target?.focus();
                    navigationTriggerRef.current = null;
                });
            },
        });
    }, [blocker, modal]);

    const resetDraft = () => {
        if (!setting || saving) return;
        form.setFieldsValue(toEmailFormValues(setting));
        form.setFields([]);
        setDraftEnabled(setting.enabled);
        setDirty(false);
        setSaveError("");
        message.info(translate("admin.emailSettingsPanel.discardedUnsavedEmailServiceChanges"));
    };

    const requestRefresh = () => {
        if (!dirty) {
            void load(false, true);
            return;
        }
        modal.confirm({
            title: translate("admin.emailSettingsPanel.discardChangesAndReload"),
            content: translate("admin.emailSettingsPanel.reloadingDiscardsUnsavedSMTPFormChangesAndUsesTheServer"),
            okText: translate("admin.emailSettingsPanel.discardAndRefresh"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => load(false, true),
        });
    };

    const save = async (values: EmailFormValues) => {
        const expected = normalizeEmailFormValues(values);
        setSaving(true);
        setSaveError("");
        try {
            const result = await updateAdminEmailSetting(expected);
            if (!isEmailSetting(result.setting) || !emailResponseMatches(result.setting, expected)) throw new Error(translate("admin.emailSettingsPanel.theEmailConfigurationReturnedByTheServerDiffersFromWhat"));
            setSetting(result.setting);
            form.setFieldsValue(toEmailFormValues(result.setting));
            setDraftEnabled(result.setting.enabled);
            setDirty(false);
            message.success(translate("admin.emailSettingsPanel.emailServiceConfigurationSaved"));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : translate("admin.emailSettingsPanel.failedToSaveEmailSettings");
            setSaveError(translate("admin.emailSettingsPanel.noAutomaticRetryWasMadeReloadTheCurrentSettingsBefore", { v0: String(errorMessage) }));
            message.error(errorMessage);
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const submitSave = async () => {
        let values: EmailFormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const validationError = validateEmailDraft(values, setting);
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

    const toggleEnabled = (enabled: boolean) => {
        if (!setting || saving) return;
        form.setFieldValue("enabled", enabled);
        setDraftEnabled(enabled);
        setDirty(hasEmailChanges({ ...form.getFieldsValue(true), enabled }, setting));
        setSaveError("");
    };

    if (loading && !setting) {
        return (
            <div className="admin-settings-stack admin-email-settings" aria-label={translate("admin.emailSettingsPanel.loadingEmailServiceConfiguration")} role="status">
                <div className="admin-email-loading-card">
                    <Skeleton active paragraph={{ rows: 7 }} />
                </div>
            </div>
        );
    }

    if (!setting) {
        return (
            <div className="admin-settings-stack admin-email-settings">
                <div className="admin-email-load-error" role="alert">
                    <span className="admin-email-load-error-icon">
                        <AlertTriangle className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                        <h2>{translate("admin.emailSettingsPanel.unableToLoadEmailServiceConfiguration")}</h2>
                        <p>{loadError || translate("admin.emailSettingsPanel.noSettingsAreAvailableToDisplayTryAgainLater")}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void load(false, true)}>
                        {translate("auth.register.reload")}
                    </Button>
                </div>
            </div>
        );
    }

    const currentValues = normalizeEmailFormValues(form.getFieldsValue(true));
    const smtpReady = Boolean(currentValues.host && currentValues.port && currentValues.fromEmail);

    return (
        <div className="admin-settings-stack admin-email-settings">
            <div className={cn("admin-email-command-bar", dirty && "is-dirty")}>
                <div className="admin-email-command-copy" aria-live="polite">
                    <span className="admin-email-command-icon">
                        <MailCheck className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                        <strong>
                            {dirty
                                ? translate("admin.emailSettingsPanel.unsavedEmailChanges")
                                : translate("admin.emailSettingsPanel.accountEmails", { v0: String(setting.enabled ? translate("account.layout.oss.enabled") : translate("account.layout.oss.notEnabled")) })}
                        </strong>
                        <p>{dirty ? translate("admin.emailSettingsPanel.completeTheConfigurationAndSaveToApplyIt") : formatSettingTime(setting.updatedAt, translate("admin.emailSettingsPanel.useSystemDefault"))}</p>
                    </div>
                </div>
                <div className="admin-email-command-actions">
                    {dirty ? (
                        <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                            {translate("admin.emailSettingsPanel.discardChanges")}
                        </Button>
                    ) : null}
                    <Link to="/admin/email-logs">
                        <Button icon={<ScrollText className="size-4" />}>{translate("admin.emailSettingsPanel.deliveryHistory")}</Button>
                    </Link>
                    <TestEmailButton
                        disabled={dirty || saving || !smtpReady}
                        disabledReason={dirty ? translate("admin.emailSettingsPanel.saveYourCurrentChangesFirst") : !smtpReady ? translate("admin.emailSettingsPanel.saveTheSMTPHostPortAndSenderEmailFirst") : ""}
                    />
                    <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={saving} onClick={requestRefresh}>
                        {translate("library.ark.asset.refresh")}
                    </Button>
                </div>
            </div>

            {loadError || saveError ? (
                <div className="admin-email-inline-alert" role="alert">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                    <span>{saveError || translate("admin.emailSettingsPanel.thePageStillShowsTheLastSuccessfullyLoadedSettings", { v0: String(loadError) })}</span>
                </div>
            ) : null}

            <div id="admin-email-delivery" className="admin-settings-anchor">
                <SettingsSectionCard
                    className="admin-email-section admin-email-delivery-section"
                    icon={<Send className="size-4" aria-hidden="true" />}
                    title={translate("admin.emailSettingsPanel.item1SendAccountSecurityEmails")}
                    description={translate("admin.emailSettingsPanel.thisControlsRegistrationVerificationAndPasswordRecoveryEmailsSMTPConfiguration")}
                    status={
                        <AdminStatusBadge
                            label={
                                draftEnabled
                                    ? dirty && !setting.enabled
                                        ? translate("admin.emailSettingsPanel.pendingEnablement")
                                        : translate("account.layout.oss.enabled")
                                    : dirty && setting.enabled
                                      ? translate("admin.emailSettingsPanel.pendingDisablement")
                                      : translate("account.layout.oss.notEnabled")
                            }
                            tone={dirty ? "warning" : draftEnabled ? "success" : "neutral"}
                        />
                    }
                    footer={
                        !draftEnabled ? (
                            <>
                                <div className="admin-email-footer-note">
                                    <BadgeCheck className="size-4" aria-hidden="true" />
                                    <span>{translate("admin.emailSettingsPanel.whenDisabledEmailRegistrationAndPasswordRecoveryCannotSendVerification")}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {dirty ? (
                                        <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                            {translate("account.settings.memory.actors.restore")}
                                        </Button>
                                    ) : null}
                                    <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || loading || refreshing} onClick={() => void submitSave()}>
                                        {translate("admin.emailSettingsPanel.saveSettings")}
                                    </Button>
                                </div>
                            </>
                        ) : undefined
                    }
                >
                    <div className="admin-email-delivery-policy">
                        <span className="admin-email-policy-icon">
                            <MailCheck className="size-5" aria-hidden="true" />
                        </span>
                        <div className="admin-email-policy-copy">
                            <div className="flex flex-wrap items-center gap-2">
                                <strong>{translate("admin.emailSettingsPanel.sendRegistrationAndPasswordRecoveryCodes")}</strong>
                                <AdminStatusBadge label={translate("admin.emailSettingsPanel.appliesAfterSaving")} tone="info" />
                            </div>
                            <p>{translate("admin.emailSettingsPanel.whenEnabledEmailRegistrationAndPasswordRecoveryUse6Digit")}</p>
                            <span>{translate("admin.emailSettingsPanel.disablingStopsFutureAccountEmailsOnlyRegistrationSettingsAndExisting")}</span>
                        </div>
                        <Switch checked={draftEnabled} disabled={loading || refreshing || saving} aria-label={translate("admin.emailSettingsPanel.sendAccountSecurityEmails")} onChange={toggleEnabled} />
                    </div>
                </SettingsSectionCard>
            </div>

            <Form
                form={form}
                className="admin-email-form-stack"
                layout="vertical"
                requiredMark={false}
                disabled={loading || refreshing || saving}
                onValuesChange={() => {
                    const values = form.getFieldsValue(true);
                    setDraftEnabled(Boolean(values.enabled));
                    setDirty(hasEmailChanges(values, setting));
                    setSaveError("");
                }}
            >
                <Form.Item name="enabled" valuePropName="checked" hidden>
                    <Switch />
                </Form.Item>

                {draftEnabled ? (
                    <div id="admin-email-smtp" className="admin-settings-anchor">
                        <SettingsSectionCard
                            className="admin-email-section admin-email-configuration-section"
                            icon={<Server className="size-4" aria-hidden="true" />}
                            title={translate("admin.emailSettingsPanel.item2ConfigureSMTPConnectionAndSenderIdentity")}
                            description={translate("admin.emailSettingsPanel.enterMailServerAuthenticationAndSenderDetailsAfterSavingUse")}
                            status={
                                <AdminStatusBadge
                                    label={dirty ? translate("admin.emailSettingsPanel.unsaved") : smtpReady ? translate("admin.emailSettingsPanel.configured") : translate("account.settings.modelConfig.capabilities.pending")}
                                    tone={dirty ? "warning" : smtpReady ? "success" : "neutral"}
                                />
                            }
                            footer={
                                <>
                                    <div className="admin-email-footer-note">
                                        <BadgeCheck className="size-4" aria-hidden="true" />
                                        <span>{translate("admin.emailSettingsPanel.theServerStoresTheSMTPPasswordEncryptedAndNeverDisplays")}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {dirty ? (
                                            <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                                {translate("account.settings.memory.actors.restore")}
                                            </Button>
                                        ) : null}
                                        <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || loading || refreshing} onClick={() => void submitSave()}>
                                            {draftEnabled ? translate("admin.emailSettingsPanel.saveAndEnable") : translate("admin.emailSettingsPanel.saveSettings")}
                                        </Button>
                                    </div>
                                </>
                            }
                        >
                            <div className="admin-email-form-section">
                                <FormSectionTitle
                                    icon={<Server className="size-4" />}
                                    title={translate("admin.emailSettingsPanel.serverConnection")}
                                    description={translate("admin.emailSettingsPanel.enterTheSMTPHostPortAndTransportEncryptionSTARTTLSTypically")}
                                />
                                <div className="admin-email-form-grid is-connection">
                                    <Form.Item name="host" label={translate("admin.emailSettingsPanel.sMTPHost")} extra={translate("admin.emailSettingsPanel.enterOnlyTheHostnameOrIPAddressWithoutProtocolOr")}>
                                        <Input autoComplete="off" placeholder="smtp.example.com" />
                                    </Form.Item>
                                    <Form.Item
                                        name="port"
                                        label={translate("admin.emailSettingsPanel.sMTPPort")}
                                        rules={[
                                            {
                                                validator: (_, value: number | null | undefined) =>
                                                    !draftEnabled || (Number(value) >= 1 && Number(value) <= 65535) ? Promise.resolve() : Promise.reject(new Error(translate("admin.emailSettingsPanel.enterAPortFrom1To65535"))),
                                            },
                                        ]}
                                    >
                                        <InputNumber min={1} max={65535} precision={0} placeholder="587" controls={false} />
                                    </Form.Item>
                                    <Form.Item name="encryption" label={translate("admin.emailSettingsPanel.connectionEncryption")} rules={[{ required: true, message: translate("admin.emailSettingsPanel.selectAConnectionEncryptionMethod") }]}>
                                        <Select
                                            options={[
                                                { label: translate("admin.emailSettingsPanel.sTARTTLSRecommendedUsually587"), value: "starttls" },
                                                { label: translate("admin.emailSettingsPanel.implicitTLSUsually465"), value: "tls" },
                                                { label: translate("admin.emailSettingsPanel.noEncryptionTrustedNetworksOnly"), value: "none" },
                                            ]}
                                        />
                                    </Form.Item>
                                </div>
                            </div>

                            <div className="admin-email-form-section">
                                <FormSectionTitle
                                    icon={<KeyRound className="size-4" />}
                                    title={translate("admin.emailSettingsPanel.sMTPAuthentication")}
                                    description={translate("admin.emailSettingsPanel.enterCredentialsIfTheServerRequiresAuthenticationLeaveThePassword")}
                                />
                                <div className="admin-email-form-grid">
                                    <Form.Item name="username" label={translate("admin.emailSettingsPanel.sMTPUsername")} extra={translate("admin.emailSettingsPanel.usuallyTheFullEmailAddressLeaveBlankForServersThat")}>
                                        <Input autoComplete="off" placeholder="mailer@example.com" />
                                    </Form.Item>
                                    <Form.Item
                                        name="password"
                                        label={setting.hasPassword ? translate("admin.emailSettingsPanel.sMTPPassword", { v0: String(configuredSecretText) }) : translate("admin.emailSettingsPanel.sMTPPassword2")}
                                        extra={translate("admin.emailSettingsPanel.enterAPasswordOnlyToAddOrReplaceIt")}
                                    >
                                        <Input.Password
                                            autoComplete="new-password"
                                            placeholder={setting.hasPassword ? translate("admin.emailSettingsPanel.leaveBlankToKeepTheCurrentPassword") : translate("admin.emailSettingsPanel.sMTPPasswordOrProviderAuthorizationCode")}
                                        />
                                    </Form.Item>
                                </div>
                            </div>

                            <div className="admin-email-form-section">
                                <FormSectionTitle icon={<AtSign className="size-4" />} title={translate("admin.emailSettingsPanel.senderIdentity")} description={translate("admin.emailSettingsPanel.thisNameAndAddressAppearInTheFromFieldOf")} />
                                <div className="admin-email-form-grid">
                                    <Form.Item
                                        name="fromEmail"
                                        label={translate("admin.emailSettingsPanel.senderEmail")}
                                        rules={[
                                            {
                                                validator: (_, value: string | undefined) =>
                                                    !draftEnabled || !value || isValidEmail(value.trim()) ? Promise.resolve() : Promise.reject(new Error(translate("admin.emailSettingsPanel.enterAValidSenderEmail"))),
                                            },
                                        ]}
                                        extra={translate("admin.emailSettingsPanel.usuallyMustMatchTheSMTPAccountOrADomainVerified")}
                                    >
                                        <Input autoComplete="off" inputMode="email" placeholder="noreply@example.com" />
                                    </Form.Item>
                                    <Form.Item
                                        name="fromName"
                                        label={translate("admin.emailSettingsPanel.senderName")}
                                        rules={[
                                            {
                                                validator: (_, value: string | undefined) =>
                                                    !draftEnabled || !value || !/[\r\n]/.test(value) ? Promise.resolve() : Promise.reject(new Error(translate("admin.emailSettingsPanel.theSenderNameCannotContainLineBreaks"))),
                                            },
                                        ]}
                                        extra={translate("admin.emailSettingsPanel.leaveBlankToUseTheCurrentSiteNameItUpdates", { v0: String(brandName) })}
                                    >
                                        <Input placeholder={brandName} />
                                    </Form.Item>
                                </div>
                            </div>
                        </SettingsSectionCard>
                    </div>
                ) : null}

                <div id="admin-email-registration-domains" className="admin-settings-anchor">
                    <SettingsSectionCard
                        className="admin-email-section"
                        icon={<MailCheck className="size-4" aria-hidden="true" />}
                        title={translate("admin.emailSettingsPanel.item3AllowedEmailDomains")}
                        description={translate("admin.emailSettingsPanel.enterOnePermittedEmailDomainPerLineEmailAddressesOutside")}
                        status={
                            <AdminStatusBadge
                                label={currentValues.registrationAllowedDomains.length > 0 ? translate("admin.emailSettingsPanel.restricted") : translate("admin.emailSettingsPanel.allProvidersAllowed")}
                                tone={currentValues.registrationAllowedDomains.length > 0 ? "info" : "neutral"}
                            />
                        }
                        footer={
                            <>
                                <div className="admin-email-footer-note">
                                    <BadgeCheck className="size-4" aria-hidden="true" />
                                    <span>{translate("admin.emailSettingsPanel.rulesAffectNewRegistrationsOnlyTheyDoNotRestrictThe")}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {dirty ? (
                                        <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                            {translate("account.settings.memory.actors.restore")}
                                        </Button>
                                    ) : null}
                                    <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || loading || refreshing} onClick={() => void submitSave()}>
                                        {translate("admin.emailSettingsPanel.saveSettings")}
                                    </Button>
                                </div>
                            </>
                        }
                    >
                        <div className="admin-email-form-section">
                            <Form.Item
                                name="registrationAllowedDomains"
                                label={translate("admin.emailSettingsPanel.allowedEmailDomains")}
                                extra={translate("admin.emailSettingsPanel.oneDomainPerLineSaveAnEmptyValueToAllow")}
                                rules={[{ validator: (_, value: string | undefined) => validateDomainList(value) }]}
                            >
                                <Input.TextArea
                                    autoSize={{ minRows: 9, maxRows: 16 }}
                                    placeholder="gmail.com&#10;163.com&#10;126.com&#10;qq.com"
                                    spellCheck={false}
                                />
                            </Form.Item>
                        </div>
                    </SettingsSectionCard>
                </div>
            </Form>
        </div>
    );
}

function TestEmailButton({ disabled, disabledReason }: { disabled: boolean; disabledReason: string }) {
    const { message } = App.useApp();
    const userEmail = useUserStore((state) => state.user?.email ?? "");
    const [open, setOpen] = useState(false);
    const [recipient, setRecipient] = useState(userEmail);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

    const send = async () => {
        const value = recipient.trim();
        if (!isValidEmail(value)) {
            setResult({ ok: false, text: translate("admin.emailSettingsPanel.enterAValidRecipientEmailAddress") });
            return;
        }
        setSending(true);
        setResult(null);
        try {
            await sendAdminTestEmail(value);
            setResult({ ok: true, text: translate("admin.emailSettingsPanel.deliveredToCheckTheInboxAndSpamFolder", { v0: String(value) }) });
            message.success(translate("admin.emailSettingsPanel.testEmailSent"));
        } catch (error) {
            setResult({ ok: false, text: error instanceof Error ? error.message : translate("admin.emailSettingsPanel.failedToSendTheTestEmail") });
        } finally {
            setSending(false);
        }
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setResult(null);
                    setRecipient((current) => current || userEmail);
                }
            }}
            trigger="click"
            placement="bottomRight"
            content={
                <div className="admin-email-test-popover" role="dialog" aria-label={translate("admin.emailSettingsPanel.sendTestEmail")}>
                    <strong>{translate("admin.emailSettingsPanel.sendTestEmail")}</strong>
                    <p>{translate("admin.emailSettingsPanel.sendAVerificationStyleTestEmailUsingTheSavedSMTP")}</p>
                    <Input
                        value={recipient}
                        onChange={(event) => setRecipient(event.target.value)}
                        onPressEnter={() => void send()}
                        placeholder={translate("admin.emailSettingsPanel.recipientEmail")}
                        inputMode="email"
                        autoComplete="email"
                        aria-label={translate("admin.emailSettingsPanel.testRecipientEmail")}
                    />
                    {result ? (
                        <div className={cn("admin-email-test-result", result.ok ? "is-ok" : "is-error")} role="status">
                            {result.text}
                        </div>
                    ) : null}
                    <Button type="primary" block icon={<Send className="size-4" />} loading={sending} onClick={() => void send()}>
                        {translate("admin.emailSettingsPanel.send")}
                    </Button>
                </div>
            }
        >
            <Button icon={<Send className="size-4" />} disabled={disabled} title={disabledReason || undefined}>
                {translate("admin.emailSettingsPanel.sendTestEmail")}
            </Button>
        </Popover>
    );
}

function FormSectionTitle({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
    return (
        <div className="admin-email-form-section-heading">
            <span>{icon}</span>
            <div>
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
        </div>
    );
}

function toEmailFormValues(setting: EmailSetting): EmailFormValues {
    return {
        enabled: setting.enabled,
        host: setting.host,
        port: setting.port,
        username: setting.username,
        password: "",
        encryption: setting.encryption,
        fromEmail: setting.fromEmail,
        fromName: setting.fromNameInherited ? "" : setting.fromName,
        registrationAllowedDomains: setting.registrationAllowedDomains.join("\n"),
    };
}

function normalizeEmailFormValues(values: Partial<EmailFormValues>): NormalizedEmailFormValues {
    return {
        enabled: Boolean(values.enabled),
        host: values.host?.trim() || "",
        port: Number(values.port) || 587,
        username: values.username?.trim() || "",
        password: values.password?.trim() || "",
        encryption: values.encryption === "tls" || values.encryption === "none" ? values.encryption : "starttls",
        fromEmail: values.fromEmail?.trim().toLowerCase() || "",
        fromName: values.fromName?.trim() || "",
        registrationAllowedDomains: normalizeDomains(values.registrationAllowedDomains),
    };
}

function hasEmailChanges(values: Partial<EmailFormValues>, setting: EmailSetting | null) {
    if (!setting) return false;
    const draft = normalizeEmailFormValues(values);
    const saved = normalizeEmailFormValues(toEmailFormValues(setting));
    if (draft.password) return true;
    const scalarFields: Array<keyof EmailFormValues> = ["enabled", "host", "port", "username", "encryption", "fromEmail", "fromName"];
    return scalarFields.some((key) => draft[key] !== saved[key]) || !arraysEqual(draft.registrationAllowedDomains, saved.registrationAllowedDomains);
}

function validateEmailDraft(values: EmailFormValues, setting: EmailSetting | null) {
    const draft = normalizeEmailFormValues(values);
    if (!draft.enabled) return "";
    if (/\r|\n/.test(draft.fromName)) return translate("admin.emailSettingsPanel.theSenderNameCannotContainLineBreaks");
    if (!draft.host || draft.port < 1 || draft.port > 65535 || !draft.fromEmail) return translate("admin.emailSettingsPanel.enterTheSMTPHostPortAndSenderEmailBeforeEnabling");
    if (!isValidEmail(draft.fromEmail)) return translate("admin.emailSettingsPanel.invalidSenderEmailAddress");
    if (draft.username && !draft.password && !setting?.hasPassword) return translate("admin.emailSettingsPanel.anSMTPUsernameWasEnteredAlsoEnterThePasswordOr");
    return "";
}

function emailResponseMatches(setting: EmailSetting, expected: NormalizedEmailFormValues) {
    const actual = normalizeEmailFormValues(toEmailFormValues(setting));
    const fields: Array<keyof EmailFormValues> = ["enabled", "host", "port", "username", "encryption", "fromEmail", "fromName"];
    if (expected.password && !setting.hasPassword) return false;
    return fields.every((key) => actual[key] === expected[key]) && arraysEqual(actual.registrationAllowedDomains, expected.registrationAllowedDomains);
}

function isEmailSetting(value: unknown): value is EmailSetting {
    if (!value || typeof value !== "object") return false;
    const setting = value as Partial<EmailSetting>;
    return (
        typeof setting.enabled === "boolean" &&
        typeof setting.host === "string" &&
        typeof setting.port === "number" &&
        typeof setting.username === "string" &&
        ["starttls", "tls", "none"].includes(setting.encryption || "") &&
        typeof setting.fromEmail === "string" &&
        typeof setting.fromName === "string" &&
        typeof setting.fromNameInherited === "boolean" &&
        typeof setting.hasPassword === "boolean" &&
        Array.isArray(setting.registrationAllowedDomains) &&
        setting.registrationAllowedDomains.every((value) => typeof value === "string")
    );
}

function normalizeDomains(value?: string) {
    return Array.from(
        new Set(
            (value || "")
                .split(/[\s,，;；]+/)
                .map((domain) => domain.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, ""))
                .filter(Boolean),
        ),
    );
}

function arraysEqual(left: string[], right: string[]) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateDomainList(value?: string) {
    const invalid = invalidDomain(value);
    return invalid ? Promise.reject(new Error(translate("admin.emailSettingsPanel.invalidEmailDomain", { v0: String(invalid) }))) : Promise.resolve();
}

function invalidDomain(value?: string) {
    return normalizeDomains(value).find((domain) => !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain));
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatSettingTime(value: string | undefined, fallback: string) {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return fallback;
    return translate("admin.emailSettingsPanel.updated", { v0: String(date.toLocaleString(currentLocale(), { hour12: false })) });
}
