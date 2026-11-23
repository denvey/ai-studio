import { App, Button, Form, Input, InputNumber, Select } from "antd";
import { AdminDrawer } from "@/pages/admin/ui/overlays";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UserGroupBadge } from "@/components/layout/user-group-badge";
import { createAdminUserGroup, updateAdminUserGroup, type UserGroup } from "@/services/api/user-groups";
import { useAdminContext } from "../admin-context";
import { Callout, Switch } from "../ui/controls";
import { emptyUserGroupForm, userGroupFormValues, userGroupInput, type UserGroupFormValues } from "./user-group-form";
import { translate } from "@/i18n";


const badgeStyleOptions = [
    { value: "none", label: translate("adminPages.userGroups.userGroupEditor.noBadge") },
    { value: "vip", label: translate("adminPages.userGroups.userGroupEditor.vIPGold") },
    { value: "svip", label: translate("adminPages.userGroups.userGroupEditor.sVIPPurplePinkShimmer") },
];

/** 分组编辑抽屉：基本信息与徽章、统一倍率与货币兑换比例、可用渠道、模型级倍率。 */
export function UserGroupEditor({ open, group, onClose, onSaved }: { open: boolean; group: UserGroup | null; onClose: () => void; onSaved: (group: UserGroup) => void }) {
    const { message, modal } = App.useApp();
    const { references } = useAdminContext();
    const [form] = Form.useForm<UserGroupFormValues>();
    const [saving, setSaving] = useState(false);
    const creating = !group;
    const allChannels = Form.useWatch("allChannels", form);
    const channelIds = Form.useWatch("channelIds", form) as string[] | undefined;
    const badgeStyle = Form.useWatch("badgeStyle", form);
    const badgeLabel = Form.useWatch("badgeLabel", form);
    const name = Form.useWatch("name", form);

    useEffect(() => {
        if (!open) return;
        form.resetFields();
        form.setFieldsValue(group ? userGroupFormValues(group) : emptyUserGroupForm());
    }, [form, group, open]);

    const channelOptions = useMemo(
        () =>
            references.channels.map((channel) => ({
                value: channel.id,
                label: `${channel.name}${channel.enabled ? "" : translate("adminPages.userGroups.userGroupEditor.disabled")}`,
            })),
        [references.channels],
    );

    // 模型倍率候选来自当前可用渠道；全部渠道时列出所有系统渠道模型。
    const modelOptions = useMemo(() => {
        const selected = new Set(channelIds || []);
        const keys = new Set<string>();
        for (const channel of references.channels) {
            if (!allChannels && !selected.has(channel.id)) continue;
            channel.models.forEach((key) => keys.add(key));
        }
        return [...keys].sort().map((key) => ({ value: key, label: key }));
    }, [allChannels, channelIds, references.channels]);

    const close = () => {
        if (saving) return;
        if (!form.isFieldsTouched()) {
            onClose();
            return;
        }
        modal.confirm({
            title: translate("adminPages.userGroups.userGroupEditor.discardGroupChanges"),
            content: translate("adminPages.userGroups.userGroupEditor.unsavedGroupMultiplierChannelOrBadgeChangesWillBeLost"),
            okText: translate("adminPages.userGroups.userGroupEditor.discardChanges"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: onClose,
        });
    };

    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            const input = userGroupInput(values);
            const result = group ? await updateAdminUserGroup(group.id, input) : await createAdminUserGroup(input);
            onSaved(result.group);
            message.success(group ? translate("adminPages.userGroups.userGroupEditor.groupSaved") : translate("adminPages.userGroups.userGroupEditor.groupCreated"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.userGroups.userGroupEditor.failedToSaveGroup"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminDrawer
            title={group ? translate("adminPages.userGroups.userGroupEditor.editGroup", { v0: String(group.name) }) : translate("adminPages.userGroups.userGroupEditor.newGroup")}
            open={open}
            size="min(640px, 100vw)"
            onClose={close}
            mask={{ closable: !saving }}
            destroyOnHidden
            extra={
                <Button type="primary" loading={saving} onClick={() => void save()}>
                    {translate("common.save")}
                </Button>
            }
        >
            <Form form={form} layout="vertical" requiredMark={false}>
                <div className="grid gap-x-4 sm:grid-cols-2">
                    <Form.Item
                        name="code"
                        label={translate("adminPages.userGroups.userGroupEditor.groupCode")}
                        extra={creating ? translate("adminPages.userGroups.userGroupEditor.cannotBeChangedAfterCreationForExampleVipSvipEnterprise") : translate("adminPages.userGroups.userGroupEditor.theGroupCodeCannotBeChangedAfterCreation")}
                        rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9_-]{0,39}$/, message: translate("adminPages.userGroups.userGroupEditor.lowercaseLettersNumbersUnderscoresOrHyphensUpTo40Characters") }]}
                    >
                        <Input disabled={!creating} placeholder="vip" />
                    </Form.Item>
                    <Form.Item name="name" label={translate("adminPages.userGroups.userGroupEditor.groupName")} rules={[{ required: true, whitespace: true, message: translate("adminPages.userGroups.userGroupEditor.pleaseEnterAGroupName") }]}>
                        <Input maxLength={80} placeholder={translate("adminPages.userGroups.userGroupEditor.vIPMember")} />
                    </Form.Item>
                </div>
                <Form.Item name="description" label={translate("library.ark.virtualFlow.descriptionLabel")}>
                    <Input.TextArea rows={2} maxLength={500} placeholder={translate("adminPages.userGroups.userGroupEditor.targetCustomersAndIncludedBenefits")} />
                </Form.Item>
                <div className="grid gap-x-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
                    <Form.Item name="badgeStyle" label={translate("adminPages.userGroups.userGroupEditor.userBadge")}>
                        <Select options={badgeStyleOptions} />
                    </Form.Item>
                    <Form.Item name="badgeLabel" label={translate("adminPages.userGroups.userGroupEditor.badgeText")} extra={translate("adminPages.userGroups.userGroupEditor.leaveBlankToDisplayVIPSVIP")}>
                        <Input maxLength={16} placeholder="VIP" />
                    </Form.Item>
                    <Form.Item label={translate("account.feedback.preview")}>
                        <div className="flex h-8 items-center">{badgeStyle === "none" ? <span className="text-xs text-foreground/45">{translate("adminPages.userGroups.userGroupEditor.hidden")}</span> : <UserGroupBadge group={{ name, badgeLabel, badgeStyle }} />}</div>
                    </Form.Item>
                </div>

                <div className="mb-2 mt-2 text-sm font-medium">{translate("adminPages.userGroups.userGroupEditor.billingMultipliersAndCurrencyConversion")}</div>
                <Callout tone="info" className="mb-4">
                    {translate("adminPages.userGroups.userGroupEditor.actualChargeModelPriceCurrencyConversionRateForUSDCNY")}
                </Callout>
                <div className="grid gap-x-4 sm:grid-cols-3">
                    <Form.Item name="ratio" label={translate("adminPages.userGroups.userGroupEditor.groupMultiplier")} rules={[{ required: true, type: "number", min: 0.0001, max: 100, message: translate("adminPages.userGroups.userGroupEditor.item00001To100") }]}>
                        <InputNumber className="w-full" min={0.0001} max={100} step={0.05} />
                    </Form.Item>
                    <Form.Item name="pointsPerUsd" label={translate("adminPages.userGroups.userGroupEditor.creditsPer1USD")} rules={[{ type: "number", min: 0, max: 1_000_000 }]} extra={translate("adminPages.userGroups.userGroupEditor.item0PreventsThisGroupFromUsingModelsPricedInUSD")}>
                        <InputNumber className="w-full" min={0} max={1_000_000} step={0.1} />
                    </Form.Item>
                    <Form.Item name="pointsPerCny" label={translate("adminPages.userGroups.userGroupEditor.creditsPer1CNY")} rules={[{ type: "number", min: 0, max: 1_000_000 }]} extra={translate("adminPages.userGroups.userGroupEditor.item0PreventsThisGroupFromUsingModelsPricedInCNY")}>
                        <InputNumber className="w-full" min={0} max={1_000_000} step={0.1} />
                    </Form.Item>
                </div>

                <div className="mb-2 mt-2 text-sm font-medium">{translate("adminPages.userGroups.userGroupEditor.availableChannels")}</div>
                <Form.Item name="allChannels" valuePropName="checked" extra={translate("adminPages.userGroups.userGroupEditor.whenEnabledAllSystemChannelsAreAvailableIncludingFutureChannels")}>
                    <Switch aria-label={translate("adminPages.userGroups.userGroupEditor.allowAllSystemChannels")} />
                </Form.Item>
                {!allChannels ? (
                    <Form.Item name="channelIds" label={translate("adminPages.userGroups.userGroupEditor.assignedChannels")} extra={channelIds?.length ? undefined : translate("adminPages.userGroups.userGroupEditor.withNoChannelsAssignedUsersInThisGroupCannotSee")}>
                        <Select mode="multiple" allowClear showSearch optionFilterProp="label" options={channelOptions} placeholder={translate("adminPages.userGroups.userGroupEditor.chooseSystemChannelsAvailableToThisGroup")} />
                    </Form.Item>
                ) : null}

                <div className="mb-2 mt-2 text-sm font-medium">{translate("adminPages.userGroups.userGroupEditor.perModelMultipliers")}</div>
                <p className="mb-3 text-xs text-foreground/55">{translate("adminPages.userGroups.userGroupEditor.matchedByChannelModelIDModelCodeForUnifiedFrontend")}</p>
                <Form.List name="modelOverrides">
                    {(fields, { add, remove }) => (
                        <div className="grid gap-2">
                            {fields.map((field) => (
                                <div key={field.key} className="grid items-start gap-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto]">
                                    <Form.Item name={[field.name, "modelKey"]} className="mb-0" rules={[{ required: true, whitespace: true, message: translate("adminPages.userGroups.userGroupEditor.pleaseSelectAModel") }]}>
                                        <Select showSearch allowClear options={modelOptions} placeholder={translate("adminPages.userGroups.userGroupEditor.modelIdentifier")} aria-label={translate("adminPages.userGroups.userGroupEditor.modelIdentifier")} />
                                    </Form.Item>
                                    <Form.Item name={[field.name, "ratio"]} className="mb-0">
                                        <InputNumber className="w-full" min={0.0001} max={100} step={0.05} placeholder={translate("adminPages.userGroups.userGroupEditor.multiplier")} aria-label={translate("adminPages.userGroups.userGroupEditor.modelMultiplier")} />
                                    </Form.Item>
                                    <Form.Item name={[field.name, "pointsPerUsd"]} className="mb-0">
                                        <InputNumber className="w-full" min={0} max={1_000_000} placeholder="1 USD=" aria-label={translate("adminPages.userGroups.userGroupEditor.creditsPer1USD2")} />
                                    </Form.Item>
                                    <Form.Item name={[field.name, "pointsPerCny"]} className="mb-0">
                                        <InputNumber className="w-full" min={0} max={1_000_000} placeholder="1 CNY=" aria-label={translate("adminPages.userGroups.userGroupEditor.creditsPer1CNY2")} />
                                    </Form.Item>
                                    <Button type="text" danger icon={<Trash2 className="size-4" />} aria-label={translate("adminPages.userGroups.userGroupEditor.removeThisModelMultiplier")} onClick={() => remove(field.name)} />
                                </div>
                            ))}
                            <Button icon={<Plus className="size-4" />} onClick={() => add({ modelKey: "", ratio: null, pointsPerUsd: null, pointsPerCny: null })}>
                                {translate("adminPages.userGroups.userGroupEditor.addModelMultiplier")}
                            </Button>
                        </div>
                    )}
                </Form.List>

                <Form.Item name="sortOrder" label={translate("adminPages.userGroups.userGroupEditor.order")} className="mt-4" extra={translate("adminPages.userGroups.userGroupEditor.lowerNumbersAppearFirst")}>
                    <InputNumber className="w-40" min={-100000} max={100000} />
                </Form.Item>
            </Form>
        </AdminDrawer>
    );
}
