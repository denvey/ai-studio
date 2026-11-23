import { AnimatePresence } from "motion/react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, AtSign, Check, ChevronRight, CircleCheckBig, Clapperboard, Clipboard, CloudUpload, Copy, Download, FolderOpen, FolderPlus, History, Image as ImageIcon, Layers3, LayoutTemplate, Link2, Maximize2, PanelTop, Pencil, Plus, Redo2, Tags, Trash2, Undo2, Upload, UserRound } from "lucide-react";

import { CanvasCreateMenu, type CanvasCreateCommand } from "@/components/canvas/canvas-create-menu";
import { ASSET_ASSIGNABLE_CATEGORY_OPTIONS } from "@/lib/asset-category";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { SpotlightSurface } from "@/components/ui/aceternity/spotlight-surface";
import { canvasThemes } from "@/lib/canvas-theme";
import { canvasNodeAssetCategory } from "@/lib/canvas/canvas-node-asset";
import { isCanvasFolderNode } from "@/lib/canvas/canvas-frame";
import { currentMediaVersion, hasMediaVersionHistory, listMediaVersions } from "@/lib/canvas/canvas-media-versions";
import { formatRelativeTime } from "@/lib/relative-time";
import { resolveAddNodeMenuCommands, type AddNodeMenuContext } from "@/lib/canvas/tool-registry";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { usePluginStore } from "@/stores/use-plugin-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeTypeId, type CanvasWorkspaceMode, type ContextMenuState, type Position } from "@/types/canvas";
import { translate } from "@/i18n";

type CanvasAssetCategory = NonNullable<NonNullable<CanvasNodeData["metadata"]>["assetCategory"]>;

const assetCategoryOptions: Array<{ value: CanvasAssetCategory; label: string }> = ASSET_ASSIGNABLE_CATEGORY_OPTIONS;

type CanvasNodeContextMenuProps = {
    menu: ContextMenuState;
    node?: CanvasNodeData | null;
    workspaceMode?: CanvasWorkspaceMode;
    isProjectLinked?: boolean;
    canUndo: boolean;
    canRedo: boolean;
    canPaste: boolean;
    selectedCount?: number;
    onClose: () => void;
    onAddNode: (type: CanvasNodeTypeId) => void;
    onAddFolder: () => void;
    onChooseStyle: () => void;
    onOpenPrevis: (position: Position) => void;
    onUpload: () => void;
    onOpenAssets: () => void;
    onOpenProjectCharacters: () => void;
    onOpenPoseLibrary?: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onPaste: () => void;
    onCopyNode: () => void;
    onCreateGenerationCopy: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onSaveAsset: () => void;
    onViewMedia: () => void;
    onOpenVersions?: () => void;
    onEditText: () => void;
    onOpenDrawing: () => void;
    onGenerateImage: () => void;
    onCopyContent: () => void;
    onCopyMediaUrl: () => void;
    onUploadToArkPrivateAsset: () => void;
    onSetAssetCategory: (category: CanvasAssetCategory) => void;
    onToggleFrame: () => void;
    onSpreadSelection?: () => void;
    onCopySelection?: () => void;
    onDeleteSelection?: () => void;
    onSendToAgent?: () => void;
    /** 选区中可下载的图片、视频、音频节点数。 */
    downloadableSelectionCount?: number;
    onDownloadSelection?: () => void;
    /** 关联短剧的精修画布：把图片或视频采用到短剧。 */
    onAdoptToDrama?: () => void;
    /** 分镜脚本节点：交给短剧自动制作。 */
    onCreateDramaFromStoryboard?: () => void;
};

export function CanvasNodeContextMenu({
    menu,
    node,
    workspaceMode = "professional",
    isProjectLinked = false,
    canUndo,
    canRedo,
    canPaste,
    selectedCount = 0,
    onClose,
    onAddNode,
    onAddFolder,
    onChooseStyle,
    onOpenPrevis,
    onUpload,
    onOpenAssets,
    onOpenProjectCharacters,
    onOpenPoseLibrary,
    onUndo,
    onRedo,
    onPaste,
    onCopyNode,
    onCreateGenerationCopy,
    onDuplicate,
    onDelete,
    onSaveAsset,
    onViewMedia,
    onOpenVersions,
    onEditText,
    onOpenDrawing,
    onGenerateImage,
    onCopyContent,
    onCopyMediaUrl,
    onUploadToArkPrivateAsset,
    onSetAssetCategory,
    onToggleFrame,
    onSpreadSelection,
    onCopySelection,
    onDeleteSelection,
    onSendToAgent,
    downloadableSelectionCount = 0,
    onDownloadSelection,
    onAdoptToDrama,
    onCreateDramaFromStoryboard,
}: CanvasNodeContextMenuProps) {
    const theme = canvasThemes[useActiveTheme()];
    const [addOpen, setAddOpen] = useState(false);
    const [categoryOpen, setCategoryOpen] = useState(false);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (categoryOpen) setCategoryOpen(false);
            else onClose();
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [categoryOpen, onClose]);

    useEffect(() => {
        setAddOpen(menu.type === "canvas" && Boolean(menu.createOpen));
        setCategoryOpen(false);
    }, [menu]);

    const runAction = (action: () => void) => {
        action();
        onClose();
    };
    const nodeContent = typeof node?.metadata?.content === "string" ? node.metadata.content : "";
    const isImage = node?.type === CanvasNodeType.Image;
    const isText = node?.type === CanvasNodeType.Text;
    const isCharacterReference = Boolean(isText && node?.metadata?.workflowKind === "character" && node.metadata.characterAssetId);
    const isDrawing = node?.type === CanvasNodeType.Drawing;
    const isVideo = node?.type === CanvasNodeType.Video;
    const isMedia = isImage || isVideo;
    const isAudio = node?.type === CanvasNodeType.Audio;
    const isFrame = node?.type === CanvasNodeType.Frame;
    const isFolder = isCanvasFolderNode(node);
    const hasNodeContent = isText ? Boolean(nodeContent.trim()) : Boolean(nodeContent);
    const canSaveAsset = Boolean(node && !isCharacterReference && (isText ? hasNodeContent : hasNodeContent && (isImage || isVideo || isAudio)));
    const canOpenPreview = Boolean(isMedia && hasNodeContent);
    const canGenerateFromText = Boolean(isText && !isCharacterReference && hasNodeContent);
    const canCopyMediaUrl = Boolean(isMedia && hasNodeContent);
    const assetCategory = node ? canvasNodeAssetCategory(node) : "other";
    const hasMultiSelection = selectedCount >= 2;
    const versionCount = listMediaVersions(node).length;
    const versionCurrent = currentMediaVersion(node);
    const canOpenVersions = Boolean(onOpenVersions && hasMediaVersionHistory(node));
    const versionDetail = canOpenVersions
        ? versionCurrent ? translate("canvasTools.canvasContextMenu.currentV", { v0: String(versionCurrent.number), v1: String(formatRelativeTime(versionCurrent.createdAt)) }) : translate("canvasTools.canvasContextMenu.currentContentIsNotInHistoryYouCanSwitchTo")
        : translate("canvasTools.canvasContextMenu.previousVersionsAreRetainedAfterRegenerationOrReplacement");
    const versionMenuButton = onOpenVersions ? (
        <MenuButton icon={<History />} label={translate("canvasB.mediaVersion.title")} badge={versionCount > 1 ? String(versionCount) : undefined} detail={versionDetail} disabled={!canOpenVersions} onClick={() => runAction(onOpenVersions)} />
    ) : null;
    const position = getContextMenuPosition(menu, hasMultiSelection);
    const skippedDownloadCount = Math.max(0, selectedCount - downloadableSelectionCount);
    const downloadSelectionButton = hasMultiSelection ? (
        <MenuButton
            icon={<Download />}
            label={downloadableSelectionCount ? translate("canvasTools.canvasContextMenu.downloadAssets", { v0: String(downloadableSelectionCount) }) : translate("canvasTools.canvasContextMenu.downloadAssets2")}
            detail={!downloadableSelectionCount ? translate("canvasTools.canvasContextMenu.noImagesVideosOrAudioInTheSelection") : skippedDownloadCount ? translate("canvasTools.canvasContextMenu.downloadIndividuallySkippingNonMediaNodes", { v0: String(skippedDownloadCount) }) : translate("canvasTools.canvasContextMenu.downloadIndividuallyAsSeparateFiles")}
            disabled={!onDownloadSelection || !downloadableSelectionCount}
            onClick={() => onDownloadSelection && runAction(onDownloadSelection)}
        />
    ) : null;

    return (
        <>
            <SpotlightSurface
                spotlightColor={theme.toolbar.itemHover}
                data-canvas-context-menu
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: aceternityMotion.duration.instant, ease: aceternityMotion.easing.enter }}
                className="aceternity-floating-panel fixed z-[var(--z-popover)] flex w-[224px] max-h-[calc(100vh-56px)] origin-top-left flex-col overflow-hidden rounded-[var(--r-lg)] border p-1.5 backdrop-blur-2xl backdrop-saturate-150"
                style={{ left: position.left, top: position.top, background: theme.spatial.elevated, borderColor: theme.toolbar.border, color: theme.node.text, "--menu-hover": theme.toolbar.itemHover, "--tw-ring-color": theme.node.muted } as CSSProperties}
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div className="thin-scrollbar min-h-0 overflow-y-auto">
                    {menu.type === "node" && isMedia && categoryOpen ? (
                        <>
                            <MenuHeader title={translate("canvasTools.canvasContextMenu.setAssetCategory")} description={node?.title || nodeTypeLabel(node)} onBack={() => setCategoryOpen(false)} />
                            <MenuSection label={translate("canvasTools.canvasContextMenu.projectPurpose")} />
                            {assetCategoryOptions.map((option) => (
                                <MenuButton
                                    key={option.value}
                                    icon={assetCategory === option.value ? <Check /> : <Tags />}
                                    label={option.label}
                                    active={assetCategory === option.value}
                                    onClick={() => runAction(() => onSetAssetCategory(option.value))}
                                />
                            ))}
                        </>
                    ) : menu.type === "canvas" ? (
                        <>
                            {hasMultiSelection ? (
                                <>
                                    <MenuButton icon={<LayoutTemplate className="size-4" />} label={translate("canvasTools.canvasContextMenu.autoArrangeCanvas")} detail={translate("canvasTools.canvasContextMenu.keepRelativeLayoutAndIncreaseSpacing")} disabled={!onSpreadSelection} onClick={() => onSpreadSelection && runAction(onSpreadSelection)} />
                                    {downloadSelectionButton}
                                    <MenuDivider />
                                </>
                            ) : null}
                            <MenuButton icon={<Plus className="size-4" />} label={translate("canvasA.createMenu.title")} chevron active={addOpen} onClick={() => setAddOpen((value) => !value)} />
                            <MenuButton icon={<Upload className="size-4" />} label={translate("canvasTools.canvasContextMenu.dropHereToUpload")} onClick={() => runAction(onUpload)} />
                            {!isProjectLinked ? <MenuButton icon={<FolderOpen className="size-4" />} label={translate("canvasTools.canvasContextMenu.insertFromLibrary")} onClick={() => runAction(onOpenAssets)} /> : null}
                            <MenuDivider />
                            <MenuButton icon={<Undo2 className="size-4" />} label={translate("account.settings.memory.actors.restore")} shortcut="⌘Z" disabled={!canUndo} onClick={() => runAction(onUndo)} />
                            <MenuButton icon={<Redo2 className="size-4" />} label={translate("canvasTools.canvasContextMenu.redo")} shortcut="⇧⌘Z" disabled={!canRedo} onClick={() => runAction(onRedo)} />
                            <MenuButton icon={<Clipboard className="size-4" />} label={translate("canvasTools.canvasContextMenu.paste")} shortcut="⌘V" disabled={!canPaste} onClick={() => runAction(onPaste)} />
                        </>
                    ) : menu.type === "node" && hasMultiSelection ? (
                        <>
                            <MenuHeader title={translate("canvasTools.canvasContextMenu.nodesSelected", { v0: String(selectedCount) })} />
                            <MenuSection label={translate("canvasTools.canvasContextMenu.selection")} />
                            <MenuButton icon={<LayoutTemplate />} label={translate("canvasTools.canvasContextMenu.autoArrangeCanvas")} detail={translate("canvasTools.canvasContextMenu.keepRelativeLayoutAndIncreaseSpacing")} disabled={!onSpreadSelection} onClick={() => onSpreadSelection && runAction(onSpreadSelection)} />
                            <MenuDivider />
                            <MenuButton icon={<Copy />} label={translate("canvasTools.canvasContextMenu.copyNodes", { v0: String(selectedCount) })} shortcut="⌘C" disabled={!onCopySelection} onClick={() => onCopySelection && runAction(onCopySelection)} />
                            {downloadSelectionButton}
                            <MenuButton icon={<AtSign />} label={translate("canvasTools.canvasContextMenu.sendToAgent")} disabled={!onSendToAgent} onClick={() => onSendToAgent && runAction(onSendToAgent)} />
                            <MenuButton icon={<Trash2 />} label={translate("canvasTools.canvasContextMenu.deleteNodes", { v0: String(selectedCount) })} danger disabled={!onDeleteSelection} onClick={() => onDeleteSelection && runAction(onDeleteSelection)} />
                        </>
                    ) : menu.type === "node" ? (
                        <>
                            {isCharacterReference ? (
                                <>
                                    <MenuHeader title={translate("canvasA.characterNode.card")} description={node?.metadata?.characterName || node?.title} />
                                    <MenuSection label={translate("canvasTools.canvasContextMenu.characterReference")} />
                                    <MenuButton icon={<UserRound />} label={translate("canvasTools.canvasContextMenu.viewCharacterDetails")} onClick={() => runAction(onEditText)} />
                                    <MenuDivider />
                                    <MenuSection label={translate("canvasTools.canvasContextMenu.node")} />
                                    <MenuButton icon={<AtSign />} label={translate("canvasTools.canvasContextMenu.sendToAgent")} disabled={!onSendToAgent} onClick={() => onSendToAgent && runAction(onSendToAgent)} />
                                    <MenuButton icon={<Copy />} label={translate("canvasTools.canvasContextMenu.copyCharacterReference")} shortcut="⌘C" onClick={() => runAction(onCopyNode)} />
                                    <MenuButton icon={<Layers3 />} label={translate("canvasTools.canvasContextMenu.createALinkedCopy")} shortcut="⌘D" onClick={() => runAction(onDuplicate)} />
                                    <MenuButton icon={<Trash2 />} label={translate("canvasTools.canvasContextMenu.deleteNode")} danger onClick={() => runAction(onDelete)} />
                                </>
                            ) : isMedia ? (
                                <>
                                    <MenuHeader title={isImage ? translate("account.feedback.image") : translate("account.feedback.video")} description={node?.title || nodeTypeLabel(node)} />
                                    <MenuSection label={translate("canvasTools.canvasContextMenu.viewAndArchive")} />
                                    <MenuButton icon={<Maximize2 />} label={translate("canvasTools.canvasContextMenu.enterPanoramaPreview")} disabled={!canOpenPreview} onClick={() => runAction(onViewMedia)} />
                                    {onAdoptToDrama ? <MenuButton icon={<CircleCheckBig />} label={translate("canvasA.dramaAdopt.title")} detail={isImage ? translate("canvasTools.canvasContextMenu.setAsSettingReferenceImage") : translate("canvasTools.canvasContextMenu.setAsStorySegmentVideo")} disabled={!hasNodeContent} onClick={() => runAction(onAdoptToDrama)} /> : null}
                                    {versionMenuButton}
                                    <MenuButton icon={<Tags />} label={translate("canvasTools.canvasContextMenu.setAssetCategory")} chevron onClick={() => setCategoryOpen(true)} />
                                    {isImage ? <MenuButton icon={<CloudUpload />} label={translate("canvasTools.canvasContextMenu.uploadToArkAssetLibrary")} onClick={() => runAction(onUploadToArkPrivateAsset)} /> : null}
                                    <MenuDivider />
                                    <MenuSection label={translate("canvasTools.canvasContextMenu.node")} />
                                    <MenuButton icon={<AtSign />} label={translate("canvasTools.canvasContextMenu.sendToAgent")} disabled={!onSendToAgent} onClick={() => onSendToAgent && runAction(onSendToAgent)} />
                                    <MenuButton icon={<Copy />} label={translate("canvasTools.canvasContextMenu.duplicateNode")} shortcut="⌘C" onClick={() => runAction(onCopyNode)} />
                                    {isImage ? <MenuButton icon={<Clipboard />} label={translate("canvasTools.canvasContextMenu.copyImage")} disabled={!hasNodeContent} onClick={() => runAction(onCopyContent)} /> : null}
                                    <MenuButton icon={<Link2 />} label={isImage ? translate("canvasTools.canvasContextMenu.copyImageURL") : translate("canvasTools.canvasContextMenu.copyVideoURL")} disabled={!canCopyMediaUrl} onClick={() => runAction(onCopyMediaUrl)} />
                                    <MenuButton icon={<Copy />} label={translate("canvasTools.canvasContextMenu.createAGenerationCopy")} onClick={() => runAction(onCreateGenerationCopy)} />
                                    <MenuButton icon={<Layers3 />} label={translate("canvasTools.canvasContextMenu.createAParameterVariant")} shortcut="⌘D" onClick={() => runAction(onDuplicate)} />
                                    <MenuButton icon={<Trash2 />} label={translate("canvasTools.canvasContextMenu.deleteNode")} danger onClick={() => runAction(onDelete)} />
                                </>
                            ) : (
                                <>
                                    <MenuHeader title={node?.title || nodeTypeLabel(node)} />
                                    <MenuSection label={translate("canvasTools.canvasContextMenu.nodeActions")} />
                                    {isFrame ? <MenuButton icon={isFolder ? <FolderOpen /> : <PanelTop />} label={node?.metadata?.frame?.collapsed ? translate("canvasTools.canvasContextMenu.expand", { v0: String(isFolder ? translate("library.picker.folders") : translate("canvasTools.canvasContextMenu.backdrop")) }) : translate("canvasTools.canvasContextMenu.collapse", { v0: String(isFolder ? translate("library.picker.folders") : translate("canvasTools.canvasContextMenu.backdrop")) })} onClick={() => runAction(onToggleFrame)} /> : <MenuButton icon={<FolderPlus />} label={translate("canvasTools.canvasContextMenu.saveToMyAssets")} disabled={!canSaveAsset} onClick={() => runAction(onSaveAsset)} />}
                                    {isText ? <MenuButton icon={<Maximize2 />} label={translate("canvasTools.canvasContextMenu.enlargeToEdit")} onClick={() => runAction(onEditText)} /> : null}
                                    {isDrawing ? <MenuButton icon={<Pencil />} label={translate("canvasTools.canvasContextMenu.openDrawing")} onClick={() => runAction(onOpenDrawing)} /> : null}
                                    {isAudio ? versionMenuButton : null}
                                    {isText ? <MenuButton icon={<ImageIcon />} label={translate("canvasTools.canvasContextMenu.generateAnImageFromText")} disabled={!canGenerateFromText} onClick={() => runAction(onGenerateImage)} /> : null}
                                    {onCreateDramaFromStoryboard ? <MenuButton icon={<Clapperboard />} label={translate("canvasTools.canvasContextMenu.sendToAutomaticDramaProduction")} detail={translate("canvasTools.canvasContextMenu.transcribeTheStoryboardAsWrittenToGenerateReferenceImagesAnd")} onClick={() => runAction(onCreateDramaFromStoryboard)} /> : null}
                                    <MenuDivider />
                                    <MenuSection label={translate("canvasTools.canvasContextMenu.copiesAndContent")} />
                                    <MenuButton icon={<AtSign />} label={translate("canvasTools.canvasContextMenu.sendToAgent")} disabled={!onSendToAgent} onClick={() => onSendToAgent && runAction(onSendToAgent)} />
                                    <MenuButton icon={<Copy />} label={isFrame ? translate("canvasTools.canvasContextMenu.copyAndContents", { v0: String(isFolder ? translate("library.picker.folders") : translate("canvasTools.canvasContextMenu.backdrop")) }) : translate("canvasTools.canvasContextMenu.duplicateNode")} shortcut="⌘C" onClick={() => runAction(onCopyNode)} />
                                    {isText ? <MenuButton icon={<Clipboard />} label={translate("canvasTools.canvasContextMenu.copyText")} disabled={!hasNodeContent} onClick={() => runAction(onCopyContent)} /> : null}
                                    <MenuButton icon={<Copy />} label={isFrame ? translate("canvasTools.canvasContextMenu.createACopyOf", { v0: String(isFolder ? translate("library.picker.folders") : translate("canvasTools.canvasContextMenu.backdrop")) }) : translate("canvasTools.canvasContextMenu.createAParameterVariant")} shortcut="⌘D" onClick={() => runAction(onDuplicate)} />
                                    <MenuButton icon={<Clipboard />} label={translate("canvasTools.canvasContextMenu.paste")} shortcut="⌘V" disabled={!canPaste} onClick={() => runAction(onPaste)} />
                                    <MenuButton icon={<Trash2 />} label={isFrame ? translate("canvasTools.canvasContextMenu.delete", { v0: String(isFolder ? translate("library.picker.folders") : translate("canvasTools.canvasContextMenu.backdrop")) }) : translate("canvasTools.canvasContextMenu.deleteNode")} danger onClick={() => runAction(onDelete)} />
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <MenuHeader title={translate("canvasTools.canvasContextMenu.connect")} />
                            <MenuButton icon={<Trash2 className="size-4" />} label={translate("canvasTools.canvasContextMenu.deleteConnection")} danger onClick={() => runAction(onDelete)} />
                        </>
                    )}
                </div>
            </SpotlightSurface>

            <AnimatePresence>
                {menu.type === "canvas" && addOpen ? (
                    <AddNodeContextMenu
                        parentPosition={position}
                        workspaceMode={workspaceMode}
                        isProjectLinked={isProjectLinked}
                        onAddNode={(type) => runAction(() => onAddNode(type))}
                        onAddFolder={() => runAction(onAddFolder)}
                        onChooseStyle={() => runAction(onChooseStyle)}
                        onOpenPrevis={() => runAction(() => onOpenPrevis(menu.position))}
                        onUpload={() => runAction(onUpload)}
                        onOpenAssets={() => runAction(onOpenAssets)}
                        onOpenProjectCharacters={() => runAction(onOpenProjectCharacters)}
                        onOpenPoseLibrary={onOpenPoseLibrary ? () => runAction(onOpenPoseLibrary) : undefined}
                    />
                ) : null}
            </AnimatePresence>
        </>
    );
}

function AddNodeContextMenu({ parentPosition, workspaceMode, isProjectLinked, onAddNode, onAddFolder, onChooseStyle, onOpenPrevis, onUpload, onOpenAssets, onOpenProjectCharacters, onOpenPoseLibrary }: { parentPosition: { left: number; top: number }; workspaceMode: CanvasWorkspaceMode; isProjectLinked: boolean; onAddNode: (type: CanvasNodeTypeId) => void; onAddFolder: () => void; onChooseStyle: () => void; onOpenPrevis: () => void; onUpload: () => void; onOpenAssets: () => void; onOpenProjectCharacters: () => void; onOpenPoseLibrary?: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    const installations = usePluginStore((state) => state.installations);
    const pluginStates = usePluginStore((state) => state.pluginStates);
    const left = getSubmenuLeft(parentPosition.left);
    const createContext: AddNodeMenuContext = {
        workspaceMode,
        isProjectLinked,
        enabledPluginIds: new Set(installations.filter((item) => pluginStates[item.manifest.id]?.effectiveEnabled ?? item.enabled).map((item) => item.manifest.id)),
        handlers: {
            onAddText: () => onAddNode(CanvasNodeType.Text),
            onAddImage: () => onAddNode(CanvasNodeType.Image),
            onAddVideo: () => onAddNode(CanvasNodeType.Video),
            onAddAudio: () => onAddNode(CanvasNodeType.Audio),
            onAddScript: () => onAddNode(CanvasNodeType.Script),
            onAddFrame: () => onAddNode(CanvasNodeType.Frame),
            onAddFolder,
            onAddDrawing: () => onAddNode(CanvasNodeType.Drawing),
            onAddExtensionNode: onAddNode,
            onAddWorkflow: () => onAddNode(CanvasNodeType.Config),
            onChooseStyle,
            onOpenPrevis,
            onUpload,
            onOpenMyAssets: onOpenAssets,
            onOpenProjectCharacters,
            onOpenPoseLibrary,
        },
    };
    const commands: CanvasCreateCommand[] = resolveAddNodeMenuCommands(createContext).map((command) => ({
        id: command.id,
        label: command.label,
        icon: command.icon,
        badge: command.badge,
        section: command.section,
        onClick: () => command.run(createContext),
    }));

    return (
        <SpotlightSurface
            spotlightColor={theme.toolbar.itemHover}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: aceternityMotion.duration.instant, ease: aceternityMotion.easing.enter }}
            className="aceternity-floating-panel fixed z-[var(--z-popover)] w-[360px] origin-top overflow-hidden rounded-[var(--r-lg)] border p-1.5 backdrop-blur-2xl backdrop-saturate-150"
            style={{ left, top: parentPosition.top, background: theme.spatial.elevated, borderColor: theme.toolbar.border, color: theme.node.text }}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <CanvasCreateMenu commands={commands} />
        </SpotlightSurface>
    );
}

function MenuHeader({ title, description, onBack }: { title: string; description?: string; onBack?: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    return (
        <div className="mb-1 flex items-center gap-1.5 px-2 pb-1.5 pt-1.5">
            {onBack ? <button type="button" onClick={onBack} className="grid size-6 shrink-0 place-items-center rounded-[var(--r-md)] outline-none transition-colors hover:bg-[var(--menu-hover)] focus-visible:ring-2" aria-label={translate("canvasTools.canvasContextMenu.backToMediaActions")}><ArrowLeft className="size-3.5" /></button> : null}
            <span className="min-w-0">
                <span className="block truncate font-semibold leading-5" style={{ fontSize: "var(--fs-ui)" }}>{title}</span>
                {description && description !== title ? <span className="block truncate leading-4" style={{ color: theme.node.muted, fontSize: "var(--fs-label)" }}>{description}</span> : null}
            </span>
        </div>
    );
}

function MenuSection({ label }: { label: string }) {
    const theme = canvasThemes[useActiveTheme()];
    return <div className="px-2 pb-1 pt-1.5 font-medium leading-4" style={{ color: theme.node.faint, fontSize: "var(--fs-label)" }}>{label}</div>;
}

function MenuButton({ icon, label, detail, shortcut, badge, chevron = false, active = false, disabled = false, danger = false, onClick }: { icon: ReactNode; label: string; detail?: string; shortcut?: string; badge?: string; chevron?: boolean; active?: boolean; disabled?: boolean; danger?: boolean; onClick?: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    const color = danger ? theme.accent.danger : theme.node.text;
    // 菜单项默认无边无底：图标裸放、hover 只提亮表面，危险项改用淡红底。
    return (
        <button
            type="button"
            className={`canvas-menu-item group flex w-full items-center gap-2.5 rounded-[var(--r-md)] px-2 text-left outline-none enabled:hover:bg-[var(--menu-item-hover)] focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40 ${detail ? "min-h-11 py-1.5" : "h-8"}`}
            style={{ color, background: active ? theme.toolbar.activeBg : undefined, "--menu-item-hover": danger ? `${theme.accent.danger}1a` : "var(--menu-hover)" } as CSSProperties}
            disabled={disabled}
            onClick={onClick}
        >
            <span className={`canvas-menu-item-icon grid size-4 shrink-0 place-items-center [&_svg]:size-4 [&_svg]:stroke-[1.75] ${detail ? "self-start mt-0.5" : ""} ${danger || active ? "" : "opacity-60 group-hover:opacity-100"}`}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium leading-5" style={{ fontSize: "var(--fs-ui)" }}>
                    <span className="truncate">{label}</span>
                    {badge ? <span className="rounded-[var(--r-xs)] px-1 font-medium leading-4 tabular-nums" style={{ background: "var(--menu-hover)", color: theme.node.muted, fontSize: "var(--fs-label)" }}>{badge}</span> : null}
                </span>
                {detail ? <span className="block truncate leading-4" style={{ color: theme.node.muted, fontSize: "var(--fs-label)" }}>{detail}</span> : null}
            </span>
            {shortcut ? <kbd className="shrink-0 font-sans tracking-[.04em] tabular-nums" style={{ color: theme.node.faint, fontSize: "var(--fs-label)" }}>{shortcut}</kbd> : null}
            {chevron ? <ChevronRight className="size-3.5 shrink-0" style={{ color: theme.node.faint }} /> : null}
        </button>
    );
}

function MenuDivider() {
    const theme = canvasThemes[useActiveTheme()];
    return <div role="separator" className="mx-2 my-1.5 h-px" style={{ background: theme.toolbar.border, opacity: 0.7 }} />;
}

function getContextMenuPosition(menu: ContextMenuState, hasMultiSelection = false) {
    if (typeof window === "undefined") return { left: menu.x, top: menu.y };
    const width = 224;
    const estimatedHeight = menu.type === "node" ? Math.min(hasMultiSelection ? 290 : 360, window.innerHeight - 72) : menu.type === "canvas" ? (hasMultiSelection ? 350 : 250) : 84;
    return {
        left: clamp(menu.x, 12, Math.max(12, window.innerWidth - width - 12)),
        top: clamp(menu.y, 68, Math.max(68, window.innerHeight - estimatedHeight - 12)),
    };
}

function getSubmenuLeft(parentLeft: number) {
    if (typeof window === "undefined") return parentLeft + 192;
    return parentLeft + 224 + 8 + 360 <= window.innerWidth - 12 ? parentLeft + 232 : Math.max(12, parentLeft - 368);
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function nodeTypeLabel(node?: CanvasNodeData | null) {
    if (!node) return translate("canvasTools.canvasContextMenu.node");
    if (node.type === CanvasNodeType.Image) return translate("canvasA.assetTray.imageNodeFallback");
    if (node.type === CanvasNodeType.Text) return translate("canvasTools.canvasContextMenu.textNode");
    if (node.type === CanvasNodeType.Script) return translate("canvasTools.canvasContextMenu.storyboardNode");
    if (node.type === CanvasNodeType.Skill) return translate("canvasTools.canvasContextMenu.skillNode");
    if (node.type === CanvasNodeType.Video) return translate("canvasTools.canvasContextMenu.videoNode");
    if (node.type === CanvasNodeType.Audio) return translate("canvasTools.canvasContextMenu.audioNode");
    if (node.type === CanvasNodeType.Drawing) return translate("canvasTools.canvasContextMenu.drawingNode");
    if (node.type === CanvasNodeType.Frame) return isCanvasFolderNode(node) ? translate("library.picker.folders") : translate("canvasTools.canvasContextMenu.backdrop");
    return translate("canvasTools.canvasContextMenu.generationConfigNode");
}
