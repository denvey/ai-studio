import { Button, Input, Skeleton, Tree } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Tooltip } from "@/components/ui/base/tooltip";

import { SegmentedControl } from "@/components/ui/base/segmented-control";
import type { DataNode } from "antd/es/tree";
import { Check, ChevronRight, Code2, ExternalLink, File, FileArchive, FileCode2, FileImage, FileText, Folder, FolderOpen, Heart, Info, Pencil, Plus, RefreshCw, Users } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatSkillCount, formatSkillDate, skillCategoryLabel } from "@/pages/skills/skill-catalog";
import { splitSkillFrontmatter, type SkillFrontmatter } from "@/pages/skills/skill-frontmatter";
import { getSkillFile, listSkillFiles, skillFileRawURL, type Skill, type SkillCategory, type SkillPackageFile, type SkillPackageFileContent } from "@/services/api/skills";
import { translate } from "@/i18n";


type PreviewMode = "preview" | "source";

export function SkillDetailModal({ skill, loading, mutating, categories, onClose, onAdd, onLike, onEdit, onOpenWorkbench, onSync }: { skill: Skill | null; loading: boolean; mutating: boolean; categories: SkillCategory[]; onClose: () => void; onAdd: (skill: Skill) => void; onLike: (skill: Skill) => void; onEdit: (skill: Skill) => void; onOpenWorkbench: (skill: Skill) => void; onSync: (skill: Skill) => void }) {
    const [files, setFiles] = useState<SkillPackageFile[]>([]);
    const [filesLoading, setFilesLoading] = useState(false);
    const [filesError, setFilesError] = useState("");
    const [activePath, setActivePath] = useState("SKILL.md");
    const [content, setContent] = useState<SkillPackageFileContent | null>(null);
    const [contentLoading, setContentLoading] = useState(false);
    const [contentError, setContentError] = useState("");
    const [previewMode, setPreviewMode] = useState<PreviewMode>("preview");
    const [pathFilter, setPathFilter] = useState("");

    useEffect(() => {
        if (!skill) {
            setFiles([]);
            setContent(null);
            return;
        }
        let cancelled = false;
        setFilesLoading(true);
        setFilesError("");
        setPathFilter("");
        listSkillFiles(skill.skillId)
            .then((result) => {
                if (cancelled) return;
                setFiles(result.files);
                const first = result.files.find((file) => file.path === "SKILL.md")?.path || result.files[0]?.path || "";
                setActivePath(first);
            })
            .catch((error) => {
                if (cancelled) return;
                setFiles([]);
                setFilesError(error instanceof Error ? error.message : translate("shared.skills.skillDetailDrawer.failedToLoadSkillFiles"));
            })
            .finally(() => {
                if (!cancelled) setFilesLoading(false);
            });
        return () => { cancelled = true; };
    }, [skill?.skillId, skill?.versionId]);

    useEffect(() => {
        if (!skill || !activePath) {
            setContent(null);
            return;
        }
        let cancelled = false;
        setContentLoading(true);
        setContentError("");
        getSkillFile(skill.skillId, activePath)
            .then((result) => { if (!cancelled) setContent(result.file); })
            .catch((error) => {
                if (cancelled) return;
                setContent(null);
                setContentError(error instanceof Error ? error.message : translate("shared.skills.skillDetailDrawer.failedToReadFile"));
            })
            .finally(() => { if (!cancelled) setContentLoading(false); });
        return () => { cancelled = true; };
    }, [activePath, skill?.skillId, skill?.versionId]);

    useEffect(() => {
        setPreviewMode("preview");
    }, [activePath]);

    const visibleFiles = useMemo(() => {
        const needle = pathFilter.trim().toLowerCase();
        return needle ? files.filter((file) => file.path.toLowerCase().includes(needle)) : files;
    }, [files, pathFilter]);
    const treeData = useMemo(() => buildSkillTree(visibleFiles), [visibleFiles]);
    const filePaths = useMemo(() => new Set(files.map((file) => file.path)), [files]);
    const selectedFile = files.find((file) => file.path === activePath);
    const canPreviewMarkdown = selectedFile?.kind === "markdown" && !content?.binary;

    return (
        <AppModal
            className="skill-package-modal"
            open={Boolean(skill)}
            width="82vw"
            footer={null}
            destroyOnHidden
            onCancel={onClose}
            flush styles={{ container: { height: "82vh" }, body: { height: "100%" } }}
        >
            {skill ? (
                <div className="skill-package-shell">
                    <header className="skill-package-header">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-[var(--fs-label)] text-foreground/45">
                                <span>{skillCategoryLabel(skill.tag, categories)}</span><span aria-hidden="true">/</span><span>{sourceLabel(skill.sourceType)}</span><span aria-hidden="true">/</span><span>v{skill.version || "1"}</span><span aria-hidden="true">/</span><span>{translate("shared.skills.skillDetailDrawer.updated")} {formatSkillDate(skill.updatedAt)}</span>
                            </div>
                            <h1 className="mt-1 truncate text-[var(--fs-heading-lg)] font-semibold text-foreground">{skill.skillName}</h1>
                            <p className="mt-1 line-clamp-2 max-w-4xl text-sm leading-5 text-foreground/58">{skill.description}</p>
                        </div>
                        <div className="skill-package-actions">
                            {skill.sourceType === "github" && skill.isOwner ? <Tooltip title={skill.syncError || translate("shared.skills.skillDetailDrawer.checkAndSyncTheLatestCommitsFromGitHub")}><Button loading={mutating} icon={<RefreshCw className="size-4" />} onClick={() => onSync(skill)}>{translate("shared.skills.skillDetailDrawer.sync")}</Button></Tooltip> : null}
                            {skill.isOwner ? <Tooltip title={translate("shared.skills.skillDetailDrawer.editNameSummaryCategoryAndDisplayInformation")}><Button icon={<Info className="size-4" />} onClick={() => onEdit(skill)}>{translate("shared.skills.skillDetailDrawer.skillInformation")}</Button></Tooltip> : null}
                            {skill.isOwner && skill.sourceType !== "github" ? (
                                <Button icon={<Pencil className="size-4" />} onClick={() => onOpenWorkbench(skill)}>{translate("account.settings.channels.edit")}</Button>
                            ) : (
                                <Tooltip title={translate("shared.skills.skillDetailDrawer.browseAllFilesReadOnlyInTheWorkbench")}><Button icon={<Code2 className="size-4" />} onClick={() => onOpenWorkbench(skill)}>{translate("account.welcome.navWorkbench")}</Button></Tooltip>
                            )}
                            <Button loading={mutating} icon={<Heart className={`size-4 ${skill.isLike ? "fill-current text-rose-500" : ""}`} />} onClick={() => onLike(skill)}>{skill.isLike ? translate("shared.skills.skillDetailDrawer.favorited") : translate("shared.skills.skillDetailDrawer.favorite")}</Button>
                            <Button type={skill.isAdded ? "default" : "primary"} loading={mutating} disabled={skill.isOwner} icon={skill.isAdded ? <Check className="size-4" /> : <Plus className="size-4" />} onClick={() => onAdd(skill)}>{skill.isOwner ? translate("shared.skills.skillDetailDrawer.mySkills") : skill.isAdded ? translate("shared.skills.skillDetailDrawer.joined") : translate("shared.skills.skillDetailDrawer.joinSkill")}</Button>
                        </div>
                    </header>

                    <div className="skill-package-workspace">
                        <aside className="skill-package-sidebar" aria-label={translate("library.workbench.explorer.tree")}>
                            <div className="skill-package-sidebar-summary">
                                <span><FileArchive className="size-3.5" />{skill.fileCount || files.length} {translate("shared.skills.skillDetailDrawer.files")}</span>
                                <span>{formatBytes(skill.totalBytes)}</span>
                            </div>
                            <Input allowClear size="small" value={pathFilter} onChange={(event) => setPathFilter(event.target.value)} placeholder={translate("shared.skills.skillDetailDrawer.filterFiles")} prefix={<File className="size-3.5 text-foreground/30" />} />
                            <div className="skill-package-tree thin-scrollbar">
                                {filesLoading || loading ? <Skeleton active title={false} paragraph={{ rows: 10 }} /> : filesError ? <div className="skill-package-empty">{filesError}</div> : treeData.length ? (
                                    <Tree
                                        blockNode
                                        showIcon
                                        showLine={false}
                                        defaultExpandAll
                                        expandAction="click"
                                        selectedKeys={activePath ? [activePath] : []}
                                        treeData={treeData}
                                        switcherIcon={({ expanded, isLeaf }) => isLeaf ? null : <ChevronRight aria-hidden="true" className={`skill-package-tree-chevron size-3.5 ${expanded ? "is-expanded" : ""}`} />}
                                        onSelect={(keys, info) => { if (!info.node.children?.length && keys[0]) setActivePath(String(keys[0])); }}
                                    />
                                ) : <div className="skill-package-empty">{translate("shared.skills.skillDetailDrawer.noMatchingFiles")}</div>}
                            </div>
                            <div className="skill-package-sidebar-footer">
                                <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{formatSkillCount(skill.addedCount)} {translate("shared.skills.skillDetailDrawer.joined2")}</span>
                                <span>{skill.isPrivate ? translate("shared.skills.skillDetailDrawer.visibleToMeOnly") : translate("shared.skills.skillDetailDrawer.public")}</span>
                            </div>
                        </aside>

                        <main className="skill-package-preview">
                            <div className="skill-package-preview-toolbar">
                                <div className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/58">{activePath || translate("shared.skills.skillDetailDrawer.selectAFile")}</div>
{canPreviewMarkdown ? <SegmentedControl size="sm" value={previewMode} onChange={(value) => setPreviewMode(value as PreviewMode)} options={[{ value: "preview", label: <span className="inline-flex items-center gap-1"><FileText className="size-3.5" />{translate("account.feedback.preview")}</span> }, { value: "source", label: <span className="inline-flex items-center gap-1"><Code2 className="size-3.5" />{translate("shared.skills.skillDetailDrawer.source")}</span> }]} /> : null}
                                {activePath ? <Tooltip title={translate("shared.skills.skillDetailDrawer.openOriginalFile")}><a className="skill-package-raw-link" href={skillFileRawURL(skill.skillId, activePath)} target="_blank" rel="noreferrer" aria-label={translate("shared.skills.skillDetailDrawer.openOriginalFile")}><ExternalLink className="size-4" /></a></Tooltip> : null}
                            </div>
                            <div className="skill-package-preview-body thin-scrollbar">
                                {contentLoading ? <Skeleton active paragraph={{ rows: 18 }} /> : contentError ? <div className="skill-package-empty">{contentError}</div> : content && selectedFile ? (
                                    <SkillFilePreview skill={skill} file={selectedFile} content={content} mode={previewMode} filePaths={filePaths} onNavigate={setActivePath} />
                                ) : <div className="skill-package-empty">{translate("shared.skills.skillDetailDrawer.selectAFileOnTheLeft")}</div>}
                            </div>
                        </main>
                    </div>
                </div>
            ) : null}
        </AppModal>
    );
}

function SkillFilePreview({ skill, file, content, mode, filePaths, onNavigate }: { skill: Skill; file: SkillPackageFile; content: SkillPackageFileContent; mode: PreviewMode; filePaths: Set<string>; onNavigate: (path: string) => void }) {
    const rawURL = skillFileRawURL(skill.skillId, file.path);
    if (content.binary) {
        if (file.kind === "image") return <div className="skill-package-media-stage"><img src={rawURL} alt={file.path} /></div>;
        if (file.kind === "video") return <div className="skill-package-media-stage"><video src={rawURL} controls playsInline preload="metadata" /></div>;
        if (file.kind === "audio") return <div className="skill-package-media-stage"><audio src={rawURL} controls preload="metadata" /></div>;
        return <div className="skill-package-empty"><FileArchive className="mb-3 size-9" /><div>{translate("shared.skills.skillDetailDrawer.onlinePreviewIsUnavailableForThisFile")}</div><a className="mt-3 inline-flex items-center gap-1 text-foreground underline" href={rawURL} target="_blank" rel="noreferrer">{translate("shared.skills.skillDetailDrawer.openOriginalFile")}<ExternalLink className="size-3.5" /></a></div>;
    }
    if (file.kind === "markdown" && mode === "preview") {
        return <SkillMarkdown source={content.content} currentPath={file.path} filePaths={filePaths} onNavigate={onNavigate} />;
    }
    return <pre className="skill-package-source"><code>{content.content}</code></pre>;
}

const FRONTMATTER_PRIMARY_LABELS: Record<string, string> = { name: translate("shared.skills.skillDetailDrawer.name"), description: translate("shared.skills.skillDetailDrawer.description"), version: translate("canvasA.assetView.version") };

function SkillFrontmatterPanel({ frontmatter }: { frontmatter: SkillFrontmatter }) {
    if (!frontmatter.entries) {
        return (
            <section className="mb-6" aria-label={translate("shared.skills.skillDetailDrawer.skillMetadata")}>
                <div className="mb-1 text-[var(--fs-caption)] text-foreground/45">{translate("shared.skills.skillDetailDrawer.metadataCouldNotParseShowingRawText")}</div>
                <pre>
                    <code>{frontmatter.raw}</code>
                </pre>
            </section>
        );
    }
    const primary = Object.keys(FRONTMATTER_PRIMARY_LABELS).flatMap((key) => frontmatter.entries!.filter((entry) => entry.key === key));
    const others = frontmatter.entries.filter((entry) => !(entry.key in FRONTMATTER_PRIMARY_LABELS));
    if (!primary.length && !others.length) return null;
    return (
        <section className="mb-6 rounded-[var(--r-md)] border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-[var(--fs-caption)] leading-5" aria-label={translate("shared.skills.skillDetailDrawer.skillMetadata")}>
            {primary.length ? (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
                    {primary.map((entry) => (
                        <Fragment key={entry.key}>
                            <dt className="text-foreground/45">{FRONTMATTER_PRIMARY_LABELS[entry.key]}</dt>
                            <dd className="m-0 whitespace-pre-wrap break-words text-foreground/80">{entry.value || "—"}</dd>
                        </Fragment>
                    ))}
                </dl>
            ) : null}
            {others.length ? (
                <details className={primary.length ? "mt-2" : undefined}>
                    <summary className="cursor-pointer select-none text-foreground/45">{translate("shared.skills.skillDetailDrawer.otherFields")}{others.length}）</summary>
                    <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
                        {others.map((entry, index) => (
                            <Fragment key={`${entry.key}-${index}`}>
                                <dt className="font-mono text-foreground/45">{entry.key}</dt>
                                <dd className="m-0 whitespace-pre-wrap break-words text-foreground/80">{entry.value || "—"}</dd>
                            </Fragment>
                        ))}
                    </dl>
                </details>
            ) : null}
        </section>
    );
}

export function SkillMarkdown({ source, currentPath, filePaths, onNavigate }: { source: string; currentPath: string; filePaths: Set<string>; onNavigate: (path: string) => void }) {
    const { frontmatter, body } = useMemo(() => splitSkillFrontmatter(source), [source]);
    const navigate = (event: MouseEvent<HTMLAnchorElement>, href?: string) => {
        const target = resolveSkillPath(currentPath, href || "");
        if (!target || !filePaths.has(target)) return;
        event.preventDefault();
        onNavigate(target);
    };
    return (
        <article className="skill-package-markdown">
            {frontmatter ? <SkillFrontmatterPanel frontmatter={frontmatter} /> : null}
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ children, href }) => <a href={href} target={isExternalURL(href) ? "_blank" : undefined} rel={isExternalURL(href) ? "noreferrer" : undefined} onClick={(event) => navigate(event, href)}>{children}</a>,
                    table: ({ children }) => <div className="skill-package-table-wrap"><table>{children}</table></div>,
                    img: ({ src, alt }) => {
                        if (isExternalURL(src)) return <img src={src} alt={alt || ""} loading="lazy" />;
                        const target = resolveSkillPath(currentPath, src || "");
                        if (target && filePaths.has(target)) return <button type="button" className="skill-package-inline-file" onClick={() => onNavigate(target)}><FileImage className="size-4" />{alt || target}</button>;
                        return <span className="skill-package-inline-missing">{alt || src || translate("account.feedback.image")}</span>;
                    },
                }}
            >{body}</ReactMarkdown>
        </article>
    );
}

function buildSkillTree(files: SkillPackageFile[]): DataNode[] {
    type MutableNode = DataNode & { children?: MutableNode[]; file?: SkillPackageFile };
    const roots: MutableNode[] = [];
    const folders = new Map<string, MutableNode>();
    for (const file of files) {
        const parts = file.path.split("/");
        let children = roots;
        let prefix = "";
        parts.forEach((part, index) => {
            const isLeaf = index === parts.length - 1;
            prefix = prefix ? `${prefix}/${part}` : part;
            if (isLeaf) {
                children.push({ key: file.path, title: treeTitle(part, file), icon: fileIcon(file), isLeaf: true, file });
                return;
            }
            let folder = folders.get(prefix);
            if (!folder) {
                folder = {
                    key: `folder:${prefix}`,
                    title: <span className="skill-package-folder-title">{part}</span>,
                    icon: ({ expanded }) => expanded ? <FolderOpen aria-hidden="true" className="size-4" /> : <Folder aria-hidden="true" className="size-4" />,
                    children: [],
                };
                folders.set(prefix, folder);
                children.push(folder);
            }
            children = folder.children || [];
        });
    }
    return roots;
}

function treeTitle(name: string, file: SkillPackageFile): ReactNode {
    return <span className="skill-package-tree-title"><span>{name}</span><span>{formatBytes(file.size)}</span></span>;
}

function fileIcon(file: SkillPackageFile) {
    if (file.kind === "markdown" || file.kind === "text") return <FileText aria-hidden="true" className="size-3.5" />;
    if (file.kind === "code") return <FileCode2 aria-hidden="true" className="size-3.5" />;
    if (file.kind === "image") return <FileImage aria-hidden="true" className="size-3.5" />;
    return <File aria-hidden="true" className="size-3.5" />;
}

function resolveSkillPath(currentPath: string, href: string) {
    const cleanHref = href.split("#", 1)[0]?.split("?", 1)[0] || "";
    if (!cleanHref || isExternalURL(cleanHref) || cleanHref.startsWith("/")) return "";
    const base = currentPath.split("/").slice(0, -1);
    let decoded = cleanHref;
    try {
        decoded = decodeURIComponent(cleanHref);
    } catch {
        return "";
    }
    for (const segment of decoded.replaceAll("\\", "/").split("/")) {
        if (!segment || segment === ".") continue;
        if (segment === "..") base.pop();
        else base.push(segment);
    }
    return base.join("/");
}

function isExternalURL(value?: string) {
    return Boolean(value && /^(https?:|mailto:|data:)/i.test(value));
}

function sourceLabel(source: string) {
    if (source === "github") return "GitHub";
    if (source === "zip") return translate("shared.skills.skillInstallModal.zIPSkillPackage");
    if (source === "builtin") return translate("shared.skills.skillDetailDrawer.builtInSkill");
    return "Markdown";
}

function formatBytes(value: number) {
    if (!value) return "0 B";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
