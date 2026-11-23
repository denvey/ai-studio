// 管理端方舟素材库共用的标签、状态与格式化。

import type { ArkAssetStatus, ArkGroupKind, ArkPortraitGroup, ArkUserSummary } from "@/services/api/ark-portraits";
import { AdminStatusBadge, type AdminStatusTone } from "../../components/admin-ui";
import { currentLocale, translate } from "@/i18n";

export const ARK_KIND_LABEL: Record<ArkGroupKind, string> = { real: translate("adminPages.settings.arkAssets.arkAdminShared.human"), virtual: translate("adminPages.settings.arkAssets.arkAdminShared.virtual"), ip: translate("library.ark.kinds.ip") };

export const ARK_SOURCE_LABEL: Record<string, string> = { liveness: translate("library.ark.group.source.liveness"), created: translate("library.ark.group.source.created"), manual: translate("library.ark.group.source.manual") };

export const ARK_ASSET_STATUS: Record<ArkAssetStatus, { label: string; tone: AdminStatusTone }> = {
    pending_review: { label: translate("adminPages.settings.arkAssets.arkAdminShared.inReview"), tone: "warning" },
    rejected: { label: translate("library.ark.asset.status.rejected"), tone: "error" },
    processing: { label: translate("adminPages.settings.arkAssets.arkAdminShared.underArkReview"), tone: "info" },
    active: { label: translate("library.ark.asset.status.active"), tone: "success" },
    failed: { label: translate("library.ark.asset.status.failed"), tone: "error" },
};

export function ArkAssetStatusBadge({ status }: { status: string }) {
    const meta = ARK_ASSET_STATUS[status as ArkAssetStatus];
    return <AdminStatusBadge label={meta?.label || status} tone={meta?.tone || "neutral"} />;
}

export function formatArkAdminDate(value?: string, withTime = false) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString(currentLocale(), withTime ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** 真人素材组的授权期限；虚拟与版权 IP 长期有效。 */
export function ArkExpiryBadge({ group }: { group: Pick<ArkPortraitGroup, "kind" | "expiresAt" | "expiryStatus"> }) {
    if (group.kind !== "real" || !group.expiresAt || group.expiryStatus === "none") return <AdminStatusBadge label={translate("library.ark.expiry.none")} />;
    if (group.expiryStatus === "expired") return <AdminStatusBadge label={translate("adminPages.settings.arkAssets.arkAdminShared.expiredOn", { v0: String(formatArkAdminDate(group.expiresAt)) })} tone="error" />;
    if (group.expiryStatus === "expiring") return <AdminStatusBadge label={translate("adminPages.settings.arkAssets.arkAdminShared.expires", { v0: String(formatArkAdminDate(group.expiresAt)) })} tone="warning" />;
    return <AdminStatusBadge label={translate("adminPages.settings.arkAssets.arkAdminShared.authorizedUntil", { v0: String(formatArkAdminDate(group.expiresAt)) })} tone="success" />;
}

export function arkUserLabel(user?: ArkUserSummary) {
    if (!user) return "-";
    if (user.displayName && user.username) return `${user.displayName}（${user.username}）`;
    return user.displayName || user.username || user.id;
}

export function arkGrantSummary(group: Pick<ArkPortraitGroup, "scope" | "grantAll" | "grantUsers">) {
    if (group.scope !== "platform") return translate("adminPages.settings.arkAssets.arkAdminShared.creatorOnly");
    if (group.grantAll) return translate("adminPages.settings.arkAssets.arkAdminShared.allUsers");
    const count = group.grantUsers?.length || 0;
    return count ? translate("adminPages.settings.arkAssets.arkAdminShared.users", { v0: String(count) }) : translate("adminPages.settings.arkAssets.arkAdminShared.unauthorized");
}
