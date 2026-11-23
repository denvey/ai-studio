import { useEffect, useState, useCallback } from "react";
import { App, Button, Input, Popconfirm, Select, Space, Table, Tag, Image as AntImage, Segmented } from "antd";
import { AdminDrawer, AdminModal } from "@/pages/admin/ui/overlays";
import type { ColumnsType } from "antd/es/table";
import { AlertCircle, Archive, ArchiveRestore, Bug, CheckCircle2, Clock, FileText, Inbox, Lightbulb, MessageSquare, Paperclip, Play, RefreshCw, Search, Send, UserRound, Clock3 } from "lucide-react";

import { getAdminFeedbacks, updateAdminFeedback, archiveAdminFeedback, type FeedbackItem, type FeedbackType, type FeedbackStatus, type FeedbackAttachment } from "@/services/api/feedback";
import { adminResourceFileUrl } from "@/services/api/admin-storage";
import { AdminPageFrame } from "../components/admin-shell";
import { cn } from "@/lib/utils";
import { currentLocale, translate } from "@/i18n";

export default function AdminFeedbacksPage() {
    const { message } = App.useApp();

    const [loading, setLoading] = useState(false);
    const [list, setList] = useState<FeedbackItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(15);

    // Filters
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [archivedTab, setArchivedTab] = useState<"active" | "archived" | "all">("active");
    const [keyword, setKeyword] = useState<string>("");

    // Detail drawer
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
    const [replyText, setReplyText] = useState("");
    const [statusChange, setStatusChange] = useState<FeedbackStatus>("pending");
    const [saving, setSaving] = useState(false);

    // Video preview modal
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getAdminFeedbacks({
                type: typeFilter,
                status: statusFilter,
                archived: archivedTab === "all" ? "all" : archivedTab === "archived",
                keyword: keyword.trim() || undefined,
                page,
                limit,
            });
            setList(res.list);
            setTotal(res.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.feedbacks.feedbacksPage.failedToLoadFeedback"));
        } finally {
            setLoading(false);
        }
    }, [typeFilter, statusFilter, archivedTab, keyword, page, limit, message]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleOpenDetail = (item: FeedbackItem) => {
        setSelectedItem(item);
        setReplyText(item.adminReply || "");
        setStatusChange(item.status);
        setDrawerOpen(true);
    };

    const handleSaveReply = async () => {
        if (!selectedItem) return;
        setSaving(true);
        try {
            const updated = await updateAdminFeedback(selectedItem.id, {
                status: statusChange,
                adminReply: replyText.trim(),
            });
            message.success(translate("adminPages.feedbacks.feedbacksPage.feedbackStatusAndReplyUpdated"));
            setSelectedItem(updated);
            // Refresh list in place
            setList((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.feedbacks.feedbacksPage.updateFailed"));
        } finally {
            setSaving(false);
        }
    };

    const handleArchive = async (id: string, archive: boolean) => {
        try {
            const updated = await archiveAdminFeedback(id, archive);
            message.success(archive ? translate("adminPages.feedbacks.feedbacksPage.feedbackMovedToArchive") : translate("adminPages.feedbacks.feedbacksPage.feedbackRestoredFromArchiveToActive"));
            if (selectedItem?.id === id) {
                setSelectedItem(updated);
            }
            void loadData();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("library.tasks.page.actionFailed"));
        }
    };

    // Calculate metrics
    const pendingCount = list.filter((i) => i.status === "pending" && !i.archived).length;
    const processingCount = list.filter((i) => i.status === "processing" && !i.archived).length;
    const resolvedCount = list.filter((i) => i.status === "resolved" && !i.archived).length;
    const archivedCount = list.filter((i) => i.archived).length;

    const typeConfig: Record<FeedbackType, { label: string; color: string; icon: typeof Bug }> = {
        bug: { label: translate("adminPages.feedbacks.feedbacksPage.bugReport"), color: "error", icon: Bug },
        feature: { label: translate("adminPages.feedbacks.feedbacksPage.featureProposal"), color: "processing", icon: Lightbulb },
        improvement: { label: translate("adminPages.feedbacks.feedbacksPage.usabilitySuggestion"), color: "cyan", icon: Lightbulb },
        other: { label: translate("account.feedback.types.other"), color: "default", icon: MessageSquare },
    };

    const statusConfig: Record<string, { label: string; tagColor: string }> = {
        pending: { label: translate("account.feedback.status.pending"), tagColor: "orange" },
        processing: { label: translate("account.feedback.status.processing"), tagColor: "blue" },
        resolved: { label: translate("adminPages.feedbacks.feedbacksPage.resolved"), tagColor: "green" },
        closed: { label: translate("adminPages.feedbacks.feedbacksPage.disabled"), tagColor: "default" },
        archived: { label: translate("account.feedback.archived"), tagColor: "default" },
    };

    const columns: ColumnsType<FeedbackItem> = [
        {
            title: translate("account.settings.runninghub.kind"),
            dataIndex: "type",
            key: "type",
            width: 100,
            render: (val: FeedbackType) => {
                const conf = typeConfig[val] || typeConfig.other;
                const Icon = conf.icon;
                return (
                    <Tag color={conf.color} className="flex items-center gap-1 w-fit m-0 text-xs">
                        <Icon className="size-3" />
                        <span>{conf.label}</span>
                    </Tag>
                );
            },
        },
        {
            title: translate("adminPages.feedbacks.feedbacksPage.titleAndFeedbackDescription"),
            dataIndex: "title",
            key: "title",
            render: (_: unknown, record: FeedbackItem) => {
                let attCount = 0;
                try {
                    if (record.attachments) {
                        attCount = JSON.parse(record.attachments).length;
                    }
                } catch {}

                return (
                    <div className="space-y-1 py-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground hover:text-primary cursor-pointer" onClick={() => handleOpenDetail(record)}>
                                {record.title}
                            </span>
                            {record.archived ? <Tag className="text-[var(--fs-label)] px-2 m-0 bg-muted/60 text-muted-foreground border-border/60">{translate("account.feedback.archived")}</Tag> : null}
                            {attCount > 0 ? (
                                <Tag className="text-[var(--fs-label)] px-1 m-0 flex items-center gap-0.5 border-dashed">
                                    <Paperclip className="size-2.5" />
                                    <span>
                                        {attCount} {translate("adminPages.feedbacks.feedbacksPage.attachments")}
                                    </span>
                                </Tag>
                            ) : null}
                            {record.adminReply ? (
                                <Tag color="blue" className="text-[var(--fs-label)] px-1 m-0 flex items-center gap-0.5">
                                    <CheckCircle2 className="size-2.5" />
                                    <span>{translate("adminPages.feedbacks.feedbacksPage.replied")}</span>
                                </Tag>
                            ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 max-w-xl">{record.content}</p>
                    </div>
                );
            },
        },
        {
            title: translate("adminPages.feedbacks.feedbacksPage.submittedBy"),
            key: "user",
            width: 150,
            render: (_: unknown, record: FeedbackItem) => (
                <div className="text-xs space-y-0.5">
                    <div className="font-medium text-foreground">{record.userName || translate("adminPages.feedbacks.feedbacksPage.anonymous")}</div>
                    {record.contact ? (
                        <div className="text-[var(--fs-label)] text-muted-foreground truncate max-w-[140px]" title={record.contact}>
                            {record.contact}
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: translate("library.tasks.detail.status"),
            dataIndex: "status",
            key: "status",
            width: 110,
            render: (val: string, record: FeedbackItem) => {
                const conf = statusConfig[val] || { label: val, tagColor: "default" };
                return (
                    <div className="flex items-center gap-1">
                        <Tag color={conf.tagColor} className="m-0 text-xs font-medium">
                            {conf.label}
                        </Tag>
                    </div>
                );
            },
        },
        {
            title: translate("adminPages.feedbacks.feedbacksPage.submittedAt"),
            dataIndex: "createdAt",
            key: "createdAt",
            width: 150,
            render: (timeStr: string) => (
                <span className="text-xs text-muted-foreground">
                    {new Date(timeStr).toLocaleString(currentLocale(), {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </span>
            ),
        },
        {
            title: translate("account.settings.runninghub.actions"),
            key: "action",
            width: 160,
            render: (_: unknown, record: FeedbackItem) => (
                <Space size="small">
                    <Button size="small" type="link" onClick={() => handleOpenDetail(record)}>
                        {translate("adminPages.feedbacks.feedbacksPage.detailsAndReply")}
                    </Button>
                    <Popconfirm
                        title={record.archived ? translate("adminPages.feedbacks.feedbacksPage.moveThisFeedbackOutOfTheArchive") : translate("adminPages.feedbacks.feedbacksPage.archiveThisFeedback")}
                        description={record.archived ? translate("adminPages.feedbacks.feedbacksPage.itWillReturnToTheActiveInboxForFollowUp") : translate("adminPages.feedbacks.feedbacksPage.archivedFeedbackRemainsAvailableInFullToBothTheUser")}
                        onConfirm={() => handleArchive(record.id, !record.archived)}
                        okText={record.archived ? translate("adminPages.feedbacks.feedbacksPage.unarchive") : translate("adminPages.feedbacks.feedbacksPage.archive")}
                        cancelText={translate("common.cancel")}
                    >
                        <Button size="small" type="text" icon={record.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />} className={cn(record.archived ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                            {record.archived ? translate("adminPages.feedbacks.feedbacksPage.unarchive") : translate("adminPages.feedbacks.feedbacksPage.archive")}
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    let selectedAttachments: FeedbackAttachment[] = [];
    try {
        if (selectedItem?.attachments) selectedAttachments = JSON.parse(selectedItem.attachments);
    } catch {}

    let selectedEnv: Record<string, string> = {};
    try {
        if (selectedItem?.environment) selectedEnv = JSON.parse(selectedItem.environment);
    } catch {}

    return (
        <AdminPageFrame title={translate("adminPages.feedbacks.feedbacksPage.userFeedbackInbox")} description={translate("adminPages.feedbacks.feedbacksPage.reviewBugReportsFeatureProposalsAndUsabilitySuggestionsFromAll")} scroll>
            <div className="space-y-4">
                {/* Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-border/70 bg-card p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground">{translate("adminPages.feedbacks.feedbacksPage.currentListCount")}</p>
                            <p className="text-xl font-semibold text-foreground mt-0.5">{total}</p>
                        </div>
                        <Inbox className="size-5 text-primary opacity-60" />
                    </div>
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-orange-600 dark:text-orange-400">{translate("account.feedback.status.pending")}</p>
                            <p className="text-xl font-semibold text-orange-600 dark:text-orange-400 mt-0.5">{pendingCount}</p>
                        </div>
                        <Clock className="size-5 text-orange-500 opacity-60" />
                    </div>
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-blue-600 dark:text-blue-400">{translate("account.feedback.status.processing")}</p>
                            <p className="text-xl font-semibold text-blue-600 dark:text-blue-400 mt-0.5">{processingCount}</p>
                        </div>
                        <Clock3 className="size-5 text-blue-500 opacity-60" />
                    </div>
                    <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-green-600 dark:text-green-400">{translate("adminPages.feedbacks.feedbacksPage.resolvedAccepted")}</p>
                            <p className="text-xl font-semibold text-green-600 dark:text-green-400 mt-0.5">{resolvedCount}</p>
                        </div>
                        <CheckCircle2 className="size-5 text-green-500 opacity-60" />
                    </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented
                            value={archivedTab}
                            onChange={(v) => {
                                setArchivedTab(v as "active" | "archived" | "all");
                                setPage(1);
                            }}
                            options={[
                                { label: translate("adminPages.feedbacks.feedbacksPage.activeFeedback"), value: "active" },
                                { label: translate("adminPages.feedbacks.feedbacksPage.archive2"), value: "archived" },
                                { label: translate("adminPages.feedbacks.feedbacksPage.allFeedback"), value: "all" },
                            ]}
                            className="bg-muted/40"
                        />
                        <Input
                            placeholder={translate("adminPages.feedbacks.feedbacksPage.searchTitleContentUserOrContactInformation")}
                            prefix={<Search className="size-3.5 text-muted-foreground mr-1" />}
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            onPressEnter={() => {
                                setPage(1);
                                void loadData();
                            }}
                            allowClear
                            className="w-56 h-8 text-xs"
                        />
                        <Select
                            value={typeFilter}
                            onChange={(v) => {
                                setTypeFilter(v);
                                setPage(1);
                            }}
                            className="w-28 h-8 text-xs"
                            options={[
                                { label: translate("library.tasks.page.allKinds"), value: "all" },
                                { label: translate("adminPages.feedbacks.feedbacksPage.bugReport"), value: "bug" },
                                { label: translate("adminPages.feedbacks.feedbacksPage.featureProposal"), value: "feature" },
                                { label: translate("adminPages.feedbacks.feedbacksPage.usabilitySuggestion"), value: "improvement" },
                                { label: translate("adminPages.feedbacks.feedbacksPage.otherSuggestions"), value: "other" },
                            ]}
                        />
                        <Select
                            value={statusFilter}
                            onChange={(v) => {
                                setStatusFilter(v);
                                setPage(1);
                            }}
                            className="w-28 h-8 text-xs"
                            options={[
                                { label: translate("library.ark.expiry.all"), value: "all" },
                                { label: translate("account.feedback.status.pending"), value: "pending" },
                                { label: translate("account.feedback.status.processing"), value: "processing" },
                                { label: translate("adminPages.feedbacks.feedbacksPage.resolved"), value: "resolved" },
                                { label: translate("adminPages.feedbacks.feedbacksPage.disabled"), value: "closed" },
                            ]}
                        />
                        <Button
                            size="small"
                            type="primary"
                            onClick={() => {
                                setPage(1);
                                void loadData();
                            }}
                        >
                            {translate("adminPages.feedbacks.feedbacksPage.search")}
                        </Button>
                    </div>

                    <Button size="small" icon={<RefreshCw className={cn("size-3.5", loading && "animate-spin")} />} onClick={() => void loadData()}>
                        {translate("common.refresh")}
                    </Button>
                </div>

                {/* Feedback Table */}
                <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
                    <Table
                        columns={columns}
                        dataSource={list}
                        rowKey="id"
                        loading={loading}
                        size="small"
                        pagination={{
                            current: page,
                            pageSize: limit,
                            total,
                            showSizeChanger: true,
                            pageSizeOptions: ["15", "30", "50"],
                            onChange: (p, l) => {
                                setPage(p);
                                setLimit(l);
                            },
                        }}
                    />
                </div>
            </div>

            {/* Detail & Reply Drawer */}
            <AdminDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                width={560}
                title={
                    <div className="flex items-center gap-2">
                        <FileText className="size-4 text-primary" />
                        <span className="font-semibold text-sm">{translate("adminPages.feedbacks.feedbacksPage.feedbackDetailsAndResponse")}</span>
                    </div>
                }
            >
                {selectedItem ? (
                    <div className="space-y-4 text-xs">
                        {/* Meta */}
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm text-foreground">{selectedItem.title}</span>
                                <div className="flex items-center gap-2">
                                    {selectedItem.archived ? <Tag className="m-0 text-xs bg-muted/80 text-muted-foreground border-border/80">{translate("account.feedback.archived")}</Tag> : null}
                                    <Tag color={statusConfig[selectedItem.status]?.tagColor || "default"} className="m-0 text-xs">
                                        {statusConfig[selectedItem.status]?.label || selectedItem.status}
                                    </Tag>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1 border-t border-border/40 text-[var(--fs-label)]">
                                <div>
                                    {translate("adminPages.feedbacks.feedbacksPage.submittedBy2")}
                                    <span className="text-foreground">{selectedItem.userName}</span>
                                </div>
                                <div>
                                    {translate("adminPages.feedbacks.feedbacksPage.contact")}
                                    <span className="text-foreground">{selectedItem.contact || translate("adminPages.feedbacks.feedbacksPage.notFilledIn")}</span>
                                </div>
                                <div>
                                    {translate("adminPages.feedbacks.feedbacksPage.feedbackType")}
                                    <span className="text-foreground">{typeConfig[selectedItem.type]?.label || selectedItem.type}</span>
                                </div>
                                <div>
                                    {translate("adminPages.feedbacks.feedbacksPage.submittedAt2")}
                                    <span className="text-foreground">{new Date(selectedItem.createdAt).toLocaleString(currentLocale())}</span>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div>
                            <label className="block text-xs font-semibold text-foreground mb-2">{translate("adminPages.feedbacks.feedbacksPage.feedbackDescription")}</label>
                            <div className="rounded-xl border border-border/70 bg-muted/10 p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">{selectedItem.content}</div>
                        </div>

                        {/* Attachments */}
                        {selectedAttachments.length > 0 ? (
                            <div>
                                <label className="block text-xs font-semibold text-foreground mb-2">
                                    {translate("adminPages.feedbacks.feedbacksPage.attachments2")}
                                    {selectedAttachments.length})
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {selectedAttachments.map((att) => {
                                        // att.url 是提交者本人的 /api/resources/:id/file，管理员会被资源归属校验拒绝，后台改走管理员资源接口。
                                        const fileUrl = adminResourceFileUrl(att.id);
                                        return (
                                            <div key={att.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/25 p-2">
                                                {att.type === "image" ? (
                                                    <AntImage src={fileUrl} alt={att.name} width={36} height={36} className="rounded object-cover" />
                                                ) : (
                                                    <button type="button" onClick={() => setPreviewVideoUrl(fileUrl)} className="size-9 rounded bg-black/70 flex items-center justify-center text-primary hover:bg-black transition-colors">
                                                        <Play className="size-4 fill-current ml-0.5" />
                                                    </button>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-xs font-medium" title={att.name}>
                                                        {att.name}
                                                    </p>
                                                    <p className="text-[var(--fs-label)] text-muted-foreground">{(att.size / (1024 * 1024)).toFixed(1)} MB</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

                        {/* Environment Info */}
                        {Object.keys(selectedEnv).length > 0 ? (
                            <details className="rounded-lg border border-border/50 bg-muted/10 p-2 text-[var(--fs-label)] text-muted-foreground">
                                <summary className="cursor-pointer font-medium hover:text-foreground">{translate("adminPages.feedbacks.feedbacksPage.clientDiagnosticEnvironmentSnapshot")}</summary>
                                <div className="mt-2 space-y-1 font-mono text-[var(--fs-label)] bg-black/20 p-2 rounded">
                                    {Object.entries(selectedEnv).map(([k, v]) => (
                                        <div key={k} className="flex gap-2">
                                            <span className="text-muted-foreground">{k}:</span>
                                            <span className="text-foreground/80 break-all">{v}</span>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        ) : null}

                        {/* Admin Action & Reply Section */}
                        <div className="border-t border-border/60 pt-4 space-y-3">
                            <h4 className="font-semibold text-xs text-foreground">{translate("adminPages.feedbacks.feedbacksPage.statusAndOfficialResponse")}</h4>

                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">{translate("adminPages.feedbacks.feedbacksPage.updateStatus")}</label>
                                <Select
                                    value={statusChange}
                                    onChange={(v) => setStatusChange(v as FeedbackStatus)}
                                    className="w-full"
                                    options={[
                                        { label: translate("adminPages.feedbacks.feedbacksPage.pending"), value: "pending" },
                                        { label: translate("adminPages.feedbacks.feedbacksPage.inProgressUnderReview"), value: "processing" },
                                        { label: translate("adminPages.feedbacks.feedbacksPage.resolvedAccepted2"), value: "resolved" },
                                        { label: translate("adminPages.feedbacks.feedbacksPage.closedNotAcceptedAtThisTime"), value: "closed" },
                                    ]}
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">{translate("adminPages.feedbacks.feedbacksPage.officialResponseVisibleToTheUserInTheirInboxAnd")}</label>
                                <Input.TextArea rows={4} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={translate("adminPages.feedbacks.feedbacksPage.enterAReplyForExampleWeIdentifiedTheIssueAnd")} className="rounded-lg" />
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <Button icon={selectedItem.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />} onClick={() => handleArchive(selectedItem.id, !selectedItem.archived)}>
                                    {selectedItem.archived ? translate("adminPages.feedbacks.feedbacksPage.unarchive") : translate("adminPages.feedbacks.feedbacksPage.archiveThisFeedback2")}
                                </Button>
                                <div className="flex items-center gap-2">
                                    <Button onClick={() => setDrawerOpen(false)}>{translate("common.cancel")}</Button>
                                    <Button type="primary" loading={saving} onClick={handleSaveReply} icon={<Send className="size-3.5" />}>
                                        {translate("adminPages.feedbacks.feedbacksPage.saveAndReply")}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </AdminDrawer>

            {/* Video Preview Modal */}
            {previewVideoUrl ? (
                <AdminModal open={Boolean(previewVideoUrl)} onCancel={() => setPreviewVideoUrl(null)} footer={null} width={720} title={translate("account.feedback.videoPreview")}>
                    <div className="py-2">
                        <video src={previewVideoUrl} controls autoPlay className="w-full max-h-[60vh] rounded-lg bg-black" />
                    </div>
                </AdminModal>
            ) : null}
        </AdminPageFrame>
    );
}
