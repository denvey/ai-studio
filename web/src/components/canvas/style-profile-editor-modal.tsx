import { useEffect, useMemo, useState, type ReactNode } from "react";
import { App, Button, Input, Segmented } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Braces, Image, Layers3, Save, Check, Palette } from "lucide-react";

import { StyleAssetBindingModal } from "@/components/canvas/style-asset-binding-modal";
import { createStyleProfileSnapshot, styleProfileValidationMessage, type StyleProfileSnapshot } from "@/lib/canvas/style-profile";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

type EditorSection = "identity" | "prompt" | "execution";

type StyleProfileEditorModalProps = {
    open: boolean;
    initialProfile: StyleProfileSnapshot | null;
    saving?: boolean;
    onClose: () => void;
    onSave: (profile: StyleProfileSnapshot, applyToProject: boolean) => void;
};

export function StyleProfileEditorModal({ open, initialProfile, saving = false, onClose, onSave }: StyleProfileEditorModalProps) {
    const { message, modal } = App.useApp();
    const [section, setSection] = useState<EditorSection>("identity");
    const [draft, setDraft] = useState<StyleProfileSnapshot | null>(initialProfile);
    const [baseline, setBaseline] = useState("");
    const [assetsOpen, setAssetsOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const next = initialProfile ? createStyleProfileSnapshot(initialProfile) : null;
        setDraft(next);
        setBaseline(next ? JSON.stringify(next) : "");
        setSection("identity");
        setAssetsOpen(false);
    }, [initialProfile, open]);

    const validationMessage = useMemo(() => draft ? styleProfileValidationMessage(draft) : translate("canvasTools.styleProfileEditorModal.theStyleDraftDoesNotExist"), [draft]);
    if (!draft) return null;

    const update = (patch: Partial<StyleProfileSnapshot>) => setDraft((current) => current ? { ...current, ...patch } : current);
    const requestClose = () => {
        if (JSON.stringify(draft) === baseline) {
            onClose();
            return;
        }
        modal.confirm({ title: translate("canvasTools.styleProfileEditorModal.discardUnsavedStyleChanges"), content: translate("canvasTools.styleProfileEditorModal.changesToTheNamePromptCoverAndExecutionSettingsWill"), okText: translate("canvasTools.styleProfileEditorModal.discardChanges"), cancelText: translate("account.settings.prompts.switchCancel"), okButtonProps: { danger: true }, onOk: onClose });
    };
    const submit = (applyToProject: boolean) => {
        if (validationMessage) {
            message.error(validationMessage);
            return;
        }
        onSave(createStyleProfileSnapshot({ ...draft, source: "user" }), applyToProject);
    };

    return (
        <>
            <AppModal
                rootClassName="style-profile-editor-modal"
                open={open}
                title={null}
                footer={null}
                centered
                width="min(1120px, calc(100vw - 24px))"
                onCancel={requestClose}
                flush
            >
                <div className="flex max-h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
                    <header className="flex min-h-16 items-center border-b border-border px-4 pr-12 sm:px-5 sm:pr-14">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-foreground/5"><Palette className="size-3.5" /></span>
                                <div>
                                    <h2 className="text-sm font-semibold">{translate("canvasTools.styleProfileEditorModal.styleEditor")}</h2>
                                    <p className="mt-0.5 truncate text-[var(--fs-tiny)] text-foreground/45">{translate("canvasTools.inline.styleProfileEditorModal.myStyles", { v0: String(draft.title || translate("canvasTools.styleProfileEditorModal.untitledStyle")) })}</p>
                                </div>
                            </div>
                        </div>
                    </header>

                    <nav className="style-profile-editor-tabs grid shrink-0 grid-cols-3 border-b border-border px-2 sm:flex sm:px-4" role="tablist" aria-label={translate("canvasTools.styleProfileEditorModal.styleEditorSections")}>
                        <EditorTab id="style-profile-tab-identity" panelId="style-profile-panel-identity" active={section === "identity"} icon={<Image className="size-3.5" />} label={translate("account.settings.modelConfig.tabBasic")} onClick={() => setSection("identity")} />
                        <EditorTab id="style-profile-tab-prompt" panelId="style-profile-panel-prompt" active={section === "prompt"} icon={<Braces className="size-3.5" />} label={translate("canvasTools.styleProfileEditorModal.promptRules")} onClick={() => setSection("prompt")} />
                        <EditorTab id="style-profile-tab-execution" panelId="style-profile-panel-execution" active={section === "execution"} icon={<Layers3 className="size-3.5" />} label={translate("canvasTools.styleProfileEditorModal.executionSettings")} onClick={() => setSection("execution")} />
                    </nav>

                    <div className="style-profile-editor-workspace grid min-h-0 flex-1 lg:grid-cols-3">
                        <StylePreview profile={draft} />
                        <main id={`style-profile-panel-${section}`} className="thin-scrollbar min-h-0 overflow-y-auto p-4 sm:p-5 lg:col-span-2" role="tabpanel" aria-labelledby={`style-profile-tab-${section}`}>
                            {section === "identity" ? <IdentityFields profile={draft} onChange={update} /> : null}
                            {section === "prompt" ? <PromptFields profile={draft} onChange={update} /> : null}
                            {section === "execution" ? <ExecutionFields profile={draft} onChange={update} onEditAssets={() => setAssetsOpen(true)} /> : null}
                        </main>
                    </div>

                    <footer className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <p className={`text-[var(--fs-tiny)] ${validationMessage ? "text-red-500" : "text-foreground/45"}`}>{validationMessage || translate("canvasTools.styleProfileEditorModal.savedIntoMyStylesApplyingItCopiesTheCurrentVersion")}</p>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                            <Button onClick={requestClose}>{translate("common.cancel")}</Button>
                            <Button icon={<Save className="size-3.5" />} disabled={Boolean(validationMessage)} loading={saving} onClick={() => submit(false)}>{translate("canvasTools.styleProfileEditorModal.saveToMyStyles")}</Button>
                            <Button type="primary" icon={<Check className="size-3.5" />} disabled={Boolean(validationMessage)} loading={saving} onClick={() => submit(true)}>{translate("canvasTools.styleProfileEditorModal.saveAndApply")}</Button>
                        </div>
                    </footer>
                </div>
            </AppModal>
            <StyleAssetBindingModal
                open={assetsOpen}
                profile={draft}
                onClose={() => setAssetsOpen(false)}
                onApply={(profile) => {
                    setDraft(profile);
                    setAssetsOpen(false);
                }}
            />
        </>
    );
}

function StylePreview({ profile }: { profile: StyleProfileSnapshot }) {
    return (
        <aside className="style-profile-editor-preview thin-scrollbar min-h-0 overflow-y-auto border-b border-border bg-foreground/5 lg:border-b-0 lg:border-r">
            <div className="relative aspect-video overflow-hidden border-b border-border bg-foreground/5">
                {profile.coverUrl ? <img src={profile.coverUrl} alt={translate("canvasTools.styleProfileEditorModal.cover", { v0: String(profile.title || translate("canvasTools.styleProfileEditorModal.untitledStyle")) })} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-foreground/25"><Image className="size-7" /></div>}
                <span className="absolute bottom-3 left-3 rounded bg-background/85 px-2 py-1 text-[var(--fs-tiny)] font-medium backdrop-blur">{translate("canvasTools.styleProfileEditorModal.myStyles2")}</span>
            </div>
            <div className="p-4 sm:p-5">
                <h3 className="text-base font-semibold">{profile.title || translate("canvasTools.styleProfileEditorModal.untitledStyle")}</h3>
                <p className="mt-2 text-xs leading-5 text-foreground/48">{profile.description || translate("canvasTools.styleProfileEditorModal.addASummarySoTheStyleLibraryShowsWhatIt")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {profile.tags.length ? profile.tags.map((tag) => <span key={tag} className="rounded bg-foreground/10 px-2 py-1 text-[var(--fs-tiny)] text-foreground/58">{tag}</span>) : <span className="text-[var(--fs-tiny)] text-foreground/35">{translate("canvasTools.styleProfileEditorModal.noTags")}</span>}
                </div>
                <dl className="mt-5 grid grid-cols-2 border-y border-border py-3 text-[var(--fs-tiny)]">
                    <Metric label="Prompt" value={translate("canvasTools.styleProfileEditorModal.characters", { v0: String(profile.prompt.length) })} />
                    <Metric label={translate("canvasTools.styleProfileEditorModal.negativeConstraints")} value={translate("canvasTools.styleProfileEditorModal.characters", { v0: String(profile.negativePrompt?.length || 0) })} />
                    <Metric label={translate("canvasTools.styleProfileEditorModal.executionAssets")} value={translate("canvasTools.counts.items", { v0: String(profile.assets.length) })} />
                    <Metric label={translate("canvasTools.styleProfileEditorModal.strategy")} value={profile.executionPolicy === "strict-assets" ? translate("canvasTools.styleProfileEditorModal.blockStrictly") : translate("canvasTools.styleProfileEditorModal.compatibleFallback")} />
                </dl>
            </div>
        </aside>
    );
}

function IdentityFields({ profile, onChange }: EditorFieldsProps) {
    const selection = profile.selection || {};
    const setSelection = (key: string, value: string) => onChange({ selection: { ...selection, [key]: value } });
    return (
        <div className="space-y-5">
            <SectionHeading title={translate("canvasTools.styleProfileEditorModal.styleIdentity")} description={translate("canvasTools.styleProfileEditorModal.theNameCoverAndTagsAppearInMyStyles")} />
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={translate("canvasTools.styleProfileEditorModal.styleName")} className="sm:col-span-2"><Input maxLength={80} showCount value={profile.title} placeholder={translate("canvasTools.styleProfileEditorModal.forExampleEasternFolkloreFineLineDarkPalette")} onChange={(event) => onChange({ title: event.target.value })} /></Field>
                <Field label={translate("canvasTools.styleProfileEditorModal.styleSummary")} className="sm:col-span-2"><Input.TextArea maxLength={500} showCount autoSize={{ minRows: 3, maxRows: 6 }} value={profile.description} placeholder={translate("canvasTools.styleProfileEditorModal.explainTheGenresItSuitsItsVisualCharacterAndWhat")} onChange={(event) => onChange({ description: event.target.value })} /></Field>
                <Field label={translate("canvasTools.styleProfileEditorModal.coverImageURL")} className="sm:col-span-2"><Input value={profile.coverUrl} placeholder={translate("canvasTools.styleProfileEditorModal.enterAProjectResourceURLOrAnyReachableImageURL")} onChange={(event) => onChange({ coverUrl: event.target.value })} /></Field>
                <Field label={translate("library.assets.form.tags")} className="sm:col-span-2"><Select mode="tags" maxCount={20} tokenSeparators={[",", "，"]} value={profile.tags} placeholder={translate("canvasTools.styleProfileEditorModal.enterAGenreMediumColorOrTextureAndPressEnter")} onChange={(tags) => onChange({ tags })} /></Field>
            </div>
            <SectionHeading title={translate("canvasTools.styleProfileEditorModal.annotations")} description={translate("canvasTools.styleProfileEditorModal.theseFieldsHelpWithSearchAndUnderstandingTheyDoNot")} />
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={translate("canvasTools.styleProfileEditorModal.genreAndWorld")}><Input value={selection.world || ""} placeholder={translate("canvasTools.styleProfileEditorModal.xianxiaUrbanMystery")} onChange={(event) => setSelection("world", event.target.value)} /></Field>
                <Field label={translate("canvasTools.styleProfileEditorModal.visualMedium")}><Input value={selection.medium || ""} placeholder={translate("canvasTools.styleProfileEditorModal.liveAction2DInkWash")} onChange={(event) => setSelection("medium", event.target.value)} /></Field>
                <Field label={translate("canvasTools.styleProfileEditorModal.narrativeTone")}><Input value={selection.tone || ""} placeholder={translate("canvasTools.styleProfileEditorModal.epicRestrainedLightComedy")} onChange={(event) => setSelection("tone", event.target.value)} /></Field>
                <Field label={translate("canvasTools.styleProfileEditorModal.characterLook")}><Input value={selection.character || ""} placeholder={translate("canvasTools.styleProfileEditorModal.realisticSemiRealisticStylized")} onChange={(event) => setSelection("character", event.target.value)} /></Field>
            </div>
        </div>
    );
}

function PromptFields({ profile, onChange }: EditorFieldsProps) {
    return (
        <div className="space-y-5">
            <SectionHeading title={translate("canvasTools.styleProfileEditorModal.fullStylePrompt")} description={translate("canvasTools.styleProfileEditorModal.definesTheProjectSLongTermArtSystemDirectlyNo")} />
            <Field label={translate("canvasTools.styleProfileEditorModal.positivePrompt")}>
                <Input.TextArea value={profile.prompt} autoSize={{ minRows: 16, maxRows: 28 }} placeholder={translate("canvasTools.styleProfileEditorModal.describeTheVisualMediumCharacterDesignColorMaterialsArchitectureImaging")} onChange={(event) => onChange({ prompt: event.target.value })} />
            </Field>
            <Field label={translate("canvasTools.styleProfileEditorModal.suggestedNegativePrompt")}>
                <Input.TextArea value={profile.negativePrompt} autoSize={{ minRows: 6, maxRows: 14 }} placeholder={translate("canvasTools.styleProfileEditorModal.listWhatTheWholeProjectMustAvoidMediumDriftCharacter")} onChange={(event) => onChange({ negativePrompt: event.target.value })} />
            </Field>
        </div>
    );
}

function ExecutionFields({ profile, onChange, onEditAssets }: EditorFieldsProps & { onEditAssets: () => void }) {
    const enabled = profile.assets.filter((asset) => asset.enabled !== false);
    return (
        <div className="space-y-5">
            <SectionHeading title={translate("canvasTools.styleProfileEditorModal.generationExecution")} description={translate("canvasTools.styleProfileEditorModal.controlsWhetherAnIncompatibleModelAssetFallsBackToThe")} />
            <Field label={translate("canvasTools.styleProfileEditorModal.executionStrategy")}>
                <Segmented
                    block
                    value={profile.executionPolicy || "compatible-fallback"}
                    options={[{ value: "compatible-fallback", label: translate("canvasTools.styleProfileEditorModal.compatibleFallback") }, { value: "strict-assets", label: translate("canvasTools.styleProfileEditorModal.blockStrictly") }]}
                    onChange={(executionPolicy) => onChange({ executionPolicy: executionPolicy as StyleProfileSnapshot["executionPolicy"] })}
                />
            </Field>
            <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h4 className="text-sm font-medium">{translate("canvasTools.styleProfileEditorModal.executionAssets")}</h4>
                    <p className="mt-1 text-[var(--fs-label)] text-foreground/45">{translate("canvasTools.inline.styleProfileEditorModal.boundEnabled", { v0: String(profile.assets.length), v1: String(enabled.length) })}</p>
                </div>
                <Button icon={<Layers3 className="size-3.5" />} onClick={onEditAssets}>{translate("canvasTools.styleProfileEditorModal.configureLoRAsTemplatesAndReferenceImages")}</Button>
            </div>
            {profile.assets.length ? <div className="divide-y divide-border border-b border-border">{profile.assets.map((asset) => <div key={asset.id} className="flex items-center gap-3 py-3 text-xs"><span className={`size-1.5 shrink-0 rounded-full ${asset.enabled !== false && asset.status === "validated" ? "bg-emerald-500" : asset.status === "unavailable" ? "bg-red-500" : "bg-amber-500"}`} /><span className="min-w-0 flex-1 truncate font-medium">{asset.title}</span><span className="shrink-0 text-foreground/40">{asset.kind.toUpperCase()} · {asset.status === "validated" ? translate("account.settings.profile.verifiedStatus") : asset.status === "unavailable" ? translate("canvasTools.styleProfileEditorModal.unavailable") : translate("canvasTools.styleProfileEditorModal.toVerify")}</span></div>)}</div> : <div className="grid min-h-36 place-items-center border-b border-border text-center text-xs text-foreground/38">{translate("canvasTools.styleProfileEditorModal.noExecutionAssetsBoundThisStyleWillRunThroughThe")}</div>}
            <p className="text-[var(--fs-tiny)] leading-5 text-foreground/42">{translate("canvasTools.styleProfileEditorModal.loRAsAndReferenceSetsSupportBindingVerificationAndCompatibilityChecks")}</p>
        </div>
    );
}

type EditorFieldsProps = { profile: StyleProfileSnapshot; onChange: (patch: Partial<StyleProfileSnapshot>) => void };

function SectionHeading({ title, description }: { title: string; description: string }) {
    return <div className="border-b border-border pb-3"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-[var(--fs-label)] text-foreground/45">{description}</p></div>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
    return <label className={`grid gap-2 text-xs ${className}`}><span className="font-medium text-foreground/62">{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
    return <div className="min-w-0 py-1"><dt className="text-foreground/38">{label}</dt><dd className="mt-0.5 truncate font-medium text-foreground/65">{value}</dd></div>;
}

function EditorTab({ id, panelId, active, icon, label, onClick }: { id: string; panelId: string; active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            id={id}
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            className={`style-profile-editor-tab relative flex h-11 min-w-0 items-center justify-center gap-2 px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset sm:justify-start ${active ? "is-active text-foreground" : "text-foreground/45 hover:text-foreground/75"}`}
            onClick={onClick}
        >
            {icon}
            <span className="truncate">{label}</span>
        </button>
    );
}
