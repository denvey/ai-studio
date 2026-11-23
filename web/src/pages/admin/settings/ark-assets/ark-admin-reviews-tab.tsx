import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Input } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Check, RefreshCw, X } from "lucide-react";
import { useState } from "react";

import { approveAdminArkAssets, arkPortraitAssetFileUrl, listAdminArkReviews, rejectAdminArkAssets, type AdminArkReviewResult, type ArkPortraitAsset } from "@/services/api/ark-portraits";
import { AdminBatchBar, AdminDataTable, AdminRowActions, AdminTableEmpty, PaginationBar } from "../../components/admin-ui";
import { AdminSegmented } from "../../ui/controls";
import { AdminModal } from "../../ui/overlays";
import { ARK_KIND_LABEL, arkUserLabel, formatArkAdminDate } from "./ark-admin-shared";
import { adminArkGroupsQueryKey } from "./ark-admin-groups-tab";
import { translate } from "@/i18n";

type ReviewStatus = "pending_review" | "rejected";

/** 用户上传审核：通过后才提交方舟（CreateAsset）；提交失败的保留待审核并逐条提示原因。 */
export function ArkAdminReviewsTab() {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const [status, setStatus] = useState<ReviewStatus>("pending_review");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [selected, setSelected] = useState<string[]>([]);
    const [rejecting, setRejecting] = useState<string[] | null>(null);
    const [reason, setReason] = useState("");
    const [working, setWorking] = useState(false);
    const query = useQuery({
        queryKey: ["admin-ark-reviews", status, page, pageSize],
        queryFn: ({ signal }) => listAdminArkReviews({ status, page, pageSize }, signal),
        placeholderData: keepPreviousData,
    });
    const data = query.data;

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-ark-reviews"] });
        void queryClient.invalidateQueries({ queryKey: adminArkGroupsQueryKey });
    };

    const report = (verb: string, result: AdminArkReviewResult) => {
        if (result.succeeded.length) message.success(translate("adminPages.settings.arkAssets.arkAdminReviewsTab.assets", { v0: String(verb), v1: String(result.succeeded.length) }));
        if (result.failed.length) {
            modal.warning({
                title: translate("adminPages.settings.arkAssets.arkAdminReviewsTab.failedToAssets", { v0: String(result.failed.length), v1: String(verb) }),
                content: (
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                        {result.failed.map((item) => (
                            <li key={item.id}>
                                {data?.items.find((asset) => asset.id === item.id)?.name || item.id}：{item.error}
                            </li>
                        ))}
                    </ul>
                ),
            });
        }
        setSelected((current) => current.filter((id) => !result.succeeded.includes(id)));
        refresh();
    };

    const approve = async (ids: string[]) => {
        if (!ids.length) return;
        setWorking(true);
        try {
            report(translate("adminPages.settings.arkAssets.arkAdminReviewsTab.approve"), await approveAdminArkAssets(ids));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.settings.arkAssets.arkAdminReviewsTab.reviewFailed"));
        } finally {
            setWorking(false);
        }
    };

    const reject = async () => {
        if (!rejecting?.length) return;
        if (!reason.trim()) {
            message.warning(translate("adminPages.settings.arkAssets.arkAdminReviewsTab.pleaseEnterARejectionReasonTheUserWillSeeIt"));
            return;
        }
        setWorking(true);
        try {
            report(translate("adminPages.settings.arkAssets.arkAdminReviewsTab.reject"), await rejectAdminArkAssets(rejecting, reason.trim()));
            setRejecting(null);
            setReason("");
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.settings.arkAssets.arkAdminReviewsTab.rejectionFailed"));
        } finally {
            setWorking(false);
        }
    };

    const columns: ColumnsType<ArkPortraitAsset> = [
        {
            title: translate("nav.tools.assets"),
            key: "asset",
            render: (_, asset) => (
                <div className="flex min-w-0 items-center gap-3">
                    <a
                        href={arkPortraitAssetFileUrl(asset.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="admin-ark-review-thumb"
                        aria-label={translate("adminPages.settings.arkAssets.arkAdminReviewsTab.viewOriginal", { v0: String(asset.name) })}
                    >
                        <img src={arkPortraitAssetFileUrl(asset.id)} alt="" loading="lazy" decoding="async" />
                    </a>
                    <div className="min-w-0">
                        <div className="truncate font-medium" title={asset.name}>
                            {asset.name}
                        </div>
                        <div className="text-xs opacity-60">{asset.width && asset.height ? `${asset.width}×${asset.height}` : translate("adminPages.settings.arkAssets.arkAdminReviewsTab.unknownDimensions")}</div>
                    </div>
                </div>
            ),
        },
        { title: translate("library.ark.certify.groupLabel"), key: "group", width: 200, render: (_, asset) => (asset.group ? `${ARK_KIND_LABEL[asset.group.kind]} · ${asset.group.name}` : "-") },
        { title: translate("adminPages.settings.arkAssets.arkAdminReviewsTab.uploadedBy"), key: "uploader", width: 180, render: (_, asset) => arkUserLabel(asset.uploader) },
        { title: translate("adminPages.settings.arkAssets.arkAdminReviewsTab.uploadedAt"), key: "createdAt", width: 150, render: (_, asset) => formatArkAdminDate(asset.createdAt, true) },
        ...(status === "rejected" ? [{ title: translate("adminPages.settings.arkAssets.arkAdminReviewsTab.rejectionReason"), key: "error", render: (_: unknown, asset: ArkPortraitAsset) => asset.error || "-" }] : []),
        ...(status === "pending_review"
            ? [
                  {
                      title: translate("account.settings.runninghub.actions"),
                      key: "actions",
                      width: 150,
                      render: (_: unknown, asset: ArkPortraitAsset) => (
                          <AdminRowActions
                              primary={{ label: translate("adminPages.settings.arkAssets.arkAdminReviewsTab.approve"), icon: <Check className="size-3.5" />, disabled: working, onClick: () => approve([asset.id]) }}
                              actions={[{ key: "reject", label: translate("adminPages.settings.arkAssets.arkAdminReviewsTab.reject"), icon: <X className="size-3.5" />, danger: true, disabled: working, onClick: () => setRejecting([asset.id]) }]}
                          />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <div className="admin-settings-stack">
            <AdminDataTable<ArkPortraitAsset>
                toolbar={
                    <AdminSegmented<ReviewStatus>
                        ariaLabel={translate("adminPages.settings.arkAssets.arkAdminReviewsTab.reviewStatus")}
                        value={status}
                        onChange={(value) => {
                            setStatus(value);
                            setPage(1);
                            setSelected([]);
                        }}
                        options={[
                            { value: "pending_review", label: translate("adminPages.settings.arkAssets.arkAdminReviewsTab.inReview") },
                            { value: "rejected", label: translate("library.ark.asset.status.rejected") },
                        ]}
                    />
                }
                trailing={
                    <Button icon={<RefreshCw className="size-4" />} loading={query.isFetching} onClick={refresh}>
                        {translate("common.refresh")}
                    </Button>
                }
                batchActions={
                    status === "pending_review" ? (
                        <AdminBatchBar count={selected.length} onClear={() => setSelected([])}>
                            <Button size="small" type="primary" icon={<Check className="size-3.5" />} loading={working} onClick={() => void approve(selected)}>
                                {translate("adminPages.settings.arkAssets.arkAdminReviewsTab.approveAndSubmitToArk")}
                            </Button>
                            <Button size="small" danger icon={<X className="size-3.5" />} disabled={working} onClick={() => setRejecting(selected)}>
                                {translate("adminPages.settings.arkAssets.arkAdminReviewsTab.reject")}
                            </Button>
                        </AdminBatchBar>
                    ) : null
                }
                table={{
                    rowKey: "id",
                    columns,
                    dataSource: data?.items || [],
                    loading: query.isLoading,
                    pagination: false,
                    size: "middle",
                    rowSelection: status === "pending_review" ? { selectedRowKeys: selected, onChange: (keys) => setSelected(keys.map(String)) } : undefined,
                }}
                empty={
                    <AdminTableEmpty
                        title={status === "pending_review" ? translate("adminPages.settings.arkAssets.arkAdminReviewsTab.noUploadsAwaitingReview") : translate("adminPages.settings.arkAssets.arkAdminReviewsTab.noRejectedUploads")}
                        description={status === "pending_review" ? translate("adminPages.settings.arkAssets.arkAdminReviewsTab.imagesUploadedToUserCreatedAssetGroupsAppearHereWhen") : undefined}
                    />
                }
                footer={
                    data && (data.total > pageSize || page > 1) ? (
                        <PaginationBar
                            current={page}
                            pageSize={pageSize}
                            total={data.total}
                            onChange={(nextPage, nextSize) => {
                                setPage(nextSize !== pageSize ? 1 : nextPage);
                                setPageSize(nextSize);
                            }}
                            itemLabel={translate("adminPages.settings.arkAssets.arkAdminReviewsTab.assets2")}
                        />
                    ) : null
                }
            />
            <AdminModal
                open={Boolean(rejecting)}
                title={translate("adminPages.settings.arkAssets.arkAdminReviewsTab.rejectAssets", { v0: String(rejecting?.length || 0) })}
                okText={translate("adminPages.settings.arkAssets.arkAdminReviewsTab.reject")}
                okButtonProps={{ danger: true }}
                cancelText={translate("common.cancel")}
                confirmLoading={working}
                onCancel={() => {
                    if (!working) setRejecting(null);
                }}
                onOk={() => void reject()}
            >
                <Input.TextArea
                    autoFocus
                    value={reason}
                    maxLength={200}
                    autoSize={{ minRows: 3, maxRows: 6 }}
                    placeholder={translate("adminPages.settings.arkAssets.arkAdminReviewsTab.forExampleNotAClearFrontFacingPhotoContainsOther")}
                    onChange={(event) => setReason(event.target.value)}
                />
            </AdminModal>
        </div>
    );
}
