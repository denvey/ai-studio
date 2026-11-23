import { useEffect, useRef, useState } from "react";
import { App, Button, Form, Input, InputNumber } from "antd";
import { AdminDrawer, AdminModal } from "@/pages/admin/ui/overlays";
import type { ColumnsType } from "antd/es/table";
import { BadgeCheck, Coins, Plus, RefreshCw, Search, Trash2, Undo2 } from "lucide-react";

import { PaginationBar } from "@/pages/admin/components/admin-ui";
import { formatCredits } from "@/constant/credits";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listAdminUsers, type AdminReferenceData, type AdminUser } from "@/services/api/auth";
import { adjustAdminUserCredits, getAdminCreditPolicy, listAdminBillingOrders, resolveAdminBillingOrder, resolveAdminBillingOrders, updateAdminCreditPolicy, type BillingOrder, type CreditPolicy } from "@/services/api/wallet";

import { AdminBatchBar, AdminDataTable, AdminRowActions, AdminStatusBadge, AdminTableEmpty } from "./admin-ui";
import { Select } from "@/components/ui/base/select";
import { currentLocale, translate } from "@/i18n";

export type CreditOperation = "policy" | "adjustment" | null;

type AdjustmentFormValues = { userId: string; amount: number; note: string };
type ResolutionFormValues = { note: string };
type PolicyMultiplierRow = { model?: string; multiplier?: number };
type PolicyFormValues = { signupBonus: number; checkinBonus: number; defaultMultiplier: number; modelMultipliers: PolicyMultiplierRow[] };
type BillingResolutionAction = "settle" | "refund";
type AdjustmentUser = AdminReferenceData["users"][number] & Partial<Pick<AdminUser, "email" | "availableMicrocredits" | "reservedMicrocredits">>;
type BillingResolutionTarget = { kind: "single"; order: BillingOrder; action: BillingResolutionAction } | { kind: "batch"; orders: BillingOrder[]; action: BillingResolutionAction };

const billingStatusLabels = {
    uncertain: translate("admin.creditOperationsPanel.pendingReview"),
    running: translate("library.tasks.filter.active"),
    reserved: translate("admin.creditOperationsPanel.preauthorized"),
    settled: translate("admin.creditOperationsPanel.settled"),
    refunded: translate("admin.creditOperationsPanel.refunded"),
} satisfies Record<BillingOrder["status"], string>;

export default function CreditOperationsPanel({ users, activeOperation, onOperationChange }: { users: AdminReferenceData["users"]; activeOperation: CreditOperation; onOperationChange: (operation: CreditOperation) => void }) {
    const { message } = App.useApp();
    const [orders, setOrders] = useState<BillingOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingPolicy, setLoadingPolicy] = useState(false);
    const [savingPolicy, setSavingPolicy] = useState(false);
    const [adjusting, setAdjusting] = useState(false);
    const [resolving, setResolving] = useState(false);
    const [keyword, setKeyword] = useState("");
    const debouncedKeyword = useDebouncedValue(keyword);
    const [orderStatus, setOrderStatus] = useState<"review" | "all" | BillingOrder["status"]>("review");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [adjustmentUsers, setAdjustmentUsers] = useState<AdjustmentUser[]>(users);
    const [adjustmentSearch, setAdjustmentSearch] = useState("");
    const debouncedAdjustmentSearch = useDebouncedValue(adjustmentSearch);
    const [searchingUsers, setSearchingUsers] = useState(false);
    const [pendingAdjustment, setPendingAdjustment] = useState<AdjustmentFormValues | null>(null);
    const [pendingPolicy, setPendingPolicy] = useState<PolicyFormValues | null>(null);
    const [policy, setPolicy] = useState<CreditPolicy | null>(null);
    const [policyLoaded, setPolicyLoaded] = useState(false);
    const [policyLoadError, setPolicyLoadError] = useState(false);
    const [policyReloadKey, setPolicyReloadKey] = useState(0);
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
    const [resolutionTarget, setResolutionTarget] = useState<BillingResolutionTarget | null>(null);
    const [stoppingGifts, setStoppingGifts] = useState(false);
    const [adjustmentForm] = Form.useForm<AdjustmentFormValues>();
    const [resolutionForm] = Form.useForm<ResolutionFormValues>();
    const [policyForm] = Form.useForm<PolicyFormValues>();
    const ordersRequestRef = useRef(0);
    const userSearchRequestRef = useRef(0);
    const policyLoadedRef = useRef(false);
    const selectedAdjustmentUserId = Form.useWatch("userId", adjustmentForm);

    const selectedAdjustmentUser = adjustmentUsers.find((user) => user.id === selectedAdjustmentUserId);
    const pendingAdjustmentUser = adjustmentUsers.find((user) => user.id === pendingAdjustment?.userId);

    const reload = async (targetPage = page, targetPageSize = pageSize) => {
        const requestId = ++ordersRequestRef.current;
        setLoading(true);
        try {
            const result = await listAdminBillingOrders({
                keyword: debouncedKeyword || undefined,
                status: orderStatus,
                page: targetPage,
                pageSize: targetPageSize,
            });
            if (requestId !== ordersRequestRef.current) return;
            if (targetPage > 1 && result.total > 0 && result.orders.length === 0) {
                setPage(1);
                return;
            }
            setOrders(result.orders);
            setTotal(result.total);
            setSelectedOrderIds([]);
        } catch (error) {
            if (requestId === ordersRequestRef.current) message.error(error instanceof Error ? error.message : translate("admin.creditOperationsPanel.failedToLoadBillingAwaitingReconciliation"));
        } finally {
            if (requestId === ordersRequestRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        void reload(page, pageSize);
    }, [debouncedKeyword, orderStatus, page, pageSize]);

    useEffect(() => {
        if (policyLoadedRef.current && activeOperation !== "policy") return;
        let active = true;
        setLoadingPolicy(true);
        setPolicyLoaded(false);
        policyLoadedRef.current = false;
        setPolicyLoadError(false);
        void getAdminCreditPolicy()
            .then(({ policy }) => {
                if (!active) return;
                setPolicy(policy);
                setPolicyLoaded(true);
                policyLoadedRef.current = true;
                policyForm.setFieldsValue(toPolicyFormValues(policy));
            })
            .catch((error) => {
                if (active) {
                    setPolicyLoadError(true);
                    message.error(error instanceof Error ? error.message : translate("admin.creditOperationsPanel.failedToLoadCreditPolicy"));
                }
            })
            .finally(() => {
                if (active) setLoadingPolicy(false);
            });
        return () => {
            active = false;
        };
    }, [activeOperation, message, policyForm, policyReloadKey]);

    useEffect(() => {
        if (activeOperation !== "adjustment") return;
        adjustmentForm.resetFields();
        setPendingAdjustment(null);
        setAdjustmentSearch("");
        setAdjustmentUsers(users);
    }, [activeOperation, adjustmentForm, users]);

    useEffect(() => {
        if (activeOperation !== "adjustment") return;
        const requestId = ++userSearchRequestRef.current;
        setSearchingUsers(true);
        void listAdminUsers({ keyword: debouncedAdjustmentSearch.trim() || undefined, page: 1, pageSize: 50 })
            .then((result) => {
                if (requestId !== userSearchRequestRef.current) return;
                const selectedId = adjustmentForm.getFieldValue("userId");
                setAdjustmentUsers((current) => {
                    const selected = current.find((user) => user.id === selectedId);
                    if (selected && !result.users.some((user) => user.id === selected.id)) return [selected, ...result.users];
                    return result.users;
                });
            })
            .catch((error) => {
                if (requestId === userSearchRequestRef.current) message.error(error instanceof Error ? error.message : translate("admin.creditOperationsPanel.userSearchFailed"));
            })
            .finally(() => {
                if (requestId === userSearchRequestRef.current) setSearchingUsers(false);
            });
    }, [activeOperation, adjustmentForm, debouncedAdjustmentSearch, message]);

    const savePolicy = async (values: PolicyFormValues) => {
        if (!policyLoaded || loadingPolicy) {
            message.error(translate("admin.creditOperationsPanel.theCreditPolicyHasNotLoadedSuccessfullyNoChangesWere"));
            return false;
        }
        const modelMultiplierBasisPoints: Record<string, number> = {};
        for (const row of values.modelMultipliers || []) {
            const model = String(row.model || "").trim();
            const multiplier = Number(row.multiplier);
            if (!model || !Number.isFinite(multiplier) || multiplier < 0.0001 || multiplier > 100) {
                message.error(translate("admin.creditOperationsPanel.enterAModelIDAndAMultiplierBetween00001"));
                return false;
            }
            if (model in modelMultiplierBasisPoints) {
                message.error(translate("admin.creditOperationsPanel.modelHasDuplicateMultiplierRules", { v0: String(model) }));
                return false;
            }
            modelMultiplierBasisPoints[model] = Math.round(multiplier * 10_000);
        }
        setSavingPolicy(true);
        try {
            const result = await updateAdminCreditPolicy({
                signupBonusMicrocredits: toMicrocredits(values.signupBonus),
                checkinBonusMicrocredits: toMicrocredits(values.checkinBonus),
                defaultMultiplierBasisPoints: Math.round(values.defaultMultiplier * 10_000),
                modelMultiplierBasisPoints,
            });
            setPolicy(result.policy);
            setPolicyLoaded(true);
            policyLoadedRef.current = true;
            policyForm.setFieldsValue(toPolicyFormValues(result.policy));
            setPendingPolicy(null);
            message.success(translate("admin.creditOperationsPanel.creditPolicySavedBonusesApplyOnlyToFutureRegistrationsAnd"));
            onOperationChange(null);
            return true;
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.creditOperationsPanel.failedToSaveCreditPolicy"));
            return false;
        } finally {
            setSavingPolicy(false);
        }
    };

    const submitPolicy = (values: PolicyFormValues) => {
        if (!policyLoaded || loadingPolicy) {
            message.error(translate("admin.creditOperationsPanel.theCreditPolicyHasNotLoadedSuccessfullyNoChangesWere"));
            return;
        }
        if (values.signupBonus > 0 || values.checkinBonus > 0) {
            setPendingPolicy(values);
            return;
        }
        void savePolicy(values);
    };

    const stopGiftsNow = async () => {
        if (!policy || !policyLoaded || loadingPolicy || savingPolicy || stoppingGifts) return;
        if (policy.signupBonusMicrocredits === 0 && policy.checkinBonusMicrocredits === 0) return;
        setPendingPolicy(null);
        setLoadingPolicy(true);
        setPolicyLoaded(false);
        policyLoadedRef.current = false;
        setPolicyLoadError(false);
        setStoppingGifts(true);
        try {
            let latestPolicy: CreditPolicy;
            try {
                ({ policy: latestPolicy } = await getAdminCreditPolicy());
            } catch (error) {
                setPolicyLoadError(true);
                message.error(error instanceof Error ? error.message : translate("admin.creditOperationsPanel.failedToLoadTheCreditPolicyBonusesWereNotDisabled"));
                return;
            }
            setPolicy(latestPolicy);
            policyForm.setFieldsValue(toPolicyFormValues(latestPolicy));
            setPolicyLoaded(true);
            policyLoadedRef.current = true;
            if (latestPolicy.signupBonusMicrocredits === 0 && latestPolicy.checkinBonusMicrocredits === 0) {
                message.info(translate("admin.creditOperationsPanel.registrationAndCheckInBonusesAreAlreadyDisabled"));
                return;
            }
            const result = await updateAdminCreditPolicy({
                ...latestPolicy,
                signupBonusMicrocredits: 0,
                checkinBonusMicrocredits: 0,
            });
            setPolicy(result.policy);
            policyForm.setFieldsValue(toPolicyFormValues(result.policy));
            message.success(translate("admin.creditOperationsPanel.futureRegistrationAndCheckInBonusesAreDisabledPreviouslyGranted"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.creditOperationsPanel.failedToDisableRegistrationAndCheckInBonuses"));
        } finally {
            setLoadingPolicy(false);
            setStoppingGifts(false);
        }
    };

    const previewAdjustment = (values: AdjustmentFormValues) => {
        const amount = Number(values.amount);
        if (!Number.isFinite(amount) || amount === 0) {
            message.error(translate("admin.creditOperationsPanel.theCreditAdjustmentCannotBe0"));
            return;
        }
        try {
            toMicrocredits(amount);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.creditOperationsPanel.theCreditAdjustmentIsOutOfRange"));
            return;
        }
        const user = adjustmentUsers.find((item) => item.id === values.userId);
        if (amount < 0 && hasCreditBalance(user) && user.availableMicrocredits + toMicrocredits(amount) < 0) {
            message.error(translate("admin.creditOperationsPanel.availableCreditsCannotFallBelow0AfterDeduction"));
            return;
        }
        setPendingAdjustment({ ...values, amount, note: values.note.trim() });
    };

    const applyAdjustment = async () => {
        if (!pendingAdjustment) return;
        setAdjusting(true);
        try {
            const result = await adjustAdminUserCredits(pendingAdjustment.userId, {
                amountMicrocredits: toMicrocredits(pendingAdjustment.amount),
                note: pendingAdjustment.note,
            });
            setAdjustmentUsers((current) =>
                current.map((user) =>
                    user.id === result.account.userId
                        ? {
                              ...user,
                              availableMicrocredits: result.account.availableMicrocredits,
                              reservedMicrocredits: result.account.reservedMicrocredits,
                          }
                        : user,
                ),
            );
            adjustmentForm.resetFields();
            setPendingAdjustment(null);
            onOperationChange(null);
            message.success(translate("admin.creditOperationsPanel.userCreditsAdjustedAvailableCredits", { v0: String(formatCredits(result.account.availableMicrocredits)) }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.creditOperationsPanel.failedToAdjustCredits"));
        } finally {
            setAdjusting(false);
        }
    };

    const resolveBilling = async () => {
        if (!resolutionTarget) return;
        let values: ResolutionFormValues;
        try {
            values = await resolutionForm.validateFields();
        } catch {
            return;
        }
        const note = values.note.trim();
        setResolving(true);
        try {
            if (resolutionTarget.kind === "single") {
                await resolveAdminBillingOrder(resolutionTarget.order.id, { action: resolutionTarget.action, note });
                message.success(resolutionTarget.action === "settle" ? translate("admin.creditOperationsPanel.billingOrderSettled") : translate("admin.creditOperationsPanel.preauthorizedCreditsReleased"));
            } else {
                const result = await resolveAdminBillingOrders({
                    ids: resolutionTarget.orders.map((order) => order.id),
                    action: resolutionTarget.action,
                    note,
                });
                if (result.failed.length > 0) {
                    const failedIds = new Set(result.failed.map((item) => item.id));
                    const failedOrders = resolutionTarget.orders.filter((order) => failedIds.has(order.id));
                    const detail = result.failed[0]?.message ? `：${result.failed[0].message}` : "";
                    if (result.resolvedCount > 0) message.warning(translate("admin.creditOperationsPanel.processedStillFailed", { v0: String(result.resolvedCount), v1: String(result.failed.length), v2: String(detail) }));
                    else message.error(translate("admin.creditOperationsPanel.allSelectedOrdersFailed", { v0: String(result.failed.length), v1: String(detail) }));
                    setResolutionTarget({ ...resolutionTarget, orders: failedOrders.length > 0 ? failedOrders : resolutionTarget.orders });
                    await reload(page, pageSize);
                    return;
                }
                message.success(
                    resolutionTarget.action === "settle"
                        ? translate("admin.creditOperationsPanel.settledOrders", { v0: String(result.resolvedCount) })
                        : translate("admin.creditOperationsPanel.releasedPreauthorizedCreditsForOrders", { v0: String(result.resolvedCount) }),
                );
            }
            setResolutionTarget(null);
            resolutionForm.resetFields();
            await reload(page, pageSize);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.creditOperationsPanel.failedToProcessBillingOrder"));
        } finally {
            setResolving(false);
        }
    };

    const openSingleResolution = (order: BillingOrder, action: BillingResolutionAction) => {
        setResolutionTarget({ kind: "single", order, action });
        resolutionForm.resetFields();
    };

    const openBatchResolution = (action: BillingResolutionAction) => {
        const selectedOrders = orders.filter((order) => selectedOrderIds.includes(order.id) && canResolveBillingOrder(order));
        if (selectedOrders.length === 0) return;
        setResolutionTarget({ kind: "batch", orders: selectedOrders, action });
        resolutionForm.resetFields();
    };

    const columns: ColumnsType<BillingOrder> = [
        { title: translate("library.tasks.detail.createdAt"), dataIndex: "createdAt", width: 170, align: "center", render: formatTime },
        {
            title: translate("admin.creditOperationsPanel.users"),
            dataIndex: "userId",
            width: 150,
            render: (id: string, order) => (
                <div>
                    <div className="font-medium">{billingOrderUserLabel(order) || translate("admin.creditOperationsPanel.unknownUser")}</div>
                    <div className="mt-0.5 truncate text-xs text-foreground/50" title={id}>
                        {order.userAccount ? `@${order.userAccount}` : id}
                    </div>
                </div>
            ),
        },
        {
            title: translate("admin.creditOperationsPanel.modelScenario"),
            width: 220,
            render: (_, order) => (
                <div>
                    <div className="font-medium">{order.model}</div>
                    <div className="mt-0.5 text-xs text-foreground/50">{order.scene || order.capability}</div>
                </div>
            ),
        },
        {
            title: translate("admin.creditOperationsPanel.preAuthorizedCredits"),
            width: 125,
            align: "center",
            render: (_, order) => <span className="font-medium tabular-nums">{formatCredits(getReservedAmount(order))}</span>,
        },
        {
            title: translate("admin.creditOperationsPanel.actualSettlementUsage"),
            width: 205,
            align: "center",
            render: (_, order) =>
                order.billingMode === "token" ? (
                    <div className="text-xs leading-5">
                        <div className="font-medium tabular-nums">
                            {order.status === "settled" ? translate("admin.creditOperationsPanel.credits", { v0: String(formatCredits(order.actualAmountMicrocredits)) }) : translate("admin.creditOperationsPanel.awaitingUsageSettlement")}
                        </div>
                        <div className="text-foreground/50">
                            {order.usageSource === "video_formula"
                                ? translate("admin.creditOperationsPanel.formulaSettlementVideoTokens", { v0: String(order.outputTokens.toLocaleString()) })
                                : order.capability === "video"
                                  ? translate("admin.creditOperationsPanel.upstreamUsageVideoTokens", { v0: String(order.outputTokens.toLocaleString()) })
                                  : translate("admin.creditOperationsPanel.inputOutputCacheRead", {
                                        v0: String(order.inputTokens),
                                        v1: String(order.outputTokens),
                                        v2: String(order.cachedTokens),
                                        v3: String(order.cacheWriteTokens ? translate("admin.creditOperationsPanel.cacheWrite", { v0: String(order.cacheWriteTokens) }) : ""),
                                    })}
                        </div>
                    </div>
                ) : (
                    <span className="tabular-nums">{order.status === "settled" ? formatCredits(order.actualAmountMicrocredits) : "--"}</span>
                ),
        },
        {
            title: translate("library.tasks.detail.status"),
            dataIndex: "status",
            width: 110,
            align: "center",
            render: (value: BillingOrder["status"]) => <AdminStatusBadge label={billingStatusLabels[value]} tone={value === "settled" ? "success" : value === "refunded" ? "neutral" : "warning"} />,
        },
        { title: translate("admin.creditOperationsPanel.upstreamRequest"), dataIndex: "providerRequestId", width: 180, ellipsis: true, render: (value) => value || translate("admin.creditOperationsPanel.notFetched") },
        { title: translate("admin.creditOperationsPanel.reviewReason"), dataIndex: "error", width: 260, ellipsis: true, render: (value) => value || translate("admin.creditOperationsPanel.costStatusIsUnclear") },
        {
            title: translate("account.settings.runninghub.actions"),
            width: 190,
            align: "center",
            fixed: "right",
            render: (_, order) =>
                !canResolveBillingOrder(order) ? (
                    <span className="text-xs text-foreground/45">{translate("canvasPage.upload.processDone")}</span>
                ) : (
                    <div className="flex justify-center">
                        <AdminRowActions
                            primary={{ label: translate("admin.creditOperationsPanel.confirmSettlement"), onClick: () => openSingleResolution(order, "settle") }}
                            actions={[{ key: "refund", label: translate("admin.creditOperationsPanel.releasePreauthorization"), danger: true, onClick: () => openSingleResolution(order, "refund") }]}
                        />
                    </div>
                ),
        },
    ];

    const hasFilters = Boolean(keyword || orderStatus !== "review");
    const resolutionOrders = resolutionTarget?.kind === "batch" ? resolutionTarget.orders : resolutionTarget ? [resolutionTarget.order] : [];
    const resolutionReservedTotal = resolutionOrders.reduce((sum, order) => sum + getReservedAmount(order), 0);
    const resolutionTitle = resolutionTarget
        ? resolutionTarget.action === "settle"
            ? resolutionTarget.kind === "batch"
                ? translate("admin.creditOperationsPanel.confirmSettlementsInBulk")
                : translate("admin.creditOperationsPanel.confirmBillingOrderSettlement")
            : resolutionTarget.kind === "batch"
              ? translate("admin.creditOperationsPanel.releasePreauthorizedCreditsInBulk")
              : translate("admin.creditOperationsPanel.confirmPreauthorizedCreditRelease")
        : "";
    const signupGrantForecast = pendingPolicy ? toMicrocredits(pendingPolicy.signupBonus) * 1_000 : 0;
    const checkinGrantForecast = pendingPolicy ? toMicrocredits(pendingPolicy.checkinBonus) * 1_000 : 0;
    const totalGrantForecast = signupGrantForecast + checkinGrantForecast;

    return (
        <div className="admin-credit-operations flex min-h-0 flex-1 flex-col">
            <section className="mb-3 border border-amber-500/30 bg-amber-500/5 p-3" aria-labelledby="credit-gift-policy-heading">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h2 id="credit-gift-policy-heading" className="text-sm font-semibold">
                            {translate("admin.creditOperationsPanel.registrationAndCheckInBonuses")}
                        </h2>
                        {policyLoaded && policy ? (
                            <>
                                <p className="mt-1 text-sm text-foreground/75">
                                    {translate("admin.creditOperationsPanel.registrationBonus")}{" "}
                                    <strong className="tabular-nums">
                                        {formatCredits(policy.signupBonusMicrocredits)} {translate("admin.creditOperationsPanel.creditsNewUser")}
                                    </strong>
                                    <span className="mx-2 text-foreground/35">·</span>
                                    {translate("admin.creditOperationsPanel.dailyCheckIn")}{" "}
                                    <strong className="tabular-nums">
                                        {formatCredits(policy.checkinBonusMicrocredits)} {translate("admin.creditOperationsPanel.creditsUserPerDay")}
                                    </strong>
                                </p>
                                <p className="mt-1 text-xs leading-5 text-foreground/60">
                                    {policy.signupBonusMicrocredits > 0 || policy.checkinBonusMicrocredits > 0
                                        ? translate("admin.creditOperationsPanel.bonusesAccumulateWithNewRegistrationsAndDailyCheckInsSet")
                                        : translate("admin.creditOperationsPanel.registrationAndCheckInBonusesAreBothDisabledAValue")}
                                </p>
                            </>
                        ) : policyLoadError ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground/65">
                                <span>{translate("admin.creditOperationsPanel.failedToLoadTheCurrentCreditPolicyWriteOperationsAre")}</span>
                                <Button type="link" size="small" className="h-auto p-0" onClick={() => setPolicyReloadKey((key) => key + 1)}>
                                    {translate("auth.register.reload")}
                                </Button>
                            </div>
                        ) : (
                            <p className="mt-1 text-sm text-foreground/55" role="status">
                                {translate("admin.creditOperationsPanel.loadingCurrentBonusAmounts")}
                            </p>
                        )}
                    </div>
                    <Button
                        danger
                        icon={<Coins className="size-3.5" />}
                        loading={stoppingGifts}
                        disabled={!policyLoaded || loadingPolicy || !policy || savingPolicy || (policy.signupBonusMicrocredits === 0 && policy.checkinBonusMicrocredits === 0)}
                        onClick={() => void stopGiftsNow()}
                    >
                        {policyLoaded && policy?.signupBonusMicrocredits === 0 && policy?.checkinBonusMicrocredits === 0
                            ? translate("admin.creditOperationsPanel.registrationAndCheckInBonusesDisabled")
                            : translate("admin.creditOperationsPanel.disableRegistrationAndCheckInBonuses")}
                    </Button>
                </div>
            </section>
            <section className="admin-credit-operations-table-region flex min-h-0 flex-1" aria-labelledby="credit-review-heading">
                <h2 id="credit-review-heading" className="sr-only">
                    {translate("admin.creditOperationsPanel.reviewBillingExceptions")}
                </h2>
                <AdminDataTable
                    toolbar={
                        <Input
                            allowClear
                            aria-label={translate("admin.creditOperationsPanel.searchBillingOrders")}
                            className="app-list-search"
                            prefix={<Search className="size-4 text-foreground/40" />}
                            value={keyword}
                            placeholder={translate("admin.creditOperationsPanel.searchUserModelScenarioOrRequestID")}
                            onChange={(event) => {
                                setKeyword(event.target.value);
                                setPage(1);
                            }}
                        />
                    }
                    toolbarActive={hasFilters}
                    toolbarFilters={
                        <Select
                            aria-label={translate("admin.creditOperationsPanel.filterBillingQueue")}
                            className="w-40"
                            value={orderStatus}
                            onChange={(value) => {
                                setOrderStatus(value);
                                setPage(1);
                            }}
                            options={[
                                { label: translate("admin.creditOperationsPanel.reconciliationQueue"), value: "review" },
                                { label: translate("admin.creditOperationsPanel.allHistory"), value: "all" },
                                { label: translate("admin.creditOperationsPanel.costAwaitingReconciliation"), value: "uncertain" },
                                { label: translate("library.tasks.filter.active"), value: "running" },
                                { label: translate("admin.creditOperationsPanel.preauthorized"), value: "reserved" },
                                { label: translate("admin.creditOperationsPanel.settled"), value: "settled" },
                                { label: translate("admin.creditOperationsPanel.refunded"), value: "refunded" },
                            ]}
                        />
                    }
                    onReset={() => {
                        setKeyword("");
                        setOrderStatus("review");
                        setPage(1);
                    }}
                    trailing={
                        <Button type="text" size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void reload()}>
                            {translate("common.refresh")}
                        </Button>
                    }
                    batchActions={
                        <AdminBatchBar count={selectedOrderIds.length} onClear={() => setSelectedOrderIds([])}>
                            <Button size="small" type="primary" icon={<BadgeCheck className="size-3.5" />} onClick={() => openBatchResolution("settle")}>
                                {translate("admin.creditOperationsPanel.confirmSettlementsInBulk")}
                            </Button>
                            <Button size="small" danger icon={<Undo2 className="size-3.5" />} onClick={() => openBatchResolution("refund")}>
                                {translate("admin.creditOperationsPanel.releasePreauthorizationsInBulk")}
                            </Button>
                        </AdminBatchBar>
                    }
                    table={{
                        className: "app-data-table",
                        rowKey: "id",
                        size: "small",
                        loading,
                        pagination: false,
                        columns,
                        dataSource: orders,
                        rowSelection: {
                            selectedRowKeys: selectedOrderIds,
                            preserveSelectedRowKeys: false,
                            onChange: (keys) => setSelectedOrderIds(keys.map(String)),
                            getCheckboxProps: (order) => ({
                                disabled: !canResolveBillingOrder(order),
                                name: `${order.model} ${order.scene || order.capability}`,
                            }),
                        },
                        scroll: { x: 1510 },
                    }}
                    empty={
                        <AdminTableEmpty
                            filtered={hasFilters}
                            title={!hasFilters ? translate("admin.creditOperationsPanel.noOrdersAwaitingReview") : undefined}
                            description={!hasFilters ? translate("admin.creditOperationsPanel.newBillingExceptionsAppearHereAutomatically") : undefined}
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

            <AdminModal
                title={translate("admin.creditOperationsPanel.confirmRegistrationAndCheckInBonuses")}
                open={Boolean(pendingPolicy)}
                okText={translate("admin.creditOperationsPanel.confirmAndSaveBonusPolicy")}
                cancelText={translate("admin.creditOperationsPanel.backToEditing")}
                onCancel={() => {
                    if (!savingPolicy) setPendingPolicy(null);
                }}
                onOk={() => {
                    if (pendingPolicy && policyLoaded && !loadingPolicy && !savingPolicy) void savePolicy(pendingPolicy);
                }}
                confirmLoading={savingPolicy}
                okButtonProps={{ disabled: !pendingPolicy || !policyLoaded || loadingPolicy || savingPolicy }}
                mask={{ closable: !savingPolicy }}
                closable={!savingPolicy}
                destroyOnHidden
            >
                {pendingPolicy ? (
                    <div className="space-y-3">
                        <p className="text-sm leading-6 text-foreground/70">{translate("admin.creditOperationsPanel.thisPolicyIncludesPositiveBonusesTheAmountsBelowIllustrateGrants")}</p>
                        <dl className="grid grid-cols-2 gap-2 border-y border-border/60 py-3 text-sm">
                            <dt className="text-foreground/60">{translate("admin.creditOperationsPanel.item1000NewAccounts")}</dt>
                            <dd className="text-right tabular-nums">
                                {formatCredits(signupGrantForecast)} {translate("shell.credits")}
                            </dd>
                            <dt className="text-foreground/60">{translate("admin.creditOperationsPanel.item1000CheckIns")}</dt>
                            <dd className="text-right tabular-nums">
                                {formatCredits(checkinGrantForecast)} {translate("shell.credits")}
                            </dd>
                            <dt className="font-semibold">{translate("admin.creditOperationsPanel.totalCreditsGranted")}</dt>
                            <dd className="text-right font-semibold tabular-nums">
                                {formatCredits(totalGrantForecast)} {translate("shell.credits")}
                            </dd>
                        </dl>
                        <p className="text-xs leading-5 text-foreground/55">{translate("admin.creditOperationsPanel.setABonusTo0ToDisableItThisPolicy")}</p>
                    </div>
                ) : null}
            </AdminModal>

            <AdminDrawer
                title={translate("admin.creditOperationsPanel.creditPolicy")}
                open={activeOperation === "policy"}
                size="min(700px, 100vw)"
                onClose={() => {
                    if (!savingPolicy && !loadingPolicy && !pendingPolicy) onOperationChange(null);
                }}
                rootClassName="admin-credit-drawer"
                destroyOnHidden
                mask={{ closable: !savingPolicy && !loadingPolicy && !pendingPolicy }}
                keyboard={!savingPolicy && !loadingPolicy && !pendingPolicy}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button disabled={savingPolicy || loadingPolicy || Boolean(pendingPolicy)} onClick={() => onOperationChange(null)}>
                            {translate("common.cancel")}
                        </Button>
                        <Button type="primary" loading={savingPolicy} disabled={!policyLoaded || loadingPolicy || savingPolicy} onClick={() => policyForm.submit()}>
                            {translate("admin.creditOperationsPanel.savePolicy")}
                        </Button>
                    </div>
                }
            >
                <div className="admin-credit-drawer-intro">
                    <strong>{translate("admin.creditOperationsPanel.registrationAndCheckInBonusesCreditBillingMultipliers")}</strong>
                    <p>{translate("admin.creditOperationsPanel.bonusesApplyToFutureRegistrationsAndCheckInsAndMultipliers")}</p>
                </div>
                {loadingPolicy ? (
                    <div className="admin-credit-drawer-loading" role="status">
                        {translate("admin.creditOperationsPanel.loadingCreditPolicy")}
                    </div>
                ) : (
                    <Form form={policyForm} layout="vertical" requiredMark={false} initialValues={{ modelMultipliers: [] }} onFinish={submitPolicy}>
                        <section className="admin-credit-drawer-section">
                            <div className="admin-credit-drawer-section-heading">
                                <h3>{translate("admin.creditOperationsPanel.baseRules")}</h3>
                                <p>{translate("admin.creditOperationsPanel.creditsSupportUpTo6DecimalPlacesMultipliersSupportUp")}</p>
                            </div>
                            <div className="admin-credit-policy-grid">
                                <Form.Item
                                    name="signupBonus"
                                    label={translate("admin.creditOperationsPanel.registrationBonusCredits")}
                                    rules={[
                                        { required: true, message: translate("admin.creditOperationsPanel.enterTheSignUpCredits") },
                                        { type: "number", min: 0, max: 1_000_000, message: translate("admin.creditOperationsPanel.enterAValueFrom0To1000000") },
                                    ]}
                                >
                                    <InputNumber className="w-full" min={0} max={1_000_000} precision={6} />
                                </Form.Item>
                                <Form.Item
                                    name="checkinBonus"
                                    label={translate("admin.creditOperationsPanel.dailyCheckInCredits")}
                                    rules={[
                                        { required: true, message: translate("admin.creditOperationsPanel.enterTheCheckInCredits") },
                                        { type: "number", min: 0, max: 100_000, message: translate("admin.creditOperationsPanel.enterAValueFrom0To100000") },
                                    ]}
                                >
                                    <InputNumber className="w-full" min={0} max={100_000} precision={6} />
                                </Form.Item>
                                <Form.Item
                                    name="defaultMultiplier"
                                    label={translate("admin.creditOperationsPanel.defaultBillingMultiplier")}
                                    rules={[
                                        { required: true, message: translate("admin.creditOperationsPanel.enterTheDefaultMultiplier") },
                                        { type: "number", min: 0.0001, max: 100, message: translate("admin.creditOperationsPanel.enterAValueFrom00001To100") },
                                    ]}
                                >
                                    <InputNumber className="w-full" min={0.0001} max={100} precision={4} />
                                </Form.Item>
                            </div>
                        </section>

                        <section className="admin-credit-drawer-section">
                            <Form.List name="modelMultipliers">
                                {(fields, { add, remove }) => (
                                    <>
                                        <div className="admin-credit-drawer-section-heading admin-credit-drawer-section-heading-with-action">
                                            <div>
                                                <h3>{translate("admin.creditOperationsPanel.perModelMultiplier")}</h3>
                                                <p>{translate("admin.creditOperationsPanel.addRulesOnlyForModelsThatNeedADifferentMultiplier")}</p>
                                            </div>
                                            <Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={() => add({ model: "", multiplier: 1 })}>
                                                {translate("admin.creditOperationsPanel.addModel")}
                                            </Button>
                                        </div>
                                        {fields.length > 0 ? (
                                            <div className="admin-credit-multiplier-list">
                                                <div className="admin-credit-multiplier-header" aria-hidden="true">
                                                    <span>{translate("admin.creditOperationsPanel.modelIdentifier")}</span>
                                                    <span>{translate("admin.creditOperationsPanel.multiplier")}</span>
                                                    <span>{translate("account.settings.runninghub.actions")}</span>
                                                </div>
                                                {fields.map((field, index) => (
                                                    <div className="admin-credit-multiplier-row" key={field.key}>
                                                        <Form.Item name={[field.name, "model"]} rules={[{ required: true, whitespace: true, message: translate("admin.creditOperationsPanel.enterAModelID") }]}>
                                                            <Input aria-label={translate("admin.creditOperationsPanel.rowModelID", { v0: String(index + 1) })} placeholder={translate("admin.creditOperationsPanel.eGGptImage1")} />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name={[field.name, "multiplier"]}
                                                            rules={[
                                                                { required: true, message: translate("admin.creditOperationsPanel.enterAMultiplier") },
                                                                { type: "number", min: 0.0001, max: 100, message: translate("admin.creditOperationsPanel.enterAValueFrom00001To100") },
                                                            ]}
                                                        >
                                                            <InputNumber aria-label={translate("admin.creditOperationsPanel.rowMultiplier", { v0: String(index + 1) })} className="w-full" min={0.0001} max={100} precision={4} />
                                                        </Form.Item>
                                                        <Button
                                                            type="text"
                                                            danger
                                                            className="admin-credit-multiplier-remove"
                                                            icon={<Trash2 className="size-4" />}
                                                            aria-label={translate("admin.creditOperationsPanel.deleteModelMultiplierRule", { v0: String(index + 1) })}
                                                            onClick={() => remove(field.name)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="admin-credit-multiplier-empty">{translate("admin.creditOperationsPanel.noModelSpecificMultipliersAllModelsUseTheDefaultMultiplier")}</div>
                                        )}
                                    </>
                                )}
                            </Form.List>
                        </section>
                    </Form>
                )}
            </AdminDrawer>

            <AdminDrawer
                title={translate("admin.creditOperationsPanel.manualBalanceAdjustment")}
                open={activeOperation === "adjustment"}
                size="min(580px, 100vw)"
                onClose={() => {
                    if (adjusting || pendingAdjustment) return;
                    onOperationChange(null);
                }}
                rootClassName="admin-credit-drawer"
                destroyOnHidden
                mask={{ closable: !adjusting && !pendingAdjustment }}
                keyboard={!adjusting && !pendingAdjustment}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button disabled={adjusting} onClick={() => onOperationChange(null)}>
                            {translate("common.cancel")}
                        </Button>
                        <Button type="primary" disabled={adjusting} onClick={() => adjustmentForm.submit()}>
                            {translate("admin.creditOperationsPanel.reviewAndContinue")}
                        </Button>
                    </div>
                }
            >
                <div className="admin-credit-drawer-intro is-warning">
                    <strong>{translate("admin.creditOperationsPanel.financialWriteOperation")}</strong>
                    <p>{translate("admin.creditOperationsPanel.submittingImmediatelyCreatesACreditTransactionAndAnAdministratorAudit")}</p>
                </div>
                <Form form={adjustmentForm} layout="vertical" requiredMark={false} onFinish={previewAdjustment}>
                    <section className="admin-credit-drawer-section">
                        <Form.Item name="userId" label={translate("admin.creditOperationsPanel.targetUser")} rules={[{ required: true, message: translate("admin.creditOperationsPanel.selectAUser") }]}>
                            <Select
                                showSearch
                                filterOption={false}
                                loading={searchingUsers}
                                aria-label={translate("admin.creditOperationsPanel.searchAndSelectAUserForAdjustment")}
                                placeholder={translate("admin.creditOperationsPanel.searchUsernameDisplayNameOrEmail")}
                                onSearch={setAdjustmentSearch}
                                options={adjustmentUsers.map((user) => ({
                                    label: `${user.displayName || user.username} · @${user.username}`,
                                    value: user.id,
                                }))}
                            />
                        </Form.Item>
                        {selectedAdjustmentUser ? <CreditAccountSummary user={selectedAdjustmentUser} /> : null}
                        <Form.Item
                            name="amount"
                            label={translate("admin.creditOperationsPanel.change")}
                            extra={translate("admin.creditOperationsPanel.positiveValuesAddCreditsNegativeValuesDeductThemDeductionsCan")}
                            rules={[
                                { required: true, message: translate("admin.creditOperationsPanel.enterTheCreditChange") },
                                {
                                    validator: (_, value) => (typeof value === "number" && Number.isFinite(value) && value !== 0 ? Promise.resolve() : Promise.reject(new Error(translate("admin.creditOperationsPanel.theCreditAdjustmentCannotBe0")))),
                                },
                            ]}
                        >
                            <InputNumber className="w-full" precision={6} prefix={<Coins className="size-3.5 text-foreground/45" />} placeholder={translate("admin.creditOperationsPanel.eG10Or2")} />
                        </Form.Item>
                        <Form.Item name="note" label={translate("admin.creditOperationsPanel.reasonForAdjustment")} rules={[{ required: true, whitespace: true, message: translate("admin.creditOperationsPanel.enterATicketNumberOrAdjustmentReason") }]}>
                            <Input.TextArea rows={4} maxLength={500} showCount placeholder={translate("admin.creditOperationsPanel.eGTicketYC20260828CompensationForAFailedTask")} />
                        </Form.Item>
                    </section>
                </Form>
            </AdminDrawer>

            <AdminModal
                title={pendingAdjustment?.amount && pendingAdjustment.amount < 0 ? translate("admin.creditOperationsPanel.confirmUserCreditDeduction") : translate("admin.creditOperationsPanel.confirmUserCreditAddition")}
                open={Boolean(pendingAdjustment)}
                okText={pendingAdjustment?.amount && pendingAdjustment.amount < 0 ? translate("admin.creditOperationsPanel.confirmDeduction") : translate("admin.creditOperationsPanel.confirmAddition")}
                cancelText={translate("admin.creditOperationsPanel.backToEditing")}
                onCancel={() => {
                    if (!adjusting) setPendingAdjustment(null);
                }}
                onOk={() => void applyAdjustment()}
                confirmLoading={adjusting}
                mask={{ closable: !adjusting }}
                closable={!adjusting}
                destroyOnHidden
                okButtonProps={{ danger: Boolean(pendingAdjustment && pendingAdjustment.amount < 0) }}
            >
                {pendingAdjustment ? (
                    <div className="admin-operation-confirmation">
                        <p className="admin-operation-confirmation-copy">{translate("admin.creditOperationsPanel.reviewTheUserCreditAdjustmentAndReasonConfirmingImmediatelyCreates")}</p>
                        <dl className="admin-operation-confirmation-grid">
                            <div>
                                <dt>{translate("admin.creditOperationsPanel.targetUser")}</dt>
                                <dd>{formatUserLabel(pendingAdjustmentUser, pendingAdjustment.userId)}</dd>
                            </div>
                            <div>
                                <dt>{translate("admin.creditOperationsPanel.change")}</dt>
                                <dd className={pendingAdjustment.amount < 0 ? "is-negative" : "is-positive"}>
                                    {pendingAdjustment.amount > 0 ? "+" : ""}
                                    {formatCredits(toMicrocredits(pendingAdjustment.amount))}
                                </dd>
                            </div>
                            {hasCreditBalance(pendingAdjustmentUser) ? (
                                <>
                                    <div>
                                        <dt>{translate("admin.creditOperationsPanel.currentlyAvailable")}</dt>
                                        <dd>{formatCredits(pendingAdjustmentUser.availableMicrocredits)}</dd>
                                    </div>
                                    <div>
                                        <dt>{translate("admin.creditOperationsPanel.expectedAvailable")}</dt>
                                        <dd>{formatCredits(pendingAdjustmentUser.availableMicrocredits + toMicrocredits(pendingAdjustment.amount))}</dd>
                                    </div>
                                </>
                            ) : null}
                            <div className="is-wide">
                                <dt>{translate("admin.creditOperationsPanel.adjustmentReason")}</dt>
                                <dd>{pendingAdjustment.note}</dd>
                            </div>
                        </dl>
                    </div>
                ) : null}
            </AdminModal>

            <AdminModal
                title={resolutionTitle}
                open={Boolean(resolutionTarget)}
                okText={resolutionTarget?.action === "settle" ? translate("admin.creditOperationsPanel.confirmSettlement") : translate("admin.creditOperationsPanel.releasePreauthorization")}
                cancelText={translate("common.cancel")}
                onCancel={() => {
                    if (resolving) return;
                    setResolutionTarget(null);
                    resolutionForm.resetFields();
                }}
                onOk={() => void resolveBilling()}
                confirmLoading={resolving}
                mask={{ closable: !resolving }}
                closable={!resolving}
                destroyOnHidden
                okButtonProps={{ danger: resolutionTarget?.action === "refund" }}
            >
                {resolutionTarget ? (
                    <div className="admin-operation-confirmation">
                        <p className="admin-operation-confirmation-copy">
                            {resolutionTarget.action === "settle"
                                ? translate("admin.creditOperationsPanel.settlementDeterminesTheActualCostUsingTheOrderSBilling")
                                : translate("admin.creditOperationsPanel.releasingOnlyReturnsPreauthorizedCreditsForUnsettledOrders")}
                        </p>
                        <dl className="admin-operation-confirmation-grid">
                            <div>
                                <dt>{translate("admin.creditOperationsPanel.orderCount")}</dt>
                                <dd>
                                    {resolutionOrders.length} {translate("account.layout.pagination.item")}
                                </dd>
                            </div>
                            <div>
                                <dt>{translate("admin.creditOperationsPanel.totalPreauthorized")}</dt>
                                <dd>
                                    {formatCredits(resolutionReservedTotal)} {translate("shell.credits")}
                                </dd>
                            </div>
                            {resolutionTarget.kind === "single" ? (
                                <>
                                    <div>
                                        <dt>{translate("admin.creditOperationsPanel.users")}</dt>
                                        <dd>{billingOrderUserLabel(resolutionTarget.order) || resolutionTarget.order.userId}</dd>
                                    </div>
                                    <div>
                                        <dt>{translate("admin.creditOperationsPanel.modelScenario")}</dt>
                                        <dd>
                                            {resolutionTarget.order.model} · {resolutionTarget.order.scene || resolutionTarget.order.capability}
                                        </dd>
                                    </div>
                                    <div className="is-wide">
                                        <dt>{translate("admin.creditOperationsPanel.orderNumber")}</dt>
                                        <dd className="admin-monospace">{resolutionTarget.order.id}</dd>
                                    </div>
                                </>
                            ) : null}
                        </dl>
                    </div>
                ) : null}
                <Form form={resolutionForm} layout="vertical" requiredMark={false}>
                    <Form.Item name="note" label={translate("admin.creditOperationsPanel.reconciliationBasis")} rules={[{ required: true, whitespace: true, message: translate("admin.creditOperationsPanel.enterTheVendorInvoiceTaskStatusOrBasisForThe") }]}>
                        <Input.TextArea rows={4} maxLength={500} showCount placeholder={translate("admin.creditOperationsPanel.eGTheProviderDashboardConfirmsTheTaskIncurredNo")} />
                    </Form.Item>
                </Form>
            </AdminModal>
        </div>
    );
}

function CreditAccountSummary({ user }: { user: AdjustmentUser }) {
    if (!hasCreditBalance(user)) {
        return <div className="admin-credit-account-summary is-unavailable">{translate("admin.creditOperationsPanel.selectASearchResultToReviewCurrentAvailableAndFrozen")}</div>;
    }
    return (
        <dl className="admin-credit-account-summary">
            <div>
                <dt>{translate("admin.creditOperationsPanel.currentlyAvailable")}</dt>
                <dd>{formatCredits(user.availableMicrocredits)}</dd>
            </div>
            <div>
                <dt>{translate("admin.creditOperationsPanel.currentlyFrozen")}</dt>
                <dd>{formatCredits(user.reservedMicrocredits)}</dd>
            </div>
        </dl>
    );
}

// 用户名由计费订单列表接口按当前页返回，不再从只含最近注册用户的引用数据里查。
function billingOrderUserLabel(order: BillingOrder) {
    return order.userDisplayName || order.userAccount || "";
}

function canResolveBillingOrder(order: BillingOrder) {
    return order.status === "uncertain" || order.status === "running" || order.status === "reserved";
}

function getReservedAmount(order: BillingOrder) {
    return order.reservedAmountMicrocredits || order.amountMicrocredits;
}

function hasCreditBalance(user?: AdjustmentUser): user is AdjustmentUser & Pick<AdminUser, "availableMicrocredits" | "reservedMicrocredits"> {
    return Boolean(user && typeof user.availableMicrocredits === "number" && typeof user.reservedMicrocredits === "number");
}

function formatUserLabel(user: AdjustmentUser | undefined, fallback: string) {
    return user ? `${user.displayName || user.username} · @${user.username}` : fallback;
}

function toMicrocredits(value: number) {
    const result = Math.round(Number(value) * 1_000_000);
    if (!Number.isSafeInteger(result)) throw new Error(translate("admin.creditOperationsPanel.theCreditAdjustmentIsOutOfRange"));
    return result;
}

function toPolicyFormValues(policy: CreditPolicy): PolicyFormValues {
    return {
        signupBonus: policy.signupBonusMicrocredits / 1_000_000,
        checkinBonus: policy.checkinBonusMicrocredits / 1_000_000,
        defaultMultiplier: policy.defaultMultiplierBasisPoints / 10_000,
        modelMultipliers: Object.entries(policy.modelMultiplierBasisPoints).map(([model, value]) => ({ model, multiplier: value / 10_000 })),
    };
}

function formatTime(value?: string) {
    return value ? new Date(value).toLocaleString(currentLocale(), { hour12: false }) : "--";
}
