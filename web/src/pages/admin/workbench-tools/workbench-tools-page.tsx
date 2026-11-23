import { createClientUUID } from "@/lib/client-id";
import { App, Button, Form, Input, InputNumber, Select, Switch, Upload } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import type { ColumnsType } from "antd/es/table";
import { CloudUpload, Edit3, Plus, RefreshCw, Search, Trash2, Shapes } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPageFrame } from "@/pages/admin/components/admin-shell";
import { AdminDataTable, AdminStatusBadge } from "@/pages/admin/components/admin-ui";
import { workbenchCategories, workbenchCategoryLabel, workbenchModeOptions } from "@/pages/workbench/workbench-catalog";
import { uploadResourceFile } from "@/services/api/resources";
import {
    capabilitySupportedModes,
    listWorkbenchTools,
    normalizeWorkbenchGuide,
    resolveWorkbenchResourceURL,
    saveAdminWorkbenchTool,
    setAdminWorkbenchToolEnabled,
    type WorkbenchInputContract,
    type WorkbenchKind,
    type WorkbenchReferenceSlot,
    type WorkbenchTool,
    type WorkbenchPromptPreset,
    type WorkbenchResultExample,
} from "@/services/api/workbench";

import "./workbench-tools.css";
import { translate } from "@/i18n";

type ToolDraft = {
    id?: string;
    kind: WorkbenchKind;
    categoryId: string;
    name: string;
    subtitle: string;
    description: string;
    guideText: string;
    inputHint: string;
    iconResourceId?: string;
    iconUrl?: string;
    coverResourceId?: string;
    coverUrl?: string;
    sortOrder: number;
    enabled: boolean;
    supportedModes: string[];
    searchKeywords: string[];
    surfaces: string[];
    recommended: boolean;
    recommendationOrder: number;
    capability: Record<string, unknown>;
    guideConfig: Record<string, unknown>;
    inputContract: WorkbenchInputContract;
    resultExample: WorkbenchResultExample;
    presets: WorkbenchPromptPreset[];
    savedPresetIds: string[];
};

type MediaValue = { id?: string; url?: string };
type UploadMedia = (file: File, kind: "image" | "video") => Promise<MediaValue>;

const emptyDraft = (kind: WorkbenchKind = "image"): ToolDraft => ({
    kind,
    categoryId: "recommended",
    name: "",
    subtitle: "",
    description: "",
    guideText: "",
    inputHint: "",
    sortOrder: 0,
    enabled: false,
    supportedModes: [kind],
    searchKeywords: [],
    surfaces: ["workbench"],
    recommended: false,
    recommendationOrder: 0,
    capability: {},
    guideConfig: {},
    inputContract: { promptRequired: true, minTextReferences: 0, slots: [] },
    resultExample: { imageResourceIds: [], imageUrls: [] },
    presets: [],
    savedPresetIds: [],
});

function record(value: unknown): Record<string, unknown> {
    if (typeof value === "string") {
        try {
            return record(JSON.parse(value));
        } catch {
            return {};
        }
    }
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function makeDraft(tool: WorkbenchTool): ToolDraft {
    const capability = record(tool.capability);
    const contract = tool.inputContract || { promptRequired: true, minTextReferences: 0, slots: [] };
    return {
        ...emptyDraft(tool.kind),
        ...tool,
        capability,
        guideConfig: record(tool.guide),
        guideText: normalizeWorkbenchGuide(tool.guide),
        inputHint: tool.inputHint || "",
        supportedModes: capabilitySupportedModes(tool).length ? capabilitySupportedModes(tool) : [tool.kind],
        searchKeywords: tool.searchKeywords || [],
        surfaces: tool.surfaces?.length ? tool.surfaces : ["workbench"],
        recommended: Boolean(tool.recommended),
        recommendationOrder: tool.recommendationOrder || 0,
        inputContract: { ...contract, slots: contract.slots.map((slot) => ({ ...slot })) },
        resultExample: { ...tool.resultExample, imageResourceIds: tool.resultExample?.imageResourceIds || [] },
        presets: tool.presets.map((preset) => ({ ...preset })),
        savedPresetIds: tool.presets.map((preset) => preset.id),
    };
}

function ResourceUpload({ label, value, kind = "image", disabled, upload, onChange }: { label: string; value: MediaValue; kind?: "image" | "video"; disabled: boolean; upload: UploadMedia; onChange: (value: MediaValue) => void }) {
    const [uploading, setUploading] = useState(false);
    return (
        <div className="admin-workbench-resource-upload">
            <div className="admin-workbench-resource-preview">{value.url ? kind === "video" ? <video src={value.url} controls preload="metadata" /> : <img src={value.url} alt={label} /> : <Shapes className="size-5" />}</div>
            <div className="admin-workbench-resource-actions">
                <strong>{label}</strong>
                <small>
                    {value.id
                        ? value.url
                            ? translate("adminPages.workbenchTools.workbenchToolsPage.uploaded")
                            : translate("adminPages.workbenchTools.workbenchToolsPage.uploadedPreviewTemporarilyUnavailable")
                        : translate("adminPages.workbenchTools.workbenchToolsPage.chooseFileToUpload")}
                </small>
                <div>
                    <Upload
                        disabled={disabled}
                        accept={`${kind}/*`}
                        showUploadList={false}
                        beforeUpload={async (file) => {
                            setUploading(true);
                            try {
                                onChange(await upload(file, kind));
                            } catch {
                                /* Upload errors are reported by the shared uploader. */
                            } finally {
                                setUploading(false);
                            }
                            return false;
                        }}
                    >
                        <Button size="small" disabled={disabled} loading={uploading} icon={<CloudUpload className="size-3.5" />}>
                            {value.id ? translate("canvasPage.upload.replaceFile") : translate("canvasA.assetView.uploadFiles")}
                        </Button>
                    </Upload>
                    {value.id && (
                        <Button size="small" disabled={disabled} type="text" danger aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.remove", { v0: String(label) })} icon={<Trash2 className="size-3.5" />} onClick={() => onChange({})}>
                            {translate("canvasB.common.remove")}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

function SlotEditor({
    slot,
    index,
    kind,
    disabled,
    upload,
    onChange,
    onRemove,
}: {
    slot: WorkbenchReferenceSlot;
    index: number;
    kind: WorkbenchKind;
    disabled: boolean;
    upload: UploadMedia;
    onChange: (patch: Partial<WorkbenchReferenceSlot>) => void;
    onRemove: () => void;
}) {
    return (
        <div className="admin-workbench-slot-row">
            <div className="admin-workbench-slot-fields">
                <label>
                    {translate("adminPages.workbenchTools.workbenchToolsPage.inputName")}
                    <Input
                        aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.inputName2", { v0: String(index + 1) })}
                        value={slot.name}
                        placeholder={translate("adminPages.workbenchTools.workbenchToolsPage.forExampleModelFaceProduct")}
                        onChange={(event) => onChange({ name: event.target.value })}
                    />
                </label>
                <label>
                    {translate("library.picker.mediaKind")}
                    <Select
                        mode="multiple"
                        aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.inputMediaType", { v0: String(index + 1) })}
                        value={slot.mediaTypes}
                        options={(kind === "image" ? ["image"] : ["image", "video", "audio"]).map((value) => ({
                            value,
                            label: value === "image" ? translate("account.feedback.image") : value === "video" ? translate("account.feedback.video") : translate("account.settings.modelConfig.capabilities.audio"),
                        }))}
                        onChange={(mediaTypes) => onChange({ mediaTypes })}
                    />
                </label>
                <label>
                    {translate("adminPages.workbenchTools.workbenchToolsPage.minimumCount")}
                    <InputNumber
                        min={0}
                        max={slot.maxCount}
                        aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.inputMinimumCount", { v0: String(index + 1) })}
                        value={slot.minCount}
                        onChange={(value) => onChange({ minCount: value || 0, required: Boolean(value) })}
                    />
                </label>
                <label>
                    {translate("adminPages.workbenchTools.workbenchToolsPage.maximumCount")}
                    <InputNumber
                        min={Math.max(1, slot.minCount)}
                        max={20}
                        aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.inputMaximumCount", { v0: String(index + 1) })}
                        value={slot.maxCount}
                        onChange={(value) => onChange({ maxCount: value || 1 })}
                    />
                </label>
                <label>
                    {translate("adminPages.workbenchTools.workbenchToolsPage.required")}
                    <Switch
                        aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.inputRequired", { v0: String(index + 1) })}
                        checked={slot.required}
                        onChange={(required) => onChange({ required, minCount: required ? Math.max(1, slot.minCount) : 0 })}
                    />
                </label>
                <Button disabled={disabled} danger type="text" size="small" onClick={onRemove}>
                    {translate("adminPages.workbenchTools.workbenchToolsPage.removeInput")}
                </Button>
            </div>
            <div className="admin-workbench-resource-grid">
                <ResourceUpload
                    label={translate("adminPages.workbenchTools.workbenchToolsPage.cover", { v0: String(slot.name || translate("adminPages.workbenchTools.workbenchToolsPage.input")) })}
                    value={{ id: slot.coverResourceId, url: slot.coverUrl }}
                    disabled={disabled}
                    upload={upload}
                    onChange={(value) => onChange({ coverResourceId: value.id, coverUrl: value.url })}
                />
                <ResourceUpload
                    label={translate("adminPages.workbenchTools.workbenchToolsPage.example", { v0: String(slot.name || translate("adminPages.workbenchTools.workbenchToolsPage.input")) })}
                    value={{ id: slot.sampleResourceId, url: slot.sampleUrl }}
                    disabled={disabled}
                    upload={upload}
                    onChange={(value) => onChange({ sampleResourceId: value.id, sampleUrl: value.url })}
                />
            </div>
        </div>
    );
}

export default function WorkbenchToolsPage() {
    const { message } = App.useApp();
    const [kind, setKind] = useState<WorkbenchKind>("image");
    const [tools, setTools] = useState<WorkbenchTool[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [editorOpen, setEditorOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadCount, setUploadCount] = useState(0);
    const [draft, setDraft] = useState<ToolDraft>(emptyDraft());
    const [form] = Form.useForm();
    const editorBusy = saving || uploadCount > 0;

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listWorkbenchTools(kind, undefined, true);
            setTools(result.tools.sort((a, b) => a.sortOrder - b.sortOrder));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.workbenchTools.workbenchToolsPage.failedToLoadWorkspaceTools"));
        } finally {
            setLoading(false);
        }
    }, [kind, message]);
    useEffect(() => {
        void reload();
    }, [reload]);
    const visibleTools = useMemo(() => tools.filter((item) => !query.trim() || `${item.name} ${item.subtitle} ${item.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [query, tools]);

    const openEditor = async (tool?: WorkbenchTool) => {
        const next = tool ? makeDraft(tool) : emptyDraft(kind);
        if (tool) {
            [next.iconUrl, next.coverUrl] = await Promise.all([resolveWorkbenchResourceURL(next.iconResourceId), resolveWorkbenchResourceURL(next.coverResourceId)]);
            next.inputContract.slots = await Promise.all(next.inputContract.slots.map(async (slot) => ({ ...slot, coverUrl: await resolveWorkbenchResourceURL(slot.coverResourceId), sampleUrl: await resolveWorkbenchResourceURL(slot.sampleResourceId) })));
            next.resultExample.imageUrls = await Promise.all((next.resultExample.imageResourceIds || []).map(async (id) => (await resolveWorkbenchResourceURL(id)) || ""));
            next.resultExample.videoUrl = await resolveWorkbenchResourceURL(next.resultExample.videoResourceId);
        }
        setDraft(next);
        form.resetFields();
        form.setFieldsValue({ ...next, resultTitle: next.resultExample.title || "", resultDescription: next.resultExample.description || "" });
        setEditorOpen(true);
    };

    const upload: UploadMedia = async (file, mediaKind) => {
        if (!file.type.startsWith(`${mediaKind}/`)) {
            message.error(translate("adminPages.workbenchTools.workbenchToolsPage.pleaseSelectAFile", { v0: String(mediaKind === "image" ? translate("account.feedback.image") : translate("account.feedback.video")) }));
            throw new Error(translate("adminPages.workbenchTools.workbenchToolsPage.fileTypeMismatch"));
        }
        setUploadCount((count) => count + 1);
        try {
            const resource = await uploadResourceFile(file, mediaKind, { fileName: file.name });
            const url = await resolveWorkbenchResourceURL(resource.id);
            message.success(translate("adminPages.workbenchTools.workbenchToolsPage.fileUploaded"));
            return { id: resource.id, url };
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("canvasPage.upload.uploadFailed"));
            throw error;
        } finally {
            setUploadCount((count) => count - 1);
        }
    };

    const save = async () => {
        if (editorBusy) return;
        let values: ToolDraft & { resultTitle?: string; resultDescription?: string };
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const slots = draft.inputContract.slots;
        if (slots.some((slot) => !slot.name.trim() || !slot.mediaTypes.length || slot.minCount > slot.maxCount)) {
            message.warning(translate("adminPages.workbenchTools.workbenchToolsPage.pleaseCompleteTheInputNameMediaTypeAndValidCount"));
            return;
        }
        if (draft.presets.some((preset) => !preset.name.trim() || !preset.promptTemplate.trim())) {
            message.warning(translate("adminPages.workbenchTools.workbenchToolsPage.pleaseCompleteThePresetNameAndPrompt"));
            return;
        }
        setSaving(true);
        try {
            const saved = await saveAdminWorkbenchTool({
                id: draft.id,
                kind: draft.kind,
                categoryId: values.categoryId,
                name: values.name.trim(),
                subtitle: values.subtitle?.trim() || "",
                description: values.description.trim(),
                iconResourceId: draft.iconResourceId || "",
                coverResourceId: draft.coverResourceId || "",
                sortOrder: values.sortOrder || 0,
                enabled: values.enabled,
                capability: {
                    ...draft.capability,
                    supportedModes: values.supportedModes,
                    searchKeywords: values.searchKeywords,
                    surfaces: values.surfaces,
                    recommended: values.recommended,
                    recommendationOrder: values.recommendationOrder || 0,
                    inputContract: { ...draft.inputContract, slots: slots.map(({ coverUrl: _coverURL, sampleUrl: _sampleURL, ...slot }) => slot) },
                },
                guide: {
                    ...draft.guideConfig,
                    lines: values.guideText.trim().split("\n").filter(Boolean),
                    inputHint: values.inputHint.trim(),
                    resultExample: { title: values.resultTitle?.trim() || "", description: values.resultDescription?.trim() || "", imageResourceIds: draft.resultExample.imageResourceIds || [], videoResourceId: draft.resultExample.videoResourceId || "" },
                },
                presets: draft.presets.map((preset, index) => ({ ...preset, id: draft.savedPresetIds.includes(preset.id) ? preset.id : "", sortOrder: index })),
            });
            setEditorOpen(false);
            await reload();
            message.success(saved.enabled ? translate("adminPages.workbenchTools.workbenchToolsPage.toolSavedAndMadeAvailable") : translate("adminPages.workbenchTools.workbenchToolsPage.toolSavedAsUnavailable"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.workbenchTools.workbenchToolsPage.failedToSaveTool"));
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (tool: WorkbenchTool, enabled: boolean) => {
        try {
            await setAdminWorkbenchToolEnabled(tool.id, enabled);
            await reload();
            message.success(enabled ? translate("adminPages.workbenchTools.workbenchToolsPage.toolIsNowAvailable") : translate("adminPages.workbenchTools.workbenchToolsPage.toolIsNowOffline"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.workbenchTools.workbenchToolsPage.failedToUpdateToolStatus"));
        }
    };
    const updateSlot = (key: string, patch: Partial<WorkbenchReferenceSlot>) =>
        setDraft((current) => ({ ...current, inputContract: { ...current.inputContract, slots: current.inputContract.slots.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)) } }));
    const updatePreset = (id: string, patch: Partial<WorkbenchPromptPreset>) => setDraft((current) => ({ ...current, presets: current.presets.map((preset) => (preset.id === id ? { ...preset, ...patch } : preset)) }));
    const columns: ColumnsType<WorkbenchTool> = [
        {
            title: translate("canvasA.focusBar.tools"),
            dataIndex: "name",
            render: (_, tool) => (
                <div className="admin-workbench-tool-main">
                    <span className="admin-workbench-tool-icon">{tool.iconUrl ? <img src={tool.iconUrl} alt="" /> : <Shapes className="size-4" />}</span>
                    <span>
                        <strong>{tool.name}</strong>
                        <small>{tool.subtitle || tool.description}</small>
                    </span>
                </div>
            ),
        },
        { title: translate("library.picker.category"), dataIndex: "categoryId", width: 140, align: "center", render: workbenchCategoryLabel },
        {
            title: translate("canvasB.nineGrid.presets"),
            dataIndex: "presets",
            width: 90,
            align: "center",
            render: (value: WorkbenchPromptPreset[]) => translate("adminPages.workbenchTools.workbenchToolsPage.enabled", { v0: String(value.filter((item) => item.enabled).length) }),
        },
        { title: translate("adminPages.workbenchTools.workbenchToolsPage.order"), dataIndex: "sortOrder", width: 80, align: "center" },
        {
            title: translate("library.tasks.detail.status"),
            dataIndex: "enabled",
            width: 120,
            align: "center",
            render: (enabled: boolean, tool) => (
                <div className="admin-workbench-tool-status">
                    <AdminStatusBadge label={enabled ? translate("adminPages.workbenchTools.workbenchToolsPage.available") : translate("adminPages.workbenchTools.workbenchToolsPage.unavailable")} tone={enabled ? "success" : "neutral"} />
                    <Switch
                        checked={enabled}
                        aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.availabilityAction", {
                            action: enabled ? translate("adminPages.workbenchTools.workbenchToolsPage.offline") : translate("adminPages.workbenchTools.workbenchToolsPage.available2"),
                            name: tool.name,
                        })}
                        onChange={(checked) => void toggle(tool, checked)}
                    />
                </div>
            ),
        },
        {
            title: translate("account.settings.runninghub.actions"),
            width: 120,
            align: "center",
            render: (_, tool) => (
                <Button size="small" icon={<Edit3 className="size-3.5" />} onClick={() => void openEditor(tool)}>
                    {translate("account.settings.channels.edit")}
                </Button>
            ),
        },
    ];

    return (
        <AdminPageFrame
            title={translate("adminPages.workbenchTools.workbenchToolsPage.workspaceTools")}
            description={translate("adminPages.workbenchTools.workbenchToolsPage.manageImageAndVideoToolsSceneInputsAndExampleAssets")}
            scroll
            actions={
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => void openEditor()}>
                    {translate("adminPages.workbenchTools.workbenchToolsPage.newTool")}
                </Button>
            }
        >
            <div className="admin-workbench-tools">
                <div className="admin-workbench-tools-toolbar">
                    <Select
                        aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.workspaceType")}
                        value={kind}
                        onChange={setKind}
                        options={[
                            { label: translate("nav.sidebar.toolboxImage"), value: "image" },
                            { label: translate("nav.sidebar.toolboxVideo"), value: "video" },
                        ]}
                    />
                    <Input
                        aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.searchWorkspaceTools")}
                        prefix={<Search className="size-4" />}
                        placeholder={translate("adminPages.workbenchTools.workbenchToolsPage.searchNameOrDescription")}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        allowClear
                    />
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void reload()}>
                        {translate("common.refresh")}
                    </Button>
                </div>
                <AdminDataTable
                    table={{ className: "app-data-table", rowKey: "id", loading, pagination: false, columns, dataSource: visibleTools, scroll: { x: 900 } }}
                    empty={<div className="admin-workbench-tools-empty">{translate("adminPages.workbenchTools.workbenchToolsPage.noToolsOfThisTypeYetUseNewToolTo")}</div>}
                />
            </div>
            <AdminModal
                title={draft.id ? translate("adminPages.workbenchTools.workbenchToolsPage.editWorkspaceTool") : translate("adminPages.workbenchTools.workbenchToolsPage.newWorkspaceTool")}
                open={editorOpen}
                onCancel={() => !editorBusy && setEditorOpen(false)}
                onOk={() => void save()}
                okText={uploadCount ? translate("adminPages.workbenchTools.workbenchToolsPage.waitingForUploadsToFinish") : translate("common.save")}
                okButtonProps={{ disabled: uploadCount > 0 }}
                cancelButtonProps={{ disabled: editorBusy }}
                confirmLoading={saving}
                maskClosable={!editorBusy}
                keyboard={!editorBusy}
                closable={!editorBusy}
                width={1080}
                destroyOnHidden
                className="admin-workbench-tool-editor"
            >
                <Form form={form} layout="vertical" disabled={editorBusy} className="admin-workbench-tool-form">
                    <div className="admin-workbench-tool-grid">
                        <Form.Item label={translate("adminPages.workbenchTools.workbenchToolsPage.workspaceType")}>
                            <Select
                                value={draft.kind}
                                disabled={Boolean(draft.id) || editorBusy}
                                options={[
                                    { label: translate("nav.sidebar.toolboxImage"), value: "image" },
                                    { label: translate("nav.sidebar.toolboxVideo"), value: "video" },
                                ]}
                                onChange={(value: WorkbenchKind) => {
                                    setDraft((current) => ({
                                        ...current,
                                        kind: value,
                                        inputContract: { ...current.inputContract, slots: value === "image" ? current.inputContract.slots.map((slot) => ({ ...slot, mediaTypes: ["image"] })) : current.inputContract.slots },
                                    }));
                                    form.setFieldValue("supportedModes", [value]);
                                }}
                            />
                        </Form.Item>
                        <Form.Item name="categoryId" label={translate("library.assets.batch.category")} rules={[{ required: true }]}>
                            <Select options={workbenchCategories} />
                        </Form.Item>
                        <Form.Item name="name" label={translate("adminPages.workbenchTools.workbenchToolsPage.toolName")} rules={[{ required: true, whitespace: true, max: 80 }]}>
                            <Input maxLength={80} />
                        </Form.Item>
                        <Form.Item name="subtitle" label={translate("adminPages.workbenchTools.workbenchToolsPage.subtitle")}>
                            <Input maxLength={160} />
                        </Form.Item>
                        <Form.Item name="sortOrder" label={translate("adminPages.workbenchTools.workbenchToolsPage.order")}>
                            <InputNumber min={0} max={1000000} />
                        </Form.Item>
                        <Form.Item name="enabled" label={translate("adminPages.workbenchTools.workbenchToolsPage.availableToUsers")} valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </div>
                    <Form.Item name="description" label={translate("adminPages.workbenchTools.workbenchToolsPage.shortDescription")} rules={[{ required: true, whitespace: true, max: 500 }]}>
                        <Input.TextArea rows={2} maxLength={500} />
                    </Form.Item>
                    <div className="admin-workbench-resource-grid">
                        <ResourceUpload
                            label={translate("adminPages.workbenchTools.workbenchToolsPage.toolIcon")}
                            value={{ id: draft.iconResourceId, url: draft.iconUrl }}
                            disabled={editorBusy}
                            upload={upload}
                            onChange={(value) => setDraft((current) => ({ ...current, iconResourceId: value.id, iconUrl: value.url }))}
                        />
                        <ResourceUpload
                            label={translate("adminPages.workbenchTools.workbenchToolsPage.toolCover")}
                            value={{ id: draft.coverResourceId, url: draft.coverUrl }}
                            disabled={editorBusy}
                            upload={upload}
                            onChange={(value) => setDraft((current) => ({ ...current, coverResourceId: value.id, coverUrl: value.url }))}
                        />
                    </div>
                    <div className="admin-workbench-section-title">
                        <strong>{translate("adminPages.workbenchTools.workbenchToolsPage.whatUsersNeedToProvide")}</strong>
                        <small>{translate("adminPages.workbenchTools.workbenchToolsPage.configureInputsSuchAsModelsFacesAndProductsUploadFields")}</small>
                    </div>
                    <div className="admin-workbench-contract-toolbar">
                        <label>
                            {translate("adminPages.workbenchTools.workbenchToolsPage.promptRequired")}{" "}
                            <Switch
                                checked={draft.inputContract.promptRequired || draft.inputContract.minTextReferences > 0}
                                onChange={(promptRequired) => setDraft((current) => ({ ...current, inputContract: { ...current.inputContract, promptRequired, minTextReferences: 0 } }))}
                            />
                        </label>
                        <Button
                            size="small"
                            disabled={draft.inputContract.slots.length >= 20}
                            icon={<Plus className="size-3.5" />}
                            onClick={() =>
                                setDraft((current) => ({
                                    ...current,
                                    inputContract: { ...current.inputContract, slots: [...current.inputContract.slots, { key: createClientUUID(), name: "", mediaTypes: ["image"], resourceKind: "asset", minCount: 0, maxCount: 1, required: false }] },
                                }))
                            }
                        >
                            {translate("adminPages.workbenchTools.workbenchToolsPage.addInput")}
                        </Button>
                    </div>
                    <div className="admin-workbench-slots">
                        {draft.inputContract.slots.map((slot, index) => (
                            <SlotEditor
                                key={slot.key}
                                slot={slot}
                                index={index}
                                kind={draft.kind}
                                disabled={editorBusy}
                                upload={upload}
                                onChange={(patch) => updateSlot(slot.key, patch)}
                                onRemove={() => setDraft((current) => ({ ...current, inputContract: { ...current.inputContract, slots: current.inputContract.slots.filter((item) => item.key !== slot.key) } }))}
                            />
                        ))}
                    </div>
                    <div className="admin-workbench-section-title">
                        <strong>{translate("adminPages.workbenchTools.workbenchToolsPage.instructionsAndDisplay")}</strong>
                    </div>
                    <div className="admin-workbench-tool-grid">
                        <Form.Item name="inputHint" label={translate("adminPages.workbenchTools.workbenchToolsPage.inputHints")}>
                            <Input.TextArea rows={2} maxLength={500} />
                        </Form.Item>
                        <Form.Item name="guideText" label={translate("adminPages.workbenchTools.workbenchToolsPage.instructions")}>
                            <Input.TextArea rows={2} maxLength={5000} />
                        </Form.Item>
                        <Form.Item name="supportedModes" label={translate("adminPages.workbenchTools.workbenchToolsPage.creationMethod")} rules={[{ required: true }]}>
                            <Select mode="multiple" options={workbenchModeOptions(draft.kind)} />
                        </Form.Item>
                        <Form.Item name="searchKeywords" label={translate("adminPages.workbenchTools.workbenchToolsPage.searchKeywords")}>
                            <Select mode="tags" tokenSeparators={[",", "，"]} placeholder={translate("adminPages.workbenchTools.workbenchToolsPage.enterAKeywordAndPressEnter")} />
                        </Form.Item>
                        <Form.Item name="surfaces" label={translate("adminPages.workbenchTools.workbenchToolsPage.displayEntry")}>
                            <Select mode="multiple" options={[{ value: "workbench", label: translate("adminPages.workbenchTools.workbenchToolsPage.creativeWorkspace") }]} />
                        </Form.Item>
                        <Form.Item name="recommendationOrder" label={translate("adminPages.workbenchTools.workbenchToolsPage.recommendationOrder")}>
                            <InputNumber min={0} max={1000000} />
                        </Form.Item>
                        <Form.Item name="recommended" label={translate("adminPages.workbenchTools.workbenchToolsPage.recommendedTool")} valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </div>
                    <div className="admin-workbench-section-title">
                        <strong>{translate("adminPages.workbenchTools.workbenchToolsPage.resultExamples")}</strong>
                        <small>{translate("adminPages.workbenchTools.workbenchToolsPage.uploadActualResultImagesOrVideosToHelpUsersUnderstand")}</small>
                    </div>
                    <div className="admin-workbench-tool-grid">
                        <Form.Item name="resultTitle" label={translate("adminPages.workbenchTools.workbenchToolsPage.exampleTitle")}>
                            <Input maxLength={120} />
                        </Form.Item>
                        <Form.Item name="resultDescription" label={translate("adminPages.workbenchTools.workbenchToolsPage.exampleDescription")}>
                            <Input.TextArea rows={2} maxLength={500} />
                        </Form.Item>
                    </div>
                    <div className="admin-workbench-example-previews">
                        {draft.resultExample.imageResourceIds?.map((id, index) => (
                            <ResourceUpload
                                key={id}
                                label={translate("adminPages.workbenchTools.workbenchToolsPage.imageExample", { v0: String(index + 1) })}
                                value={{ id, url: draft.resultExample.imageUrls?.[index] }}
                                disabled={editorBusy}
                                upload={upload}
                                onChange={(value) =>
                                    setDraft((current) => ({
                                        ...current,
                                        resultExample: {
                                            ...current.resultExample,
                                            imageResourceIds: current.resultExample.imageResourceIds?.flatMap((item, i) => (i === index ? (value.id ? [value.id] : []) : [item])),
                                            imageUrls: current.resultExample.imageResourceIds?.flatMap((_, i) => (i === index ? (value.id ? [value.url || ""] : []) : [current.resultExample.imageUrls?.[i] || ""])),
                                        },
                                    }))
                                }
                            />
                        ))}
                    </div>
                    <div className="admin-workbench-resource-grid">
                        {(draft.resultExample.imageResourceIds?.length || 0) < 8 && (
                            <ResourceUpload
                                label={translate("adminPages.workbenchTools.workbenchToolsPage.addImageExample")}
                                value={{}}
                                disabled={editorBusy}
                                upload={upload}
                                onChange={(value) =>
                                    value.id &&
                                    setDraft((current) => ({
                                        ...current,
                                        resultExample: { ...current.resultExample, imageResourceIds: [...(current.resultExample.imageResourceIds || []), value.id!], imageUrls: [...(current.resultExample.imageUrls || []), value.url || ""] },
                                    }))
                                }
                            />
                        )}
                        {draft.kind === "video" && (
                            <ResourceUpload
                                label={translate("adminPages.workbenchTools.workbenchToolsPage.videoExample")}
                                kind="video"
                                value={{ id: draft.resultExample.videoResourceId, url: draft.resultExample.videoUrl }}
                                disabled={editorBusy}
                                upload={upload}
                                onChange={(value) => setDraft((current) => ({ ...current, resultExample: { ...current.resultExample, videoResourceId: value.id, videoUrl: value.url } }))}
                            />
                        )}
                    </div>
                    <section className="admin-workbench-presets">
                        <header>
                            <div>
                                <strong>{translate("adminPages.workbenchTools.workbenchToolsPage.presetPrompts")}</strong>
                                <small>{translate("adminPages.workbenchTools.workbenchToolsPage.savedWithTheToolSavedPresetsCanBeDisabledWhile")}</small>
                            </div>
                            <Button
                                size="small"
                                disabled={draft.presets.length >= 50}
                                icon={<Plus className="size-3.5" />}
                                onClick={() => setDraft((current) => ({ ...current, presets: [...current.presets, { id: createClientUUID(), name: "", promptTemplate: "", summary: "", enabled: true }] }))}
                            >
                                {translate("adminPages.workbenchTools.workbenchToolsPage.addPreset")}
                            </Button>
                        </header>
                        {draft.presets.map((preset, index) => (
                            <div className="admin-workbench-preset-row" key={preset.id}>
                                <Input
                                    aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.presetName", { v0: String(index + 1) })}
                                    placeholder={translate("adminPages.workbenchTools.workbenchToolsPage.presetName2")}
                                    value={preset.name}
                                    onChange={(event) => updatePreset(preset.id, { name: event.target.value })}
                                />
                                <Input
                                    aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.presetDescription", { v0: String(index + 1) })}
                                    placeholder={translate("adminPages.workbenchTools.workbenchToolsPage.briefDescription")}
                                    value={preset.summary}
                                    onChange={(event) => updatePreset(preset.id, { summary: event.target.value })}
                                />
                                <Input.TextArea
                                    aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.presetPrompt", { v0: String(index + 1) })}
                                    rows={3}
                                    placeholder={translate("account.settings.prompts.template")}
                                    value={preset.promptTemplate}
                                    onChange={(event) => updatePreset(preset.id, { promptTemplate: event.target.value })}
                                />
                                <Switch aria-label={translate("adminPages.workbenchTools.workbenchToolsPage.enablePreset", { v0: String(index + 1) })} checked={preset.enabled} onChange={(enabled) => updatePreset(preset.id, { enabled })} />
                                {!draft.savedPresetIds.includes(preset.id) && (
                                    <Button danger size="small" onClick={() => setDraft((current) => ({ ...current, presets: current.presets.filter((item) => item.id !== preset.id) }))}>
                                        {translate("canvasB.common.remove")}
                                    </Button>
                                )}
                            </div>
                        ))}
                    </section>
                </Form>
            </AdminModal>
        </AdminPageFrame>
    );
}
