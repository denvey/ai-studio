import type { ColumnsType } from "antd/es/table";
import { Coins, Eye, Pencil, Power } from "lucide-react";

import { formatCredits } from "@/constant/credits";
import { IdentityProviderBadge } from "@/components/layout/identity-provider-badge";
import { AdminRowActions, AdminStatusBadge } from "../components/admin-ui";
import type { AdminUser } from "@/services/api/auth";
import { UserGroupBadge } from "@/components/layout/user-group-badge";
import { userGroupCode, type UserGroup } from "@/services/api/user-groups";
import { currentLocale, translate } from "@/i18n";

export type UserColumnKey = "user" | "email" | "credits" | "recharged" | "consumed" | "role" | "group" | "status" | "lastLoginAt" | "createdAt" | "actions";

export const userColumnOptions: Array<{ key: UserColumnKey; label: string; locked?: boolean }> = [
    { key: "user", label: translate("adminPages.users.usersColumns.users"), locked: true },
    { key: "email", label: translate("auth.verification.email") },
    { key: "credits", label: translate("shell.account.availableCredits") },
    { key: "recharged", label: translate("adminPages.users.usersColumns.totalPurchased") },
    { key: "consumed", label: translate("adminPages.users.usersColumns.totalSpent") },
    { key: "role", label: translate("account.welcome.chapters.world.label") },
    { key: "group", label: translate("adminPages.users.usersColumns.group") },
    { key: "status", label: translate("library.tasks.detail.status") },
    { key: "lastLoginAt", label: translate("adminPages.users.usersColumns.lastLogin") },
    { key: "createdAt", label: translate("adminPages.users.usersColumns.registeredAt") },
    { key: "actions", label: translate("account.settings.runninghub.actions"), locked: true },
];

export function createUserColumns({
    actorId,
    visibleColumns,
    groups,
    onView,
    onEdit,
    onAdjustCredits,
    onToggleStatus,
}: {
    actorId?: string;
    visibleColumns: Set<UserColumnKey>;
    groups: UserGroup[];
    onView: (user: AdminUser) => void;
    onEdit: (user: AdminUser) => void;
    onAdjustCredits: (user: AdminUser) => void;
    onToggleStatus: (user: AdminUser) => Promise<void>;
}): ColumnsType<AdminUser> {
    const columns: Array<ColumnsType<AdminUser>[number] & { key: UserColumnKey }> = [
        {
            key: "user",
            title: translate("adminPages.users.usersColumns.users"),
            dataIndex: "username",
            fixed: "left",
            width: 200,
            render: (_, user) => (
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <button type="button" className="admin-table-primary-link truncate font-medium" onClick={() => onView(user)}>
                            {user.displayName || user.username}
                        </button>
                        <IdentityProviderBadge user={user} />
                    </div>
                    <div className="truncate text-xs text-foreground/45">@{user.username}</div>
                </div>
            ),
        },
        { key: "email", title: translate("auth.verification.email"), dataIndex: "email", width: 200, ellipsis: true, render: (email) => email || <span className="text-foreground/40">{translate("adminPages.users.usersColumns.notFilledIn")}</span> },
        {
            key: "credits",
            title: translate("shell.account.availableCredits"),
            dataIndex: "availableMicrocredits",
            width: 120,
            align: "right",
            render: (value, user) => (
                <div className="tabular-nums">
                    <div>{formatCredits(value)}</div>
                    {user.reservedMicrocredits ? (
                        <div className="text-xs text-foreground/45">
                            {translate("adminPages.users.usersColumns.held")} {formatCredits(user.reservedMicrocredits)}
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            key: "recharged",
            title: translate("adminPages.users.usersColumns.totalPurchased"),
            dataIndex: "rechargedMicrocredits",
            width: 110,
            align: "right",
            render: (value?: number) => (value ? <span className="tabular-nums">{formatCredits(value)}</span> : <span className="text-foreground/35">—</span>),
        },
        {
            key: "consumed",
            title: translate("adminPages.users.usersColumns.totalSpent"),
            dataIndex: "consumedMicrocredits",
            width: 110,
            align: "right",
            render: (value?: number) => (value ? <span className="tabular-nums">{formatCredits(value)}</span> : <span className="text-foreground/35">—</span>),
        },
        {
            key: "role",
            title: translate("account.welcome.chapters.world.label"),
            dataIndex: "role",
            width: 130,
            align: "center",
            render: (role, user) => (
                <span className="inline-flex flex-wrap items-center justify-center gap-1">
                    <AdminStatusBadge label={role === "admin" ? translate("shell.account.admin") : translate("adminPages.users.usersColumns.regularUser")} tone={role === "admin" ? "info" : "neutral"} />
                    {user.isPromoter ? <AdminStatusBadge label={translate("adminPages.users.usersColumns.referrer")} tone="success" /> : null}
                </span>
            ),
        },
        {
            key: "group",
            title: translate("adminPages.users.usersColumns.group"),
            dataIndex: "userGroup",
            width: 120,
            align: "center",
            render: (_, user) => {
                const code = userGroupCode(user.userGroup);
                const group = groups.find((item) => item.code === code);
                return (
                    <span className="inline-flex items-center justify-center gap-1">
                        <span className="text-xs">{group?.name || code}</span>
                        {group ? <UserGroupBadge group={group} compact /> : null}
                    </span>
                );
            },
        },
        {
            key: "status",
            title: translate("library.tasks.detail.status"),
            dataIndex: "status",
            width: 90,
            align: "center",
            render: (status) => <AdminStatusBadge label={status === "active" ? translate("account.layout.oss.enabled") : translate("adminPages.users.usersColumns.disabled")} tone={status === "active" ? "success" : "neutral"} />,
        },
        {
            key: "lastLoginAt",
            title: translate("adminPages.users.usersColumns.lastLogin"),
            dataIndex: "lastLoginAt",
            width: 112,
            align: "center",
            render: (value?: string) =>
                value ? (
                    <span className="tabular-nums" title={formatTime(value)}>
                        {formatRelativeDay(value)}
                    </span>
                ) : (
                    <span className="text-foreground/35">{translate("adminPages.users.usersColumns.neverLoggedIn")}</span>
                ),
        },
        {
            key: "createdAt",
            title: translate("adminPages.users.usersColumns.registeredAt"),
            dataIndex: "createdAt",
            width: 112,
            align: "center",
            render: (value) => (
                <span className="tabular-nums" title={formatTime(value)}>
                    {formatCompactTime(value)}
                </span>
            ),
        },
        {
            key: "actions",
            title: translate("account.settings.runninghub.actions"),
            width: 268,
            align: "center",
            fixed: "right",
            // 高频操作全部外露，不收进“更多”：查看、编辑、调积分；停用带二次确认。
            render: (_, user) => (
                <AdminRowActions
                    primary={{ label: translate("account.layout.banner.details"), icon: <Eye className="size-3.5" />, onClick: () => onView(user) }}
                    visibleActionCount={3}
                    actions={[
                        { key: "edit", label: translate("account.settings.channels.edit"), icon: <Pencil className="size-3.5" />, onClick: () => onEdit(user) },
                        { key: "credits", label: translate("adminPages.users.usersColumns.adjustCredits"), icon: <Coins className="size-3.5" />, onClick: () => onAdjustCredits(user) },
                        {
                            key: "toggle-status",
                            label: user.status === "active" ? translate("adminPages.users.usersColumns.disable") : translate("adminPages.users.usersColumns.enable"),
                            icon: <Power className="size-3.5" />,
                            danger: user.status === "active",
                            disabled: user.id === actorId,
                            confirm: {
                                title: user.status === "active" ? translate("adminPages.users.usersColumns.deactivateThisUser") : translate("adminPages.users.usersColumns.reEnableThisUser"),
                                description:
                                    user.status === "active" ? translate("adminPages.users.usersColumns.deactivatingClearsThisUserSSessionButKeepsTheirIdentity") : translate("adminPages.users.usersColumns.onceEnabledThisUserCanSignInAgainAndKeep"),
                                okText: user.status === "active" ? translate("adminPages.users.usersColumns.confirmDeactivation") : translate("adminPages.users.usersColumns.confirmEnable"),
                            },
                            onClick: () => onToggleStatus(user),
                        },
                    ]}
                />
            ),
        },
    ];
    return columns.filter((column) => visibleColumns.has(column.key));
}

function formatTime(value?: string) {
    return value ? new Date(value).toLocaleString(currentLocale(), { hour12: false }) : "--";
}

function formatCompactTime(value?: string) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString(currentLocale(), { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

// 最近登录按“今天 / 昨天 / N 天前”显示，运营判断活跃度时比精确时间更快；完整时间在悬停提示里。
function formatRelativeDay(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const days = Math.floor((startOfToday.getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000);
    if (days <= 0) return translate("adminPages.users.usersColumns.today", { v0: String(date.toLocaleTimeString(currentLocale(), { hour: "2-digit", minute: "2-digit", hour12: false })) });
    if (days === 1) return translate("create.history.yesterday");
    if (days < 30) return translate("adminPages.users.usersColumns.daysAgo", { v0: String(days) });
    return formatCompactTime(value);
}
