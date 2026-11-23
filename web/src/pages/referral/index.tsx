import { useQuery } from "@tanstack/react-query";
import { App, Button, Input, Skeleton } from "antd";
import { Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
import { PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { ApiError } from "@/services/api/request";
import { formatReferralCredits, formatReferralRate, formatReferralYuan, getReferralOverview, listReferralCommissions, listReferralInvitees, referralLink } from "@/services/api/referral";
import { useUserStore } from "@/stores/use-user-store";
import "./referral-page.css";
import { currentLocale, translate } from "@/i18n";


type RecordTab = "invitees" | "commissions";

const PAGE_SIZE = 20;

export default function ReferralPage() {
    const { message } = App.useApp();
    const referralAvailable = useUserStore((state) => state.referralAvailable);
    const hydrated = useUserStore((state) => state.hydrated);
    const [tab, setTab] = useState<RecordTab>("invitees");
    const [page, setPage] = useState(1);
    const overview = useQuery({ queryKey: ["referral", "overview"], queryFn: getReferralOverview, enabled: referralAvailable });
    const invitees = useQuery({ queryKey: ["referral", "invitees", page], queryFn: () => listReferralInvitees({ page, pageSize: PAGE_SIZE }), enabled: referralAvailable && tab === "invitees" });
    const commissions = useQuery({ queryKey: ["referral", "commissions", page], queryFn: () => listReferralCommissions({ page, pageSize: PAGE_SIZE }), enabled: referralAvailable && tab === "commissions" });

    // 入口不可见时直接访问 URL 也不展示页面；后端同样会拒绝。
    if (hydrated && !referralAvailable) return <Navigate to="/" replace />;
    const forbidden = overview.error instanceof ApiError && overview.error.status === 403;
    if (forbidden) return <Navigate to="/" replace />;

    const data = overview.data;
    const link = data ? referralLink(data.code) : "";
    const copy = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            message.success(translate("shared.referral.copied", { v0: String(label) }));
        } catch {
            message.error(translate("shared.referral.copyFailedSelectAndCopyManually"));
        }
    };
    const refresh = () => {
        void overview.refetch();
        void (tab === "invitees" ? invitees.refetch() : commissions.refetch());
    };
    const records = tab === "invitees" ? invitees : commissions;
    const total = records.data?.total ?? 0;

    return (
        <WorkspacePage className="referral-page">
            <PageHeader
                title={translate("shell.account.referral")}
                description={translate("shared.referral.shareYourPersonalLinkToInviteNewUsersWhenThey")}
                actions={
                    <Button icon={<RefreshCw className="size-3.5" />} loading={overview.isFetching} onClick={refresh}>
                        {translate("common.refresh")}
                    </Button>
                }
            />
            <div className="mt-4 grid gap-4">
                {overview.isPending ? (
                    <Skeleton active paragraph={{ rows: 4 }} />
                ) : overview.error ? (
                    <div className="referral-page-link-card">
                        <p>{overview.error instanceof Error ? overview.error.message : translate("shared.referral.failedToLoadReferralInformation")}</p>
                        <div>
                            <Button onClick={() => void overview.refetch()}>{translate("common.retry")}</Button>
                        </div>
                    </div>
                ) : data ? (
                    <>
                        <section className="referral-page-link-card" aria-label={translate("shared.referral.myReferralLink")}>
                            <h2>{translate("shared.referral.myReferralLink")}</h2>
                            <div className="referral-page-link-row">
                                <Input readOnly value={link} aria-label={translate("shared.referral.referralLink")} onFocus={(event) => event.currentTarget.select()} />
                                <Button type="primary" icon={<Copy className="size-3.5" />} onClick={() => void copy(link, translate("shared.referral.referralLink"))}>
                                    {translate("shared.referral.copyLink")}
                                </Button>
                            </div>
                            <p>
                                {translate("shared.referral.referralCode")} <span className="referral-page-code font-semibold">{data.code}</span>
                                <Button type="link" size="small" onClick={() => void copy(data.code, translate("shared.referral.referralCode"))}>
                                    {translate("canvasB.common.copy")}
                                </Button>
                                {translate("shared.referral.currentCommissionRate")} {formatReferralRate(data.commissionRateBasisPoints)}{translate("shared.referral.calculatedFromEachInvitedUserSCreditedPurchaseCommissionIs")}
                            </p>
                        </section>
                        <section className="referral-page-stats" aria-label={translate("shared.referral.referralEarnings")}>
                            <Stat label={translate("shared.referral.invitedRegistrations")} value={translate("shared.referral.users", { v0: String(data.stats.inviteeCount) })} />
                            <Stat label={translate("shared.referral.payingUsers")} value={translate("shared.referral.users", { v0: String(data.stats.paidInviteeCount) })} />
                            <Stat label={translate("shared.referral.referredPurchaseAmount")} value={formatReferralYuan(data.stats.orderAmountFen)} />
                            <Stat label={translate("shared.referral.totalCommissionCredits")} value={formatReferralCredits(data.stats.commissionMicrocredits)} />
                        </section>
                    </>
                ) : null}
                <section className="referral-page-records" aria-label={translate("shared.referral.referralHistory")}>
                    <SegmentedControl<RecordTab>
                        ariaLabel={translate("shared.referral.referralRecordType")}
                        size="sm"
                        value={tab}
                        options={[
                            { value: "invitees", label: translate("shared.referral.invitationHistory") },
                            { value: "commissions", label: translate("shared.referral.commissionHistory") },
                        ]}
                        onChange={(next) => {
                            setTab(next);
                            setPage(1);
                        }}
                    />
                    <div className="mt-2">
                        {records.isPending ? (
                            <Skeleton active paragraph={{ rows: 3 }} title={false} />
                        ) : records.error ? (
                            <div className="referral-page-empty">{records.error instanceof Error ? records.error.message : translate("shared.referral.failedToLoadRecords")}</div>
                        ) : tab === "invitees" ? (
                            invitees.data?.invitees.length ? (
                                invitees.data.invitees.map((item, index) => (
                                    <div key={`${item.createdAt}-${index}`} className="referral-page-record-row">
                                        <div>
                                            {item.name}
                                            <small>{translate("shared.referral.registeredOn")} {formatTime(item.createdAt)}</small>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="referral-page-empty">{translate("shared.referral.noUsersHaveRegisteredThroughYourLinkYet")}</div>
                            )
                        ) : commissions.data?.commissions.length ? (
                            commissions.data.commissions.map((item) => (
                                <div key={item.id} className="referral-page-record-row">
                                    <div>
                                        {item.inviteeName} {translate("shared.referral.purchase")} {formatReferralYuan(item.orderAmountFen)}（{formatReferralCredits(item.orderCreditsMicrocredits)} {translate("shared.referral.credits")}
                                        <small>
                                            {formatTime(item.createdAt)} {translate("shared.referral.commissionRate")} {formatReferralRate(item.rateBasisPoints)}
                                        </small>
                                    </div>
                                    <b>+{formatReferralCredits(item.commissionMicrocredits)}</b>
                                </div>
                            ))
                        ) : (
                            <div className="referral-page-empty">{translate("shared.referral.noCommissionHistoryYet")}</div>
                        )}
                    </div>
                    {total > PAGE_SIZE ? <PaginationBar current={page} pageSize={PAGE_SIZE} total={total} pageSizeOptions={[PAGE_SIZE]} onChange={(next) => setPage(next)} /> : null}
                </section>
            </div>
        </WorkspacePage>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="referral-page-stat">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function formatTime(value: string) {
    return new Date(value).toLocaleString(currentLocale(), { hour12: false });
}
