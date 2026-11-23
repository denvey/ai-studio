import { PaymentBrandIcon } from "@/components/payment-brand-icons";
import { Callout } from "@/pages/admin/ui/controls";
import { App, Button, DatePicker, Descriptions, Form, Input, InputNumber, Tabs, Typography } from "antd";
import { AdminDrawer } from "@/pages/admin/ui/overlays";
import { Switch } from "@/pages/admin/ui/controls";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { Eye, Plus, RefreshCw, Search, Settings2, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PaginationBar } from "@/pages/admin/components/admin-ui";
import { paymentOrderGrantLabel } from "@/lib/payment-order-grant";
import { formatCredits } from "@/constant/credits";
import { formatStorageCapacity, formatStorageDuration } from "@/lib/account-storage-usage";
import {
    closeAdminPaymentOrder,
    exportAdminPaymentOrders,
    exportAdminPaymentReconciliations,
    exportAdminPaymentReconciliationItems,
    createAdminTopupProduct,
    formatPaymentAmount,
    getAdminPaymentSettings,
    updateAdminPaymentSettings,
    type PaymentCurrency,
    listAdminPaymentOrders,
    listAdminPaymentProviders,
    listAdminPaymentReconciliationItems,
    listAdminPaymentReconciliations,
    listAdminTopupProducts,
    queryAdminPaymentOrder,
    runAdminPaymentReconciliation,
    updateAdminPaymentProvider,
    updateAdminTopupProduct,
    type AdminPaymentProvider,
    type AdminPaymentOrder,
    type PaymentOrder,
    type PaymentOrderFilters,
    type PaymentReconciliationFilters,
    type PaymentReconciliationItem,
    type PaymentReconciliationRun,
    type TopupProduct,
} from "@/services/api/payments";

import { AdminPageFrame } from "../components/admin-shell";
import { AdminDataTable, AdminExportButton, AdminRowActions, AdminStatusBadge, AdminTableEmpty, configuredSecretText } from "../components/admin-ui";
import { AdminUserDetailDrawer } from "../components/admin-user-detail-drawer";
import "./payments-page.css";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

type ProviderFormValues = {
    enabled: boolean;
    closeAfterMinutes: number;
    values: Record<string, string>;
};

type ProductFormValues = {
    name: string;
    description?: string;
    kind: TopupProduct["kind"];
    currency: PaymentCurrency;
    /** 售价主单位（元 / 美元），提交时换算为最小单位。 */
    amountYuan: number;
    credits?: number;
    storageGB?: number;
    storageDurationMode?: "permanent" | "days";
    storageDurationDays?: number;
    enabled: boolean;
    sortOrder: number;
    saleStrategy: TopupProduct["saleStrategy"];
    periodDays?: number;
    periodPurchaseLimit?: number;
    stockTotal?: number;
    saleStartAt?: Dayjs;
    saleEndAt?: Dayjs;
};

function splitConfigList(value?: string) {
    return (value || "")
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

const paymentOrderStatus: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "error" | "info" }> = {
    created: { label: translate("adminPages.payments.paymentsPage.creating"), tone: "info" },
    pending: { label: translate("adminPages.payments.paymentsPage.awaitingPayment"), tone: "warning" },
    closing: { label: translate("adminPages.payments.paymentsPage.closingOrder"), tone: "warning" },
    closed: { label: translate("adminPages.payments.paymentsPage.disabled"), tone: "neutral" },
    credited: { label: translate("adminPages.payments.paymentsPage.credited"), tone: "success" },
    create_failed: { label: translate("adminPages.payments.paymentsPage.orderCreationFailed"), tone: "error" },
};

const reconciliationResult: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "error" | "info" }> = {
    matched: { label: translate("adminPages.payments.paymentsPage.matched"), tone: "success" },
    recovered: { label: translate("adminPages.payments.paymentsPage.automaticallyCredited"), tone: "info" },
    local_order_not_found: { label: translate("adminPages.payments.paymentsPage.localOrderMissing"), tone: "error" },
    provider_record_missing: { label: translate("adminPages.payments.paymentsPage.providerRecordMissing"), tone: "error" },
    amount_mismatch: { label: translate("adminPages.payments.paymentsPage.amountMismatch"), tone: "error" },
    trade_no_mismatch: { label: translate("adminPages.payments.paymentsPage.transactionIDMismatch"), tone: "error" },
    credit_failed: { label: translate("adminPages.payments.paymentsPage.creditDeliveryFailed"), tone: "error" },
};

export default function AdminPaymentsPage() {
    const { message, modal } = App.useApp();
    const [activeTab, setActiveTab] = useState("providers");
    const [providers, setProviders] = useState<AdminPaymentProvider[]>([]);
    const [products, setProducts] = useState<TopupProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [defaultCurrency, setDefaultCurrency] = useState<PaymentCurrency>("USD");
    const [usdCnyRate, setUsdCnyRate] = useState("");
    const [rateDraft, setRateDraft] = useState("");
    const [currencySaving, setCurrencySaving] = useState(false);

    const [providerDrawer, setProviderDrawer] = useState<AdminPaymentProvider>();
    const [providerSaving, setProviderSaving] = useState(false);
    const [providerForm] = Form.useForm<ProviderFormValues>();

    const [productDrawer, setProductDrawer] = useState<TopupProduct | null | undefined>();
    const [productSaving, setProductSaving] = useState(false);
    const [productForm] = Form.useForm<ProductFormValues>();
    const selectedProductStrategy = Form.useWatch("saleStrategy", productForm) || "unlimited";
    const selectedProductKind = Form.useWatch("kind", productForm) || "credits";
    const selectedStorageDurationMode = Form.useWatch("storageDurationMode", productForm) || "permanent";
    const selectedProductCurrency: PaymentCurrency = Form.useWatch("currency", productForm) || defaultCurrency;

    const [orders, setOrders] = useState<AdminPaymentOrder[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<AdminPaymentOrder | null>(null);
    const [orderTotal, setOrderTotal] = useState(0);
    const [orderPage, setOrderPage] = useState(1);
    const [orderPageSize, setOrderPageSize] = useState(30);
    const [orderStatusFilter, setOrderStatusFilter] = useState("all");
    const [orderKeyword, setOrderKeyword] = useState("");
    const [orderProviderFilter, setOrderProviderFilter] = useState("all");
    const [orderTimeField, setOrderTimeField] = useState<"created" | "paid" | "credited">("created");
    const [orderDates, setOrderDates] = useState<[Dayjs | null, Dayjs | null] | null>(null);
    const [appliedOrders, setAppliedOrders] = useState<PaymentOrderFilters>({ timeField: "created" });
    const [ordersReady, setOrdersReady] = useState(false);
    const orderRequest = useRef<AbortController | null>(null);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [orderActionId, setOrderActionId] = useState("");

    const [runs, setRuns] = useState<PaymentReconciliationRun[]>([]);
    const [runTotal, setRunTotal] = useState(0);
    const [runPage, setRunPage] = useState(1);
    const [runPageSize, setRunPageSize] = useState(30);
    const [runsLoading, setRunsLoading] = useState(false);
    const [runProviderFilter, setRunProviderFilter] = useState("all");
    const [runStatusFilter, setRunStatusFilter] = useState("all");
    const [runDates, setRunDates] = useState<[Dayjs | null, Dayjs | null] | null>(null);
    const [appliedRuns, setAppliedRuns] = useState<PaymentReconciliationFilters>({});
    const [runsReady, setRunsReady] = useState(false);
    const runRequest = useRef<AbortController | null>(null);
    const [runningBill, setRunningBill] = useState(false);
    const [billProviderId, setBillProviderId] = useState("");
    const [billDate, setBillDate] = useState<Dayjs>(dayjs().subtract(1, "day"));
    const [detailRun, setDetailRun] = useState<PaymentReconciliationRun>();
    const [detailItems, setDetailItems] = useState<PaymentReconciliationItem[]>([]);
    const [detailTotal, setDetailTotal] = useState(0);
    const [detailPage, setDetailPage] = useState(1);
    const [detailPageSize, setDetailPageSize] = useState(50);
    const [detailResult, setDetailResult] = useState("all");
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailReady, setDetailReady] = useState(false);
    const detailRequest = useRef<AbortController | null>(null);

    const orderFilters: PaymentOrderFilters = {
        timeField: orderTimeField,
        status: orderStatusFilter === "all" ? undefined : orderStatusFilter,
        keyword: orderKeyword.trim() || undefined,
        providerId: orderProviderFilter === "all" ? undefined : orderProviderFilter,
        from: orderDates?.[0]?.format("YYYY-MM-DD"),
        to: orderDates?.[1]?.format("YYYY-MM-DD"),
    };
    const runFilters: PaymentReconciliationFilters = {
        providerId: runProviderFilter === "all" ? undefined : runProviderFilter,
        status: runStatusFilter === "all" ? undefined : runStatusFilter,
        from: runDates?.[0]?.format("YYYY-MM-DD"),
        to: runDates?.[1]?.format("YYYY-MM-DD"),
    };
    const ordersDirty = JSON.stringify(orderFilters) !== JSON.stringify(appliedOrders);
    const runsDirty = JSON.stringify(runFilters) !== JSON.stringify(appliedRuns);

    const loadBase = async () => {
        setLoading(true);
        try {
            const [providerResult, productResult, settingsResult] = await Promise.all([listAdminPaymentProviders(), listAdminTopupProducts(), getAdminPaymentSettings()]);
            setProviders(providerResult.providers);
            setProducts(productResult.products);
            setDefaultCurrency(settingsResult.settings.defaultCurrency);
            setUsdCnyRate(settingsResult.settings.usdCnyRate || "");
            setRateDraft(settingsResult.settings.usdCnyRate || "");
            setBillProviderId((current) => current || providerResult.providers.find((item) => item.configured)?.id || providerResult.providers[0]?.id || "");
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.payments.paymentsPage.failedToLoadPaymentSettings"));
        } finally {
            setLoading(false);
        }
    };

    const loadOrders = async (page = orderPage, pageSize = orderPageSize, filters = appliedOrders) => {
        orderRequest.current?.abort();
        const controller = new AbortController();
        orderRequest.current = controller;
        setOrdersLoading(true);
        setOrdersReady(false);
        try {
            const result = await listAdminPaymentOrders({ ...filters, page, pageSize }, controller.signal);
            if (controller.signal.aborted) return;
            setOrders(result.orders);
            setOrderTotal(result.total);
            setOrderPage(result.page);
            setOrderPageSize(result.pageSize);
            setAppliedOrders(filters);
            setOrdersReady(true);
        } catch (error) {
            if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : translate("adminPages.payments.paymentsPage.failedToLoadPaymentOrders"));
        } finally {
            if (!controller.signal.aborted) setOrdersLoading(false);
        }
    };

    const loadRuns = async (page = runPage, pageSize = runPageSize, filters = appliedRuns) => {
        runRequest.current?.abort();
        const controller = new AbortController();
        runRequest.current = controller;
        setRunsLoading(true);
        setRunsReady(false);
        try {
            const result = await listAdminPaymentReconciliations({ ...filters, page, pageSize }, controller.signal);
            if (controller.signal.aborted) return;
            setRuns(result.runs);
            setRunTotal(result.total);
            setRunPage(result.page);
            setRunPageSize(result.pageSize);
            setAppliedRuns(filters);
            setRunsReady(true);
        } catch (error) {
            if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : translate("adminPages.payments.paymentsPage.failedToLoadReconciliationRecords"));
        } finally {
            if (!controller.signal.aborted) setRunsLoading(false);
        }
    };

    useEffect(() => {
        void Promise.all([loadBase(), loadOrders(1, orderPageSize), loadRuns(1, runPageSize)]);
        return () => {
            orderRequest.current?.abort();
            runRequest.current?.abort();
            detailRequest.current?.abort();
        };
    }, []);

    const refresh = async () => {
        if (activeTab === "orders") await loadOrders();
        else if (activeTab === "reconciliation") await loadRuns();
        else await loadBase();
    };

    const openProvider = (provider: AdminPaymentProvider) => {
        providerForm.resetFields();
        const configValues = { ...(provider.values || {}) };
        for (const field of provider.configFields) {
            if (!configValues[field.name] && field.default !== undefined && field.default !== null) configValues[field.name] = String(field.default);
        }
        providerForm.setFieldsValue({ enabled: provider.configEnabled, closeAfterMinutes: provider.closeAfterMinutes || 30, values: configValues });
        setProviderDrawer(provider);
    };

    const saveProvider = async () => {
        if (!providerDrawer) return;
        const values = await providerForm.validateFields();
        setProviderSaving(true);
        try {
            await updateAdminPaymentProvider(providerDrawer.id, {
                enabled: values.enabled,
                closeAfterMinutes: values.closeAfterMinutes,
                values: Object.fromEntries(Object.entries(values.values || {}).map(([key, value]) => [key, String(value || "")])),
            });
            message.success(translate("adminPages.payments.paymentsPage.settingsSavedAsANewVersion", { v0: String(providerDrawer.name) }));
            setProviderDrawer(undefined);
            await loadBase();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.payments.paymentsPage.failedToSavePaymentChannel"));
        } finally {
            setProviderSaving(false);
        }
    };

    const openProduct = (product?: TopupProduct) => {
        productForm.resetFields();
        productForm.setFieldsValue(
            product
                ? {
                      name: product.name,
                      description: product.description,
                      kind: product.kind || "credits",
                      currency: product.currency || "CNY",
                      amountYuan: product.amountFen / 100,
                      credits: product.kind === "storage" ? undefined : product.creditsMicrocredits / 1_000_000,
                      storageGB: product.kind === "storage" ? product.storageBytes / 1024 ** 3 : undefined,
                      storageDurationMode: product.storageDurationDays ? "days" : "permanent",
                      storageDurationDays: product.storageDurationDays || undefined,
                      enabled: product.enabled,
                      sortOrder: product.sortOrder,
                      saleStrategy: product.saleStrategy || "unlimited",
                      periodDays: product.periodDays,
                      periodPurchaseLimit: product.periodPurchaseLimit,
                      stockTotal: product.stockTotal,
                      saleStartAt: product.saleStartAt ? dayjs(product.saleStartAt) : undefined,
                      saleEndAt: product.saleEndAt ? dayjs(product.saleEndAt) : undefined,
                  }
                : { kind: "credits", currency: defaultCurrency, enabled: true, sortOrder: products.length * 10, amountYuan: 10, credits: 10, storageGB: 10, storageDurationMode: "days", storageDurationDays: 30, saleStrategy: "unlimited" },
        );
        setProductDrawer(product || null);
    };

    const saveProduct = async () => {
        if (productDrawer === undefined) return;
        const values = await productForm.validateFields();
        const storage = values.kind === "storage";
        const input = {
            name: values.name.trim(),
            description: values.description?.trim(),
            kind: values.kind || "credits",
            amountFen: Math.round(values.amountYuan * 100),
            currency: values.currency || defaultCurrency,
            creditsMicrocredits: storage ? 0 : Math.round((values.credits || 0) * 1_000_000),
            storageBytes: storage ? Math.round(values.storageGB || 0) * 1024 ** 3 : 0,
            storageDurationDays: storage && values.storageDurationMode === "days" ? values.storageDurationDays || 0 : 0,
            enabled: values.enabled,
            sortOrder: values.sortOrder || 0,
            saleStrategy: values.saleStrategy || "unlimited",
            periodDays: values.periodDays || 0,
            periodPurchaseLimit: values.periodPurchaseLimit || 0,
            stockTotal: values.stockTotal || 0,
            saleStartAt: values.saleStartAt?.toISOString(),
            saleEndAt: values.saleEndAt?.toISOString(),
        };
        setProductSaving(true);
        try {
            if (productDrawer) await updateAdminTopupProduct(productDrawer.id, input);
            else await createAdminTopupProduct(input);
            message.success(productDrawer ? translate("adminPages.payments.paymentsPage.purchaseProductUpdated") : translate("adminPages.payments.paymentsPage.purchaseProductCreated"));
            setProductDrawer(undefined);
            await loadBase();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.payments.paymentsPage.failedToSavePurchaseProduct"));
        } finally {
            setProductSaving(false);
        }
    };

    // 充值设置整体保存：默认货币与汇率一起提交，避免只改一项时清空另一项。
    const savePaymentSettings = async (next: { defaultCurrency: PaymentCurrency; usdCnyRate: string }, successText: string) => {
        const previous = { defaultCurrency, usdCnyRate };
        setDefaultCurrency(next.defaultCurrency);
        setCurrencySaving(true);
        try {
            const result = await updateAdminPaymentSettings(next);
            setDefaultCurrency(result.settings.defaultCurrency);
            setUsdCnyRate(result.settings.usdCnyRate || "");
            setRateDraft(result.settings.usdCnyRate || "");
            message.success(successText);
        } catch (error) {
            setDefaultCurrency(previous.defaultCurrency);
            setRateDraft(previous.usdCnyRate);
            message.error(error instanceof Error ? error.message : translate("adminPages.payments.paymentsPage.failedToSavePurchaseSettings"));
        } finally {
            setCurrencySaving(false);
        }
    };

    const saveDefaultCurrency = (currency: PaymentCurrency) => savePaymentSettings({ defaultCurrency: currency, usdCnyRate }, translate("adminPages.payments.paymentsPage.defaultPurchaseCurrencySwitchedTo", { v0: String(currency) }));

    const saveUsdCnyRate = () => {
        const rate = rateDraft.trim();
        if (rate === usdCnyRate) return;
        void savePaymentSettings(
            { defaultCurrency, usdCnyRate: rate },
            rate ? translate("adminPages.payments.paymentsPage.exchangeRateUpdatedTo1USDCNY", { v0: String(rate) }) : translate("adminPages.payments.paymentsPage.exchangeRateClearedCrossCurrencyChannelsCannotAcceptOrders"),
        );
    };

    const queryOrder = async (order: PaymentOrder) => {
        setOrderActionId(order.id);
        try {
            await queryAdminPaymentOrder(order.id);
            message.success(translate("adminPages.payments.paymentsPage.paymentStatusCheckedWithTheProvider"));
            await loadOrders();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.payments.paymentsPage.failedToCheckOrder"));
        } finally {
            setOrderActionId("");
        }
    };

    const closeOrder = (order: PaymentOrder) => {
        modal.confirm({
            title: translate("adminPages.payments.paymentsPage.closeTheUnpaidOrder"),
            content: translate("adminPages.payments.paymentsPage.theSystemChecksThePaymentChannelFirstIfPaymentIs"),
            okText: translate("adminPages.payments.paymentsPage.checkAndCloseOrder"),
            cancelText: translate("common.cancel"),
            onOk: async () => {
                setOrderActionId(order.id);
                try {
                    await closeAdminPaymentOrder(order.id);
                    message.success(translate("adminPages.payments.paymentsPage.orderStatusUpdated"));
                    await loadOrders();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("adminPages.payments.paymentsPage.failedToCloseOrder"));
                    throw error;
                } finally {
                    setOrderActionId("");
                }
            },
        });
    };

    const runReconciliation = async () => {
        if (!billProviderId || !billDate) return;
        setRunningBill(true);
        try {
            const result = await runAdminPaymentReconciliation({ providerId: billProviderId, billDate: billDate.format("YYYY-MM-DD") });
            if (result.run.status === "running") {
                message.info(translate("adminPages.payments.paymentsPage.reconciliationForThisProviderAndBillingDateIsAlreadyRunning"));
            } else {
                message.success(
                    result.run.recoveredItems
                        ? translate("adminPages.payments.paymentsPage.reconciliationCompleteMissingPaymentsCreditedAutomatically", { v0: String(result.run.recoveredItems) })
                        : translate("adminPages.payments.paymentsPage.reconciliationComplete"),
                );
            }
            await loadRuns(1, runPageSize);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.payments.paymentsPage.reconciliationFailed2"));
            await loadRuns(1, runPageSize);
        } finally {
            setRunningBill(false);
        }
    };

    const openRunDetails = async (run: PaymentReconciliationRun, page = 1, pageSize = detailPageSize, result = detailResult) => {
        detailRequest.current?.abort();
        const controller = new AbortController();
        detailRequest.current = controller;
        setDetailRun(run);
        setDetailResult(result);
        setDetailLoading(true);
        setDetailReady(false);
        try {
            const response = await listAdminPaymentReconciliationItems(run.id, { result: result === "all" ? undefined : result, page, pageSize }, controller.signal);
            if (controller.signal.aborted) return;
            setDetailRun(response.run);
            setDetailItems(response.items);
            setDetailTotal(response.total);
            setDetailPage(response.page);
            setDetailPageSize(response.pageSize);
            setDetailReady(true);
        } catch (error) {
            if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : translate("adminPages.payments.paymentsPage.failedToLoadReconciliationDetails"));
        } finally {
            if (!controller.signal.aborted) setDetailLoading(false);
        }
    };

    const providerNames = useMemo(() => Object.fromEntries(providers.map((item) => [item.id, item.name])), [providers]);

    const providerColumns: ColumnsType<AdminPaymentProvider> = [
        {
            title: translate("adminPages.payments.paymentsPage.paymentProvider"),
            key: "provider",
            render: (_, provider) => (
                <div className="flex items-center gap-3">
                    <PaymentBrandIcon providerId={provider.id} />
                    <div>
                        <div className="font-medium">{provider.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-foreground/45">{provider.id}</div>
                    </div>
                </div>
            ),
        },
        {
            title: translate("account.wallet.topup.paymentMethod"),
            dataIndex: "checkoutMode",
            width: 120,
            align: "center",
            render: (value) => (value === "qr_code" ? translate("account.payment.scanTitle") : translate("adminPages.payments.paymentsPage.websiteRedirect")),
        },
        {
            title: translate("library.tasks.detail.status"),
            key: "status",
            width: 180,
            align: "center",
            render: (_, provider) => (
                <div className="flex flex-col items-center gap-2">
                    <AdminStatusBadge label={provider.enabled ? translate("account.settings.channels.ready") : translate("adminPages.payments.paymentsPage.unavailable")} tone={provider.enabled ? "success" : "neutral"} />
                    <span className="text-xs text-foreground/45">
                        {translate("adminPages.payments.paymentsPage.pluginConfigurationStatus", {
                            plugin: provider.pluginEnabled ? translate("adminPages.payments.paymentsPage.available") : translate("adminPages.payments.paymentsPage.disabled2"),
                            configuration: provider.configEnabled ? translate("account.layout.oss.enabled") : translate("adminPages.payments.paymentsPage.disabled2"),
                        })}
                    </span>
                </div>
            ),
        },
        {
            title: translate("adminPages.payments.paymentsPage.automaticallyCloseUnpaidOrders"),
            dataIndex: "closeAfterMinutes",
            width: 150,
            align: "center",
            render: (value) => translate("adminPages.payments.paymentsPage.minutes", { v0: String(value || 30) }),
        },
        { title: translate("adminPages.payments.paymentsPage.configurationVersion"), dataIndex: "version", width: 105, align: "center", render: (value) => (value ? `v${value}` : translate("account.layout.oss.cdnAuthNone")) },
        {
            title: translate("account.settings.runninghub.actions"),
            key: "actions",
            width: 100,
            align: "center",
            render: (_, provider) => (
                <Button size="small" icon={<Settings2 className="size-3.5" />} onClick={() => openProvider(provider)}>
                    {translate("account.settings.channels.configure")}
                </Button>
            ),
        },
    ];

    const productColumns: ColumnsType<TopupProduct> = [
        {
            title: translate("adminPages.payments.paymentsPage.product"),
            key: "name",
            render: (_, product) => (
                <div>
                    <div className="font-medium">{product.name}</div>
                    <div className="mt-0.5 text-xs text-foreground/45">{product.description || translate("adminPages.payments.paymentsPage.noDescription")}</div>
                </div>
            ),
        },
        { title: translate("adminPages.payments.paymentsPage.salePrice"), dataIndex: "amountFen", width: 130, align: "right", render: (value, product) => <span className="font-medium tabular-nums">{formatPaymentAmount(value, product.currency)}</span> },
        {
            title: translate("adminPages.payments.paymentsPage.benefits"),
            key: "grant",
            width: 180,
            align: "right",
            render: (_, product) => (
                <span className="tabular-nums">
                    {product.kind === "storage"
                        ? `+${formatStorageCapacity(product.storageBytes)} · ${formatStorageDuration(product.storageDurationDays)}`
                        : translate("adminPages.payments.paymentsPage.credits", { v0: String(formatCredits(product.creditsMicrocredits)) })}
                </span>
            ),
        },
        { title: translate("adminPages.payments.paymentsPage.order"), dataIndex: "sortOrder", width: 90, align: "center" },
        {
            title: translate("adminPages.payments.paymentsPage.salesPolicy"),
            key: "strategy",
            width: 180,
            render: (_, product) => {
                const strategy = product.saleStrategy || "unlimited";
                const label =
                    strategy === "periodic"
                        ? translate("adminPages.payments.paymentsPage.everyDaysTimes", { v0: String(product.periodDays), v1: String(product.periodPurchaseLimit) })
                        : strategy === "inventory"
                          ? translate("adminPages.payments.paymentsPage.stock", { v0: String(product.stockRemaining ?? 0), v1: String(product.stockTotal ?? 0) })
                          : strategy === "timed"
                            ? `${product.saleStatus === "upcoming" ? translate("adminPages.payments.paymentsPage.notYetOnSale") : product.saleStatus === "ended" ? translate("account.wallet.topup.ended") : translate("adminPages.payments.paymentsPage.limitedTime")}`
                            : translate("adminPages.payments.paymentsPage.unlimited");
                return <span className="text-xs">{label}</span>;
            },
        },
        {
            title: translate("library.tasks.detail.status"),
            dataIndex: "enabled",
            width: 120,
            align: "center",
            render: (value, product) => {
                const status = product.saleStatus;
                const label = !value
                    ? translate("adminPages.payments.paymentsPage.disabled2")
                    : status === "upcoming"
                      ? translate("adminPages.payments.paymentsPage.notYetOnSale")
                      : status === "ended"
                        ? translate("account.wallet.topup.ended")
                        : status === "sold_out"
                          ? translate("account.wallet.topup.soldOut")
                          : translate("adminPages.payments.paymentsPage.onSale");
                const tone = !value || status === "upcoming" ? "neutral" : status === "sold_out" || status === "ended" ? "warning" : "success";
                return <AdminStatusBadge label={label} tone={tone} />;
            },
        },
        {
            title: translate("account.settings.runninghub.actions"),
            key: "actions",
            width: 90,
            align: "center",
            render: (_, product) => (
                <Button size="small" onClick={() => openProduct(product)}>
                    {translate("account.settings.channels.edit")}
                </Button>
            ),
        },
    ];

    const orderColumns: ColumnsType<AdminPaymentOrder> = [
        {
            title: translate("adminPages.payments.paymentsPage.users"),
            key: "user",
            width: 230,
            render: (_, order) => (
                <div className="min-w-0">
                    {order.user ? (
                        <>
                            <div className="flex min-w-0 items-baseline gap-2">
                                <button type="button" className="admin-table-primary-link truncate font-medium" title={order.user.displayName || order.user.username} onClick={() => setSelectedUserId(order.user!.id)}>
                                    {order.user.displayName || order.user.username}
                                </button>
                                <span className="truncate text-xs text-foreground/45" title={`@${order.user.username}`}>
                                    @{order.user.username}
                                </span>
                            </div>
                            <div className="mt-1 truncate text-xs text-foreground/60" title={order.user.email}>
                                {order.user.email || translate("adminPages.payments.paymentsPage.noEmailAddress")}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-foreground/60">{translate("adminPages.payments.paymentsPage.userDoesNotExist")}</div>
                            <Typography.Text className="text-xs" copyable={order.userId ? { text: order.userId } : false}>
                                {order.userId ? `${order.userId.slice(0, 8)}…${order.userId.slice(-6)}` : "--"}
                            </Typography.Text>
                        </>
                    )}
                </div>
            ),
        },
        {
            title: translate("adminPages.payments.paymentsPage.orderProduct"),
            key: "order",
            width: 210,
            render: (_, order) => (
                <div>
                    <Typography.Text className="font-mono text-xs" title={order.merchantOrderNo} copyable={{ text: order.merchantOrderNo }}>
                        {order.merchantOrderNo.length > 20 ? `${order.merchantOrderNo.slice(0, 10)}…${order.merchantOrderNo.slice(-6)}` : order.merchantOrderNo}
                    </Typography.Text>
                    <div className="mt-1 truncate text-xs text-foreground/45" title={order.productName}>
                        {order.productName}
                    </div>
                </div>
            ),
        },
        {
            title: translate("adminPages.payments.paymentsPage.channel"),
            dataIndex: "providerId",
            width: 150,
            render: (value) => (
                <span className="inline-flex items-center gap-2">
                    <PaymentBrandIcon providerId={value} compact />
                    {providerNames[value] || value}
                </span>
            ),
        },
        {
            title: translate("adminPages.payments.paymentsPage.amountBenefits"),
            key: "amount",
            width: 170,
            align: "right",
            render: (_, order) => (
                <div>
                    <div className="font-medium tabular-nums">{formatPaymentAmount(order.amountFen, order.currency)}</div>
                    {order.chargeCurrency && order.chargeCurrency !== order.currency ? (
                        <div className="text-xs tabular-nums text-foreground/60" title={order.exchangeRate ? `1 USD = ${order.exchangeRate} CNY` : undefined}>
                            {translate("adminPages.payments.paymentsPage.charged")} {formatPaymentAmount(order.chargeAmountFen, order.chargeCurrency)}
                        </div>
                    ) : null}
                    <div className="text-xs text-foreground/45">{paymentOrderGrantLabel(order)}</div>
                </div>
            ),
        },
        { title: translate("library.tasks.detail.status"), dataIndex: "status", width: 110, align: "center", render: (value) => <AdminStatusBadge {...(paymentOrderStatus[value] || { label: value, tone: "neutral" as const })} /> },
        { title: translate("library.tasks.detail.createdAt"), dataIndex: "createdAt", width: 130, render: (value) => <span title={formatDateTime(value)}>{dayjs(value).format("MM-DD HH:mm")}</span> },
        {
            title: translate("account.settings.runninghub.actions"),
            key: "actions",
            width: 220,
            fixed: "right",
            align: "center",
            // 只显示当前状态下能执行的操作：已到账或已关闭的订单只剩“详情”，不再出现一排禁用按钮或“更多”。
            render: (_, order) => (
                <AdminRowActions
                    primary={{ label: translate("account.layout.banner.details"), icon: <Eye className="size-3.5" />, onClick: () => setSelectedOrder(order) }}
                    actions={[
                        ...(!["credited", "closed"].includes(order.status)
                            ? [{ key: "sync", label: translate("adminPages.payments.paymentsPage.syncStatus"), icon: <RefreshCw className="size-3.5" />, disabled: Boolean(orderActionId), onClick: () => queryOrder(order) }]
                            : []),
                        ...(["created", "pending", "create_failed", "closing"].includes(order.status)
                            ? [{ key: "close", label: translate("common.close"), icon: <XCircle className="size-3.5" />, danger: true, disabled: Boolean(orderActionId), onClick: () => closeOrder(order) }]
                            : []),
                    ]}
                />
            ),
        },
    ];

    const runColumns: ColumnsType<PaymentReconciliationRun> = [
        { title: translate("adminPages.payments.paymentsPage.billingDate"), dataIndex: "billDate", width: 120 },
        {
            title: translate("adminPages.payments.paymentsPage.channel"),
            dataIndex: "providerId",
            width: 190,
            render: (value) => (
                <span className="inline-flex items-center gap-2">
                    <PaymentBrandIcon providerId={value} compact />
                    {providerNames[value] || value}
                </span>
            ),
        },
        {
            title: translate("library.tasks.detail.status"),
            dataIndex: "status",
            width: 110,
            align: "center",
            render: (value) => (
                <AdminStatusBadge
                    label={value === "completed" ? translate("library.tasks.filter.succeeded") : value === "running" ? translate("adminPages.payments.paymentsPage.running") : translate("library.assets.batch.failed")}
                    tone={value === "completed" ? "success" : value === "running" ? "info" : "error"}
                />
            ),
        },
        { title: translate("adminPages.payments.paymentsPage.matched"), dataIndex: "matchItems", width: 80, align: "right" },
        { title: translate("adminPages.payments.paymentsPage.automaticCreditRecovery"), dataIndex: "recoveredItems", width: 100, align: "right", render: (value) => <span className={value ? "font-medium text-status-success" : ""}>{value}</span> },
        { title: translate("adminPages.payments.paymentsPage.error"), dataIndex: "errorItems", width: 80, align: "right", render: (value) => <span className={value ? "font-medium text-status-error" : ""}>{value}</span> },
        { title: translate("adminPages.payments.paymentsPage.completedAt"), dataIndex: "completedAt", width: 170, render: (value) => (value ? formatDateTime(value) : "--") },
        {
            title: translate("adminPages.payments.paymentsPage.details"),
            key: "actions",
            width: 90,
            align: "center",
            render: (_, run) => (
                <Button type="text" size="small" icon={<Eye className="size-3.5" />} onClick={() => void openRunDetails(run, 1, detailPageSize, "all")}>
                    {translate("adminPages.payments.paymentsPage.view")}
                </Button>
            ),
        },
    ];

    const detailColumns: ColumnsType<PaymentReconciliationItem> = [
        { title: translate("adminPages.payments.paymentsPage.result"), dataIndex: "result", width: 135, render: (value) => <AdminStatusBadge {...(reconciliationResult[value] || { label: value, tone: "neutral" as const })} /> },
        { title: translate("adminPages.payments.paymentsPage.merchantOrderNumber"), dataIndex: "merchantOrderNo", width: 255, render: (value) => <span className="font-mono text-xs">{value}</span> },
        { title: translate("adminPages.payments.paymentsPage.providerTransactionID"), dataIndex: "providerTradeNo", width: 220, render: (value) => (value ? <span className="font-mono text-xs">{value}</span> : "--") },
        { title: translate("adminPages.payments.paymentsPage.amount"), dataIndex: "amountFen", width: 110, align: "right", render: (value, item) => `${item.currency} ${(value / 100).toFixed(2)}` },
        { title: translate("library.ark.virtualFlow.descriptionLabel"), dataIndex: "detail", render: (value) => value || translate("adminPages.payments.paymentsPage.statementMatchesLocalOrders") },
    ];

    return (
        <AdminPageFrame
            title={translate("adminPages.payments.paymentsPage.paymentsAndTopUps")}
            description={translate("adminPages.payments.paymentsPage.managePaymentAdaptersTopUpProductsPaymentOrdersAndNext")}
            actions={
                <Button icon={<RefreshCw className="size-4" />} loading={loading || ordersLoading || runsLoading} onClick={() => void refresh()}>
                    {translate("common.refresh")}
                </Button>
            }
            scroll
        >
            <Callout className="my-4" tone="info" title={translate("adminPages.payments.paymentsPage.paymentRefundsAreNotAvailableOnThisPlatform")}>
                {translate("adminPages.payments.paymentsPage.administratorsCanOnlyCheckOrdersCloseOrdersAndReconcilePayments")}
            </Callout>
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: "providers",
                        label: translate("adminPages.payments.paymentsPage.paymentProvider"),
                        children: (
                            <AdminDataTable
                                table={{ rowKey: "id", loading, columns: providerColumns, dataSource: providers, pagination: false, scroll: { x: 980 } }}
                                empty={<AdminTableEmpty title={translate("adminPages.payments.paymentsPage.noPaymentProviderPluginsFound")} />}
                            />
                        ),
                    },
                    {
                        key: "products",
                        label: translate("adminPages.payments.paymentsPage.topUpProducts"),
                        children: (
                            <AdminDataTable
                                toolbar={
                                    <label className="flex items-center gap-2 text-sm" title={translate("adminPages.payments.paymentsPage.newProductsUseThisCurrencyByDefaultAndTheTop")}>
                                        <span className="text-foreground/65">{translate("adminPages.payments.paymentsPage.defaultTopUpCurrency")}</span>
                                        <Select
                                            className="w-36"
                                            aria-label={translate("adminPages.payments.paymentsPage.defaultTopUpCurrency")}
                                            value={defaultCurrency}
                                            disabled={currencySaving}
                                            options={[
                                                { value: "CNY", label: translate("adminPages.payments.paymentsPage.cNYChineseYuan") },
                                                { value: "USD", label: translate("adminPages.payments.paymentsPage.uSDUSDollar") },
                                            ]}
                                            onChange={(value) => void saveDefaultCurrency(value as PaymentCurrency)}
                                        />
                                        <span className="ml-3 text-foreground/65">1 USD =</span>
                                        <Input
                                            className="w-28"
                                            aria-label={translate("adminPages.payments.paymentsPage.uSDCNYExchangeRate")}
                                            inputMode="decimal"
                                            value={rateDraft}
                                            disabled={currencySaving}
                                            placeholder={translate("account.layout.oss.cdnAuthNone")}
                                            title={translate("adminPages.payments.paymentsPage.whenProductAndPaymentSettlementCurrenciesDifferThisRateConverts")}
                                            onChange={(event) => setRateDraft(event.target.value)}
                                            onBlur={saveUsdCnyRate}
                                            onPressEnter={saveUsdCnyRate}
                                        />
                                        <span className="text-foreground/65">CNY</span>
                                    </label>
                                }
                                trailing={
                                    <Button type="primary" className="admin-toolbar-primary-action" icon={<Plus className="size-4" />} onClick={() => openProduct()}>
                                        {translate("adminPages.payments.paymentsPage.addProduct")}
                                    </Button>
                                }
                                table={{ rowKey: "id", loading, columns: productColumns, dataSource: products, pagination: false, scroll: { x: 820 } }}
                                empty={<AdminTableEmpty title={translate("adminPages.payments.paymentsPage.noTopUpProductsYet")} />}
                            />
                        ),
                    },
                    {
                        key: "orders",
                        label: translate("adminPages.payments.paymentsPage.paymentOrders"),
                        children: (
                            <AdminDataTable
                                toolbar={
                                    <Input
                                        className="app-list-search"
                                        allowClear
                                        prefix={<Search className="size-4 text-foreground/40" />}
                                        value={orderKeyword}
                                        placeholder={translate("adminPages.payments.paymentsPage.searchNameUsernameEmailOrOrderNumber")}
                                        title={translate("adminPages.payments.paymentsPage.supportsNamesUsernamesEmailsOrderNumbersProviderTransactionIDsAnd")}
                                        onChange={(event) => setOrderKeyword(event.target.value)}
                                        onPressEnter={() => void loadOrders(1, orderPageSize, orderFilters)}
                                    />
                                }
                                toolbarFilters={
                                    <>
                                        <Select
                                            className="w-36"
                                            aria-label={translate("adminPages.payments.paymentsPage.orderStatus")}
                                            value={orderStatusFilter}
                                            onChange={setOrderStatusFilter}
                                            options={[{ value: "all", label: translate("library.ark.expiry.all") }, ...Object.entries(paymentOrderStatus).map(([value, item]) => ({ value, label: item.label }))]}
                                        />
                                        <Select
                                            className="min-w-44"
                                            aria-label={translate("adminPages.payments.paymentsPage.orderPaymentProvider")}
                                            value={orderProviderFilter}
                                            onChange={setOrderProviderFilter}
                                            options={[{ value: "all", label: translate("adminPages.payments.paymentsPage.allPaymentProviders") }, ...providers.map((provider) => ({ value: provider.id, label: provider.name }))]}
                                        />
                                        <Select
                                            className="w-32"
                                            aria-label={translate("adminPages.payments.paymentsPage.orderTimeBasis")}
                                            value={orderTimeField}
                                            onChange={setOrderTimeField}
                                            options={[
                                                { value: "created", label: translate("library.tasks.detail.createdAt") },
                                                { value: "paid", label: translate("adminPages.payments.paymentsPage.paymentTime") },
                                                { value: "credited", label: translate("adminPages.payments.paymentsPage.creditedTime") },
                                            ]}
                                        />
                                        <DatePicker.RangePicker value={orderDates} onChange={setOrderDates} placeholder={[translate("adminPages.payments.paymentsPage.startDateBeijingTime"), translate("adminPages.payments.paymentsPage.endDate")]} />
                                    </>
                                }
                                trailing={
                                    <div className="flex flex-wrap items-center gap-2">
                                        {ordersDirty && <span className="text-xs text-foreground/45">{translate("adminPages.payments.paymentsPage.runASearchToApplyTheFiltersFirst")}</span>}
                                        <Button loading={ordersLoading} onClick={() => void loadOrders(1, orderPageSize, orderFilters)}>
                                            {translate("adminPages.payments.paymentsPage.search")}
                                        </Button>
                                        <span title={translate("adminPages.payments.paymentsPage.exportAllFilteredOrdersUpTo10000Rows")}>
                                            <AdminExportButton
                                                label={translate("adminPages.payments.paymentsPage.exportCSV")}
                                                disabled={ordersDirty || !ordersReady || ordersLoading || orderTotal === 0}
                                                exportFile={() => exportAdminPaymentOrders(appliedOrders)}
                                                fileName={() => translate("adminPages.payments.paymentsPage.paymentOrdersCsv", { v0: String(dayjs().format("YYYYMMDD-HHmmss")) })}
                                            />
                                        </span>
                                    </div>
                                }
                                table={{ rowKey: "id", loading: ordersLoading, columns: orderColumns, dataSource: orders, pagination: false, tableLayout: "fixed", scroll: { x: 1110 } }}
                                empty={<AdminTableEmpty filtered={Boolean(appliedOrders.keyword || appliedOrders.status || appliedOrders.providerId || appliedOrders.from)} title={translate("adminPages.payments.paymentsPage.noPaymentOrders")} />}
                                footer={<PaginationBar alwaysShow current={orderPage} pageSize={orderPageSize} total={orderTotal} onChange={(page, size) => void loadOrders(size !== orderPageSize ? 1 : page, size)} />}
                            />
                        ),
                    },
                    {
                        key: "reconciliation",
                        label: translate("adminPages.payments.paymentsPage.paymentReconciliation"),
                        children: (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card p-3">
                                    <Select
                                        className="min-w-52"
                                        value={billProviderId || undefined}
                                        placeholder={translate("adminPages.payments.paymentsPage.selectPaymentProvider")}
                                        onChange={setBillProviderId}
                                        options={providers.map((provider) => ({ value: provider.id, label: provider.name, disabled: !provider.configured }))}
                                    />
                                    <DatePicker value={billDate} allowClear={false} disabledDate={(date) => !date.isBefore(dayjs(), "day") || date.isBefore(dayjs().subtract(3, "month"), "day")} onChange={(date) => date && setBillDate(date)} />
                                    <Button type="primary" loading={runningBill} disabled={!billProviderId} onClick={() => void runReconciliation()}>
                                        {translate("adminPages.payments.paymentsPage.runReconciliation")}
                                    </Button>
                                    <span className="text-xs text-foreground/45">{translate("adminPages.payments.paymentsPage.theSystemAutomaticallyReconcilesThePreviousDaySBillsAfter")}</span>
                                </div>
                                <AdminDataTable
                                    toolbar={
                                        <Select
                                            className="w-52"
                                            aria-label={translate("adminPages.payments.paymentsPage.reconciliationPaymentProvider")}
                                            value={runProviderFilter}
                                            onChange={setRunProviderFilter}
                                            options={[{ value: "all", label: translate("adminPages.payments.paymentsPage.allPaymentProviders") }, ...providers.map((provider) => ({ value: provider.id, label: provider.name }))]}
                                        />
                                    }
                                    toolbarFilters={
                                        <>
                                            <Select
                                                className="w-36"
                                                aria-label={translate("adminPages.payments.paymentsPage.reconciliationRunStatus")}
                                                value={runStatusFilter}
                                                onChange={setRunStatusFilter}
                                                options={[
                                                    { value: "all", label: translate("library.ark.expiry.all") },
                                                    { value: "running", label: translate("adminPages.payments.paymentsPage.running") },
                                                    { value: "completed", label: translate("library.tasks.filter.succeeded") },
                                                    { value: "failed", label: translate("library.assets.batch.failed") },
                                                ]}
                                            />
                                            <DatePicker.RangePicker value={runDates} onChange={setRunDates} placeholder={[translate("adminPages.payments.paymentsPage.billingStartDate"), translate("adminPages.payments.paymentsPage.billingEndDate")]} />
                                        </>
                                    }
                                    trailing={
                                        <div className="flex flex-wrap items-center gap-2">
                                            {runsDirty && <span className="text-xs text-foreground/45">{translate("adminPages.payments.paymentsPage.applyTheFiltersFirst")}</span>}
                                            <Button loading={runsLoading} onClick={() => void loadRuns(1, runPageSize, runFilters)}>
                                                {translate("account.layout.list.filter")}
                                            </Button>
                                            <span title={translate("adminPages.payments.paymentsPage.exportAllFilteredReconciliationSummariesIncludingFailureReasonsUpTo")}>
                                                <AdminExportButton
                                                    label={translate("adminPages.payments.paymentsPage.exportSummaryCSV")}
                                                    disabled={runsDirty || !runsReady || runsLoading || runTotal === 0}
                                                    exportFile={() => exportAdminPaymentReconciliations(appliedRuns)}
                                                    fileName={() => translate("adminPages.payments.paymentsPage.paymentReconciliationSummaryCsv", { v0: String(dayjs().format("YYYYMMDD-HHmmss")) })}
                                                />
                                            </span>
                                        </div>
                                    }
                                    table={{ rowKey: "id", loading: runsLoading, columns: runColumns, dataSource: runs, pagination: false, scroll: { x: 1000 } }}
                                    empty={<AdminTableEmpty title={translate("adminPages.payments.paymentsPage.noReconciliationRecordsYet")} />}
                                    footer={<PaginationBar alwaysShow current={runPage} pageSize={runPageSize} total={runTotal} onChange={(page, size) => void loadRuns(size !== runPageSize ? 1 : page, size)} />}
                                />
                            </div>
                        ),
                    },
                ]}
            />

            <AdminDrawer title={translate("adminPages.payments.paymentsPage.paymentOrderDetails")} size="min(680px, 100vw)" open={Boolean(selectedOrder)} onClose={() => setSelectedOrder(null)}>
                {selectedOrder && (
                    <Descriptions
                        column={1}
                        bordered
                        size="small"
                        items={[
                            {
                                key: "user",
                                label: translate("adminPages.payments.paymentsPage.users"),
                                children: selectedOrder.user ? (
                                    <button
                                        type="button"
                                        className="admin-table-primary-link"
                                        onClick={() => {
                                            setSelectedUserId(selectedOrder.user!.id);
                                            setSelectedOrder(null);
                                        }}
                                    >
                                        {selectedOrder.user.displayName || selectedOrder.user.username} · @{selectedOrder.user.username}
                                    </button>
                                ) : (
                                    translate("adminPages.payments.paymentsPage.userDoesNotExist")
                                ),
                            },
                            { key: "email", label: translate("auth.verification.email"), children: selectedOrder.user?.email || translate("adminPages.payments.paymentsPage.noEmailAddress") },
                            {
                                key: "userId",
                                label: translate("adminPages.payments.paymentsPage.userID"),
                                children: (
                                    <Typography.Text copyable className="break-all">
                                        {selectedOrder.userId || "--"}
                                    </Typography.Text>
                                ),
                            },
                            {
                                key: "order",
                                label: translate("adminPages.payments.paymentsPage.orderNumber"),
                                children: (
                                    <Typography.Text copyable className="break-all">
                                        {selectedOrder.merchantOrderNo}
                                    </Typography.Text>
                                ),
                            },
                            {
                                key: "trade",
                                label: translate("adminPages.payments.paymentsPage.providerTransactionID"),
                                children: selectedOrder.providerTradeNo ? (
                                    <Typography.Text copyable className="break-all">
                                        {selectedOrder.providerTradeNo}
                                    </Typography.Text>
                                ) : (
                                    "--"
                                ),
                            },
                            { key: "product", label: translate("adminPages.payments.paymentsPage.product"), children: selectedOrder.productName },
                            {
                                key: "channel",
                                label: translate("adminPages.payments.paymentsPage.paymentProvider"),
                                children: `${providerNames[selectedOrder.providerId] || selectedOrder.providerId}${selectedOrder.paymentMethod ? ` · ${selectedOrder.paymentMethod}` : ""}`,
                            },
                            { key: "amount", label: translate("adminPages.payments.paymentsPage.amountBenefits"), children: `${formatPaymentAmount(selectedOrder.amountFen, selectedOrder.currency)} / ${paymentOrderGrantLabel(selectedOrder)}` },
                            {
                                key: "charge",
                                label: translate("adminPages.payments.paymentsPage.amountReceived"),
                                children: `${formatPaymentAmount(selectedOrder.chargeAmountFen, selectedOrder.chargeCurrency || selectedOrder.currency)}${selectedOrder.exchangeRate ? `（1 USD = ${selectedOrder.exchangeRate} CNY）` : ""}`,
                            },
                            { key: "status", label: translate("library.tasks.detail.status"), children: paymentOrderStatus[selectedOrder.status]?.label || selectedOrder.status },
                            ...(
                                [
                                    { key: "createdAt", label: translate("library.tasks.detail.createdAt") },
                                    { key: "expiresAt", label: translate("adminPages.payments.paymentsPage.expiresAt") },
                                    { key: "providerPaidAt", label: translate("adminPages.payments.paymentsPage.paymentTime") },
                                    { key: "creditedAt", label: translate("adminPages.payments.paymentsPage.creditedTime") },
                                    { key: "closedAt", label: translate("adminPages.payments.paymentsPage.closedAt") },
                                ] as const
                            ).map(({ key, label }) => ({ key, label, children: selectedOrder[key] ? formatDateTime(selectedOrder[key]!) : "--" })),
                        ]}
                    />
                )}
            </AdminDrawer>
            <AdminUserDetailDrawer userId={selectedUserId} onClose={() => setSelectedUserId(null)} />

            <AdminDrawer
                title={providerDrawer ? translate("adminPages.payments.paymentsPage.configure2", { v0: String(providerDrawer.name) }) : translate("adminPages.payments.paymentsPage.configurePaymentProvider")}
                width={620}
                open={Boolean(providerDrawer)}
                destroyOnHidden
                onClose={() => setProviderDrawer(undefined)}
                extra={
                    <Button type="primary" loading={providerSaving} onClick={() => void saveProvider()}>
                        {translate("adminPages.payments.paymentsPage.saveNewVersion")}
                    </Button>
                }
            >
                {providerDrawer ? (
                    <Form form={providerForm} layout="vertical" requiredMark="optional">
                        <Callout
                            className="mb-4"
                            tone={providerDrawer.pluginEnabled ? "info" : "warning"}
                            title={
                                providerDrawer.pluginEnabled
                                    ? translate("adminPages.payments.paymentsPage.secretsAreStoredEncryptedExistingOrdersContinueToUseThe")
                                    : translate("adminPages.payments.paymentsPage.thisHostPluginIsDisabledInPluginManagementAfterSaving")
                            }
                        />
                        <Form.Item name="enabled" label={translate("adminPages.payments.paymentsPage.enableProviderConfiguration")} valuePropName="checked">
                            <Switch />
                        </Form.Item>
                        <Form.Item name="closeAfterMinutes" label={translate("adminPages.payments.paymentsPage.automaticallyCloseUnpaidOrdersAfterMinutes")} rules={[{ required: true }, { type: "number", min: 5, max: 1440 }]}>
                            <InputNumber min={5} max={1440} precision={0} className="w-full" />
                        </Form.Item>
                        {providerDrawer.configFields.map((field) => {
                            const secretReady = Boolean(providerDrawer.secretConfigured[field.name]);
                            const rules = field.required && !secretReady ? [{ required: true, message: translate("adminPages.payments.paymentsPage.enter", { v0: String(field.label || field.name) }) }] : undefined;
                            const placeholder = field.secret && secretReady ? configuredSecretText : field.description || undefined;
                            const options = (field.values || []).map((value) => ({ value, label: value }));
                            if (field.type === "multiselect") {
                                // 多选值以逗号分隔字符串保存；允许输入清单外的值（如易支付自定义通道 bank:网银）。
                                return (
                                    <Form.Item
                                        key={field.name}
                                        name={["values", field.name]}
                                        label={field.label || field.name}
                                        extra={field.description}
                                        rules={rules}
                                        getValueProps={(value: string | undefined) => ({ value: splitConfigList(value) })}
                                        normalize={(value: string[] | undefined) =>
                                            (value || [])
                                                .map((item) => item.trim())
                                                .filter(Boolean)
                                                .join(",")
                                        }
                                    >
                                        <Select mode="tags" options={options} tokenSeparators={[",", "，"]} placeholder={placeholder} />
                                    </Form.Item>
                                );
                            }
                            const input =
                                field.type === "textarea" ? (
                                    <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} placeholder={placeholder} autoComplete="off" />
                                ) : field.type === "password" || field.secret ? (
                                    <Input.Password placeholder={placeholder} autoComplete="new-password" />
                                ) : options.length ? (
                                    <Select options={options} placeholder={placeholder} />
                                ) : (
                                    <Input placeholder={placeholder} />
                                );
                            return (
                                <Form.Item key={field.name} name={["values", field.name]} label={field.label || field.name} extra={field.description} rules={rules}>
                                    {input}
                                </Form.Item>
                            );
                        })}
                    </Form>
                ) : null}
            </AdminDrawer>

            <AdminDrawer
                title={productDrawer ? translate("adminPages.payments.paymentsPage.editProduct") : translate("adminPages.payments.paymentsPage.addProduct")}
                width={520}
                open={productDrawer !== undefined}
                destroyOnHidden
                onClose={() => setProductDrawer(undefined)}
                extra={
                    <Button type="primary" loading={productSaving} onClick={() => void saveProduct()}>
                        {translate("common.save")}
                    </Button>
                }
            >
                <Form form={productForm} layout="vertical" requiredMark="optional">
                    <Form.Item name="name" label={translate("adminPages.payments.paymentsPage.productName")} rules={[{ required: true, max: 120 }]}>
                        <Input placeholder={translate("adminPages.payments.paymentsPage.forExample100Credits50GBAnnualPlan")} />
                    </Form.Item>
                    <Form.Item name="description" label={translate("adminPages.payments.paymentsPage.productDescription")} rules={[{ max: 500 }]}>
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item
                        name="kind"
                        label={translate("adminPages.payments.paymentsPage.productType")}
                        rules={[{ required: true }]}
                        extra={productDrawer ? translate("adminPages.payments.paymentsPage.productTypeCannotBeChangedAfterCreationCreateANew") : translate("adminPages.payments.paymentsPage.storageProductsRemainAvailableForPurchaseWhenCreditsAreDisabled")}
                    >
                        <Select
                            disabled={Boolean(productDrawer)}
                            options={[
                                { value: "credits", label: translate("adminPages.payments.paymentsPage.creditTopUp") },
                                { value: "storage", label: translate("adminPages.payments.paymentsPage.storageExpansion") },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item
                        name="currency"
                        label={translate("adminPages.payments.paymentsPage.saleCurrency")}
                        rules={[{ required: true }]}
                        extra={translate("adminPages.payments.paymentsPage.thePaymentChannelMustSupportTheSelectedCurrencyDomesticPayment")}
                    >
                        <Select
                            options={[
                                { value: "CNY", label: translate("adminPages.payments.paymentsPage.cNYChineseYuan") },
                                { value: "USD", label: translate("adminPages.payments.paymentsPage.uSDUSDollar") },
                            ]}
                        />
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-3">
                        <Form.Item
                            name="amountYuan"
                            label={selectedProductCurrency === "USD" ? translate("adminPages.payments.paymentsPage.salePriceUSD") : translate("adminPages.payments.paymentsPage.salePriceCNY")}
                            rules={[{ required: true }, { type: "number", min: 0.01, max: 1_000_000 }]}
                        >
                            <InputNumber min={0.01} max={1_000_000} precision={2} className="w-full" />
                        </Form.Item>
                        {selectedProductKind === "storage" ? (
                            <Form.Item
                                name="storageGB"
                                label={translate("adminPages.payments.paymentsPage.additionalCapacityGB")}
                                rules={[{ required: true }, { type: "integer", min: 1, max: 100_000, message: translate("adminPages.payments.paymentsPage.enterAnIntegerFrom1To100000GB") }]}
                            >
                                <InputNumber min={1} max={100_000} precision={0} className="w-full" />
                            </Form.Item>
                        ) : (
                            <Form.Item
                                name="credits"
                                label={translate("adminPages.payments.paymentsPage.creditsDelivered")}
                                rules={[
                                    { required: true },
                                    {
                                        validator: (_, value) => {
                                            const credits = Number(value);
                                            const microcredits = Math.round(credits * 1_000_000);
                                            return Number.isFinite(credits) && credits > 0 && credits <= 1_000_000_000 && Number.isSafeInteger(microcredits)
                                                ? Promise.resolve()
                                                : Promise.reject(new Error(translate("adminPages.payments.paymentsPage.enterASafelyRepresentableCreditAmountFrom0000001To")));
                                        },
                                    },
                                ]}
                            >
                                <InputNumber min={0.000001} max={1_000_000_000} precision={6} className="w-full" />
                            </Form.Item>
                        )}
                    </div>
                    {selectedProductKind === "storage" ? (
                        <div className="grid grid-cols-2 gap-3">
                            <Form.Item name="storageDurationMode" label={translate("adminPages.payments.paymentsPage.validity")} rules={[{ required: true }]}>
                                <Select
                                    options={[
                                        { value: "days", label: translate("adminPages.payments.paymentsPage.byNumberOfDays") },
                                        { value: "permanent", label: translate("adminPages.payments.paymentsPage.neverExpires") },
                                    ]}
                                />
                            </Form.Item>
                            {selectedStorageDurationMode === "days" ? (
                                <Form.Item
                                    name="storageDurationDays"
                                    label={translate("adminPages.payments.paymentsPage.validForDays")}
                                    extra={translate("adminPages.payments.paymentsPage.startsWhenPaymentIsConfirmedCommonDurationsAre3090")}
                                    rules={[{ required: true }, { type: "integer", min: 1, max: 3650, message: translate("adminPages.payments.paymentsPage.enter13650Days") }]}
                                >
                                    <InputNumber min={1} max={3650} precision={0} className="w-full" />
                                </Form.Item>
                            ) : null}
                        </div>
                    ) : null}
                    <Form.Item name="saleStrategy" label={translate("adminPages.payments.paymentsPage.salesPolicy")} rules={[{ required: true }]}>
                        <Select
                            options={[
                                { value: "unlimited", label: translate("adminPages.payments.paymentsPage.unlimitedDefault") },
                                { value: "periodic", label: translate("adminPages.payments.paymentsPage.periodic") },
                                { value: "inventory", label: translate("adminPages.payments.paymentsPage.stockLimited") },
                                { value: "timed", label: translate("adminPages.payments.paymentsPage.timeLimited") },
                            ]}
                        />
                    </Form.Item>
                    {selectedProductStrategy === "periodic" ? (
                        <div className="grid grid-cols-2 gap-3">
                            <Form.Item name="periodDays" label={translate("adminPages.payments.paymentsPage.periodLengthDays")} rules={[{ required: true }, { type: "number", min: 1, max: 3650 }]}>
                                <InputNumber min={1} max={3650} precision={0} className="w-full" />
                            </Form.Item>
                            <Form.Item name="periodPurchaseLimit" label={translate("adminPages.payments.paymentsPage.purchasesAllowedPerPeriod")} rules={[{ required: true }, { type: "number", min: 1, max: 100000 }]}>
                                <InputNumber min={1} max={100000} precision={0} className="w-full" />
                            </Form.Item>
                        </div>
                    ) : null}
                    {selectedProductStrategy === "inventory" ? (
                        <Form.Item
                            name="stockTotal"
                            label={translate("adminPages.payments.paymentsPage.totalPlatformStock")}
                            extra={translate("adminPages.payments.paymentsPage.stockCannotBeReducedBelowTheNumberAlreadySoldUnpaid")}
                            rules={[{ required: true }, { type: "number", min: 1, max: 9_000_000_000 }]}
                        >
                            <InputNumber min={1} max={9_000_000_000} precision={0} className="w-full" />
                        </Form.Item>
                    ) : null}
                    {selectedProductStrategy === "timed" ? (
                        <div className="grid grid-cols-2 gap-3">
                            <Form.Item name="saleStartAt" label={translate("adminPages.payments.paymentsPage.saleStartTime")} rules={[{ required: true, message: translate("adminPages.payments.paymentsPage.selectSaleStartTime") }]}>
                                <DatePicker showTime className="w-full" />
                            </Form.Item>
                            <Form.Item name="saleEndAt" label={translate("adminPages.payments.paymentsPage.endTime")} rules={[{ required: true, message: translate("adminPages.payments.paymentsPage.selectEndTime") }]}>
                                <DatePicker showTime className="w-full" />
                            </Form.Item>
                        </div>
                    ) : null}
                    <Form.Item name="sortOrder" label={translate("adminPages.payments.paymentsPage.order")} rules={[{ required: true }]}>
                        <InputNumber precision={0} className="w-full" />
                    </Form.Item>
                    <Form.Item name="enabled" label={translate("adminPages.payments.paymentsPage.availableForSale")} valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </AdminDrawer>

            <AdminDrawer
                title={
                    detailRun
                        ? translate("adminPages.payments.paymentsPage.reconciliationDetails", { v0: String(providerNames[detailRun.providerId] || detailRun.providerId), v1: String(detailRun.billDate) })
                        : translate("adminPages.payments.paymentsPage.reconciliationDetails2")
                }
                width="min(1080px, 94vw)"
                open={Boolean(detailRun)}
                destroyOnHidden
                onClose={() => {
                    detailRequest.current?.abort();
                    setDetailReady(false);
                    setDetailRun(undefined);
                    setDetailItems([]);
                }}
            >
                {detailRun?.error ? (
                    <Callout className="mb-4" tone="error" title={translate("adminPages.payments.paymentsPage.reconciliationFailed")}>
                        {detailRun.error}
                    </Callout>
                ) : null}
                <AdminDataTable
                    toolbar={
                        <Select
                            className="w-44"
                            aria-label={translate("adminPages.payments.paymentsPage.reconciliationResult")}
                            value={detailResult}
                            onChange={(value) => {
                                setDetailResult(value);
                                if (detailRun) void openRunDetails(detailRun, 1, detailPageSize, value);
                            }}
                            options={[
                                { value: "all", label: translate("adminPages.payments.paymentsPage.allResults") },
                                { value: "abnormal", label: translate("adminPages.payments.paymentsPage.exceptionsOnly") },
                                ...Object.entries(reconciliationResult).map(([value, item]) => ({ value, label: item.label })),
                            ]}
                        />
                    }
                    trailing={
                        <div className="flex items-center gap-2">
                            <Button loading={detailLoading} onClick={() => detailRun && void openRunDetails(detailRun)}>
                                {translate("common.refresh")}
                            </Button>
                            <span
                                title={
                                    detailRun?.status === "running"
                                        ? translate("adminPages.payments.paymentsPage.reconciliationIsRunningExportIsAvailableWhenItFinishes")
                                        : translate("adminPages.payments.paymentsPage.exportAllDetailsForTheCurrentBillAndResultFilters")
                                }
                            >
                                <AdminExportButton
                                    label={translate("adminPages.payments.paymentsPage.exportDetailsCSV")}
                                    disabled={!detailReady || detailLoading || runningBill || detailRun?.status !== "completed" || detailTotal === 0}
                                    exportFile={() => exportAdminPaymentReconciliationItems(detailRun!.id, detailResult === "all" ? undefined : detailResult)}
                                    fileName={() => translate("adminPages.payments.paymentsPage.paymentReconciliationDetailsCsv", { v0: String(detailRun?.providerId), v1: String(detailRun?.billDate), v2: String(dayjs().format("YYYYMMDD-HHmmss")) })}
                                />
                            </span>
                        </div>
                    }
                    table={{ rowKey: "id", loading: detailLoading, columns: detailColumns, dataSource: detailItems, pagination: false, scroll: { x: 950 } }}
                    empty={<AdminTableEmpty title={detailRun?.status === "failed" ? translate("adminPages.payments.paymentsPage.thisReconciliationProducedNoDetails") : translate("adminPages.payments.paymentsPage.theBillContainsNoTransactions")} />}
                    footer={<PaginationBar alwaysShow current={detailPage} pageSize={detailPageSize} total={detailTotal} onChange={(page, size) => detailRun && void openRunDetails(detailRun, size !== detailPageSize ? 1 : page, size, detailResult)} />}
                />
            </AdminDrawer>
        </AdminPageFrame>
    );
}

function formatDateTime(value: string) {
    return dayjs(value).format("YYYY-MM-DD HH:mm:ss");
}
