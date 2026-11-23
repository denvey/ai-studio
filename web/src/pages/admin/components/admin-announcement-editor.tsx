// 公告编辑器与弹层焦点管理（打开时锁定焦点，关闭后还原到触发元素）。

import { type AnnouncementLevel, type SystemAnnouncement } from "@/services/api/announcements";
import { Button, Form, Input, type InputRef } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import { type ChangeEvent, useEffect, useRef } from "react";
import { Pin, Send, Upload, X } from "lucide-react";
import { Select } from "@/components/ui/base/select";
import { Switch } from "@/pages/admin/ui/controls";
import { AdminStatusBadge } from "./admin-ui";
import { AnnouncementContent } from "@/components/ui/announcement-content";
import { type AnnouncementFormValues, DEFAULT_ANNOUNCEMENT, type PendingAnnouncement, formatDateTime, levelMeta, levelOptions } from "./admin-announcement-results";
import { translate } from "@/i18n";

export function AnnouncementEditor({
    open,
    editingAnnouncement,
    form,
    pending,
    saving,
    publishBlocked,
    returnFocusElement,
    watchedTitle,
    watchedContent,
    watchedLevel,
    watchedPinned,
    imagePreviewUrl,
    imageUploading,
    imageInputRef,
    onClose,
    onPreview,
    onPendingChange,
    onUploadImage,
    onClearImage,
    onConfirm,
}: {
    open: boolean;
    editingAnnouncement: SystemAnnouncement | null;
    form: ReturnType<typeof Form.useForm<AnnouncementFormValues>>[0];
    pending: PendingAnnouncement | null;
    saving: boolean;
    publishBlocked: boolean;
    returnFocusElement: HTMLElement | null;
    watchedTitle?: string;
    watchedContent?: string;
    watchedLevel?: AnnouncementLevel;
    watchedPinned?: boolean;
    imagePreviewUrl: string;
    imageUploading: boolean;
    imageInputRef: { current: HTMLInputElement | null };
    onClose: () => void;
    onPreview: (values: AnnouncementFormValues) => void;
    onPendingChange: (pending: PendingAnnouncement | null) => void;
    onUploadImage: (event: ChangeEvent<HTMLInputElement>) => void;
    onClearImage: () => void;
    onConfirm: () => void;
}) {
    const previewMeta = levelMeta[watchedLevel || "info"] || levelMeta.info;
    const titleInputRef = useRef<InputRef>(null);
    const activeOverlay = pending ? "confirm" : open ? "editor" : null;
    useAnnouncementOverlayFocus(activeOverlay, titleInputRef, returnFocusElement);
    return (
        <>
            <AdminModal
                title={editingAnnouncement ? translate("admin.adminAnnouncementEditor.editAndRepublishAnnouncement") : translate("admin.adminAnnouncementEditor.publishASystemAnnouncement")}
                open={open && !pending}
                centered
                width="min(1120px, calc(100vw - 32px))"
                onCancel={onClose}
                rootClassName="admin-announcement-editor-modal"
                forceRender
                afterOpenChange={(isOpen) => {
                    if (!isOpen) return;
                    document.querySelector<HTMLElement>(".admin-announcement-editor-modal .ant-modal-body")?.scrollTo({ top: 0 });
                    titleInputRef.current?.focus({ cursor: "end" });
                }}
                mask={{ closable: !saving && !pending }}
                keyboard={!saving && !pending}
                closable={!saving && !pending}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button disabled={saving || imageUploading || Boolean(pending)} onClick={onClose}>
                            {translate("common.cancel")}
                        </Button>
                        <Button type="primary" loading={saving} disabled={publishBlocked || imageUploading || Boolean(pending)} icon={<Send className="size-4" />} onClick={() => form.submit()}>
                            {translate("admin.adminAnnouncementEditor.reviewAndContinue")}
                        </Button>
                    </div>
                }
                styles={{ body: { maxHeight: "calc(100vh - 190px)", overflowY: "auto" } }}
            >
                <div className={`admin-announcement-editor-intro${editingAnnouncement ? " is-warning" : ""}`}>
                    <strong>{editingAnnouncement ? translate("admin.adminAnnouncementEditor.savingRepublishesThisAnnouncementToAllUsers") : translate("admin.adminAnnouncementEditor.publishedAnnouncementsAppearInUsersAnnouncementCenters")}</strong>
                    <p>
                        {editingAnnouncement ? translate("admin.adminAnnouncementEditor.savingUpdatesThePublicationTimeRepublishesTheAnnouncementAndClears") : translate("admin.adminAnnouncementEditor.openPagesReceiveTheAnnouncementAtTheNextSyncUsually")}
                    </p>
                </div>
                <Form form={form} layout="vertical" requiredMark={false} disabled={publishBlocked} initialValues={DEFAULT_ANNOUNCEMENT} scrollToFirstError={{ focus: true, block: "center" }} onFinish={onPreview}>
                    <div className="admin-announcement-editor-layout">
                        <section className="admin-announcement-editor-section">
                            <div className="admin-announcement-editor-section-heading">
                                <h2>{translate("admin.adminAnnouncementEditor.announcementContent")}</h2>
                                <p>{translate("admin.adminAnnouncementEditor.supportsLineBreaksAndAllowedHTMLSuchAsLinksEmphasis")}</p>
                            </div>
                            <div className="admin-announcement-form-grid">
                                <Form.Item
                                    name="title"
                                    label={translate("admin.adminAnnouncementEditor.announcementTitle")}
                                    rules={[
                                        { required: true, whitespace: true, message: translate("admin.adminAnnouncementEditor.enterAnAnnouncementTitle") },
                                        { max: 120, message: translate("admin.adminAnnouncementEditor.theTitleCannotExceed120Characters") },
                                    ]}
                                >
                                    <Input ref={titleInputRef} maxLength={120} showCount placeholder={translate("admin.adminAnnouncementEditor.eGVideoModelsAreBackToNormal")} />
                                </Form.Item>
                                <Form.Item
                                    name="level"
                                    label={translate("admin.adminAnnouncementEditor.announcementType")}
                                    extra={previewMeta.guidance}
                                    rules={[{ required: true, message: translate("admin.adminAnnouncementEditor.chooseAnAnnouncementType") }]}
                                >
                                    <Select aria-label={translate("admin.adminAnnouncementEditor.chooseAnnouncementType")} options={levelOptions} />
                                </Form.Item>
                            </div>
                            <Form.Item name="pinned" label={translate("admin.adminAnnouncementEditor.displayMode")} valuePropName="checked" extra={translate("admin.adminAnnouncementEditor.pinnedAnnouncementsAppearBeforeRegularAnnouncements")}>
                                <Switch checkedChildren={translate("account.ui.announcements.pinned")} unCheckedChildren={translate("admin.adminAnnouncementEditor.normal")} />
                            </Form.Item>
                            <Form.Item name="imageResourceId" hidden>
                                <Input />
                            </Form.Item>
                            <Form.Item label={translate("admin.adminAnnouncementEditor.announcementImage")} extra={translate("admin.adminAnnouncementEditor.optionalImagesMustNotExceed10MBUnpublishedDraftsAreCleaned")}>
                                <div className="space-y-2">
                                    {imagePreviewUrl ? (
                                        <div className="relative flex min-h-28 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/20 p-2">
                                            <img src={imagePreviewUrl} alt={translate("admin.adminAnnouncementEditor.announcementImagePreview")} className="max-h-44 w-full object-contain" />
                                            <Button
                                                type="text"
                                                size="small"
                                                danger
                                                disabled={imageUploading}
                                                icon={<X className="size-3.5" />}
                                                className="!absolute right-1 top-1 !size-7 !min-w-7 !p-0"
                                                onClick={onClearImage}
                                                aria-label={translate("admin.adminAnnouncementEditor.removeAnnouncementImage")}
                                                title={translate("admin.adminAnnouncementEditor.removeAnnouncementImage")}
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-border/80 bg-muted/10 text-xs text-foreground/45">{translate("admin.adminAnnouncementEditor.noImageAdded")}</div>
                                    )}
                                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onUploadImage} />
                                    <Button icon={<Upload className="size-3.5" />} loading={imageUploading} onClick={() => imageInputRef.current?.click()}>
                                        {imagePreviewUrl ? translate("admin.adminAnnouncementEditor.changeImage") : translate("admin.adminAnnouncementEditor.uploadImage")}
                                    </Button>
                                </div>
                            </Form.Item>
                            <Form.Item name="content" label={translate("admin.adminAnnouncementEditor.announcementContentOptional")} rules={[{ max: 4000, message: translate("admin.adminAnnouncementEditor.theBodyCannotExceed4000Characters") }]}>
                                <Input.TextArea maxLength={4000} showCount autoSize={{ minRows: 14, maxRows: 24 }} placeholder={translate("admin.adminAnnouncementEditor.optionallyDescribeServiceStatusImpactAndActionsUsersShouldTake")} />
                            </Form.Item>
                        </section>

                        <section className="admin-announcement-preview" data-level={watchedLevel || "info"} aria-label={translate("admin.adminAnnouncementEditor.userAnnouncementPreview")}>
                            <div className="admin-announcement-preview-heading">
                                <span>{translate("admin.adminAnnouncementEditor.userPreview")}</span>
                                <div className="flex items-center gap-2">
                                    <AdminStatusBadge label={previewMeta.label} tone={previewMeta.tone} />
                                    {watchedPinned ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
                                            <Pin className="size-3" />
                                            {translate("account.ui.announcements.pinned")}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <h3>{watchedTitle?.trim() || translate("admin.adminAnnouncementEditor.theAnnouncementTitleAppearsHere")}</h3>
                            {imagePreviewUrl ? (
                                <img src={imagePreviewUrl} alt={translate("admin.adminAnnouncementEditor.announcementImagePreview")} className="mt-4 max-h-56 w-full rounded-lg border border-border/70 bg-muted/20 object-contain p-1" />
                            ) : null}
                            {watchedContent?.trim() ? (
                                <AnnouncementContent content={watchedContent.trim()} className="admin-announcement-preview-content" />
                            ) : (
                                <p className="admin-announcement-preview-placeholder">{translate("admin.adminAnnouncementEditor.thisAnnouncementDisplaysOnlyItsTitle")}</p>
                            )}
                        </section>
                    </div>
                </Form>
            </AdminModal>

            <AdminModal
                title={pending?.mode === "update" ? translate("admin.adminAnnouncementEditor.confirmChangesAndRepublish") : translate("admin.adminAnnouncementEditor.confirmSystemAnnouncementPublication")}
                open={Boolean(pending)}
                okText={pending?.mode === "update" ? translate("admin.adminAnnouncementEditor.confirmRepublication") : translate("admin.adminAnnouncementEditor.confirmPublication")}
                cancelText={translate("admin.adminAnnouncementEditor.backToEditing")}
                onCancel={() => {
                    if (!saving) onPendingChange(null);
                }}
                onOk={onConfirm}
                confirmLoading={saving}
                mask={{ closable: !saving }}
                closable={!saving}
                keyboard={!saving}
                destroyOnHidden
                rootClassName="admin-announcement-confirm-modal"
                okButtonProps={{ danger: pending?.level === "critical", disabled: publishBlocked }}
            >
                {pending ? (
                    <div className="admin-operation-confirmation">
                        <p className="admin-operation-confirmation-copy">
                            {pending.mode === "update"
                                ? translate("admin.adminAnnouncementEditor.thisRepublishesTheAnnouncementUpdatesItsPublicationTimeAndClears", { v0: String(formatDateTime(pending.previousPublishedAt)) })
                                : translate("admin.adminAnnouncementEditor.afterConfirmationTheAnnouncementAppearsInEveryUserSAnnouncement")}
                        </p>
                        <dl className="admin-operation-confirmation-grid">
                            <div>
                                <dt>{translate("account.settings.runninghub.actions")}</dt>
                                <dd>
                                    {pending.mode === "update"
                                        ? pending.previousStatus === "closed"
                                            ? translate("admin.adminAnnouncementEditor.reopenAndPublish")
                                            : translate("admin.adminAnnouncementEditor.updateAndRepublish")
                                        : translate("admin.adminAnnouncementEditor.publishNewAnnouncement")}
                                </dd>
                            </div>
                            <div>
                                <dt>{translate("admin.adminAnnouncementEditor.announcementType")}</dt>
                                <dd>{(levelMeta[pending.level] || levelMeta.info).label}</dd>
                            </div>
                            <div>
                                <dt>{translate("admin.adminAnnouncementEditor.displayMode")}</dt>
                                <dd>{pending.pinned ? translate("account.ui.announcements.pinned") : translate("admin.adminAnnouncementEditor.normal")}</dd>
                            </div>
                            <div>
                                <dt>{translate("admin.adminAnnouncementEditor.announcementImage")}</dt>
                                <dd>{pending.imageResourceId ? translate("admin.adminAnnouncementEditor.configured") : translate("admin.adminAnnouncementEditor.noImage")}</dd>
                            </div>
                            <div className="is-wide">
                                <dt>{translate("admin.adminAnnouncementEditor.announcementTitle")}</dt>
                                <dd>{pending.title}</dd>
                            </div>
                            <div className="is-wide">
                                <dt>{translate("admin.adminAnnouncementEditor.announcementBody")}</dt>
                                <dd>{pending.content ? <AnnouncementContent content={pending.content} className="admin-announcement-confirm-content" /> : translate("admin.adminAnnouncementEditor.noContent")}</dd>
                            </div>
                        </dl>
                    </div>
                ) : null}
            </AdminModal>
        </>
    );
}

export function useAnnouncementOverlayFocus(activeOverlay: "editor" | "confirm" | null, titleInputRef: { current: InputRef | null }, returnFocusElement: HTMLElement | null) {
    const previousOverlayRef = useRef<typeof activeOverlay>(null);
    const returnFocusRef = useRef<HTMLElement | null>(returnFocusElement);
    if (returnFocusElement) returnFocusRef.current = returnFocusElement;

    useEffect(() => {
        const previousOverlay = previousOverlayRef.current;
        previousOverlayRef.current = activeOverlay;
        if (!activeOverlay) {
            if (!previousOverlay) return;
            const restoreFocus = () => {
                const activeElement = document.activeElement;
                if (activeElement === document.body || activeElement === null || activeElement?.closest(".admin-announcement-editor-modal, .admin-announcement-confirm-modal")) resolveAnnouncementReturnFocus(returnFocusRef.current)?.focus();
            };
            const frame = window.requestAnimationFrame(restoreFocus);
            const transitionFallback = window.setTimeout(restoreFocus, 360);
            return () => {
                window.cancelAnimationFrame(frame);
                window.clearTimeout(transitionFallback);
            };
        }

        const selector = activeOverlay === "confirm" ? ".admin-announcement-confirm-modal" : ".admin-announcement-editor-modal";
        const focusOverlay = () => {
            const root = findVisibleOverlay(selector);
            if (!root) return;
            if (activeOverlay === "editor") {
                root.querySelector<HTMLElement>(".ant-modal-body")?.scrollTo({ top: 0 });
                titleInputRef.current?.focus({ cursor: "end" });
                return;
            }
            if (!root.contains(document.activeElement)) getOverlayFocusableElements(root)[0]?.focus();
        };
        const frame = window.requestAnimationFrame(focusOverlay);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Tab") return;
            const root = findVisibleOverlay(selector);
            if (!root) return;
            const focusableElements = getOverlayFocusableElements(root);
            if (!focusableElements.length) {
                event.preventDefault();
                root.focus();
                return;
            }
            const activeElement = document.activeElement as HTMLElement | null;
            const currentIndex = activeElement ? focusableElements.indexOf(activeElement) : -1;
            if (event.shiftKey && currentIndex <= 0) {
                event.preventDefault();
                focusableElements[focusableElements.length - 1]?.focus();
            } else if (!event.shiftKey && (currentIndex < 0 || currentIndex === focusableElements.length - 1)) {
                event.preventDefault();
                focusableElements[0]?.focus();
            }
        };
        document.addEventListener("keydown", handleKeyDown, true);
        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [activeOverlay, titleInputRef]);
}

export function resolveAnnouncementReturnFocus(preferred: HTMLElement | null) {
    if (preferred?.isConnected && !(preferred instanceof HTMLButtonElement && preferred.disabled)) return preferred;
    const publishTrigger = document.getElementById("admin-announcement-publish-trigger");
    if (publishTrigger instanceof HTMLElement && !(publishTrigger instanceof HTMLButtonElement && publishTrigger.disabled)) return publishTrigger;
    return document.querySelector<HTMLElement>(".admin-announcement-uncertain-actions button:not(:disabled)");
}

export function findVisibleOverlay(selector: string) {
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => element.getClientRects().length > 0) || null;
}

export function getOverlayFocusableElements(root: HTMLElement) {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((element) => {
        if (element.getAttribute("aria-hidden") === "true" || element.closest('[aria-hidden="true"]')) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1 && window.getComputedStyle(element).visibility !== "hidden";
    });
}
