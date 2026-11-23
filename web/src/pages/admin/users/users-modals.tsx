import { App, Button, Form, Input } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import { Select, Switch } from "@/pages/admin/ui/controls";
import { useEffect, useState } from "react";

import { createAdminUser, updateAdminUser, type AdminUser, type LocalUser } from "@/services/api/auth";
import { DEFAULT_USER_GROUP_CODE, formatRatioBasisPoints, userGroupCode, type UserGroup } from "@/services/api/user-groups";
import { translate } from "@/i18n";

type UserFormValues = Pick<LocalUser, "displayName" | "email" | "role" | "status"> & { password?: string; isPromoter: boolean; userGroup: string };

function userGroupOptions(groups: UserGroup[]) {
    return groups.map((group) => ({ value: group.code, label: translate("adminPages.users.usersModals.multiplier", { v0: String(group.name), v1: String(formatRatioBasisPoints(group.ratioBasisPoints)) }) }));
}

export function AdminUserEditModal({ user, actorId, groups, onClose, onSaved }: { user: AdminUser | null; actorId?: string; groups: UserGroup[]; onClose: () => void; onSaved: (user: LocalUser) => void }) {
    const { message, modal } = App.useApp();
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm<UserFormValues>();
    const editingSelf = user?.id === actorId;

    useEffect(() => {
        if (!user) return;
        form.resetFields();
        form.setFieldsValue({
            displayName: user.displayName,
            email: user.email || "",
            role: user.role,
            status: user.status,
            isPromoter: Boolean(user.isPromoter),
            userGroup: userGroupCode(user.userGroup),
        });
    }, [form, user]);

    const close = () => {
        if (saving) return;
        if (!form.isFieldsTouched()) {
            onClose();
            return;
        }
        modal.confirm({
            title: translate("adminPages.users.usersModals.discardUserChanges"),
            content: translate("adminPages.users.usersModals.unsavedAccountRoleOrStatusChangesWillBeLost"),
            okText: translate("adminPages.users.usersModals.discardChanges"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: onClose,
        });
    };

    const save = async () => {
        if (!user) return;
        const values = await form.validateFields();
        setSaving(true);
        try {
            const result = await updateAdminUser(user.id, {
                displayName: values.displayName.trim(),
                email: values.email?.trim() || "",
                role: values.role,
                status: values.status,
                isPromoter: values.isPromoter,
                userGroup: values.userGroup,
                ...(values.password?.trim() ? { password: values.password } : {}),
            });
            onSaved(result.user);
            form.resetFields();
            onClose();
            message.success(translate("adminPages.users.usersModals.userInformationSaved"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.users.usersModals.failedToSaveUser"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminModal
            title={user ? translate("adminPages.users.usersModals.editUser", { v0: String(user.displayName || user.username) }) : translate("adminPages.users.usersModals.editUser2")}
            open={Boolean(user)}
            width={640}
            onCancel={close}
            mask={{ closable: !saving }}
            closable={!saving}
            footer={
                <div className="flex justify-end gap-2">
                    <Button disabled={saving} onClick={close}>
                        {translate("common.cancel")}
                    </Button>
                    <Button type="primary" loading={saving} onClick={() => void save()}>
                        {translate("common.save")}
                    </Button>
                </div>
            }
        >
            <Form form={form} layout="vertical" requiredMark={false} className="admin-user-form-grid">
                <Form.Item label={translate("auth.register.username")}>
                    <Input value={user ? `@${user.username}` : ""} disabled />
                </Form.Item>
                <Form.Item name="displayName" label={translate("auth.register.displayName")} rules={[{ required: true, whitespace: true, message: translate("adminPages.users.usersModals.enterADisplayName") }]}>
                    <Input placeholder={translate("adminPages.users.usersModals.theNameShownForThisUserInTheProduct")} />
                </Form.Item>
                <Form.Item name="email" label={translate("auth.verification.email")} rules={[{ type: "email", message: translate("adminPages.users.usersModals.enterAValidEmail") }]}>
                    <Input placeholder="name@example.com" />
                </Form.Item>
                <Form.Item
                    className="is-wide"
                    name="password"
                    label={translate("auth.recovery.submit")}
                    extra={translate("adminPages.users.usersModals.leaveBlankToKeepThePasswordSavingInvalidatesThisUser")}
                    rules={[{ min: 8, message: translate("adminPages.users.usersModals.passwordMustBeAtLeast8Characters") }]}
                >
                    <Input.Password placeholder={translate("adminPages.users.usersModals.enterANewPasswordToResetManually")} autoComplete="new-password" />
                </Form.Item>
                <Form.Item
                    name="role"
                    label={translate("account.welcome.chapters.world.label")}
                    extra={editingSelf ? translate("adminPages.users.usersModals.youCannotChangeYourOwnAdminRoleHere") : translate("adminPages.users.usersModals.roleChangesTakeEffectOnAdminAccessImmediately")}
                >
                    <Select
                        disabled={editingSelf}
                        options={[
                            { label: translate("shell.account.admin"), value: "admin" },
                            { label: translate("adminPages.users.usersModals.regularUser"), value: "user" },
                        ]}
                    />
                </Form.Item>
                <Form.Item
                    name="status"
                    label={translate("adminPages.users.usersModals.accountStatus")}
                    extra={editingSelf ? translate("adminPages.users.usersModals.youCannotDeactivateTheAccountYouAreSignedInWith") : translate("adminPages.users.usersModals.deactivatingClearsTheSignInSessionButKeepsTheIdentity")}
                >
                    <Select
                        disabled={editingSelf}
                        options={[
                            { label: translate("account.layout.oss.enabled"), value: "active" },
                            { label: translate("adminPages.users.usersModals.disabled"), value: "disabled" },
                        ]}
                    />
                </Form.Item>
                <Form.Item className="is-wide" name="userGroup" label={translate("adminPages.users.usersModals.userGroups")} extra={translate("adminPages.users.usersModals.theGroupDeterminesVisibleSystemChannelsAndModelsSharedDiscounts")}>
                    <Select options={userGroupOptions(groups)} />
                </Form.Item>
                <Form.Item className="is-wide" name="isPromoter" label={translate("adminPages.users.usersModals.referrer")} valuePropName="checked" extra={translate("adminPages.users.usersModals.inDesignatedReferrerModeOnlyReferrersCanSeeTheReferral")}>
                    <Switch />
                </Form.Item>
            </Form>
        </AdminModal>
    );
}

type CreateUserFormValues = {
    username: string;
    displayName: string;
    email?: string;
    password: string;
    role: LocalUser["role"];
    status: LocalUser["status"];
    userGroup: string;
};

export function AdminUserCreateModal({ open, groups, onClose, onCreated }: { open: boolean; groups: UserGroup[]; onClose: () => void; onCreated: (user: AdminUser) => void }) {
    const { message, modal } = App.useApp();
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm<CreateUserFormValues>();

    useEffect(() => {
        if (!open) return;
        form.resetFields();
        form.setFieldsValue({ role: "user", status: "active", userGroup: DEFAULT_USER_GROUP_CODE });
    }, [form, open]);

    const close = () => {
        if (saving) return;
        if (!form.isFieldsTouched()) {
            onClose();
            return;
        }
        modal.confirm({
            title: translate("adminPages.users.usersModals.discardTheNewUser"),
            content: translate("adminPages.users.usersModals.unsavedUserInformationWillBeLost"),
            okText: translate("adminPages.users.usersModals.discardAndClose"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: onClose,
        });
    };

    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            const result = await createAdminUser({
                username: values.username.trim(),
                displayName: values.displayName.trim(),
                email: values.email?.trim() || "",
                password: values.password,
                role: values.role,
                status: values.status,
                userGroup: values.userGroup,
            });
            onCreated(result.user);
            form.resetFields();
            onClose();
            message.success(translate("adminPages.users.usersModals.userCreated"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.users.usersModals.failedToCreateUser"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminModal
            title={translate("adminPages.users.usersModals.addUser")}
            open={open}
            width={640}
            onCancel={close}
            mask={{ closable: !saving }}
            closable={!saving}
            footer={
                <div className="flex justify-end gap-2">
                    <Button disabled={saving} onClick={close}>
                        {translate("common.cancel")}
                    </Button>
                    <Button type="primary" loading={saving} onClick={() => void save()}>
                        {translate("adminPages.users.usersModals.createUser")}
                    </Button>
                </div>
            }
        >
            <Form form={form} layout="vertical" requiredMark={false} className="admin-user-form-grid">
                <Form.Item name="username" label={translate("auth.register.username")} rules={[{ required: true, whitespace: true, message: translate("adminPages.users.usersModals.enterAUsername") }]}>
                    <Input placeholder={translate("adminPages.users.usersModals.item332LettersDigitsUnderscoresOrHyphens")} />
                </Form.Item>
                <Form.Item name="displayName" label={translate("auth.register.displayName")} rules={[{ required: true, whitespace: true, message: translate("adminPages.users.usersModals.enterADisplayName") }]}>
                    <Input placeholder={translate("adminPages.users.usersModals.theNameShownForThisUserInTheProduct")} />
                </Form.Item>
                <Form.Item name="email" label={translate("auth.verification.email")} rules={[{ type: "email", message: translate("adminPages.users.usersModals.enterAValidEmail") }]}>
                    <Input placeholder="name@example.com" />
                </Form.Item>
                <Form.Item name="password" label={translate("adminPages.users.usersModals.initialPassword")} rules={[{ required: true, message: translate("adminPages.users.usersModals.setAnInitialPassword") }]}>
                    <Input.Password placeholder={translate("adminPages.users.usersModals.atLeast8Characters")} />
                </Form.Item>
                <Form.Item name="role" label={translate("account.welcome.chapters.world.label")}>
                    <Select
                        options={[
                            { label: translate("shell.account.admin"), value: "admin" },
                            { label: translate("adminPages.users.usersModals.regularUser"), value: "user" },
                        ]}
                    />
                </Form.Item>
                <Form.Item name="status" label={translate("adminPages.users.usersModals.accountStatus")}>
                    <Select
                        options={[
                            { label: translate("account.layout.oss.enabled"), value: "active" },
                            { label: translate("adminPages.users.usersModals.disabled"), value: "disabled" },
                        ]}
                    />
                </Form.Item>
                <Form.Item name="userGroup" label={translate("adminPages.users.usersModals.userGroups")}>
                    <Select options={userGroupOptions(groups)} />
                </Form.Item>
            </Form>
        </AdminModal>
    );
}
