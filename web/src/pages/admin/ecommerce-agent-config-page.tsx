import { Button } from "antd";
import { ArrowUpRight, Clapperboard, Image as ImageIcon, Layers3, ListChecks, RefreshCw, ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { getAdminFeatureAvailability } from "@/services/api/auth";
import { getCommerceAgentSetting, type CommerceAgentSetting } from "@/services/api/ecommerce-knowledge";
import type { FeatureAvailability } from "@/stores/use-user-store";
import { AdminPageFrame } from "./components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "./components/admin-ui";
import { EcommerceStageModels } from "./ecommerce-stage-models";
import "./ecommerce-agent-config.css";
import { translate } from "@/i18n";


type ReadinessRow = { key: string; title: string; description: string; icon: ReactNode; ready: boolean; required: boolean; action: { label: string; run: () => void } };

const stageModelsAnchor = "eac-stage-models";
const hasModel = (ref?: { logicalModelId?: string; channelModelId?: string }) => Boolean(ref?.logicalModelId || ref?.channelModelId);

/**
 * 电商 Agent 上线配置：先看「还差什么」，再在同一页补齐阶段模型。
 * 功能开关仍只在「功能开放」修改，这里汇总电商用得到的几项并给出去处。
 */
export default function EcommerceAgentConfigPage() {
    const navigate = useNavigate();
    const [features, setFeatures] = useState<FeatureAvailability | null>(null);
    const [agentSetting, setAgentSetting] = useState<CommerceAgentSetting | null>(null);
    const [loadError, setLoadError] = useState("");
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [availability, setting] = await Promise.all([getAdminFeatureAvailability(), getCommerceAgentSetting()]);
            setFeatures(availability.features);
            setAgentSetting(setting);
            setLoadError("");
        } catch (cause) {
            setLoadError(cause instanceof Error ? cause.message : translate("adminPages.ecommerceAgentConfigPage.failedToLoadLaunchStatus"));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);
    const openFeatures = () => navigate("/admin/settings/features");
    const openStageModels = () => document.getElementById(stageModelsAnchor)?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    // 运行时实际生效的模型：识别阶段缺省时沿用策划模型。
    const planningReady = hasModel(agentSetting ?? undefined);
    const visionReady = hasModel(agentSetting?.vision) || planningReady;
    const rows: ReadinessRow[] = features
        ? [
              {
                  key: "ecommerce",
                  title: translate("adminPages.ecommerceAgentConfigPage.eCommerceAgentIsAvailable"),
                  description: translate("adminPages.ecommerceAgentConfigPage.showECommerceAgentInTheSidebarSoUsersCan"),
                  icon: <ShoppingBag className="size-4" aria-hidden="true" />,
                  ready: features.ecommerceEnabled,
                  required: true,
                  action: { label: translate("adminPages.ecommerceAgentConfigPage.openFeatureAvailability"), run: openFeatures },
              },
              {
                  key: "image",
                  title: translate("adminPages.ecommerceAgentConfigPage.imageGenerationIsAvailable"),
                  description: translate("adminPages.ecommerceAgentConfigPage.productImagesAreGeneratedIndividuallyFromThePlanUsingImage"),
                  icon: <ImageIcon className="size-4" aria-hidden="true" />,
                  ready: features.imageWorkbenchEnabled,
                  required: true,
                  action: { label: translate("adminPages.ecommerceAgentConfigPage.openFeatureAvailability"), run: openFeatures },
              },
              {
                  key: "models",
                  title: translate("adminPages.ecommerceAgentConfigPage.stageModelsConfigured"),
                  description: visionReady && planningReady ? translate("adminPages.ecommerceAgentConfigPage.imageCapableModelsAreAvailableForBothProductRecognitionAnd") : translate("adminPages.ecommerceAgentConfigPage.productRecognitionOrFullPlanningHasNoAvailableModelUsers"),
                  icon: <Layers3 className="size-4" aria-hidden="true" />,
                  ready: visionReady && planningReady,
                  required: true,
                  action: { label: translate("adminPages.ecommerceAgentConfigPage.configure"), run: openStageModels },
              },
              {
                  key: "video",
                  title: translate("adminPages.ecommerceAgentConfigPage.productVideoOptional"),
                  description: translate("adminPages.ecommerceAgentConfigPage.allowUsersToSendWorkToVideoGenerationToCreate"),
                  icon: <Clapperboard className="size-4" aria-hidden="true" />,
                  ready: features.ecommerceVideoEnabled && features.videoWorkbenchEnabled,
                  required: false,
                  action: { label: translate("adminPages.ecommerceAgentConfigPage.openFeatureAvailability"), run: openFeatures },
              },
          ]
        : [];
    const missing = rows.filter((row) => row.required && !row.ready).length;

    return (
        <AdminPageFrame title={translate("adminPages.ecommerceAgentConfigPage.eCommerceAgentSettings")} description={translate("adminPages.ecommerceAgentConfigPage.completeAvailabilityAndStageModelSettingsSoUsersCanGo")} scroll>
            <div className="admin-settings-stack eac-page">
                <SettingsSectionCard
                    className="eac-section"
                    layout="stacked"
                    icon={<ListChecks className="size-4" aria-hidden="true" />}
                    title={translate("adminPages.ecommerceAgentConfigPage.launchChecklist")}
                    description={translate("adminPages.ecommerceAgentConfigPage.allRequiredItemsMustBeReadyForUsersToComplete")}
                    status={features ? <AdminStatusBadge label={missing ? translate("adminPages.ecommerceAgentConfigPage.itemsRemaining", { v0: String(missing) }) : translate("adminPages.ecommerceAgentConfigPage.readyToUse")} tone={missing ? "warning" : "success"} /> : undefined}
                    footer={
                        <>
                            <span className="eac-save-state">{loadError ? translate("adminPages.ecommerceAgentConfigPage.failedToLoad", { v0: String(loadError) }) : features ? translate("adminPages.ecommerceAgentConfigPage.basedOnTheCurrentServerConfiguration") : translate("adminPages.ecommerceAgentConfigPage.loading")}</span>
                            <div className="eac-save-actions">
                                <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()}>
                                    {translate("common.refresh")}
                                </Button>
                            </div>
                        </>
                    }
                >
                    <ul className="eac-availability">
                        {rows.map((row) => (
                            <li key={row.key}>
                                <span className="eac-availability-icon">{row.icon}</span>
                                <div>
                                    <strong>{row.title}</strong>
                                    <span>{row.description}</span>
                                </div>
                                <div className="eac-readiness-actions">
                                    <AdminStatusBadge label={row.ready ? translate("adminPages.ecommerceAgentConfigPage.ready") : row.required ? translate("adminPages.ecommerceAgentConfigPage.incomplete") : translate("adminPages.ecommerceAgentConfigPage.notEnabled")} tone={row.ready ? "success" : row.required ? "warning" : "neutral"} />
                                    {row.ready ? null : (
                                        <Button size="small" icon={<ArrowUpRight className="size-3.5" />} iconPlacement="end" onClick={row.action.run}>
                                            {row.action.label}
                                        </Button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </SettingsSectionCard>

                <div id={stageModelsAnchor}>
                    <SettingsSectionCard className="eac-section" layout="stacked" icon={<Layers3 className="size-4" aria-hidden="true" />} title={translate("adminPages.ecommerceAgentConfigPage.stageModels")} description={translate("adminPages.ecommerceAgentConfigPage.theECommercePageCallsModelsInThisOrderThese")}>
                        <EcommerceStageModels embedded onSaved={() => void load()} />
                    </SettingsSectionCard>
                </div>
            </div>
        </AdminPageFrame>
    );
}
