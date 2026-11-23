import { commitPublicAppearance, DEFAULT_PUBLIC_APPEARANCE } from "@/stores/use-appearance-store";
import { deleteAdminResources } from "@/services/api/admin-storage";
import { AdminStatusBadge, SettingsSectionCard } from "@/pages/admin/components/admin-ui";
import { AdminPageFrame } from "@/pages/admin/components/admin-shell";
import { Palette, RefreshCw, Undo2, RotateCcw, Save, Sun, Moon, MonitorPlay, Globe2, Search, Copyright, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/pages/admin/ui/controls";
import { WelcomeSetting } from "@/pages/admin/settings/components/welcome-setting";
import { SkinThemeEditor } from "@/pages/admin/settings/components/skin-theme-editor";
import { CanvasAppearanceEditor } from "./components/canvas-appearance-editor";
import { UpdateAnnouncementEditor } from "./components/update-announcement-editor";
import { DEFAULT_UPDATE_ANNOUNCEMENT, normalizeUpdateAnnouncement, validateUpdateAnnouncement, type UpdateAnnouncement } from "@/lib/update-announcement";
import { App, Button, Tabs, Form, Input } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { cloneSkinDefinition, DEFAULT_CLASSIC_SKIN, normalizeSkinDefinition, type SkinDefinition, duplicateSkinDefinition, skinDisplayName } from "@/lib/skin-themes";
import { DEFAULT_CANVAS_APPEARANCE, type CanvasAppearance } from "@/lib/canvas/agent-appearance";
import { getAdminAppearance, type AdminAppearance, type AppearanceAssetSlot, resetAdminAppearance, uploadAppearanceAsset, updateAdminAppearance } from "@/services/api/appearance";
import { normalizeDraftCopy, normalizeSingleLine, hasUnsupportedControlCharacter, validateSkinDrafts, useAppearancePreviews, AppearanceSkeleton, AssetPicker, LogoThemePreview } from "./appearance-settings-parts";
import { type DraftFiles, FILE_RULES, type ResetState } from "./appearance-settings-parts";
import { translate } from "@/i18n";


export { type DraftFiles, FILE_RULES, type ResetState } from "./appearance-settings-parts";

const EMPTY_FILES: DraftFiles = { logo: null, "logo-dark": null, video: null, poster: null };
const EMPTY_RESETS: ResetState = { logo: false, "logo-dark": false, video: false, poster: false };

export default function AppearanceSettingsPage() {
    const { message, modal } = App.useApp();
    const [activeTab, setActiveTab] = useState("brand");
    const [setting, setSetting] = useState<AdminAppearance | null>(null);
    const [brandName, setBrandName] = useState("");
    const [canvas, setCanvas] = useState<CanvasAppearance>(DEFAULT_CANVAS_APPEARANCE);
    const [updates, setUpdates] = useState<UpdateAnnouncement>(DEFAULT_UPDATE_ANNOUNCEMENT);
    const [canvasUploading, setCanvasUploading] = useState(false);
    const [brandSlug, setBrandSlug] = useState("");
    const [authHeroTitle, setAuthHeroTitle] = useState("");
    const [authHeroDescription, setAuthHeroDescription] = useState("");
    const [authVideoAutoplay, setAuthVideoAutoplay] = useState(true);
    const [logoFrameEnabled, setLogoFrameEnabled] = useState(true);
    const [skinId, setSkinId] = useState("classic");
    const [skinThemes, setSkinThemes] = useState<SkinDefinition[]>([DEFAULT_CLASSIC_SKIN]);
    const [seoTitle, setSeoTitle] = useState("");
    const [seoDescription, setSeoDescription] = useState("");
    const [seoKeywords, setSeoKeywords] = useState("");
    const [footerCopyright, setFooterCopyright] = useState("");
    const [icpFilingEnabled, setIcpFilingEnabled] = useState(false);
    const [icpFilingNumber, setIcpFilingNumber] = useState("");
    const [redeemPurchaseUrl, setRedeemPurchaseUrl] = useState("");
    const [files, setFiles] = useState<DraftFiles>(EMPTY_FILES);
    const [resets, setResets] = useState<ResetState>(EMPTY_RESETS);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [loadError, setLoadError] = useState("");
    const requestVersionRef = useRef(0);
    const inputRefs = {
        logo: useRef<HTMLInputElement>(null),
        "logo-dark": useRef<HTMLInputElement>(null),
        video: useRef<HTMLInputElement>(null),
        poster: useRef<HTMLInputElement>(null),
    };

    const dirty =
        Boolean(setting) &&
        (JSON.stringify(updates) !== JSON.stringify(normalizeUpdateAnnouncement(setting?.updates)) ||
            JSON.stringify(canvas) !== JSON.stringify(setting?.canvas || DEFAULT_CANVAS_APPEARANCE) ||
            canvasUploading ||
            brandName.trim() !== setting?.brandName ||
            brandSlug.trim().toLocaleLowerCase() !== setting?.brandSlug ||
            normalizeDraftCopy(authHeroTitle) !== setting?.authHeroTitle ||
            normalizeDraftCopy(authHeroDescription) !== setting?.authHeroDescription ||
            authVideoAutoplay !== setting?.authVideoAutoplay ||
            logoFrameEnabled !== setting?.logoFrameEnabled ||
            skinId !== setting?.skinId ||
            JSON.stringify(skinThemes) !== JSON.stringify(setting?.skinThemes) ||
            normalizeSingleLine(seoTitle) !== setting?.seoTitle ||
            normalizeDraftCopy(seoDescription) !== setting?.seoDescription ||
            normalizeSingleLine(seoKeywords) !== setting?.seoKeywords ||
            normalizeSingleLine(footerCopyright) !== setting?.footerCopyright ||
            icpFilingEnabled !== setting?.icpFilingEnabled ||
            normalizeSingleLine(icpFilingNumber) !== setting?.icpFilingNumber ||
            normalizeSingleLine(redeemPurchaseUrl) !== setting?.redeemPurchaseUrl ||
            Object.values(files).some(Boolean) ||
            Object.values(resets).some(Boolean));
    const blocker = useBlocker(dirty && !saving && !restoring);

    const applySetting = useCallback((value: AdminAppearance) => {
        const themes = value.skinThemes.length ? value.skinThemes.map((theme) => normalizeSkinDefinition(theme)) : [cloneSkinDefinition(DEFAULT_CLASSIC_SKIN)];
        const selectedID = themes.some((theme) => theme.id === value.skinId) ? value.skinId : "classic";
        setSetting({ ...value, skinThemes: themes, skinId: selectedID });
        setBrandName(value.brandName);
        setCanvas(value.canvas || DEFAULT_CANVAS_APPEARANCE);
        setUpdates(normalizeUpdateAnnouncement(value.updates));
        setBrandSlug(value.brandSlug);
        setAuthHeroTitle(value.authHeroTitle);
        setAuthHeroDescription(value.authHeroDescription);
        setAuthVideoAutoplay(value.authVideoAutoplay);
        setLogoFrameEnabled(value.logoFrameEnabled);
        setSkinThemes(themes);
        setSkinId(selectedID);
        setSeoTitle(value.seoTitle);
        setSeoDescription(value.seoDescription);
        setSeoKeywords(value.seoKeywords);
        setFooterCopyright(value.footerCopyright);
        setIcpFilingEnabled(value.icpFilingEnabled);
        setIcpFilingNumber(value.icpFilingNumber);
        setRedeemPurchaseUrl(value.redeemPurchaseUrl);
        setFiles(EMPTY_FILES);
        setResets(EMPTY_RESETS);
        setLoadError("");
    }, []);

    const load = useCallback(
        async (initial = false) => {
            const requestVersion = ++requestVersionRef.current;
            if (initial) setLoading(true);
            else setRefreshing(true);
            try {
                const value = await getAdminAppearance();
                if (requestVersion === requestVersionRef.current) applySetting(value);
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                const detail = error instanceof Error ? error.message : translate("adminPages.settings.appearanceSettingsPage.failedToLoadAppearanceSettings");
                setLoadError(detail);
                if (!initial) message.error(detail);
            } finally {
                if (requestVersion === requestVersionRef.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [applySetting, message],
    );

    useEffect(() => {
        void load(true);
        return () => {
            requestVersionRef.current += 1;
        };
    }, [load]);

    useEffect(() => {
        if (blocker.state !== "blocked") return;
        modal.confirm({
            title: translate("adminPages.settings.appearanceSettingsPage.discardSiteAndAppearanceChanges"),
            content: translate("adminPages.settings.appearanceSettingsPage.currentBrandingCanvasAgentAnnouncementsSEOICPRegistrationThemeOr"),
            okText: translate("adminPages.settings.appearanceSettingsPage.discardAndLeave"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => blocker.proceed(),
            onCancel: () => blocker.reset(),
        });
    }, [blocker, modal]);

    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (!dirty || saving || restoring) return;
            event.preventDefault();
        };
        window.addEventListener("beforeunload", beforeUnload);
        return () => window.removeEventListener("beforeunload", beforeUnload);
    }, [dirty, restoring, saving]);

    const selectFile = (slot: AppearanceAssetSlot, file?: File) => {
        if (!file) return;
        const rule = FILE_RULES[slot];
        if (!rule.accept.split(",").includes(file.type) || file.size <= 0 || file.size > rule.maxBytes) {
            message.error(translate("adminPages.settings.appearanceSettingsPage.mustUseASupportedFormatAndBeNoLargerThan", { v0: String(rule.label), v1: String(rule.maxBytes >> 20) }));
            if (inputRefs[slot].current) inputRefs[slot].current.value = "";
            return;
        }
        setFiles((current) => ({
            ...current,
            [slot]: file,
            ...(slot === "video" ? { poster: null } : {}),
        }));
        setResets((current) => ({
            ...current,
            [slot]: false,
            ...(slot === "video" ? { poster: true } : {}),
        }));
        if (slot === "video" && inputRefs.poster.current) inputRefs.poster.current.value = "";
    };

    const resetAsset = (slot: AppearanceAssetSlot) => {
        setFiles((current) => ({
            ...current,
            [slot]: null,
            ...(slot === "video" ? { poster: null } : {}),
        }));
        setResets((current) => ({
            ...current,
            [slot]: true,
            ...(slot === "video" ? { poster: true } : {}),
        }));
        if (inputRefs[slot].current) inputRefs[slot].current.value = "";
        if (slot === "video" && inputRefs.poster.current) inputRefs.poster.current.value = "";
    };

    const discardDraft = () => {
        if (!setting || saving || restoring || canvasUploading) return;
        setCanvas(setting.canvas || DEFAULT_CANVAS_APPEARANCE);
        setUpdates(normalizeUpdateAnnouncement(setting.updates));
        setBrandName(setting.brandName);
        setBrandSlug(setting.brandSlug);
        setAuthHeroTitle(setting.authHeroTitle);
        setAuthHeroDescription(setting.authHeroDescription);
        setAuthVideoAutoplay(setting.authVideoAutoplay);
        setLogoFrameEnabled(setting.logoFrameEnabled);
        setSkinId(setting.skinId);
        setSkinThemes(setting.skinThemes.map((theme) => cloneSkinDefinition(theme)));
        setSeoTitle(setting.seoTitle);
        setSeoDescription(setting.seoDescription);
        setSeoKeywords(setting.seoKeywords);
        setFooterCopyright(setting.footerCopyright);
        setIcpFilingEnabled(setting.icpFilingEnabled);
        setIcpFilingNumber(setting.icpFilingNumber);
        setRedeemPurchaseUrl(setting.redeemPurchaseUrl);
        setFiles(EMPTY_FILES);
        setResets(EMPTY_RESETS);
        Object.values(inputRefs).forEach((ref) => {
            if (ref.current) ref.current.value = "";
        });
        message.info(translate("adminPages.settings.appearanceSettingsPage.unsavedAppearanceChangesDiscarded"));
    };

    const requestRefresh = () => {
        if (canvasUploading) return;
        if (!dirty) {
            void load(false);
            return;
        }
        modal.confirm({
            title: translate("adminPages.settings.appearanceSettingsPage.discardChangesAndReload"),
            content: translate("adminPages.settings.appearanceSettingsPage.reloadingDiscardsCurrentBrandingCanvasAgentAnnouncementsSEOICPRegistration"),
            okText: translate("adminPages.settings.appearanceSettingsPage.discardAndRefresh"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => load(false),
        });
    };

    const restoreBuiltInAppearance = () => {
        if (!setting?.configured || saving || refreshing || restoring || canvasUploading) return;
        modal.confirm({
            title: translate("adminPages.settings.appearanceSettingsPage.restoreYingceSDefaultBranding"),
            content: translate("adminPages.settings.appearanceSettingsPage.theBrandNameEnglishIDLogosCanvasAgentNameText"),
            okText: translate("adminPages.settings.appearanceSettingsPage.resetToDefaults"),
            cancelText: translate("common.cancel"),
            okButtonProps: { danger: true },
            onOk: async () => {
                setRestoring(true);
                requestVersionRef.current += 1;
                try {
                    const restored = await resetAdminAppearance();
                    applySetting(restored);
                    commitPublicAppearance(restored.public);
                    Object.values(inputRefs).forEach((ref) => {
                        if (ref.current) ref.current.value = "";
                    });
                    message.success(translate("adminPages.settings.appearanceSettingsPage.yingceSDefaultBrandingRestored"));
                } catch (error) {
                    message.error(error instanceof Error ? error.message : translate("adminPages.settings.appearanceSettingsPage.failedToRestoreDefaultAppearance"));
                    throw error;
                } finally {
                    setRestoring(false);
                }
            },
        });
    };

    const save = async () => {
        if (!setting || saving || restoring || canvasUploading) return;
        const updatesError = validateUpdateAnnouncement(updates);
        if (updatesError) {
            setActiveTab("updates");
            message.error(updatesError);
            return;
        }
        if (![canvas.agentName, canvas.panelTitle, canvas.welcomeTitle, canvas.inputPlaceholder].every((text) => text.trim())) {
            setActiveTab("canvas");
            message.error(translate("adminPages.settings.appearanceSettingsPage.pleaseEnterTheAssistantNamePanelTitleWelcomeTitleAnd"));
            return;
        }
        const nextBrandName = brandName.trim();
        const nextBrandSlug = brandSlug.trim().toLocaleLowerCase();
        const nextAuthHeroTitle = normalizeDraftCopy(authHeroTitle);
        const nextAuthHeroDescription = normalizeDraftCopy(authHeroDescription);
        const nextSeoTitle = normalizeSingleLine(seoTitle);
        const nextSeoDescription = normalizeDraftCopy(seoDescription);
        const nextSeoKeywords = normalizeSingleLine(seoKeywords);
        const nextFooterCopyright = normalizeSingleLine(footerCopyright);
        const nextIcpFilingNumber = normalizeSingleLine(icpFilingNumber);
        const nextRedeemPurchaseUrl = normalizeSingleLine(redeemPurchaseUrl);
        if (!nextBrandName || Array.from(nextBrandName).length > 40) {
            setActiveTab("brand");
            message.error(translate("adminPages.settings.appearanceSettingsPage.brandNameMustBe140Characters"));
            return;
        }
        if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(nextBrandSlug)) {
            setActiveTab("brand");
            message.error(translate("adminPages.settings.appearanceSettingsPage.englishBrandIDMustContain148LowercaseLettersNumbers"));
            return;
        }
        if (!nextAuthHeroTitle || Array.from(nextAuthHeroTitle).length > 80 || hasUnsupportedControlCharacter(nextAuthHeroTitle)) {
            setActiveTab("auth");
            message.error(translate("adminPages.settings.appearanceSettingsPage.loginPageHeadingMustBe180CharactersLineBreaks"));
            return;
        }
        if (Array.from(nextAuthHeroDescription).length > 160 || hasUnsupportedControlCharacter(nextAuthHeroDescription)) {
            setActiveTab("auth");
            message.error(translate("adminPages.settings.appearanceSettingsPage.loginPageDescriptionCannotExceed160CharactersLineBreaksAre"));
            return;
        }
        for (const [value, label, max, tab] of [
            [nextSeoTitle, translate("adminPages.settings.appearanceSettingsPage.sEOTitle"), 70, "seo"],
            [nextSeoDescription, translate("adminPages.settings.appearanceSettingsPage.sEODescription"), 200, "seo"],
            [nextSeoKeywords, translate("adminPages.settings.appearanceSettingsPage.sEOKeywords"), 300, "seo"],
            [nextFooterCopyright, translate("adminPages.settings.appearanceSettingsPage.copyrightNotice"), 160, "footer"],
            [nextIcpFilingNumber, translate("adminPages.settings.appearanceSettingsPage.iCPRegistrationNumber"), 64, "footer"],
        ] as const) {
            if (Array.from(value).length > max || hasUnsupportedControlCharacter(value)) {
                setActiveTab(tab);
                message.error(translate("adminPages.settings.appearanceSettingsPage.cannotExceedCharactersOrContainControlCharacters", { v0: String(label), v1: String(max) }));
                return;
            }
        }
        if (icpFilingEnabled && !nextIcpFilingNumber) {
            setActiveTab("footer");
            message.error(translate("adminPages.settings.appearanceSettingsPage.pleaseEnterAnICPRegistrationNumberBeforeEnablingItsDisplay"));
            return;
        }
        if (nextRedeemPurchaseUrl) {
            try {
                const parsed = new URL(nextRedeemPurchaseUrl);
                if (parsed.protocol !== "https:" || !parsed.host) throw new Error("invalid");
            } catch {
                setActiveTab("footer");
                message.error(translate("adminPages.settings.appearanceSettingsPage.redemptionCodePurchaseLinkMustBeAValidHTTPSURL"));
                return;
            }
        }
        const skinError = validateSkinDrafts(skinThemes, skinId);
        if (skinError) {
            setActiveTab("skins");
            message.error(skinError);
            return;
        }
        setSaving(true);
        const uploadedIDs: string[] = [];
        try {
            const ids: Record<AppearanceAssetSlot, string> = {
                logo: resets.logo ? "" : setting.logoResourceId,
                "logo-dark": resets["logo-dark"] ? "" : setting.darkLogoResourceId,
                video: resets.video ? "" : setting.authVideoResourceId,
                poster: resets.poster ? "" : setting.authVideoPosterResourceId,
            };
            for (const slot of ["logo", "logo-dark", "video", "poster"] as AppearanceAssetSlot[]) {
                const file = files[slot];
                if (!file) continue;
                const resource = await uploadAppearanceAsset(slot, file);
                uploadedIDs.push(resource.id);
                ids[slot] = resource.id;
            }
            const updated = await updateAdminAppearance({
                canvas,
                updates,
                brandName: nextBrandName,
                brandSlug: nextBrandSlug,
                authHeroTitle: nextAuthHeroTitle,
                authHeroDescription: nextAuthHeroDescription,
                logoResourceId: ids.logo,
                darkLogoResourceId: ids["logo-dark"],
                logoFrameEnabled,
                authVideoResourceId: ids.video,
                authVideoPosterResourceId: ids.poster,
                authVideoAutoplay,
                skinId,
                skinThemes,
                seoTitle: nextSeoTitle,
                seoDescription: nextSeoDescription,
                seoKeywords: nextSeoKeywords,
                footerCopyright: nextFooterCopyright,
                icpFilingEnabled,
                icpFilingNumber: nextIcpFilingNumber,
                redeemPurchaseUrl: nextRedeemPurchaseUrl,
            });
            applySetting(updated);
            commitPublicAppearance(updated.public);
            Object.values(inputRefs).forEach((ref) => {
                if (ref.current) ref.current.value = "";
            });
            message.success(translate("adminPages.settings.appearanceSettingsPage.siteAndAppearanceSettingsSavedAndApplied"));
        } catch (error) {
            const detail = error instanceof Error ? error.message : translate("adminPages.settings.appearanceSettingsPage.failedToSaveAppearanceSettings");
            if (uploadedIDs.length) {
                try {
                    await deleteAdminResources(uploadedIDs);
                } catch {
                    message.warning(translate("adminPages.settings.appearanceSettingsPage.saveFailedAndTemporaryUploadsCouldNotBeRemovedAutomatically"));
                }
            }
            message.error(detail);
        } finally {
            setSaving(false);
        }
    };

    const previews = useAppearancePreviews(setting, files, resets);
    const lightLogoSelected = Boolean(files.logo || (!resets.logo && setting?.logoResourceId));
    const darkLogoSelected = Boolean(files["logo-dark"] || (!resets["logo-dark"] && setting?.darkLogoResourceId));
    const status = setting?.configured ? <AdminStatusBadge label={translate("adminPages.settings.appearanceSettingsPage.customized")} tone="success" /> : <AdminStatusBadge label={translate("adminPages.settings.appearanceSettingsPage.usingOriginalAppearance")} tone="neutral" />;
    const copyCustomized = normalizeDraftCopy(authHeroTitle) !== DEFAULT_PUBLIC_APPEARANCE.authHeroTitle || normalizeDraftCopy(authHeroDescription) !== DEFAULT_PUBLIC_APPEARANCE.authHeroDescription;
    const draftBrandName = brandName.trim() || translate("adminPages.settings.appearanceSettingsPage.siteName");
    const selectedSkin = skinThemes.find((skin) => skin.id === skinId) || skinThemes[0] || DEFAULT_CLASSIC_SKIN;

    const changeSkin = (next: SkinDefinition) => {
        if (next.locked) return;
        setSkinThemes((current) => current.map((theme) => (theme.id === next.id ? next : theme)));
    };

    const duplicateSkin = (sourceID: string) => {
        if (skinThemes.length >= 16) return;
        const source = skinThemes.find((theme) => theme.id === sourceID) || DEFAULT_CLASSIC_SKIN;
        const copy = duplicateSkinDefinition(
            source,
            skinThemes.map((theme) => theme.id),
        );
        setSkinThemes((current) => [...current, copy]);
        setSkinId(copy.id);
    };

    const deleteSkin = (targetID: string) => {
        const target = skinThemes.find((theme) => theme.id === targetID);
        if (!target || target.locked) return;
        modal.confirm({
            title: translate("adminPages.settings.appearanceSettingsPage.deleteTheme", { v0: String(target.name) }),
            content: translate("adminPages.settings.appearanceSettingsPage.deletionWillBeSavedWithTheOtherChangesOnThis"),
            okText: translate("adminPages.settings.appearanceSettingsPage.deleteTheme2"),
            cancelText: translate("common.cancel"),
            okButtonProps: { danger: true },
            onOk: () => {
                setSkinThemes((current) => current.filter((theme) => theme.id !== targetID));
                if (skinId === targetID) setSkinId("classic");
            },
        });
    };

    return (
        <AdminPageFrame title={translate("adminPages.settings.appearanceSettingsPage.siteAndAppearance")} description={translate("adminPages.settings.appearanceSettingsPage.manageBrandingLoginPageSearchMetadataICPRegistrationDisplayAnd")} scroll>
            {loading ? (
                <AppearanceSkeleton />
            ) : loadError || !setting ? (
                <div className="admin-settings-stack admin-appearance-settings">
                    <div className="admin-appearance-load-error" role="alert">
                        <span className="admin-appearance-load-error-icon">
                            <Palette className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h2>{translate("adminPages.settings.appearanceSettingsPage.unableToLoadAppearanceSettings")}</h2>
                            <p>{loadError || translate("adminPages.settings.appearanceSettingsPage.noSettingsAreAvailableToDisplayPleaseTryAgainLater")}</p>
                        </div>
                        <Button icon={<RefreshCw className="size-4" />} onClick={() => void load(true)}>
                            {translate("auth.register.reload")}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="admin-settings-stack admin-appearance-settings">
                    <div className={cn("admin-appearance-command-bar", dirty && "is-dirty")}>
                        <div className="admin-appearance-command-copy" aria-live="polite">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <strong>{dirty ? translate("adminPages.settings.appearanceSettingsPage.siteSettingsHaveUnsavedChanges") : translate("adminPages.settings.appearanceSettingsPage.siteAndAppearanceSettingsAreSyncedWithTheServer")}</strong>
                                    <AdminStatusBadge label={dirty ? translate("adminPages.settings.appearanceSettingsPage.notYetApplied") : translate("adminPages.settings.appearanceSettingsPage.currentServerValue")} tone={dirty ? "warning" : "neutral"} />
                                </div>
                                <p>{dirty ? translate("adminPages.settings.appearanceSettingsPage.draftsAreRetainedWhenSwitchingCategoriesSavingAppliesBrandingLogin") : translate("adminPages.settings.appearanceSettingsPage.manageSiteSettingsByCategoryWelcomePageChangesAreSaved")}</p>
                            </div>
                        </div>
                        <div className="admin-appearance-command-actions">
                            {dirty ? (
                                <Button icon={<Undo2 className="size-4" />} disabled={saving || restoring || canvasUploading} onClick={discardDraft}>
                                    {translate("adminPages.settings.appearanceSettingsPage.discardChanges")}
                                </Button>
                            ) : null}
                            <Button icon={<RotateCcw className="size-4" />} loading={restoring} disabled={!setting.configured || saving || refreshing || canvasUploading} onClick={restoreBuiltInAppearance}>
                                {translate("adminPages.settings.appearanceSettingsPage.restoreYingceDefaults")}
                            </Button>
                            <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={saving || restoring || canvasUploading} onClick={requestRefresh}>
                                {translate("library.ark.asset.refresh")}
                            </Button>
                            <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || refreshing || restoring || canvasUploading} onClick={() => void save()}>
                                {translate("adminPages.settings.appearanceSettingsPage.saveChanges")}
                            </Button>
                        </div>
                    </div>

                    <Tabs
                        className="admin-appearance-tabs"
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={[
                            {
                                key: "brand",
                                label: translate("adminPages.settings.appearanceSettingsPage.brandIdentity"),
                                children: (
                                    <SettingsSectionCard
                                        className="admin-appearance-section admin-appearance-brand-section"
                                        icon={<Palette className="size-4" aria-hidden="true" />}
                                        title={translate("adminPages.settings.appearanceSettingsPage.brandIdentity")}
                                        description={translate("adminPages.settings.appearanceSettingsPage.theChineseBrandNameAppearsInTheMainInterfaceThe")}
                                        status={status}
                                    >
                                        <div className="admin-appearance-brand-layout">
                                            <Form className="admin-appearance-form" layout="vertical" requiredMark={false} disabled={saving || refreshing || restoring}>
                                                <Form.Item label={translate("adminPages.settings.appearanceSettingsPage.brandName")} extra={translate("adminPages.settings.appearanceSettingsPage.item140CharactersSavingUpdatesTheLoginPageWorkspaceAdmin")}>
                                                    <Input value={brandName} maxLength={40} showCount placeholder={translate("adminPages.settings.appearanceSettingsPage.enterBrandName")} onChange={(event) => setBrandName(event.target.value)} />
                                                </Form.Item>
                                                <Form.Item label={translate("adminPages.settings.appearanceSettingsPage.englishBrandID")} extra={translate("adminPages.settings.appearanceSettingsPage.item148LowercaseLettersNumbersOrHyphensSuchAsHima")}>
                                                    <Input
                                                        value={brandSlug}
                                                        maxLength={48}
                                                        showCount
                                                        autoCapitalize="none"
                                                        autoCorrect="off"
                                                        spellCheck={false}
                                                        placeholder={translate("adminPages.settings.appearanceSettingsPage.forExampleHimaStudio")}
                                                        onChange={(event) => setBrandSlug(event.target.value.toLocaleLowerCase().replace(/[^a-z0-9-]/g, ""))}
                                                    />
                                                </Form.Item>
                                                <Form.Item label={translate("adminPages.settings.appearanceSettingsPage.redemptionCodePurchaseLink")} extra={translate("adminPages.settings.appearanceSettingsPage.enterAnHTTPSPurchasePageURLLeaveBlankToHide")}>
                                                    <Input value={redeemPurchaseUrl} maxLength={500} showCount placeholder={translate("adminPages.settings.appearanceSettingsPage.forExampleHttpsWzypCnShopXxx")} onChange={(event) => setRedeemPurchaseUrl(event.target.value)} />
                                                </Form.Item>
                                            </Form>
                                            <div className="admin-appearance-brand-logo admin-appearance-logo-stack">
                                                <AssetPicker
                                                    slot="logo"
                                                    title={translate("adminPages.settings.appearanceSettingsPage.lightModeLogo")}
                                                    description={translate("adminPages.settings.appearanceSettingsPage.usedInLightModeAPNGOrWebPWithA")}
                                                    configured={Boolean(setting.logoResourceId) && !resets.logo}
                                                    file={files.logo}
                                                    inputRef={inputRefs.logo}
                                                    onSelect={selectFile}
                                                    onReset={resetAsset}
                                                    disabled={saving || refreshing || restoring}
                                                    emptyLabel={darkLogoSelected ? translate("adminPages.settings.appearanceSettingsPage.theDarkModeLogoWillBeReusedAutomatically") : translate("adminPages.settings.appearanceSettingsPage.usesTheOriginalProjectLogoWhenNoneIsUploaded")}
                                                />
                                                <AssetPicker
                                                    slot="logo-dark"
                                                    title={translate("adminPages.settings.appearanceSettingsPage.darkModeLogoOptional")}
                                                    description={translate("adminPages.settings.appearanceSettingsPage.usedInDarkModeTheLightModeLogoIsReused")}
                                                    configured={Boolean(setting.darkLogoResourceId) && !resets["logo-dark"]}
                                                    file={files["logo-dark"]}
                                                    inputRef={inputRefs["logo-dark"]}
                                                    onSelect={selectFile}
                                                    onReset={resetAsset}
                                                    disabled={saving || refreshing || restoring}
                                                    emptyLabel={lightLogoSelected ? translate("adminPages.settings.appearanceSettingsPage.theLightModeLogoWillBeReusedAutomatically") : translate("adminPages.settings.appearanceSettingsPage.usesTheOriginalProjectLogoWhenNoneIsUploaded")}
                                                />
                                                <div className="admin-appearance-logo-frame-option">
                                                    <div className="admin-appearance-logo-frame-copy">
                                                        <strong>{translate("adminPages.settings.appearanceSettingsPage.removeTheRoundedFrameBehindTheLogo")}</strong>
                                                        <p id="appearance-logo-frame-help">{translate("adminPages.settings.appearanceSettingsPage.whenEnabledWorkspaceAndAdminNavigationShowTheLogoAlone")}</p>
                                                    </div>
                                                    <div className="admin-appearance-logo-frame-control">
                                                        <span>{logoFrameEnabled ? translate("adminPages.settings.appearanceSettingsPage.keepFrame") : translate("adminPages.settings.appearanceSettingsPage.frameRemoved")}</span>
                                                        <Switch
                                                            checked={!logoFrameEnabled}
                                                            disabled={saving || refreshing || restoring}
                                                            aria-label={translate("adminPages.settings.appearanceSettingsPage.removeTheRoundedFrameBehindTheLogo")}
                                                            aria-describedby="appearance-logo-frame-help"
                                                            onChange={(checked) => setLogoFrameEnabled(!checked)}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="admin-appearance-logo-preview-grid" aria-label={translate("adminPages.settings.appearanceSettingsPage.lightAndDarkModeLogoPreview")}>
                                                    <LogoThemePreview label={translate("adminPages.settings.appearanceSettingsPage.lightMode")} icon={<Sun />} src={previews.logoLight} dark={false} frameEnabled={logoFrameEnabled} />
                                                    <LogoThemePreview label={translate("adminPages.settings.appearanceSettingsPage.darkMode")} icon={<Moon />} src={previews.logoDark} dark frameEnabled={logoFrameEnabled} />
                                                </div>
                                            </div>
                                        </div>
                                    </SettingsSectionCard>
                                ),
                            },
                            {
                                key: "auth",
                                label: translate("adminPages.settings.appearanceSettingsPage.loginPage"),
                                destroyOnHidden: true,
                                children: (
                                    <SettingsSectionCard
                                        className="admin-appearance-section admin-appearance-auth-section"
                                        icon={<MonitorPlay className="size-4" aria-hidden="true" />}
                                        title={translate("adminPages.settings.appearanceSettingsPage.loginPageContentAndMedia")}
                                        description={translate("adminPages.settings.appearanceSettingsPage.loginSignupAndPasswordRecoveryShareTheBrandTextAnd")}
                                        status={
                                            <AdminStatusBadge
                                                label={copyCustomized || setting.authVideoResourceId || setting.authVideoPosterResourceId ? translate("adminPages.settings.appearanceSettingsPage.configured") : translate("adminPages.settings.appearanceSettingsPage.usingOriginalContent")}
                                                tone={copyCustomized || setting.authVideoResourceId || setting.authVideoPosterResourceId ? "success" : "neutral"}
                                            />
                                        }
                                    >
                                        <div className="admin-appearance-auth-layout">
                                            <div className="admin-appearance-auth-controls">
                                                <Form className="admin-appearance-form" layout="vertical" requiredMark={false} disabled={saving || refreshing || restoring}>
                                                    <Form.Item label={translate("adminPages.settings.appearanceSettingsPage.loginPageHeading")} extra={translate("adminPages.settings.appearanceSettingsPage.item180CharactersLineBreaksAllowedSharedByLoginSignup")}>
                                                        <Input.TextArea value={authHeroTitle} maxLength={80} showCount autoSize={{ minRows: 2, maxRows: 4 }} placeholder={translate("adminPages.settings.appearanceSettingsPage.enterLoginPageHeading")} onChange={(event) => setAuthHeroTitle(event.target.value)} />
                                                    </Form.Item>
                                                    <Form.Item label={translate("adminPages.settings.appearanceSettingsPage.loginPageDescriptionOptional")} extra={translate("adminPages.settings.appearanceSettingsPage.upTo160CharactersLineBreaksAllowedLeaveBlankTo")}>
                                                        <Input.TextArea
                                                            value={authHeroDescription}
                                                            maxLength={160}
                                                            showCount
                                                            autoSize={{ minRows: 2, maxRows: 5 }}
                                                            placeholder={translate("adminPages.settings.appearanceSettingsPage.addABriefBrandIntroductionOrProductDescription")}
                                                            onChange={(event) => setAuthHeroDescription(event.target.value)}
                                                        />
                                                    </Form.Item>
                                                </Form>
                                                <div className="admin-appearance-media-list">
                                                    <div className="admin-appearance-video-autoplay-option">
                                                        <span className="admin-appearance-video-autoplay-copy">
                                                            <strong>{translate("adminPages.settings.appearanceSettingsPage.autoplayLoginPageVideo")}</strong>
                                                            <small>{translate("adminPages.settings.appearanceSettingsPage.enabledByDefaultWithMutedLoopingPlaybackVisitorsReducedMotion")}</small>
                                                        </span>
                                                        <span className="admin-appearance-video-autoplay-control">
                                                            <span>{authVideoAutoplay ? translate("adminPages.settings.appearanceSettingsPage.enabled") : translate("adminPages.settings.appearanceSettingsPage.disabled")}</span>
                                                            <Switch checked={authVideoAutoplay} disabled={saving || refreshing || restoring} aria-label={translate("adminPages.settings.appearanceSettingsPage.autoplayLoginPageVideo")} onChange={setAuthVideoAutoplay} />
                                                        </span>
                                                    </div>
                                                    <AssetPicker
                                                        slot="video"
                                                        title={translate("adminPages.settings.appearanceSettingsPage.brandVideo")}
                                                        description={translate("adminPages.settings.appearanceSettingsPage.mP4OrWebMUpTo256MBServerRuntimeUpload")}
                                                        configured={Boolean(setting.authVideoResourceId) && !resets.video}
                                                        file={files.video}
                                                        inputRef={inputRefs.video}
                                                        onSelect={selectFile}
                                                        onReset={resetAsset}
                                                        disabled={saving || refreshing || restoring}
                                                    />
                                                    <AssetPicker
                                                        slot="poster"
                                                        title={translate("adminPages.settings.appearanceSettingsPage.videoPosterOptional")}
                                                        description={translate("adminPages.settings.appearanceSettingsPage.customVideosWithoutAPosterUseANeutralBackgroundInstead")}
                                                        configured={Boolean(setting.authVideoPosterResourceId) && !resets.poster}
                                                        file={files.poster}
                                                        inputRef={inputRefs.poster}
                                                        onSelect={selectFile}
                                                        onReset={resetAsset}
                                                        disabled={saving || refreshing || restoring}
                                                    />
                                                </div>
                                            </div>
                                            <div className="admin-appearance-preview" aria-label={translate("adminPages.settings.appearanceSettingsPage.liveLoginPagePreview")}>
                                                <div className="admin-appearance-preview-heading">
                                                    <div>
                                                        <span>{translate("adminPages.settings.appearanceSettingsPage.liveLoginPagePreview")}</span>
                                                        <strong>{brandName.trim() || translate("adminPages.settings.appearanceSettingsPage.unnamedBrand")}</strong>
                                                    </div>
                                                    <AdminStatusBadge label={dirty ? translate("account.settings.prompts.unsaved") : translate("adminPages.settings.appearanceSettingsPage.liveVersion")} tone={dirty ? "warning" : "success"} />
                                                </div>
                                                <div className="admin-appearance-preview-stage">
                                                    <video key={`${previews.video}-${authVideoAutoplay}`} src={previews.video} poster={previews.poster || undefined} muted loop playsInline autoPlay={authVideoAutoplay} preload="metadata" />
                                                    <span className="admin-appearance-preview-shade" />
                                                    <span className="admin-appearance-preview-brand">
                                                        <img src={previews.logoDark} alt="" />
                                                        <strong>{brandName.trim() || translate("adminPages.settings.appearanceSettingsPage.unnamedBrand")}</strong>
                                                    </span>
                                                    <span className="admin-appearance-preview-copy">
                                                        <small>{(brandSlug.trim() || "brand-studio").replace(/-+/g, " ").toLocaleUpperCase()}</small>
                                                        <strong>{normalizeDraftCopy(authHeroTitle) || translate("adminPages.settings.appearanceSettingsPage.pleaseEnterALoginPageHeading")}</strong>
                                                        {normalizeDraftCopy(authHeroDescription) ? <span>{normalizeDraftCopy(authHeroDescription)}</span> : null}
                                                    </span>
                                                </div>
                                                <p>{translate("adminPages.settings.appearanceSettingsPage.thePreviewUsesTheSameTextAndMediaAsThe")}</p>
                                            </div>
                                        </div>
                                    </SettingsSectionCard>
                                ),
                            },
                            {
                                key: "welcome",
                                label: translate("adminPages.settings.appearanceSettingsPage.welcomePage"),
                                children: (
                                    <SettingsSectionCard className="admin-appearance-section" icon={<Globe2 className="size-4" aria-hidden="true" />} title={translate("adminPages.settings.appearanceSettingsPage.welcomePage")} description={translate("adminPages.settings.appearanceSettingsPage.controlWhetherVisitorsCanAccessTheWelcomePageChangesAre")}>
                                        <div className="admin-appearance-section-form">
                                            <WelcomeSetting />
                                        </div>
                                    </SettingsSectionCard>
                                ),
                            },
                            {
                                key: "seo",
                                label: translate("adminPages.settings.appearanceSettingsPage.sEOMetadata"),
                                children: (
                                    <SettingsSectionCard
                                        className="admin-appearance-section"
                                        icon={<Search className="size-4" aria-hidden="true" />}
                                        title={translate("adminPages.settings.appearanceSettingsPage.sEOMetadata")}
                                        description={translate("adminPages.settings.appearanceSettingsPage.setTheBrowserTitleSearchDescriptionAndKeywordsWhenLeft")}
                                        status={<AdminStatusBadge label={seoTitle || seoDescription || seoKeywords ? translate("adminPages.settings.appearanceSettingsPage.customized") : translate("adminPages.settings.appearanceSettingsPage.followBrandAutomatically")} tone={seoTitle || seoDescription || seoKeywords ? "success" : "neutral"} />}
                                    >
                                        <Form className="admin-appearance-form admin-appearance-section-form" layout="vertical" requiredMark={false} disabled={saving || refreshing || restoring}>
                                            <div className="admin-appearance-form-grid">
                                                <Form.Item label={translate("adminPages.settings.appearanceSettingsPage.sEOTitle")} extra={translate("adminPages.settings.appearanceSettingsPage.brieflyDescribeTheSiteSPurposeLeaveBlankToUse")}>
                                                    <Input value={seoTitle} maxLength={70} showCount placeholder={draftBrandName} onChange={(event) => setSeoTitle(event.target.value)} />
                                                </Form.Item>
                                                <Form.Item label={translate("adminPages.settings.appearanceSettingsPage.sEOKeywords")} extra={translate("adminPages.settings.appearanceSettingsPage.separateWithCommasGoogleDoesNotUseThisTagFor")}>
                                                    <Input value={seoKeywords} maxLength={300} showCount placeholder={translate("adminPages.settings.appearanceSettingsPage.aIFilmmakingAIShortDramasCreativeWorkspace")} onChange={(event) => setSeoKeywords(event.target.value)} />
                                                </Form.Item>
                                            </div>
                                            <Form.Item label={translate("adminPages.settings.appearanceSettingsPage.sEODescription")} extra={translate("adminPages.settings.appearanceSettingsPage.accuratelySummarizeTheSiteInOneOrTwoSentencesWithout")}>
                                                <Input.TextArea
                                                    value={seoDescription}
                                                    maxLength={200}
                                                    showCount
                                                    autoSize={{ minRows: 3, maxRows: 5 }}
                                                    placeholder={translate("adminPages.settings.appearanceSettingsPage.aWorkspaceForAIFilmmakingAndShortDramaCreation", { v0: String(draftBrandName) })}
                                                    onChange={(event) => setSeoDescription(event.target.value)}
                                                />
                                            </Form.Item>
                                        </Form>
                                    </SettingsSectionCard>
                                ),
                            },
                            {
                                key: "footer",
                                label: translate("adminPages.settings.appearanceSettingsPage.footerAndICPRegistration"),
                                children: (
                                    <SettingsSectionCard
                                        className="admin-appearance-section"
                                        icon={<Globe2 className="size-4" aria-hidden="true" />}
                                        title={translate("adminPages.settings.appearanceSettingsPage.homepageFooterAndICPRegistration")}
                                        description={translate("adminPages.settings.appearanceSettingsPage.setCopyrightAndICPRegistrationInformationAtTheBottomOf")}
                                        status={<AdminStatusBadge label={icpFilingEnabled ? translate("adminPages.settings.appearanceSettingsPage.showICPRegistrationNumber") : translate("adminPages.settings.appearanceSettingsPage.iCPRegistrationNumberHidden")} tone={icpFilingEnabled ? "success" : "neutral"} />}
                                    >
                                        <div className="admin-appearance-section-form admin-appearance-footer-settings">
                                            <Form className="admin-appearance-form" layout="vertical" requiredMark={false} disabled={saving || refreshing || restoring}>
                                                <Form.Item label={translate("adminPages.settings.appearanceSettingsPage.copyrightNotice")} extra={translate("adminPages.settings.appearanceSettingsPage.leaveBlankToUseTheCurrentYearAndSiteName")}>
                                                    <Input
                                                        prefix={<Copyright className="size-3.5" aria-hidden="true" />}
                                                        value={footerCopyright}
                                                        maxLength={160}
                                                        showCount
                                                        placeholder={`© ${new Date().getFullYear()} ${draftBrandName}. All rights reserved.`}
                                                        onChange={(event) => setFooterCopyright(event.target.value)}
                                                    />
                                                </Form.Item>
                                                <Form.Item label={translate("adminPages.settings.appearanceSettingsPage.iCPRegistrationNumber")} extra={translate("adminPages.settings.appearanceSettingsPage.enterARealICPRegistrationNumberSuchAsICPXXXXXXXX")}>
                                                    <Input value={icpFilingNumber} maxLength={64} showCount placeholder={translate("adminPages.settings.appearanceSettingsPage.forExampleICPXXXXXXXX")} onChange={(event) => setIcpFilingNumber(event.target.value)} />
                                                </Form.Item>
                                            </Form>
                                            <div className="admin-appearance-logo-frame-option">
                                                <div className="admin-appearance-logo-frame-copy">
                                                    <strong>{translate("adminPages.settings.appearanceSettingsPage.showICPRegistrationNumberInHomepageFooter")}</strong>
                                                    <p id="appearance-icp-help">{translate("adminPages.settings.appearanceSettingsPage.whenEnabledTheRegistrationNumberAppearsAtTheBottomOf")}</p>
                                                </div>
                                                <div className="admin-appearance-logo-frame-control">
                                                    <span>{icpFilingEnabled ? translate("adminPages.settings.appearanceSettingsPage.shown") : translate("adminPages.settings.appearanceSettingsPage.hidden")}</span>
                                                    <Switch checked={icpFilingEnabled} disabled={saving || refreshing || restoring} aria-label={translate("adminPages.settings.appearanceSettingsPage.showICPRegistrationNumberInHomepageFooter")} aria-describedby="appearance-icp-help" onChange={setIcpFilingEnabled} />
                                                </div>
                                            </div>
                                        </div>
                                    </SettingsSectionCard>
                                ),
                            },
                            {
                                key: "skins",
                                label: translate("adminPages.settings.appearanceSettingsPage.themes"),
                                children: (
                                    <SettingsSectionCard
                                        className="admin-appearance-section"
                                        icon={<Type className="size-4" aria-hidden="true" />}
                                        title={translate("adminPages.settings.appearanceSettingsPage.themes")}
                                        description={translate("adminPages.settings.appearanceSettingsPage.classicBlackAndWhiteUsesMonochromeBackgroundsAndPurpleBlue")}
                                        status={<AdminStatusBadge label={skinDisplayName(selectedSkin)} tone="info" />}
                                    >
                                        <SkinThemeEditor
                                            themes={skinThemes}
                                            selectedID={skinId}
                                            disabled={saving || refreshing || restoring}
                                            onSelect={setSkinId}
                                            onCreate={() => duplicateSkin("classic")}
                                            onDuplicate={duplicateSkin}
                                            onDelete={deleteSkin}
                                            onChange={changeSkin}
                                        />
                                    </SettingsSectionCard>
                                ),
                            },
                            { key: "canvas", label: translate("adminPages.settings.appearanceSettingsPage.canvasSettings"), children: <CanvasAppearanceEditor value={canvas} onChange={setCanvas} disabled={saving || refreshing || restoring || canvasUploading} onUploading={setCanvasUploading} /> },
                            { key: "updates", label: translate("account.layout.changelog.announcements"), children: <UpdateAnnouncementEditor value={updates} onChange={setUpdates} disabled={saving || refreshing || restoring || canvasUploading} onUploading={setCanvasUploading} /> },
                        ]}
                    />
                </div>
            )}
        </AdminPageFrame>
    );
}
