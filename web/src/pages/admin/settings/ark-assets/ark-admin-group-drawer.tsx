import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, DatePicker, Input, Skeleton } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useCopyText } from "@/hooks/use-copy-text";
import { arkPortraitAssetFileUrl, createAdminArkAsset, deleteAdminArkAsset, deleteAdminArkGroup, getAdminArkGroup, updateAdminArkGroup, type ArkPortraitGroup } from "@/services/api/ark-portraits";
import { ARK_IMAGE_ACCEPT, uploadArkGroupImages } from "@/services/ark-asset-upload";
import { AdminStatusBadge } from "../../components/admin-ui";
import { Callout, Switch } from "../../ui/controls";
import { AdminDrawer } from "../../ui/overlays";
import { ARK_KIND_LABEL, ARK_SOURCE_LABEL, ArkAssetStatusBadge, ArkExpiryBadge, arkUserLabel, formatArkAdminDate } from "./ark-admin-shared";
import { ArkGrantUsersField } from "./ark-grant-users-field";
import { translate } from "@/i18n";

type Draft = { name: string; description: string; grantAll: boolean; grantUserIds: string[]; expiresAt: Dayjs | null };

function draftFrom(group: ArkPortraitGroup): Draft {
    return { name: group.name, description: group.description || "", grantAll: group.grantAll, grantUserIds: (group.grantUsers || []).map((user) => user.id), expiresAt: group.expiresAt ? dayjs(group.expiresAt) : null };
}

/** 素材组详情：名称、授权用户与真人授权期限；平台素材组可直接上传（免审核），所有素材组可删除素材。 */
export function ArkAdminGroupDrawer({ groupId, onClose, onChanged }: { groupId: string | null; onClose: () => void; onChanged: () => void }) {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const copyText = useCopyText();
    const fileInput = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [working, setWorking] = useState("");
    const query = useQuery({ queryKey: ["admin-ark-group", groupId], queryFn: ({ signal }) => getAdminArkGroup(groupId!, signal), enabled: Boolean(groupId) });
    const group = query.data?.group;

    useEffect(() => {
        if (group) setDraft(draftFrom(group));
    }, [group]);

    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ["admin-ark-group", groupId] });
        onChanged();
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

    const dirty = Boolean(group && draft && JSON.stringify({ ...draft, expiresAt: draft.expiresAt?.toISOString() || null }) !== JSON.stringify({ ...draftFrom(group), expiresAt: draftFrom(group).expiresAt?.toISOString() || null }));

    const save = () =>
        run("save", async () => {
            if (!group || !draft) return;
            if (!draft.name.trim()) throw new Error(translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.pleaseEnterAnAssetGroupName"));
            await updateAdminArkGroup(group.id, {
                name: draft.name.trim(),
                description: draft.description.trim(),
                ...(group.scope === "platform" ? { grantAll: draft.grantAll, grantUserIds: draft.grantAll ? [] : draft.grantUserIds } : {}),
                ...(group.kind === "real" && draft.expiresAt ? { expiresAt: draft.expiresAt.endOf("day").toISOString() } : {}),
            });
            message.success(translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.assetGroupUpdated"));
            await refresh();
        });

    const upload = (files: File[]) =>
        run("upload", async () => {
            if (!group || !files.length) return;
            try {
                const submitted = await uploadArkGroupImages(files, (input) => createAdminArkAsset(group.id, input));
                message.success(translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.imagesSubmittedForArkReview", { v0: String(submitted.length) }));
            } finally {
                await refresh();
            }
        });

    const confirmDeleteGroup = () => {
        if (!group) return;
        modal.confirm({
            title: translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.deleteAssetGroup", { v0: String(group.name) }),
            content: translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.theArkAssetGroupAndAllAssetsInItWill"),
            okText: translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.deleteAssetGroup2"),
            cancelText: translate("common.cancel"),
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await deleteAdminArkGroup(group.id);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("library.picker.deleteFailed"));
                    throw error;
                }
                message.success(translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.assetGroupDeleted"));
                onChanged();
                onClose();
            },
        });
    };

    const confirmDeleteAsset = (id: string, name: string) =>
        modal.confirm({
            title: translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.deleteAsset", { v0: String(name) }),
            content: translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.assetsAlreadySubmittedToArkWillAlsoBeDeletedThere"),
            okText: translate("library.ark.asset.delete"),
            cancelText: translate("common.cancel"),
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await deleteAdminArkAsset(id);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("library.picker.deleteFailed"));
                    throw error;
                }
                message.success(translate("library.ark.asset.deleted"));
                await refresh();
            },
        });

    return (
        <AdminDrawer
            open={Boolean(groupId)}
            width={760}
            title={group ? group.name : translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.assetGroupDetails")}
            onClose={onClose}
            extra={
                group ? (
                    <div className="flex gap-2">
                        <Button danger icon={<Trash2 className="size-4" />} onClick={confirmDeleteGroup}>
                            {translate("common.delete")}
                        </Button>
                        <Button type="primary" icon={<Save className="size-4" />} loading={working === "save"} disabled={!dirty} onClick={() => void save()}>
                            {translate("common.save")}
                        </Button>
                    </div>
                ) : null
            }
        >
            {!group || !draft ? (
                query.isError ? (
                    <Callout tone="error">{query.error instanceof Error ? query.error.message : translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.failedToLoadAssetGroup")}</Callout>
                ) : (
                    <Skeleton active paragraph={{ rows: 8 }} />
                )
            ) : (
                <div className="admin-ark-detail">
                    <div className="flex flex-wrap items-center gap-2">
                        <AdminStatusBadge label={ARK_KIND_LABEL[group.kind]} tone="info" />
                        <AdminStatusBadge label={group.scope === "platform" ? translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.platformAssetGroup") : translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.userCreated")} />
                        <AdminStatusBadge label={ARK_SOURCE_LABEL[group.source] || group.source} />
                        <ArkExpiryBadge group={group} />
                        {!group.available ? <AdminStatusBadge label={translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.unavailableSiteOrProjectChanged")} tone="error" /> : null}
                    </div>
                    <dl className="admin-ark-detail-facts">
                        <div>
                            <dt>{translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.arkAssetGroupID")}</dt>
                            <dd>
                                <button type="button" className="font-mono" title={translate("canvasB.common.copy")} onClick={() => copyText(group.groupId)}>
                                    {group.groupId}
                                </button>
                            </dd>
                        </div>
                        <div>
                            <dt>{group.scope === "platform" ? translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.createdByAdmin") : translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.owner")}</dt>
                            <dd>{arkUserLabel(group.owner)}</dd>
                        </div>
                        <div>
                            <dt>{translate("library.tasks.detail.createdAt")}</dt>
                            <dd>{formatArkAdminDate(group.createdAt, true)}</dd>
                        </div>
                        {group.kind === "real" ? (
                            <div>
                                <dt>{translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.verifiedAt")}</dt>
                                <dd>{formatArkAdminDate(group.authorizedAt, true)}</dd>
                            </div>
                        ) : null}
                    </dl>

                    <section className="admin-ark-detail-section">
                        <h3>{translate("account.settings.modelConfig.tabBasic")}</h3>
                        <label className="admin-ark-field">
                            <span>{translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.name")}</span>
                            <Input maxLength={40} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                        </label>
                        <label className="admin-ark-field">
                            <span>{translate("library.ark.virtualFlow.descriptionLabel")}</span>
                            <Input.TextArea maxLength={200} autoSize={{ minRows: 2, maxRows: 4 }} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                        </label>
                        {group.kind === "real" ? (
                            <label className="admin-ark-field">
                                <span>{translate("library.ark.detail.expiresAt")}</span>
                                <DatePicker value={draft.expiresAt} allowClear={false} onChange={(value) => setDraft({ ...draft, expiresAt: value })} />
                                <small>{translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.afterExpiryUploadsAndGenerationAreDisabledExtendAuthorizationHere")}</small>
                            </label>
                        ) : null}
                    </section>

                    {group.scope === "platform" ? (
                        <section className="admin-ark-detail-section">
                            <h3>{translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.usageAuthorization")}</h3>
                            <label className="flex items-center gap-2 text-sm">
                                <Switch checked={draft.grantAll} onChange={(checked) => setDraft({ ...draft, grantAll: checked })} aria-label={translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.authorizeAllUsers")} />
                                {translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.authorizeAllUsers")}
                            </label>
                            {draft.grantAll ? null : <ArkGrantUsersField value={draft.grantUserIds} known={group.grantUsers} onChange={(ids) => setDraft({ ...draft, grantUserIds: ids })} />}
                            <small>{translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.authorizedUsersCanFindThisGroupInSettingsArkAsset")}</small>
                        </section>
                    ) : null}

                    <section className="admin-ark-detail-section">
                        <div className="flex items-center justify-between gap-2">
                            <h3>
                                {translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.assetsInGroup")}
                                {group.assets.length}）
                            </h3>
                            {group.scope === "platform" && group.available ? (
                                <Button icon={<ImagePlus className="size-4" />} loading={working === "upload"} onClick={() => fileInput.current?.click()}>
                                    {translate("account.settings.profile.upload")}
                                </Button>
                            ) : null}
                        </div>
                        {group.scope === "platform" ? <small>{translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.adminUploadsAreSubmittedDirectlyToArkWithoutReviewJPEG")}</small> : null}
                        <input
                            ref={fileInput}
                            hidden
                            multiple
                            type="file"
                            accept={ARK_IMAGE_ACCEPT}
                            onChange={(event) => {
                                const files = Array.from(event.target.files || []);
                                event.target.value = "";
                                void upload(files);
                            }}
                        />
                        {group.assets.length ? (
                            <ul className="admin-ark-tiles">
                                {group.assets.map((asset) => (
                                    <li key={asset.id} className="admin-ark-tile">
                                        <img src={arkPortraitAssetFileUrl(asset.id)} alt={asset.name} loading="lazy" decoding="async" />
                                        <div className="admin-ark-tile-body">
                                            <strong title={asset.name}>{asset.name}</strong>
                                            <ArkAssetStatusBadge status={asset.status} />
                                            <span>{arkUserLabel(asset.uploader)}</span>
                                            {asset.arkAssetId ? (
                                                <button type="button" className="font-mono" title={translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.copyArkAssetID")} onClick={() => copyText(asset.arkAssetId)}>
                                                    {asset.arkAssetId}
                                                </button>
                                            ) : null}
                                            {asset.error ? <span className="is-error">{asset.error}</span> : null}
                                        </div>
                                        <Button
                                            type="text"
                                            size="small"
                                            danger
                                            icon={<Trash2 className="size-3.5" />}
                                            aria-label={translate("adminPages.settings.arkAssets.arkAdminGroupDrawer.deleteAsset2", { v0: String(asset.name) })}
                                            onClick={() => confirmDeleteAsset(asset.id, asset.name)}
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="admin-ark-empty">{translate("library.ark.group.emptyAssets")}</p>
                        )}
                    </section>
                </div>
            )}
        </AdminDrawer>
    );
}
