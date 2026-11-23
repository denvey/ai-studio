import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ChevronDown, Coins } from "lucide-react";
import { Popover } from "antd";
import { usePopoverAnchorAlign } from "@/hooks/use-popover-anchor-align";

import { imageQualityLabel } from "@/lib/image-quality";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { modelCapabilityConfigFor, videoDurationOptions } from "@/lib/model-capabilities";
import { formatPriceRange, modelQuoteDescription, modelQuoteRequest, normalizeTierResolution, priceTierSummaryLabel, priceTiersForCurrentSelection, referenceVideoBillingLabel, tokenPriceRuleDescription } from "@/lib/model-pricing";
import { compatibleModelInGroup, configuredModelDisplayName, modelCompatibilityError, resolveCompatibleModel, type ModelRequirements } from "@/lib/model-selection";
import { groupModelsForPicker, isDirectSystemModel, modelChannelLabel, modelPickerGroupScopeLabel, type ModelPickerGroup } from "@/lib/model-picker-groups";
import { cn } from "@/lib/utils";
import { modelDisplayName, modelIcon, modelOptionName, resolveModelChannel, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { ModelLogo } from "@/components/model-logo";
import { ModelTags } from "@/components/model-tags";
import { referenceCapabilityTag } from "@/lib/model-tags";
import { quoteModel, type LogicalModelQuote, type PublicChannelModelAvailability } from "@/services/api/logical-models";
import { currentLocale, translate } from "@/i18n";


type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    popoverClassName?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
    showSelectedPrice?: boolean;
    showOptionPrices?: boolean;
    variant?: "default" | "creation";
    requirements?: ModelRequirements;
    showConfiguredModelName?: boolean;
    modelFilter?: (model: string) => boolean;
    /** 调用方额外的不可选原因（例如短剧只能用平台模型）；返回非空串时选项置灰并显示原因。 */
    modelDisabledReason?: (model: string) => string;
};

export function ModelPicker({
    config,
    value,
    onChange,
    capability,
    className,
    popoverClassName,
    fullWidth = false,
    placeholder = translate("shared.modelPicker.selectModel"),
    onMissingConfig,
    showSelectedPrice = true,
    showOptionPrices = showSelectedPrice,
    variant = "creation",
    requirements,
    showConfiguredModelName = false,
    modelFilter,
    modelDisabledReason,
}: ModelPickerProps) {
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const pickerId = useId();
    // 双保险：即使 store merge 写出非法 theme，这里也兜底到 dark，避免 "reading 'node'" 崩溃
    const rawTheme = useActiveTheme();
    const theme = (canvasThemes[rawTheme as keyof typeof canvasThemes] ?? canvasThemes.dark) as CanvasTheme;
    const [open, setOpen] = useState(false);
    const popoverRef = usePopoverAnchorAlign(open);
    const [availableHeight, setAvailableHeight] = useState(0);
    const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    // 画布编辑器里的弹窗要和节点面板同色；其余入口跟随工作台浮层表面。
    const [inSpatialWorkspace, setInSpatialWorkspace] = useState(false);
    useLayoutEffect(() => {
        setInSpatialWorkspace(Boolean(triggerRef.current?.closest(".app-spatial-workspace")));
    }, []);
    const options = useMemo(() => Array.from(new Set(selectableModelsByCapability(config, capability).filter((model) => Boolean(model) && (!modelFilter || modelFilter(model))))), [capability, config, modelFilter]);
    const optionGroups = useMemo(() => groupModelsForPicker(config, options), [config, options]);
    const storedCurrent = value?.trim() || "";
    // 参数档位会在选中模型后由调用方归一到其能力配置，不能因为旧模型留下的参数而禁止切换。
    const selectionRequirements = requirements ? { ...requirements, videoSeconds: undefined, imageSize: undefined, options: undefined } : undefined;
    const resolvedCurrent = isDirectSystemModel(config, storedCurrent) ? storedCurrent : resolveCompatibleModel(config, storedCurrent, selectionRequirements) || storedCurrent;
    // 旧画布可能保存过已下架或前端历史内置模型；它们不能重新进入当前可选目录。
    const current = options.includes(resolvedCurrent) ? resolvedCurrent : "";
    const currentPrice = modelMenuPrice(config, current, capability, false, requirements);
    const quoteRequest = useMemo(() => modelQuoteRequest(config, current, capability, requirements), [capability, config, current, requirements]);
    const [routeQuote, setRouteQuote] = useState<LogicalModelQuote | undefined>();
    const creationVariant = variant === "creation";
    const currentChannel = current ? resolveModelChannel(config, current) : undefined;
    const isCurrentCustomChannel = Boolean(current && currentChannel && currentChannel.scope !== "system");

    useLayoutEffect(() => {
        if (!open) return;
        const updateAvailableHeight = () => {
            const { top, bottom } = triggerRef.current!.getBoundingClientRect();
            setAvailableHeight(Math.max(top, window.innerHeight - bottom));
        };
        updateAvailableHeight();
        window.addEventListener("resize", updateAvailableHeight);
        window.addEventListener("scroll", updateAvailableHeight, true);
        return () => {
            window.removeEventListener("resize", updateAvailableHeight);
            window.removeEventListener("scroll", updateAvailableHeight, true);
        };
    }, [open]);

    useEffect(() => {
        if (!showSelectedPrice || !creditsEnabled || !quoteRequest) {
            setRouteQuote(undefined);
            return;
        }
        const controller = new AbortController();
        setRouteQuote(undefined);
        quoteModel(quoteRequest, controller.signal)
            .then((payload) => setRouteQuote(payload.quote))
            .catch(() => {
                if (!controller.signal.aborted) setRouteQuote(undefined);
            });
        return () => controller.abort();
    }, [creditsEnabled, quoteRequest, showSelectedPrice]);

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    useEffect(() => {
        if (!open) return;
        // 画布拖拽从 pointerdown 开始，须在捕获阶段关闭 Portal 菜单，避免菜单与触发器分离。
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    }, [open]);

    const setPickerOpen = (nextOpen: boolean) => {
        if (nextOpen && !options.length) onMissingConfig?.();
        if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
        if (nextOpen) {
            setActiveGroupKey(optionGroups.find((group) => group.models.some((item) => item.models.includes(current)))?.key ?? null);
        }
        setOpen(nextOpen);
    };
    const focusMenuOption = (last = false) => {
        window.requestAnimationFrame(() => {
            const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>("[data-model-picker-item]:not(:disabled)");
            const target = last ? buttons?.item((buttons?.length || 1) - 1) : buttons?.item(0);
            focusPickerOption(target);
        });
    };
    const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        setPickerOpen(true);
        focusMenuOption(event.key === "ArrowUp");
    };
    const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus({ preventScroll: true });
            return;
        }
        if (event.key === "ArrowLeft" && activeGroupKey !== null) {
            event.preventDefault();
            setActiveGroupKey(null);
            focusMenuOption();
            return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-model-picker-item]:not(:disabled)"));
        if (!buttons.length) return;
        event.preventDefault();
        const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowUp" ? Math.max(0, activeIndex - 1) : Math.min(buttons.length - 1, activeIndex + 1);
        focusPickerOption(buttons[nextIndex]);
    };
    const content = (
        <div
            ref={menuRef}
            data-canvas-no-zoom
            className={cn("canvas-model-picker-menu creation-model-picker-menu max-w-[calc(100vw-24px)]", activeGroupKey === null ? "is-brand-list" : "is-model-list")}
            style={{ "--canvas-model-picker-available-height": `${availableHeight}px` } as CSSProperties}
            role="listbox"
            aria-label={placeholder}
            onKeyDown={handleMenuKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {optionGroups.length ? (
                activeGroupKey === null ? (
                    <div className="canvas-model-picker-brands" aria-label={translate("shared.modelPicker.selectProductModel")}>
                        {optionGroups.map((group) => {
                            const groupCurrent = group.models.find((item) => item.models.includes(current));
                            return (
                                <button
                                    key={group.key}
                                    type="button"
                                    data-model-picker-item
                                    className={cn("canvas-model-picker-brand", groupCurrent && "is-active")}
                                    aria-pressed={Boolean(groupCurrent)}
                                    onClick={() => {
                                        setActiveGroupKey(group.key);
                                        focusMenuOption();
                                    }}
                                >
                                    <span className="canvas-model-picker-brand-icon">
                                        <ModelLogo icon={group.icon} size={22} />
                                    </span>
                                    <span className="canvas-model-picker-brand-copy">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <strong className="truncate">{group.label}</strong>
                                            {group.scope === "personal" ? (
                                                <span className="shrink-0 rounded px-2 py-0.5 text-[var(--fs-label)] font-medium leading-none bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">{translate("shared.modelPicker.personalChannels")}</span>
                                            ) : null}
                                        </span>
                                        <small className="canvas-model-picker-brand-meta">
                                            <span className="canvas-model-picker-brand-subtext">
                                                {group.models.length} {translate("shared.modelPicker.items")}{group.kind === "product" ? translate("shared.modelPicker.channel") : translate("canvasA.assetView.model")}
                                                {group.scope ? ` · ${modelPickerGroupScopeLabel(group.scope)}` : ""}
                                            </span>
                                            <ModelRecentHealthTrack availability={groupAvailability(config, group)} />
                                        </small>
                                    </span>
                                    <ChevronDown className="canvas-model-picker-brand-arrow" aria-hidden="true" />
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="canvas-model-picker-two-pane">
                        <div className="canvas-model-picker-brand-rail" aria-label={translate("shared.modelPicker.productModels")}>
                            {optionGroups.map((group) => {
                                return (
                                    <button key={group.key} type="button" className={cn("canvas-model-picker-brand", activeGroupKey === group.key && "is-active")} aria-pressed={activeGroupKey === group.key} onClick={() => setActiveGroupKey(group.key)}>
                                        <span className="canvas-model-picker-brand-icon">
                                            <ModelLogo icon={group.icon} size={22} />
                                        </span>
                                        <span className="canvas-model-picker-brand-copy">
                                            <span className="flex items-center gap-2 min-w-0">
                                                <strong className="truncate">{group.label}</strong>
                                                {group.scope === "personal" ? (
                                                    <span className="shrink-0 rounded px-2 py-0.5 text-[var(--fs-label)] font-medium leading-none bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">{translate("shared.modelPicker.personalChannels")}</span>
                                                ) : null}
                                            </span>
                                            <small className="canvas-model-picker-brand-meta">
                                                <span className="canvas-model-picker-brand-subtext">
                                                    {group.models.length} {translate("shared.modelPicker.items")}{group.kind === "product" ? translate("shared.modelPicker.channel") : translate("canvasA.assetView.model")}
                                                    {group.scope ? ` · ${modelPickerGroupScopeLabel(group.scope)}` : ""}
                                                </span>
                                                <ModelRecentHealthTrack availability={groupAvailability(config, group)} />
                                            </small>
                                        </span>
                                        <ChevronDown className="canvas-model-picker-brand-arrow" aria-hidden="true" />
                                    </button>
                                );
                            })}
                        </div>
                        {optionGroups
                            .filter((group) => group.key === activeGroupKey)
                            .map((group) => (
                                <section key={group.key} className="canvas-model-picker-group canvas-model-picker-model-pane min-w-0">
                                    <div className="grid min-w-0 gap-1">
                                        {group.models.map((modelGroup) => {
                                            const selected = modelGroup.models.includes(current);
                                            const usable = modelDisabledReason ? modelGroup.models.filter((item) => !modelDisabledReason(item)) : modelGroup.models;
                                            const model = usable.length ? compatibleModelInGroup(config, usable, selectionRequirements, selected ? current : undefined) : undefined;
                                            const displayModel = model || (selected ? current : modelGroup.models[0]);
                                            const disabledReason = model
                                                ? ""
                                                : usable.length
                                                  ? modelCompatibilityError(config, usable[0], selectionRequirements) || translate("shared.modelPicker.theCurrentInputDoesNotMatchThisModelSCapabilities")
                                                  : modelDisabledReason?.(modelGroup.models[0]) || translate("shared.modelPicker.thisModelIsUnavailable");
                                            return (
                                                <button
                                                    key={modelGroup.key}
                                                    type="button"
                                                    data-model-picker-item
                                                    role="option"
                                                    aria-selected={selected}
                                                    aria-disabled={Boolean(disabledReason)}
                                                    disabled={Boolean(disabledReason)}
                                                    className="canvas-model-picker-option disabled:cursor-not-allowed disabled:opacity-45"
                                                    style={{ background: selected ? theme.toolbar.activeBg : "transparent", color: theme.node.text }}
                                                    onClick={() => {
                                                        if (!model) return;
                                                        onChange(model);
                                                    }}
                                                >
                                                    <ModelLabel
                                                        config={config}
                                                        model={displayModel}
                                                        capability={capability}
                                                        theme={theme}
                                                        creationVariant
                                                        showConfiguredModelName={showConfiguredModelName}
                                                        label={group.kind === "product" ? modelGroup.label : undefined}
                                                        requirements={requirements}
                                                        showPrice={showOptionPrices && creditsEnabled}
                                                        disabledReason={disabledReason}
                                                        showDescription
                                                    />
                                                    <span className="canvas-model-picker-option-check ml-1 shrink-0" aria-hidden="true">
                                                        {selected ? <Check className="size-full" style={{ color: theme.node.activeStroke }} /> : null}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                    </div>
                )
            ) : (
                <div className="canvas-model-picker-empty" style={{ color: theme.node.muted }}>
                    {emptyModelLabel(config, capability)}
                </div>
            )}
        </div>
    );

    return (
        <div className={cn(fullWidth ? "w-full min-w-0" : "w-fit max-w-full")} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <Popover
                ref={popoverRef}
                open={open}
                onOpenChange={setPickerOpen}
                trigger="click"
                placement="bottomLeft"
                align={{ overflow: { adjustY: true, shiftX: true } }}
                arrow={false}
                motion={{ motionName: "" }}
                content={content}
                classNames={{
                    root: cn("canvas-model-picker-popover", "creation-model-picker-popover", popoverClassName),
                    container: cn("canvas-composer-popover-surface", "creation-model-picker-surface"),
                    content: "canvas-composer-popover-content",
                }}
                // 弹窗与发起它的输入框同一表面：画布入口取节点面板色，工作台入口回退到 --user-surface-raised（model-picker.css）。
                styles={{
                    container: (!inSpatialWorkspace
                        ? {}
                        : {
                              "--model-picker-surface": theme.node.panel,
                              "--model-picker-ink": theme.node.text,
                              "--model-picker-edge": theme.toolbar.border,
                          }) as CSSProperties,
                }}
            >
                <button
                    ref={triggerRef}
                    type="button"
                    className={cn("canvas-composer-model-picker", fullWidth ? "w-full" : "min-w-36 max-w-full", className)}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label={placeholder}
                    title={current ? pickerModelOptionLabel(config, current, showConfiguredModelName) : placeholder}
                    onKeyDown={handleTriggerKeyDown}
                >
                    <span className="canvas-model-picker-label flex min-w-0 items-center gap-2">
                        <span className="canvas-model-picker-trigger-icon">
                            <ModelIcon config={config} model={current} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{current ? (creationVariant ? pickerModelDisplayName(config, current, showConfiguredModelName) : pickerModelOptionLabel(config, current, showConfiguredModelName)) : placeholder}</span>
                        {isCurrentCustomChannel ? <span className="shrink-0 rounded px-2 py-0.5 text-[var(--fs-label)] font-medium leading-none bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">{translate("shared.modelPicker.personal")}</span> : null}
                        {showSelectedPrice && creditsEnabled ? <ModelPrice price={currentPrice} quote={routeQuote} compact /> : null}
                    </span>
                    <ChevronDown className={cn("canvas-model-picker-chevron", open && "is-open")} aria-hidden="true" />
                </button>
            </Popover>
        </div>
    );
}

function focusPickerOption(target: HTMLButtonElement | null | undefined) {
    if (!target) return;
    target.focus({ preventScroll: true });
    // Only reveal the focused row inside its pane; scrolling portal ancestors moves the page.
    const pane = target.closest<HTMLElement>(".canvas-model-picker-model-pane, .canvas-model-picker-menu");
    if (!pane) return;
    const row = target.getBoundingClientRect();
    const top = pane.getBoundingClientRect().top + pane.clientTop;
    const bottom = top + pane.clientHeight;
    const delta = row.top < top ? row.top - top : row.bottom > bottom ? row.bottom - bottom : 0;
    if (delta) pane.scrollTop += delta;
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    const label = capability === "image" ? translate("shared.auth.requireFeature.generateImage") : capability === "video" ? translate("account.feedback.video") : capability === "text" ? translate("account.settings.modelConfig.capabilities.text") : capability === "audio" ? translate("account.settings.modelConfig.capabilities.audio") : "";
    if (capability && config.models.length) return translate("shared.modelPicker.noModelSupportsTheCurrentInput", { v0: String(label) });
    return config.models.length ? translate("shared.modelPicker.noMatchingModels", { v0: String(label) }) : translate("shared.modelPicker.noModelAvailableContactAnAdministratorOrCheckModelSettings");
}

export function ModelLabel({
    config,
    model,
    capability,
    theme,
    creationVariant,
    showConfiguredModelName,
    label,
    requirements,
    showPrice,
    disabledReason,
    showDescription,
}: {
    config: AiConfig;
    model: string;
    capability?: ModelCapability;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    creationVariant: boolean;
    showConfiguredModelName: boolean;
    label?: string;
    requirements?: ModelRequirements;
    showPrice: boolean;
    disabledReason?: string;
    showDescription: boolean;
}) {
    const meta = modelMenuMeta(model, capability);
    const channel = resolveModelChannel(config, model);
    const logicalCost = channel.modelCosts?.find((item) => item.model === modelOptionName(model));
    const logicalSpec = logicalCost?.logicalCapabilitySpec;
    const videoProfile = capability === "video" ? modelCapabilityConfigFor(config, model).video : undefined;
    const videoSummary = videoProfile ? [videoProfile.durationSupported === false ? "" : formatDurationSummary(videoProfile), videoProfile.resolutions.map((item) => item.toUpperCase()).join("/")].filter(Boolean).join(" · ") : "";
    // 文本模型同样标出能识别几张图、几个视频；未开启识图 / 视频识别时上限为 0，不出标签。
    const textReferences = capability === "text" ? modelCapabilityConfigFor(config, model).text?.references : undefined;
    const capabilityTag = referenceCapabilityTag(videoProfile?.references ?? textReferences);
    const modelTags = capabilityTag ? [capabilityTag, ...(logicalCost?.tags || [])] : logicalCost?.tags;
    // 只给能挂参考视频的视频模型标注；不收参考视频的模型写“参考视频不计费”会误导。
    const referenceLabel = channel.scope === "system" && (videoProfile?.references?.maxVideos ?? 0) > 0 ? referenceVideoBillingLabel(logicalCost) : "";
    const capabilitySummary = disabledReason || logicalCost?.description?.trim() || (isDirectSystemModel(config, model) ? "" : logicalSpec ? logicalCapabilitySummary(logicalSpec) : videoProfile ? videoSummary : meta.description);
    return (
        <span className="flex w-full min-w-0 items-center gap-2 overflow-hidden py-0">
            <span className="canvas-model-picker-option-logo grid size-6 shrink-0 place-items-center">
                <ModelIcon config={config} model={model} />
            </span>
            <span className="min-w-0 flex-1 overflow-hidden">
                <span className="canvas-model-picker-option-heading">
                    <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        <span className="canvas-model-picker-option-name text-[var(--fs-label)] font-medium leading-none truncate !flex-initial max-w-full" title={label || pickerModelDisplayName(config, model, showConfiguredModelName)}>
                            {label || pickerModelDisplayName(config, model, showConfiguredModelName)}
                        </span>
                        {channel.scope !== "system" ? <span className="shrink-0 rounded px-2 py-0.5 text-[var(--fs-label)] font-medium leading-none bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">{translate("shared.modelPicker.personal")}</span> : null}
                    </span>
                    {showPrice ? (
                        <span className="canvas-model-picker-option-price">
                            {/* 候选模型展示自身价目；当前参数的精确报价只在选中后的触发器显示。 */}
                            <ModelPrice price={modelMenuPrice(config, model, capability, true, requirements)} />
                            {referenceLabel ? <span className="canvas-model-picker-reference-billing">{referenceLabel}</span> : null}
                        </span>
                    ) : null}
                    <ModelAvailabilityBadge availability={modelAvailability(config, model)} available={logicalCost?.available ?? true} showAvailability={channel.scope === "system"} />
                </span>
                <span className={cn("canvas-model-picker-description mt-1 block", showDescription && "is-visible")} style={{ color: theme.node.muted }}>
                    {capabilitySummary}
                </span>
                <ModelTags tags={modelTags} />
            </span>
            {!creationVariant && meta.time ? (
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[var(--fs-tiny)] tabular-nums" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}>
                    {meta.time}
                </span>
            ) : null}
        </span>
    );
}

function logicalCapabilitySummary(spec: NonNullable<NonNullable<AiConfig["channels"][number]["modelCosts"]>[number]["logicalCapabilitySpec"]>) {
    const operationLabels: Record<string, string> = {
        text_to_video: translate("shared.modelPicker.textToVideo"),
        image_to_video: translate("shared.modelPicker.imageToVideo"),
        reference_to_video: translate("shared.modelPicker.multimodalReferences"),
        audio_to_video: translate("shared.modelPicker.audioToVideo"),
        extend: translate("shared.modelPicker.videoContinuation"),
        inpaint: translate("shared.modelPicker.localEdit"),
        replace_element: translate("shared.modelPicker.elementReplacement"),
        camera_motion: translate("shared.modelPicker.cameraMoveAdjustment"),
        style_transfer: translate("shared.modelPicker.styleTransfer"),
    };
    const inputLabels: Record<string, { label: string; unit: string }> = {
        image: { label: spec.capability === "text" ? translate("shared.modelPicker.imageUnderstanding") : translate("shared.workflowFieldMappingEditor.referenceImage"), unit: translate("canvasA.characterLibrary.pageItem") },
        video: { label: spec.capability === "text" ? translate("shared.modelPicker.videoUnderstanding") : translate("library.tasks.params.referenceVideos"), unit: translate("shared.modelPicker.items") },
        audio: { label: translate("library.tasks.params.referenceAudios"), unit: translate("shared.modelPicker.items") },
        mask: { label: translate("shared.modelPicker.mask"), unit: translate("canvasA.characterLibrary.pageItem") },
    };
    const optionLabels: Record<string, string> = {
        size: translate("shared.modelPicker.aspectRatio"),
        aspectRatio: translate("shared.modelPicker.aspectRatio"),
        quality: translate("shared.modelPicker.generationQuality"),
        count: translate("shared.modelPicker.outputCount"),
        videoSeconds: translate("shared.modelPicker.videoDuration"),
        duration: translate("shared.modelPicker.videoDuration"),
        vquality: translate("shared.modelPicker.outputResolution"),
        resolution: translate("shared.modelPicker.outputResolution"),
        audioVoice: translate("library.tasks.params.voice"),
        audioFormat: translate("library.tasks.params.audioFormat"),
        audioSpeed: translate("shared.modelPicker.speed"),
    };
    const values: string[] = [];
    values.push(...(spec.operations || []).map((operation) => operationLabels[operation] || operation));
    for (const [name, constraint] of Object.entries(spec.inputs || {})) {
        if (constraint.max <= 0) continue;
        const definition = inputLabels[name];
        if (!definition) continue;
        values.push(spec.capability === "text" ? translate("shared.modelPicker.supports", { v0: String(definition.label) }) : translate("shared.modelPicker.upTo", { v0: String(definition.label), v1: String(constraint.max), v2: String(definition.unit) }));
    }
    for (const [name, constraint] of Object.entries(spec.options || {})) {
        const label = optionLabels[name];
        if (!label) continue;
        if (constraint.values?.length) values.push(`${label} ${constraint.values.map(publicScalarLabel).join("/")}`);
        else if (constraint.min !== undefined && constraint.max !== undefined) values.push(`${label} ${constraint.min}-${constraint.max}`);
    }
    return values.slice(0, 2).join(" · ") || translate("shared.modelPicker.automaticallyMatchTheCurrentInput");
}

function publicScalarLabel(value: unknown) {
    if (value === true) return translate("shared.modelCapabilityEditor.supported");
    if (value === false) return translate("common.close");
    return String(value);
}

function formatDurationSummary(profile: NonNullable<ReturnType<typeof modelCapabilityConfigFor>["video"]>) {
    const values = videoDurationOptions(profile);
    if (profile.duration.selection === "enum") return values.map((item) => `${item}s`).join("/");
    return `${profile.duration.min || values[0]}-${profile.duration.max || values[values.length - 1]}s`;
}

type ModelMenuPrice = { kind: "tiers"; label: string; compactLabel: string; title: string } | { kind: "estimate"; label?: string; title?: string } | { kind: "fixed"; value: number; unit: string };

function modelMenuPrice(config: AiConfig, model: string, capability?: ModelCapability, summary = false, requirements?: ModelRequirements): ModelMenuPrice | null | undefined {
    if (!model) return undefined;
    const channel = resolveModelChannel(config, model);
    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(model));
    if (!cost) return channel.scope === "system" ? null : undefined;
    if (cost.pricePolicy === "channel") {
        const tiers = cost.logicalPriceTiers || [];
        if (!tiers.length) return null;
        const matched = summary ? tiers : priceTiersForCurrentSelection(tiers, capability, config, requirements);
        if (!summary && !matched.length) return { kind: "tiers", label: translate("shared.modelPicker.noPriceAvailableForTheseSettings"), compactLabel: translate("shared.modelPicker.noPriceAvailableForTheseSettings"), title: translate("shared.modelPicker.adjustTheSettingsOrChooseAChannelThatSupportsThem") };
        return channelTierPriceSummary(matched.length ? matched : tiers, tiers, capability);
    }
    if (cost.billingMode === "token") {
        const rate = cost.outputTokenPriceMicrocredits;
        return capability === "video" && typeof rate === "number" && Number.isFinite(rate) && rate >= 0
            ? { kind: "estimate", label: formatPriceRange([rate / 1_000_000], translate("shared.modelPicker.creditsMillionVideoTokens")), title: translate("shared.modelPicker.estimatedFromTheVideoTokenRateBillingUsesValidProvider") }
            : { kind: "estimate" };
    }
    return { kind: "fixed", value: cost.unitPriceMicrocredits / 1_000_000, unit: cost.billingMode === "per_second" ? translate("account.settings.models.unitSecond") : translate("account.settings.models.unitCall") };
}

function pickerModelDisplayName(config: AiConfig, model: string, showConfiguredModelName: boolean) {
    const name = showConfiguredModelName ? configuredModelDisplayName(config, model) : modelDisplayName(config, model);
    return isDirectSystemModel(config, model) ? `${name} · ${modelChannelLabel(config, model)}` : name;
}

function pickerModelOptionLabel(config: AiConfig, model: string, showConfiguredModelName: boolean) {
    const displayName = showConfiguredModelName ? configuredModelDisplayName(config, model) : modelDisplayName(config, model);
    const channel = resolveModelChannel(config, model);
    return channel.scope === "system" ? pickerModelDisplayName(config, model, showConfiguredModelName) : `${displayName}（${channel.name}）`;
}

function channelTierPriceSummary(
    visibleTiers: NonNullable<NonNullable<AiConfig["channels"][number]["modelCosts"]>[number]["logicalPriceTiers"]>,
    allTiers: NonNullable<NonNullable<AiConfig["channels"][number]["modelCosts"]>[number]["logicalPriceTiers"]>,
    capability?: ModelCapability,
): Extract<ModelMenuPrice, { kind: "tiers" }> {
    const label = priceTierSummaryLabel(visibleTiers, capability);
    const ruleNotes = allTiers.flatMap((tier) => tier.tokenPriceRules || []).map(tokenPriceRuleDescription);
    return {
        kind: "tiers",
        label,
        compactLabel: label,
        title: translate("shared.modelPicker.systemPriceForTheseSettings", { v0: String(allTiers.map((tier) => `${tierSpecificationLabel(tier)} ${priceTierSummaryLabel([tier], capability)}`).join("；")), v1: String(allTiers.some((tier) => tier.billingMode === "token") ? (capability === "video" ? translate("shared.modelPicker.validUsageReportedByTheProviderTakesPriorityIfNo") : translate("shared.modelPicker.tokenChargesAreEstimatesFinalBillingUsesTheActualUsage")) : ""), v2: String(ruleNotes.length ? translate("shared.modelPicker.timeAndContextPricingShanghaiTimeTheTimeWindowIs", { v0: String(ruleNotes.join("；")) }) : "") }),
    };
}

function tierResolutionLabel(value: string) {
    const normalized = normalizeTierResolution(value);
    return normalized === "*" ? translate("shared.modelPicker.allResolutions") : normalized.toUpperCase();
}

function tierDurationLabel(seconds: number) {
    return seconds > 0 ? translate("shared.modelPicker.s", { v0: String(seconds) }) : translate("shared.modelPicker.allDurations");
}

function tierSpecificationLabel(tier: NonNullable<NonNullable<AiConfig["channels"][number]["modelCosts"]>[number]["logicalPriceTiers"]>[number]) {
    const selector = tier.selector || {};
    const operationLabels: Record<string, string> = { text_to_image: translate("shared.modelPicker.textToImage"), image_to_image: translate("shared.modelPicker.imageToImage"), text_to_video: translate("shared.modelPicker.textToVideo"), image_to_video: translate("shared.modelPicker.imageToVideo"), video_to_video: translate("shared.modelPicker.videoToVideo") };
    const operation = selector.operation && selector.operation !== "*" ? operationLabels[selector.operation] || selector.operation : "";
    const details = [
        operation,
        selector.quality && selector.quality !== "*" ? imageQualityLabel(selector.quality) : "",
        selector.resolution && selector.resolution !== "*" ? imageQualityLabel(selector.resolution) : "",
        selector.size && selector.size !== "*" ? selector.size : "",
        tier.resolution !== "*" ? tierResolutionLabel(tier.resolution) : "",
        tier.videoSeconds ? tierDurationLabel(tier.videoSeconds) : "",
        selector.imageCount && selector.imageCount !== "*" ? translate("shared.modelPicker.referenceImages", { v0: String(selector.imageCount) }) : "",
        selector.videoGenerateAudio === "true" ? translate("shared.modelPicker.withAudio") : selector.videoGenerateAudio === "false" ? translate("shared.modelPicker.withoutAudio") : "",
    ].filter(Boolean);
    return details.length ? details.join(" / ") : translate("shared.modelPicker.defaultSettings");
}

function ModelPrice({ price, quote, compact = false }: { price: ModelMenuPrice | null | undefined; quote?: LogicalModelQuote; compact?: boolean }) {
    if (quote) {
        const amount = (quote.amountMicrocredits / 1_000_000).toLocaleString(currentLocale(), { maximumFractionDigits: 6 });
        const label = quote.estimated ? translate("shared.create.creationWorkspace.estimated", { v0: String(amount) }) : `${amount}`;
        return (
            <span className="model-picker-price inline-flex shrink-0 items-center gap-1 text-[var(--fs-tiny)] font-semibold tabular-nums" aria-label={modelQuoteDescription(quote)}>
                <Coins className="model-picker-price-icon" aria-hidden="true" />
                {compact ? label : translate("shared.modelPicker.credits", { v0: String(label) })}
            </span>
        );
    }
    if (price === undefined) return null;
    if (price === null) return compact ? null : <span className="shrink-0 text-[var(--fs-tiny)] text-foreground/40">{translate("account.layout.oss.cdnAuthNone")}</span>;
    if (price.kind === "tiers") {
        return (
            <span className="model-picker-price inline-flex shrink-0 items-center gap-1 text-[var(--fs-tiny)] font-semibold tabular-nums">
                <Coins className="model-picker-price-icon" aria-hidden="true" />
                {compact ? price.compactLabel : price.label}
            </span>
        );
    }
    if (price.kind === "estimate") {
        return (
            <span className="model-picker-price inline-flex shrink-0 items-center text-[var(--fs-tiny)] font-semibold">
                <Coins className="model-picker-price-icon" aria-hidden="true" />
                {price.label || translate("shared.modelPicker.usageEstimate")}
            </span>
        );
    }
    return (
        <span className="model-picker-price inline-flex shrink-0 items-center gap-1 text-[var(--fs-tiny)] font-semibold tabular-nums">
            <Coins className="model-picker-price-icon" aria-hidden="true" />
            {price.value.toLocaleString(currentLocale(), { maximumFractionDigits: compact ? 3 : 6 })}
            {compact ? "/" : (" " + translate("shared.modelPicker.credits2"))}
            {price.unit}
        </span>
    );
}

function modelAvailability(config: AiConfig, model: string): PublicChannelModelAvailability | undefined {
    if (!model) return undefined;
    const channel = resolveModelChannel(config, model);
    return channel.modelCosts?.find((item) => item.model === modelOptionName(model))?.availability;
}

function groupAvailability(config: AiConfig, group: ModelPickerGroup): PublicChannelModelAvailability | undefined {
    for (const mg of group.models) {
        for (const m of mg.models) {
            const avail = modelAvailability(config, m);
            if (avail) return avail;
        }
    }
    return undefined;
}

export function ModelRecentHealthTrack({ availability, inPopover = false }: { availability?: PublicChannelModelAvailability; inPopover?: boolean }) {
    const recentResults = availability?.recentResults ?? [];
    const successCount = recentResults.filter(Boolean).length;
    const failCount = recentResults.filter((item) => item === false).length;
    const hasRuns = recentResults.length > 0;
    const title = hasRuns ? translate("shared.modelPicker.lastRequestsSucceededFailed", { v0: String(recentResults.length), v1: String(successCount), v2: String(failCount) }) : translate("shared.modelPicker.noRecentRequests");

    return (
        <span className={cn("model-picker-availability-track", inPopover && "in-popover")} title={title} aria-label={title}>
            {Array.from({ length: 10 }).map((_, idx) => {
                const hasRun = idx < recentResults.length;
                const isSuccess = hasRun ? recentResults[idx] : null;
                const stateClass = isSuccess === true ? "is-success" : isSuccess === false ? "is-failed" : "is-empty";
                return (
                    <span key={idx} className={cn("model-picker-availability-pill", inPopover && "in-popover", stateClass)} title={inPopover ? (hasRun ? translate("shared.modelPicker.attempt", { v0: String(idx + 1), v1: String(isSuccess ? translate("shared.skinThemes.success") : translate("shared.modelPicker.failure")) }) : translate("shared.modelPicker.slotNoRequest", { v0: String(idx + 1) })) : undefined} />
                );
            })}
        </span>
    );
}

function ModelAvailabilityBadge({ availability, available, showAvailability }: { availability?: PublicChannelModelAvailability; available: boolean; showAvailability: boolean }) {
    const [open, setOpen] = useState(false);
    const popoverRef = usePopoverAnchorAlign(open);
    if (!showAvailability) return null;
    const recentResults = availability?.recentResults ?? [];
    const successCount = recentResults.filter(Boolean).length;
    const failCount = recentResults.filter((item) => item === false).length;
    const hasRuns = recentResults.length > 0;

    const label = availability?.dataState === "ready" && availability.rate24h !== null ? `${Math.round(availability.rate24h * 100)}%` : availability?.dataState === "insufficient" ? translate("shared.modelPicker.insufficientData") : translate("shared.modelPicker.noData");
    const trend = availability?.trend7d || [];
    const trendSamples = trend.reduce((total, item) => total + item.sampleCount, 0);
    const summary = hasRuns
        ? translate("shared.modelPicker.lastRequestsSucceededFailedCurrently", { v0: String(recentResults.length), v1: String(successCount), v2: String(failCount), v3: String(available ? translate("account.settings.channels.ready") : translate("shared.modelPicker.unavailable")) })
        : availability
          ? translate("shared.modelPicker.currentlyLast24HoursNoRecentRequests", { v0: String(available ? translate("account.settings.channels.ready") : translate("shared.modelPicker.unavailable")), v1: String(label) })
          : translate("shared.modelPicker.currentlyHistoricalSuccessRateUnavailable", { v0: String(available ? translate("account.settings.channels.ready") : translate("shared.modelPicker.unavailable")) });

    const content = availability ? (
        <div className="model-picker-availability-popover">
            <div className="model-picker-availability-popover-head">
                <strong>{translate("shared.modelPicker.last10Requests")}</strong>
                <span className={failCount > 0 ? "has-failures" : ""}>{hasRuns ? translate("shared.modelPicker.succeededFailed", { v0: String(successCount), v1: String(failCount) }) : translate("shared.modelPicker.noRequestHistory")}</span>
            </div>
            <div className="model-picker-availability-popover-meta">{hasRuns ? translate("shared.modelPicker.lastExecutionsGreenSuccessRedFailureGrayNoRecord", { v0: String(recentResults.length) }) : translate("shared.modelPicker.thisModelHasNoRecentRequestsShowing10EmptySlots")}</div>
            <div style={{ margin: "6px 0 8px" }}>
                <ModelRecentHealthTrack availability={availability} inPopover />
            </div>
            <div className="model-picker-availability-popover-head" style={{ marginTop: 8 }}>
                <strong>{translate("shared.modelPicker.successRateOverTheLast24Hours")}</strong>
                <span>{label}</span>
            </div>
            <div className="model-picker-availability-popover-meta">
                {availability.sampleCount24h} {translate("shared.modelPicker.createAttempts7DaySample")} {trendSamples} {translate("account.layout.pagination.item")}
            </div>
            <div className="model-picker-availability-trend" aria-label={translate("shared.modelPicker.successRateOverTheLast7Days")}>
                {trend.map((item) => {
                    const dayLabel = item.rate === null ? translate("shared.modelPicker.noData") : `${Math.round(item.rate * 100)}%`;
                    return (
                        <span key={item.day} className={`model-picker-availability-segment is-${item.dataState}`} title={translate("shared.modelPicker.records", { v0: String(item.day), v1: String(dayLabel), v2: String(item.sampleCount) })} style={item.rate === null ? undefined : { opacity: 0.35 + item.rate * 0.65 }} />
                    );
                })}
            </div>
            <div className="model-picker-availability-popover-foot">{translate("shared.modelPicker.greenSuccessRedFailureGrayEmpty")}</div>
        </div>
    ) : null;
    return (
        <Popover ref={popoverRef} open={open} onOpenChange={setOpen} content={content} trigger={["hover", "focus"]} placement="topRight" arrow={false}>
            <span
                className={`model-picker-availability is-${availability?.dataState || "unavailable"}`}
                role="img"
                tabIndex={0}
                aria-label={summary}
                title={summary}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <ModelRecentHealthTrack availability={availability} />
                <span className="model-picker-availability-label">{hasRuns ? `${successCount}/${recentResults.length}` : label}</span>
            </span>
        </Popover>
    );
}
function modelMenuMeta(model: string, capability?: ModelCapability): { description: string; time?: string } {
    const name = modelOptionName(model).toLowerCase();
    if (capability === "image") {
        if (name.includes("nano banana") || name.includes("nanobanana") || name.includes("imagen")) return { description: translate("shared.modelPicker.geminiHighQualityImageGenerationSuitedToCharactersAndCommercial") };
        if (name.includes("nano") || name.includes("pro")) return { description: translate("shared.modelPicker.highQualityImageGenerationSuitedToCharactersAndCommercialFinals") };
        if (name.includes("seedream")) return { description: translate("shared.modelPicker.fastOutputGoodForExploringStylesInBulk") };
        if (name.includes("gpt") || name.includes("image")) return { description: translate("shared.modelPicker.generalPurposeImageModelWithReliablePromptUnderstanding") };
        return { description: translate("shared.modelPicker.imageGenerationModel") };
    }
    if (capability === "video") {
        if (name.includes("veo") || name.includes("omni flash") || name.includes("omni-flash")) return { description: translate("shared.modelPicker.geminiShotGenerationAndImageToVideoSuitedToFinishing"), time: "3m" };
        if (name.includes("seedance") || name.includes("sora")) return { description: translate("shared.modelPicker.shotGenerationAndImageToVideoSuitedToFinishingWorkflows"), time: "3m" };
        return { description: translate("shared.modelPicker.videoGenerationModel"), time: "3m" };
    }
    if (capability === "audio") return { description: translate("shared.modelPicker.speechSoundEffectOrMusicGeneration"), time: "20s" };
    if (name.includes("claude")) return { description: translate("shared.modelPicker.longFormTextReasoningAndCreativeWriting"), time: "10s" };
    if (name.includes("gemini")) return { description: translate("shared.modelPicker.multimodalUnderstandingAndFastTextGeneration"), time: "10s" };
    if (name.includes("deepseek")) return { description: translate("shared.modelPicker.reasoningCodeAndStructuredText"), time: "10s" };
    return { description: capability === "text" ? translate("shared.modelPicker.textGenerationModel") : translate("shared.modelPicker.currentModel"), time: "10s" };
}

export function ModelIcon({ config, model, icon }: { config?: AiConfig; model?: string; icon?: string }) {
    return <ModelLogo icon={icon || (config && model ? modelIcon(config, model) : "")} size={14} />;
}
