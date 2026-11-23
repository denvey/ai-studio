import { useRef, useState } from "react";
import { Alert, App, AutoComplete, Button, Form, Input, Segmented, Switch, Tabs } from "antd";
import { useAdminContext } from "../admin-context";
import { AdminModal } from "@/pages/admin/ui/overlays";
import { FlaskConical, Plus } from "lucide-react";
import { ModelIconPicker } from "@/components/model-logo";
import { ModelIcon } from "@/components/model-picker";
import { ModelProtocolBrowser } from "@/components/model-protocol-browser";
import { MediaTransportFields } from "./media-transport-fields";
import { ModelCapabilityEditor } from "@/components/model-capability-editor";
import { defaultModelCapabilityConfig, normalizeModelCapabilityConfig, type ModelCapabilityConfig } from "@/lib/model-capabilities";
import type { ModelProtocolDefinition } from "@/lib/model-protocols";
import { createAdminChannelModel, testAdminChannelModel, updateAdminChannelModel, type ChannelModel } from "@/services/api/wallet";
import type { ModelChannel } from "@/stores/use-config-store";
import { priceCurrencyOptions } from "@/services/api/user-groups";
import { defaultPriceTier, normalizeUpstreamModelKey, priceTierPayloadFromForm } from "./channel-model-price-tier-form";
import { PriceTierFields } from "./channel-model-price-tier-fields";
import { TokenPriceRulesSection } from "./channel-model-token-rules";
import { ChannelModelTagsEditor } from "./channel-model-tags-editor";
import {
    changeChannelModelCapability,
    changeChannelModelProtocol,
    editorSectionForField,
    initialChannelModelValues,
    replaceChannelModelFormValues,
    updateChannelModelUpstreamCapabilities,
    validateChannelModelPrices,
    validateChannelModelProtocol,
    type ChannelModelFormValues as FormValues,
    type EditorSection,
} from "./channel-model-editor-form";
import { currentLocale, translate } from "@/i18n";

export function ChannelModelEditor({
    channel,
    editing,
    draftValues,
    protocols,
    protocolLoading,
    protocolError,
    onRetryProtocols,
    onClose,
    onSaved,
}: {
    channel: ModelChannel;
    editing: ChannelModel | null;
    draftValues?: FormValues;
    protocols: ModelProtocolDefinition[];
    protocolLoading: boolean;
    protocolError: string;
    onRetryProtocols: () => void;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const { message, modal } = App.useApp();
    const { references } = useAdminContext();
    const displayNameOptions = [...new Set(["未分类", ...references.channels.flatMap((item) => item.modelDisplayNames ?? [])])].sort((a, b) => a.localeCompare(b, currentLocale())).map((value) => ({ value }));
    const [groupSearch, setGroupSearch] = useState("");
    const [form] = Form.useForm<FormValues>();
    const [initialValues] = useState(() => draftValues ?? initialChannelModelValues(editing, protocols));
    const previousUpstream = useRef(normalizeUpstreamModelKey(initialValues.providerModelKey || initialValues.modelKey));
    const [activeSection, setActiveSection] = useState<EditorSection>("identity");
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [configurationChanged, setConfigurationChanged] = useState(false);
    const busyRef = useRef(false);
    const dirtyRef = useRef(false);
    const modelCapability = Form.useWatch("capability", form);
    const modelProtocol = Form.useWatch("protocol", form);
    const modelKey = Form.useWatch("modelKey", form) || "";
    const providerModelKey = Form.useWatch("providerModelKey", form) || "";
    const capabilityConfig = Form.useWatch("capabilityConfig", form);
    const modelEnabled = Form.useWatch("enabled", form) !== false;
    const referenceVideoBilling = Form.useWatch("referenceVideoBilling", form) === true;
    const priceTiers = Form.useWatch("priceTiers", form) || [];
    const hasDefaultPriceTier = priceTiers.some((tier) => tier.matchMode === "default");
    const tiersWithOwnUpstream = priceTiers.filter((tier) => tier.providerModelKey?.trim());
    const modelUpstream = normalizeUpstreamModelKey(providerModelKey || modelKey);
    const busy = saving || testing;

    const requestClose = () => {
        if (busyRef.current) return;
        if (!dirtyRef.current) {
            onClose();
            return;
        }
        modal.confirm({ title: translate("admin.channelModelEditor.discardUnsavedChanges"), content: translate("admin.channelModelEditor.yourChangesAreUnsavedAndWillBeDiscardedWhenYou"), okText: translate("admin.channelModelEditor.discardChanges"), cancelText: translate("account.settings.prompts.switchCancel"), onOk: onClose });
    };

    const handleFormValuesChange = (changed: Partial<FormValues>) => {
        dirtyRef.current = true;
        if (changed.capability) {
            replaceChannelModelFormValues(form, changeChannelModelCapability(form.getFieldsValue(true), protocols));
            setConfigurationChanged(true);
        } else if (changed.protocol) {
            replaceChannelModelFormValues(form, changeChannelModelProtocol(form.getFieldsValue(true), changed.protocol, protocols));
            setConfigurationChanged(true);
        } else if (changed.providerModelKey !== undefined || changed.modelKey !== undefined) {
            const values = form.getFieldsValue(true);
            const upstream = normalizeUpstreamModelKey(values.providerModelKey || values.modelKey);
            if (!values.channelLabel?.trim() || values.channelLabel.trim() === previousUpstream.current) {
                form.setFieldValue("channelLabel", upstream);
            }
            previousUpstream.current = upstream;
            const next = updateChannelModelUpstreamCapabilities(values, protocols);
            if (next !== values) {
                form.setFieldValue("capabilityConfig", next.capabilityConfig);
                setConfigurationChanged(true);
            }
        }
    };

    const validateEditor = async (names?: string[]): Promise<FormValues | undefined> => {
        busyRef.current = true;
        try {
            await form.validateFields(names);
            return form.getFieldsValue(true);
        } catch (error) {
            const fields = (error as { errorFields?: { name: (string | number)[] }[] }).errorFields;
            if (fields?.length) {
                setActiveSection(editorSectionForField(fields[0].name));
                requestAnimationFrame(() => form.scrollToField(fields[0].name, { block: "center", focus: true }));
                message.warning(translate("admin.channelModelEditor.reviewTheHighlightedSettingsAndTryAgain"));
            } else message.error(error instanceof Error ? error.message : translate("admin.channelModelEditor.formValidationFailed"));
            return undefined;
        } finally {
            busyRef.current = false;
        }
    };

    const save = async () => {
        if (busyRef.current) return;
        const values = await validateEditor();
        if (!values) return;
        const upstreamModel = values.providerModelKey?.trim() || values.modelKey.trim();
        const capabilityConfig =
            values.capability === "text" || values.capability === "image" || values.capability === "video" ? normalizeModelCapabilityConfig(values.capabilityConfig || defaultModelCapabilityConfig(values.protocol, upstreamModel)) : undefined;
        busyRef.current = true;
        setSaving(true);
        try {
            const payload = {
                modelKey: values.modelKey.trim(),
                providerModelKey: upstreamModel,
                displayName: values.displayName?.trim() || "未分类",
                channelLabel: values.channelLabel?.trim() || upstreamModel,
                tags: (values.tags || []).map((tag) => ({ text: tag.text.trim(), color: tag.color })),
                description: values.description?.trim() || "",
                icon: values.icon?.trim() || "",
                capability: values.capability,
                protocol: values.protocol,
                priceTiers: values.priceTiers.map((tier) => priceTierPayloadFromForm(values.capability, tier, upstreamModel, capabilityConfig)),
                priceCurrency: values.priceCurrency || "credits",
                referenceVideoBilling: values.capability === "video" && values.referenceVideoBilling === true,
                enabled: values.enabled !== false,
                capabilityConfig,
            };
            if (editing) await updateAdminChannelModel(channel.id, editing.id, payload);
            else await createAdminChannelModel(channel.id, payload);
            try {
                await onSaved();
            } catch {
                message.warning(translate("admin.channelModelEditor.modelSavedButTheListCouldNotBeRefreshedRefresh"));
            }
            onClose();
            message.success(editing ? translate("admin.channelModelEditor.modelConfigurationUpdated") : translate("admin.channelModelEditor.modelAdded"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channelModelEditor.failedToSaveModel"));
        } finally {
            busyRef.current = false;
            setSaving(false);
        }
    };

    const testModel = async () => {
        if (busyRef.current) return;
        const values = await validateEditor(["modelKey", "providerModelKey", "capability", "protocol", "capabilityConfig"]);
        if (!values) return;
        const upstreamModel = values.providerModelKey?.trim() || values.modelKey.trim();
        const capabilityConfig =
            values.capability === "text" || values.capability === "image" || values.capability === "video" ? normalizeModelCapabilityConfig(values.capabilityConfig || defaultModelCapabilityConfig(values.protocol, upstreamModel)) : undefined;
        busyRef.current = true;
        setTesting(true);
        try {
            const result = await testAdminChannelModel(channel.id, {
                modelKey: values.modelKey.trim(),
                providerModelKey: upstreamModel,
                capability: values.capability,
                protocol: values.protocol,
                capabilityConfig,
            });
            message.success(translate("admin.channelModelEditor.modelTestPassedInS", { v0: String((result.durationMs / 1000).toFixed(2)) }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("account.settings.modelConfig.testFailed"));
        } finally {
            busyRef.current = false;
            setTesting(false);
        }
    };

    return (
        <AdminModal
            open
            title={
                <div className="admin-model-editor-title">
                    <span>{draftValues ? translate("admin.channelModelEditor.duplicateModel") : editing ? translate("admin.channelModelEditor.editModel") : translate("admin.channelModelEditor.addModel")}</span>
                    <p>
                        {channel.name} · {editing?.displayName || editing?.modelKey || draftValues?.displayName || translate("admin.channelModelEditor.configureTheRequestProtocolAndUserCreditPricing")}
                    </p>
                </div>
            }
            width={1120}
            centered
            rootClassName="admin-modal-root admin-model-editor-modal"
            mask={{ closable: false }}
            keyboard={!busy}
            closable={!busy}
            onCancel={requestClose}
            flush
            styles={{ body: { minHeight: 0, flex: 1 }, header: { margin: 0 }, footer: { margin: 0 } }}
            footer={
                <div className="admin-model-editor-footer-actions">
                    <div className="admin-model-editor-footer-status">
                        <Switch
                            aria-label={translate("admin.channelModelEditor.enableModel")}
                            checked={modelEnabled}
                            disabled={busy}
                            onChange={(checked) => {
                                dirtyRef.current = true;
                                form.setFieldValue("enabled", checked);
                            }}
                        />
                        <div>
                            <strong>{modelEnabled ? translate("admin.channelModelEditor.modelEnabled") : translate("admin.channelModelEditor.modelDisabled")}</strong>
                            <small>{translate("admin.channelModelEditor.appliesAfterSaving")}</small>
                        </div>
                    </div>
                    <div className="admin-model-editor-footer-primary">
                        <Button
                            icon={<FlaskConical className="size-4" />}
                            loading={testing}
                            disabled={saving || protocolLoading || Boolean(protocolError)}
                            onClick={() => modal.confirm({ title: translate("admin.channelModelEditor.testModelConnection"), content: translate("admin.channelModelEditor.testingSendsARealUpstreamRequestAndMayIncurProvider"), okText: translate("admin.channelModelEditor.startTest"), cancelText: translate("common.cancel"), onOk: testModel })}
                        >
                            {translate("account.settings.modelConfig.test")}
                        </Button>
                        <Button disabled={busy} onClick={requestClose}>
                            {translate("common.cancel")}
                        </Button>
                        <Button type="primary" loading={saving} disabled={testing || protocolLoading || Boolean(protocolError)} onClick={() => void save()}>
                            {editing ? translate("admin.channelModelEditor.saveChanges") : translate("admin.channelModelEditor.addModel2")}
                        </Button>
                    </div>
                </div>
            }
        >
            <Form className="admin-model-editor-form" form={form} initialValues={initialValues} layout="vertical" disabled={busy} inert={busy} onValuesChange={handleFormValuesChange}>
                <Form.Item name="capabilityConfig" noStyle>
                    <CapabilityConfigField />
                </Form.Item>
                <Form.Item name="enabled" noStyle>
                    <EnabledConfigField />
                </Form.Item>
                <Tabs
                    activeKey={activeSection}
                    onChange={(key) => setActiveSection(key as EditorSection)}
                    animated={false}
                    items={[
                        {
                            key: "identity",
                            label: translate("account.settings.modelConfig.tabBasic"),
                            forceRender: true,
                            children: (
                                <div className="admin-model-editor-tab-content">
                                    <section className="admin-model-editor-section">
                                        <SectionHeading title={translate("admin.channelModelEditor.modelIdentity")} description={translate("admin.channelModelEditor.separateTheProductModelKeyFromTheActualUpstreamRequest")} />
                                        <div className="admin-model-editor-section-content admin-model-identity-grid admin-model-identity-grid-with-icon">
                                            <Form.Item
                                                name="modelKey"
                                                label={translate("admin.channelModelEditor.productModelKey")}
                                                tooltip={translate("admin.channelModelEditor.theSameKeyAcrossChannelsGroupsModelsAsOneProduct")}
                                                rules={[{ required: true, whitespace: true, message: translate("admin.channelModelEditor.enterAProductModelKey") }]}
                                            >
                                                <Input
                                                    prefix={
                                                        <span className="grid size-6 place-items-center">
                                                            <ModelIcon model={modelKey} />
                                                        </span>
                                                    }
                                                    placeholder={translate("admin.channelModelEditor.forExampleSeedance25")}
                                                />
                                            </Form.Item>
                                            <Form.Item name="providerModelKey" label={translate("admin.channelModelEditor.upstreamModelID")} tooltip={translate("admin.channelModelEditor.theIDSentToTheProviderLeaveBlankToUse")}>
                                                <Input placeholder={translate("admin.channelModelEditor.leaveBlankToUseTheProductModelKey")} />
                                            </Form.Item>
                                            <Form.Item name="displayName" label={translate("admin.channelModelEditor.modelDisplayNamePrimaryGroup")} tooltip={translate("admin.channelModelEditor.usedToGroupModelsAcrossAllSystemChannelsNewModels")}>
                                                <AutoComplete
                                                    options={displayNameOptions}
                                                    filterOption={(_, option) => Boolean(option?.value.toLowerCase().includes(groupSearch.trim().toLowerCase()))}
                                                    onSearch={setGroupSearch}
                                                    onFocus={() => setGroupSearch("")}
                                                    onOpenChange={(open) => {
                                                        if (open) setGroupSearch("");
                                                    }}
                                                    placeholder={translate("admin.channelModelEditor.selectAnExistingGroupOrEnterANewNameDefaults")}
                                                    allowClear
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name="channelLabel"
                                                label={translate("admin.channelModelEditor.channelDisplayNameSecondaryEntry")}
                                                tooltip={translate("admin.channelModelEditor.defaultsToTheUpstreamModelIDCustomNamesMayContain")}
                                                rules={[
                                                    {
                                                        validator: async (_, value: string | undefined) => {
                                                            if (value?.trim() !== modelUpstream && Array.from(value?.trim() || "").length > 80) throw new Error(translate("admin.channelModelEditor.theChannelDisplayNameMustNotExceed80Characters"));
                                                        },
                                                    },
                                                ]}
                                            >
                                                <Input maxLength={80} placeholder={modelUpstream || translate("admin.channelModelEditor.defaultsToTheUpstreamModelID")} />
                                            </Form.Item>
                                            <Form.Item name="icon" label={translate("admin.channelModelEditor.modelLogo")}>
                                                <ModelIconPicker />
                                            </Form.Item>
                                        </div>
                                        {tiersWithOwnUpstream.length ? (
                                            <Alert
                                                type="info"
                                                showIcon
                                                title={translate("admin.channelModelEditor.priceTiersHaveASeparateUpstreamModelID", { v0: String(tiersWithOwnUpstream.length) })}
                                                description={translate("admin.channelModelEditor.matchingRequestsUseThePriceTierSUpstreamIDFirst")}
                                            />
                                        ) : null}
                                        <ChannelModelTagsEditor />
                                        <Form.Item name="description" label={translate("admin.channelModelEditor.modelDescription")} extra={translate("admin.channelModelEditor.alwaysShownInSecondaryChannelOptionsInTheCreationInterface")} rules={[{ max: 500, message: translate("admin.channelModelEditor.theModelDescriptionMustNotExceed500Characters") }]}>
                                            <Input.TextArea rows={3} maxLength={500} showCount placeholder={translate("admin.channelModelEditor.describeHowToUseThisChannelModel")} />
                                        </Form.Item>
                                    </section>
                                    <section className="admin-model-editor-section">
                                        <SectionHeading title={translate("admin.channelModelEditor.capabilitiesAndProtocol")} description={translate("admin.channelModelEditor.chooseATaskTypeThenItsRequestProtocolReviewParameters")} />
                                        <div className="admin-model-editor-section-content admin-model-protocol-grid">
                                            <Form.Item name="capability" label={translate("account.settings.modelConfig.capability")} rules={[{ required: true }]}>
                                                <Segmented
                                                    block
                                                    options={[
                                                        { label: translate("account.settings.modelConfig.capabilities.text"), value: "text" },
                                                        { label: translate("account.feedback.image"), value: "image" },
                                                        { label: translate("account.feedback.video"), value: "video" },
                                                        { label: translate("account.settings.modelConfig.capabilities.audio"), value: "audio" },
                                                    ]}
                                                />
                                            </Form.Item>
                                            <Form.Item className="admin-model-protocol-field" name="protocol" label={translate("admin.channelModelEditor.requestProtocol")} rules={[{ validator: async (_, value) => validateChannelModelProtocol(form.getFieldValue("capability"), value, protocols) }]}>
                                                <ModelProtocolBrowser disabled={busy} capability={modelCapability} protocols={protocols} loading={protocolLoading} error={protocolError} />
                                            </Form.Item>
                                            {protocolError && (
                                                <Alert
                                                    type="error"
                                                    showIcon
                                                    title={translate("account.settings.modelConfig.protocolLoadFailed")}
                                                    description={protocolError}
                                                    action={
                                                        <Button size="small" onClick={onRetryProtocols}>
                                                            {translate("common.retry")}
                                                        </Button>
                                                    }
                                                />
                                            )}
                                        </div>
                                    </section>
                                </div>
                            ),
                        },
                        {
                            key: "capabilities",
                            label: translate("account.settings.modelConfig.tabCapabilities"),
                            forceRender: true,
                            children: (
                                <div className="admin-model-editor-tab-content">
                                    {configurationChanged && <Alert type="warning" showIcon title={translate("admin.channelModelEditor.capabilitiesOrProtocolChanged")} description={translate("admin.channelModelEditor.referencesAndParametersHaveBeenResetToTheNewProtocol")} />}{" "}
                                    {modelCapability === "text" || modelCapability === "image" || modelCapability === "video" ? (
                                        <section className="admin-model-editor-section admin-model-editor-section-stacked admin-model-editor-references">
                                            <SectionHeading title={translate("admin.channelModelEditor.referencesAndLimits")} description={translate("admin.channelModelEditor.configureCountSizeDurationAndGeneralLimitsForEachMedia")} />
                                            <Form.Item name={["capabilityConfig", "mediaTransport"]} label={translate("admin.channelModelEditor.referenceMediaDelivery")} extra={translate("admin.channelModelEditor.modelSettingsTakePriorityFollowedByChannelDefaultsThenProtocol")}>
                                                <MediaTransportFields channel={channel.mediaTransport || {}} />
                                            </Form.Item>
                                            <div className="admin-model-editor-section-content">
                                                <ModelCapabilityEditor
                                                    capability={modelCapability}
                                                    model={providerModelKey || modelKey}
                                                    protocol={form.getFieldValue("protocol")}
                                                    section="references"
                                                    imageParameters={protocols.find((item) => item.value === modelProtocol)?.imageParameters}
                                                    workflows={protocols.find((item) => item.value === modelProtocol)?.workflows}
                                                    value={capabilityConfig}
                                                    onChange={(next) => {
                                                        dirtyRef.current = true;
                                                        form.setFieldValue("capabilityConfig", { ...next, mediaTransport: form.getFieldValue(["capabilityConfig", "mediaTransport"]) });
                                                    }}
                                                />
                                            </div>
                                        </section>
                                    ) : null}
                                    {modelCapability === "text" || modelCapability === "image" || modelCapability === "video" ? (
                                        <section className="admin-model-editor-section admin-model-editor-section-stacked admin-model-editor-parameters">
                                            <SectionHeading title={translate("admin.channelModelEditor.protocolParameters")} description={translate("admin.channelModelEditor.configureAvailableRequestParametersSupportedValuesAndDefaultsForThis")} />
                                            <div className="admin-model-editor-section-content">
                                                <ModelCapabilityEditor
                                                    capability={modelCapability}
                                                    model={providerModelKey || modelKey}
                                                    protocol={form.getFieldValue("protocol")}
                                                    section="protocol"
                                                    imageParameters={protocols.find((item) => item.value === modelProtocol)?.imageParameters}
                                                    workflows={protocols.find((item) => item.value === modelProtocol)?.workflows}
                                                    value={capabilityConfig}
                                                    onChange={(next) => {
                                                        dirtyRef.current = true;
                                                        form.setFieldValue("capabilityConfig", { ...next, mediaTransport: form.getFieldValue(["capabilityConfig", "mediaTransport"]) });
                                                    }}
                                                />
                                            </div>
                                        </section>
                                    ) : null}
                                    {modelCapability === "audio" && <Alert type="info" title={translate("admin.channelModelEditor.audioModelsNeedNoAdditionalReferenceOrParameterSettings")} description={translate("admin.channelModelEditor.configureTheRequestProtocolAndCreditPricingInTheirRespective")} />}
                                </div>
                            ),
                        },
                        {
                            key: "pricing",
                            label: translate("admin.channelModelEditor.creditPricing"),
                            forceRender: true,
                            children: (
                                <div className="admin-model-editor-tab-content">
                                    {configurationChanged && <Alert type="warning" showIcon title={translate("admin.channelModelEditor.reviewPricing")} description={translate("admin.channelModelEditor.capabilitiesOrProtocolChangedReviewSpecificationConditionsBillingMethodsAnd")} />}{" "}
                                    <section className="admin-model-editor-section">
                                        <SectionHeading title={translate("admin.channelModelEditor.userCreditPrices")} description={translate("admin.channelModelEditor.startWithOneFlatPriceAddSpecificationPricesWhenGeneration")} />
                                        <div className="admin-model-editor-section-content">
                                            <Form.Item name="priceCurrency" label={translate("admin.channelModelEditor.pricingCurrency")} extra={translate("admin.channelModelEditor.creditsTheSellingPriceIsTheCreditChargeUSDCNY")}>
                                                <Segmented
                                                    options={priceCurrencyOptions}
                                                    onChange={() => {
                                                        dirtyRef.current = true;
                                                    }}
                                                />
                                            </Form.Item>
                                            {modelCapability === "video" ? (
                                                <Form.Item
                                                    name="referenceVideoBilling"
                                                    label={translate("admin.channelModelEditor.referenceVideoBilling")}
                                                    valuePropName="checked"
                                                    extra={
                                                        referenceVideoBilling
                                                            ? translate("admin.channelModelEditor.enabledRequestsWithReferenceVideosUseEachTierSReference")
                                                            : translate("admin.channelModelEditor.disabledReferenceVideosAreNotBilledPerSecondAndVideo")
                                                    }
                                                >
                                                    <Switch
                                                        aria-label={translate("admin.channelModelEditor.referenceVideoBilling")}
                                                        onChange={() => {
                                                            dirtyRef.current = true;
                                                        }}
                                                    />
                                                </Form.Item>
                                            ) : null}
                                            <Form.List
                                                name="priceTiers"
                                                rules={[
                                                    {
                                                        validator: async (_, value) => {
                                                            validateChannelModelPrices({
                                                                capability: form.getFieldValue("capability"),
                                                                protocol: form.getFieldValue("protocol"),
                                                                priceTiers: value,
                                                                referenceVideoBilling: form.getFieldValue("referenceVideoBilling"),
                                                            });
                                                        },
                                                    },
                                                ]}
                                            >
                                                {(fields, { add, remove }, { errors }) => (
                                                    <div className="admin-price-tier-list-shell">
                                                        <div className="admin-price-tier-list" aria-label={translate("admin.channelModelEditor.creditPricingRules")}>
                                                            {fields.map((field, index) => (
                                                                <PriceTierFields
                                                                    key={field.key}
                                                                    index={field.name}
                                                                    ordinal={index + 1}
                                                                    form={form}
                                                                    capability={modelCapability}
                                                                    protocol={modelProtocol}
                                                                    capabilityConfig={capabilityConfig}
                                                                    modelUpstream={modelUpstream}
                                                                    onDirty={() => {
                                                                        dirtyRef.current = true;
                                                                    }}
                                                                    onRemove={() => remove(field.name)}
                                                                />
                                                            ))}
                                                        </div>
                                                        <div className="admin-price-tier-list-footer">
                                                            <Button className="admin-model-editor-add-tier" type="dashed" block icon={<Plus className="size-4" />} onClick={() => add(defaultPriceTier(hasDefaultPriceTier ? "advanced" : "default"))}>
                                                                {hasDefaultPriceTier ? translate("admin.channelModelEditor.addSpecificationPrice") : translate("admin.channelModelEditor.addDefaultFlatPrice")}
                                                            </Button>
                                                            <Form.ErrorList errors={errors} />
                                                        </div>
                                                    </div>
                                                )}
                                            </Form.List>
                                        </div>
                                    </section>
                                    {modelCapability === "text" ? (
                                        <TokenPriceRulesSection
                                            form={form}
                                            onDirty={() => {
                                                dirtyRef.current = true;
                                            }}
                                        />
                                    ) : null}
                                </div>
                            ),
                        },
                    ]}
                />
            </Form>
        </AdminModal>
    );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
    return (
        <header className="admin-model-editor-section-heading">
            <h2>{title}</h2>
            <p>{description}</p>
        </header>
    );
}
function CapabilityConfigField(_: { value?: ModelCapabilityConfig; onChange?: (value: ModelCapabilityConfig) => void }) {
    return null;
}
function EnabledConfigField(_: { value?: boolean; onChange?: (value: boolean) => void }) {
    return null;
}
