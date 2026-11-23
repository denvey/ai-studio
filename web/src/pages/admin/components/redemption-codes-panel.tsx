import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Form, Input } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Ban, Eye, RefreshCw, Search, TicketCheck } from "lucide-react";

import { PaginationBar } from "@/pages/admin/components/admin-ui";
import { formatCredits } from "@/constant/credits";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError } from "@/services/api/request";
import { createAdminRedeemBatch, disableAdminRedeemBatch, listAdminRedeemBatches, type AdminRedeemCode, type RedeemBatch } from "@/services/api/wallet";
import { AdminDataTable, AdminRowActions, AdminStatusBadge, AdminTableEmpty, type AdminStatusTone } from "./admin-ui";
import { Select } from "@/components/ui/base/select";
import { BatchStatusDistribution, CreateRedeemBatchDrawer, GeneratedCodesModal, RedeemBatchCodesModal } from "./redemption-codes-modals";
import { currentLocale, translate } from "@/i18n";

export type RedeemFormValues = { amount?: number | null; count?: number | null; note?: string; expiresAt?: string };
export type PendingRedeemBatch = {
    amountMicrocredits: number;
    count: number;
    totalMicrocredits: number;
    note?: string;
    expiresAt?: string;
};
type BatchValidity = "all" | "active" | "expired";
export type DetailStatus = "all" | "available" | "redeemed" | "expired" | "disabled";

export const MICRO_CREDITS_PER_CREDIT = 1_000_000;
export const DEFAULT_CREATE_VALUES: RedeemFormValues = { amount: 10, count: 10 };
export const GENERATED_PREVIEW_LIMIT = 200;
export const DETAIL_STATUS_LABELS: Record<DetailStatus, string> = {
    all: translate("library.ark.expiry.all"),
    available: translate("account.settings.channels.ready"),
    redeemed: translate("admin.redemptionCodesPanel.redeemed"),
    expired: translate("library.ark.expiry.expired"),
    disabled: translate("admin.redemptionCodesPanel.disabled"),
};

export default function RedemptionCodesPanel({ createOpen, onCreateOpenChange, onCreateBlockedChange }: { createOpen: boolean; onCreateOpenChange: (open: boolean) => void; onCreateBlockedChange: (blocked: boolean) => void }) {
    const { message } = App.useApp();
    const [batches, setBatches] = useState<RedeemBatch[]>([]);
    const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
    const [generatedBatchId, setGeneratedBatchId] = useState("");
    const [selectedBatch, setSelectedBatch] = useState<RedeemBatch | null>(null);
    const [pendingCreate, setPendingCreate] = useState<PendingRedeemBatch | null>(null);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState("");
    const [uncertainCreateNotice, setUncertainCreateNotice] = useState("");
    const [creating, setCreating] = useState(false);
    const [disablingBatchIds, setDisablingBatchIds] = useState<Set<string>>(() => new Set());
    const [keyword, setKeyword] = useState("");
    const debouncedKeyword = useDebouncedValue(keyword);
    const [validity, setValidity] = useState<BatchValidity>("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [form] = Form.useForm<RedeemFormValues>();
    const listRequestRef = useRef(0);
    const createInFlightRef = useRef(false);
    const batchMutationsRef = useRef(new Set<string>());
    const watchedAmount = Form.useWatch("amount", form);
    const watchedCount = Form.useWatch("count", form);

    const draftTotal = useMemo(() => {
        const amount = Number(watchedAmount);
        const count = Number(watchedCount);
        if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(count) || count <= 0) return null;
        const amountMicrocredits = Math.round(amount * MICRO_CREDITS_PER_CREDIT);
        const totalMicrocredits = amountMicrocredits * count;
        return Number.isSafeInteger(amountMicrocredits) && Number.isSafeInteger(totalMicrocredits) ? totalMicrocredits : null;
    }, [watchedAmount, watchedCount]);

    const reload = async (targetPage = page, targetPageSize = pageSize, queryOverride?: { keyword?: string; validity?: BatchValidity }) => {
        const requestId = ++listRequestRef.current;
        const queryKeyword = (queryOverride?.keyword ?? debouncedKeyword).trim();
        const queryValidity = queryOverride?.validity ?? validity;
        setLoading(true);
        setListError("");
        setBatches([]);
        setTotal(0);
        try {
            const result = await listAdminRedeemBatches({
                keyword: queryKeyword || undefined,
                validity: queryValidity === "all" ? undefined : queryValidity,
                page: targetPage,
                pageSize: targetPageSize,
            });
            if (requestId !== listRequestRef.current) return false;
            const lastPage = Math.max(1, Math.ceil(result.total / targetPageSize));
            if (targetPage > lastPage) {
                setPage(lastPage);
                return true;
            }
            setBatches(result.batches);
            setTotal(result.total);
            return true;
        } catch (error) {
            if (requestId === listRequestRef.current) {
                const detail = error instanceof Error ? error.message : translate("admin.redemptionCodesPanel.failedToLoadRedemptionCodeBatches");
                setListError(detail);
                message.error(detail);
            }
            return false;
        } finally {
            if (requestId === listRequestRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        if (createOpen) form.setFieldsValue(DEFAULT_CREATE_VALUES);
    }, [createOpen, form]);

    useEffect(() => {
        void reload(page, pageSize);
    }, [debouncedKeyword, validity, page, pageSize]);

    const closeCreateDrawer = () => {
        if (creating || pendingCreate) return;
        form.resetFields();
        onCreateOpenChange(false);
    };

    const previewCreate = (values: RedeemFormValues) => {
        const amount = Number(values.amount);
        const count = Number(values.count);
        const amountMicrocredits = Math.round(amount * MICRO_CREDITS_PER_CREDIT);
        const totalMicrocredits = amountMicrocredits * count;
        if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amountMicrocredits) || amountMicrocredits <= 0 || !Number.isInteger(count) || count < 1 || count > 5000 || !Number.isSafeInteger(totalMicrocredits)) {
            message.error(translate("admin.redemptionCodesPanel.theCreditValueOrCodeCountExceedsTheSafelySupported"));
            return;
        }
        let expiresAt: string | undefined;
        if (values.expiresAt) {
            const timestamp = new Date(values.expiresAt);
            if (Number.isNaN(timestamp.getTime()) || timestamp.getTime() <= Date.now()) {
                form.setFields([{ name: "expiresAt", errors: [translate("admin.redemptionCodesPanel.theExpirationTimeMustBeInTheFuture")] }]);
                return;
            }
            expiresAt = timestamp.toISOString();
        }
        setPendingCreate({ amountMicrocredits, count, totalMicrocredits, note: values.note?.trim() || undefined, expiresAt });
    };

    const createBatch = async () => {
        if (!pendingCreate || createInFlightRef.current) return;
        createInFlightRef.current = true;
        setCreating(true);
        try {
            const result = await createAdminRedeemBatch({
                amountMicrocredits: pendingCreate.amountMicrocredits,
                count: pendingCreate.count,
                note: pendingCreate.note,
                expiresAt: pendingCreate.expiresAt,
            });
            setPendingCreate(null);
            form.resetFields();
            onCreateOpenChange(false);
            setGeneratedCodes(result.codes);
            setGeneratedBatchId(result.batch.id);
            setPage(1);
            await reload(1, pageSize);
            message.success(translate("admin.redemptionCodesPanel.generatedRedemptionCodes", { v0: String(result.codes.length) }));
        } catch (error) {
            const detail = error instanceof Error ? error.message : translate("admin.redemptionCodesPanel.failedToGenerateRedemptionCodes");
            if (isMutationResultUncertain(error)) {
                setPendingCreate(null);
                form.resetFields();
                onCreateOpenChange(false);
                onCreateBlockedChange(true);
                setPage(1);
                setKeyword("");
                setValidity("all");
                const refreshed = await reload(1, pageSize, { keyword: "", validity: "all" });
                setUncertainCreateNotice(translate("admin.redemptionCodesPanel.theLastGenerationRequestResultCannotBeConfirmedGenerationIs", { v0: String(detail), v1: String(refreshed ? translate("admin.redemptionCodesPanel.theFullUnfilteredListIsDisplayedReviewTheLatestBatches") : translate("admin.redemptionCodesPanel.failedToRefreshTheFullListRefreshAgainAfterThe")) }));
                message.warning({ content: translate("admin.redemptionCodesPanel.theGenerationResultNeedsReviewNoAutomaticRetryWasMade"), duration: 7 });
            } else {
                setPendingCreate(null);
                message.error(detail);
            }
        } finally {
            createInFlightRef.current = false;
            setCreating(false);
        }
    };

    const disableBatch = async (batch: RedeemBatch) => {
        if (batchMutationsRef.current.has(batch.id)) return;
        batchMutationsRef.current.add(batch.id);
        setDisablingBatchIds((current) => new Set(current).add(batch.id));
        try {
            const result = await disableAdminRedeemBatch(batch.id);
            message.success(translate("admin.redemptionCodesPanel.disabledRedemptionCodes", { v0: String(result.disabledCount) }));
        } catch (error) {
            const detail = error instanceof Error ? error.message : translate("admin.redemptionCodesPanel.failedToDisableBatch");
            if (isMutationResultUncertain(error)) message.warning({ content: translate("admin.redemptionCodesPanel.theDisableResultCannotBeConfirmedBatchStatusHasBeen", { v0: String(detail) }), duration: 6 });
            else message.error(detail);
        } finally {
            batchMutationsRef.current.delete(batch.id);
            setDisablingBatchIds((current) => {
                const next = new Set(current);
                next.delete(batch.id);
                return next;
            });
            await reload(page, pageSize);
        }
    };

    const columns: ColumnsType<RedeemBatch> = [
        {
            title: translate("admin.redemptionCodesPanel.batch"),
            width: 240,
            render: (_, batch) => (
                <div className="min-w-0">
                    <div className="truncate font-medium">{batch.note || translate("admin.redemptionCodesPanel.batchWithoutANote")}</div>
                    <div className="mt-0.5 text-xs text-foreground/45">{formatTime(batch.createdAt)}</div>
                </div>
            ),
        },
        { title: translate("admin.redemptionCodesPanel.creditsPerCode"), dataIndex: "amountMicrocredits", width: 120, align: "center", render: (value) => <span className="font-medium tabular-nums">{formatCredits(value)}</span> },
        { title: translate("admin.redemptionCodesPanel.total"), dataIndex: "count", width: 80, align: "center", render: (value) => <span className="tabular-nums">{value}</span> },
        { title: translate("admin.redemptionCodesPanel.statusBreakdown"), width: 300, align: "center", render: (_, batch) => <BatchStatusDistribution batch={batch} /> },
        { title: translate("admin.redemptionCodesPanel.expiresAt"), dataIndex: "expiresAt", width: 180, align: "center", render: (value) => (value ? formatTime(value) : <AdminStatusBadge label={translate("admin.redemptionCodesPanel.neverExpires")} tone="info" />) },
        {
            title: translate("account.settings.runninghub.actions"),
            width: 220,
            align: "center",
            render: (_, batch) => (
                <div className="flex justify-center">
                    <AdminRowActions
                        primary={{ label: translate("admin.redemptionCodesPanel.viewDetails"), icon: <Eye className="size-3.5" />, onClick: () => setSelectedBatch(batch) }}
                        actions={[
                            {
                                key: "disable",
                                label: translate("admin.redemptionCodesPanel.disableBatch"),
                                icon: <Ban className="size-3.5" />,
                                danger: true,
                                disabled: (batch.availableCount ?? 0) <= 0 || disablingBatchIds.has(batch.id),
                                confirm: {
                                    title: translate("admin.redemptionCodesPanel.disableTheUnusedRedemptionCodesInThisBatch"),
                                    description: translate("admin.redemptionCodesPanel.redeemedAndExpiredRecordsAreUnchangedThisActionCannotBe", { v0: String(batch.note || translate("admin.redemptionCodesPanel.batch2", { v0: String(batch.id.slice(0, 8)) })), v1: String(formatBatchDisableImpact(batch)) }),
                                    okText: translate("admin.redemptionCodesPanel.confirmDisable"),
                                },
                                onClick: () => disableBatch(batch),
                            },
                        ]}
                    />
                </div>
            ),
        },
    ];
    const hasFilters = Boolean(keyword.trim() || validity !== "all");

    return (
        <div className="admin-redemption-codes flex min-h-0 flex-1 flex-col">
            {uncertainCreateNotice ? (
                <div className="admin-redemption-uncertain-notice" role="alert">
                    <div>
                        <strong>{translate("admin.redemptionCodesPanel.generationResultNeedsReview")}</strong>
                        <p>{uncertainCreateNotice}</p>
                    </div>
                    <Button
                        loading={loading}
                        onClick={() => {
                            void (async () => {
                                setKeyword("");
                                setValidity("all");
                                setPage(1);
                                const refreshed = await reload(1, pageSize, { keyword: "", validity: "all" });
                                if (!refreshed) return;
                                setUncertainCreateNotice("");
                                onCreateBlockedChange(false);
                                message.success(translate("admin.redemptionCodesPanel.theFullBatchListHasBeenRefreshedCheckForDuplicate"));
                            })();
                        }}
                    >
                        {translate("admin.redemptionCodesPanel.refreshCompleteList")}
                    </Button>
                </div>
            ) : null}
            <section className="flex min-h-0 flex-1" aria-label={translate("admin.redemptionCodesPanel.redemptionCodeBatches")}>
                <AdminDataTable
                    toolbar={
                        <Input
                            allowClear
                            aria-label={translate("admin.redemptionCodesPanel.searchRedemptionCodeBatches")}
                            className="app-list-search"
                            prefix={<Search className="size-4 text-foreground/40" />}
                            value={keyword}
                            placeholder={translate("admin.redemptionCodesPanel.searchBatchNotesCreditsOrQuantity")}
                            onChange={(event) => {
                                setKeyword(event.target.value);
                                setPage(1);
                            }}
                        />
                    }
                    toolbarActive={hasFilters}
                    toolbarFilters={
                        <Select<BatchValidity>
                            aria-label={translate("admin.redemptionCodesPanel.filterByBatchExpirationStatus")}
                            className="w-44"
                            value={validity}
                            onChange={(value) => {
                                setValidity(value);
                                setPage(1);
                            }}
                            options={[
                                { label: translate("admin.redemptionCodesPanel.allExpirationStates"), value: "all" },
                                { label: translate("admin.redemptionCodesPanel.unexpiredBatches"), value: "active" },
                                { label: translate("admin.redemptionCodesPanel.expiredBatches"), value: "expired" },
                            ]}
                        />
                    }
                    onReset={() => {
                        setKeyword("");
                        setValidity("all");
                        setPage(1);
                    }}
                    trailing={
                        <Button
                            type="text"
                            size="small"
                            icon={<RefreshCw className="size-3.5" />}
                            loading={loading}
                            onClick={() => {
                                void reload();
                            }}
                        >
                            {translate("common.refresh")}
                        </Button>
                    }
                    table={{ className: "app-data-table", rowKey: "id", size: "small", loading, pagination: false, columns, dataSource: batches }}
                    empty={
                        <AdminTableEmpty
                            filtered={hasFilters}
                            title={listError ? translate("admin.redemptionCodesPanel.failedToLoadBatches") : !hasFilters ? translate("admin.redemptionCodesPanel.noRedemptionCodeBatches") : undefined}
                            description={listError || (!hasFilters ? translate("admin.redemptionCodesPanel.generatedBatchesAppearHereForTracking") : undefined)}
                            action={
                                !listError && !hasFilters && !uncertainCreateNotice ? (
                                    <Button type="primary" icon={<TicketCheck className="size-4" />} onClick={() => onCreateOpenChange(true)}>
                                        {translate("admin.redemptionCodesPanel.generateFirstBatch")}
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

            <CreateRedeemBatchDrawer
                open={createOpen}
                creating={creating}
                pending={pendingCreate}
                form={form}
                watchedAmount={watchedAmount}
                watchedCount={watchedCount}
                draftTotal={draftTotal}
                onClose={closeCreateDrawer}
                onPreview={previewCreate}
                onPendingChange={setPendingCreate}
                onConfirm={() => void createBatch()}
            />

            <GeneratedCodesModal
                codes={generatedCodes}
                batchId={generatedBatchId}
                onClose={() => {
                    setGeneratedCodes([]);
                    setGeneratedBatchId("");
                }}
            />
            <RedeemBatchCodesModal key={selectedBatch?.id || "closed"} batch={selectedBatch} onClose={() => setSelectedBatch(null)} onBatchChanged={() => reload(page, pageSize)} />
        </div>
    );
}

export const emptyBatchSummary: RedeemBatch = {
    id: "",
    amountMicrocredits: 0,
    count: 0,
    createdBy: "",
    createdAt: "",
    availableCount: 0,
    redeemedCount: 0,
    disabledCount: 0,
    expiredCount: 0,
};

export function renderCodeStatus(status: AdminRedeemCode["status"]) {
    const config: Record<AdminRedeemCode["status"], { label: string; tone: AdminStatusTone }> = {
        unused: { label: translate("account.settings.channels.ready"), tone: "success" },
        redeemed: { label: translate("admin.redemptionCodesPanel.redeemed"), tone: "info" },
        disabled: { label: translate("admin.redemptionCodesPanel.disabled"), tone: "neutral" },
        expired: { label: translate("library.ark.expiry.expired"), tone: "warning" },
    };
    const configForStatus = config[status] || { label: translate("admin.redemptionCodesPanel.unknownStatus"), tone: "neutral" as const };
    return <AdminStatusBadge label={configForStatus.label} tone={configForStatus.tone} />;
}

export function isMutationResultUncertain(error: unknown) {
    if (!(error instanceof ApiError)) return true;
    return error.status === undefined || error.retryable || error.status >= 500;
}

function formatBatchDisableImpact(batch: RedeemBatch) {
    const availableCount = batch.availableCount ?? 0;
    const affectedMicrocredits = batch.amountMicrocredits * availableCount;
    const total = Number.isSafeInteger(affectedMicrocredits) ? translate("admin.redemptionCodesPanel.totalValueCredits", { v0: String(formatCredits(affectedMicrocredits)) }) : "";
    return translate("admin.redemptionCodesPanel.disableCurrentlyAvailableRedemptionCodesCreditsPerCode", { v0: String(availableCount), v1: String(formatCredits(batch.amountMicrocredits)), v2: String(total) });
}

export function formatTime(value?: string | null) {
    return value ? new Date(value).toLocaleString(currentLocale(), { hour12: false }) : "--";
}
