import { App, Button, Input, Skeleton } from "antd";
import { Switch } from "@/pages/admin/ui/controls";
import { AlertTriangle, ArrowDown, ArrowUp, BadgeCheck, Eye, ListOrdered, Plus, RefreshCw, RotateCcw, Save, Search, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router";

import { cn } from "@/lib/utils";
import { getAdminResponseInterceptionSetting, updateAdminResponseInterceptionSetting, type ResponseInterceptionRule, type ResponseInterceptionSetting } from "@/services/api/response-interception";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";
import { translate } from "@/i18n";


const MAX_RULES = 100;
const MAX_MATCH_RUNES = 200;
const MAX_REPLACE_RUNES = 500;
const emptyRule = (): ResponseInterceptionRule => ({ contains: "", replace: "" });

export default function ResponseInterceptionSettingsPage() {
    const { message, modal } = App.useApp();
    const [setting, setSetting] = useState<ResponseInterceptionSetting | null>(null);
    const [enabled, setEnabled] = useState(false);
    const [rules, setRules] = useState<ResponseInterceptionRule[]>([]);
    const [previewInput, setPreviewInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const requestVersionRef = useRef(0);
    const navigationConfirmOpenRef = useRef(false);
    const navigationTriggerRef = useRef<HTMLElement | null>(null);
    const draft = useMemo(() => normalizeResponseInterceptionSetting({ enabled, rules }), [enabled, rules]);
    const dirty = useMemo(() => Boolean(setting && !responseInterceptionSettingsEqual(draft, setting)), [draft, setting]);
    const enabledDirty = Boolean(setting && enabled !== setting.enabled);
    const duplicateRuleIndexes = useMemo(() => findDuplicateRuleIndexes(draft.rules), [draft.rules]);
    const preview = useMemo(() => previewResponseInterception(previewInput, draft), [draft, previewInput]);

    const load = useCallback(
        async (initial = false, announce = false) => {
            const requestVersion = ++requestVersionRef.current;
            if (initial) setLoading(true);
            else setRefreshing(true);
            setLoadError("");
            try {
                const result = await getAdminResponseInterceptionSetting();
                if (requestVersion !== requestVersionRef.current) return;
                if (!isResponseInterceptionSetting(result.setting)) throw new Error(translate("adminPages.settings.responseInterceptionSettingsPage.theServerReturnedInvalidModelResponseInterceptionSettings"));
                setSetting(normalizeResponseInterceptionSetting(result.setting));
                setEnabled(result.setting.enabled);
                setRules(result.setting.rules.map((rule) => ({ ...rule })));
                setSaveError("");
                if (announce) message.success(translate("adminPages.settings.responseInterceptionSettingsPage.modelResponseInterceptionSettingsReloaded"));
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.responseInterceptionSettingsPage.failedToLoadModelResponseInterceptionSettings");
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
            title: translate("adminPages.settings.responseInterceptionSettingsPage.discardResponseInterceptionChanges"),
            content: translate("adminPages.settings.responseInterceptionSettingsPage.thisPageHasUnsavedSwitchRuleTextOrPriorityDrafts"),
            okText: translate("adminPages.settings.responseInterceptionSettingsPage.discardAndLeave"),
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
                    const fallback = document.querySelector<HTMLButtonElement>(".admin-intercept-command-actions button");
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
        setRules(setting.rules.map((rule) => ({ ...rule })));
        setSaveError("");
        message.info(translate("adminPages.settings.responseInterceptionSettingsPage.unsavedModelResponseInterceptionChangesDiscarded"));
    };

    const requestRefresh = () => {
        if (!dirty) {
            void load(false, true);
            return;
        }
        modal.confirm({
            title: translate("adminPages.settings.responseInterceptionSettingsPage.discardChangesAndReload"),
            content: translate("adminPages.settings.responseInterceptionSettingsPage.reloadingDiscardsTheCurrentSwitchRuleTextAndPriorityDrafts"),
            okText: translate("adminPages.settings.responseInterceptionSettingsPage.discardAndRefresh"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => load(false, true),
        });
    };

    const updateRule = (index: number, field: keyof ResponseInterceptionRule, value: string) => {
        setRules((current) => current.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, [field]: value } : rule)));
        setSaveError("");
    };

    const moveRule = (index: number, offset: -1 | 1) => {
        setRules((current) => {
            const target = index + offset;
            if (target < 0 || target >= current.length) return current;
            const next = current.map((rule) => ({ ...rule }));
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
        setSaveError("");
    };

    const removeRule = (index: number) => {
        setRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
        setSaveError("");
    };

    const addRule = () => {
        if (rules.length >= MAX_RULES) {
            message.warning(translate("adminPages.settings.responseInterceptionSettingsPage.modelResponseInterceptionRulesCannotExceed", { v0: String(MAX_RULES) }));
            return;
        }
        setRules((current) => [...current, emptyRule()]);
        setSaveError("");
        window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-response-rule-match="${rules.length + 1}"]`)?.focus());
    };

    const save = async (next?: ResponseInterceptionSetting) => {
        if (!setting) return;
        const expected = normalizeResponseInterceptionSetting(next || { enabled, rules });
        const validationError = validateResponseInterceptionSetting(expected);
        if (validationError) {
            message.error(validationError);
            return;
        }
        setSaving(true);
        setSaveError("");
        try {
            const result = await updateAdminResponseInterceptionSetting(expected);
            if (!isResponseInterceptionSetting(result.setting)) throw new Error(translate("adminPages.settings.responseInterceptionSettingsPage.theServerReturnedInvalidModelResponseInterceptionSettings"));
            const normalizedResult = normalizeResponseInterceptionSetting(result.setting);
            if (!responseInterceptionSettingsEqual(normalizedResult, expected)) throw new Error(translate("adminPages.settings.responseInterceptionSettingsPage.theServerSModelResponseInterceptionSettingsDifferFromThe"));
            setSetting(normalizedResult);
            setEnabled(normalizedResult.enabled);
            setRules(normalizedResult.rules.map((rule) => ({ ...rule })));
            message.success(translate("adminPages.settings.responseInterceptionSettingsPage.modelResponseInterceptionSettingsSaved"));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.responseInterceptionSettingsPage.failedToSaveModelResponseInterceptionSettings");
            setSaveError(translate("adminPages.settings.responseInterceptionSettingsPage.noAutomaticRetryWasMadeReloadTheCurrentSettingsBefore", { v0: String(errorMessage) }));
            message.error(errorMessage);
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const submitSave = async () => {
        if (!setting) return;
        const expected = normalizeResponseInterceptionSetting({ enabled, rules });
        const validationError = validateResponseInterceptionSetting(expected);
        if (validationError) {
            message.error(validationError);
            return;
        }
        try {
            await save(expected);
        } catch {
            // 保存错误已在 save 中就地提示。
        }
    };

    const changeEnabled = (nextEnabled: boolean) => {
        if (!setting || saving || nextEnabled === enabled) return;
        setEnabled(nextEnabled);
        setSaveError("");
    };

    if (loading && !setting) {
        return (
            <AdminPageFrame title={translate("adminPages.settings.responseInterceptionSettingsPage.modelResponseInterception")} description={translate("adminPages.settings.responseInterceptionSettingsPage.chooseWhetherToReplaceUserFacingErrorsThenConfigureRules")} scroll>
                <div className="admin-settings-stack admin-intercept-settings" aria-label={translate("adminPages.settings.responseInterceptionSettingsPage.loadingModelResponseInterceptionSettings")} role="status">
                    <div className="admin-intercept-command-bar">
                        <Skeleton active title={{ width: 190 }} paragraph={false} />
                    </div>
                    <div className="admin-intercept-loading-card">
                        <Skeleton active paragraph={{ rows: 7 }} />
                    </div>
                </div>
            </AdminPageFrame>
        );
    }

    if (!setting) {
        return (
            <AdminPageFrame title={translate("adminPages.settings.responseInterceptionSettingsPage.modelResponseInterception")} description={translate("adminPages.settings.responseInterceptionSettingsPage.chooseWhetherToReplaceUserFacingErrorsThenConfigureRules")} scroll>
                <div className="admin-settings-stack admin-intercept-settings">
                    <div className="admin-intercept-load-error" role="alert">
                        <span className="admin-intercept-load-error-icon">
                            <AlertTriangle className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h2>{translate("adminPages.settings.responseInterceptionSettingsPage.unableToLoadModelResponseInterceptionSettings")}</h2>
                            <p>{loadError || translate("adminPages.settings.responseInterceptionSettingsPage.noSettingsAreAvailableToDisplayPleaseTryAgainLater")}</p>
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
        <AdminPageFrame title={translate("adminPages.settings.responseInterceptionSettingsPage.modelResponseInterception")} description={translate("adminPages.settings.responseInterceptionSettingsPage.chooseWhetherToReplaceUserFacingErrorsThenConfigureRules")} scroll>
            <div className="admin-settings-stack admin-intercept-settings">
                <div className={cn("admin-intercept-command-bar", dirty && "is-dirty")}>
                    <div className="admin-intercept-command-copy" aria-live="polite">
                        <span className="admin-intercept-command-icon">
                            <ShieldAlert className="size-4" aria-hidden="true" />
                        </span>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <strong>{dirty ? translate("adminPages.settings.responseInterceptionSettingsPage.responseInterceptionHasUnsavedChanges") : translate("adminPages.settings.responseInterceptionSettingsPage.responseInterceptionSettingsSynced")}</strong>
                                <AdminStatusBadge label={dirty ? translate("adminPages.settings.responseInterceptionSettingsPage.notYetApplied") : translate("adminPages.settings.responseInterceptionSettingsPage.currentServerValue")} tone={dirty ? "warning" : "neutral"} />
                            </div>
                            <p>{dirty ? translate("adminPages.settings.responseInterceptionSettingsPage.theSwitchTextAndPrioritiesAreDraftsOnThisPage") : translate("adminPages.settings.responseInterceptionSettingsPage.onlyChangesTheFinalErrorTextShownToUsersOriginal")}</p>
                        </div>
                    </div>
                    <div className="admin-intercept-command-actions">
                        {dirty ? (
                            <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                {translate("adminPages.settings.responseInterceptionSettingsPage.discardChanges")}
                            </Button>
                        ) : null}
                        <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={saving} onClick={requestRefresh}>
                            {translate("library.ark.asset.refresh")}
                        </Button>
                    </div>
                </div>

                {loadError || saveError ? (
                    <div className="admin-intercept-inline-alert" role="alert">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                        <span>{saveError || translate("adminPages.settings.responseInterceptionSettingsPage.thePageStillShowsTheLastSettingsLoadedSuccessfully", { v0: String(loadError) })}</span>
                    </div>
                ) : null}

                <div id="admin-intercept-policy" className="admin-settings-anchor">
                    <SettingsSectionCard
                        className="admin-intercept-section admin-intercept-policy-section"
                        icon={<ShieldAlert className="size-4" aria-hidden="true" />}
                        title={translate("adminPages.settings.responseInterceptionSettingsPage.item1ReplaceUserFacingUpstreamErrors")}
                        description={translate("adminPages.settings.responseInterceptionSettingsPage.thisIsTheMainResponseInterceptionSwitchWhenDisabledRules")}
                        status={<AdminStatusBadge label={enabledDirty ? (enabled ? translate("adminPages.settings.responseInterceptionSettingsPage.pendingEnable") : translate("adminPages.settings.responseInterceptionSettingsPage.pendingDisable")) : enabled ? translate("account.layout.oss.enabled") : translate("adminPages.settings.responseInterceptionSettingsPage.disabled")} tone={enabledDirty ? "warning" : enabled ? "success" : "neutral"} />}
                        footer={
                            !enabled ? (
                                <>
                                    <div className="admin-intercept-footer-note">
                                        <ShieldCheck className="size-4" aria-hidden="true" />
                                        <span>{translate("adminPages.settings.responseInterceptionSettingsPage.rulesRemainSavedOnTheServerWhenDisabledAndCan")}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {dirty ? (
                                            <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                                {translate("account.settings.memory.actors.restore")}
                                            </Button>
                                        ) : null}
                                        <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || loading || refreshing} onClick={() => void submitSave()}>
                                            {translate("adminPages.settings.responseInterceptionSettingsPage.saveChanges")}
                                        </Button>
                                    </div>
                                </>
                            ) : undefined
                        }
                    >
                        <div className="admin-intercept-policy-control">
                            <span className="admin-intercept-policy-icon">
                                <Eye className="size-4" aria-hidden="true" />
                            </span>
                            <div className="admin-intercept-policy-copy">
                                <strong>{translate("adminPages.settings.responseInterceptionSettingsPage.replaceUserFacingErrorText")}</strong>
                                <p>{translate("adminPages.settings.responseInterceptionSettingsPage.whenEnabledErrorTextIsCheckedInRuleOrderIgnoring")}</p>
                                <span>{enabled ? (draft.rules.length ? translate("adminPages.settings.responseInterceptionSettingsPage.theCurrentDraftChecksAllRulesInOrderUnmatchedText") : translate("adminPages.settings.responseInterceptionSettingsPage.thereAreNoRulesEnablingInterceptionWillNotChangeUser")) : translate("adminPages.settings.responseInterceptionSettingsPage.currentlyDisabledAllUserFacingErrorsAreShownUnchanged")}</span>
                            </div>
                            <div className="admin-intercept-policy-switch">
                                <span>{enabled ? translate("adminPages.settings.responseInterceptionSettingsPage.enable") : translate("adminPages.settings.responseInterceptionSettingsPage.disable")}</span>
                                <Switch checked={enabled} disabled={loading || refreshing || saving} aria-label={translate("adminPages.settings.responseInterceptionSettingsPage.enableResponseInterceptionRules")} onChange={changeEnabled} />
                            </div>
                        </div>
                        <div className="admin-intercept-context-note">
                            <ShieldCheck className="size-4" aria-hidden="true" />
                            <span>{translate("adminPages.settings.responseInterceptionSettingsPage.onlyChangesUserFacingTextReturnedForTaskFailuresAnd")}</span>
                        </div>
                    </SettingsSectionCard>
                </div>

                {enabled ? (
                    <>
                        <div id="admin-intercept-rules" className="admin-settings-anchor">
                            <SettingsSectionCard
                                className="admin-intercept-section admin-intercept-rules-section"
                                icon={<ListOrdered className="size-4" aria-hidden="true" />}
                                title={translate("adminPages.settings.responseInterceptionSettingsPage.item2ConfigureReplacementRulesAndPriority")}
                                description={translate("adminPages.settings.responseInterceptionSettingsPage.rulesAreMatchedFromTopToBottomCheckingStopsAt")}
                                status={<AdminStatusBadge label={translate("adminPages.settings.responseInterceptionSettingsPage.rules", { v0: String(draft.rules.length), v1: String(MAX_RULES) })} tone={duplicateRuleIndexes.size ? "warning" : draft.rules.length ? "info" : "neutral"} />}
                                footer={
                                    <>
                                        <div className="admin-intercept-footer-note">
                                            <BadgeCheck className="size-4" aria-hidden="true" />
                                            <span>{translate("adminPages.settings.responseInterceptionSettingsPage.savingMakesNoModelCallsOrTestErrorsOriginalUpstream")}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {dirty ? (
                                                <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                                    {translate("account.settings.memory.actors.restore")}
                                                </Button>
                                            ) : null}
                                            <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || loading || refreshing} onClick={() => void submitSave()}>
                                                {translate("adminPages.settings.responseInterceptionSettingsPage.saveChanges")}
                                            </Button>
                                        </div>
                                    </>
                                }
                            >
                                <div className="admin-intercept-rule-toolbar">
                                    <div>
                                        <strong>{translate("adminPages.settings.responseInterceptionSettingsPage.orderedByPriorityFromTopToBottom")}</strong>
                                        <p>{translate("adminPages.settings.responseInterceptionSettingsPage.duplicateOrOverlyBroadMatchTextMayPreventLaterRules")}</p>
                                    </div>
                                    <Button icon={<Plus className="size-4" />} disabled={loading || refreshing || saving || rules.length >= MAX_RULES} onClick={addRule}>
                                        {translate("adminPages.settings.responseInterceptionSettingsPage.addRule")}
                                    </Button>
                                </div>

                                {duplicateRuleIndexes.size ? (
                                    <div className="admin-intercept-duplicate-alert" role="alert">
                                        <AlertTriangle className="size-4" aria-hidden="true" />
                                        <span>{translate("adminPages.settings.responseInterceptionSettingsPage.someMatchTextIsIdenticalWhenLetterCaseIsIgnored")}</span>
                                    </div>
                                ) : null}

                                {rules.length ? (
                                    <div className="admin-intercept-rule-table" aria-label={translate("adminPages.settings.responseInterceptionSettingsPage.modelResponseInterceptionRules")}>
                                        <div className="admin-intercept-rule-header" aria-hidden="true">
                                            <span>{translate("adminPages.settings.responseInterceptionSettingsPage.priority")}</span>
                                            <span>{translate("adminPages.settings.responseInterceptionSettingsPage.upstreamTextContains")}</span>
                                            <span>{translate("adminPages.settings.responseInterceptionSettingsPage.replaceEntireMessageWith")}</span>
                                            <span>{translate("account.settings.runninghub.actions")}</span>
                                        </div>
                                        <div className="admin-intercept-rule-list">
                                            {rules.map((rule, index) => (
                                                <div key={index} className={cn("admin-intercept-rule-row", duplicateRuleIndexes.has(index) && "has-duplicate")}>
                                                    <div className="admin-intercept-rule-index">
                                                        <span>{index + 1}</span>
                                                        <small>{index === 0 ? translate("adminPages.settings.responseInterceptionSettingsPage.first") : translate("adminPages.settings.responseInterceptionSettingsPage.no", { v0: String(index + 1) })}</small>
                                                    </div>
                                                    <div className="admin-intercept-rule-field">
                                                        <Input
                                                            value={rule.contains}
                                                            maxLength={MAX_MATCH_RUNES}
                                                            showCount
                                                            disabled={loading || refreshing || saving}
                                                            data-response-rule-match={index + 1}
                                                            aria-label={translate("adminPages.settings.responseInterceptionSettingsPage.matchTextForRule", { v0: String(index + 1) })}
                                                            placeholder={translate("adminPages.settings.responseInterceptionSettingsPage.forExampleInsufficientBalanceHTTP429")}
                                                            onChange={(event) => updateRule(index, "contains", event.target.value)}
                                                        />
                                                        <small>{translate("adminPages.settings.responseInterceptionSettingsPage.usesACaseInsensitiveSubstringMatch")}</small>
                                                    </div>
                                                    <div className="admin-intercept-rule-field">
                                                        <Input.TextArea
                                                            value={rule.replace}
                                                            maxLength={MAX_REPLACE_RUNES}
                                                            showCount
                                                            autoSize={{ minRows: 1, maxRows: 4 }}
                                                            disabled={loading || refreshing || saving}
                                                            aria-label={translate("adminPages.settings.responseInterceptionSettingsPage.replacementTextForRule", { v0: String(index + 1) })}
                                                            placeholder={translate("adminPages.settings.responseInterceptionSettingsPage.forExampleServiceIsBusyPleaseTryAgainLater")}
                                                            onChange={(event) => updateRule(index, "replace", event.target.value)}
                                                        />
                                                        <small>{translate("adminPages.settings.responseInterceptionSettingsPage.replacesTheEntireMessageNotJustTheMatchedPortion")}</small>
                                                    </div>
                                                    <div className="admin-intercept-rule-actions">
                                                        <Button type="text" icon={<ArrowUp className="size-4" />} aria-label={translate("adminPages.settings.responseInterceptionSettingsPage.moveRuleUp", { v0: String(index + 1) })} disabled={loading || refreshing || saving || index === 0} onClick={() => moveRule(index, -1)} />
                                                        <Button
                                                            type="text"
                                                            icon={<ArrowDown className="size-4" />}
                                                            aria-label={translate("adminPages.settings.responseInterceptionSettingsPage.moveRuleDown", { v0: String(index + 1) })}
                                                            disabled={loading || refreshing || saving || index === rules.length - 1}
                                                            onClick={() => moveRule(index, 1)}
                                                        />
                                                        <Button type="text" danger icon={<Trash2 className="size-4" />} aria-label={translate("adminPages.settings.responseInterceptionSettingsPage.deleteRule", { v0: String(index + 1) })} disabled={loading || refreshing || saving} onClick={() => removeRule(index)} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="admin-intercept-empty">
                                        <span>
                                            <Search className="size-5" aria-hidden="true" />
                                        </span>
                                        <div>
                                            <strong>{translate("adminPages.settings.responseInterceptionSettingsPage.noInterceptionRulesYet")}</strong>
                                            <p>{translate("adminPages.settings.responseInterceptionSettingsPage.userFacingErrorsRemainUnchangedAddRulesAndPreviewLocally")}</p>
                                        </div>
                                        <Button icon={<Plus className="size-4" />} disabled={loading || refreshing || saving} onClick={addRule}>
                                            {translate("adminPages.settings.responseInterceptionSettingsPage.addFirstRule")}
                                        </Button>
                                    </div>
                                )}
                            </SettingsSectionCard>
                        </div>

                        <div id="admin-intercept-preview" className="admin-settings-anchor">
                            <SettingsSectionCard
                                className="admin-intercept-section admin-intercept-preview-section"
                                icon={<Eye className="size-4" aria-hidden="true" />}
                                title={translate("adminPages.settings.responseInterceptionSettingsPage.item3PreviewTheFinalUserFacingMessageLocally")}
                                description={translate("adminPages.settings.responseInterceptionSettingsPage.simulatesServerTrimmingCaseInsensitiveSubstringMatchingAndFirstMatch")}
                                status={<AdminStatusBadge label={translate("adminPages.settings.responseInterceptionSettingsPage.thisBrowserOnly")} tone="neutral" />}
                            >
                                <div className="admin-intercept-preview-grid">
                                    <div className="admin-intercept-preview-input">
                                        <label htmlFor="admin-intercept-preview-input">{translate("adminPages.settings.responseInterceptionSettingsPage.simulatedUpstreamErrorText")}</label>
                                        <Input.TextArea id="admin-intercept-preview-input" value={previewInput} autoSize={{ minRows: 4, maxRows: 8 }} placeholder={translate("adminPages.settings.responseInterceptionSettingsPage.pasteAnErrorMessageForLocalPreview")} onChange={(event) => setPreviewInput(event.target.value)} />
                                        <p>{translate("adminPages.settings.responseInterceptionSettingsPage.computedOnlyInMemoryExcludedFromSaveRequestsAuditsAnd")}</p>
                                    </div>
                                    <div className="admin-intercept-preview-result" aria-live="polite">
                                        <div className="admin-intercept-preview-heading">
                                            <strong>{translate("adminPages.settings.responseInterceptionSettingsPage.finalUserFacingMessage")}</strong>
                                            <AdminStatusBadge
                                                label={!preview.raw ? translate("adminPages.settings.responseInterceptionSettingsPage.waitingForInput") : preview.matchIndex < 0 ? translate("adminPages.settings.responseInterceptionSettingsPage.noMatch") : enabled ? translate("adminPages.settings.responseInterceptionSettingsPage.matchedRule", { v0: String(preview.matchIndex + 1) }) : translate("adminPages.settings.responseInterceptionSettingsPage.ruleMatchesButInterceptionIsDisabled", { v0: String(preview.matchIndex + 1) })}
                                                tone={!preview.raw || preview.matchIndex < 0 || !enabled ? "neutral" : "success"}
                                            />
                                        </div>
                                        <p className={cn(!preview.output && "is-placeholder")}>{preview.output || translate("adminPages.settings.responseInterceptionSettingsPage.enterASimulatedErrorToSeeTheResultOfThe")}</p>
                                        <small>
                                            {preview.matchIndex >= 0
                                                ? enabled
                                                    ? translate("adminPages.settings.responseInterceptionSettingsPage.entireMessageReplacedByTheFirstMatchingRule")
                                                    : translate("adminPages.settings.responseInterceptionSettingsPage.aRuleMatchesButTheGlobalSwitchIsDisabledSo")
                                                : preview.raw
                                                  ? translate("adminPages.settings.responseInterceptionSettingsPage.noRuleMatchesThisTextSoItIsShownUnchanged")
                                                  : translate("adminPages.settings.responseInterceptionSettingsPage.thePreviewDoesNotVerifyRealUpstreamResponsesOrMake")}
                                        </small>
                                    </div>
                                </div>
                            </SettingsSectionCard>
                        </div>
                    </>
                ) : null}
            </div>
        </AdminPageFrame>
    );
}

function normalizeResponseInterceptionSetting(value: ResponseInterceptionSetting): ResponseInterceptionSetting {
    return {
        enabled: Boolean(value.enabled),
        rules: Array.isArray(value.rules) ? value.rules.map((rule) => ({ contains: rule.contains.trim(), replace: rule.replace.trim() })) : [],
    };
}

function validateResponseInterceptionSetting(value: ResponseInterceptionSetting) {
    if (value.rules.length > MAX_RULES) return translate("adminPages.settings.responseInterceptionSettingsPage.modelResponseInterceptionRulesCannotExceed", { v0: String(MAX_RULES) });
    for (let index = 0; index < value.rules.length; index += 1) {
        const rule = value.rules[index];
        if (!rule.contains) return translate("adminPages.settings.responseInterceptionSettingsPage.matchTextForInterceptionRuleCannotBeEmpty", { v0: String(index + 1) });
        if (Array.from(rule.contains).length > MAX_MATCH_RUNES) return translate("adminPages.settings.responseInterceptionSettingsPage.matchTextForInterceptionRuleCannotExceedCharacters", { v0: String(index + 1), v1: String(MAX_MATCH_RUNES) });
        if (!rule.replace) return translate("adminPages.settings.responseInterceptionSettingsPage.replacementTextForInterceptionRuleCannotBeEmpty", { v0: String(index + 1) });
        if (Array.from(rule.replace).length > MAX_REPLACE_RUNES) return translate("adminPages.settings.responseInterceptionSettingsPage.replacementTextForInterceptionRuleCannotExceedCharacters", { v0: String(index + 1), v1: String(MAX_REPLACE_RUNES) });
    }
    return "";
}

function responseInterceptionSettingsEqual(left: ResponseInterceptionSetting, right: ResponseInterceptionSetting) {
    const normalizedLeft = normalizeResponseInterceptionSetting(left);
    const normalizedRight = normalizeResponseInterceptionSetting(right);
    if (normalizedLeft.enabled !== normalizedRight.enabled || normalizedLeft.rules.length !== normalizedRight.rules.length) return false;
    return normalizedLeft.rules.every((rule, index) => rule.contains === normalizedRight.rules[index].contains && rule.replace === normalizedRight.rules[index].replace);
}

function findDuplicateRuleIndexes(rules: ResponseInterceptionRule[]) {
    const seen = new Map<string, number>();
    const duplicates = new Set<number>();
    rules.forEach((rule, index) => {
        const key = rule.contains.trim().toLocaleLowerCase();
        if (!key) return;
        const first = seen.get(key);
        if (first === undefined) seen.set(key, index);
        else {
            duplicates.add(first);
            duplicates.add(index);
        }
    });
    return duplicates;
}

function previewResponseInterception(input: string, setting: ResponseInterceptionSetting) {
    const raw = input.trim();
    if (!raw) return { raw: "", output: "", matchIndex: -1 };
    const lower = raw.toLocaleLowerCase();
    const matchIndex = setting.rules.findIndex((rule) => rule.contains && lower.includes(rule.contains.toLocaleLowerCase()));
    return {
        raw,
        matchIndex,
        output: setting.enabled && matchIndex >= 0 ? setting.rules[matchIndex].replace : raw,
    };
}

function isResponseInterceptionSetting(value: unknown): value is ResponseInterceptionSetting {
    if (!value || typeof value !== "object") return false;
    const setting = value as Partial<ResponseInterceptionSetting>;
    return typeof setting.enabled === "boolean" && Array.isArray(setting.rules) && setting.rules.every((rule) => Boolean(rule && typeof rule === "object" && typeof rule.contains === "string" && typeof rule.replace === "string"));
}
