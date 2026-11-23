import { ArrowUpRight, Check, PencilLine, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavCreateIcon, RefreshIcon, StyleLibraryIcon } from "@/components/ui/ecommerce-icons";
import type { EcommerceCreativeDirection, EcommerceStyleRewrite } from "@/services/api/ecommerce";
import "./style-picker.css";

import { translate } from "@/i18n";
type Swatch = { label: string; color?: string };

/** Palette entries arrive as "中文色名 #HEX"; older directions only have names. */
export function directionSwatches(direction: EcommerceCreativeDirection): Swatch[] {
    const source = direction.visual?.palette?.length ? direction.visual.palette : direction.tags.filter((tag) => !/^\d+:\d+$/.test(tag));
    return source.slice(0, 4).map((entry) => {
        const match = entry.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/i);
        return {
            label:
                entry
                    .replace(match?.[0] || "", "")
                    .replace(/[（）()]/g, "")
                    .trim() || entry,
            color: match?.[0],
        };
    });
}

/** The description a user reads and rewrites for a direction. */
export function directionDescription(direction: EcommerceCreativeDirection) {
    return direction.visual?.style || direction.summary;
}

/** An edited name and description replace the generated ones everywhere they are shown. */
export function rewriteDirection(direction: EcommerceCreativeDirection, rewrite: EcommerceStyleRewrite): EcommerceCreativeDirection {
    const name = rewrite.name.trim() || direction.name;
    const description = rewrite.description.trim() || directionDescription(direction);
    return { ...direction, name, summary: description, visual: direction.visual ? { ...direction.visual, style: description } : undefined };
}

function directionSpecs(direction: EcommerceCreativeDirection) {
    const visual = direction.visual;
    if (!visual) return [];
    return [
        [translate("ecommerce.directionCards.setting"), visual.scene],
        [translate("ecommerce.directionCards.lighting"), visual.lighting],
        [translate("ecommerce.directionCards.camera"), visual.camera],
        [translate("ecommerce.directionCards.fonts"), visual.typography],
    ]
        .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
        .slice(0, 3);
}

/** Inline editor for one style: its name and its description. */
export function DirectionEditor({ index, value, className, onChange, onCancel, onSave }: { index: number; value: EcommerceStyleRewrite; className: string; onChange: (value: EcommerceStyleRewrite) => void; onCancel: () => void; onSave: () => void }) {
    return (
        <div className={className}>
            <input
                aria-label={translate("ecommerce.directionCards.styleName", { v0: String(index + 1) })}
                value={value.name}
                maxLength={40}
                placeholder={translate("ecommerce.directionCards.styleNameEGElectronicParty")}
                onChange={(event) => onChange({ ...value, name: event.target.value })}
            />
            <textarea
                aria-label={translate("ecommerce.directionCards.styleDescription", { v0: String(index + 1) })}
                value={value.description}
                maxLength={500}
                placeholder={translate("ecommerce.directionCards.describeTheSettingColorsLightingAndTypographyXiaoyeWillRedesign")}
                onChange={(event) => onChange({ ...value, description: event.target.value })}
            />
            <div className="commerce-direction-edit-actions">
                <button type="button" onClick={onCancel}>
                    <X size={14} />
                    {translate("common.cancel")}
                </button>
                <button type="button" disabled={!value.name.trim() && !value.description.trim()} onClick={onSave}>
                    <Check size={14} />
                    {translate("common.save")}
                </button>
            </div>
        </div>
    );
}

function DirectionCard({ direction, index, chosen, disabled, onSelect }: { direction: EcommerceCreativeDirection; index: number; chosen: boolean; disabled: boolean; onSelect: () => void }) {
    const swatches = directionSwatches(direction);
    const colored = swatches.filter((swatch) => swatch.color);
    const specs = directionSpecs(direction);
    return (
        <button type="button" className={`flylep-direction-card${chosen ? " is-chosen" : ""}`} aria-pressed={chosen} disabled={disabled} onClick={onSelect}>
            <span className={`commerce-direction-palette${colored.length ? "" : " is-empty"}`} aria-hidden="true">
                {colored.length ? colored.map((swatch) => <i key={swatch.label + swatch.color} style={{ background: swatch.color }} />) : <b>{String(index + 1).padStart(2, "0")}</b>}
            </span>
            <span className="commerce-direction-body">
                <span className="commerce-direction-title">
                    <span className="commerce-direction-number" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                    </span>
                    <strong>{direction.name}</strong>
                    {chosen ? <Check size={15} className="commerce-direction-check" /> : null}
                </span>
                <span className="commerce-direction-description">{directionDescription(direction)}</span>
                {specs.length ? (
                    <span className="commerce-direction-specs">
                        {specs.map(([label, value]) => (
                            <span key={label}>
                                <em>{label}</em>
                                <span>{value}</span>
                            </span>
                        ))}
                    </span>
                ) : null}
                {swatches.length ? (
                    <span className="commerce-direction-tags">
                        {swatches.map((swatch) => (
                            <small key={swatch.label}>
                                {swatch.color ? <i style={{ background: swatch.color }} aria-hidden="true" /> : null}
                                {swatch.label}
                            </small>
                        ))}
                    </span>
                ) : null}
                {direction.visual?.why ? <span className="commerce-direction-why">{direction.visual.why}</span> : null}
            </span>
        </button>
    );
}

export function CommerceDirectionCards({
    directions,
    followup,
    disabled,
    degraded,
    outdated = false,
    libraryCount = 0,
    onChoose,
    onRefresh,
    onOpenLibrary,
}: {
    directions: EcommerceCreativeDirection[];
    followup: boolean;
    disabled: boolean;
    degraded: boolean;
    outdated?: boolean;
    libraryCount?: number;
    onChoose: (direction: EcommerceCreativeDirection) => void;
    onRefresh: () => void;
    onOpenLibrary?: () => void;
}) {
    const [items, setItems] = useState(directions);
    const [editing, setEditing] = useState<{ id: string; value: EcommerceStyleRewrite }>();
    const [selectedId, setSelectedId] = useState<string>();
    useEffect(() => {
        setItems(directions);
        setEditing(undefined);
        setSelectedId(undefined);
    }, [directions]);
    const save = () => {
        if (!editing) return;
        setItems((current) => current.map((entry) => (entry.id === editing.id ? rewriteDirection(entry, editing.value) : entry)));
        setSelectedId(editing.id);
        setEditing(undefined);
    };
    return (
        <section
            className={`flylep-directions-stage commerce-direction-message${followup ? " is-followup" : ""}`}
            aria-label={followup ? translate("ecommerce.directionCards.recommendedForYou") : translate("ecommerce.directionCards.fourDesignDirectionsForYourProduct")}
        >
            <header className="commerce-direction-header">
                <span className="commerce-direction-symbol">
                    <Sparkles size={18} aria-hidden="true" />
                </span>
                <h2>
                    {followup ? (
                        <>
                            <NavCreateIcon size={16} />
                            {translate("ecommerce.directionCards.recommendedForYou")}
                        </>
                    ) : (
                        translate("ecommerce.directionCards.chooseAVisualDirection")
                    )}
                </h2>
                {onOpenLibrary ? (
                    <button
                        type="button"
                        className="commerce-direction-library"
                        aria-label={translate("ecommerce.directionCards.openStyleLibrary")}
                        title={translate("ecommerce.directionCards.browseMoreStylesByCategoryOrDescribeYourOwn")}
                        disabled={disabled || degraded || outdated}
                        onClick={onOpenLibrary}
                    >
                        <StyleLibraryIcon size={15} />
                        <span>{translate("ecommerce.directionCards.styleLibrary")}</span>
                        {libraryCount ? <span className="commerce-count-badge is-neutral">{libraryCount + items.length}</span> : null}
                    </button>
                ) : null}
            </header>
            <p className="commerce-direction-intro">
                {outdated
                    ? translate("ecommerce.directionCards.theseRecommendationsAreFromThePreviousRoundProductDetailsHave")
                    : degraded
                      ? translate("ecommerce.directionCards.knowledgeSearchIsTemporarilyUnavailableTryRequestingRecommendationsLater")
                      : followup
                        ? translate("ecommerce.directionCards.thisSetIsCompleteExploreAnotherSideOfTheProduct")
                        : translate("ecommerce.directionCards.fourDistinctVisualDirectionsAreReadyBasedOnYourProduct")}
            </p>
            <div className="flylep-directions-grid">
                {items.map((direction, index) =>
                    editing?.id === direction.id ? (
                        <DirectionEditor
                            key={direction.id}
                            className="flylep-direction-card is-editing"
                            index={index}
                            value={editing.value}
                            onChange={(value) => setEditing({ id: direction.id, value })}
                            onCancel={() => setEditing(undefined)}
                            onSave={save}
                        />
                    ) : (
                        <div className="commerce-direction-item" key={direction.id}>
                            <DirectionCard direction={direction} index={index} chosen={selectedId === direction.id} disabled={disabled || degraded || outdated} onSelect={() => setSelectedId(direction.id)} />
                            <button
                                type="button"
                                className="commerce-direction-edit"
                                aria-label={translate("ecommerce.directionCards.editStyle", { v0: String(index + 1) })}
                                title={translate("ecommerce.directionCards.rewriteThisStyle")}
                                disabled={disabled || degraded || outdated}
                                onClick={() => setEditing({ id: direction.id, value: { name: direction.name, description: directionDescription(direction) } })}
                            >
                                <PencilLine size={13} />
                            </button>
                        </div>
                    ),
                )}
            </div>
            <footer>
                <button type="button" onClick={onRefresh} disabled={disabled}>
                    <RefreshIcon size={15} />
                    {translate("ecommerce.directionCards.moreDirections")}
                </button>
                <button
                    type="button"
                    className="commerce-direction-confirm"
                    disabled={disabled || degraded || outdated || !selectedId || Boolean(editing)}
                    onClick={() => {
                        const item = items.find((entry) => entry.id === selectedId);
                        if (item) onChoose(item);
                    }}
                >
                    {degraded ? translate("ecommerce.directionCards.requestRecommendationsAgain") : !selectedId ? translate("ecommerce.directionCards.chooseADirectionFirst") : translate("ecommerce.directionCards.generateInThisStyle")}
                    <ArrowUpRight size={14} />
                </button>
            </footer>
        </section>
    );
}
