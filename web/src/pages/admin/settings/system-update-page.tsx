import { App, Button, Input, Skeleton } from "antd";
import { AlertTriangle, Archive, BadgeCheck, Circle, ExternalLink, History, RefreshCw, RotateCcw, ServerCog, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { checkSystemUpdate, getSystemUpdateStatus, rollbackSystemUpdate, startSystemUpdate, type SystemUpdateStatus, type UpdatePhase } from "@/services/api/system-update";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";
import { currentLocale, translate } from "@/i18n";


const activePhases = new Set<UpdatePhase>(["checking", "preflight", "backing_up", "pulling", "draining", "migrating", "switching", "verifying", "rolling_back"]);

const phaseLabels: Record<UpdatePhase, string> = {
    idle: translate("adminPages.settings.systemUpdatePage.waitingToCheck"),
    checking: translate("adminPages.settings.systemUpdatePage.checking"),
    ready: translate("adminPages.settings.systemUpdatePage.updateAvailable"),
    no_update: translate("adminPages.settings.systemUpdatePage.upToDate"),
    preflight: translate("adminPages.settings.systemUpdatePage.prechecks"),
    backing_up: translate("adminPages.settings.systemUpdatePage.backingUp"),
    pulling: translate("adminPages.settings.systemUpdatePage.pullingImages"),
    draining: translate("adminPages.settings.systemUpdatePage.stoppingOldServices"),
    migrating: translate("adminPages.settings.systemUpdatePage.migratingDatabase"),
    switching: translate("adminPages.settings.systemUpdatePage.switchingVersions"),
    verifying: translate("adminPages.settings.systemUpdatePage.verifyingHealth"),
    succeeded: translate("adminPages.settings.systemUpdatePage.updateSucceeded"),
    rolling_back: translate("adminPages.settings.systemUpdatePage.rollingBack"),
    rolled_back: translate("adminPages.settings.systemUpdatePage.rolledBack"),
    failed: translate("adminPages.settings.systemUpdatePage.updateFailed"),
    manual_intervention: translate("adminPages.settings.systemUpdatePage.manualInterventionRequired"),
};

export default function SystemUpdatePage() {
    const { message, modal } = App.useApp();
    const [status, setStatus] = useState<SystemUpdateStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [starting, setStarting] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);
    const [loadError, setLoadError] = useState("");
    const mountedRef = useRef(true);

    const load = useCallback(async (initial = false) => {
        if (initial) setLoading(true);
        try {
            const next = await getSystemUpdateStatus();
            if (!mountedRef.current) return;
            setStatus(next);
            setLoadError("");
            setReconnecting(false);
        } catch (error) {
            if (!mountedRef.current) return;
            const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.systemUpdatePage.failedToLoadSystemUpdateStatus");
            setLoadError(errorMessage);
            if (status && activePhases.has(status.operation.phase)) setReconnecting(true);
        } finally {
            if (mountedRef.current && initial) setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        mountedRef.current = true;
        void load(true);
        return () => {
            mountedRef.current = false;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!status || !activePhases.has(status.operation.phase)) return;
        const timer = window.setInterval(() => void load(false), 2500);
        return () => window.clearInterval(timer);
    }, [load, status]);

    const operationActive = Boolean(status && activePhases.has(status.operation.phase));
    const blockingCheckFailed = status?.checks.some((check) => check.blocking && check.status === "failed") ?? true;

    const requestCheck = async () => {
        setChecking(true);
        try {
            const next = await checkSystemUpdate();
            setStatus(next);
            message.success(next.updateAvailable ? translate("adminPages.settings.systemUpdatePage.newVersionFound", { v0: String(next.latestRelease?.version) }) : translate("adminPages.settings.systemUpdatePage.alreadyRunningTheLatestVersion"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.settings.systemUpdatePage.failedToCheckForUpdates"));
            await load(false);
        } finally {
            setChecking(false);
        }
    };

    const requestStart = () => {
        if (!status?.latestRelease) return;
        const target = status.latestRelease.version;
        modal.confirm({
            title: translate("adminPages.settings.systemUpdatePage.updateTo", { v0: String(target) }),
            width: 560,
            content: (
                <div className="space-y-3 text-sm text-foreground/70">
                    <p>{translate("adminPages.settings.systemUpdatePage.theSystemCreatesAndValidatesZIPBackupsOfTheDatabase")}</p>
                    <p>{translate("adminPages.settings.systemUpdatePage.theSiteWillBeBrieflyUnavailableDuringTheUpdateFailed")}</p>
                </div>
            ),
            okText: translate("adminPages.settings.systemUpdatePage.confirmAndStartUpdate"),
            cancelText: translate("common.cancel"),
            onOk: async () => {
                setStarting(true);
                try {
                    const next = await startSystemUpdate(target);
                    setStatus(next);
                    message.success(translate("adminPages.settings.systemUpdatePage.updateStartedThePageWillReconnectAutomaticallyAndDisplayProgress"));
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("adminPages.settings.systemUpdatePage.unableToStartUpdate"));
                    throw error;
                } finally {
                    setStarting(false);
                }
            },
        });
    };

    const requestRollback = () => {
        if (!status?.rollbackVersion) return;
        let reason = "";
        modal.confirm({
            title: translate("adminPages.settings.systemUpdatePage.rollBackTo", { v0: String(status.rollbackVersion) }),
            width: 520,
            content: (
                <div className="space-y-3">
                    <p className="text-sm text-foreground/65">{translate("adminPages.settings.systemUpdatePage.rollbackStopsCurrentServicesRestoresTheLatestValidatedDatabaseBackup")}</p>
                    <Input.TextArea rows={3} maxLength={300} showCount placeholder={translate("adminPages.settings.systemUpdatePage.enterRollbackReasonRequired")} onChange={(event) => (reason = event.target.value)} />
                </div>
            ),
            okText: translate("adminPages.settings.systemUpdatePage.startRollback"),
            okButtonProps: { danger: true },
            cancelText: translate("common.cancel"),
            onOk: async () => {
                if (!reason.trim()) {
                    message.warning(translate("adminPages.settings.systemUpdatePage.pleaseEnterARollbackReason"));
                    throw new Error("rollback reason required");
                }
                const next = await rollbackSystemUpdate(reason.trim());
                setStatus(next);
                message.success(translate("adminPages.settings.systemUpdatePage.rollbackStarted"));
            },
        });
    };

    if (loading) {
        return (
            <AdminPageFrame title={translate("adminPages.settings.systemUpdatePage.systemUpdates")} description={translate("adminPages.settings.systemUpdatePage.checkReleasesAndUpdateOnlineWithBackupsMigrationsAndHealth")} scroll>
                <div className="admin-settings-stack admin-system-update"><Skeleton active paragraph={{ rows: 12 }} /></div>
            </AdminPageFrame>
        );
    }

    return (
        <AdminPageFrame
            title={translate("adminPages.settings.systemUpdatePage.systemUpdates")}
            description={translate("adminPages.settings.systemUpdatePage.checkGitHubReleasesAndSwitchVersionsAfterBackupsMigrationsAnd")}
            scroll
            actions={
                <Button icon={<RefreshCw className="size-4" />} loading={checking} disabled={operationActive || !status?.supported} onClick={() => void requestCheck()}>
                    {translate("adminPages.settings.systemUpdatePage.checkForUpdates")}
                </Button>
            }
        >
            <div className="admin-settings-stack admin-system-update">
                {loadError && !status ? <UpdateAlert tone="error" title={translate("adminPages.settings.systemUpdatePage.unableToLoadUpdateStatus")} detail={loadError} /> : null}
                {!status?.supported ? <UpdateAlert tone="warning" title={translate("adminPages.settings.systemUpdatePage.thisDeploymentDoesNotSupportOnlineUpdatesFromTheAdmin")} detail={translate("adminPages.settings.systemUpdatePage.installHostUpdaterOnTheServerThenRecreateTheBackend")} /> : null}
                {reconnecting ? <UpdateAlert tone="warning" title={translate("adminPages.settings.systemUpdatePage.switchingServicesWaitingToReconnect")} detail={translate("adminPages.settings.systemUpdatePage.theUpdaterRunsOnTheHostATemporaryAdminPage")} /> : null}
                {status?.operation.phase === "manual_intervention" ? <UpdateAlert
                    tone="error"
                    title={status.operation.rollbackError ? translate("adminPages.settings.systemUpdatePage.automaticRollbackWasNotCompletedManualInterventionIsRequired") : translate("adminPages.settings.systemUpdatePage.applicationUpdatedHostUpdaterRequiresManualAttention")}
                    detail={status.operation.rollbackError || status.operation.error || translate("adminPages.settings.systemUpdatePage.checkHostUpdaterAndContainerLogs")}
                /> : null}

                <div className="admin-system-update-grid">
                    <SettingsSectionCard
                        className="admin-system-update-release"
                        layout="stacked"
                        icon={<ServerCog className="size-4" />}
                        title={translate("adminPages.settings.systemUpdatePage.availableVersion")}
                        description={status?.updateAvailable ? translate("adminPages.settings.systemUpdatePage.currentlyRunningUpdateAvailable", { v0: String(status.currentVersion), v1: String(status.latestRelease?.version) }) : translate("adminPages.settings.systemUpdatePage.checkGitHubReleasesAndTheCurrentImageTag")}
                        status={<PhaseBadge phase={status?.operation.phase ?? "idle"} />}
                        footer={
                            <>
                                <span className="text-xs leading-5 text-foreground/50">{translate("adminPages.settings.systemUpdatePage.everyOnlineUpdateBacksUpTheDatabaseAndChecksImage")}</span>
                                <Button type="primary" loading={starting} disabled={!status?.connected || !status.updateAvailable || operationActive || blockingCheckFailed} onClick={requestStart}>
                                    {translate("adminPages.settings.systemUpdatePage.startUpdate")}
                                </Button>
                            </>
                        }
                    >
                        <div className="admin-system-update-release-body">
                            <div className="admin-system-update-versions">
                                <div>
                                    <span>{translate("adminPages.settings.systemUpdatePage.currentlyRunning")}</span>
                                    <strong>{status?.currentVersion || translate("adminPages.settings.systemUpdatePage.unidentified")}</strong>
                                    {status?.currentVersion && !isReleaseVersion(status.currentVersion) ? <AdminStatusBadge label={translate("adminPages.settings.systemUpdatePage.unofficialVersion")} tone="warning" /> : null}
                                </div>
                                <div>
                                    <span>{translate("adminPages.settings.systemUpdatePage.recentlyPublished")}</span>
                                    <strong>{status?.latestRelease?.version || translate("adminPages.settings.systemUpdatePage.notCheckedYet")}</strong>
                                    {status?.latestRelease?.prerelease ? <AdminStatusBadge label={translate("adminPages.settings.systemUpdatePage.previewRelease")} tone="warning" /> : null}
                                    {status?.updateAvailable ? <AdminStatusBadge label={translate("adminPages.settings.systemUpdatePage.updateAvailable")} tone="success" /> : null}
                                </div>
                            </div>
                            {status?.updateAvailable && status.latestRelease ? (
                                <p className="admin-system-update-hint">
                                    {isReleaseVersion(status.currentVersion)
                                        ? translate("adminPages.settings.systemUpdatePage.youCanUpdateFromTo", { v0: String(status.currentVersion), v1: String(status.latestRelease.version) })
                                        : translate("adminPages.settings.systemUpdatePage.theCurrentImageTagIsNotAReleaseVersionNumber", { v0: String(status.currentVersion), v1: String(status.latestRelease.version) })}
                                </p>
                            ) : null}
                            <dl className="admin-system-update-facts">
                                <dt>{translate("adminPages.settings.systemUpdatePage.deploymentMethod")}</dt><dd>{status?.deployment || translate("adminPages.settings.systemUpdatePage.unknown")}</dd>
                                <dt>{translate("adminPages.settings.systemUpdatePage.publishedAt")}</dt><dd>{formatDate(status?.latestRelease?.publishedAt)}</dd>
                                <dt>{translate("adminPages.settings.systemUpdatePage.repository")}</dt><dd>{status?.repository || "ddcat-ai/open-ai-canvas"}</dd>
                            </dl>
                            {status?.latestRelease ? (
                                <div className="admin-system-update-notes">
                                    <div className="flex items-center justify-between gap-3"><h3>{translate("account.layout.changelog.log")}</h3><a href={status.latestRelease.url} target="_blank" rel="noreferrer">{translate("adminPages.settings.systemUpdatePage.viewRelease")} <ExternalLink className="size-3" /></a></div>
                                    <pre>{status.latestRelease.body || translate("adminPages.settings.systemUpdatePage.noChangelogWasProvidedForThisVersion")}</pre>
                                </div>
                            ) : null}
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard layout="stacked" icon={<ShieldCheck className="size-4" />} title={translate("adminPages.settings.systemUpdatePage.updatePrechecks")} description={translate("adminPages.settings.systemUpdatePage.servicesCanSwitchOnlyAfterAllBlockingChecksPass")} status={{ label: status?.connected ? translate("adminPages.settings.systemUpdatePage.updaterConnected") : translate("adminPages.settings.systemUpdatePage.updaterDisconnected"), color: status?.connected ? "success" : "error" }}>
                        <div className="admin-system-update-checks">
                            {(status?.checks || []).map((check) => <UpdateCheckRow key={check.key} check={check} />)}
                        </div>
                    </SettingsSectionCard>
                </div>

                <SettingsSectionCard layout="stacked" icon={<History className="size-4" />} title={translate("adminPages.settings.systemUpdatePage.updateProgress")} description={translate("adminPages.settings.systemUpdatePage.operationStatusAndLogsArePersistedOnTheHostAnd")} status={<PhaseBadge phase={status?.operation.phase ?? "idle"} />}>
                    <div className="admin-system-update-progress">
                        {status?.operation.error ? <UpdateAlert tone="error" title={translate("adminPages.settings.systemUpdatePage.thisOperationFailed")} detail={status.operation.error} compact /> : null}
                        {(status?.operation.logs || []).length ? (
                            <ol>
                                {status?.operation.logs.map((entry, index) => (
                                    <li key={`${entry.at}-${index}`}><span className="admin-system-update-dot" data-active={index === status.operation.logs.length - 1} /><div><strong>{phaseLabels[entry.phase]}</strong><p>{entry.message}</p></div><time>{formatTime(entry.at)}</time></li>
                                ))}
                            </ol>
                        ) : <p className="admin-system-update-empty">{translate("adminPages.settings.systemUpdatePage.theFullOperationHistoryAppearsHereAfterCheckingForUpdates")}</p>}
                    </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                    layout="stacked"
                    icon={<Archive className="size-4" />}
                    title={translate("adminPages.settings.systemUpdatePage.backupsAndRollback")}
                    description={translate("adminPages.settings.systemUpdatePage.onlyTheLatestBackupThatPassedZIPStructureAndSHA")}
                    status={{ label: status?.lastBackup ? translate("adminPages.settings.systemUpdatePage.backupValidated") : translate("adminPages.settings.systemUpdatePage.noBackupsYet"), color: status?.lastBackup ? "success" : "warning" }}
                    footer={
                        <>
                            <span className="text-xs text-foreground/50">{translate("adminPages.settings.systemUpdatePage.manualRollbackAlsoStopsServicesRestoresTheDatabaseStartsOld")}</span>
                            <Button danger icon={<RotateCcw className="size-4" />} disabled={!status?.rollbackVersion || operationActive || !status?.connected} onClick={requestRollback}>{translate("adminPages.settings.systemUpdatePage.rollBackToPreviousVersion")}</Button>
                        </>
                    }
                >
                    <div className="admin-system-update-backup">
                        {status?.lastBackup ? <dl><dt>{translate("adminPages.settings.systemUpdatePage.backupID")}</dt><dd>{status.lastBackup.id}</dd><dt>{translate("adminPages.settings.systemUpdatePage.sourceVersion")}</dt><dd>{status.lastBackup.version}</dd><dt>{translate("library.tasks.detail.createdAt")}</dt><dd>{formatDate(status.lastBackup.createdAt)}</dd><dt>{translate("canvasB.mediaVersion.rowFileSize")}</dt><dd>{formatBytes(status.lastBackup.size)}</dd><dt>SHA-256</dt><dd className="admin-monospace">{status.lastBackup.checksum}</dd></dl> : <p>{translate("adminPages.settings.systemUpdatePage.databaseAndDataDirectoryZIPBackupsAreCreatedAutomaticallyWhen")}</p>}
                    </div>
                </SettingsSectionCard>
            </div>
        </AdminPageFrame>
    );
}

function PhaseBadge({ phase }: { phase: UpdatePhase }) {
    const tone = phase === "succeeded" || phase === "ready" ? "success" : phase === "failed" || phase === "manual_intervention" ? "error" : phase === "rolling_back" || phase === "rolled_back" ? "warning" : activePhases.has(phase) ? "info" : "neutral";
    return <AdminStatusBadge label={phaseLabels[phase]} tone={tone} />;
}

function UpdateCheckRow({ check }: { check: SystemUpdateStatus["checks"][number] }) {
    const Icon = check.status === "passed" ? BadgeCheck : check.status === "failed" ? AlertTriangle : Circle;
    return <div className="admin-system-update-check-row" data-status={check.status}><Icon className="size-4" /><div><strong>{check.label}</strong><p>{check.detail || translate("adminPages.settings.systemUpdatePage.waitingToRun")}</p></div><span>{check.status === "passed" ? translate("adminPages.settings.systemUpdatePage.approve") : check.status === "failed" ? translate("library.assets.batch.failed") : translate("adminPages.settings.systemUpdatePage.pending")}</span></div>;
}

function UpdateAlert({ tone, title, detail, compact = false }: { tone: "warning" | "error"; title: string; detail: string; compact?: boolean }) {
    return <div className={`admin-system-update-alert${compact ? " is-compact" : ""}`} data-tone={tone} role="alert"><AlertTriangle className="size-4" /><div><strong>{title}</strong><p>{detail}</p></div></div>;
}

function formatDate(value?: string) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(currentLocale(), { hour12: false });
}

function formatTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString(currentLocale(), { hour12: false });
}

function formatBytes(value: number) {
    if (!Number.isFinite(value) || value <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / 1024 ** index).toFixed(index > 1 ? 2 : 0)} ${units[index]}`;
}

function isReleaseVersion(value?: string) {
    return Boolean(value && /^v?\d+\.\d+\.\d+/.test(value));
}
