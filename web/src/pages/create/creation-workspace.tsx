import { ImageSizePicker } from "@/components/image-size-picker";
import { ImageParameterFields } from "@/components/image-parameter-fields";
import { imageResolutionUsesQuality, imageSizePresets } from "@/lib/image-size-presets";
import { createPortal } from "react-dom";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Button, Popover } from "antd";
import { useWorkspaceTopBarMount } from "@/components/layout/workspace-top-bar-extension";
import { Tooltip } from "@/components/ui/base/tooltip";
import { Reorder, LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { type ThinkingLevel, type ThinkingRequest } from "@/lib/text-thinking";
import { ThinkingLevelSlider } from "@/components/thinking-level-slider";
import { ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Clock3, Film, History, Image as ImageIcon, LoaderCircle, Maximize2, MessageSquareText, Minimize2, Plus, SlidersHorizontal, Trash2, Waves, X, Orbit, PenLine } from "lucide-react";

import { WorkingGlow } from "@/components/ai/working-indicator";
import { formatVideoResolutionLabel as videoResolutionLabel } from "@/lib/video-generation-options";
import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { VoiceRecordingButton } from "@/components/conversation/voice-recording-button";
import { HoverBorderGradient } from "@/components/ui/aceternity/hover-border-gradient";
import { SpotlightSurface } from "@/components/ui/aceternity/spotlight-surface";
import { ModelPicker } from "@/components/model-picker";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { ASSET_CATEGORY_LABELS } from "@/lib/asset-category";
import { formatShotOrdinal } from "@/lib/shot-label";
import { buildImageResolutionOptions, formatImageResolutionSize, supportsImageResolutionPresets } from "@/lib/image-resolution-tiers";
import { normalizeVideoValue, videoDurationOptions, type ImageCapabilityConfig, type VideoCapabilityConfig } from "@/lib/model-capabilities";
import { mergedImageCapabilityConfig, type ModelRequirements } from "@/lib/model-selection";
import { imageQualityLabel } from "@/lib/image-quality";
import { modelQuoteDescription, modelQuoteRequest } from "@/lib/model-pricing";
import { quoteModel, type LogicalModelQuote } from "@/services/api/logical-models";
import { modelOptionName, resolveModelChannel, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { PromptOptimizerProvider } from "@/lib/plugins/plugin-types";
import { type CreationReference } from "./creation-references";
import { creationAttachmentKind, type CreationAttachment, type CreationMode } from "./creation-assets";
import { countOptions, modeLabels, qualityOptions, resolutionOptions, type CreationShotRailEntry } from "./creation-types";
import { creationMessageNeedsResultSync } from "./creation-conversations";
import "./creation-product.css";
import "./creation-scrollbars.css";
import { CreationAttachmentThumbnail, CreationMediaPreviewModal } from "./creation-workspace-messages";
import { currentLocale, translate } from "@/i18n";


export { CreationHistoryDrawer } from "./creation-workspace-history";
export { CreationMessageView } from "./creation-workspace-messages";
export { CreationEmptyBanner, CreationEmptySuggest, CreationFeaturedWorks } from "./creation-workspace-empty";

const CanvasPromptOptimizerDrawer = lazy(() => import("@/components/canvas/canvas-prompt-optimizer-drawer").then((module) => ({ default: module.CanvasPromptOptimizerDrawer })));

export const creationAssetCategoryLabels: Record<string, string> = { all: translate("canvasA.assetPicker.allAssets"), ...ASSET_CATEGORY_LABELS };

export function CreationWorkspaceToolbar({
    shots,
    onJumpToShot,
    onNewConversation,
    onOpenHistory,
    onContinueCanvas,
    openingCanvas,
}: {
    shots: CreationShotRailEntry[];
    onJumpToShot: (shot: CreationShotRailEntry) => void;
    onNewConversation: () => void;
    onOpenHistory: () => void;
    onContinueCanvas: () => void;
    openingCanvas: boolean;
}) {
    const [railOpen, setRailOpen] = useState(false);
    const railRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!railOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (railRef.current && !railRef.current.contains(event.target as Node)) setRailOpen(false);
        };
        window.addEventListener("mousedown", onPointerDown);
        return () => window.removeEventListener("mousedown", onPointerDown);
    }, [railOpen]);
    const mount = useWorkspaceTopBarMount();
    const toolbar = (
        <header className="creation-thread-toolbar">
            <div className="creation-toolbar-shots" ref={railRef}>
                <button type="button" className="creation-rail-trigger" aria-expanded={railOpen} aria-haspopup="listbox" onClick={() => setRailOpen((open) => !open)}>
                    <Clapperboard />
                    {translate("shared.create.creationWorkspace.shotTimeline")}{shots.length > 0 ? <em className="creation-rail-count">{shots.length}</em> : null}
                </button>
                {railOpen ? (
                    <div className="creation-rail-pop" role="listbox" aria-label={translate("shared.create.creationWorkspace.shotTimeline")}>
                        <div className="creation-rail-pop-head">
                            <span className="creation-rail-pop-title">
                                {translate("shared.create.creationWorkspace.shotTimeline")}<small>{shots.length ? translate("shared.create.creationWorkspace.shotsTotal", { v0: String(shots.length) }) : translate("shared.create.creationWorkspace.emptyTrack")}</small>
                            </span>
                            <button type="button" className="creation-rail-pop-close" aria-label={translate("shared.create.creationWorkspace.closeShotList")} onClick={() => setRailOpen(false)}>
                                <X />
                            </button>
                        </div>
                        {shots.length ? (
                            <ol className="creation-rail-list">
                                {shots.map((shot) => {
                                    const resultStatus = shot.result?.status;
                                    const resultNeedsSync = Boolean(shot.result && creationMessageNeedsResultSync(shot.result));
                                    const statusLabel = resultStatus === "done" ? translate("account.payment.done") : resultNeedsSync ? translate("shared.create.creationWorkspace.awaitingSync") : resultStatus === "error" ? translate("canvasPage.batches.generationFailed") : resultStatus === "pending" ? translate("canvasB.mediaVersion.generating") : resultStatus === "cancelled" ? translate("create.status.stopped") : translate("shared.create.creationWorkspace.awaitingGeneration");
                                    return (
                                        <li key={shot.key}>
                                            <button
                                                type="button"
                                                role="option"
                                                aria-selected="false"
                                                className="creation-rail-row"
                                                onClick={() => {
                                                    setRailOpen(false);
                                                    onJumpToShot(shot);
                                                }}
                                            >
                                                <span className="creation-rail-row-shot">{formatShotOrdinal(shot.ordinal - 1)}</span>
                                                <span className="creation-rail-row-prompt">{shot.user.content || translate("shared.create.creationWorkspace.videoShots")}</span>
                                                <span className={`creation-rail-row-state is-${resultNeedsSync ? "sync" : resultStatus || "idle"}`}>{statusLabel}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : (
                            <p className="creation-rail-empty">{translate("shared.create.creationWorkspace.sendAVideoMessageBelowToCreateYourFirstShot")}</p>
                        )}
                    </div>
                ) : null}
            </div>
            <div className="creation-toolbar-actions">
                <Button size="small" loading={openingCanvas} onClick={onContinueCanvas}>
                    {translate("shared.create.creationWorkspace.continueOnCanvas")}
                </Button>
                <Tooltip title={translate("create.history.new")}>
                    <button type="button" aria-label={translate("create.history.new")} className="creation-toolbar-action" onClick={onNewConversation}>
                        <Plus />
                    </button>
                </Tooltip>
                <Tooltip title={translate("create.history.title")}>
                    <button type="button" aria-label={translate("create.page.viewHistory")} className="creation-toolbar-action" onClick={onOpenHistory}>
                        <History />
                    </button>
                </Tooltip>
            </div>
        </header>
    );
    if (mount) return createPortal(toolbar, mount);
    if (mount === null) return null;
    return toolbar;
}

type ComposerProps = {
    variant: "empty" | "thread";
    mode: CreationMode;
    prompt: string;
    setPrompt: (value: string) => void;
    busy: boolean;
    generationActive: boolean;
    referenceReplacementBusy: boolean;
    attachments: CreationAttachment[];
    referenceImageSize?: { width: number; height: number };
    maxReferences: number;
    references: CreationReference[];
    onRemoveAttachment: (id: string) => void;
    onClearAttachments: () => void;
    onClearComposer: () => void;
    onReorderAttachments: (attachments: CreationAttachment[]) => void;
    onReplaceAttachment: (targetAttachmentId: string, replacement: CreationAttachment) => void;
    onReplaceReferenceFiles: (targetAttachmentId: string, files: File[]) => void;
    onOpenLibrary: () => void;
    onModeChange: (mode: CreationMode) => void;
    model: string;
    modelRequirements: ModelRequirements;
    videoProfile: VideoCapabilityConfig;
    imageProfile: ImageCapabilityConfig;
    config: AiConfig;
    onModelChange: (value: string) => void;
    ratio: string;
    setRatio: (value: string) => void;
    seconds: string;
    setSeconds: (value: string) => void;
    quality: string;
    setQuality: (value: string) => void;
    imageResolution: string;
    setImageResolution: (value: string) => void;
    imageParameters?: string;
    setImageParameters: (value: string) => void;
    setTransparentBackground: (value: string) => void;
    videoQuality: string;
    setVideoQuality: (value: string) => void;
    count: string;
    setCount: (value: string) => void;
    textStreaming: boolean;
    setTextStreaming: (value: boolean) => void;
    /** 当前模型可选的思考档位；为空时不显示思考控件。 */
    textThinkingLevels: ThinkingLevel[];
    /** 当前生效档位；空字符串表示跟随模型默认且模型没有声明默认值。 */
    textThinkingLevel: ThinkingLevel | "";
    textThinkingRequest: ThinkingRequest;
    setTextThinkingLevel: (value: ThinkingRequest) => void;
    promptOptimizerProvider: PromptOptimizerProvider | null;
    composerFocusRef: RefObject<HTMLTextAreaElement | null>;
    onPromptFocus: () => void;
    placeholderOverride?: string;
    onSubmit: () => void;
};

type CreationReferenceFilter = "all" | "image" | "video" | "audio" | "file";

export function CreationComposer(props: ComposerProps) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const [promptOptimizerOpen, setPromptOptimizerOpen] = useState(false);
    const [referenceFilter, setReferenceFilter] = useState<CreationReferenceFilter>("all");
    const [canDragReferences, setCanDragReferences] = useState(false);
    const [dropTargetReferenceId, setDropTargetReferenceId] = useState<string | null>(null);
    const attachmentTrackRef = useRef<HTMLUListElement>(null);
    const cardDragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
    const suppressAttachmentClickRef = useRef(false);
    const [trackState, setTrackState] = useState({ canScrollLeft: false, canScrollRight: false, isExpanded: true, isDragging: false });
    const previousAttachmentCountRef = useRef(0);
    const interactionBusy = props.busy || props.referenceReplacementBusy;
    const canSubmit = Boolean(props.prompt.trim()) && !interactionBusy;
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const priceChannel = resolveModelChannel(props.config, props.model);
    const quoteRequest = useMemo(() => modelQuoteRequest(props.config, props.model, props.mode, props.modelRequirements), [props.config, props.mode, props.model, props.modelRequirements]);
    const [routeQuote, setRouteQuote] = useState<LogicalModelQuote | null>(null);
    const canOptimizePrompt = Boolean(props.promptOptimizerProvider) && (props.mode === "image" || props.mode === "video");
    const optimizerReferences = props.references.filter((reference) => reference.active && reference.kind !== "skill");
    const credits = requestCreditCost({
        channelMode: priceChannel.scope === "system" ? "remote" : "local",
        modelCosts: priceChannel.modelCosts,
        model: modelOptionName(props.model),
        count: props.mode === "image" ? props.count : 1,
        seconds: props.mode === "video" ? props.seconds : 1,
        capability: props.mode,
        config: props.config,
        requirements: props.modelRequirements,
    });
    useEffect(() => {
        if (!creditsEnabled || !quoteRequest) {
            setRouteQuote(null);
            return;
        }
        const controller = new AbortController();
        setRouteQuote(null);
        quoteModel(quoteRequest, controller.signal)
            .then(({ quote }) => setRouteQuote(quote))
            .catch(() => {
                if (!controller.signal.aborted) setRouteQuote(null);
            });
        return () => controller.abort();
    }, [creditsEnabled, quoteRequest]);
    const generationCredits = routeQuote ? routeQuote.amountMicrocredits / 1_000_000 : credits;
    const showCost = creditsEnabled && generationCredits !== null && generationCredits !== undefined;
    const formattedCredits = generationCredits?.toLocaleString(currentLocale(), { maximumFractionDigits: 6 });
    const actionLabel = props.referenceReplacementBusy ? translate("shared.create.creationWorkspace.replacingReferenceImage") : interactionBusy || (props.generationActive && !canSubmit) ? translate("canvasB.mediaVersion.generating") : showCost ? translate("shared.create.creationWorkspace.creditsSend", { v0: String(routeQuote?.estimated ? translate("shared.create.creationWorkspace.estimated2") : translate("shared.create.creationWorkspace.cost")), v1: String(formattedCredits) }) : translate("shared.testVoiceRecording.send");
    // Send-button working state must span the WHOLE generation (not just the
    // submit-lock window): spinner + glow stay while a message is pending and
    // the composer is empty; typing a next prompt returns the arrow so the
    // user knows a new send is possible.
    const showWorkingSpinner = interactionBusy || (props.generationActive && !canSubmit);
    const showWorkingGlow = props.generationActive && !canSubmit;
    const placeholder = props.mode === "text" ? translate("shared.create.creationWorkspace.describeYourStoryCharactersOrTheIdeaYouWantTo") : props.mode === "image" ? translate("shared.create.creationWorkspace.describeTheFrameCharactersSettingCompositionAndStyle") : translate("shared.create.creationWorkspace.describeTheShotSContentMovementLightingAndPacing");
    const emptyPlaceholder = translate("shared.create.creationWorkspace.describeYourShotImageOrStoryYouCanAlsoAdd");
    const imageReferencesSupported = props.imageProfile.references.maxImages > 0;
    const referencesSupported = props.mode === "image" ? imageReferencesSupported : props.mode !== "video" || props.maxReferences > 0;
    const canAddMoreReferences = referencesSupported && props.attachments.length < props.maxReferences;
    const addReferenceLabel = interactionBusy ? (props.referenceReplacementBusy ? translate("shared.create.creationWorkspace.replacingReferenceImage") : translate("shared.create.creationWorkspace.referencesCannotBeAddedDuringGeneration")) : canAddMoreReferences ? translate("shared.create.creationWorkspace.addMoreReferences") : translate("shared.create.creationWorkspace.referenceLimitReachedForTheCurrentModel", { v0: String(props.maxReferences) });
    const referenceCounts = useMemo(
        () =>
            props.attachments.reduce(
                (counts, attachment) => {
                    const kind = creationAttachmentKind(attachment);
                    counts[kind] += 1;
                    return counts;
                },
                { image: 0, video: 0, audio: 0, file: 0 },
            ),
        [props.attachments],
    );
    const visibleAttachments = useMemo(() => (referenceFilter === "all" ? props.attachments : props.attachments.filter((attachment) => creationAttachmentKind(attachment) === referenceFilter)), [props.attachments, referenceFilter]);
    const imageSettingsSupported = props.imageProfile.size.parameter !== "none" || props.imageProfile.quality.supported || props.imageProfile.maxOutputs > 1;
    const updateTrackScrollState = useCallback(() => {
        const track = attachmentTrackRef.current;
        if (!track) return;
        setTrackState((current) => ({
            ...current,
            canScrollLeft: track.scrollLeft > 1,
            canScrollRight: track.scrollLeft + track.clientWidth < track.scrollWidth - 1,
        }));
    }, []);
    const setReferencePanelExpanded = useCallback((isExpanded: boolean) => {
        setTrackState((current) => ({ ...current, isExpanded }));
        if (!isExpanded) setReferenceFilter("all");
    }, []);
    useEffect(() => {
        const hadAttachments = previousAttachmentCountRef.current > 0;
        if (!props.attachments.length) setReferencePanelExpanded(false);
        else if (!hadAttachments) setReferencePanelExpanded(true);
        previousAttachmentCountRef.current = props.attachments.length;
        updateTrackScrollState();
    }, [props.attachments.length, setReferencePanelExpanded, updateTrackScrollState]);
    useEffect(() => {
        const query = window.matchMedia("(hover: hover) and (pointer: fine)");
        const update = () => setCanDragReferences(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    useEffect(() => {
        const frame = window.requestAnimationFrame(updateTrackScrollState);
        return () => window.cancelAnimationFrame(frame);
    }, [referenceFilter, trackState.isExpanded, updateTrackScrollState, visibleAttachments.length]);
    const beginCardDrag = (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || interactionBusy || !trackState.isExpanded) return;
        if ((event.target as HTMLElement).closest(".creation-reference-card-remove")) return;
        cardDragRef.current = { startX: event.clientX, startY: event.clientY, moved: false };
    };
    const endCardDrag = (event: PointerEvent<HTMLElement>) => {
        const drag = cardDragRef.current;
        if (!drag) return;
        cardDragRef.current = null;
        if (drag.moved) {
            suppressAttachmentClickRef.current = true;
            window.setTimeout(() => {
                suppressAttachmentClickRef.current = false;
            }, 0);
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        setTrackState((current) => ({ ...current, isDragging: false }));
    };
    const moveCardDrag = (event: PointerEvent<HTMLElement>) => {
        const drag = cardDragRef.current;
        if (!drag || drag.moved) return;
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 4) return;
        drag.moved = true;
        setTrackState((current) => ({ ...current, isDragging: true, isExpanded: true }));
    };
    const previewAttachment = (type: "image" | "video", url: string) => {
        if (suppressAttachmentClickRef.current || cardDragRef.current?.moved) return;
        setPreviewType(type);
        setPreviewUrl(url);
    };
    const reorderVisibleAttachments = useCallback(
        (next: CreationAttachment[]) => {
            if (referenceFilter === "all") {
                props.onReorderAttachments(next);
                return;
            }
            const visibleIds = new Set(visibleAttachments.map((attachment) => attachment.id));
            const reordered = [...next];
            props.onReorderAttachments(props.attachments.map((attachment) => (visibleIds.has(attachment.id) ? reordered.shift() || attachment : attachment)));
        },
        [props.attachments, props.onReorderAttachments, referenceFilter, visibleAttachments],
    );
    useEffect(() => {
        if (!canOptimizePrompt) setPromptOptimizerOpen(false);
    }, [canOptimizePrompt]);

    const scrollAttachmentTrack = (direction: -1 | 1) => {
        const track = attachmentTrackRef.current;
        if (!track) return;
        track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.72, 120), behavior: "smooth" });
        window.setTimeout(updateTrackScrollState, 180);
    };
    const imageReferenceAtPoint = (x: number, y: number) => {
        for (const element of document.elementsFromPoint(x, y)) {
            const chip = element.closest<HTMLElement>("[data-mention-reference-id]");
            const referenceId = chip?.dataset.mentionReferenceId;
            const reference = referenceId ? props.references.find((item) => item.id === referenceId) : undefined;
            if (reference?.kind === "image" && reference.attachmentId) return reference;
        }
        return undefined;
    };
    // 首页空态嵌在 CreationModeCard 里：外框、投影和悬停描边由卡片统一提供。指针高光也关掉，
    // 否则高光停在页签下沿，会把选中页签和内容面切成两块。
    const embedded = props.variant === "empty";
    const surface = (
        <SpotlightSurface className={`creation-chat-composer is-${props.variant}`} contentClassName="contents" spotlightColor={embedded ? "transparent" : "color-mix(in srgb, var(--user-ink) 12%, transparent)"} spotlightRadius={280}>
            <div className="creation-chat-writing-surface">
                <div className="creation-chat-editor">
                    <CanvasResourceMentionTextarea
                        ref={props.composerFocusRef}
                        value={props.prompt}
                        references={props.references}
                        mentionMenuWidth={400}
                        sendOnEnter
                        onFocus={props.onPromptFocus}
                        onChange={props.setPrompt}
                        onSubmit={props.onSubmit}
                        containerClassName="creation-chat-mention-container"
                        className="creation-chat-mention-editor creation-scrollbar"
                        style={{ color: "var(--creation-text)" }}
                        placeholder={props.placeholderOverride || (props.variant === "empty" ? emptyPlaceholder : placeholder)}
                        aria-label={translate("shared.create.creationWorkspace.writeAPromptUseToReferenceCurrentContentOrSkills")}
                        spellCheck
                        disabled={interactionBusy}
                        activeDropReferenceId={dropTargetReferenceId}
                        onReferenceFilesDrop={(reference, files) => {
                            const target = props.references.find((item) => item.id === reference.id);
                            if (target?.attachmentId) props.onReplaceReferenceFiles(target.attachmentId, files);
                        }}
                    />
                    {props.attachments.length ? (
                        <div className={`creation-reference-panel${trackState.isExpanded ? " is-expanded" : ""}`} aria-busy={interactionBusy}>
                            {trackState.isExpanded ? (
                                <div className="creation-reference-panel-header">
                                    <div className="creation-reference-filter-tabs" role="group" aria-label={translate("shared.create.creationWorkspace.filterReferences")}>
                                        {(
                                            [
                                                { id: "all", label: translate("canvasA.toolPicker.all"), count: props.attachments.length },
                                                { id: "image", label: translate("account.feedback.image"), count: referenceCounts.image },
                                                { id: "video", label: translate("account.feedback.video"), count: referenceCounts.video },
                                                { id: "audio", label: translate("account.settings.modelConfig.capabilities.audio"), count: referenceCounts.audio },
                                                { id: "file", label: translate("shared.create.creationWorkspace.files"), count: referenceCounts.file },
                                            ] as const
                                        ).map((filter) => (
                                            <button key={filter.id} type="button" aria-pressed={referenceFilter === filter.id} className={referenceFilter === filter.id ? "is-active" : undefined} onClick={() => setReferenceFilter(filter.id)}>
                                                {filter.label}
                                                {filter.count ? ` (${filter.count})` : ""}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="creation-reference-panel-actions">
                                        {props.attachments.length ? (
                                            <button type="button" onClick={props.onClearAttachments} disabled={interactionBusy}>
                                                {translate("shared.create.creationWorkspace.clearAllAssets")}
                                            </button>
                                        ) : null}
                                        <Tooltip title={translate("shared.create.creationWorkspace.collapseAssetPanel")}>
                                            <button type="button" className="creation-reference-panel-collapse" onClick={() => setReferencePanelExpanded(false)} aria-label={translate("shared.create.creationWorkspace.collapseAssetPanel")}>
                                                <Minimize2 aria-hidden="true" />
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                            ) : null}
                            <div className="creation-reference-track-wrapper">
                                <div className="creation-reference-stack-shell">
                                    {trackState.canScrollLeft ? (
                                        <button type="button" className="creation-reference-track-button is-left" onClick={() => scrollAttachmentTrack(-1)} aria-label={translate("shared.create.creationWorkspace.browseReferencesLeft")} title={translate("shared.create.creationWorkspace.browseReferencesLeft")}>
                                            <ChevronLeft aria-hidden="true" />
                                        </button>
                                    ) : null}
                                    <Reorder.Group<CreationAttachment[]>
                                        as="ul"
                                        ref={attachmentTrackRef}
                                        className={`creation-reference-track${trackState.isExpanded ? " is-expanded" : ""}${trackState.isDragging ? " is-dragging" : ""}${visibleAttachments.length ? "" : " is-empty"}`}
                                        axis="x"
                                        values={visibleAttachments}
                                        onReorder={reorderVisibleAttachments}
                                        layoutScroll
                                        role="list"
                                        aria-label={translate("shared.create.creationWorkspace.referenceTrack")}
                                        onScroll={updateTrackScrollState}
                                    >
                                        {visibleAttachments.map((item) => (
                                            <Reorder.Item<CreationAttachment>
                                                key={item.id}
                                                value={item}
                                                layout="position"
                                                drag={trackState.isExpanded && canDragReferences && !interactionBusy}
                                                className="creation-reference-stack-card"
                                                onPointerDown={beginCardDrag}
                                                onPointerMove={moveCardDrag}
                                                onPointerUp={endCardDrag}
                                                onPointerCancel={endCardDrag}
                                                onDragStart={() => {
                                                    setDropTargetReferenceId(null);
                                                    setTrackState((current) => ({ ...current, isDragging: true, isExpanded: true }));
                                                }}
                                                onDrag={(_, info) => {
                                                    if (creationAttachmentKind(item) !== "image") return;
                                                    const target = imageReferenceAtPoint(info.point.x, info.point.y);
                                                    setDropTargetReferenceId(target?.attachmentId !== item.id ? target?.id || null : null);
                                                }}
                                                onDragEnd={(_, info) => {
                                                    const target = creationAttachmentKind(item) === "image" ? imageReferenceAtPoint(info.point.x, info.point.y) : undefined;
                                                    setDropTargetReferenceId(null);
                                                    setTrackState((current) => ({ ...current, isDragging: false, isExpanded: true }));
                                                    if (target?.attachmentId && target.attachmentId !== item.id) props.onReplaceAttachment(target.attachmentId, item);
                                                }}
                                            >
                                                <CreationAttachmentThumbnail item={item} onPreview={previewAttachment} onRemove={props.onRemoveAttachment} />
                                            </Reorder.Item>
                                        ))}
                                        {!visibleAttachments.length && props.attachments.length ? <li className="creation-reference-filter-empty">{translate("shared.create.creationWorkspace.noReferencesOfThisTypeYet")}</li> : null}
                                        {referencesSupported ? (
                                            <li className="creation-reference-add-slot">
                                                <Tooltip title={addReferenceLabel}>
                                                    <button type="button" className="creation-reference-add-button" onClick={props.onOpenLibrary} disabled={interactionBusy || !canAddMoreReferences} aria-label={addReferenceLabel}>
                                                        <Plus aria-hidden="true" />
                                                        <span>{translate("library.picker.eyebrow")}</span>
                                                    </button>
                                                </Tooltip>
                                            </li>
                                        ) : null}
                                    </Reorder.Group>
                                    {trackState.canScrollRight ? (
                                        <button type="button" className="creation-reference-track-button is-right" onClick={() => scrollAttachmentTrack(1)} aria-label={translate("shared.create.creationWorkspace.browseReferencesRight")} title={translate("shared.create.creationWorkspace.browseReferencesRight")}>
                                            <ChevronRight aria-hidden="true" />
                                        </button>
                                    ) : null}
                                    {!trackState.isExpanded && props.attachments.length ? (
                                        <Tooltip title={translate("create.recent.viewAll")}>
                                            <button type="button" className="creation-reference-panel-expand" onClick={() => setReferencePanelExpanded(true)} aria-label={translate("shared.create.creationWorkspace.viewAllReferences", { v0: String(props.attachments.length) })} aria-expanded="false">
                                                <Maximize2 aria-hidden="true" />
                                            </button>
                                        </Tooltip>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
            <footer className="creation-chat-dock">
                <div className="creation-chat-controls">
                    {props.variant === "thread" ? <ModePicker mode={props.mode} onModeChange={props.onModeChange} /> : null}
                    {referencesSupported && !props.attachments.length ? (
                        <Tooltip title={addReferenceLabel}>
                            <button type="button" className="creation-chat-control" onClick={props.onOpenLibrary} disabled={interactionBusy || !canAddMoreReferences} aria-label={addReferenceLabel}>
                                <Plus aria-hidden="true" />
                                <span>{translate("library.picker.eyebrow")}</span>
                            </button>
                        </Tooltip>
                    ) : null}
                    <VoiceRecordingButton className="creation-voice-trigger" disabled={interactionBusy} onTranscribed={(text) => props.setPrompt(props.prompt.trim() ? `${props.prompt} ${text}` : text)} />
                    {canOptimizePrompt ? (
                        <Tooltip title={translate("shared.create.creationWorkspace.optimizePromptWithAI")}>
                            <button type="button" className="creation-chat-control" onClick={() => setPromptOptimizerOpen(true)} aria-label={translate("shared.create.creationWorkspace.optimizePrompt")} aria-expanded={promptOptimizerOpen} aria-haspopup="dialog">
                                <PenLine />
                                <span>{translate("shared.create.creationWorkspace.optimize")}</span>
                            </button>
                        </Tooltip>
                    ) : null}
                    <ModelPicker
                        config={props.config}
                        value={props.model}
                        onChange={props.onModelChange}
                        capability={props.mode}
                        requirements={props.modelRequirements}
                        className="creation-model-picker"
                        placeholder={translate("shared.create.creationWorkspace.selectAModel", { v0: String(modeLabels[props.mode]) })}
                        showSelectedPrice={false}
                        showOptionPrices
                        variant="creation"
                    />
                    {props.mode === "video" || (props.mode === "image" && imageSettingsSupported) ? <GenerationSettingsMenu {...props} /> : null}
                    {props.mode === "video" ? <DurationMenu profile={props.videoProfile} seconds={props.seconds} onChange={props.setSeconds} /> : null}
                    {props.mode === "text" ? (
                        <>
                            <Tooltip title={interactionBusy ? translate("shared.create.creationWorkspace.generationInProgressThisToggleTakesEffectOnYourNext") : props.textStreaming ? translate("shared.create.creationWorkspace.streamingEnabled") : translate("shared.create.creationWorkspace.streamingDisabled")}>
                                <button type="button" className="creation-chat-control" aria-pressed={props.textStreaming} disabled={interactionBusy} onClick={() => props.setTextStreaming(!props.textStreaming)}>
                                    <Waves />
                                    <span>{translate("shared.create.creationWorkspace.streaming")}</span>
                                    {props.textStreaming ? <span className="size-1.5 rounded-full bg-blue-400 shrink-0 shadow-sm" /> : null}
                                </button>
                            </Tooltip>
                            <ThinkingControl levels={props.textThinkingLevels} value={props.textThinkingRequest} resolvedLevel={props.textThinkingLevel} onChange={props.setTextThinkingLevel} disabled={interactionBusy} />
                        </>
                    ) : null}
                    {props.prompt.trim() || props.attachments.length || props.references.some((reference) => reference.active) ? (
                        <Tooltip title={translate("shared.create.creationWorkspace.clearPromptAndReferences")}>
                            <button type="button" className="creation-chat-control is-clear" onClick={props.onClearComposer} disabled={interactionBusy} aria-label={translate("shared.create.creationWorkspace.clearPromptAndReferences")}>
                                <Trash2 />
                                <span>{translate("canvasA.outbox.clear")}</span>
                            </button>
                        </Tooltip>
                    ) : null}
                </div>
                <Button
                    type="text"
                    className={`creation-submit ${showCost ? "has-cost" : ""}`}
                    disabled={interactionBusy || !canSubmit}
                    style={
                        {
                            position: "relative",
                            color: "var(--user-ink)",
                        } as CSSProperties
                    }
                    onClick={interactionBusy ? undefined : props.onSubmit}
                    aria-label={actionLabel}
                    title={!canSubmit && !interactionBusy ? translate("shared.create.creationWorkspace.enterYourIdeaToStartGenerating") : actionLabel}
                >
                    {showWorkingGlow ? <WorkingGlow active color="var(--creation-text)" radius="var(--button-radius)" /> : null}
                    {showCost ? (
                        <span className="creation-submit-cost" title={routeQuote ? modelQuoteDescription(routeQuote) : undefined}>
                            <CreditSymbol />
                            <span>{routeQuote?.estimated ? translate("shared.create.creationWorkspace.estimated", { v0: String(formattedCredits) }) : formattedCredits}</span>
                        </span>
                    ) : null}
                    <span className="creation-submit-action" aria-hidden>
                        {showWorkingSpinner ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                        <span>{showWorkingSpinner ? translate("canvasB.mediaVersion.generating") : translate("account.welcome.start")}</span>
                    </span>
                </Button>
            </footer>
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </SpotlightSurface>
    );
    const composer = embedded ? (
        surface
    ) : (
        <HoverBorderGradient as="div" duration={2.2} containerClassName="creation-composer-shell" className="creation-composer-shell-inner">
            {surface}
        </HoverBorderGradient>
    );

    if (!promptOptimizerOpen) return composer;

    return (
        <Suspense fallback={composer}>
            <CanvasPromptOptimizerDrawer
                open={promptOptimizerOpen}
                prompt={props.prompt}
                generationMode={props.mode === "video" ? "video" : "image"}
                targetModel={modelOptionName(props.model) || props.model}
                targetProtocol={priceChannel.modelCosts?.find((item) => item.model === modelOptionName(props.model))?.protocol || priceChannel.interfaceType}
                config={props.config}
                optimizerModel={props.config.textModel}
                references={optimizerReferences}
                provider={props.promptOptimizerProvider}
                onClose={() => setPromptOptimizerOpen(false)}
                onApply={props.setPrompt}
            >
                {composer}
            </CanvasPromptOptimizerDrawer>
        </Suspense>
    );
}

const creationModeItems: { mode: CreationMode; icon: ReactNode; label: string }[] = [
    { mode: "video", icon: <Film />, label: translate("account.feedback.video") },
    { mode: "image", icon: <ImageIcon />, label: translate("account.feedback.image") },
    { mode: "text", icon: <MessageSquareText />, label: translate("account.settings.modelConfig.capabilities.text") },
];

type CreationModeKey = CreationMode | "agent";

// 首页页签的拉伸滑动：朝目标一侧的边用更硬的弹簧先到，另一侧稍后跟上，页签先拉长再收拢。
const folderTabLeadingSpring = { type: "spring", stiffness: 540, damping: 42, mass: 0.6 } as const;
const folderTabTrailingSpring = { type: "spring", stiffness: 280, damping: 32, mass: 0.8 } as const;

/** 首页创作卡：顶部文件夹页签切换视频 / 图片 / 文本 / Agent，选中页签与下方内容面同色相连。 */
export function CreationModeCard({ mode, agentActive, onModeChange, onAgentSelect, children }: { mode: CreationMode; agentActive: boolean; onModeChange: (mode: CreationMode) => void; onAgentSelect: () => void; children: ReactNode }) {
    const reducedMotion = useReducedMotion();
    const keys: CreationModeKey[] = [...creationModeItems.map((item) => item.mode), "agent"];
    const activeKey: CreationModeKey = agentActive ? "agent" : mode;
    const activeIndex = Math.max(0, keys.indexOf(activeKey));
    // 记住上一次的位置来判断滑动方向；在渲染期调整状态，切换当帧就拿到新方向。
    const [slide, setSlide] = useState({ index: activeIndex, direction: 0 });
    if (slide.index !== activeIndex) setSlide({ index: activeIndex, direction: Math.sign(activeIndex - slide.index) });
    const step = 100 / keys.length;
    const tabTransition: Transition = reducedMotion
        ? { duration: 0 }
        : {
              left: slide.direction < 0 ? folderTabLeadingSpring : folderTabTrailingSpring,
              right: slide.direction > 0 ? folderTabLeadingSpring : folderTabTrailingSpring,
          };
    return (
        <HoverBorderGradient as="div" duration={2.2} containerClassName="creation-mode-card" className="creation-mode-card-inner">
            <div className="creation-mode-folder" role="group" aria-label={translate("shared.create.creationWorkspace.creationMode")} data-active-mode={activeKey} style={{ "--creation-mode-count": keys.length } as CSSProperties}>
                <motion.span className="creation-mode-folder-tab" aria-hidden initial={false} animate={{ left: `${activeIndex * step}%`, right: `${(keys.length - 1 - activeIndex) * step}%` }} transition={tabTransition}>
                    <CreationModeFolderWing side="start" />
                    <CreationModeFolderWing side="end" />
                </motion.span>
                {creationModeItems.map((item) => (
                    <button key={item.mode} type="button" className="creation-mode-folder-button" data-mode={item.mode} aria-pressed={activeKey === item.mode} aria-label={translate("shared.create.creationWorkspace.generation", { v0: String(item.label) })} onClick={() => onModeChange(item.mode)}>
                        {item.icon}
                        <span>{item.label}</span>
                    </button>
                ))}
                <button type="button" className="creation-mode-folder-button" data-mode="agent" aria-pressed={agentActive} onClick={onAgentSelect}>
                    <Orbit />
                    <span>Agent</span>
                    <i className="creation-mode-spark" aria-hidden />
                </button>
            </div>
            <div className="creation-mode-panel">{children}</div>
        </HoverBorderGradient>
    );
}

// 选中页签两侧的 S 形翼片：顶边水平切入、底边水平落到内容面；与页签主体重叠 1px，避免亚像素接缝。
function CreationModeFolderWing({ side }: { side: "start" | "end" }) {
    return (
        <svg className={`creation-mode-folder-wing is-${side}`} viewBox="0 0 30 48" preserveAspectRatio="none" aria-hidden focusable="false">
            <path d="M30 0H28C14 0 14 48 0 48H30Z" />
        </svg>
    );
}

function CreationModeTabs({ mode, onModeChange, orientation = "horizontal" }: { mode: CreationMode; onModeChange: (mode: CreationMode) => void; orientation?: "horizontal" | "vertical" }) {
    const reducedMotion = useReducedMotion();
    const indicator = (pressed: boolean) => (pressed ? <motion.span layoutId={`creation-mode-indicator-${orientation}`} className="creation-mode-indicator" aria-hidden transition={reducedMotion ? { duration: 0 } : aceternityMotion.spring.dock} /> : null);
    return (
        <LayoutGroup id={`creation-mode-tabs-${orientation}`}>
            <div className="creation-mode-tabs" role="group" aria-label={translate("shared.create.creationWorkspace.creationMode")} data-active-mode={mode} data-orientation={orientation} style={{ gridTemplateColumns: orientation === "vertical" ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))" }}>
                {creationModeItems.map((item) => (
                    <button key={item.mode} type="button" className="creation-mode-button" data-mode={item.mode} aria-pressed={item.mode === mode} aria-label={translate("shared.create.creationWorkspace.generation", { v0: String(item.label) })} onClick={() => onModeChange(item.mode)}>
                        {indicator(item.mode === mode)}
                        {item.icon}
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>
        </LayoutGroup>
    );
}

function ModePicker({ mode, onModeChange }: { mode: CreationMode; onModeChange: (mode: CreationMode) => void }) {
    return <CreationModeTabs mode={mode} onModeChange={onModeChange} />;
}

function GenerationSettingsMenu(props: ComposerProps) {
    const [open, setOpen] = useState(false);
    const activeQualityOptions = props.imageProfile.quality.values.map((value) => qualityOptions.find((item) => item.value === value) || { value, label: imageQualityLabel(value), description: translate("shared.create.creationWorkspace.qualityResolutionSupportedByTheModel") });
    const qualityLabel = activeQualityOptions.find((item) => item.value === props.quality)?.label || qualityOptions.find((item) => item.value === props.quality)?.label || props.quality || translate("account.layout.oss.auto");
    // 尺寸/比例/分辨率选项取同显示名分组内全部模型的并集，路由模型只决定发送参数。
    const mergedProfile = mergedImageCapabilityConfig(props.config, props.model || props.config.imageModel);
    const usesImageResolutionPicker = props.mode === "image" && supportsImageResolutionPresets(mergedProfile.size);
    const imageResolutionOptions = usesImageResolutionPicker ? buildImageResolutionOptions(mergedProfile.size.values) : [];
    const ratios = props.videoProfile.ratios;
    const referenceImageSize = props.mode === "image" && mergedProfile.size.allowCustom ? props.referenceImageSize : undefined;
    const referenceImageSizeValue = referenceImageSize ? String(referenceImageSize.width) + "x" + String(referenceImageSize.height) : "";
    const referenceImageSizeLabel = referenceImageSize ? String(referenceImageSize.width) + " × " + String(referenceImageSize.height) : "";
    const referenceImageSizeSelected = Boolean(referenceImageSizeValue && props.ratio === referenceImageSizeValue);
    const resolutions = props.mode === "video" ? props.videoProfile.resolutions.map((value) => ({ value: value.replace(/p$/i, ""), label: videoResolutionLabel(value) })) : resolutionOptions;
    const selectReferenceImageSize = () => {
        if (!referenceImageSizeValue) return;
        props.setRatio(referenceImageSizeValue);
    };
    const videoResolutionSupported = props.mode === "video" && resolutions.length > 0;
    const imageSummary = [
        ...(mergedProfile.size.parameter !== "none" ? [referenceImageSizeSelected ? referenceImageSizeLabel : usesImageResolutionPicker ? formatImageResolutionSize(props.ratio, imageResolutionOptions) : props.ratio] : []),
        ...(props.imageProfile.quality.supported ? [qualityLabel] : []),
        ...(props.imageProfile.maxOutputs > 1 ? [props.count] : []),
    ].join(" · ");
    const videoRatioSupported = props.mode === "video" && ratios.length > 0;
    const summary = props.mode === "video" ? [...(videoRatioSupported ? [props.ratio] : []), ...(videoResolutionSupported ? [videoResolutionLabel(props.videoQuality)] : [])].join(" · ") : imageSummary;
    const panel =
        props.mode === "image" && props.imageProfile.parameters ? (
            <div className="creation-parameter-menu max-h-[65vh] overflow-y-auto">
                <ImageParameterFields
                    profile={props.imageProfile}
                    config={{ ...props.config, model: props.model, size: props.ratio, quality: props.quality, imageResolution: props.imageResolution, imageParameters: props.imageParameters, count: props.count }}
                    onChange={(key, value) => {
                        const setters = {
                            size: props.setRatio,
                            quality: props.setQuality,
                            imageResolution: props.setImageResolution,
                            imageParameters: props.setImageParameters,
                            count: props.setCount,
                            transparentBackground: props.setTransparentBackground,
                        };
                        setters[key](value);
                    }}
                />
            </div>
        ) : (
            <div className="creation-parameter-menu">
                {props.mode === "image" ? (
                    <ImageSizePicker
                        profile={mergedProfile}
                        size={props.ratio}
                        quality={props.quality}
                        imageResolution={props.imageResolution}
                        onChange={(size, quality, resolution) => {
                            props.setRatio(size);
                            if (quality) props.setQuality(quality);
                            if (resolution) props.setImageResolution(resolution);
                        }}
                    />
                ) : videoRatioSupported ? (
                    <SettingSection title={translate("shared.create.creationWorkspace.frameSize")} value={props.ratio}>
                        <div className="creation-choice-grid is-ratio">
                            {ratios.map((value) => (
                                <button key={value} type="button" aria-pressed={value === props.ratio} className={value === props.ratio ? "is-selected" : ""} onClick={() => props.setRatio(value)}>
                                    <span className="creation-ratio-preview">
                                        <span style={ratioPreviewStyle(value)} />
                                    </span>
                                    <span>{value}</span>
                                </button>
                            ))}
                        </div>
                    </SettingSection>
                ) : null}
                {props.mode === "image" && referenceImageSizeValue ? (
                    <button type="button" className="creation-custom-trigger" onClick={selectReferenceImageSize}>
                        {translate("shared.create.creationWorkspace.useReferenceImageDimensions")} {referenceImageSizeLabel}
                    </button>
                ) : null}
                {props.mode === "video" ? (
                    videoResolutionSupported ? (
                        <SettingSection title={translate("shared.create.creationWorkspace.sharpness")} value={videoResolutionLabel(props.videoQuality)}>
                            <div className="creation-choice-grid is-resolution">
                                {resolutions.map((option) => (
                                    <button key={option.value} type="button" aria-pressed={option.value === props.videoQuality} className={option.value === props.videoQuality ? "is-selected" : ""} onClick={() => props.setVideoQuality(option.value)}>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </SettingSection>
                    ) : null
                ) : (
                    <>
                        {props.imageProfile.quality.supported && !imageResolutionUsesQuality(mergedProfile) ? (
                            <SettingSection title={activeQualityOptions.some((item) => item.value === "1k" || item.value === "2k") ? translate("library.tasks.params.resolution") : translate("shared.create.creationWorkspace.imageQuality")} value={qualityLabel}>
                                <div className="creation-choice-grid is-quality">
                                    {activeQualityOptions.map((option) => (
                                        <button key={option.value} type="button" aria-pressed={option.value === props.quality} className={option.value === props.quality ? "is-selected" : ""} onClick={() => props.setQuality(option.value)}>
                                            <span>{option.label}</span>
                                            <small>{option.description}</small>
                                        </button>
                                    ))}
                                </div>
                            </SettingSection>
                        ) : null}
                        {props.imageProfile.maxOutputs > 1 ? (
                            <SettingSection title={translate("shared.create.creationWorkspace.imageCount")} value={translate("shared.create.creationWorkspace.images", { v0: String(props.count) })}>
                                <div className="creation-parameter-content">
                                    <div className="creation-choice-grid is-count">
                                        {countOptions
                                            .filter((option) => Number(option) <= props.imageProfile.maxOutputs)
                                            .map((option) => (
                                                <button key={option} type="button" aria-pressed={option === props.count} className={option === props.count ? "is-selected" : ""} onClick={() => props.setCount(option)}>
                                                    {option}
                                                </button>
                                            ))}
                                    </div>
                                    <label className="creation-custom-value">
                                        <span>{translate("account.settings.models.scopeCustom")}</span>
                                        <input
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={props.count}
                                            onChange={(event) => props.setCount(String(Math.max(1, Math.min(props.imageProfile.maxOutputs, Number(event.target.value) || 1))))}
                                            aria-label={translate("shared.create.creationWorkspace.imageCountFrom1To", { v0: String(props.imageProfile.maxOutputs) })}
                                        />
                                        <em>{translate("canvasA.characterLibrary.pageItem")}</em>
                                    </label>
                                </div>
                            </SettingSection>
                        ) : null}
                    </>
                )}
            </div>
        );
    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            trigger="click"
            placement="bottom"
            arrow={false}
            classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface", content: "creation-control-popover-content" }}
            content={panel}
        >
            <button type="button" className="creation-chat-control" aria-label={translate("shared.create.creationWorkspace.generationSettings", { v0: String(summary) })}>
                <SlidersHorizontal />
                <span>{summary}</span>
                <ChevronDown className={open ? "is-open" : ""} />
            </button>
        </Popover>
    );
}

function SettingSection({ title, value, children }: { title: string; value?: string; children: ReactNode }) {
    return (
        <section className="creation-parameter-section">
            <header>
                <h3>{title}</h3>
                {value ? <span>{value}</span> : null}
            </header>
            {children}
        </section>
    );
}

// 首页与 Agent 共用离散档位滑条，保留模型默认意图，不把它提前固化为某个档位。
function ThinkingControl({ levels, value, resolvedLevel, onChange, disabled }: { levels: ThinkingLevel[]; value: ThinkingRequest; resolvedLevel: ThinkingLevel | ""; onChange: (value: ThinkingRequest) => void; disabled: boolean }) {
    if (!levels.length) return null;
    return (
        <div className="creation-thinking-inline">
            <ThinkingLevelSlider levels={levels} value={value} resolvedLevel={resolvedLevel} onChange={onChange} disabled={disabled} />
        </div>
    );
}

function DurationMenu({ profile, seconds, onChange }: { profile: VideoCapabilityConfig; seconds: string; onChange: (value: string) => void }) {
    const [open, setOpen] = useState(false);
    const value = Number(normalizeVideoValue(profile, { seconds }).seconds);
    const presets = profile.duration.selection === "enum" ? videoDurationOptions(profile) : [];
    const fallbackPreset = presets.length ? presets : [profile.duration.default];
    const min = profile.duration.selection === "range" ? profile.duration.min || 1 : Math.min(...fallbackPreset);
    const max = profile.duration.selection === "range" ? Math.max(min, profile.duration.max || min) : Math.max(...fallbackPreset);
    const step = Math.max(1, profile.duration.step || 1);
    const durationControl =
        profile.duration.selection === "range" ? (
            <>
                <input className="h-8 w-full" style={{ accentColor: "var(--creation-text)" }} type="range" min={min} max={max} step={step} value={value} aria-label={translate("shared.create.creationWorkspace.videoDurationSeconds")} onChange={(event) => onChange(event.target.value)} />
                <div className="flex justify-between px-0.5 text-[var(--fs-tiny)] text-[var(--creation-muted)]">
                    <span>{min}s</span>
                    <span>{max}s</span>
                </div>
                <label className="creation-custom-value is-duration">
                    <span>{translate("shared.create.creationWorkspace.customDuration")}</span>
                    <span className="creation-duration-custom-field">
                        <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            inputMode="numeric"
                            value={seconds}
                            onFocus={(event) => event.currentTarget.select()}
                            onBlur={() => onChange(String(value))}
                            onChange={(event) => onChange(event.target.value)}
                            aria-label={translate("shared.create.creationWorkspace.customVideoDurationInSeconds")}
                        />
                        <em>{translate("account.settings.models.unitSecond")}</em>
                    </span>
                </label>
            </>
        ) : (
            <div className="creation-duration-choices">
                {presets.map((item) => (
                    <button key={item} type="button" className={item === value ? "is-selected" : ""} onClick={() => onChange(String(item))}>
                        {item}s
                    </button>
                ))}
            </div>
        );
    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            trigger="click"
            placement="bottom"
            arrow={false}
            classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface", content: "creation-control-popover-content" }}
            content={
                <div className="creation-duration-menu">
                    <div className="creation-duration-heading">
                        <span>{translate("canvasA.assetView.duration")}</span>
                        <strong>{value} {translate("account.settings.models.unitSecond")}</strong>
                    </div>
                    {durationControl}
                </div>
            }
        >
            <button type="button" className="creation-chat-control is-duration" aria-label={translate("shared.create.creationWorkspace.videoDurationSeconds2", { v0: String(value) })}>
                <Clock3 />
                <span>{value}s</span>
                <ChevronDown className={open ? "is-open" : ""} />
            </button>
        </Popover>
    );
}

function ratioPreviewStyle(value: string) {
    const [width, height] = value.replace("x", ":").split(":").map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { width: 10, height: 10 };
    // 画幅容器的可用空间是 14×10；同时计算宽高，避免 CSS 的 max-width/max-height 把宽银幕比例压扁。
    const scale = Math.min(14 / width, 10 / height);
    return { width: Math.max(4, Math.round(width * scale)), height: Math.max(4, Math.round(height * scale)) };
}
