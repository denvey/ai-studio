import type { PrevisCloseDecision, PrevisSaveSnapshot } from "@/lib/canvas/previs/previs-save";
import { translate } from "@/i18n";


export type PrevisSaveProgress = PrevisSaveSnapshot;

export const idlePrevisSaveProgress: PrevisSaveProgress = {
    revision: 0,
    confirmedRevision: 0,
    status: "saved",
};

export function previsSaveProgress(snapshot: PrevisSaveSnapshot): PrevisSaveProgress {
    return {
        revision: snapshot.revision,
        confirmedRevision: snapshot.confirmedRevision,
        status: snapshot.status,
    };
}

export type PrevisSaveIndicator = {
    label: string;
    tone: "idle" | "pending" | "danger";
    busy: boolean;
};

export function describePrevisSaveStatus(progress: PrevisSaveProgress): PrevisSaveIndicator {
    const unconfirmed = progress.confirmedRevision < progress.revision;
    if (progress.status === "error") return { label: translate("shared.canvas.previs.previsSaveWiring.saveIsIncompleteUnconfirmedOperationsWillContinueInTheBackground"), tone: "danger", busy: false };
    if (progress.status === "saving") return { label: translate("shared.skills.workbench.saving"), tone: "pending", busy: true };
    if (progress.status === "dirty" || unconfirmed) return { label: translate("shared.canvas.previs.previsSaveWiring.unconfirmedOperationsAreProcessingInTheBackground"), tone: "pending", busy: false };
    return { label: translate("shared.skills.workbench.saved"), tone: "idle", busy: false };
}

export type PrevisCloseOutcome = { kind: "close" } | { kind: "blocked"; message: string };

export function resolvePrevisCloseOutcome(decision: PrevisCloseDecision): PrevisCloseOutcome {
    if (decision === "close") return { kind: "close" };
    return { kind: "blocked", message: translate("shared.canvas.previs.previsSaveWiring.saveIsIncompleteYourEditsHaveBeenKeptAndUnconfirmed") };
}

export function shouldBlockPrevisUnload(progress: PrevisSaveProgress): boolean {
    return progress.confirmedRevision < progress.revision || progress.status === "error";
}
