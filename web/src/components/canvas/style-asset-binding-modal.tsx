import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Input, InputNumber } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Switch } from "@/components/ui/base/switch";
import { AlertTriangle, Box, Check, FileImage, Link2, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { Select } from "@/components/ui/base/select";

import {
    createStyleProfileSnapshot,
    MAX_STYLE_ASSETS,
    styleAssetValidationMessage,
    type StyleAssetBinding,
    type StyleAssetKind,
    type StyleAssetStatus,
    type StyleProfileSnapshot,
} from "@/lib/canvas/style-profile";
import { translate } from "@/i18n";

const kindOptions: Array<{ value: StyleAssetKind; label: string }> = [
    { value: "lora", label: "LoRA" },
    { value: "template", label: translate("canvasTools.styleAssetBindingModal.imageTemplate") },
    { value: "reference", label: translate("canvasTools.styleAssetBindingModal.referenceSet") },
    { value: "prompt", label: translate("canvasTools.styleAssetBindingModal.promptModule") },
];

const statusOptions: Array<{ value: StyleAssetStatus; label: string }> = [
    { value: "draft", label: translate("canvasTools.styleAssetBindingModal.toVerify") },
    { value: "validated", label: translate("account.settings.profile.verifiedStatus") },
    { value: "unavailable", label: translate("canvasTools.styleAssetBindingModal.unavailable") },
];

const policyOptions: Array<{ value: NonNullable<StyleProfileSnapshot["executionPolicy"]>; label: string }> = [
    { value: "compatible-fallback", label: translate("canvasTools.styleAssetBindingModal.compatibleFallback") },
    { value: "strict-assets", label: translate("canvasTools.styleAssetBindingModal.blockStrictly") },
];

const emptyAsset = (): StyleAssetBinding => ({
    id: nanoid(),
    kind: "lora",
    provider: "liblib",
    title: "",
    enabled: false,
    weight: 0.8,
    status: "draft",
});

type StyleAssetBindingModalProps = {
    open: boolean;
    profile: StyleProfileSnapshot | null;
    onClose: () => void;
    onApply: (profile: StyleProfileSnapshot) => void;
};

export function StyleAssetBindingModal({ open, profile, onClose, onApply }: StyleAssetBindingModalProps) {
    const [draft, setDraft] = useState<StyleProfileSnapshot | null>(profile);
    const [editingId, setEditingId] = useState("");

    useEffect(() => {
        if (!open) return;
        setDraft(profile ? createStyleProfileSnapshot(profile) : null);
        setEditingId(profile?.assets[0]?.id || "");
    }, [open, profile]);

    const editing = useMemo(() => draft?.assets.find((asset) => asset.id === editingId), [draft, editingId]);
    const issues = useMemo(() => draft?.assets.map((asset) => ({ id: asset.id, message: styleAssetValidationMessage(asset) })).filter((issue) => issue.message) || [], [draft]);
    if (!draft) return null;

    const updateAsset = (patch: Partial<StyleAssetBinding>) => {
        setDraft((current) => current ? { ...current, assets: current.assets.map((asset) => asset.id === editingId ? { ...asset, ...patch } : asset) } : current);
    };
    const addAsset = () => {
        const asset = emptyAsset();
        setDraft((current) => current ? { ...current, assets: [...current.assets, asset] } : current);
        setEditingId(asset.id);
    };
    const deleteAsset = (id: string) => {
        setDraft((current) => current ? { ...current, assets: current.assets.filter((asset) => asset.id !== id) } : current);
        setEditingId((current) => current === id ? draft.assets.find((asset) => asset.id !== id)?.id || "" : current);
    };

    return (
        <AppModal
            rootClassName="style-asset-binding-modal"
            open={open}
            title={null}
            footer={null}
            centered
            width="min(980px, calc(100vw - 24px))"
            onCancel={onClose}
            flush
        >
            <div className="flex max-h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
                <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 pr-12 sm:items-center sm:px-5">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{translate("canvasTools.styleAssetBindingModal.styleExecutionAssets")}</h2>
                        <p className="mt-0.5 text-[var(--fs-label)] text-foreground/45">{translate("canvasTools.styleAssetBindingModal.bindModelAssetsCompatibilityRangeExecutionParametersAndALicense")}</p>
                    </div>
                    <Button className="shrink-0" icon={<Plus className="size-3.5" />} disabled={draft.assets.length >= MAX_STYLE_ASSETS} title={draft.assets.length >= MAX_STYLE_ASSETS ? translate("canvasTools.styleAssetBindingModal.linkUpToAssets", { v0: String(MAX_STYLE_ASSETS) }) : undefined} onClick={addAsset}>{translate("canvasTools.styleAssetBindingModal.addAsset")}</Button>
                </header>

                <div className="grid min-h-0 flex-1 md:grid-cols-3">
                    <aside className="thin-scrollbar max-h-52 min-h-0 overflow-y-auto border-b border-border md:col-span-1 md:max-h-none md:border-b-0 md:border-r">
                        <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
                            <label className="flex items-center justify-between gap-3 text-xs">
                                <span className="min-w-0">
                                    <span className="block font-medium">{translate("canvasTools.styleAssetBindingModal.executionStrategy")}</span>
                                    <span className="mt-0.5 block text-[var(--fs-tiny)] text-foreground/42">{translate("canvasTools.styleAssetBindingModal.howToHandleIncompatibleOrUnverifiedAssets")}</span>
                                </span>
                                <Select<NonNullable<StyleProfileSnapshot["executionPolicy"]>>
                                    className="shrink-0"
                                    size="small"
                                    value={draft.executionPolicy || "compatible-fallback"}
                                    options={policyOptions}
                                    onChange={(executionPolicy) => setDraft({ ...draft, executionPolicy })}
                                />
                            </label>
                        </div>

                        {draft.assets.length ? (
                            <div className="divide-y divide-border">
                                {draft.assets.map((asset) => {
                                    const issue = styleAssetValidationMessage(asset);
                                    return (
                                        <button
                                            key={asset.id}
                                            type="button"
                                            className={`flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset ${editingId === asset.id ? "bg-foreground/10" : "hover:bg-foreground/5"}`}
                                            onClick={() => setEditingId(asset.id)}
                                        >
                                            <AssetKindIcon kind={asset.kind} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-xs font-medium">{asset.title || translate("canvasTools.styleAssetBindingModal.untitledAsset")}</span>
                                                <span className="mt-1 block truncate text-[var(--fs-tiny)] text-foreground/42">{assetKindLabel(asset.kind)} · {assetStatusLabel(asset.status)}</span>
                                            </span>
                                            <span className={`mt-1 size-1.5 shrink-0 rounded-full ${issue ? "bg-red-500" : asset.enabled ? asset.status === "validated" ? "bg-emerald-500" : "bg-amber-500" : "bg-foreground/20"}`} />
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyAssetList />
                        )}
                    </aside>

                    <main className="thin-scrollbar min-h-0 overflow-y-auto p-4 sm:p-5 md:col-span-2">
                        {editing ? (
                            <AssetEditor asset={editing} onChange={updateAsset} onDelete={() => deleteAsset(editing.id)} />
                        ) : (
                            <div className="grid min-h-72 place-items-center text-center">
                                <div><Plus className="mx-auto size-5 text-foreground/25" /><p className="mt-2 text-xs text-foreground/50">{translate("canvasTools.styleAssetBindingModal.addOrChooseAnExecutionAsset")}</p></div>
                            </div>
                        )}
                    </main>
                </div>

                <footer className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex min-w-0 items-start gap-2 text-[var(--fs-tiny)] text-foreground/45">
                        {issues.length ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" /> : <Check className="mt-0.5 size-3.5 shrink-0" />}
                        <span className="min-w-0 leading-5">{issues.length ? translate("canvasTools.styleAssetBindingModal.assetsNeedAttention", { v0: String(issues.length), v1: String(issues[0].message) }) : translate("canvasTools.styleAssetBindingModal.assetsEnabled", { v0: String(draft.assets.length), v1: String(draft.assets.filter((asset) => asset.enabled).length) })}</span>
                    </div>
                    <div className="flex shrink-0 justify-end gap-2">
                        <Button onClick={onClose}>{translate("common.cancel")}</Button>
                        <Button
                            type="primary"
                            icon={<Save className="size-3.5" />}
                            disabled={issues.length > 0}
                            onClick={() => onApply(createStyleProfileSnapshot({ ...draft, source: "user", revision: draft.revision + 1 }))}
                        >
                            {translate("canvasTools.styleAssetBindingModal.applySettings")}
                        </Button>
                    </div>
                </footer>
            </div>
        </AppModal>
    );
}

function AssetEditor({ asset, onChange, onDelete }: { asset: StyleAssetBinding; onChange: (patch: Partial<StyleAssetBinding>) => void; onDelete: () => void }) {
    const validationMessage = styleAssetValidationMessage(asset);
    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                    <h3 className="text-sm font-semibold">{translate("canvasTools.styleAssetBindingModal.assetSettings")}</h3>
                    <p className="mt-1 text-[var(--fs-label)] text-foreground/45">{translate("canvasTools.styleAssetBindingModal.onlyVerifiedAndEnabledAssetsEnterTheExecutionPlan")}</p>
                </div>
                <Button danger type="text" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>{translate("common.delete")}</Button>
            </div>

            {validationMessage ? (
                <div className="flex gap-2 rounded-md bg-red-500/8 px-3 py-2 text-[var(--fs-label)] leading-5 text-foreground/65">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
                    <span>{validationMessage}</span>
                </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={translate("canvasTools.styleAssetBindingModal.assetType")}>
                    <Select<StyleAssetKind> value={asset.kind} options={kindOptions} onChange={(kind) => onChange({ kind })} />
                </Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.enabled")}>
                    <div className="flex h-8 items-center justify-between border-b border-border">
                        <span className="text-xs text-foreground/55">{translate("canvasTools.styleAssetBindingModal.includeInTheExecutionPlan")}</span>
                        <Switch size="sm" checked={asset.enabled !== false} onChange={(enabled) => onChange({ enabled })} />
                    </div>
                </Field>
                <Field label={translate("canvasA.assetView.nameLabel")}>
                    <Input value={asset.title} placeholder={translate("canvasTools.styleAssetBindingModal.forExampleEasternFantasyWuxiaXianxia")} onChange={(event) => onChange({ title: event.target.value })} />
                </Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.verificationStatus")}>
                    <Select<StyleAssetStatus> value={asset.status} options={statusOptions} onChange={(status) => onChange({ status })} />
                </Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.sourcePlatformAdapter")}>
                    <Input value={asset.provider} placeholder={translate("canvasTools.styleAssetBindingModal.liblibComfyuiOrACustomAdapter")} onChange={(event) => onChange({ provider: event.target.value })} />
                </Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.sourceAssetID")}>
                    <Input value={asset.sourceId} placeholder={translate("canvasTools.styleAssetBindingModal.modelUUIDOrTemplateID")} onChange={(event) => onChange({ sourceId: event.target.value })} />
                </Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.sourcePageURL")} className="sm:col-span-2">
                    <Input value={asset.sourceUrl} placeholder={translate("canvasTools.styleAssetBindingModal.recordsWhereTheAssetCameFromNoGenerationRequestIs")} onChange={(event) => onChange({ sourceUrl: event.target.value })} />
                </Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.assetModelIdentifier")}>
                    <Input value={asset.model} placeholder={translate("canvasTools.styleAssetBindingModal.forExampleALiblibModelName")} onChange={(event) => onChange({ model: event.target.value })} />
                </Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.modelVersion")}>
                    <Input value={asset.version} placeholder={translate("canvasTools.styleAssetBindingModal.versionUUIDOrNumber")} onChange={(event) => onChange({ version: event.target.value })} />
                </Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.compatibleBaseModels")} className="sm:col-span-2">
                    <Select<string[]> mode="tags" value={asset.baseModels || []} tokenSeparators={[","]} placeholder={translate("canvasTools.styleAssetBindingModal.enterTheActualModelNameAndPressEnter")} onChange={(baseModels) => onChange({ baseModels })} />
                </Field>
            </div>

            {asset.kind === "lora" ? <LoraFields asset={asset} onChange={onChange} /> : null}
            {asset.kind === "reference" ? <ReferenceFields asset={asset} onChange={onChange} /> : null}
            {asset.kind === "prompt" || asset.kind === "template" ? <PromptFields asset={asset} onChange={onChange} /> : null}

            <GenerationParameterFields asset={asset} onChange={onChange} />
            <LicenseFields asset={asset} onChange={onChange} />

            {asset.enabled !== false && (asset.kind === "lora" || asset.kind === "reference") ? (
                <div className="flex gap-2 rounded-md bg-amber-500/8 px-3 py-2 text-[var(--fs-label)] leading-5 text-foreground/60">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    <span>{translate("canvasTools.inline.styleAssetBindingModal.theGenericGenerationProtocolHasNotEnabledTheAdapterThe", { v0: String(asset.kind === "lora" ? " LoRA" : translate("canvasTools.styleAssetBindingModal.referenceSetAutoInjection")) })}</span>
                </div>
            ) : null}
        </div>
    );
}

function LoraFields({ asset, onChange }: AssetFieldProps) {
    return (
        <section className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <Field label={translate("canvasTools.styleAssetBindingModal.loRAWeight")}>
                <InputNumber className="w-full" min={0} max={2} step={0.05} value={asset.weight} onChange={(weight) => onChange({ weight: weight ?? undefined })} />
            </Field>
            <Field label={translate("canvasTools.styleAssetBindingModal.triggerWords")}>
                <Select<string[]> mode="tags" value={asset.triggerWords || []} tokenSeparators={[","]} placeholder={translate("library.assets.batch.tagsPlaceholder")} onChange={(triggerWords) => onChange({ triggerWords })} />
            </Field>
        </section>
    );
}

function ReferenceFields({ asset, onChange }: AssetFieldProps) {
    return (
        <section className="grid gap-4 border-t border-border pt-4">
            <Field label={translate("canvasTools.styleAssetBindingModal.referenceImageURL")}>
                <Select<string[]> mode="tags" value={asset.referenceUrls || []} tokenSeparators={[","]} placeholder={translate("canvasTools.styleAssetBindingModal.enterAReachableReferenceImageURLAndPressEnter")} onChange={(referenceUrls) => onChange({ referenceUrls })} />
            </Field>
            <Field label={translate("canvasTools.styleAssetBindingModal.projectResourceID")}>
                <Select<string[]> mode="tags" value={asset.referenceResourceIds || []} tokenSeparators={[","]} placeholder={translate("canvasTools.styleAssetBindingModal.enterAnUploadedResourceIDAndPressEnter")} onChange={(referenceResourceIds) => onChange({ referenceResourceIds })} />
            </Field>
        </section>
    );
}

function PromptFields({ asset, onChange }: AssetFieldProps) {
    return (
        <section className="border-t border-border pt-4">
            <Field label={translate("canvasTools.styleAssetBindingModal.promptModule")}>
                <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} value={asset.promptFragment} placeholder={translate("canvasTools.styleAssetBindingModal.onlyAddTheStableVisualRequirementsThisAssetNeeds")} onChange={(event) => onChange({ promptFragment: event.target.value })} />
            </Field>
        </section>
    );
}

function GenerationParameterFields({ asset, onChange }: AssetFieldProps) {
    const parameters = asset.parameters || {};
    const updateParameters = (patch: NonNullable<StyleAssetBinding["parameters"]>) => onChange({ parameters: { ...parameters, ...patch } });
    return (
        <section className="border-t border-border pt-4">
            <h4 className="mb-3 text-xs font-semibold">{translate("canvasTools.styleAssetBindingModal.suggestedGenerationSettings")}</h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Sampler"><Input value={parameters.sampler} placeholder={translate("account.settings.diagnostics.optional")} onChange={(event) => updateParameters({ sampler: event.target.value })} /></Field>
                <Field label="Steps"><InputNumber className="w-full" min={1} max={200} value={parameters.steps} onChange={(steps) => updateParameters({ steps: steps ?? undefined })} /></Field>
                <Field label="CFG"><InputNumber className="w-full" min={0} max={50} step={0.5} value={parameters.cfg} onChange={(cfg) => updateParameters({ cfg: cfg ?? undefined })} /></Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.suggestedSize")}><Input value={parameters.size} placeholder={translate("canvasTools.styleAssetBindingModal.forExample1024x1536")} onChange={(event) => updateParameters({ size: event.target.value })} /></Field>
            </div>
        </section>
    );
}

function LicenseFields({ asset, onChange }: AssetFieldProps) {
    return (
        <section className="border-t border-border pt-4">
            <h4 className="mb-3 text-xs font-semibold">{translate("canvasTools.styleAssetBindingModal.licenseSnapshot")}</h4>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={translate("canvasTools.styleAssetBindingModal.commercialUse")}>
                    <Select
                        value={asset.license?.commercial === true ? "yes" : asset.license?.commercial === false ? "no" : "unknown"}
                        options={[{ value: "unknown", label: translate("canvasTools.styleAssetBindingModal.notConfirmed") }, { value: "yes", label: translate("canvasTools.styleAssetBindingModal.commercialUseAllowed") }, { value: "no", label: translate("canvasTools.styleAssetBindingModal.noCommercialUse") }]}
                        onChange={(value: "unknown" | "yes" | "no") => onChange({ license: { ...asset.license, commercial: value === "unknown" ? undefined : value === "yes" } })}
                    />
                </Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.licenseSource")}><Input value={asset.license?.source} placeholder={translate("canvasTools.styleAssetBindingModal.licensePageOrAgreementVersion")} onChange={(event) => onChange({ license: { ...asset.license, source: event.target.value } })} /></Field>
                <Field label={translate("canvasTools.styleAssetBindingModal.licenseNotes")} className="sm:col-span-2"><Input value={asset.license?.note} placeholder={translate("canvasTools.styleAssetBindingModal.noteMembershipAttributionOrResaleRestrictions")} onChange={(event) => onChange({ license: { ...asset.license, note: event.target.value } })} /></Field>
            </div>
        </section>
    );
}

type AssetFieldProps = {
    asset: StyleAssetBinding;
    onChange: (patch: Partial<StyleAssetBinding>) => void;
};

function AssetKindIcon({ kind }: { kind: StyleAssetKind }) {
    return (
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded bg-foreground/5 text-foreground/55">
            {kind === "lora" ? <SlidersHorizontal className="size-3.5" /> : kind === "reference" ? <FileImage className="size-3.5" /> : kind === "template" ? <Box className="size-3.5" /> : <Link2 className="size-3.5" />}
        </span>
    );
}

function EmptyAssetList() {
    return (
        <div className="grid min-h-52 place-items-center px-6 text-center">
            <div><Box className="mx-auto size-5 text-foreground/25" /><p className="mt-2 text-xs font-medium">{translate("canvasTools.styleAssetBindingModal.noExecutionAssetsBound")}</p><p className="mt-1 text-[var(--fs-tiny)] leading-5 text-foreground/42">{translate("canvasTools.styleAssetBindingModal.thisStyleRunsThroughTheProjectPromptOnly")}</p></div>
        </div>
    );
}

function assetKindLabel(kind: StyleAssetKind) {
    return kindOptions.find((item) => item.value === kind)?.label || kind;
}

function assetStatusLabel(status: StyleAssetStatus) {
    return statusOptions.find((item) => item.value === status)?.label || status;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
    return <label className={`grid gap-2 text-xs ${className}`}><span className="font-medium text-foreground/60">{label}</span>{children}</label>;
}
