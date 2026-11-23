import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Input, InputNumber } from "antd";
import { Check, CheckCircle2, ChevronRight, FolderTree, Plus, RefreshCw, Search, Shapes, SlidersHorizontal } from "lucide-react";
import { AdminPageFrame } from "./components/admin-shell";
import { AdminStatusBadge, AdminTableEmpty, SettingsSectionCard } from "./components/admin-ui";
import { AdminSwitch } from "./ui/controls";
import { getSkillCuration, updateSkillCuration, type CurationCategory, type CurationChange, type CurationRoot, type SkillCuration } from "@/services/api/skill-curation";
import { curationIcon, curationIconKeys, curationIconLabels } from "@/components/skills/skill-curation-browser";
import { listSkills, type Skill } from "@/services/api/skills";
import "./skill-curation-page.css";
import { translate } from "@/i18n";


const emptyRoot = (): CurationRoot => ({ id: "", name: "", iconKey: "shapes", sortOrder: 0, enabled: true });
const emptyCategory = (rootTag = "drama"): CurationCategory => ({ id: "", rootTag, name: "", sortOrder: 0, enabled: true });

type EditorTarget =
    | { kind: "root"; id: string }
    | { kind: "category"; id: string }
    | { kind: "new-root" }
    | { kind: "new-category"; rootTag: string }
    | null;

function normalizeName(value: string) {
    return value.replace(/\s+/g, " ").trim();
}

export default function SkillCurationPage() {
    const { message } = App.useApp();
    const [data, setData] = useState<SkillCuration | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [root, setRoot] = useState<CurationRoot>(emptyRoot);
    const [category, setCategory] = useState<CurationCategory>(emptyCategory);
    const [target, setTarget] = useState<EditorTarget>(null);
    const [search, setSearch] = useState("");
    const [skills, setSkills] = useState<Skill[]>([]);
    const [skillId, setSkillId] = useState("");
    const [assignedRoot, setAssignedRoot] = useState("");
    const [categoryIds, setCategoryIds] = useState<string[]>([]);

    const sortedRoots = useMemo(() => [...(data?.roots || [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)), [data?.roots]);
    const sortedCategories = useMemo(() => [...(data?.categories || [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)), [data?.categories]);
    const categoriesByRoot = useMemo(() => {
        const grouped = new Map<string, CurationCategory[]>();
        sortedCategories.forEach((item) => {
            const list = grouped.get(item.rootTag) || [];
            list.push(item);
            grouped.set(item.rootTag, list);
        });
        return grouped;
    }, [sortedCategories]);
    const orphanCategories = useMemo(() => sortedCategories.filter((item) => !data?.roots?.some((rootItem) => rootItem.id === item.rootTag)), [data?.roots, sortedCategories]);

    const selectedSkill = skills.find((skill) => skill.skillId === skillId);
    const selectedRoot = data?.roots?.find((item) => item.id === assignedRoot);
    const availableCategories = data?.categories.filter((item) => item.enabled && item.rootTag === (assignedRoot || selectedSkill?.tag)) ?? [];
    const selectedEditorRootId = target?.kind === "root" ? target.id : target?.kind === "category" ? category.rootTag : target?.kind === "new-category" ? target.rootTag : "";
    const editorIsRoot = target?.kind === "root" || target?.kind === "new-root";
    const editorIsCategory = target?.kind === "category" || target?.kind === "new-category";
    const editorTitle = target?.kind === "new-root" ? translate("adminPages.skillCurationPage.addTopLevelCategory2") : target?.kind === "new-category" ? translate("adminPages.skillCurationPage.addSubcategory") : target?.kind === "root" ? translate("adminPages.skillCurationPage.editTopLevelCategory", { v0: String(root.name || translate("adminPages.skillCurationPage.untitled")) }) : target?.kind === "category" ? translate("adminPages.skillCurationPage.editSubcategory", { v0: String(category.name || translate("adminPages.skillCurationPage.untitled")) }) : translate("adminPages.skillCurationPage.selectACategory");
    const editorDescription = editorIsRoot ? translate("adminPages.skillCurationPage.topLevelCategoriesOrganizeTheSkillLibrarySMainNavigation") : editorIsCategory ? translate("adminPages.skillCurationPage.subcategoriesMustBelongToAnEnabledTopLevelCategory") : translate("adminPages.skillCurationPage.selectANodeInTheCategoryTreeOnTheLeft");

    const reload = async () => {
        try {
            setData(await getSkillCuration(true));
            setError("");
        } catch (e) {
            setError(String(e));
        }
    };

    useEffect(() => {
        void reload();
    }, []);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            listSkills({ scope: "public", search, pageSize: 50 })
                .then((result) => {
                    if (!cancelled) setSkills(result.skills);
                })
                .catch((e) => {
                    if (!cancelled) setError(String(e));
                });
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [search]);

    useEffect(() => {
        if (!data || target) return;
        const firstRoot = sortedRoots[0];
        if (firstRoot) {
            setRoot({ ...firstRoot });
            setTarget({ kind: "root", id: firstRoot.id });
        }
    }, [data, sortedRoots, target]);

    useEffect(() => {
        if (!data || !target) return;
        if (target.kind === "root") {
            const next = data.roots?.find((item) => item.id === target.id);
            if (next) setRoot({ ...next });
            else setTarget(null);
        }
        if (target.kind === "category") {
            const next = data.categories.find((item) => item.id === target.id);
            if (next) setCategory({ ...next });
            else setTarget(null);
        }
    }, [data, target]);

    const save = async (change: CurationChange, onSaved?: (next: SkillCuration) => void) => {
        if (!data) return;
        setBusy(true);
        try {
            const next = await updateSkillCuration(data.revision, change);
            setData(next);
            setError("");
            onSaved?.(next);
            message.success(translate("adminPages.skillCurationPage.saved"));
            window.dispatchEvent(new Event("canvas-skills-changed"));
        } catch (e) {
            setError(translate("adminPages.skillCurationPage.reloadAndCheckYourChanges", { v0: String(String(e)) }));
        } finally {
            setBusy(false);
        }
    };

    const selectRoot = (item: CurationRoot) => {
        setRoot({ ...item });
        setTarget({ kind: "root", id: item.id });
    };

    const selectCategory = (item: CurationCategory) => {
        setCategory({ ...item });
        setTarget({ kind: "category", id: item.id });
    };

    const startNewRoot = () => {
        setRoot(emptyRoot());
        setTarget({ kind: "new-root" });
    };

    const startNewCategory = (rootId = selectedEditorRootId) => {
        const nextRootId = rootId && sortedRoots.some((item) => item.id === rootId && item.enabled) ? rootId : sortedRoots.find((item) => item.enabled)?.id || "";
        if (!nextRootId) return;
        setCategory(emptyCategory(nextRootId));
        setTarget({ kind: "new-category", rootTag: nextRootId });
    };

    const resetEditor = () => {
        if (target?.kind === "root") {
            const current = data?.roots?.find((item) => item.id === target.id);
            if (current) setRoot({ ...current });
            return;
        }
        if (target?.kind === "category") {
            const current = data?.categories.find((item) => item.id === target.id);
            if (current) setCategory({ ...current });
            return;
        }
        if (target?.kind === "new-category") {
            setCategory(emptyCategory(target.rootTag));
            return;
        }
        setRoot(emptyRoot());
    };

    const saveRoot = () => {
        const payload = { ...root, name: normalizeName(root.name) };
        void save({ root: payload }, (next) => {
            const saved = next.roots?.find((item) => item.id === payload.id || item.name === payload.name);
            if (saved) {
                setRoot({ ...saved });
                setTarget({ kind: "root", id: saved.id });
            }
        });
    };

    const saveCategory = () => {
        const payload = { ...category, name: normalizeName(category.name) };
        void save({ category: payload }, (next) => {
            const saved = next.categories.find((item) => item.id === payload.id || (item.rootTag === payload.rootTag && item.name === payload.name));
            if (saved) {
                setCategory({ ...saved });
                setTarget({ kind: "category", id: saved.id });
            }
        });
    };

    const selectSkill = (id: string) => {
        const nextRoot = data?.rootAssignments?.find((item) => item.skillId === id)?.rootId || "";
        setSkillId(id);
        setAssignedRoot(nextRoot);
        setCategoryIds(data?.assignments.filter((item) => item.skillId === id).map((item) => item.categoryId) || []);
    };

    return (
        <AdminPageFrame
            title={translate("adminPages.skillCurationPage.skillCategory")}
            description={translate("adminPages.skillCurationPage.manageTopLevelCategoriesSubcategoriesAndSkillAssignmentsOnThe")}
            scroll
            actions={
                <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void reload()} disabled={busy}>
                    {translate("account.layout.state.reload")}
                </Button>
            }
        >
            <div className="admin-skill-curation">
                {error ? <Alert type="error" showIcon title={error} /> : null}

                <section className="admin-skill-curation-policy" aria-label={translate("adminPages.skillCurationPage.platformCurationMode")}>
                    <div className="admin-skill-curation-policy-icon">
                        <SlidersHorizontal className="size-4" aria-hidden="true" />
                    </div>
                    <div className="admin-skill-curation-policy-copy">
                        <div className="admin-skill-curation-policy-title">{translate("adminPages.skillCurationPage.platformCurationMode")}</div>
                        <p>{translate("adminPages.skillCurationPage.whenEnabledTheSkillLibraryPrioritizesCategoriesAndAssignmentsManaged")}</p>
                    </div>
                    <div className="admin-skill-curation-policy-control">
                        <AdminStatusBadge label={data?.enabled ? translate("adminPages.skillCurationPage.enabled") : translate("adminPages.skillCurationPage.notEnabled")} tone={data?.enabled ? "success" : "neutral"} />
                        <AdminSwitch aria-label={translate("adminPages.skillCurationPage.platformCurationMode")} checked={data?.enabled ?? false} disabled={!data || busy} onChange={(enabled) => void save({ enabled })} />
                    </div>
                </section>

                <div className="admin-skill-curation-workspace">
                    <SettingsSectionCard
                        layout="stacked"
                        className="admin-skill-curation-tree-panel"
                        icon={<FolderTree className="size-4" aria-hidden="true" />}
                        title={translate("adminPages.skillCurationPage.categoryTree")}
                        description={translate("adminPages.skillCurationPage.selectACategoryToEditItOnTheRightOr")}
                        status={<AdminStatusBadge label={translate("adminPages.skillCurationPage.nodes", { v0: String((data?.roots?.length ?? 0) + (data?.categories.length ?? 0)) })} tone="info" />}
                    >
                        <div className="admin-skill-curation-tree-toolbar">
                            <span className="admin-skill-curation-tree-toolbar-label">{translate("adminPages.skillCurationPage.topLevelCategoriesAndSubcategories")}</span>
                            <Button size="small" icon={<Plus className="size-3.5" />} onClick={startNewRoot} disabled={busy}>
                                {translate("adminPages.skillCurationPage.addTopLevelCategory")}
                            </Button>
                        </div>
                        <div className="admin-skill-curation-tree-list" role="tree" aria-label={translate("adminPages.skillCurationPage.skillCategoryTree")}>
                            {!data ? (
                                <div className="admin-skill-curation-tree-loading" role="status">
                                    {translate("adminPages.skillCurationPage.loadingCategories")}
                                </div>
                            ) : sortedRoots.length ? (
                                <>
                                    {sortedRoots.map((rootItem) => {
                                        const Icon = curationIcon(rootItem.iconKey);
                                        const children = categoriesByRoot.get(rootItem.id) || [];
                                        const active = (target?.kind === "root" && target.id === rootItem.id) || (target?.kind === "new-category" && target.rootTag === rootItem.id);
                                        return (
                                            <div key={rootItem.id} className="admin-skill-curation-tree-branch">
                                                <div className="admin-skill-curation-tree-node-row">
                                                    <button
                                                        type="button"
                                                        role="treeitem"
                                                        aria-selected={active}
                                                        className={`admin-skill-curation-tree-node admin-skill-curation-tree-node-root${active ? " is-active" : ""}`}
                                                        onClick={() => selectRoot(rootItem)}
                                                    >
                                                        <span className="admin-skill-curation-tree-node-icon">
                                                            <Icon className="size-4" aria-hidden="true" />
                                                        </span>
                                                        <span className="admin-skill-curation-tree-node-copy">
                                                            <span className="admin-skill-curation-tree-node-name">{rootItem.name}</span>
                                                            <span className="admin-skill-curation-tree-node-meta">
                                                                {children.length ? translate("adminPages.skillCurationPage.subcategories", { v0: String(children.length) }) : translate("adminPages.skillCurationPage.noSubcategories")}
                                                                {!rootItem.enabled ? <AdminStatusBadge label={translate("adminPages.skillCurationPage.disabled")} tone="neutral" /> : null}
                                                            </span>
                                                        </span>
                                                        <ChevronRight className="admin-skill-curation-tree-node-chevron size-4" aria-hidden="true" />
                                                    </button>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        className="admin-skill-curation-tree-node-add"
                                                        icon={<Plus className="size-3.5" />}
                                                        aria-label={translate("adminPages.skillCurationPage.addSubcategoryUnder", { v0: String(rootItem.name) })}
                                                        title={rootItem.enabled ? translate("adminPages.skillCurationPage.addSubcategory") : translate("adminPages.skillCurationPage.enableTheTopLevelCategoryBeforeAddingSubcategories")}
                                                        onClick={() => startNewCategory(rootItem.id)}
                                                        disabled={busy || !rootItem.enabled}
                                                    />
                                                </div>
                                                {children.length ? (
                                                    <div className="admin-skill-curation-tree-children" role="group">
                                                        {children.map((item) => {
                                                            const childActive = target?.kind === "category" && target.id === item.id;
                                                            return (
                                                                <button
                                                                    key={item.id}
                                                                    type="button"
                                                                    role="treeitem"
                                                                    aria-selected={childActive}
                                                                    className={`admin-skill-curation-tree-node admin-skill-curation-tree-node-child${childActive ? " is-active" : ""}${!item.enabled ? " is-disabled" : ""}`}
                                                                    onClick={() => selectCategory(item)}
                                                                >
                                                                    <span className="admin-skill-curation-tree-node-marker" aria-hidden="true" />
                                                                    <span className="admin-skill-curation-tree-node-copy">
                                                                        <span className="admin-skill-curation-tree-node-name">{item.name}</span>
                                                                        <span className="admin-skill-curation-tree-node-meta">{item.enabled ? translate("adminPages.skillCurationPage.active") : translate("adminPages.skillCurationPage.disabled")}</span>
                                                                    </span>
                                                                    <ChevronRight className="admin-skill-curation-tree-node-chevron size-3.5" aria-hidden="true" />
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                    {orphanCategories.length ? (
                                        <div className="admin-skill-curation-tree-orphans">
                                            <div className="admin-skill-curation-tree-orphans-title">{translate("adminPages.skillCurationPage.noTopLevelCategoryAssigned")}</div>
                                            {orphanCategories.map((item) => (
                                                <button key={item.id} type="button" role="treeitem" aria-selected={target?.kind === "category" && target.id === item.id} className={`admin-skill-curation-tree-node admin-skill-curation-tree-node-child${target?.kind === "category" && target.id === item.id ? " is-active" : ""}`} onClick={() => selectCategory(item)}>
                                                    <span className="admin-skill-curation-tree-node-marker" aria-hidden="true" />
                                                    <span className="admin-skill-curation-tree-node-copy">
                                                        <span className="admin-skill-curation-tree-node-name">{item.name}</span>
                                                        <span className="admin-skill-curation-tree-node-meta">{item.enabled ? translate("adminPages.skillCurationPage.active") : translate("adminPages.skillCurationPage.disabled")}</span>
                                                    </span>
                                                    <ChevronRight className="admin-skill-curation-tree-node-chevron size-3.5" aria-hidden="true" />
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <AdminTableEmpty
                                    title={translate("adminPages.skillCurationPage.noTopLevelCategoriesYet")}
                                    description={translate("adminPages.skillCurationPage.createATopLevelCategoryFirstThenAddSubcategories")}
                                    action={
                                        <Button type="primary" size="small" icon={<Plus className="size-3.5" />} onClick={startNewRoot}>
                                            {translate("adminPages.skillCurationPage.createTopLevelCategory")}
                                        </Button>
                                    }
                                />
                            )}
                        </div>
                    </SettingsSectionCard>

                    <div className="admin-skill-curation-detail-column">
                        <SettingsSectionCard
                            layout="stacked"
                            className="admin-skill-curation-editor-panel"
                            icon={<Shapes className="size-4" aria-hidden="true" />}
                            title={editorTitle}
                            description={editorDescription}
                            status={editorIsRoot || editorIsCategory ? <AdminStatusBadge label={target?.kind?.startsWith("new-") ? translate("adminPages.skillCurationPage.creating") : translate("adminPages.skillCurationPage.selected")} tone={target?.kind?.startsWith("new-") ? "warning" : "info"} /> : <AdminStatusBadge label={translate("adminPages.skillCurationPage.notSelected")} tone="neutral" />}
                        >
                            {!data ? (
                                <div className="admin-skill-curation-editor-empty" role="status">
                                    {translate("adminPages.skillCurationPage.loadingEditor")}
                                </div>
                            ) : editorIsRoot ? (
                                <div className="admin-skill-curation-form" aria-label={translate("adminPages.skillCurationPage.topLevelCategoryForm")}>
                                    <div className="admin-skill-curation-editor-context">
                                        <span className="admin-skill-curation-editor-kicker">{translate("adminPages.skillCurationPage.topLevelCategory")}</span>
                                        <strong>{root.id ? translate("adminPages.skillCurationPage.editing", { v0: String(root.name || translate("adminPages.skillCurationPage.untitled")) }) : translate("adminPages.skillCurationPage.createANewTopLevelCategory")}</strong>
                                        <span>{translate("adminPages.skillCurationPage.topLevelCategoriesAppearInTheSkillLibrarySMain")}</span>
                                    </div>
                                    <div className="admin-skill-curation-fields admin-skill-curation-fields-root">
                                        <label className="admin-skill-curation-field">
                                            <span>{translate("adminPages.skillCurationPage.categoryName")}</span>
                                            <Input aria-label={translate("adminPages.skillCurationPage.topLevelCategoryName")} placeholder={translate("adminPages.skillCurationPage.forExampleVideoCreation")} maxLength={64} value={root.name} onChange={(e) => setRoot({ ...root, name: e.target.value })} />
                                        </label>
                                        <label className="admin-skill-curation-field is-order">
                                            <span>{translate("adminPages.skillCurationPage.order")}</span>
                                            <InputNumber aria-label={translate("adminPages.skillCurationPage.topLevelCategoryOrder")} className="admin-skill-curation-control" precision={0} min={0} value={root.sortOrder} onChange={(sortOrder) => setRoot({ ...root, sortOrder: sortOrder ?? 0 })} />
                                        </label>
                                        <div className="admin-skill-curation-field is-switch">
                                            <span>{translate("library.tasks.detail.status")}</span>
                                            <div className="admin-skill-curation-switch-row">
                                                <AdminSwitch aria-label={translate("adminPages.skillCurationPage.enableTopLevelCategory")} checked={root.enabled} onChange={(enabled) => setRoot({ ...root, enabled })} />
                                                <span>{root.enabled ? translate("adminPages.skillCurationPage.enable") : translate("adminPages.skillCurationPage.disable")}</span>
                                            </div>
                                        </div>
                                        <div className="admin-skill-curation-field admin-skill-curation-icon-field">
                                            <span>{translate("adminPages.skillCurationPage.categoryIcon")}</span>
                                            <div className="admin-skill-curation-icon-grid" role="radiogroup" aria-label={translate("adminPages.skillCurationPage.topLevelCategoryIcon")}>
                                                {curationIconKeys.map((key) => {
                                                    const Icon = curationIcon(key);
                                                    const selected = (root.iconKey || "shapes") === key;
                                                    return (
                                                        <button key={key} type="button" role="radio" aria-checked={selected} className={`admin-skill-curation-icon-choice${selected ? " is-selected" : ""}`} onClick={() => setRoot({ ...root, iconKey: key })}>
                                                            <Icon className="size-4" aria-hidden="true" />
                                                            <span>{curationIconLabels[key]}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="admin-skill-curation-form-actions">
                                        <span className="admin-skill-curation-hint">{translate("adminPages.skillCurationPage.disablingATopLevelCategoryPreservesExistingSkillDataBut")}</span>
                                        <div className="admin-skill-curation-action-buttons">
                                            <Button onClick={resetEditor} disabled={busy || (!root.id && !root.name)}>
                                                {root.id ? translate("canvasA.characterStudio.revert") : translate("canvasA.outbox.clear")}
                                            </Button>
                                            <Button type="primary" icon={root.id ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} loading={busy} disabled={!data || !root.name.trim()} onClick={saveRoot}>
                                                {root.id ? translate("adminPages.skillCurationPage.saveTopLevelCategory") : translate("adminPages.skillCurationPage.addTopLevelCategory2")}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : editorIsCategory ? (
                                <div className="admin-skill-curation-form" aria-label={translate("adminPages.skillCurationPage.subcategoryForm")}>
                                    <div className="admin-skill-curation-editor-context">
                                        <span className="admin-skill-curation-editor-kicker">{translate("adminPages.skillCurationPage.subcategory")}</span>
                                        <strong>{category.id ? translate("adminPages.skillCurationPage.editing", { v0: String(category.name || translate("adminPages.skillCurationPage.untitled")) }) : translate("adminPages.skillCurationPage.createANewSubcategory")}</strong>
                                        <span>{translate("adminPages.skillCurationPage.newSubcategoriesBelongToTheCurrentTopLevelCategorySaved")}</span>
                                    </div>
                                    <div className="admin-skill-curation-fields admin-skill-curation-fields-category">
                                        <div className="admin-skill-curation-field admin-skill-curation-parent-field">
                                            <span>{translate("adminPages.skillCurationPage.parentCategory")}</span>
                                            <div className="admin-skill-curation-direct-list" role="radiogroup" aria-label={translate("adminPages.skillCurationPage.parentCategory")}>
                                                {sortedRoots.length ? (
                                                    sortedRoots.map((item) => {
                                                        const Icon = curationIcon(item.iconKey);
                                                        const selected = category.rootTag === item.id;
                                                        return (
                                                            <button
                                                                key={item.id}
                                                                type="button"
                                                                role="radio"
                                                                aria-checked={selected}
                                                                className={`admin-skill-curation-direct-choice${selected ? " is-selected" : ""}`}
                                                                disabled={Boolean(category.id) || !item.enabled}
                                                                onClick={() => setCategory({ ...category, rootTag: item.id })}
                                                            >
                                                                <span className="admin-skill-curation-direct-choice-icon">
                                                                    <Icon className="size-3.5" aria-hidden="true" />
                                                                </span>
                                                                <span className="admin-skill-curation-direct-choice-copy">
                                                                    <strong>{item.name}</strong>
                                                                    <small>{item.enabled ? translate("adminPages.skillCurationPage.availableForNewSubcategories") : translate("adminPages.skillCurationPage.disabled")}</small>
                                                                </span>
                                                                {selected ? <CheckCircle2 className="admin-skill-curation-choice-check size-3.5" aria-hidden="true" /> : null}
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="admin-skill-curation-direct-empty">{translate("adminPages.skillCurationPage.noTopLevelCategoriesAvailableYet")}</div>
                                                )}
                                            </div>
                                        </div>
                                        <label className="admin-skill-curation-field">
                                            <span>{translate("adminPages.skillCurationPage.subcategoryName")}</span>
                                            <Input aria-label={translate("adminPages.skillCurationPage.categoryName")} placeholder={translate("adminPages.skillCurationPage.forExampleStoryboardDesign")} value={category.name} maxLength={64} onChange={(e) => setCategory({ ...category, name: e.target.value })} />
                                        </label>
                                        <label className="admin-skill-curation-field is-order">
                                            <span>{translate("adminPages.skillCurationPage.order")}</span>
                                            <InputNumber aria-label={translate("adminPages.skillCurationPage.order")} className="admin-skill-curation-control" value={category.sortOrder} precision={0} min={0} onChange={(sortOrder) => setCategory({ ...category, sortOrder: sortOrder ?? 0 })} />
                                        </label>
                                        <div className="admin-skill-curation-field is-switch">
                                            <span>{translate("library.tasks.detail.status")}</span>
                                            <div className="admin-skill-curation-switch-row">
                                                <AdminSwitch aria-label={translate("adminPages.skillCurationPage.enableCategory")} checked={category.enabled} onChange={(enabled) => setCategory({ ...category, enabled })} />
                                                <span>{category.enabled ? translate("adminPages.skillCurationPage.enable") : translate("adminPages.skillCurationPage.disable")}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="admin-skill-curation-form-actions">
                                        <span className="admin-skill-curation-hint">{category.id ? translate("adminPages.skillCurationPage.editing", { v0: String(category.name) }) : translate("adminPages.skillCurationPage.availableForSkillAssignmentAfterCreation")}</span>
                                        <div className="admin-skill-curation-action-buttons">
                                            <Button onClick={resetEditor} disabled={busy || (!category.id && !category.name)}>
                                                {category.id ? translate("canvasA.characterStudio.revert") : translate("canvasA.outbox.clear")}
                                            </Button>
                                            <Button type="primary" icon={category.id ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} loading={busy} disabled={!data || !category.name.trim() || !category.rootTag} onClick={saveCategory}>
                                                {category.id ? translate("adminPages.skillCurationPage.saveSubcategory") : translate("adminPages.skillCurationPage.addSubcategory")}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="admin-skill-curation-editor-empty">
                                    <AdminTableEmpty
                                        title={translate("adminPages.skillCurationPage.noCategorySelected")}
                                        description={translate("adminPages.skillCurationPage.selectACategoryOnTheLeftOrCreateANew")}
                                        action={
                                            <Button type="primary" size="small" icon={<Plus className="size-3.5" />} onClick={startNewRoot}>
                                                {translate("adminPages.skillCurationPage.addTopLevelCategory2")}
                                            </Button>
                                        }
                                    />
                                </div>
                            )}
                        </SettingsSectionCard>

                        <SettingsSectionCard
                            layout="stacked"
                            className="admin-skill-curation-assignment-panel"
                            icon={<Check className="size-4" aria-hidden="true" />}
                            title={translate("adminPages.skillCurationPage.skillAssignments")}
                            description={translate("adminPages.skillCurationPage.searchPublicSkillsAndChooseTheirTopLevelCategoryAnd")}
                            status={<AdminStatusBadge label={skillId ? translate("adminPages.skillCurationPage.selectedSkill") : translate("adminPages.skillCurationPage.waitingForSelection")} tone={skillId ? "success" : "neutral"} />}
                        >
                            <div className="admin-skill-curation-assignment-form" aria-label={translate("adminPages.skillCurationPage.skillAssignmentForm")}>
                                <label className="admin-skill-curation-field admin-skill-curation-assignment-search">
                                    <span>{translate("canvasA.skillLibrary.searchPlaceholder")}</span>
                                    <Input prefix={<Search className="size-3.5" aria-hidden="true" />} aria-label={translate("adminPages.skillCurationPage.searchPublicSkills")} placeholder={translate("adminPages.skillCurationPage.searchPublicSkillsByName")} value={search} onChange={(e) => setSearch(e.target.value)} allowClear />
                                </label>
                                <div className="admin-skill-curation-field admin-skill-curation-skill-field">
                                    <div className="admin-skill-curation-field-heading">
                                        <span>{translate("adminPages.skillCurationPage.selectSkill")}</span>
                                        <small>{skills.length ? translate("adminPages.skillCurationPage.results", { v0: String(skills.length) }) : search ? translate("adminPages.skillCurationPage.noMatchingResults") : translate("adminPages.skillCurationPage.noPublicSkillsYet")}</small>
                                    </div>
                                    <div className="admin-skill-curation-skill-list" role="listbox" aria-label={translate("adminPages.skillCurationPage.selectSkill")}>
                                        {skills.length ? (
                                            skills.map((skill) => {
                                                const selected = skill.skillId === skillId;
                                                return (
                                                    <button key={skill.skillId} type="button" role="option" aria-selected={selected} className={`admin-skill-curation-skill-row${selected ? " is-selected" : ""}`} onClick={() => selectSkill(skill.skillId)}>
                                                        <strong>{skill.skillName || skill.skillId}</strong>
                                                        <em>{skill.tag || translate("account.settings.models.uncategorized")}</em>
                                                        {selected ? <Check className="size-3.5" aria-hidden="true" /> : null}
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="admin-skill-curation-direct-empty">{search ? translate("adminPages.skillCurationPage.noMatchingPublicSkillsFound") : translate("adminPages.skillCurationPage.noPublicSkillsYet")}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="admin-skill-curation-field admin-skill-curation-assignment-root-field">
                                    <div className="admin-skill-curation-field-heading">
                                        <span>{translate("adminPages.skillCurationPage.skillTopLevelCategory")}</span>
                                        <small>{assignedRoot ? selectedRoot?.name || translate("adminPages.skillCurationPage.categoryAssigned") : translate("adminPages.skillCurationPage.useOriginalCategory")}</small>
                                    </div>
                                    <div className="admin-skill-curation-assign-chips" role="radiogroup" aria-label={translate("adminPages.skillCurationPage.skillTopLevelCategory")}>
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={!assignedRoot}
                                            className={`admin-skill-curation-assign-chip${!assignedRoot ? " is-selected" : ""}`}
                                            onClick={() => {
                                                setAssignedRoot("");
                                                setCategoryIds([]);
                                            }}
                                        >
                                            <Shapes className="size-4" aria-hidden="true" />
                                            <span>{translate("adminPages.skillCurationPage.byOriginalCategory")}{selectedSkill?.tag ? ` · ${selectedSkill.tag}` : ""}</span>
                                        </button>
                                        {sortedRoots.map((item) => {
                                            const Icon = curationIcon(item.iconKey);
                                            const selected = assignedRoot === item.id;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={selected}
                                                    className={`admin-skill-curation-assign-chip${selected ? " is-selected" : ""}`}
                                                    disabled={!item.enabled}
                                                    onClick={() => {
                                                        setAssignedRoot(item.id);
                                                        setCategoryIds([]);
                                                    }}
                                                >
                                                    <Icon className="size-4" aria-hidden="true" />
                                                    <span>{item.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="admin-skill-curation-field admin-skill-curation-assignment-category-field">
                                    <div className="admin-skill-curation-field-heading">
                                        <span>{translate("adminPages.skillCurationPage.skillSubcategories")}</span>
                                        <small>{selectedSkill ? translate("adminPages.skillCurationPage.selected2", { v0: String(categoryIds.length) }) : translate("adminPages.skillCurationPage.selectASkillFirst")}</small>
                                    </div>
                                    <div className={`admin-skill-curation-assign-chips${!selectedSkill ? " is-disabled" : ""}`} role="listbox" aria-label={translate("adminPages.skillCurationPage.skillSubcategories")} aria-multiselectable="true">
                                        {availableCategories.length ? (
                                            availableCategories.map((item) => {
                                                const selected = categoryIds.includes(item.id);
                                                return (
                                                    <button key={item.id} type="button" role="option" aria-selected={selected} aria-pressed={selected} className={`admin-skill-curation-assign-chip${selected ? " is-selected" : ""}`} disabled={!selectedSkill} onClick={() => setCategoryIds((current) => (selected ? current.filter((id) => id !== item.id) : [...current, item.id]))}>
                                                        <span>{item.name}</span>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="admin-skill-curation-direct-empty">{selectedSkill ? (selectedRoot || assignedRoot ? translate("adminPages.skillCurationPage.noEnabledSubcategoriesInThisTopLevelCategory") : translate("adminPages.skillCurationPage.noEnabledSubcategoriesInTheOriginalCategory")) : translate("adminPages.skillCurationPage.selectASkillFirst")}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="admin-skill-curation-assignment-footer">
                                    <span className="admin-skill-curation-hint">{selectedSkill ? translate("adminPages.skillCurationPage.currentSkill", { v0: String(selectedSkill.skillName) }) : translate("adminPages.skillCurationPage.noAssignmentsAreChangedWhenNoSkillIsSelected")}</span>
                                    <Button type="primary" loading={busy} disabled={!skillId || !data} onClick={() => void save({ assignment: { skillId, categoryIds, rootId: assignedRoot } })}>
                                        {translate("adminPages.skillCurationPage.saveSkillAssignments")}
                                    </Button>
                                </div>
                            </div>
                        </SettingsSectionCard>
                    </div>
                </div>
            </div>
        </AdminPageFrame>
    );
}
