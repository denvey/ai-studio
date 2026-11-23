import { Alert, Button, Skeleton } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { AdminDrawer } from "@/pages/admin/ui/overlays";
import { getAdminLoginLog, type LoginLog } from "@/services/api/login-logs";
import { loginEventLabels, loginLogDevice, loginMethodLabels, loginSourceLabels } from "./login-log-display";
import { translate } from "@/i18n";

export function LoginLogDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
    const [detail, setDetail] = useState<LoginLog | null>(null);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        setDetail(null);
        setError("");
        if (!id) return;
        const controller = new AbortController();
        void getAdminLoginLog(id, controller.signal)
            .then(({ log }) => {
                if (!controller.signal.aborted) setDetail(log);
            })
            .catch((cause) => {
                if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate("adminPages.loginLogs.loginLogDetailDrawer.failedToLoadLogDetails"));
            });
        return () => controller.abort();
    }, [id, retry]);
    const device = detail ? loginLogDevice(detail.userAgent) : null;
    const entries = detail
        ? [
              [translate("adminPages.loginLogs.loginLogDetailDrawer.time"), dayjs(detail.createdAt).format("YYYY-MM-DD HH:mm:ss.SSS Z")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.userDisplayName"), detail.displayName || translate("adminPages.loginLogs.loginLogDetailDrawer.noLinkedUser")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.account"), detail.username || detail.account || translate("adminPages.loginLogs.loginLogDetailDrawer.unidentified")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.userID"), detail.userId || translate("adminPages.loginLogs.loginLogDetailDrawer.noLinkedUser")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.event"), loginEventLabels[detail.event]],
              [translate("canvasA.assetView.origin"), loginSourceLabels[detail.source]],
              [translate("auth.login.method"), loginMethodLabels[detail.method]],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.result"), detail.result === "success" ? translate("adminPages.loginLogs.loginLogDetailDrawer.success") : translate("library.assets.batch.failed")],
              ["IP", detail.ip || translate("adminPages.loginLogs.loginLogDetailDrawer.notRecorded")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.browser"), device?.browser || translate("adminPages.loginLogs.loginLogDetailDrawer.notRecorded")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.operatingSystem"), device?.os || translate("adminPages.loginLogs.loginLogDetailDrawer.notRecorded")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.clientReportedInformation"), detail.userAgent || translate("adminPages.loginLogs.loginLogDetailDrawer.notRecorded")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.failureReason"), detail.message || translate("canvasB.common.none")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.reasonCode"), detail.reason || translate("canvasB.common.none")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.linkedSessionID"), detail.sessionRef || translate("adminPages.loginLogs.loginLogDetailDrawer.noLinkedSession")],
              [translate("adminPages.loginLogs.loginLogDetailDrawer.logID"), detail.id],
          ]
        : [];
    return (
        <AdminDrawer title={translate("adminPages.loginLogs.loginLogDetailDrawer.loginLogDetails")} open={Boolean(id)} onClose={onClose} size={560}>
            {error ? (
                <Alert
                    type="error"
                    showIcon
                    title={translate("adminPages.loginLogs.loginLogDetailDrawer.failedToLoadDetails")}
                    description={error}
                    action={
                        <Button size="small" onClick={() => setRetry((value) => value + 1)}>
                            {translate("common.retry")}
                        </Button>
                    }
                />
            ) : !detail ? (
                <Skeleton active />
            ) : (
                <dl className="space-y-5">
                    {entries.map(([label, value]) => (
                        <div key={label}>
                            <dt className="mb-1 text-xs text-foreground/50">{label}</dt>
                            <dd className="break-words text-sm text-foreground">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </AdminDrawer>
    );
}
