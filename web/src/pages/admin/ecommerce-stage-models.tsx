import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Select, Typography } from "antd";
import { ArrowUpRight, RefreshCw, X } from "lucide-react";
import { useNavigate } from "react-router";
import { ModelPicker } from "@/components/model-picker";
import { getModelCatalog } from "@/services/api/logical-models";
import { getCommerceOrchestrationSetting, updateCommerceOrchestrationSetting, type CommerceOrchestrationRole, type CommerceOrchestrationSetting } from "@/services/api/ecommerce-knowledge";
import type { AiConfig } from "@/stores/use-config-store";
import { THINKING_REQUEST_OPTIONS, type ThinkingRequest } from "@/lib/text-thinking";
import { commerceStageChannelModelId, commerceStageModelConfig, commerceStageModelCounts, commerceStageModelValue, commerceVisionDisabledReason } from "./ecommerce-model-catalog";
import "./ecommerce-stage-models.css";
import { translate } from "@/i18n";

// 只列真正执行的两个文本阶段；第三步出图用用户在电商页选的生图模型，这里只做说明。
const stages = [
    { key: "vision", label: translate("adminPages.ecommerceStageModels.productRecognitionAndVisualDirection"), hint: translate("adminPages.ecommerceStageModels.readProductImagesIdentifyTheProductAndRecommend4Visual") },
    { key: "planning", label: translate("adminPages.ecommerceStageModels.fullSetPlanning"), hint: translate("adminPages.ecommerceStageModels.writeSellingPointsPerImageStoryboardsAndImagePromptsFor") },
] as const;
type StageKey = (typeof stages)[number]["key"];
type StageChoice = { model: string; fallback: string; thinkingLevel: ThinkingRequest };
type StageDraft = Record<StageKey, StageChoice>;
/** 已保存但当前目录里找不到的模型（下架、停用或是旧的智能路由），需要管理员重新选择。 */
type StageMissing = Partial<Record<StageKey, boolean>>;

const emptyRole = (): CommerceOrchestrationRole => ({ model: {}, fallback: {} });
const filled = (role?: CommerceOrchestrationRole) => Boolean(role?.model.channelModelId || role?.model.logicalModelId);

/** 服务端仍兼容「整套策划」复用旧营销策划阶段的配置；页面上只呈现实际生效的那一个。 */
function planningRole(saved: CommerceOrchestrationSetting) {
    return saved.director?.reuse === "marketing" || !filled(saved.director) ? saved.marketing || emptyRole() : saved.director;
}

function draftFromSetting(config: AiConfig, saved: CommerceOrchestrationSetting): { draft: StageDraft; missing: StageMissing } {
    const roles: Record<StageKey, CommerceOrchestrationRole> = { vision: saved.vision || emptyRole(), planning: planningRole(saved) };
    const draft = {} as StageDraft;
    const missing: StageMissing = {};
    for (const { key } of stages) {
        const role = roles[key];
        const model = commerceStageModelValue(config, role.model.channelModelId);
        const fallback = commerceStageModelValue(config, role.fallback.channelModelId);
        draft[key] = { model, fallback, thinkingLevel: role.thinkingLevel || "auto" };
        missing[key] = (filled(role) && !model) || Boolean((role.fallback.channelModelId || role.fallback.logicalModelId) && !fallback);
    }
    return { draft, missing };
}

function roleFromChoice(config: AiConfig, choice: StageChoice): CommerceOrchestrationRole {
    const model = commerceStageChannelModelId(config, choice.model);
    const fallback = commerceStageChannelModelId(config, choice.fallback);
    return { model: model ? { channelModelId: model } : {}, fallback: fallback ? { channelModelId: fallback } : {}, thinkingLevel: choice.thinkingLevel || "auto" };
}

/** 电商 Agent 的文本阶段模型：所有用户的电商页都用这里的配置，前台不展示也不能更改。 */
export function EcommerceStageModels({ embedded = false, onSaved }: { embedded?: boolean; onSaved?: () => void }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [config, setConfig] = useState<AiConfig>();
    const [draft, setDraft] = useState<StageDraft>();
    const [missing, setMissing] = useState<StageMissing>({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [saved, catalog] = await Promise.all([getCommerceOrchestrationSetting(), getModelCatalog()]);
            const nextConfig = commerceStageModelConfig(catalog);
            const next = draftFromSetting(nextConfig, saved);
            setConfig(nextConfig);
            setDraft(next.draft);
            setMissing(next.missing);
            setDirty(false);
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);
    const counts = useMemo(() => (config ? commerceStageModelCounts(config) : { text: 0, vision: 0 }), [config]);
    const visionReason = useCallback((value: string) => (config ? commerceVisionDisabledReason(config, value) : ""), [config]);
    const update = (key: StageKey, patch: Partial<StageChoice>) => {
        setDraft((current) => {
            if (!current) return current;
            const next = { ...current[key], ...patch };
            // 主模型改成与备用相同的模型时，备用自动清空，避免保存时报错。
            if (next.fallback && next.fallback === next.model) next.fallback = "";
            return { ...current, [key]: next };
        });
        setMissing((current) => ({ ...current, [key]: false }));
        setDirty(true);
    };
    const incomplete = !draft || stages.some(({ key }) => !draft[key].model);
    async function save() {
        if (!draft || !config) return;
        setSaving(true);
        try {
            const setting: CommerceOrchestrationSetting = {
                version: 1,
                enabled: false,
                vision: roleFromChoice(config, draft.vision),
                // 新配置只写「整套策划」；旧的营销策划阶段清空，运行时不再有两份策划模型。
                marketing: emptyRole(),
                director: roleFromChoice(config, draft.planning),
            };
            const saved = await updateCommerceOrchestrationSetting(setting);
            const next = draftFromSetting(config, saved);
            setDraft(next.draft);
            setMissing(next.missing);
            setDirty(false);
            onSaved?.();
            message.success(translate("adminPages.ecommerceStageModels.stageModelsSavedNewECommerceTasksUseTheseSettings"));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setSaving(false);
        }
    }
    return (
        <section className={`ecommerce-stage-models${embedded ? " is-embedded" : ""}`} aria-label={translate("adminPages.ecommerceStageModels.eCommerceAgentStageModels")}>
            <header>
                <div>
                    {embedded ? null : <Typography.Text strong>{translate("adminPages.ecommerceStageModels.eCommerceAgentStageModels")}</Typography.Text>}
                    <Typography.Paragraph type="secondary">
                        {translate("adminPages.ecommerceStageModels.bothStagesReadProductImagesSoOnlyVisionEnabledText")}
                        {config ? translate("adminPages.ecommerceStageModels.theCatalogCurrentlyContainsTextModelsWithVisionEnabled", { v0: String(counts.text), v1: String(counts.vision) }) : ""}
                    </Typography.Paragraph>
                </div>
                <Button icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>
                    {translate("adminPages.ecommerceStageModels.refreshModels")}
                </Button>
            </header>
            {error ? <Alert type="error" showIcon message={error} /> : null}
            {config && !counts.vision ? (
                <Alert
                    type="warning"
                    showIcon
                    message={translate("adminPages.ecommerceStageModels.noTextModelCanReadProductImagesYet")}
                    description={translate("adminPages.ecommerceStageModels.openAVisionCapableTextModelInChannelManagementUnder")}
                    action={
                        <Button size="small" icon={<ArrowUpRight size={14} />} iconPlacement="end" onClick={() => navigate("/admin/channels")}>
                            {translate("adminPages.ecommerceStageModels.openChannelManagement")}
                        </Button>
                    }
                />
            ) : null}
            {config && draft ? (
                <ol>
                    {stages.map((stage, index) => (
                        <li key={stage.key}>
                            <span className="ecommerce-stage-models-index">{index + 1}</span>
                            <div className="ecommerce-stage-models-label">
                                <strong>{stage.label}</strong>
                                <small>{missing[stage.key] ? translate("adminPages.ecommerceStageModels.theSavedModelHasBeenRemovedOrIsUnavailableSelect") : stage.hint}</small>
                            </div>
                            <div className="ecommerce-stage-models-picker">
                                <ModelPicker
                                    config={config}
                                    capability="text"
                                    value={draft[stage.key].model}
                                    fullWidth
                                    showSelectedPrice={false}
                                    className="creation-model-picker"
                                    placeholder={translate("adminPages.ecommerceStageModels.selectPrimaryModel")}
                                    modelDisabledReason={visionReason}
                                    onChange={(model) => update(stage.key, { model })}
                                />
                            </div>
                            <div className="ecommerce-stage-models-picker">
                                <ModelPicker
                                    config={config}
                                    capability="text"
                                    value={draft[stage.key].fallback}
                                    fullWidth
                                    showSelectedPrice={false}
                                    className="creation-model-picker"
                                    placeholder={translate("adminPages.ecommerceStageModels.fallbackModelOptional")}
                                    modelDisabledReason={(value) => (value === draft[stage.key].model ? translate("adminPages.ecommerceStageModels.alreadyThePrimaryModel") : visionReason(value))}
                                    onChange={(fallback) => update(stage.key, { fallback })}
                                />
                                {draft[stage.key].fallback ? (
                                    <Button size="small" type="text" icon={<X size={14} />} aria-label={translate("adminPages.ecommerceStageModels.clearFallbackModel", { v0: String(stage.label) })} onClick={() => update(stage.key, { fallback: "" })} />
                                ) : null}
                            </div>
                            <div className="ecommerce-stage-models-picker">
                                <Select
                                    className="w-full"
                                    aria-label={translate("adminPages.ecommerceStageModels.thinkingLevel", { v0: String(stage.label) })}
                                    value={draft[stage.key].thinkingLevel}
                                    options={THINKING_REQUEST_OPTIONS}
                                    onChange={(thinkingLevel) => update(stage.key, { thinkingLevel })}
                                />
                            </div>
                        </li>
                    ))}
                    <li className="is-static">
                        <span className="ecommerce-stage-models-index">{stages.length + 1}</span>
                        <div className="ecommerce-stage-models-label">
                            <strong>{translate("adminPages.ecommerceStageModels.generateImage")}</strong>
                            <small>{translate("adminPages.ecommerceStageModels.usersChooseAnImageModelOnTheECommercePage")}</small>
                        </div>
                    </li>
                </ol>
            ) : null}
            <footer>
                <Button type="primary" loading={saving} disabled={!dirty || incomplete || Boolean(error)} onClick={() => void save()}>
                    {translate("adminPages.ecommerceStageModels.saveStageModels")}
                </Button>
                <Typography.Text type="secondary">
                    {incomplete && draft ? translate("adminPages.ecommerceStageModels.bothStagesRequireAPrimaryModel") : dirty ? translate("adminPages.ecommerceStageModels.unsavedChanges") : translate("adminPages.ecommerceStageModels.saved")}
                </Typography.Text>
            </footer>
        </section>
    );
}
