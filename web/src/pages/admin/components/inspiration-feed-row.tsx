import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button } from "antd";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";

import { RelativeTime } from "@/components/ui/product/relative-time";
import { Switch } from "@/pages/admin/ui/controls";
import { getAdminInspirationFeed, syncAdminInspirationFeed, updateAdminInspirationFeed, type AdminInspirationFeedStatus } from "@/services/api/inspiration-feed";
import { invalidateInspirationCatalog } from "@/services/inspiration-catalog";
import { AdminStatusBadge } from "./admin-ui";
import { currentLocale, translate } from "@/i18n";

const QUERY_KEY = ["admin", "inspiration-feed"] as const;
const SOURCE_NAMES: Record<string, string> = { youmind: "YouMind", seedance: "awesome-seedance" };

/**
 * 灵感上新：后端定时从上游同步中文提示词，补在灵感大厅的内置目录之后。
 * 开关与同步走独立接口，不进「功能开放」的整包保存。
 */
export function InspirationFeedRow() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState<"toggle" | "sync" | null>(null);
    const query = useQuery({ queryKey: QUERY_KEY, queryFn: ({ signal }) => getAdminInspirationFeed(signal) });
    const status = query.data;

    const apply = (next: AdminInspirationFeedStatus) => {
        queryClient.setQueryData(QUERY_KEY, next);
        invalidateInspirationCatalog();
    };

    const toggle = async (enabled: boolean) => {
        setBusy("toggle");
        try {
            apply(await updateAdminInspirationFeed({ enabled }));
            message.success(enabled ? translate("admin.inspirationFeedRow.inspirationUpdatesEnabledAutomaticSyncingWillBeginShortly") : translate("admin.inspirationFeedRow.inspirationUpdatesDisabledUsersWillSeeOnlyTheBuiltIn"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.inspirationFeedRow.failedToSaveInspirationUpdateSettings"));
        } finally {
            setBusy(null);
        }
    };

    const sync = async () => {
        setBusy("sync");
        try {
            const next = await syncAdminInspirationFeed();
            apply(next);
            const created = next.sources.reduce((sum, item) => sum + item.created, 0);
            if (next.lastError) message.warning(translate("admin.inspirationFeedRow.someSourcesFailedToSync", { v0: String(next.lastError) }));
            else message.success(created ? translate("admin.inspirationFeedRow.syncCompleteAddedEntries", { v0: String(created) }) : translate("admin.inspirationFeedRow.syncCompleteNoNewUpstreamContent"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.inspirationFeedRow.failedToSyncInspirationUpdates"));
            void query.refetch();
        } finally {
            setBusy(null);
        }
    };

    const enabled = status?.enabled ?? false;
    return (
        <article id="admin-feature-inspirationFeed" className={`afp-row${enabled ? "" : " is-off"}`}>
            <div className="afp-row-main">
                <span className="afp-row-icon">
                    <Sparkles className="size-4" aria-hidden="true" />
                </span>
                <div className="afp-row-copy">
                    <div className="afp-row-title">
                        <strong>{translate("admin.inspirationFeedRow.inspirationUpdates")}</strong>
                        <span className="afp-location">{translate("admin.inspirationFeedRow.creationHomeInspiration")}</span>
                    </div>
                    <p>{translate("admin.inspirationFeedRow.every")} {status?.intervalHours ?? 6} {translate("admin.inspirationFeedRow.hoursSyncNewChineseLanguagePromptsFromYouMindAndAwesome")}</p>
                    {query.isError ? (
                        <p className="afp-row-warning" role="alert">
                            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                            <span>{query.error instanceof Error ? query.error.message : translate("admin.inspirationFeedRow.failedToLoadInspirationUpdateStatus")}</span>
                        </p>
                    ) : status ? (
                        <>
                            <p>
                                {translate("admin.inspirationFeedRow.collected")} {status.total.toLocaleString(currentLocale())} {translate("account.layout.pagination.item")}
                                {status.lastAttemptAt ? (
                                    <>
                                        {(" " + translate("admin.inspirationFeedRow.lastSynced") + " ")}
                                        <RelativeTime value={status.lastAttemptAt} />
                                        {status.sources.length ? `（${status.sources.map((item) => translate("admin.inspirationFeedRow.added", { v0: String(SOURCE_NAMES[item.sourceId] ?? item.sourceId), v1: String(item.created) })).join("，")}）` : ""}
                                    </>
                                ) : enabled ? (
                                    (" " + translate("admin.inspirationFeedRow.waitingForFirstSyncAbout2MinutesAfterServiceStartup"))
                                ) : null}
                                {translate("admin.inspirationFeedRow.entriesDuplicatedInTheBuiltInCatalogAreAutomaticallyDeduplicated")}
                            </p>
                            {status.lastError ? (
                                <p className="afp-row-warning" role="alert">
                                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                                    <span>{status.lastError}</span>
                                </p>
                            ) : null}
                        </>
                    ) : null}
                </div>
            </div>
            <div className="afp-row-control">
                <AdminStatusBadge label={!status ? translate("account.settings.diagnostics.loading") : enabled ? translate("admin.inspirationFeedRow.enabled") : translate("account.feedback.status.closed")} tone={enabled ? "success" : "neutral"} />
                <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={busy === "sync"} disabled={!enabled || busy !== null} onClick={() => void sync()}>
                    {translate("admin.inspirationFeedRow.syncNow")}
                </Button>
                <Switch checked={enabled} loading={busy === "toggle"} disabled={!status || busy !== null} onChange={(checked) => void toggle(checked)} aria-label={translate("admin.inspirationFeedRow.inspirationUpdatesSavedImmediatelyWhenToggled")} />
            </div>
        </article>
    );
}
