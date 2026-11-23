
import { translate } from "@/i18n";
/**
 * 首页常驻通知条的「通知类型」与「标题图标素材」模型。
 *
 * 通知类型决定通知条底色（后台与前台共用同一套 token）。
 * 图标素材是 emoji 字符：它就是普通文本，随 TitleRuns 的文本分段一起存储与渲染，
 * 因此可以插到标题任意位置、跟随分段样式、参与关键字检索，后端不需要单独字段或白名单。
 *
 * 本模块只放纯数据与纯函数，不 import 任何组件。
 */

export type BannerNoticeType = "notice" | "activity" | "update" | "warning";

/** 未指定类型时的兜底：平台公告。 */
export const BANNER_NOTICE_DEFAULT_TYPE: BannerNoticeType = "notice";

export const BANNER_NOTICE_TYPES: {
    key: BannerNoticeType;
    label: string;
    hint: string;
    /** 该类型的语义底色 token；由 globals.css 按明暗主题分别取值。 */
    surfaceVar: string;
}[] = [
    { key: "notice", label: translate("shared.announcements.bannerNotice.announcement"), hint: translate("shared.announcements.bannerNotice.platformAnnouncementsAndChangesToRulesOrWorkflows"), surfaceVar: "--notice-banner-surface-notice" },
    { key: "activity", label: translate("shared.announcements.bannerNotice.event"), hint: translate("shared.announcements.bannerNotice.eventsLimitedTimePromotionsAndRewards"), surfaceVar: "--notice-banner-surface-activity" },
    { key: "update", label: translate("shared.announcements.bannerNotice.update"), hint: translate("shared.announcements.bannerNotice.versionReleasesNewFeaturesAndRedesigns"), surfaceVar: "--notice-banner-surface-update" },
    { key: "warning", label: translate("shared.skinThemes.warning"), hint: translate("shared.announcements.bannerNotice.maintenanceWindowsRisksAndServiceDisruptions"), surfaceVar: "--notice-banner-surface-warning" },
];

const BANNER_NOTICE_TYPE_KEYS = new Set<string>(BANNER_NOTICE_TYPES.map((item) => item.key));

/** 未知 / 空类型一律回落到默认类型，通知条不会因为脏数据失去底色。 */
export function normalizeBannerNoticeType(value?: string | null): BannerNoticeType {
    const raw = (value || "").trim().toLowerCase();
    return BANNER_NOTICE_TYPE_KEYS.has(raw) ? (raw as BannerNoticeType) : BANNER_NOTICE_DEFAULT_TYPE;
}

export function bannerNoticeTypeMeta(value?: string | null) {
    const key = normalizeBannerNoticeType(value);
    return BANNER_NOTICE_TYPES.find((item) => item.key === key) as (typeof BANNER_NOTICE_TYPES)[number];
}

export function bannerNoticeTypeLabel(value?: string | null) {
    return bannerNoticeTypeMeta(value).label;
}

export function bannerNoticeTypeHint(value?: string | null) {
    return bannerNoticeTypeMeta(value).hint;
}

/** 该类型底色的 CSS 引用（含 var()）；scope 内可被预览容器覆盖成明暗指定档。 */
export function bannerNoticeSurfaceCSS(value?: string | null) {
    return `var(${bannerNoticeTypeMeta(value).surfaceVar})`;
}

/** 合法类型键，供后端白名单与前端一致性测试使用。 */
export const BANNER_NOTICE_TYPE_VALUES = BANNER_NOTICE_TYPES.map((item) => item.key);

/**
 * 标题可插入的 emoji 图标素材，按用途分组。
 * 每项的 char 会作为普通文本插进标题（跟随光标处的字号 / 颜色样式），label 供搜索与 aria 标注。
 */
export const BANNER_NOTICE_EMOJI_GROUPS: { key: string; label: string; emoji: { char: string; label: string }[] }[] = [
    {
        key: "notice",
        label: translate("settings.preferences.notifications"),
        emoji: [
            { char: "📢", label: translate("shared.announcements.bannerNotice.loudspeaker") },
            { char: "📣", label: translate("shared.announcements.bannerNotice.megaphone") },
            { char: "🔔", label: translate("shared.announcements.bannerNotice.bell") },
            { char: "📮", label: translate("shared.announcements.bannerNotice.postbox") },
            { char: "📌", label: translate("shared.announcements.bannerNotice.pushpin") },
            { char: "📄", label: translate("shared.announcements.bannerNotice.document") },
            { char: "📝", label: translate("shared.announcements.bannerNotice.memo") },
            { char: "📰", label: translate("shared.announcements.bannerNotice.news") },
            { char: "🗓️", label: translate("shared.announcements.bannerNotice.calendar") },
            { char: "⏰", label: translate("shared.announcements.bannerNotice.alarmClock") },
            { char: "🕐", label: translate("shared.announcements.bannerNotice.clock") },
            { char: "🎯", label: translate("shared.announcements.bannerNotice.target") },
        ],
    },
    {
        key: "celebrate",
        label: translate("shared.announcements.bannerNotice.celebration"),
        emoji: [
            { char: "🎉", label: translate("shared.announcements.bannerNotice.partyPopper") },
            { char: "🎊", label: translate("shared.announcements.bannerNotice.confetti") },
            { char: "🎈", label: translate("shared.announcements.bannerNotice.balloon") },
            { char: "🎁", label: translate("shared.announcements.bannerNotice.gift") },
            { char: "🎂", label: translate("shared.announcements.bannerNotice.cake") },
            { char: "🥳", label: translate("shared.announcements.bannerNotice.party") },
            { char: "🏆", label: translate("shared.announcements.bannerNotice.trophy") },
            { char: "🥇", label: translate("shared.announcements.bannerNotice.goldMedal") },
            { char: "👑", label: translate("shared.announcements.bannerNotice.crown") },
            { char: "💎", label: translate("shared.announcements.bannerNotice.gem") },
            { char: "✨", label: translate("shared.announcements.bannerNotice.sparkles") },
            { char: "⭐", label: translate("shared.announcements.bannerNotice.star") },
        ],
    },
    {
        key: "hot",
        label: translate("shared.announcements.bannerNotice.trending"),
        emoji: [
            { char: "🔥", label: translate("shared.announcements.bannerNotice.trending") },
            { char: "🚀", label: translate("shared.announcements.bannerNotice.rocket") },
            { char: "⚡", label: translate("shared.announcements.bannerNotice.lightning") },
            { char: "💥", label: translate("shared.announcements.bannerNotice.explosion") },
            { char: "🌟", label: translate("shared.announcements.bannerNotice.glowingStar") },
            { char: "💫", label: translate("shared.announcements.bannerNotice.dizzyStar") },
            { char: "🌈", label: translate("shared.announcements.bannerNotice.rainbow") },
            { char: "☀️", label: translate("shared.announcements.bannerNotice.sun") },
            { char: "🌙", label: translate("shared.announcements.bannerNotice.moon") },
            { char: "❤️", label: translate("shared.announcements.bannerNotice.redHeart") },
            { char: "💯", label: translate("shared.announcements.bannerNotice.fullMarks") },
            { char: "👍", label: translate("shared.announcements.bannerNotice.thumbsUp") },
        ],
    },
    {
        key: "commerce",
        label: translate("shared.announcements.bannerNotice.commerce"),
        emoji: [
            { char: "💰", label: translate("shared.announcements.bannerNotice.moneyBag") },
            { char: "💸", label: translate("shared.announcements.bannerNotice.moneyWithWings") },
            { char: "💳", label: translate("shared.announcements.bannerNotice.creditCard") },
            { char: "🏦", label: translate("shared.announcements.bannerNotice.bank") },
            { char: "🛒", label: translate("shared.announcements.bannerNotice.shoppingCart") },
            { char: "🛍️", label: translate("shared.announcements.bannerNotice.shoppingBags") },
            { char: "🏷️", label: translate("shared.announcements.bannerNotice.priceTag") },
            { char: "💼", label: translate("shared.announcements.bannerNotice.briefcase") },
            { char: "📈", label: translate("shared.announcements.bannerNotice.risingChart") },
            { char: "📉", label: translate("shared.announcements.bannerNotice.fallingChart") },
            { char: "🎫", label: translate("shared.announcements.bannerNotice.ticket") },
            { char: "🎟️", label: translate("shared.announcements.bannerNotice.admissionTicket") },
        ],
    },
    {
        key: "status",
        label: translate("library.tasks.detail.status"),
        emoji: [
            { char: "✅", label: translate("shared.announcements.bannerNotice.complete") },
            { char: "❌", label: translate("common.cancel") },
            { char: "⚠️", label: translate("shared.skinThemes.warning") },
            { char: "⛔", label: translate("shared.announcements.bannerNotice.noEntry") },
            { char: "🚫", label: translate("shared.announcements.bannerNotice.prohibited") },
            { char: "❓", label: translate("shared.announcements.bannerNotice.questionMark") },
            { char: "❗", label: translate("shared.announcements.bannerNotice.exclamationMark") },
            { char: "⏳", label: translate("shared.announcements.bannerNotice.waiting") },
            { char: "🔄", label: translate("common.refresh") },
            { char: "🔧", label: translate("shared.announcements.bannerNotice.wrench") },
            { char: "🔒", label: translate("shared.announcements.bannerNotice.locked") },
            { char: "🐞", label: translate("shared.announcements.bannerNotice.bug") },
        ],
    },
];

/** 扁平化的 emoji 清单，顺序与分组一致。 */
export const BANNER_NOTICE_EMOJIS = BANNER_NOTICE_EMOJI_GROUPS.flatMap((group) =>
    group.emoji.map((item) => ({ ...item, group: group.key, groupLabel: group.label })),
);

/** 按关键字过滤（匹配中文名、分组名或字符本身），空关键字返回全量。 */
export function searchBannerNoticeEmojis(keyword: string) {
    const query = keyword.trim().toLowerCase();
    if (!query) return BANNER_NOTICE_EMOJIS;
    return BANNER_NOTICE_EMOJIS.filter((item) => item.char.includes(query) || item.label.includes(query) || item.groupLabel.includes(query));
}

/**
 * 读取指定类型在当前主题下的通知条实底色，避免把设计 token 的色值复制到 TS 里。
 * scope 传后台预览容器可在该容器强制指定的明 / 暗档里取值。
 */
export function readBannerNoticeSurface(noticeType?: string | null, scope?: HTMLElement | null) {
    if (typeof window === "undefined") return "";
    const host = scope || window.document.body || window.document.documentElement;
    if (!host) return "";
    const probe = window.document.createElement("span");
    probe.style.cssText = `position:absolute;left:-9999px;top:-9999px;background-color:${bannerNoticeSurfaceCSS(noticeType)}`;
    host.appendChild(probe);
    const resolved = window.getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
}
