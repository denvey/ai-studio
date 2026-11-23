import { App, Button, Input, Modal, Tag } from "antd";
import { CircleAlert, ExternalLink, Import, LoaderCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { formatTapNowBatchTime, parseTapNowShareID } from "@/lib/canvas/tapnow-import";
import { importTapNowCanvas, type TapNowImportResult } from "@/services/api/tapnow";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";
import type { CanvasImportSaveStatus } from "../canvas-import-save";
import { translate } from "@/i18n";

type Props = {
    open: boolean;
    projectId: string;
    viewport: ViewportTransform;
    viewportSize: { width: number; height: number };
    onClose: () => void;
    onApply: (nodes: CanvasNodeData[], connections: CanvasConnection[]) => Promise<CanvasImportSaveStatus>;
};

function buildCanvasNodes(result: TapNowImportResult, viewport: ViewportTransform, viewportSize: { width: number; height: number }) {
    const minX = Math.min(...result.nodes.map((node) => node.x));
    const minY = Math.min(...result.nodes.map((node) => node.y));
    const maxX = Math.max(...result.nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...result.nodes.map((node) => node.y + node.height));
    const offsetX = (viewportSize.width / 2 - viewport.x) / viewport.k - (minX + maxX) / 2;
    const offsetY = (viewportSize.height / 2 - viewport.y) / viewport.k - (minY + maxY) / 2;
    return result.nodes.map<CanvasNodeData>((node) => ({
        id: node.id,
        type: node.type === "video" ? CanvasNodeType.Video : node.type === "audio" ? CanvasNodeType.Audio : node.type === "text" ? CanvasNodeType.Text : CanvasNodeType.Image,
        title: node.title,
        position: { x: node.x + offsetX, y: node.y + offsetY },
        width: node.width,
        height: node.height,
        metadata: {
            content: node.content,
            prompt: node.prompt,
            model: node.model,
            size: node.size,
            quality: node.quality,
            seconds: node.seconds,
            vquality: node.vquality,
            generateAudio: node.generateAudio,
            status: node.status || "idle",
            errorDetails: node.errorDetails,
            naturalWidth: node.naturalWidth,
            naturalHeight: node.naturalHeight,
            durationMs: node.durationMs,
            mimeType: node.mimeType,
            importSource: node.metadata,
        },
    }));
}

export function TapNowImportDialog({ open, projectId, viewport, viewportSize, onClose, onApply }: Props) {
    const { message } = App.useApp();
    const [value, setValue] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<TapNowImportResult | null>(null);
    const [saveStarted, setSaveStarted] = useState(false);
    const applyingRef = useRef(false);
    const shareID = useMemo(() => parseTapNowShareID(value), [value]);

    const reset = () => {
        setValue("");
        setResult(null);
        setSaveStarted(false);
    };

    const close = () => {
        if (loading) return;
        reset();
        onClose();
    };

    const changeValue = (nextValue: string) => {
        setValue(nextValue);
        setResult(null);
        setSaveStarted(false);
    };

    const load = async () => {
        if (!shareID) {
            message.error(translate("canvasTools.tapnowImportDialog.enterAValidTapNowCanvasShareLinkOrShareID"));
            return;
        }
        setLoading(true);
        try {
            setResult(await importTapNowCanvas(projectId, shareID));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("canvasTools.tapnowImportDialog.failedToLoadTapNowCanvas"));
        } finally {
            setLoading(false);
        }
    };

    const apply = async () => {
        if (!result || applyingRef.current) return;
        applyingRef.current = true;
        setSaveStarted(true);
        setLoading(true);
        try {
            const status = await onApply(buildCanvasNodes(result, viewport, viewportSize), result.connections);
            reset();
            onClose();
            const summary = translate("canvasTools.tapnowImportDialog.nodesAndConnections", { v0: String(result.importedNodeCount), v1: String(result.importedConnectionCount) });
            if (status === "pending") message.warning(translate("canvasTools.tapnowImportDialog.savedLocallySyncingInTheBackground", { v0: String(summary) }));
            else message.success(translate("canvasTools.tapnowImportDialog.importedAndSavedToTheCloud", { v0: String(summary) }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("canvasTools.tapnowImportDialog.failedToSaveImportResults"));
        } finally {
            applyingRef.current = false;
            setLoading(false);
        }
    };

    const hasWarnings = result ? Boolean(result.skippedNodes.length || result.skippedConnections.length || result.multiResultNodeCount || result.reusedFailedNodeCount || result.placeholderNodeCount || result.warnings.length) : false;

    return (
        <Modal
            className="workspace-modal"
            open={open}
            onCancel={close}
            title={translate("canvasTools.tapnowImportDialog.importTapNowCanvas")}
            width={620}
            footer={
                result ? (
                    [
                        <Button key="close" onClick={close}>
                            {translate("common.close")}
                        </Button>,
                        <Button key="apply" type="primary" icon={<Import className="size-4" />} loading={loading} onClick={() => void apply()}>
                            {saveStarted ? translate("library.tasks.row.retrySave") : translate("canvasTools.tapnowImportDialog.confirmImport")}
                        </Button>,
                    ]
                ) : (
                    <Button type="primary" loading={loading} onClick={() => void load()}>
                        {translate("canvasTools.tapnowImportDialog.readCanvas")}
                    </Button>
                )
            }
        >
            <div className="space-y-4">
                <div>
                    <label className="mb-2 block text-sm font-medium">{translate("canvasTools.tapnowImportDialog.tapNowCanvasShareLinkOrShareID")}</label>
                    <Input
                        value={value}
                        onChange={(event) => changeValue(event.target.value)}
                        placeholder={translate("canvasTools.tapnowImportDialog.pasteHttpsAppTapnowMediaTapflowView")}
                        disabled={loading}
                        suffix={shareID && value !== shareID ? <ExternalLink className="size-4 text-foreground/35" /> : null}
                    />
                </div>
                {loading && !result ? (
                    <div className="flex items-center gap-2 text-sm text-foreground/55">
                        <LoaderCircle className="size-4 animate-spin" />
                        {translate("canvasTools.tapnowImportDialog.loadingTapNowCanvas")}
                    </div>
                ) : null}
                {result ? (
                    <div className="space-y-3">
                        <div className="rounded-xl p-4" style={{ background: "var(--library-surface)" }}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-sm font-semibold">{result.projectName || translate("canvasTools.tapnowImportDialog.tapNowCanvas")}</div>
                                    <div className="mt-1 text-sm text-foreground/60">
                                        {translate("canvasTools.inline.tapnowImportDialog.availableToImportNodesConnections", { v0: String(result.importedNodeCount), v1: String(result.importedConnectionCount) })}
                                    </div>
                                </div>
                                <Tag color="blue">{translate("canvasTools.inline.tapnowImportDialog.batch", { v0: String(formatTapNowBatchTime(result.batchCreatedAt)) })}</Tag>
                            </div>
                            <div className="mt-3 text-xs leading-5 text-foreground/50">{translate("canvasTools.tapnowImportDialog.supportsImageVideoAudioAndTextNodesNodesKeepTheir")}</div>
                        </div>
                        {hasWarnings ? (
                            <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 text-foreground/60" style={{ background: "var(--surface-hover)" }}>
                                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                                <div>
                                    {result.skippedNodes.length ? <div>{translate("canvasTools.inline.tapnowImportDialog.unsupportedNodesWereNotImportedTheirConnectionsWereIgnoredAutomatically", { v0: String(result.skippedNodes.length) })}</div> : null}
                                    {!result.skippedNodes.length && result.skippedConnections.length ? (
                                        <div>{translate("canvasTools.inline.tapnowImportDialog.invalidConnectionsWereIgnoredAutomatically", { v0: String(result.skippedConnections.length) })}</div>
                                    ) : null}
                                    {result.reusedFailedNodeCount ? <div>{translate("canvasTools.inline.tapnowImportDialog.nodesWithFailedRecentTasksButPreviousResultsWereRetained", { v0: String(result.reusedFailedNodeCount) })}</div> : null}
                                    {result.placeholderNodeCount ? <div>{translate("canvasTools.inline.tapnowImportDialog.nodesWithoutGeneratedResultsWereRetainedAsPlaceholders", { v0: String(result.placeholderNodeCount) })}</div> : null}
                                    {result.multiResultNodeCount ? <div>{translate("canvasTools.inline.tapnowImportDialog.nodesWithMultipleResultsUseTheirFirstResult", { v0: String(result.multiResultNodeCount) })}</div> : null}
                                    {result.warnings.map((warning, index) => (
                                        <div key={`${warning.id || "warning"}-${index}`}>{warning.message}</div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                            <Tag>{saveStarted ? translate("canvasTools.tapnowImportDialog.saveIncompleteImportedContentIsRetained") : translate("canvasTools.tapnowImportDialog.awaitingImportConfirmation")}</Tag>
                        </div>
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}
