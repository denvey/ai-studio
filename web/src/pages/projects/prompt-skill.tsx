import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input } from "antd";
import { BookMarked, FileText, PenLine, Search, X } from "lucide-react";
import { Link } from "react-router";

import { AppModal } from "@/components/ui/product/app-modal";
import type { DramaSkillRef } from "@/services/api/drama";
import { getSkillFile, listAddedSkills, listSkillFiles } from "@/services/api/skills";
import { currentLocale, translate } from "@/i18n";

/** 加载写作技能的文字步骤：资产提取（作品圣经）、分镜拆分（每集剧本）、剧情段视频提示词。 */
export type DramaSkillStep = "bible" | "script" | "prompt";

const STEP_COPY: Record<DramaSkillStep, { title: string; detail: string; empty: string; foot: string }> = {
    bible: {
        title: translate("drama.promptSkill.chooseAssetExtractionSkill"),
        detail: translate("drama.promptSkill.theSelectedFileIsSentInFullToTheText"),
        empty: translate("drama.promptSkill.noSkillSelectedBuiltInRulesExtractCharactersPropsAnd"),
        foot: translate("drama.promptSkill.usedOnlyWhenBuildingTheStoryBibleChangingItAfterward"),
    },
    script: {
        title: translate("drama.promptSkill.chooseStoryboardBreakdownSkill"),
        detail: translate("drama.promptSkill.theSelectedFileIsSentInFullToTheText2"),
        empty: translate("drama.promptSkill.noSkillSelectedBuiltInRulesSplitTheShots"),
        foot: translate("drama.promptSkill.appliesToEpisodesAdaptedAfterwardUseAdaptAgainOnThe"),
    },
    prompt: {
        title: translate("drama.promptSkill.chooseVideoPromptSkill"),
        detail: translate("drama.promptSkill.theSelectedFileIsSentInFullToTheText3"),
        empty: translate("drama.promptSkill.noSkillSelectedUsesTheBuiltInFormatVisualsAnd"),
        foot: translate("drama.promptSkill.changesApplyToSegmentPromptsWrittenAfterwardForExistingPrompts"),
    },
};

/**
 * 文字步骤的写作技能：选一个已添加技能里的文本文件，执行该步骤时把全文交给文本模型作为写作方法。
 * 保存的是技能与文件引用，在技能库里修改自己的技能后，下一次执行就会读到新内容。
 */
export function PromptSkillField({ value, onChange, step = "prompt", compact }: { value?: DramaSkillRef; onChange: (value?: DramaSkillRef) => void; step?: DramaSkillStep; compact?: boolean }) {
    const [open, setOpen] = useState(false);
    const copy = STEP_COPY[step];
    return (
        <div className={`drama-pskill ${compact ? "is-compact" : ""}`}>
            {value ? (
                <div className="drama-pskill-current">
                    <BookMarked className="size-4 shrink-0 text-[var(--workspace-accent)]" aria-hidden />
                    <div className="min-w-0">
                        <strong>{value.skillName || value.skillId}</strong>
                        <span title={value.path}>{value.path}</span>
                    </div>
                    <Link
                        to={`/skills/${encodeURIComponent(value.skillId)}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        className="drama-pskill-edit"
                        aria-label={translate("drama.promptSkill.openInTheSkillLibraryYouCanEditSkillsYou")}
                        title={translate("drama.promptSkill.openInTheSkillLibraryYouCanEditSkillsYou")}
                    >
                        <PenLine className="size-3.5" />
                    </Link>
                    <Button size="small" onClick={() => setOpen(true)}>
                        {translate("drama.promptSkill.change")}
                    </Button>
                    <Button size="small" type="text" icon={<X className="size-3.5" />} aria-label={translate("drama.promptSkill.noSkill")} onClick={() => onChange(undefined)} />
                </div>
            ) : (
                <div className="drama-pskill-current is-empty">
                    <span>{compact ? translate("drama.promptSkill.builtInRules") : copy.empty}</span>
                    <Button size="small" icon={<BookMarked className="size-3.5" />} onClick={() => setOpen(true)}>
                        {translate("drama.promptSkill.chooseSkill")}
                    </Button>
                </div>
            )}
            <PromptSkillModal
                open={open}
                step={step}
                initial={value}
                onClose={() => setOpen(false)}
                onPick={(ref) => {
                    onChange(ref);
                    setOpen(false);
                }}
            />
        </div>
    );
}

function PromptSkillModal({ open, step, initial, onClose, onPick }: { open: boolean; step: DramaSkillStep; initial?: DramaSkillRef; onClose: () => void; onPick: (value: DramaSkillRef) => void }) {
    const copy = STEP_COPY[step];
    const [keyword, setKeyword] = useState("");
    const [skillId, setSkillId] = useState(initial?.skillId || "");
    const [path, setPath] = useState(initial?.path || "");
    useEffect(() => {
        if (!open) return;
        setSkillId(initial?.skillId || "");
        setPath(initial?.path || "");
    }, [initial, open]);
    const skillsQuery = useQuery({ queryKey: ["skills", "added"], queryFn: listAddedSkills, enabled: open, staleTime: 30_000 });
    const skills = useMemo(() => (skillsQuery.data?.skills || []).filter((skill) => !keyword.trim() || `${skill.skillName} ${skill.description}`.toLowerCase().includes(keyword.trim().toLowerCase())), [keyword, skillsQuery.data]);
    const skill = skillsQuery.data?.skills.find((item) => item.skillId === skillId);
    const filesQuery = useQuery({ queryKey: ["skills", skillId, "files"], queryFn: () => listSkillFiles(skillId), enabled: open && Boolean(skillId), staleTime: 60_000 });
    const files = (filesQuery.data?.files || []).filter((file) => file.kind === "markdown" || file.kind === "text");
    // 选中技能后默认定位到 SKILL.md，这是技能的主说明。
    useEffect(() => {
        if (!skillId || path || !files.length) return;
        setPath((files.find((file) => file.path.toLowerCase() === "skill.md") || files[0]).path);
    }, [files, path, skillId]);
    const fileQuery = useQuery({ queryKey: ["skills", skillId, "file", path], queryFn: () => getSkillFile(skillId, path), enabled: open && Boolean(skillId && path), staleTime: 60_000 });
    const content = fileQuery.data?.file.content || "";
    return (
        <AppModal open={open} onCancel={onClose} footer={null} width={1080} flush title={null} centered>
            <div className="drama-skill-import">
                <header className="drama-skill-import-head">
                    <div>
                        <strong>{copy.title}</strong>
                        <span>{copy.detail}</span>
                    </div>
                </header>
                <div className="drama-skill-import-body">
                    <aside>
                        <Input size="small" prefix={<Search className="size-3.5" />} allowClear placeholder={translate("drama.promptSkill.searchAddedSkills")} value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                        <div className="drama-skill-import-list thin-scrollbar">
                            {skills.map((item) => (
                                <button
                                    key={item.skillId}
                                    type="button"
                                    aria-pressed={item.skillId === skillId}
                                    onClick={() => {
                                        setSkillId(item.skillId);
                                        setPath("");
                                    }}
                                >
                                    <strong>{item.skillName}</strong>
                                    <span>{item.description || "—"}</span>
                                </button>
                            ))}
                            {!skillsQuery.isLoading && !skills.length ? <div className="drama-skill-import-empty">{translate("drama.promptSkill.noSkillsAddedYetAddOneOnTheSkillsPage")}</div> : null}
                        </div>
                    </aside>
                    <aside>
                        <div className="drama-skill-import-caption">{skill ? translate("drama.promptSkill.textFiles", { v0: String(skill.skillName), v1: String(files.length) }) : translate("drama.promptSkill.file")}</div>
                        <div className="drama-skill-import-list thin-scrollbar">
                            {files.map((file) => (
                                <button key={file.path} type="button" className="is-file" aria-pressed={file.path === path} onClick={() => setPath(file.path)}>
                                    <FileText className="size-3.5 shrink-0" />
                                    <span title={file.path}>{file.path}</span>
                                </button>
                            ))}
                            {skillId && !filesQuery.isLoading && !files.length ? <div className="drama-skill-import-empty">{translate("drama.promptSkill.thisSkillHasNoTextFiles")}</div> : null}
                            {!skillId ? <div className="drama-skill-import-empty">{translate("drama.promptSkill.selectASkillOnTheLeftFirst")}</div> : null}
                        </div>
                    </aside>
                    <section>
                        <div className="drama-skill-import-caption">
                            {path || translate("drama.promptSkill.sourceText")}
                            {content ? (
                                <span>
                                    {content.length.toLocaleString(currentLocale())} {translate("drama.promptSkill.characters")}
                                    {content.length > 16000 ? " " + translate("drama.promptSkill.contentBeyond16000CharactersWillNotBeSent") : ""}
                                </span>
                            ) : null}
                        </div>
                        <pre className="drama-skill-import-content thin-scrollbar">{fileQuery.isLoading ? translate("drama.promptSkill.loading") : content || translate("drama.promptSkill.selectAFileToViewItsFullTextHere")}</pre>
                    </section>
                </div>
                <footer className="drama-skill-import-foot">
                    <span>{copy.foot}</span>
                    <Button onClick={onClose}>{translate("common.cancel")}</Button>
                    <Button type="primary" disabled={!skill || !path || !content} onClick={() => skill && onPick({ skillId: skill.skillId, skillName: skill.skillName, path })}>
                        {translate("drama.promptSkill.useThisFile")}
                    </Button>
                </footer>
            </div>
        </AppModal>
    );
}
