import { AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignHorizontalSpaceAround, AlignHorizontalSpaceBetween, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalSpaceAround, AlignVerticalSpaceBetween, AtSign, Film, FolderTree, Grid3X3, LayoutTemplate, Link2, LoaderCircle, Workflow } from "lucide-react";

import { registerToolbarTools, type ToolDefinition } from "@/lib/canvas/tool-registry";
import { translate } from "@/i18n";


export const selectionToolbarTools: ToolDefinition[] = [
    { id: "selection-align-left", toolbar: "selection", category: "layout", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.alignLeft"), icon: <AlignHorizontalJustifyStart />, defaultVisible: true, defaultOrder: 10, run: (ctx) => ctx.handlers.onAlign("left") },
    { id: "selection-align-center-x", toolbar: "selection", category: "layout", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.alignHorizontalCenters"), icon: <AlignHorizontalJustifyCenter />, defaultVisible: true, defaultOrder: 20, run: (ctx) => ctx.handlers.onAlign("centerX") },
    { id: "selection-align-right", toolbar: "selection", category: "layout", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.alignRight"), icon: <AlignHorizontalJustifyEnd />, defaultVisible: true, defaultOrder: 30, run: (ctx) => ctx.handlers.onAlign("right") },
    { id: "selection-align-top", toolbar: "selection", category: "layout", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.alignTops"), icon: <AlignVerticalJustifyStart />, defaultVisible: true, defaultOrder: 40, run: (ctx) => ctx.handlers.onAlign("top") },
    { id: "selection-align-center-y", toolbar: "selection", category: "layout", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.alignVerticalCenters"), icon: <AlignVerticalJustifyCenter />, defaultVisible: true, defaultOrder: 50, run: (ctx) => ctx.handlers.onAlign("centerY") },
    { id: "selection-align-bottom", toolbar: "selection", category: "layout", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.alignBottoms"), icon: <AlignVerticalJustifyEnd />, defaultVisible: true, defaultOrder: 60, run: (ctx) => ctx.handlers.onAlign("bottom") },
    { id: "selection-distribute-x", toolbar: "selection", category: "layout", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.distributeHorizontally"), icon: <AlignHorizontalSpaceBetween />, defaultVisible: true, defaultOrder: 70, disabled: (ctx) => ctx.selectedCount < 3, run: (ctx) => ctx.handlers.onAlign("distributeX") },
    { id: "selection-distribute-y", toolbar: "selection", category: "layout", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.distributeVertically"), icon: <AlignVerticalSpaceBetween />, defaultVisible: true, defaultOrder: 80, disabled: (ctx) => ctx.selectedCount < 3, run: (ctx) => ctx.handlers.onAlign("distributeY") },
    { id: "selection-arrange-row", toolbar: "selection", category: "arrange", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.arrangeHorizontally"), icon: <AlignHorizontalSpaceAround />, defaultVisible: false, defaultOrder: 90, run: (ctx) => ctx.handlers.onArrange("row") },
    { id: "selection-arrange-column", toolbar: "selection", category: "arrange", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.arrangeVertically"), icon: <AlignVerticalSpaceAround />, defaultVisible: false, defaultOrder: 100, run: (ctx) => ctx.handlers.onArrange("column") },
    { id: "selection-arrange-grid", toolbar: "selection", category: "arrange", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.gridLayout"), icon: <Grid3X3 />, defaultVisible: false, defaultOrder: 110, run: (ctx) => ctx.handlers.onArrange("grid") },
    { id: "selection-arrange-flow", toolbar: "selection", category: "arrange", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.arrangeByConnections"), icon: <Workflow />, defaultVisible: false, defaultOrder: 120, run: (ctx) => ctx.handlers.onArrange("flow") },
    { id: "selection-create-storyboard", toolbar: "selection", category: "selection", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.createShotGroup"), icon: <LayoutTemplate />, defaultVisible: true, defaultOrder: 130, disabled: (ctx) => ctx.selectedCount < 2, run: (ctx) => ctx.handlers.onCreateStoryboard() },
    { id: "selection-create-reference-group", toolbar: "selection", category: "selection", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.createReferenceGroup"), icon: <FolderTree />, defaultVisible: false, defaultOrder: 140, disabled: (ctx) => ctx.selectedCount < 2, run: (ctx) => ctx.handlers.onCreateReferenceGroup() },
    { id: "selection-batch-connect", toolbar: "selection", category: "selection", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.connectInBatch"), icon: <Link2 />, defaultVisible: true, defaultOrder: 145, disabled: (ctx) => ctx.selectedCount < 2, run: (ctx) => ctx.handlers.onBatchConnect() },
    { id: "selection-send-to-agent", toolbar: "selection", category: "selection", label: translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.sendToAgent"), icon: <AtSign />, defaultVisible: true, defaultOrder: 148, disabled: (ctx) => ctx.selectedCount < 1, run: (ctx) => ctx.handlers.onSendSelectionToAgent() },
    {
        id: "selection-merge-videos",
        toolbar: "selection",
        category: "selection",
        label: (ctx) => translate("shared.canvas.toolRegistry.definitions.selectionToolbarTools.mergeSelectedVideos", { v0: String(ctx.selectedVideoCount) }),
        icon: (ctx) => ctx.mergingVideos ? <LoaderCircle className="animate-spin" /> : <Film />,
        defaultVisible: true,
        defaultOrder: 150,
        applicable: (ctx) => ctx.selectedVideoCount >= 2,
        disabled: (ctx) => ctx.mergingVideos,
        run: (ctx) => ctx.handlers.onMergeVideos(),
    },
];

registerToolbarTools(selectionToolbarTools);
