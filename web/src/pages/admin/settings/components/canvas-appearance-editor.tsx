import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Form, Input, InputNumber, Radio, Select } from "antd";
import { ExternalLink, Upload } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Live2DAvatar } from "@/components/canvas/live2d-avatar";
import { FluidOrb } from "@/components/ui/fluid-orb";
import {
    AGENT_AVATAR_STATES,
    DEFAULT_AGENT_AVATAR_CLIP_STATES,
    agentAvatarClipForState,
    agentCopy,
    isAgentAvatarBundleManifest,
    suggestedAgentAvatarClipStates,
    type AgentAvatarBundleManifest,
    type AgentAvatarState,
    type CanvasAppearance,
} from "@/lib/canvas/agent-appearance";
import { agentAvatarBundleFileURL, live2DModelURL, uploadAgentAvatarBundle, uploadLive2D } from "@/services/api/appearance";
import { AgentAvatarVideo } from "@/components/canvas/agent-avatar-video";
import { translate } from "@/i18n";

export function CanvasAppearanceEditor({ value, onChange, disabled, onUploading }: { value: CanvasAppearance; onChange: (value: CanvasAppearance) => void; disabled: boolean; onUploading: (value: boolean) => void }) {
    const { message } = App.useApp();
    const reducedMotion = useReducedMotion() ?? false;
    const input = useRef<HTMLInputElement>(null);
    const bundleInput = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [readyURL, setReadyURL] = useState("");
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const [bundleManifest, setBundleManifest] = useState<AgentAvatarBundleManifest | null>(null);
    const [bundleLoading, setBundleLoading] = useState(false);
    const [bundleError, setBundleError] = useState("");
    const [selectedAvatarState, setSelectedAvatarState] = useState<AgentAvatarState>("idle");
    const url = value.live2dResourceId ? live2DModelURL(value.live2dResourceId, value.live2dEntry, true) : "";
    const bundleID = value.avatarBundleResourceId;
    const bundleManifestURL = bundleID ? agentAvatarBundleFileURL(bundleID, "avatar.json", true) : "/doll/avatar.json";
    const previewClip = bundleManifest ? agentAvatarClipForState(value, selectedAvatarState, bundleManifest) : "";
    const previewFile = bundleManifest?.clips[previewClip] || "";
    const previewBundleURL = previewFile ? (bundleID ? agentAvatarBundleFileURL(bundleID, previewFile, true) : `/doll/${encodeURIComponent(previewFile)}`) : "";
    const change = (patch: Partial<CanvasAppearance>) => onChange({ ...value, ...patch });
    useEffect(() => {
        if (value.avatarType !== "bundle") return;
        const controller = new AbortController();
        setBundleLoading(true);
        setBundleError("");
        setBundleManifest(null);
        void (async () => {
            try {
                const response = await fetch(bundleManifestURL, { credentials: "include", cache: "no-store", signal: controller.signal });
                if (!response.ok) throw new Error(translate("adminPages.settings.canvasAppearanceEditor.failedToLoadAnimationPackageHTTP", { v0: String(response.status) }));
                const manifest: unknown = await response.json();
                if (!isAgentAvatarBundleManifest(manifest)) throw new Error(translate("adminPages.settings.canvasAppearanceEditor.invalidAvatarJsonFormat"));
                setBundleManifest(manifest);
            } catch (cause) {
                if (!controller.signal.aborted) setBundleError(cause instanceof Error ? cause.message : translate("adminPages.settings.canvasAppearanceEditor.unableToLoadAgentAnimationPackage"));
            } finally {
                if (!controller.signal.aborted) setBundleLoading(false);
            }
        })();
        return () => controller.abort();
    }, [value.avatarType, bundleManifestURL, attempt]);
    async function upload(file?: File) {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".zip") || file.size > 128 * 1024 * 1024) {
            message.error(translate("adminPages.settings.canvasAppearanceEditor.pleaseSelectALive2DZIPNoLargerThan128MiB"));
            return;
        }
        setUploading(true);
        onUploading(true);
        setError("");
        try {
            const model = await uploadLive2D(file);
            setReadyURL("");
            change({ live2dResourceId: model.resourceId, live2dEntry: model.entry, avatarType: "orb" });
            message.success(translate("adminPages.settings.canvasAppearanceEditor.importCompletePreviewItSelectLive2DThenSaveAtThe"));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : translate("adminPages.settings.canvasAppearanceEditor.modelImportFailed"));
        } finally {
            setUploading(false);
            onUploading(false);
        }
    }
    async function uploadBundle(file?: File) {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".zip") || file.size > 128 * 1024 * 1024) {
            message.error(translate("adminPages.settings.canvasAppearanceEditor.pleaseSelectAnAgentAnimationZIPNoLargerThan128"));
            return;
        }
        setUploading(true);
        onUploading(true);
        setBundleError("");
        try {
            const bundle = await uploadAgentAvatarBundle(file);
            setBundleManifest(bundle.manifest);
            change({
                avatarType: "bundle",
                avatarBundleResourceId: bundle.resourceId,
                avatarClipStates: suggestedAgentAvatarClipStates(bundle.manifest),
            });
            setSelectedAvatarState("idle");
            message.success(translate("adminPages.settings.canvasAppearanceEditor.animationPackageImportedCheckTheStateMappingsThenSaveAt"));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : translate("adminPages.settings.canvasAppearanceEditor.agentAnimationPackageImportFailed"));
        } finally {
            setUploading(false);
            onUploading(false);
        }
    }
    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <div>
                <h3 className="mb-3 font-semibold">{translate("adminPages.settings.canvasAppearanceEditor.agentIdentityAndText")}</h3>
                <p className="mb-4 text-sm text-foreground/60">
                    {translate("adminPages.settings.canvasAppearanceEditor.independentOfSiteBrandingTheAssistantNameIsUsedIn")} {"{agentName}"} {translate("adminPages.settings.canvasAppearanceEditor.toReferenceTheNameToolPermissionsAreUnchanged")}
                </p>
                <Form layout="vertical" disabled={disabled || uploading}>
                    {(
                        [
                            ["agentName", translate("adminPages.settings.canvasAppearanceEditor.assistantName"), 24],
                            ["launcherLabel", translate("adminPages.settings.canvasAppearanceEditor.floatingEntryTextOptional"), 24],
                            ["panelTitle", translate("adminPages.settings.canvasAppearanceEditor.chatPanelTitle"), 40],
                            ["welcomeTitle", translate("adminPages.settings.canvasAppearanceEditor.welcomeHeading"), 100],
                            ["welcomeDescription", translate("adminPages.settings.canvasAppearanceEditor.welcomeDescription"), 200],
                            ["inputPlaceholder", translate("adminPages.settings.canvasAppearanceEditor.inputPlaceholder"), 160],
                        ] as const
                    ).map(([key, label, max]) => (
                        <Form.Item key={key} label={label}>
                            <Input value={value[key]} maxLength={max} showCount onChange={(event) => change({ [key]: event.target.value })} />
                        </Form.Item>
                    ))}
                </Form>
            </div>
            <div className="grid content-start gap-4">
                <h3 className="font-semibold">{translate("adminPages.settings.canvasAppearanceEditor.agentAvatar")}</h3>
                <Radio.Group
                    value={value.avatarType}
                    disabled={disabled || uploading}
                    options={[
                        { label: translate("adminPages.settings.canvasAppearanceEditor.defaultAnimatedOrb"), value: "orb" },
                        { label: "Live2D", value: "live2d", disabled: !url || readyURL !== url },
                        { label: translate("adminPages.settings.canvasAppearanceEditor.stateAnimationPackage"), value: "bundle" },
                    ]}
                    onChange={(event) => {
                        const type = event.target.value;
                        change(type === "bundle" ? { avatarType: type, avatarClipStates: value.avatarClipStates || DEFAULT_AGENT_AVATAR_CLIP_STATES } : { avatarType: type });
                    }}
                />
                {value.avatarType === "live2d" ? <p className="text-sm text-foreground/60">{translate("adminPages.settings.canvasAppearanceEditor.uploadAnAuthorizedCubism34RuntimeZIPWithOne")}</p> : null}
                {value.avatarType === "bundle" ? (
                    <div className="grid gap-3">
                        <input
                            ref={bundleInput}
                            type="file"
                            accept=".zip,application/zip"
                            className="hidden"
                            onChange={(event) => {
                                void uploadBundle(event.target.files?.[0]);
                                event.currentTarget.value = "";
                            }}
                        />
                        <div className="flex flex-wrap gap-2">
                            <Button icon={<Upload className="size-4" />} disabled={disabled || uploading} loading={uploading} onClick={() => bundleInput.current?.click()}>
                                {translate("adminPages.settings.canvasAppearanceEditor.importStateAnimationZIPUpTo128MiB")}
                            </Button>
                            {value.avatarBundleResourceId ? (
                                <Button
                                    disabled={disabled || uploading}
                                    onClick={() => {
                                        change({
                                            avatarType: "bundle",
                                            avatarBundleResourceId: "",
                                            avatarClipStates: DEFAULT_AGENT_AVATAR_CLIP_STATES,
                                        });
                                        setBundleError("");
                                    }}
                                >
                                    {translate("adminPages.settings.canvasAppearanceEditor.restoreBuiltInAnimationPackage")}
                                </Button>
                            ) : null}
                        </div>
                        <div className="grid gap-3 border-t border-border pt-3">
                            <Radio.Group
                                className="flex flex-wrap"
                                optionType="button"
                                value={selectedAvatarState}
                                disabled={disabled || uploading}
                                options={AGENT_AVATAR_STATES.map((item) => ({ label: item.label, value: item.id }))}
                                onChange={(event) => setSelectedAvatarState(event.target.value)}
                            />
                            <label className="grid gap-1 text-sm">
                                {translate("adminPages.settings.canvasAppearanceEditor.stateAnimation", { state: AGENT_AVATAR_STATES.find((item) => item.id === selectedAvatarState)?.label ?? "" })}
                                <Select
                                    aria-label={translate("adminPages.settings.canvasAppearanceEditor.currentStateAnimation")}
                                    value={previewClip || undefined}
                                    disabled={disabled || uploading || !bundleManifest}
                                    loading={bundleLoading}
                                    options={Object.entries(bundleManifest?.clips ?? {}).map(([clip, file]) => ({ label: `${clip} · ${file}`, value: clip }))}
                                    onChange={(clip) =>
                                        change({
                                            avatarType: "bundle",
                                            avatarClipStates: { ...value.avatarClipStates, [selectedAvatarState]: clip },
                                        })
                                    }
                                />
                            </label>
                        </div>
                        {bundleManifest ? (
                            <p className="text-xs text-foreground/60">
                                {Object.keys(bundleManifest.clips).length} {translate("adminPages.settings.canvasAppearanceEditor.animations")} {bundleManifest.width} × {bundleManifest.height}
                            </p>
                        ) : null}
                        {bundleError ? (
                            <Alert
                                type="warning"
                                showIcon
                                title={translate("adminPages.settings.canvasAppearanceEditor.failedToPreviewAnimationPackage")}
                                description={bundleError}
                                action={
                                    <Button size="small" onClick={() => setAttempt((current) => current + 1)}>
                                        {translate("common.retry")}
                                    </Button>
                                }
                            />
                        ) : null}
                    </div>
                ) : null}

                <div className="grid gap-2 text-sm">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="text-foreground/60">{translate("adminPages.settings.canvasAppearanceEditor.references")}</span>
                        <a href="https://www.live2d.com/en/learn/sample/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                            {translate("adminPages.settings.canvasAppearanceEditor.officialSampleModels")}
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">{translate("adminPages.settings.canvasAppearanceEditor.opensInANewTab")}</span>
                        </a>
                        <a href="https://docs.live2d.com/en/cubism-sdk-manual/cubism-sdk-for-web/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                            {translate("adminPages.settings.canvasAppearanceEditor.cubismWebSDKDocumentation")}
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">{translate("adminPages.settings.canvasAppearanceEditor.opensInANewTab")}</span>
                        </a>
                    </div>
                    <p className="text-xs text-foreground/60">{translate("adminPages.settings.canvasAppearanceEditor.checkTheAssetLicenseBeforeDownloadingRepackageOfficialDownloadsAs")}</p>
                </div>
                <input
                    ref={input}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(event) => {
                        void upload(event.target.files?.[0]);
                        event.currentTarget.value = "";
                    }}
                />
                <div className="flex flex-wrap gap-2">
                    <Button icon={<Upload className="size-4" />} loading={uploading} disabled={disabled} onClick={() => input.current?.click()}>
                        {translate("adminPages.settings.canvasAppearanceEditor.importLive2DModelUpTo128MiB")}
                    </Button>
                    {url ? (
                        <Button
                            disabled={disabled || uploading}
                            onClick={() => {
                                change({ avatarType: "orb", live2dResourceId: "", live2dEntry: "" });
                                setError("");
                            }}
                        >
                            {translate("adminPages.settings.canvasAppearanceEditor.removeModelReference")}
                        </Button>
                    ) : null}
                </div>
                <label className="flex items-center gap-3 text-sm">
                    {translate("adminPages.settings.canvasAppearanceEditor.avatarHeight")}
                    <InputNumber
                        aria-label={translate("adminPages.settings.canvasAppearanceEditor.avatarHeight")}
                        min={120}
                        max={360}
                        value={value.avatarHeight}
                        disabled={disabled || uploading}
                        onChange={(height) => height !== null && change({ avatarHeight: height })}
                    />
                    px
                </label>
                <div className="grid justify-items-center gap-3 rounded-xl border border-border bg-background p-5" aria-label={translate("adminPages.settings.canvasAppearanceEditor.agentAvatarPreview")}>
                    {url ? (
                        <Live2DAvatar
                            key={`${url}-${attempt}`}
                            url={url}
                            width={Math.round(value.avatarHeight * 0.75)}
                            height={value.avatarHeight}
                            reducedMotion={reducedMotion}
                            fallback={<FluidOrb size={60} color="#7164f6" />}
                            // 预览期间由预览框独占 Live2D 渲染，悬浮入口临时显示默认球。
                            renderPriority={1}
                            onReady={() => {
                                setReadyURL(url);
                                setError("");
                            }}
                            onError={(reason) => {
                                setReadyURL("");
                                setError(reason);
                            }}
                        />
                    ) : value.avatarType === "bundle" && previewBundleURL && bundleManifest ? (
                        <div
                            className="relative mx-auto overflow-hidden"
                            style={{
                                width: Math.round(bundleManifest.width * Math.min(1, 220 / Math.max(bundleManifest.width, bundleManifest.height))),
                                height: Math.round(bundleManifest.height * Math.min(1, 220 / Math.max(bundleManifest.width, bundleManifest.height))),
                            }}
                        >
                            <AgentAvatarVideo src={previewBundleURL} loop={!["completed", "failed"].includes(selectedAvatarState)} />
                        </div>
                    ) : (
                        <FluidOrb size={60} color="#7164f6" />
                    )}
                    <strong>{agentCopy(value.welcomeTitle, value.agentName)}</strong>
                    <p className="text-sm text-foreground/60">{agentCopy(value.welcomeDescription, value.agentName)}</p>
                    {url ? <small>{readyURL === url ? translate("adminPages.settings.canvasAppearanceEditor.previewReadySelectLive2DAndSaveToEnableIt") : translate("adminPages.settings.canvasAppearanceEditor.waitingForModelPreview")}</small> : null}
                </div>
                {error ? (
                    <Alert
                        type="warning"
                        showIcon
                        title={translate("adminPages.settings.canvasAppearanceEditor.live2DIsCurrentlyUnavailable")}
                        description={error}
                        action={
                            <Button
                                size="small"
                                onClick={() => {
                                    setError("");
                                    setAttempt((n) => n + 1);
                                }}
                            >
                                {translate("common.retry")}
                            </Button>
                        }
                    />
                ) : null}
                <p className="text-xs text-foreground/60">{translate("adminPages.settings.canvasAppearanceEditor.cubismCoreIsIncludedNoAdditionalInstallationIsRequiredCheck")}</p>
            </div>
        </div>
    );
}
