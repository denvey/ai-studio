import { App, Button, InputNumber, Progress, Skeleton, Switch } from "antd";
import { Activity, AlertTriangle, Cpu, Database, Gauge, HardDrive, MemoryStick, RefreshCw, Server, ShieldCheck, Trash2, Wifi, Orbit } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { clearRuntimeCache, getSystemPerformance, updateAgentSessionLimit, type SystemPerformance } from "@/services/api/system-performance";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";
import { currentLocale, translate } from "@/i18n";


const refreshIntervalMs = 15_000;

function formatBytes(value?: number) {
    if (value === undefined || !Number.isFinite(value)) return "--";
    if (!value || value < 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const amount = value / 1024 ** index;
    return `${amount >= 100 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function formatDuration(seconds?: number) {
    if (seconds === undefined || !Number.isFinite(seconds)) return "--";
    if (!seconds) return translate("adminPages.settings.systemPerformancePage.lessThan1Minute");
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return [days ? translate("adminPages.settings.systemPerformancePage.days", { v0: String(days) }) : "", hours ? translate("adminPages.settings.systemPerformancePage.hours", { v0: String(hours) }) : "", minutes ? translate("adminPages.settings.systemPerformancePage.minutes", { v0: String(minutes) }) : ""].filter(Boolean).slice(0, 2).join(" ") || translate("adminPages.settings.systemPerformancePage.lessThan1Minute");
}

function formatNumber(value?: number) {
    return value === undefined || !Number.isFinite(value) ? "--" : new Intl.NumberFormat(currentLocale()).format(value);
}

function metricTone(value: number) {
    if (value >= 90) return "exception" as const;
    if (value >= 75) return "active" as const;
    return "normal" as const;
}

function FactGrid({ children }: { children: ReactNode }) {
    return <dl className="admin-performance-facts">{children}</dl>;
}

function Fact({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
    return <><dt>{label}</dt><dd className={mono ? "admin-monospace" : undefined}>{value}</dd></>;
}

function PerformanceKpi({ icon, label, value, detail, percent }: { icon: ReactNode; label: string; value: string; detail: string; percent?: number }) {
    return (
        <article className="admin-performance-kpi">
            <div className="admin-performance-kpi-heading"><span>{icon}</span><p>{label}</p></div>
            <strong>{value}</strong>
            <p>{detail}</p>
            {percent !== undefined ? <Progress percent={Math.min(100, Math.max(0, percent))} status={metricTone(percent)} showInfo={false} size="small" /> : null}
        </article>
    );
}

export default function SystemPerformancePage() {
    const { message, modal } = App.useApp();
    const [data, setData] = useState<SystemPerformance | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [savingAgentLimit, setSavingAgentLimit] = useState(false);
    const [agentLimitDraft, setAgentLimitDraft] = useState<number | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [loadError, setLoadError] = useState("");
    const mountedRef = useRef(true);
    const requestSequence = useRef(0);

    const load = useCallback(async (initial = false) => {
        const sequence = ++requestSequence.current;
        if (initial) setLoading(true);
        else setRefreshing(true);
        try {
            const next = await getSystemPerformance();
            if (!mountedRef.current || sequence !== requestSequence.current) return;
            setData(next);
            setLoadError("");
        } catch (error) {
            if (!mountedRef.current || sequence !== requestSequence.current) return;
            setLoadError(error instanceof Error ? error.message : translate("adminPages.settings.systemPerformancePage.failedToLoadSystemPerformance"));
        } finally {
            if (mountedRef.current && sequence === requestSequence.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        void load(true);
        return () => { mountedRef.current = false; requestSequence.current += 1; };
    }, [load]);

    useEffect(() => {
        if (!autoRefresh) return;
        const timer = window.setInterval(() => void load(false), refreshIntervalMs);
        return () => window.clearInterval(timer);
    }, [autoRefresh, load]);

    const requestClear = () => {
        modal.confirm({
            title: translate("adminPages.settings.systemPerformancePage.clearRuntimeCache"),
            width: 560,
            icon: <AlertTriangle className="size-5 text-warning" />,
            content: (
                <div className="admin-performance-confirm">
                    <p>{translate("adminPages.settings.systemPerformancePage.resetsRequestRateCountersChannelFailureAndCircuitBreakerStates")}</p>
                    <p><strong>{translate("adminPages.settings.systemPerformancePage.doesNotDelete")}</strong>{translate("adminPages.settings.systemPerformancePage.usersTasksAssetsModelSettingsOrDatabaseDataAndDoes")}</p>
                    <p>{translate("adminPages.settings.systemPerformancePage.upstreamRoutesWillBeProbedAgainShortlyAfterClearingAvoid")}</p>
                </div>
            ),
            okText: translate("adminPages.settings.systemPerformancePage.confirmClear"),
            okButtonProps: { danger: true, loading: clearing },
            cancelText: translate("common.cancel"),
            onOk: async () => {
                setClearing(true);
                try {
                    const result = await clearRuntimeCache();
                    message.success(translate("adminPages.settings.systemPerformancePage.clearedRedisLocalKeysAndInMemoryCacheEntries", { v0: String(result.deletedKeys), v1: String(result.memoryEntries) }));
                    await load(false);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("adminPages.settings.systemPerformancePage.failedToClearRuntimeCache"));
                    throw error;
                } finally {
                    setClearing(false);
                }
            },
        });
    };

    if (loading) {
        return <AdminPageFrame title={translate("adminPages.settings.systemPerformancePage.systemPerformance")} description={translate("adminPages.settings.systemPerformancePage.serverDatabaseAndRuntimeCacheStatus")} scroll><div className="admin-settings-stack admin-system-performance"><Skeleton active paragraph={{ rows: 14 }} /></div></AdminPageFrame>;
    }

    if (!data) {
        return <AdminPageFrame title={translate("adminPages.settings.systemPerformancePage.systemPerformance")} description={translate("adminPages.settings.systemPerformancePage.runtimeStatusUnknownNoValidMetricsHaveBeenCollectedYet")} scroll>
            <div className="admin-performance-alert" role="alert"><AlertTriangle className="size-4" /><span>{loadError || translate("adminPages.settings.systemPerformancePage.performanceDataUnavailable")}</span><Button size="small" loading={refreshing} onClick={() => void load(false)}>{translate("common.retry")}</Button></div>
        </AdminPageFrame>;
    }

    const memoryPercent = data?.memory.systemAvailable ? data.memory.usagePercent : undefined;
    const databaseConnections = data?.database.postgres?.connections ?? data?.database.pool.openConnections ?? 0;
    const databaseLimit = data?.database.postgres?.maxConnections || data?.database.pool.maxOpenConnections || 0;
    const databasePercent = databaseLimit ? databaseConnections / databaseLimit * 100 : undefined;
    const redisPoolRequests = (data?.redis.pool.hits || 0) + (data?.redis.pool.misses || 0);
    const redisPoolHitRate = redisPoolRequests ? (data?.redis.pool.hits || 0) / redisPoolRequests * 100 : 0;

    return (
        <AdminPageFrame
            title={translate("adminPages.settings.systemPerformancePage.systemPerformance")}
            description={translate("adminPages.settings.systemPerformancePage.aCompactViewOfTheHostDatabaseRedisCanvasAgent")}
            scroll
            actions={<><label className="admin-performance-auto"><Switch size="small" checked={autoRefresh} onChange={setAutoRefresh} /><span>{translate("adminPages.settings.systemPerformancePage.refreshEvery15Seconds")}</span></label><Button icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void load(false)}>{translate("common.refresh")}</Button></>}
        >
            <div className="admin-settings-stack admin-system-performance">
                {loadError ? <div className="admin-performance-alert" role="alert"><AlertTriangle className="size-4" /><span>{translate("adminPages.settings.systemPerformancePage.refreshFailedTheFollowingIsTheLastCollectedSnapshotNot")}{loadError}</span><Button size="small" onClick={() => void load(false)}>{translate("common.retry")}</Button></div> : null}
                <div className="admin-performance-statusbar">
                    <div><AdminStatusBadge label={loadError ? translate("adminPages.settings.systemPerformancePage.snapshotExpired") : data.status === "healthy" ? translate("adminPages.settings.systemPerformancePage.systemHealthy") : translate("adminPages.settings.systemPerformancePage.someServicesDegraded")} tone={loadError ? "warning" : data.status === "healthy" ? "success" : "warning"} /><span>{translate("adminPages.settings.systemPerformancePage.collectedAt")} {new Date(data.collectedAt).toLocaleString(currentLocale(), { hour12: false })}</span></div>
                    <span>{translate("adminPages.settings.systemPerformancePage.processUptime")} {formatDuration(data?.host.uptimeSeconds)}</span>
                </div>

                <section className="admin-performance-kpis" aria-label={translate("adminPages.settings.systemPerformancePage.corePerformanceMetrics")}>
                    <PerformanceKpi icon={<MemoryStick className="size-4" />} label={memoryPercent !== undefined ? translate("adminPages.settings.systemPerformancePage.systemMemory") : translate("adminPages.settings.systemPerformancePage.processHeapMemory")} value={memoryPercent !== undefined ? `${memoryPercent.toFixed(1)}%` : formatBytes(data?.memory.heapAllocBytes)} detail={memoryPercent !== undefined ? `${formatBytes(data?.memory.usedBytes)} / ${formatBytes(data?.memory.totalBytes)}` : translate("adminPages.settings.systemPerformancePage.goReserved", { v0: String(formatBytes(data?.memory.heapSysBytes)) })} percent={memoryPercent} />
                    <PerformanceKpi icon={<HardDrive className="size-4" />} label={translate("adminPages.settings.systemPerformancePage.dataDisk")} value={data?.disk.available ? `${data.disk.usagePercent.toFixed(1)}%` : translate("adminPages.settings.systemPerformancePage.unavailable")} detail={data?.disk.available ? `${formatBytes(data.disk.usedBytes)} / ${formatBytes(data.disk.totalBytes)}` : translate("adminPages.settings.systemPerformancePage.unableToReadFilesystemMetrics")} percent={data?.disk.available ? data.disk.usagePercent : undefined} />
                    <PerformanceKpi icon={<Database className="size-4" />} label={data?.database.driver === "postgres" ? translate("adminPages.settings.systemPerformancePage.postgreSQLConnections") : translate("adminPages.settings.systemPerformancePage.databaseConnections")} value={`${databaseConnections}${databaseLimit ? ` / ${databaseLimit}` : ""}`} detail={`${data?.database.driver || "--"} · ${data?.database.latencyMs || 0} ms`} percent={databasePercent} />
                    <PerformanceKpi icon={<Wifi className="size-4" />} label="Redis" value={data?.redis.connected ? formatBytes(data.redis.usedMemoryBytes) : data?.redis.mode === "local" ? translate("adminPages.settings.systemPerformancePage.localMode") : translate("adminPages.settings.systemPerformancePage.connectionError")} detail={data?.redis.connected ? `${formatNumber(data.redis.keys)} keys · ${formatNumber(data.redis.opsPerSecond)} ops/s` : data?.redis.statusMessage || translate("adminPages.settings.systemPerformancePage.notConnected")} />
                </section>

                <div className="admin-performance-grid">
                    <SettingsSectionCard layout="stacked" icon={<Server className="size-4" />} title={translate("adminPages.settings.systemPerformancePage.serverAndProcess")} description={translate("adminPages.settings.systemPerformancePage.operatingSystemRuntimeAndCurrentProcessSnapshot")} status={{ label: data?.disk.writable ? translate("adminPages.settings.systemPerformancePage.dataDirectoryWritable") : translate("adminPages.settings.systemPerformancePage.dataDirectoryNotWritable"), color: data?.disk.writable ? "success" : "error" }}>
                        <FactGrid>
                            <Fact label={translate("adminPages.settings.systemPerformancePage.host")} value={data?.host.hostname || translate("adminPages.settings.systemPerformancePage.unidentified")} mono />
                            <Fact label={translate("account.settings.models.scopeSystem")} value={`${data?.host.os || "--"} / ${data?.host.arch || "--"}`} />
                            <Fact label="CPU" value={translate("adminPages.settings.systemPerformancePage.logicalCPUsGOMAXPROCS", { v0: String(data?.host.cpuCores || 0), v1: String(data?.host.gomaxprocs || 0) })} />
                            <Fact label={translate("adminPages.settings.systemPerformancePage.load1515")} value={data?.host.loadAverageAvailable ? data.host.loadAverage.map((value) => value.toFixed(2)).join(" / ") : translate("adminPages.settings.systemPerformancePage.notProvidedOnThisPlatform")} mono />
                            <Fact label={translate("adminPages.settings.systemPerformancePage.process")} value={`PID ${data?.host.processId || 0} · ${formatNumber(data?.host.goroutines)} goroutines`} />
                            <Fact label={translate("nav.tools.tasks")} value={translate("adminPages.settings.systemPerformancePage.workersRunning", { v0: String(formatNumber(data?.host.activeWorkerTasks)) })} />
                            <Fact label={translate("adminPages.settings.systemPerformancePage.build")} value={`${data?.build.version || "dev"} · ${data?.build.goVersion || "--"}`} />
                            <Fact label={translate("adminPages.settings.systemPerformancePage.commit")} value={(data?.build.commit || "unknown").slice(0, 12)} mono />
                        </FactGrid>
                        <div className="admin-performance-submetrics">
                            <div><span>Heap Alloc</span><strong>{formatBytes(data?.memory.heapAllocBytes)}</strong></div>
                            <div><span>Go Sys</span><strong>{formatBytes(data?.memory.sysBytes)}</strong></div>
                            <div><span>Heap Objects</span><strong>{formatNumber(data?.memory.heapObjects)}</strong></div>
                            <div><span>{translate("adminPages.settings.systemPerformancePage.gCCount")}</span><strong>{formatNumber(data?.memory.gcCount)}</strong></div>
                        </div>
                    </SettingsSectionCard>

                    <div className="admin-performance-side-stack">
                        <SettingsSectionCard layout="stacked" icon={<Database className="size-4" />} title={translate("adminPages.settings.systemPerformancePage.database")} description={translate("adminPages.settings.systemPerformancePage.connectionPoolSchemaVersionAndInternalDatabaseStatistics")} status={{ label: data?.database.connected ? translate("adminPages.settings.systemPerformancePage.connected") : translate("adminPages.settings.systemPerformancePage.connectionError"), color: data?.database.connected ? "success" : "error" }}>
                            <FactGrid>
                                <Fact label={translate("adminPages.settings.systemPerformancePage.driver")} value={data?.database.driver === "postgres" ? "PostgreSQL" : data?.database.driver || translate("adminPages.settings.systemPerformancePage.unknown")} />
                                <Fact label={translate("adminPages.settings.systemPerformancePage.schemaVersion")} value={`${data?.database.schema.current || 0} / ${data?.database.schema.expected || 0} ${data?.database.schema.ready ? translate("adminPages.settings.systemPerformancePage.ready") : translate("adminPages.settings.systemPerformancePage.pendingCheck")}`} />
                                <Fact label={translate("adminPages.settings.systemPerformancePage.databaseSize")} value={formatBytes(data?.database.databaseBytes)} />
                                <Fact label={translate("adminPages.settings.systemPerformancePage.connectionPool")} value={translate("adminPages.settings.systemPerformancePage.inUseIdleWaits", { v0: String(data?.database.pool.inUse || 0), v1: String(data?.database.pool.idle || 0), v2: String(data?.database.pool.waitCount || 0) })} />
                                {data?.database.postgres ? <><Fact label={translate("canvasA.assetView.version")} value={data.database.postgres.serverVersion || translate("adminPages.settings.systemPerformancePage.unknown")} mono /><Fact label={translate("adminPages.settings.systemPerformancePage.cacheHits")} value={`${(data.database.postgres.cacheHitRate || 0).toFixed(2)}%`} /><Fact label={translate("adminPages.settings.systemPerformancePage.transactionsRollbacks")} value={`${formatNumber(data.database.postgres.transactions)} / ${formatNumber(data.database.postgres.rollbacks)}`} /><Fact label={translate("adminPages.settings.systemPerformancePage.temporaryFilesDeadlocks")} value={`${formatNumber(data.database.postgres.tempFiles)} / ${formatNumber(data.database.postgres.deadlocks)}`} /></> : <Fact label={translate("adminPages.settings.systemPerformancePage.postgreSQLMetrics")} value={translate("adminPages.settings.systemPerformancePage.usingSQLiteNotApplicable")} />}
                            </FactGrid>
                        </SettingsSectionCard>

                        <SettingsSectionCard layout="stacked" icon={<Activity className="size-4" />} title="Redis" description={translate("adminPages.settings.systemPerformancePage.memoryClientsHitRatesAndConnectionPool")} status={{ label: data?.redis.connected ? translate("adminPages.settings.systemPerformancePage.connected") : data?.redis.mode === "local" ? translate("adminPages.settings.systemPerformancePage.localFallback") : translate("adminPages.settings.systemPerformancePage.connectionError"), color: data?.redis.connected ? "success" : data?.redis.mode === "local" ? "warning" : "error" }}>
                            <FactGrid>
                                <Fact label={translate("adminPages.settings.systemPerformancePage.modeVersion")} value={data?.redis.connected ? `Redis ${data.redis.version || translate("adminPages.settings.systemPerformancePage.unknown")}` : data?.redis.statusMessage || translate("account.layout.oss.cdnAuthNone")} />
                                <Fact label={translate("adminPages.settings.systemPerformancePage.uptime")} value={data?.redis.connected ? formatDuration(data.redis.uptimeSeconds) : "--"} />
                                <Fact label={translate("adminPages.settings.systemPerformancePage.peakMemory")} value={data?.redis.connected ? formatBytes(data.redis.peakMemoryBytes) : "--"} />
                                <Fact label={translate("adminPages.settings.systemPerformancePage.evictionPolicy")} value={data?.redis.maxMemoryPolicy || translate("account.layout.oss.cdnAuthNone")} mono />
                                <Fact label={translate("adminPages.settings.systemPerformancePage.clients")} value={translate("adminPages.settings.systemPerformancePage.connectionsBlocked", { v0: String(formatNumber(data?.redis.clients)), v1: String(formatNumber(data?.redis.blockedClients)) })} />
                                <Fact label={translate("adminPages.settings.systemPerformancePage.keyHitRate")} value={`${(data?.redis.hitRate || 0).toFixed(2)}%`} />
                                <Fact label={translate("adminPages.settings.systemPerformancePage.clientPoolHits")} value={translate("adminPages.settings.systemPerformancePage.connections", { v0: String(redisPoolHitRate.toFixed(2)), v1: String(formatNumber(data?.redis.pool.totalConnections)) })} />
                                <Fact label={translate("adminPages.settings.systemPerformancePage.timeoutsEvictions")} value={`${formatNumber(data?.redis.pool.timeouts)} / ${formatNumber(data?.redis.evictedKeys)}`} />
                            </FactGrid>
                        </SettingsSectionCard>
                    </div>
                </div>

                {(data.agents || []).map((agent) => {
                    const draft = agentLimitDraft ?? agent.configuredLimit;
                    return <SettingsSectionCard key={agent.id} layout="stacked" icon={<Orbit className="size-4" />} title={translate("adminPages.settings.systemPerformancePage.canvasAgentService")} description={translate("adminPages.settings.systemPerformancePage.eachActiveConversationOccupiesOneSlotWaitingForApprovalDoes")} status={{ label: agent.healthy ? translate("adminPages.settings.systemPerformancePage.serviceReachable") : translate("adminPages.settings.systemPerformancePage.serviceUnreachable"), color: agent.healthy ? "success" : "error" }} footer={<><span className="admin-performance-cache-note"><Gauge className="size-3.5" />{translate("adminPages.settings.systemPerformancePage.newInstallationsDefaultTo30UsuallyNoChangeIsNeeded")}</span><span style={{ display: "flex", gap: 8, alignItems: "center" }}><InputNumber min={1} max={64} precision={0} value={draft} onChange={(value) => setAgentLimitDraft(typeof value === "number" ? value : draft)} /><Button type="primary" loading={savingAgentLimit} disabled={draft === agent.configuredLimit} onClick={() => {
                        setSavingAgentLimit(true);
                        void updateAgentSessionLimit(draft).then(() => {
                            message.success(translate("adminPages.settings.systemPerformancePage.agentConcurrentConversationLimitApplied"));
                            setAgentLimitDraft(null);
                            return load(false);
                        }).catch((error: unknown) => {
                            message.error(error instanceof Error ? error.message : translate("adminPages.settings.systemPerformancePage.failedToSaveAgentLimit"));
                        }).finally(() => setSavingAgentLimit(false));
                    }}>{translate("adminPages.settings.systemPerformancePage.saveLimit")}</Button></span></>}>
                        <FactGrid>
                            <Fact label={translate("adminPages.settings.systemPerformancePage.service")} value={agent.name} />
                            <Fact label={translate("adminPages.settings.systemPerformancePage.runtimeLocation")} value={agent.mode === "remote" ? translate("adminPages.settings.systemPerformancePage.standaloneService") : translate("adminPages.settings.systemPerformancePage.backendProcess")} />
                            <Fact label={translate("adminPages.settings.systemPerformancePage.address")} value={agent.endpoint} mono />
                            <Fact label={translate("adminPages.settings.systemPerformancePage.activeLimit")} value={`${formatNumber(agent.active)} / ${formatNumber(agent.limit)}`} />
                            <Fact label={translate("adminPages.settings.systemPerformancePage.queued")} value={formatNumber(agent.queued)} />
                            <Fact label={translate("adminPages.settings.systemPerformancePage.savedLimit")} value={formatNumber(agent.configuredLimit)} />
                            <Fact label={translate("library.ark.virtualFlow.descriptionLabel")} value={agent.statusMessage || translate("adminPages.settings.systemPerformancePage.increaseTheLimitOnThisMachineNoAdditionalContainersAre")} />
                        </FactGrid>
                    </SettingsSectionCard>;
                })}

                <SettingsSectionCard layout="stacked" icon={<ShieldCheck className="size-4" />} title={translate("adminPages.settings.systemPerformancePage.cacheMaintenance")} description={translate("adminPages.settings.systemPerformancePage.clearsOnlyRuntimeStateThatCanBeSafelyRebuiltRetaining")} status={<AdminStatusBadge label={translate("adminPages.settings.systemPerformancePage.allowlistedCleanup")} tone="success" />} footer={<><span className="admin-performance-cache-note"><Gauge className="size-3.5" />{translate("adminPages.settings.systemPerformancePage.rateLimitsAndRouteHealthAreRecalculatedAfterClearing")}</span><Button danger icon={<Trash2 className="size-4" />} loading={clearing} onClick={requestClear}>{translate("adminPages.settings.systemPerformancePage.clearRuntimeCache2")}</Button></>}>
                    <div className="admin-performance-cache-groups">
                        {(data?.redis.cacheGroups || []).map((group) => <div key={group.id}><span>{group.label}</span><strong>{formatNumber(group.keys)}</strong><small>keys</small></div>)}
                    </div>
                    <div className="admin-performance-safety"><strong>{translate("adminPages.settings.systemPerformancePage.alwaysRetained")}</strong><span>{translate("adminPages.settings.systemPerformancePage.userAndTaskData")}</span><span>{translate("adminPages.settings.systemPerformancePage.assetsAndModelSettings")}</span><span>{translate("adminPages.settings.systemPerformancePage.activeConcurrencyLeases")}</span><span>{translate("adminPages.settings.systemPerformancePage.crossInstanceCatalogVersion")}</span></div>
                </SettingsSectionCard>
            </div>
        </AdminPageFrame>
    );
}
