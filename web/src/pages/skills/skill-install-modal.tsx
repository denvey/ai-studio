import { App, Button, Form, Input, Modal, Upload, type UploadFile } from "antd";
import { Select } from "@/components/ui/base/select";
import { Switch } from "@/components/ui/base/switch";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { FileArchive, FileText, GitBranch, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

import { fallbackSkillCategories } from "@/pages/skills/skill-catalog";
import { installGitHubSkill, installSkillUpload, type Skill } from "@/services/api/skills";
import { translate } from "@/i18n";


type InstallMode = "markdown" | "zip" | "github";

type InstallFormValues = {
    name?: string;
    description?: string;
    tag: string;
    is_public: boolean;
    url?: string;
    ref?: string;
    subdir?: string;
    autoUpdate: boolean;
};

const modeOptions = [
    { value: "markdown", label: <span className="inline-flex items-center gap-2"><FileText className="size-3.5" />Markdown</span> },
    { value: "zip", label: <span className="inline-flex items-center gap-2"><FileArchive className="size-3.5" />{translate("shared.skills.skillInstallModal.zIPSkillPackage")}</span> },
    { value: "github", label: <span className="inline-flex items-center gap-2"><GitBranch className="size-3.5" />GitHub</span> },
];

export function SkillInstallModal({ open, onClose, onInstalled, onManualCreate }: { open: boolean; onClose: () => void; onInstalled: (skill: Skill) => void; onManualCreate: () => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<InstallFormValues>();
    const [mode, setMode] = useState<InstallMode>("markdown");
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        if (!open) return;
        setMode("markdown");
        setFileList([]);
        form.setFieldsValue({ tag: "creative", is_public: false, autoUpdate: true, name: "", description: "", url: "", ref: "", subdir: "" });
    }, [form, open]);

    const install = async () => {
        const values = await form.validateFields();
        const file = fileList[0]?.originFileObj;
        if (mode !== "github" && !file) {
            message.warning(translate("shared.skills.skillInstallModal.selectA", { v0: String(mode === "zip" ? translate("shared.skills.skillInstallModal.zIPSkillPackage") : translate("shared.skills.skillInstallModal.markdownFile")) }));
            return;
        }
        setInstalling(true);
        try {
            const result = mode === "github"
                ? await installGitHubSkill({
                    url: values.url || "",
                    ref: values.ref || undefined,
                    subdir: values.subdir || undefined,
                    tag: values.tag,
                    isPrivate: !values.is_public,
                    autoUpdate: values.autoUpdate,
                })
                : await installSkillUpload({
                    file: file as File,
                    sourceType: mode,
                    name: values.name || undefined,
                    description: values.description || undefined,
                    tag: values.tag,
                    isPrivate: !values.is_public,
                });
            message.success(translate("shared.skills.skillInstallModal.skillInstalled"));
            onInstalled(result.skill);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.skills.skillInstallModal.failedToInstallSkill"));
        } finally {
            setInstalling(false);
        }
    };

    return (
        <Modal
            className="skill-install-modal"
            open={open}
            width={680}
            destroyOnHidden
            mask={{ closable: !installing }}
            title={translate("shared.skills.skillInstallModal.installSkill")}
            onCancel={onClose}
            footer={(
                <div className="flex items-center justify-between gap-3">
                    <Button type="text" onClick={onManualCreate}>{translate("shared.skills.skillInstallModal.createASingleFileSkillFromScratch")}</Button>
                    <div className="flex gap-2"><Button onClick={onClose}>{translate("common.cancel")}</Button><Button type="primary" loading={installing} onClick={() => void install()}>{translate("shared.skills.skillInstallModal.installSkill")}</Button></div>
                </div>
            )}
        >
            <p className="mb-4 text-sm leading-6 text-foreground/55">{translate("shared.skills.skillInstallModal.supportsStandard")} <code>SKILL.md</code>{translate("shared.skills.skillInstallModal.zIPSkillPackagesWithNestedDirectoriesOrPublicGitHubRepositories")}</p>
<SegmentedControl className="skill-install-mode" block options={modeOptions} value={mode} onChange={(value) => { setMode(value as InstallMode); setFileList([]); }} />

            <Form form={form} layout="vertical" requiredMark="optional" className="skill-install-form">
                {mode === "github" ? (
                    <>
                        <Form.Item name="url" label={translate("shared.skills.skillInstallModal.gitHubURL")} rules={[{ required: true, message: translate("shared.skills.skillInstallModal.enterAGitHubRepositoryURL") }, { type: "url", message: translate("shared.skills.skillInstallModal.enterAValidURL") }]}>
                            <Input type="url" inputMode="url" spellCheck={false} prefix={<GitBranch className="size-4 text-foreground/35" />} placeholder="https://github.com/owner/repository" />
                        </Form.Item>
                        <div className="grid gap-x-3 sm:grid-cols-2">
                            <Form.Item name="ref" label={translate("shared.skills.skillInstallModal.branchOrTag")} extra={translate("shared.skills.skillInstallModal.leaveBlankToUseTheDefaultBranch")}><Input spellCheck={false} placeholder="main" /></Form.Item>
                            <Form.Item name="subdir" label={translate("shared.skills.skillInstallModal.skillSubdirectory")} extra={translate("shared.skills.skillInstallModal.leaveBlankIfTheRepositoryContainsOnlyOneSkill")}><Input spellCheck={false} placeholder="skills/ai-director" /></Form.Item>
                        </div>
                    </>
                ) : (
                    <>
                        <Upload.Dragger
                            accept={mode === "zip" ? ".zip,application/zip" : ".md,.markdown,text/markdown"}
                            maxCount={1}
                            fileList={fileList}
                            beforeUpload={(file) => {
                                if (file.size > 20 * 1024 * 1024) {
                                    message.error(translate("shared.skills.skillInstallModal.skillFilesMustBe20MBOrSmaller"));
                                    return Upload.LIST_IGNORE;
                                }
                                return false;
                            }}
                            onChange={({ fileList: next }) => setFileList(next.slice(-1))}
                            onRemove={() => { setFileList([]); return true; }}
                        >
                            <UploadCloud className="mx-auto mb-3 size-8 text-foreground/38" />
                            <div className="text-sm font-medium">{translate("shared.skills.skillInstallModal.dragInOrSelect")} {mode === "zip" ? translate("shared.skills.skillInstallModal.zIPSkillPackage") : translate("shared.skills.skillInstallModal.markdownFile")}</div>
                            <div className="mt-1 text-xs text-foreground/45">{mode === "zip" ? translate("shared.skills.skillInstallModal.theRootOrSoleSubdirectoryMustContainSKILLMd") : translate("shared.skills.skillInstallModal.regularMdFilesAreInstalledAsTheSKILLMdEntry")}</div>
                        </Upload.Dragger>
                        <div className="mt-4 grid gap-x-3 sm:grid-cols-2">
                            <Form.Item name="name" label={translate("shared.skills.skillInstallModal.overrideName")} extra={translate("shared.skills.skillInstallModal.optionalDetectedAutomaticallyWhenBlank")}><Input maxLength={80} autoComplete="off" /></Form.Item>
                            <Form.Item name="description" label={translate("shared.skills.skillInstallModal.overrideSummary")} extra={translate("shared.skills.skillInstallModal.optionalDetectedAutomaticallyWhenBlank")}><Input maxLength={500} autoComplete="off" /></Form.Item>
                        </div>
                    </>
                )}

                <div className="grid gap-x-3 sm:grid-cols-2">
                    <Form.Item name="tag" label={translate("shared.skills.skillInstallModal.skillCategory")} rules={[{ required: true, message: translate("shared.skills.skillInstallModal.selectASkillCategory") }]}>
                        <Select options={fallbackSkillCategories} />
                    </Form.Item>
                    <Form.Item name="is_public" label={translate("shared.skills.skillInstallModal.visibility")} valuePropName="checked" extra={translate("shared.skills.skillInstallModal.oncePublicOtherUsersCanJoinAndUseIt")}>
                        <Switch checkedChildren={translate("shared.skills.skillDetailDrawer.public")} unCheckedChildren={translate("shared.skills.skillInstallModal.private")} />
                    </Form.Item>
                </div>
                {mode === "github" ? <Form.Item name="autoUpdate" label={translate("shared.skills.skillInstallModal.automaticSync")} valuePropName="checked" extra={translate("shared.skills.skillInstallModal.theServerChecksForCommitsEvery6HoursAndRecords")}><Switch checkedChildren={translate("shared.imageParameterFields.enabled")} unCheckedChildren={translate("common.close")} /></Form.Item> : null}
            </Form>
        </Modal>
    );
}
