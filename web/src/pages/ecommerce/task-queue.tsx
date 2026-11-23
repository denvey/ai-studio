import { Button, Popover, Progress, Segmented, Spin } from "antd";
import { CheckCircle2, Clock3 } from "lucide-react";
import { QueueIcon } from "@/components/ui/ecommerce-icons";
import { useCallback, useEffect, useState } from "react";
import { parseBackendGenerationResult } from "@/services/api/generation-task";
import { listEcommerceProjectPage, projectPlan, type EcommerceProject } from "@/services/api/ecommerce";
import { resolveResourceVariantUrl } from "@/services/api/resources";
import { listGenerationTasks, type GenerationTask } from "@/services/api/task-center";

import { translate } from "@/i18n";
type QueueRow = { project: EcommerceProject; imageId: string; index: number; task?: GenerationTask };
const finished = (task?: GenerationTask) => task?.status === "succeeded";

function taskThumbnail(task?: GenerationTask) {
    if (!task) return "";
    try {
        const output = task.status === "succeeded" ? parseBackendGenerationResult(task)?.images?.[0] : undefined;
        if (output?.storageKey) return resolveResourceVariantUrl(output.storageKey, "thumbnail");
        if (output?.dataUrl) return output.dataUrl;
    } catch {
        /* Older task results may not contain parseable JSON. */
    }
    return task.previewUrl || "";
}

/** activeCount：当前项目正在生成的图片数，按钮角标实时显示，不必先打开面板。 */
export function EcommerceTaskQueue({ onView, activeCount = 0 }: { onView: (project: EcommerceProject, imageId: string) => void; activeCount?: number }) {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<"active" | "completed">("active");
    const [rows, setRows] = useState<QueueRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const refresh = useCallback(async () => {
        if (open) setLoading(true);
        try {
            const [page, tasks] = await Promise.all([listEcommerceProjectPage(1, 50), listGenerationTasks(100)]);
            const byId = new Map(tasks.map((task) => [task.id, task]));
            const next = page.projects.flatMap((project) => (projectPlan(project)?.images || []).map((image, index) => ({ project, imageId: image.id, index, task: image.taskId ? byId.get(image.taskId) : undefined })));
            setRows(next.slice(0, 100));
            setError("");
        } catch (cause) {
            if (open) setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setLoading(false);
        }
    }, [open]);
    useEffect(() => {
        if (!open) return;
        void refresh();
        const timer = window.setInterval(() => void refresh(), 5000);
        return () => window.clearInterval(timer);
    }, [open, refresh]);
    // 关闭时也同步一次，角标能包含其他项目仍在生成的图片；当前项目数量变化时再同步。
    useEffect(() => {
        if (!open) void refresh();
    }, [activeCount]); // eslint-disable-line react-hooks/exhaustive-deps
    const active = rows.filter((row) => row.task && !["succeeded", "failed", "cancelled"].includes(row.task.status));
    const badge = Math.max(activeCount, active.length);
    const completed = rows.filter((row) => finished(row.task));
    const visible = tab === "active" ? active : completed;
    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            placement="bottomRight"
            trigger="click"
            overlayClassName="commerce-queue-popover"
            content={
                <div className="commerce-queue-panel">
                    <header>
                        <div>
                            <strong>{translate("ecommerce.taskQueue.taskQueue")}</strong>
                            <span>{translate("ecommerce.taskQueue.imageProgressForTheLatest50Projects")}</span>
                        </div>
                        <Button size="small" onClick={() => void refresh()} loading={loading}>
                            {translate("common.refresh")}
                        </Button>
                    </header>
                    <Segmented
                        block
                        size="small"
                        value={tab}
                        onChange={(value) => setTab(value as "active" | "completed")}
                        options={[
                            {
                                label: (
                                    <span className="commerce-queue-tab">
                                        {translate("canvasB.mediaVersion.inProgress")}<span className="commerce-count-badge is-neutral">{active.length}</span>
                                    </span>
                                ),
                                value: "active",
                            },
                            {
                                label: (
                                    <span className="commerce-queue-tab">
                                        {translate("library.tasks.filter.succeeded")}<span className="commerce-count-badge is-neutral">{completed.length}</span>
                                    </span>
                                ),
                                value: "completed",
                            },
                        ]}
                    />
                    <div className="commerce-queue-list" aria-live="polite">
                        {error ? (
                            <p role="alert">{error}</p>
                        ) : visible.length ? (
                            visible.map((row) => (
                                <div className="commerce-queue-row" key={`${row.project.id}:${row.imageId}`}>
                                    <div className="commerce-queue-thumb">
                                        {taskThumbnail(row.task) ? <img src={taskThumbnail(row.task)} alt="" loading="lazy" decoding="async" /> : finished(row.task) ? <CheckCircle2 size={19} /> : <Clock3 size={18} />}
                                    </div>
                                    <div className="commerce-queue-detail">
                                        <strong>
                                            {row.project.name || translate("ecommerce.taskQueue.ecommerceProject")} {translate("ecommerce.taskQueue.image")} {row.index + 1} {translate("canvasA.characterLibrary.pageItem")}
                                        </strong>
                                        <span>{finished(row.task) ? translate("ecommerce.taskQueue.imageGeneratedSuccessfully") : row.task?.stage || (row.task?.status === "queued" ? translate("canvasPage.taskStatus.queued") : translate("canvasB.mediaVersion.generating"))}</span>
                                        {!finished(row.task) ? <Progress percent={Math.max(0, Math.min(100, Math.round(row.task?.progress || 0)))} size="small" showInfo={false} /> : null}
                                    </div>
                                    <Button
                                        size="small"
                                        onClick={() => {
                                            setOpen(false);
                                            onView(row.project, row.imageId);
                                        }}
                                    >
                                        {translate("ecommerce.taskQueue.view")}
                                    </Button>
                                </div>
                            ))
                        ) : (
                            <div className="commerce-queue-empty">{loading ? <Spin size="small" /> : tab === "active" ? translate("ecommerce.taskQueue.noImagesAreCurrentlyInProgress") : translate("ecommerce.taskQueue.noCompletedImagesYet")}</div>
                        )}
                    </div>
                </div>
            }
        >
            <Button className="commerce-queue-trigger" icon={<QueueIcon size={16} />} aria-label={badge ? translate("ecommerce.taskQueue.taskQueueImagesGenerating", { v0: String(badge) }) : translate("ecommerce.taskQueue.taskQueue")}>
                {translate("ecommerce.taskQueue.taskQueue")}
                {badge ? (
                    <span key={badge} className="commerce-queue-badge" aria-hidden="true">
                        {badge > 99 ? "99+" : badge}
                    </span>
                ) : null}
            </Button>
        </Popover>
    );
}
