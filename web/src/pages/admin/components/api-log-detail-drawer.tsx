import { useEffect, useState, type ReactNode } from "react";
import { Alert, App, Button, Input, Skeleton, Tabs, Typography } from "antd";
import { AdminEmpty, AdminStatusBadge } from "@/pages/admin/components/admin-ui";
import { AdminDrawer } from "@/pages/admin/ui/overlays";
import { Activity, Clipboard, HardDriveUpload, Link2, RefreshCw, Save, Video } from "lucide-react";
import { formatCredits } from "@/constant/credits";
import { getAdminApiLog, queryAdminApiLogTask, recoverAdminApiLogTaskMedia, recoverAdminApiLogVideoByURL, type ApiCallLog } from "@/services/api/auth";
import { videoRecoveryAvailable } from "../logs/log-view";
import { currentLocale, translate } from "@/i18n";

export function ApiLogDetailDrawer({ logId, onClose, onLogUpdated }: { logId: string | null; onClose: () => void; onLogUpdated?: (log: ApiCallLog) => void }) {
    const { message, modal } = App.useApp();
    const [log, setLog] = useState<ApiCallLog | null>(null);
    const [loading, setLoading] = useState(false);
    const [querying, setQuerying] = useState(false);
    const [providerRequestId, setProviderRequestId] = useState("");
    const [videoURL, setVideoURL] = useState("");
    const [resultText, setResultText] = useState("");
    const [resultTone, setResultTone] = useState<"success" | "warning" | "error">("success");

    const refresh = async (id: string) => {
        const refreshed = await getAdminApiLog(id);
        setLog(refreshed.log);
        setProviderRequestId(refreshed.log.providerRequestId || "");
        onLogUpdated?.(refreshed.log);
        return refreshed.log;
    };

    useEffect(() => {
        if (!logId) return;
        let active = true;
        setLoading(true);
        setLog(null);
        setResultText("");
        setVideoURL("");
        void getAdminApiLog(logId)
            .then((result) => {
                if (!active) return;
                setLog(result.log);
                setProviderRequestId(result.log.providerRequestId || "");
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : translate("admin.apiLogDetailDrawer.failedToLoadRequestDetails")))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [logId, message]);

    const runQuery = async () => {
        if (!log) return;
        setQuerying(true);
        setResultText("");
        try {
            const result = await queryAdminApiLogTask(log.id, providerRequestId.trim() || undefined);
            await refresh(log.id);
            if (result.recovered) {
                window.dispatchEvent(new CustomEvent("wallet:updated"));
                setResultTone("success");
                setResultText(result.billingSettled ? translate("admin.apiLogDetailDrawer.querySuccessfulTheVideoHasBeenSavedAndBillingSettled") : translate("admin.apiLogDetailDrawer.theVideoHasBeenSavedBillingStatusNeedsReview"));
                message.success(translate("admin.apiLogDetailDrawer.videoTaskRecovered"));
            } else {
                setResultTone("warning");
                setResultText(translate("admin.apiLogDetailDrawer.upstreamGenerationIsStillInProgressNoChargeHasBeen", { v0: String(result.providerStatus ? `（${result.providerStatus}）` : "") }));
            }
        } catch (error) {
            setResultTone("error");
            setResultText(error instanceof Error ? error.message : translate("library.tasks.page.upstreamQueryFailed"));
        } finally {
            setQuerying(false);
        }
    };

    const runURLRecovery = async () => {
        if (!log || !videoURL.trim()) return;
        setQuerying(true);
        setResultText("");
        try {
            const result = await recoverAdminApiLogVideoByURL(log.id, videoURL.trim(), providerRequestId.trim() || undefined);
            await refresh(log.id);
            window.dispatchEvent(new CustomEvent("wallet:updated"));
            setResultTone("success");
            setResultText(result.billingSettled ? translate("admin.apiLogDetailDrawer.theVideoHasBeenSavedAndBillingSettled") : translate("admin.apiLogDetailDrawer.theVideoHasBeenSavedBillingStatusNeedsReview"));
            message.success(translate("admin.apiLogDetailDrawer.videoImportedSuccessfully"));
        } catch (error) {
            setResultTone("error");
            setResultText(error instanceof Error ? error.message : translate("admin.apiLogDetailDrawer.failedToSaveTheVideo"));
        } finally {
            setQuerying(false);
        }
    };

    const runMediaRecovery = async (refundedBilling?: "charge" | "waive") => {
        if (!log) return;
        setQuerying(true);
        setResultText("");
        try {
            await recoverAdminApiLogTaskMedia(log.id, refundedBilling);
            await refresh(log.id);
            setResultTone("success");
            setResultText(translate("admin.apiLogDetailDrawer.savingTheCreationHasBeenRequeuedIfObjectStorageRemains"));
            message.success(translate("admin.apiLogDetailDrawer.workQueuedForSavingAgain"));
        } catch (error) {
            setResultTone("error");
            setResultText(error instanceof Error ? error.message : translate("canvasPage.retry.restoreSaveFailed"));
        } finally {
            setQuerying(false);
        }
    };

    const confirmMediaRecovery = (refundedBilling?: "charge" | "waive") => {
        if (!log) return;
        if (!refundedBilling) {
            void runMediaRecovery();
            return;
        }
        const charge = refundedBilling === "charge";
        modal.confirm({
            title: charge ? translate("admin.apiLogDetailDrawer.recoverTheCreationAndChargeCredits") : translate("admin.apiLogDetailDrawer.recoverTheCreationWithoutCharging"),
            content: charge
                ? translate("admin.apiLogDetailDrawer.theOriginalOrderSPreauthorizationOfCreditsWasReleasedOnce", { v0: String(formatCredits(log.billingReservedMicrocredits)) })
                : translate("admin.apiLogDetailDrawer.theOriginalOrderRemainsRefundedNoChargeWillBeMade"),
            okText: charge ? translate("admin.apiLogDetailDrawer.recoverAndCharge") : translate("admin.apiLogDetailDrawer.recoverWithoutCharging"),
            cancelText: translate("common.cancel"),
            onOk: () => runMediaRecovery(refundedBilling),
        });
    };

    const title = log ? (
        <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-500/12 text-blue-500">
                <Activity className="size-[18px]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
                <div className="truncate text-[var(--fs-body)] font-semibold text-foreground">{translate("admin.apiLogDetailDrawer.requestLogDetails")}</div>
                <div className="mt-0.5 truncate text-xs font-normal text-foreground/50">
                    {capabilityText(log.capability)} · {log.model || translate("admin.apiLogDetailDrawer.unrecognizedModel")} · {formatTime(log.startedAt || log.createdAt)}
                </div>
            </div>
        </div>
    ) : translate("admin.apiLogDetailDrawer.requestLogDetails");

    return (
        <AdminDrawer title={title} open={Boolean(logId)} onClose={onClose} size="min(1120px, 66vw)" className="api-log-detail-drawer-panel" rootClassName="api-log-detail-drawer">
            {loading ? <Skeleton active paragraph={{ rows: 10 }} /> : log ? <LogDetail log={log} providerRequestId={providerRequestId} videoURL={videoURL} resultText={resultText} resultTone={resultTone} querying={querying} onProviderRequestIdChange={setProviderRequestId} onVideoURLChange={setVideoURL} onQuery={runQuery} onRecoverURL={runURLRecovery} onRecoverMedia={confirmMediaRecovery} /> : <AdminEmpty size="compact" title={translate("admin.apiLogDetailDrawer.noRequestDetails")} />}
        </AdminDrawer>
    );
}

type LogDetailProps = {
    log: ApiCallLog;
    providerRequestId: string;
    videoURL: string;
    resultText: string;
    resultTone: "success" | "warning" | "error";
    querying: boolean;
    onProviderRequestIdChange: (value: string) => void;
    onVideoURLChange: (value: string) => void;
    onQuery: () => void;
    onRecoverURL: () => void;
    onRecoverMedia: (refundedBilling?: "charge" | "waive") => void;
};

function LogDetail({ log, providerRequestId, videoURL, resultText, resultTone, querying, onProviderRequestIdChange, onVideoURLChange, onQuery, onRecoverURL, onRecoverMedia }: LogDetailProps) {
    const mediaRecoverable = log.taskStatus === "failed" && Boolean(log.mediaStage) && log.mediaStage !== "completed";
    const refunded = log.billingStatus === "refunded";
    const providerStatus = log.providerStatus?.toLowerCase();
    const processing = ["queued", "pending", "processing", "running", "in_progress"].includes(providerStatus || "");
    const failed = log.status === "failed" || ["failed", "cancelled", "expired"].includes(providerStatus || "");
    const status = failed ? { label: translate("library.assets.batch.failed"), tone: "error" as const } : processing ? { label: translate("account.feedback.status.processing"), tone: "warning" as const } : { label: translate("admin.apiLogDetailDrawer.success"), tone: "success" as const };

    return (
        <div className="api-log-detail-body">
            <section className="api-log-detail-section">
                <div className="api-log-detail-section-heading">
                    <div>
                        <div className="api-log-detail-eyebrow">{translate("admin.apiLogDetailDrawer.eyebrow.request")}</div>
                        <h2>{translate("admin.apiLogDetailDrawer.requestOverview")}</h2>
                    </div>
                    <AdminStatusBadge label={status.label} tone={status.tone} />
                </div>
                <div className="api-log-detail-summary-grid">
                    <InfoItem label={translate("admin.apiLogDetailDrawer.capabilityType")} value={capabilityText(log.capability)} />
                    <InfoItem label={translate("admin.apiLogDetailDrawer.requestStage")} value={requestKindText(log.requestKind)} />
                    <InfoItem label={translate("admin.apiLogDetailDrawer.modelChannel")} value={`${log.model || translate("admin.apiLogDetailDrawer.unrecognizedModel")} / ${log.channelName || translate("admin.apiLogDetailDrawer.noChannelRecorded")}`} />
                    <InfoItem label={translate("admin.apiLogDetailDrawer.users")} value={log.userDisplayName || log.userAccount || translate("admin.apiLogDetailDrawer.unknownUser")} detail={log.userAccount ? `@${log.userAccount}` : undefined} />
                    <InfoItem label={translate("admin.apiLogDetailDrawer.taskStatus")} value={mediaDeliveryText(log)} />
                    <InfoItem label={translate("canvasC.taskItem.billing")} value={billingText(log)} />
                    <InfoItem label={translate("admin.apiLogDetailDrawer.requestID")} value={<CopyValue value={log.id} />} />
                    <InfoItem label={translate("library.tasks.detail.taskId")} value={log.taskId ? <CopyValue value={log.taskId} /> : translate("admin.apiLogDetailDrawer.notRecorded")} />
                    <InfoItem label={translate("admin.apiLogDetailDrawer.vendorTaskID")} value={log.providerRequestId ? <CopyValue value={log.providerRequestId} /> : translate("admin.apiLogDetailDrawer.notRecorded")} />
                    <InfoItem label={translate("library.tasks.detail.duration")} value={<span className="tabular-nums">{formatDuration(log.durationMs)}</span>} />
                    <InfoItem label={translate("admin.apiLogDetailDrawer.hTTPStatus")} value={log.statusCode || translate("admin.apiLogDetailDrawer.notRecorded")} />
                    <InfoItem label={translate("admin.apiLogDetailDrawer.requestURL")} value={<span className="break-all font-mono text-xs">{log.method} {log.path || translate("admin.apiLogDetailDrawer.notRecorded")}</span>} />
                    <InfoItem label={translate("admin.apiLogDetailDrawer.upstreamChannelURL")} value={<span className="break-all font-mono text-xs">{log.upstreamUrl || translate("admin.apiLogDetailDrawer.notRecorded")}</span>} />
                </div>
                {log.error || log.errorCode ? (
                    <div className="api-log-detail-error">
                        <div className="text-xs font-semibold text-red-500">{log.errorCode || `HTTP ${log.statusCode || translate("library.assets.batch.failed")}`}</div>
                        <div className="mt-1 text-sm text-foreground/70">{log.error || translate("admin.apiLogDetailDrawer.upstreamReturnedNoErrorDetails")}</div>
                    </div>
                ) : null}
            </section>

            {mediaRecoverable ? (
                <section className="api-log-detail-section api-log-recovery-section">
                    <div className="api-log-detail-section-heading">
                        <div className="flex items-center gap-2">
                            <div className="grid size-8 place-items-center rounded-md bg-amber-500/12 text-amber-500">
                                <HardDriveUpload className="size-4" aria-hidden="true" />
                            </div>
                            <div>
                                <div className="api-log-detail-eyebrow">{translate("admin.apiLogDetailDrawer.eyebrow.media")}</div>
                                <h2>{translate("admin.apiLogDetailDrawer.recoverWorkSaving")}</h2>
                            </div>
                        </div>
                        <span className="text-xs text-foreground/45">{translate("admin.apiLogDetailDrawer.theWorkIsAlreadyGeneratedAndWillNotBeRegenerated")}</span>
                    </div>
                    <div className="api-log-recovery-body">
                        <div className="api-log-recovery-row">
                            <div className="api-log-recovery-label">
                                <span>{translate("admin.apiLogDetailDrawer.saveWorkAgain")}</span>
                                <small>{refunded ? translate("admin.apiLogDetailDrawer.theOriginalOrderWasRefundedChooseWhetherToChargeIt") : translate("admin.apiLogDetailDrawer.settleAgainstTheOriginalOrderAfterSavingSucceeds")}</small>
                            </div>
                            {refunded ? (
                                <>
                                    <Button icon={<Save className="size-3.5" />} loading={querying} onClick={() => onRecoverMedia("waive")}>{translate("admin.apiLogDetailDrawer.recoverWithoutCharging")}</Button>
                                    <Button type="primary" icon={<Save className="size-3.5" />} loading={querying} onClick={() => onRecoverMedia("charge")}>{translate("admin.apiLogDetailDrawer.recoverAndCharge")}</Button>
                                </>
                            ) : (
                                <Button type="primary" icon={<Save className="size-3.5" />} loading={querying} onClick={() => onRecoverMedia()}>{translate("admin.apiLogDetailDrawer.saveAgain")}</Button>
                            )}
                        </div>
                        {resultText ? <Alert className="api-log-recovery-result" type={resultTone} showIcon message={resultText} /> : null}
                    </div>
                </section>
            ) : null}

            {videoRecoveryAvailable(log) ? (
                <section className="api-log-detail-section api-log-recovery-section">
                    <div className="api-log-detail-section-heading">
                        <div className="flex items-center gap-2">
                            <div className="grid size-8 place-items-center rounded-md bg-violet-500/12 text-violet-500">
                                <Video className="size-4" aria-hidden="true" />
                            </div>
                            <div>
                                <div className="api-log-detail-eyebrow">{translate("admin.apiLogDetailDrawer.eyebrow.video")}</div>
                                <h2>{translate("admin.apiLogDetailDrawer.videoTaskRecovery")}</h2>
                            </div>
                        </div>
                        <span className="text-xs text-foreground/45">{translate("admin.apiLogDetailDrawer.availableForFailedTasks")}</span>
                    </div>
                    <div className="api-log-recovery-body">
                        <div className="api-log-recovery-row">
                            <div className="api-log-recovery-label">
                                <span>{translate("admin.apiLogDetailDrawer.vendorTaskID")}</span>
                                <small>{translate("admin.apiLogDetailDrawer.usesTheCurrentRecordByDefaultYouCanOverrideIt")}</small>
                            </div>
                            <Input className="api-log-recovery-input" value={providerRequestId} onChange={(event) => onProviderRequestIdChange(event.target.value)} placeholder={translate("admin.apiLogDetailDrawer.enterTheProviderTaskID")} />
                            <Button type="primary" icon={<RefreshCw className="size-3.5" />} loading={querying} onClick={onQuery}>{translate("admin.apiLogDetailDrawer.queryUpstreamTask")}</Button>
                        </div>
                        <div className="api-log-recovery-row">
                            <div className="api-log-recovery-label">
                                <span>{translate("admin.apiLogDetailDrawer.importVideoFromURL")}</span>
                                <small>{translate("admin.apiLogDetailDrawer.onlyPublicHTTPHTTPSVideoURLsAreSupported")}</small>
                            </div>
                            <Input className="api-log-recovery-input" prefix={<Link2 className="size-4 text-foreground/35" />} value={videoURL} onChange={(event) => onVideoURLChange(event.target.value)} placeholder="https://example.com/video.mp4" />
                            <Button icon={<Save className="size-3.5" />} loading={querying} disabled={!videoURL.trim()} onClick={onRecoverURL}>{translate("admin.apiLogDetailDrawer.importAndUpdateRecord")}</Button>
                        </div>
                        {resultText ? <Alert className="api-log-recovery-result" type={resultTone} showIcon message={resultText} /> : null}
                    </div>
                </section>
            ) : null}

            <section className="api-log-detail-section api-log-payload-section">
                <div className="api-log-detail-section-heading">
                    <div>
                        <div className="api-log-detail-eyebrow">{translate("admin.apiLogDetailDrawer.eyebrow.payload")}</div>
                        <h2>{translate("admin.apiLogDetailDrawer.requestPayload")}</h2>
                    </div>
                    <span className="text-xs text-foreground/45">{log.requestBody || log.responseBody ? translate("admin.apiLogDetailDrawer.rawContentCanBeCopied") : translate("admin.apiLogDetailDrawer.noPayloadAvailable")}</span>
                </div>
                <Tabs items={[{ key: "request", label: translate("admin.apiLogDetailDrawer.request"), children: <PayloadPanel value={log.requestBody} empty={translate("admin.apiLogDetailDrawer.noRequestPayloadWasRecordedForThisRequest")} /> }, { key: "response", label: translate("admin.apiLogDetailDrawer.response"), children: <PayloadPanel value={log.responseBody} empty={translate("admin.apiLogDetailDrawer.noResponsePayloadWasRecordedForThisRequest")} /> }]} />
            </section>
        </div>
    );
}

function InfoItem({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
    return (
        <div className="api-log-detail-info-item">
            <div className="api-log-detail-info-label">{label}</div>
            <div className="api-log-detail-info-value">{value}</div>
            {detail ? <div className="api-log-detail-info-detail">{detail}</div> : null}
        </div>
    );
}

function CopyValue({ value }: { value: string }) {
    return (
        <Typography.Text className="api-log-copy-value" copyable={{ text: value, tooltips: [translate("canvasB.common.copy"), translate("canvasB.common.copied")] }}>
            <code>{value}</code>
        </Typography.Text>
    );
}

function PayloadPanel({ value, empty }: { value?: string; empty: string }) {
    if (!value) return <AdminEmpty size="compact" title={empty} />;
    return (
        <div className="api-log-payload-wrap">
            <div className="api-log-payload-actions">
                <Typography.Text copyable={{ text: value, tooltips: [translate("admin.apiLogDetailDrawer.copyPayload"), translate("canvasB.common.copied")] }}>
                    <Clipboard className="mr-1 inline size-3.5" />{translate("admin.apiLogDetailDrawer.copyPayload")}
                </Typography.Text>
            </div>
            <pre className="api-log-payload">{value}</pre>
        </div>
    );
}

function billingText(log: ApiCallLog) {
    if (!log.billable) return translate("admin.apiLogDetailDrawer.notBillable");
    if (!log.billingAvailable) return translate("admin.apiLogDetailDrawer.noCreditsCharged");
    const labels = { settled: translate("admin.apiLogDetailDrawer.settled"), refunded: translate("admin.apiLogDetailDrawer.refunded"), uncertain: translate("admin.apiLogDetailDrawer.pendingReview"), running: translate("library.tasks.filter.active"), reserved: translate("admin.apiLogDetailDrawer.preauthorized") } as const;
    const settled = log.billingSettledMicrocredits !== undefined ? translate("admin.apiLogDetailDrawer.charged", { v0: String(formatCredits(log.billingSettledMicrocredits)) }) : translate("admin.apiLogDetailDrawer.unsettled");
    return translate("admin.apiLogDetailDrawer.preauthorizedCredits", { v0: String(formatCredits(log.billingReservedMicrocredits)), v1: String(settled), v2: String(labels[log.billingStatus || "reserved"]) });
}

function mediaDeliveryText(log: ApiCallLog) {
    if (log.taskStatus === "succeeded") return log.mediaStage === "completed" ? translate("admin.apiLogDetailDrawer.savedAndRegistered") : translate("admin.apiLogDetailDrawer.taskSucceeded");
    if (log.taskStatus === "failed") return translate("canvasPage.taskStatus.failed");
    return log.taskStatus || translate("admin.apiLogDetailDrawer.notRecorded");
}

function requestKindText(value: ApiCallLog["requestKind"]) {
    const labels: Partial<Record<ApiCallLog["requestKind"], string>> = { create: translate("admin.apiLogDetailDrawer.modelGeneration"), poll: translate("admin.apiLogDetailDrawer.statusQuery"), download: translate("admin.apiLogDetailDrawer.resultDownload"), upload: translate("admin.apiLogDetailDrawer.uploadToOSS"), local_save: translate("admin.apiLogDetailDrawer.saveFile"), local_fallback: translate("admin.apiLogDetailDrawer.saveLocallyAsFallback"), offload: translate("admin.apiLogDetailDrawer.syncToOSS"), register: translate("admin.apiLogDetailDrawer.registerAsset"), repair: translate("admin.apiLogDetailDrawer.repairResult") };
    return labels[value] || translate("admin.apiLogDetailDrawer.upstreamRequest");
}

function capabilityText(value: string) {
    return ({ text: translate("account.settings.modelConfig.capabilities.text"), image: translate("account.feedback.image"), video: translate("account.feedback.video"), audio: translate("account.settings.modelConfig.capabilities.audio") } as Record<string, string>)[value] || translate("admin.apiLogDetailDrawer.unknown");
}

function formatTime(value?: string) {
    return value ? new Date(value).toLocaleString(currentLocale(), { hour12: false }) : "--";
}

function formatDuration(value: number) {
    if (value < 1_000) return `${value} ms`;
    if (value < 60_000) return translate("admin.apiLogDetailDrawer.s", { v0: String((value / 1_000).toFixed(value < 10_000 ? 1 : 0)) });
    return translate("admin.apiLogDetailDrawer.mS", { v0: String(Math.floor(value / 60_000)), v1: String(Math.round((value % 60_000) / 1_000)) });
}
