import { ConfigProvider, Dropdown } from "antd";
import type { MenuProps } from "antd";
import {
    Activity,
    ArrowLeft,
    BarChart3,
    BellRing,
    BookMarked,
    Bot,
    ChevronDown,
    CloudUpload,
    Coins,
    CreditCard,
    Crown,
    Database,
    FileClock,
    Gift,
    HardDrive,
    Home,
    Inbox,
    Infinity as InfinityIcon,
    KeyRound,
    Layers3,
    LogIn,
    MailSearch,
    Mail,
    Megaphone,
    MessageSquareText,
    Moon,
    Paintbrush,
    Palette,
    PanelLeftClose,
    PanelLeftOpen,
    PersonStanding,
    PlugZap,
    RadioTower,
    RefreshCw,
    Rows3,
    Settings2,
    Shapes,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Sun,
    TicketCheck,
    ToggleLeft,
    UsersRound,
    Wand2,
} from "lucide-react";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";

import { AppChangelogButton } from "@/components/layout/app-changelog-modal";
import { BrandLogoFrame } from "@/components/brand/brand-logo";
import { publishWorkspaceSidebarCollapsed, readWorkspaceSidebarCollapsed, subscribeWorkspaceSidebarCollapsed } from "@/components/layout/workspace-sidebar-state";
import { AppFeedbackProvider } from "@/components/layout/app-feedback";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { getIsolatedAdminAntTheme } from "../theme/admin-ant-theme";
import { AdminTooltip } from "../ui/controls";
import { AdminGlobalSearch } from "./admin-global-search";
import { AdminDensityProvider, useAdminDensity } from "./admin-density";
import { preloadAdminPages } from "../admin-page-loader";
import "@/styles/admin-ui.css";
import "../theme/admin-tokens.css";
import "../theme/admin-chrome.css";
import { translate } from "@/i18n";

type AdminNavigationItem = {
    path: string;
    label: string;
    /** 折叠侧栏图标下方的两字名称，与用户端折叠导航保持一致。 */
    shortLabel: string;
    keywords?: string;
    icon: ReactNode;
    requireFeature?: "frontendModelsEnabled";
};

type AdminNavigationGroup = { key: string; label: string; items: AdminNavigationItem[] };

// 一个页面一个入口，按管理员的工作对象分组：先看运行状况，再处理用户与钱，再管模型供给，最后是低频的平台配置。
const adminNavigation: AdminNavigationGroup[] = [
    {
        key: "overview",
        label: translate("admin.adminShell.operationsMonitoring"),
        items: [
            { path: "/admin", keywords: "统计 仪表盘 收入 使用量 dashboard analytics", label: translate("admin.adminShell.operationsOverview"), shortLabel: translate("admin.adminShell.overview"), icon: <BarChart3 className="size-4" /> },
            { path: "/admin/logs", keywords: "请求 日志 错误 调用 计费 退款", label: translate("admin.adminShell.requestDetails"), shortLabel: translate("admin.adminShell.request"), icon: <FileClock className="size-4" /> },
            { path: "/admin/login-logs", keywords: "登录 记录 IP 安全", label: translate("admin.adminShell.signInLogs"), shortLabel: translate("shell.login"), icon: <LogIn className="size-4" /> },
            { path: "/admin/email-logs", keywords: "邮件 发送 记录 验证码", label: translate("admin.adminShell.emailLogs"), shortLabel: translate("admin.adminShell.email"), icon: <MailSearch className="size-4" /> },
            { path: "/admin/settings/system-performance", keywords: "性能 监控 CPU 内存 缓存 队列", label: translate("admin.adminShell.systemPerformance"), shortLabel: translate("admin.adminShell.performance"), icon: <Activity className="size-4" /> },
        ],
    },
    {
        key: "users",
        label: translate("admin.adminShell.usersAndOperations"),
        items: [
            { path: "/admin/users", keywords: "账号 用户 权限 封禁 密码", label: translate("admin.adminShell.userManagement"), shortLabel: translate("admin.adminShell.users"), icon: <UsersRound className="size-4" /> },
            { path: "/admin/user-groups", keywords: "用户组 倍率 VIP 定价", label: translate("admin.adminShell.userGroups"), shortLabel: translate("admin.adminShell.groups"), icon: <Crown className="size-4" /> },
            { path: "/admin/credit-operations", keywords: "积分 余额 账务 退款", label: translate("admin.adminShell.creditOperations"), shortLabel: translate("shell.credits"), icon: <Coins className="size-4" /> },
            { path: "/admin/payments", keywords: "支付 充值 订单 商品 支付宝 微信", label: translate("admin.adminShell.paymentsAndTopUps"), shortLabel: translate("admin.adminShell.payments"), icon: <CreditCard className="size-4" /> },
            { path: "/admin/redemption-codes", keywords: "兑换码 激活码 充值", label: translate("account.wallet.redeemTitle"), shortLabel: translate("account.wallet.tabRedeem"), icon: <TicketCheck className="size-4" /> },
            { path: "/admin/referral", keywords: "推广 邀请 佣金 返佣", label: translate("shell.account.referral"), shortLabel: translate("admin.adminShell.referrals"), icon: <Gift className="size-4" /> },
            { path: "/admin/announcements", keywords: "公告 更新 弹窗", label: translate("account.layout.announcements.title"), shortLabel: translate("admin.adminShell.announcement"), icon: <BellRing className="size-4" /> },
            { path: "/admin/banner-announcements", keywords: "通知 横幅", label: translate("admin.adminShell.persistentNotices"), shortLabel: translate("settings.preferences.notifications"), icon: <Megaphone className="size-4" /> },
            { path: "/admin/feedbacks", keywords: "反馈 工单 建议 问题", label: translate("admin.adminShell.userFeedback"), shortLabel: translate("account.feedback.button"), icon: <Inbox className="size-4" /> },
            { path: "/admin/agent-lessons", keywords: "Agent 记忆 经验", label: translate("settings.sections.agent-memory.label"), shortLabel: translate("admin.adminShell.memory"), icon: <BookMarked className="size-4" /> },
        ],
    },
    {
        key: "models",
        label: translate("admin.adminShell.modelsAndChannels"),
        items: [
            { path: "/admin/channels", keywords: "渠道 模型 API Key 密钥 上游 定价 协议", label: translate("admin.adminShell.channelsAndModels"), shortLabel: translate("admin.adminShell.channel"), icon: <RadioTower className="size-4" /> },
            {
                path: "/admin/models",
                keywords: "前台模型 逻辑模型 能力",
                label: translate("admin.adminShell.userFacingModels"),
                shortLabel: translate("canvasA.assetView.model"),
                icon: <Layers3 className="size-4" />,
                requireFeature: "frontendModelsEnabled",
            },
        ],
    },
    {
        key: "creation",
        label: translate("admin.adminShell.creationAndExtensions"),
        items: [
            { path: "/admin/workbench-tools", keywords: "工作台 工具 首页", label: translate("admin.adminShell.workbenchTools"), shortLabel: translate("canvasA.focusBar.tools"), icon: <Shapes className="size-4" /> },
            { path: "/admin/prompt-templates", keywords: "提示词 模板 分镜 prompt", label: translate("account.settings.prompts.template"), shortLabel: translate("admin.adminShell.template"), icon: <MessageSquareText className="size-4" /> },
            { path: "/admin/pose-library", keywords: "姿势 动作 pose", label: translate("admin.adminShell.poseLibrary"), shortLabel: translate("admin.adminShell.poses"), icon: <PersonStanding className="size-4" /> },
            { path: "/admin/settings/drawing-engine", keywords: "绘图 画板 引擎", label: translate("admin.adminShell.drawingTools"), shortLabel: translate("canvasA.drawingModal.defaultTitle"), icon: <Paintbrush className="size-4" /> },
            { path: "/admin/plugins", keywords: "插件 扩展 协议 plugin", label: translate("admin.adminShell.pluginManagement"), shortLabel: translate("nav.sidebar.plugins"), icon: <PlugZap className="size-4" /> },
            { path: "/admin/skills", keywords: "技能 skill", label: translate("admin.adminShell.skillManagement"), shortLabel: translate("nav.sidebar.skills"), icon: <Wand2 className="size-4" /> },
            { path: "/admin/skill-curation", keywords: "技能 分类 推荐", label: translate("admin.adminShell.skillCategory"), shortLabel: translate("library.picker.category"), icon: <Sparkles className="size-4" /> },
            { path: "/admin/resources", keywords: "资源 文件 素材 存储 清理", label: translate("admin.adminShell.storageResources"), shortLabel: translate("admin.adminShell.resources"), icon: <Database className="size-4" /> },
        ],
    },
    {
        key: "ecommerce-agent",
        label: translate("nav.sidebar.ecommerce"),
        items: [
            { path: "/admin/ecommerce/agent", keywords: "电商 Agent 模型 配置", label: translate("admin.adminShell.eCommerceAgentSettings"), shortLabel: translate("account.settings.channels.configure"), icon: <Bot className="size-4" /> },
            { path: "/admin/ecommerce/library", keywords: "电商 知识 技能 品类", label: translate("admin.adminShell.knowledgeAndSkills"), shortLabel: translate("admin.adminShell.knowledge"), icon: <Database className="size-4" /> },
        ],
    },
    {
        key: "settings",
        label: translate("admin.adminShell.systemSettings"),
        items: [
            {
                path: "/admin/settings/appearance",
                keywords: "站点 外观 品牌 主题 Logo 皮肤",
                label: translate("admin.adminShell.siteAndAppearance"),
                shortLabel: translate("canvasA.characterStudio.groups.appearance"),
                icon: <Palette className="size-4" />,
            },
            { path: "/admin/settings/features", keywords: "功能 开关 开放", label: translate("admin.adminShell.featureAvailability"), shortLabel: translate("admin.adminShell.features"), icon: <ToggleLeft className="size-4" /> },
            { path: "/admin/settings/access", keywords: "登录 注册 验证码 认证", label: translate("admin.adminShell.signInAndRegistration"), shortLabel: translate("admin.adminShell.signUp"), icon: <ShieldCheck className="size-4" /> },
            { path: "/admin/settings/email", keywords: "邮件 SMTP 发信 邮箱", label: translate("admin.adminShell.emailService"), shortLabel: translate("admin.adminShell.email"), icon: <Mail className="size-4" /> },
            { path: "/admin/settings/storage", keywords: "存储 OSS S3 对象存储 上传", label: translate("account.layout.oss.provider"), shortLabel: translate("admin.adminShell.storage"), icon: <HardDrive className="size-4" /> },
            { path: "/admin/settings/runtime-policy", keywords: "资源 策略 并发 限流 配额 worker", label: translate("admin.adminShell.resourcesAndPolicy"), shortLabel: translate("admin.adminShell.strategy"), icon: <Settings2 className="size-4" /> },
            { path: "/admin/settings/ark-private-assets", keywords: "方舟 素材库 火山", label: translate("settings.sections.ark-assets.label"), shortLabel: translate("admin.adminShell.ark"), icon: <CloudUpload className="size-4" /> },
            { path: "/admin/settings/third-party", keywords: "第三方 参数 配置 密钥 LibTV", label: translate("admin.adminShell.thirdPartySettings"), shortLabel: translate("admin.adminShell.thirdParty"), icon: <KeyRound className="size-4" /> },
            {
                path: "/admin/settings/response-interception",
                keywords: "模型 响应 拦截 敏感词 过滤",
                label: translate("admin.adminShell.modelResponseFiltering"),
                shortLabel: translate("admin.adminShell.interception"),
                icon: <ShieldAlert className="size-4" />,
            },
            { path: "/admin/settings/system-update", keywords: "系统 更新 升级 版本 部署", label: translate("admin.adminShell.systemUpdates"), shortLabel: translate("canvasA.assetView.updated"), icon: <RefreshCw className="size-4" /> },
        ],
    },
];

function isAdminNavigationPath(pathname: string, navigationPath: string) {
    if (navigationPath === "/admin") {
        return pathname === navigationPath;
    }
    return pathname === navigationPath || pathname.startsWith(`${navigationPath}/`);
}

function findAdminNavigation(pathname: string) {
    for (const group of adminNavigation) {
        const item = group.items.find((candidate) => isAdminNavigationPath(pathname, candidate.path));
        if (item) return { group, item };
    }
    return undefined;
}

function visibleNavigationGroups(features: Partial<Record<"frontendModelsEnabled", boolean>>) {
    return adminNavigation.map((group) => ({ ...group, items: group.items.filter((item) => !item.requireFeature || features[item.requireFeature]) })).filter((group) => group.items.length > 0);
}

// v2：从“全部展开”改为默认只展开当前所在分组，菜单更紧凑。
const expandedGroupsStorageKey = "admin-nav-expanded-groups-v2";

function readExpandedGroups(currentGroupKey?: string): Set<string> {
    const fallback = new Set(currentGroupKey ? [currentGroupKey] : []);
    if (typeof window === "undefined") return fallback;
    try {
        const saved = JSON.parse(window.localStorage.getItem(expandedGroupsStorageKey) || "null") as string[] | null;
        return Array.isArray(saved) ? new Set(saved) : fallback;
    } catch {
        return fallback;
    }
}

function adminPopupContainer(node?: HTMLElement) {
    return document.getElementById("admin-root") || node?.closest("[data-admin-root]") || document.body;
}

export function AdminShell() {
    const userId = useUserStore((state) => state.user?.id);
    return (
        <AdminDensityProvider key={userId || "anonymous"} userId={userId}>
            <AdminShellLayout />
        </AdminDensityProvider>
    );
}

function AdminShellLayout() {
    const { density } = useAdminDensity();
    const features = useUserStore((state) => state.features);
    const searchEntries = visibleNavigationGroups(features).flatMap((group) => group.items.map((item) => ({ path: item.path, label: item.label, group: group.label, keywords: item.keywords })));
    const appearance = useAppearanceStore((state) => state.appearance);
    const [collapsed, setCollapsed] = useState(readWorkspaceSidebarCollapsed);
    const dark = useThemeStore((state) => state.theme === "dark");

    // 进入后台后空闲预取其他页面代码，切换菜单时不再出现加载白屏。
    useEffect(() => {
        preloadAdminPages();
    }, []);

    useEffect(() => {
        document.body.classList.add("admin-overlays");
        return () => document.body.classList.remove("admin-overlays");
    }, []);

    useEffect(() => {
        return subscribeWorkspaceSidebarCollapsed(setCollapsed);
    }, []);

    const toggleCollapsed = () => {
        const next = !collapsed;
        setCollapsed(next);
        publishWorkspaceSidebarCollapsed(next);
    };

    return (
        <ConfigProvider theme={getIsolatedAdminAntTheme(dark, appearance.activeSkin)} getPopupContainer={(node) => adminPopupContainer(node)}>
            <AppFeedbackProvider>
                <main id="admin-root" data-admin-root data-admin-density={density} className="admin-shell flex h-full min-h-0 overflow-hidden">
                    <aside className={cn("admin-sidebar hidden shrink-0 flex-col overflow-hidden lg:flex", collapsed && "is-collapsed")}>
                        <div className="admin-sidebar-identity shrink-0">
                            <AdminTooltip title={collapsed ? (appearance.updates?.enabled ? translate("admin.adminShell.viewReleaseAnnouncements") : translate("admin.adminShell.viewChangelog")) : undefined} placement="right">
                                <AppChangelogButton
                                    className={cn("admin-sidebar-brand-button", collapsed && "is-collapsed")}
                                    icon={<BrandLogoFrame className="admin-sidebar-brand-mark grid shrink-0 place-items-center bg-foreground text-background" logoClassName="size-5 object-contain" alt="" fallback={<InfinityIcon className="size-4" />} />}
                                    label={appearance.brandName}
                                    showLabel={!collapsed}
                                    showVersion={!collapsed}
                                    labelClassName="admin-sidebar-brand-title"
                                    versionClassName="admin-sidebar-brand-version"
                                />
                            </AdminTooltip>
                        </div>
                        <AdminNavigation collapsed={collapsed} />
                        <div className={cn("admin-sidebar-footer shrink-0", collapsed && "is-collapsed")}>
                            <div className="admin-sidebar-footer-row">
                                <AdminTooltip title={collapsed ? translate("admin.adminShell.backToWorkspace") : undefined} placement="right">
                                    <NavLink to="/" aria-label={collapsed ? translate("admin.adminShell.backToWorkspace") : undefined} className={cn("admin-nav-link", collapsed && "is-collapsed")}>
                                        <Home className="size-4" strokeWidth={1.6} />
                                        {collapsed ? <span className="admin-nav-short-label">{translate("admin.adminShell.back")}</span> : <span>{translate("admin.adminShell.backToWorkspace")}</span>}
                                    </NavLink>
                                </AdminTooltip>
                                {!collapsed ? (
                                    <button type="button" className="admin-sidebar-collapse-toggle" onClick={toggleCollapsed} aria-label={translate("shell.collapseSidebar")} title={translate("shell.collapseSidebar")} aria-expanded={!collapsed}>
                                        <PanelLeftClose className="size-4" strokeWidth={1.7} />
                                    </button>
                                ) : null}
                            </div>
                            {collapsed ? (
                                <button type="button" className="admin-sidebar-collapse-toggle is-collapsed" onClick={toggleCollapsed} aria-label={translate("shell.expandSidebar")} title={translate("shell.expandSidebar")}>
                                    <PanelLeftOpen className="size-4" strokeWidth={1.7} />
                                </button>
                            ) : null}
                        </div>
                    </aside>
                    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
                        <MobileAdminNavigation />
                        <div className="admin-global-search-bar">
                            <AdminGlobalSearch entries={searchEntries} />
                        </div>
                        <Suspense
                            fallback={
                                <div className="p-8 text-sm" role="status">
                                    {translate("admin.adminShell.loadingAdminPage")}
                                </div>
                            }
                        >
                            <Outlet />
                        </Suspense>
                    </section>
                </main>
            </AppFeedbackProvider>
        </ConfigProvider>
    );
}

export function AdminPageFrame({ title, description, actions, back, scroll = false, children }: { title: string; description?: string; actions?: ReactNode; back?: { label: string; onClick: () => void }; scroll?: boolean; children: ReactNode }) {
    const location = useLocation();
    const current = findAdminNavigation(location.pathname);

    return (
        <div className={cn("admin-page-root", scroll && "admin-page-root-scrollable")}>
            <div className={cn("admin-page-frame", scroll && "admin-page-frame-scrollable")}>
                <header className="admin-page-header flex shrink-0 flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                        {back ? (
                            <AdminTooltip title={back.label}>
                                <button type="button" className="admin-icon-button shrink-0" aria-label={back.label} onClick={back.onClick}>
                                    <ArrowLeft className="size-4" />
                                </button>
                            </AdminTooltip>
                        ) : null}
                        <div className="admin-page-title-block min-w-0">
                            <nav className="admin-page-location" aria-label={translate("shell.breadcrumb")}>
                                <span className="admin-page-location-section">{current?.group.label ?? translate("admin.adminShell.admin")}</span>
                                <span className="admin-page-location-separator" aria-hidden="true">
                                    /
                                </span>
                                {back && current ? (
                                    <>
                                        <Link to={current.item.path} className="admin-page-location-section is-link">
                                            {current.item.label}
                                        </Link>
                                        <span className="admin-page-location-separator" aria-hidden="true">
                                            /
                                        </span>
                                    </>
                                ) : null}
                                <h1 className="admin-page-title truncate">{title}</h1>
                            </nav>
                            {description ? <p className="admin-page-description">{description}</p> : null}
                        </div>
                    </div>
                    <div className="admin-page-actions flex shrink-0 flex-wrap items-center">
                        {actions}
                        <AdminDensityButton />
                        <AdminThemeButton />
                    </div>
                </header>
                {children}
            </div>
        </div>
    );
}

function AdminDensityButton() {
    const { density, toggleDensity } = useAdminDensity();
    return (
        <AdminTooltip title={density === "compact" ? translate("admin.adminShell.useComfortableRowSpacing") : translate("admin.adminShell.useCompactRowSpacing")}>
            <button type="button" className="admin-density-toggle" onClick={toggleDensity} aria-label={translate("admin.adminShell.compactTableRowSpacing")} aria-pressed={density === "compact"}>
                <Rows3 className="size-4" aria-hidden="true" />
                {density === "compact" ? translate("library.assets.density.compact") : translate("library.assets.density.comfortable")}
            </button>
        </AdminTooltip>
    );
}

function AdminThemeButton() {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const dark = theme === "dark";

    return (
        <AdminTooltip title={dark ? translate("admin.adminShell.switchToLightTheme") : translate("admin.adminShell.switchToDarkTheme")} placement="bottom">
            <button type="button" className="admin-page-theme-toggle shrink-0" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? translate("admin.adminShell.switchToLightTheme") : translate("admin.adminShell.switchToDarkTheme")}>
                {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
            </button>
        </AdminTooltip>
    );
}

function MobileAdminNavigation() {
    const features = useUserStore((state) => state.features);
    const location = useLocation();
    const visibleGroups = visibleNavigationGroups(features);
    // 与桌面侧栏同一规则按前缀匹配；当前页可能因功能关闭而不在菜单里但仍可直达。
    const current = findAdminNavigation(location.pathname);
    const currentItem = current?.item;
    const menuItems: MenuProps["items"] = visibleGroups.map((group) => ({
        type: "group",
        key: `group-${group.key}`,
        label: group.label,
        children: group.items.map((item) => ({
            key: item.path,
            label: (
                <Link to={item.path} className="admin-mobile-navigation-menu-link">
                    {item.icon}
                    <span>{item.label}</span>
                </Link>
            ),
        })),
    }));

    return (
        <nav className="admin-mobile-navigation flex shrink-0 items-center justify-between gap-2 lg:hidden" aria-label={translate("admin.adminShell.adminNavigation")}>
            <Dropdown menu={{ items: menuItems, selectable: true, selectedKeys: currentItem ? [currentItem.path] : [], className: "admin-mobile-navigation-menu" }} trigger={["click"]} placement="bottomLeft">
                <button type="button" className="admin-mobile-navigation-trigger" aria-label={translate("admin.adminShell.openAdminNavigationCurrentPage", { v0: String(currentItem?.label || translate("admin.adminShell.unknown")) })}>
                    <span className="admin-mobile-navigation-current-icon">{currentItem?.icon}</span>
                    <span className="min-w-0 text-left">
                        <span className="admin-mobile-navigation-eyebrow">{translate("admin.adminShell.admin")}</span>
                        <span className="admin-mobile-navigation-current-label">{currentItem?.label || translate("admin.adminShell.chooseAPage")}</span>
                    </span>
                    <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
                </button>
            </Dropdown>
            <div className="flex shrink-0 items-center gap-1">
                <AdminTooltip title={translate("admin.adminShell.backToWorkspace")}>
                    <Link to="/" className="admin-mobile-navigation-action" aria-label={translate("admin.adminShell.backToWorkspace")}>
                        <Home className="size-4" aria-hidden="true" />
                    </Link>
                </AdminTooltip>
                <AppChangelogButton className="admin-mobile-navigation-action [&_svg]:size-4" />
            </div>
        </nav>
    );
}

function AdminNavigation({ collapsed }: { collapsed: boolean }) {
    const features = useUserStore((state) => state.features);
    const location = useLocation();
    const groups = visibleNavigationGroups(features);
    const currentGroupKey = findAdminNavigation(location.pathname)?.group.key;
    const [expandedGroups, setExpandedGroups] = useState(() => readExpandedGroups(currentGroupKey));

    // 进入某个分组的页面时自动展开该组，避免当前页藏在折叠分组里。
    useEffect(() => {
        if (!currentGroupKey) return;
        setExpandedGroups((current) => (current.has(currentGroupKey) ? current : new Set([...current, currentGroupKey])));
    }, [currentGroupKey]);

    useEffect(() => {
        window.localStorage.setItem(expandedGroupsStorageKey, JSON.stringify([...expandedGroups]));
    }, [expandedGroups]);

    const toggleGroup = (key: string) =>
        setExpandedGroups((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    const renderItem = (item: AdminNavigationItem) => {
        const active = isAdminNavigationPath(location.pathname, item.path);
        return (
            <AdminTooltip key={item.path} delay={100} title={collapsed ? item.label : undefined} placement="right">
                <NavLink to={item.path} end={item.path === "/admin"} aria-label={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} className={cn("admin-nav-link", collapsed && "is-collapsed", active && "is-active")}>
                    {item.icon}
                    {collapsed ? <span className="admin-nav-short-label">{item.shortLabel}</span> : <span className="truncate">{item.label}</span>}
                </NavLink>
            </AdminTooltip>
        );
    };

    return (
        <nav className={cn("admin-sidebar-nav thin-scrollbar flex-1 overflow-y-auto", !collapsed && "is-tree")} aria-label={translate("admin.adminShell.adminMenu")}>
            {groups.map((group) => {
                if (collapsed) {
                    return (
                        <div key={group.key} className="admin-nav-group">
                            <div className="admin-nav-collapsed-separator" />
                            <div className="admin-nav-group-items is-collapsed">{group.items.map(renderItem)}</div>
                        </div>
                    );
                }
                const expanded = expandedGroups.has(group.key);
                const panelId = `admin-nav-group-${group.key}`;
                return (
                    <div key={group.key} className={cn("admin-nav-group", group.key === currentGroupKey && "is-current")}>
                        <button type="button" className="admin-nav-group-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggleGroup(group.key)}>
                            <span>{group.label}</span>
                            <ChevronDown className={cn("admin-nav-group-chevron size-3.5", !expanded && "is-collapsed")} aria-hidden="true" />
                        </button>
                        {expanded ? (
                            <div id={panelId} className="admin-nav-group-items">
                                {group.items.map(renderItem)}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </nav>
    );
}
