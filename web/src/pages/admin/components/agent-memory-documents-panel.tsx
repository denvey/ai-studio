import { App, Button, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Select } from "@/components/ui/base/select";
import { listAdminAgentMemoryDocuments, type AdminAgentMemoryDocument } from "@/services/api/admin-agent-lessons";
import { AGENT_MEMORY_MODES, AGENT_MEMORY_SECTIONS } from "@/services/api/agent-memory";
import { AdminDataTable, AdminStatusBadge, AdminTableEmpty } from "./admin-ui";
import { useAdminUserOptions } from "./use-admin-user-options";
import { currentLocale, translate } from "@/i18n";

function ownerLabel(record: AdminAgentMemoryDocument) {
    if (record.displayName && record.username) return `${record.displayName}（${record.username}）`;
    return record.displayName || record.username || record.userId;
}

function sourceLabel(source?: string) {
    if (source === "agent") return "Agent";
    if (source === "lesson_import") return translate("admin.agentMemoryDocumentsPanel.legacyImport");
    return translate("admin.agentMemoryDocumentsPanel.users");
}

function DocumentEntries({ record }: { record: AdminAgentMemoryDocument }) {
    if (!record.entries.length) return <p className="py-2 text-xs text-muted-foreground">{translate("admin.agentMemoryDocumentsPanel.theMemoryFileIsEmpty")}</p>;
    return (
        <div className="grid gap-4 py-2 md:grid-cols-2">
            {AGENT_MEMORY_SECTIONS.map((section) => {
                const entries = record.entries.filter((entry) => entry.section === section.key);
                return (
                    <section key={section.key} aria-label={section.label} className="min-w-0">
                        <h4 className="mb-2 text-xs font-semibold">
                            {section.label}
                            <span className="ml-2 font-normal text-muted-foreground">
                                {entries.length} {translate("account.layout.pagination.item")}
                            </span>
                        </h4>
                        {entries.length ? (
                            <ul className="space-y-1.5 text-xs leading-5">
                                {entries.map((entry) => (
                                    <li key={entry.id} className="flex min-w-0 gap-2">
                                        <span className="shrink-0 text-muted-foreground">{sourceLabel(entry.source)}</span>
                                        <span className="min-w-0 [overflow-wrap:anywhere]">{entry.text}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-xs text-muted-foreground">{translate("admin.agentMemoryDocumentsPanel.noneYet")}</p>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

/** 管理员只读查看用户的长期记忆文件；修改、撤销和确认都只能由用户本人完成。 */
export default function AgentMemoryDocumentsPanel() {
    const { message } = App.useApp();
    const [items, setItems] = useState<AdminAgentMemoryDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | undefined>();
    const userOptions = useAdminUserOptions(userId);
    const seqRef = useRef(0);

    const load = useCallback(async () => {
        const seq = ++seqRef.current;
        setLoading(true);
        try {
            const data = await listAdminAgentMemoryDocuments({ userId, limit: 200 });
            if (seq !== seqRef.current) return;
            setItems(data.documents || []);
        } catch (error) {
            if (seq === seqRef.current) message.error(error instanceof Error ? error.message : translate("admin.agentMemoryDocumentsPanel.failedToLoadMemoryDocuments"));
        } finally {
            if (seq === seqRef.current) setLoading(false);
        }
    }, [message, userId]);

    useEffect(() => {
        void load();
    }, [load]);

    const columns: ColumnsType<AdminAgentMemoryDocument> = [
        {
            title: translate("admin.agentMemoryDocumentsPanel.users"),
            key: "owner",
            render: (_, record) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{ownerLabel(record)}</span>
                    <span className="text-[var(--fs-label)] opacity-60">{record.userId}</span>
                </div>
            ),
        },
        {
            title: translate("library.tasks.params.mode"),
            dataIndex: "mode",
            width: 104,
            render: (value: string) => <Tag>{AGENT_MEMORY_MODES.find((mode) => mode.value === value)?.label || value}</Tag>,
        },
        {
            title: translate("account.settings.memory.usage"),
            key: "usage",
            width: 128,
            render: (_, record) => (
                <span className="tabular-nums opacity-80">
                    {record.charCount.toLocaleString()} / {record.capacity.toLocaleString()} {translate("admin.agentMemoryDocumentsPanel.characters")}
                </span>
            ),
        },
        {
            title: translate("admin.agentMemoryDocumentsPanel.entries"),
            key: "entries",
            width: 72,
            render: (_, record) => <span className="tabular-nums opacity-80">{record.entries.length}</span>,
        },
        {
            title: translate("account.settings.memory.statusPending"),
            dataIndex: "pendingCount",
            width: 88,
            render: (value: number) => (value ? <AdminStatusBadge label={translate("admin.agentMemoryDocumentsPanel.entries2", { v0: String(value) })} tone="warning" /> : <span className="opacity-50">—</span>),
        },
        {
            title: translate("admin.agentMemoryDocumentsPanel.updatedAt"),
            dataIndex: "updatedAt",
            width: 176,
            render: (value: string) => <span className="tabular-nums opacity-80">{value ? new Date(value).toLocaleString(currentLocale(), { hour12: false }) : "--"}</span>,
        },
    ];

    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs text-foreground/60">{translate("admin.agentMemoryDocumentsPanel.eachUserHasAMemoryFileMaintainedByTheirAgent")}</p>
            <AdminDataTable
                toolbar={
                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            allowClear
                            showSearch
                            filterOption={false}
                            loading={userOptions.searching}
                            placeholder={translate("admin.agentMemoryDocumentsPanel.filterByUser")}
                            className="w-[220px]"
                            value={userId}
                            onSearch={userOptions.onSearch}
                            onChange={(value) => setUserId(value)}
                            options={userOptions.options}
                        />
                        <Button icon={<RefreshCw className="size-4" />} onClick={() => void load()}>
                            {translate("common.refresh")}
                        </Button>
                        <span className="text-xs opacity-60">
                            {translate("admin.agentMemoryDocumentsPanel.total")} {items.length} {translate("admin.agentMemoryDocumentsPanel.files")}
                            {userId ? "" : translate("admin.agentMemoryDocumentsPanel.mostRecentlyUpdatedUpTo200Files")}
                        </span>
                    </div>
                }
                table={{
                    rowKey: "userId",
                    size: "small",
                    loading,
                    columns,
                    dataSource: items,
                    expandable: { expandedRowRender: (record) => <DocumentEntries record={record} />, rowExpandable: () => true },
                    pagination: { defaultPageSize: 20, showSizeChanger: true },
                }}
                empty={<AdminTableEmpty title={translate("admin.agentMemoryDocumentsPanel.noMemoryFilesYet")} description={translate("admin.agentMemoryDocumentsPanel.createdWhenAUserFirstOpensMemorySettingsOrTheir")} />}
            />
        </div>
    );
}
