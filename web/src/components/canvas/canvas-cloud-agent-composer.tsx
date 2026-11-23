// 画布 Agent 输入区：场景胶囊、输入框（附件、@ 引用、/ 技能）、发送/排队/停止按钮与图片预览。
//
// 运行中输入框保持可用（产品约定，勿收紧）：Enter 默认排队，⌘/Ctrl+Enter 插进当前轮；
// 停止由 running 驱动，固定在主按钮左侧，与发送互不排斥。

import type { Skill, SkillPreset } from "@/services/api/skills";
import {
    ArrowLeft,
    ArrowUp,
    AtSign,
    Bookmark,
    Check,
    Clapperboard,
    FileText,
    FolderOpen,
    ImagePlus,
    Layers3,
    ListPlus,
    LoaderCircle,
    Palette,
    Plus,
    Shapes,
    Share2,
    ShoppingBag,
    Square,
    SquareDashedMousePointer,
    TriangleAlert,
    X,
    Blocks,
} from "lucide-react";
import { canvasThemes } from "@/lib/canvas-theme";
import { type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { agentModifierShortcut, agentTextLength, type AgentComposerSubmitMode } from "@/lib/canvas/agent-outbox";
import { AGENT_LONG_TEXT_CHARS } from "@/lib/canvas/agent-composer-attachments";
import { canvasNodeMentionToken } from "@/lib/canvas/canvas-resource-references";
import { CanvasAnchoredDropdown as Dropdown } from "./canvas-anchored-dropdown";
import { buildSkillMentionReferences } from "@/services/skill-runtime";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { agentAttachmentReferences, type CloudAgentChatAttachment } from "./canvas-cloud-agent-attachments";
import { translate } from "@/i18n";

export const MIN_AGENT_PROMPT_HEIGHT = 60;

export const MAX_AGENT_PROMPT_HEIGHT = 240;

export function clampAgentPromptHeight(height: number) {
    return Math.min(MAX_AGENT_PROMPT_HEIGHT, Math.max(MIN_AGENT_PROMPT_HEIGHT, Math.ceil(height)));
}

/**
 * 场景起步胶囊：把「我大概想做 X」一步翻译成一组技能。
 * 两组来源，都不限剧典技能：
 *  1) 配方组——只读消费 GET /skills/presets（随二进制内置的手工策展配方）
 *  2) 常用组——用户已装（其中可含已收藏）及自建的技能，按常用度排序（含官方种子库与自定义）
 * 选择只作用于本会话；缺失的技能会持久安装到当前用户的技能库。
 * 挂上之后具体用哪张卡由 Agent 在任务里检索判断，胶囊只负责"把对的技能送到手边"。
 */
export type AgentSceneBucket = {
    key: string;
    label: string;
    presets: SkillPreset[];
    skills: Skill[];
};

/** 场景分类：与 presets.json 的 scene 字段、技能的 tag 字段共用同一套 key。 */
export const AGENT_SCENE_DEFS: Array<{ key: string; label: string; icon: typeof Blocks }> = [
    { key: "frequent", label: translate("canvasTools.canvasCloudAgentComposer.frequentlyUsed"), icon: Bookmark },
    { key: "drama", label: translate("canvasTools.canvasCloudAgentComposer.shortDramaStories"), icon: Clapperboard },
    { key: "ecommerce", label: translate("canvasTools.canvasCloudAgentComposer.advertisingAndEcommerce"), icon: ShoppingBag },
    { key: "creative", label: translate("canvasTools.canvasCloudAgentComposer.visualCreativity"), icon: Palette },
    { key: "social", label: translate("canvasTools.canvasCloudAgentComposer.socialMedia"), icon: Share2 },
    { key: "others", label: translate("canvasA.skillLibrary.other"), icon: Shapes },
];

export function AgentSceneCapsules({
    buckets,
    installedIds,
    theme,
    disabled = false,
    onPick,
    onPickSkill,
}: {
    buckets: AgentSceneBucket[];
    installedIds: Set<string>;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    disabled?: boolean;
    onPick: (preset: SkillPreset) => void;
    onPickSkill: (skill: Skill) => void;
}) {
    // 始终只占一排：默认显示场景分类，点某个场景后在同一排内就地切换内容。
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const capsuleClass = "agent-scene-capsule shrink-0";
    const stop = {
        onMouseDown: (event: { stopPropagation(): void }) => event.stopPropagation(),
        onPointerDown: (event: { stopPropagation(): void }) => event.stopPropagation(),
    };
    const visible = buckets.filter((bucket) => bucket.presets.length + bucket.skills.length > 0);
    const active = activeKey ? visible.find((bucket) => bucket.key === activeKey) || null : null;
    if (!visible.length) return null;
    return (
        <div className="agent-scene-capsules mx-3 mb-2 min-w-0" style={{ color: theme.node.text }}>
            <div className="agent-scene-capsules-heading">
                <Blocks aria-hidden="true" />
                <span>{active ? active.label : translate("canvasTools.canvasCloudAgentComposer.recommendedSkillSets")}</span>
            </div>
            <div className="agent-scene-capsules-scroll thin-scrollbar flex gap-2 overflow-x-auto px-1 py-2">
                {active ? (
                    <>
                        <button
                            type="button"
                            disabled={disabled}
                            title={translate("canvasTools.canvasCloudAgentComposer.backToAllScenes")}
                            className={capsuleClass}
                            data-scene="back"
                            {...stop}
                            onClick={(event) => {
                                event.stopPropagation();
                                setActiveKey(null);
                            }}
                        >
                            <ArrowLeft aria-hidden="true" />
                            <span>{translate("canvasTools.canvasCloudAgentComposer.allScenes")}</span>
                        </button>
                        {active.presets.map((preset) => {
                            const missing = preset.skillIds.filter((id) => !installedIds.has(id)).length;
                            return (
                                <button
                                    key={preset.presetId}
                                    type="button"
                                    disabled={disabled}
                                    title={preset.rationale}
                                    className={capsuleClass}
                                    data-scene={active.key}
                                    {...stop}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onPick(preset);
                                    }}
                                >
                                    <Layers3 aria-hidden="true" />
                                    <span className="agent-scene-capsule-label">{preset.name}</span>
                                    <span className="agent-scene-capsule-meta">{missing > 0 ? translate("canvasTools.canvasCloudAgentComposer.skillsToInstall", { v0: String(preset.skillIds.length), v1: String(missing) }) : translate("canvasTools.canvasCloudAgentComposer.skills", { v0: String(preset.skillIds.length) })}</span>
                                </button>
                            );
                        })}
                        {active.skills.map((skill) => {
                            const owned = skill.isOwner ? translate("canvasTools.canvasCloudAgentComposer.custom") : skill.isLike ? translate("canvasTools.canvasCloudAgentComposer.favorited") : installedIds.has(skill.skillId) ? translate("canvasTools.canvasCloudAgentComposer.installed") : translate("canvasTools.canvasCloudAgentComposer.notInstalled");
                            return (
                                <button
                                    key={skill.skillId}
                                    type="button"
                                    disabled={disabled}
                                    title={skill.description}
                                    className={capsuleClass}
                                    data-scene={active.key}
                                    {...stop}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onPickSkill(skill);
                                    }}
                                >
                                    <Blocks aria-hidden="true" />
                                    <span className="agent-scene-capsule-label">{skill.skillName}</span>
                                    <span className="agent-scene-capsule-meta">{owned}</span>
                                </button>
                            );
                        })}
                    </>
                ) : (
                    visible.map((bucket) => {
                        const count = bucket.presets.length + bucket.skills.length;
                        const Icon = AGENT_SCENE_DEFS.find((definition) => definition.key === bucket.key)?.icon || Shapes;
                        return (
                            <button
                                key={bucket.key}
                                type="button"
                                disabled={disabled}
                                title={translate("canvasTools.canvasCloudAgentComposer.viewSkillSetsIn", { v0: String(bucket.label) })}
                                className={capsuleClass}
                                data-scene={bucket.key}
                                {...stop}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setActiveKey(bucket.key);
                                }}
                            >
                                <Icon aria-hidden="true" />
                                <span className="agent-scene-capsule-label">{bucket.label}</span>
                                <span className="agent-scene-capsule-meta">{translate("canvasTools.inline.canvasCloudAgentComposer.items", { v0: String(count) })}</span>
                            </button>
                        );
                    })
                )}
            </div>
            <p className="agent-scene-capsules-note">{translate("canvasTools.canvasCloudAgentComposer.thisConversationOnlyMissingSkillsAreAddedToYourLibrary")}</p>
        </div>
    );
}

/** 输入卡片顶部上下文行里的一项：图标、一句说明和行内操作（选区、看图提示、长文本转换共用）。 */
export function AgentContextChip({ icon, tone = "default", title, children, actions }: { icon: ReactNode; tone?: "default" | "off" | "warning"; title?: string; children: ReactNode; actions?: ReactNode }) {
    return (
        <span className={`agent-context-chip${tone === "off" ? " is-off" : tone === "warning" ? " is-warning" : ""}`} title={title} role={tone === "warning" ? "status" : undefined}>
            {icon}
            <span className="truncate">{children}</span>
            {actions}
        </span>
    );
}

export function AgentChatComposer({
    prompt,
    attachments = [],
    disabled,
    sending,
    submitDisabled,
    submitMode = "send",
    running,
    placeholder,
    theme,
    onPromptChange,
    onSubmit,
    onEscape,
    primaryDisabled,
    onAddFiles,
    onRemoveAttachment,
    onRetryAttachment,
    addMenu,
    contextBar,
    charLimit,
    blockReason,
    onLongTextPaste,
    left,
    submitAccessory,
    tray,
    footer,
    onStop,
    stopping,
    references = [],
    slashSkills,
    includeAssetLibrary,
}: {
    prompt: string;
    attachments?: CloudAgentChatAttachment[];
    disabled?: boolean;
    /** 新一轮请求在路上：只拦住「发送」，排队和保存不受影响。 */
    sending?: boolean;
    submitDisabled?: boolean;
    /** 主按钮与 Enter 的意图：发送新一轮、加入队列，或保存正在编辑的排队消息。 */
    submitMode?: AgentComposerSubmitMode;
    running?: boolean;
    placeholder: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onPromptChange: (value: string) => void;
    /** alternate：按了 ⌘/Ctrl+Enter（运行中表示直接插话）。 */
    onSubmit: (options: { alternate: boolean }) => void;
    /** 输入框里按 Esc（没有弹出菜单时）：取消编辑、连按两次停止本轮。 */
    onEscape?: () => void;
    /** 只禁用主按钮和普通 Enter（例如队列已满）；⌘/Ctrl+Enter 仍交给 onSubmit，由调用方决定能否插话。 */
    primaryDisabled?: boolean;
    /** 输入卡片上方、同一张外壳里的内容（排队消息条）。 */
    tray?: ReactNode;
    onStop?: () => void | Promise<void>;
    stopping?: boolean;
    onAddFiles?: (files: FileList | File[] | null) => void | Promise<void>;
    onRemoveAttachment?: (id: string) => void;
    /** 上传失败、只存在本机或已从画布删除的附件，用原文件重新上传。 */
    onRetryAttachment?: (id: string) => void;
    /** 最左侧「+」菜单的其他入口；disabledReason 有值时菜单只显示原因（例如不在画布里）。 */
    addMenu?: { disabledReason?: string | null; onPickAssets?: () => void; selectionCount?: number; onReferenceSelection?: () => void };
    /** 输入卡片顶部的一行上下文：选区、看图提示、长文本转换。 */
    contextBar?: ReactNode;
    /** 超过上限的 80% 时显示字数；超出后不能发送。 */
    charLimit?: number;
    /** 暂时不能发送的原因（例如图片还在上传）；有值时主按钮和 Enter 都不可用。 */
    blockReason?: string | null;
    /** 粘贴了很长的文字：文字照常粘贴，由调用方决定是否建议转成画布文本节点。 */
    onLongTextPaste?: (text: string) => void;
    left?: ReactNode;
    /** 发送按钮左侧的附属控件，例如上下文用量环。 */
    submitAccessory?: ReactNode;
    /** 输入区底部的附加内容（例如连接器条）。 */
    footer?: ReactNode;
    /** 供「@」插入的画布节点/素材/技能引用候选（可选，默认空，缺省时退化为普通输入框） */
    references?: CanvasResourceReference[];
    /** 供「/」弹出的技能候选（可选） */
    slashSkills?: Skill[];
    /** 是否在「@」候选里包含素材库资源 */
    includeAssetLibrary?: boolean;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [slash, setSlash] = useState<{ start: number; query: string } | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [previewAttachment, setPreviewAttachment] = useState<CloudAgentChatAttachment | null>(null);
    const [promptHeight, setPromptHeight] = useState(MIN_AGENT_PROMPT_HEIGHT);
    const promptResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
    const manualPromptHeightRef = useRef<number | null>(null);
    const availableSlashSkills = slashSkills ?? [];
    const slashCandidates = useMemo(() => {
        const query = slash?.query.trim().toLocaleLowerCase() || "";
        if (!query) return availableSlashSkills;
        return availableSlashSkills.filter((skill) => `${skill.skillName} ${skill.description || ""}`.toLocaleLowerCase().includes(query));
    }, [availableSlashSkills, slash?.query]);
    const attachmentReferences = useMemo(() => agentAttachmentReferences(attachments), [attachments]);
    const skillReferences = useMemo(() => buildSkillMentionReferences(availableSlashSkills), [availableSlashSkills]);
    // 保留每个 id 第一次出现的引用；用 Set 去重，节点多时不再是平方级。
    const composerReferences = useMemo(() => {
        const seen = new Set<string>();
        return [...references, ...skillReferences, ...attachmentReferences].filter((reference) => {
            if (seen.has(reference.id)) return false;
            seen.add(reference.id);
            return true;
        });
    }, [attachmentReferences, references, skillReferences]);
    const canStop = Boolean(running && onStop);
    const textLength = agentTextLength(prompt);
    const overLimit = Boolean(charLimit && textLength > charLimit);
    const showCount = Boolean(charLimit && textLength > charLimit * 0.8);
    const blockedReason = overLimit ? translate("canvasTools.canvasCloudAgentComposer.exceedsCharactersRemove", { v0: String(charLimit!.toLocaleString()), v1: String(onLongTextPaste ? translate("canvasTools.canvasCloudAgentComposer.orConvertLongTextIntoACanvasTextNode") : "") }) : blockReason || null;
    // 请求在路上只拦「发送」：排队与保存不发请求，运行中照样可用。
    const canSubmit = !disabled && !submitDisabled && !blockedReason && !(sending && submitMode === "send") && Boolean(prompt.trim() || attachments.length);
    const canPrimary = canSubmit && !primaryDisabled;
    const modifierEnter = agentModifierShortcut("Enter");
    const wrapped = Boolean(footer || tray);
    const reducedMotion = useReducedMotion();
    const submitState = submitMode === "send" && sending ? "sending" : submitMode;
    const submitLabel = submitMode === "save" ? translate("common.save") : submitMode === "queue" ? translate("canvasTools.canvasCloudAgentComposer.queued") : sending ? translate("canvasTools.canvasCloudAgentComposer.sending") : translate("canvasTools.canvasCloudAgentComposer.send");
    const submitTitle =
        blockedReason ||
        (submitMode === "save"
            ? translate("canvasTools.canvasCloudAgentComposer.saveChangesEnterEscToCancel")
            : submitMode === "queue"
              ? primaryDisabled
                  ? translate("canvasTools.canvasCloudAgentComposer.queueIsFullRemoveOneItemFirstCanStillSend", { v0: String(modifierEnter) })
                  : translate("canvasTools.canvasCloudAgentComposer.queueSendInOrderAfterThisTurnEnterToInterject", { v0: String(modifierEnter) })
              : translate("canvasTools.canvasCloudAgentComposer.sendEnterOrCtrlEnterShiftEnterForANew"));
    const activeSlashIndex = Math.min(Math.max(slashIndex, 0), Math.max(slashCandidates.length - 1, 0));

    const handlePromptContentSizeChange = useCallback((naturalHeight: number) => {
        const nextHeight = clampAgentPromptHeight(naturalHeight);
        // 用户开始拖动后，面板高度由用户掌控；超出部分交给内部滚动区，
        // 避免输入新内容时又把手动缩小的面板强行撑开。
        setPromptHeight((currentHeight) => (manualPromptHeightRef.current === null ? nextHeight : currentHeight));
    }, []);

    useEffect(() => {
        if (prompt.trim()) return;
        manualPromptHeightRef.current = null;
        setPromptHeight(MIN_AGENT_PROMPT_HEIGHT);
    }, [prompt]);

    const startPromptResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (disabled) return;
        event.preventDefault();
        manualPromptHeightRef.current = promptHeight;
        promptResizeRef.current = { startY: event.clientY, startHeight: promptHeight };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const resizePrompt = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const resize = promptResizeRef.current;
        if (!resize) return;
        setPromptHeight(clampAgentPromptHeight(resize.startHeight + resize.startY - event.clientY));
    };

    const finishPromptResize = (event?: ReactPointerEvent<HTMLButtonElement>) => {
        promptResizeRef.current = null;
        if (event?.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    const resizePromptByKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        manualPromptHeightRef.current = promptHeight;
        setPromptHeight(clampAgentPromptHeight(promptHeight + (event.key === "ArrowUp" ? 20 : -20)));
    };

    // 在输入值末尾检测「/ 或 、+ 关键词」打开技能候选：中文输入法下 "/" 会打成 "、"，两者等价，且都必须紧跟行首或空白，避免中文顿号误触发。选中后写入稳定 token，编辑器再把它渲染为技能 chip。
    const handlePromptChange = (value: string) => {
        onPromptChange(value);
        const match = /(^|\s)[/、]([^\s/、]*)$/.exec(value);
        if (match && availableSlashSkills.length) {
            const next = { start: match.index + match[1].length, query: match[2] };
            setSlash((current) => (current && current.start === next.start && current.query === next.query ? current : next));
            setSlashIndex(0);
        } else if (slash) {
            setSlash(null);
        }
    };

    const applySlashSkill = (skill: Skill) => {
        const token = `@[skill:${skill.skillId}] `;
        // 触发符 "/" 与 "、" 都是单字符，替换长度固定为 1。
        const next = slash ? `${prompt.slice(0, slash.start)}${token}${prompt.slice(slash.start + 1 + slash.query.length)}` : prompt ? `${prompt.replace(/\s+$/u, "")} ${token}` : token;
        setSlash(null);
        setSlashIndex(0);
        onPromptChange(next);
    };

    // slash 菜单的键盘控制在 capture 阶段拦截（contentEditable/textarea 内部先消费 Enter，外层冒泡拿不到）
    const handleSlashKeyCapture = (event: ReactKeyboardEvent) => {
        if (!slash || !slashCandidates.length) return;
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            setSlashIndex((index) => Math.min(index + 1, slashCandidates.length - 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            setSlashIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            applySlashSkill(slashCandidates[activeSlashIndex]);
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setSlash(null);
        }
    };

    // 粘贴图片成附件（contentEditable 模式内部会把粘贴转纯文本，capture 阶段先取图片）。
    // 部分浏览器从网页复制图片只给 items，不给 files，两处都读，重复的由调用方去重。
    const handlePasteCapture = (event: ReactClipboardEvent) => {
        const data = event.clipboardData;
        const itemFiles = Array.from(data.items || [])
            .filter((entry) => entry.kind === "file")
            .map((entry) => entry.getAsFile())
            .filter((file): file is File => Boolean(file));
        const images = [...Array.from(data.files), ...itemFiles].filter((file) => file.type.startsWith("image/") || /\.(heic|heif)$/iu.test(file.name));
        const text = data.getData("text/plain");
        // 从访达复制文件时 text/plain 是文件名，不当成要粘贴的文字。
        const pastedText = images.some((file) => file.name === text.trim()) ? "" : text;
        if (images.length && onAddFiles) {
            // 只有图片时拦下粘贴；同时有文字时文字照常粘贴进输入框。
            if (!pastedText.trim()) {
                event.preventDefault();
                event.stopPropagation();
            }
            void onAddFiles(images);
        }
        if (pastedText && onLongTextPaste && agentTextLength(pastedText) > AGENT_LONG_TEXT_CHARS) onLongTextPaste(pastedText);
    };

    const insertAttachmentMention = (item: CloudAgentChatAttachment) => {
        const mention = item.nodeId ? canvasNodeMentionToken(item.nodeId) : `@[attachment:${item.id}]`;
        if (prompt.includes(mention)) return;
        onPromptChange(prompt ? `${prompt.replace(/\s+$/u, "")} ${mention} ` : `${mention} `);
    };
    const addItems = addMenu?.disabledReason
        ? [{ key: "reason", disabled: true, label: addMenu.disabledReason }]
        : [
              { key: "upload", icon: <ImagePlus className="size-3.5" />, label: translate("account.settings.profile.upload"), onClick: () => fileInputRef.current?.click() },
              ...(addMenu?.onPickAssets ? [{ key: "assets", icon: <FolderOpen className="size-3.5" />, label: translate("library.ark.group.fromLibrary"), onClick: addMenu.onPickAssets }] : []),
              ...(addMenu?.onReferenceSelection && addMenu.selectionCount ? [{ key: "selection", icon: <SquareDashedMousePointer className="size-3.5" />, label: translate("canvasTools.canvasCloudAgentComposer.referenceSelectedNodes", { v0: String(addMenu.selectionCount) }), onClick: addMenu.onReferenceSelection }] : []),
          ];

    return (
        <div className="agent-composer-wrap min-w-0 shrink-0" onWheelCapture={(event) => event.stopPropagation()}>
            {/* 有队列条或底部附加内容时，外壳托住它们与输入卡片，形成一张整卡。 */}
            <div className="agent-composer-shell relative" data-has-footer={wrapped ? "" : undefined}>
                <AnimatePresence initial={false}>
                    {tray ? (
                        <motion.div
                            key="outbox"
                            className="agent-composer-tray"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
                        >
                            {tray}
                        </motion.div>
                    ) : null}
                </AnimatePresence>
                <div
                    className="agent-composer-surface relative transition-colors duration-200"
                    style={{
                        color: theme.accent.primary,
                    }}
                >
                    {/* 调高把手固定在卡片最上沿；上下文行和附件在它下面，不会把把手挤到卡片中间。 */}
                    <button
                        type="button"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={translate("canvasTools.canvasCloudAgentComposer.adjustThePromptPanelHeight")}
                        aria-valuemin={MIN_AGENT_PROMPT_HEIGHT}
                        aria-valuemax={MAX_AGENT_PROMPT_HEIGHT}
                        aria-valuenow={promptHeight}
                        className="agent-composer-resize-handle"
                        style={{ color: theme.node.muted }}
                        onPointerDown={startPromptResize}
                        onPointerMove={resizePrompt}
                        onPointerUp={finishPromptResize}
                        onPointerCancel={finishPromptResize}
                        onKeyDown={resizePromptByKeyboard}
                    >
                        <span />
                    </button>
                    {contextBar ? <div className="agent-composer-context">{contextBar}</div> : null}
                    {attachments.length ? (
                        <div className="agent-attachments thin-scrollbar" role="list" aria-label={translate("canvasTools.canvasCloudAgentComposer.attachments", { v0: String(attachments.length) })}>
                            {attachments.map((item, index) => {
                                const status = item.status ?? "ready";
                                const busy = status === "uploading" || status === "pending";
                                const failed = status === "error" || status === "local_only" || status === "missing";
                                const name = item.nodeId ? item.name || (item.kind === "text" ? translate("account.settings.modelConfig.capabilities.text") : translate("canvasTools.canvasCloudAgentComposer.image", { v0: String(index + 1) })) : translate("canvasTools.canvasCloudAgentComposer.image", { v0: String(index + 1) });
                                // 卡片上只放名字主体；扩展名和完整名字在悬停提示里。
                                const label = name.replace(/\.(png|jpe?g|webp|gif|heic|heif)$/iu, "") || name;
                                const statusText =
                                    status === "uploading"
                                        ? item.progress !== undefined
                                            ? `${item.progress}%`
                                            : translate("canvasTools.canvasCloudAgentComposer.uploading")
                                        : status === "pending"
                                          ? translate("canvasA.fileUpload.preparingShort")
                                          : status === "error"
                                            ? item.error || translate("library.assets.batch.uploadFailed")
                                            : status === "local_only"
                                              ? translate("canvasTools.canvasCloudAgentComposer.onlyOnThisDeviceAgentCannotAccessIt")
                                              : status === "missing"
                                                ? translate("canvasTools.canvasCloudAgentComposer.deletedFromCanvas")
                                                : "";
                                return (
                                    <div key={item.id} role="listitem" className={`agent-attachment${failed ? " is-failed" : ""}`} aria-label={failed || busy ? `${name}：${statusText}` : name}>
                                        <button type="button" className="agent-attachment-thumb" title={item.url ? translate("canvasTools.canvasCloudAgentComposer.clickForALargerPreview", { v0: String(name) }) : name} aria-label={translate("canvasTools.canvasCloudAgentComposer.preview", { v0: String(name) })} onClick={() => (item.url ? setPreviewAttachment(item) : undefined)}>
                                            {item.url ? (
                                                <img src={item.url} alt="" className="size-full object-cover" />
                                            ) : (
                                                <span className="grid size-full place-items-center">
                                                    <FileText className="size-6 opacity-60" aria-hidden="true" />
                                                </span>
                                            )}
                                            {busy || failed ? (
                                                <span className={`agent-attachment-veil${failed ? " is-failed" : ""}`} aria-hidden="true">
                                                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <TriangleAlert className="size-4" />}
                                                    {busy ? <span>{statusText}</span> : null}
                                                </span>
                                            ) : null}
                                        </button>
                                        {onRemoveAttachment ? (
                                            // 移除叠在缩略图右上角：悬停或键盘聚焦时出现，触屏和失败时常显。
                                            <button
                                                type="button"
                                                className="agent-attachment-remove"
                                                onClick={() => onRemoveAttachment(item.id)}
                                                aria-label={translate("canvasTools.canvasCloudAgentComposer.remove", { v0: String(name) })}
                                                title={item.nodeId ? translate("canvasTools.canvasCloudAgentComposer.removeNodesAddedToTheCanvasForThisMessageThat") : translate("canvasB.common.remove")}
                                            >
                                                <X className="size-3" aria-hidden="true" />
                                            </button>
                                        ) : null}
                                        <button type="button" className="agent-attachment-label" title={translate("canvasTools.canvasCloudAgentComposer.insertInTheInput", { v0: String(name) })} onClick={() => insertAttachmentMention(item)}>
                                            <AtSign className="size-2.5 shrink-0" aria-hidden="true" />
                                            <span className="truncate">{label}</span>
                                        </button>
                                        {failed ? (
                                            <div className="agent-attachment-error" role="status" title={statusText}>
                                                <span>{statusText}</span>
                                                {item.retryable && onRetryAttachment ? (
                                                    <button type="button" className="agent-attachment-retry" onClick={() => onRetryAttachment(item.id)}>
                                                        {translate("common.retry")}
                                                    </button>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                    <div className="relative" onKeyDownCapture={handleSlashKeyCapture} onPasteCapture={handlePasteCapture}>
                        <div className="agent-composer-prompt-scroll" data-agent-composer-input style={{ height: promptHeight }}>
                            <CanvasResourceMentionTextarea
                                value={prompt}
                                references={composerReferences}
                                includeAssetLibrary={includeAssetLibrary}
                                sendOnEnter={canSubmit ? "both" : false}
                                disabled={disabled}
                                onChange={handlePromptChange}
                                onSubmit={(event) => {
                                    if (canSubmit) onSubmit({ alternate: Boolean(event?.modifier) });
                                }}
                                onKeyDown={(event) => {
                                    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing || !onEscape) return;
                                    event.preventDefault();
                                    onEscape();
                                }}
                                onContentSizeChange={handlePromptContentSizeChange}
                                className="w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 outline-none placeholder:opacity-45"
                                containerClassName="min-h-[60px] h-full"
                                style={{ color: theme.node.text }}
                                placeholder={placeholder}
                                aria-label={translate("canvasTools.canvasCloudAgentComposer.agentInput")}
                            />
                        </div>
                        {slash && slashCandidates.length ? (
                            <div
                                data-agent-slash-menu
                                className="absolute bottom-full left-0 z-[var(--z-toolbar)] mb-2 w-full max-w-xs overflow-hidden rounded-2xl p-2 shadow-2xl"
                                style={{ background: theme.toolbar.panel, boxShadow: `0 18px 44px ${theme.spatial.shadow}` }}
                                onMouseDown={(event) => event.preventDefault()}
                            >
                                {slashCandidates.map((skill, index) => (
                                    <button
                                        key={skill.skillId}
                                        type="button"
                                        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs"
                                        style={{ background: index === activeSlashIndex ? theme.toolbar.itemHover : "transparent", color: theme.node.text }}
                                        onMouseEnter={() => setSlashIndex(index)}
                                        onClick={() => applySlashSkill(skill)}
                                    >
                                        <Blocks className="size-3.5 shrink-0 opacity-70" />
                                        <span className="min-w-0 truncate font-medium">{skill.skillName}</span>
                                        {skill.description ? <span className="min-w-0 flex-1 truncate opacity-50">{skill.description}</span> : null}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <div className="agent-composer-toolbar mt-2">
                        <div className="agent-composer-controls flex min-w-0 items-center gap-1">
                            {onAddFiles ? (
                                <>
                                    <input
                                        ref={fileInputRef}
                                        hidden
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp,image/gif"
                                        multiple
                                        onChange={(event) => {
                                            void onAddFiles(event.target.files);
                                            event.target.value = "";
                                        }}
                                    />
                                    {/* 「+」固定在最左：上传图片、从素材库选择、引用选中节点。 */}
                                    <Dropdown trigger={["click"]} placement="topLeft" menu={{ items: addItems }}>
                                        <button type="button" className="agent-composer-add" disabled={disabled} aria-label={translate("canvasTools.canvasCloudAgentComposer.addImagesAssetsOrReferences")} title={addMenu?.disabledReason || translate("canvasTools.canvasCloudAgentComposer.addUploadAnImageSelectFromTheLibraryOrReference")}>
                                            <Plus className="size-4" aria-hidden="true" />
                                        </button>
                                    </Dropdown>
                                </>
                            ) : null}
                            {left}
                        </div>
                        <div className="agent-composer-submit flex items-center gap-2">
                            {showCount ? (
                                <span className={`agent-composer-count${overLimit ? " is-over" : ""}`} title={overLimit ? (blockedReason ?? undefined) : translate("canvasTools.canvasCloudAgentComposer.upToCharactersPerMessage", { v0: String(charLimit!.toLocaleString()) })}>
                                    {textLength.toLocaleString()} / {charLimit!.toLocaleString()}
                                </span>
                            ) : null}
                            {submitAccessory}
                            <span className="agent-composer-stop-slot">
                                <AnimatePresence initial={false}>
                                    {canStop ? (
                                        <motion.button
                                            key="stop"
                                            type="button"
                                            disabled={stopping}
                                            aria-label={translate("canvasTools.canvasCloudAgentComposer.stopThisRun")}
                                            title={stopping ? translate("canvasTools.canvasCloudAgentComposer.stoppingThisRun") : translate("canvasTools.canvasCloudAgentComposer.stopThisRunOrPressEscTwiceInTheInput")}
                                            onClick={() => void onStop?.()}
                                            data-icon-only
                                            className="agent-composer-stop grid size-7 shrink-0 place-items-center rounded-full p-0 disabled:cursor-not-allowed"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: reducedMotion ? 0 : 0.15 }}
                                        >
                                            {stopping ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Square className="size-3" fill="currentColor" aria-hidden="true" />}
                                        </motion.button>
                                    ) : null}
                                </AnimatePresence>
                            </span>
                            <button
                                type="button"
                                disabled={!canPrimary}
                                aria-label={submitMode === "save" ? translate("canvasTools.canvasCloudAgentComposer.saveChanges") : submitLabel}
                                aria-busy={submitState === "sending"}
                                title={submitTitle}
                                onClick={() => onSubmit({ alternate: false })}
                                className="agent-composer-send inline-grid h-7 shrink-0 place-items-center rounded-full p-0 text-[var(--fs-label)] font-medium outline-none transition-[background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-current/35 disabled:cursor-not-allowed"
                                style={{
                                    background: canPrimary || submitState === "sending" ? theme.accent.primary : theme.spatial.surface,
                                    color: canPrimary || submitState === "sending" ? theme.accent.onPrimary : theme.node.muted,
                                }}
                            >
                                <AnimatePresence initial={false} mode="sync">
                                    <motion.span key={submitState} className="agent-composer-send-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }} aria-hidden="true">
                                        {submitState === "sending" ? (
                                            <LoaderCircle className="size-3.5 animate-spin" />
                                        ) : submitMode === "save" ? (
                                            <Check className="size-3.5" />
                                        ) : submitMode === "queue" ? (
                                            <ListPlus className="size-3.5" />
                                        ) : (
                                            <ArrowUp className="size-3.5" />
                                        )}
                                        <span>{submitMode === "save" ? translate("common.save") : submitMode === "queue" ? translate("canvasTools.canvasCloudAgentComposer.queued") : translate("canvasTools.canvasCloudAgentComposer.send")}</span>
                                    </motion.span>
                                </AnimatePresence>
                            </button>
                        </div>
                    </div>
                </div>
                {footer}
            </div>
            {previewAttachment ? <AgentImagePreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} /> : null}
        </div>
    );
}

export function AgentImagePreview({ attachment, onClose }: { attachment: CloudAgentChatAttachment; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[var(--z-dialog-popover)] grid place-items-center bg-black/80 p-6" role="dialog" aria-label={attachment.name} onClick={onClose}>
            <img src={attachment.url} alt={attachment.name} className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl" onClick={(event) => event.stopPropagation()} />
            <button type="button" className="absolute right-5 top-5 rounded-full bg-black/60 p-2 text-white" onClick={onClose} aria-label={translate("canvasB.mention.closeImagePreview")}>
                <X className="size-5" />
            </button>
        </div>
    );
}
