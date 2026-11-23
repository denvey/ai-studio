import { useEffect, useState } from "react";
import { App } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";

import { Switch } from "@/components/ui/base/switch";
import { getAdminBillingAutoRefund, updateAdminBillingAutoRefund } from "@/services/api/wallet";
import { translate } from "@/i18n";

/**
 * 积分运营页右上角的“自动退回”开关。默认关闭；仅处理关联通用任务已失败或取消、
 * 且无作品交付或待恢复证据的冻结订单。开启前二次确认，因为上游仍可能已产生费用。
 */
export function BillingAutoRefundToggle() {
    const { message } = App.useApp();
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    useEffect(() => {
        let active = true;
        void getAdminBillingAutoRefund()
            .then(({ setting }) => {
                if (active) setEnabled(setting.enabled);
            })
            .catch((error) => {
                if (active) message.error(error instanceof Error ? error.message : translate("admin.billingAutoRefundToggle.failedToLoadAutomaticRefundSettings"));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [message]);

    const save = async (next: boolean) => {
        setSaving(true);
        try {
            const { setting } = await updateAdminBillingAutoRefund(next);
            setEnabled(setting.enabled);
            setConfirmOpen(false);
            message.success(setting.enabled ? translate("admin.billingAutoRefundToggle.automaticRefundsEnabledOnlyEligibleFailedOrCanceledTasksWithout") : translate("admin.billingAutoRefundToggle.automaticRefundsDisabled"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.billingAutoRefundToggle.failedToSaveAutomaticRefundSettings"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <label className="inline-flex h-8 items-center gap-2 rounded-[var(--r-md)] px-2 text-[var(--fs-body)]" title={translate("admin.billingAutoRefundToggle.automaticallyRefundEligibleFrozenOrdersOnlyWhenTheirLinkedGeneral")}>
                <span>{translate("admin.billingAutoRefundToggle.automaticRefunds")}</span>
                <Switch
                    size="sm"
                    aria-label={translate("admin.billingAutoRefundToggle.automaticRefundsOfFrozenCredits")}
                    checked={enabled}
                    loading={loading || (saving && !confirmOpen)}
                    disabled={loading || saving}
                    onChange={(checked) => {
                        if (checked) setConfirmOpen(true);
                        else void save(false);
                    }}
                />
            </label>
            <AdminModal
                title={translate("admin.billingAutoRefundToggle.enableAutomaticRefundsOfFrozenCredits")}
                open={confirmOpen}
                okText={translate("admin.billingAutoRefundToggle.confirmEnabling")}
                cancelText={translate("common.cancel")}
                okButtonProps={{ danger: true }}
                confirmLoading={saving}
                closable={!saving}
                mask={{ closable: !saving }}
                onCancel={() => {
                    if (!saving) setConfirmOpen(false);
                }}
                onOk={() => void save(true)}
                destroyOnHidden
            >
                <p className="admin-operation-confirmation-copy">{translate("admin.billingAutoRefundToggle.whenEnabledTheSystemChecksFrozenOrdersInBatchesEvery")}</p>
                <p className="admin-operation-confirmation-copy">{translate("admin.billingAutoRefundToggle.ordersAreNotAutomaticallyRefundedIfTheirTaskIsQueued")}</p>
                <p className="admin-operation-confirmation-copy">{translate("admin.billingAutoRefundToggle.someRequestsMayAlreadyHaveIncurredUpstreamChargesThePlatform")}</p>
            </AdminModal>
        </>
    );
}
