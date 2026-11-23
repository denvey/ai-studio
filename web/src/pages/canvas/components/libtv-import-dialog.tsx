import { App, Button, Input, Modal, Tag } from "antd";
import { CircleAlert, ExternalLink, Import, LoaderCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { buildLibTVImagePreviewUrl, buildLibTVVideoPreviewUrl, buildLibTVVideoSourceUrl, formatLibTVBatchTime, parseLibTVProjectUUID } from "@/lib/canvas/libtv-import";
import { importLibTVCanvas, type LibTVImportResult } from "@/services/api/libtv";
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

function buildCanvasNodes(result: LibTVImportResult, viewport: ViewportTransform, viewportSize: { width: number; height: number }) {
    const minX = Math.min(...result.nodes.map((node) => node.x));
    const minY = Math.min(...result.nodes.map((node) => node.y));
    const maxX = Math.max(...result.nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...result.nodes.map((node) => node.y + node.height));
    const offsetX = (viewportSize.width / 2 - viewport.x) / viewport.k - (minX + maxX) / 2;
    const offsetY = (viewportSize.height / 2 - viewport.y) / viewport.k - (minY + maxY) / 2;
    return result.nodes.map<CanvasNodeData>((node) => ({
        id: node.id,
        type: node.type === "video" ? CanvasNodeType.Video : CanvasNodeType.Image,
        title: node.title,
        position: { x: node.x + offsetX, y: node.y + offsetY },
        width: node.width,
        height: node.height,
        metadata: {
            content: node.type === "video" ? buildLibTVVideoSourceUrl(node.content) : node.content,
            previewContent: node.type === "image" ? buildLibTVImagePreviewUrl(node.content) : buildLibTVVideoPreviewUrl(node.content) || undefined,
            prompt: node.prompt,
            model: node.model,
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

export function LibTVImportDialog({ open, projectId, viewport, viewportSize, onClose, onApply }: Props) {
    const { message } = App.useApp();
    const [value, setValue] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<LibTVImportResult | null>(null);
    const [saveStarted, setSaveStarted] = useState(false);
    const applyingRef = useRef(false);
    const uuid = useMemo(() => parseLibTVProjectUUID(value), [value]);

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
        if (!uuid) {
            message.error(translate("canvasTools.libtvImportDialog.enterALibTVCanvasUUIDOrLink"));
            return;
        }
        setLoading(true);
        try {
            setResult(await importLibTVCanvas(projectId, uuid));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("canvasTools.libtvImportDialog.failedToLoadLibTVCanvas"));
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
            const summary = translate("canvasTools.libtvImportDialog.nodesAndConnections", { v0: String(result.importedNodeCount), v1: String(result.importedConnectionCount) });
            if (status === "pending") message.warning(translate("canvasTools.libtvImportDialog.savedLocallySyncingInTheBackground", { v0: String(summary) }));
            else message.success(translate("canvasTools.libtvImportDialog.importedAndSavedToTheCloud", { v0: String(summary) }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("canvasTools.libtvImportDialog.failedToSaveImportResults"));
        } finally {
            applyingRef.current = false;
            setLoading(false);
        }
    };

    return (
        <Modal
            className="workspace-modal"
            open={open}
            onCancel={close}
            title={translate("canvasTools.libtvImportDialog.importLibTVCanvas")}
            width={620}
            footer={
                result ? (
                    [
                        <Button key="close" onClick={close}>
                            {translate("common.close")}
                        </Button>,
                        <Button key="apply" type="primary" icon={<Import className="size-4" />} loading={loading} onClick={() => void apply()}>
                            {saveStarted ? translate("library.tasks.row.retrySave") : translate("canvasTools.libtvImportDialog.confirmImport")}
                        </Button>,
                    ]
                ) : (
                    <Button type="primary" loading={loading} onClick={() => void load()}>
                        {translate("canvasTools.libtvImportDialog.readCanvas")}
                    </Button>
                )
            }
        >
            <div className="space-y-4">
                <div>
                    <label className="mb-2 block text-sm font-medium">{translate("canvasTools.libtvImportDialog.libTVCanvasUUIDOrLink")}</label>
                    <Input
                        value={value}
                        onChange={(event) => changeValue(event.target.value)}
                        placeholder={translate("canvasTools.libtvImportDialog.pasteA32CharacterUUIDCanvasLinkOrShareLink")}
                        disabled={loading}
                        suffix={uuid && value !== uuid ? <ExternalLink className="size-4 text-foreground/35" /> : null}
                    />
                </div>
                {loading && !result ? (
                    <div className="flex items-center gap-2 text-sm text-foreground/55">
                        <LoaderCircle className="size-4 animate-spin" />
                        {translate("canvasTools.libtvImportDialog.loadingLibTVCanvas")}
                    </div>
                ) : null}
                {result ? (
                    <div className="space-y-3">
                        <div className="rounded-xl p-4" style={{ background: "var(--library-surface)" }}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-sm font-semibold">{result.projectName || translate("canvasTools.libtvImportDialog.libTVCanvas")}</div>
                                    <div className="mt-1 text-sm text-foreground/60">
                                        {translate("canvasTools.inline.libtvImportDialog.availableToImportNodesConnections", { v0: String(result.importedNodeCount), v1: String(result.importedConnectionCount) })}
                                    </div>
                                </div>
                                <Tag color="blue">{translate("canvasTools.inline.libtvImportDialog.batch", { v0: String(formatLibTVBatchTime(result.batchCreatedAt)) })}</Tag>
                            </div>
                            <div className="mt-3 text-xs leading-5 text-foreground/50">{translate("canvasTools.libtvImportDialog.nodesKeepTheirRelativePositionsAndArePlacedTogetherAt")}</div>
                        </div>
                        {result.skippedNodes.length || result.skippedConnections.length || result.multiResultNodeCount || result.staleNodeCount || result.reusedFailedNodeCount || result.placeholderNodeCount || result.convertedSpecialCount ? (
                            <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 text-foreground/60" style={{ background: "var(--surface-hover)" }}>
                                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                                <div>
                                    {result.skippedNodes.length ? <div>{translate("canvasTools.inline.libtvImportDialog.unsupportedNodesWereNotImportedTheirConnectionsWereIgnoredAutomatically", { v0: String(result.skippedNodes.length) })}</div> : null}
                                    {!result.skippedNodes.length && result.skippedConnections.length ? (
                                        <div>{translate("canvasTools.inline.libtvImportDialog.invalidConnectionsWereIgnoredAutomatically", { v0: String(result.skippedConnections.length) })}</div>
                                    ) : null}
                                    {result.reusedFailedNodeCount ? <div>{translate("canvasTools.inline.libtvImportDialog.nodesWithFailedRecentTasksButPreviousResultsWereRetained", { v0: String(result.reusedFailedNodeCount) })}</div> : null}
                                    {result.placeholderNodeCount ? <div>{translate("canvasTools.inline.libtvImportDialog.nodesWithoutGeneratedResultsWereRetainedAsPlaceholders", { v0: String(result.placeholderNodeCount) })}</div> : null}
                                    {result.convertedSpecialCount ? <div>{translate("canvasTools.inline.libtvImportDialog.specialNodesWereConvertedToImageReferenceNodes", { v0: String(result.convertedSpecialCount) })}</div> : null}
                                    {result.multiResultNodeCount ? <div>{translate("canvasTools.inline.libtvImportDialog.nodesWithMultipleResultsUseTheirFirstResult", { v0: String(result.multiResultNodeCount) })}</div> : null}
                                    {result.staleNodeCount ? <div>{translate("canvasTools.inline.libtvImportDialog.nodesMarkedAsOutdatedRetainTheirExistingResults", { v0: String(result.staleNodeCount) })}</div> : null}
                                </div>
                            </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                            <Tag>{saveStarted ? translate("canvasTools.libtvImportDialog.saveIncompleteImportedContentIsRetained") : translate("canvasTools.libtvImportDialog.awaitingImportConfirmation")}</Tag>
                        </div>
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}
