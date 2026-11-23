import { agentToolRetry, type AgentToolRetry } from "./agent-tool-retry";
import { translate } from "@/i18n";


/**
 * 前端工具清单，口径与后端 `CloudAgentSupportedToolNames()`
 * （`backend/internal/app/cloud_agent_tools.go`，从 `compileCloudAgentTools` 派生）逐一对齐。
 *
 * 作用只有一个：让"哪些工具该有类别与文案"这件事可断言。上游合并后工具表若变了，
 * 这份清单与下面的类别集合要一起复核 —— 未登记的工具一律走"其他操作"的中性兜底，
 * 绝不能落进"修改画布"（那会把一次读取读成写操作）。
 */
export const AGENT_TOOL_NAMES = [
    "agent_profile_read",
    "ask_user",
    "canvas_apply_ops",
    "canvas_arrange_nodes",
    "canvas_build_board",
    "canvas_create_character",
    "canvas_create_storyboard",
    "canvas_edit_batch_table",
    "canvas_edit_storyboard",
    "canvas_get_state",
    "canvas_inspect_image",
    "canvas_list_node_types",
    "canvas_preflight",
    "canvas_read_batch_table",
    "canvas_read_storyboard",
    "drama_adopt_canvas_media",
    "drama_get_context",
    "finish_run",
    "generate_media",
    "generate_media_batch",
    "image_annotation_render",
    "image_layer_split",
    "image_text_detect",
    "media_batch_control",
    "memory_update",
    "model_list",
    "plan_update",
    "skill_market_search",
    "skill_read_file",
    "skill_recommend",
    "skill_search",
    "task_get",
] as const;

export type AgentToolSummaryContext = { pending: boolean; detail?: unknown; text: string };

export type AgentToolMetadataEntry = {
    summary: string | ((context: AgentToolSummaryContext) => string);
    /** 失败文案也支持函数形态：识图要按回执/错误细分（额度、读循环、批量上限、能力缺失）。 */
    failureMessage: string | ((context: AgentToolSummaryContext) => string);
};

export const AGENT_TOOL_METADATA: Record<string, AgentToolMetadataEntry> = {
    canvas_list_node_types: { summary: translate("shared.canvas.agentToolPresentation.readAvailableNodeTypes"), failureMessage: translate("shared.canvas.agentToolPresentation.failedToGetAvailableNodeTypes") },
    // 清单 ≠ 画面：这个工具只读到节点存在/类型/标题/规模。说成"已读取当前画布"会被读成看过图。
    canvas_get_state: { summary: translate("shared.canvas.agentToolPresentation.readTheCanvasInventoryImagesNotViewed"), failureMessage: translate("shared.canvas.agentToolPresentation.failedToGetTheCanvasInventory") },
    task_get: { summary: translate("shared.canvas.agentToolPresentation.checkedTaskStatus"), failureMessage: translate("shared.canvas.agentToolPresentation.failedToCheckTaskStatus") },
    canvas_apply_ops: { summary: ({ pending }) => (pending ? translate("shared.canvas.agentToolPresentation.preparingToUpdateCanvasContent") : translate("shared.canvas.agentToolPresentation.canvasContentSavedToTheServer")), failureMessage: translate("shared.canvas.agentToolPresentation.failedToUpdateCanvasContent") },
    model_list: { summary: translate("shared.canvas.agentToolPresentation.retrievedAvailableModels"), failureMessage: translate("shared.canvas.agentToolPresentation.failedToGetAvailableModels") },
    canvas_create_character: { summary: ({ pending }) => (pending ? translate("shared.canvas.agentToolPresentation.preparingToCreateACharacterCard") : translate("shared.canvas.agentToolPresentation.characterCardCreatedAndAddedToTheCanvas")), failureMessage: translate("shared.canvas.agentToolPresentation.failedToCreateACharacterCard") },
    // 短剧工具只在关联短剧的精修画布上出现：读取作品上下文，或把画布媒体采用为短剧的新版本（总要审批）。
    drama_get_context: { summary: translate("shared.canvas.agentToolPresentation.readDramaSettingsAndEpisodes"), failureMessage: translate("shared.canvas.agentToolPresentation.failedToReadDramaInformation") },
    drama_adopt_canvas_media: { summary: ({ pending }) => (pending ? translate("shared.canvas.agentToolPresentation.preparingToAdoptIntoTheDrama") : translate("shared.canvas.agentToolPresentation.adoptedIntoTheDramaAsTheNewCurrentVersion")), failureMessage: translate("shared.canvas.agentToolPresentation.failedToAdoptIntoTheDrama") },
    generate_media: { summary: ({ pending, detail }) => (pending ? translate("shared.canvas.agentToolPresentation.preparingToCreateMediaNodesAndGenerate") : field(detail, "eventType") === "tool_completed" ? translate("shared.canvas.agentToolPresentation.generationResultsWrittenBackToCanvasNodes") : translate("shared.canvas.agentToolPresentation.mediaNodesCreatedGenerationTasksSubmitted")), failureMessage: translate("shared.canvas.agentToolPresentation.mediaGenerationIncomplete") },
    // 批量生成：一次审批，后台并发提交；回执里是本批的完成情况。
    generate_media_batch: {
        summary: ({ pending, detail }) => {
            if (pending) return translate("shared.canvas.agentToolPresentation.preparingBatchGeneration");
            const summary = field(field(detail, "result"), "summary");
            return typeof summary === "string" && summary ? summary : translate("shared.canvas.agentToolPresentation.batchGenerationEnded");
        },
        failureMessage: translate("shared.canvas.agentToolPresentation.batchGenerationDidNotStart"),
    },
    media_batch_control: {
        summary: ({ pending, detail }) => {
            if (pending) return translate("shared.canvas.agentToolPresentation.preparingABatchOperation");
            const summary = field(field(detail, "result"), "summary");
            return typeof summary === "string" && summary ? summary : translate("shared.canvas.agentToolPresentation.batchOperationCompleted");
        },
        failureMessage: translate("shared.canvas.agentToolPresentation.batchOperationIncomplete"),
    },
    canvas_build_board: {
        summary: ({ pending, detail }) => {
            if (pending) return translate("shared.canvas.agentToolPresentation.preparingToBuildAProductionBoard");
            const summary = field(field(detail, "result"), "summary");
            return typeof summary === "string" && summary ? summary : translate("shared.canvas.agentToolPresentation.productionBoardBuilt");
        },
        failureMessage: translate("shared.canvas.agentToolPresentation.failedToBuildTheBoard"),
    },
    canvas_preflight: {
        summary: ({ pending, detail }) => {
            if (pending) return translate("shared.canvas.agentToolPresentation.preparingAnInspection");
            const summary = field(field(detail, "result"), "summary");
            return typeof summary === "string" && summary ? summary : translate("shared.canvas.agentToolPresentation.inspectionCompleted");
        },
        failureMessage: translate("shared.canvas.agentToolPresentation.inspectionIncomplete"),
    },
    // 看图：只有这个工具会把图片字节真的交给模型，所以只有它可以说"画面/看图"。
    // 回执字段来源：`backend/internal/app/cloud_agent_runtime.go`（payload["result"] = 回执）。
    canvas_inspect_image: {
        summary: ({ pending, detail }) => {
            const result = record(field(detail, "result"));
            const title = typeof result.title === "string" && result.title ? `《${result.title}》` : translate("shared.canvas.agentToolPresentation.thisImage");
            if (result.reuseObservation === true) return translate("shared.canvas.agentToolPresentation.reusedTheRecordedObservationWithoutViewingTheImageAgain");
            const batch = Array.isArray(result.batchImages) ? result.batchImages : [];
            if (result.repeat === true && batch.length === 0) return translate("shared.canvas.agentToolPresentation.repeatedViewInThisRoundTextReceiptOnlyNoImage");
            if (batch.length > 1) return translate("shared.canvas.agentToolPresentation.attachedImages", { v0: String(batch.length) });
            return pending ? translate("shared.canvas.agentToolPresentation.preparingToViewImages", { v0: String(title) }) : translate("shared.canvas.agentToolPresentation.attachedImagesFor", { v0: String(title) });
        },
        failureMessage: ({ text, detail }) => agentVisionFailureSummary(text, detail),
    },
    // 收尾闸门（工作项 A）：被拦下时卡片要说清"这次没结束"，而不是千篇一律的"操作已完成"。
    finish_run: {
        summary: ({ pending, detail }) => (pending ? translate("shared.canvas.agentToolPresentation.preparingToFinishAndProvideTheFinalResponse") : field(field(detail, "result"), "completionBlocked") === true ? translate("shared.canvas.agentToolPresentation.finalizationBlockedContinuingUnfinishedItems") : translate("shared.canvas.agentToolPresentation.finishedAndProvidedTheFinalResponse")),
        failureMessage: translate("shared.canvas.agentToolPresentation.finalizationIncomplete"),
    },
    // 长期记忆只属于当前用户，不是画布写入；结果状态来自 memory_update 回执（applied / pending_review / unchanged）。
    memory_update: {
        summary: ({ pending, detail }) => {
            if (pending) return translate("shared.canvas.agentToolPresentation.preparingToOrganizeLongTermMemory");
            const status = field(field(detail, "result"), "status");
            if (status === "pending_review") return translate("shared.canvas.agentToolPresentation.memoryChangesSubmittedForYourConfirmation");
            if (status === "unchanged") return translate("shared.canvas.agentToolPresentation.memoryAlreadyContainsThisContentNoChangesMade");
            return translate("canvasA.memoryCard.updated");
        },
        failureMessage: translate("shared.canvas.agentToolPresentation.longTermMemoryNotUpdated"),
    },
    // 市场检索只返回候选元数据，不读正文、不安装。
    skill_market_search: {
        summary: ({ pending, detail }) => {
            if (pending) return translate("shared.canvas.agentToolPresentation.preparingToSearchTheSkillMarketplace");
            const matches = field(field(detail, "result"), "matches");
            if (!Array.isArray(matches)) return translate("shared.canvas.agentToolPresentation.searchedTheSkillMarketplace");
            return matches.length ? translate("shared.canvas.agentToolPresentation.foundCandidatesInTheSkillMarketplace", { v0: String(matches.length) }) : translate("shared.canvas.agentToolPresentation.noMatchingSkillsInTheMarketplace");
        },
        failureMessage: translate("shared.canvas.agentToolPresentation.skillMarketplaceSearchFailed"),
    },
    skill_recommend: { summary: ({ pending }) => (pending ? translate("shared.canvas.agentToolPresentation.preparingSkillInstallationRecommendations") : translate("shared.canvas.agentToolPresentation.skillInstallationRecommendedYouChooseWhetherToInstall")), failureMessage: translate("shared.canvas.agentToolPresentation.skillRecommendationsNotShown") },
};

/** 画布上"读到清单"的只读工具：无像素，chip 必须是存在式。 */
const AGENT_CANVAS_READ_TOOLS = new Set(["canvas_get_state", "canvas_list_node_types", "canvas_read_storyboard", "canvas_read_batch_table"]);
/** 非画布信息的只读工具（模型、任务、技能、偏好）。`skills_load` 是历史事件名，保留兼容。 */
const AGENT_INFO_READ_TOOLS = new Set(["model_list", "task_get", "skill_search", "skill_market_search", "skill_read_file", "skills_load", "agent_profile_read", "drama_get_context", "canvas_preflight"]);
const AGENT_VISION_TOOLS = new Set(["canvas_inspect_image"]);
const AGENT_CREATE_TOOLS = new Set(["generate_media", "generate_media_batch", "canvas_build_board", "canvas_create_storyboard", "canvas_create_character", "image_annotation_render"]);
const AGENT_OPERATE_TOOLS = new Set(["canvas_apply_ops", "canvas_arrange_nodes", "canvas_edit_storyboard", "canvas_edit_batch_table", "image_layer_split", "image_text_detect", "media_batch_control"]);

export type AgentToolCategory = "read" | "vision" | "create" | "operate" | "other";

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toolArguments(detail?: unknown) {
    const value = record(detail).arguments;
    if (typeof value !== "string") return record(value);
    try {
        return record(JSON.parse(value));
    } catch {
        return {};
    }
}

/**
 * Keeps the activity feed semantic instead of presenting every tool call as
 * the same check-mark row. This is intentionally based on the tool contract,
 * not on translated copy, so the visual grouping remains stable as messages
 * change or get localized.
 *
 * 未登记的工具落 `other`（"其他操作"）：兜底不能让任何工具看起来像在写画布。
 */
export function agentToolCategory(toolName: string, detail?: unknown): AgentToolCategory {
    if (AGENT_VISION_TOOLS.has(toolName)) return "vision";
    if (AGENT_CANVAS_READ_TOOLS.has(toolName) || AGENT_INFO_READ_TOOLS.has(toolName)) return "read";
    if (AGENT_CREATE_TOOLS.has(toolName)) return "create";
    if (toolName === "canvas_apply_ops") {
        const actions = record(detail).actions;
        if (Array.isArray(actions) && actions.some((item) => record(item).action === "created" || record(item).action === "generating")) return "create";
        const ops = toolArguments(detail).ops;
        if (Array.isArray(ops) && ops.some((item) => record(item).type === "add_node")) return "create";
        return "operate";
    }
    if (AGENT_OPERATE_TOOLS.has(toolName)) return "operate";
    return "other";
}

/** 读的是画布清单（节点存在与规模），而不是模型、任务、技能等外部信息。 */
export function isAgentCanvasReadTool(toolName: string): boolean {
    return AGENT_CANVAS_READ_TOOLS.has(toolName);
}

export function agentToolCategoryLabel(toolName: string, category: AgentToolCategory): string {
    if (category === "vision") return translate("shared.canvas.agentToolPresentation.viewImages");
    if (category === "read") return AGENT_CANVAS_READ_TOOLS.has(toolName) ? translate("shared.canvas.agentToolPresentation.readInventory") : translate("shared.canvas.agentToolPresentation.readInformation");
    if (category === "create") return translate("shared.canvas.agentToolPresentation.createNode");
    if (category === "operate") return translate("shared.canvas.agentToolPresentation.modifyCanvas");
    return translate("shared.canvas.agentToolPresentation.otherOperations");
}

type ToolStatus = "completed" | "failed" | "noop" | "rejected" | "pending" | "retrying";

function field(value: unknown, key: string): unknown {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

export function agentToolStatus(title: string, text: string, detail?: unknown): ToolStatus {
    const event = field(detail, "eventType");
    const retry = agentToolRetry(detail);
    if (retry?.status === "retrying") return "retrying";
    if (retry?.status === "recovered") return "completed";
    if (event === "tool_completed" || event === "generation_task_created" || event === "canvas_updated") return "completed";
    if (event === "tool_failed") return "failed";
    const raw = `${title} ${text} ${field(detail, "error") || ""}`;
    if (field(detail, "status") === "noop" || /未生效|无需|没有找到|没有.*可|已存在/.test(raw)) return "noop";
    if (/拒绝|取消|rejected/i.test(raw)) return "rejected";
    if (/失败|错误|failed|error/i.test(raw)) return "failed";
    if (/完成|成功|completed|succeeded/i.test(raw)) return "completed";
    return "pending";
}

export function friendlyAgentToolSummary(toolName: string, text: string, detail?: unknown, pending = false) {
    const status = agentToolStatus(toolName, text, detail);
    const failed = status === "failed" || status === "rejected";
    const mediaTool = toolName === "generate_media" || toolName === "image_layer_split" || toolName === "generate_media_batch";
    const result = record(field(detail, "result"));
    const phase = result.phase;
    if (mediaTool && failed && phase === "admission") return translate("shared.canvas.agentToolPresentation.parametersFailedValidationGenerationTaskNotSubmitted");
    if (mediaTool && failed && phase === "completion" && result.taskSubmitted === true) {
        if (result.writebackReason || result.status === "succeeded") return translate("shared.canvas.agentToolPresentation.generationSucceededCanvasWritebackIncomplete");
        return translate("shared.canvas.agentToolPresentation.taskSubmittedGenerationResultIncomplete");
    }
    if (toolName === "skills_load") {
        if (failed) return translate("shared.canvas.agentToolPresentation.failedToLoadSkills");
        // 新事件：availableCount 是本轮可自动发现的已安装技能数，skillIds 只列用户固定的技能。
        const available = Number(field(detail, "availableCount") ?? /发现\s*(\d+)\s*个/u.exec(text)?.[1]);
        if (Number.isFinite(available) && available > 0) {
            const pinned = field(detail, "skillIds");
            const pinnedCount = Array.isArray(pinned) ? pinned.length : Number(/固定\s*(\d+)\s*个/u.exec(text)?.[1] || 0);
            return pinnedCount ? translate("shared.canvas.agentToolPresentation.installedSkillsCanBeDiscoveredAutomaticallyPinned", { v0: String(available), v1: String(pinnedCount) }) : translate("shared.canvas.agentToolPresentation.installedSkillsCanBeDiscoveredAutomatically", { v0: String(available) });
        }
        // 历史事件文案：“已启用 3 个技能”“固定加载 3 个技能”。
        const count = /(?:加载|启用)\s*(\d+)\s*个/u.exec(text)?.[1];
        return count ? translate("shared.canvas.agentToolPresentation.loadedSkills", { v0: String(count) }) : translate("shared.canvas.agentToolPresentation.skillsLoaded");
    }
    if (toolName === "skill_read_file") {
        const name = String(field(detail, "skillName") || field(detail, "skillId") || "Skills");
        const path = field(detail, "path");
        const files = field(field(detail, "result"), "files");
        const listing = path === "" || (path === undefined && Array.isArray(files));
        const target = typeof path === "string" && path ? `${name} · ${path}` : name;
        if (failed) return `${listing ? translate("shared.canvas.agentToolPresentation.failedToListReferenceFiles") : translate("shared.canvas.agentToolPresentation.failedToReadReferenceMaterial")} · ${target}`;
        if (listing && Array.isArray(files)) return files.length ? translate("shared.canvas.agentToolPresentation.readableReferenceFiles", { v0: String(name), v1: String(files.length) }) : translate("shared.canvas.agentToolPresentation.noReadableReferenceFilesUsingLoadedContent", { v0: String(name) });
        return `${pending ? translate("shared.canvas.agentToolPresentation.preparingToReadReferenceMaterial") : translate("shared.canvas.agentToolPresentation.referenceMaterialRead")} · ${target}`;
    }
    const metadata = AGENT_TOOL_METADATA[toolName];
    const context: AgentToolSummaryContext = { pending, detail, text };
    const summary = typeof metadata?.summary === "function" ? metadata.summary(context) : metadata?.summary;
    const failure = typeof metadata?.failureMessage === "function" ? metadata.failureMessage(context) : metadata?.failureMessage;
    if (failed) return failure || translate("shared.canvas.agentToolPresentation.operationIncomplete");
    if (summary) return summary;
    // 未登记工具的中性兜底：点名工具，别让任何工具都读成"操作画布/已完成"（不变量 ③）。
    const name = toolName || translate("canvasA.focusBar.tools");
    return pending ? translate("shared.canvas.agentToolPresentation.preparingToRun", { v0: String(name) }) : translate("shared.canvas.agentToolPresentation.completed", { v0: String(name) });
}

const VISION_QUOTA_PATTERN = /已用\s*(\d+)\s*次、本轮额度\s*(\d+)\s*次/u;
const VISION_BATCH_PATTERN = /本批已附\s*(\d+)\s*张、单次上限\s*(\d+)\s*张/u;

/**
 * 识图失败的细分文案。
 *
 * 这四条只给文案、不给结构化字段：额度那条在 `prepareCloudAgentImageInspection` 里带
 * "已用 X 次、本轮额度 Y 次"，批量上限那条带"本批已附 X 张、单次上限 Y 张"，读循环走
 * `cloudAgentReadLoopError`，能力缺失是 `BadAuthRequest("当前模型未声明图片输入能力")`。
 * 所以这里按文案特征分类，拿到数字就把数字带上（不给数字时模型只能靠试探）。
 */
export function agentVisionFailureSummary(text: string, detail?: unknown): string {
    const payload = record(detail);
    const nested = record(payload.result);
    const raw = [text, payload.error, nested.error, payload.message, nested.note].filter((value): value is string => typeof value === "string").join(" ");
    const quota = VISION_QUOTA_PATTERN.exec(raw);
    if (quota) return translate("shared.canvas.agentToolPresentation.imageViewingAllowanceUsedUpForThisRoundUsedAllowance", { v0: String(quota[1]), v1: String(quota[2]) });
    const batch = VISION_BATCH_PATTERN.exec(raw);
    if (batch) return translate("shared.canvas.agentToolPresentation.thisBatchReachedTheModelSImageLimitAttachedLimit", { v0: String(batch[1]), v1: String(batch[2]) });
    if (/重复读取|护栏/.test(raw)) return translate("shared.canvas.agentToolPresentation.repeatedReadingOfTheSameImageVersionWasBlocked");
    if (/未声明图片输入能力|支持图片输入的渠道模型/.test(raw)) return translate("shared.canvas.agentToolPresentation.theCurrentChannelModelDoesNotDeclareImageInputSupport");
    // 兜底也认后端的哨兵文案（"cloud agent image inspection budget exhausted"）：包一层时才有数字，
    // 单独出现时只给到"额度已用完"，不能让用户看到一句英文原样。
    if (/(识图|看图|image inspection budget)/i.test(raw) && /(额度|预算|budget)/i.test(raw)) return translate("shared.canvas.agentToolPresentation.imageViewingAllowanceUsedUpForThisRound");
    return translate("shared.canvas.agentToolPresentation.imageViewingIncomplete");
}

/** 工具事件的调用名：detail.toolName/name/tool 优先，退化到消息标题。 */
export function agentToolName(title: string, detail?: unknown): string {
    return String(field(detail, "toolName") || field(detail, "name") || field(detail, "tool") || title);
}

/** 自动纠正分组的固定文案（卡片与折叠行共用，避免两处各写一套）。 */
export function agentToolRetryLabel(retry: AgentToolRetry): string {
    if (retry.status === "recovered") return translate("shared.canvas.agentToolPresentation.recoveredAfterAutomaticCorrection");
    if (retry.status === "exhausted") return translate("shared.canvas.agentToolPresentation.automaticCorrectionIncomplete");
    return translate("shared.canvas.agentToolPresentation.automaticCorrectionRecord");
}

/**
 * 工具失败的稳定归类标签（后端 `errorClass`，见 handoff 工作项 B 的第一步）。
 * 界面上把"模型自己出的错"和"真实的权限/状态/上游问题"分开显示，用户与排查都不用猜。
 */
export const AGENT_TOOL_ERROR_CLASS_LABELS: Record<string, string> = {
    invalid_model_output: translate("shared.canvas.agentToolPresentation.modelOutputIssue"),
    schema_error: translate("shared.canvas.agentToolPresentation.parametersDoNotMatchTheContract"),
    state_conflict: translate("shared.canvas.agentToolPresentation.canvasStateChanged"),
    permission_violation: translate("shared.canvas.agentToolPresentation.permissionExceededForThisRound"),
    upstream_failure: translate("shared.canvas.agentToolPresentation.upstreamFailure"),
    admission_failure: translate("shared.canvas.agentToolPresentation.mediaGenerationRequirementsNotMet"),
    tool_error: translate("shared.canvas.agentToolPresentation.toolExecutionFailed"),
};

/** 先按稳定错误类别映射当前语言，未知类别保留后端提供的标签。 */
export function agentToolErrorClassLabel(detail?: unknown): string | undefined {
    const payload = record(detail);
    const nested = record(payload.result);
    const errorClass = payload.errorClass ?? nested.errorClass;
    if (typeof errorClass === "string" && AGENT_TOOL_ERROR_CLASS_LABELS[errorClass]) return AGENT_TOOL_ERROR_CLASS_LABELS[errorClass];
    const label = payload.errorClassLabel ?? nested.errorClassLabel;
    if (typeof label === "string" && label) return label;
    if (typeof errorClass !== "string" || !errorClass) return undefined;
    return translate("shared.canvas.agentToolPresentation.toolExecutionFailed");
}
