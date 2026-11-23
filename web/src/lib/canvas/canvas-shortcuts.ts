import { translate } from "@/i18n";
export type CanvasShortcutCategoryId = "common" | "navigation" | "selection" | "editing";

export type CanvasShortcutCategory = {
    id: CanvasShortcutCategoryId;
    label: string;
    description: string;
};

export type CanvasShortcutItem = {
    id: string;
    category: CanvasShortcutCategoryId;
    title: string;
    description: string;
    keys: string[][];
    keywords?: string[];
};

export const CANVAS_MODIFIER_KEY = "Ctrl / Cmd";

export const CANVAS_SHORTCUT_CATEGORIES: CanvasShortcutCategory[] = [
    { id: "common", label: translate("shared.canvas.canvasShortcuts.common"), description: translate("shared.canvas.canvasShortcuts.searchSaveAndInterface") },
    { id: "navigation", label: translate("shared.canvas.canvasShortcuts.viewAndNavigation"), description: translate("shared.canvas.canvasShortcuts.panZoomAndLocate") },
    { id: "selection", label: translate("shared.canvas.canvasShortcuts.selectionAndConnections"), description: translate("shared.canvas.canvasShortcuts.batchSelectionAndNodeConnections") },
    { id: "editing", label: translate("shared.canvas.canvasShortcuts.editingAndFiles"), description: translate("shared.canvas.canvasShortcuts.editUndoAndImport") },
];

export const CANVAS_SHORTCUTS: CanvasShortcutItem[] = [
    {
        id: "search",
        category: "common",
        title: translate("canvasC.nodeList.searchLabel"),
        description: translate("shared.canvas.canvasShortcuts.searchByNameOrContentAndLocateNodes"),
        keys: [[CANVAS_MODIFIER_KEY, "F"]],
        keywords: ["查找", "定位", "find", "search"],
    },
    {
        id: "shortcuts",
        category: "common",
        title: translate("shared.canvas.canvasShortcuts.openShortcutCenter"),
        description: translate("shared.canvas.canvasShortcuts.viewKeyboardAndMouseControlsForTheCanvas"),
        keys: [["?"]],
        keywords: ["帮助", "说明", "help"],
    },
    {
        id: "agent",
        category: "common",
        title: translate("shared.canvas.canvasShortcuts.openOrCollapseAgent"),
        description: translate("shared.canvas.canvasShortcuts.openingFocusesTheInputPressAgainWhileAgentHasFocus"),
        keys: [[CANVAS_MODIFIER_KEY, "J"]],
        keywords: ["助手", "AI", "对话", "agent"],
    },
    {
        id: "save",
        category: "common",
        title: translate("shared.canvas.canvasShortcuts.saveCanvas"),
        description: translate("shared.canvas.canvasShortcuts.saveTheCurrentCanvasLayoutAndNodePositions"),
        keys: [[CANVAS_MODIFIER_KEY, "S"]],
        keywords: ["存储", "save"],
    },
    {
        id: "focus",
        category: "common",
        title: translate("shared.canvas.canvasShortcuts.enterOrExitFocusMode"),
        description: translate("shared.canvas.canvasShortcuts.hideInterfaceDistractionsAndFocusOnTheCanvas"),
        keys: [["Shift", CANVAS_MODIFIER_KEY, "F"]],
        keywords: ["沉浸", "全屏", "focus"],
    },
    {
        id: "pan",
        category: "navigation",
        title: translate("shared.canvas.canvasShortcuts.panTheView"),
        description: translate("shared.canvas.canvasShortcuts.swipeWithTwoFingersOnATrackpadHoldSpaceOr"),
        keys: [[translate("shared.canvas.canvasShortcuts.twoFingerTrackpadSwipe")], ["Space", translate("shared.canvas.canvasShortcuts.leftDrag")], [translate("shared.canvas.canvasShortcuts.middleButtonDrag")]],
        keywords: ["移动", "画布", "触控板", "pan"],
    },
    {
        id: "zoom-wheel",
        category: "navigation",
        title: translate("shared.canvas.canvasShortcuts.zoomTheCanvas"),
        description: translate("shared.canvas.canvasShortcuts.zoomAroundThePointerPosition"),
        keys: [[translate("shared.canvas.canvasShortcuts.scrollWheel")]],
        keywords: ["放大", "缩小", "zoom"],
    },
    {
        id: "resize-selected-image",
        category: "navigation",
        title: translate("shared.canvas.canvasShortcuts.resizeTheSelectedImageProportionally"),
        description: translate("shared.canvas.canvasShortcuts.selectOneUnlockedImageAndHoldCtrlWhileScrollingOnly"),
        keys: [["Ctrl", translate("shared.canvas.canvasShortcuts.scrollWheel")]],
        keywords: ["图片", "节点", "大小", "比例"],
    },
    {
        id: "zoom-controls",
        category: "navigation",
        title: translate("shared.canvas.canvasShortcuts.fineTuneTheZoom"),
        description: translate("shared.canvas.canvasShortcuts.adjustZoomWithTheCanvasZoomSlider"),
        keys: [[translate("shared.canvas.canvasShortcuts.zoomSlider")]],
        keywords: ["比例", "zoom"],
    },
    {
        id: "zoom-steps",
        category: "navigation",
        title: translate("shared.canvas.canvasShortcuts.zoomCanvasInSteps"),
        description: translate("shared.canvas.canvasShortcuts.zoomInOrOutByAFixedStep"),
        keys: [
            [CANVAS_MODIFIER_KEY, "+"],
            [CANVAS_MODIFIER_KEY, "-"],
        ],
        keywords: ["放大", "缩小", "zoom"],
    },
    {
        id: "zoom-presets",
        category: "navigation",
        title: translate("shared.canvas.canvasShortcuts.quickViewAdjustment"),
        description: translate("shared.canvas.canvasShortcuts.item01Restores1002FitsTheCanvas3Fits"),
        keys: [
            [CANVAS_MODIFIER_KEY, "0"],
            [CANVAS_MODIFIER_KEY, "1"],
            [CANVAS_MODIFIER_KEY, "2"],
            [CANVAS_MODIFIER_KEY, "3"],
        ],
        keywords: ["100%", "适应", "居中", "缩放", "fit"],
    },
    {
        id: "box-select",
        category: "selection",
        title: translate("shared.canvas.canvasShortcuts.marqueeSelectNodes"),
        description: translate("shared.canvas.canvasShortcuts.dragOnEmptySpaceToBoxSelectShiftAddsCommand"),
        keys: [
            [translate("shared.canvas.canvasShortcuts.leftDragOnEmptySpace")],
            ["Shift", translate("shared.canvas.canvasShortcuts.drag")],
            [CANVAS_MODIFIER_KEY, translate("shared.canvas.canvasShortcuts.drag")],
            ["Alt", translate("shared.canvas.canvasShortcuts.drag")],
        ],
        keywords: ["多选", "范围", "selection"],
    },
    {
        id: "box-select-tool",
        category: "selection",
        title: translate("shared.canvas.canvasShortcuts.useTheAreaSelectionTool"),
        description: translate("shared.canvas.canvasShortcuts.switchTheBottomToolbarControlToAreaSelectionThenDrag"),
        keys: [[translate("shared.canvas.canvasShortcuts.areaSelection"), translate("shared.canvas.canvasShortcuts.drag")]],
        keywords: ["工具栏", "多选", "selection"],
    },
    {
        id: "add-selection",
        category: "selection",
        title: translate("shared.canvas.canvasShortcuts.addToSelection"),
        description: translate("shared.canvas.canvasShortcuts.keepTheCurrentSelectionAndAddMoreNodes"),
        keys: [
            ["Shift", translate("shared.canvas.canvasShortcuts.click")],
            [CANVAS_MODIFIER_KEY, translate("shared.canvas.canvasShortcuts.click")],
        ],
        keywords: ["多选", "添加", "selection"],
    },
    {
        id: "remove-selection",
        category: "selection",
        title: translate("shared.canvas.canvasShortcuts.removeFromSelection"),
        description: translate("shared.canvas.canvasShortcuts.removeClickedOrBoxSelectedNodesFromTheCurrentSelection"),
        keys: [["Alt", translate("shared.canvas.canvasShortcuts.clickMarquee")]],
        keywords: ["取消", "排除", "selection"],
    },
    {
        id: "select-all",
        category: "selection",
        title: translate("shared.canvas.canvasShortcuts.selectAllNodes"),
        description: translate("shared.canvas.canvasShortcuts.selectAllNodesOnTheCanvas"),
        keys: [[CANVAS_MODIFIER_KEY, "A"]],
        keywords: ["全部", "select all"],
    },
    {
        id: "batch-connect",
        category: "selection",
        title: translate("shared.canvas.canvasShortcuts.connectNodesInBatch"),
        description: translate("shared.canvas.canvasShortcuts.enterBatchConnectionModeForTwoOrMoreSelectedNodes"),
        keys: [["Alt", "L"]],
        keywords: ["连线", "连接", "link"],
    },
    {
        id: "copy",
        category: "editing",
        title: translate("shared.canvas.canvasShortcuts.duplicateNode"),
        description: translate("shared.canvas.canvasShortcuts.copyTheSelectedNodes"),
        keys: [[CANVAS_MODIFIER_KEY, "C"]],
        keywords: ["copy"],
    },
    {
        id: "paste",
        category: "editing",
        title: translate("shared.canvas.canvasShortcuts.pasteNodesOrClipboardContent"),
        description: translate("shared.canvas.canvasShortcuts.pasteCopiedNodesTextOrImages"),
        keys: [[CANVAS_MODIFIER_KEY, "V"]],
        keywords: ["剪贴板", "paste"],
    },
    {
        id: "delete",
        category: "editing",
        title: translate("shared.canvas.canvasShortcuts.deleteSelection"),
        description: translate("shared.canvas.canvasShortcuts.deleteSelectedNodesOrConnections"),
        keys: [["Delete"], ["Backspace"]],
        keywords: ["移除", "delete"],
    },
    {
        id: "undo",
        category: "editing",
        title: translate("account.settings.memory.actors.restore"),
        description: translate("shared.canvas.canvasShortcuts.undoThePreviousCanvasEdit"),
        keys: [[CANVAS_MODIFIER_KEY, "Z"]],
        keywords: ["undo"],
    },
    {
        id: "redo",
        category: "editing",
        title: translate("shared.canvas.toolRegistry.definitions.mainToolbarTools.redo"),
        description: translate("shared.canvas.canvasShortcuts.restoreTheCanvasEditYouJustUndid"),
        keys: [
            [CANVAS_MODIFIER_KEY, "Shift", "Z"],
            [CANVAS_MODIFIER_KEY, "Y"],
        ],
        keywords: ["恢复", "redo"],
    },
    {
        id: "escape",
        category: "editing",
        title: translate("shared.canvas.canvasShortcuts.cancelCurrentOperation"),
        description: translate("shared.canvas.canvasShortcuts.deselectCloseOverlaysOrExitFocusMode"),
        keys: [["Esc"]],
        keywords: ["关闭", "退出", "cancel"],
    },
    {
        id: "import-media",
        category: "editing",
        title: translate("shared.plugins.builtin.editor.editorAssetIngest.importMedia"),
        description: translate("shared.canvas.canvasShortcuts.dragImageVideoOrAudioFilesOntoTheCanvas"),
        keys: [[translate("shared.canvas.canvasShortcuts.dropMedia")]],
        keywords: ["上传", "文件", "图片", "视频", "音频", "upload"],
    },
];

export function filterCanvasShortcuts(query: string, category?: CanvasShortcutCategoryId | "all") {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);

    return CANVAS_SHORTCUTS.filter((shortcut) => {
        if (category && category !== "all" && shortcut.category !== category) return false;
        if (!terms.length) return true;

        const categoryLabel = CANVAS_SHORTCUT_CATEGORIES.find((entry) => entry.id === shortcut.category)?.label || "";
        const searchableText = [shortcut.title, shortcut.description, categoryLabel, shortcut.keys.flat().join(" "), ...(shortcut.keywords || [])].join(" ").toLocaleLowerCase();
        return terms.every((term) => searchableText.includes(term));
    });
}
