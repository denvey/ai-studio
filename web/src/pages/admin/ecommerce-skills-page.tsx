import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Input, Progress, Select, Space, Switch, Table, Tag, Typography, Upload } from "antd";
import { Download, RefreshCw, Sparkles } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";
import { EcommerceLibraryPanel } from "./ecommerce-library-panel";
import { installEcommerceSkillFile, installEcommerceSkillGitHub, renameEcommerceSkill, listEcommerceManagedSkills, setEcommerceManagedSkillEnabled, type EcommerceManagedSkill } from "@/services/api/ecommerce-skills";
import "./ecommerce-skills.css";
import { translate } from "@/i18n";


export default function EcommerceSkillsPage() {
    const { message } = App.useApp();
    const [skills, setSkills] = useState<EcommerceManagedSkill[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState("");
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [group, setGroup] = useState("");
    const [status, setStatus] = useState("");
    const [installOpen, setInstallOpen] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [installError, setInstallError] = useState("");
    const [progress, setProgress] = useState(0);
    const [url, setUrl] = useState("");
    const [subdir, setSubdir] = useState("");
    const [origin, setOrigin] = useState("");
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listEcommerceManagedSkills();
            setSkills([...result.skills].sort((a, b) => Number(b.origin === "user-installed") - Number(a.origin === "user-installed")));
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const filtered = useMemo(
        () =>
            skills.filter(
                (skill) =>
                    (!origin || skill.origin === origin) &&
                    (!group || skill.group === group) &&
                    (!status || skill.enabled === (status === "enabled")) &&
                    [skill.name, skill.description, skill.group, skill.sourceUrl, ...skill.terms].join(" ").toLowerCase().includes(search.trim().toLowerCase()),
            ),
        [skills, group, status, search, origin],
    );
    const install = async (file?: File) => {
        if (file && !/\.(zip|md|markdown)$/i.test(file.name)) {
            setInstallError(translate("adminPages.ecommerceSkillsPage.pleaseSelectAZIPOrMarkdownSkillFile"));
            return;
        }
        if (file && file.size > 1024 ** 3) {
            setInstallError(translate("adminPages.ecommerceSkillsPage.fileTooLargeEcommerceSkillsSupportsUpTo1GB"));
            return;
        }
        setInstalling(true);
        setInstallError("");
        setProgress(file ? 0 : -1);
        try {
            if (file) await installEcommerceSkillFile(file, setProgress);
            else await installEcommerceSkillGitHub(url.trim(), subdir.trim());
            await refresh();
            setInstallOpen(false);
            setUrl("");
            setSubdir("");
            message.success(translate("adminPages.ecommerceSkillsPage.skillsInstalledAndEnabledByDefaultTheAgentWillAnalyze"));
        } catch (cause) {
            setInstallError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setInstalling(false);
        }
    };
    const rename = async (skill: EcommerceManagedSkill, name: string) => {
        try {
            await renameEcommerceSkill(skill.id, name);
            await refresh();
            message.success(translate("adminPages.ecommerceSkillsPage.skillNameSaved"));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : String(cause));
        }
    };
    const toggle = async (skill: EcommerceManagedSkill, enabled: boolean) => {
        setSaving(skill.id);
        try {
            const result = await setEcommerceManagedSkillEnabled(skill.id, enabled);
            setSkills((current) => current.map((entry) => (entry.id === skill.id ? { ...entry, enabled: result.enabled } : entry)));
            message.success(translate("adminPages.ecommerceSkillsPage.isNow", { v0: String(skill.name), v1: String(result.enabled ? translate("adminPages.ecommerceSkillsPage.enabled") : translate("adminPages.ecommerceSkillsPage.disabled2")) }));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setSaving("");
        }
    };
    return (
        <EcommerceLibraryPanel
            description={translate("adminPages.ecommerceSkillsPage.applySuitableSkillMethodsBasedOnTheProductReferenceMode")}
            actions={
                <Space wrap>
                    <Button
                        type="primary"
                        icon={<Download size={14} />}
                        onClick={() => {
                            setInstallError("");
                            setInstallOpen(true);
                        }}
                    >
                        {translate("adminPages.ecommerceSkillsPage.installECommerceSkills")}
                    </Button>
                    <Button icon={<RefreshCw size={14} />} loading={loading} onClick={() => void refresh()}>
                        {translate("common.refresh")}
                    </Button>
                </Space>
            }
        >
            {error ? <Alert type="error" showIcon message={error} /> : null}
            <Space wrap>
                <Tag icon={<Sparkles size={12} />}>{translate("canvasA.skillSuggestion.installedBadge")} {skills.length}</Tag>
                <Typography.Text>{translate("account.layout.oss.enabled")} {skills.filter((skill) => skill.enabled).length}</Typography.Text>
                <Typography.Text type="secondary">
                    {translate("adminPages.ecommerceSkillsPage.gitHubAdaptation")} {skills.filter((skill) => skill.origin === "github-adapted").length} {translate("adminPages.ecommerceSkillsPage.original")} {skills.filter((skill) => skill.origin === "first-party").length}
                </Typography.Text>
            </Space>
            <Alert type="info" showIcon message={translate("adminPages.ecommerceSkillsPage.enabledByDefaultAfterInstallationTheAgentAnalyzesAllEnabled")} />
            <Space wrap>
                <Input.Search allowClear placeholder={translate("adminPages.ecommerceSkillsPage.searchSkillsPurposesOrSources")} value={search} onChange={(event) => setSearch(event.target.value)} style={{ width: 300 }} />
                <Select
                    aria-label={translate("adminPages.ecommerceSkillsPage.skillSource")}
                    value={origin}
                    onChange={setOrigin}
                    style={{ width: 150 }}
                    options={[
                        { value: "", label: translate("adminPages.ecommerceSkillsPage.allSources") },
                        { value: "user-installed", label: translate("adminPages.ecommerceSkillsPage.userInstalled") },
                        { value: "github-adapted", label: translate("adminPages.ecommerceSkillsPage.gitHubAdaptation") },
                        { value: "first-party", label: translate("adminPages.ecommerceSkillsPage.original2") },
                    ]}
                />
                <Select value={group} onChange={setGroup} style={{ width: 160 }} options={[{ value: "", label: translate("adminPages.ecommerceSkillsPage.allPurposes") }, ...[...new Set(skills.map((skill) => skill.group))].map((value) => ({ value, label: value }))]} />
                <Select
                    value={status}
                    onChange={setStatus}
                    style={{ width: 140 }}
                    options={[
                        { value: "", label: translate("library.ark.expiry.all") },
                        { value: "enabled", label: translate("account.layout.oss.enabled") },
                        { value: "disabled", label: translate("adminPages.ecommerceSkillsPage.disabled") },
                    ]}
                />
            </Space>
            <Table<EcommerceManagedSkill>
                rowKey="id"
                size="small"
                loading={loading}
                dataSource={filtered}
                rowClassName={(skill) => (skill.origin === "user-installed" ? "ecommerce-skill-installed" : "")}
                pagination={{ pageSize: 15, showSizeChanger: false }}
                expandable={{ expandedRowRender: (skill) => <Typography.Paragraph style={{ whiteSpace: "pre-wrap", margin: 0 }}>{skill.instructions}</Typography.Paragraph> }}
                columns={[
                    {
                        title: translate("adminPages.ecommerceSkillsPage.skillsAndPurposes"),
                        key: "skill",
                        render: (_, skill) => (
                            <div>
                                <Typography.Text strong editable={skill.origin === "user-installed" ? { onChange: (name) => void rename(skill, name), tooltip: translate("adminPages.ecommerceSkillsPage.editSkillName"), maxLength: 80 } : false}>
                                    {skill.name}
                                </Typography.Text>
                                {skill.origin === "user-installed" ? (
                                    <Tag color="cyan" icon={<Sparkles size={12} />}>
                                        {translate("adminPages.ecommerceSkillsPage.userInstalled")}
                                    </Tag>
                                ) : null}
                                <br />
                                <Typography.Text type="secondary">{skill.description}</Typography.Text>
                                <br />
                                <Space wrap size={4}>
                                    <Tag>{skill.origin === "user-installed" ? translate("adminPages.ecommerceSkillsPage.customECommerceSkills") : skill.group}</Tag>
                                    {skill.types.map((type) => (
                                        <Tag key={type}>{type}</Tag>
                                    ))}
                                </Space>
                            </div>
                        ),
                    },
                    {
                        title: translate("adminPages.ecommerceSkillsPage.sourceAndVersion"),
                        key: "source",
                        width: 230,
                        render: (_, skill) => (
                            <div>
                                {skill.origin === "user-installed" ? (
                                    <>
                                        <Typography.Text>{skill.autoUpdate ? translate("adminPages.ecommerceSkillsPage.gitHubAutomaticUpdates") : translate("adminPages.ecommerceSkillsPage.localFileReUploadToUpdate")}</Typography.Text>
                                        <br />
                                        {skill.sourceUrl ? (
                                            <a href={skill.sourceUrl} target="_blank" rel="noreferrer">
                                                {translate("adminPages.ecommerceSkillsPage.viewUpstream")}
                                            </a>
                                        ) : null}
                                        <Typography.Text type="secondary">{skill.lastCheckedAt ? translate("adminPages.ecommerceSkillsPage.lastChecked", { v0: String(skill.lastCheckedAt) }) : ""}</Typography.Text>
                                        {skill.syncError ? <Alert type="warning" title={translate("adminPages.ecommerceSkillsPage.updateFailedUsingThePreviousVersion")} description={skill.syncError} /> : null}
                                    </>
                                ) : skill.origin === "github-adapted" ? (
                                    <a href={skill.sourceUrl} target="_blank" rel="noreferrer">
                                        {translate("adminPages.ecommerceSkillsPage.gitHubPinnedVersion")}
                                    </a>
                                ) : (
                                    <Typography.Text>{translate("adminPages.ecommerceSkillsPage.meiyeOriginal")}</Typography.Text>
                                )}
                                <br />
                                <Typography.Text type="secondary">
                                    {skill.license ? `${skill.license} · ` : ""}v{skill.version}
                                </Typography.Text>
                                <br />
                                <Typography.Text code>{skill.sourceCommit.slice(0, 12)}</Typography.Text>
                            </div>
                        ),
                    },
                    {
                        title: translate("adminPages.ecommerceSkillsPage.callStatus"),
                        key: "enabled",
                        width: 120,
                        render: (_, skill) => (
                            <Switch checked={skill.enabled} checkedChildren={translate("account.layout.oss.switchOn")} unCheckedChildren={translate("adminPages.ecommerceSkillsPage.off")} loading={saving === skill.id} disabled={loading || Boolean(saving && saving !== skill.id)} onChange={(enabled) => void toggle(skill, enabled)} />
                        ),
                    },
                ]}
            />
            <AppModal title={translate("adminPages.ecommerceSkillsPage.installECommerceSkills")} open={installOpen} onCancel={() => !installing && setInstallOpen(false)} closable={!installing} maskClosable={!installing} footer={null}>
                <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                    <Alert
                        type="info"
                        showIcon
                        title={translate("adminPages.ecommerceSkillsPage.supportsSkillPackagesOver500MBUpTo1GB")}
                        description={translate("adminPages.ecommerceSkillsPage.installedSkillsAreEnabledByDefaultAndMarkedWithA")}
                    />
                    {installError ? <Alert type="error" showIcon title={installError} /> : null}
                    <Upload
                        accept=".zip,.md,.markdown"
                        showUploadList={false}
                        disabled={installing}
                        beforeUpload={(file) => {
                            void install(file);
                            return false;
                        }}
                    >
                        <Button loading={installing}>{translate("adminPages.ecommerceSkillsPage.chooseZIPMarkdownToInstall")}</Button>
                    </Upload>
                    {installing ? progress < 0 ? <Typography.Text role="status">{translate("adminPages.ecommerceSkillsPage.readingGitHubAndInstallingSkills")}</Typography.Text> : <Progress percent={progress} status="active" format={(value) => (value === 100 ? translate("adminPages.ecommerceSkillsPage.parsing") : `${value}%`)} /> : null}
                    <label htmlFor="ecommerce-skill-url">{translate("adminPages.ecommerceSkillsPage.gitHubRepositoryOrSkillDirectoryURL")}</label>
                    <Input id="ecommerce-skill-url" value={url} onChange={(event) => setUrl(event.target.value)} disabled={installing} placeholder="https://github.com/owner/repo" />
                    <label htmlFor="ecommerce-skill-subdir">{translate("adminPages.ecommerceSkillsPage.skillSubdirectoryRequiredForCollections")}</label>
                    <Input id="ecommerce-skill-subdir" value={subdir} onChange={(event) => setSubdir(event.target.value)} disabled={installing} placeholder="skills/product-photography" />
                    <Typography.Text type="secondary">{translate("adminPages.ecommerceSkillsPage.gitHubSourcesAreCheckedEvery6HoursAndFollowThe")}</Typography.Text>
                    <Button type="primary" loading={installing} disabled={!url.trim()} onClick={() => void install()}>
                        {translate("adminPages.ecommerceSkillsPage.installFromGitHubWithAutomaticUpdates")}
                    </Button>
                </Space>
            </AppModal>
        </EcommerceLibraryPanel>
    );
}
