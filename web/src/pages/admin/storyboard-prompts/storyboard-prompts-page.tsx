import { App, Button, Form, Input, Popconfirm, Tabs } from "antd";
import { Callout } from "@/pages/admin/ui/controls";
import type { ColumnsType } from "antd/es/table";
import { Braces, Copy, FileJson, FileText, Plus, Power, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { AdminSearchInput } from "../components/admin-search-input";

import { AdminDrawer } from "@/pages/admin/ui/overlays";
import { PromptCodeEditor, type PromptCodeEditorHandle } from "@/components/prompt/prompt-code-editor";
import {
    createAdminPromptTemplate,
    deleteAdminPromptTemplate,
    listAdminPromptTemplates,
    updateAdminPromptTemplate,
    type PromptOperationDefinition,
    type PromptTemplate,
} from "@/services/api/auth";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminDataTable, AdminRowActions, AdminStatusBadge, AdminTableEmpty, PaginationBar } from "../components/admin-ui";
import { Select } from "@/components/ui/base/select";
import { currentLocale, translate } from "@/i18n";


type PromptFormValues = { name: string; enabled?: boolean };
type DraftBaseline = { operation: string; name: string; enabled: boolean; content: string };

export default function StoryboardPromptsPage() {
    const { message } = App.useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const keyword = searchParams.get("filter") || "";
    const operationFilter = searchParams.get("operation") || "all";
    const status = searchParams.get("status") === "enabled" || searchParams.get("status") === "disabled" ? searchParams.get("status") as "enabled" | "disabled" : "all";
    const [templates, setTemplates] = useState<PromptTemplate[]>([]);
    const [definitions, setDefinitions] = useState<PromptOperationDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [baseTemplate, setBaseTemplate] = useState<PromptTemplate | null>(null);
    const [draftOperation, setDraftOperation] = useState("");
    const [pendingOperation, setPendingOperation] = useState("");
    const [draftBaseline, setDraftBaseline] = useState<DraftBaseline | null>(null);
    const [editorContent, setEditorContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [form] = Form.useForm<PromptFormValues>();
    const editorRef = useRef<PromptCodeEditorHandle>(null);
    const draftName = Form.useWatch("name", form) || "";
    const draftEnabled = Form.useWatch("enabled", form) === true;
    const selectedDefinition = definitions.find((item) => item.operation === draftOperation);
    const hasFilters = Boolean(keyword || operationFilter !== "all" || status !== "all");
    const dirty = Boolean(draftBaseline) && (
        draftOperation !== draftBaseline?.operation
        || draftName !== draftBaseline?.name
        || draftEnabled !== draftBaseline?.enabled
        || editorContent !== draftBaseline?.content
    );

    const updateUrl = (patch: { filter?: string; operation?: string; status?: string }) => {
        setPage(1);
        const next = new URLSearchParams(searchParams);
        Object.entries(patch).forEach(([key, value]) => value && value !== "all" ? next.set(key, value) : next.delete(key));
        setSearchParams(next);
    };

    const reload = async () => {
        setLoading(true);
        try {
            const result = await listAdminPromptTemplates();
            setTemplates(result.templates);
            setDefinitions(result.definitions);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.storyboardPrompts.storyboardPromptsPage.failedToLoadPromptTemplates"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void reload(); }, []);

    const definitionByOperation = useMemo(() => new Map(definitions.map((item) => [item.operation, item])), [definitions]);
    const filtered = useMemo(() => templates.filter((template) => {
        const definition = definitionByOperation.get(template.operation);
        const normalizedKeyword = keyword.trim().toLowerCase();
        if (normalizedKeyword && !`${template.name} ${template.content} ${definition?.label || ""}`.toLowerCase().includes(normalizedKeyword)) return false;
        if (operationFilter !== "all" && template.operation !== operationFilter) return false;
        if (status === "enabled" && !template.enabled) return false;
        if (status === "disabled" && template.enabled) return false;
        return true;
    }), [definitionByOperation, keyword, operationFilter, status, templates]);
    const paginatedTemplates = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

    const activeTemplateFor = (operation: string) => templates.find((template) => template.operation === operation && template.enabled);

    const loadDraftBaseline = (operation: string, template?: PromptTemplate) => {
        const source = template || activeTemplateFor(operation);
        const baseline = {
            operation,
            name: source ? translate("adminPages.storyboardPrompts.storyboardPromptsPage.newVersion2", { v0: String(source.name) }) : "",
            enabled: false,
            content: source?.content || "",
        };
        setDraftOperation(operation);
        setPendingOperation("");
        setEditorContent(baseline.content);
        setDraftBaseline(baseline);
        form.setFieldsValue({ name: baseline.name, enabled: baseline.enabled });
    };

    const openDrawer = (template?: PromptTemplate) => {
        const operation = template?.operation || definitions[0]?.operation || "";
        setBaseTemplate(template || null);
        form.resetFields();
        loadDraftBaseline(operation, template);
        setDrawerOpen(true);
    };

    const switchOperation = (operation: string) => {
        if (!dirty) {
            loadDraftBaseline(operation);
            return;
        }
        setPendingOperation(operation);
    };

    const closeDrawer = () => {
        if (saving) return;
        setDrawerOpen(false);
        setPendingOperation("");
    };

    const save = async () => {
        const values = await form.validateFields();
        if (!editorContent.trim()) {
            message.warning(translate("adminPages.storyboardPrompts.storyboardPromptsPage.enterThePromptTemplateContent"));
            return;
        }
        setSaving(true);
        try {
            await createAdminPromptTemplate({ operation: draftOperation, name: values.name.trim(), content: editorContent, enabled: values.enabled === true });
            setDraftBaseline(null);
            setDrawerOpen(false);
            await reload();
            message.success(translate("adminPages.storyboardPrompts.storyboardPromptsPage.newPromptVersionCreated"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.storyboardPrompts.storyboardPromptsPage.failedToSavePromptTemplate"));
        } finally {
            setSaving(false);
        }
    };

    const activate = async (template: PromptTemplate) => {
        try {
            await updateAdminPromptTemplate(template.id, { operation: template.operation, name: template.name, content: template.content, enabled: true });
            await reload();
            message.success(translate("adminPages.storyboardPrompts.storyboardPromptsPage.promptVersionActivated"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.storyboardPrompts.storyboardPromptsPage.failedToActivatePromptVersion"));
        }
    };

    const remove = async (template: PromptTemplate) => {
        try {
            await deleteAdminPromptTemplate(template.id);
            await reload();
            message.success(translate("adminPages.storyboardPrompts.storyboardPromptsPage.promptVersionDeleted"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.storyboardPrompts.storyboardPromptsPage.failedToDeletePromptVersion"));
        }
    };

    const columns: ColumnsType<PromptTemplate> = [
        { title: translate("adminPages.storyboardPrompts.storyboardPromptsPage.templateType"), dataIndex: "operation", width: 180, render: (operation: string) => { const definition = definitionByOperation.get(operation); return <div><div className="font-medium">{definition?.label || operation}</div><div className="mt-1 text-xs text-foreground/45">{definition?.category || "--"}</div></div>; } },
        { title: translate("canvasA.assetView.version"), dataIndex: "name", render: (_, template) => <div><div className="font-medium">{template.name}</div><div className="mt-1 text-xs text-foreground/45">v{template.version} · {template.content.length} {translate("adminPages.storyboardPrompts.storyboardPromptsPage.characters")}</div></div> },
        { title: translate("adminPages.storyboardPrompts.storyboardPromptsPage.output"), dataIndex: "outputType", width: 120, align: "center", render: (outputType: string, template) => <span className="inline-flex items-center gap-2 text-xs text-foreground/65">{outputType === "json" ? <FileJson className="size-3.5" /> : <FileText className="size-3.5" />}{outputType === "json" ? definitionByOperation.get(template.operation)?.schemaKey || "JSON" : translate("account.settings.modelConfig.capabilities.text")}</span> },
        { title: translate("library.tasks.detail.status"), dataIndex: "enabled", width: 100, align: "center", render: (enabled) => <AdminStatusBadge label={enabled ? translate("adminPages.storyboardPrompts.storyboardPromptsPage.active") : translate("adminPages.storyboardPrompts.storyboardPromptsPage.past")} tone={enabled ? "success" : "neutral"} /> },
        { title: translate("adminPages.storyboardPrompts.storyboardPromptsPage.updatedAt"), dataIndex: "updatedAt", width: 180, align: "center", render: formatTime },
        { title: translate("account.settings.runninghub.actions"), width: 310, align: "center", render: (_, template) => <AdminRowActions visibleActionCount={2} primary={{ label: translate("adminPages.storyboardPrompts.storyboardPromptsPage.createFromThisVersion"), icon: <Copy className="size-3.5" />, onClick: () => openDrawer(template) }} actions={[{ key: "activate", label: translate("adminPages.storyboardPrompts.storyboardPromptsPage.activateVersion"), icon: <Power className="size-3.5" />, disabled: template.enabled, confirm: { title: translate("adminPages.storyboardPrompts.storyboardPromptsPage.activateThisPromptVersion"), description: translate("adminPages.storyboardPrompts.storyboardPromptsPage.thisReplacesOnlyTheActiveVersionOfTheSameType"), okText: translate("adminPages.storyboardPrompts.storyboardPromptsPage.confirmEnable") }, onClick: () => activate(template) }, { key: "delete", label: translate("adminPages.storyboardPrompts.storyboardPromptsPage.deleteVersion"), icon: <Trash2 className="size-3.5" />, danger: true, disabled: template.enabled, confirm: { title: translate("adminPages.storyboardPrompts.storyboardPromptsPage.deleteThisPastVersion"), description: translate("adminPages.storyboardPrompts.storyboardPromptsPage.deletionCannotBeUndoneAndTheActiveVersionCannotBe"), okText: translate("account.ui.delete.confirm") }, onClick: () => remove(template) }]} /> },
    ];

    return (
        <AdminPageFrame title={translate("account.settings.prompts.template")} description={translate("adminPages.storyboardPrompts.storyboardPromptsPage.platformCreativeStrategyAndVersionManagement")} actions={<Button type="primary" icon={<Plus className="size-4" />} disabled={!definitions.length} onClick={() => openDrawer()}>{translate("adminPages.storyboardPrompts.storyboardPromptsPage.newVersion")}</Button>}>
            <AdminDataTable
                toolbar={<AdminSearchInput allowClear className="app-list-search" prefix={<Search className="size-4 text-foreground/40" />} value={keyword} aria-label={translate("adminPages.storyboardPrompts.storyboardPromptsPage.searchPromptTemplates")} placeholder={translate("adminPages.storyboardPrompts.storyboardPromptsPage.searchTemplatesOrContent")} onValueChange={(value) => updateUrl({ filter: value })} />}
                toolbarActive={hasFilters}
                toolbarFilters={<><Select aria-label={translate("adminPages.storyboardPrompts.storyboardPromptsPage.filterPromptType")} className="w-40" value={operationFilter} onChange={(value) => updateUrl({ operation: value })} options={[{ label: translate("library.tasks.page.allKinds"), value: "all" }, ...definitions.map((item) => ({ label: item.label, value: item.operation }))]} /><Select aria-label={translate("adminPages.storyboardPrompts.storyboardPromptsPage.filterPromptStatus")} className="w-32" value={status} onChange={(value) => updateUrl({ status: value })} options={[{ label: translate("library.ark.expiry.all"), value: "all" }, { label: translate("adminPages.storyboardPrompts.storyboardPromptsPage.active"), value: "enabled" }, { label: translate("adminPages.storyboardPrompts.storyboardPromptsPage.versionHistory"), value: "disabled" }]} /></>}
                onReset={() => updateUrl({ filter: "", operation: "all", status: "all" })}
                table={{ className: "app-data-table", size: "small", rowKey: "id", loading, pagination: false, columns, dataSource: paginatedTemplates, scroll: { x: 1120 }, expandable: { expandedRowRender: (template) => <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs leading-5 text-foreground/75">{template.content}</pre> } }}
                empty={<AdminTableEmpty filtered={hasFilters} />}
                footer={<PaginationBar alwaysShow current={page} pageSize={pageSize} total={filtered.length} onChange={(nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); }} />}
            />

            <AdminDrawer
                flush
                title={baseTemplate ? translate("adminPages.storyboardPrompts.storyboardPromptsPage.newVersionBasedOnV", { v0: String(baseTemplate.version) }) : translate("adminPages.storyboardPrompts.storyboardPromptsPage.newPromptVersion")}
                open={drawerOpen}
                size="min(1180px, 100vw)"
                onClose={closeDrawer}
                rootClassName="admin-drawer"
                closable={false}
                mask={{ closable: false }}
                keyboard={false}
                extra={<div className="flex gap-2"><Popconfirm disabled={!dirty} title={translate("adminPages.storyboardPrompts.storyboardPromptsPage.discardTemplateChanges")} description={translate("adminPages.storyboardPrompts.storyboardPromptsPage.unsavedContentInTheNewVersionWillBeLost")} okText={translate("adminPages.storyboardPrompts.storyboardPromptsPage.discardChanges")} cancelText={translate("account.settings.prompts.switchCancel")} okButtonProps={{ danger: true }} onConfirm={closeDrawer}><Button disabled={saving} onClick={() => { if (!dirty) closeDrawer(); }}>{translate("common.close")}</Button></Popconfirm><Button type="primary" loading={saving} disabled={!draftOperation || !draftName.trim() || !editorContent.trim()} onClick={() => void save()}>{translate("adminPages.storyboardPrompts.storyboardPromptsPage.saveVersion")}</Button></div>}
            >
                <Form form={form} layout="vertical" requiredMark={false} className="flex min-h-full flex-col">
                    <div className="grid shrink-0 gap-4 border-b border-border p-4 md:grid-cols-3">
                        <Form.Item label={translate("adminPages.storyboardPrompts.storyboardPromptsPage.templateType")} className="mb-0">
                            <Select value={draftOperation} disabled={Boolean(baseTemplate)} options={definitions.map((item) => ({ label: `${item.category} · ${item.label}`, value: item.operation }))} onChange={switchOperation} />
                        </Form.Item>
                        <Form.Item name="name" label={translate("adminPages.storyboardPrompts.storyboardPromptsPage.versionName")} className="mb-0" rules={[{ required: true, whitespace: true, message: translate("adminPages.storyboardPrompts.storyboardPromptsPage.enterAVersionName") }]}>
                            <Input placeholder={translate("adminPages.storyboardPrompts.storyboardPromptsPage.eGLightComedyStoryboardStrategyV2")} />
                        </Form.Item>
                        <Form.Item name="enabled" label={translate("adminPages.storyboardPrompts.storyboardPromptsPage.statusAfterSaving")} className="mb-0">
                            <Select options={[{ label: translate("adminPages.storyboardPrompts.storyboardPromptsPage.saveAsAPastVersion"), value: false }, { label: translate("adminPages.storyboardPrompts.storyboardPromptsPage.saveAndMakeThisTheActiveVersion"), value: true }]} />
                        </Form.Item>
                    </div>

                    {pendingOperation ? (
                        <Callout tone="warning" title={translate("adminPages.storyboardPrompts.storyboardPromptsPage.theCurrentVersionHasUnsavedChanges")} action={<div className="flex gap-2"><Button size="small" onClick={() => setPendingOperation("")}>{translate("account.settings.prompts.switchCancel")}</Button><Button size="small" danger onClick={() => loadDraftBaseline(pendingOperation)}>{translate("account.settings.prompts.switchOk")}</Button></div>}>{translate("adminPages.storyboardPrompts.storyboardPromptsPage.switchingToDiscardsTheCurrentDraft", { v0: String(definitionByOperation.get(pendingOperation)?.label || pendingOperation) })}</Callout>
                    ) : null}

                    <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-3">
                        <section className="flex min-h-0 flex-col border-b border-border p-4 lg:col-span-2 lg:border-b-0 lg:border-r">
                            <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{translate("adminPages.storyboardPrompts.storyboardPromptsPage.templateContent")}</h3>{dirty ? <AdminStatusBadge variant="filled" tone="warning" label={translate("account.settings.prompts.unsaved")} /> : null}</div>
                                <div className="flex flex-wrap justify-end gap-2">
                                    {selectedDefinition?.variables.map((variable) => (
                                        <Button key={variable.placeholder} size="small" icon={<Braces className="size-3.5" />} onClick={() => editorRef.current?.insertText(variable.placeholder)}>
                                            {translate("adminPages.storyboardPrompts.storyboardPromptsPage.insertVariable", { label: variable.label })}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            <div className="min-h-96 flex-1 overflow-hidden rounded-md border border-border">
                                <PromptCodeEditor ref={editorRef} value={editorContent} ariaLabel={translate("adminPages.storyboardPrompts.storyboardPromptsPage.promptTemplateContent")} onChange={setEditorContent} />
                            </div>
                        </section>

                        <aside className="min-h-0 p-4">
                            <Tabs
                                size="small"
                                items={[
                                    {
                                        key: "contract",
                                        label: translate("account.settings.prompts.contract"),
                                        children: <div><div className="mb-3 flex items-center gap-2 text-xs font-medium"><ShieldCheck className="size-4" />{translate("account.settings.prompts.serverReadOnly")}</div><pre className="thin-scrollbar max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-foreground/65">{selectedDefinition?.outputContract || translate("adminPages.storyboardPrompts.storyboardPromptsPage.selectATemplateType")}</pre></div>,
                                    },
                                    {
                                        key: "preview",
                                        label: translate("account.settings.prompts.preview"),
                                        children: <div className="space-y-4 text-xs leading-6"><section><div className="mb-2 font-medium text-foreground/80">{translate("adminPages.storyboardPrompts.storyboardPromptsPage.editableCreativeStrategy")}</div><pre className="thin-scrollbar max-h-64 overflow-auto whitespace-pre-wrap text-foreground/65">{editorContent || translate("account.settings.prompts.notFilled")}</pre></section><section className="border-t border-border pt-4"><div className="mb-2 font-medium text-foreground/80">{translate("account.settings.prompts.runtimeTitle")}</div><p className="text-foreground/55">{translate("adminPages.storyboardPrompts.storyboardPromptsPage.dynamicProjectContextPerUserCustomizationAndTheProtectedOutput")}</p></section></div>,
                                    },
                                ]}
                            />
                        </aside>
                    </div>
                </Form>
            </AdminDrawer>
        </AdminPageFrame>
    );
}

function formatTime(value?: string) { return value ? new Date(value).toLocaleString(currentLocale(), { hour12: false }) : "--"; }
