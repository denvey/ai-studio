import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "antd";
import { AlertCircle, ChevronDown, ChevronRight, ChevronUp, Loader2, RotateCcw } from "lucide-react";

import { listDramaJobs, type DramaJob, type DramaSummary } from "@/services/api/drama";

import { formatCredits } from "../drama-shared";
import { formatJobTime, JOB_KIND_LABEL, JobDetailModal, JobStatusIcon } from "./job-detail";
import { dramaKeys } from "./use-studio";
import { translate } from "@/i18n";

type JobFilter = "all" | "active" | "failed";

export function QueueBar({ projectId, summary, retrying, onRetry, onJump }: { projectId: string; summary: DramaSummary; retrying: boolean; onRetry: () => void; onJump: (job: DramaJob) => void }) {
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState<JobFilter>("all");
    const [detailJob, setDetailJob] = useState<DramaJob>();
    const { jobCounts, production } = summary;
    const failedItems = summary.inbox.filter((item) => item.kind === "segment_failed" || item.kind === "cast_failed" || item.kind === "episode_error").length;
    const jobsQuery = useQuery({ queryKey: dramaKeys.jobs(projectId), queryFn: ({ signal }) => listDramaJobs(projectId, 120, signal), enabled: open, refetchInterval: open ? 3_000 : false });
    const jobs = useMemo(
        () => (jobsQuery.data?.jobs || []).filter((job) => filter === "all" || (filter === "failed" ? job.status === "failed" || Boolean(job.error && job.status === "queued") : job.status === "running" || job.status === "queued")),
        [filter, jobsQuery.data],
    );
    const budget = production.budgetMicrocredits;
    const held = production.heldMicrocredits || 0;
    // 预算进度与后端预算判断同一口径：已扣费加未结算订单的冻结额。
    const committed = production.spentMicrocredits + held;
    const usage = budget ? Math.min(1, committed / budget) : 0;
    return (
        <div className="drama-queue">
            <div className="drama-queue-bar">
                <span className={`drama-queue-stat ${(jobCounts.running || 0) > 0 ? "is-run" : ""}`}>
                    {(jobCounts.running || 0) > 0 ? <Loader2 className="size-3.5 animate-spin" /> : <span className="drama-dot opacity-40" />}
                    {translate("library.tasks.filter.active")} <b>{jobCounts.running || 0}</b>
                </span>
                <span className="drama-queue-stat">
                    {translate("drama.studio.queueBar.queued")} <b>{jobCounts.queued || 0}</b>
                </span>
                <span className="drama-queue-stat">
                    {translate("library.tasks.filter.succeeded")} <b>{jobCounts.succeeded || 0}</b>
                </span>
                {failedItems ? (
                    <span className="drama-queue-stat is-err">
                        <AlertCircle className="size-3.5" />
                        {translate("drama.studio.queueBar.awaitingRetry")} <b>{failedItems}</b>
                    </span>
                ) : null}
                {failedItems ? (
                    <Button size="small" type="text" icon={<RotateCcw className="size-3.5" />} loading={retrying} onClick={onRetry}>
                        {translate("drama.studio.queueBar.retryAll")}
                    </Button>
                ) : null}
                <span className="drama-queue-budget">
                    {budget ? (
                        <span className="drama-queue-meter">
                            <span className={usage >= 0.9 ? "is-warn" : ""} style={{ width: `${Math.max(usage * 100, committed ? 3 : 0)}%` }} />
                        </span>
                    ) : null}
                    {translate("drama.studio.queueBar.used")} <b>{formatCredits(production.spentMicrocredits)}</b>
                    {held > 0 ? (
                        <>
                            {" "}
                            {translate("drama.studio.queueBar.reserved")} {formatCredits(held)}
                        </>
                    ) : null}
                    {budget ? (
                        <>
                            {" "}
                            / {formatCredits(budget)} {translate("shell.credits")}
                        </>
                    ) : (
                        " " + translate("drama.studio.queueBar.creditsUnlimitedBudget")
                    )}
                </span>
                <button type="button" className="drama-queue-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                    {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                    {open ? translate("drama.studio.queueBar.collapseQueue") : translate("drama.studio.queueBar.expandQueue")}
                </button>
            </div>
            {open ? (
                <div className="drama-queue-panel">
                    <div className="drama-queue-filters" role="tablist" aria-label={translate("drama.studio.queueBar.queueFilters")}>
                        {(
                            [
                                ["all", translate("canvasA.toolPicker.all")],
                                ["active", translate("canvasB.mediaVersion.inProgress")],
                                ["failed", translate("library.assets.batch.failed")],
                            ] as const
                        ).map(([key, label]) => (
                            <button key={key} type="button" role="tab" className="drama-filter" aria-pressed={filter === key} aria-selected={filter === key} onClick={() => setFilter(key)}>
                                {label}
                            </button>
                        ))}
                        <span className="ml-auto drama-queue-hint">{translate("drama.studio.queueBar.selectARowToViewRequestDetails")}</span>
                    </div>
                    <div className="drama-queue-list thin-scrollbar" role="list">
                        {jobs.map((job) => (
                            <button key={job.id} type="button" role="listitem" className={`drama-job is-${job.status}`} onClick={() => setDetailJob(job)}>
                                <JobStatusIcon status={job.status} />
                                <span className="drama-job-kind">{JOB_KIND_LABEL[job.kind]}</span>
                                <span className="drama-job-label" title={job.providerStage ? `${job.label} · ${job.providerStage}` : job.label}>
                                    {job.label}
                                    {job.status === "running" && job.providerStage ? <span className="text-foreground/50"> · {job.providerStage}</span> : null}
                                </span>
                                {job.error && (job.status === "failed" || job.status === "queued") ? (
                                    <span className="drama-job-error" title={job.error}>
                                        {job.error}
                                    </span>
                                ) : (
                                    <span className="drama-job-error is-wait" title={job.status === "queued" ? job.wait : undefined}>
                                        {job.status === "queued" ? job.wait || "" : ""}
                                    </span>
                                )}
                                <span className="drama-job-time">{formatJobTime(job.finishedAt || job.startedAt || job.createdAt)}</span>
                                <span className="drama-job-cost">{job.costMicrocredits ? translate("drama.studio.queueBar.credits", { v0: String(formatCredits(job.costMicrocredits)) }) : ""}</span>
                                <ChevronRight className="drama-job-chevron size-3.5" />
                            </button>
                        ))}
                        {jobsQuery.isLoading ? (
                            <div className="drama-queue-empty">{translate("drama.studio.queueBar.loadingQueue")}</div>
                        ) : !jobs.length ? (
                            <div className="drama-queue-empty">
                                {filter === "failed" ? translate("drama.studio.queueBar.noFailedJobs") : filter === "active" ? translate("drama.studio.queueBar.noJobsInProgress") : translate("drama.studio.queueBar.noSchedulingHistoryYet")}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
            <JobDetailModal projectId={projectId} job={detailJob} onClose={() => setDetailJob(undefined)} onLocate={onJump} />
        </div>
    );
}
