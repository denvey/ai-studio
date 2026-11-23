import { App, Button, Checkbox, Input, Modal, Segmented } from "antd";
import { BookOpen, RefreshCw, Search, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { addSkill, installSkillUpload, listAddedSkills, listSkills, type Skill } from "@/services/api/skills";
import { curationQuery, matchesCuration, useSkillCuration } from "@/components/skills/skill-curation-browser";
import { fallbackSkillCategories } from "@/pages/skills/skill-catalog";
import { getActiveUserScope } from "@/lib/user-scope";

import { translate } from "@/i18n";
type Props = { selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean };

export function EcommerceSkillPicker({ selected, onChange, disabled }: Props) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<"mine" | "public">("mine");
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("");
    const { curation, error: curationError, retry: retryCuration } = useSkillCuration(open);
    const [installed, setInstalled] = useState<Skill[]>([]);
    const [market, setMarket] = useState<Skill[]>([]);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [installing, setInstalling] = useState("");
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const uploadLock = useRef(false);
    const selection = useRef(selected);
    selection.current = selected;
    const ownerScope = useRef(getActiveUserScope());
    const mounted = useRef(false);
    const isCurrent = useCallback(() => mounted.current && getActiveUserScope() === ownerScope.current, []);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const refresh = useCallback(async () => {
        if (!isCurrent()) return;
        const result = await listAddedSkills();
        if (!isCurrent()) return;
        setInstalled(result.skills.filter((skill) => skill.isAdded));
    }, [isCurrent]);
    useEffect(() => {
        if (!open) return;
        void refresh().catch((cause) => {
            if (isCurrent()) message.error(cause instanceof Error ? cause.message : translate("ecommerce.skillPicker.failedToLoadSkillLibrary"));
        });
    }, [open, refresh, isCurrent]);
    useEffect(() => {
        if (!open || tab !== "public") return;
        let active = true;
        setLoading(true);
        const timer = window.setTimeout(() => {
            if (!isCurrent()) return;
            void listSkills({ scope: "public", search: query.trim(), pageSize: 30, page: 1, ...(curation?.enabled ? curationQuery(curation, category) : category ? { tag: category } : {}) })
                .then((result) => {
                    if (!active || !isCurrent()) return;
                    setMarket(result.skills);
                    setOffset(result.nextOffset);
                    setHasMore(result.hasMore);
                })
                .catch((cause) => {
                    if (active && isCurrent()) message.error(cause instanceof Error ? cause.message : translate("ecommerce.skillPicker.failedToLoadPublicSkills"));
                })
                .finally(() => {
                    if (active && isCurrent()) setLoading(false);
                });
        }, 250);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [open, tab, query, category, curation, isCurrent]);
    const filtered =
        tab === "mine"
            ? installed.filter((skill) => `${skill.skillName} ${skill.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (curation?.enabled ? matchesCuration(skill, curation, category) : !category || skill.tag === category))
            : market;
    const categories = !curation
        ? []
        : curation.enabled
          ? (curation.roots || [])
                .filter((root) => root.enabled)
                .flatMap((root) => [{ id: `root:${root.id}`, name: root.name, child: false }, ...curation.categories.filter((item) => item.enabled && item.rootTag === root.id).map((item) => ({ id: item.id, name: item.name, child: true }))])
          : fallbackSkillCategories.map((item) => ({ id: item.value, name: item.label, child: false }));
    const toggle = (id: string) => {
        const current = selection.current;
        if (current.includes(id)) onChange(current.filter((value) => value !== id));
        else if (current.length < 8) onChange([...current, id]);
        else message.warning(translate("ecommerce.skillPicker.selectAtMost8SkillsPerRound"));
    };
    const install = async (skill: Skill) => {
        if (!isCurrent()) return;
        setInstalling(skill.skillId);
        try {
            await addSkill(skill.skillId);
            if (!isCurrent()) return;
            await refresh();
            if (!isCurrent()) return;
            toggle(skill.skillId);
            message.success(translate("ecommerce.skillPicker.addedAndSelected", { v0: String(skill.skillName) }));
        } catch (cause) {
            if (isCurrent()) message.error(cause instanceof Error ? cause.message : translate("ecommerce.skillPicker.failedToInstallSkill"));
        } finally {
            if (isCurrent()) setInstalling("");
        }
    };
    const loadMore = async () => {
        if (!isCurrent()) return;
        setLoading(true);
        try {
            const result = await listSkills({ scope: "public", search: query.trim(), pageSize: 30, page: Math.floor(offset / 30) + 1, ...(curation?.enabled ? curationQuery(curation, category) : category ? { tag: category } : {}) });
            if (!isCurrent()) return;
            setMarket((current) => [...current, ...result.skills.filter((skill) => !current.some((item) => item.skillId === skill.skillId))]);
            setOffset(result.nextOffset);
            setHasMore(result.hasMore);
        } catch (cause) {
            if (isCurrent()) message.error(cause instanceof Error ? cause.message : translate("ecommerce.skillPicker.failedToLoadMoreSkills"));
        } finally {
            if (isCurrent()) setLoading(false);
        }
    };
    const upload = async (file: File) => {
        if (uploadLock.current || disabled || !isCurrent()) return;
        if (!/\.(md|markdown|zip)$/i.test(file.name)) {
            message.error(translate("ecommerce.skillPicker.uploadAMarkdownFileOrZIPSkillPackage"));
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            message.error(translate("ecommerce.skillPicker.skillFilesMustNotExceed20MB"));
            return;
        }
        if (selection.current.length >= 8) {
            message.warning(translate("ecommerce.skillPicker.selectAtMost8SkillsPerRoundDeselectOneFirst"));
            return;
        }
        uploadLock.current = true;
        setUploading(true);
        try {
            const { skill } = await installSkillUpload({ file, sourceType: /\.zip$/i.test(file.name) ? "zip" : "markdown", tag: "others", isPrivate: true });
            // Only attach completion to the project/account that started this upload.
            if (!isCurrent()) return;
            const canSelect = selection.current.includes(skill.skillId) || selection.current.length < 8;
            if (!selection.current.includes(skill.skillId) && canSelect) onChange([...selection.current, skill.skillId]);
            setInstalled((current) => [skill, ...current.filter((item) => item.skillId !== skill.skillId)]);
            setTab("mine");
            setQuery("");
            setCategory("");
            message.success(canSelect ? translate("ecommerce.skillPicker.skillUploadedAndAddedToThisPlanningRound") : translate("ecommerce.skillPicker.skillSavedToYourLibraryThisRoundIsFullDeselect"));
        } catch (cause) {
            if (isCurrent()) message.error(cause instanceof Error ? cause.message : translate("ecommerce.skillPicker.skillUploadFailed"));
        } finally {
            uploadLock.current = false;
            if (isCurrent()) setUploading(false);
        }
    };
    return (
        <div className="ecommerce-field">
            <span>{translate("ecommerce.skillPicker.skillsPlanningMethods")}</span>
            <Button block icon={<BookOpen size={15} />} disabled={disabled} onClick={() => setOpen(true)}>
                {selected.length ? translate("ecommerce.skillPicker.skillsSelected", { v0: String(selected.length) }) : translate("ecommerce.skillPicker.chooseSkills")}
            </Button>
            <input
                ref={fileInput}
                type="file"
                accept=".md,.markdown,.zip"
                hidden
                aria-label={translate("ecommerce.skillPicker.uploadAPlanningSkillFile")}
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(file);
                }}
            />
            <Button block icon={<Upload size={15} />} disabled={disabled || selected.length >= 8} loading={uploading} onClick={() => fileInput.current?.click()}>
                {translate("ecommerce.skillPicker.uploadSkills")}
            </Button>
            <small className="ecommerce-model-note">{translate("ecommerce.skillPicker.markdownZIPSupportedSavedToYourPersonalSkillLibraryThe")}</small>
            {selected.length ? <small className="ecommerce-model-note">{translate("ecommerce.skillPicker.planningUsesSelectedSkillsToWriteImagePlansAndPrompts")}</small> : null}
            <Modal title={translate("ecommerce.skillPicker.choosePlanningSkills")} open={open} onCancel={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>{translate("account.payment.done")}</Button>} width={780} destroyOnHidden>
                <div className="ecommerce-skill-controls">
                    <Segmented
                        value={tab}
                        options={[
                            { label: translate("ecommerce.skillPicker.mySkills", { v0: String(installed.length) }), value: "mine" },
                            { label: translate("ecommerce.skillPicker.publicSkill"), value: "public" },
                        ]}
                        onChange={(value) => {
                            setTab(value as "mine" | "public");
                            setQuery("");
                        }}
                    />
                    <Button aria-label={translate("ecommerce.skillPicker.refreshInstalledSkills")} icon={<RefreshCw size={14} />} onClick={() => void refresh()} />
                </div>
                <Input
                    prefix={<Search size={15} />}
                    aria-label={translate("ecommerce.skillPicker.searchSkills")}
                    placeholder={translate("ecommerce.skillPicker.searchSkillNamesOrDescriptions")}
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        if (event.target.value) setCategory("");
                    }}
                />
                {curationError ? (
                    <Button type="link" onClick={retryCuration}>
                        {translate("ecommerce.skillPicker.failedToLoadCategoriesRetry")}
                    </Button>
                ) : null}
                <div className="ecommerce-skill-browser">
                    <nav className="ecommerce-skill-categories" aria-label={translate("ecommerce.skillPicker.skillCategory")}>
                        <strong>{translate("ecommerce.skillPicker.skillCategory")}</strong>
                        <button type="button" aria-pressed={!category} onClick={() => setCategory("")}>
                            {translate("canvasA.skillLibrary.allSkills")}
                        </button>
                        {categories.map((item) => (
                            <button
                                type="button"
                                className={item.child ? "is-child" : undefined}
                                key={item.id}
                                aria-pressed={category === item.id}
                                onClick={() => {
                                    setCategory(item.id);
                                    setQuery("");
                                }}
                            >
                                {item.name}
                            </button>
                        ))}
                    </nav>
                    <div className="ecommerce-skill-list">
                        {tab === "mine"
                            ? selected
                                  .filter((id) => !installed.some((skill) => skill.skillId === id))
                                  .map((id) => (
                                      <div className="ecommerce-skill-row" key={id}>
                                          <div>
                                              <strong>{translate("ecommerce.skillPicker.unavailableSkill")}</strong>
                                              <small>{translate("ecommerce.skillPicker.thisSkillWasRemovedOrIsUnavailableDeselectIt")}</small>
                                          </div>
                                          <Button size="small" onClick={() => toggle(id)}>
                                              {translate("canvasB.common.remove")}
                                          </Button>
                                      </div>
                                  ))
                            : null}
                        {filtered.map((skill) => (
                            <div className="ecommerce-skill-row" key={skill.skillId}>
                                <div>
                                    <strong>{skill.skillName}</strong>
                                    <small>{skill.description || translate("ecommerce.skillPicker.noDescription")}</small>
                                </div>
                                {installed.some((item) => item.skillId === skill.skillId) ? (
                                    <Checkbox checked={selected.includes(skill.skillId)} disabled={!selected.includes(skill.skillId) && selected.length >= 8} onChange={() => toggle(skill.skillId)}>
                                        {translate("ecommerce.skillPicker.use")}
                                    </Checkbox>
                                ) : (
                                    <Button size="small" loading={installing === skill.skillId} disabled={selected.length >= 8} onClick={() => void install(skill)}>
                                        {translate("ecommerce.skillPicker.addAndUse")}
                                    </Button>
                                )}
                            </div>
                        ))}
                        {!filtered.length && !loading ? <p className="ecommerce-skill-empty">{tab === "mine" ? translate("ecommerce.skillPicker.noMatchingSkillsInYourLibraryAddSomeFromPublic") : translate("ecommerce.skillPicker.noMatchingPublicSkills")}</p> : null}
                    </div>
                </div>
                {tab === "public" && hasMore ? (
                    <Button block loading={loading} onClick={() => void loadMore()}>
                        {translate("canvasA.toolPicker.loadMore")}
                    </Button>
                ) : null}
                <p className="ecommerce-skill-count">{translate("ecommerce.skillPicker.usedThisRound")} {selected.length} {translate("ecommerce.skillPicker.item8Skills")}</p>
            </Modal>
        </div>
    );
}
