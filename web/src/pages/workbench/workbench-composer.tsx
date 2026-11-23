import { Button, Dropdown, Progress, Select, Switch } from "antd";
import { ArrowRight, ArrowUp, Check, ChevronDown, ChevronUp, Clapperboard, FolderOpen, ImagePlus, Images, LayoutGrid, Megaphone, Mic, Palette, PenLine, ScanSearch, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useState, type DragEvent, type ReactNode } from "react";

import { AntTooltip as Tooltip } from "@/components/ui/base/tooltip/ant-tooltip";
import { promptHasPhrase } from "@/lib/prompt-phrases";
import { cn } from "@/lib/utils";
import type { WorkbenchKind, WorkbenchPromptPreset, WorkbenchReferenceSlot, WorkbenchTool } from "@/services/api/workbench";

import { workbenchMediaLabel } from "./workbench-catalog";
import { workbenchRatioUsage, workbenchSceneTone, workbenchToolSubtitle, type InspirationGroup, type SceneTone } from "./workbench-presets";

import { commerceUiText } from "../ecommerce/ui-text";
import { currentLocale, translate } from "@/i18n";
export type WorkbenchReference = {
    id: string;
    name: string;
    kind: "image" | "video" | "audio";
    resourceId?: string;
    previewUrl: string;
    progress: number;
    uploading: boolean;
    error?: string;
    role: "reference" | "first_frame" | "last_frame";
    slotKey?: string;
};

const TONE_ICONS: Record<SceneTone, typeof ShoppingBag> = {
    product: ShoppingBag,
    people: UserRound,
    scene: Images,
    detail: ScanSearch,
    marketing: Megaphone,
    video: Clapperboard,
    creative: Palette,
};

export function SceneGlyph({ tool, kind, size = "md" }: { tool: WorkbenchTool | null; kind: WorkbenchKind; size?: "sm" | "md" | "lg" }) {
    const tone = workbenchSceneTone(tool, kind);
    const Icon = tool ? TONE_ICONS[tone] : PenLine;
    const image = tool?.coverUrl || tool?.iconUrl;
    return (
        <span className={cn("wb-scene-glyph", `is-${size}`)} data-tone={tool ? tone : "free"} aria-hidden>
            {image ? <img src={image} alt="" loading="lazy" /> : <Icon />}
        </span>
    );
}

export function ComposerSection({ title, hint, aside, children, className }: { title: string; hint?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn("wb-section", className)} aria-label={title}>
            <header className="wb-section-head">
                <div className="wb-section-title">
                    <h3>{title}</h3>
                    {hint ? <span>{hint}</span> : null}
                </div>
                {aside ? <div className="wb-section-aside">{aside}</div> : null}
            </header>
            {children}
        </section>
    );
}

export function SceneSection({
    kind,
    tool,
    quickTools,
    loading,
    error,
    onOpenLibrary,
    onChoose,
    onRetry,
}: {
    kind: WorkbenchKind;
    tool: WorkbenchTool | null;
    quickTools: WorkbenchTool[];
    loading: boolean;
    error: string;
    onOpenLibrary: () => void;
    onChoose: (tool: WorkbenchTool | null) => void;
    onRetry: () => void;
}) {
    const subtitle = tool
        ? workbenchToolSubtitle(tool)
        : kind === "image"
          ? translate("ecommerce.workbench.workbenchComposer.describeYourDesiredProductSceneWithoutApplyingATemplate")
          : translate("ecommerce.workbench.workbenchComposer.describeWhatHappensInTheShotWithoutApplyingATemplate");
    return (
        <ComposerSection
            title={translate("ecommerce.workbench.workbenchComposer.outputScenario")}
            hint={tool ? undefined : translate("ecommerce.workbench.workbenchComposer.automaticallyAppliesTheTemplateAndAssetRequirements")}
            aside={
                <Button size="small" type="text" className="wb-text-action" onClick={onOpenLibrary}>
                    {translate("ecommerce.workbench.workbenchComposer.allScenarios")}
                    <ArrowRight className="size-3.5" />
                </Button>
            }
        >
            <button type="button" className="wb-scene-current" onClick={onOpenLibrary} aria-haspopup="dialog" title={tool ? `${tool.name}\n${subtitle}` : translate("ecommerce.workbench.workbenchComposer.chooseAnOutputScenario")}>
                <SceneGlyph tool={tool} kind={kind} size="lg" />
                <span className="wb-scene-current-copy">
                    <strong>{tool?.name || translate("ecommerce.workbench.workbenchComposer.freeCreation")}</strong>
                    <small>{subtitle}</small>
                </span>
                <span className="wb-scene-current-switch">{translate("ecommerce.workbench.workbenchComposer.change")}</span>
            </button>
            {error ? (
                <div className="wb-inline-error" role="alert">
                    <span>{error}</span>
                    <Button size="small" onClick={onRetry}>
                        {translate("common.retry")}
                    </Button>
                </div>
            ) : loading ? (
                <div className="wb-scene-chips is-loading" aria-hidden>
                    {Array.from({ length: 4 }, (_, index) => (
                        <span key={index} className="wb-skeleton-chip" />
                    ))}
                </div>
            ) : quickTools.length ? (
                <div className="wb-scene-chips" role="group" aria-label={translate("ecommerce.workbench.workbenchComposer.commonScenarios")}>
                    {quickTools.map((item) => (
                        <button key={item.id} type="button" className="wb-chip" aria-pressed={item.id === tool?.id} title={workbenchToolSubtitle(item) || item.name} onClick={() => onChoose(item.id === tool?.id ? null : item)}>
                            {item.name}
                        </button>
                    ))}
                </div>
            ) : null}
        </ComposerSection>
    );
}

function slotRequirementText(slot: WorkbenchReferenceSlot) {
    const media = slot.mediaTypes.map(workbenchMediaLabel).join(" / ");
    return slot.required || slot.minCount > 0 ? translate("ecommerce.workbench.workbenchComposer.required2", { v0: String(media) }) : translate("ecommerce.workbench.workbenchComposer.optional", { v0: String(media) });
}

function roleLabel(role: WorkbenchReference["role"]) {
    return role === "first_frame" ? translate("ecommerce.workbench.workbenchComposer.openingFrame") : role === "last_frame" ? translate("ecommerce.workbench.workbenchComposer.endingFrame") : translate("ecommerce.workbench.workbenchComposer.reference");
}

function ReferenceThumb({ reference, kind, onRemove, onRoleChange }: { reference: WorkbenchReference; kind: WorkbenchKind; onRemove: () => void; onRoleChange: (role: WorkbenchReference["role"]) => void }) {
    const canChooseRole = kind === "video" && reference.kind === "image";
    return (
        <div className={cn("wb-ref", reference.error && "is-error")} title={reference.error || reference.name}>
            <span className="wb-ref-media">
                {reference.kind === "video" ? (
                    <video src={reference.previewUrl} muted playsInline preload="metadata" />
                ) : reference.kind === "audio" ? (
                    <span className="wb-ref-audio">
                        <Mic />
                    </span>
                ) : reference.previewUrl ? (
                    <img src={reference.previewUrl} alt={reference.name} loading="lazy" />
                ) : (
                    <span className="wb-ref-audio">
                        <ImagePlus />
                    </span>
                )}
                {reference.uploading ? (
                    <span className="wb-ref-progress">
                        <Progress type="circle" percent={Math.round(reference.progress)} size={30} strokeWidth={10} showInfo={false} />
                    </span>
                ) : null}
                {reference.error ? <span className="wb-ref-error">{translate("library.assets.batch.uploadFailed")}</span> : null}
            </span>
            <button type="button" className="wb-ref-remove" data-icon-only aria-label={translate("ecommerce.workbench.workbenchComposer.remove", { v0: String(reference.name) })} onClick={onRemove}>
                <X />
            </button>
            {canChooseRole ? (
                <Dropdown
                    trigger={["click"]}
                    menu={{
                        selectable: true,
                        selectedKeys: [reference.role],
                        items: [
                            { key: "first_frame", label: translate("ecommerce.workbench.workbenchComposer.useAsOpeningFrame") },
                            { key: "last_frame", label: translate("ecommerce.workbench.workbenchComposer.useAsEndingFrame") },
                            { key: "reference", label: translate("ecommerce.workbench.workbenchComposer.useAsReferenceImage") },
                        ],
                        onClick: ({ key }) => onRoleChange(key as WorkbenchReference["role"]),
                    }}
                >
                    <button type="button" className="wb-ref-role" aria-label={translate("ecommerce.workbench.workbenchComposer.assetUseClickToChange", { v0: String(roleLabel(reference.role)) })}>
                        {roleLabel(reference.role)}
                        <ChevronDown />
                    </button>
                </Dropdown>
            ) : null}
        </div>
    );
}

function hasDraggedFiles(event: DragEvent) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
}

/** 一组素材（一个输入槽位或无槽位的参考区）：整行都可以拖入文件。 */
function ReferenceGroup({
    kind,
    items,
    limit,
    label,
    detail,
    onPick,
    onDrop,
    onOpenLibrary,
    onRemove,
    onRoleChange,
}: {
    kind: WorkbenchKind;
    items: WorkbenchReference[];
    limit: number;
    label: string;
    detail: string;
    onPick: () => void;
    onDrop: (files: File[]) => void;
    onOpenLibrary: () => void;
    onRemove: (reference: WorkbenchReference) => void;
    onRoleChange: (reference: WorkbenchReference, role: WorkbenchReference["role"]) => void;
}) {
    const [dragging, setDragging] = useState(false);
    const full = items.length >= limit;
    return (
        <div
            className={cn("wb-ref-row", dragging && "is-dragging")}
            onDragOver={(event) => {
                if (full || !hasDraggedFiles(event)) return;
                event.preventDefault();
                setDragging(true);
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(event) => {
                if (!hasDraggedFiles(event)) return;
                event.preventDefault();
                setDragging(false);
                if (!full) onDrop(Array.from(event.dataTransfer.files));
            }}
        >
            {items.map((reference) => (
                <ReferenceThumb key={reference.id} reference={reference} kind={kind} onRemove={() => onRemove(reference)} onRoleChange={(role) => onRoleChange(reference, role)} />
            ))}
            {full ? null : items.length ? (
                <Tooltip title={label}>
                    <button type="button" className="wb-ref-add" data-icon-only aria-label={label} onClick={onPick}>
                        <ImagePlus />
                    </button>
                </Tooltip>
            ) : (
                <button type="button" className="wb-drop" onClick={onPick}>
                    <span className="wb-drop-icon">
                        <ImagePlus />
                    </span>
                    <span className="wb-drop-copy">
                        <strong>{label}</strong>
                        <small>{detail}</small>
                    </span>
                </button>
            )}
            <button
                type="button"
                className="wb-ref-library"
                aria-label={translate("ecommerce.workbench.workbenchComposer.chooseFromAssetLibrary")}
                title={full ? translate("ecommerce.workbench.workbenchComposer.limitReached") : translate("ecommerce.workbench.workbenchComposer.chooseFromAssetLibrary")}
                disabled={full}
                onClick={onOpenLibrary}
            >
                <FolderOpen />
                <small>{translate("canvasB.mention.assetLibrary")}</small>
            </button>
        </div>
    );
}

export function ReferenceSection({
    kind,
    tool,
    references,
    unslottedLimit,
    onPick,
    onDropFiles,
    onOpenLibrary,
    onRemove,
    onRoleChange,
    onClear,
}: {
    kind: WorkbenchKind;
    tool: WorkbenchTool | null;
    references: WorkbenchReference[];
    unslottedLimit: number;
    onPick: (slotKey?: string) => void;
    onDropFiles: (files: File[], slotKey?: string) => void;
    onOpenLibrary: (slotKey?: string) => void;
    onRemove: (reference: WorkbenchReference) => void;
    onRoleChange: (reference: WorkbenchReference, role: WorkbenchReference["role"]) => void;
    onClear: () => void;
}) {
    const slots = tool?.inputContract?.slots || [];
    const mediaHint = kind === "image" ? translate("ecommerce.workbench.workbenchComposer.dragImagesOrPasteScreenshots") : translate("ecommerce.workbench.workbenchComposer.imagesVideosAudioDragToUpload");
    const clearAction = references.length ? (
        <Button size="small" type="text" className="wb-text-action" onClick={onClear}>
            {translate("canvasA.outbox.clear")}
        </Button>
    ) : null;
    const renderGroup = (items: WorkbenchReference[], options: { slotKey?: string; limit: number; label: string; detail: string }) => (
        <ReferenceGroup
            kind={kind}
            items={items}
            limit={options.limit}
            label={options.label}
            detail={options.detail}
            onPick={() => onPick(options.slotKey)}
            onDrop={(files) => onDropFiles(files, options.slotKey)}
            onOpenLibrary={() => onOpenLibrary(options.slotKey)}
            onRemove={onRemove}
            onRoleChange={onRoleChange}
        />
    );
    if (!slots.length) {
        if (unslottedLimit <= 0) {
            return (
                <ComposerSection
                    title={kind === "image" ? translate("ecommerce.workbench.workbenchComposer.productAssets") : translate("ecommerce.workbench.workbenchComposer.referenceAssets")}
                    hint={translate("ecommerce.workbench.workbenchComposer.theCurrentModelDoesNotAcceptReferenceAssets")}
                >
                    <p className="wb-muted-note">{translate("ecommerce.workbench.workbenchComposer.chooseAModelThatSupportsReferenceImagesThenUploadOriginal")}</p>
                </ComposerSection>
            );
        }
        return (
            <ComposerSection
                title={kind === "image" ? translate("ecommerce.workbench.workbenchComposer.productAssets") : translate("ecommerce.workbench.workbenchComposer.referenceAssets")}
                hint={`${references.length} / ${unslottedLimit} · ${mediaHint}`}
                aside={clearAction}
            >
                {renderGroup(references, {
                    limit: unslottedLimit,
                    label: kind === "image" ? translate("ecommerce.workbench.workbenchComposer.uploadProductImages") : translate("ecommerce.workbench.workbenchComposer.uploadReferenceAssets"),
                    detail: kind === "image" ? translate("ecommerce.workbench.workbenchComposer.whiteBackgroundOrRealPhotosTheClearerTheAppearanceThe") : translate("ecommerce.workbench.workbenchComposer.imagesCanBeOpeningOrEndingFrames"),
                })}
            </ComposerSection>
        );
    }
    return (
        <ComposerSection title={translate("ecommerce.workbench.workbenchComposer.productAssets")} hint={mediaHint} aside={clearAction}>
            <div className="wb-slot-list">
                {slots.map((slot) => {
                    const items = references.filter((reference) => reference.slotKey === slot.key);
                    const required = slot.required || slot.minCount > 0;
                    const missing = required && !items.some((item) => item.resourceId && !item.uploading && !item.error);
                    return (
                        <div key={slot.key} className={cn("wb-slot", missing && "is-missing")}>
                            <div className="wb-slot-head">
                                <strong>{slot.name || translate("ecommerce.workbench.workbenchComposer.referenceAssets")}</strong>
                                <span className={cn("wb-badge", required && "is-required")}>{required ? translate("ecommerce.workbench.workbenchComposer.required") : translate("account.settings.diagnostics.optional")}</span>
                                <small>
                                    {items.length} / {slot.maxCount}
                                </small>
                            </div>
                            {renderGroup(items, {
                                slotKey: slot.key,
                                limit: slot.maxCount,
                                label: translate("ecommerce.workbench.workbenchComposer.upload", { v0: String(slot.name || translate("ecommerce.workbench.workbenchComposer.asset")) }),
                                detail: slotRequirementText(slot),
                            })}
                        </div>
                    );
                })}
            </div>
        </ComposerSection>
    );
}

export function PromptSection({
    kind,
    tool,
    preset,
    prompt,
    maxChars,
    inspirations,
    editor,
    onChoosePreset,
    onTogglePhrase,
    onClear,
}: {
    kind: WorkbenchKind;
    tool: WorkbenchTool | null;
    preset: WorkbenchPromptPreset | null;
    prompt: string;
    maxChars: number;
    inspirations: InspirationGroup[];
    editor: ReactNode;
    onChoosePreset: (preset: WorkbenchPromptPreset) => void;
    onTogglePhrase: (phrase: string) => void;
    onClear: () => void;
}) {
    const [group, setGroup] = useState(inspirations[0]?.key || "");
    const activeGroup = inspirations.find((item) => item.key === group) || inspirations[0];
    return (
        <ComposerSection
            title={translate("ecommerce.workbench.workbenchComposer.frameDescription")}
            hint={kind === "image" ? translate("ecommerce.workbench.workbenchComposer.describeTheProductSceneLightingAndDetailsToPreserve") : translate("ecommerce.workbench.workbenchComposer.describeSubjectActionsCameraMovementPacingAndTheEnding")}
            aside={
                prompt ? (
                    <Button size="small" type="text" className="wb-text-action" onClick={onClear}>
                        {translate("canvasA.outbox.clear")}
                    </Button>
                ) : null
            }
        >
            {tool?.presets.length ? (
                <div className="wb-preset-row" role="group" aria-label={translate("ecommerce.workbench.workbenchComposer.scenarioPromptTemplate")}>
                    {tool.presets.slice(0, 5).map((item) => (
                        <button key={item.id} type="button" className="wb-preset" aria-pressed={preset?.id === item.id} title={item.summary || item.name} onClick={() => onChoosePreset(item)}>
                            {preset?.id === item.id ? <Check /> : null}
                            <span>{item.name}</span>
                        </button>
                    ))}
                </div>
            ) : null}
            <div className="wb-prompt">
                {editor}
                <div className="wb-prompt-meta">
                    <span className={cn(prompt.length > maxChars * 0.9 && "is-warning")}>
                        {prompt.length.toLocaleString(currentLocale())} / {maxChars.toLocaleString(currentLocale())}
                    </span>
                    <span>{translate("ecommerce.workbench.workbenchComposer.typeToReferenceAssetsCtrlEnterToGenerate")}</span>
                </div>
            </div>
            {activeGroup ? (
                <div className="wb-inspire">
                    <div className="wb-inspire-tabs" role="tablist" aria-label={translate("ecommerce.workbench.workbenchComposer.inspirationPhraseCategories")}>
                        {inspirations.map((item) => (
                            <button key={item.key} type="button" role="tab" aria-selected={item.key === activeGroup.key} className={item.key === activeGroup.key ? "is-active" : ""} onClick={() => setGroup(item.key)}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className="wb-inspire-chips" role="group" aria-label={translate("ecommerce.workbench.workbenchComposer.inspirationPhrasesClickToAddToOrRemoveFromThe", { v0: String(activeGroup.label) })}>
                        {activeGroup.phrases.map((phrase) => {
                            const active = promptHasPhrase(prompt, phrase);
                            return (
                                <button key={phrase} type="button" className="wb-chip is-soft" aria-pressed={active} onClick={() => onTogglePhrase(phrase)}>
                                    {active ? <Check /> : null}
                                    {commerceUiText(phrase)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </ComposerSection>
    );
}

export function ChoiceChips({
    label,
    value,
    options,
    onChange,
    columns,
}: {
    label: string;
    value: string;
    options: Array<{ value: string; label: string; caption?: string; title?: string; ratio?: number }>;
    onChange: (value: string) => void;
    columns?: number;
}) {
    if (options.length > 8) {
        return (
            <label className="wb-field">
                <span className="wb-field-label">{label}</span>
                <Select aria-label={label} value={value} onChange={onChange} options={options.map((option) => ({ value: option.value, label: option.caption ? `${option.label} · ${option.caption}` : option.label }))} />
            </label>
        );
    }
    return (
        <div className="wb-field">
            <span className="wb-field-label">{label}</span>
            <div className={cn("wb-choice-grid", options.some((option) => option.caption) && "has-caption")} role="radiogroup" aria-label={label} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
                {options.map((option) => (
                    <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={cn("wb-choice", value === option.value && "is-active")} title={option.title} onClick={() => onChange(option.value)}>
                        {option.ratio ? <RatioIcon ratio={option.ratio} /> : null}
                        <span>{option.label}</span>
                        {option.caption ? <small>{option.caption}</small> : null}
                    </button>
                ))}
            </div>
        </div>
    );
}

function RatioIcon({ ratio }: { ratio: number }) {
    const width = 18 * Math.min(1, ratio);
    const height = 18 * Math.min(1, 1 / ratio);
    return <span className="wb-ratio-icon" style={{ width, height }} aria-hidden />;
}

export function videoRatioOptions(ratios: string[]) {
    return ratios.map((value) => {
        const usage = workbenchRatioUsage("video", value);
        const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value.trim());
        return { value, label: value === "adaptive" ? translate("ecommerce.workbench.workbenchComposer.adaptive") : value, ...(usage ? { caption: usage.label, title: usage.title } : {}), ...(match ? { ratio: Number(match[1]) / Number(match[2]) } : {}) };
    });
}

export function SwitchRow({ items }: { items: Array<{ key: string; label: string; detail?: string; checked: boolean; onChange: (checked: boolean) => void }> }) {
    if (!items.length) return null;
    return (
        <div className="wb-switches">
            {items.map((item) => (
                <label key={item.key} className="wb-switch">
                    <span>
                        <strong>{item.label}</strong>
                        {item.detail ? <small>{item.detail}</small> : null}
                    </span>
                    <Switch size="small" checked={item.checked} onChange={item.onChange} />
                </label>
            ))}
        </div>
    );
}

/** 生成数量沿用全站“[1][2][3][4▲▼]”四格规范：前三格直选，第四格为可输入的微调框。 */
export function CountStepper({ kind, value, max, onChange }: { kind: WorkbenchKind; value: number; max: number; onChange: (value: number) => void }) {
    const limit = Math.max(1, max);
    const current = Math.min(limit, Math.max(1, Math.floor(value) || 1));
    const unit = kind === "image" ? translate("canvasA.characterLibrary.pageItem") : translate("ecommerce.workbench.workbenchComposer.videos");
    const stepperActive = current >= 4;
    const [draft, setDraft] = useState(String(Math.max(4, current)));
    useEffect(() => {
        if (current >= 4) setDraft(String(current));
    }, [current]);
    const commit = (next: number) => {
        const clamped = Math.min(limit, Math.max(1, Math.floor(next) || 1));
        setDraft(String(Math.max(4, clamped)));
        onChange(clamped);
    };
    const base = stepperActive ? current : Number(draft) || 4;
    return (
        <div className="wb-count" role="group" aria-label={translate("ecommerce.workbench.workbenchComposer.generationCountUpTo", { v0: String(limit), v1: String(unit) })}>
            {Array.from({ length: Math.min(3, limit) }, (_, index) => index + 1).map((item) => (
                <button key={item} type="button" className={cn("wb-count-cell", current === item && "is-active")} aria-pressed={current === item} onClick={() => onChange(item)}>
                    {item}
                </button>
            ))}
            {limit >= 4 ? (
                <div className={cn("wb-count-cell wb-count-stepper", stepperActive && "is-active")} onClick={() => !stepperActive && commit(base)}>
                    <input
                        type="text"
                        inputMode="numeric"
                        aria-label={translate("ecommerce.workbench.workbenchComposer.customCount4To", { v0: String(limit), v1: String(unit) })}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 2))}
                        onFocus={(event) => {
                            event.currentTarget.select();
                            if (!stepperActive) commit(base);
                        }}
                        onBlur={() => commit(Number(draft) || 4)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                event.preventDefault();
                                commit(base + (event.key === "ArrowUp" ? 1 : -1));
                            }
                        }}
                    />
                    <span className="wb-count-steps">
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-label={translate("ecommerce.workbench.workbenchComposer.add1", { v0: String(unit) })}
                            disabled={stepperActive && current >= limit}
                            onClick={(event) => {
                                event.stopPropagation();
                                commit(base + 1);
                            }}
                        >
                            <ChevronUp />
                        </button>
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-label={translate("ecommerce.workbench.workbenchComposer.remove1", { v0: String(unit) })}
                            disabled={stepperActive && current <= 1}
                            onClick={(event) => {
                                event.stopPropagation();
                                commit(base - 1);
                            }}
                        >
                            <ChevronDown />
                        </button>
                    </span>
                </div>
            ) : null}
        </div>
    );
}

export function ComposerFooter({
    kind,
    count,
    taskCount,
    estimate,
    estimateDetail,
    busy,
    disabledReason,
    onSubmit,
}: {
    kind: WorkbenchKind;
    count: number;
    taskCount: number;
    estimate: string;
    estimateDetail?: string;
    busy: boolean;
    disabledReason?: string;
    onSubmit: () => void;
}) {
    const unit = kind === "image" ? translate("canvasA.characterLibrary.pageItem") : translate("ecommerce.workbench.workbenchComposer.videos");
    const label =
        count > 1
            ? translate("ecommerce.workbench.workbenchComposer.generate", { v0: String(count), v1: String(unit) })
            : kind === "image"
              ? translate("ecommerce.workbench.workbenchComposer.generateImage")
              : translate("ecommerce.workbench.workbenchComposer.generateVideo");
    const button = (
        <Button className="wb-submit" type="primary" size="large" loading={busy} disabled={Boolean(disabledReason)} onClick={onSubmit}>
            <ArrowUp />
            <span>{label}</span>
        </Button>
    );
    return (
        <footer className="wb-footer">
            <div className="wb-estimate" aria-live="polite">
                <strong>{estimate || `${count} ${unit}`}</strong>
                <span>
                    <LayoutGrid />
                    {estimate ? `${count} ${unit} · ` : ""}
                    {taskCount} {translate("ecommerce.workbench.workbenchComposer.tasks")}
                    {estimateDetail ? ` · ${estimateDetail}` : ""}
                </span>
            </div>
            {disabledReason ? (
                <Tooltip title={disabledReason}>
                    <span className="wb-submit-wrap">{button}</span>
                </Tooltip>
            ) : (
                button
            )}
        </footer>
    );
}
