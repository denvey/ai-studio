import { useEffect, useState } from "react";
import { App, Button } from "antd";
import { Switch } from "@/pages/admin/ui/controls";
import { getAdminFeatureAvailability, updateAdminFeatureAvailability } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";
import { translate } from "@/i18n";

export function WelcomeSetting() {
    const { message } = App.useApp();
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const setFeatures = useUserStore((state) => state.setFeatures);

    useEffect(() => {
        let active = true;
        setError("");
        getAdminFeatureAvailability()
            .then(({ features }) => {
                if (typeof features.welcomeEnabled !== "boolean") throw new Error(translate("adminPages.settings.welcomeSetting.invalidWelcomePageSettings"));
                if (active) setEnabled(features.welcomeEnabled);
            })
            .catch(() => {
                if (active) setError(translate("adminPages.settings.welcomeSetting.failedToLoadWelcomePageStatusPleaseTryAgain"));
            });
        return () => {
            active = false;
        };
    }, [revision]);

    async function changeWelcome(value: boolean) {
        if (saving) return;
        setSaving(true);
        try {
            const { features } = await updateAdminFeatureAvailability({ welcomeEnabled: value });
            if (features.welcomeEnabled !== value) throw new Error(translate("adminPages.settings.welcomeSetting.welcomePageStatusWasNotSavedPleaseTryAgain"));
            setEnabled(features.welcomeEnabled);
            setFeatures(features);
            message.success(value ? translate("adminPages.settings.welcomeSetting.welcomePageEnabled") : translate("adminPages.settings.welcomeSetting.welcomePageDisabled"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.settings.welcomeSetting.failedToSaveWelcomePageStatus"));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="admin-appearance-logo-frame-option">
            <div className="admin-appearance-logo-frame-copy">
                <strong>{translate("adminPages.settings.welcomeSetting.enableWelcomePage")}</strong>
                <p>{translate("adminPages.settings.welcomeSetting.changesAreSavedImmediatelyWhenDisabledWelcomeOpensTheCreative")}</p>
                {error ? (
                    <div role="alert">
                        {error}
                        <Button onClick={() => setRevision((value) => value + 1)}>{translate("common.retry")}</Button>
                    </div>
                ) : null}
            </div>
            <div className="admin-appearance-logo-frame-control">
                <span>
                    {enabled === null ? translate("account.settings.diagnostics.loading") : saving ? translate("canvasA.drawingModal.saving") : enabled ? translate("account.layout.oss.enabled") : translate("adminPages.settings.welcomeSetting.disabled")}
                </span>
                <Switch aria-label={translate("adminPages.settings.welcomeSetting.enableWelcomePage")} checked={enabled === true} disabled={enabled === null || saving || Boolean(error)} onChange={(value) => void changeWelcome(value)} />
            </div>
        </div>
    );
}
