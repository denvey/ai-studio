import type { WorkbenchKind, WorkbenchTool } from "@/services/api/workbench";

import { workbenchCategoryLabel } from "./workbench-catalog";

/**
 * 电商出品的页面级预设：画幅用途提示、灵感短语与场景细分。
 * 这些只是帮助用户更快写出可用的提示词和选对画幅，最终参数仍以所选模型能力为准。
 */

import { translate } from "@/i18n";
export type RatioUsage = { label: string; title: string };

const IMAGE_RATIO_USAGE: Record<string, RatioUsage> = {
    "1:1": { label: translate("ecommerce.workbench.workbenchPresets.mainImage"), title: translate("ecommerce.workbench.workbenchPresets.mainProductImagesForTaobaoTmallJDPinduoduoAmazon") },
    "3:4": { label: translate("ecommerce.workbench.workbenchPresets.fashionMainImage"), title: translate("ecommerce.workbench.workbenchPresets.tmallFashionMainImageXiaohongshuPostCover") },
    "4:3": { label: translate("ecommerce.workbench.workbenchPresets.landscape"), title: translate("ecommerce.workbench.workbenchPresets.landscapeProductImagesAndDetailPageIllustrations") },
    "9:16": { label: translate("create.ratio.portrait"), title: translate("ecommerce.workbench.workbenchPresets.portraitContentLaunchAdsAndLivestreamPostersForDouyinKuaishou") },
    "16:9": { label: translate("ecommerce.workbench.workbenchPresets.banner"), title: translate("ecommerce.workbench.workbenchPresets.detailPageHeroAndStoreBanner") },
    "2:3": { label: translate("ecommerce.workbench.workbenchPresets.poster"), title: translate("ecommerce.workbench.workbenchPresets.portraitPostersAndDetailPageScreenSegments") },
    "3:2": { label: translate("ecommerce.workbench.workbenchPresets.landscape"), title: translate("ecommerce.workbench.workbenchPresets.landscapePostersAndPostIllustrations") },
    "4:5": { label: translate("ecommerce.workbench.workbenchPresets.feed"), title: translate("ecommerce.workbench.workbenchPresets.portraitSocialFeedImages") },
    "5:4": { label: translate("ecommerce.workbench.workbenchPresets.landscape"), title: translate("ecommerce.workbench.workbenchPresets.landscapeProductImages") },
    "21:9": { label: translate("ecommerce.workbench.workbenchPresets.fullWidth"), title: translate("ecommerce.workbench.workbenchPresets.fullWidthStoreBanner") },
};

const VIDEO_RATIO_USAGE: Record<string, RatioUsage> = {
    "9:16": { label: translate("ecommerce.workbench.workbenchPresets.portraitShortVideo"), title: translate("ecommerce.workbench.workbenchPresets.douyinKuaishouWeChatChannelsAdsAndLivestreamClips") },
    "1:1": { label: translate("ecommerce.workbench.workbenchPresets.mainProductVideo"), title: translate("ecommerce.workbench.workbenchPresets.taobaoJDMainProductVideo") },
    "3:4": { label: translate("ecommerce.workbench.workbenchPresets.portraitProductDiscovery"), title: translate("ecommerce.workbench.workbenchPresets.xiaohongshuVideoPostsAndFashionMainVideos") },
    "4:3": { label: translate("ecommerce.workbench.workbenchPresets.landscape"), title: translate("ecommerce.workbench.workbenchPresets.landscapeProductShowcase") },
    "16:9": { label: translate("ecommerce.workbench.workbenchPresets.landscapeDetailVideo"), title: translate("ecommerce.workbench.workbenchPresets.detailPageVideoAndLandscapeStoreHomepage") },
    "21:9": { label: translate("create.ratio.widescreen"), title: translate("ecommerce.workbench.workbenchPresets.brandIntrosAndFullWidthStoreBanners") },
    adaptive: { label: translate("ecommerce.workbench.workbenchPresets.matchAsset"), title: translate("ecommerce.workbench.workbenchPresets.generateUsingTheReferenceAssetSFrameSize") },
};

function normalizedRatio(value: string) {
    return value.trim().replace("：", ":");
}

export function workbenchRatioUsage(kind: WorkbenchKind, ratio: string): RatioUsage | undefined {
    const key = normalizedRatio(ratio);
    return kind === "image" ? IMAGE_RATIO_USAGE[key] : VIDEO_RATIO_USAGE[key];
}

export const WORKBENCH_SPEC_TIPS: Record<WorkbenchKind, string> = {
    image: translate("ecommerce.workbench.workbenchPresets.mainImagesCommonlyUse11At2KOrHigher"),
    video: translate("ecommerce.workbench.workbenchPresets.mainProductVideosCommonlyUse11Or34"),
};

export type InspirationGroup = { key: string; label: string; phrases: string[] };

export const WORKBENCH_INSPIRATIONS: Record<WorkbenchKind, InspirationGroup[]> = {
    image: [
        { key: "background", label: translate("canvasB.imageSettings.background"), phrases: ["纯白无缝背景", "浅灰影棚背景", "大理石台面", "原木桌面", "绿植与自然光", "简约居家场景", "户外阳光", "节日氛围布景"] },
        { key: "light", label: translate("ecommerce.workbench.workbenchPresets.lighting"), phrases: ["柔和棚拍光", "自然窗光", "侧逆光勾勒轮廓", "高调明亮", "低调质感光", "真实接触阴影"] },
        { key: "composition", label: translate("ecommerce.workbench.workbenchPresets.composition"), phrases: ["商品居中完整呈现", "45° 俯拍", "平视正面", "微距细节特写", "一侧留白便于排版", "多件组合陈列"] },
        { key: "style", label: translate("canvasA.toolPicker.style.short"), phrases: ["极简高级感", "清新日系", "奢华质感", "科技未来感", "国潮配色", "温暖生活感"] },
    ],
    video: [
        { key: "camera", label: translate("ecommerce.workbench.workbenchPresets.cameraMovement"), phrases: ["镜头缓慢推近", "环绕商品展示", "平稳横移", "俯拍缓慢下降", "固定机位", "低角度跟拍"] },
        { key: "rhythm", label: translate("ecommerce.workbench.workbenchPresets.pacing"), phrases: ["节奏舒缓", "轻快明亮", "开场 3 秒内露出商品", "结尾定格 1 秒"] },
        { key: "light", label: translate("ecommerce.workbench.workbenchPresets.lightAndShadow"), phrases: ["柔和棚拍光", "光线缓慢扫过商品表面", "自然窗光", "侧逆光勾边"] },
        { key: "mood", label: translate("ecommerce.workbench.workbenchPresets.mood"), phrases: ["高级质感", "清新自然", "温暖居家", "科技感", "节日喜庆"] },
    ],
};

export type SceneFacet = { key: string; label: string; keywords: string[] };

export const WORKBENCH_SCENE_FACETS: Record<WorkbenchKind, SceneFacet[]> = {
    image: [
        { key: "hero", label: translate("ecommerce.workbench.workbenchPresets.mainWhiteBackground"), keywords: ["主图", "白底", "柔影", "换背景", "陈列", "套系"] },
        { key: "model", label: translate("ecommerce.workbench.workbenchPresets.modelTryOn"), keywords: ["模特", "上身", "上脚", "佩戴", "手持", "穿搭"] },
        { key: "detail", label: translate("ecommerce.workbench.workbenchPresets.detailsAndMaterials"), keywords: ["细节", "微距", "质地", "面料", "工艺", "尺寸", "色号"] },
        { key: "scene", label: translate("ecommerce.workbench.workbenchPresets.sceneAndMood"), keywords: ["场景", "氛围", "空间", "生活方式", "静物", "软装", "故事"] },
        { key: "marketing", label: translate("ecommerce.workbench.workbenchPresets.detailsAndMarketing"), keywords: ["详情", "活动", "海报", "广告", "封面", "卖点", "变体"] },
    ],
    video: [
        { key: "showcase", label: translate("ecommerce.workbench.workbenchPresets.productShowcase"), keywords: ["英雄", "环绕", "推进", "揭示", "聚光", "静帧", "收尾"] },
        { key: "model", label: translate("ecommerce.workbench.workbenchPresets.modelMovement"), keywords: ["模特", "步态", "通勤", "转身", "面料"] },
        { key: "detail", label: translate("ecommerce.workbench.workbenchPresets.detailCloseUp"), keywords: ["微距", "细节", "特写", "微光", "滴管", "喷雾", "热气"] },
        { key: "usage", label: translate("ecommerce.workbench.workbenchPresets.usageDemonstration"), keywords: ["使用", "开箱", "冲煮", "功能", "演示"] },
        { key: "ads", label: translate("ecommerce.workbench.workbenchPresets.shortVideoAds"), keywords: ["钩子", "竖屏", "对照", "短片"] },
    ],
};

function toolSearchText(tool: WorkbenchTool) {
    return `${tool.name} ${tool.subtitle || ""} ${tool.description || ""} ${(tool.searchKeywords || []).join(" ")}`.toLocaleLowerCase();
}

export function toolMatchesFacet(tool: WorkbenchTool, facet: SceneFacet) {
    const name = `${tool.name} ${tool.subtitle || ""}`.toLocaleLowerCase();
    return facet.keywords.some((keyword) => name.includes(keyword.toLocaleLowerCase()));
}

export function filterWorkbenchTools(tools: WorkbenchTool[], category: string, query: string, facet?: SceneFacet) {
    const normalized = query.trim().toLocaleLowerCase();
    return tools.filter(
        (tool) =>
            (category === "all" || (category === "recommended" ? tool.recommended || tool.categoryId === category : tool.categoryId === category)) &&
            (!facet || toolMatchesFacet(tool, facet)) &&
            (!normalized || `${toolSearchText(tool)} ${workbenchCategoryLabel(tool.categoryId).toLocaleLowerCase()}`.includes(normalized)),
    );
}

/** 页面里电商分类优先；后台目录的原始顺序不变。未知分类排在最后。 */
const PAGE_CATEGORY_ORDER = ["recommended", "ecommerce", "product", "people", "scene", "enhancement", "short-video", "drama-character", "drama-scene", "storyboard"];

export function workbenchPageCategories(tools: WorkbenchTool[]) {
    const present = new Set(tools.map((tool) => tool.categoryId));
    const hasRecommended = tools.some((tool) => tool.recommended);
    const known = PAGE_CATEGORY_ORDER.filter((id) => (id === "recommended" ? hasRecommended : present.has(id)));
    const unknown = [...present].filter((id) => !PAGE_CATEGORY_ORDER.includes(id));
    return [...known, ...unknown].map((value) => ({ value, label: value === "recommended" ? translate("ecommerce.workbench.workbenchPresets.recommended") : workbenchCategoryLabel(value) }));
}

/** 快捷场景：后台标为推荐的电商工具优先，其次电商与商品分类。 */
export function workbenchQuickTools(tools: WorkbenchTool[], limit = 6) {
    const score = (tool: WorkbenchTool) => (tool.recommended ? 0 : 2) + (tool.categoryId === "ecommerce" || tool.categoryId === "product" ? 0 : 1);
    return [...tools].sort((a, b) => score(a) - score(b) || (a.recommendationOrder ?? a.sortOrder) - (b.recommendationOrder ?? b.sortOrder)).slice(0, limit);
}

export type SceneTone = "product" | "people" | "scene" | "detail" | "marketing" | "video" | "creative";

const SCENE_TONE_RULES: Array<[SceneTone, RegExp]> = [
    ["people", /模特|人物|上身|上脚|穿搭|佩戴|手持/],
    ["detail", /细节|微距|质地|面料|工艺|特写/],
    ["marketing", /详情|活动|海报|广告|封面|卖点|钩子/],
    ["scene", /场景|氛围|空间|背景|生活|静物/],
    ["product", /主图|商品|白底|电商|包装|陈列|套图/],
];

/**
 * 场景图标与分类色：只用于工具字形 tile，按钮和选中态仍用全站中性色。
 * 先按名称判断，名称没有线索时才看副标题；说明里常出现“细节”“背景”等泛化词，不能决定分类。
 */
export function workbenchSceneTone(tool: WorkbenchTool | null, kind: WorkbenchKind): SceneTone {
    if (!tool) return "creative";
    for (const source of [tool.name, isModelIdLike(tool.subtitle) ? "" : tool.subtitle || ""]) {
        const match = SCENE_TONE_RULES.find(([, pattern]) => pattern.test(source));
        if (match) return match[0];
    }
    return kind === "video" ? "video" : "creative";
}

/** 后台副标题有时误填成模型 ID，展示时回退到说明文字，避免把内部标识露给用户。 */
export function isModelIdLike(value: string | undefined) {
    if (!value) return true;
    const normalized = value.trim();
    if (!normalized) return true;
    return /^[a-z0-9][a-z0-9._-]{1,40}$/i.test(normalized) && /[._-]/.test(normalized);
}

export function workbenchToolSubtitle(tool: WorkbenchTool) {
    return isModelIdLike(tool.subtitle) ? tool.description || "" : tool.subtitle || tool.description || "";
}
