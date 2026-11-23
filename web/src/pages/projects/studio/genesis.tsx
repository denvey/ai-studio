import { CheckCircle2, Circle, Loader2, PauseCircle } from "lucide-react";

import type { DramaSummary } from "@/services/api/drama";

import { formatCount } from "../drama-shared";
import { translate } from "@/i18n";

/** 全剧第一集出现前的状态：让用户知道流水线在做什么，而不是面对空白页。 */
export function StudioGenesis({ summary }: { summary: DramaSummary }) {
    const { production } = summary;
    const bibleDone = production.stage !== "bible";
    const paused = production.status !== "running";
    const steps = [
        { label: translate("drama.studio.genesis.readingNovelChaptersCharacters", { v0: String(formatCount(production.chapterCount)), v1: String(formatCount(production.wordCount)) }), done: true },
        { label: translate("drama.studio.genesis.buildTheStoryBibleCharactersPropsScenesAndVisualRules"), done: bibleDone, active: !bibleDone },
        { label: translate("drama.studio.genesis.adaptEpisodesWithOpeningHooksAndClosingCliffhangers"), done: summary.episodes.length > 0, active: bibleDone && !summary.episodes.length },
        { label: translate("drama.studio.genesis.episode1PilotScriptSegmentPromptsAndVideos"), done: false, active: false },
    ];
    return (
        <div className="drama-genesis">
            <div className="drama-genesis-card">
                {paused ? <PauseCircle className="mx-auto mb-5 size-16 text-[var(--status-warning)]" /> : <div className="drama-genesis-orb" aria-hidden />}
                <h2>{paused ? (production.status === "draft" ? translate("drama.studio.genesis.startWhenYouReReady") : translate("drama.studio.genesis.productionPaused")) : translate("drama.studio.genesis.adaptingYourNovelIntoAShortDrama")}</h2>
                <p>{paused ? translate("drama.studio.genesis.selectInTheUpperRight", { v0: String(production.pauseReason || translate("drama.studio.genesis.theSystemAutomaticallyHandlesAdaptationDesignRecordsStoryboardsAndThe")), v1: String(production.status === "draft" ? translate("drama.studio.genesis.startProduction") : translate("drama.studio.genesis.resumeProduction")) }) : translate("drama.studio.genesis.thisUsuallyTakesAMinuteOrTwoYouCanLeave")}</p>
                <div className="drama-genesis-steps">
                    {steps.map((step) => (
                        <div key={step.label} className={`drama-genesis-step ${step.done ? "is-done" : step.active && !paused ? "is-active" : ""}`}>
                            {step.done ? <CheckCircle2 className="size-4 text-[var(--status-success)]" /> : step.active && !paused ? <Loader2 className="size-4 animate-spin text-[var(--workspace-accent)]" /> : <Circle className="size-4 opacity-35" />}
                            {step.label}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
