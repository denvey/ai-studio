import { App, Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { UserGroupBadge } from "@/components/layout/user-group-badge";
import { deleteAdminUserGroup, formatRatioBasisPoints, listAdminUserGroups, type UserGroup } from "@/services/api/user-groups";
import { useAdminContext } from "../admin-context";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminDataTable, AdminRowActions, AdminStatusBadge, AdminTableEmpty } from "../components/admin-ui";
import { UserGroupEditor } from "./user-group-editor";
import { formatPoints } from "./user-group-form";
import { translate } from "@/i18n";


/** 用户分组：分组 -> 系统渠道 -> 模型的可见范围、统一折扣和货币兑换积分比例。 */
export default function UserGroupsPage() {
    const { message } = App.useApp();
    const { references } = useAdminContext();
    const [groups, setGroups] = useState<UserGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [editing, setEditing] = useState<UserGroup | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            setGroups((await listAdminUserGroups()).groups);
        } catch (error) {
            const text = error instanceof Error ? error.message : translate("adminPages.userGroups.userGroupsPage.failedToLoadUserGroups");
            setLoadError(text);
            message.error(text);
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => {
        void load();
    }, [load]);

    const channelNames = useMemo(() => new Map(references.channels.map((channel) => [channel.id, channel.name])), [references.channels]);

    const remove = useCallback(
        async (group: UserGroup) => {
            try {
                await deleteAdminUserGroup(group.id);
                setGroups((items) => items.filter((item) => item.id !== group.id));
                message.success(translate("adminPages.userGroups.userGroupsPage.groupDeleted"));
            } catch (error) {
                message.error(error instanceof Error ? error.message : translate("adminPages.userGroups.userGroupsPage.failedToDeleteGroup"));
            }
        },
        [message],
    );

    const columns = useMemo<ColumnsType<UserGroup>>(
        () => [
            {
                key: "group",
                title: translate("adminPages.userGroups.userGroupsPage.group"),
                render: (_, group) => (
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="admin-table-primary-link font-medium"
                                onClick={() => {
                                    setEditing(group);
                                    setEditorOpen(true);
                                }}
                            >
                                {group.name}
                            </button>
                            <UserGroupBadge group={group} />
                            {group.isDefault ? <AdminStatusBadge label={translate("canvasB.common.default")} tone="info" /> : null}
                        </div>
                        <div className="text-xs text-foreground/45">
                            {group.code}
                            {group.description ? ` · ${group.description}` : ""}
                        </div>
                    </div>
                ),
            },
            {
                key: "ratio",
                title: translate("adminPages.userGroups.userGroupsPage.groupMultiplier"),
                width: 110,
                align: "center",
                render: (_, group) => <span className="tabular-nums">{formatRatioBasisPoints(group.ratioBasisPoints)}</span>,
            },
            {
                key: "currency",
                title: translate("adminPages.userGroups.userGroupsPage.currencyConversion"),
                width: 170,
                align: "center",
                render: (_, group) => (
                    <div className="text-xs tabular-nums leading-5">
                        <div>1 USD = {group.pointsPerUsdMicrocredits ? translate("adminPages.userGroups.userGroupsPage.credits", { v0: String(formatPoints(group.pointsPerUsdMicrocredits)) }) : translate("account.layout.oss.cdnAuthNone")}</div>
                        <div>1 CNY = {group.pointsPerCnyMicrocredits ? translate("adminPages.userGroups.userGroupsPage.credits", { v0: String(formatPoints(group.pointsPerCnyMicrocredits)) }) : translate("account.layout.oss.cdnAuthNone")}</div>
                    </div>
                ),
            },
            {
                key: "channels",
                title: translate("adminPages.userGroups.userGroupsPage.availableChannels"),
                width: 200,
                render: (_, group) =>
                    group.allChannels ? (
                        <AdminStatusBadge label={translate("adminPages.userGroups.userGroupsPage.allSystemChannels")} tone="success" />
                    ) : group.channelIds.length ? (
                        <span className="text-xs" title={group.channelIds.map((id) => channelNames.get(id) || id).join("、")}>
                            {group.channelIds
                                .slice(0, 2)
                                .map((id) => channelNames.get(id) || id)
                                .join("、")}
                            {group.channelIds.length > 2 ? translate("adminPages.userGroups.userGroupsPage.andOthersTotal", { v0: String(group.channelIds.length) }) : ""}
                        </span>
                    ) : (
                        <AdminStatusBadge label={translate("adminPages.userGroups.userGroupsPage.noAssignedChannels")} tone="warning" />
                    ),
            },
            {
                key: "overrides",
                title: translate("adminPages.userGroups.userGroupsPage.modelMultiplier"),
                width: 100,
                align: "center",
                render: (_, group) => (
                    <span className="tabular-nums" title={group.modelOverrides.map((item) => item.modelKey).join("\n")}>
                        {group.modelOverrides.length ? translate("adminPages.userGroups.userGroupsPage.items", { v0: String(group.modelOverrides.length) }) : "—"}
                    </span>
                ),
            },
            { key: "users", title: translate("adminPages.userGroups.userGroupsPage.users"), dataIndex: "userCount", width: 90, align: "center", render: (value: number) => <span className="tabular-nums">{value}</span> },
            {
                key: "actions",
                title: translate("account.settings.runninghub.actions"),
                width: 150,
                align: "center",
                render: (_, group) => (
                    <AdminRowActions
                        primary={{
                            label: translate("account.settings.channels.edit"),
                            icon: <Pencil className="size-3.5" />,
                            onClick: () => {
                                setEditing(group);
                                setEditorOpen(true);
                            },
                        }}
                        visibleActionCount={1}
                        actions={[
                            {
                                key: "delete",
                                label: translate("adminPages.userGroups.userGroupsPage.deleteGroup"),
                                icon: <Trash2 className="size-3.5" />,
                                danger: true,
                                disabled: group.isDefault || group.userCount > 0,
                                confirm: { title: translate("adminPages.userGroups.userGroupsPage.deleteGroup2", { v0: String(group.name) }), description: translate("adminPages.userGroups.userGroupsPage.thisCannotBeUndoneTheGroupMustHaveNoUsers"), okText: translate("account.ui.delete.confirm") },
                                onClick: () => remove(group),
                            },
                        ]}
                    />
                ),
            },
        ],
        [channelNames, remove],
    );

    return (
        <AdminPageFrame
            title={translate("adminPages.userGroups.userGroupsPage.userGroups")}
            description={translate("adminPages.userGroups.userGroupsPage.groupChannelModelVisibilitySharedDiscountsAndCurrencyToCredit")}
            actions={
                <div className="flex items-center gap-2">
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()}>
                        {translate("common.refresh")}
                    </Button>
                    <Button
                        type="primary"
                        icon={<Plus className="size-4" />}
                        onClick={() => {
                            setEditing(null);
                            setEditorOpen(true);
                        }}
                    >
                        {translate("adminPages.userGroups.userGroupsPage.newGroup")}
                    </Button>
                </div>
            }
        >
            <AdminDataTable
                skeletonColumns={columns.length}
                table={{ className: "app-data-table", size: "small", rowKey: "id", loading, columns, dataSource: groups, pagination: false, scroll: { x: 960 } }}
                empty={
                    loadError ? (
                        <div className="admin-inline-load-error" role="status">
                            <span>{translate("adminPages.userGroups.userGroupsPage.groupDataIsTemporarilyUnavailable")}{loadError}</span>
                            <Button size="small" onClick={() => void load()}>
                                {translate("common.retry")}
                            </Button>
                        </div>
                    ) : (
                        <AdminTableEmpty title={translate("adminPages.userGroups.userGroupsPage.noGroupsYet")} />
                    )
                }
            />
            <UserGroupEditor
                open={editorOpen}
                group={editing}
                onClose={() => setEditorOpen(false)}
                onSaved={(saved) => {
                    setGroups((items) => {
                        const exists = items.some((item) => item.id === saved.id);
                        const next = exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved];
                        return next.sort((left, right) => left.sortOrder - right.sortOrder);
                    });
                    setEditorOpen(false);
                }}
            />
        </AdminPageFrame>
    );
}
