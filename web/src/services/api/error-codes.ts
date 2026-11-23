import { currentLocale, translate } from "@/i18n";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import backendMessages from "@/i18n/messages/areas/apiErrors/additional.zh-CN.json";

/**
 * 后端稳定错误原因（backend/internal/kernel/error_codes.go 的 ErrorReason）。
 * 页面应按 reason / code 分支，不要解析 msg。
 */
export const API_ERROR_REASONS = [
    "invalid_argument",
    "unauthorized",
    "forbidden",
    "not_found",
    "conflict",
    "project_name_conflict",
    "skill_version_conflict",
    "canvas_history_resources_missing",
    "failed_precondition",
    "quota_exceeded",
    "storage_capacity_exceeded",
    "storage_read_only",
    "drama_budget_exhausted",
    "drama_segment_changed",
    "drama_episode_confirm_required",
    "agent_interjection_run_finished",
    "agent_interjection_already_delivered",
    "agent_run_state_busy",
    "rate_limited",
    "account_not_registered",
    "unavailable",
    "timeout",
    "internal",
    "bad_gateway",
    "upstream_dns_failed",
] as const;

export type ApiErrorReason = (typeof API_ERROR_REASONS)[number];

// 这些原因的含义足够明确，非中文界面可直接用本地化文案替换后端中文 msg；
// 其他原因（invalid_argument、conflict 等）的具体信息只在 msg 里，仅翻译已知消息。
const LOCALIZED_REASONS = new Set<string>(["unauthorized", "forbidden", "not_found", "rate_limited", "quota_exceeded", "storage_capacity_exceeded", "storage_read_only", "unavailable", "timeout", "bad_gateway", "upstream_dns_failed", "internal"]);

const BACKEND_MESSAGE_KEYS = new Map(Object.entries(backendMessages).map(([key, message]) => [message, `apiErrors.${key}`] as const));
const BACKEND_MESSAGE_PREFIXES = [...BACKEND_MESSAGE_KEYS].sort(([a], [b]) => b.length - a.length);

/** 英文补齐已知的后端消息；未知上游细节继续原样展示，不能用笼统错误掩盖失败原因。 */
export function localizedApiErrorMessage(reason: string | undefined, fallback: string): string {
    if (currentLocale() === "en-US") {
        const exact = BACKEND_MESSAGE_KEYS.get(fallback);
        if (exact) return translate(exact);
        for (const [source, key] of BACKEND_MESSAGE_PREFIXES) {
            if (!fallback.startsWith(source)) continue;
            const detail = fallback.slice(source.length);
            // 只替换完整消息边界，并优先长前缀，避免把另一条中文消息截成半句。
            if (/^[\s:：,，;；.。!！?？(（]/u.test(detail) || /[:：]$/u.test(source)) return translate(key) + detail;
        }
    }
    if (!reason || currentLocale() === DEFAULT_LOCALE || !LOCALIZED_REASONS.has(reason)) return fallback;
    return translate(`errors.reason.${reason}`);
}
