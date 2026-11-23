import type { ColumnsType } from "antd/es/table";
import type { AdminAnalytics, AnalyticsFinance } from "@/services/api/auth";
import { currentLocale, translate } from "@/i18n";

export function formatCredits(value: number | null | undefined) {
    return value == null ? "--" : new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 6 }).format(value / 1_000_000);
}

export function formatFinanceCost(finance: AnalyticsFinance | null | undefined) {
    if (!finance?.costedOrders) return "--";
    return `${formatCredits(finance.costMicrocredits)}${finance.costedOrders < finance.settledOrders ? translate("admin.analyticsFinance.partial") : ""}`;
}

export function formatFinanceMargin(value: number | null | undefined) {
    return value == null ? "--" : `${value.toFixed(1)}%`;
}

export const analyticsFinanceColumns: ColumnsType<AdminAnalytics["models"][number]> = [
    { title: translate("admin.analyticsFinance.revenueCredits"), width: 130, render: (_, row) => formatCredits(row.finance?.revenueMicrocredits) },
    { title: translate("admin.analyticsFinance.costCredits"), width: 150, render: (_, row) => formatFinanceCost(row.finance) },
    { title: translate("admin.analyticsFinance.profitCredits"), width: 130, render: (_, row) => formatCredits(row.finance?.profitMicrocredits) },
    { title: translate("admin.analyticsFinance.profitMargin"), width: 100, render: (_, row) => formatFinanceMargin(row.finance?.profitMargin) },
];
