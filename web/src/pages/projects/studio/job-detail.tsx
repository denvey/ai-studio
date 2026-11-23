import { useQuery } from "@tanstack/react-query";
import { App, Button } from "antd";
import { AntTooltip as Tooltip } from "@/components/ui/base/tooltip/ant-tooltip";
import { AlertCircle, CheckCircle2, Clock3, Copy, Crosshair, Loader2, XCircle } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal";
import { getDramaJob, type DramaJob, type DramaJobAttempt, type DramaJobTask } from "@/services/api/drama";

import { formatCredits, MediaThumb, useResourceMediaUrl } from "../drama-shared";
import { currentLocale, translate } from "@/i18n";

export const JOB_KIND_LABEL: Record<DramaJob["kind"], string> = {
    bible: translate("drama.studio.jobDetail.storyBible"),
    plan: translate("drama.studio.jobDetail.episodePlanning"),
    cast_image: translate("canvasPage.connection.referenceImage"),
    script: translate("drama.studio.jobDetail.scriptAndStoryboard"),
    segment_prompt: translate("drama.studio.jobDetail.segmentVideoPrompts"),
    segment_video: translate("drama.studio.jobDetail.segmentVideos"),
    render: translate("drama.studio.jobDetail.renderFinalCut"),
};

export const JOB_STATUS_LABEL: Record<string, string> = {
    queued: translate("canvasPage.taskStatus.queued"),
    running: translate("canvasB.mediaVersion.generating"),
    succeeded: translate("library.tasks.filter.succeeded"),
    failed: translate("library.assets.batch.failed"),
    canceled: translate("drama.studio.jobDetail.cancelled"),
    cancelled: translate("drama.studio.jobDetail.cancelled"),
    rejected: translate("drama.studio.jobDetail.submissionRejected"),
};

export function JobStatusIcon({ status }: { status: string }) {
    if (status === "running") return <Loader2 className="size-3.5 animate-spin text-[var(--workspace-accent)]" />;
    if (status === "succeeded") return <CheckCircle2 className="size-3.5 text-[var(--status-success)]" />;
    if (status === "failed" || status === "rejected") return <XCircle className="size-3.5 text-[var(--status-error)]" />;
    if (status === "canceled" || status === "cancelled") return <XCircle className="size-3.5 opacity-35" />;
    return <Clock3 className="size-3.5 opacity-50" />;
}

export function formatJobTime(value?: string) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return date.toLocaleString(currentLocale(), sameDay ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function elapsed(start?: string, end?: string) {
    if (!start || !end) return "";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "";
    const seconds = Math.round(ms / 1000);
    return seconds >= 60 ? translate("drama.studio.jobDetail.mS", { v0: String(Math.floor(seconds / 60)), v1: String(seconds % 60) }) : translate("drama.studio.jobDetail.s", { v0: String(seconds) });
}

const PARAM_LABEL: Record<string, string> = {
    size: translate("canvasA.assetView.size"),
    imageResolution: translate("library.tasks.params.resolution"),
    quality: translate("drama.studio.jobDetail.quality"),
    count: translate("drama.studio.jobDetail.imageCount"),
    videoSeconds: translate("drama.studio.jobDetail.durationSeconds"),
    vquality: translate("drama.studio.jobDetail.sharpness"),
    videoGenerateAudio: translate("drama.studio.jobDetail.generateAudioWithVideo"),
};

export function JobDetailModal({ projectId, job, onClose, onLocate }: { projectId: string; job?: DramaJob; onClose: () => void; onLocate: (job: DramaJob) => void }) {
    const query = useQuery({
        queryKey: ["drama", projectId, "job", job?.id],
        queryFn: ({ signal }) => getDramaJob(projectId, job!.id, signal),
        enabled: Boolean(job),
        refetchInterval: (state) => (state.state.data?.job.status === "running" || state.state.data?.job.status === "queued" ? 3_000 : false),
    });
    const detail = query.data;
    const current = detail?.job || job;
    return (
        <AppModal open={Boolean(job)} onCancel={onClose} footer={null} width={760} flush title={null} centered>
            {current ? (
                <div className="drama-jobd">
                    <header className="drama-jobd-head">
                        <span className={`drama-jobd-status is-${current.status}`}>
                            <JobStatusIcon status={current.status} />
                            {JOB_STATUS_LABEL[current.status]}
                        </span>
                        <div className="min-w-0 flex-1">
                            <h3 title={current.label}>{current.label}</h3>
                            <p>
                                {JOB_KIND_LABEL[current.kind]}
                                {detail?.target ? ` · ${detail.target}` : ""}
                            </p>
                        </div>
                        {current.episodeId ? (
                            <Button
                                size="small"
                                icon={<Crosshair className="size-3.5" />}
                                onClick={() => {
                                    onLocate(current);
                                    onClose();
                                }}
                            >
                                {translate("drama.studio.jobDetail.goToShot")}
                            </Button>
                        ) : null}
                    </header>
                    <dl className="drama-jobd-facts">
                        <div>
                            <dt>{translate("drama.studio.jobDetail.queued")}</dt>
                            <dd>{formatJobTime(current.createdAt)}</dd>
                        </div>
                        <div>
                            <dt>{translate("drama.studio.jobDetail.started")}</dt>
                            <dd>{formatJobTime(current.startedAt)}</dd>
                        </div>
                        <div>
                            <dt>{translate("drama.studio.jobDetail.finished")}</dt>
                            <dd>
                                {formatJobTime(current.finishedAt)}
                                {elapsed(current.startedAt, current.finishedAt) ? (
                                    <small>
                                        {translate("drama.studio.jobDetail.elapsed")} {elapsed(current.startedAt, current.finishedAt)}
                                    </small>
                                ) : null}
                            </dd>
                        </div>
                        <div>
                            <dt>{translate("drama.studio.jobDetail.cost")}</dt>
                            <dd>
                                {current.costMicrocredits ? translate("drama.studio.jobDetail.credits", { v0: String(formatCredits(current.costMicrocredits)) }) : "0"}
                                <small>
                                    {translate("common.retry")} {current.attempt} {translate("account.settings.models.unitCall")}
                                </small>
                            </dd>
                        </div>
                    </dl>
                    <div className="drama-jobd-body thin-scrollbar">
                        {query.isLoading ? <div className="drama-jobd-empty">{translate("drama.studio.jobDetail.loadingRequestHistory")}</div> : null}
                        {detail && !detail.attempts.length ? <div className="drama-jobd-empty">{translate("drama.studio.jobDetail.noRequestsSubmittedYetWaitingInTheQueue")}</div> : null}
                        {detail?.attempts.map((attempt, index) => (
                            <AttemptCard key={`${attempt.taskId || "rejected"}-${attempt.at}`} attempt={attempt} index={detail.attempts.length - index} latest={index === 0} />
                        ))}
                    </div>
                </div>
            ) : null}
        </AppModal>
    );
}

function AttemptCard({ attempt, index, latest }: { attempt: DramaJobAttempt; index: number; latest: boolean }) {
    const { message } = App.useApp();
    const task = attempt.task;
    const copy = (text: string) =>
        void navigator.clipboard.writeText(text).then(
            () => message.success(translate("canvasB.common.copied")),
            () => message.error(translate("canvasB.common.copyFailed")),
        );
    return (
        <article className={`drama-jobd-attempt ${latest ? "is-latest" : ""}`}>
            <header>
                <span className="drama-jobd-attempt-index">
                    {translate("drama.studio.jobDetail.no")} {index} {translate("account.settings.models.unitCall")}
                </span>
                <JobStatusIcon status={attempt.status} />
                <strong>{JOB_STATUS_LABEL[attempt.status] || attempt.status}</strong>
                {task?.stage && attempt.status !== "succeeded" ? <span className="drama-jobd-muted">{task.stage}</span> : null}
                <span className="ml-auto drama-jobd-muted">
                    {formatJobTime(task?.createdAt || attempt.at)}
                    {elapsed(task?.startedAt, task?.completedAt) ? ` · ${elapsed(task?.startedAt, task?.completedAt)}` : ""}
                </span>
            </header>
            <dl className="drama-jobd-grid">
                <div>
                    <dt>{translate("canvasA.assetView.model")}</dt>
                    <dd title={task?.model}>{task?.modelLabel || "—"}</dd>
                </div>
                <div>
                    <dt>{translate("shell.credits")}</dt>
                    <dd>{attempt.costMicrocredits ? formatCredits(attempt.costMicrocredits) : "0"}</dd>
                </div>
                {task
                    ? Object.entries(task.params).map(([key, value]) => (
                          <div key={key}>
                              <dt>{PARAM_LABEL[key] || key}</dt>
                              <dd title={value}>{value}</dd>
                          </div>
                      ))
                    : null}
            </dl>
            {attempt.error ? (
                <div className="drama-jobd-error">
                    <AlertCircle className="size-4 shrink-0" />
                    <p>{attempt.error}</p>
                    <Tooltip title={translate("drama.studio.jobDetail.copyErrorDetails")}>
                        <Button size="small" type="text" icon={<Copy className="size-3.5" />} aria-label={translate("drama.studio.jobDetail.copyErrorDetails")} onClick={() => copy(attempt.error!)} />
                    </Tooltip>
                </div>
            ) : null}
            {task?.prompt ? (
                <details className="drama-disclosure">
                    <summary>
                        {translate("canvasA.assetView.prompt")}
                        <span className="drama-jobd-muted">
                            {task.prompt.length} {translate("drama.studio.jobDetail.characters")}
                        </span>
                        <Button
                            size="small"
                            type="text"
                            className="!ml-auto"
                            icon={<Copy className="size-3.5" />}
                            aria-label={translate("canvasA.artCritique.copyPrompt")}
                            onClick={(event) => {
                                event.preventDefault();
                                copy(task.prompt);
                            }}
                        />
                    </summary>
                    <pre className="drama-jobd-pre thin-scrollbar">{task.prompt}</pre>
                </details>
            ) : null}
            {task ? <AttemptResult task={task} /> : null}
        </article>
    );
}

function AttemptResult({ task }: { task: DramaJobTask }) {
    const ids = task.resourceIds || [];
    if (task.resultText) {
        return (
            <details className="drama-disclosure">
                <summary>
                    {translate("drama.studio.jobDetail.response")}
                    <span className="drama-jobd-muted">
                        {task.resultText.length} {translate("drama.studio.jobDetail.characters")}
                    </span>
                </summary>
                <pre className="drama-jobd-pre thin-scrollbar">{task.resultText}</pre>
            </details>
        );
    }
    if (!ids.length)
        return task.mediaStage ? (
            <p className="drama-jobd-muted">
                {translate("drama.studio.jobDetail.resultSavingStage")}
                {task.mediaStage}
            </p>
        ) : null;
    return (
        <div className="drama-jobd-results">
            {ids.map((id) =>
                task.resultMode === "video" ? (
                    <ResultVideo key={id} id={id} />
                ) : (
                    <div key={id} className="drama-jobd-thumb">
                        <MediaThumb resourceId={id} alt={translate("library.tasks.detail.generated")} />
                    </div>
                ),
            )}
        </div>
    );
}

function ResultVideo({ id }: { id: string }) {
    const url = useResourceMediaUrl(id, "playback");
    return <div className="drama-jobd-thumb is-video">{url ? <video src={url} controls playsInline preload="metadata" /> : null}</div>;
}
