import { Modal } from "antd";
import { ArrowUpRight, Check, LoaderCircle, PencilLine, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { EcommerceCreativeDirection, EcommerceStyleRewrite } from "@/services/api/ecommerce";
import { DirectionEditor, directionDescription, directionSwatches, rewriteDirection } from "./direction-cards";
import "./style-picker.css";

import { translate } from "@/i18n";
const RECOMMENDED = "recommended";
const CUSTOM = "custom";
const UNGROUPED = translate("ecommerce.stylePicker.moreStyles");

/** Starting points for a typed style; clicking one fills the form. */
const inspirations: EcommerceStyleRewrite[] = [
    { name: translate("ecommerce.stylePicker.cyberNeon"), description: "雨夜街头的霓虹灯牌与湿润反光地面，紫青撞色，超粗发光标题" },
    { name: translate("ecommerce.stylePicker.morandiCream"), description: "低饱和奶油色与雾感灰调，柔和漫射光，圆润细体字与大留白" },
    { name: translate("ecommerce.stylePicker.frenchVintage"), description: "巴黎咖啡馆桌面，胶片颗粒与暖色褪色调，优雅衬线标题" },
    { name: translate("ecommerce.stylePicker.freshJapanese"), description: "通透自然光与浅蓝白色调，干净桌面与绿植，细黑体短句" },
    { name: translate("ecommerce.stylePicker.darkGothic"), description: "深酒红与黑色的戏剧暗场，烛光与丝绒，尖锐衬线标题" },
    { name: translate("ecommerce.stylePicker.dreamyAurora"), description: "极光渐变与流光粒子，蓝紫梦幻色调，漂浮构图与细线字" },
];

function cardStyle(direction: EcommerceCreativeDirection, index: number): CSSProperties {
    const colors = directionSwatches(direction).flatMap((swatch) => (swatch.color ? [swatch.color] : []));
    const style: Record<string, string | number> = { "--i": index };
    const typography = direction.visual?.typography ?? "";
    style["--style-font"] = /宋|衬线/.test(typography) ? '"Noto Serif SC", "Songti SC", SimSun, serif' : /圆/.test(typography) ? '"Yuanti SC", "Microsoft YaHei", sans-serif' : '"Noto Sans SC", "Microsoft YaHei", sans-serif';
    if (colors.length) Object.assign(style, { "--c1": colors[0], "--c2": colors[1] ?? colors[0], "--c3": colors[2] ?? colors[1] ?? colors[0] });
    return style as CSSProperties;
}

function StyleCard({ direction, index, chosen, disabled, onSelect, onEdit }: { direction: EcommerceCreativeDirection; index: number; chosen: boolean; disabled: boolean; onSelect: () => void; onEdit: () => void }) {
    const swatches = directionSwatches(direction).filter((swatch) => swatch.color);
    const typography = direction.visual?.typography?.trim();
    return (
        <div className={`commerce-style-card${chosen ? " is-chosen" : ""}`} style={cardStyle(direction, index)}>
            <button type="button" className="commerce-style-card-select" aria-pressed={chosen} disabled={disabled} onClick={onSelect}>
                <span className="commerce-style-card-art">
                    {swatches.length ? (
                        <span className="commerce-style-card-swatches" aria-hidden="true">
                            {swatches.map((swatch) => (
                                <i key={swatch.label + swatch.color} style={{ background: swatch.color }} />
                            ))}
                        </span>
                    ) : null}
                    <b>{direction.name}</b>
                </span>
                <span className="commerce-style-card-body">
                    <span className="commerce-style-card-desc">{directionDescription(direction)}</span>
                    {typography ? (
                        <span className="commerce-style-card-meta">
                            <em>{translate("ecommerce.stylePicker.fonts")}</em>
                            <span>{typography}</span>
                        </span>
                    ) : null}
                    {swatches.length ? (
                        <span className="commerce-style-card-palette">
                            {swatches.map((swatch) => (
                                <small key={swatch.label + swatch.color}>
                                    <i style={{ background: swatch.color }} aria-hidden="true" />
                                    {swatch.label}
                                </small>
                            ))}
                        </span>
                    ) : null}
                </span>
            </button>
            <span className="commerce-style-card-check" aria-hidden="true">
                <Check size={14} />
            </span>
            <button
                type="button"
                className="commerce-style-card-edit"
                aria-label={translate("ecommerce.stylePicker.rewriteStyle", { v0: String(direction.name) })}
                title={translate("ecommerce.stylePicker.rewriteThisStyle")}
                disabled={disabled}
                onClick={onEdit}
            >
                <PencilLine size={14} />
            </button>
        </div>
    );
}

/**
 * Style picker shown after the product analysis: the four recommended
 * directions, the style library by category, and the user's own style.
 * Any style can be rewritten before it is confirmed.
 */
export function CommerceStylePicker({
    open,
    directions,
    library,
    disabled,
    degraded,
    onClose,
    onConfirm,
}: {
    open: boolean;
    directions: EcommerceCreativeDirection[];
    library: EcommerceCreativeDirection[];
    disabled: boolean;
    degraded: boolean;
    onClose: () => void;
    onConfirm: (direction: EcommerceCreativeDirection) => void;
}) {
    const groups = useMemo(() => [...new Set(library.map((item) => item.group || UNGROUPED))], [library]);
    const [tab, setTab] = useState(RECOMMENDED);
    const [selectedId, setSelectedId] = useState<string>();
    const [rewrites, setRewrites] = useState<Record<string, EcommerceStyleRewrite>>({});
    const [editing, setEditing] = useState<{ id: string; value: EcommerceStyleRewrite }>();
    const [custom, setCustom] = useState<EcommerceStyleRewrite>({ name: "", description: "" });
    const [confirming, setConfirming] = useState(false);
    useEffect(() => {
        setTab(RECOMMENDED);
        setSelectedId(undefined);
        setRewrites({});
        setEditing(undefined);
        setCustom({ name: "", description: "" });
        setConfirming(false);
    }, [directions]);
    useEffect(() => {
        if (!disabled) setConfirming(false);
    }, [disabled]);
    const resolve = (item: EcommerceCreativeDirection) => (rewrites[item.id] ? rewriteDirection(item, rewrites[item.id]) : item);
    const all = [...directions, ...library];
    const visible = tab === RECOMMENDED ? directions : library.filter((item) => (item.group || UNGROUPED) === tab);
    const customReady = Boolean(custom.name.trim() || custom.description.trim());
    const picked = selectedId === CUSTOM ? undefined : all.find((entry) => entry.id === selectedId);
    const chosen =
        selectedId === CUSTOM
            ? customReady
                ? { name: custom.name.trim() || translate("ecommerce.stylePicker.customStyle"), group: translate("account.settings.models.scopeCustom") }
                : undefined
            : picked
              ? { name: resolve(picked).name, group: picked.group || translate("ecommerce.stylePicker.recommendedForYou") }
              : undefined;
    const tabs = [
        { id: RECOMMENDED, label: translate("ecommerce.stylePicker.recommendedForYou"), count: directions.length },
        ...groups.map((group) => ({ id: group, label: group, count: library.filter((item) => (item.group || UNGROUPED) === group).length })),
        { id: CUSTOM, label: translate("account.settings.models.scopeCustom"), count: 0 },
    ];
    const confirm = () => {
        if (disabled || degraded || editing || !chosen) return;
        const direction = selectedId === CUSTOM ? { id: "custom", name: custom.name.trim() || translate("ecommerce.stylePicker.customStyle"), summary: custom.description.trim(), tags: [] } : picked ? resolve(picked) : undefined;
        if (!direction) return;
        setConfirming(true);
        onConfirm(direction);
    };
    const saveEdit = () => {
        if (!editing) return;
        setRewrites((current) => ({ ...current, [editing.id]: editing.value }));
        setSelectedId(editing.id);
        setEditing(undefined);
    };
    const editCustom = (value: EcommerceStyleRewrite) => {
        setCustom(value);
        setSelectedId(CUSTOM);
    };
    const total = directions.length + library.length;
    return (
        <Modal open={open} onCancel={onClose} footer={null} width={1120} centered destroyOnHidden title={translate("ecommerce.stylePicker.chooseAVisualStyle")} className="commerce-style-picker-modal" rootClassName="commerce-style-picker-root">
            <div className="commerce-style-picker">
                <header className="commerce-style-picker-head">
                    <span className="commerce-style-picker-avatar" aria-hidden="true">
                        <Sparkles size={22} />
                    </span>
                    <div>
                        <small>
                            <Sparkles size={12} />
                            STYLE STUDIO · {total} {translate("ecommerce.stylePicker.styles")}
                        </small>
                        <h2>{translate("ecommerce.stylePicker.chooseAVisualStyleForThisProduct")}</h2>
                        <p>
                            {translate("ecommerce.stylePicker.recommendedForThisProductCategory")} {total} {translate("ecommerce.stylePicker.visualConceptsWithTailoredScenesFontsAndLayoutsBrowseCategories")}
                        </p>
                    </div>
                </header>
                <nav className="commerce-style-picker-tabs" role="tablist" aria-label={translate("ecommerce.stylePicker.styleCategories")}>
                    {tabs.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === entry.id}
                            className={tab === entry.id ? "is-active" : undefined}
                            onClick={() => {
                                setTab(entry.id);
                                setEditing(undefined);
                            }}
                        >
                            {entry.id === RECOMMENDED ? <Sparkles size={13} aria-hidden="true" /> : entry.id === CUSTOM ? <Wand2 size={13} aria-hidden="true" /> : null}
                            <span>{entry.label}</span>
                            {entry.count ? <small>{entry.count}</small> : null}
                        </button>
                    ))}
                </nav>
                {tab === CUSTOM ? (
                    <div className="commerce-style-custom" role="tabpanel" aria-label={translate("ecommerce.stylePicker.customStyle")}>
                        <div className="commerce-style-custom-form">
                            <label>
                                <span>{translate("ecommerce.stylePicker.styleName")}</span>
                                <input value={custom.name} maxLength={40} placeholder={translate("ecommerce.stylePicker.eGCyberNeon")} onChange={(event) => editCustom({ ...custom, name: event.target.value })} />
                            </label>
                            <label>
                                <span>{translate("ecommerce.stylePicker.styleDescription")}</span>
                                <textarea
                                    value={custom.description}
                                    maxLength={500}
                                    rows={5}
                                    placeholder={translate("ecommerce.stylePicker.describeYourDesiredSettingColorsLightingFontsOrMoodFor")}
                                    onChange={(event) => editCustom({ ...custom, description: event.target.value })}
                                />
                            </label>
                            <p>{translate("ecommerce.stylePicker.onceConfirmedXiaoyeExpandsThisDescriptionIntoAFullColor")}</p>
                        </div>
                        <div className="commerce-style-inspirations">
                            <span>{translate("ecommerce.stylePicker.findInspiration")}</span>
                            {inspirations.map((entry, index) => (
                                <button key={entry.name} type="button" style={{ "--i": index } as CSSProperties} onClick={() => editCustom(entry)}>
                                    <b>{entry.name}</b>
                                    <small>{entry.description}</small>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="commerce-style-grid" role="tabpanel" aria-label={tab === RECOMMENDED ? translate("ecommerce.stylePicker.recommendedForYou") : tab} key={tab}>
                        {visible.map((item, index) =>
                            editing?.id === item.id ? (
                                <DirectionEditor
                                    key={item.id}
                                    className="commerce-style-card is-editing"
                                    index={index}
                                    value={editing.value}
                                    onChange={(value) => setEditing({ id: item.id, value })}
                                    onCancel={() => setEditing(undefined)}
                                    onSave={saveEdit}
                                />
                            ) : (
                                <StyleCard
                                    key={item.id}
                                    direction={resolve(item)}
                                    index={index}
                                    chosen={selectedId === item.id}
                                    disabled={disabled || degraded}
                                    onSelect={() => setSelectedId(item.id)}
                                    onEdit={() => {
                                        const current = resolve(item);
                                        setEditing({ id: item.id, value: { name: current.name, description: directionDescription(current) } });
                                    }}
                                />
                            ),
                        )}
                    </div>
                )}
                <footer className="commerce-style-picker-footer">
                    <span>
                        {chosen ? (
                            <>
                                {translate("ecommerce.stylePicker.selected")}
                                <b>{chosen.name}</b>
                                <em>{chosen.group}</em>
                            </>
                        ) : degraded ? (
                            translate("ecommerce.stylePicker.knowledgeSearchIsTemporarilyUnavailableCloseAndRequestRecommendationsAgain")
                        ) : (
                            translate("ecommerce.stylePicker.chooseAStyleOrDescribeYourOwnUnderCustom")
                        )}
                    </span>
                    <div>
                        <button type="button" className="commerce-style-picker-later" onClick={onClose}>
                            {translate("ecommerce.stylePicker.chooseLater")}
                        </button>
                        <button type="button" className="commerce-style-picker-confirm" disabled={!chosen || disabled || degraded || Boolean(editing)} onClick={confirm}>
                            {confirming && disabled ? (
                                <>
                                    <LoaderCircle size={15} className="is-spinning" aria-hidden="true" />
                                    {translate("ecommerce.stylePicker.applyingStyle")}
                                </>
                            ) : (
                                <>
                                    {translate("ecommerce.stylePicker.confirmAndGenerateInThisStyle")}
                                    <ArrowUpRight size={15} aria-hidden="true" />
                                </>
                            )}
                        </button>
                    </div>
                </footer>
            </div>
        </Modal>
    );
}
