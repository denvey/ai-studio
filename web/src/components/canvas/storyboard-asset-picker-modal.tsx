import { Button, Input, Modal } from "antd";
import { Check, Library, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { CanvasProjectAssetModal } from "@/components/canvas/canvas-project-asset-modal";
import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { AssetThumbnail, STORYBOARD_ASSET_ROLE_LABELS } from "@/components/canvas/storyboard-assets-cell";
import { Select } from "@/components/ui/base/select";
import { bindingForConnectedNode, isStoryboardPreviewAsset } from "@/lib/canvas/canvas-storyboard-materializer";
import { normalizeStoryboardAssetBindings } from "@/lib/canvas/canvas-storyboard-assets";
import type { ProjectDetail } from "@/services/api/projects";
import type { CanvasNodeData, StoryboardAssetBinding } from "@/types/canvas";
import { translate } from "@/i18n";

export function StoryboardAssetPickerModal({
    nodes,
    bindings,
    shotNumber,
    detail,
    onClose,
    onSave,
    onImport,
}: {
    nodes: CanvasNodeData[];
    bindings: StoryboardAssetBinding[];
    shotNumber: number;
    detail?: ProjectDetail;
    onClose: () => void;
    onSave: (bindings: StoryboardAssetBinding[]) => void;
    onImport: (payloads: InsertAssetPayload[]) => Promise<CanvasNodeData[]>;
}) {
    const [draft, setDraft] = useState(() => normalizeStoryboardAssetBindings(bindings));
    const [query, setQuery] = useState("");
    const [role, setRole] = useState("all");
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [error, setError] = useState("");
    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const selectedIds = new Set(draft.map((binding) => binding.nodeId));
    const candidates = nodes.filter((node) => {
        if (!isStoryboardPreviewAsset(node)) return false;
        if (selectedIds.has(node.id)) return true;
        if (["shot", "action_board", "final"].includes(node.metadata?.workflowKind || "")) return false;
        return Boolean(node.metadata?.content || node.metadata?.storageKey || node.metadata?.drawingPreviewUrl || (node.metadata?.characterAssetId && node.metadata?.characterVersionId));
    });
    const keyword = query.trim().toLowerCase();
    const filtered = candidates.filter((node) => (role === "all" || bindingForConnectedNode(node)?.role === role) && (!keyword || [node.title, node.metadata?.prompt, ...(node.metadata?.assetTags || [])].join(" ").toLowerCase().includes(keyword)));
    const toggle = (node: CanvasNodeData) =>
        setDraft((current) => {
            if (current.some((binding) => binding.nodeId === node.id)) return current.filter((binding) => binding.nodeId !== node.id);
            const binding = bindingForConnectedNode(node);
            return binding ? [...current, binding] : current;
        });
    return (
        <>
            <Modal open title={translate("canvasTools.storyboardAssetPickerModal.shotRelatedAssets", { v0: String(shotNumber) })} width={760} centered onCancel={onClose} footer={null}>
                <div data-canvas-no-zoom data-canvas-wheel-scroll onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
                    <p className="mb-4 text-sm text-foreground/55">{translate("canvasTools.storyboardAssetPickerModal.selectCharactersLocationsPropsOrReferenceMediaForThisShot")}</p>
                    <div className="mb-4 flex flex-wrap gap-2">
                        <Input className="min-w-40 flex-1" prefix={<Search className="size-4 text-foreground/40" />} allowClear placeholder={translate("canvasTools.storyboardAssetPickerModal.searchAssetNamesOrTags")} value={query} onChange={(event) => setQuery(event.target.value)} />
                        <Select className="w-32" aria-label={translate("canvasTools.storyboardAssetPickerModal.filterAssetType")} value={role} onChange={setRole} options={[{ value: "all", label: translate("library.tasks.page.allKinds") }, ...Object.entries(STORYBOARD_ASSET_ROLE_LABELS).map(([value, label]) => ({ value, label }))]} />
                        <Button icon={<Library className="size-4" />} onClick={() => setLibraryOpen(true)}>
                            {translate("canvasTools.storyboardAssetPickerModal.referenceProjectAssets")}
                        </Button>
                    </div>
                    <div className="grid max-h-[38vh] min-h-40 auto-rows-max grid-cols-2 content-start gap-2 overflow-y-auto p-1 sm:grid-cols-3" aria-label={translate("canvasTools.storyboardAssetPickerModal.availableAssets")}>
                        {filtered.map((node) => (
                            <button
                                key={node.id}
                                type="button"
                                aria-pressed={selectedIds.has(node.id)}
                                aria-label={translate("canvasTools.storyboardAssetPickerModal.selectAsset", { v0: String(node.title) })}
                                onClick={() => toggle(node)}
                                className={`relative flex items-center gap-2 rounded-lg border p-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${selectedIds.has(node.id) ? "border-foreground/50 bg-foreground/[0.08]" : "border-foreground/10 hover:bg-foreground/[0.04]"}`}
                            >
                                <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-foreground/[0.04]">
                                    <AssetThumbnail node={node} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm" title={node.title}>
                                        {node.title}
                                    </span>
                                    <span className="text-xs text-foreground/45">{STORYBOARD_ASSET_ROLE_LABELS[bindingForConnectedNode(node)!.role]}</span>
                                </span>
                                {selectedIds.has(node.id) ? <Check className="size-4 shrink-0" /> : null}
                            </button>
                        ))}
                        {!filtered.length ? (
                            <div className="col-span-full grid place-items-center px-4 py-8 text-center text-sm text-foreground/45">{keyword || role !== "all" ? translate("canvasTools.storyboardAssetPickerModal.noMatchingAssetsTryDifferentSearchCriteria") : translate("canvasTools.storyboardAssetPickerModal.noAssetsAvailableOnThisCanvasYetClickReferenceProject")}</div>
                        ) : null}
                    </div>
                    <div className="mt-4 border-t border-foreground/10 pt-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-foreground/55">
                            <span>{translate("canvasTools.inline.storyboardAssetPickerModal.itemsSelected", { v0: String(draft.length) })}</span>
                            <Button type="text" size="small" disabled={!draft.length} onClick={() => setDraft([])}>
                                {translate("canvasTools.storyboardAssetPickerModal.clearSelection")}
                            </Button>
                        </div>
                        <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto" aria-label={translate("canvasTools.storyboardAssetPickerModal.selectedAssets")}>
                            {draft.map((binding) => (
                                <span key={binding.nodeId} className="inline-flex max-w-full items-center gap-1 rounded-md bg-foreground/[0.06] px-2 py-1 text-xs">
                                    <span className="max-w-40 truncate">{nodeById.get(binding.nodeId)?.title || translate("canvasTools.storyboardAssetPickerModal.assetUnavailable")}</span>
                                    <Select
                                        size="small"
                                        className="w-20"
                                        aria-label={translate("canvasTools.storyboardAssetPickerModal.purposeOf", { v0: String(nodeById.get(binding.nodeId)?.title || translate("canvasTools.storyboardAssetPickerModal.unavailableAsset")) })}
                                        value={binding.role}
                                        options={Object.entries(STORYBOARD_ASSET_ROLE_LABELS).map(([value, label]) => ({ value, label }))}
                                        onChange={(value) => setDraft((current) => current.map((item) => (item.nodeId === binding.nodeId ? { ...item, role: value as StoryboardAssetBinding["role"] } : item)))}
                                    />
                                    <button
                                        type="button"
                                        aria-label={translate("canvasTools.storyboardAssetPickerModal.removeAsset", { v0: String(nodeById.get(binding.nodeId)?.title || translate("canvasTools.storyboardAssetPickerModal.unavailableAsset")) })}
                                        className="rounded p-1 outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                                        onClick={() => setDraft((current) => current.filter((item) => item.nodeId !== binding.nodeId))}
                                    >
                                        <X className="size-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                    {error ? (
                        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
                            {error}
                        </p>
                    ) : null}
                    <div className="mt-4 flex justify-end gap-2">
                        <Button onClick={onClose}>{translate("common.cancel")}</Button>
                        <Button
                            type="primary"
                            onClick={() => {
                                try {
                                    onSave(draft);
                                } catch (cause) {
                                    setError(cause instanceof Error ? cause.message : translate("canvasTools.storyboardAssetPickerModal.failedToSaveRelatedAssets"));
                                }
                            }}
                        >
                            {translate("canvasTools.storyboardAssetPickerModal.saveLink")}
                        </Button>
                    </div>
                </div>
            </Modal>
            {libraryOpen ? (
                <CanvasProjectAssetModal
                    open
                    detail={detail}
                    onClose={() => setLibraryOpen(false)}
                    onInsert={async (payloads) => {
                        if (payloads.some((payload) => payload.kind === "text")) throw new Error(translate("canvasTools.storyboardAssetPickerModal.linkCharactersImagesVideosOrAudioToShotsConnectText"));
                        const imported = await onImport(payloads);
                        const additions = imported.flatMap((node) => {
                            const binding = bindingForConnectedNode(node);
                            return binding ? [binding] : [];
                        });
                        setDraft((current) => normalizeStoryboardAssetBindings([...current, ...additions]));
                    }}
                />
            ) : null}
        </>
    );
}
