import { resourceFileUrl } from "@/services/api/resources";
import { type ColumnsType } from "antd/es/table";
import { AnnouncementContent } from "@/components/ui/announcement-content";
import { RefreshCw, PencilLine, Search, Plus } from "lucide-react";
import { Select } from "@/components/ui/base/select";
import { AnnouncementEditor } from "./admin-announcement-editor";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { App, Form, Button, Input } from "antd";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
    listAdminAnnouncements,
    type AnnouncementLevel,
    type AnnouncementStatus,
    type SystemAnnouncement, discardAdminAnnouncementImage, uploadAdminAnnouncementImage, announcementImageUrl, updateAdminAnnouncement, createAdminAnnouncement, closeAdminAnnouncement } from "@/services/api/announcements";
import { readAnnouncementPendingReview, type AnnouncementPendingReview, writeAnnouncementPendingReview, clearAnnouncementPendingReview } from "./admin-announcement-safety";
import { AdminStatusBadge, AdminRowActions, AdminDataTable, AdminTableEmpty, PaginationBar } from "./admin-ui";
import { assertAnnouncementListResult, inspectPendingReview, DEFAULT_ANNOUNCEMENT, levelOptions, isKnownAnnouncementStatus, assertAnnouncementMutationResult, isMutationResultUncertain, formatPendingReviewOperation } from "./admin-announcement-results";
import { type AnnouncementFormValues, type PendingAnnouncement, formatDateTime, levelMeta } from "./admin-announcement-results";
import { translate } from "@/i18n";

export { type AnnouncementFormValues, DEFAULT_ANNOUNCEMENT, type PendingAnnouncement, formatDateTime, levelMeta, levelOptions } from "./admin-announcement-results";

export default function AdminAnnouncementsPanel({
    publishOpen,
    publishBlocked,
    publishReturnFocus,
    onPublishOpenChange,
    onPublishBlockedChange,
}: {
    publishOpen: boolean;
    publishBlocked: boolean;
    publishReturnFocus: HTMLElement | null;
    onPublishOpenChange: (open: boolean) => void;
    onPublishBlockedChange: (blocked: boolean) => void;
}) {
    const { message } = App.useApp();
    const [form] = Form.useForm<AnnouncementFormValues>();
    const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
    const [keyword, setKeyword] = useState("");
    const debouncedKeyword = useDebouncedValue(keyword);
    const [status, setStatus] = useState<"all" | AnnouncementStatus>("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState("");
    const [editingAnnouncement, setEditingAnnouncement] = useState<SystemAnnouncement | null>(null);
    const [pendingSave, setPendingSave] = useState<PendingAnnouncement | null>(null);
    const [saving, setSaving] = useState(false);
    const [imagePreviewUrl, setImagePreviewUrl] = useState("");
    const [draftImageResourceId, setDraftImageResourceId] = useState("");
    const [imageUploading, setImageUploading] = useState(false);
    const [closingIds, setClosingIds] = useState<Set<string>>(() => new Set());
    const [pendingReview, setPendingReview] = useState<AnnouncementPendingReview | null>(() => readAnnouncementPendingReview());
    const [uncertainListReady, setUncertainListReady] = useState(false);
    const [reconciliationLoading, setReconciliationLoading] = useState(false);
    const [reconciliationSummary, setReconciliationSummary] = useState("");
    const [listRefreshNonce, setListRefreshNonce] = useState(0);
    const listRequestRef = useRef(0);
    const reconciliationRequestRef = useRef(0);
    const saveInFlightRef = useRef(false);
    const closeInFlightRef = useRef(new Set<string>());
    const writeBlockedRef = useRef(publishBlocked);
    const editorReturnFocusRef = useRef<HTMLElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    writeBlockedRef.current = publishBlocked;
    const watchedTitle = Form.useWatch("title", form);
    const watchedContent = Form.useWatch("content", form);
    const watchedLevel = Form.useWatch("level", form);
    const watchedPinned = Form.useWatch("pinned", form);

    const reload = async (targetPage = page, targetPageSize = pageSize, queryOverride?: { keyword?: string; status?: "all" | AnnouncementStatus }) => {
        const requestId = ++listRequestRef.current;
        const queryKeyword = (queryOverride?.keyword ?? debouncedKeyword).trim();
        const queryStatus = queryOverride?.status ?? status;
        setLoading(true);
        setListError("");
        setAnnouncements([]);
        setTotal(0);
        try {
            const data = assertAnnouncementListResult(
                await listAdminAnnouncements({
                    keyword: queryKeyword || undefined,
                    status: queryStatus === "all" ? undefined : queryStatus,
                    page: targetPage,
                    pageSize: targetPageSize,
                }),
                targetPage,
                targetPageSize,
            );
            if (requestId !== listRequestRef.current) return false;
            const lastPage = Math.max(1, Math.ceil(data.total / targetPageSize));
            if (targetPage > lastPage) {
                setPage(lastPage);
                return true;
            }
            setAnnouncements(data.announcements);
            setTotal(data.total);
            return true;
        } catch (error) {
            if (requestId === listRequestRef.current) {
                const detail = error instanceof Error ? error.message : translate("admin.adminAnnouncementsPanel.failedToLoadAnnouncements");
                setListError(detail);
                message.error(detail);
            }
            return false;
        } finally {
            if (requestId === listRequestRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        const reconciliationRequestId = ++reconciliationRequestRef.current;
        const shouldReconcile = publishBlocked && Boolean(pendingReview) && page === 1 && !debouncedKeyword.trim() && status === "all";
        if (!shouldReconcile) setReconciliationLoading(false);
        void (async () => {
            const loaded = await reload(page, pageSize);
            if (!shouldReconcile || !pendingReview) return;
            setUncertainListReady(false);
            if (!loaded || reconciliationRequestId !== reconciliationRequestRef.current) return;
            setReconciliationLoading(true);
            setReconciliationSummary(translate("admin.adminAnnouncementsPanel.locatingAnnouncementsAwaitingReview"));
            try {
                const summary = await inspectPendingReview(pendingReview);
                if (reconciliationRequestId !== reconciliationRequestRef.current) return;
                setReconciliationSummary(summary);
                setUncertainListReady(true);
            } catch (error) {
                if (reconciliationRequestId !== reconciliationRequestRef.current) return;
                setReconciliationSummary(error instanceof Error ? translate("admin.adminAnnouncementsPanel.automaticReviewFailed", { v0: String(error.message) }) : translate("admin.adminAnnouncementsPanel.automaticReviewFailedRefreshAgain"));
            } finally {
                if (reconciliationRequestId === reconciliationRequestRef.current) setReconciliationLoading(false);
            }
        })();
    }, [debouncedKeyword, listRefreshNonce, page, pageSize, pendingReview, publishBlocked, status]);

    useEffect(() => {
        if (!publishOpen) return;
        if (publishReturnFocus) editorReturnFocusRef.current = publishReturnFocus;
        setEditingAnnouncement(null);
        form.setFieldsValue(DEFAULT_ANNOUNCEMENT);
        setImagePreviewUrl("");
        setDraftImageResourceId("");
    }, [form, publishOpen, publishReturnFocus]);

    const editorOpen = publishOpen || Boolean(editingAnnouncement);
    const discardDraftImage = async () => {
        if (!draftImageResourceId) return;
        await discardAdminAnnouncementImage(draftImageResourceId);
        setDraftImageResourceId("");
    };

    const uploadAnnouncementImage = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            message.warning(translate("admin.adminAnnouncementsPanel.theAnnouncementImageMustBeAnImageFile"));
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            message.warning(translate("admin.adminAnnouncementsPanel.theAnnouncementImageMustNotExceed10MB"));
            return;
        }
        setImageUploading(true);
        try {
            if (draftImageResourceId) await discardDraftImage();
            const { resource } = await uploadAdminAnnouncementImage(file);
            form.setFieldValue("imageResourceId", resource.id);
            setDraftImageResourceId(resource.id);
            setImagePreviewUrl(resourceFileUrl(resource.id));
            message.success(translate("admin.adminAnnouncementsPanel.announcementImageUploaded"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.adminAnnouncementsPanel.failedToUploadTheAnnouncementImage"));
        } finally {
            setImageUploading(false);
        }
    };

    const clearAnnouncementImage = async () => {
        setImageUploading(true);
        try {
            await discardDraftImage();
            form.setFieldValue("imageResourceId", "");
            setImagePreviewUrl("");
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.adminAnnouncementsPanel.failedToCleanUpTheAnnouncementImage"));
        } finally {
            setImageUploading(false);
        }
    };

    const closeEditor = async () => {
        if (saving || pendingSave || imageUploading) return;
        setImageUploading(true);
        try {
            await discardDraftImage();
            onPublishOpenChange(false);
            setEditingAnnouncement(null);
            setImagePreviewUrl("");
            form.resetFields();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.adminAnnouncementsPanel.failedToCleanUpTheDraftAnnouncementImageTryAgain"));
        } finally {
            setImageUploading(false);
        }
    };

    const openEditDrawer = (announcement: SystemAnnouncement) => {
        if (publishBlocked || !isKnownAnnouncementStatus(announcement.status)) return;
        if (document.activeElement instanceof HTMLElement) editorReturnFocusRef.current = document.activeElement;
        onPublishOpenChange(false);
        setEditingAnnouncement(announcement);
        form.setFieldsValue({
            title: announcement.title,
            content: announcement.content,
            imageResourceId: announcement.imageResourceId || "",
            level: announcement.level,
            pinned: announcement.pinned,
        });
        setImagePreviewUrl(announcementImageUrl(announcement));
        setDraftImageResourceId("");
    };

    const previewSave = (values: AnnouncementFormValues) => {
        if (writeBlockedRef.current) {
            message.warning(translate("admin.adminAnnouncementsPanel.reviewThePreviousAnnouncementOperationBeforeContinuing"));
            return;
        }
        const normalized: AnnouncementFormValues = {
            title: values.title.trim(),
            content: values.content.trim(),
            imageResourceId: values.imageResourceId?.trim() || "",
            level: values.level,
            pinned: Boolean(values.pinned),
        };
        if (editingAnnouncement) {
            setPendingSave({
                ...normalized,
                mode: "update",
                id: editingAnnouncement.id,
                previousStatus: editingAnnouncement.status,
                previousPublishedAt: editingAnnouncement.publishedAt,
                previousTitle: editingAnnouncement.title,
            });
        } else {
            setPendingSave({ ...normalized, mode: "create" });
        }
    };

    const saveAnnouncement = async () => {
        if (!pendingSave || saveInFlightRef.current) return;
        if (writeBlockedRef.current) {
            message.warning(translate("admin.adminAnnouncementsPanel.reviewThePreviousAnnouncementOperationBeforeContinuing"));
            return;
        }
        saveInFlightRef.current = true;
        setSaving(true);
        const isUpdate = pendingSave.mode === "update";
        const requestedAt = new Date().toISOString();
        try {
            const input = {
                title: pendingSave.title,
                content: pendingSave.content,
                imageResourceId: pendingSave.imageResourceId?.trim() || "",
                level: pendingSave.level,
                pinned: pendingSave.pinned,
            };
            const result = isUpdate ? await updateAdminAnnouncement(pendingSave.id, input) : await createAdminAnnouncement(input);
            assertAnnouncementMutationResult(result, "active", isUpdate ? pendingSave.id : undefined, input);
            setDraftImageResourceId("");
            setImagePreviewUrl("");
            setPendingSave(null);
            setEditingAnnouncement(null);
            onPublishOpenChange(false);
            form.resetFields();
            setKeyword("");
            setStatus("all");
            setPage(1);
            setListRefreshNonce((value) => value + 1);
            message.success(isUpdate ? translate("admin.adminAnnouncementsPanel.announcementUpdatedAndRepublished") : translate("admin.adminAnnouncementsPanel.announcementPublished"));
        } catch (error) {
            const detail = error instanceof Error ? error.message : isUpdate ? translate("admin.adminAnnouncementsPanel.failedToRepublishTheAnnouncement") : translate("admin.adminAnnouncementsPanel.failedToPublishAnnouncement");
            if (isMutationResultUncertain(error)) {
                writeBlockedRef.current = true;
                setPendingSave(null);
                setEditingAnnouncement(null);
                onPublishOpenChange(false);
                form.resetFields();
                setDraftImageResourceId("");
                setImagePreviewUrl("");
                onPublishBlockedChange(true);
                setKeyword("");
                setStatus("all");
                setPage(1);
                setUncertainListReady(false);
                const notice = translate("admin.adminAnnouncementsPanel.theLastRequestResultCannotBeConfirmedTheUnfilteredList", { v0: String(isUpdate ? translate("admin.adminAnnouncementsPanel.republish") : translate("admin.adminAnnouncementsPanel.publish")), v1: String(detail) });
                const review: AnnouncementPendingReview = {
                    operation: isUpdate ? "update" : "create",
                    targetId: isUpdate ? pendingSave.id : undefined,
                    previousTitle: isUpdate ? pendingSave.previousTitle : undefined,
                    title: pendingSave.title,
                    content: pendingSave.content,
                    imageResourceId: pendingSave.imageResourceId,
                    level: pendingSave.level,
                    pinned: pendingSave.pinned,
                    notice,
                    requestedAt,
                };
                setPendingReview(review);
                setReconciliationSummary("");
                writeAnnouncementPendingReview(review);
                setListRefreshNonce((value) => value + 1);
                message.warning({ content: translate("admin.adminAnnouncementsPanel.theAnnouncementPublicationResultNeedsReviewNoAutomaticRetryWas"), duration: 7 });
            } else {
                message.error(detail);
            }
        } finally {
            saveInFlightRef.current = false;
            setSaving(false);
        }
    };

    const closeAnnouncement = async (announcement: SystemAnnouncement) => {
        if (closeInFlightRef.current.has(announcement.id)) return;
        if (writeBlockedRef.current) {
            message.warning(translate("admin.adminAnnouncementsPanel.reviewThePreviousAnnouncementOperationBeforeContinuing"));
            return;
        }
        closeInFlightRef.current.add(announcement.id);
        setClosingIds((current) => new Set(current).add(announcement.id));
        let reconciliationRequired = false;
        const requestedAt = new Date().toISOString();
        try {
            const result = await closeAdminAnnouncement(announcement.id);
            assertAnnouncementMutationResult(result, "closed", announcement.id, announcement);
            message.success(translate("admin.adminAnnouncementsPanel.announcementClosed"));
        } catch (error) {
            const detail = error instanceof Error ? error.message : translate("admin.adminAnnouncementsPanel.failedToCloseAnnouncement");
            if (isMutationResultUncertain(error)) {
                writeBlockedRef.current = true;
                reconciliationRequired = true;
                onPublishBlockedChange(true);
                setKeyword("");
                setStatus("all");
                setPage(1);
                setUncertainListReady(false);
                const notice = translate("admin.adminAnnouncementsPanel.theLastCloseRequestResultCannotBeConfirmedTheUnfiltered", { v0: String(detail) });
                const review: AnnouncementPendingReview = {
                    operation: "close",
                    targetId: announcement.id,
                    title: announcement.title,
                    content: announcement.content,
                    level: announcement.level,
                    notice,
                    requestedAt,
                };
                setPendingReview(review);
                setReconciliationSummary("");
                writeAnnouncementPendingReview(review);
                setListRefreshNonce((value) => value + 1);
                message.warning({ content: translate("admin.adminAnnouncementsPanel.theAnnouncementCloseResultNeedsReviewNoAutomaticRetryWas"), duration: 7 });
            } else message.error(detail);
        } finally {
            if (!reconciliationRequired) setListRefreshNonce((value) => value + 1);
            closeInFlightRef.current.delete(announcement.id);
            setClosingIds((current) => {
                const next = new Set(current);
                next.delete(announcement.id);
                return next;
            });
        }
    };

    const columns: ColumnsType<SystemAnnouncement> = [
        {
            title: translate("admin.adminAnnouncementsPanel.announcement"),
            dataIndex: "title",
            width: 390,
            render: (_, announcement) => (
                <div className="flex min-w-0 items-center gap-3 py-0.5">
                    {announcement.imageUrl ? <img src={announcementImageUrl(announcement)} alt="" loading="lazy" decoding="async" className="size-12 shrink-0 rounded-md border border-border/70 bg-muted/20 object-contain p-0.5" /> : null}
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground" title={announcement.title}>
                            {announcement.title}
                        </div>
                        <AnnouncementContent content={announcement.content} className="admin-announcement-list-content mt-1 text-xs leading-5 text-foreground/50" />
                    </div>
                </div>
            ),
        },
        {
            title: translate("admin.adminAnnouncementsPanel.display"),
            dataIndex: "pinned",
            width: 90,
            align: "center",
            render: (pinned: boolean) => (pinned ? <AdminStatusBadge label={translate("account.ui.announcements.pinned")} tone="warning" /> : <span className="text-xs text-foreground/35">{translate("admin.adminAnnouncementsPanel.normal")}</span>),
        },
        {
            title: translate("account.settings.runninghub.kind"),
            dataIndex: "level",
            width: 105,
            align: "center",
            render: renderAnnouncementLevel,
        },
        {
            title: translate("admin.adminAnnouncementsPanel.publicationStatus"),
            width: 225,
            align: "center",
            render: (_, announcement) => <AnnouncementLifecycle announcement={announcement} />,
        },
        {
            title: translate("account.settings.runninghub.actions"),
            key: "actions",
            width: 200,
            align: "center",
            render: (_, announcement) => (
                <div className="flex justify-center">
                    <AdminRowActions
                        primary={{
                            label: !isKnownAnnouncementStatus(announcement.status) ? translate("admin.adminAnnouncementsPanel.statusNeedsReview") : announcement.status === "closed" ? translate("admin.adminAnnouncementsPanel.republish") : translate("admin.adminAnnouncementsPanel.editAndPublish"),
                            icon: announcement.status === "closed" ? <RefreshCw className="size-3.5" /> : <PencilLine className="size-3.5" />,
                            disabled: publishBlocked || closingIds.has(announcement.id) || !isKnownAnnouncementStatus(announcement.status),
                            onClick: () => openEditDrawer(announcement),
                        }}
                        actions={
                            announcement.status === "active"
                                ? [
                                      {
                                          key: "close",
                                          label: translate("admin.adminAnnouncementsPanel.closeAnnouncement"),
                                          danger: true,
                                          disabled: publishBlocked || closingIds.has(announcement.id),
                                          confirm: {
                                              title: translate("admin.adminAnnouncementsPanel.close", { v0: String(announcement.title) }),
                                              description: translate("admin.adminAnnouncementsPanel.theServerWillStopSendingThisAnnouncementOpenPagesRemove"),
                                              okText: translate("admin.adminAnnouncementsPanel.confirmClose"),
                                          },
                                          onClick: () => closeAnnouncement(announcement),
                                      },
                                  ]
                                : []
                        }
                    />
                </div>
            ),
        },
    ];
    const hasFilters = Boolean(keyword.trim() || status !== "all");

    return (
        <div className="admin-announcements flex min-h-0 flex-1 flex-col">
            {pendingReview ? (
                <div className="admin-announcement-uncertain-notice" role="alert">
                    <div className="admin-announcement-uncertain-copy">
                        <strong>{translate("admin.adminAnnouncementsPanel.announcementResultNeedsReview")}</strong>
                        <p>{pendingReview.notice}</p>
                        <dl className="admin-announcement-review-target">
                            <div>
                                <dt>{translate("admin.adminAnnouncementsPanel.operationToReview")}</dt>
                                <dd>{formatPendingReviewOperation(pendingReview.operation)}</dd>
                            </div>
                            <div>
                                <dt>{translate("admin.adminAnnouncementsPanel.announcementTitle")}</dt>
                                <dd>{pendingReview.title}</dd>
                            </div>
                            <div>
                                <dt>{translate("admin.adminAnnouncementsPanel.targetID")}</dt>
                                <dd>{pendingReview.targetId || translate("admin.adminAnnouncementsPanel.newAnnouncementNoIDReturned")}</dd>
                            </div>
                            <div>
                                <dt>{translate("admin.adminAnnouncementsPanel.requestTime")}</dt>
                                <dd>{formatDateTime(pendingReview.requestedAt)}</dd>
                            </div>
                            <div className="is-wide">
                                <dt>{translate("admin.adminAnnouncementsPanel.requestContent")}</dt>
                                <dd>
                                    <AnnouncementContent content={pendingReview.content} className="admin-announcement-review-content" />
                                </dd>
                            </div>
                            <div className="is-wide" aria-live="polite">
                                <dt>{translate("admin.adminAnnouncementsPanel.automaticLookupResult")}</dt>
                                <dd>{reconciliationSummary || translate("admin.adminAnnouncementsPanel.refreshTheCompleteListToLocateTheRecordThatNeeds")}</dd>
                            </div>
                        </dl>
                    </div>
                    <div className="admin-announcement-uncertain-actions">
                        <Button
                            loading={loading || reconciliationLoading}
                            onClick={() => {
                                setKeyword("");
                                setStatus("all");
                                setPage(1);
                                setUncertainListReady(false);
                                setReconciliationSummary("");
                                setListRefreshNonce((value) => value + 1);
                            }}
                        >
                            {translate("admin.adminAnnouncementsPanel.refreshCompleteList")}
                        </Button>
                        <Button
                            type="primary"
                            disabled={!uncertainListReady || loading || reconciliationLoading}
                            onClick={() => {
                                setPendingReview(null);
                                setUncertainListReady(false);
                                setReconciliationSummary("");
                                clearAnnouncementPendingReview();
                                onPublishBlockedChange(false);
                                message.success(translate("admin.adminAnnouncementsPanel.announcementPublishingResumed"));
                            }}
                        >
                            {translate("admin.adminAnnouncementsPanel.reviewedResumePublishing")}
                        </Button>
                    </div>
                </div>
            ) : null}

            <section className="flex min-h-0 flex-1" aria-label={translate("admin.adminAnnouncementsPanel.systemAnnouncements")}>
                <AdminDataTable
                    toolbar={
                        <Input
                            allowClear
                            disabled={publishBlocked}
                            aria-label={translate("admin.adminAnnouncementsPanel.searchSystemAnnouncements")}
                            className="app-list-search"
                            prefix={<Search className="size-4 text-foreground/40" />}
                            value={keyword}
                            placeholder={translate("admin.adminAnnouncementsPanel.searchAnnouncementTitlesOrBody")}
                            onChange={(event) => {
                                setKeyword(event.target.value);
                                setPage(1);
                            }}
                        />
                    }
                    toolbarActive={hasFilters}
                    toolbarFilters={
                        <Select<"all" | AnnouncementStatus>
                            aria-label={translate("admin.adminAnnouncementsPanel.filterByAnnouncementStatus")}
                            className="admin-announcement-status-filter w-32"
                            disabled={publishBlocked}
                            value={status}
                            onChange={(value) => {
                                setStatus(value);
                                setPage(1);
                            }}
                            options={[
                                { label: translate("library.ark.expiry.all"), value: "all" },
                                { label: translate("admin.adminAnnouncementsPanel.published"), value: "active" },
                                { label: translate("account.feedback.status.closed"), value: "closed" },
                            ]}
                        />
                    }
                    onReset={() => {
                        setKeyword("");
                        setStatus("all");
                        setPage(1);
                    }}
                    trailing={
                        <Button
                            type="text"
                            size="small"
                            icon={<RefreshCw className="size-3.5" />}
                            loading={loading || reconciliationLoading}
                            onClick={() => {
                                if (publishBlocked) {
                                    setUncertainListReady(false);
                                    setReconciliationSummary("");
                                    setListRefreshNonce((value) => value + 1);
                                } else void reload();
                            }}
                        >
                            {translate("common.refresh")}
                        </Button>
                    }
                    table={{ rowKey: "id", size: "small", loading, pagination: false, columns, dataSource: announcements }}
                    empty={
                        <AdminTableEmpty
                            filtered={hasFilters}
                            title={listError ? translate("account.ui.announcements.loadFailed") : !hasFilters ? translate("account.ui.announcements.empty") : undefined}
                            description={listError || (!hasFilters ? translate("admin.adminAnnouncementsPanel.publishedAnnouncementsShowTheirStatusAndHistoryHere") : undefined)}
                            action={
                                !listError && !hasFilters && !publishBlocked ? (
                                    <Button
                                        type="primary"
                                        icon={<Plus className="size-4" />}
                                        onClick={(event) => {
                                            editorReturnFocusRef.current = event.currentTarget;
                                            onPublishOpenChange(true);
                                        }}
                                    >
                                        {translate("admin.adminAnnouncementsPanel.publishFirstAnnouncement")}
                                    </Button>
                                ) : undefined
                            }
                        />
                    }
                    footer={
                        <PaginationBar
                            alwaysShow
                            current={page}
                            pageSize={pageSize}
                            total={total}
                            onChange={(nextPage, nextPageSize) => {
                                setPage(nextPageSize !== pageSize ? 1 : nextPage);
                                setPageSize(nextPageSize);
                            }}
                        />
                    }
                />
            </section>

            <AnnouncementEditor
                open={editorOpen}
                editingAnnouncement={editingAnnouncement}
                form={form}
                pending={pendingSave}
                saving={saving}
                publishBlocked={publishBlocked}
                returnFocusElement={editorReturnFocusRef.current || publishReturnFocus}
                watchedTitle={watchedTitle}
                watchedContent={watchedContent}
                watchedLevel={watchedLevel}
                watchedPinned={watchedPinned}
                imagePreviewUrl={imagePreviewUrl}
                imageUploading={imageUploading}
                imageInputRef={imageInputRef}
                onClose={closeEditor}
                onPreview={previewSave}
                onPendingChange={setPendingSave}
                onUploadImage={uploadAnnouncementImage}
                onClearImage={() => void clearAnnouncementImage()}
                onConfirm={() => void saveAnnouncement()}
            />
        </div>
    );
}

function AnnouncementLifecycle({ announcement }: { announcement: SystemAnnouncement }) {
    const active = announcement.status === "active";
    const closed = announcement.status === "closed";
    return (
        <div className="admin-announcement-lifecycle">
            <AdminStatusBadge label={active ? translate("admin.adminAnnouncementsPanel.published") : closed ? translate("account.feedback.status.closed") : translate("admin.adminAnnouncementsPanel.unknownStatus")} tone={active ? "success" : "neutral"} />
            <span>{translate("admin.adminAnnouncementsPanel.publish")} {formatDateTime(announcement.publishedAt)}</span>
            {closed ? <span>{translate("common.close")} {formatDateTime(announcement.closedAt)}</span> : null}
        </div>
    );
}

function renderAnnouncementLevel(level: AnnouncementLevel) {
    const meta = levelMeta[level] || levelMeta.info;
    return <AdminStatusBadge label={meta.label} tone={meta.tone} />;
}
