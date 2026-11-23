import { formatBytes } from "@/lib/image-utils";
import type { AccountFileStorageUsage } from "@/services/api/resources";
import { currentLocale, translate } from "@/i18n";


export const accountFileStorageUsageQueryKey = ["account-file-storage-usage"] as const;

export type AccountStorageTone = "ok" | "warn" | "critical";

/** ok：容量内；grace：已超额、宽限期内只禁止上传和生成；read_only：宽限期结束后只读。 */
export type AccountStorageState = "ok" | "grace" | "read_only";

export type AccountStorageMeter = {
    percent: number;
    remainingBytes: number;
    usedLabel: string;
    totalLabel: string;
    baseLabel: string;
    purchasedLabel: string;
    remainingLabel: string;
    percentLabel: string;
    tone: AccountStorageTone;
    full: boolean;
    state: AccountStorageState;
    /** 宽限期内显示进入只读的时间。 */
    readOnlyAtLabel: string;
    nextExpiresAtLabel: string;
};

export function formatStorageBytes(value: number) {
    return formatBytes(value) || "0 B";
}

/** 容量按整 GB 售卖，展示时去掉多余小数。 */
export function formatStorageCapacity(bytes: number) {
    const gigabytes = bytes / 1024 ** 3;
    if (gigabytes >= 1024 && Number.isInteger(gigabytes / 1024)) return `${gigabytes / 1024} TB`;
    if (Number.isInteger(gigabytes)) return `${gigabytes} GB`;
    return formatStorageBytes(bytes);
}

export function formatStorageDuration(days: number) {
    if (!days) return translate("shared.accountStorageUsage.neverExpires");
    if (days % 365 === 0) return translate("shared.accountStorageUsage.years", { v0: String(days / 365) });
    if (days % 30 === 0) return translate("shared.accountStorageUsage.months", { v0: String(days / 30) });
    return translate("shared.accountStorageUsage.days", { v0: String(days) });
}

export function formatStorageDate(value?: string) {
    return value ? new Date(value).toLocaleString(currentLocale(), { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

export function accountStorageMeter(usage?: AccountFileStorageUsage | null): AccountStorageMeter {
    const usedBytes = usage && Number.isFinite(usage.usedBytes) ? Math.max(0, usage.usedBytes) : 0;
    const totalBytes = usage && Number.isFinite(usage.totalBytes) ? Math.max(0, usage.totalBytes) : 0;
    const remainingBytes = Math.max(0, totalBytes - usedBytes);
    const percent = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;
    const full = totalBytes > 0 && usedBytes >= totalBytes;
    const tone: AccountStorageTone = full || percent >= 90 ? "critical" : percent >= 70 ? "warn" : "ok";
    const state: AccountStorageState = usage?.readOnly ? "read_only" : usage?.overLimit ? "grace" : "ok";

    return {
        percent,
        remainingBytes,
        usedLabel: formatStorageBytes(usedBytes),
        totalLabel: formatStorageBytes(totalBytes),
        baseLabel: formatStorageCapacity(usage?.baseBytes ?? totalBytes),
        purchasedLabel: usage?.purchasedBytes ? formatStorageCapacity(usage.purchasedBytes) : "",
        remainingLabel: formatStorageBytes(remainingBytes),
        percentLabel: usedBytes && percent < 0.1 ? "<0.1%" : `${Math.round(percent * 10) / 10}%`,
        tone,
        full,
        state,
        readOnlyAtLabel: formatStorageDate(usage?.readOnlyAt),
        nextExpiresAtLabel: formatStorageDate(usage?.nextExpiresAt),
    };
}

/** 超额提示文案，侧栏、素材页和扩容弹窗共用。 */
export function accountStorageStateMessage(meter: AccountStorageMeter) {
    if (meter.state === "read_only") return translate("shared.accountStorageUsage.storageCapacityExceededAndTheGracePeriodHasEndedYour");
    if (meter.state === "grace") return translate("shared.accountStorageUsage.storageCapacityExceededUploadsAndGenerationArePausedYourAccount", { v0: String(meter.readOnlyAtLabel ? translate("shared.accountStorageUsage.after", { v0: String(meter.readOnlyAtLabel) }) : translate("shared.accountStorageUsage.afterTheGracePeriodEnds")) });
    if (meter.full) return translate("shared.accountStorageUsage.storageFullUploadsAndGenerationArePaused");
    return "";
}
