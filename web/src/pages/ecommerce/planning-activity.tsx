import { Check, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { GenerationTask } from "@/services/api/task-center";
import "./planning-activity.css";

import { translate } from "@/i18n";
export function PlanningActivity({ task, references, count, automaticScreens = false }: { task?: GenerationTask; references: number; count: number; automaticScreens?: boolean }) {
    const [openedAt] = useState(Date.now);
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    const started = Date.parse(task?.startedAt || task?.createdAt || "") || openedAt;
    const seconds = Math.max(0, Math.floor((now - started) / 1000));
    const status = !task ? translate("ecommerce.planningActivity.submittingPlanningMaterials") : task.status === "queued" ? translate("ecommerce.planningActivity.queuedWaitingForTheModel") : task.status === "succeeded" ? translate("ecommerce.planningActivity.validatingImagePlan") : translate("ecommerce.planningActivity.analyzingProductAndBuildingThePlan");
    return (
        <section className="commerce-planning-activity" aria-label={translate("ecommerce.planningActivity.agentPlanningInProgress")} aria-busy="true" role="status">
            <div className="commerce-planning-emblem" aria-hidden="true">
                <span />
                <Sparkles size={24} strokeWidth={1.5} />
            </div>
            <div className="commerce-planning-title">
                <strong>{status}</strong>
                <span>{seconds >= 60 ? translate("ecommerce.planningActivity.mS", { v0: String(Math.floor(seconds / 60)), v1: String(seconds % 60) }) : translate("ecommerce.planningActivity.s", { v0: String(seconds) })}</span>
            </div>
            <p>{translate("ecommerce.planningActivity.startingFromTheRealProductToFindAClearMessage")}</p>
            <ol>
                <li>
                    <Check size={14} />
                    <div>
                        <strong>{translate("ecommerce.planningActivity.materialsForThisCreation")}</strong>
                        <small>
                            {references} {translate("ecommerce.planningActivity.referenceImages")} {automaticScreens ? translate("ecommerce.planningActivity.automaticallyDetectLongImageScreens") : translate("ecommerce.planningActivity.imagePlans", { v0: String(count) })}
                        </small>
                    </div>
                </li>
                <li>
                    <LoaderCircle className="commerce-planning-spin" size={14} />
                    <div>
                        <strong>{task?.status === "succeeded" ? translate("ecommerce.planningActivity.checkingStructureAndImageCount") : translate("ecommerce.planningActivity.understandingTheProductAndPlanningVisuals")}</strong>
                        <small>{task?.status === "queued" ? translate("ecommerce.planningActivity.theModelTaskIsQueuedThePlanWillAppearAutomatically") : task?.textDraft ? translate("ecommerce.planningActivity.receivedCharactersOfPlanningOutputWaitingForTheCompletePlan", { v0: String(task.textDraft.length) }) : translate("ecommerce.planningActivity.waitingForTheModelToReturnAPlanForReview")}</small>
                    </div>
                </li>
                <li className="is-pending">
                    <span className="commerce-planning-dot" />
                    <div>
                        <strong>{translate("ecommerce.planningActivity.reviewThePlanAndConfirmGeneration")}</strong>
                        <small>{translate("ecommerce.planningActivity.onceCompleteYouCanEditEachImageSCompositionCopy")}</small>
                    </div>
                </li>
            </ol>
            <small className="commerce-planning-footnote">{translate("ecommerce.planningActivity.theTaskContinuesOnTheServerAndCanBeRestored")}</small>
        </section>
    );
}
