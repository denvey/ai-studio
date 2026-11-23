import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, InputNumber } from "antd";
import { Gift, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { PaginationBar } from "@/components/layout/workspace-page";
import { formatReferralCredits, formatReferralRate, formatReferralYuan, getAdminReferralSetting, listAdminReferralCommissions, updateAdminReferralSetting, type ReferralCommission, type ReferralMode, type ReferralSetting } from "@/services/api/referral";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminDataTable, AdminTableEmpty, SettingsSectionCard } from "../components/admin-ui";
import { Switch } from "../ui/controls";
import { currentLocale, translate } from "@/i18n";


const PAGE_SIZE = 20;

export default function AdminReferralPage() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const setting = useQuery({ queryKey: ["admin", "referral", "setting"], queryFn: async () => (await getAdminReferralSetting()).setting });
    const [draft, setDraft] = useState<ReferralSetting | null>(null);
    const [saving, setSaving] = useState(false);
    const [page, setPage] = useState(1);
    const commissions = useQuery({ queryKey: ["admin", "referral", "commissions", page], queryFn: () => listAdminReferralCommissions({ page, pageSize: PAGE_SIZE }) });

    useEffect(() => {
        if (setting.data) setDraft(setting.data);
    }, [setting.data]);

    const dirty = Boolean(draft && setting.data && (draft.enabled !== setting.data.enabled || draft.mode !== setting.data.mode || draft.commissionRateBasisPoints !== setting.data.commissionRateBasisPoints));
    const save = async () => {
        if (!draft) return;
        setSaving(true);
        try {
            const result = await updateAdminReferralSetting(draft);
            queryClient.setQueryData(["admin", "referral", "setting"], result.setting);
            setDraft(result.setting);
            message.success(translate("adminPages.referral.referralAdminPage.referralSettingsSavedTheEntryWillUpdateWhenUsersRefresh"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.referral.referralAdminPage.failedToSaveReferralSettings"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminPageFrame
            title={translate("shell.account.referral")}
            description={translate("adminPages.referral.referralAdminPage.allowAllUsersOrDesignatedReferrersAndSetTheCommission")}
            scroll
            actions={
                <Button icon={<RefreshCw className="size-3.5" />} loading={setting.isFetching || commissions.isFetching} onClick={() => void Promise.all([setting.refetch(), commissions.refetch()])}>
                    {translate("common.refresh")}
                </Button>
            }
        >
            <div className="admin-settings-stack">
                <SettingsSectionCard
                    icon={<Gift className="size-4" />}
                    title={translate("adminPages.referral.referralAdminPage.referralSettings")}
                    description={translate("adminPages.referral.referralAdminPage.inDesignatedReferrerModeEditUsersInUserManagementAnd")}
                    status={setting.data ? { label: setting.data.enabled ? translate("adminPages.referral.referralAdminPage.enabled") : translate("adminPages.referral.referralAdminPage.disabled"), color: setting.data.enabled ? "success" : undefined } : undefined}
                    footer={
                        <>
                            <span className="text-xs text-foreground/55">{translate("adminPages.referral.referralAdminPage.commissionIsCalculatedOnCreditsReceivedForEachPurchaseBy")}</span>
                            <Button type="primary" icon={<Save className="size-3.5" />} loading={saving} disabled={!dirty} onClick={() => void save()}>
                                {translate("common.save")}
                            </Button>
                        </>
                    }
                >
                    {setting.error ? (
                        <div className="px-3 py-3 text-sm" role="alert">
                            {setting.error instanceof Error ? setting.error.message : translate("adminPages.referral.referralAdminPage.failedToLoadReferralSettings")}
                            <Button type="link" onClick={() => void setting.refetch()}>
                                {translate("common.retry")}
                            </Button>
                        </div>
                    ) : !draft ? (
                        <div className="px-3 py-3 text-sm text-foreground/55">{translate("adminPages.referral.referralAdminPage.loading")}</div>
                    ) : (
                        <div className="grid gap-4 px-3 py-3">
                            <label className="flex items-center justify-between gap-3">
                                <span>
                                    <strong className="block text-sm">{translate("adminPages.referral.referralAdminPage.enableReferralCenter")}</strong>
                                    <span className="text-xs text-foreground/55">{translate("adminPages.referral.referralAdminPage.whenDisabledTheEntryIsHiddenForEveryoneNewSignups")}</span>
                                </span>
                                <Switch aria-label={translate("adminPages.referral.referralAdminPage.enableReferralCenter")} checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />
                            </label>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <span>
                                    <strong className="block text-sm">{translate("adminPages.referral.referralAdminPage.accessMode")}</strong>
                                    <span className="text-xs text-foreground/55">{draft.mode === "all" ? translate("adminPages.referral.referralAdminPage.allActiveAccountsCanViewTheReferralCenterReferralLinks") : translate("adminPages.referral.referralAdminPage.onlyDesignatedReferrersCanAccessTheReferralCenterAndEarn")}</span>
                                </span>
                                <SegmentedControl<ReferralMode>
                                    ariaLabel={translate("adminPages.referral.referralAdminPage.referralAccessMode")}
                                    size="sm"
                                    value={draft.mode}
                                    options={[
                                        { value: "all", label: translate("adminPages.referral.referralAdminPage.allUsers") },
                                        { value: "assigned", label: translate("adminPages.referral.referralAdminPage.designatedReferrers") },
                                    ]}
                                    onChange={(mode) => setDraft({ ...draft, mode })}
                                />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <span>
                                    <strong className="block text-sm">{translate("adminPages.referral.referralAdminPage.commissionRate")}</strong>
                                    <span className="text-xs text-foreground/55">{translate("adminPages.referral.referralAdminPage.item050ChangesApplyOnlyToOrdersCreditedAfterward")}</span>
                                </span>
                                <InputNumber
                                    aria-label={translate("adminPages.referral.referralAdminPage.commissionRate")}
                                    min={0}
                                    max={50}
                                    step={0.5}
                                    precision={2}
                                    suffix="%"
                                    value={draft.commissionRateBasisPoints / 100}
                                    onChange={(value) => setDraft({ ...draft, commissionRateBasisPoints: Math.round(Number(value ?? 0) * 100) })}
                                />
                            </div>
                        </div>
                    )}
                </SettingsSectionCard>
                <SettingsSectionCard title={translate("adminPages.referral.referralAdminPage.commissionHistory")} description={translate("adminPages.referral.referralAdminPage.siteWideReferralCommissionsNewestFirstByCreditingTime")} layout="stacked">
                    <AdminDataTable<ReferralCommission>
                        empty={<AdminTableEmpty title={translate("adminPages.referral.referralAdminPage.noCommissionsYet")} description={translate("adminPages.referral.referralAdminPage.entriesAppearHereWhenReferredUsersCompleteCreditPurchases")} />}
                        footer={commissions.data && commissions.data.total > PAGE_SIZE ? <PaginationBar current={page} pageSize={PAGE_SIZE} total={commissions.data.total} pageSizeOptions={[PAGE_SIZE]} onChange={(next) => setPage(next)} /> : undefined}
                        table={{
                            rowKey: "id",
                            loading: commissions.isPending,
                            dataSource: commissions.data?.commissions ?? [],
                            pagination: false,
                            columns: [
                                { key: "inviter", title: translate("adminPages.referral.referralAdminPage.referrer"), dataIndex: "inviterName" },
                                { key: "invitee", title: translate("adminPages.referral.referralAdminPage.referredUser"), dataIndex: "inviteeName" },
                                { key: "amount", title: translate("adminPages.referral.referralAdminPage.purchaseAmount"), dataIndex: "orderAmountFen", align: "right", render: (value: number) => <span className="tabular-nums">{formatReferralYuan(value)}</span> },
                                { key: "credits", title: translate("adminPages.referral.referralAdminPage.creditsDelivered"), dataIndex: "orderCreditsMicrocredits", align: "right", render: (value: number) => <span className="tabular-nums">{formatReferralCredits(value)}</span> },
                                { key: "rate", title: translate("canvasB.sizePicker.placeholder"), dataIndex: "rateBasisPoints", align: "center", render: (value: number) => formatReferralRate(value) },
                                { key: "commission", title: translate("adminPages.referral.referralAdminPage.commissionCredits"), dataIndex: "commissionMicrocredits", align: "right", render: (value: number) => <span className="tabular-nums">+{formatReferralCredits(value)}</span> },
                                { key: "createdAt", title: translate("adminPages.referral.referralAdminPage.creditedTime"), dataIndex: "createdAt", align: "center", render: (value: string) => <span className="tabular-nums">{new Date(value).toLocaleString(currentLocale(), { hour12: false })}</span> },
                            ],
                        }}
                    />
                </SettingsSectionCard>
            </div>
        </AdminPageFrame>
    );
}
