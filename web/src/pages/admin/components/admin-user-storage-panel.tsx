import { App, Button, Form, Input, InputNumber, Progress, Skeleton } from "antd";
import { useEffect, useState } from "react";

import { accountStorageMeter, accountStorageStateMessage, formatStorageCapacity, formatStorageDate, formatStorageDuration } from "@/lib/account-storage-usage";
import { getAdminUserStorage, grantAdminUserStorage, revokeAdminStorageGrant, storageGrantActive, type AdminUserStorage, type UserStorageGrant } from "@/services/api/storage-grants";

import { AdminDataTable, AdminStatusBadge, AdminTableEmpty } from "./admin-ui";
import { translate } from "@/i18n";

type GrantFormValues = { storageGB: number; durationDays: number; note?: string };

/** 管理端查看用户有效文件容量、赠送与撤销扩容。撤销后已用超额同样进入 7 天宽限期。 */
export function AdminUserStoragePanel({ userId }: { userId: string }) {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<GrantFormValues>();
    const [data, setData] = useState<AdminUserStorage | null>(null);
    const [loading, setLoading] = useState(false);
    const [granting, setGranting] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            setData(await getAdminUserStorage(userId));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.adminUserStoragePanel.failedToLoadStorageCapacity"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setData(null);
        form.setFieldsValue({ storageGB: 10, durationDays: 30, note: "" });
        void load();
    }, [userId]);

    const grant = async () => {
        const values = await form.validateFields();
        setGranting(true);
        try {
            await grantAdminUserStorage(userId, { bytes: values.storageGB * 1024 ** 3, durationDays: values.durationDays || 0, note: values.note?.trim() });
            message.success(translate("admin.adminUserStoragePanel.storageSpaceGranted"));
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.adminUserStoragePanel.failedToGrantStorageCapacity"));
        } finally {
            setGranting(false);
        }
    };

    const revoke = (item: UserStorageGrant) => {
        let reason = "";
        modal.confirm({
            title: translate("admin.adminUserStoragePanel.revokeStorageExpansion", { v0: String(formatStorageCapacity(item.bytes)) }),
            content: (
                <div className="space-y-2">
                    <p className="text-sm text-foreground/60">{translate("admin.adminUserStoragePanel.theUserSCapacityDecreasesImmediatelyIfUsageExceedsThe")}</p>
                    <Input.TextArea rows={3} maxLength={500} placeholder={translate("admin.adminUserStoragePanel.revocationReasonRequiredForExampleOfflineRefund")} onChange={(event) => (reason = event.target.value)} />
                </div>
            ),
            okText: translate("account.settings.memory.actors.restore"),
            okButtonProps: { danger: true },
            onOk: async () => {
                if (!reason.trim()) {
                    message.error(translate("admin.adminUserStoragePanel.enterARevocationReason"));
                    throw new Error("missing reason");
                }
                await revokeAdminStorageGrant(item.id, reason.trim());
                message.success(translate("admin.adminUserStoragePanel.storageExpansionRevoked"));
                await load();
            },
        });
    };

    if (loading && !data) return <Skeleton active paragraph={{ rows: 6 }} />;
    const meter = accountStorageMeter(data?.usage);
    const stateMessage = accountStorageStateMessage(meter);

    return (
        <div className="space-y-5">
            {data ? (
                <div className="rounded-md border border-border p-4">
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                        <span className="text-foreground/60">
                            {translate("admin.adminUserStoragePanel.base")} {meter.baseLabel}
                            {meter.purchasedLabel ? translate("admin.adminUserStoragePanel.expansion", { v0: String(meter.purchasedLabel) }) : ""}
                        </span>
                        <span className="shrink-0 tabular-nums text-foreground/75">
                            {meter.usedLabel} / {meter.totalLabel}
                        </span>
                    </div>
                    <Progress percent={Math.round(meter.percent)} size="small" showInfo={false} status={meter.state !== "ok" || meter.full ? "exception" : "normal"} />
                    {stateMessage ? <div className="mt-2 text-xs text-status-error">{stateMessage}</div> : null}
                </div>
            ) : null}

            <Form form={form} layout="inline" className="flex flex-wrap gap-y-2">
                <Form.Item name="storageGB" label={translate("admin.adminUserStoragePanel.capacityGB")} rules={[{ required: true }, { type: "integer", min: 1, max: 100_000, message: "1-100000 GB" }]}>
                    <InputNumber min={1} max={100_000} precision={0} />
                </Form.Item>
                <Form.Item name="durationDays" label={translate("admin.adminUserStoragePanel.validForDays")} tooltip={translate("admin.adminUserStoragePanel.item0MeansNoExpiration")} rules={[{ required: true }, { type: "integer", min: 0, max: 3650, message: translate("admin.adminUserStoragePanel.item03650Days") }]}>
                    <InputNumber min={0} max={3650} precision={0} />
                </Form.Item>
                <Form.Item name="note" rules={[{ max: 500 }]}>
                    <Input placeholder={translate("admin.adminUserStoragePanel.noteOptional")} />
                </Form.Item>
                <Button type="primary" loading={granting} onClick={() => void grant()}>
                    {translate("admin.adminUserStoragePanel.grantStorage")}
                </Button>
            </Form>

            <AdminDataTable
                table={{
                    rowKey: "id",
                    size: "small",
                    dataSource: data?.grants || [],
                    pagination: false,
                    columns: [
                        { title: translate("admin.adminUserStoragePanel.effectiveTime"), dataIndex: "startsAt", width: 150, render: (value) => formatStorageDate(value) },
                        { title: translate("canvasA.assetView.origin"), key: "source", width: 160, ellipsis: true, render: (_, item) => item.productName || (item.source === "admin" ? translate("account.wallet.topup.grantAdmin") : item.source) },
                        { title: translate("admin.adminUserStoragePanel.capacity"), dataIndex: "bytes", width: 100, align: "right", render: (value) => `+${formatStorageCapacity(value)}` },
                        { title: translate("admin.adminUserStoragePanel.validity"), key: "duration", width: 170, render: (_, item) => (item.expiresAt ? translate("admin.adminUserStoragePanel.expires", { v0: String(formatStorageDuration(item.durationDays)), v1: String(formatStorageDate(item.expiresAt)) }) : translate("admin.adminUserStoragePanel.neverExpires")) },
                        {
                            title: translate("library.tasks.detail.status"),
                            key: "status",
                            width: 90,
                            render: (_, item) => (item.revokedAt ? <AdminStatusBadge label={translate("account.settings.memory.undone")} tone="neutral" /> : storageGrantActive(item) ? <AdminStatusBadge label={translate("admin.adminUserStoragePanel.active")} tone="success" /> : <AdminStatusBadge label={translate("admin.adminUserStoragePanel.expired")} tone="neutral" />),
                        },
                        { title: translate("library.assets.form.note"), key: "note", ellipsis: true, render: (_, item) => (item.revokeReason ? translate("admin.adminUserStoragePanel.revoked", { v0: String(item.revokeReason) }) : item.note || "--") },
                        {
                            title: translate("account.settings.runninghub.actions"),
                            key: "actions",
                            width: 80,
                            align: "center",
                            render: (_, item) =>
                                !item.revokedAt && storageGrantActive(item) ? (
                                    <Button size="small" danger onClick={() => revoke(item)}>
                                        {translate("account.settings.memory.actors.restore")}
                                    </Button>
                                ) : null,
                        },
                    ],
                    scroll: { x: 860 },
                }}
                empty={<AdminTableEmpty />}
            />
        </div>
    );
}
