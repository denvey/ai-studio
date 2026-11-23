import { useEffect, useState, type ReactNode } from "react";
import { Button } from "antd";
import { useNavigate } from "react-router";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState, WorkspaceState } from "@/components/layout/workspace-state";
import { refreshFeatureAvailability } from "@/lib/user-session";
import { useUserStore } from "@/stores/use-user-store";
import { translate } from "@/i18n";

type FeatureKey = "shortDramaEnabled" | "taskCenterEnabled" | "creditsEnabled" | "frontendModelsEnabled" | "pluginCenterEnabled" | "imageWorkbenchEnabled" | "videoWorkbenchEnabled";

const featureNames: Record<FeatureKey, string> = {
    shortDramaEnabled: translate("nav.tools.projects"),
    taskCenterEnabled: translate("shared.auth.requireFeature.taskCenter"),
    creditsEnabled: translate("nav.tools.wallet"),
    frontendModelsEnabled: translate("shared.auth.requireFeature.frontendModels"),
    pluginCenterEnabled: translate("shared.auth.requireFeature.pluginCenter"),
    imageWorkbenchEnabled: translate("shared.auth.requireFeature.generateImage"),
    videoWorkbenchEnabled: translate("account.feedback.video"),
};

export function RequireFeature({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
    const navigate = useNavigate();
    const user = useUserStore((state) => state.user);
    const features = useUserStore((state) => state.features);
    const [checking, setChecking] = useState(() => !useUserStore.getState().features[feature]);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setError("");
        refreshFeatureAvailability()
            .catch((reason) => {
                if (!cancelled) setError(reason instanceof Error ? reason.message : translate("shared.auth.requireFeature.couldNotLoadFeatureAvailability"));
            })
            .finally(() => {
                if (!cancelled) setChecking(false);
            });
        return () => {
            cancelled = true;
        };
    }, [feature, user?.id]);

    if (checking)
        return (
            <WorkspacePage>
                <WorkspaceLoadingState label={translate("shared.auth.requireFeature.checkingFeatureStatus")} detail={featureNames[feature]} rows={3} />
            </WorkspacePage>
        );
    if (error)
        return (
            <WorkspacePage>
                <WorkspaceErrorState title={translate("shared.auth.requireFeature.couldNotConfirmFeatureStatus")} description={error} actionLabel={translate("shared.auth.requireFeature.backToWorkspace")} onRetry={() => navigate("/", { replace: true })} />
            </WorkspacePage>
        );
    if (!features[feature]) {
        // 管理员页面返回到管理后台首页，用户页面返回到创作台
        const isAdminFeature = feature === "frontendModelsEnabled";
        const backPath = isAdminFeature ? "/admin" : "/";
        const backLabel = isAdminFeature ? translate("shared.auth.requireFeature.backToAdmin") : translate("shared.auth.requireFeature.backToWorkspace");

        return (
            <WorkspacePage>
                <WorkspaceState
                    kind="forbidden"
                    icon="settings"
                    title={translate("shared.auth.requireFeature.isNotAvailableYet", { v0: String(featureNames[feature]) })}
                    description={translate("shared.auth.requireFeature.thisFeatureHasBeenTurnedOffByTheAdministrator")}
                    action={
                        <Button type="primary" onClick={() => navigate(backPath, { replace: true })}>
                            {backLabel}
                        </Button>
                    }
                />
            </WorkspacePage>
        );
    }
    return children;
}
