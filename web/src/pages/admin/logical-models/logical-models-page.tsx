import { Alert, App, Button, Form, Input, InputNumber, Segmented, Switch, Table, Tag } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Archive, FlaskConical, GitBranch, Layers3, Pencil, Plus, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { PaginationBar } from "@/pages/admin/components/admin-ui";
import { ModelIconPicker, ModelLogo } from "@/components/model-logo";
import { ChoiceBrowser } from "@/components/choice-browser";
import { ModelEditorModal } from "@/components/model-editor-modal";
import { AdminPageFrame } from "@/pages/admin/components/admin-shell";
import { AdminDataTable, AdminFilterChip, AdminRowActions, AdminStatusBadge, AdminTableEmpty } from "@/pages/admin/components/admin-ui";
import { listAdminChannels } from "@/services/api/auth";
import { listAdminChannelModels, type ChannelModel } from "@/services/api/wallet";
import { Select } from "@/components/ui/base/select";
import {
    createAdminLogicalModel,
    deleteAdminLogicalModel,
    listAdminLogicalModels,
    simulateAdminLogicalModel,
    updateAdminLogicalModel,
    type AdminLogicalModel,
    type CapabilitySpec,
    type LogicalModelMutation,
    type ModelRequestIntent,
    type RouteSimulationResult,
} from "@/services/api/logical-models";
import {
    CapabilityRequestEditor,
    CapabilityScopeEditor,
    CapabilitySummary,
    DefaultOptionsEditor,
    capabilityLabel,
    capabilitySpecFromChannelModel,
    capabilitySourceError,
    emptyCapabilitySpec,
    mergeCapabilitySpecs,
    normalizeCapabilitySpecForSources,
    operationLabel,
    sanitizeDefaults,
    type CapabilityKind,
} from "./model-routing-capabilities";
import { translate } from "@/i18n";


type RouteRuleRow = { channelModelId: string; enabled: boolean; priority: number; weight: number };
type LogicalModelFormValues = {
    code: string;
    name: string;
    icon: string;
    description: string;
    capability: CapabilityKind;
    enabled: boolean;
    sortOrder: number;
    pricePolicy: LogicalModelMutation["pricePolicy"];
    billingMode: LogicalModelMutation["billingMode"];
    unitPriceMicrocredits: number;
    inputPriceMicrocredits: number;
    outputPriceMicrocredits: number;
    cachedPriceMicrocredits: number;
    capabilitySpec: CapabilitySpec;
    defaultOptions: Record<string, unknown>;
    routes: RouteRuleRow[];
};
export default function LogicalModelsPage() {
    const { message, modal } = App.useApp();
    const [editorTab, setEditorTab] = useState("identity");
    const dirtyRef = useRef(false);
    const closeEditor = () => {
        if (saving) return;
        if (dirtyRef.current) modal.confirm({ title: translate("adminPages.logicalModels.logicalModelsPage.discardUnsavedChanges"), okText: translate("adminPages.logicalModels.logicalModelsPage.discardChanges"), cancelText: translate("account.settings.prompts.switchCancel"), onOk: () => setEditingModel(undefined) });
        else setEditingModel(undefined);
    };
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());
    const [loading, setLoading] = useState(true);
    const [models, setModels] = useState<AdminLogicalModel[]>([]);
    const [channelModels, setChannelModels] = useState<ChannelModel[]>([]);
    const [channelNames, setChannelNames] = useState<Record<string, string>>({});
    const [channelEnabled, setChannelEnabled] = useState<Record<string, boolean>>({});
    const [editingModel, setEditingModel] = useState<AdminLogicalModel | null | undefined>();
    const [saving, setSaving] = useState(false);
    const [deletingModelId, setDeletingModelId] = useState<string>();
    const [simulatingModel, setSimulatingModel] = useState<AdminLogicalModel>();
    const [simulationIntent, setSimulationIntent] = useState<ModelRequestIntent>();
    const [simulationResult, setSimulationResult] = useState<RouteSimulationResult>();
    const [simulating, setSimulating] = useState(false);
    const [modelForm] = Form.useForm<LogicalModelFormValues>();
    const modelEnabled = Form.useWatch("enabled", modelForm) !== false;
    const modelCapability = Form.useWatch("capability", modelForm) || "image";
    const modelRoutes = Form.useWatch("routes", modelForm) || [];
    const modelCapabilitySpec = Form.useWatch("capabilitySpec", modelForm);

    const reload = async () => {
        setLoading(true);
        try {
            const [modelResult, firstChannelPage] = await Promise.all([listAdminLogicalModels(), listAdminChannels({ page: 1, pageSize: 100 })]);
            const remainingChannelPages = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(firstChannelPage.total / firstChannelPage.pageSize) - 1) }, (_, index) => listAdminChannels({ page: index + 2, pageSize: firstChannelPage.pageSize })));
            const channels = [firstChannelPage, ...remainingChannelPages].flatMap((result) => result.channels);
            const channelModelResults = await Promise.all(channels.map((channel) => listAdminChannelModels(channel.id)));
            setModels(modelResult.models);
            setChannelModels(channelModelResults.flatMap((result) => result.models));
            setChannelNames(Object.fromEntries(channels.map((channel) => [channel.id, channel.name])));
            setChannelEnabled(Object.fromEntries(channels.map((channel) => [channel.id, channel.enabled !== false])));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.logicalModels.logicalModelsPage.failedToLoadFrontendModelSettings"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void reload();
    }, []);

    const filteredModels = useMemo(() => models.filter((item) => !deferredKeyword || [item.name, item.code, item.capability].some((value) => value.toLowerCase().includes(deferredKeyword))), [models, deferredKeyword]);
    const paginatedModels = useMemo(() => filteredModels.slice((page - 1) * pageSize, page * pageSize), [filteredModels, page, pageSize]);
    const modelChannelModels = useMemo(() => channelModels.filter((item) => item.capability === modelCapability), [channelModels, modelCapability]);
    const modelSourceSpecs = useMemo(
        () =>
            modelRoutes
                .filter((route) => route.enabled && route.weight > 0)
                .map((route) => channelModels.find((item) => item.id === route.channelModelId && item.enabled && channelEnabled[item.channelId] !== false))
                .map((item) => (item ? capabilitySpecFromChannelModel(item) : undefined))
                .filter((item): item is CapabilitySpec => Boolean(item)),
        [channelEnabled, channelModels, modelRoutes],
    );

    const openModel = (item?: AdminLogicalModel) => {
        const capability = item?.capability || "image";
        dirtyRef.current = false;
        setEditorTab("identity");
        modelForm.resetFields();
        modelForm.setFieldsValue(
            item
                ? logicalModelToForm(item)
                : {
                      code: "",
                      name: "",
                      icon: "",
                      description: "",
                      capability,
                      enabled: true,
                      sortOrder: models.length,
                      pricePolicy: "channel",
                      billingMode: "fixed_request",
                      unitPriceMicrocredits: 0,
                      inputPriceMicrocredits: 0,
                      outputPriceMicrocredits: 0,
                      cachedPriceMicrocredits: 0,
                      capabilitySpec: emptyCapabilitySpec(capability),
                      defaultOptions: {},
                      routes: [],
                  },
        );
        setEditingModel(item || null);
    };

    const saveModel = async () => {
        let values: LogicalModelFormValues;
        try {
            values = await modelForm.validateFields();
        } catch (error) {
            const fields = (error as { errorFields?: { name: (string | number)[] }[] }).errorFields;
            if (fields?.length) {
                const name = fields[0].name;
                setEditorTab(name[0] === "routes" ? "routes" : ["capabilitySpec", "defaultOptions"].includes(String(name[0])) ? "capabilities" : "identity");
                requestAnimationFrame(() => modelForm.scrollToField(name, { block: "center", focus: true }));
            }
            return;
        }
        if (values.enabled && !values.routes.length) {
            setEditorTab("routes");
            message.error(translate("adminPages.logicalModels.logicalModelsPage.addAtLeastOneProviderRoute"));
            return;
        }
        const currentSpec = normalizeCapabilitySpecForSources(values.capabilitySpec, modelSourceSpecs) || values.capabilitySpec;
        const sourceError = capabilitySourceError(values.capability, modelSourceSpecs, currentSpec);
        if (values.enabled && sourceError) {
            setEditorTab("capabilities");
            message.error(sourceError);
            return;
        }
        setSaving(true);
        try {
            const payload = logicalModelPayload(values, modelSourceSpecs);
            await (editingModel ? updateAdminLogicalModel(editingModel.id, payload) : createAdminLogicalModel(payload));
            setEditingModel(undefined);
            await reload();
            message.success(editingModel ? translate("adminPages.logicalModels.logicalModelsPage.frontendModelUpdated") : translate("adminPages.logicalModels.logicalModelsPage.frontendModelCreated"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.logicalModels.logicalModelsPage.failedToSaveFrontendModel"));
        } finally {
            setSaving(false);
        }
    };

    const toggleModel = async (item: AdminLogicalModel) => {
        try {
            await updateAdminLogicalModel(item.id, logicalModelPayload({ ...logicalModelToForm(item), enabled: !item.enabled }));
            await reload();
            message.success(item.enabled ? translate("adminPages.logicalModels.logicalModelsPage.frontendModelDisabled") : translate("adminPages.logicalModels.logicalModelsPage.frontendModelEnabled"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.logicalModels.logicalModelsPage.failedToUpdateModelStatus"));
        }
    };

    const removeModel = async (item: AdminLogicalModel) => {
        setDeletingModelId(item.id);
        try {
            await deleteAdminLogicalModel(item.id);
            setModels((current) => current.filter((model) => model.id !== item.id));
            if (paginatedModels.length === 1 && page > 1) setPage(page - 1);
            message.success(translate("adminPages.logicalModels.logicalModelsPage.publicModelArchived"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.logicalModels.logicalModelsPage.failedToArchiveFrontendModel"));
            throw error;
        } finally {
            setDeletingModelId(undefined);
        }
    };

    const openSimulation = (item: AdminLogicalModel) => {
        setSimulationIntent({
            capability: item.capability,
            operation: item.capabilitySpec.operations?.[0],
            inputs: Object.fromEntries(Object.entries(item.capabilitySpec.inputs || {}).map(([name, value]) => [name, value.min])),
            options: { ...item.defaultOptions },
        });
        setSimulationResult(undefined);
        setSimulatingModel(item);
    };

    const runSimulation = async () => {
        if (!simulatingModel || !simulationIntent) return;
        setSimulating(true);
        try {
            setSimulationResult(await simulateAdminLogicalModel(simulatingModel.id, simulationIntent));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.logicalModels.logicalModelsPage.routeSimulationFailed"));
        } finally {
            setSimulating(false);
        }
    };

    const modelColumns: ColumnsType<AdminLogicalModel> = [
        {
            title: translate("adminPages.logicalModels.logicalModelsPage.publicModel"),
            dataIndex: "name",
            render: (_, item) => (
                <div className="flex min-w-0 items-center gap-2">
                    <ModelLogo icon={item.icon} size={20} />
                    <div className="min-w-0">
                        <div className="truncate font-medium">{item.name}</div>
                        <div className="mt-0.5 truncate text-xs text-foreground/45">{item.code}</div>
                    </div>
                </div>
            ),
        },
        { title: translate("account.settings.runninghub.kind"), dataIndex: "capability", width: 90, render: (value: CapabilityKind) => capabilityLabel(value) },
        { title: translate("adminPages.logicalModels.logicalModelsPage.creationCapabilities"), width: 360, render: (_, item) => <CapabilitySummary spec={item.capabilitySpec} /> },
        {
            title: translate("adminPages.logicalModels.logicalModelsPage.providerRoutes"),
            width: 110,
            render: (_, item) => (
                <div className="text-xs">
                    <div>{(item.routes || []).filter((route) => route.enabled && route.available).length} {translate("adminPages.logicalModels.logicalModelsPage.available")}</div>
                    <div className="text-foreground/45">{translate("adminPages.logicalModels.logicalModelsPage.total")} {(item.routes || []).length} {translate("account.layout.pagination.item")}</div>
                </div>
            ),
        },
        { title: translate("adminPages.logicalModels.logicalModelsPage.userPrice"), width: 160, render: (_, item) => logicalPriceLabel(item) },
        { title: translate("library.tasks.detail.status"), width: 130, render: (_, item) => logicalModelStatusTag(item) },
        {
            title: translate("account.settings.runninghub.actions"),
            width: 300,
            align: "right",
            render: (_, item) => (
                <AdminRowActions
                    primary={{ label: translate("account.settings.channels.edit"), icon: <Pencil className="size-3.5" />, onClick: () => openModel(item) }}
                    visibleActionCount={3}
                    actions={[
                        { key: "simulate", label: translate("adminPages.logicalModels.logicalModelsPage.simulateRouting"), icon: <FlaskConical className="size-3.5" />, onClick: () => openSimulation(item) },
                        { key: "toggle", label: item.enabled ? translate("adminPages.logicalModels.logicalModelsPage.disable") : translate("adminPages.logicalModels.logicalModelsPage.enable"), onClick: () => void toggleModel(item) },
                        {
                            key: "archive",
                            label: translate("adminPages.logicalModels.logicalModelsPage.archive"),
                            icon: <Archive className="size-3.5" />,
                            danger: true,
                            disabled: deletingModelId === item.id,
                            confirm: {
                                title: translate("adminPages.logicalModels.logicalModelsPage.archivePublicModel", { v0: String(item.name) }),
                                description: translate("adminPages.logicalModels.logicalModelsPage.theModelWillBeRemovedFromThePublicCatalogAnd"),
                                okText: translate("adminPages.logicalModels.logicalModelsPage.archive2"),
                            },
                            onClick: () => removeModel(item),
                        },
                    ]}
                />
            ),
        },
    ];

    return (
        <AdminPageFrame
            title={translate("adminPages.logicalModels.logicalModelsPage.publicModelCatalog")}
            actions={
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openModel()}>
                    {translate("adminPages.logicalModels.logicalModelsPage.addModel")}
                </Button>
            }
        >
            <AdminDataTable
                toolbar={
                    <Input
                        prefix={<Search className="size-4 text-foreground/40" />}
                        allowClear
                        value={keyword}
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                        placeholder={translate("adminPages.logicalModels.logicalModelsPage.searchModelNameCodeOrCapability")}
                        className="app-list-search"
                    />
                }
                toolbarActiveFilters={
                    keyword ? (
                        <AdminFilterChip
                            label={translate("adminPages.logicalModels.logicalModelsPage.search", { v0: String(keyword) })}
                            onRemove={() => {
                                setKeyword("");
                                setPage(1);
                            }}
                        />
                    ) : null
                }
                toolbarActive={Boolean(keyword)}
                onReset={() => {
                    setKeyword("");
                    setPage(1);
                }}
                table={{ className: "admin-logical-model-table", rowKey: "id", size: "small", loading, pagination: false, columns: modelColumns, dataSource: paginatedModels, scroll: { x: 1050 } }}
                empty={<AdminTableEmpty filtered={Boolean(deferredKeyword)} title={translate("adminPages.logicalModels.logicalModelsPage.noModelsYet")} />}
                footer={
                    <PaginationBar
                        alwaysShow
                        current={page}
                        pageSize={pageSize}
                        total={filteredModels.length}
                        onChange={(nextPage, nextPageSize) => {
                            setPage(nextPageSize !== pageSize ? 1 : nextPage);
                            setPageSize(nextPageSize);
                        }}
                    />
                }
            />

            <ModelEditorModal
                shell={AdminModal}
                open={editingModel !== undefined}
                busy={saving}
                title={editingModel ? translate("adminPages.logicalModels.logicalModelsPage.editPublicModel") : translate("adminPages.logicalModels.logicalModelsPage.addPublicModel")}
                subtitle={editingModel?.name || translate("adminPages.logicalModels.logicalModelsPage.configurePublicDisplayProviderRoutesAndAvailableCapabilities")}
                onClose={closeEditor}
                activeKey={editorTab}
                onTabChange={setEditorTab}
                footer={
                    <div className="model-editor-footer">
                        <label className="flex items-center gap-2">
                            <Switch
                                aria-label={translate("adminPages.logicalModels.logicalModelsPage.enablePublicModel")}
                                checked={modelEnabled}
                                disabled={saving}
                                onChange={(enabled) => {
                                    dirtyRef.current = true;
                                    modelForm.setFieldValue("enabled", enabled);
                                }}
                            />
                            {translate("adminPages.logicalModels.logicalModelsPage.modelEnabled")} <span className="text-xs text-foreground/50">{translate("adminPages.logicalModels.logicalModelsPage.takesEffectAfterSaving")}</span>
                        </label>
                        <div className="model-editor-footer-actions">
                            <Button disabled={saving} onClick={closeEditor}>
                                {translate("common.cancel")}
                            </Button>
                            <Button type="primary" loading={saving} onClick={() => void saveModel()}>
                                {editingModel ? translate("adminPages.logicalModels.logicalModelsPage.saveChanges") : translate("adminPages.logicalModels.logicalModelsPage.addModel2")}
                            </Button>
                        </div>
                    </div>
                }
                items={[
                    {
                        key: "identity",
                        label: translate("account.settings.modelConfig.tabBasic"),
                        children: (
                            <>
                                {editingModel?.configurationError || editingModel?.availabilityError ? (
                                    <Alert
                                        className="mb-4"
                                        type="warning"
                                        showIcon
                                        message={editingModel.configurationError ? translate("adminPages.logicalModels.logicalModelsPage.theCurrentProviderRoutesDoNotCoverAllCreationCapabilities") : translate("adminPages.logicalModels.logicalModelsPage.theCurrentProviderRoutesCannotBeBilledYet")}
                                        description={editingModel.configurationError || editingModel.availabilityError}
                                    />
                                ) : null}
                                <EditorSection icon={<Layers3 className="size-4" />} title={translate("adminPages.logicalModels.logicalModelsPage.publicDisplay")}>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Form.Item name="name" label={translate("auth.register.displayName")} rules={[{ required: true, message: translate("adminPages.logicalModels.logicalModelsPage.enterADisplayName") }]}>
                                            <Input placeholder={translate("adminPages.logicalModels.logicalModelsPage.forExampleSeedanceVideo")} />
                                        </Form.Item>
                                        <Form.Item name="code" label={translate("adminPages.logicalModels.logicalModelsPage.modelCode")} rules={[{ required: true, message: translate("adminPages.logicalModels.logicalModelsPage.enterAModelCode") }]}>
                                            <Input placeholder={translate("adminPages.logicalModels.logicalModelsPage.forExampleSeedanceVideo2")} />
                                        </Form.Item>
                                        <Form.Item name="icon" label={translate("adminPages.logicalModels.logicalModelsPage.modelLogo")}>
                                            <ModelIconPicker />
                                        </Form.Item>
                                    </div>
                                    <Form.Item name="description" label={translate("adminPages.logicalModels.logicalModelsPage.shortDescription")}>
                                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder={translate("adminPages.logicalModels.logicalModelsPage.describeSuitableCreativeUsesWithoutDescribingTheProviderChannel")} />
                                    </Form.Item>
                                    <Form.Item name="capability" label={translate("account.settings.runninghub.kind")}>
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
                                    <Form.Item name="sortOrder" label={translate("adminPages.logicalModels.logicalModelsPage.displayOrder")}>
                                        <InputNumber className="w-full" precision={0} />
                                    </Form.Item>
                                </EditorSection>
                            </>
                        ),
                    },
                    {
                        key: "routes",
                        label: translate("adminPages.logicalModels.logicalModelsPage.providerRoutes"),
                        children: (
                            <>
                                <EditorSection icon={<GitBranch className="size-4" />} title={translate("adminPages.logicalModels.logicalModelsPage.providerRoutes")}>
                                    <RouteFields channelModels={modelChannelModels} channelNames={channelNames} channelEnabled={channelEnabled} form={modelForm} capability={modelCapability} />
                                </EditorSection>
                                <EditorSection title={translate("adminPages.logicalModels.logicalModelsPage.systemSpecificationPricing")}>
                                    <PricingFields />
                                </EditorSection>
                            </>
                        ),
                    },
                    {
                        key: "capabilities",
                        label: translate("account.settings.modelConfig.tabCapabilities"),
                        children: (
                            <>
                                <EditorSection title={translate("adminPages.logicalModels.logicalModelsPage.capabilitiesAvailableToCreators")}>
                                    <Form.Item name="capabilitySpec" noStyle>
                                        <CapabilityScopeEditor capability={modelCapability} sourceSpecs={modelSourceSpecs} mode="front" />
                                    </Form.Item>
                                </EditorSection>
                                <EditorSection title={translate("adminPages.logicalModels.logicalModelsPage.defaultParameters")}>
                                    <Form.Item name="defaultOptions" noStyle>
                                        <DefaultOptionsEditor spec={modelCapabilitySpec} />
                                    </Form.Item>
                                </EditorSection>
                            </>
                        ),
                    },
                ]}
            >
                {(tabs) => (
                    <Form
                        form={modelForm}
                        layout="vertical"
                        disabled={saving}
                        inert={saving}
                        onValuesChange={(changedValues: Partial<LogicalModelFormValues>) => {
                            dirtyRef.current = true;
                            if (!changedValues.capability) return;
                            modelForm.setFieldsValue({ routes: [], capabilitySpec: emptyCapabilitySpec(changedValues.capability), defaultOptions: {}, pricePolicy: "channel", billingMode: "fixed_request" });
                        }}
                    >
                        <Form.Item name="enabled" hidden>
                            <Switch />
                        </Form.Item>
                        {tabs}
                    </Form>
                )}
            </ModelEditorModal>

            <AdminModal
                title={simulatingModel ? translate("adminPages.logicalModels.logicalModelsPage.providerRouteSimulation", { v0: String(simulatingModel.name) }) : translate("adminPages.logicalModels.logicalModelsPage.providerRouteSimulation2")}
                open={Boolean(simulatingModel)}
                className="workspace-modal workspace-modal-wide admin-simulation-modal"
                centered
                destroyOnHidden
                onCancel={() => setSimulatingModel(undefined)}
                styles={{ body: { maxHeight: "min(72vh, 720px)", overflowY: "auto" } }}
                footer={[
                    <Button key="cancel" onClick={() => setSimulatingModel(undefined)}>
                        {translate("common.close")}
                    </Button>,
                    <Button key="submit" type="primary" icon={<FlaskConical className="size-4" />} loading={simulating} onClick={() => void runSimulation()}>
                        {translate("adminPages.logicalModels.logicalModelsPage.simulateMatching")}
                    </Button>,
                ]}
            >
                {simulatingModel && simulationIntent ? (
                    <div className="space-y-5">
                        {simulatingModel.capabilitySpec.operations?.length ? (
                            <label className="block">
                                <span className="mb-1 block text-xs text-foreground/55">{translate("adminPages.logicalModels.logicalModelsPage.generationMode")}</span>
                                <Select
                                    className="w-full"
                                    value={simulationIntent.operation}
                                    options={simulatingModel.capabilitySpec.operations.map((value) => ({ value, label: operationLabel(value) }))}
                                    onChange={(operation) => setSimulationIntent({ ...simulationIntent, operation })}
                                />
                            </label>
                        ) : null}
                        <CapabilityRequestEditor
                            spec={simulatingModel.capabilitySpec}
                            inputs={simulationIntent.inputs || {}}
                            options={simulationIntent.options || {}}
                            onInputsChange={(inputs) => setSimulationIntent({ ...simulationIntent, inputs })}
                            onOptionsChange={(options) => setSimulationIntent({ ...simulationIntent, options })}
                        />
                        {simulationResult ? (
                            <section className="pt-1">
                                <div className="mb-3 flex items-center justify-between">
                                    <h2 className="text-sm font-semibold">{translate("adminPages.logicalModels.logicalModelsPage.matchingResult")}</h2>
                                    <Tag variant="filled" color={simulationResult.productMatch.matched ? "success" : "error"}>
                                        {simulationResult.productMatch.matched ? translate("adminPages.logicalModels.logicalModelsPage.requestedCapabilitiesSupported") : translate("adminPages.logicalModels.logicalModelsPage.requestedCapabilitiesDoNotMatch")}
                                    </Tag>
                                </div>
                                {simulationResult.productMatch.reasons?.length ? <p className="mb-4 text-sm text-error">{simulationResult.productMatch.reasons.join("；")}</p> : null}
                                <Table size="small" pagination={false} rowKey="routeId" dataSource={simulationResult.candidates} columns={simulationColumns()} />
                            </section>
                        ) : null}
                    </div>
                ) : null}
            </AdminModal>
        </AdminPageFrame>
    );
}

function EditorSection({ icon, title, description, children }: { icon?: ReactNode; title: string; description?: string; children: ReactNode }) {
    return (
        <section className="model-editor-section">
            <div className="mb-4 flex items-center gap-2">
                {icon ? <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted/50 text-foreground/55">{icon}</span> : null}
                <div>
                    <h2 className="text-[var(--fs-body)] font-semibold">{title}</h2>
                    {description ? <p className="mt-1 text-xs leading-5 text-foreground/50">{description}</p> : null}
                </div>
            </div>
            {children}
        </section>
    );
}

function RouteFields({
    channelModels,
    channelNames,
    channelEnabled,
    form,
    capability,
}: {
    channelModels: ChannelModel[];
    channelNames: Record<string, string>;
    channelEnabled: Record<string, boolean>;
    form: FormInstance<LogicalModelFormValues>;
    capability: CapabilityKind;
}) {
    const selectOptions = channelModels.map((item) => {
        const unavailableReason = channelEnabled[item.channelId] === false ? translate("adminPages.logicalModels.logicalModelsPage.channelDisabled") : !item.enabled ? translate("adminPages.logicalModels.logicalModelsPage.channelModelDisabled") : "";
        return {
            value: item.id,
            label: `${channelNames[item.channelId]} / ${item.displayName || item.modelKey}${unavailableReason ? `（${unavailableReason}）` : ""}`,
            disabled: Boolean(unavailableReason),
            subtitle: item.providerModelKey || item.modelKey,
            details: [
                { label: translate("adminPages.logicalModels.logicalModelsPage.channel"), value: channelNames[item.channelId] },
                { label: translate("canvasA.assetView.model"), value: item.displayName || item.modelKey },
                { label: translate("adminPages.logicalModels.logicalModelsPage.upstreamID"), value: item.providerModelKey || item.modelKey },
                { label: translate("adminPages.logicalModels.logicalModelsPage.protocol"), value: item.protocol || translate("account.layout.oss.cdnAuthNone") },
                { label: translate("library.tasks.detail.status"), value: unavailableReason || translate("account.settings.channels.ready") },
            ],
        };
    });
    const availableChannelModelCount = selectOptions.filter((item) => !item.disabled).length;
    return (
        <Form.List name="routes">
            {(fields, { add, remove }) => {
                const currentRoutes = (form.getFieldValue("routes") || []) as RouteRuleRow[];
                const selectedChannelModelCount = new Set(currentRoutes.map((route) => route?.channelModelId).filter(Boolean)).size;
                const canAdd = selectedChannelModelCount < availableChannelModelCount;
                return (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-foreground/50">{translate("adminPages.logicalModels.logicalModelsPage.total")} {fields.length} {translate("adminPages.logicalModels.logicalModelsPage.providerRoutes2")}</span>
                            <Button size="small" icon={<Plus className="size-3.5" />} disabled={!canAdd} onClick={() => add({ channelModelId: "", enabled: true, priority: 100, weight: 100 })}>
                                {translate("adminPages.logicalModels.logicalModelsPage.addProviderRoute")}
                            </Button>
                        </div>
                        {fields.length ? (
                            <div className="grid gap-3">
                                {fields.map((field) => {
                                    const routes = (form.getFieldValue("routes") || []) as RouteRuleRow[];
                                    const selectedByOthers = new Set(routes.map((route, index) => (index === field.name ? "" : route?.channelModelId)).filter(Boolean));
                                    const options = selectOptions.map((option) => ({ ...option, disabled: option.disabled || selectedByOthers.has(option.value) }));
                                    const selected = channelModels.find((item) => item.id === routes[field.name]?.channelModelId);
                                    return (
                                        <div key={field.key} className="rounded-lg border border-border bg-muted/5 p-4">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-semibold">{translate("adminPages.logicalModels.logicalModelsPage.providerRoutes")} {fields.indexOf(field) + 1}</div>
                                                    <div className="mt-0.5 truncate text-xs text-foreground/50">{selected ? `${channelNames[selected.channelId]} / ${selected.displayName || selected.modelKey}` : translate("adminPages.logicalModels.logicalModelsPage.selectAChannelModelThatCanHandleRequests")}</div>
                                                </div>
                                                <Button type="text" size="small" danger onClick={() => remove(field.name)}>
                                                    {translate("canvasB.common.remove")}
                                                </Button>
                                            </div>
                                            <Form.Item name={[field.name, "channelModelId"]} rules={[{ required: true, message: translate("adminPages.logicalModels.logicalModelsPage.selectAChannelModel") }]} className="mb-3">
                                                <ChoiceBrowser
                                                    label={translate("adminPages.logicalModels.logicalModelsPage.providerRoute", { v0: String(fields.indexOf(field) + 1) })}
                                                    placeholder={translate("adminPages.logicalModels.logicalModelsPage.searchChannelsOrModels")}
                                                    key={capability}
                                                    options={options}
                                                    onChange={(channelModelId) => {
                                                        const nextRoutes = [...(form.getFieldValue("routes") || [])];
                                                        nextRoutes[field.name] = { ...nextRoutes[field.name], channelModelId };
                                                        const specs = nextRoutes
                                                            .filter((route) => route.enabled && route.weight > 0)
                                                            .map((route) => channelModels.find((item) => item.id === route.channelModelId && item.enabled && channelEnabled[item.channelId] !== false))
                                                            .map((item) => (item ? capabilitySpecFromChannelModel(item) : undefined))
                                                            .filter((item): item is CapabilitySpec => Boolean(item));
                                                        form.setFieldValue("routes", nextRoutes);
                                                        const current = form.getFieldValue("capabilitySpec");
                                                        if (capability === "image" || !hasCapabilityRules(current))
                                                            form.setFieldValue("capabilitySpec", capability === "image" && hasCapabilityRules(current) ? normalizeCapabilitySpecForSources(current, specs) : mergeCapabilitySpecs(capability, specs));
                                                    }}
                                                />
                                            </Form.Item>
                                            <div className="flex items-end gap-2">
                                                <Form.Item name={[field.name, "priority"]} label={translate("adminPages.logicalModels.logicalModelsPage.priority")} className="mb-0 min-w-0 flex-1">
                                                    <InputNumber className="w-full" precision={0} />
                                                </Form.Item>
                                                <Form.Item name={[field.name, "weight"]} label={translate("adminPages.logicalModels.logicalModelsPage.weight")} className="mb-0 min-w-0 flex-1">
                                                    <InputNumber className="w-full" min={0} precision={0} />
                                                </Form.Item>
                                                <Form.Item name={[field.name, "enabled"]} label={translate("adminPages.logicalModels.logicalModelsPage.enable")} valuePropName="checked" className="mb-0 shrink-0">
                                                    <Switch />
                                                </Form.Item>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                        {!fields.length ? <div className="rounded-md bg-muted/20 px-3 py-4 text-center text-xs text-foreground/50">{translate("adminPages.logicalModels.logicalModelsPage.noProviderRoutesAddedYet")}</div> : null}
                    </div>
                );
            }}
        </Form.List>
    );
}

function logicalModelStatusTag(item: AdminLogicalModel) {
    if (!item.enabled) return <AdminStatusBadge label={translate("adminPages.logicalModels.logicalModelsPage.disabled")} tone="neutral" />;
    if (item.configurationError) return <AdminStatusBadge label={translate("adminPages.logicalModels.logicalModelsPage.capabilitySettingsNeedAdjustment")} tone="warning" title={item.configurationError} />;
    if (item.availabilityError) return <AdminStatusBadge label={translate("adminPages.logicalModels.logicalModelsPage.routePricingNeedsAdjustment")} tone="warning" title={item.availabilityError} />;
    if (!item.available) return <AdminStatusBadge label={translate("adminPages.logicalModels.logicalModelsPage.noAvailableRoutes")} tone="warning" />;
    return <AdminStatusBadge label={translate("account.settings.channels.ready")} tone="success" />;
}

function PricingFields() {
    const form = Form.useFormInstance<LogicalModelFormValues>();
    useEffect(() => {
        form.setFieldsValue({
            pricePolicy: "channel",
            billingMode: "fixed_request",
            unitPriceMicrocredits: 0,
            inputPriceMicrocredits: 0,
            outputPriceMicrocredits: 0,
            cachedPriceMicrocredits: 0,
        });
    }, [form]);
    return <div className="rounded-md bg-muted/20 px-3 py-3 text-xs leading-5 text-foreground/55">{translate("adminPages.logicalModels.logicalModelsPage.configurePricesUpstreamSKUsAndAvailableSpecificationsOnlyInSystem")}</div>;
}

function logicalPriceLabel(item: AdminLogicalModel) {
    const priceTiers = item.priceTiers || [];
    if (!priceTiers.length) return <span className="text-xs text-foreground/45">{translate("adminPages.logicalModels.logicalModelsPage.systemSpecificationPricesNeedConfiguration")}</span>;
    return <span className="text-xs">{priceTiers.length} {translate("adminPages.logicalModels.logicalModelsPage.systemSpecificationTiers")}</span>;
}

function logicalModelToForm(item: AdminLogicalModel): LogicalModelFormValues {
    return {
        code: item.code,
        name: item.name,
        icon: item.icon || "",
        description: item.description,
        capability: item.capability,
        enabled: item.enabled,
        sortOrder: item.sortOrder,
        pricePolicy: "channel",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 0,
        inputPriceMicrocredits: 0,
        outputPriceMicrocredits: 0,
        cachedPriceMicrocredits: 0,
        capabilitySpec: item.capabilitySpec,
        defaultOptions: item.defaultOptions,
        routes: (item.routes || []).map((route) => ({ channelModelId: route.channelModelId, enabled: route.enabled, priority: route.priority, weight: route.weight })),
    };
}

function logicalModelPayload(values: LogicalModelFormValues, sourceSpecs: CapabilitySpec[] = []): LogicalModelMutation {
    const capabilitySpec = normalizeCapabilitySpecForSources({ ...values.capabilitySpec, capability: values.capability, version: 1 as const }, sourceSpecs) || emptyCapabilitySpec(values.capability);
    return {
        code: values.code.trim(),
        name: values.name.trim(),
        icon: values.icon.trim(),
        description: values.description?.trim() || "",
        capability: values.capability,
        enabled: values.enabled,
        sortOrder: values.sortOrder || 0,
        pricePolicy: "channel",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 0,
        inputPriceMicrocredits: 0,
        outputPriceMicrocredits: 0,
        cachedPriceMicrocredits: 0,
        capabilitySpec,
        defaultOptions: sanitizeDefaults(capabilitySpec, values.defaultOptions),
        routes: values.routes.map((route) => ({ ...route, priority: route.priority || 0, weight: route.weight || 0 })),
    };
}

function hasCapabilityRules(spec?: CapabilitySpec) {
    return Boolean(spec && ((spec.operations?.length || 0) > 0 || Object.keys(spec.inputs || {}).length > 0 || Object.keys(spec.options || {}).length > 0));
}

function simulationColumns(): ColumnsType<RouteSimulationResult["candidates"][number]> {
    return [
        {
            title: translate("adminPages.logicalModels.logicalModelsPage.providerRoutes"),
            render: (_, candidate) => `${candidate.channelModelName}（${candidate.channelModelKey}）`,
        },
        { title: translate("adminPages.logicalModels.logicalModelsPage.priority"), dataIndex: "priority", width: 80 },
        { title: translate("adminPages.logicalModels.logicalModelsPage.weight"), dataIndex: "weight", width: 70 },
        {
            title: translate("adminPages.logicalModels.logicalModelsPage.result"),
            width: 110,
            render: (_, candidate) => (
                <Tag variant="filled" color={candidate.inPool ? "success" : candidate.blocked ? "warning" : "default"}>
                    {candidate.inPool ? translate("adminPages.logicalModels.logicalModelsPage.includedInTheCandidatePool") : candidate.blocked ? translate("adminPages.logicalModels.logicalModelsPage.coolingDown") : candidate.matched ? translate("adminPages.logicalModels.logicalModelsPage.lowerPriority") : translate("adminPages.logicalModels.logicalModelsPage.noMatch")}
                </Tag>
            ),
        },
        { title: translate("adminPages.logicalModels.logicalModelsPage.reason"), render: (_, candidate) => candidate.reasons?.join("；") || "-" },
    ];
}
