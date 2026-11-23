// 兑换码批次的创建抽屉、生成结果与批次明细弹窗。

import { App, Button, Form, Input, InputNumber, Popconfirm, Space } from "antd";
import { AdminDrawer, AdminModal } from "@/pages/admin/ui/overlays";
import { Ban, Copy, KeyRound, TicketCheck } from "lucide-react";
import { formatCredits } from "@/constant/credits";
import { type AdminRedeemCode, disableAdminRedeemCode, listAdminRedeemBatchCodes, type RedeemBatch } from "@/services/api/wallet";
import { AdminDataTable, AdminExportButton, AdminStatusBadge, AdminTableEmpty } from "./admin-ui";
import { useEffect, useRef, useState } from "react";
import { type ColumnsType } from "antd/es/table";
import { Select } from "@/components/ui/base/select";
import { PaginationBar } from "@/pages/admin/components/admin-ui";
import {
    DEFAULT_CREATE_VALUES,
    DETAIL_STATUS_LABELS,
    type DetailStatus,
    GENERATED_PREVIEW_LIMIT,
    MICRO_CREDITS_PER_CREDIT,
    type PendingRedeemBatch,
    type RedeemFormValues,
    emptyBatchSummary,
    formatTime,
    isMutationResultUncertain,
    renderCodeStatus,
} from "./redemption-codes-panel";
import { translate } from "@/i18n";

export function CreateRedeemBatchDrawer({
    open,
    creating,
    pending,
    form,
    watchedAmount,
    watchedCount,
    draftTotal,
    onClose,
    onPreview,
    onPendingChange,
    onConfirm,
}: {
    open: boolean;
    creating: boolean;
    pending: PendingRedeemBatch | null;
    form: ReturnType<typeof Form.useForm<RedeemFormValues>>[0];
    watchedAmount?: number | null;
    watchedCount?: number | null;
    draftTotal: number | null;
    onClose: () => void;
    onPreview: (values: RedeemFormValues) => void;
    onPendingChange: (values: PendingRedeemBatch | null) => void;
    onConfirm: () => void;
}) {
    return (
        <>
            <AdminDrawer
                title={translate("admin.redemptionCodesModals.generateARedemptionCodeBatch")}
                open={open && !pending}
                size="min(600px, 100vw)"
                onClose={onClose}
                rootClassName="admin-redemption-drawer"
                destroyOnHidden
                mask={{ closable: !creating && !pending }}
                keyboard={!creating && !pending}
                closable={!creating && !pending}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button disabled={creating || Boolean(pending)} onClick={onClose}>
                            {translate("common.cancel")}
                        </Button>
                        <Button type="primary" loading={creating} disabled={Boolean(pending)} icon={<TicketCheck className="size-4" />} onClick={() => form.submit()}>
                            {translate("admin.redemptionCodesModals.reviewAndContinue")}
                        </Button>
                    </div>
                }
            >
                <div className="admin-redemption-drawer-intro">
                    <span className="admin-redemption-drawer-intro-icon" aria-hidden="true">
                        <KeyRound className="size-4" />
                    </span>
                    <div>
                        <strong>{translate("admin.redemptionCodesModals.generateSensitiveCredentialsInBulk")}</strong>
                        <p>{translate("admin.redemptionCodesModals.confirmingCreatesTheEntireBatchInOneOperationTheAPI")}</p>
                    </div>
                </div>
                <Form form={form} layout="vertical" requiredMark={false} initialValues={DEFAULT_CREATE_VALUES} onFinish={onPreview}>
                    <section className="admin-redemption-drawer-section">
                        <div className="admin-redemption-drawer-section-heading">
                            <h3>{translate("admin.redemptionCodesModals.batchSettings")}</h3>
                            <p>{translate("admin.redemptionCodesModals.creditsSupportUpTo6DecimalPlacesEachBatchCan")}</p>
                        </div>
                        <div className="admin-redemption-form-grid">
                            <Form.Item
                                name="amount"
                                label={translate("admin.redemptionCodesModals.creditsPerRedemptionCode")}
                                rules={[
                                    { required: true, message: translate("admin.redemptionCodesModals.enterTheCreditDenomination") },
                                    {
                                        validator: (_, value) => {
                                            const numberValue = Number(value);
                                            const microcredits = Math.round(numberValue * MICRO_CREDITS_PER_CREDIT);
                                            return Number.isFinite(numberValue) && numberValue > 0 && Number.isSafeInteger(microcredits) && microcredits > 0 ? Promise.resolve() : Promise.reject(new Error(translate("admin.redemptionCodesModals.enterASafelySupportedCreditAmountGreaterThan0")));
                                        },
                                    },
                                ]}
                            >
                                <InputNumber className="w-full" min={0.000001} precision={6} placeholder={translate("admin.redemptionCodesModals.eG10")} />
                            </Form.Item>
                            <Form.Item
                                name="count"
                                label={translate("library.tasks.params.count")}
                                rules={[
                                    { required: true, message: translate("admin.redemptionCodesModals.enterHowManyToGenerate") },
                                    {
                                        validator: (_, value) => (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5000 ? Promise.resolve() : Promise.reject(new Error(translate("admin.redemptionCodesModals.enterAnIntegerFrom1To5000")))),
                                    },
                                ]}
                            >
                                <InputNumber className="w-full" min={1} max={5000} precision={0} placeholder={translate("admin.redemptionCodesModals.eG100")} />
                            </Form.Item>
                        </div>
                        <Form.Item
                            name="expiresAt"
                            label={translate("admin.redemptionCodesModals.expiresAt")}
                            extra={translate("admin.redemptionCodesModals.leaveBlankForNoExpirationServerTimeIsAuthoritative")}
                            rules={[
                                {
                                    validator: (_, value) => {
                                        if (!value) return Promise.resolve();
                                        const timestamp = new Date(value).getTime();
                                        return Number.isFinite(timestamp) && timestamp > Date.now() ? Promise.resolve() : Promise.reject(new Error(translate("admin.redemptionCodesModals.theExpirationTimeMustBeInTheFuture")));
                                    },
                                },
                            ]}
                        >
                            <Input type="datetime-local" aria-label={translate("admin.redemptionCodesModals.batchExpirationTime")} />
                        </Form.Item>
                        <Form.Item name="note" label={translate("admin.redemptionCodesModals.batchNotes")} extra={translate("admin.redemptionCodesModals.usedForListSearchesAndLaterTrackingNotShownTo")}>
                            <Input.TextArea rows={3} maxLength={500} showCount placeholder={translate("admin.redemptionCodesModals.eGFall2026CampaignDistribution")} />
                        </Form.Item>
                        <dl className="admin-redemption-live-summary" aria-label={translate("admin.redemptionCodesModals.batchSummaryBeforeGeneration")}>
                            <div>
                                <dt>{translate("admin.redemptionCodesModals.creditsPerCode")}</dt>
                                <dd>{Number(watchedAmount) > 0 ? formatCredits(Math.round(Number(watchedAmount) * MICRO_CREDITS_PER_CREDIT)) : "--"}</dd>
                            </div>
                            <div>
                                <dt>{translate("library.tasks.params.count")}</dt>
                                <dd>{Number.isInteger(Number(watchedCount)) && Number(watchedCount) > 0 ? translate("admin.redemptionCodesModals.items", { v0: String(Number(watchedCount)) }) : "--"}</dd>
                            </div>
                            <div className="is-emphasis">
                                <dt>{translate("admin.redemptionCodesModals.totalBatchValue")}</dt>
                                <dd>{draftTotal !== null ? formatCredits(draftTotal) : "--"}</dd>
                            </div>
                        </dl>
                    </section>
                </Form>
            </AdminDrawer>

            <AdminModal
                title={translate("admin.redemptionCodesModals.confirmRedemptionCodeBatchGeneration")}
                open={Boolean(pending)}
                okText={translate("admin.redemptionCodesModals.confirmAndGenerate")}
                cancelText={translate("admin.redemptionCodesModals.backToEditing")}
                onCancel={() => {
                    if (!creating) onPendingChange(null);
                }}
                onOk={onConfirm}
                confirmLoading={creating}
                mask={{ closable: !creating }}
                closable={!creating}
                keyboard={!creating}
                destroyOnHidden
            >
                {pending ? (
                    <div className="admin-operation-confirmation">
                        <p className="admin-operation-confirmation-copy">{translate("admin.redemptionCodesModals.reviewTheBatchSTotalValueAndExpirationConfirmingGenerates")}</p>
                        <dl className="admin-operation-confirmation-grid">
                            <div>
                                <dt>{translate("admin.redemptionCodesModals.creditsPerCode")}</dt>
                                <dd>{formatCredits(pending.amountMicrocredits)}</dd>
                            </div>
                            <div>
                                <dt>{translate("library.tasks.params.count")}</dt>
                                <dd>{pending.count} {translate("admin.redemptionCodesModals.items2")}</dd>
                            </div>
                            <div>
                                <dt>{translate("admin.redemptionCodesModals.totalBatchValue")}</dt>
                                <dd className="is-positive">{formatCredits(pending.totalMicrocredits)}</dd>
                            </div>
                            <div>
                                <dt>{translate("admin.redemptionCodesModals.expiresAt")}</dt>
                                <dd>{pending.expiresAt ? formatTime(pending.expiresAt) : translate("admin.redemptionCodesModals.neverExpires")}</dd>
                            </div>
                            <div className="is-wide">
                                <dt>{translate("admin.redemptionCodesModals.batchNotes")}</dt>
                                <dd>{pending.note || translate("admin.redemptionCodesModals.notFilledIn")}</dd>
                            </div>
                        </dl>
                    </div>
                ) : null}
            </AdminModal>
        </>
    );
}

export function BatchStatusDistribution({ batch }: { batch: RedeemBatch }) {
    return (
        <div className="admin-redemption-status-distribution" aria-label={translate("admin.redemptionCodesModals.availableRedeemedExpiredDisabled", { v0: String(batch.availableCount ?? 0), v1: String(batch.redeemedCount ?? 0), v2: String(batch.expiredCount ?? 0), v3: String(batch.disabledCount ?? 0) })}>
            <AdminStatusBadge label={translate("admin.redemptionCodesModals.available", { v0: String(batch.availableCount ?? 0) })} tone="success" />
            <AdminStatusBadge label={translate("admin.redemptionCodesModals.redeemed", { v0: String(batch.redeemedCount ?? 0) })} tone="info" />
            <AdminStatusBadge label={translate("admin.redemptionCodesModals.expired", { v0: String(batch.expiredCount ?? 0) })} tone="warning" />
            <AdminStatusBadge label={translate("admin.redemptionCodesModals.disabled", { v0: String(batch.disabledCount ?? 0) })} tone="neutral" />
        </div>
    );
}

export function GeneratedCodesModal({ codes, batchId, onClose }: { codes: string[]; batchId: string; onClose: () => void }) {
    const { message } = App.useApp();
    const content = codes.join("\n");
    const previewContent = codes.slice(0, GENERATED_PREVIEW_LIMIT).join("\n");
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(content);
            message.success(translate("admin.redemptionCodesModals.allRedemptionCodesCopied"));
        } catch {
            message.error(translate("admin.redemptionCodesModals.copyFailedDownloadTheTXTFileToSaveTheRedemption"));
        }
    };
    return (
        <AdminModal
            title={translate("admin.redemptionCodesModals.generatedRedemptionCodes", { v0: String(codes.length) })}
            open={codes.length > 0}
            onCancel={onClose}
            destroyOnHidden
            footer={
                <Space>
                    <Button onClick={onClose}>{translate("account.payment.done")}</Button>
                    <Button icon={<Copy className="size-4" />} onClick={() => void copy()}>
                        {translate("admin.redemptionCodesModals.copyAll")}
                    </Button>
                    <AdminExportButton
                        type="primary"
                        exportFile={() => new Blob([content + "\n"], { type: "text/plain;charset=utf-8" })}
                        fileName={() => translate("admin.redemptionCodesModals.redemptionCodesTxt", { v0: String(batchId.slice(0, 8) || translate("admin.redemptionCodesModals.newBatch")), v1: String(new Date().toISOString().slice(0, 10)) })}
                        label={translate("admin.redemptionCodesModals.downloadTXT")}
                    />
                </Space>
            }
            width={760}
        >
            <div className="admin-redemption-sensitive-notice" role="status">
                {translate("admin.redemptionCodesModals.redemptionCodesAreStoredEncryptedAndCanBeViewedAgain")}
            </div>
            {codes.length > GENERATED_PREVIEW_LIMIT ? (
                <p className="admin-generated-codes-preview-note">
                    {translate("admin.redemptionCodesModals.toKeepThePageResponsiveOnlyTheFirst")} {GENERATED_PREVIEW_LIMIT} {translate("admin.redemptionCodesModals.codesArePreviewedCopyingAndDownloadingIncludeAll")} {codes.length} {translate("admin.redemptionCodesModals.redemptionCodes")}
                </p>
            ) : null}
            <Input.TextArea aria-label={translate("admin.redemptionCodesModals.newRedemptionCodePreview")} value={previewContent} readOnly autoSize={{ minRows: 10, maxRows: 18 }} className="font-mono text-xs" />
        </AdminModal>
    );
}

export function RedeemBatchCodesModal({ batch, onClose, onBatchChanged }: { batch: RedeemBatch | null; onClose: () => void; onBatchChanged: () => void | Promise<unknown> }) {
    const { message } = App.useApp();
    const [batchSummary, setBatchSummary] = useState<RedeemBatch | null>(batch);
    const [codes, setCodes] = useState<AdminRedeemCode[]>([]);
    const [loading, setLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [plaintextAvailable, setPlaintextAvailable] = useState(true);
    const [status, setStatus] = useState<DetailStatus>("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [total, setTotal] = useState(0);
    const [disablingCodeIds, setDisablingCodeIds] = useState<Set<string>>(() => new Set());
    const requestRef = useRef(0);
    const codeMutationsRef = useRef(new Set<string>());

    const loadDetails = async (targetPage = page, targetPageSize = pageSize, targetStatus = status) => {
        if (!batch) return false;
        const requestId = ++requestRef.current;
        setLoading(true);
        setDetailError("");
        setCodes([]);
        setTotal(0);
        try {
            const result = await listAdminRedeemBatchCodes(batch.id, { status: targetStatus === "all" ? undefined : targetStatus, page: targetPage, pageSize: targetPageSize });
            if (requestId !== requestRef.current) return false;
            const lastPage = Math.max(1, Math.ceil(result.total / targetPageSize));
            if (targetPage > lastPage) {
                setPage(lastPage);
                return true;
            }
            setCodes(result.codes);
            setTotal(result.total);
            setPlaintextAvailable(result.plaintextAvailable);
            setBatchSummary(result.batch);
            return true;
        } catch (error) {
            if (requestId === requestRef.current) {
                const detail = error instanceof Error ? error.message : translate("admin.redemptionCodesModals.failedToLoadRedemptionCodeDetails");
                setDetailError(detail);
                message.error(detail);
            }
            return false;
        } finally {
            if (requestId === requestRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        void loadDetails(page, pageSize, status);
    }, [batch, page, pageSize, status]);

    const copyCode = async (code?: string) => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            message.success(translate("admin.redemptionCodesModals.redemptionCodeCopied"));
        } catch {
            message.error(translate("admin.redemptionCodesModals.copyFailedCheckTheBrowserSClipboardPermission"));
        }
    };
    const copyPage = async () => {
        const content = codes
            .map((item) => item.code)
            .filter((code): code is string => Boolean(code))
            .join("\n");
        if (!content) return;
        try {
            await navigator.clipboard.writeText(content);
            message.success(translate("admin.redemptionCodesModals.redemptionCodesOnThisPageCopied"));
        } catch {
            message.error(translate("admin.redemptionCodesModals.copyFailedCheckTheBrowserSClipboardPermission"));
        }
    };
    const disableCode = async (item: AdminRedeemCode) => {
        if (!batch || codeMutationsRef.current.has(item.id)) return;
        codeMutationsRef.current.add(item.id);
        setDisablingCodeIds((current) => new Set(current).add(item.id));
        try {
            await disableAdminRedeemCode(batch.id, item.id);
            message.success(translate("admin.redemptionCodesModals.redemptionCodeDisabled"));
        } catch (error) {
            const detail = error instanceof Error ? error.message : translate("admin.redemptionCodesModals.failedToDisableRedemptionCode");
            if (isMutationResultUncertain(error)) message.warning({ content: translate("admin.redemptionCodesModals.theDisableResultCannotBeConfirmedDetailsHaveBeenRefreshed", { v0: String(detail) }), duration: 6 });
            else message.error(detail);
        } finally {
            await Promise.all([loadDetails(page, pageSize, status), Promise.resolve(onBatchChanged())]);
            codeMutationsRef.current.delete(item.id);
            setDisablingCodeIds((current) => {
                const next = new Set(current);
                next.delete(item.id);
                return next;
            });
        }
    };
    const detailsMutating = disablingCodeIds.size > 0;
    const columns: ColumnsType<AdminRedeemCode> = [
        {
            title: translate("account.wallet.redeemTitle"),
            width: 330,
            render: (_, item) => (
                <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-xs">{item.code || translate("admin.redemptionCodesModals.plaintextCannotBeRecovered", { v0: String(item.codeSuffix) })}</code>
                    <Button type="text" size="small" aria-label={translate("admin.redemptionCodesModals.copyRedemptionCode")} icon={<Copy className="size-3.5" />} disabled={!item.code || loading || detailsMutating} onClick={() => void copyCode(item.code)} />
                </div>
            ),
        },
        { title: translate("library.tasks.detail.status"), dataIndex: "status", width: 110, align: "center", render: renderCodeStatus },
        {
            title: translate("admin.redemptionCodesModals.redeemedBy"),
            width: 190,
            render: (_, item) =>
                item.redeemedBy ? (
                    <div>
                        <div className="text-sm">{item.redeemedDisplayName || item.redeemedUsername || item.redeemedBy}</div>
                        <div className="truncate text-xs text-foreground/40">{item.redeemedUsername ? `@${item.redeemedUsername}` : item.redeemedBy}</div>
                    </div>
                ) : (
                    <span className="text-foreground/35">--</span>
                ),
        },
        { title: translate("admin.redemptionCodesModals.redeemedAt"), dataIndex: "redeemedAt", width: 180, align: "center", render: formatTime },
        { title: translate("admin.redemptionCodesModals.redemptionIP"), dataIndex: "redeemedIp", width: 150, align: "center", render: (value) => value || <span className="text-foreground/35">--</span> },
        {
            title: translate("account.settings.runninghub.actions"),
            width: 90,
            align: "center",
            render: (_, item) =>
                item.status === "unused" ? (
                    <Popconfirm
                        title={translate("admin.redemptionCodesModals.disableTheRedemptionCodeEndingIn", { v0: String(item.codeSuffix) })}
                        description={translate("admin.redemptionCodesModals.thisCodeIsWorthCreditsAndCannotBeRestoredAfter", { v0: String(formatCredits(item.amountMicrocredits)) })}
                        okText={translate("admin.redemptionCodesModals.confirmDisable")}
                        cancelText={translate("common.cancel")}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => disableCode(item)}
                    >
                        <Button type="text" size="small" danger disabled={detailsMutating && !disablingCodeIds.has(item.id)} loading={disablingCodeIds.has(item.id)} icon={<Ban className="size-3.5" />} aria-label={translate("admin.redemptionCodesModals.disableRedemptionCode")} />
                    </Popconfirm>
                ) : (
                    <span className="text-xs text-foreground/35">--</span>
                ),
        },
    ];

    return (
        <AdminModal
            title={batchSummary ? translate("admin.redemptionCodesModals.redemptionCodeDetails", { v0: String(batchSummary.note || formatTime(batchSummary.createdAt)) }) : translate("admin.redemptionCodesModals.redemptionCodeDetails2")}
            open={Boolean(batch)}
            onCancel={() => {
                if (!detailsMutating) onClose();
            }}
            destroyOnHidden
            mask={{ closable: !detailsMutating }}
            keyboard={!detailsMutating}
            closable={!detailsMutating}
            footer={
                <Space>
                    <Button icon={<Copy className="size-4" />} disabled={loading || detailsMutating || !codes.some((item) => item.code)} onClick={() => void copyPage()}>
                        {translate("admin.redemptionCodesModals.copyThisPage")}
                    </Button>
                    <Button type="primary" disabled={detailsMutating} onClick={onClose}>
                        {translate("common.close")}
                    </Button>
                </Space>
            }
            width={1080}
        >
            {!plaintextAvailable ? <div className="admin-redemption-sensitive-notice is-warning">{translate("admin.redemptionCodesModals.thisBatchPredatesEncryptedPlaybackSoOnlyHashesWereStored")}</div> : null}
            <div className="admin-redemption-detail-summary">
                <BatchStatusDistribution batch={batchSummary || batch || emptyBatchSummary} />
                <span>{translate("admin.redemptionCodesModals.perCode")} {formatCredits(batchSummary?.amountMicrocredits ?? batch?.amountMicrocredits ?? 0)} {translate("shell.credits")}</span>
                <span>{translate("admin.redemptionCodesModals.total")} {batchSummary?.count ?? batch?.count ?? 0}</span>
                <span>{batchSummary?.expiresAt || batch?.expiresAt ? translate("admin.redemptionCodesModals.expires", { v0: String(formatTime(batchSummary?.expiresAt || batch?.expiresAt)) }) : translate("admin.redemptionCodesModals.neverExpires")}</span>
                <span>{translate("admin.redemptionCodesModals.created")} {formatTime(batchSummary?.createdAt || batch?.createdAt)}</span>
                <code>{translate("admin.redemptionCodesModals.batch")} {String(batchSummary?.id || batch?.id || "").slice(0, 8)}</code>
            </div>
            <div className={`admin-modal-data-table-shell${detailsMutating ? " is-mutating" : ""}`}>
                <AdminDataTable
                    toolbar={
                        <Select<DetailStatus>
                            aria-label={translate("admin.redemptionCodesModals.filterByRedemptionCodeStatus")}
                            className="w-32"
                            disabled={detailsMutating}
                            value={status}
                            onChange={(value) => {
                                setStatus(value);
                                setPage(1);
                            }}
                            options={(Object.entries(DETAIL_STATUS_LABELS) as Array<[DetailStatus, string]>).map(([value, label]) => ({ value, label }))}
                        />
                    }
                    toolbarActive={status !== "all"}
                    onReset={() => {
                        if (detailsMutating) return;
                        setStatus("all");
                        setPage(1);
                    }}
                    table={{ className: "app-data-table", rowKey: "id", size: "small", loading, columns, dataSource: codes, pagination: false, scroll: { x: 960 } }}
                    empty={<AdminTableEmpty filtered={status !== "all"} title={detailError ? translate("admin.redemptionCodesModals.failedToLoadDetails") : status === "all" ? translate("admin.redemptionCodesModals.noRedemptionCodes") : undefined} description={detailError || undefined} />}
                    footer={
                        <PaginationBar
                            alwaysShow
                            current={page}
                            pageSize={pageSize}
                            total={total}
                            onChange={(nextPage, nextSize) => {
                                setPage(nextSize !== pageSize ? 1 : nextPage);
                                setPageSize(nextSize);
                            }}
                        />
                    }
                />
            </div>
        </AdminModal>
    );
}
