import { translate } from "@/i18n";
/**
 * 文本模型思考等级：与后端 internal/app/text_thinking.go 保持同一套档位、预设与归一规则。
 * 后端是权威实现（任务执行时再解析一次）；前端用它决定显示哪些档位和默认选中项。
 */

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
/** 请求侧还接受意图值：auto = 模型默认，deep = 模型支持的最高档（不含 max）。 */
export type ThinkingRequest = ThinkingLevel | "auto" | "deep";

export type ThinkingMode = "none" | "toggle" | "levels" | "always";
export type ThinkingSwitchKind = "none" | "omit" | "effort-none" | "enable-flag" | "thinking-type" | "budget-zero";
export type ThinkingIntensityKind = "none" | "effort" | "budget" | "gemini-level" | "model-suffix";

export type TextThinkingConfig = {
    preset?: string;
    mode: ThinkingMode;
    levels?: ThinkingLevel[];
    default?: ThinkingLevel | "";
    switch: { kind: ThinkingSwitchKind; onValue?: string };
    intensity: { kind: ThinkingIntensityKind; field?: string; values?: Partial<Record<ThinkingLevel, string>>; budgets?: Partial<Record<ThinkingLevel, number>> };
};

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
    off: translate("common.close"),
    minimal: translate("shared.textThinking.minimal"),
    low: translate("shared.textThinking.low"),
    medium: translate("library.assets.density.standard"),
    high: translate("canvasC.previsMonitor.mode.depth"),
    max: translate("shared.textThinking.maximum"),
};

export const THINKING_REQUEST_OPTIONS: Array<{ label: string; value: ThinkingRequest }> = [
    { label: translate("shared.textThinking.modelDefault"), value: "auto" },
    ...THINKING_LEVELS.map((level) => ({ label: THINKING_LEVEL_LABELS[level], value: level })),
    { label: translate("shared.textThinking.deepestAvailableExcludingMaximum"), value: "deep" },
];

export type ThinkingPreset = { id: string; label: string; hint: string; config: Omit<TextThinkingConfig, "preset"> };

/** 后台快捷模板；保存时后端会把预设展开成完整字段并存下，运行时只读展开后的结果。 */
export const THINKING_PRESETS: ThinkingPreset[] = [
    {
        id: "openai-gpt5",
        label: "OpenAI GPT-5.x",
        hint: translate("shared.textThinking.reasoningEffortReasoningEffortOffSendsNoneMaximumSendsXhigh"),
        config: { mode: "levels", levels: ["off", "minimal", "low", "medium", "high", "max"], switch: { kind: "effort-none" }, intensity: { kind: "effort", values: { max: "xhigh" } } },
    },
    {
        id: "openai-o",
        label: translate("shared.textThinking.openAIOSeries"),
        hint: translate("shared.textThinking.effortCanBeAdjustedReasoningCannotBeTurnedOff"),
        config: { mode: "always", levels: ["low", "medium", "high"], default: "medium", switch: { kind: "none" }, intensity: { kind: "effort" } },
    },
    {
        id: "claude-adaptive",
        label: translate("shared.textThinking.claudeAdaptive"),
        hint: translate("shared.textThinking.newerClaudeModelsAlwaysReasonThinkingTypeAdaptiveOutputConfig"),
        config: { mode: "always", levels: ["low", "medium", "high", "max"], switch: { kind: "none" }, intensity: { kind: "effort", field: "output_config.effort" } },
    },
    {
        id: "claude-budget",
        label: translate("shared.textThinking.claudeBudget"),
        hint: translate("shared.textThinking.forOlderClaudeModelsThatStillSupportBudgetTokensUse"),
        config: { mode: "levels", levels: ["off", "low", "medium", "high"], default: "off", switch: { kind: "omit" }, intensity: { kind: "budget", field: "thinking.budget_tokens" } },
    },
    { id: "gemini-3-pro", label: "Gemini 3 Pro", hint: translate("shared.textThinking.thinkingLevelLowHighReasoningCannotBeTurnedOff"), config: { mode: "always", levels: ["low", "high"], switch: { kind: "none" }, intensity: { kind: "gemini-level" } } },
    {
        id: "gemini-3-flash",
        label: "Gemini 3 Flash",
        hint: translate("shared.textThinking.thinkingLevelMinimalHighReasoningCannotBeTurnedOff"),
        config: { mode: "always", levels: ["minimal", "low", "medium", "high"], switch: { kind: "none" }, intensity: { kind: "gemini-level" } },
    },
    {
        id: "gemini-2.5",
        label: "Gemini 2.5",
        hint: translate("shared.textThinking.thinkingBudgetOffSends025ProCannotTurnReasoning"),
        config: { mode: "levels", levels: ["off", "low", "medium", "high"], switch: { kind: "budget-zero" }, intensity: { kind: "budget" } },
    },
    {
        id: "deepseek",
        label: "DeepSeek",
        hint: "thinking.type + reasoning_effort low/high/max",
        config: { mode: "levels", levels: ["off", "low", "high", "max"], switch: { kind: "thinking-type" }, intensity: { kind: "effort", field: "reasoning_effort" } },
    },
    {
        id: "qwen-hybrid",
        label: translate("shared.textThinking.qwenHybridReasoning"),
        hint: translate("shared.textThinking.enableThinkingToggle"),
        config: { mode: "toggle", levels: ["off", "medium"], switch: { kind: "enable-flag" }, intensity: { kind: "none" } },
    },
    {
        id: "qwen-budget",
        label: translate("shared.textThinking.qwenReasoningBudget"),
        hint: "enable_thinking + thinking_budget",
        config: { mode: "levels", levels: ["off", "low", "medium", "high"], switch: { kind: "enable-flag" }, intensity: { kind: "budget", field: "thinking_budget" } },
    },
    { id: "thinking-type-toggle", label: translate("shared.textThinking.doubaoKimiGLMToggle"), hint: "thinking.type enabled/disabled", config: { mode: "toggle", levels: ["off", "medium"], switch: { kind: "thinking-type" }, intensity: { kind: "none" } } },
    {
        id: "openrouter",
        label: translate("shared.textThinking.openRouterUnifiedParameters"),
        hint: "reasoning.effort",
        config: { mode: "levels", levels: ["off", "minimal", "low", "medium", "high", "max"], switch: { kind: "effort-none" }, intensity: { kind: "effort", field: "reasoning.effort" } },
    },
    {
        id: "model-suffix",
        label: translate("shared.textThinking.modelNameSuffixNewAPIAndSimilarGateways"),
        hint: translate("shared.textThinking.appendASuffixToTheProviderModelNameWhenEnabled"),
        config: { mode: "toggle", levels: ["off", "medium"], default: "off", switch: { kind: "omit" }, intensity: { kind: "model-suffix", values: { medium: "-thinking" } } },
    },
];

export function thinkingPresetConfig(id: string): TextThinkingConfig | undefined {
    const preset = THINKING_PRESETS.find((item) => item.id === id);
    if (!preset) return undefined;
    return structuredClone({ preset: preset.id, ...preset.config });
}

/** 删档位时同时去掉对应协议映射，避免后台保存残留的 max/xhigh 或预算。 */
export function withThinkingLevels(config: TextThinkingConfig, levels: ThinkingLevel[]): TextThinkingConfig {
    const sorted = THINKING_LEVELS.filter((level) => levels.includes(level));
    const values = Object.fromEntries(Object.entries(config.intensity.values || {}).filter(([level]) => level !== "off" && sorted.includes(level as ThinkingLevel)));
    const budgets = Object.fromEntries(Object.entries(config.intensity.budgets || {}).filter(([level]) => level !== "off" && sorted.includes(level as ThinkingLevel)));
    return { ...config, levels: sorted, default: config.default && sorted.includes(config.default) ? config.default : "", intensity: { ...config.intensity, values, budgets } };
}

/**
 * 未声明思考能力的模型沿用旧开关（关闭 / 标准，默认关闭）。后端对 Chat Completions、Responses、
 * Claude 按开关执行；Gemini 与插件自定义接口不发送参数，与改造前一致。
 */
export const LEGACY_TEXT_THINKING_CONFIG: TextThinkingConfig = { mode: "toggle", levels: ["off", "medium"], default: "off", switch: { kind: "omit" }, intensity: { kind: "effort" } };

function rank(level: string) {
    return THINKING_LEVELS.indexOf(level as ThinkingLevel);
}

/** 模型在界面上可选的档位；未声明思考能力时为空数组。 */
export function thinkingLevelsFor(config?: TextThinkingConfig): ThinkingLevel[] {
    if (!config || config.mode === "none") return [];
    return [...(config.levels || [])].sort((a, b) => rank(a) - rank(b));
}

/** 与后端 resolveThinkingLevel 相同：空字符串表示不发送思考参数。 */
export function resolveThinkingLevel(config: TextThinkingConfig | undefined, requested: ThinkingRequest | "" | undefined): ThinkingLevel | "" {
    const levels = thinkingLevelsFor(config);
    if (!config || !levels.length) return "";
    if (!requested || requested === "auto") return config.default || "";
    if (requested === "deep") {
        const candidates = levels.filter((level) => level !== "off" && level !== "max");
        return candidates[candidates.length - 1] || levels[levels.length - 1];
    }
    if (levels.includes(requested)) return requested;
    if (requested === "off") return levels[0];
    const target = rank(requested);
    let best: ThinkingLevel | "" = "";
    let bestDistance = Infinity;
    for (const level of levels) {
        if (level === "off") continue;
        const distance = Math.abs(rank(level) - target);
        if (distance < bestDistance) {
            best = level;
            bestDistance = distance;
        }
    }
    return best || "off";
}

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
    return typeof value === "string" && rank(value) >= 0;
}
