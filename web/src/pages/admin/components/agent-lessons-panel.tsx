import { App, Button, Input, Space, Tag } from "antd";
import { AntTooltip as Tooltip } from "@/components/ui/base/tooltip/ant-tooltip";
import type { ColumnsType } from "antd/es/table";
import { RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { agentLessonCategoryLabel, deleteAdminAgentLesson, listAdminAgentLessons, type AdminAgentLesson } from "@/services/api/admin-agent-lessons";
import { AdminDataTable, AdminStatusBadge, AdminTableEmpty } from "./admin-ui";
import { useAdminUserOptions } from "./use-admin-user-options";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

function authorLabel(record: AdminAgentLesson) {
    if (record.authorDisplayName && record.authorUsername) return `${record.authorDisplayName}（${record.authorUsername}）`;
    return record.authorDisplayName || record.authorUsername || record.authorUserId || translate("admin.agentLessonsPanel.unknownUser");
}

export default function AgentLessonsPanel() {
    const { message, modal } = App.useApp();
    const [items, setItems] = useState<AdminAgentLesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<string>("all");
    const [keyword, setKeyword] = useState("");
    const [userId, setUserId] = useState<string | undefined>();
    const userOptions = useAdminUserOptions(userId);
    const debouncedKeyword = useDebouncedValue(keyword.trim(), 250);
    const seqRef = useRef(0);

    const load = useCallback(async () => {
        const seq = ++seqRef.current;
        setLoading(true);
        try {
            const data = await listAdminAgentLessons({
                status: status === "all" ? undefined : status,
                userId,
                keyword: debouncedKeyword || undefined,
                limit: 100,
            });
            if (seq !== seqRef.current) return;
            setItems(data.lessons || []);
        } catch (error) {
            if (seq === seqRef.current) message.error(error instanceof Error ? error.message : translate("admin.agentLessonsPanel.failedToLoadMemories"));
        } finally {
            if (seq === seqRef.current) setLoading(false);
        }
    }, [debouncedKeyword, message, status, userId]);

    useEffect(() => {
        void load();
    }, [load]);

    const remove = (record: AdminAgentLesson) => {
        modal.confirm({
            title: translate("admin.agentLessonsPanel.delete", { v0: String(record.topic) }),
            content: translate("admin.agentLessonsPanel.thisIsALegacyLessonRecordForDeletionRemovesOnly", { v0: String(authorLabel(record)) }),
            okText: translate("common.delete"),
            okButtonProps: { danger: true },
            onOk: async () => {
                await deleteAdminAgentLesson(record.id);
                message.success(translate("canvasB.historyDrawer.deleted"));
                await load();
            },
        });
    };

    const columns: ColumnsType<AdminAgentLesson> = [
        {
            title: translate("admin.agentLessonsPanel.users"),
            key: "author",
            width: 168,
            render: (_, record) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{authorLabel(record)}</span>
                    {record.authorUserId ? <span className="text-[var(--fs-label)] opacity-60">{record.authorUserId}</span> : null}
                </div>
            ),
        },
        {
            title: translate("library.picker.category"),
            dataIndex: "category",
            width: 92,
            render: (value: string) => <Tag>{agentLessonCategoryLabel(value)}</Tag>,
        },
        {
            title: translate("admin.agentLessonsPanel.topic"),
            dataIndex: "topic",
            width: 180,
            render: (value: string, record) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{value}</span>
                    {record.source ? <span className="text-[var(--fs-label)] opacity-60">{translate("admin.agentLessonsPanel.source")}{record.source}</span> : null}
                </div>
            ),
        },
        {
            title: translate("admin.agentLessonsPanel.whenToUseApproach"),
            dataIndex: "situation",
            render: (_: string, record) => {
                const steps = record.steps || [];
                return (
                    <div className="flex flex-col gap-1 text-xs">
                        <span className="opacity-80">{record.situation}</span>
                        {record.lesson ? <span>{record.lesson}</span> : null}
                        {steps.length ? (
                            <ol className="ml-4 list-decimal space-y-0.5 opacity-80">
                                {steps.map((step, index) => (
                                    <li key={`${record.id}-${index}`}>
                                        <span className="font-medium">{step.tool}</span>
                                        {" — "}
                                        {step.action}
                                        {step.note ? <span className="opacity-60">（{step.note}）</span> : null}
                                    </li>
                                ))}
                            </ol>
                        ) : null}
                    </div>
                );
            },
        },
        {
            title: translate("library.tasks.detail.status"),
            dataIndex: "status",
            width: 96,
            render: (value: string) => <AdminStatusBadge label={value === "approved" ? translate("admin.agentLessonsPanel.approved") : value === "rejected" ? translate("account.settings.memory.statusRejected") : translate("admin.agentLessonsPanel.pendingReview")} tone={value === "approved" ? "success" : value === "rejected" ? "error" : "warning"} />,
        },
        {
            title: (
                <Tooltip title={translate("admin.agentLessonsPanel.numberOfTimesIncludedInThisUserSAgentContext")}>
                    <span>{translate("admin.agentLessonsPanel.contextInsertions")}</span>
                </Tooltip>
            ),
            dataIndex: "injected",
            width: 64,
            render: (value: number) => <span className="tabular-nums opacity-80">{value ?? 0}</span>,
        },
        {
            title: (
                <Tooltip title={translate("admin.agentLessonsPanel.numberOfFullTextLookupsThroughTheFormerRecallLessons")}>
                    <span>{translate("admin.agentLessonsPanel.lookups")}</span>
                </Tooltip>
            ),
            dataIndex: "hits",
            width: 64,
            render: (value: number) => <span className="tabular-nums opacity-80">{value ?? 0}</span>,
        },
        {
            title: translate("account.settings.runninghub.actions"),
            key: "actions",
            width: 72,
            render: (_, record) => (
                <Space size={4}>
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => remove(record)} />
                </Space>
            ),
        },
    ];

    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs text-foreground/60">{translate("admin.agentLessonsPanel.legacyLessonsAreNoLongerAddedToAgentContextOr")}</p>
            <AdminDataTable
                toolbar={
                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={status}
                            onChange={setStatus}
                            className="w-[120px]"
                            options={[
                                { label: translate("canvasA.toolPicker.all"), value: "all" },
                                { label: translate("admin.agentLessonsPanel.pendingReview"), value: "pending" },
                                { label: translate("admin.agentLessonsPanel.approved"), value: "approved" },
                                { label: translate("account.settings.memory.statusRejected"), value: "rejected" },
                            ]}
                        />
                        <Select
                            allowClear
                            showSearch
                            filterOption={false}
                            loading={userOptions.searching}
                            placeholder={translate("admin.agentLessonsPanel.filterByUser")}
                            className="w-[220px]"
                            value={userId}
                            onSearch={userOptions.onSearch}
                            onChange={(value) => setUserId(value)}
                            options={userOptions.options}
                        />
                        <Input.Search allowClear placeholder={translate("admin.agentLessonsPanel.topicContentOrUsername")} className="w-[220px]" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                        <Button icon={<RefreshCw className="size-4" />} onClick={() => void load()}>
                            {translate("common.refresh")}
                        </Button>
                        <span className="text-xs opacity-60">{translate("admin.agentLessonsPanel.total")} {items.length} {translate("account.layout.pagination.item")}</span>
                    </div>
                }
                table={{
                    rowKey: "id",
                    size: "small",
                    loading,
                    columns,
                    dataSource: items,
                    pagination: { defaultPageSize: 20, showSizeChanger: true },
                }}
                empty={<AdminTableEmpty title={translate("admin.agentLessonsPanel.noMatchingLegacyLessons")} description={translate("admin.agentLessonsPanel.tryAnotherUserOrKeywordViewNewMemoryContentUnder")} />}
            />
        </div>
    );
}
