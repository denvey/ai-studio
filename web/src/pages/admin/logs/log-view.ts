import type { ApiCallLog } from "@/services/api/auth";
import { translate } from "@/i18n";

export type LogView = "troubleshoot" | "billing" | "all";

export function normalizeLogView(value: string | null): LogView {
    return value === "billing" || value === "all" ? value : "troubleshoot";
}

export function logStatus(log: Pick<ApiCallLog, "status" | "providerStatus">) {
    const providerStatus = log.providerStatus?.toLowerCase();
    if (log.status === "failed" || ["failed", "cancelled", "canceled", "expired"].includes(providerStatus || "")) return { label: translate("library.assets.batch.failed"), tone: "error" as const };
    if (["queued", "pending", "processing", "running", "in_progress"].includes(providerStatus || "")) return { label: translate("adminPages.logs.logView.processing"), tone: "warning" as const };
    return { label: translate("adminPages.loginLogs.loginLogDetailDrawer.success"), tone: "success" as const };
}

export function logBillingLabel(log: Pick<ApiCallLog, "billable" | "billingAvailable" | "billingStatus">) {
    if (!log.billable) return translate("adminPages.logs.logsPage.notBilled");
    if (!log.billingAvailable) return translate("adminPages.logs.logsPage.noCreditsCharged");
    const labels = {
        settled: translate("adminPages.logs.logsPage.settled"),
        refunded: translate("adminPages.logs.logsPage.refunded"),
        uncertain: translate("adminPages.logs.logsPage.pendingReview"),
        running: translate("library.tasks.filter.active"),
        reserved: translate("adminPages.logs.logsPage.preauthorized2"),
    };
    return log.billingStatus ? labels[log.billingStatus] : translate("adminPages.logs.logsPage.preauthorized2");
}

// 人工查询上游只针对失败的视频生成：任务已成功或仍在运行时不开放入口，避免误触发结算。
// 任务记录缺失时以调用结果为准，后端仍会校验任务归属并拒绝不可恢复的记录。
export function videoRecoveryAvailable(log: Pick<ApiCallLog, "capability" | "taskId" | "taskStatus" | "status">) {
    if (log.capability !== "video" || !log.taskId) return false;
    return log.taskStatus === "failed" || (log.status === "failed" && !log.taskStatus);
}
