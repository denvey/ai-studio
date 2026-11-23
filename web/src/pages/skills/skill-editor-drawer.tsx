import { App, Button, Form, Input } from "antd";
import { AppDrawer } from "@/components/ui/product/app-drawer";
import { Select } from "@/components/ui/base/select";
import { Switch } from "@/components/ui/base/switch";
import { Minus, Plus, Save, PenLine } from "lucide-react";
import { useEffect, useState } from "react";

import { fallbackSkillCategories } from "@/pages/skills/skill-catalog";
import { generateSkillDraft } from "@/lib/canvas/skill-drafting";
import { navigateToSettings } from "@/lib/settings-navigation";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { createSkill, updateSkill, type Skill, type SkillMutationInput, type SkillShowcaseMedia } from "@/services/api/skills";
import { translate } from "@/i18n";


type SkillFormValues = Omit<SkillMutationInput, "isPrivate"> & { is_public: boolean };

/** 后台基本信息：不含正文和公开状态。 */
export type SkillInfoInput = Omit<SkillMutationInput, "instruction" | "isPrivate">;

const HTTP_URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

/**
 * admin 存在时为后台模式：只改基本信息（不显示正文、公开状态和 AI 起草），保存走管理员接口。
 * 正文与附属文件统一在技能工作台修改。
 */
export function SkillEditorDrawer({
    open,
    skill,
    onClose,
    onSaved,
    admin,
}: {
    open: boolean;
    skill: Skill | null;
    onClose: () => void;
    onSaved: (skill: Skill) => void;
    admin?: { save: (skillId: string, input: SkillInfoInput) => Promise<{ skill: Skill }> };
}) {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<SkillFormValues>();
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [draftIdea, setDraftIdea] = useState("");
    const [drafting, setDrafting] = useState(false);
    const effectiveConfig = useEffectiveConfig();
    const isPackageSkill = Boolean(skill && skill.sourceType !== "markdown" && skill.sourceType !== "builtin" && skill.sourceType !== "");
    const infoOnly = Boolean(admin);
    const initialMarkdownUrl = skill?.markdownUrl || skill?.sourceUrl || "";
    // 内置技能的 markdownUrl 是包内相对路径；后台未改动时原样保留，不按外链校验。
    const markdownUrlRules = admin
        ? [{ validator: (_: unknown, value?: string) => (!value || value === initialMarkdownUrl || HTTP_URL_PATTERN.test(value) ? Promise.resolve() : Promise.reject(new Error(translate("shared.skills.skillEditorDrawer.enterAValidHTTPSLink")))) }]
        : [{ type: "url" as const, message: translate("shared.skills.skillEditorDrawer.enterAValidHTTPSLink") }];

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            skillName: skill?.skillName || "",
            description: skill?.description || "",
            instruction: skill?.instruction || "",
            tag: skill?.tag || "creative",
            is_public: skill ? !skill.isPrivate : false,
            markdownUrl: skill?.markdownUrl || skill?.sourceUrl || "",
            showcaseMedia: skill?.showcaseMedia || [],
            extraInfo: skill?.extraInfo || "",
        });
        setDirty(false);
    }, [form, open, skill]);

    const requestClose = () => {
        if (!dirty) {
            onClose();
            return;
        }
        modal.confirm({ title: translate("shared.skills.skillEditorDrawer.discardUnsavedChanges"), content: translate("shared.skills.skillEditorDrawer.whatYouHaveEnteredWillNotBeKept"), okText: translate("shared.skills.skillEditorDrawer.discardChanges"), okButtonProps: { danger: true }, cancelText: translate("account.settings.prompts.switchCancel"), onOk: onClose });
    };

    const submit = async (values: SkillFormValues) => {
        setSaving(true);
        try {
            const input: SkillMutationInput = {
                skillName: values.skillName,
                description: values.description,
                instruction: values.instruction || "",
                tag: values.tag,
                isPrivate: !values.is_public,
                markdownUrl: values.markdownUrl || "",
                showcaseMedia: (values.showcaseMedia || []).map((item) => ({ ...item, showcaseUri: item.showcaseUri || "" })),
                extraInfo: values.extraInfo || "",
            };
            const result =
                admin && skill
                    ? await admin.save(skill.skillId, { skillName: input.skillName, description: input.description, tag: input.tag, markdownUrl: input.markdownUrl, showcaseMedia: input.showcaseMedia, extraInfo: input.extraInfo })
                    : skill
                      ? await updateSkill(skill.skillId, input)
                      : await createSkill(input);
            setDirty(false);
            message.success(skill ? translate("shared.skills.skillEditorDrawer.skillUpdated") : translate("shared.skills.skillEditorDrawer.skillCreated"));
            onSaved(result.skill);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.skills.skillEditorDrawer.failedToSaveSkill"));
        } finally {
            setSaving(false);
        }
    };

    const draftFromIdea = async () => {
        const idea = draftIdea.trim();
        if (!idea) {
            message.warning(translate("shared.skills.skillEditorDrawer.describeTheSkillYouWantToCaptureFirst"));
            return;
        }
        if (!useConfigStore.getState().isAiConfigReady(effectiveConfig, effectiveConfig.model)) {
            message.info(translate("shared.skills.skillEditorDrawer.noTextModelConfiguredAddOneInSettingsFirst"));
            navigateToSettings({ section: "models", continueCreation: true });
            return;
        }
        setDrafting(true);
        try {
            const draft = await generateSkillDraft(idea, effectiveConfig);
            form.setFieldsValue({
                skillName: draft.skillName || "",
                description: draft.description || "",
                instruction: draft.instruction || "",
                ...(draft.tag ? { tag: draft.tag } : {}),
            });
            setDirty(true);
            message.success(translate("shared.skills.skillEditorDrawer.draftGeneratedReviewAndAdjustItBeforeSaving"));
        } catch (error) {
            message.error(error instanceof Error ? translate("shared.skills.skillEditorDrawer.draftingFailed", { v0: String(error.message) }) : translate("shared.skills.skillEditorDrawer.draftingFailed2"));
        } finally {
            setDrafting(false);
        }
    };

    return (
        <AppDrawer
            className={admin ? "library-drawer admin-drawer-panel" : "library-drawer"}
            rootClassName={admin ? "admin-drawer" : undefined}
            open={open}
            size={720}
            mask={{ closable: !dirty }}
            title={admin ? translate("shared.skills.skillEditorDrawer.editSkillInformation") : skill ? translate("shared.skills.skillEditorDrawer.editSkill") : translate("shared.skills.skillEditorDrawer.createSkill")}
            onClose={requestClose}
            extra={
                <Button type="primary" loading={saving} icon={<Save className="size-4" />} onClick={() => form.submit()}>
                    {translate("shared.skills.skillEditorDrawer.saveSkill")}
                </Button>
            }
        >
            {infoOnly ? (
                <div className="mb-4 rounded-xl border bg-foreground/[.02] p-3 text-sm leading-6 text-foreground/58">{adminInfoNotice(skill)}</div>
            ) : !isPackageSkill ? (
                <div className="mb-4 rounded-xl border bg-foreground/[.02] p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <PenLine className="size-4" />
                        {translate("shared.skills.skillEditorDrawer.draftWithAI")}
                        <span className="font-normal text-foreground/45">{translate("shared.skills.skillEditorDrawer.describeYourIdeaToGenerateAnEditableDraftNameSummary")}</span>
                    </div>
                    <Input.TextArea
                        value={draftIdea}
                        onChange={(event) => setDraftIdea(event.target.value)}
                        autoSize={{ minRows: 3, maxRows: 6 }}
                        maxLength={2000}
                        showCount
                        disabled={drafting}
                        placeholder={translate("shared.skills.skillEditorDrawer.forExampleIWantAPortraitDramaStoryboardingSkillInput")}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground/45">{translate("shared.skills.skillEditorDrawer.yourTextModelWillBeUsedToGenerateOneDraft")}</span>
                        <Button type="primary" loading={drafting} disabled={!draftIdea.trim()} icon={<PenLine className="size-4" />} onClick={() => void draftFromIdea()}>
                            {translate("shared.skills.skillEditorDrawer.generateDraft")}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="mb-4 rounded-xl border bg-foreground/[.02] p-3 text-sm leading-6 text-foreground/58">
                    {translate("shared.skills.skillEditorDrawer.thisIsASkillPackageWithMultipleFilesEditOnly")}
                </div>
            )}
            <Form form={form} layout="vertical" requiredMark="optional" onFinish={submit} onValuesChange={() => setDirty(true)}>
                <div className="grid gap-x-4 sm:grid-cols-2">
                    <Form.Item
                        name="skillName"
                        label={translate("shared.skills.skillEditorDrawer.skillName")}
                        rules={[
                            { required: true, message: translate("shared.skills.skillEditorDrawer.enterASkillName") },
                            { max: 80, message: translate("shared.skills.skillEditorDrawer.upTo80Characters") },
                        ]}
                    >
                        <Input maxLength={80} showCount placeholder={translate("shared.skills.skillEditorDrawer.eGShortDramaDirectorStoryboard")} autoComplete="off" />
                    </Form.Item>
                    <Form.Item name="tag" label={translate("shared.skills.skillEditorDrawer.skillCategory")} rules={[{ required: true, message: translate("shared.skills.skillEditorDrawer.selectASkillCategory") }]}>
                        <Select options={fallbackSkillCategories.map(({ value, label }) => ({ value, label }))} />
                    </Form.Item>
                </div>

                <Form.Item
                    name="description"
                    label={translate("shared.skills.skillEditorDrawer.skillSummary")}
                    rules={[
                        { required: true, message: translate("shared.skills.skillEditorDrawer.enterASkillSummary") },
                        { max: 500, message: translate("shared.skills.skillEditorDrawer.upTo500Characters") },
                    ]}
                >
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={500} showCount placeholder={translate("shared.skills.skillEditorDrawer.describeWhenToUseItWhatItNeedsAndWhat")} />
                </Form.Item>

                {!isPackageSkill && !infoOnly ? (
                    <Form.Item
                        name="instruction"
                        label={translate("shared.skills.skillEditorDrawer.skillInstructions")}
                        rules={[
                            { required: true, message: translate("shared.skills.skillEditorDrawer.enterTheSkillInstructions") },
                            { max: 100000, message: translate("shared.skills.skillEditorDrawer.upTo100000Characters") },
                        ]}
                        extra={translate("shared.skills.skillEditorDrawer.singleFileSkillsAreInstalledAsSKILLMdAndRead")}
                    >
                        <Input.TextArea className="font-mono text-xs leading-5" autoSize={{ minRows: 14, maxRows: 28 }} maxLength={100000} showCount placeholder={translate("shared.skills.skillEditorDrawer.useMarkdownToWriteRolesConstraintsWorkflowsChecklistsAndOutput")} />
                    </Form.Item>
                ) : null}

                <div className={infoOnly ? "grid gap-x-4" : "grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_180px]"}>
                    <Form.Item name="markdownUrl" label={isPackageSkill ? translate("shared.skills.skillEditorDrawer.sourceURL") : translate("shared.skills.skillEditorDrawer.markdownURL")} rules={markdownUrlRules}>
                        <Input type="url" inputMode="url" spellCheck={false} placeholder="https://example.com/SKILL.md" />
                    </Form.Item>
                    {!infoOnly ? (
                        <Form.Item name="is_public" label={translate("shared.skills.skillEditorDrawer.visibility")} valuePropName="checked" extra={translate("shared.skills.skillEditorDrawer.oncePublicOtherUsersCanJoinAndUseIt")}>
                            <Switch checkedChildren={translate("shared.skills.skillDetailDrawer.public")} unCheckedChildren={translate("shared.skills.skillEditorDrawer.private")} />
                        </Form.Item>
                    ) : null}
                </div>

                <Form.List name="showcaseMedia">
                    {(fields, { add, remove }) => (
                        <section aria-labelledby="skill-media-title">
                            <div className="mb-3 flex items-center justify-between">
                                <div>
                                    <h3 id="skill-media-title" className="text-sm font-medium">
                                        {translate("shared.skills.skillEditorDrawer.showcaseMedia")}
                                    </h3>
                                    <p className="mt-1 text-xs text-foreground/50">{translate("shared.skills.skillEditorDrawer.optionalUpTo8PublicImageOrVideoLinks")}</p>
                                </div>
                                <Button disabled={fields.length >= 8} icon={<Plus className="size-4" />} onClick={() => add(emptyMedia())}>
                                    {translate("shared.skills.skillEditorDrawer.addMedia")}
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {fields.map((field) => (
                                    <div key={field.key} className="grid grid-cols-[112px_minmax(0,1fr)_36px] gap-2">
                                        <Form.Item {...field} name={[field.name, "type"]} className="mb-0" rules={[{ required: true, message: translate("shared.skills.skillEditorDrawer.selectType") }]}>
                                            <Select
                                                options={[
                                                    { value: "image", label: translate("account.feedback.image") },
                                                    { value: "video", label: translate("account.feedback.video") },
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            {...field}
                                            name={[field.name, "showcaseUrl"]}
                                            className="mb-0"
                                            rules={[
                                                { required: true, message: translate("shared.skills.skillEditorDrawer.enterAMediaLink") },
                                                { type: "url", message: translate("shared.skills.skillEditorDrawer.invalidLinkFormat") },
                                            ]}
                                        >
                                            <Input type="url" inputMode="url" spellCheck={false} placeholder="https://example.com/media" />
                                        </Form.Item>
                                        <Button aria-label={translate("shared.skills.skillEditorDrawer.removeMedia")} title={translate("shared.skills.skillEditorDrawer.removeMedia")} icon={<Minus className="size-4" />} onClick={() => remove(field.name)} />
                                        <Form.Item {...field} name={[field.name, "showcaseUri"]} hidden>
                                            <Input />
                                        </Form.Item>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </Form.List>

                <Form.Item name="extraInfo" label={translate("shared.skills.skillEditorDrawer.additionalInformation")} className="mt-5" rules={[{ max: 2000, message: translate("shared.skills.skillEditorDrawer.upTo2000Characters") }]}>
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} showCount placeholder={translate("shared.skills.skillEditorDrawer.releaseNotesRequiredToolsOrUsageCaveats")} />
                </Form.Item>
            </Form>
        </AppDrawer>
    );
}

function adminInfoNotice(skill: Skill | null) {
    const base = translate("shared.skills.skillEditorDrawer.onlyEditTheNameSummaryCategoryAndDisplayInformationHere");
    if (skill?.sourceType === "builtin") return translate("shared.skills.skillEditorDrawer.afterSavingSystemUpgradesWillNoLongerOverwriteThisInformation", { v0: String(base) });
    if (skill?.sourceType === "github") return translate("shared.skills.skillEditorDrawer.afterSavingGitHubSyncWillNoLongerOverwriteTheName", { v0: String(base) });
    return base;
}

function emptyMedia(): SkillShowcaseMedia {
    return { type: "image", showcaseUri: "", showcaseUrl: "" };
}
