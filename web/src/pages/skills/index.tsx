import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { AppModal } from "@/components/ui/product/app-modal";
import { App, Button, Dropdown, Input } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";

import { Boxes, Check, ChevronDown, ChevronRight, Clapperboard, FolderInput, FolderPlus, Globe2, Heart, Library, LoaderCircle, Lock, Megaphone, MoreHorizontal, Palette, Pencil, Plus, Puzzle, Search, ShoppingBag, Sparkles, Trash2, UserRound, Users, Info, LayoutGrid, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceState } from "@/components/layout/workspace-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { fallbackSkillCategories, formatSkillCount, skillAccent, skillCategoryLabel, skillGlyph } from "@/pages/skills/skill-catalog";
import { SkillDetailModal } from "@/pages/skills/skill-detail-drawer";
import { SkillEditorDrawer } from "@/pages/skills/skill-editor-drawer";
import { SkillInstallModal } from "@/pages/skills/skill-install-modal";
import { addSkill, createSkillLibraryCategory, deleteSkill, deleteSkillLibraryCategory, getSkill, likeSkill, listSkillLibraryCategories, listSkills, removeSkill, setSkillLibraryCategory, syncSkill, unlikeSkill, type Skill, type SkillCategory, type SkillLibraryCategory, type SkillLibraryCategoryList, type SkillScope, type SkillSort } from "@/services/api/skills";
import { useUserStore } from "@/stores/use-user-store";
import { Select } from "@/components/ui/base/select";
import { useSkillCuration, curationQuery, curationIcon, effectiveCurationRoot } from "@/components/skills/skill-curation-browser";
import { SkillRecommendationsModal } from "@/components/skills/skill-recommendations-modal";
import { translate } from "@/i18n";


const scopeOptions: { label: string; value: SkillScope; icon: LucideIcon }[] = [
    { label: translate("shared.skills.skillSquare"), value: "public", icon: Store },
    { label: translate("shared.skills.mySkills"), value: "mine", icon: Library },
    { label: translate("library.ark.scope.owned"), value: "created", icon: UserRound },
    { label: translate("shared.skills.myFavorites"), value: "favorites", icon: Heart },
];

/* 分类图标映射：左侧导航里的分类图标，未知分类回退 Boxes。 */
const categoryIcons: Record<string, LucideIcon> = {
    drama: Clapperboard,
    ecommerce: ShoppingBag,
    creative: Palette,
    social: Megaphone,
    others: Puzzle,
};
const categoryIconOf = (value: string) => categoryIcons[value] ?? Boxes;

const sortOptions: { label: string; value: SkillSort }[] = [
    { label: translate("shared.skills.maxJoins"), value: "popular" },
    { label: translate("shared.skills.recentlyPublished"), value: "new" },
    { label: translate("shared.skills.lastUpdated"), value: "updated" },
];

/**
 * 技能库：左侧一条导航（范围 → 当前范围下的分类），右侧是结果标题、搜索排序和卡片网格。
 * 范围切换会清空分类筛选，避免切到「我的技能」后仍带着广场分类这类看不见的过滤条件。
 */
export default function SkillsPage() {
    const { curation, error: curationError, retry: retryCuration } = useSkillCuration();
    const [platformCategory, setPlatformCategory] = useState("");
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const [scope, setScope] = useState<SkillScope>("public");
    const [sort, setSort] = useState<SkillSort>("popular");
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search, 250);
    const [tag, setTag] = useState("all");
    useEffect(() => { if (curation?.enabled) setTag("all"); }, [curation?.enabled]);
    const [libraryCategoryId, setLibraryCategoryId] = useState("all");
    const [libraryCategoryList, setLibraryCategoryList] = useState<SkillLibraryCategoryList | null>(null);
    const [libraryCategoryError, setLibraryCategoryError] = useState("");
    const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
    const [categoryName, setCategoryName] = useState("");
    const [categoryScope, setCategoryScope] = useState<"personal" | "platform">("personal");
    const [categorySaving, setCategorySaving] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [skills, setSkills] = useState<Skill[]>([]);
    const [categories, setCategories] = useState<SkillCategory[]>(fallbackSkillCategories);
    const [total, setTotal] = useState(0);
    const [scopeCounts, setScopeCounts] = useState<Partial<Record<SkillScope, number>>>({});
    const [countsKey, setCountsKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [mutatingID, setMutatingID] = useState("");
    const [editorOpen, setEditorOpen] = useState(false);
    const [installOpen, setInstallOpen] = useState(false);
    const [recommendationsOpen, setRecommendationsOpen] = useState(false);
    const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
    const isAdmin = useUserStore((state) => state.user?.role === "admin");
    const isLibraryScope = scope === "mine" || scope === "created";
    const libraryCategoryScope = scope === "created" ? "created" : "mine";

    const reload = useCallback(() => setReloadKey((value) => value + 1), []);
    const refreshCounts = useCallback(() => setCountsKey((value) => value + 1), []);
    const selectScope = (next: SkillScope) => {
        setScope(next);
        setTag("all");
        setPlatformCategory("");
        setLibraryCategoryId("all");
        setPage(1);
    };
    const selectMarketplaceCategory = (categoryId: string, nextPlatformCategory = "") => {
        setTag(categoryId);
        setPlatformCategory(nextPlatformCategory);
        setPage(1);
    };
    const selectLibraryCategory = (categoryId: string) => {
        setLibraryCategoryId(categoryId);
        setPage(1);
    };

    /* 平台策展分类失效（被停用或策展关闭）时回到「全部」，原先由下拉选择器承担的校验移到这里。 */
    useEffect(() => {
        if (!platformCategory) return;
        const valid = platformCategory === "__uncategorized__"
            || (platformCategory.startsWith("root:") ? curation?.roots?.some((root) => root.id === platformCategory.slice(5)) : curation?.categories.some((item) => item.id === platformCategory));
        if (!curation?.enabled || !valid) {
            setPlatformCategory("");
            setPage(1);
        }
    }, [curation, platformCategory]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError("");
        const libraryFilter = isLibraryScope
            ? libraryCategoryId === "__uncategorized__"
                ? { libraryUncategorized: true }
                : libraryCategoryId !== "all" ? { libraryCategoryId } : {}
            : {};
        listSkills({ page, pageSize, scope, sort, search: debouncedSearch || undefined, tag: !isLibraryScope && tag !== "all" ? tag : undefined, ...libraryFilter, ...(isLibraryScope ? {} : curationQuery(curation, platformCategory)) })
            .then((result) => {
                if (cancelled) return;
                setSkills(result.skills);
                setTotal(result.totalCount);
                if (result.categories.length) setCategories(result.categories);
            })
            .catch((error) => {
                if (cancelled) return;
                setSkills([]);
                setTotal(0);
                setLoadError(error instanceof Error ? error.message : translate("shared.skills.failedToLoadSkills"));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [debouncedSearch, isLibraryScope, libraryCategoryId, page, pageSize, reloadKey, scope, sort, tag, curation, platformCategory]);

    /* 范围计数：每个范围只取 1 条记录读 totalCount，与当前搜索/分类无关，写操作后刷新。 */
    useEffect(() => {
        let cancelled = false;
        void Promise.allSettled(scopeOptions.map((option) => listSkills({ scope: option.value, page: 1, pageSize: 1 }))).then((results) => {
            if (cancelled) return;
            const next: Partial<Record<SkillScope, number>> = {};
            results.forEach((result, index) => {
                if (result.status === "fulfilled") next[scopeOptions[index].value] = result.value.totalCount;
            });
            setScopeCounts(next);
        });
        return () => { cancelled = true; };
    }, [reloadKey, countsKey]);

    useEffect(() => {
        let cancelled = false;
        setLibraryCategoryError("");
        listSkillLibraryCategories(libraryCategoryScope)
            .then((result) => { if (!cancelled) setLibraryCategoryList(result); })
            .catch((error) => {
                if (!cancelled) {
                    setLibraryCategoryList(null);
                    setLibraryCategoryError(error instanceof Error ? error.message : translate("shared.skills.failedToLoadSkillLibraryCategories"));
                }
            });
        return () => { cancelled = true; };
    }, [libraryCategoryScope, reloadKey]);

    const curationRoots = curation?.enabled ? (curation.roots || []).filter((root) => root.enabled !== false) : [];
    const browseCategories: (SkillCategory & { iconKey?: string })[] = curation?.enabled ? curationRoots.map((root) => ({ value: root.id, label: root.name, iconKey: root.iconKey })) : categories;
    const activeCurationCategory = curation?.enabled && platformCategory && !platformCategory.startsWith("root:") && platformCategory !== "__uncategorized__" ? curation.categories.find((item) => item.id === platformCategory) : undefined;
    const activeCurationRootId = platformCategory.startsWith("root:") ? platformCategory.slice(5) : activeCurationCategory?.rootTag || "";
    const libraryCategories = libraryCategoryList?.categories ?? [];
    const scopeLabel = scopeOptions.find((option) => option.value === scope)?.label || translate("nav.sidebar.skills");
    const viewLabel = isLibraryScope
        ? libraryCategoryId === "all" ? scopeLabel : libraryCategoryId === "__uncategorized__" ? translate("account.settings.models.uncategorized") : libraryCategories.find((category) => category.id === libraryCategoryId)?.name || translate("library.picker.category")
        : curation?.enabled && platformCategory
          ? platformCategory === "__uncategorized__"
              ? translate("shared.skills.uncategorized")
              : [curationRoots.find((root) => root.id === activeCurationRootId)?.name, activeCurationCategory?.name].filter(Boolean).join(" / ") || translate("library.picker.category")
          : tag !== "all" ? skillCategoryLabel(tag, categories) : scopeLabel;
    const categoryFiltered = isLibraryScope ? libraryCategoryId !== "all" : Boolean(platformCategory) || tag !== "all";
    const filtersActive = Boolean(search || categoryFiltered || sort !== "popular");
    const resetFilters = useCallback(() => { setSearch(""); setTag("all"); setPlatformCategory(""); setLibraryCategoryId("all"); setSort("popular"); setPage(1); }, []);

    const openSkill = async (skill: Skill) => {
        setActiveSkill(skill);
        setDetailLoading(true);
        try {
            const result = await getSkill(skill.skillId);
            setActiveSkill(result.skill);
            patchSkill(result.skill);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.skills.failedToLoadSkillDetails"));
            setActiveSkill(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const openEditor = async (skill?: Skill) => {
        if (!skill) {
            setEditingSkill(null);
            setEditorOpen(true);
            return;
        }
        try {
            const result = skill.instruction ? { skill } : await getSkill(skill.skillId);
            setActiveSkill(null);
            setEditingSkill(result.skill);
            setEditorOpen(true);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.skills.failedToReadSkill"));
        }
    };

    const openWorkbench = (skill: Skill) => {
        setActiveSkill(null);
        navigate(`/skills/${encodeURIComponent(skill.skillId)}/edit`);
    };

    const patchSkill = (next: Skill) => {
        setSkills((items) => items.map((item) => item.skillId === next.skillId ? { ...item, ...next, instruction: next.instruction || item.instruction } : item));
        setActiveSkill((current) => current?.skillId === next.skillId ? { ...current, ...next, instruction: next.instruction || current.instruction } : current);
    };

    const toggleAdded = async (skill: Skill) => {
        if (skill.isOwner) return;
        setMutatingID(skill.skillId);
        try {
            const result = skill.isAdded ? await removeSkill(skill.skillId) : await addSkill(skill.skillId);
            patchSkill(result.skill);
            message.success(result.skill.isAdded ? translate("shared.skills.workbench.addedToMySkills") : translate("shared.skills.removedFromMySkills"));
            if (scope === "mine") reload();
            else refreshCounts();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.skills.failedToUpdateSkillStatus"));
        } finally {
            setMutatingID("");
        }
    };

    const toggleLiked = async (skill: Skill) => {
        setMutatingID(skill.skillId);
        try {
            const result = skill.isLike ? await unlikeSkill(skill.skillId) : await likeSkill(skill.skillId);
            patchSkill(result.skill);
            message.success(result.skill.isLike ? translate("shared.skills.skillDetailDrawer.favorited") : translate("shared.skills.removedFromFavorites"));
            if (scope === "favorites" && !result.skill.isLike) reload();
            else refreshCounts();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.skills.couldNotUpdateTheFavorite"));
        } finally {
            setMutatingID("");
        }
    };

    const synchronizeSkill = async (skill: Skill) => {
        setMutatingID(skill.skillId);
        try {
            const result = await syncSkill(skill.skillId);
            patchSkill(result.skill);
            message.success(result.skill.versionId === skill.versionId ? translate("shared.skills.alreadyUpToDate") : translate("shared.skills.latestVersionSynced"));
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.skills.failedToSyncGitHubSkill"));
        } finally {
            setMutatingID("");
        }
    };

    const confirmDelete = (skill: Skill) => {
        modal.confirm({
            title: translate("shared.skills.delete", { v0: String(skill.skillName) }),
            content: translate("shared.skills.onceDeletedOtherUsersCanNoLongerUseThisSkill"),
            okText: translate("shared.skills.deleteSkill"),
            okButtonProps: { danger: true },
            cancelText: translate("common.cancel"),
            onOk: async () => {
                try {
                    await deleteSkill(skill.skillId);
                    setActiveSkill(null);
                    message.success(translate("shared.skills.skillDeleted"));
                    reload();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("shared.skills.failedToDeleteSkill"));
                    throw error;
                }
            },
        });
    };

    const saveLibraryCategory = async () => {
        const name = categoryName.trim();
        if (!name) {
            message.error(translate("shared.skills.enterACategoryName"));
            return;
        }
        setCategorySaving(true);
        try {
            await createSkillLibraryCategory({ name, scope: isAdmin ? categoryScope : "personal" });
            message.success(translate("shared.skills.skillLibraryCategoryCreated"));
            setCategoryEditorOpen(false);
            setCategoryName("");
            setLibraryCategoryId("all");
            setPage(1);
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.skills.failedToCreateCategory"));
        } finally {
            setCategorySaving(false);
        }
    };

    const confirmDeleteLibraryCategory = (category: SkillLibraryCategory) => {
        modal.confirm({
            title: translate("shared.skills.deleteCategory", { v0: String(category.name) }),
            content: translate("shared.skills.deletingACategoryOnlyRemovesItsSkillAssociationsTheSkills"),
            okText: translate("shared.skills.deleteCategory2"),
            okButtonProps: { danger: true },
            cancelText: translate("common.cancel"),
            onOk: async () => {
                try {
                    await deleteSkillLibraryCategory(category.id);
                    if (libraryCategoryId === category.id) setLibraryCategoryId("all");
                    message.success(translate("shared.skills.categoryDeletedSkillsRemainInTheLibrary"));
                    reload();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("shared.skills.failedToDeleteCategory"));
                    throw error;
                }
            },
        });
    };

    const assignLibraryCategory = async (skill: Skill, categoryId: string) => {
        setMutatingID(skill.skillId);
        try {
            const result = await setSkillLibraryCategory(skill.skillId, categoryId);
            patchSkill(result.skill);
            message.success(categoryId ? translate("shared.skills.skillCategorized") : translate("shared.skills.skillCategoryRemoved"));
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("shared.skills.failedToCategorizeSkill"));
        } finally {
            setMutatingID("");
        }
    };

    const openCategoryEditor = () => { setCategoryName(""); setCategoryScope("personal"); setCategoryEditorOpen(true); };

    const renderSkillCard = (skill: Skill) => {
        const rootId = curation?.enabled ? effectiveCurationRoot(skill, curation) : "";
        const rootLabel = rootId ? curationRoots.find((root) => root.id === rootId)?.name : undefined;
        return (
            <SkillCard
                key={skill.skillId}
                skill={skill}
                accentKey={rootId && rootId !== "__unassigned__" ? rootId : skill.tag}
                categoryLabel={!isLibraryScope && !categoryFiltered ? rootLabel || skillCategoryLabel(skill.tag, categories) : undefined}
                libraryCategories={libraryCategories}
                canCategorize={isLibraryScope}
                loading={mutatingID === skill.skillId}
                onOpen={() => void openSkill(skill)}
                onAdd={() => void toggleAdded(skill)}
                onLike={() => void toggleLiked(skill)}
                onEdit={() => void openEditor(skill)}
                onOpenWorkbench={() => openWorkbench(skill)}
                onDelete={() => confirmDelete(skill)}
                onSetLibraryCategory={(categoryId) => void assignLibraryCategory(skill, categoryId)}
            />
        );
    };

    const skillContent = loading && !skills.length ? <SkillSkeleton /> : loadError ? <WorkspaceErrorState compact description={loadError} onRetry={reload} /> : skills.length ? (
        <div className={cn("skill-tile-grid", loading && "is-refreshing")} aria-busy={loading}>
            {skills.map(renderSkillCard)}
        </div>
    ) : (
        <WorkspaceState
            compact
            className="min-h-[188px]"
            icon="skills"
            title={filtersActive ? (search.trim() ? translate("shared.skills.noSkillsFoundFor", { v0: String(search.trim()) }) : translate("shared.skills.noSkillsMatchYourFilters")) : scope === "created" ? translate("shared.skills.noSkillsCreatedYet") : scope === "public" ? translate("shared.skills.theSkillSquareIsStillEmpty") : translate("shared.skills.noSkillsHereYet")}
            description={filtersActive ? translate("shared.skills.tryAnotherKeywordOrCategoryOrClearFiltersToView") : scope === "favorites" ? translate("shared.skills.publicSkillsYouFavoriteAppearHere") : scope === "mine" ? translate("shared.skills.skillsYouJoinFromTheSkillSquareAppearHere") : translate("shared.skills.createAndPublishYourFirstSkillSoOtherUsersCan")}
            action={filtersActive
                ? <Button onClick={resetFilters}>{translate("account.layout.state.clearFilters")}</Button>
                : scope === "mine"
                  ? <Button onClick={() => selectScope("public")}>{translate("shared.skills.exploreSkills")}</Button>
                  : (scope === "created" || scope === "public")
                    ? <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setInstallOpen(true)}>{translate("shared.skills.installSkill")}</Button>
                    : undefined}
        />
    );

    const railItem = ({ key, label, icon: Icon, count, active, nested = false, onClick }: { key: string; label: string; icon?: LucideIcon; count?: number; active: boolean; nested?: boolean; onClick: () => void }) => (
        <button key={key} type="button" className={cn("skills-rail-item", nested && "is-nested")} aria-pressed={active} onClick={onClick}>
            {Icon ? <Icon aria-hidden="true" /> : null}
            <span className="skills-rail-item-label">{label}</span>
            {count !== undefined ? <span className="skills-rail-count">{formatSkillCount(count)}</span> : null}
        </button>
    );

    const marketplaceAllActive = tag === "all" && !platformCategory;

    return (
        <>
            <WorkspacePage className="library-page skills-library-page" grid>
                <PageHeader title={translate("nav.tools.skills")} description={translate("shared.skills.turnPromptsCharacterProfilesAndCreativeMethodsIntoSkillsYou")} />

                <div className="skills-browser">
                    <aside className="skills-rail" aria-label={translate("shared.skills.skillNavigation")}>
                        <nav className="skills-rail-group" aria-label={translate("shared.skills.skillScope")}>
                            {scopeOptions.map((option) => railItem({ key: option.value, label: option.label, icon: option.icon, count: scopeCounts[option.value], active: scope === option.value, onClick: () => selectScope(option.value) }))}
                        </nav>

                        {!isLibraryScope ? (
                            <section className="skills-rail-section" aria-labelledby="skills-rail-categories">
                                <div className="skills-rail-heading"><span id="skills-rail-categories" className="collection-filter-label">{translate("library.picker.category")}</span></div>
                                {curationError ? <div className="skills-rail-error" role="alert">{curationError}<Button type="link" size="small" onClick={retryCuration}>{translate("common.retry")}</Button></div> : null}
                                <div className="skills-rail-group">
                                    {railItem({ key: "all", label: translate("canvasA.toolPicker.all"), icon: LayoutGrid, active: marketplaceAllActive, onClick: () => selectMarketplaceCategory("all") })}
                                    {browseCategories.map((category) => {
                                        const Icon = curation?.enabled ? curationIcon(category.iconKey) : categoryIconOf(category.value);
                                        if (!curation?.enabled) return railItem({ key: category.value, label: category.label, icon: Icon, count: category.count, active: tag === category.value, onClick: () => selectMarketplaceCategory(category.value) });
                                        const children = activeCurationRootId === category.value ? curation.categories.filter((item) => item.rootTag === category.value && item.enabled !== false) : [];
                                        return [
                                            railItem({ key: category.value, label: category.label, icon: Icon, active: platformCategory === `root:${category.value}`, onClick: () => selectMarketplaceCategory("all", `root:${category.value}`) }),
                                            ...children.map((child) => railItem({ key: child.id, label: child.name, nested: true, active: platformCategory === child.id, onClick: () => selectMarketplaceCategory("all", child.id) })),
                                        ];
                                    })}
                                    {curation?.enabled ? railItem({ key: "__uncategorized__", label: translate("shared.skills.uncategorized"), icon: FolderInput, active: platformCategory === "__uncategorized__", onClick: () => selectMarketplaceCategory("all", "__uncategorized__") }) : null}
                                </div>
                            </section>
                        ) : (
                            <section className="skills-rail-section" aria-labelledby="skills-rail-library">
                                <div className="skills-rail-heading">
                                    <span id="skills-rail-library" className="collection-filter-label">{translate("library.assets.page.myFolders")}</span>
                                    <Tooltip title={translate("library.assets.folder.create")}>
                                        <button type="button" className="product-icon-button skills-rail-add" aria-label={translate("shared.skills.newSkillLibraryCategory")} onClick={openCategoryEditor}><FolderPlus /></button>
                                    </Tooltip>
                                </div>
                                {libraryCategoryError ? <div className="skills-rail-error" role="alert">{libraryCategoryError}<Button type="link" size="small" onClick={reload}>{translate("common.retry")}</Button></div> : null}
                                <div className="skills-rail-group">
                                    {railItem({ key: "all", label: translate("canvasA.toolPicker.all"), icon: Library, count: libraryCategoryList?.totalCount, active: libraryCategoryId === "all", onClick: () => selectLibraryCategory("all") })}
                                    {railItem({ key: "__uncategorized__", label: translate("account.settings.models.uncategorized"), icon: FolderInput, count: libraryCategoryList?.uncategorizedCount, active: libraryCategoryId === "__uncategorized__", onClick: () => selectLibraryCategory("__uncategorized__") })}
                                    {libraryCategories.map((category) => (
                                        <div key={category.id} className="skills-rail-row">
                                            {railItem({ key: category.id, label: category.name, icon: category.scope === "platform" ? Globe2 : FolderInput, count: category.count, active: libraryCategoryId === category.id, onClick: () => selectLibraryCategory(category.id) })}
                                            {category.scope === "personal" || isAdmin ? (
                                                <button type="button" className="product-icon-button skills-rail-delete" aria-label={translate("shared.skills.deleteCategory3", { v0: String(category.name) })} title={translate("shared.skills.deleteCategory2")} onClick={() => confirmDeleteLibraryCategory(category)}>
                                                    <Trash2 aria-hidden="true" />
                                                </button>
                                            ) : null}
                                        </div>
                                    ))}
                                    {!libraryCategories.length && libraryCategoryList ? (
                                        <button type="button" className="skills-rail-item is-hint" onClick={openCategoryEditor}>
                                            <Plus aria-hidden="true" />
                                            <span className="skills-rail-item-label">{translate("shared.skills.createCategoriesToOrganizeSkills")}</span>
                                        </button>
                                    ) : null}
                                </div>
                            </section>
                        )}
                    </aside>

                    <section className="skills-results" aria-labelledby="skills-results-title">
                        <div className="skills-results-header">
                            <div className="skills-results-title">
                                {viewLabel !== scopeLabel ? (
                                    <>
                                        <button type="button" className="skills-results-scope" onClick={() => selectScope(scope)}>{scopeLabel}</button>
                                        <ChevronRight className="skills-results-separator" aria-hidden="true" />
                                    </>
                                ) : null}
                                <h2 id="skills-results-title">{viewLabel}</h2>
                                <span className="app-projects-header-meta">{loading && !skills.length ? "—" : translate("shared.skills.skills", { v0: String(total) })}</span>
                            </div>
                            <CollectionToolbar label={translate("shared.skills.searchAndSortSkills")} active={filtersActive} onReset={resetFilters} trailing={<><Button icon={<Sparkles className="size-4" />} onClick={() => setRecommendationsOpen(true)}>{translate("shared.skills.recommendedByIndustry")}</Button><Button type="primary" icon={<Plus className="size-4" />} onClick={() => setInstallOpen(true)}>{translate("shared.skills.installSkill")}</Button></>}>
                                <Input className="min-w-0 sm:!w-56" prefix={<Search />} value={search} allowClear placeholder={translate("shared.skills.searchSkillsOrAuthors")} aria-label={translate("shared.skills.searchSkillsOrAuthors")} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
                                <Select aria-label={translate("shared.skills.sortSkills")} className="w-28" value={sort} options={sortOptions} onChange={(value) => { setSort(value); setPage(1); }} />
                            </CollectionToolbar>
                        </div>
                        {skillContent}
                        <PaginationBar current={page} pageSize={pageSize} total={total} itemLabel={translate("shared.plugins.builtin.editor.editorExport.items")} pageSizeOptions={[20, 40, 80]} onChange={(nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); }} />
                    </section>
                </div>
            </WorkspacePage>

            <AppModal
                open={categoryEditorOpen}
                title={(
                    <div className="skills-library-category-title">
                        <span className="skills-library-category-title-icon"><FolderPlus className="size-4" aria-hidden="true" /></span>
                        <span>
                            <small>{translate("shared.skills.organizeSkillLibrary")}</small>
                            <strong>{translate("library.assets.folder.create")}</strong>
                        </span>
                    </div>
                )}
                className="library-modal skills-library-category-modal"
                width="min(480px, calc(100vw - 32px))"
                centered
                okText={translate("shared.skills.createCategory")}
                cancelText={translate("common.cancel")}
                okButtonProps={{ disabled: !categoryName.trim() }}
                confirmLoading={categorySaving}
                onOk={() => void saveLibraryCategory()}
                onCancel={() => setCategoryEditorOpen(false)}
                destroyOnHidden
            >
                <div className="skills-library-category-editor">
                    <div className="skills-library-category-field">
                        <label htmlFor="skills-library-category-name">{translate("shared.skills.categoryName")}</label>
                        <Input id="skills-library-category-name" autoFocus maxLength={64} showCount value={categoryName} onChange={(event) => setCategoryName(event.target.value)} onPressEnter={() => void saveLibraryCategory()} placeholder={translate("shared.skills.forExampleCharactersStoryboardsPromotion")} />
                        <span className="skills-library-category-field-hint">{translate("shared.skills.upTo64CharactersTheNameMustDifferFromExisting")}</span>
                    </div>
                    {isAdmin ? (
                        <div className="skills-library-category-scope">
                            <span className="skills-library-category-field-label">{translate("shared.skills.categoryScope")}</span>
                            <div className="skills-library-category-scope-options" role="group" aria-label={translate("shared.skills.categoryScope")}>
                                <button type="button" className={`skills-library-category-scope-option${categoryScope === "personal" ? " is-active" : ""}`} aria-pressed={categoryScope === "personal"} onClick={() => setCategoryScope("personal")}>
                                    <span className="skills-library-category-scope-icon"><UserRound className="size-4" aria-hidden="true" /></span>
                                    <span className="skills-library-category-scope-copy"><strong>{translate("shared.skills.personalCategory")}</strong><small>{translate("shared.skills.visibleAndUsableOnlyByYou")}</small></span>
                                    {categoryScope === "personal" ? <Check className="skills-library-category-scope-check size-4" aria-hidden="true" /> : null}
                                </button>
                                <button type="button" className={`skills-library-category-scope-option${categoryScope === "platform" ? " is-active" : ""}`} aria-pressed={categoryScope === "platform"} onClick={() => setCategoryScope("platform")}>
                                    <span className="skills-library-category-scope-icon"><Globe2 className="size-4" aria-hidden="true" /></span>
                                    <span className="skills-library-category-scope-copy"><strong>{translate("library.skills.curation.label")}</strong><small>{translate("shared.skills.visibleAndAssignableToAllUsers")}</small></span>
                                    {categoryScope === "platform" ? <Check className="skills-library-category-scope-check size-4" aria-hidden="true" /> : null}
                                </button>
                            </div>
                        </div>
                    ) : null}
                    <div className={`skills-library-category-note${categoryScope === "platform" && isAdmin ? " is-platform" : ""}`}>
                        <Info className="size-4" aria-hidden="true" />
                        <p>{categoryScope === "platform" && isAdmin
                            ? translate("shared.skills.platformCategoriesAreVisibleAndAssignableToAllUsersAnd")
                            : translate("shared.skills.personalCategoriesAffectYourSkillLibraryAndCanvasAgentOnly")}</p>
                    </div>
                </div>
            </AppModal>
            <SkillDetailModal skill={activeSkill} loading={detailLoading} mutating={Boolean(activeSkill && mutatingID === activeSkill.skillId)} categories={categories} onClose={() => setActiveSkill(null)} onAdd={(skill) => void toggleAdded(skill)} onLike={(skill) => void toggleLiked(skill)} onEdit={(skill) => void openEditor(skill)} onOpenWorkbench={openWorkbench} onSync={(skill) => void synchronizeSkill(skill)} />
            <SkillInstallModal open={installOpen} onClose={() => setInstallOpen(false)} onInstalled={(skill) => { setInstallOpen(false); setActiveSkill(skill); reload(); }} onManualCreate={() => { setInstallOpen(false); void openEditor(); }} />
            <SkillRecommendationsModal open={recommendationsOpen} onClose={() => setRecommendationsOpen(false)} onInstalled={(installed) => { if (installed.length) { reload(); refreshCounts(); } }} />
            <SkillEditorDrawer open={editorOpen} skill={editingSkill} onClose={() => setEditorOpen(false)} onSaved={(skill) => { setEditorOpen(false); setEditingSkill(null); setActiveSkill(skill); reload(); }} />
        </>
    );
}

/**
 * 技能卡：分类色字形 tile + 名称（最多两行）+ 作者行，两行简介，底部是带标签的统计
 * （likeCount = 收藏数，addedCount = 加入技能库的人数）。
 * 整卡由名称按钮的伸展点击区打开详情；右上角常显紧凑的加入开关，编辑/更多在底部 hover 出现。
 */
function SkillCard({ skill, accentKey, categoryLabel, libraryCategories, canCategorize, loading, onOpen, onAdd, onLike, onEdit, onOpenWorkbench, onDelete, onSetLibraryCategory }: { skill: Skill; accentKey: string; categoryLabel?: string; libraryCategories: SkillLibraryCategory[]; canCategorize: boolean; loading: boolean; onOpen: () => void; onAdd: () => void; onLike: () => void; onEdit: () => void; onOpenWorkbench: () => void; onDelete: () => void; onSetLibraryCategory: (categoryId: string) => void }) {
    const currentLibraryCategory = libraryCategories.find((category) => category.id === skill.libraryCategoryId);
    const libraryCategoryLabel = currentLibraryCategory?.name || (skill.libraryCategoryId ? translate("shared.skills.categorized") : translate("account.settings.models.uncategorized"));
    const author = skill.effectiveUser.name || translate("shared.skills.unknownUser");
    const workbenchLabel = skill.sourceType === "github" ? translate("shared.skills.viewInWorkbench") : translate("shared.skills.editInWorkbench");
    const likeLabel = translate("shared.skills.favoritedByUsers", { v0: String(skill.isLike ? translate("shared.inspirations.inspirationDetailModal.removeFromFavorites") : translate("shared.inspirations.inspirationDetailModal.favorite")), v1: String(skill.likeCount) });
    const menuItems = [
        { key: "detail", label: translate("library.tasks.row.viewDetail") },
        ...(skill.isOwner
            ? [
                  { key: "workbench", label: workbenchLabel },
                  { key: "edit", label: translate("shared.skills.editSkillInformation") },
                  { type: "divider" as const },
                  { key: "delete", label: translate("shared.skills.deleteSkill"), danger: true },
              ]
            : [{ key: "toggle-added", label: skill.isAdded ? translate("shared.skills.removeFromMySkills2") : translate("shared.skills.workbench.addToMySkills"), disabled: loading }]),
    ];
    return (
        <article className={cn("product-collection-card skill-tile", skill.isAdded && "is-added")} data-accent={skillAccent(accentKey)}>
            <div className="skill-tile-head">
                <span className="skill-tile-glyph" aria-hidden="true">{skillGlyph(skill.skillName)}</span>
                <div className="skill-tile-heading">
                    <h3 className="skill-tile-name">
                        <button type="button" className="skill-tile-open" title={skill.skillName} onClick={onOpen}><span className="skill-tile-name-text">{skill.skillName}</span></button>
                    </h3>
                    <div className="skill-tile-byline">
                        <span className="skill-tile-author" title={translate("shared.skills.author", { v0: String(author) })}>{author}</span>
                        {canCategorize ? (
                            <Dropdown
                                trigger={["click"]}
                                menu={{
                                    selectable: true,
                                    selectedKeys: [skill.libraryCategoryId || "__uncategorized__"],
                                    items: [
                                        { key: "__uncategorized__", label: translate("account.settings.models.uncategorized") },
                                        ...libraryCategories.map((category) => ({ key: category.id, label: category.name })),
                                    ],
                                    onClick: ({ key }) => onSetLibraryCategory(key === "__uncategorized__" ? "" : key),
                                }}
                            >
                                <button type="button" className="skill-tile-chip is-picker" aria-label={translate("shared.skills.setSkillCategoryCurrently", { v0: String(libraryCategoryLabel) })} title={translate("shared.skills.setSkillLibraryCategory")} disabled={loading}>
                                    <FolderInput aria-hidden="true" />
                                    <span>{libraryCategoryLabel}</span>
                                    <ChevronDown aria-hidden="true" />
                                </button>
                            </Dropdown>
                        ) : categoryLabel ? (
                            <span className="skill-tile-chip">{categoryLabel}</span>
                        ) : null}
                        {skill.isPrivate ? (
                            <Tooltip title={translate("shared.skills.visibleToMeOnly")}>
                                <span className="skill-tile-private" role="img" aria-label={translate("shared.skills.visibleToMeOnly")}><Lock aria-hidden="true" /></span>
                            </Tooltip>
                        ) : null}
                    </div>
                </div>
            </div>

            <p className="skill-tile-description">{skill.description || translate("shared.skills.noSkillSummary")}</p>

            <div className="skill-tile-footer">
                <Tooltip title={likeLabel}>
                    <button type="button" disabled={loading} className="skill-tile-stat is-like" aria-pressed={skill.isLike} aria-label={likeLabel} onClick={onLike}>
                        <Heart aria-hidden="true" />
                        <span>{formatSkillCount(skill.likeCount)}</span>
                    </button>
                </Tooltip>
                <span className="skill-tile-stat" title={translate("shared.skills.usersAddedThisToTheirLibrary", { v0: String(skill.addedCount) })}>
                    <Users aria-hidden="true" />
                    <span>{formatSkillCount(skill.addedCount)} {translate("shared.skills.joined")}</span>
                </span>
                {/* 次要操作：hover / focus-within 显示，触屏常显；菜单展开时保持可见。 */}
                <div className="skill-tile-actions">
                    {skill.isOwner ? (
                        <Tooltip title={workbenchLabel}>
                            <button type="button" className="product-icon-button skill-tile-edit" aria-label={`${workbenchLabel}：${skill.skillName}`} onClick={onOpenWorkbench}>
                                <Pencil />
                            </button>
                        </Tooltip>
                    ) : null}
                    <Dropdown
                        trigger={["click"]}
                        placement="bottomRight"
                        menu={{
                            items: menuItems,
                            onClick: ({ key }) => key === "detail" ? onOpen() : key === "workbench" ? onOpenWorkbench() : key === "edit" ? onEdit() : key === "delete" ? onDelete() : onAdd(),
                        }}
                    >
                        <button type="button" className="product-icon-button skill-tile-more" aria-label={translate("shared.skills.moreActionsFor", { v0: String(skill.skillName) })} title={translate("canvasB.common.moreActions")}>
                            <MoreHorizontal />
                        </button>
                    </Dropdown>
                </div>
            </div>

            {/* 加入状态是持久业务状态，常显：未加入为细线 +，已加入为安静的对勾。
                作者本人的技能不需要「加入」，但也不能什么都不显示——那会让用户把「没有按钮」误判成缺少操作。 */}
            {skill.isOwner ? (
                <div className="skill-tile-corner">
                    <span className="skill-tile-own" title={translate("shared.skills.skillsYouCreateOrImportCanBeAddedByOther")}>{translate("shared.skills.mine")}</span>
                </div>
            ) : (
                <div className="skill-tile-corner">
                    <Tooltip title={skill.isAdded ? translate("shared.skills.addedToMySkillsClickToRemove") : translate("shared.skills.addToMySkills")}>
                        <button type="button" className="skill-tile-add" aria-pressed={skill.isAdded} aria-label={skill.isAdded ? translate("shared.skills.removeFromMySkills", { v0: String(skill.skillName) }) : translate("shared.skills.addToMySkills2", { v0: String(skill.skillName) })} disabled={loading} onClick={onAdd}>
                            {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : skill.isAdded ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                            <span>{skill.isAdded ? translate("shared.skills.joined2") : translate("canvasA.skillLibrary.add")}</span>
                        </button>
                    </Tooltip>
                </div>
            )}
        </article>
    );
}

function SkillSkeleton() {
    return (
        <div className="skill-tile-grid" aria-busy="true" aria-label={translate("shared.skills.loadingSkills")}>
            {Array.from({ length: 8 }, (_, index) => <div key={index} className="skill-tile-skeleton" />)}
        </div>
    );
}
