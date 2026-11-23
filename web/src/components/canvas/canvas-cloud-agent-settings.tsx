import { useEffect, useState, type ReactNode } from "react";
import { Button, Checkbox, Input } from "antd";
import { ArrowLeft, BookMarked, Check, ChevronRight, Cpu, Gauge, LockKeyhole, PlugZap, Search, ShieldCheck, Sparkles, Wrench, Blocks, CirclePlay, X } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { ThinkingLevelSlider } from "@/components/thinking-level-slider";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { LEGACY_TEXT_THINKING_CONFIG, resolveThinkingLevel, thinkingLevelsFor } from "@/lib/text-thinking";
import { Switch } from "@/components/ui/base/switch";
import type { CanvasTheme } from "@/lib/canvas-theme";
import AgentMemoryPane from "@/pages/settings/agent-memory-pane";
import type { AgentPermissionMode, AgentProfileLayer, AgentProfileScope, AgentProfileView, AgentReasoningMode } from "@/services/api/agent";
import type { Skill, SkillAgentMode } from "@/services/api/skills";
import type { AiConfig } from "@/stores/use-config-store";
import { AgentConnectorsBar } from "./canvas-cloud-agent-connectors";
import { translate } from "@/i18n";

/** 对话固定的技能上限；与技能商店弹窗一致，后端另有含点名在内的 16 个硬上限。 */
export const AGENT_PINNED_SKILL_LIMIT = 8;

export type AgentContextKey = "canvas" | "resources" | "generation_history" | "skills" | "project";
type SettingsSection = "home" | "profile" | "memories" | "skills" | "mcp" | "context" | "budget";

type AgentSettingsProps = {
    theme: CanvasTheme;
    config: AiConfig;
    selectedModel: string;
    permissionMode: AgentPermissionMode;
    reasoningMode: AgentReasoningMode;
    onReasoningModeChange: (value: AgentReasoningMode) => void;
    profileView: AgentProfileView | null;
    profileLoading: boolean;
    profileSaving: boolean;
    profileError?: string;
    projectId?: string;
    /** 空字符串表示当前未绑定画布。 */
    canvasId: string;
    onReloadProfile: () => Promise<void>;
    onSaveProfile: (input: { scope: AgentProfileScope; projectId?: string; canvasId?: string; content: string; revision: number }) => Promise<AgentProfileView>;
    contextScope: AgentContextKey[];
    nodeCount: number | null;
    installedSkills: Skill[];
    marketSkills: Skill[];
    selectedSkillIds: string[];
    skillSearch: string;
    skillsLoading: boolean;
    skillHasMore: boolean;
    maxCredits: string;
    maxGenerationTasks: string;
    maxVideoSeconds: string;
    onBack: () => void;
    /** 设置页也能直接收起 Agent，不必先返回对话。 */
    onCollapse?: () => void;
    onModelChange: (model: string) => void;
    onPermissionChange: (mode: AgentPermissionMode) => void;
    onContextToggle: (value: AgentContextKey) => void;
    onSkillSearch: (value: string) => void;
    onSkillToggle: (skillId: string) => void;
    onSkillInstall: (skill: Skill) => Promise<void>;
    /** 切换已安装技能能否被 Agent 自动发现；失败时由调用方提示并保留原状态。 */
    onSkillAgentModeChange: (skill: Skill, mode: SkillAgentMode) => Promise<void>;
    onOpenSkillRecommendations: () => void;
    onLoadMoreSkills: () => Promise<void>;
    onMaxCreditsChange: (value: string) => void;
    onMaxGenerationTasksChange: (value: string) => void;
    onMaxVideoSecondsChange: (value: string) => void;
};

// 颜色走状态语义 token，明暗主题和皮肤自动适配；short 是输入框权限胶囊上的两字名。
const permissionOptions: Array<{ value: AgentPermissionMode; label: string; short: string; description: string; icon: typeof ShieldCheck; color: string }> = [
    { value: "read_only", label: translate("canvasTools.canvasCloudAgentSettings.readOnly"), short: translate("canvasTools.canvasCloudAgentSettings.readOnly"), description: translate("canvasTools.canvasCloudAgentSettings.analyzeAndSuggestOnly"), icon: LockKeyhole, color: "var(--status-loading)" },
    { value: "request_approval", label: translate("canvasTools.canvasCloudAgentSettings.requestApproval"), short: translate("canvasTools.canvasCloudAgentSettings.approval"), description: translate("canvasTools.canvasCloudAgentSettings.confirmBeforeWritingOrGenerating"), icon: ShieldCheck, color: "var(--status-warning)" },
    { value: "auto", label: translate("canvasTools.canvasCloudAgentSettings.executeAutomatically"), short: translate("account.layout.oss.auto"), description: translate("canvasTools.canvasCloudAgentSettings.useAuthorizedToolsWithinBudget"), icon: CirclePlay, color: "var(--status-success)" },
];

const contextOptions: Array<{ value: AgentContextKey; label: string; description: string }> = [{ value: "canvas", label: translate("canvasTools.canvasCloudAgentSettings.canvasNodeIndex"), description: translate("canvasTools.canvasCloudAgentSettings.eachRequestIncludesOnlyNodeIDsTypesAndTitlesContent") }];

export function CanvasCloudAgentSettings(props: AgentSettingsProps) {
    const [section, setSection] = useState<SettingsSection>("home");
    const [skillTab, setSkillTab] = useState<"installed" | "market">("installed");
    const { theme } = props;
    const title = section === "home" ? translate("canvasTools.canvasCloudAgentSettings.agentSettings") : sectionTitle(section);
    const goHome = () => setSection("home");

    return (
        <div className="canvas-agent-settings flex min-h-0 min-w-0 flex-1 flex-col" style={{ background: theme.node.panel }}>
            <header data-agent-drag-handle className="agent-panel-header flex shrink-0 items-center gap-2">
                <Button type="text" shape="circle" icon={<ArrowLeft className="size-4" />} onClick={section === "home" ? props.onBack : goHome} aria-label={section === "home" ? translate("canvasTools.canvasCloudAgentSettings.backToConversation") : translate("canvasTools.canvasCloudAgentSettings.backToSettings")} />
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="mt-0.5 text-[var(--fs-label)] opacity-40">{section === "home" ? translate("canvasTools.canvasCloudAgentSettings.appliesOnlyToTheNextNewRun") : sectionSubtitle(section)}</div>
                </div>
                {section !== "home" ? (
                    <span className="rounded-full px-2 py-1 text-[var(--fs-label)] opacity-50" style={{ background: theme.node.fill }}>
                        {section === "skills" ? translate("canvasTools.canvasCloudAgentSettings.pinned", { v0: String(props.selectedSkillIds.length) }) : translate("canvasTools.canvasCloudAgentSettings.currentAgent")}
                    </span>
                ) : null}
                {props.onCollapse ? <Button type="text" shape="circle" icon={<X className="size-4" />} onClick={props.onCollapse} aria-label={translate("canvasTools.canvasCloudAgentSettings.collapseTheAgent")} title={translate("account.feedback.collapse")} /> : null}
            </header>

            {section === "home" ? <SettingsHome props={props} theme={theme} onOpen={setSection} /> : null}
            {section === "profile" ? <ProfileWorkspace props={props} theme={theme} /> : null}
            {section === "memories" ? <MemoriesWorkspace /> : null}
            {section === "skills" ? <SkillsWorkspace props={props} theme={theme} tab={skillTab} onTabChange={setSkillTab} /> : null}
            {section === "mcp" ? <McpWorkspace theme={theme} /> : null}
            {section === "context" ? <ContextWorkspace props={props} theme={theme} /> : null}
            {section === "budget" ? <BudgetWorkspace props={props} theme={theme} /> : null}
        </div>
    );
}

function SettingsHome({ props, theme, onOpen }: { props: AgentSettingsProps; theme: CanvasTheme; onOpen: (section: SettingsSection) => void }) {
    const thinking = modelCapabilityConfigFor(props.config, props.selectedModel).text?.thinking || LEGACY_TEXT_THINKING_CONFIG;
    return (
        <div className="canvas-agent-settings-scroll thin-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
            <section>
                <ThinkingLevelSlider levels={thinkingLevelsFor(thinking)} value={props.reasoningMode} resolvedLevel={resolveThinkingLevel(thinking, props.reasoningMode)} onChange={props.onReasoningModeChange} />
            </section>
            <section>
                <SettingLabel label={translate("canvasTools.canvasCloudAgentSettings.conversationModel")} hint={translate("canvasTools.canvasCloudAgentSettings.appliesToNewRuns")} />
                <div className="min-w-0 rounded-xl px-2 py-2" style={{ background: theme.node.fill }}>
                    <ModelPicker
                        config={props.config}
                        value={props.selectedModel}
                        capability="text"
                        onChange={props.onModelChange}
                        variant="creation"
                        fullWidth
                        showSelectedPrice
                        showOptionPrices
                        placeholder={translate("canvasTools.canvasCloudAgentSettings.chooseATextModel")}
                        className="!border-0 !bg-transparent !shadow-none"
                        popoverClassName="agent-model-picker-popover"
                    />
                </div>
            </section>
            <section>
                <SettingLabel label={translate("canvasTools.canvasCloudAgentSettings.executionPermissions")} hint={translate("canvasTools.canvasCloudAgentSettings.appliesToNewRuns")} />
                <div className="canvas-agent-permissions">
                    {permissionOptions.map((option) => {
                        const Icon = option.icon;
                        const active = option.value === props.permissionMode;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                className="flex min-w-0 flex-col gap-2 rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
                                style={{ background: theme.node.fill, color: theme.node.text, boxShadow: active ? `inset 0 0 0 1px ${theme.node.muted}` : "none" }}
                                onClick={() => props.onPermissionChange(option.value)}
                                aria-pressed={active}
                            >
                                <span className="flex w-full items-center gap-2 text-xs font-medium">
                                    <Icon className="size-3.5 shrink-0" style={{ color: option.color }} />
                                    <span>{option.label}</span>
                                    {active ? <Check className="ml-auto size-3 shrink-0" /> : null}
                                </span>
                                <span className="text-[var(--fs-label)] leading-4" style={{ color: theme.node.muted }}>
                                    {option.description}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <p className="mt-2 text-xs leading-5" style={{ color: theme.node.muted }}>
                    {translate("canvasTools.canvasCloudAgentSettings.actionsRequireIndividualApprovalByDefaultAutomaticModeCanEdit")}
                </p>
            </section>
            <section>
                <SettingLabel label={translate("canvasTools.canvasCloudAgentSettings.capabilitiesAndScope")} />
                <div className="space-y-1">
                    <SettingRow theme={theme} icon={<Cpu className="size-4" />} title={translate("canvasTools.canvasCloudAgentSettings.context")} summary={props.nodeCount === null ? translate("library.tasks.shared.unboundCanvas") : translate("canvasTools.canvasCloudAgentSettings.nodesScopes", { v0: String(props.nodeCount), v1: String(props.contextScope.length) })} onClick={() => onOpen("context")} />
                    <SettingRow theme={theme} icon={<BookMarked className="size-4" />} title={translate("canvasTools.canvasCloudAgentSettings.longTermPreferences")} summary={profileSummary(props.profileView)} onClick={() => onOpen("profile")} />
                    <SettingRow theme={theme} icon={<BookMarked className="size-4" />} title={translate("canvasTools.canvasCloudAgentSettings.personalMemory")} summary={translate("canvasTools.canvasCloudAgentSettings.agentRemembersAndEditsThisDuringConversationsChangesCanBe")} onClick={() => onOpen("memories")} />
                    <SettingRow theme={theme} icon={<Blocks className="size-4" />} title={translate("canvasTools.canvasCloudAgentSettings.skillsYourLibrary")} summary={skillsSummary(props.installedSkills, props.selectedSkillIds)} onClick={() => onOpen("skills")} />
                    <SettingRow theme={theme} icon={<Wrench className="size-4" />} title={translate("canvasTools.canvasCloudAgentSettings.toolsAndConnections")} summary={translate("canvasTools.canvasCloudAgentSettings.canvasSkillReferenceFilesAndGenerationTasksThirdPartyConnections")} onClick={() => onOpen("mcp")} />
                    <SettingRow theme={theme} icon={<Gauge className="size-4" />} title={translate("canvasTools.canvasCloudAgentSettings.budget")} summary={translate("canvasTools.canvasCloudAgentSettings.upToCreditsPerTurnFixedPriceModels", { v0: String(props.maxCredits || translate("canvasTools.canvasCloudAgentSettings.notSet")) })} onClick={() => onOpen("budget")} />
                </div>
            </section>
        </div>
    );
}

function MemoriesWorkspace() {
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            <AgentMemoryPane compact />
        </div>
    );
}

function SkillsWorkspace({ props, theme, tab, onTabChange }: { props: AgentSettingsProps; theme: CanvasTheme; tab: "installed" | "market"; onTabChange: (tab: "installed" | "market") => void }) {
    const [modeSavingId, setModeSavingId] = useState("");
    const query = props.skillSearch.trim().toLocaleLowerCase();
    const source = tab === "installed" ? props.installedSkills.filter((skill) => `${skill.skillName} ${skill.description || ""}`.toLocaleLowerCase().includes(query)) : props.marketSkills;
    const pinLimitReached = props.selectedSkillIds.length >= AGENT_PINNED_SKILL_LIMIT;
    const changeMode = async (skill: Skill, auto: boolean) => {
        if (modeSavingId) return;
        setModeSavingId(skill.skillId);
        try {
            await props.onSkillAgentModeChange(skill, auto ? "auto" : "manual");
        } finally {
            setModeSavingId("");
        }
    };
    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="shrink-0 px-4 pt-4">
                <div className="flex gap-1 rounded-xl p-1" style={{ background: theme.node.fill }}>
                    <TabButton theme={theme} active={tab === "installed"} label={translate("canvasTools.canvasCloudAgentSettings.installed", { v0: String(props.installedSkills.length) })} onClick={() => onTabChange("installed")} />
                    <TabButton theme={theme} active={tab === "market"} label={translate("canvasTools.canvasCloudAgentSettings.skillMarketplace")} onClick={() => onTabChange("market")} />
                </div>
                <button
                    type="button"
                    className="canvas-agent-setting-row mt-3 flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2"
                    style={{ background: theme.node.fill }}
                    onClick={props.onOpenSkillRecommendations}
                >
                    <Sparkles className="size-4 shrink-0" style={{ color: theme.accent.primary }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium">{translate("canvasA.welcome.recommendTitle")}</span>
                        <span className="mt-0.5 block text-[var(--fs-label)] leading-4" style={{ color: theme.node.muted }}>
                            {translate("canvasTools.canvasCloudAgentSettings.commonSkillsForFilmAndShortDramaEcommerceMarketingCreative")}
                        </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0" style={{ color: theme.node.muted }} aria-hidden="true" />
                </button>
                <Input
                    prefix={<Search className="size-4" style={{ color: theme.node.muted }} />}
                    value={props.skillSearch}
                    onChange={(event) => props.onSkillSearch(event.target.value)}
                    placeholder={tab === "market" ? translate("canvasTools.canvasCloudAgentSettings.searchTheSkillMarketplace") : translate("canvasTools.canvasCloudAgentSettings.filterInstalledSkills")}
                    aria-label={translate("canvasTools.canvasCloudAgentSettings.searchSkills")}
                    className="mt-3 !h-10 !rounded-xl"
                />
                <p className="mt-3 text-xs leading-5" style={{ color: theme.node.muted }}>
                    {tab === "market" ? translate("canvasTools.canvasCloudAgentSettings.onceInstalledTheAgentFindsAndUsesSkillsWhenA") : translate("canvasTools.canvasCloudAgentSettings.theAgentFindsSkillsSetToAutomaticAsNeededPin", { v0: String(AGENT_PINNED_SKILL_LIMIT) })}
                </p>
            </div>
            <div className="canvas-agent-settings-scroll thin-scrollbar min-h-0 min-w-0 flex-1 space-y-1 overflow-y-auto p-4 pt-2">
                {props.skillsLoading && !source.length ? (
                    <div className="py-8 text-center text-xs" style={{ color: theme.node.muted }}>
                        {translate("canvasTools.canvasCloudAgentSettings.loadingSkills")}
                    </div>
                ) : null}
                {source.map((skill) => {
                    const pinned = props.selectedSkillIds.includes(skill.skillId);
                    return (
                        <SkillRow
                            key={skill.skillId}
                            skill={skill}
                            theme={theme}
                            pinned={pinned}
                            pinDisabled={!pinned && pinLimitReached}
                            installed={skill.isAdded}
                            installedView={tab === "installed"}
                            modeSaving={modeSavingId === skill.skillId}
                            modeDisabled={Boolean(modeSavingId) && modeSavingId !== skill.skillId}
                            onTogglePin={() => props.onSkillToggle(skill.skillId)}
                            onModeChange={(auto) => void changeMode(skill, auto)}
                            onInstall={() => void props.onSkillInstall(skill)}
                        />
                    );
                })}
                {!props.skillsLoading && !source.length ? (
                    <div className="py-10 text-center text-xs" style={{ color: theme.node.muted }}>
                        {tab === "installed" && !query ? translate("canvasTools.canvasCloudAgentSettings.noSkillsInstalledYetStartWithIndustryRecommendations") : translate("canvasTools.canvasCloudAgentSettings.noMatchesTryAnotherKeyword")}
                    </div>
                ) : null}
                {tab === "market" && props.skillHasMore ? (
                    <button type="button" className="my-3 w-full rounded-xl py-2 text-xs" style={{ background: theme.node.fill, color: theme.node.text }} onClick={() => void props.onLoadMoreSkills()} disabled={props.skillsLoading}>
                        {props.skillsLoading ? translate("canvasB.common.loading") : translate("canvasA.toolPicker.loadMore")}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function skillsSummary(installed: Skill[], pinnedIds: string[]) {
    if (!installed.length) return translate("canvasTools.canvasCloudAgentSettings.noSkillsInstalledYetInstallRecommendationsByIndustry");
    const auto = installed.filter((skill) => skill.agentMode !== "manual").length;
    return translate("canvasTools.canvasCloudAgentSettings.installedAvailableForAutomaticUse", { v0: String(installed.length), v1: String(auto), v2: String(pinnedIds.length ? translate("canvasTools.canvasCloudAgentSettings.pinned2", { v0: String(pinnedIds.length) }) : "") });
}

type ProfileDraft = Pick<AgentProfileLayer, "content" | "revision" | "hash"> & { dirty: boolean };

function ProfileWorkspace({ props, theme }: { props: AgentSettingsProps; theme: CanvasTheme }) {
    const [scope, setScope] = useState<AgentProfileScope>("user");
    const [drafts, setDrafts] = useState<Record<string, ProfileDraft>>({});
    const [error, setError] = useState("");
    const layer = profileLayer(props.profileView, scope, props.projectId, props.canvasId);
    const draftKey = profileDraftKey(scope, props.projectId, props.canvasId);
    const serverDraft: ProfileDraft = { content: layer.content, revision: layer.revision, hash: layer.hash, dirty: false };
    const draft = drafts[draftKey] || serverDraft;
    const profileUnavailable = props.profileLoading || !props.profileView || Boolean(props.profileError);

    useEffect(() => {
        setDrafts((current) => {
            const existing = current[draftKey];
            if (existing?.dirty) return current;
            if (existing && existing.revision === layer.revision && existing.hash === layer.hash && existing.content === layer.content) return current;
            return { ...current, [draftKey]: { content: layer.content, revision: layer.revision, hash: layer.hash, dirty: false } };
        });
        setError("");
    }, [draftKey, layer.content, layer.hash, layer.revision]);

    const updateDraft = (content: string) => {
        setDrafts((current) => {
            const base = current[draftKey] || serverDraft;
            return { ...current, [draftKey]: { ...base, content, dirty: true } };
        });
    };

    const save = async () => {
        setError("");
        try {
            const result = await props.onSaveProfile({
                scope,
                projectId: scope === "project" ? props.projectId : undefined,
                canvasId: scope === "canvas" ? props.canvasId : undefined,
                content: draft.content,
                revision: draft.revision,
            });
            const savedLayer = profileLayer(result, scope, props.projectId, props.canvasId);
            setDrafts((current) => ({
                ...current,
                [draftKey]: { content: savedLayer.content, revision: savedLayer.revision, hash: savedLayer.hash, dirty: false },
            }));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    };

    const disabled = profileUnavailable || props.profileSaving || (scope === "project" && !props.projectId) || (scope === "canvas" && !props.canvasId);
    return (
        <div className="canvas-agent-settings-scroll thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="rounded-xl p-4" style={{ background: theme.node.fill }}>
                <div className="text-sm font-semibold">{translate("canvasTools.canvasCloudAgentSettings.longTermPreferencesDocument")}</div>
                <p className="mt-2 text-xs leading-5" style={{ color: theme.node.muted }}>
                    {translate("canvasTools.canvasCloudAgentSettings.setTheAgentSLongTermWorkingHabitsToneAnd")}
                </p>
            </div>
            <div className="mt-4 flex gap-1 rounded-xl p-1" style={{ background: theme.node.fill }}>
                <TabButton theme={theme} active={scope === "user"} label={translate("canvasTools.canvasCloudAgentSettings.users")} onClick={() => setScope("user")} />
                <TabButton theme={theme} active={scope === "project"} label={translate("canvasTools.canvasCloudAgentSettings.projects")} onClick={() => setScope("project")} />
                {props.canvasId ? <TabButton theme={theme} active={scope === "canvas"} label={translate("nav.tools.canvas")} onClick={() => setScope("canvas")} /> : null}
            </div>
            {scope === "project" && !props.projectId ? (
                <p className="mt-3 text-xs leading-5" style={{ color: theme.node.muted }}>
                    {translate("canvasTools.canvasCloudAgentSettings.projectPreferencesAreUnavailableOutsideACanvasLinkedToA")}
                </p>
            ) : null}
            {props.profileLoading ? (
                <p className="mt-4 text-xs" style={{ color: theme.node.muted }}>
                    {translate("canvasTools.canvasCloudAgentSettings.loadingPreferencesSnapshot")}
                </p>
            ) : null}
            {props.profileError ? <ProfileError message={props.profileError} onRetry={props.onReloadProfile} theme={theme} /> : null}
            <label className="mt-4 block">
                <span className="flex items-center justify-between text-xs font-semibold">
                    <span>{scopeLabel(scope)}</span>
                    <span className="text-[var(--fs-label)] font-normal opacity-40">
                        {translate("canvasTools.inline.canvasCloudAgentSettings.revision", { v0: String(draft.revision), v1: String(draft.dirty ? (" " + translate("canvasTools.canvasCloudAgentSettings.unsaved")) : "") })}
                    </span>
                </span>
                <Input.TextArea
                    value={draft.content}
                    onChange={(event) => updateDraft(event.target.value)}
                    disabled={disabled}
                    maxLength={12000}
                    showCount
                    autoSize={{ minRows: 10, maxRows: 20 }}
                    placeholder={translate("canvasTools.canvasCloudAgentSettings.forExampleStartWithTheConclusionThenListTheShots")}
                    className="mt-2 !rounded-xl"
                    style={{ background: theme.node.fill }}
                />
            </label>
            <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[var(--fs-label)] leading-4 opacity-45">{translate("canvasTools.canvasCloudAgentSettings.savingAffectsOnlyTheNextNewRunAnActiveAgent")}</span>
                <Button type="primary" onClick={() => void save()} loading={props.profileSaving} disabled={disabled || !draft.dirty}>
                    {translate("common.save")}
                </Button>
            </div>
            {error ? (
                <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: "#d66b6b1f", color: "#d66b6b" }}>
                    {error}
                </div>
            ) : null}
        </div>
    );
}

function profileDraftKey(scope: AgentProfileScope, projectId: string | undefined, canvasId: string) {
    if (scope === "project") return `project:${projectId || "unbound"}`;
    if (scope === "canvas") return `canvas:${canvasId}`;
    return "user";
}

function profileLayer(view: AgentProfileView | null, scope: AgentProfileScope, projectId: string | undefined, canvasId: string): AgentProfileLayer {
    return view?.layers.find((item) => item.scope === scope) || { scope, projectId: scope === "project" ? projectId : undefined, canvasId: scope === "canvas" ? canvasId : undefined, content: "", revision: 0, hash: "" };
}

function profileSummary(view: AgentProfileView | null) {
    const count = view?.layers.filter((layer) => layer.content.trim()).length || 0;
    return count ? translate("canvasTools.canvasCloudAgentSettings.layersConfiguredAffectsBehavioralPreferencesOnly", { v0: String(count) }) : translate("canvasTools.canvasCloudAgentSettings.notConfiguredAffectsBehavioralPreferencesOnly");
}

function scopeLabel(scope: AgentProfileScope) {
    return scope === "user" ? translate("canvasTools.canvasCloudAgentSettings.userPreferences") : scope === "project" ? translate("canvasTools.canvasCloudAgentSettings.projectPreferences") : translate("canvasTools.canvasCloudAgentSettings.currentCanvasPreferences");
}

function ProfileError({ message, onRetry, theme }: { message: string; onRetry: () => Promise<void>; theme: CanvasTheme }) {
    return (
        <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: "#d6a24a1f", color: theme.node.text }}>
            <div>{message}</div>
            <button type="button" className="mt-2 underline" onClick={() => void onRetry()}>
                {translate("auth.register.reload")}
            </button>
        </div>
    );
}

type SkillRowProps = {
    skill: Skill;
    theme: CanvasTheme;
    pinned: boolean;
    pinDisabled: boolean;
    installed: boolean;
    /** 已安装页显示「固定」和「自动」；市场页只显示安装按钮。 */
    installedView: boolean;
    modeSaving: boolean;
    modeDisabled: boolean;
    onTogglePin: () => void;
    onModeChange: (auto: boolean) => void;
    onInstall: () => void;
};

function SkillRow({ skill, theme, pinned, pinDisabled, installed, installedView, modeSaving, modeDisabled, onTogglePin, onModeChange, onInstall }: SkillRowProps) {
    const auto = skill.agentMode !== "manual";
    return (
        <div className="canvas-agent-skill-row flex min-w-0 items-start gap-3 rounded-xl p-3 transition-colors">
            {installedView ? null : (
                <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: theme.node.fill, color: theme.node.muted }}>
                    <Blocks className="size-4" />
                </span>
            )}
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 flex-1 break-words text-[var(--fs-ui)] font-medium [overflow-wrap:anywhere]">{skill.skillName}</span>
                    {skill.version ? (
                        <span className="shrink-0 text-[var(--fs-label)]" style={{ color: theme.node.muted }}>
                            v{skill.version}
                        </span>
                    ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 [overflow-wrap:anywhere]" style={{ color: theme.node.muted }} title={skill.description || undefined}>
                    {skill.description || translate("canvasA.skillLibrary.noDescription")}
                </p>
                {installedView ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: theme.node.muted }}>
                        <span className="inline-flex items-center gap-2">
                            <Switch size="sm" checked={auto} loading={modeSaving} disabled={modeDisabled} onChange={onModeChange} aria-label={translate("canvasTools.canvasCloudAgentSettings.allowTheAgentToUseAutomatically", { v0: String(skill.skillName) })} />
                            <span aria-hidden="true">{auto ? translate("account.layout.oss.auto") : translate("canvasTools.canvasCloudAgentSettings.manualOnly")}</span>
                        </span>
                        <Checkbox checked={pinned} disabled={pinDisabled} onChange={onTogglePin} aria-label={translate("canvasTools.canvasCloudAgentSettings.pinInThisConversation", { v0: String(skill.skillName) })}>
                            <span className="text-xs" style={{ color: theme.node.muted }} title={pinDisabled ? translate("canvasTools.canvasCloudAgentSettings.pinUpToSkills", { v0: String(AGENT_PINNED_SKILL_LIMIT) }) : undefined}>
                                {translate("canvasA.skillLibrary.pin")}
                            </span>
                        </Checkbox>
                    </div>
                ) : null}
            </div>
            {!installedView ? (
                <Button size="small" type="text" className="!shrink-0 !px-2" disabled={installed} onClick={onInstall}>
                    {installed ? translate("canvasA.skillSuggestion.installedBadge") : translate("canvasB.common.add")}
                </Button>
            ) : null}
        </div>
    );
}

function McpWorkspace({ theme }: { theme: CanvasTheme }) {
    return (
        <div className="canvas-agent-settings-scroll thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <div className="rounded-xl p-4" style={{ background: theme.node.fill }}>
                <div className="flex items-center gap-2 text-sm font-medium">
                    <PlugZap className="size-4 shrink-0" />
                    {translate("canvasTools.canvasCloudAgentSettings.builtInServerTools")}
                </div>
                <p className="mt-2 text-xs leading-5" style={{ color: theme.node.muted }}>
                    {translate("canvasTools.canvasCloudAgentSettings.toolsFollowThisRunSPermissionsAndTheirAvailabilityIs")}
                </p>
            </div>
            <section>
                <SettingLabel label={translate("canvasTools.canvasCloudAgentSettings.toolScope")} />
                {[translate("canvasTools.canvasCloudAgentSettings.readSavedCanvases"), translate("canvasTools.canvasCloudAgentSettings.skillReferenceFilesPinnedVersions"), translate("canvasTools.canvasCloudAgentSettings.writeTextMarkdownNodes"), translate("canvasTools.canvasCloudAgentSettings.systemModelMediaGenerationAndTaskLookup")].map((tool) => (
                    <div key={tool} className="flex items-center gap-3 py-3 text-xs">
                        <Wrench className="size-4 shrink-0" style={{ color: theme.node.muted }} />
                        <span className="flex-1">{tool}</span>
                        <span style={{ color: theme.node.muted }}>{translate("canvasTools.canvasCloudAgentSettings.subjectToPermissions")}</span>
                    </div>
                ))}
            </section>
            <section>
                <SettingLabel label={translate("canvasTools.canvasCloudAgentSettings.thirdPartyConnections")} hint={translate("canvasTools.canvasCloudAgentSettings.comingSoon")} />
                <AgentConnectorsBar />
            </section>
            <p className="text-xs leading-5" style={{ color: theme.node.muted }}>
                {translate("canvasTools.canvasCloudAgentSettings.customMCPIsNotAvailableYetTheAgentBackendMust")}
            </p>
        </div>
    );
}

function ContextWorkspace({ props, theme }: { props: AgentSettingsProps; theme: CanvasTheme }) {
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="rounded-xl p-4" style={{ background: theme.node.fill }}>
                <div className="text-sm font-semibold">{translate("canvasTools.canvasCloudAgentSettings.whatTheAgentCanRead")}</div>
                <div className="mt-1 text-[var(--fs-label)] opacity-45">{translate("canvasTools.canvasCloudAgentSettings.changesContextScopeOnlyForThisNewRun")}</div>
            </div>
            <div className="mt-4 space-y-1">
                {contextOptions.map((option) => {
                    const active = props.contextScope.includes(option.value);
                    return (
                        <button
                            key={option.value}
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
                            style={{ background: active ? theme.accent.primarySoft : theme.node.fill }}
                            onClick={() => props.onContextToggle(option.value)}
                            aria-pressed={active}
                        >
                            <span className="grid size-5 shrink-0 place-items-center rounded" style={{ background: active ? theme.accent.primary : theme.node.panel, color: active ? theme.accent.onPrimary : theme.node.muted }}>
                                {active ? <Check className="size-3" /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-xs font-medium">{option.label}</span>
                                <span className="mt-0.5 block text-[var(--fs-label)] opacity-45">{option.description}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function BudgetWorkspace({ props, theme }: { props: AgentSettingsProps; theme: CanvasTheme }) {
    return (
        <div className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="rounded-xl p-4" style={{ background: theme.node.fill }}>
                <div className="text-sm font-semibold">{translate("canvasTools.canvasCloudAgentSettings.totalBudgetForThisRun")}</div>
                <p className="mt-2 text-xs opacity-60">{translate("canvasTools.canvasCloudAgentSettings.theCreditBudgetLimitsSpendingSetGenerationTasksOrVideo")}</p>
            </div>
            <BudgetInput label={translate("canvasTools.canvasCloudAgentSettings.creditLimit")} hint={translate("canvasTools.canvasCloudAgentSettings.requiredAndGreaterThan0CumulativeAcrossAllSteps")} value={props.maxCredits} onChange={props.onMaxCreditsChange} theme={theme} />
            <BudgetInput label={translate("canvasTools.canvasCloudAgentSettings.generationTaskLimit")} hint={translate("canvasTools.canvasCloudAgentSettings.item0MeansUnlimitedReadOnlyModeDoesNotGenerate")} value={props.maxGenerationTasks} onChange={props.onMaxGenerationTasksChange} theme={theme} />
            <BudgetInput label={translate("canvasTools.canvasCloudAgentSettings.videoSecondsLimit")} hint={translate("canvasTools.canvasCloudAgentSettings.item0MeansUnlimitedCumulativeRequestDuration")} value={props.maxVideoSeconds} onChange={props.onMaxVideoSecondsChange} theme={theme} />
        </div>
    );
}

function SettingRow({ theme, icon, title, summary, onClick }: { theme: CanvasTheme; icon: ReactNode; title: string; summary: string; onClick: () => void }) {
    return (
        <button type="button" className="canvas-agent-setting-row flex w-full min-w-0 items-center gap-3 rounded-xl p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2" onClick={onClick}>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: theme.node.fill, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[var(--fs-ui)] font-medium">{title}</span>
                <span className="mt-1 block text-xs leading-5" style={{ color: theme.node.muted }}>
                    {summary}
                </span>
            </span>
            <ChevronRight className="size-4 shrink-0" style={{ color: theme.node.muted }} />
        </button>
    );
}
function TabButton({ active, label, onClick, theme }: { active: boolean; label: string; onClick: () => void; theme: CanvasTheme }) {
    return (
        <button
            type="button"
            aria-pressed={active}
            className="min-w-0 flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2"
            style={{ background: active ? theme.toolbar.itemHover : "transparent", color: active ? theme.node.text : theme.node.muted }}
            onClick={onClick}
        >
            {label}
        </button>
    );
}
function SettingLabel({ label, hint }: { label: string; hint?: string }) {
    return (
        <div className="mb-2 flex items-center justify-between text-xs font-semibold">
            <span>{label}</span>
            {hint ? <span className="text-[var(--fs-label)] font-normal opacity-40">{hint}</span> : null}
        </div>
    );
}
function BudgetInput({ label, hint, value, onChange, theme }: { label: string; hint: string; value: string; onChange: (value: string) => void; theme: CanvasTheme }) {
    return (
        <label className="block">
            <span className="flex items-center justify-between text-xs font-medium">
                <span>{label}</span>
                <span className="text-[var(--fs-label)] opacity-40">{hint}</span>
            </span>
            <Input size="large" value={value} onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="mt-2 !rounded-lg" style={{ background: theme.node.fill }} />
        </label>
    );
}
function sectionTitle(section: SettingsSection) {
    return section === "profile" ? translate("canvasTools.canvasCloudAgentSettings.longTermPreferences") : section === "memories" ? translate("canvasTools.canvasCloudAgentSettings.personalMemory") : section === "skills" ? "Skills" : section === "mcp" ? translate("canvasTools.canvasCloudAgentSettings.mCPAndTools") : section === "context" ? translate("canvasTools.canvasCloudAgentSettings.context") : translate("canvasTools.canvasCloudAgentSettings.budget");
}
function sectionSubtitle(section: SettingsSection) {
    return section === "profile"
        ? translate("canvasTools.canvasCloudAgentSettings.longTermBehavioralPreferencesForUsersProjectsAndCanvases")
        : section === "memories"
          ? translate("canvasTools.canvasCloudAgentSettings.onlyYoursAgentOrganizesItAutomaticallyWithUndoAvailable")
          : section === "skills"
            ? translate("canvasTools.canvasCloudAgentSettings.agentAutomaticallySelectsInstalledSkillsForTheTask")
            : section === "mcp"
              ? translate("canvasTools.canvasCloudAgentSettings.cloudToolsAndConnectionStatus")
              : section === "context"
                ? translate("canvasTools.canvasCloudAgentSettings.controlWhatAgentCanRead")
                : translate("canvasTools.canvasCloudAgentSettings.controlCreditsAndGenerationUsageForThisTurn");
}

export function agentPermissionLabel(mode: AgentPermissionMode) {
    return permissionOptions.find((option) => option.value === mode)?.label || translate("canvasTools.canvasCloudAgentSettings.requestApproval");
}
export function agentPermissionShortLabel(mode: AgentPermissionMode) {
    return permissionOptions.find((option) => option.value === mode)?.short || translate("canvasTools.canvasCloudAgentSettings.approval");
}
export function agentPermissionVisual(mode: AgentPermissionMode) {
    const option = permissionOptions.find((item) => item.value === mode) || permissionOptions[0];
    return { color: option.color, soft: `color-mix(in srgb, ${option.color} 12%, transparent)`, icon: option.icon };
}
export function agentPermissionMenuItems(mode: AgentPermissionMode, onChange: (mode: AgentPermissionMode) => void) {
    return permissionOptions.map((option) => ({
        key: option.value,
        label: <span>{option.label}</span>,
        icon: mode === option.value ? <Check className="size-3.5" style={{ color: option.color }} /> : <option.icon className="size-3.5" style={{ color: option.color }} />,
        onClick: () => onChange(option.value),
    }));
}
