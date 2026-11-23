import { Link } from "react-router";
import { CanvasWorkspaceAssetPanel } from "./canvas-workspace-asset-panel";
import { CanvasWorkspaceHistoryPanel } from "./canvas-workspace-history-panel";
import type { InsertAssetPayload } from "./asset-picker-modal";
import { useDeferredValue, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Button, Grid } from "antd";
import { Home, PanelLeftClose, PanelLeftOpen, Layers3, Images, ListChecks, History, X } from "lucide-react";
import { AppDrawer } from "@/components/ui/product/app-drawer";
import { searchCanvasNodes } from "@/lib/canvas/canvas-node-search";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { canvasDockStyle } from "@/lib/canvas/canvas-aceternity-style";
import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { GenerationTask } from "@/services/api/task-center";
import { useCanvasWorkspaceTasks } from "@/pages/canvas/use-canvas-workspace-tasks";
import { CanvasWorkspaceNodeListPanel } from "./canvas-workspace-node-list-panel";
import { CanvasWorkspaceTaskPanel } from "./canvas-workspace-task-panel";
import "./canvas-workspace-panel.css";
import { translate } from "@/i18n";

export function CanvasWorkspacePanel({
    projectId,
    nodes,
    selectedNodeIds,
    onClose,
    open,
    onOpen,
    onInsertAssets,
    onFocus,
    onAssets,
    onProjectAssets,
    onCancelTask,
}: {
    projectId: string;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onClose: () => void;
    open: boolean;
    onOpen: () => void;
    onInsertAssets: (payloads: InsertAssetPayload[]) => Promise<unknown>;
    onFocus: (id: string) => void;
    onAssets: () => void;
    onProjectAssets?: () => void;
    onCancelTask: (task: GenerationTask) => void;
}) {
    const [tab, setTab] = useState("nodes");
    const theme = canvasThemes[useActiveTheme()];
    const [query, setQuery] = useState("");
    const history = tab === "history";
    const deferredQuery = useDeferredValue(query);
    const config = useEffectiveConfig();
    const screens = Grid.useBreakpoint();
    const markPointer = (event: PointerEvent<HTMLElement>) => {
        event.currentTarget.dataset.inputModality = "pointer";
    };
    const markKeyboard = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "Tab" || event.key === "Enter" || event.key === " ") event.currentTarget.dataset.inputModality = "keyboard";
    };
    const tasks = useCanvasWorkspaceTasks(projectId, open && (tab === "tasks" || history));
    const content = (
        <div className="canvas-workspace-panel relative flex h-full min-h-0 flex-col text-foreground" style={{ "--canvas-workspace-base": theme.node.panel } as CSSProperties} data-canvas-no-zoom data-canvas-wheel-scroll onWheel={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <button className="canvas-workspace-close" type="button" aria-label={translate("canvasTools.canvasWorkspacePanel.closeWorkspace")} onClick={onClose}>
                <X className="size-4" />
            </button>
            {tab === "nodes" && (
                <CanvasWorkspaceNodeListPanel nodes={nodes} config={config} results={searchCanvasNodes(nodes, deferredQuery, nodes.length, config)} query={query} deferredQuery={deferredQuery} selectedNodeIds={selectedNodeIds} onQueryChange={setQuery} onFocus={onFocus} />
            )}
            {tab === "assets" && <CanvasWorkspaceAssetPanel onInsert={onInsertAssets} onManage={onAssets} onProjectAssets={onProjectAssets} />}
            {(tab === "tasks" || history) && (
                <>
                    {tasks.error ? (
                        <div role="alert" className="p-4">
                            {translate("canvasTools.canvasWorkspacePanel.failedToLoadTasks")}<Button onClick={() => void tasks.refetch()}>{translate("common.retry")}</Button>
                        </div>
                    ) : tasks.loading ? (
                        <p className="p-4">{translate("canvasTools.canvasWorkspacePanel.loadingTasks")}</p>
                    ) : history ? (
                        <CanvasWorkspaceHistoryPanel tasks={tasks.allTasks} refreshing={tasks.refreshing} onRefresh={() => void tasks.refetch()} onCancelTask={onCancelTask} />
                    ) : (
                        <CanvasWorkspaceTaskPanel
                            tasks={history ? tasks.allTasks : tasks.tasks.filter((t) => t.status === "queued" || t.status === "running")}
                            refreshing={tasks.refreshing}
                            onRefresh={() => void tasks.refetch()}
                            onCancelTask={onCancelTask}
                        />
                    )}
                </>
            )}
        </div>
    );
    const entries = [
        { id: "nodes", label: translate("canvasTools.canvasWorkspacePanel.node"), icon: Layers3 },
        { id: "assets", label: translate("canvasB.mention.assetLibrary"), icon: Images },
        { id: "tasks", label: translate("nav.tools.tasks"), icon: ListChecks },
        { id: "history", label: translate("nav.collapsed.tasks"), icon: History },
    ];
    return (
        <>
            <div className={`canvas-workspace-shell ${open && screens.lg ? "is-expanded" : ""}`} style={{ ...canvasDockStyle(theme), "--canvas-workspace-base": theme.node.panel, background: undefined } as CSSProperties}>
                <nav className="canvas-workspace-rail" aria-label={translate("canvasTools.canvasWorkspacePanel.canvasLeftMenu")} data-canvas-no-zoom onWheel={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    <Link to="/" className="canvas-workspace-rail-button" aria-label={translate("canvasTools.canvasWorkspacePanel.home")} title={translate("canvasTools.canvasWorkspacePanel.backToHome")}>
                        <Home />
                        <span>{translate("canvasTools.canvasWorkspacePanel.home")}</span>
                    </Link>
                    <span className="canvas-workspace-rail-divider" aria-hidden />
                    <div className="canvas-workspace-rail-items">
                        {entries.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                type="button"
                                className="canvas-workspace-rail-button"
                                title={open && tab === id ? translate("canvasTools.canvasWorkspacePanel.collapse", { v0: String(label) }) : translate("canvasTools.canvasWorkspacePanel.open", { v0: String(label) })}
                                aria-pressed={open && tab === id}
                                onPointerDown={markPointer}
                                onKeyDown={markKeyboard}
                                onClick={() => {
                                    if (open && tab === id) onClose();
                                    else {
                                        setTab(id);
                                        onOpen();
                                    }
                                }}
                            >
                                <Icon />
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                    <span className="canvas-workspace-rail-divider is-end" aria-hidden />
                    <button
                        className="canvas-workspace-rail-button canvas-workspace-rail-toggle"
                        type="button"
                        onClick={open ? onClose : onOpen}
                        onPointerDown={markPointer}
                        onKeyDown={markKeyboard}
                        aria-expanded={open}
                        aria-label={open ? translate("canvasTools.canvasWorkspacePanel.collapsePanel") : translate("canvasTools.canvasWorkspacePanel.expandPanel")}
                        title={open ? translate("canvasTools.canvasWorkspacePanel.collapsePanelToEnlargeCanvas") : translate("canvasTools.canvasWorkspacePanel.expandWorkspacePanel")}
                    >
                        {open ? <PanelLeftClose /> : <PanelLeftOpen />}
                        <span>{open ? translate("account.feedback.collapse") : translate("canvasTools.canvasWorkspacePanel.expand")}</span>
                    </button>
                </nav>
                {open && screens.lg ? (
                    <aside className="w-80 shrink-0 min-h-0" aria-label={translate("canvasTools.canvasWorkspacePanel.canvasWorkspace")}>
                        {content}
                    </aside>
                ) : null}
            </div>
            {open && !screens.lg ? (
                <AppDrawer flush open placement="left" title={null} closable={false} size={320} onClose={onClose}>
                    {content}
                </AppDrawer>
            ) : null}
        </>
    );
}
