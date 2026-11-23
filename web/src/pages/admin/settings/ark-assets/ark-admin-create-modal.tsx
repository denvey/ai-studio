import { useQuery } from "@tanstack/react-query";
import { App, Button, Form, Input } from "antd";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PaymentCheckoutCode } from "@/components/payment-checkout-code";
import { useCopyText } from "@/hooks/use-copy-text";
import { cancelArkPortraitSession, checkArkPortraitSession, createAdminArkGroup, createAdminArkSession, getArkPortraitSession, type ArkGroupKind, type ArkPortraitSession } from "@/services/api/ark-portraits";
import { AdminModal } from "../../ui/overlays";
import { AdminSegmented, Callout, Switch } from "../../ui/controls";
import { ARK_KIND_LABEL, formatArkAdminDate } from "./ark-admin-shared";
import { ArkGrantUsersField } from "./ark-grant-users-field";
import { translate } from "@/i18n";


type CreateMode = "create" | "register" | "liveness";
type CreateForm = { name: string; description?: string; groupId?: string };

const GROUP_ID_PATTERN = /^group-[A-Za-z0-9-]{1,100}$/;

/**
 * 新建平台素材组：虚拟 / 版权 IP 直接在方舟创建；也可以登记控制台已有的素材组 ID。
 * 平台真人素材组由真人本人完成 H5 认证生成（不收费），认证完成后在详情里设置授权用户。
 */
export function ArkAdminCreateModal({ open, resume, onClose, onCreated }: { open: boolean; resume?: ArkPortraitSession; onClose: () => void; onCreated: (groupId?: string) => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [form] = Form.useForm<CreateForm>();
    const [kind, setKind] = useState<ArkGroupKind>(resume ? "real" : "virtual");
    const [mode, setMode] = useState<CreateMode>(resume ? "liveness" : "create");
    const [grantAll, setGrantAll] = useState(false);
    const [grantUserIds, setGrantUserIds] = useState<string[]>([]);
    const [session, setSession] = useState<ArkPortraitSession | null>(resume || null);
    const [working, setWorking] = useState("");
    const settled = useRef(false);

    useEffect(() => {
        if (!open) return;
        setKind(resume ? "real" : "virtual");
        setMode(resume ? "liveness" : "create");
        setSession(resume || null);
        setGrantAll(false);
        setGrantUserIds([]);
        settled.current = false;
        form.resetFields();
    }, [open, resume?.id]);

    const statusQuery = useQuery({
        queryKey: ["admin-ark-session", session?.id],
        queryFn: ({ signal }) => getArkPortraitSession(session!.id, signal),
        enabled: open && session?.status === "pending",
        refetchInterval: 3_000,
    });

    useEffect(() => {
        const latest = statusQuery.data?.session;
        if (latest && session && latest.id === session.id && latest.status !== session.status) settle(latest);
        // settle 只处理最新会话状态。
    }, [statusQuery.data]);

    const settle = (latest: ArkPortraitSession) => {
        if (settled.current) return;
        if (latest.status === "verified") {
            settled.current = true;
            message.success(translate("adminPages.settings.arkAssets.arkAdminCreateModal.identityVerificationCompletedForAPlatformHumanAssetGroupHas", { v0: String(latest.name) }));
            onCreated(latest.groupId);
            return;
        }
        if (latest.status === "failed" || latest.status === "expired" || latest.status === "cancelled") {
            message.warning(latest.error || translate("adminPages.settings.arkAssets.arkAdminCreateModal.verificationIncompletePleaseStartAgain"));
            setSession(null);
            onCreated();
            return;
        }
        setSession((current) => (current ? { ...current, ...latest, h5Link: current.h5Link } : latest));
    };

    const run = async (key: string, action: () => Promise<void>) => {
        setWorking(key);
        try {
            await action();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("library.tasks.page.actionFailed"));
        } finally {
            setWorking("");
        }
    };

    const submit = async () => {
        const values = await form.validateFields();
        if (mode === "liveness") {
            await run("start", async () => {
                const result = await createAdminArkSession({ name: values.name.trim(), description: values.description?.trim(), lang: "zh" });
                setSession(result.session);
                onCreated();
            });
            return;
        }
        await run("create", async () => {
            const result = await createAdminArkGroup({ kind, name: values.name.trim(), description: values.description?.trim(), groupId: mode === "register" ? values.groupId?.trim() : undefined, grantAll, grantUserIds: grantAll ? [] : grantUserIds });
            message.success(mode === "register" ? translate("adminPages.settings.arkAssets.arkAdminCreateModal.assetGroupRegistered") : translate("adminPages.settings.arkAssets.arkAdminCreateModal.assetGroupCreatedInArk"));
            onCreated(result.group.groupId);
        });
    };

    const cancelSession = () =>
        run("cancel", async () => {
            if (session?.status === "pending") await cancelArkPortraitSession(session.id);
            setSession(null);
            onCreated();
        });

    const modeOptions: Array<{ value: CreateMode; label: string }> =
        kind === "real"
            ? [
                  { value: "liveness", label: translate("adminPages.settings.arkAssets.arkAdminCreateModal.mobileIdentityVerification") },
                  { value: "register", label: translate("adminPages.settings.arkAssets.arkAdminCreateModal.registerExistingAssetGroup") },
              ]
            : [
                  { value: "create", label: translate("adminPages.settings.arkAssets.arkAdminCreateModal.createInArk") },
                  { value: "register", label: translate("adminPages.settings.arkAssets.arkAdminCreateModal.registerExistingAssetGroup") },
              ];

    return (
        <AdminModal
            open={open}
            width={640}
            title={session ? translate("adminPages.settings.arkAssets.arkAdminCreateModal.platformIdentityVerification") : translate("adminPages.settings.arkAssets.arkAdminCreateModal.createPlatformAssetGroup")}
            onCancel={() => {
                if (!working) onClose();
            }}
            maskClosable={false}
            footer={
                session ? (
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button danger loading={working === "cancel"} onClick={() => void cancelSession()}>
                            {translate("library.ark.realFlow.cancel")}
                        </Button>
                        <Button onClick={onClose}>{translate("adminPages.settings.arkAssets.arkAdminCreateModal.continueLater")}</Button>
                        <Button type="primary" icon={<CheckCircle2 className="size-4" />} loading={working === "check"} onClick={() => void run("check", async () => settle((await checkArkPortraitSession(session.id)).session))}>
                            {translate("adminPages.settings.arkAssets.arkAdminCreateModal.iHaveCompletedVerification")}
                        </Button>
                    </div>
                ) : (
                    <div className="flex justify-end gap-2">
                        <Button disabled={Boolean(working)} onClick={onClose}>
                            {translate("common.cancel")}
                        </Button>
                        <Button type="primary" loading={working === "create" || working === "start"} onClick={() => void submit()}>
                            {mode === "liveness" ? translate("adminPages.settings.arkAssets.arkAdminCreateModal.startIdentityVerification") : mode === "register" ? translate("adminPages.settings.arkAssets.arkAdminCreateModal.registerAssetGroup") : translate("adminPages.settings.arkAssets.arkAdminCreateModal.createAssetGroup")}
                        </Button>
                    </div>
                )
            }
        >
            {session ? (
                <div className="admin-ark-session">
                    {session.h5Link ? <PaymentCheckoutCode value={session.h5Link} /> : null}
                    <div className="admin-ark-session-copy">
                        <strong>{translate("adminPages.settings.arkAssets.arkAdminCreateModal.personMustVerify", { name: session.name })}</strong>
                        <p>{translate("adminPages.settings.arkAssets.arkAdminCreateModal.scanTheCodeWithAPhoneOrOpenTheVerification")} {formatArkAdminDate(session.expiresAt, true)} {translate("adminPages.settings.arkAssets.arkAdminCreateModal.doNotShareItWithUnrelatedPeople")}</p>
                        {session.h5Link ? (
                            <div className="flex flex-wrap gap-2">
                                <Button icon={<ExternalLink className="size-4" />} href={session.h5Link} target="_blank" rel="noopener noreferrer">
                                    {translate("adminPages.settings.arkAssets.arkAdminCreateModal.openVerificationOnThisDevice")}
                                </Button>
                                <Button icon={<Copy className="size-4" />} onClick={() => copyText(session.h5Link || "", translate("library.ark.realFlow.linkCopied"))}>
                                    {translate("adminPages.settings.arkAssets.arkAdminCreateModal.copyVerificationLink")}
                                </Button>
                            </div>
                        ) : (
                            <Callout tone="info">{translate("adminPages.settings.arkAssets.arkAdminCreateModal.theVerificationLinkIsReturnedOnlyWhenVerificationStartsIf")}</Callout>
                        )}
                    </div>
                </div>
            ) : (
                <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
                    <Form.Item label={translate("adminPages.settings.arkAssets.arkAdminCreateModal.assetGroupType")}>
                        <AdminSegmented<ArkGroupKind>
                            ariaLabel={translate("adminPages.settings.arkAssets.arkAdminCreateModal.assetGroupType")}
                            value={kind}
                            onChange={(next) => {
                                setKind(next);
                                setMode(next === "real" ? "liveness" : "create");
                            }}
                            options={(["virtual", "ip", "real"] as const).map((value) => ({ value, label: ARK_KIND_LABEL[value] }))}
                        />
                    </Form.Item>
                    <Form.Item label={translate("adminPages.settings.arkAssets.arkAdminCreateModal.creationMethod")}>
                        <AdminSegmented<CreateMode> ariaLabel={translate("adminPages.settings.arkAssets.arkAdminCreateModal.creationMethod")} value={mode} onChange={setMode} options={modeOptions} />
                    </Form.Item>
                    {mode === "liveness" ? <Callout tone="info">{translate("adminPages.settings.arkAssets.arkAdminCreateModal.platformHumanAssetGroupsAreFreeAfterVerificationConfigureAuthorized")}</Callout> : null}
                    <Form.Item name="name" label={mode === "liveness" ? translate("adminPages.settings.arkAssets.arkAdminCreateModal.personSName") : translate("adminPages.settings.arkAssets.arkAdminCreateModal.assetGroupName")} rules={[{ required: true, whitespace: true, message: mode === "liveness" ? translate("library.ark.realFlow.nameRequired") : translate("adminPages.settings.arkAssets.arkAdminCreateModal.pleaseEnterAnAssetGroupName") }]} className="mt-4">
                        <Input maxLength={40} placeholder={mode === "liveness" ? translate("adminPages.settings.arkAssets.arkAdminCreateModal.forExampleContractActorZhangSan") : translate("adminPages.settings.arkAssets.arkAdminCreateModal.forExampleBrandMascot")} />
                    </Form.Item>
                    <Form.Item name="description" label={translate("library.ark.virtualFlow.descriptionLabel")}>
                        <Input.TextArea maxLength={200} autoSize={{ minRows: 2, maxRows: 4 }} placeholder={translate("adminPages.settings.arkAssets.arkAdminCreateModal.optionalHelpsDistinguishAssetGroups")} />
                    </Form.Item>
                    {mode === "register" ? (
                        <Form.Item
                            name="groupId"
                            label={translate("adminPages.settings.arkAssets.arkAdminCreateModal.arkAssetGroupID")}
                            extra={kind === "real" ? translate("adminPages.settings.arkAssets.arkAdminCreateModal.aHumanAssetGroupMustBeALivenessFaceGroupObtained") : undefined}
                            rules={[
                                { required: true, message: translate("adminPages.settings.arkAssets.arkAdminCreateModal.pleaseEnterAnArkAssetGroupID") },
                                { pattern: GROUP_ID_PATTERN, message: translate("adminPages.settings.arkAssets.arkAdminCreateModal.enterAnArkAssetGroupIDStartingWithGroup") },
                            ]}
                        >
                            <Input autoComplete="off" placeholder="group-…" />
                        </Form.Item>
                    ) : null}
                    {mode !== "liveness" ? (
                        <Form.Item label={translate("adminPages.settings.arkAssets.arkAdminCreateModal.usageAuthorization")} extra={translate("adminPages.settings.arkAssets.arkAdminCreateModal.authorizedUsersCanSeeThisGroupInSettingsAndManually")}>
                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-2 text-sm">
                                    <Switch checked={grantAll} onChange={setGrantAll} aria-label={translate("adminPages.settings.arkAssets.arkAdminCreateModal.authorizeAllUsers")} />
                                    {translate("adminPages.settings.arkAssets.arkAdminCreateModal.authorizeAllUsers")}
                                </label>
                                {grantAll ? null : <ArkGrantUsersField value={grantUserIds} onChange={setGrantUserIds} />}
                            </div>
                        </Form.Item>
                    ) : null}
                </Form>
            )}
        </AdminModal>
    );
}
