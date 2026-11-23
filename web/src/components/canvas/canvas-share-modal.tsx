import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Input, Modal, Spin } from "antd";
import { Copy, Link2, RefreshCw, Share2, Unlink } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { createCanvasShare, deleteCanvasShare, getCanvasShare, type CanvasShareStatus } from "@/services/api/canvas-share";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

export function CanvasShareModal({ projectId, open, onClose, beforeCreate }: { projectId: string; open: boolean; onClose: () => void; beforeCreate: () => Promise<boolean | void> }) {
    const { message, modal } = App.useApp();
    const theme = canvasThemes[useActiveTheme()];
    const [share, setShare] = useState<CanvasShareStatus>({ enabled: false });
    const [expiresDays, setExpiresDays] = useState(0);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const shareUrl = useMemo(() => share.token ? `${window.location.origin}/share/canvas/${share.token}` : "", [share.token]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getCanvasShare(projectId);
            setShare(result.share);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("canvasTools.canvasShareModal.couldNotReadTheSharingStatus"));
        } finally {
            setLoading(false);
        }
    }, [message, projectId]);

    useEffect(() => {
        if (open) void load();
    }, [load, open]);

    const copy = async (value = shareUrl) => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        message.success(translate("canvasTools.canvasShareModal.shareLinkCopied"));
    };

    const create = async (rotate = false) => {
        setSubmitting(true);
        try {
            const saved = await beforeCreate();
            if (saved === false) return;
            const result = await createCanvasShare(projectId, { expiresDays, rotate });
            setShare(result.share);
            const url = result.share.token ? `${window.location.origin}/share/canvas/${result.share.token}` : "";
            await copy(url);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("canvasTools.canvasShareModal.couldNotCreateTheShareLink"));
        } finally {
            setSubmitting(false);
        }
    };

    const revoke = () => modal.confirm({
        title: translate("canvasTools.canvasShareModal.stopSharingPublicly"),
        content: translate("canvasTools.canvasShareModal.theExistingShareLinkStopsWorkingImmediatelyTheCanvasItself"),
        okText: translate("canvasTools.canvasShareModal.stopSharing"),
        okButtonProps: { danger: true },
        cancelText: translate("common.cancel"),
        onOk: async () => {
            await deleteCanvasShare(projectId);
            setShare({ enabled: false });
            message.success(translate("canvasTools.canvasShareModal.sharingStopped"));
        },
    });

    return (
        <Modal title={<span className="inline-flex items-center gap-2"><Share2 className="size-4" />{translate("canvasTools.canvasShareModal.shareCanvas")}</span>} open={open} onCancel={onClose} footer={null} centered width={520} destroyOnHidden>
            <Spin spinning={loading}>
                <div className="border-t pt-5" style={{ borderColor: theme.node.stroke }}>
                    <p className="mb-4 text-sm leading-6" style={{ color: theme.node.muted }}>
                        {translate("canvasTools.canvasShareModal.anyoneWithTheLinkCanViewWithoutSigningInVisitors")}
                    </p>
                    {share.enabled && shareUrl ? (
                        <div className="space-y-4">
                            <Input value={shareUrl} readOnly suffix={<Button type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<Copy className="size-3.5" />} onClick={() => void copy()} aria-label={translate("canvasTools.canvasShareModal.copyShareLink")} />} />
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-xs" style={{ color: theme.node.muted }}>{share.expiresAt ? translate("canvasTools.canvasShareModal.validUntil", { v0: String(new Date(share.expiresAt).toLocaleString("zh-CN")) }) : translate("canvasTools.canvasShareModal.noExpiryUntilYouStopSharing")}</span>
                                <div className="flex gap-2">
                                    <Button icon={<RefreshCw className="size-3.5" />} loading={submitting} onClick={() => void create(true)}>{translate("canvasTools.canvasShareModal.regenerateTheLink")}</Button>
                                    <Button danger icon={<Unlink className="size-3.5" />} onClick={revoke}>{translate("canvasTools.canvasShareModal.stopSharing")}</Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Select value={expiresDays} onChange={setExpiresDays} className="min-w-40" options={[{ value: 0, label: translate("library.ark.expiry.none") }, { value: 7, label: translate("canvasTools.canvasShareModal.validFor7Days") }, { value: 30, label: translate("canvasTools.canvasShareModal.validFor30Days") }]} />
                            <Button type="primary" icon={<Link2 className="size-4" />} loading={submitting} onClick={() => void create(false)}>{translate("canvasTools.canvasShareModal.createAndCopyTheLink")}</Button>
                        </div>
                    )}
                </div>
            </Spin>
        </Modal>
    );
}
