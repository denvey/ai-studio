import type { ProjectDetail, ProjectSummary, ProjectUnit } from "@/services/api/projects";
import { translate } from "@/i18n";


export type ProjectActionTone = "default" | "attention" | "danger";

export type ProjectWorkbenchAction = {
    id: string;
    title: string;
    description: string;
    href: string;
    actionLabel: string;
    tone: ProjectActionTone;
};

export type ProjectContinueTarget = {
    href: string;
    title: string;
    context: string;
    updatedAt: string;
};

export type ProjectStageCell = {
    label: string;
    state: "idle" | "active" | "attention" | "completed";
};

export type ProjectUnitStage = {
    unit: ProjectUnit;
    content: ProjectStageCell;
    assets: ProjectStageCell;
    storyboard: ProjectStageCell;
    canvas: ProjectStageCell;
};

export function projectSummaryCompletion(summary: ProjectSummary) {
    return summary.unitCount ? Math.round((summary.completedUnitCount / summary.unitCount) * 100) : 0;
}

export function projectSummaryStage(summary: ProjectSummary) {
    if (summary.project.status === "archived") return { label: translate("account.feedback.archived"), detail: translate("shared.projectWorkbench.restoreInProjectSettings") };
    if (!summary.unitCount) return { label: translate("shared.projectWorkbench.prepareStory"), detail: translate("shared.projectWorkbench.noStoryChaptersYet") };
    if (summary.completedUnitCount === summary.unitCount) return { label: translate("shared.projectWorkbench.chaptersCompleted"), detail: translate("shared.projectWorkbench.reviewShotsAndDeliverables") };
    if (!summary.canvasCount) return { label: translate("shared.projectWorkbench.organizeChapters"), detail: translate("shared.projectWorkbench.createAProjectCanvasNext") };
    if (!summary.assetCount) return { label: translate("shared.projectWorkbench.prepareAssets"), detail: translate("shared.projectWorkbench.addCharactersScenesOrVisualStyles") };
    return { label: translate("shared.drama.dramaFormat.inProduction"), detail: translate("shared.projectWorkbench.chaptersCompleted2", { v0: String(summary.completedUnitCount), v1: String(summary.unitCount) }) };
}

export function projectDetailStage(detail: ProjectDetail) {
    if (detail.project.status === "archived") return { label: translate("account.feedback.archived"), detail: translate("shared.projectWorkbench.restoreTheProjectToResumeProduction") };
    const failedSteps = detail.workflows.flatMap((workflow) => workflow.steps).filter((step) => step.status === "failed").length;
    if (failedSteps) return { label: translate("shared.projectWorkbench.needsAttention"), detail: translate("shared.projectWorkbench.workflowStepsFailed", { v0: String(failedSteps) }) };
    const pendingCandidates = detail.assetCandidates.filter((candidate) => candidate.status === "pending_confirmation").length;
    if (pendingCandidates) return { label: translate("shared.projectWorkbench.confirmAssets"), detail: translate("shared.projectWorkbench.candidatesAwaitingConfirmation", { v0: String(pendingCandidates) }) };
    if (!detail.units.length) return { label: translate("shared.projectWorkbench.prepareStory"), detail: translate("shared.projectWorkbench.addOrImportStoryChapters") };
    if (!detail.shots.length) return { label: translate("shared.projectWorkbench.prepareStoryboard"), detail: translate("shared.projectWorkbench.selectAChapterToGenerateShots") };
    const runningSteps = detail.workflows.flatMap((workflow) => workflow.steps).filter((step) => step.status === "running" || step.status === "review").length;
    if (runningSteps) return { label: translate("shared.drama.dramaFormat.inProduction"), detail: translate("shared.projectWorkbench.workflowStepsInProgress", { v0: String(runningSteps) }) };
    const completedUnits = detail.units.filter((unit) => unit.status === "completed").length;
    if (completedUnits === detail.units.length) return { label: translate("shared.projectWorkbench.reviewDeliverables"), detail: translate("shared.projectWorkbench.chaptersCompletedReviewTheShotsAndResults") };
    return { label: translate("shared.projectWorkbench.shotProduction"), detail: translate("shared.projectWorkbench.shotsCreated", { v0: String(detail.shots.length) }) };
}

export function projectAttentionCount(detail: ProjectDetail) {
    const pendingCandidates = detail.assetCandidates.filter((candidate) => candidate.status === "pending_confirmation").length;
    const failedSteps = detail.workflows.flatMap((workflow) => workflow.steps).filter((step) => step.status === "failed").length;
    return pendingCandidates + failedSteps;
}

export function projectContinueTarget(detail: ProjectDetail): ProjectContinueTarget {
    const latestCanvas = [...detail.canvases].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    const latestUnit = [...detail.units].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    if (latestCanvas && (!latestUnit || latestCanvas.updatedAt >= latestUnit.updatedAt)) {
        return {
            href: `/canvas/${latestCanvas.id}`,
            title: latestCanvas.title,
            context: translate("shared.projectWorkbench.continueEditingTheProjectCanvas"),
            updatedAt: latestCanvas.updatedAt,
        };
    }
    if (latestUnit) {
        return {
            href: `/projects/${detail.project.id}/chapters/${latestUnit.id}`,
            title: latestUnit.title,
            context: translate("shared.projectWorkbench.continueWorkingOnTheStoryChapter"),
            updatedAt: latestUnit.updatedAt,
        };
    }
    return {
        href: `/projects/${detail.project.id}/chapters`,
        title: detail.project.name,
        context: translate("shared.projectWorkbench.startWithStoryChapters"),
        updatedAt: detail.project.updatedAt,
    };
}

// 项目概览必须把真实阻塞转成动作；没有事实依据时只提示通用的制作下一步。
export function projectNextActions(detail: ProjectDetail, limit = 4): ProjectWorkbenchAction[] {
    const actions: ProjectWorkbenchAction[] = [];
    const projectRoot = `/projects/${detail.project.id}`;
    if (detail.project.status === "archived") {
        return [{
            id: "restore-project",
            title: translate("shared.projectWorkbench.projectArchived"),
            description: translate("shared.projectWorkbench.restoreTheProjectToCreateCanvasesAndSubmitGenerationTasks"),
            href: `${projectRoot}/settings`,
            actionLabel: translate("shared.projectWorkbench.restoreProject"),
            tone: "attention",
        }];
    }

    const failedSteps = detail.workflows.flatMap((workflow) => workflow.steps).filter((step) => step.status === "failed");
    if (failedSteps.length) {
        actions.push({
            id: "failed-steps",
            title: translate("shared.projectWorkbench.resolveFailedSteps", { v0: String(failedSteps.length) }),
            description: failedSteps[0].error?.trim() || translate("shared.projectWorkbench.reviewTheErrorsAndInputsThenRetryTheAffectedTasks"),
            href: "/tasks?status=failed",
            actionLabel: translate("shared.projectWorkbench.viewFailedTasks"),
            tone: "danger",
        });
    }

    const pendingCandidates = detail.assetCandidates.filter((candidate) => candidate.status === "pending_confirmation");
    if (pendingCandidates.length) {
        const categories = new Set(pendingCandidates.map((candidate) => candidate.category));
        actions.push({
            id: "pending-assets",
            title: translate("shared.projectWorkbench.confirmAssetCandidates", { v0: String(pendingCandidates.length) }),
            description: translate("shared.projectWorkbench.categoriesOfCharacterSceneOrProductionAssetsNeedConfirmationBefore", { v0: String(categories.size) }),
            href: `${projectRoot}/assets`,
            actionLabel: translate("shared.projectWorkbench.reviewCandidates"),
            tone: "attention",
        });
    }

    if (!detail.units.length) {
        actions.push({
            id: "add-story",
            title: translate("shared.projectWorkbench.addYourFirstStoryChapter"),
            description: translate("shared.projectWorkbench.importANovelPasteTextOrStartWithABlank"),
            href: `${projectRoot}/chapters`,
            actionLabel: translate("shared.projectWorkbench.addChapter"),
            tone: "default",
        });
    } else {
        const firstDraft = [...detail.units].sort(byPosition).find((unit) => unit.status === "draft");
        if (firstDraft) {
            actions.push({
                id: `review-unit-${firstDraft.id}`,
                title: translate("shared.projectWorkbench.reviewChapterContent", { v0: String(firstDraft.position + 1) }),
                description: firstDraft.title,
                href: `${projectRoot}/chapters/${firstDraft.id}`,
                actionLabel: translate("canvasA.creative.continueWork"),
                tone: "default",
            });
        }

        const unitsWithShots = new Set(detail.shots.map((shot) => shot.unitId).filter(Boolean));
        const firstUnitWithoutShots = [...detail.units].sort(byPosition).find((unit) => unit.status !== "draft" && !unitsWithShots.has(unit.id));
        if (firstUnitWithoutShots) {
            actions.push({
                id: `storyboard-unit-${firstUnitWithoutShots.id}`,
                title: translate("shared.projectWorkbench.createAStoryboardForChapter", { v0: String(firstUnitWithoutShots.position + 1) }),
                description: translate("shared.projectWorkbench.hasNoShotsYetGenerateAStoryboardDraftThenRefine", { v0: String(firstUnitWithoutShots.title) }),
                href: `${projectRoot}/chapters/${firstUnitWithoutShots.id}`,
                actionLabel: translate("shared.projectWorkbench.createStoryboard"),
                tone: "default",
            });
        }
    }

    if (!detail.canvases.length && detail.units.length) {
        actions.push({
            id: "create-canvas",
            title: translate("shared.projectWorkbench.createYourFirstProjectCanvas"),
            description: translate("shared.projectWorkbench.bringChaptersStoryboardsAndReferenceAssetsIntoOneProductionSpace"),
            href: `${projectRoot}/canvases`,
            actionLabel: translate("shared.projectWorkbench.viewProjectCanvases"),
            tone: "default",
        });
    }

    if (!actions.length) {
        const target = projectContinueTarget(detail);
        actions.push({
            id: "continue-project",
            title: translate("shared.projectWorkbench.continueYourLatestWork"),
            description: `${target.context}：${target.title}`,
            href: target.href,
            actionLabel: translate("shared.projectWorkbench.continueCreating"),
            tone: "default",
        });
    }
    return actions.slice(0, limit);
}

export function projectUnitStages(detail: ProjectDetail, limit = 8): ProjectUnitStage[] {
    const sortedUnits = [...detail.units].sort(byPosition).slice(0, limit);
    return sortedUnits.map((unit) => {
        const candidates = detail.assetCandidates.filter((candidate) => candidate.unitId === unit.id);
        const pendingCandidates = candidates.filter((candidate) => candidate.status === "pending_confirmation").length;
        const confirmedCandidates = candidates.filter((candidate) => candidate.status === "confirmed").length;
        const shots = detail.shots.filter((shot) => shot.unitId === unit.id);
        const canvasCount = new Set(detail.canvasUnitLinks.filter((link) => link.unitId === unit.id).map((link) => link.canvasId)).size;
        return {
            unit,
            content: contentStage(unit),
            assets: pendingCandidates
                ? { label: translate("shared.projectWorkbench.pending", { v0: String(pendingCandidates) }), state: "attention" }
                : confirmedCandidates
                  ? { label: translate("shared.projectWorkbench.confirmed", { v0: String(confirmedCandidates) }), state: "completed" }
                  : { label: translate("shared.projectWorkbench.notIdentified"), state: "idle" },
            storyboard: shots.length
                ? { label: translate("shared.projectWorkbench.shots", { v0: String(shots.length) }), state: shots.every((shot) => shot.status === "completed") ? "completed" : "active" }
                : { label: translate("shared.drama.dramaFormat.notStarted"), state: "idle" },
            canvas: canvasCount
                ? { label: translate("shared.projectWorkbench.canvases", { v0: String(canvasCount) }), state: "active" }
                : { label: translate("shared.projectWorkbench.notLinked"), state: "idle" },
        };
    });
}

function contentStage(unit: ProjectUnit): ProjectStageCell {
    if (unit.status === "completed") return { label: translate("library.tasks.filter.succeeded"), state: "completed" };
    if (unit.status === "ready") return { label: translate("shared.projectWorkbench.readyForProduction"), state: "active" };
    return { label: translate("shared.projectWorkbench.draft"), state: "attention" };
}

function byPosition(left: ProjectUnit, right: ProjectUnit) {
    return left.position - right.position;
}
