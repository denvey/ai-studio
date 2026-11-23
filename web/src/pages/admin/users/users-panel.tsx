import { App, Button, Dropdown, Input } from "antd";
import { Checkbox } from "@/pages/admin/ui/controls";
import { Ban, Crown, Search, Settings2, UserPlus } from "lucide-react";
import { Link } from "react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PaginationBar } from "@/pages/admin/components/admin-ui";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { bulkDisableAdminUsers, deleteAdminUser, listAdminUsers, updateAdminUser, type AdminUser, type LocalUser } from "@/services/api/auth";
import { listAdminUserGroups, type UserGroup } from "@/services/api/user-groups";
import { useUserStore } from "@/stores/use-user-store";
import { AdminBatchBar, AdminDataTable, AdminTableEmpty } from "../components/admin-ui";
import { useTableUrlState } from "../lib/use-table-url-state";
import { AdminUserDetailDrawer } from "../components/admin-user-detail-drawer";
import { createUserColumns, userColumnOptions, type UserColumnKey } from "./users-columns";
import { AdminUserCreateModal, AdminUserEditModal } from "./users-modals";
import { UserCreditAdjustModal } from "./user-credit-adjust-modal";
import "./users-page.css";
import { Select } from "@/components/ui/base/select";
import { AdminSearchInput } from "../components/admin-search-input";
import { translate } from "@/i18n";


// v2：新增累计充值、累计消耗、最近登录列，旧的显示列偏好不再适用。
const columnStorageKey = "admin-users-visible-columns-v2";
const allColumnKeys = userColumnOptions.map((item) => item.key);

export default function UsersPanel({ onUserChanged }: { onUserChanged?: (user: LocalUser) => void }) {
    const actor = useUserStore((state) => state.user);
    const { message, modal } = App.useApp();
    const { state, update } = useTableUrlState();
    const debouncedFilter = useDebouncedValue(state.filter);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [retry, setRetry] = useState(0);
    const [detailUserId, setDetailUserId] = useState<string | null>(null);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [adjustingUser, setAdjustingUser] = useState<AdminUser | null>(null);
    const [createUserOpen, setCreateUserOpen] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [bulkDisabling, setBulkDisabling] = useState(false);
    const [groups, setGroups] = useState<UserGroup[]>([]);
    const [visibleColumns, setVisibleColumns] = useState<Set<UserColumnKey>>(() => {
        if (typeof window === "undefined") return new Set(allColumnKeys);
        try {
            const saved = JSON.parse(window.localStorage.getItem(columnStorageKey) || "[]") as UserColumnKey[];
            const valid = saved.filter((key) => allColumnKeys.includes(key));
            return new Set(valid.length ? [...valid, "user", "actions"] : allColumnKeys);
        } catch {
            return new Set(allColumnKeys);
        }
    });
    const requestSequence = useRef(0);
    const hasFilters = Boolean(state.filter || state.role !== "all" || state.status !== "all" || state.group !== "all");
    const detailIndex = detailUserId ? users.findIndex((user) => user.id === detailUserId) : -1;
    const previousUserId = detailIndex > 0 ? users[detailIndex - 1]?.id : undefined;
    const nextUserId = detailIndex >= 0 && detailIndex < users.length - 1 ? users[detailIndex + 1]?.id : undefined;

    useEffect(() => {
        window.localStorage.setItem(columnStorageKey, JSON.stringify([...visibleColumns]));
    }, [visibleColumns]);

    useEffect(() => {
        void listAdminUserGroups()
            .then((result) => setGroups(result.groups))
            .catch((error) => message.error(error instanceof Error ? error.message : translate("adminPages.users.usersPanel.failedToLoadUserGroups")));
    }, [message]);

    useEffect(() => {
        const sequence = ++requestSequence.current;
        setLoading(true);
        setLoadError("");
        setUsers([]);
        setTotal(0);
        void listAdminUsers({
            keyword: debouncedFilter || undefined,
            role: state.role === "all" ? undefined : state.role,
            status: state.status === "all" ? undefined : state.status,
            group: state.group === "all" ? undefined : state.group,
            page: state.page,
            pageSize: state.pageSize,
        })
            .then((result) => {
                if (sequence !== requestSequence.current) return;
                setUsers(result.users);
                setTotal(result.total);
                setSelectedUserIds([]);
                if (result.total > 0 && result.users.length === 0 && state.page > 1) update({ page: 1 }, true);
            })
            .catch((error) => {
                if (sequence !== requestSequence.current) return;
                const text = error instanceof Error ? error.message : translate("adminPages.users.usersPanel.failedToLoadUsers");
                setLoadError(text);
                message.error(text);
            })
            .finally(() => {
                if (sequence === requestSequence.current) setLoading(false);
            });
    }, [debouncedFilter, message, retry, state.group, state.page, state.pageSize, state.role, state.status, update]);

    const replaceUser = useCallback((nextUser: LocalUser) => {
        setUsers((items) => items.map((item) => item.id === nextUser.id ? { ...item, ...nextUser } : item));
        onUserChanged?.(nextUser);
    }, [onUserChanged]);

    const addUser = useCallback((user: AdminUser) => {
        setUsers((items) => [user, ...items].slice(0, state.pageSize));
        setTotal((value) => value + 1);
        onUserChanged?.(user);
        setCreateUserOpen(false);
    }, [onUserChanged, state.pageSize]);

    const toggleStatus = useCallback(async (user: AdminUser) => {
        try {
            if (user.status === "active") {
                await deleteAdminUser(user.id);
                replaceUser({ ...user, status: "disabled" });
                message.success(translate("adminPages.users.usersPanel.userDeactivatedAndSignedOut"));
                return;
            }
            const result = await updateAdminUser(user.id, { status: "active" });
            replaceUser(result.user);
            message.success(translate("adminPages.users.usersPanel.userReEnabled"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.users.usersPanel.failedToUpdateUserStatus"));
        }
    }, [message, replaceUser]);

    const columns = useMemo(() => createUserColumns({
        actorId: actor?.id,
        visibleColumns,
        groups,
        onView: (user) => setDetailUserId(user.id),
        onEdit: (user) => { setCreateUserOpen(false); setEditingUser(user); },
        onAdjustCredits: setAdjustingUser,
        onToggleStatus: toggleStatus,
    }), [actor?.id, groups, toggleStatus, visibleColumns]);

    const resetFilters = () => update({ filter: "", role: "all", status: "all", group: "all", page: 1 });

    const bulkDisable = () => {
        modal.confirm({
            title: translate("adminPages.users.usersPanel.deactivateTheSelectedUsers", { v0: String(selectedUserIds.length) }),
            content: translate("adminPages.users.usersPanel.allSessionsForTheseUsersAreClearedWhileIdentitiesTasks"),
            okText: translate("adminPages.users.usersPanel.confirmBulkDeactivation"),
            cancelText: translate("common.cancel"),
            okButtonProps: { danger: true },
            onOk: async () => {
                setBulkDisabling(true);
                try {
                    const result = await bulkDisableAdminUsers(selectedUserIds);
                    result.users.forEach(replaceUser);
                    setSelectedUserIds([]);
                    message.success(translate("adminPages.users.usersPanel.deactivatedUsers", { v0: String(result.disabledCount) }));
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("adminPages.users.usersPanel.bulkUserDeactivationFailed"));
                } finally {
                    setBulkDisabling(false);
                }
            },
        });
    };

    return (
        <>
            <AdminDataTable
                toolbar={
                    <>
                        <AdminSearchInput
                            allowClear
                            className="app-list-search"
                            prefix={<Search className="size-4 text-foreground/40" />}
                            value={state.filter}
                            aria-label={translate("adminPages.users.usersPanel.searchUsers")}
                            placeholder={translate("adminPages.users.usersPanel.searchUsernameNameOrEmail")}
                            onValueChange={(value) => update({ filter: value, page: 1 }, true)}
                        />
                    </>
                }
                toolbarActive={hasFilters}
                onReset={resetFilters}
                toolbarFilters={
                    <>
                        <Select
                            aria-label={translate("adminPages.users.usersPanel.filterUserRole")}
                            className="w-32"
                            value={state.role}
                            options={[{ value: "all", label: translate("adminPages.users.usersPanel.allRoles") }, { value: "admin", label: translate("shell.account.admin") }, { value: "user", label: translate("adminPages.users.usersPanel.regularUser") }]}
                            onChange={(role) => update({ role, page: 1 })}
                        />
                        <Select
                            aria-label={translate("adminPages.users.usersPanel.filterUserStatus")}
                            className="w-32"
                            value={state.status}
                            options={[{ value: "all", label: translate("library.ark.expiry.all") }, { value: "active", label: translate("account.layout.oss.enabled") }, { value: "disabled", label: translate("adminPages.users.usersPanel.disabled") }]}
                            onChange={(status) => update({ status, page: 1 })}
                        />
                        <Select
                            aria-label={translate("adminPages.users.usersPanel.filterUserGroup")}
                            className="w-36"
                            value={state.group}
                            options={[{ value: "all", label: translate("adminPages.users.usersPanel.allGroups") }, ...groups.map((group) => ({ value: group.code, label: group.name }))]}
                            onChange={(group) => update({ group, page: 1 })}
                        />
                    </>
                }
                trailing={
                    <div className="flex items-center gap-2">
                        <Link to="/admin/user-groups"><Button icon={<Crown className="size-4" />}>{translate("adminPages.users.usersPanel.groupManagement")}</Button></Link>
                        <Button icon={<UserPlus className="size-4" />} onClick={() => { setEditingUser(null); setCreateUserOpen(true); }}>{translate("adminPages.users.usersPanel.addUser")}</Button>
                        <Dropdown
                            trigger={["click"]}
                            popupRender={() => (
                                <div className="w-48 rounded-md border border-border bg-popover p-2 shadow-lg">
                                    <div className="px-2 pb-2 text-xs font-medium text-foreground/55">{translate("adminPages.users.usersPanel.visibleColumns")}</div>
                                    <div className="space-y-0.5">
                                        {userColumnOptions.map((option) => (
                                            <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted/60">
                                                <Checkbox
                                                    bare
                                                    checked={visibleColumns.has(option.key)}
                                                    disabled={option.locked}
                                                    onChange={(event) => setVisibleColumns((current) => {
                                                        const next = new Set(current);
                                                        if (event.target.checked) next.add(option.key);
                                                        else next.delete(option.key);
                                                        return next;
                                                    })}
                                                />
                                                {option.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        >
                            <Button icon={<Settings2 className="size-4" />}>{translate("adminPages.users.usersPanel.columnSettings")}</Button>
                        </Dropdown>
                    </div>
                }
                batchActions={<AdminBatchBar count={selectedUserIds.length} onClear={() => setSelectedUserIds([])}><Button danger size="small" icon={<Ban className="size-3.5" />} loading={bulkDisabling} onClick={bulkDisable}>{translate("adminPages.users.usersPanel.bulkDeactivate")}</Button></AdminBatchBar>}
                skeletonColumns={Math.max(4, columns.length)}
                table={{
                    className: "app-data-table admin-users-table",
                    size: "small",
                    rowKey: "id",
                    loading,
                    rowSelection: {
                        selectedRowKeys: selectedUserIds,
                        preserveSelectedRowKeys: false,
                        onChange: (keys) => setSelectedUserIds(keys.map(String)),
                        getCheckboxProps: (user) => ({ disabled: user.id === actor?.id || user.status === "disabled", name: user.displayName || user.username }),
                    },
                    columns,
                    dataSource: users,
                    pagination: false,
                    scroll: { x: 1320 },
                }}
                empty={loadError ? <div className="admin-inline-load-error" role="status"><span>{translate("adminPages.users.usersPanel.userDataIsTemporarilyUnavailable")}{loadError}</span><Button size="small" onClick={() => setRetry((value) => value + 1)}>{translate("common.retry")}</Button></div> : <AdminTableEmpty filtered={hasFilters} />}
                footer={<PaginationBar alwaysShow current={state.page} pageSize={state.pageSize} total={total} onChange={(page, pageSize) => update({ page: pageSize !== state.pageSize ? 1 : page, pageSize })} />}
            />

            <AdminUserDetailDrawer userId={detailUserId} previousUserId={previousUserId} nextUserId={nextUserId} onNavigate={setDetailUserId} onClose={() => setDetailUserId(null)} />
            <AdminUserCreateModal open={createUserOpen} groups={groups} onClose={() => setCreateUserOpen(false)} onCreated={addUser} />
            <AdminUserEditModal user={editingUser} actorId={actor?.id} groups={groups} onClose={() => setEditingUser(null)} onSaved={replaceUser} />
            <UserCreditAdjustModal user={adjustingUser} onClose={() => setAdjustingUser(null)} onAdjusted={(patch) => setUsers((items) => items.map((item) => (item.id === patch.id ? { ...item, ...patch } : item)))} />
        </>
    );
}
