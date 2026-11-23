import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Input } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowRight, ClipboardCheck, Copyright, FolderPlus, Plus, RefreshCw, Search, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { deleteAdminArkGroup, listAdminArkGroups, type ArkExpiryStatus, type ArkGroupKind, type ArkGroupScope, type ArkPortraitGroup, type ArkPortraitSession } from "@/services/api/ark-portraits";
import { AdminDataTable, AdminFilterChip, AdminRowActions, AdminStatusBadge, AdminTableEmpty, PaginationBar } from "../../components/admin-ui";
import { Callout, Select, Tooltip } from "../../ui/controls";
import { ArkAdminCreateModal } from "./ark-admin-create-modal";
import { ArkAdminGroupDrawer } from "./ark-admin-group-drawer";
import { ARK_KIND_LABEL, ARK_SOURCE_LABEL, ArkExpiryBadge, arkGrantSummary, formatArkAdminDate } from "./ark-admin-shared";
import { translate } from "@/i18n";

type ExpiryFilter = Exclude<ArkExpiryStatus, "none">;

export const adminArkGroupsQueryKey = ["admin-ark-groups"] as const;

const ARK_KIND_ICON: Record<ArkGroupKind, LucideIcon> = { real: UserRound, virtual: Sparkles, ip: Copyright };

/** 全部素材组：用户自建与平台素材组统一管理；类型卡片即类型筛选，归属与授权状态在工具栏筛选。 */
export function ArkAdminGroupsTab({ onOpenReviews }: { onOpenReviews: () => void }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [kind, setKind] = useState<ArkGroupKind | "">("");
    const [scope, setScope] = useState<ArkGroupScope | "">("");
    const [expiry, setExpiry] = useState<ExpiryFilter | "">("");
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [creating, setCreating] = useState<{ resume?: ArkPortraitSession } | null>(null);
    const debouncedKeyword = useDebouncedValue(keyword.trim(), 250);
    const query = useQuery({
        queryKey: [...adminArkGroupsQueryKey, kind, scope, expiry, debouncedKeyword, page, pageSize],
        queryFn: ({ signal }) => listAdminArkGroups({ kind: kind || undefined, scope: scope || undefined, expiry: expiry || undefined, keyword: debouncedKeyword || undefined, page, pageSize }, signal),
        placeholderData: keepPreviousData,
    });
    const data = query.data;
    const filtered = Boolean(kind || scope || expiry || debouncedKeyword);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: adminArkGroupsQueryKey });
    const resetFilters = () => {
        setKind("");
        setScope("");
        setExpiry("");
        setKeyword("");
        setPage(1);
    };
    const toggleKind = (next: ArkGroupKind) => {
        setKind((current) => (current === next ? "" : next));
        setPage(1);
    };
    const showPagination = Boolean(data && (data.total > pageSize || page > 1));
    const stats = data?.stats;
    const pendingReview = data?.pendingReview ?? 0;

    const columns: ColumnsType<ArkPortraitGroup> = [
        {
            title: translate("library.ark.certify.groupLabel"),
            key: "name",
            render: (_, group) => {
                const Icon = ARK_KIND_ICON[group.kind] || UserRound;
                return (
                    <div className="admin-ark-group-cell">
                        <span className="admin-ark-group-avatar" aria-hidden="true">
                            <Icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium" title={group.name}>
                                    {group.name}
                                </span>
                                {group.available === false ? (
                                    <AdminStatusBadge
                                        label={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.unavailable")}
                                        tone="error"
                                        title={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.theAdministratorChangedTheSiteRegionOrProjectThisAsset")}
                                    />
                                ) : null}
                            </div>
                            <div className="admin-ark-group-id" title={group.groupId}>
                                {group.groupId}
                            </div>
                        </div>
                    </div>
                );
            },
        },
        {
            title: translate("account.settings.runninghub.kind"),
            key: "kind",
            width: 128,
            render: (_, group) => <ArkStackedCell primary={ARK_KIND_LABEL[group.kind]} secondary={ARK_SOURCE_LABEL[group.source] || group.source} />,
        },
        {
            title: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.ownership"),
            key: "scope",
            width: 190,
            render: (_, group) =>
                group.scope === "platform" ? (
                    <ArkStackedCell
                        primary={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.platformAssetGroup")}
                        secondary={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.authorization2", { v0: String(arkGrantSummary(group)) })}
                    />
                ) : (
                    <ArkStackedCell
                        primary={group.owner?.displayName || group.owner?.username || "-"}
                        secondary={group.owner?.displayName && group.owner.username ? group.owner.username : translate("adminPages.settings.arkAssets.arkAdminGroupsTab.userCreated")}
                    />
                ),
        },
        {
            title: translate("nav.tools.assets"),
            key: "assets",
            width: 150,
            render: (_, group) => {
                const counts = group.assetCounts || {};
                return (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="admin-ark-count">
                            <strong>{counts.active || 0}</strong> {translate("adminPages.settings.arkAssets.arkAdminGroupsTab.approved")}
                        </span>
                        {counts.pending_review ? <AdminStatusBadge label={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.awaitingReview", { v0: String(counts.pending_review) })} tone="warning" /> : null}
                        {counts.processing ? <AdminStatusBadge label={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.underReview", { v0: String(counts.processing) })} tone="info" /> : null}
                    </div>
                );
            },
        },
        { title: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.authorization"), key: "expiry", width: 180, render: (_, group) => <ArkExpiryBadge group={group} /> },
        { title: translate("library.tasks.detail.createdAt"), key: "createdAt", width: 112, render: (_, group) => <span className="admin-ark-muted">{formatArkAdminDate(group.createdAt)}</span> },
        {
            title: translate("account.settings.runninghub.actions"),
            key: "actions",
            width: 120,
            render: (_, group) => (
                <AdminRowActions
                    primary={{ label: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.view"), onClick: () => setDetailId(group.id) }}
                    actions={[
                        {
                            key: "delete",
                            label: translate("common.delete"),
                            danger: true,
                            confirm: {
                                title: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.deleteAssetGroup", { v0: String(group.name) }),
                                description: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.theArkAssetGroupAndAllItsAssetsWillAlso"),
                                okText: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.deleteAssetGroup2"),
                            },
                            onClick: async () => {
                                try {
                                    await deleteAdminArkGroup(group.id);
                                    message.success(translate("adminPages.settings.arkAssets.arkAdminGroupsTab.assetGroupDeleted"));
                                    refresh();
                                } catch (error) {
                                    message.error(error instanceof Error ? error.message : translate("library.picker.deleteFailed"));
                                }
                            },
                        },
                    ]}
                />
            ),
        },
    ];

    const expiryDetail = stats ? (
        stats.expiring || stats.expired ? (
            <>
                {stats.expiring ? (
                    <span className="is-warning">
                        {stats.expiring} {translate("adminPages.settings.arkAssets.arkAdminGroupsTab.expiringWithin30Days")}
                    </span>
                ) : null}
                {stats.expiring && stats.expired ? " · " : null}
                {stats.expired ? (
                    <span className="is-error">
                        {stats.expired} {translate("adminPages.settings.arkAssets.arkAdminGroupsTab.expired")}
                    </span>
                ) : null}
            </>
        ) : (
            translate("adminPages.settings.arkAssets.arkAdminGroupsTab.allAuthorizationsAreValid")
        )
    ) : null;

    return (
        <div className="admin-ark-groups">
            <div className="admin-ark-stats" role="group" aria-label={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.assetGroupOverviewClickATypeCardToFilter")}>
                <ArkStatCard icon={UserRound} label={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.humanAssetGroups")} value={stats?.real} detail={expiryDetail} active={kind === "real"} onClick={() => toggleKind("real")} />
                <ArkStatCard
                    icon={Sparkles}
                    label={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.virtualAssetGroups")}
                    value={stats?.virtual}
                    detail={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.aIGeneratedOrDrawnVirtualCharacters")}
                    active={kind === "virtual"}
                    onClick={() => toggleKind("virtual")}
                />
                <ArkStatCard
                    icon={Copyright}
                    label={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.copyrightedIPAssetGroups")}
                    value={stats?.ip}
                    detail={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.createdAndAuthorizedByAdminsOnly")}
                    active={kind === "ip"}
                    onClick={() => toggleKind("ip")}
                />
                <ArkStatCard
                    icon={ClipboardCheck}
                    label={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.uploadsAwaitingReview")}
                    value={data ? pendingReview : undefined}
                    tone={pendingReview ? "warning" : undefined}
                    detail={
                        pendingReview ? (
                            <span className="admin-ark-stat-link">
                                {translate("adminPages.settings.arkAssets.arkAdminGroupsTab.reviewUploads")} <ArrowRight className="size-3" aria-hidden="true" />
                            </span>
                        ) : (
                            translate("adminPages.settings.arkAssets.arkAdminGroupsTab.noneAwaitingReview")
                        )
                    }
                    onClick={onOpenReviews}
                />
            </div>

            {data?.sessions.length ? (
                <Callout tone="info" title={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.platformIdentityVerificationsInProgress")}>
                    <div className="flex flex-wrap gap-2 pt-1">
                        {data.sessions.map((session) => (
                            <Button key={session.id} size="small" onClick={() => setCreating({ resume: session })}>
                                {translate("adminPages.settings.arkAssets.arkAdminGroupsTab.verificationLinkExpires", { name: session.name, expires: formatArkAdminDate(session.expiresAt, true) })}
                            </Button>
                        ))}
                    </div>
                </Callout>
            ) : null}

            <AdminDataTable<ArkPortraitGroup>
                toolbar={
                    <Input
                        allowClear
                        className="admin-ark-search"
                        prefix={<Search className="size-4 opacity-40" />}
                        placeholder={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.searchNameOrArkAssetGroupID")}
                        value={keyword}
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                    />
                }
                toolbarActive={filtered}
                toolbarFilters={
                    <>
                        <Select<ArkGroupScope | "">
                            ariaLabel={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.assetGroupOwnership")}
                            value={scope}
                            onChange={(value) => {
                                setScope(value);
                                setPage(1);
                            }}
                            options={[
                                { value: "", label: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.allOwners") },
                                { value: "user", label: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.userCreated") },
                                { value: "platform", label: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.platformAssetGroup") },
                            ]}
                        />
                        <Select<ExpiryFilter | "">
                            ariaLabel={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.authorizationStatus")}
                            value={expiry}
                            onChange={(value) => {
                                setExpiry(value);
                                setPage(1);
                            }}
                            options={[
                                { value: "", label: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.allAuthorizationStatuses") },
                                { value: "valid", label: translate("library.ark.expiry.valid") },
                                { value: "expiring", label: translate("adminPages.settings.arkAssets.arkAdminGroupsTab.expiringWithin30Days2") },
                                { value: "expired", label: translate("library.ark.expiry.expired") },
                            ]}
                        />
                    </>
                }
                toolbarActiveFilters={kind ? <AdminFilterChip label={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.type", { v0: String(ARK_KIND_LABEL[kind]) })} onRemove={() => toggleKind(kind)} /> : undefined}
                onReset={resetFilters}
                trailing={
                    <>
                        <Tooltip title={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.refreshList")}>
                            <Button aria-label={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.refreshList")} icon={<RefreshCw className="size-4" />} loading={query.isFetching} onClick={refresh} />
                        </Tooltip>
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreating({})}>
                            {translate("adminPages.settings.arkAssets.arkAdminGroupsTab.createPlatformAssetGroup")}
                        </Button>
                    </>
                }
                table={{ rowKey: "id", columns, dataSource: data?.items || [], loading: query.isLoading, pagination: false, size: "middle", scroll: data?.items.length ? { x: 980 } : undefined }}
                empty={
                    filtered ? (
                        <AdminTableEmpty filtered action={<Button onClick={resetFilters}>{translate("account.layout.state.clearFilters")}</Button>} />
                    ) : (
                        <div className="admin-ark-empty-state">
                            <span className="admin-ark-empty-icon" aria-hidden="true">
                                <FolderPlus className="size-5" />
                            </span>
                            <h3>{translate("library.ark.empty.owned")}</h3>
                            <p>{translate("adminPages.settings.arkAssets.arkAdminGroupsTab.userCreatedHumanAndVirtualAssetGroupsAndAdminCreated")}</p>
                            <Button icon={<Plus className="size-4" />} onClick={() => setCreating({})}>
                                {translate("adminPages.settings.arkAssets.arkAdminGroupsTab.createPlatformAssetGroup")}
                            </Button>
                        </div>
                    )
                }
                footer={
                    data && showPagination ? (
                        <PaginationBar
                            current={page}
                            pageSize={pageSize}
                            total={data.total}
                            onChange={(nextPage, nextSize) => {
                                setPage(nextSize !== pageSize ? 1 : nextPage);
                                setPageSize(nextSize);
                            }}
                            itemLabel={translate("adminPages.settings.arkAssets.arkAdminGroupsTab.groups")}
                        />
                    ) : null
                }
            />
            <ArkAdminGroupDrawer groupId={detailId} onClose={() => setDetailId(null)} onChanged={refresh} />
            <ArkAdminCreateModal
                open={Boolean(creating)}
                resume={creating?.resume}
                onClose={() => setCreating(null)}
                onCreated={(arkGroupId) => {
                    refresh();
                    if (!arkGroupId) return;
                    setCreating(null);
                }}
            />
        </div>
    );
}

/** 概览卡片：传 active 时是类型筛选开关（aria-pressed），否则是跳转按钮。 */
function ArkStatCard({ icon: Icon, label, value, detail, active, tone, onClick }: { icon: LucideIcon; label: string; value?: number; detail?: ReactNode; active?: boolean; tone?: "warning"; onClick: () => void }) {
    return (
        <button type="button" className={cn("admin-ark-stat", active && "is-active", tone && `is-${tone}`)} aria-pressed={active} onClick={onClick}>
            <span className="admin-ark-stat-head">
                <span className="admin-ark-stat-icon" aria-hidden="true">
                    <Icon className="size-4" />
                </span>
                <span className="admin-ark-stat-label">{label}</span>
                {active ? <span className="admin-ark-stat-flag">{translate("adminPages.settings.arkAssets.arkAdminGroupsTab.filtersActive")}</span> : null}
            </span>
            <span className="admin-ark-stat-value">{value ?? "–"}</span>
            <span className="admin-ark-stat-detail">{detail}</span>
        </button>
    );
}

function ArkStackedCell({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="truncate">{primary}</div>
            {secondary ? <div className="admin-ark-muted truncate">{secondary}</div> : null}
        </div>
    );
}
