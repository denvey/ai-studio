import { Button, Input } from "antd";
import { Check, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { WorkspaceNoResultsState } from "@/components/layout/workspace-state";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { cn } from "@/lib/utils";
import type { WorkbenchKind, WorkbenchTool } from "@/services/api/workbench";

import { SceneGlyph } from "./workbench-composer";
import { filterWorkbenchTools, toolMatchesFacet, WORKBENCH_SCENE_FACETS, workbenchPageCategories, workbenchToolSubtitle } from "./workbench-presets";

import { translate } from "@/i18n";
const FACET_CATEGORIES = new Set(["all", "recommended", "ecommerce", "product"]);

function sceneRequirement(tool: WorkbenchTool) {
    const required = tool.inputContract?.slots.filter((slot) => slot.required || slot.minCount > 0) || [];
    if (required.length) return translate("ecommerce.workbench.workbenchSceneLibrary.upload", { v0: String(required.map((slot) => slot.name).join("、")) });
    if (tool.inputContract?.slots.length) return translate("ecommerce.workbench.workbenchSceneLibrary.assetsOptional");
    return translate("ecommerce.workbench.workbenchSceneLibrary.descriptionOnly");
}

export function SceneLibraryModal({
    open,
    kind,
    tools,
    loading,
    error,
    selectedId,
    onRetry,
    onClose,
    onChoose,
}: {
    open: boolean;
    kind: WorkbenchKind;
    tools: WorkbenchTool[];
    loading: boolean;
    error: string;
    selectedId?: string;
    onRetry: () => void;
    onClose: () => void;
    onChoose: (tool: WorkbenchTool | null) => void;
}) {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");
    const [facetKey, setFacetKey] = useState("");
    const categories = useMemo(() => [{ value: "all", label: translate("canvasA.toolPicker.all") }, ...workbenchPageCategories(tools)], [tools]);
    const facets = WORKBENCH_SCENE_FACETS[kind];
    const showFacets = FACET_CATEGORIES.has(category);
    const facet = showFacets ? facets.find((item) => item.key === facetKey) : undefined;
    const filtered = useMemo(() => filterWorkbenchTools(tools, category, query, facet), [category, facet, query, tools]);
    const counts = useMemo(() => new Map(categories.map((item) => [item.value, filterWorkbenchTools(tools, item.value, "").length])), [categories, tools]);
    const visibleFacets = useMemo(() => facets.filter((item) => filterWorkbenchTools(tools, category, "").some((tool) => toolMatchesFacet(tool, item))), [category, facets, tools]);

    useEffect(() => {
        if (!open) return;
        const selected = tools.find((tool) => tool.id === selectedId);
        setCategory(selected && categories.some((item) => item.value === selected.categoryId) ? selected.categoryId : "all");
        setFacetKey("");
        setQuery("");
        // 只在打开时定位到当前场景所在分类，浏览过程中不被目录刷新打断。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <AppModal open={open} flush footer={null} closable={false} width="min(1120px, calc(100vw - 32px))" onCancel={onClose} className="wb-library-modal" title={null}>
            <div className="wb-library">
                <header className="wb-library-head">
                    <div className="wb-library-title">
                        <h2>{translate("ecommerce.workbench.workbenchSceneLibrary.chooseAnOutputScenario")}</h2>
                        <p>{kind === "image" ? translate("ecommerce.workbench.workbenchSceneLibrary.appliesThePromptTemplateAutomaticallyAndShowsTheRequiredProduct") : translate("ecommerce.workbench.workbenchSceneLibrary.appliesTheShotTemplateAutomaticallyAndShowsRequirementsSuchAs")}</p>
                    </div>
                    <Input className="wb-library-search" aria-label={translate("ecommerce.workbench.workbenchSceneLibrary.searchScenarios")} prefix={<Search className="size-4" />} allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder={translate("ecommerce.workbench.workbenchSceneLibrary.searchScenariosEGWhiteBackgroundModelUnboxing")} />
                    <button type="button" className="wb-icon-button" data-icon-only aria-label={translate("common.close")} onClick={onClose}>
                        <X />
                    </button>
                </header>
                <div className="wb-library-body">
                    <nav className="wb-library-rail" aria-label={translate("ecommerce.workbench.workbenchSceneLibrary.scenarioCategories")}>
                        {categories.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                aria-pressed={category === item.value}
                                className={cn("wb-rail-item", category === item.value && "is-active")}
                                onClick={() => {
                                    setCategory(item.value);
                                    setFacetKey("");
                                }}
                            >
                                <span>{item.label}</span>
                                <small>{counts.get(item.value) || 0}</small>
                            </button>
                        ))}
                    </nav>
                    <div className="wb-library-main">
                        {showFacets && visibleFacets.length ? (
                            <div className="wb-library-facets" role="group" aria-label={translate("ecommerce.workbench.workbenchSceneLibrary.ecommerceSubcategories")}>
                                <button type="button" className="wb-chip" aria-pressed={!facet} onClick={() => setFacetKey("")}>
                                    {translate("ecommerce.workbench.workbenchSceneLibrary.any")}
                                </button>
                                {visibleFacets.map((item) => (
                                    <button key={item.key} type="button" className="wb-chip" aria-pressed={facet?.key === item.key} onClick={() => setFacetKey(facet?.key === item.key ? "" : item.key)}>
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        {error ? (
                            <div className="wb-inline-error" role="alert">
                                <span>{error}</span>
                                <Button size="small" onClick={onRetry}>
                                    {translate("common.retry")}
                                </Button>
                            </div>
                        ) : loading ? (
                            <div className="wb-library-grid" aria-busy="true">
                                {Array.from({ length: 8 }, (_, index) => (
                                    <span key={index} className="wb-scene-card is-skeleton" />
                                ))}
                            </div>
                        ) : (
                            <div className="wb-library-grid">
                                {category === "all" && !query.trim() && !facet ? (
                                    <button type="button" className={cn("wb-scene-card", !selectedId && "is-selected")} aria-pressed={!selectedId} onClick={() => onChoose(null)}>
                                        <SceneGlyph tool={null} kind={kind} />
                                        <span className="wb-scene-card-copy">
                                            <strong>{translate("ecommerce.workbench.workbenchSceneLibrary.freeCreation")}</strong>
                                            <small>{translate("ecommerce.workbench.workbenchSceneLibrary.describeYourDesiredSceneWithoutATemplateSuitableForA")}</small>
                                        </span>
                                        <span className="wb-scene-card-meta">{translate("ecommerce.workbench.workbenchSceneLibrary.descriptionOnly")}</span>
                                        {!selectedId ? (
                                            <span className="wb-scene-card-check">
                                                <Check />
                                            </span>
                                        ) : null}
                                    </button>
                                ) : null}
                                {filtered.map((tool) => {
                                    const selected = tool.id === selectedId;
                                    const subtitle = workbenchToolSubtitle(tool);
                                    return (
                                        <button key={tool.id} type="button" className={cn("wb-scene-card", selected && "is-selected")} aria-pressed={selected} title={`${tool.name}\n${subtitle}`} onClick={() => onChoose(tool)}>
                                            <SceneGlyph tool={tool} kind={kind} />
                                            <span className="wb-scene-card-copy">
                                                <strong>{tool.name}</strong>
                                                <small>{subtitle}</small>
                                            </span>
                                            <span className="wb-scene-card-meta">
                                                {sceneRequirement(tool)}
                                                {tool.presets.length ? translate("ecommerce.workbench.workbenchSceneLibrary.templates", { v0: String(tool.presets.length) }) : ""}
                                            </span>
                                            {selected ? (
                                                <span className="wb-scene-card-check">
                                                    <Check />
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {!loading && !error && !filtered.length && (query.trim() || facet || category !== "all") ? (
                            <WorkspaceNoResultsState
                                compact
                                query={query}
                                onClear={() => {
                                    setQuery("");
                                    setFacetKey("");
                                    setCategory("all");
                                }}
                            />
                        ) : null}
                    </div>
                </div>
            </div>
        </AppModal>
    );
}
