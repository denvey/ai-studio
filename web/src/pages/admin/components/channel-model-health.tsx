import { useCallback, useEffect, useRef, useState } from "react";

import { AdminTooltip } from "@/pages/admin/ui/controls";
import { getAdminChannelModelHealth, type AdminChannelModelHealth } from "@/services/api/wallet";
import { cn } from "@/lib/utils";
import { currentLocale, translate } from "@/i18n";

export function channelModelHealthKey(channelId: string, modelKey: string) {
    return `${channelId}\u0000${modelKey}`;
}

/** 读取模型稳定性；channelId 为空时读取全部系统渠道。读取失败不阻塞列表，只在单元格里显示“暂无数据”。 */
export function useChannelModelHealth(channelId?: string) {
    const [health, setHealth] = useState<Map<string, AdminChannelModelHealth>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const sequence = useRef(0);

    const reload = useCallback(async () => {
        const current = ++sequence.current;
        setLoading(true);
        setError("");
        try {
            const result = await getAdminChannelModelHealth(channelId);
            if (current !== sequence.current) return;
            setHealth(new Map(result.items.map((item) => [channelModelHealthKey(item.channelId, item.modelKey), item])));
        } catch (cause) {
            if (current !== sequence.current) return;
            setHealth(new Map());
            setError(cause instanceof Error ? cause.message : translate("admin.channelModelHealth.failedToLoadModelReliability"));
        } finally {
            if (current === sequence.current) setLoading(false);
        }
    }, [channelId]);

    useEffect(() => {
        void reload();
        return () => {
            sequence.current += 1;
        };
    }, [reload]);

    return { health, loading, error, reload };
}

export function healthTone(rate: number | null | undefined, samples: number) {
    if (rate === null || rate === undefined || samples === 0) return "neutral" as const;
    if (rate >= 0.95) return "success" as const;
    if (rate >= 0.8) return "warning" as const;
    return "error" as const;
}

/** 24 小时成功率 + 最近 10 次结果（左旧右新）+ 调用次数；悬停显示 7 天成功率、P95 和最近一次失败。 */
export function ChannelModelHealthCell({ health, loading }: { health?: AdminChannelModelHealth; loading?: boolean }) {
    if (loading && !health) return <span className="text-xs text-foreground/35">{translate("admin.channelModelHealth.loading")}</span>;
    if (!health || health.requests7d === 0) return <span className="text-xs text-foreground/35">{translate("admin.channelModelHealth.noRequestsInThePast7Days")}</span>;
    const rate = health.successRate24h;
    const tone = healthTone(rate, health.requests24h);
    const slots = Array.from({ length: 10 }, (_, index) => {
        const offset = 10 - health.recentResults.length;
        return index < offset ? null : health.recentResults[index - offset];
    });
    const detail = (
        <div className="space-y-1 text-xs">
            <div>
                {translate("admin.channelModelHealth.past24Hours")}
                {health.requests24h} {translate("admin.channelModelHealth.requestsSuccessful")} {health.succeeded24h}
                {translate("admin.channelModelHealth.failed")} {health.failed24h}
            </div>
            <div>
                {translate("admin.channelModelHealth.item7DaySuccessRate")}
                {formatRate(health.successRate7d)}（{health.requests7d} {translate("admin.channelModelHealth.requests")}
            </div>
            <div>
                {translate("admin.channelModelHealth.item24HourP95Latency")}
                {health.requests24h ? formatDuration(health.p95DurationMs24h) : "--"}
            </div>
            {health.lastFailedAt ? (
                <div>
                    {translate("admin.channelModelHealth.latestFailure")}
                    {new Date(health.lastFailedAt).toLocaleString(currentLocale(), { hour12: false })}
                    {health.lastErrorCode ? ` · ${health.lastErrorCode}` : ""}
                </div>
            ) : null}
            <div className="opacity-70">{translate("admin.channelModelHealth.includesModelGenerationRequestsOnlySquaresShowTheLast10")}</div>
        </div>
    );
    return (
        <AdminTooltip title={detail}>
            <div className="admin-model-health" data-tone={tone} tabIndex={0} aria-label={translate("admin.channelModelHealth.item24HourSuccessRateAcrossRequests", { v0: String(formatRate(rate)), v1: String(health.requests24h) })}>
                <div className="admin-model-health-head">
                    <strong>{health.requests24h ? formatRate(rate) : translate("admin.channelModelHealth.noRequestsIn24h")}</strong>
                    <span>{health.requests24h ? translate("admin.channelModelHealth.calls", { v0: String(health.requests24h) }) : translate("admin.channelModelHealth.item7Days", { v0: String(formatRate(health.successRate7d)) })}</span>
                </div>
                <div className="admin-model-health-track" aria-hidden="true">
                    {slots.map((value, index) => (
                        <span key={index} className={cn("admin-model-health-pill", value === true && "is-success", value === false && "is-failed")} />
                    ))}
                </div>
            </div>
        </AdminTooltip>
    );
}

export function formatRate(rate: number | null | undefined) {
    return rate === null || rate === undefined ? "--" : `${(rate * 100).toFixed(rate >= 0.995 || rate === 0 ? 0 : 1)}%`;
}

function formatDuration(value: number) {
    if (!value) return "--";
    return value >= 1000 ? translate("admin.channelModelHealth.s", { v0: String((value / 1000).toFixed(1)) }) : `${value} ms`;
}
