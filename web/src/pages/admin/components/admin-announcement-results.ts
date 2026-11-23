// 公告接口返回值的校验与待复核操作识别。
//
// 写接口返回不确定（网络中断、超时）时不能假装成功：列入待复核，由管理员刷新确认。

import { ApiError } from "@/services/api/request";
import { type AnnouncementLevel, type AnnouncementStatus, listAdminAnnouncements, type SystemAnnouncement } from "@/services/api/announcements";
import type { AnnouncementPendingReview } from "./admin-announcement-safety";
import { currentLocale, translate } from "@/i18n";

export type AnnouncementFormValues = {
    title: string;
    content: string;
    imageResourceId?: string;
    level: AnnouncementLevel;
    pinned: boolean;
};

export type PendingAnnouncement =
    | (AnnouncementFormValues & { mode: "create" })
    | (AnnouncementFormValues & {
          mode: "update";
          id: string;
          previousStatus: AnnouncementStatus;
          previousPublishedAt: string;
          previousTitle: string;
      });

export const DEFAULT_ANNOUNCEMENT: AnnouncementFormValues = { title: "", content: "", imageResourceId: "", level: "info", pinned: false };

export const levelOptions: Array<{ value: AnnouncementLevel; label: string }> = [
    { value: "info", label: translate("account.ui.announcements.levels.info") },
    { value: "success", label: translate("account.ui.announcements.levels.success") },
    { value: "warning", label: translate("account.ui.announcements.levels.warning") },
    { value: "critical", label: translate("account.ui.announcements.levels.critical") },
];

export const levelMeta: Record<AnnouncementLevel, { label: string; tone: "info" | "success" | "warning" | "error"; guidance: string }> = {
    info: { label: translate("account.ui.announcements.levels.info"), tone: "info", guidance: translate("admin.adminAnnouncementResults.generalInformationAboutFeaturesEventsOrRules") },
    success: { label: translate("account.ui.announcements.levels.success"), tone: "success", guidance: translate("admin.adminAnnouncementResults.previouslyAffectedServicesHaveRecovered") },
    warning: { label: translate("account.ui.announcements.levels.warning"), tone: "warning", guidance: translate("admin.adminAnnouncementResults.mayAffectUsageAndRequiresUsersAttention") },
    critical: { label: translate("account.ui.announcements.levels.critical"), tone: "error", guidance: translate("admin.adminAnnouncementResults.highPriorityEventsOrRequiredActions") },
};

export function formatDateTime(value?: string | null) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return new Intl.DateTimeFormat(currentLocale(), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replaceAll("/", "-");
}

export function isMutationResultUncertain(error: unknown) {
    if (!(error instanceof ApiError)) return true;
    return error.status === undefined || error.retryable || error.status >= 500;
}

export function assertAnnouncementMutationResult(
    result: unknown,
    expectedStatus: AnnouncementStatus,
    expectedId: string | undefined,
    expectedContent: Pick<SystemAnnouncement, "title" | "content" | "level" | "pinned"> & Pick<Partial<SystemAnnouncement>, "imageResourceId">,
) {
    const announcement = (result as { announcement?: Partial<SystemAnnouncement> } | null)?.announcement;
    const publishedAt = announcement?.publishedAt;
    const closedAt = announcement?.closedAt;
    const validPublishedAt = typeof publishedAt === "string" && !Number.isNaN(new Date(publishedAt).getTime());
    const validClosedAt = expectedStatus === "closed" ? typeof closedAt === "string" && !Number.isNaN(new Date(closedAt).getTime()) : closedAt === null || closedAt === undefined;
    const contentMatches =
        announcement?.title === expectedContent.title &&
        announcement?.content === expectedContent.content &&
        announcement?.level === expectedContent.level &&
        announcement?.pinned === expectedContent.pinned &&
        (announcement?.imageResourceId || "") === (expectedContent.imageResourceId || "");
    if (!announcement || typeof announcement.id !== "string" || !announcement.id || (expectedId && announcement.id !== expectedId) || announcement.status !== expectedStatus || !validPublishedAt || !validClosedAt || !contentMatches) {
        throw new Error(translate("admin.adminAnnouncementResults.theServerReturnedAnIncompleteAnnouncementStatusTheResultCould"));
    }
}

export function assertAnnouncementListResult(result: unknown, expectedPage: number, expectedPageSize: number) {
    if (!isRecord(result) || !Array.isArray(result.announcements) || !Number.isInteger(result.total) || (result.total as number) < 0 || result.page !== expectedPage || result.pageSize !== expectedPageSize) {
        throw new Error(translate("admin.adminAnnouncementResults.theAnnouncementListResponseIsIncomplete"));
    }
    const announcements = result.announcements.map((value) => normalizeAnnouncementListItem(value));
    if ((result.total as number) < announcements.length) throw new Error(translate("admin.adminAnnouncementResults.theAnnouncementTotalDoesNotMatchTheCurrentPageData"));
    return { announcements, total: result.total as number, page: expectedPage, pageSize: expectedPageSize };
}

export function normalizeAnnouncementListItem(value: unknown): SystemAnnouncement {
    if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        !value.id ||
        typeof value.title !== "string" ||
        typeof value.content !== "string" ||
        !isKnownAnnouncementLevel(value.level) ||
        !isKnownAnnouncementStatus(value.status) ||
        typeof value.pinned !== "boolean" ||
        (value.imageResourceId !== null && value.imageResourceId !== undefined && typeof value.imageResourceId !== "string") ||
        (value.imageUrl !== null && value.imageUrl !== undefined && typeof value.imageUrl !== "string") ||
        typeof value.createdBy !== "string" ||
        !isValidDateTimeString(value.publishedAt) ||
        !isValidDateTimeString(value.createdAt) ||
        !isValidDateTimeString(value.updatedAt) ||
        (value.closedAt !== null && value.closedAt !== undefined && !isValidDateTimeString(value.closedAt))
    ) {
        throw new Error(translate("admin.adminAnnouncementResults.theAnnouncementListContainsUnrecognizedRecords"));
    }
    return {
        id: value.id,
        title: value.title,
        content: value.content,
        imageResourceId: typeof value.imageResourceId === "string" ? value.imageResourceId : undefined,
        imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined,
        level: value.level,
        pinned: value.pinned,
        status: value.status,
        createdBy: value.createdBy,
        publishedAt: value.publishedAt as string,
        closedAt: typeof value.closedAt === "string" ? value.closedAt : undefined,
        createdAt: value.createdAt as string,
        updatedAt: value.updatedAt as string,
    };
}

export async function inspectPendingReview(review: AnnouncementPendingReview) {
    const queryTitles = Array.from(new Set([review.title, review.previousTitle].filter((value): value is string => Boolean(value?.trim()))));
    const candidates = new Map<string, SystemAnnouncement>();
    for (const title of queryTitles) {
        let targetPage = 1;
        while (targetPage <= 50) {
            const data = assertAnnouncementListResult(await listAdminAnnouncements({ keyword: title, page: targetPage, pageSize: 100 }), targetPage, 100);
            data.announcements.forEach((announcement) => candidates.set(announcement.id, announcement));
            if (targetPage >= Math.max(1, Math.ceil(data.total / data.pageSize))) break;
            if (targetPage === 50) throw new Error(translate("admin.adminAnnouncementResults.tooManyRecordsShareThisNameToIdentifyTheTarget"));
            targetPage += 1;
        }
    }

    const records = Array.from(candidates.values());
    if (review.targetId) {
        const target = records.find((announcement) => announcement.id === review.targetId);
        if (!target) return translate("admin.adminAnnouncementResults.targetIDWasNotFoundUsingTheTitlesBeforeAnd", { v0: String(review.targetId) });
        const contentMatches =
            target.title === review.title &&
            target.content === review.content &&
            target.level === review.level &&
            (review.pinned === undefined || target.pinned === review.pinned) &&
            (review.imageResourceId === undefined || (target.imageResourceId || "") === review.imageResourceId);
        const expectedStatus: AnnouncementStatus = review.operation === "close" ? "closed" : "active";
        const statusMatches = target.status === expectedStatus;
        return translate("admin.adminAnnouncementResults.foundTargetIDCurrentlyTitleBodyAndType", {
            v0: String(target.id),
            v1: String(target.status === "active" ? translate("admin.adminAnnouncementResults.published") : translate("account.feedback.status.closed")),
            v2: String(contentMatches ? translate("admin.adminAnnouncementResults.matchTheRequest") : translate("admin.adminAnnouncementResults.doNotMatchTheRequest")),
            v3: String(statusMatches ? translate("admin.adminAnnouncementResults.statusMatchesExpectations") : translate("admin.adminAnnouncementResults.statusDoesNotMatchExpectations")),
        });
    }

    const requestedAt = new Date(review.requestedAt).getTime();
    const matchingRecords = records.filter(
        (announcement) =>
            announcement.title === review.title &&
            announcement.content === review.content &&
            announcement.level === review.level &&
            (review.pinned === undefined || announcement.pinned === review.pinned) &&
            (review.imageResourceId === undefined || (announcement.imageResourceId || "") === review.imageResourceId) &&
            new Date(announcement.publishedAt).getTime() >= requestedAt - 5 * 60_000,
    );
    if (!matchingRecords.length) return translate("admin.adminAnnouncementResults.noNewAnnouncementNearTheRequestTimeExactlyMatchesThe");
    const resultSummary = matchingRecords
        .slice(0, 3)
        .map((announcement) => `${announcement.id} · ${formatDateTime(announcement.publishedAt)} · ${announcement.status === "active" ? translate("admin.adminAnnouncementResults.published") : translate("account.feedback.status.closed")}`)
        .join("；");
    return translate("admin.adminAnnouncementResults.foundRecentRecordsExactlyMatchingTheRequest", {
        v0: String(matchingRecords.length),
        v1: String(resultSummary),
        v2: String(matchingRecords.length > 3 ? translate("admin.adminAnnouncementResults.reviewTheRemainingRecordsInTheList") : ""),
    });
}

export function formatPendingReviewOperation(operation: AnnouncementPendingReview["operation"]) {
    if (operation === "create") return translate("admin.adminAnnouncementResults.publishNewAnnouncement");
    if (operation === "update") return translate("admin.adminAnnouncementResults.editAndRepublish");
    return translate("admin.adminAnnouncementResults.closeAnnouncement");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

export function isValidDateTimeString(value: unknown): value is string {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

export function isKnownAnnouncementLevel(value: unknown): value is AnnouncementLevel {
    return value === "info" || value === "success" || value === "warning" || value === "critical";
}

export function isKnownAnnouncementStatus(value: unknown): value is AnnouncementStatus {
    return value === "active" || value === "closed";
}
