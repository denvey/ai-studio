import { App, Button, DatePicker, Form, Input, InputNumber, Popconfirm, Switch } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import type { ColumnsType } from "antd/es/table";
import { Trash2, Edit3, Search } from "lucide-react";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
    createAdminBanner,
    deleteAdminBanner,
    listAdminBanners,
    updateAdminBanner,
    type BannerAnnouncement,
} from "@/services/api/announcements";
import {
    BANNER_NOTICE_DEFAULT_TYPE,
    bannerNoticeTypeLabel,
    normalizeBannerNoticeType,
    type BannerNoticeType,
} from "@/lib/announcements/banner-notice";
import { bannerAnnouncementBarStyle } from "@/components/layout/banner-announcement-content";
import { BANNER_TITLE_MAX_CHARS, bannerTitleCharCount, bannerTitlePlainText, normalizeBannerTitleRuns, type BannerTitleRun } from "@/lib/announcements/banner-title";
import { AdminDataTable } from "./admin-ui";
import { BannerNoticeTypeSelector } from "./banner-notice-type-selector";
import { BannerNoticePreview, BannerTitleEditor } from "./banner-title-editor";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

type FormValues = {
    noticeType: BannerNoticeType;
    link?: string;
    status: boolean;
    sortOrder?: number;
    dateRange?: [Dayjs | null, Dayjs | null] | null;
};

type BannerDialog = { mode: "create" } | { mode: "edit"; banner: BannerAnnouncement };

export default function AdminBannerAnnouncementsPanel({
    createOpen,
    onCreateOpenChange,
}: {
    createOpen: boolean;
    onCreateOpenChange: (open: boolean) => void;
}) {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<FormValues>();
    const linkValue = Form.useWatch("link", form);
    const [banners, setBanners] = useState<BannerAnnouncement[]>([]);
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<string>("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState<BannerDialog | null>(null);
    const [titleRuns, setTitleRuns] = useState<BannerTitleRun[]>([]);
    const [noticeType, setNoticeType] = useState<BannerNoticeType>(BANNER_NOTICE_DEFAULT_TYPE);
    const [titleTouched, setTitleTouched] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const reload = async (targetPage = page, targetPageSize = pageSize) => {
        setLoading(true);
        try {
            const data = await listAdminBanners({
                keyword: keyword.trim() || undefined,
                status: status === "all" ? undefined : status,
                page: targetPage,
                pageSize: targetPageSize,
            });
            setBanners(data.banners || []);
            setTotal(data.total || 0);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.adminBannerAnnouncementsPanel.failedToLoadPersistentNotices"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void reload(1, pageSize);
    }, [keyword, status]);

    const openCreate = useCallback(() => {
        setTitleRuns([]);
        setNoticeType(BANNER_NOTICE_DEFAULT_TYPE);
        setTitleTouched(false);
        setDirty(false);
        form.resetFields();
        form.setFieldsValue({
            noticeType: BANNER_NOTICE_DEFAULT_TYPE,
            status: true,
            sortOrder: 0,
        });
        setDialog({ mode: "create" });
    }, [form]);

    // 父级的 createOpen 只是「请求新建」信号：消费后立即复位，避免它再次触发时把编辑中的内容重置掉。
    useEffect(() => {
        if (!createOpen) return;
        onCreateOpenChange(false);
        openCreate();
    }, [createOpen, onCreateOpenChange, openCreate]);

    const openEdit = (banner: BannerAnnouncement) => {
        const initialRuns = banner.titleRuns?.length ? banner.titleRuns : banner.title ? [{ text: banner.title }] : [];
        const type = normalizeBannerNoticeType(banner.noticeType);
        setTitleRuns(initialRuns);
        setNoticeType(type);
        setTitleTouched(false);
        setDirty(false);
        form.setFieldsValue({
            noticeType: type,
            link: banner.link || undefined,
            status: banner.status === "active",
            sortOrder: banner.sortOrder ?? 0,
            dateRange: banner.startsAt || banner.endsAt ? [banner.startsAt ? dayjs(banner.startsAt) : null, banner.endsAt ? dayjs(banner.endsAt) : null] : null,
        });
        setDialog({ mode: "edit", banner });
    };

    const requestClose = () => {
        if (submitting) return;
        if (!dirty) {
            setDialog(null);
            return;
        }
        modal.confirm({
            title: translate("admin.adminBannerAnnouncementsPanel.discardUnsavedChanges"),
            content: translate("admin.adminBannerAnnouncementsPanel.yourCurrentEditsWillBeDiscardedWhenYouClose"),
            okText: translate("admin.adminBannerAnnouncementsPanel.discardChanges"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => setDialog(null),
        });
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteAdminBanner(id);
            message.success(translate("admin.adminBannerAnnouncementsPanel.persistentNoticeDeleted"));
            void queryClient.invalidateQueries({ queryKey: ["active-banner-announcements"] });
            void reload(page, pageSize);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("library.picker.deleteFailed"));
        }
    };

    const handleToggleStatus = async (banner: BannerAnnouncement, nextStatus: boolean) => {
        try {
            await updateAdminBanner(banner.id, {
                title: banner.title,
                // 必须带上样式分段与通知类型：后端更新走显式字段表，漏传会把它们清空。
                titleRuns: banner.titleRuns,
                noticeType: normalizeBannerNoticeType(banner.noticeType),
                link: banner.link,
                status: nextStatus ? "active" : "disabled",
                startsAt: banner.startsAt,
                endsAt: banner.endsAt,
            });
            message.success(nextStatus ? translate("admin.adminBannerAnnouncementsPanel.persistentNoticeEnabled") : translate("admin.adminBannerAnnouncementsPanel.persistentNoticeDisabled"));
            void queryClient.invalidateQueries({ queryKey: ["active-banner-announcements"] });
            void reload(page, pageSize);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.adminBannerAnnouncementsPanel.failedToUpdateStatus"));
        }
    };

    const handleSubmit = async (values: FormValues) => {
        setTitleTouched(true);
        const runs = normalizeBannerTitleRuns(titleRuns);
        const plain = bannerTitlePlainText(runs).trim();
        if (!plain || !runs.length) {
            message.error(translate("admin.adminBannerAnnouncementsPanel.enterANoticeTitle"));
            return;
        }
        if (bannerTitleCharCount(runs) > BANNER_TITLE_MAX_CHARS) {
            message.error(translate("admin.adminBannerAnnouncementsPanel.theNoticeTitleMustNotExceedCharacters", { v0: String(BANNER_TITLE_MAX_CHARS) }));
            return;
        }
        setSubmitting(true);
        try {
            const startsAt = values.dateRange?.[0] ? values.dateRange[0].toISOString() : undefined;
            const endsAt = values.dateRange?.[1] ? values.dateRange[1].toISOString() : undefined;
            const selectedNoticeType = values.noticeType || noticeType;
            const payload = {
                title: plain,
                titleRuns: runs,
                noticeType: selectedNoticeType,
                link: values.link?.trim() || undefined,
                status: (values.status ? "active" : "disabled") as "active" | "disabled",
                sortOrder: values.sortOrder || 0,
                startsAt,
                endsAt,
            };

            if (dialog?.mode === "edit") {
                await updateAdminBanner(dialog.banner.id, payload);
                message.success(translate("admin.adminBannerAnnouncementsPanel.persistentNoticeUpdated"));
            } else {
                await createAdminBanner(payload);
                message.success(translate("admin.adminBannerAnnouncementsPanel.persistentNoticeCreated"));
            }
            setDialog(null);
            form.resetFields();
            void queryClient.invalidateQueries({ queryKey: ["active-banner-announcements"] });
            void reload(1, pageSize);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.adminBannerAnnouncementsPanel.failedToSaveThePersistentNotice"));
        } finally {
            setSubmitting(false);
        }
    };

    const columns: ColumnsType<BannerAnnouncement> = [
        {
            title: translate("admin.adminBannerAnnouncementsPanel.noticeTitle"),
            dataIndex: "title",
            key: "title",
            render: (text: string, record) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{text}</span>
                    {record.link ? (
                        <span className="font-mono text-[var(--fs-label)] text-foreground/45" title={record.link}>
                            {record.link.length > 44 ? `${record.link.slice(0, 44)}…` : record.link}
                        </span>
                    ) : null}
                </div>
            ),
        },
        {
            title: translate("account.settings.runninghub.kind"),
            key: "noticeType",
            width: 92,
            // 用真实底色渲染类型，和前台/预览看到的是同一个 token。
            render: (_, record) => (
                <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[var(--fs-micro)] font-semibold text-white"
                    style={bannerAnnouncementBarStyle(record.noticeType)}
                >
                    {bannerNoticeTypeLabel(record.noticeType)}
                </span>
            ),
        },
        {
            title: translate("library.tasks.detail.status"),
            dataIndex: "status",
            key: "status",
            width: 110,
            render: (value: string, record) => (
                <Switch
                    size="small"
                    checked={value === "active"}
                    onChange={(checked) => void handleToggleStatus(record, checked)}
                />
            ),
        },
        {
            title: translate("admin.adminBannerAnnouncementsPanel.validity"),
            key: "validity",
            width: 280,
            render: (_, record) => {
                if (!record.startsAt && !record.endsAt) {
                    return <span className="text-foreground/45">{translate("library.ark.expiry.none")}</span>;
                }
                const startStr = record.startsAt ? dayjs(record.startsAt).format("YYYY-MM-DD HH:mm") : translate("admin.adminBannerAnnouncementsPanel.noLimit");
                const endStr = record.endsAt ? dayjs(record.endsAt).format("YYYY-MM-DD HH:mm") : translate("admin.adminBannerAnnouncementsPanel.noLimit");
                return (
                    <span className="text-xs text-foreground/75 font-mono">
                        {startStr} {translate("admin.adminBannerAnnouncementsPanel.to")} {endStr}
                    </span>
                );
            },
        },
        {
            title: translate("library.tasks.detail.createdAt"),
            dataIndex: "createdAt",
            key: "createdAt",
            width: 160,
            render: (date: string) => <span className="text-xs text-foreground/60 font-mono">{dayjs(date).format("YYYY-MM-DD HH:mm")}</span>,
        },
        {
            title: translate("account.settings.runninghub.actions"),
            key: "action",
            width: 120,
            align: "right",
            render: (_, record) => (
                <div className="flex justify-end gap-1">
                    <Button type="text" size="small" icon={<Edit3 className="size-3.5" />} onClick={() => openEdit(record)}>
                        {translate("account.settings.channels.edit")}
                    </Button>
                    <Popconfirm title={translate("admin.adminBannerAnnouncementsPanel.deleteThisPersistentNotice")} onConfirm={() => void handleDelete(record.id)}>
                        <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />}>
                            {translate("common.delete")}
                        </Button>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    const hasFilters = Boolean(keyword.trim() || status !== "all");
    const titleMissing = titleTouched && (!titleRuns.length || !bannerTitlePlainText(titleRuns).trim());
    const titleTooLong = bannerTitleCharCount(titleRuns) > BANNER_TITLE_MAX_CHARS;

    return (
        <div className="flex min-h-0 flex-1 flex-col pb-4">
            <AdminDataTable
                toolbar={
                    <Input
                        allowClear
                        aria-label={translate("admin.adminBannerAnnouncementsPanel.searchPersistentNoticeTitles")}
                        className="app-list-search"
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={keyword}
                        placeholder={translate("admin.adminBannerAnnouncementsPanel.searchPersistentNoticeTitles")}
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                    />
                }
                toolbarActive={hasFilters}
                toolbarFilters={
                    <Select
                        aria-label={translate("admin.adminBannerAnnouncementsPanel.filterPersistentNoticesByStatus")}
                        className="w-32"
                        value={status}
                        onChange={(value) => {
                            setStatus(value);
                            setPage(1);
                        }}
                        options={[
                            { label: translate("library.ark.expiry.all"), value: "all" },
                            { label: translate("account.layout.oss.enabled"), value: "active" },
                            { label: translate("admin.adminBannerAnnouncementsPanel.disabled"), value: "disabled" },
                        ]}
                    />
                }
                onReset={() => {
                    setKeyword("");
                    setStatus("all");
                    setPage(1);
                }}
                table={{
                    rowKey: "id",
                    size: "small",
                    loading,
                    columns,
                    dataSource: banners,
                    pagination: {
                        current: page,
                        pageSize,
                        total,
                        onChange: (p, ps) => {
                            setPage(p);
                            setPageSize(ps);
                            void reload(p, ps);
                        },
                    },
                }}
            />

            <AdminModal
                title={dialog?.mode === "edit" ? translate("admin.adminBannerAnnouncementsPanel.editPersistentNotice") : translate("admin.adminBannerAnnouncementsPanel.newPersistentNotice")}
                open={Boolean(dialog)}
                onCancel={requestClose}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                centered
                destroyOnHidden
                width="min(880px, calc(100vw - 32px))"
            >
                <Form
                    form={form}
                    layout="vertical"
                    // 表单比弹窗高时在表单内部滚动，底部按钮始终可见；下拉层由 AntD 挂到 body，不会被裁剪。
                    style={{ maxHeight: "68vh", overflowY: "auto", paddingRight: 4 }}
                    onFinish={(values) => void handleSubmit(values)}
                    onValuesChange={() => setDirty(true)}
                >
                    <Form.Item name="noticeType" label={translate("admin.adminBannerAnnouncementsPanel.noticeType")} extra={translate("admin.adminBannerAnnouncementsPanel.setsTheNoticeBarBackgroundWithSeparateValuesForLight")}>
                        <BannerNoticeTypeSelector
                            value={noticeType}
                            onChange={(next) => {
                                setNoticeType(next);
                                form.setFieldValue("noticeType", next);
                                setDirty(true);
                            }}
                        />
                    </Form.Item>

                    <Form.Item
                        label={translate("admin.adminBannerAnnouncementsPanel.noticeTitle")}
                        required
                        validateStatus={titleMissing || titleTooLong ? "error" : undefined}
                        help={
                            titleMissing
                                ? translate("admin.adminBannerAnnouncementsPanel.enterAPersistentNoticeTitle")
                                : titleTooLong
                                  ? translate("admin.adminBannerAnnouncementsPanel.exceededTheCharacterLimit", { v0: String(BANNER_TITLE_MAX_CHARS) })
                                  : translate("admin.adminBannerAnnouncementsPanel.setTheFontSizeWeightFamilyAndColorForSelected")
                        }
                    >
                        <BannerTitleEditor
                            key={dialog?.mode === "edit" ? dialog.banner.id : "create"}
                            value={titleRuns}
                            onChange={(runs) => {
                                setTitleRuns(runs);
                                setDirty(true);
                            }}
                        />
                    </Form.Item>

                    {/* 预览放在 Form 内但不用 Form.Item：避免 AntD 向非表单控件注入 value/onChange/ref。 */}
                    <div className="mb-6">
                        <div className="mb-2 text-sm text-foreground/85">{translate("admin.adminBannerAnnouncementsPanel.userInterfacePreview")}</div>
                        <BannerNoticePreview runs={titleRuns} hasLink={Boolean(linkValue?.trim())} noticeType={noticeType} />
                    </div>

                    <Form.Item
                        name="link"
                        label={translate("admin.adminBannerAnnouncementsPanel.destinationLinkOptional")}
                        extra={translate("admin.adminBannerAnnouncementsPanel.supportsExternalHttpsLinksOrSitePathsStartingWithE")}
                        rules={[{ max: 500, message: translate("admin.adminBannerAnnouncementsPanel.linksMustNotExceed500Characters") }]}
                    >
                        <Input maxLength={500} placeholder={translate("admin.adminBannerAnnouncementsPanel.httpsOrProjects")} />
                    </Form.Item>

                    <Form.Item name="status" label={translate("admin.adminBannerAnnouncementsPanel.publicationStatus")} valuePropName="checked">
                        <Switch checkedChildren={translate("account.layout.oss.switchOn")} unCheckedChildren={translate("admin.adminBannerAnnouncementsPanel.disable")} />
                    </Form.Item>
                    <Form.Item name="sortOrder" label={translate("admin.adminBannerAnnouncementsPanel.displayOrder")} extra={translate("admin.adminBannerAnnouncementsPanel.lowerNumbersAppearFirstTiesAreOrderedByCreationTime")}>
                        <InputNumber min={0} max={999999} precision={0} className="w-full" />
                    </Form.Item>

                    <Form.Item name="dateRange" label={translate("admin.adminBannerAnnouncementsPanel.validityPeriodOptional")} extra={translate("admin.adminBannerAnnouncementsPanel.leaveBlankForNoExpirationIfATimeRangeIs")}>
                        <DatePicker.RangePicker showTime format="YYYY-MM-DD HH:mm" className="w-full" />
                    </Form.Item>
                </Form>
            </AdminModal>
        </div>
    );
}
