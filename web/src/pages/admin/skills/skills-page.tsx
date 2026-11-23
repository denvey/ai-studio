import { App, Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { ArchiveRestore, ArchiveX, Code2, Eye, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { Select } from "@/components/ui/base/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { SkillEditorDrawer } from "@/pages/skills/skill-editor-drawer";
import { fallbackSkillCategories, skillCategoryLabel } from "@/pages/skills/skill-catalog";
import { deleteAdminSkill, listAdminSkills, setAdminSkillEnabled, updateAdminSkillInfo, type AdminSkill, type AdminSkillSourceFilter, type AdminSkillStatusFilter } from "@/services/api/admin-skills";
import type { SkillCategory } from "@/services/api/skills";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminSearchInput } from "../components/admin-search-input";
import { AdminDataTable, AdminRowActions, AdminStatusBadge, AdminTableEmpty, PaginationBar, type AdminRowAction } from "../components/admin-ui";
import { translate } from "@/i18n";

const sourceLabels: Record<string, string> = { builtin: translate("adminPages.skills.skillsPage.builtIn"), markdown: "Markdown", zip: translate("adminPages.skills.skillsPage.skillPackage"), github: "GitHub" };
const statusOptions: Array<{ value: AdminSkillStatusFilter; label: string }> = [
    { value: "", label: translate("library.ark.expiry.all") },
    { value: "enabled", label: translate("adminPages.skills.skillsPage.published") },
    { value: "disabled", label: translate("adminPages.skills.skillsPage.unpublished") },
];
const sourceOptions: Array<{ value: AdminSkillSourceFilter; label: string }> = [
    { value: "", label: translate("adminPages.skills.skillsPage.allSources") },
    { value: "builtin", label: translate("adminPages.skills.skillsPage.builtIn") },
    { value: "markdown", label: "Markdown" },
    { value: "zip", label: translate("adminPages.skills.skillsPage.skillPackage") },
    { value: "github", label: "GitHub" },
];
const pageSizes = [20, 50, 100];

function sourceLabel(sourceType: string) {
    return sourceLabels[sourceType] || "Markdown";
}

/** 后台技能管理：全站技能（含私有和已下架）的基本信息、内容、上下架与删除。 */
export default function AdminSkillsPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const keyword = searchParams.get("keyword") || "";
    const status = (searchParams.get("status") || "") as AdminSkillStatusFilter;
    const sourceType = (searchParams.get("sourceType") || "") as AdminSkillSourceFilter;
    const tag = searchParams.get("tag") || "";
    const rawPage = Number(searchParams.get("page") || 1);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const rawSize = Number(searchParams.get("pageSize") || 20);
    const pageSize = pageSizes.includes(rawSize) ? rawSize : 20;
    const debouncedKeyword = useDebouncedValue(keyword);

    const [skills, setSkills] = useState<AdminSkill[]>([]);
    const [categories, setCategories] = useState<SkillCategory[]>(fallbackSkillCategories);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [editing, setEditing] = useState<AdminSkill | null>(null);
    const filtered = Boolean(keyword || status || sourceType || tag);

    const update = useCallback(
        (patch: Record<string, string | number>, replace = false) => {
            setSearchParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    for (const [key, value] of Object.entries(patch)) {
                        if (value === "" || (key === "page" && value === 1) || (key === "pageSize" && value === 20)) next.delete(key);
                        else next.set(key, String(value));
                    }
                    return next;
                },
                { replace },
            );
        },
        [setSearchParams],
    );

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        listAdminSkills({ keyword: debouncedKeyword || undefined, status: status || undefined, sourceType: sourceType || undefined, tag: tag || undefined, page, pageSize }, controller.signal)
            .then((data) => {
                if (controller.signal.aborted) return;
                setSkills(data.skills);
                setTotal(data.total);
                if (data.categories.length) setCategories(data.categories);
                if (page > 1 && data.skills.length === 0 && data.total > 0) update({ page: 1 }, true);
            })
            .catch((cause) => {
                if (controller.signal.aborted) return;
                setSkills([]);
                setTotal(0);
                setError(cause instanceof Error ? cause.message : translate("adminPages.skills.skillsPage.failedToLoadSkillList"));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [debouncedKeyword, status, sourceType, tag, page, pageSize, reloadKey, update]);

    const replaceSkill = useCallback((next: AdminSkill) => setSkills((items) => items.map((item) => (item.skillId === next.skillId ? next : item))), []);

    const toggleEnabled = useCallback(
        async (skill: AdminSkill) => {
            try {
                const result = await setAdminSkillEnabled(skill.skillId, !skill.enabled);
                replaceSkill(result.skill);
                message.success(result.skill.enabled ? translate("adminPages.skills.skillsPage.published2", { v0: String(skill.skillName) }) : translate("adminPages.skills.skillsPage.unpublished2", { v0: String(skill.skillName) }));
            } catch (cause) {
                message.error(cause instanceof Error ? cause.message : translate("adminPages.skills.skillsPage.failedToChangePublicationStatus"));
            }
        },
        [message, replaceSkill],
    );

    const remove = useCallback(
        async (skill: AdminSkill) => {
            try {
                await deleteAdminSkill(skill.skillId);
                message.success(translate("adminPages.skills.skillsPage.deleted", { v0: String(skill.skillName) }));
                setReloadKey((value) => value + 1);
            } catch (cause) {
                message.error(cause instanceof Error ? cause.message : translate("adminPages.skills.skillsPage.failedToDeleteSkill"));
            }
        },
        [message],
    );

    const columns = useMemo<ColumnsType<AdminSkill>>(
        () => [
            {
                key: "skill",
                title: translate("nav.sidebar.skills"),
                render: (_, skill) => (
                    <div className="min-w-0 max-w-[420px]">
                        <div className="flex min-w-0 items-center gap-2">
                            <button type="button" className="admin-table-primary-link truncate font-medium" title={translate("adminPages.skills.skillsPage.editBasicInformation")} onClick={() => setEditing(skill)}>
                                {skill.skillName}
                            </button>
                            {skill.isPrivate ? <AdminStatusBadge label={translate("adminPages.skills.skillsPage.private")} /> : null}
                            {skill.adminInfoEditedAt || skill.adminContentEditedAt ? <AdminStatusBadge label={translate("adminPages.skills.skillsPage.editedByAdmin")} tone="info" title={adminEditTitle(skill)} /> : null}
                        </div>
                        <div className="line-clamp-1 text-xs text-foreground/50" title={skill.description}>
                            {skill.description}
                        </div>
                    </div>
                ),
            },
            {
                key: "source",
                title: translate("canvasA.assetView.origin"),
                width: 120,
                render: (_, skill) => (
                    <div className="min-w-0">
                        <div>{sourceLabel(skill.sourceType)}</div>
                        {skill.sourceType === "github" && skill.sourceUrl ? (
                            <div className="truncate text-xs text-foreground/50" title={skill.sourceUrl}>
                                {skill.sourceUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
                            </div>
                        ) : null}
                    </div>
                ),
            },
            { key: "author", title: translate("adminPages.skills.skillsPage.author"), width: 140, render: (_, skill) => <span className="truncate">{skill.effectiveUser.name || "—"}</span> },
            { key: "tag", title: translate("library.picker.category"), width: 110, render: (_, skill) => skillCategoryLabel(skill.tag, categories) },
            {
                key: "version",
                title: translate("canvasA.assetView.version"),
                width: 130,
                render: (_, skill) => (
                    <span className="text-xs tabular-nums" title={skill.versionId}>
                        {translate("adminPages.skills.skillsPage.vFiles", { v0: String(skill.version || "1"), v1: String(skill.fileCount || 1) })}
                    </span>
                ),
            },
            { key: "added", title: translate("adminPages.skills.skillsPage.adds"), width: 80, align: "center", render: (_, skill) => <span className="tabular-nums">{skill.addedCount}</span> },
            {
                key: "status",
                title: translate("library.tasks.detail.status"),
                width: 90,
                render: (_, skill) => <AdminStatusBadge label={skill.enabled ? translate("adminPages.skills.skillsPage.published") : translate("adminPages.skills.skillsPage.unpublished")} tone={skill.enabled ? "success" : "warning"} />,
            },
            { key: "updatedAt", title: translate("adminPages.skills.skillsPage.updatedAt"), width: 150, render: (_, skill) => <span className="text-xs tabular-nums">{dayjs(skill.updatedAt).format("YYYY-MM-DD HH:mm")}</span> },
            {
                key: "actions",
                title: translate("account.settings.runninghub.actions"),
                // 编辑信息 + 编辑内容/查看文件 + 上/下架 + 更多 实测约 295px，再加单元格左右 12px 内边距。
                width: 328,
                fixed: "right",
                render: (_, skill) => {
                    const actions: AdminRowAction[] = [
                        {
                            key: "content",
                            label: skill.contentEditable ? translate("adminPages.skills.skillsPage.editContent") : translate("adminPages.skills.skillsPage.viewFiles"),
                            icon: skill.contentEditable ? <Code2 className="size-3.5" /> : <Eye className="size-3.5" />,
                            onClick: () => navigate(`/admin/skills/${encodeURIComponent(skill.skillId)}/edit`),
                        },
                        skill.enabled
                            ? {
                                  key: "disable",
                                  label: translate("adminPages.skills.skillsPage.unpublish"),
                                  icon: <ArchiveX className="size-3.5" />,
                                  confirm: {
                                      title: translate("adminPages.skills.skillsPage.unpublish2", { v0: String(skill.skillName) }),
                                      description: translate("adminPages.skills.skillsPage.theSkillWillBeHiddenFromTheSkillMarketplaceUsers"),
                                      okText: translate("adminPages.skills.skillsPage.confirmUnpublish"),
                                  },
                                  onClick: () => toggleEnabled(skill),
                              }
                            : { key: "enable", label: translate("adminPages.skills.skillsPage.publish"), icon: <ArchiveRestore className="size-3.5" />, onClick: () => toggleEnabled(skill) },
                        {
                            key: "delete",
                            label: translate("common.delete"),
                            icon: <Trash2 className="size-3.5" />,
                            danger: true,
                            confirm: {
                                title: translate("adminPages.skills.skillsPage.permanentlyDelete", { v0: String(skill.skillName) }),
                                description:
                                    skill.sourceType === "builtin" ? translate("adminPages.skills.skillsPage.allVersionsFilesAndUserAddFavoriteRecordsForThis") : translate("adminPages.skills.skillsPage.allVersionsFilesAndUserAddFavoriteRecordsForThis2"),
                                okText: translate("adminPages.skills.skillsPage.deletePermanently"),
                            },
                            onClick: () => remove(skill),
                        },
                    ];
                    return <AdminRowActions primary={{ label: translate("adminPages.skills.skillsPage.editInformation"), icon: <Pencil className="size-3.5" />, onClick: () => setEditing(skill) }} actions={actions} visibleActionCount={2} />;
                },
            },
        ],
        [categories, navigate, remove, toggleEnabled],
    );

    return (
        <AdminPageFrame
            title={translate("adminPages.skills.skillsPage.skillManagement")}
            description={translate("adminPages.skills.skillsPage.allSiteSkillsIncludingPrivateAndUnpublishedSkillsOnlyBasic")}
            actions={
                <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => setReloadKey((value) => value + 1)}>
                    {translate("common.refresh")}
                </Button>
            }
        >
            <AdminDataTable<AdminSkill>
                toolbar={
                    <AdminSearchInput
                        allowClear
                        className="app-list-search"
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={keyword}
                        placeholder={translate("adminPages.skills.skillsPage.searchNameDescriptionAuthorIDOrRepository")}
                        aria-label={translate("canvasA.skillLibrary.searchPlaceholder")}
                        onValueChange={(value) => update({ keyword: value, page: 1 }, true)}
                    />
                }
                toolbarActive={filtered}
                onReset={() => update({ keyword: "", status: "", sourceType: "", tag: "", page: 1 })}
                toolbarFilters={
                    <>
                        <Select className="w-32" ariaLabel={translate("adminPages.skills.skillsPage.publicationStatus")} value={status} options={statusOptions} onChange={(value) => update({ status: value, page: 1 })} />
                        <Select className="w-32" ariaLabel={translate("adminPages.skills.skillsPage.skillSource")} value={sourceType} options={sourceOptions} onChange={(value) => update({ sourceType: value, page: 1 })} />
                        <Select
                            className="w-32"
                            ariaLabel={translate("adminPages.skills.skillsPage.skillCategory")}
                            value={tag}
                            options={[{ value: "", label: translate("canvasA.skillLibrary.allCategories") }, ...categories.map(({ value, label }) => ({ value, label }))]}
                            onChange={(value) => update({ tag: value, page: 1 })}
                        />
                    </>
                }
                empty={
                    error ? (
                        <div className="admin-inline-load-error" role="status">
                            <span>
                                {translate("adminPages.skills.skillsPage.skillListIsTemporarilyUnavailable")}
                                {error}
                            </span>
                            <Button size="small" onClick={() => setReloadKey((value) => value + 1)}>
                                {translate("common.retry")}
                            </Button>
                        </div>
                    ) : (
                        <AdminTableEmpty
                            filtered={filtered}
                            title={filtered ? translate("adminPages.skills.skillsPage.noSkillsMatchTheFilters") : translate("adminPages.skills.skillsPage.noSkillsYet")}
                            description={filtered ? translate("adminPages.skills.skillsPage.adjustTheFiltersAndTryAgain") : undefined}
                        />
                    )
                }
                footer={<PaginationBar alwaysShow current={page} pageSize={pageSize} total={total} pageSizeOptions={pageSizes} onChange={(next, size) => update({ page: next, pageSize: size })} />}
                skeletonColumns={columns.length}
                table={{ className: "app-data-table", size: "small", rowKey: "skillId", loading, columns, dataSource: skills, pagination: false, scroll: { x: 1430 } }}
            />
            <SkillEditorDrawer
                open={Boolean(editing)}
                skill={editing}
                admin={{ save: updateAdminSkillInfo }}
                onClose={() => setEditing(null)}
                onSaved={(next) => {
                    replaceSkill(next as AdminSkill);
                    setEditing(null);
                }}
            />
        </AdminPageFrame>
    );
}

function adminEditTitle(skill: AdminSkill) {
    const parts: string[] = [];
    if (skill.adminInfoEditedAt) parts.push(translate("adminPages.skills.skillsPage.basicInformation", { v0: String(dayjs(skill.adminInfoEditedAt).format("YYYY-MM-DD HH:mm")) }));
    if (skill.adminContentEditedAt) parts.push(translate("adminPages.skills.skillsPage.fileContent", { v0: String(dayjs(skill.adminContentEditedAt).format("YYYY-MM-DD HH:mm")) }));
    return translate("adminPages.skills.skillsPage.editedByAnAdministratorBuiltInSkillUpdatesAndGitHub", { v0: String(parts.join("；")) });
}
