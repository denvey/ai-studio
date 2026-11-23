import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { BookMarked, Check, Eye, FileText, PenLine, RotateCcw, Search, TriangleAlert, Blocks } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal";
import { CHARACTER_VARIABLES, renderAssetPrompt, SCENE_VARIABLES, unknownAssetVariables } from "@/lib/drama/asset-prompt";
import { cn } from "@/lib/utils";
import { getDramaAssetSchemes, type DramaAssetMode, type DramaAssetSchemeCatalog, type DramaAssetSettings, type DramaModelOption } from "@/services/api/drama";
import { getSkillFile, listAddedSkills, listSkillFiles } from "@/services/api/skills";
import { currentLocale, translate } from "@/i18n";

// 角色/场景参考图方案：开工前选定，设置页可改。保存的是全文提示词，预览就是实际发送的内容。

const PROMPT_LIMIT = 4000;
const CUSTOM_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"];
const ASSET_SCHEME_COPY: Partial<Record<DramaAssetMode, { name: string; description: string; frameHint: string }>> = {
    portrait: { name: translate("drama.assetSchemes.portrait.name"), description: translate("drama.assetSchemes.portrait.description"), frameHint: translate("drama.assetSchemes.portrait.frameHint") },
    turnaround: { name: translate("drama.assetSchemes.turnaround.name"), description: translate("drama.assetSchemes.turnaround.description"), frameHint: translate("drama.assetSchemes.turnaround.frameHint") },
    fourview: { name: translate("drama.assetSchemes.fourview.name"), description: translate("drama.assetSchemes.fourview.description"), frameHint: translate("drama.assetSchemes.fourview.frameHint") },
};
const ASSET_VARIABLE_LABEL: Record<string, string> = {
    角色名称: translate("drama.assetVariables.characterName"),
    角色设定: translate("drama.assetVariables.characterDesign"),
    场景名称: translate("drama.assetVariables.sceneName"),
    场景设定: translate("drama.assetVariables.sceneDesign"),
    项目画风: translate("drama.assetVariables.style"),
    画面规则: translate("drama.assetVariables.rules"),
};

export function useAssetSchemes() {
    return useQuery({ queryKey: ["drama-asset-schemes"], queryFn: getDramaAssetSchemes, staleTime: 10 * 60_000 });
}

export function defaultAssetSettings(catalog?: DramaAssetSchemeCatalog): DramaAssetSettings | undefined {
    const scheme = catalog?.schemes[0];
    if (!catalog || !scheme) return undefined;
    return { mode: scheme.mode, characterPrompt: scheme.characterPrompt, scenePrompt: catalog.scenePrompt, characterRatio: scheme.ratio };
}

export type AssetPreviewSample = { characterName: string; characterAppearance: string; sceneName: string; sceneAppearance: string; style: string; rules: string };

const FALLBACK_SAMPLE: AssetPreviewSample = {
    characterName: translate("drama.assetScheme.protagonist"),
    characterAppearance: translate("drama.assetScheme.characterAppearanceIsFilledInAfterTheStoryBibleIs"),
    sceneName: translate("drama.assetScheme.mainScene"),
    sceneAppearance: translate("drama.assetScheme.environmentDescriptionIsFilledInAfterTheStoryBibleIs"),
    style: translate("drama.assetScheme.realisticCinematicLook"),
    rules: "",
};

/** 方案示意：用色块画出版式，比文字更快看懂差别。 */
function SchemeGlyph({ mode }: { mode: DramaAssetMode }) {
    if (mode === "portrait")
        return (
            <span className="drama-glyph is-portrait">
                <i />
            </span>
        );
    if (mode === "turnaround")
        return (
            <span className="drama-glyph is-turnaround">
                <i />
                <i />
                <i />
            </span>
        );
    if (mode === "fourview")
        return (
            <span className="drama-glyph is-fourview">
                <i className="is-face" />
                <i />
                <i />
                <i />
                <b />
            </span>
        );
    return (
        <span className="drama-glyph is-custom">
            <PenLine className="size-4" />
        </span>
    );
}

/**
 * imageModel 是当前选中的图片模型：用来只列出它能给出的画幅与分辨率档位，并提前提示保存时会被拒绝的组合。
 */
export function AssetSchemePicker({
    value,
    onChange,
    sample,
    layout = "wide",
    imageModel,
}: {
    value?: DramaAssetSettings;
    onChange: (value: DramaAssetSettings) => void;
    sample?: Partial<AssetPreviewSample>;
    layout?: "wide" | "compact";
    imageModel?: DramaModelOption;
}) {
    const { modal } = App.useApp();
    const catalogQuery = useAssetSchemes();
    const catalog = catalogQuery.data;
    const [tab, setTab] = useState<"character" | "scene">("character");
    const [importOpen, setImportOpen] = useState(false);
    const editorRef = useRef<TextAreaRef>(null);
    const preview = { ...FALLBACK_SAMPLE, ...Object.fromEntries(Object.entries(sample || {}).filter(([, item]) => item)) } as AssetPreviewSample;
    if (!catalog || !value) return <div className="drama-assets is-loading">{translate("drama.assetScheme.loadingReferenceImagePresets")}</div>;
    // imageModel 是角色参考图实际使用的图片模型；能力未知（模型列表未加载）时不做限制，交给服务端保存时校验。
    // 道具与场景固定 16:9，能列入短剧模型目录的图片模型都给得出。
    const ratios = imageModel?.imageRatios;
    const ratioProblems = ratios && !ratios.includes(value.characterRatio) ? [value.characterRatio] : [];

    const scheme = catalog.schemes.find((item) => item.mode === value.mode);
    const prompt = tab === "character" ? value.characterPrompt : value.scenePrompt;
    const variables = tab === "character" ? CHARACTER_VARIABLES : SCENE_VARIABLES;
    const defaultPrompt = tab === "character" ? scheme?.characterPrompt || catalog.schemes[0].characterPrompt : catalog.scenePrompt;
    const unknown = unknownAssetVariables(prompt, variables);
    const modified = prompt.trim() !== defaultPrompt.trim();
    const rendered =
        tab === "character"
            ? renderAssetPrompt(prompt, { 角色名称: preview.characterName, 角色设定: preview.characterAppearance, 项目画风: preview.style, 画面规则: preview.rules })
            : renderAssetPrompt(prompt, { 场景名称: preview.sceneName, 场景设定: preview.sceneAppearance, 项目画风: preview.style, 画面规则: preview.rules });

    const setPrompt = (next: string) => onChange(tab === "character" ? { ...value, characterPrompt: next } : { ...value, scenePrompt: next });
    const chooseMode = (mode: DramaAssetMode) => {
        if (mode === value.mode) return;
        const target = catalog.schemes.find((item) => item.mode === mode);
        const apply = () =>
            onChange({
                ...value,
                mode,
                characterPrompt: target ? target.characterPrompt : value.characterPrompt,
                characterRatio: target ? target.ratio : value.characterRatio,
                sourceSkillId: target ? undefined : value.sourceSkillId,
                sourceSkillName: target ? undefined : value.sourceSkillName,
                sourcePath: target ? undefined : value.sourcePath,
            });
        const characterModified = scheme ? value.characterPrompt.trim() !== scheme.characterPrompt.trim() : true;
        if (target && characterModified) {
            modal.confirm({
                title: translate("drama.assetScheme.switchTo", { v0: ASSET_SCHEME_COPY[target.mode]?.name || target.name }),
                content: translate("drama.assetScheme.theCharacterPromptHasBeenEditedSwitchingWillReplaceIt"),
                okText: translate("canvasB.mediaVersion.switch"),
                cancelText: translate("drama.assetScheme.keepCurrent"),
                centered: true,
                onOk: apply,
            });
            return;
        }
        apply();
    };
    const insertVariable = (variable: string) => {
        const element = editorRef.current?.resizableTextArea?.textArea;
        const start = element?.selectionStart ?? prompt.length;
        const end = element?.selectionEnd ?? prompt.length;
        setPrompt(prompt.slice(0, start) + variable + prompt.slice(end));
        window.requestAnimationFrame(() => {
            element?.focus();
            element?.setSelectionRange(start + variable.length, start + variable.length);
        });
    };

    const schemes: Array<{ mode: DramaAssetMode; name: string; description: string; ratio: string }> = [
        ...catalog.schemes.map((item) => ({ ...item, ...ASSET_SCHEME_COPY[item.mode] })),
        {
            mode: "custom",
            name: translate("account.settings.models.scopeCustom"),
            description: translate("drama.assetScheme.writeYourOwnRequirementsOrImportThemFromASkill"),
            ratio: value.mode === "custom" ? value.characterRatio : translate("drama.assetScheme.chooseRatio"),
        },
    ];

    return (
        <section className={cn("drama-assets", layout === "compact" && "is-compact")} aria-label={translate("drama.assetScheme.referenceImagePreset")}>
            <div className="drama-assets-schemes" role="radiogroup" aria-label={translate("drama.assetScheme.characterReferencePreset")}>
                {schemes.map((item) => (
                    <button key={item.mode} type="button" role="radio" aria-checked={value.mode === item.mode} className="drama-assets-scheme" onClick={() => chooseMode(item.mode)}>
                        <SchemeGlyph mode={item.mode} />
                        <span className="drama-assets-scheme-copy">
                            <strong>
                                {item.name}
                                <em>{item.ratio}</em>
                            </strong>
                            <span>{item.description}</span>
                        </span>
                        {value.mode === item.mode ? (
                            <span className="drama-assets-check" aria-hidden>
                                <Check className="size-3" />
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>
            {value.mode === "custom" ? (
                <div className="drama-assets-ratio">
                    <span>{translate("drama.assetScheme.characterReferenceAspectRatio")}</span>
                    <div className="drama-tabs" role="radiogroup" aria-label={translate("drama.assetScheme.characterReferenceAspectRatio")}>
                        {CUSTOM_RATIOS.map((ratio) => {
                            const unsupported = Boolean(ratios && !ratios.includes(ratio));
                            return (
                                <button
                                    key={ratio}
                                    type="button"
                                    role="radio"
                                    className="drama-tab"
                                    aria-checked={value.characterRatio === ratio}
                                    disabled={unsupported && value.characterRatio !== ratio}
                                    title={unsupported ? translate("drama.assetScheme.theSelectedImageModelHasNoSizeCloseToThis") : undefined}
                                    onClick={() => onChange({ ...value, characterRatio: ratio })}
                                >
                                    {ratio}
                                </button>
                            );
                        })}
                    </div>
                    <small>{translate("drama.assetScheme.theAspectRatioIsSentThroughTheImageSizeParameter")}</small>
                </div>
            ) : null}
            {ratioProblems.length ? (
                <p className="drama-assets-warning" role="alert">
                    <TriangleAlert className="size-3.5" />
                    {translate(value.mode === "custom" ? "drama.sentences.assetRatioIssueCustom" : "drama.sentences.assetRatioIssue", { ratios: ratioProblems.join(", ") })}
                </p>
            ) : null}

            <div className="drama-assets-editor">
                <div className="drama-assets-editor-head">
                    <div className="drama-tabs" role="tablist" aria-label={translate("drama.assetScheme.promptTarget")}>
                        <button type="button" role="tab" className="drama-tab" aria-selected={tab === "character"} onClick={() => setTab("character")}>
                            {translate("drama.assetScheme.characterPrompt")}
                        </button>
                        <button type="button" role="tab" className="drama-tab" aria-selected={tab === "scene"} onClick={() => setTab("scene")}>
                            {translate("drama.assetScheme.scenePrompt")}
                        </button>
                    </div>
                    {modified ? <span className="drama-assets-badge">{translate("drama.assetScheme.modified")}</span> : <span className="drama-assets-badge is-muted">{translate("canvasB.common.default")}</span>}
                    <div className="ml-auto flex gap-2">
                        <Button size="small" type="text" icon={<BookMarked className="size-3.5" />} onClick={() => setImportOpen(true)}>
                            {translate("drama.assetScheme.importFromSkill")}
                        </Button>
                        <Button size="small" type="text" icon={<RotateCcw className="size-3.5" />} disabled={!modified} onClick={() => setPrompt(defaultPrompt)}>
                            {translate("drama.assetScheme.resetToDefaults")}
                        </Button>
                    </div>
                </div>
                <div className="drama-assets-variables" aria-label={translate("drama.assetScheme.insertVariable")}>
                    <span>{translate("drama.assetScheme.insertVariable")}</span>
                    {variables.map((variable) => (
                        <button key={variable} type="button" onClick={() => insertVariable(variable)}>
                            {ASSET_VARIABLE_LABEL[variable.slice(2, -2)] || variable.slice(2, -2)}
                        </button>
                    ))}
                </div>
                <Input.TextArea
                    ref={editorRef}
                    value={prompt}
                    maxLength={PROMPT_LIMIT}
                    showCount
                    autoSize={{ minRows: layout === "compact" ? 5 : 6, maxRows: 16 }}
                    onChange={(event) => setPrompt(event.target.value)}
                    aria-label={tab === "character" ? translate("drama.assetScheme.characterReferencePrompt") : translate("drama.assetScheme.sceneReferencePrompt")}
                    status={unknown.length ? "error" : undefined}
                />
                {unknown.length ? (
                    <p className="drama-assets-warning">
                        <TriangleAlert className="size-3.5" />
                        {translate("drama.assetScheme.unsupportedVariables")}
                        {unknown.join("、")}
                        {translate("drama.assetScheme.savingWillBeRejectedSeeTheSupportedVariablesAbove")}
                    </p>
                ) : null}
                {tab === "character" && value.sourceSkillName ? (
                    <p className="drama-assets-source">
                        <Blocks className="size-3.5" />
                        {translate("drama.sentences.importedSkill", { name: value.sourceSkillName })}
                        {value.sourcePath ? ` · ${value.sourcePath}` : ""}
                    </p>
                ) : null}
                <div className="drama-assets-preview">
                    <div className="drama-assets-preview-head">
                        <Eye className="size-3.5" />
                        {translate("drama.assetScheme.previewSubmittedPrompt")}
                        <span>{translate("drama.sentences.previewExample", { name: tab === "character" ? preview.characterName : preview.sceneName })}</span>
                    </div>
                    <p>{rendered}</p>
                    {tab === "character" && scheme ? (
                        <small>
                            {translate("drama.assetScheme.referenceLayoutInstructions")}
                            {ASSET_SCHEME_COPY[scheme.mode]?.frameHint || scheme.frameHint}
                        </small>
                    ) : null}
                </div>
            </div>
            <SkillPromptImportModal
                open={importOpen}
                onClose={() => setImportOpen(false)}
                onImport={({ text, skillId, skillName, path }) => {
                    const next = /\{\{角色名称\}\}|\{\{角色设定\}\}/.test(text) ? text : `${text.trim()}\n\n【本角色】{{角色名称}}：{{角色设定}}。画风：{{项目画风}}。{{画面规则}}`;
                    onChange({ ...value, mode: value.mode === "custom" ? "custom" : value.mode, characterPrompt: next.slice(0, PROMPT_LIMIT), sourceSkillId: skillId, sourceSkillName: skillName, sourcePath: path });
                    setTab("character");
                    setImportOpen(false);
                }}
            />
        </section>
    );
}

/** 从已添加技能里挑一份文本，选中段落导入为角色约束提示词。 */
function SkillPromptImportModal({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (input: { text: string; skillId: string; skillName: string; path: string }) => void }) {
    const { message } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const [skillId, setSkillId] = useState("");
    const [path, setPath] = useState("");
    const contentRef = useRef<HTMLPreElement>(null);
    const skillsQuery = useQuery({ queryKey: ["skills", "added"], queryFn: listAddedSkills, enabled: open, staleTime: 30_000 });
    const skills = useMemo(() => (skillsQuery.data?.skills || []).filter((skill) => !keyword.trim() || `${skill.skillName} ${skill.description}`.toLowerCase().includes(keyword.trim().toLowerCase())), [keyword, skillsQuery.data]);
    const skill = skillsQuery.data?.skills.find((item) => item.skillId === skillId);
    const filesQuery = useQuery({ queryKey: ["skills", skillId, "files"], queryFn: () => listSkillFiles(skillId), enabled: open && Boolean(skillId), staleTime: 60_000 });
    const files = (filesQuery.data?.files || []).filter((file) => file.kind === "markdown" || file.kind === "text");
    const fileQuery = useQuery({ queryKey: ["skills", skillId, "file", path], queryFn: () => getSkillFile(skillId, path), enabled: open && Boolean(skillId && path), staleTime: 60_000 });
    const content = fileQuery.data?.file.content || "";

    const importText = (whole: boolean) => {
        const selection = window.getSelection();
        const selected = selection && contentRef.current && contentRef.current.contains(selection.anchorNode) ? selection.toString() : "";
        const text = whole ? content : selected;
        if (!text.trim()) {
            message.info(translate("drama.assetScheme.selectThePassagesToImportFromTheSourceTextOn"));
            return;
        }
        if (text.length > PROMPT_LIMIT) message.warning(translate("drama.assetScheme.contentExceededCharactersAndWasTruncatedSelectOnlyPassagesRelevant", { v0: String(PROMPT_LIMIT) }));
        onImport({ text: text.slice(0, PROMPT_LIMIT), skillId, skillName: skill?.skillName || "", path });
    };

    return (
        <AppModal open={open} onCancel={onClose} footer={null} width={1080} flush title={null} centered>
            <div className="drama-skill-import">
                <header className="drama-skill-import-head">
                    <div>
                        <strong>{translate("drama.assetScheme.importReferenceRequirementsFromASkill")}</strong>
                        <span>{translate("drama.assetScheme.chooseAGuidelineDocumentFromASkillAndSelectThe")}</span>
                    </div>
                </header>
                <div className="drama-skill-import-body">
                    <aside>
                        <Input size="small" prefix={<Search className="size-3.5" />} allowClear placeholder={translate("drama.assetScheme.searchAddedSkills")} value={keyword} onChange={(event) => setKeyword(event.target.value)} />
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
                            {!skillsQuery.isLoading && !skills.length ? <ImportEmpty>{translate("drama.assetScheme.noSkillsAddedYetAddOneOnTheSkillsPage")}</ImportEmpty> : null}
                        </div>
                    </aside>
                    <aside>
                        <div className="drama-skill-import-caption">{skill ? translate("drama.assetScheme.textFiles", { v0: String(skill.skillName), v1: String(files.length) }) : translate("drama.assetScheme.file")}</div>
                        <div className="drama-skill-import-list thin-scrollbar">
                            {files.map((file) => (
                                <button key={file.path} type="button" className="is-file" aria-pressed={file.path === path} onClick={() => setPath(file.path)}>
                                    <FileText className="size-3.5 shrink-0" />
                                    <span title={file.path}>{file.path}</span>
                                </button>
                            ))}
                            {skillId && !filesQuery.isLoading && !files.length ? <ImportEmpty>{translate("drama.assetScheme.thisSkillHasNoTextFilesAvailableToImport")}</ImportEmpty> : null}
                            {!skillId ? <ImportEmpty>{translate("drama.assetScheme.selectASkillOnTheLeftFirst")}</ImportEmpty> : null}
                        </div>
                    </aside>
                    <section>
                        <div className="drama-skill-import-caption">
                            {path || translate("drama.assetScheme.sourceText")}
                            {content ? (
                                <span>
                                    {content.length.toLocaleString(currentLocale())} {translate("drama.assetScheme.characters")}
                                </span>
                            ) : null}
                        </div>
                        <pre ref={contentRef} className="drama-skill-import-content thin-scrollbar">
                            {fileQuery.isLoading ? translate("drama.assetScheme.loading") : content || translate("drama.assetScheme.selectAFileToViewItsSourceTextHereThen")}
                        </pre>
                    </section>
                </div>
                <footer className="drama-skill-import-foot">
                    <span>
                        {translate("drama.assetScheme.ifTheContentDoesNotInclude")} {"{{角色名称}}"} / {"{{角色设定}}"} {translate("drama.assetScheme.thisCharacterSInformationIsAutomaticallyAppendedAfterImport")}
                    </span>
                    <Button onClick={onClose}>{translate("common.cancel")}</Button>
                    <Button disabled={!content} onClick={() => importText(true)}>
                        {translate("drama.assetScheme.importEntireFile")}
                    </Button>
                    <Button type="primary" disabled={!content} onClick={() => importText(false)}>
                        {translate("drama.assetScheme.importSelection")}
                    </Button>
                </footer>
            </div>
        </AppModal>
    );
}

function ImportEmpty({ children }: { children: ReactNode }) {
    return <div className="drama-skill-import-empty">{children}</div>;
}
