import { App, Button, Form, Input, InputNumber } from "antd";
import { useEffect, useState } from "react";

import { formatCredits } from "@/constant/credits";
import type { AdminUser } from "@/services/api/auth";
import { adjustAdminUserCredits } from "@/services/api/wallet";
import { AdminModal } from "@/pages/admin/ui/overlays";
import { translate } from "@/i18n";


type AdjustValues = { amount: number; note: string };

function toMicrocredits(value: number) {
    const result = Math.round(Number(value) * 1_000_000);
    if (!Number.isSafeInteger(result)) throw new Error(translate("adminPages.users.userCreditAdjustModal.creditAdjustmentIsOutsideTheSupportedRange"));
    return result;
}

/**
 * 从用户列表直接调账：目标用户已确定，不再重新搜索。
 * 先填写变化量与依据，再进入核对步骤展示变化前后余额，确认后才写入；写入期间锁定关闭。
 */
export function UserCreditAdjustModal({ user, onClose, onAdjusted }: { user: AdminUser | null; onClose: () => void; onAdjusted: (patch: Pick<AdminUser, "id" | "availableMicrocredits" | "reservedMicrocredits">) => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<AdjustValues>();
    const [pending, setPending] = useState<AdjustValues | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;
        form.resetFields();
        setPending(null);
    }, [form, user]);

    const review = async () => {
        if (!user) return;
        const values = await form.validateFields();
        const amount = Number(values.amount);
        if (!amount) {
            message.error(translate("adminPages.users.userCreditAdjustModal.creditAdjustmentCannotBe0"));
            return;
        }
        if (user.availableMicrocredits + toMicrocredits(amount) < 0) {
            message.error(translate("adminPages.users.userCreditAdjustModal.availableCreditsCannotFallBelow0AfterDeduction"));
            return;
        }
        setPending({ amount, note: values.note.trim() });
    };

    const apply = async () => {
        if (!user || !pending) return;
        setSaving(true);
        try {
            const result = await adjustAdminUserCredits(user.id, { amountMicrocredits: toMicrocredits(pending.amount), note: pending.note });
            onAdjusted({ id: user.id, availableMicrocredits: result.account.availableMicrocredits, reservedMicrocredits: result.account.reservedMicrocredits });
            window.dispatchEvent(new CustomEvent("wallet:updated"));
            message.success(translate("adminPages.users.userCreditAdjustModal.adjustedAvailableCredits", { v0: String(formatCredits(result.account.availableMicrocredits)) }));
            onClose();
        } catch (error) {
            // 结果不确定时不自动重试，保留核对内容让管理员先刷新列表确认。
            message.error(error instanceof Error ? error.message : translate("adminPages.users.userCreditAdjustModal.creditAdjustmentFailedRefreshTheListAndCheckTheBalance"));
        } finally {
            setSaving(false);
        }
    };

    const negative = Boolean(pending && pending.amount < 0);

    return (
        <AdminModal
            title={user ? translate("adminPages.users.userCreditAdjustModal.adjustCredits", { v0: String(user.displayName || user.username) }) : translate("adminPages.users.userCreditAdjustModal.adjustCredits2")}
            open={Boolean(user)}
            width={480}
            onCancel={() => !saving && onClose()}
            mask={{ closable: !saving }}
            closable={!saving}
            keyboard={!saving}
            footer={
                pending ? (
                    <div className="flex justify-end gap-2">
                        <Button disabled={saving} onClick={() => setPending(null)}>
                            {translate("adminPages.users.userCreditAdjustModal.backToEdit")}
                        </Button>
                        <Button type="primary" danger={negative} loading={saving} onClick={() => void apply()}>
                            {negative ? translate("adminPages.users.userCreditAdjustModal.confirmDeduction") : translate("adminPages.users.userCreditAdjustModal.confirmIncrease")}
                        </Button>
                    </div>
                ) : (
                    <div className="flex justify-end gap-2">
                        <Button onClick={onClose}>{translate("common.cancel")}</Button>
                        <Button type="primary" onClick={() => void review()}>
                            {translate("adminPages.users.userCreditAdjustModal.nextReview")}
                        </Button>
                    </div>
                )
            }
        >
            {user ? (
                <div className="admin-user-credit-adjust">
                    <dl className="admin-user-credit-summary">
                        <div>
                            <dt>{translate("shell.account.availableCredits")}</dt>
                            <dd>{formatCredits(user.availableMicrocredits)}</dd>
                        </div>
                        <div>
                            <dt>{translate("adminPages.users.userCreditAdjustModal.heldCredits")}</dt>
                            <dd>{formatCredits(user.reservedMicrocredits)}</dd>
                        </div>
                        {pending ? (
                            <>
                                <div>
                                    <dt>{translate("adminPages.users.userCreditAdjustModal.adjustment")}</dt>
                                    <dd className={negative ? "is-negative" : "is-positive"}>
                                        {pending.amount > 0 ? "+" : ""}
                                        {formatCredits(toMicrocredits(pending.amount))}
                                    </dd>
                                </div>
                                <div>
                                    <dt>{translate("adminPages.users.userCreditAdjustModal.availableAfterAdjustment")}</dt>
                                    <dd>{formatCredits(user.availableMicrocredits + toMicrocredits(pending.amount))}</dd>
                                </div>
                            </>
                        ) : null}
                    </dl>
                    {pending ? (
                        <p className="admin-user-credit-note">{translate("adminPages.users.userCreditAdjustModal.reason")}{pending.note}</p>
                    ) : (
                        <Form form={form} layout="vertical" requiredMark={false}>
                            <Form.Item name="amount" label={translate("adminPages.users.userCreditAdjustModal.change")} extra={translate("adminPages.users.userCreditAdjustModal.positiveValuesAddCreditsNegativeValuesDeductThem")} rules={[{ required: true, message: translate("adminPages.users.userCreditAdjustModal.enterTheCreditChange") }]}>
                                <InputNumber className="w-full" precision={6} placeholder={translate("adminPages.users.userCreditAdjustModal.forExample100Or20")} autoFocus />
                            </Form.Item>
                            <Form.Item name="note" label={translate("adminPages.users.userCreditAdjustModal.reasonForAdjustment")} rules={[{ required: true, whitespace: true, message: translate("adminPages.users.userCreditAdjustModal.pleaseEnterATicketNumberOrReason") }]}>
                                <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={200} showCount placeholder={translate("adminPages.users.userCreditAdjustModal.forExampleTicket1234CompensationForAFailedTask")} />
                            </Form.Item>
                        </Form>
                    )}
                </div>
            ) : null}
        </AdminModal>
    );
}
