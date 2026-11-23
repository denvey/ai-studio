import { Dropdown, type MenuProps } from "antd";
import { ChevronDown, Crop, Download, Images, Maximize2, Scissors, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { commerceArrangeMinimum, type CommerceArrangeKind } from "./canvas-arrange";

import { translate } from "@/i18n";
export type CommerceArrangeAction = CommerceArrangeKind | "reset";

const arrangeGroups: Array<{ label: string; items: Array<{ action: CommerceArrangeKind; label: string }> }> = [
    {
        label: translate("ecommerce.canvasArrangeBar.align"),
        items: [
            { action: "align-left", label: translate("ecommerce.canvasArrangeBar.alignLeft") },
            { action: "align-center", label: translate("ecommerce.canvasArrangeBar.alignHorizontalCenters") },
            { action: "align-right", label: translate("ecommerce.canvasArrangeBar.alignRight") },
            { action: "align-top", label: translate("ecommerce.canvasArrangeBar.alignTop") },
            { action: "align-middle", label: translate("ecommerce.canvasArrangeBar.alignVerticalCenters") },
            { action: "align-bottom", label: translate("ecommerce.canvasArrangeBar.alignBottom") },
        ],
    },
    {
        label: translate("ecommerce.canvasArrangeBar.distribute"),
        items: [
            { action: "distribute-horizontal", label: translate("ecommerce.canvasArrangeBar.distributeHorizontally") },
            { action: "distribute-vertical", label: translate("ecommerce.canvasArrangeBar.distributeVertically") },
        ],
    },
    {
        label: translate("ecommerce.canvasArrangeBar.arrange"),
        items: [
            { action: "grid", label: translate("ecommerce.canvasArrangeBar.arrangeInGrid") },
            { action: "masonry", label: translate("ecommerce.canvasArrangeBar.masonryLayout") },
            { action: "row", label: translate("ecommerce.canvasArrangeBar.arrangeInOneRow") },
            { action: "column", label: translate("ecommerce.canvasArrangeBar.arrangeInOneColumn") },
        ],
    },
];

const EDGE = 12;
const GAP = 12;
const TOP_SAFE = 70;
const BOTTOM_SAFE = 96;

/**
 * 多选图片时悬浮在选区上方的“对齐排布”按钮，点击展开纯文字菜单。
 * 上方空间不足时移到选区下方，水平方向避开左侧 Agent 面板并限制在画布内。
 */
export function CommerceArrangeMenu({
    bounds,
    frame,
    leftInset,
    rightInset = 0,
    count,
    onArrange,
    onDownload,
    onClear,
}: {
    bounds: { x: number; y: number; width: number; height: number };
    frame: { width: number; height: number };
    leftInset: number;
    count: number;
    rightInset?: number;
    onArrange: (action: CommerceArrangeAction) => void;
    onDownload?: () => void;
    onClear?: () => void;
}) {
    const bar = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 120, height: 34 });
    useLayoutEffect(() => {
        const element = bar.current;
        if (element && (element.offsetWidth !== size.width || element.offsetHeight !== size.height)) setSize({ width: element.offsetWidth, height: element.offsetHeight });
    });
    const half = size.width / 2;
    const minCenter = leftInset + EDGE + half;
    const maxCenter = frame.width - rightInset - EDGE - half;
    const center = minCenter > maxCenter ? (leftInset + frame.width - rightInset) / 2 : Math.min(maxCenter, Math.max(minCenter, bounds.x + bounds.width / 2));
    const above = bounds.y - GAP - size.height;
    const below = bounds.y + bounds.height + GAP;
    const top = above >= TOP_SAFE ? above : below + size.height <= frame.height - BOTTOM_SAFE ? below : TOP_SAFE;
    const items: MenuProps["items"] = [
        ...arrangeGroups.map((group) => ({
            type: "group" as const,
            key: group.label,
            label: group.label,
            children: group.items.map(({ action, label }) => {
                const minimum = commerceArrangeMinimum(action);
                return { key: action, label: count < minimum ? translate("ecommerce.canvasArrangeBar.atLeastImages", { v0: String(label), v1: String(minimum) }) : label, disabled: count < minimum };
            }),
        })),
        { type: "divider" as const },
        { key: "reset", label: translate("ecommerce.canvasArrangeBar.restoreDefaultPositions") },
    ];
    const available = frame.width - leftInset - rightInset - EDGE * 2;
    return (
        <div ref={bar} className="commerce-arrange-bar" role="group" aria-label={translate("ecommerce.canvasArrangeBar.multipleImageActions")} data-compact={available < 620 || undefined} data-canvas-no-zoom style={{ left: center, top, maxWidth: Math.max(180, available) }}>
            <span className="commerce-selection-count">{translate("ecommerce.canvasArrangeBar.selected")} {count} {translate("canvasA.characterLibrary.pageItem")}</span>
            <Dropdown trigger={["click"]} placement="bottom" menu={{ items, onClick: ({ key }) => onArrange(key as CommerceArrangeAction) }}>
                <button type="button" aria-haspopup="menu" aria-label={translate("ecommerce.canvasArrangeBar.alignAndArrangeSelectedImages", { v0: String(count) })}>
                    {translate("ecommerce.canvasArrangeBar.alignAndArrange")}
                    <ChevronDown size={13} aria-hidden="true" />
                </button>
            </Dropdown>
            <button type="button" onClick={onDownload} disabled={!onDownload}>
                <Download size={14} />
                {translate("ecommerce.canvasArrangeBar.exportZIP")}
            </button>
            {[
                [translate("canvasB.imageTools.cropLabel"), Crop],
                [translate("ecommerce.canvasArrangeBar.blendImages"), Images],
                [translate("ecommerce.canvasArrangeBar.aIBackgroundRemoval"), Scissors],
                [translate("ecommerce.canvasArrangeBar.expandImage"), Maximize2],
            ].map(([label, Icon]) => {
                const ToolIcon = Icon as typeof Crop;
                return (
                    <button key={label as string} type="button" disabled title={translate("ecommerce.canvasArrangeBar.isComingSoon", { v0: String(label) })}>
                        <ToolIcon size={14} />
                        <span>{label as string}</span>
                    </button>
                );
            })}
            <button type="button" onClick={onClear} aria-label={translate("ecommerce.canvasArrangeBar.clearSelection")} title={translate("ecommerce.canvasArrangeBar.clearSelection")}>
                <X size={14} />
            </button>
        </div>
    );
}
