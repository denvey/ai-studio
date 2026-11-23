import { useEffect, useMemo } from "react";
import { App, Button } from "antd";
import { Check, ChevronLeft, ChevronRight, Copy, Flame, X } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal";
import { DRAMA_STYLE_CATEGORIES, findDramaStyle, styleCoverBackground } from "@/lib/drama/drama-styles";
import { translate } from "@/i18n";
import { dramaStyleDisplay } from "./style-copy";


const DETAIL_ROWS = [
    { key: "medium", label: translate("drama.styleDetailModal.visualMedium") },
    { key: "world", label: translate("drama.styleDetailModal.genreAndSetting") },
    { key: "look", label: translate("drama.styleDetailModal.colorAndLighting") },
    { key: "wardrobe", label: translate("drama.styleDetailModal.costumesMakeupAndProps") },
    { key: "forbid", label: translate("drama.styleDetailModal.avoid") },
] as const;

/** 风格详情：大图 + 分项美术基线 + 完整提示词；左右键在当前筛选结果里切换。 */
export function DramaStyleDetailModal({
    styleId,
    selectedId,
    navigationIds,
    onNavigate,
    onUse,
    onClose,
}: {
    styleId: string | null;
    selectedId: string;
    navigationIds: string[];
    onNavigate: (id: string) => void;
    onUse: (id: string) => void;
    onClose: () => void;
}) {
    const { message } = App.useApp();
    const style = useMemo(() => {
        const source = styleId ? findDramaStyle(styleId) : undefined;
        return source ? dramaStyleDisplay(source) : undefined;
    }, [styleId]);
    const index = styleId ? navigationIds.indexOf(styleId) : -1;
    const prevId = index > 0 ? navigationIds[index - 1] : undefined;
    const nextId = index >= 0 && index < navigationIds.length - 1 ? navigationIds[index + 1] : undefined;

    useEffect(() => {
        if (!style) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]")) return;
            if (event.key === "ArrowLeft" && prevId) onNavigate(prevId);
            if (event.key === "ArrowRight" && nextId) onNavigate(nextId);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [style, prevId, nextId, onNavigate]);

    const copyPrompt = async () => {
        if (!style) return;
        try {
            await navigator.clipboard.writeText(style.prompt);
            message.success(translate("drama.styleDetailModal.stylePromptCopied"));
        } catch {
            message.error(translate("drama.styleDetailModal.copyFailedSelectAndCopyTheTextManually"));
        }
    };

    const active = style?.id === selectedId;
    const categoryLabel = style ? DRAMA_STYLE_CATEGORIES.find((item) => item.key === style.category)?.label : "";

    return (
        <AppModal open={Boolean(style)} onCancel={onClose} footer={null} title={null} closable={false} flush centered width="min(880px, calc(100vw - 48px))" rootClassName="drama-root" aria-label={translate("drama.styleDetailModal.styleDetails")}>
            {style ? (
                <div className="drama-style-detail">
                    <div className="drama-style-detail-cover" style={{ background: styleCoverBackground(style) }}>
                        {!style.cover ? (
                            <span className="drama-style-detail-glyph" aria-hidden>
                                {style.name.replace(/^3D\s*/, "").slice(0, 2)}
                            </span>
                        ) : null}
                        <div className="drama-style-detail-palette" aria-label={translate("drama.styleDetailModal.primaryColors")}>
                            {style.palette.map((color) => (
                                <span key={color} style={{ background: color }} title={color} />
                            ))}
                        </div>
                    </div>
                    <div className="drama-style-detail-body">
                        <header className="drama-style-detail-head">
                            <div className="min-w-0">
                                <div className="drama-style-detail-meta">
                                    <span>{categoryLabel}</span>
                                    {style.hot ? (
                                        <span className="is-hot">
                                            <Flame className="size-3" />
                                            {translate("drama.styleDetailModal.popular")}
                                        </span>
                                    ) : null}
                                    {index >= 0 ? (
                                        <span className="drama-style-detail-index">
                                            {index + 1} / {navigationIds.length}
                                        </span>
                                    ) : null}
                                </div>
                                <h3>{style.name}</h3>
                                <p>{style.description}</p>
                            </div>
                            <Button type="text" icon={<X className="size-4" />} aria-label={translate("common.close")} onClick={onClose} />
                        </header>
                        <div className="drama-style-detail-tags">
                            {style.tags.map((tag) => (
                                <span key={tag}>{tag}</span>
                            ))}
                        </div>
                        <dl className="drama-style-detail-rows thin-scrollbar">
                            {DETAIL_ROWS.map((row) => (
                                <div key={row.key}>
                                    <dt>{row.label}</dt>
                                    <dd>{style.detail[row.key]}</dd>
                                </div>
                            ))}
                            <div>
                                <dt>
                                    {translate("drama.styleDetailModal.fullPrompt")}
                                    <button type="button" className="drama-style-detail-copy" onClick={() => void copyPrompt()}>
                                        <Copy className="size-3" />
                                        {translate("canvasB.common.copy")}
                                    </button>
                                </dt>
                                <dd className="is-prompt">{style.prompt}</dd>
                            </div>
                        </dl>
                        <p className="drama-style-detail-note">{translate("drama.styleDetailModal.styleDefinesTheVisualTreatmentColorPaletteCostumesMakeupAnd")}{style.cover ? "" : translate("drama.styleDetailModal.noPreviewImageIsAvailableForThisStyleTheLeft")}</p>
                        <footer className="drama-style-detail-foot">
                            <Button icon={<ChevronLeft className="size-4" />} disabled={!prevId} onClick={() => prevId && onNavigate(prevId)} aria-label={translate("drama.styleDetailModal.previousStyle")} />
                            <Button icon={<ChevronRight className="size-4" />} disabled={!nextId} onClick={() => nextId && onNavigate(nextId)} aria-label={translate("drama.styleDetailModal.nextStyle")} />
                            <span className="flex-1" />
                            <Button onClick={onClose}>{translate("common.close")}</Button>
                            <Button type="primary" icon={active ? <Check className="size-4" /> : undefined} disabled={active} onClick={() => onUse(style.id)}>
                                {active ? translate("drama.styleDetailModal.currentlySelected") : translate("drama.styleDetailModal.useThisStyle")}
                            </Button>
                        </footer>
                    </div>
                </div>
            ) : null}
        </AppModal>
    );
}
