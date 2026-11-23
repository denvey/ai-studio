// 创作页消息流：用户消息、媒体结果、生成中占位、引用素材与预览。

import { conversationTimeFormatter, type CreationMessage } from "./creation-types";
import { creationMessageNeedsResultSync } from "./creation-conversations";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { AlertCircle, AlertTriangle, CircleStop, CloudOff, Copy, Download, FileText, Film, Image as ImageIcon, ImageOff, Maximize2, Music2, Pencil, RefreshCw, RotateCcw, UserRound, X, type LucideIcon, Blocks, Orbit } from "lucide-react";
import { GenerationToolCard, type GenerationToolStatus } from "@/components/ai/generation-tool-card";
import { GenerationPhaseSteps } from "@/components/ai/generation-phase-steps";
import { MessageReasoning } from "@/components/ai/message-reasoning";
import { AIMessageMarkdown } from "@/components/ai/ai-message-markdown";
import { WorkingDots } from "@/components/ai/working-indicator";
import { UserAvatar } from "@/components/layout/user-avatar";
import { generationErrorMessage } from "@/lib/generation-error";
import { isGenerationCostUncertainError } from "@/lib/canvas/canvas-generation-batch";
import { generationPhaseHint, generationPhaseLabel, generationPhaseStep, generationTaskPhase, generationTaskSavingState, generationTaskShowsProgress, type GenerationPhase } from "@/lib/generation-task-display";
import { useTaskElapsed } from "@/hooks/use-task-elapsed";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useCopyText } from "@/hooks/use-copy-text";
import { type CreationReference, displayCreationPrompt } from "./creation-references";
import { useUserStore } from "@/stores/use-user-store";
import { type CreationAttachment, creationAttachmentKind, creationMediaAspectRatio, type CreationMode } from "./creation-assets";
import { getResourceAccess, resolveResourceAccessURL, resolveResourceUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useAssetStore, type Asset, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import { creationResultAssetIds, creationResultStorageKeys } from "@/lib/canvas/canvas-asset-handoff";
import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";
import { Button } from "antd";
import { CanvasImagePreview } from "@/components/canvas/canvas-image-preview";
import { AppModal } from "@/components/ui/product/app-modal";
import { creationResultEntries } from "./creation-result-urls";
import { translate } from "@/i18n";

export function CreationMessageView({
    item,
    shotNumber,
    onRetryFailure,
    onRefreshResult,
    onRecoverMedia,
    refreshingResult = false,
    onCreateVariant,
    onEditUserMessage,
    onContinueCanvas,
    openingCanvas,
}: {
    item: CreationMessage;
    shotNumber: number;
    onRetryFailure: () => void;
    onRefreshResult: () => void;
    onRecoverMedia: () => void;
    refreshingResult?: boolean;
    onCreateVariant: () => void;
    onEditUserMessage: (text: string) => void;
    onContinueCanvas: (ids?: string[]) => void;
    openingCanvas: boolean;
}) {
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    if (item.role === "user") return <CreationUserMessage item={item} shotNumber={shotNumber} onEditUserMessage={onEditUserMessage} />;
    const mode = item.mode || "text";
    const messageState = creationMessageState(item);
    const stateChip = messageState ? (
        <span className={`creation-message-state is-${messageState.tone}`}>
            {messageState.tone === "pending" || messageState.tone === "syncing" ? <i aria-hidden="true" /> : null}
            {messageState.label}
        </span>
    ) : null;
    const heading =
        mode !== "text" ? (
            <>
                {shotNumber > 0 ? <span className="creation-shot-badge">{translate("shared.create.creationWorkspaceMessages.shotLabel", { shot: shotNumber })}</span> : null}
                <span className="creation-message-mark">
                    <Orbit />
                </span>
                <strong>{mode === "image" ? translate("create.message.imageGeneration") : translate("nav.sidebar.toolboxVideo")}</strong>
                {item.status === "done" ? <span className="creation-message-progress-copy">{translate(mode === "video" ? "shared.create.creationWorkspaceMessages.videoCreated" : "shared.create.creationWorkspaceMessages.imageCreated")}</span> : null}
                {item.status === "done" ? (
                    <button type="button" className="creation-message-variant-action" onClick={onCreateVariant}>
                        <RefreshCw />
                        {translate("shared.create.creationWorkspaceMessages.generateSimilar")}
                    </button>
                ) : null}
                {item.createdAt ? <time dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time> : null}
                {stateChip}
            </>
        ) : (
            <>
                {shotNumber > 0 ? <span className="creation-shot-badge">{translate("shared.create.creationWorkspaceMessages.shotLabel", { shot: shotNumber })}</span> : null}
                <span className="creation-message-mark">
                    <Orbit />
                </span>
                <strong>{brandName}</strong>
                {item.createdAt ? <time dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time> : null}
                {stateChip}
            </>
        );
    const toolStatus: GenerationToolStatus = item.status === "pending" ? "running" : item.status === "error" ? "error" : item.status === "cancelled" ? "cancelled" : "completed";
    return (
        <article className={`creation-assistant-message is-${mode}`}>
            {mode === "text" ? (
                <>
                    <div className="creation-message-heading">{heading}</div>
                    {item.reasoning ? (
                        <div className="creation-message-reasoning-wrap">
                            <MessageReasoning reasoning={item.reasoning} isStreaming={item.status === "streaming"} />
                        </div>
                    ) : null}
                    <div className="creation-message-content">
                        {item.content ? (
                            <AIMessageMarkdown isStreaming={item.status === "streaming"}>{item.content}</AIMessageMarkdown>
                        ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                <WorkingDots dotSize={5} gap={2} />
                                <span>{translate("shared.create.creationWorkspaceMessages.generating")}</span>
                            </span>
                        )}
                    </div>
                    {item.syncInterrupted && (item.status === "pending" || item.status === "streaming") ? (
                        <div className="creation-message-content">
                            <CreationSyncNotice refreshing={refreshingResult} onRefresh={onRefreshResult} onRetry={onRetryFailure} />
                        </div>
                    ) : null}
                </>
            ) : (
                <GenerationToolCard status={toolStatus} heading={heading}>
                    <MediaResult
                        item={item}
                        onRetryFailure={onRetryFailure}
                        onRefreshResult={onRefreshResult}
                        onRecoverMedia={onRecoverMedia}
                        refreshingResult={refreshingResult}
                        onCreateVariant={onCreateVariant}
                        onContinueCanvas={onContinueCanvas}
                        openingCanvas={openingCanvas}
                    />
                </GenerationToolCard>
            )}
            {item.error && mode === "text" ? (
                <div className="creation-message-error">
                    <span>{generationErrorMessage(item.error)}</span>
                    <button type="button" onClick={onRetryFailure}>
                        <RefreshCw />
                        {translate("shared.create.creationWorkspaceMessages.regenerate")}
                    </button>
                </div>
            ) : null}
        </article>
    );
}

type CreationMessageStateTone = "pending" | "syncing" | "sync" | "error" | "cancelled";

// 消息头部的状态标签：区分“生成中 / 重新连接中 / 结果待同步 / 生成失败 / 已停止”，不把页面没跟上说成生成失败。
function creationMessageState(item: CreationMessage): { tone: CreationMessageStateTone; label: string } | null {
    if (item.status === "pending" || item.status === "streaming")
        return item.syncInterrupted ? { tone: "syncing", label: translate("shared.create.creationWorkspaceMessages.reconnecting") } : item.status === "pending" ? { tone: "pending", label: translate("canvasB.mediaVersion.generating") } : null;
    if (item.status === "cancelled") return { tone: "cancelled", label: translate("create.status.stopped") };
    if (item.status === "error") {
        if (creationMessageNeedsResultSync(item)) return { tone: "sync", label: translate("shared.create.creationWorkspaceMessages.resultAwaitingSync") };
        if (item.mediaRecoverable) return { tone: "sync", label: translate("shared.create.creationWorkspaceMessages.saveIncomplete") };
        return isGenerationCostUncertainError(item.error) ? { tone: "sync", label: translate("shared.create.creationWorkspaceMessages.costAwaitingReconciliation") } : { tone: "error", label: translate("canvasPage.batches.generationFailed") };
    }
    return null;
}

function CreationSyncNotice({ refreshing, onRefresh, onRetry }: { refreshing: boolean; onRefresh: () => void; onRetry: () => void }) {
    return (
        <div className="creation-sync-notice" role="status">
            <span>
                <CloudOff aria-hidden="true" />
                {translate("shared.create.creationWorkspaceMessages.connectionInterruptedReconnectingAutomatically")}
            </span>
            <button type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing || undefined}>
                <RefreshCw aria-hidden="true" className={refreshing ? "animate-spin" : undefined} />
                {refreshing ? translate("shared.create.creationWorkspaceMessages.refreshing") : translate("shared.create.creationWorkspaceMessages.refreshNow")}
            </button>
            {/* 原任务一直拿不到（例如已在任务中心删除）时的出口；点击后会先确认再次扣费。 */}
            <button type="button" className="is-quiet" onClick={onRetry}>
                {translate("shared.create.creationWorkspaceMessages.regenerate")}
            </button>
        </div>
    );
}

export function CreationUserMessage({ item, shotNumber, onEditUserMessage }: { item: CreationMessage; shotNumber: number; onEditUserMessage: (text: string) => void }) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const copyText = useCopyText();
    const visiblePrompt = displayCreationPrompt(item.content, item.references || []);
    const user = useUserStore((state) => state.user);
    return (
        <article className="creation-user-message">
            <div className="creation-user-message-meta">
                {shotNumber > 0 ? <span className="creation-shot-badge">{translate("shared.create.creationWorkspaceMessages.shotLabel", { shot: shotNumber })}</span> : null}
                {item.createdAt ? <time dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time> : null}
                <strong>{user?.displayName || translate("account.settings.memory.actors.user")}</strong>
                {user ? (
                    <UserAvatar user={user} className="creation-user-avatar" />
                ) : (
                    <span className="creation-user-avatar">
                        <UserRound />
                    </span>
                )}
            </div>
            <div className="creation-user-message-copy-wrap">
                <p>{visiblePrompt}</p>
            </div>
            {item.references?.length ? <CreationMessageReferences references={item.references} /> : null}
            {item.attachments?.length ? (
                <div className="creation-user-message-attachments">
                    {item.attachments.map((attachment) => {
                        const kind = creationAttachmentKind(attachment);
                        const previewable = kind === "image" || kind === "video";
                        const url = attachment.previewUrl || ("dataUrl" in attachment ? attachment.dataUrl : attachment.url) || "";
                        const imageUrl = kind === "image" ? resolveResourceUrl(attachment.storageKey, url) : "";
                        const previewUrl = kind === "image" ? imageUrl : url;
                        return (
                            <button
                                key={attachment.id}
                                type="button"
                                className={!previewable ? "is-file" : undefined}
                                onClick={() => {
                                    if (!previewable) return;
                                    setPreviewType(kind === "video" ? "video" : "image");
                                    setPreviewUrl(kind === "video" ? attachment.url || "" : previewUrl);
                                }}
                                aria-label={
                                    previewable
                                        ? translate("shared.create.creationWorkspaceMessages.preview", { v0: String(attachment.name || translate("shared.create.creationWorkspaceMessages.attachment")) })
                                        : attachment.name || translate("shared.create.creationWorkspaceMessages.attachment")
                                }
                                disabled={previewable && !previewUrl}
                            >
                                {kind === "video" ? (
                                    <video src={attachment.url || ""} poster={url !== attachment.url ? url : undefined} muted playsInline preload="metadata" />
                                ) : kind === "image" ? (
                                    <CachedResourceImage storageKey={attachment.storageKey} src={imageUrl} alt={attachment.name || translate("shared.create.creationWorkspaceMessages.attachment")} width={44} height={44} loading="lazy" decoding="async" />
                                ) : kind === "audio" ? (
                                    <Music2 />
                                ) : (
                                    <FileText />
                                )}
                                {previewable ? (
                                    <span aria-hidden="true">
                                        <Maximize2 />
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
            <div className="creation-user-message-actions">
                <Tooltip title={translate("canvasA.artCritique.copyPrompt")}>
                    <button type="button" className="creation-user-message-copy" aria-label={translate("canvasA.artCritique.copyPrompt")} onClick={() => copyText(visiblePrompt, translate("shared.create.creationWorkspaceMessages.promptCopied"))}>
                        <Copy />
                    </button>
                </Tooltip>
                <Tooltip title={translate("shared.create.creationWorkspaceMessages.editAndResend")}>
                    <button type="button" className="creation-user-message-edit" aria-label={translate("shared.create.creationWorkspaceMessages.editPrompt")} onClick={() => onEditUserMessage(visiblePrompt)}>
                        <Pencil />
                    </button>
                </Tooltip>
            </div>
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </article>
    );
}

export function MediaResult({
    item,
    onRetryFailure,
    onRefreshResult,
    onRecoverMedia,
    refreshingResult = false,
    onCreateVariant,
    onContinueCanvas,
    openingCanvas,
}: {
    item: CreationMessage;
    onRetryFailure: () => void;
    onRefreshResult: () => void;
    onRecoverMedia: () => void;
    refreshingResult?: boolean;
    onCreateVariant: () => void;
    onContinueCanvas: (ids?: string[]) => void;
    openingCanvas: boolean;
}) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const assets = useAssetStore((state) => state.assets);
    const storedResultUrls = item.resultUrls || [];
    const resultStorageKeys = item.resultStorageKeys?.length ? item.resultStorageKeys : creationResultStorageKeys(assets, { messageId: item.id, taskIds: item.taskIds || [], resultUrls: storedResultUrls });
    // 展示地址按 storageKey 保存；effect 重跑（素材库更新、续签）时不回退到历史 hint。
    const [resolvedByKey, setResolvedByKey] = useState<Record<string, string>>({});
    const [failedByKey, setFailedByKey] = useState<Record<string, boolean>>({});

    useEffect(() => {
        let active = true;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const updateResultUrl = (storageKey: string, url: string) => {
            if (!active || !url) return;
            setResolvedByKey((current) => (current[storageKey] === url ? current : { ...current, [storageKey]: url }));
        };
        const refreshRemote = async (index: number, storageKey: string): Promise<void> => {
            try {
                const access = await getResourceAccess(storageKey, "display");
                if (!active) return;
                updateResultUrl(storageKey, resolveResourceAccessURL(access.url));
                const refreshAt = access.refreshAt ? new Date(access.refreshAt).getTime() : Number.NaN;
                const expiresAt = access.expiresAt ? new Date(access.expiresAt).getTime() : Number.NaN;
                const nextRefreshAt = Number.isFinite(refreshAt) ? refreshAt : expiresAt;
                const delay = Number.isFinite(nextRefreshAt) ? Math.max(10_000, nextRefreshAt - Date.now()) : 4 * 60_000;
                timers.push(setTimeout(() => void refreshRemote(index, storageKey), delay));
            } catch {
                if (!active) return;
                setFailedByKey((current) => (current[storageKey] ? current : { ...current, [storageKey]: true }));
                timers.push(setTimeout(() => void refreshRemote(index, storageKey), 60_000));
            }
        };
        if (!resultStorageKeys.length) {
            return () => {
                active = false;
            };
        }
        // 历史记录只把 URL 当作短期 hint；真正恢复依赖稳定 storageKey，展示 URL 由访问缓存按需续签。
        const resolver = item.mode === "video" ? resolveMediaUrl : resolveImageUrl;
        void Promise.all(
            resultStorageKeys.map(async (storageKey, index) => {
                if (resourceIdFromStorageKey(storageKey)) {
                    await refreshRemote(index, storageKey);
                    return;
                }
                const url = await resolver(storageKey, storedResultUrls[index] || "");
                updateResultUrl(storageKey, url);
            }),
        ).catch(() => {
            // 保留当前页面已有的 URL hint；若已过期，页面会走明确的媒体空态而不是回退到平台正文代理。
        });
        return () => {
            active = false;
            timers.forEach((timer) => clearTimeout(timer));
        };
    }, [item.id, item.mode, resultStorageKeys.join("|"), storedResultUrls.join("|")]);

    const isVideo = item.mode === "video";
    // 每个结果的加载状态与重试次数按 storageKey 记录；重试会换一个元素重新请求，并强制续签访问地址。
    const [mediaStates, setMediaStates] = useState<Record<string, "loaded" | "error">>({});
    const [mediaAttempts, setMediaAttempts] = useState<Record<string, number>>({});
    const [naturalRatios, setNaturalRatios] = useState<Record<string, number>>({});
    const markResultMedia = (key: string, state: "loaded" | "error") => setMediaStates((current) => (current[key] === state ? current : { ...current, [key]: state }));
    const retryResultMedia = (key: string) => {
        setMediaStates(({ [key]: _failed, ...rest }) => rest);
        setMediaAttempts((current) => ({ ...current, [key]: (current[key] || 0) + 1 }));
        if (!resourceIdFromStorageKey(key)) return;
        void getResourceAccess(key, "display", "original", "", { forceRefresh: true })
            .then((access) => setResolvedByKey((current) => ({ ...current, [key]: resolveResourceAccessURL(access.url) })))
            .catch(() => markResultMedia(key, "error"));
    };
    const fallbackRatio = creationAspectRatioValue(creationMediaAspectRatio(item.settings?.ratio, item.mode || "image"));
    const { entries: resultEntries, resolving } = creationResultEntries({ storageKeys: resultStorageKeys, storedUrls: storedResultUrls, resolvedByKey, failedByKey, isVideo, isRemoteKey: (storageKey) => Boolean(resourceIdFromStorageKey(storageKey)) });
    const alignedResultUrls = resultStorageKeys.length ? resultStorageKeys.map((storageKey) => resultEntries.find((entry) => entry.key === storageKey)?.url || "") : resultEntries.map((entry) => entry.url);
    const displayResultUrls = resultEntries.map((entry) => entry.url);
    const resultAssetIds = alignedResultUrls.length || resultStorageKeys.length ? creationResultAssetIds(assets, { messageId: item.id, taskIds: item.taskIds || [], resultUrls: alignedResultUrls, resultStorageKeys }) : [];
    const expectedResultCount = resultStorageKeys.length || alignedResultUrls.length;
    const canContinueWithResults = expectedResultCount > 0 && resultAssetIds.length === expectedResultCount;
    if (item.status === "pending") return <CreationMediaPending item={item} refreshing={refreshingResult} onRefresh={onRefreshResult} onRetry={onRetryFailure} />;
    if ((item.status === "error" || item.status === "cancelled") && !expectedResultCount) return <CreationMediaFailure item={item} refreshing={refreshingResult} onRefresh={onRefreshResult} onRecoverMedia={onRecoverMedia} onRetry={onRetryFailure} />;
    // 远端结果首次解析中不显示空态，避免先闪「没有返回可预览结果」再出现结果。
    if (!expectedResultCount || (!displayResultUrls.length && !resolving))
        return (
            <CreationMediaNotice
                tone="neutral"
                icon={ImageOff}
                title={translate("shared.create.creationWorkspaceMessages.noResultAvailableToPreviewYet")}
                description={item.taskIds?.length ? translate("shared.create.creationWorkspaceMessages.theResultMayStillBeLoadingOrItsLinkMay") : translate("shared.create.creationWorkspaceMessages.thisGenerationReturnedNoPreviewableContent")}
                actions={
                    item.taskIds?.length ? (
                        <>
                            <CreationNoticeButton primary icon={RefreshCw} busy={refreshingResult} busyLabel={translate("shared.create.creationWorkspaceMessages.fetching")} onClick={onRefreshResult}>
                                {translate("shared.create.creationWorkspaceMessages.fetchResultAgain")}
                            </CreationNoticeButton>
                            <CreationNoticeButton icon={RotateCcw} onClick={onRetryFailure}>
                                {translate("shared.create.creationWorkspaceMessages.regenerate")}
                            </CreationNoticeButton>
                        </>
                    ) : (
                        <CreationNoticeButton primary icon={RotateCcw} onClick={onRetryFailure}>
                            {translate("shared.create.creationWorkspaceMessages.regenerate")}
                        </CreationNoticeButton>
                    )
                }
            />
        );
    const videoKey = resultEntries[0]?.key || resultStorageKeys[0] || "video";
    const videoState = displayResultUrls[0] ? mediaStates[videoKey] || "loading" : "loading";
    // 远端地址还在解析的结果位先按同样尺寸占位，不让结果区塌成一行操作按钮。
    const pendingImageKeys = !isVideo && resolving ? resultStorageKeys.filter((storageKey) => !resultEntries.some((entry) => entry.key === storageKey)) : [];
    return (
        <div className="creation-media-result">
            {isVideo ? (
                <button
                    type="button"
                    className="creation-video-result"
                    data-media-state={videoState}
                    onClick={() => {
                        if (videoState === "error") return retryResultMedia(videoKey);
                        if (!displayResultUrls[0]) return;
                        setPreviewType("video");
                        setPreviewUrl(displayResultUrls[0]);
                    }}
                    aria-label={videoState === "error" ? translate("shared.create.creationWorkspaceMessages.videoFailedToLoadClickToReload") : translate("shared.create.creationWorkspaceMessages.previewGeneratedVideo")}
                >
                    {displayResultUrls[0] ? (
                        <video key={`${videoKey}:${mediaAttempts[videoKey] || 0}`} muted preload="metadata" src={displayResultUrls[0]} onLoadedMetadata={() => markResultMedia(videoKey, "loaded")} onError={() => markResultMedia(videoKey, "error")} />
                    ) : null}
                    {videoState === "error" ? <CreationResultMediaError label={translate("shared.create.creationWorkspaceMessages.videoFailedToLoadClickToRetry")} /> : null}
                    <span>
                        <Maximize2 />
                        {translate("shared.create.creationWorkspaceMessages.previewVideo")}
                    </span>
                </button>
            ) : (
                <div className="creation-image-result-grid">
                    {resultEntries.map(({ key, url }) => (
                        <button
                            key={key}
                            type="button"
                            className="creation-image-result"
                            data-media-state={mediaStates[key] || "loading"}
                            style={creationResultTileStyle(naturalRatios[key] || creationResultAssetRatio(assets, key) || fallbackRatio)}
                            onClick={() => {
                                if (mediaStates[key] === "error") return retryResultMedia(key);
                                if (mediaStates[key] !== "loaded") return;
                                setPreviewType("image");
                                setPreviewUrl(url);
                            }}
                            aria-label={
                                mediaStates[key] === "error"
                                    ? translate("shared.create.creationWorkspaceMessages.imageFailedToLoadClickToReload")
                                    : mediaStates[key] === "loaded"
                                      ? translate("shared.create.creationWorkspaceMessages.previewGeneratedImage")
                                      : translate("shared.create.creationWorkspaceMessages.loadingImage")
                            }
                            aria-busy={mediaStates[key] === "loaded" || mediaStates[key] === "error" ? undefined : true}
                        >
                            <img
                                key={`${key}:${mediaAttempts[key] || 0}`}
                                src={url}
                                alt={translate("library.tasks.detail.generated")}
                                decoding="async"
                                onLoad={(event) => {
                                    const { naturalWidth, naturalHeight } = event.currentTarget;
                                    if (naturalWidth > 0 && naturalHeight > 0) setNaturalRatios((current) => (current[key] === naturalWidth / naturalHeight ? current : { ...current, [key]: naturalWidth / naturalHeight }));
                                    markResultMedia(key, "loaded");
                                }}
                                onError={() => markResultMedia(key, "error")}
                            />
                            {mediaStates[key] === "error" ? <CreationResultMediaError label={translate("shared.create.creationWorkspaceMessages.imageFailedToLoadClickToRetry")} /> : null}
                            <span>
                                <Maximize2 />
                            </span>
                        </button>
                    ))}
                    {pendingImageKeys.map((storageKey) => (
                        <i key={`pending:${storageKey}`} className="creation-image-result" data-media-state="loading" style={creationResultTileStyle(creationResultAssetRatio(assets, storageKey) || fallbackRatio)} aria-hidden="true" />
                    ))}
                </div>
            )}
            <div className="creation-media-actions">
                <span>{isVideo ? translate("shared.create.creationWorkspaceMessages.videoResult") : translate("shared.create.creationWorkspaceMessages.images", { v0: String(displayResultUrls.length) })}</span>
                <Button
                    type="link"
                    size="small"
                    loading={openingCanvas}
                    disabled={!canContinueWithResults}
                    title={canContinueWithResults ? undefined : translate("shared.create.creationWorkspaceMessages.theAssetMustFinishSavingBeforeItCanBeSent")}
                    onClick={() => onContinueCanvas(resultAssetIds)}
                >
                    {translate("shared.create.creationWorkspaceMessages.addToCanvas")}
                </Button>
                {displayResultUrls.map((url, index) => (
                    <a key={`download-${index}`} href={url} download>
                        {displayResultUrls.length > 1 ? (
                            translate("shared.create.creationWorkspaceMessages.download", { v0: String(index + 1) })
                        ) : (
                            <>
                                <Download />
                                {translate("canvasA.assetView.download")}
                            </>
                        )}
                    </a>
                ))}
            </div>
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </div>
    );
}

/**
 * 生成中卡片：按最终画面比例占位，标题跟随真实任务阶段（排队 / 生成 / 保存 / 载入），
 * 底部三段进度与耗时；页面与任务连接中断时给出“立即刷新”，不把等待中断说成失败。
 */
export function CreationMediaPending({ item, refreshing, onRefresh, onRetry }: { item: CreationMessage; refreshing: boolean; onRefresh: () => void; onRetry: () => void }) {
    const mode: CreationMode = item.mode || "image";
    const kind = mode === "video" ? "video" : "image";
    const phase: GenerationPhase = item.taskIds?.length ? generationTaskPhase({ status: item.generationStatus || "running", stage: item.generationStage, mediaStage: item.generationMediaStage }) : "submitting";
    const uncertain = phase === "uncertain";
    const progress =
        item.taskIds?.length &&
        typeof item.generationProgress === "number" &&
        generationTaskShowsProgress({ status: item.generationStatus || "running", stage: item.generationStage, mediaStage: item.generationMediaStage, progress: item.generationProgress })
            ? item.generationProgress
            : null;
    const elapsed = useTaskElapsed(item.createdAt);
    const hint = generationPhaseHint(phase, kind, item.generationStage);
    const aspectRatio = creationMediaAspectRatio(item.settings?.ratio, mode);
    const specs = creationPendingSpecs(item);
    const Icon = mode === "video" ? Film : ImageIcon;
    return (
        <div
            className={`creation-media-pending is-${mode}`}
            data-phase={phase}
            data-saving={phase === "saving" ? generationTaskSavingState(item.generationStage) : undefined}
            data-sync={item.syncInterrupted ? "interrupted" : undefined}
            style={{ aspectRatio, "--creation-media-ratio": creationAspectRatioValue(aspectRatio) } as CSSProperties}
        >
            <span className="creation-media-pending-surface" aria-hidden="true" />
            {specs ? (
                <span className="creation-media-pending-spec">
                    <Icon aria-hidden="true" />
                    {specs}
                </span>
            ) : null}
            <span className="creation-media-pending-body">
                <span className="creation-media-pending-title" role="status">
                    {generationPhaseLabel(phase, kind, item.generationStage)}
                </span>
                <span className="creation-media-pending-meta">{[progress !== null ? `${progress}%` : "", item.createdAt ? translate("shared.create.creationWorkspaceMessages.elapsed", { v0: String(elapsed) }) : ""].filter(Boolean).join(" · ")}</span>
                {hint ? <span className="creation-media-pending-hint">{hint}</span> : null}
            </span>
            <span className="creation-media-pending-foot">
                {item.syncInterrupted ? <CreationSyncNotice refreshing={refreshing} onRefresh={onRefresh} onRetry={onRetry} /> : uncertain ? null : <GenerationPhaseSteps step={generationPhaseStep(phase)} progress={progress} />}
            </span>
        </div>
    );
}

function creationAspectRatioValue(aspectRatio: string) {
    const [width, height] = aspectRatio.split("/").map((value) => Number(value.trim()));
    return width > 0 && height > 0 ? width / height : 1;
}

export function creationResultAssetRatio(assets: Asset[], storageKey: string) {
    const asset = assets.find((candidate): candidate is ImageAsset | VideoAsset => (candidate.kind === "image" || candidate.kind === "video") && candidate.data.storageKey === storageKey);
    return asset && asset.data.width > 0 && asset.data.height > 0 ? asset.data.width / asset.data.height : undefined;
}

// 结果图块按真实比例预留宽高：已知素材尺寸优先，其次生成时选的画面比例；竖图按最大高度收窄宽度。
function creationResultTileStyle(ratio: number): CSSProperties {
    return { aspectRatio: String(ratio), "--creation-result-ratio": ratio } as CSSProperties;
}

function CreationResultMediaError({ label }: { label: string }) {
    return (
        <em className="creation-result-media-error">
            <ImageOff aria-hidden="true" />
            {label}
        </em>
    );
}

function creationPendingSpecs(item: CreationMessage) {
    const settings = item.settings;
    if (!settings) return "";
    const ratio = settings.ratio && settings.ratio.toLowerCase() !== "auto" ? settings.ratio : "";
    if (item.mode === "video")
        return [ratio, settings.seconds ? translate("shared.create.creationWorkspaceMessages.s", { v0: String(settings.seconds) }) : "", settings.videoQuality ? `${settings.videoQuality.replace(/p$/i, "")}P` : ""].filter(Boolean).join(" · ");
    const count = Number(settings.count) || 1;
    return [ratio, count > 1 ? translate("shared.create.creationWorkspaceMessages.images2", { v0: String(count) }) : ""].filter(Boolean).join(" · ");
}

/**
 * 失败卡片按“下一步该做什么”分四类：
 * 作品可能已生成（页面没拿到结果）→ 重新获取；作品已生成但保存失败 → 重新保存；
 * 上游网关超时等费用不确定的失败 → 先核对再决定；后端确认失败 → 重新生成。
 */
function CreationMediaFailure({ item, refreshing, onRefresh, onRecoverMedia, onRetry }: { item: CreationMessage; refreshing: boolean; onRefresh: () => void; onRecoverMedia: () => void; onRetry: () => void }) {
    const reason = generationErrorMessage(item.error || translate("canvasPage.batches.generationFailed"));
    if (item.status === "cancelled") {
        return (
            <CreationMediaNotice
                tone="neutral"
                icon={CircleStop}
                title={translate("shared.create.creationWorkspaceMessages.generationStopped")}
                description={item.content && item.content !== "已停止" ? item.content : translate("shared.create.creationWorkspaceMessages.adjustTheSettingsAndGenerateAgain")}
                actions={
                    <CreationNoticeButton icon={RotateCcw} onClick={onRetry}>
                        {translate("shared.create.creationWorkspaceMessages.regenerate")}
                    </CreationNoticeButton>
                }
            />
        );
    }
    if (creationMessageNeedsResultSync(item)) {
        return (
            <CreationMediaNotice
                tone="warning"
                icon={CloudOff}
                title={translate("shared.create.creationWorkspaceMessages.resultNotSyncedYet")}
                description={translate("shared.create.creationWorkspaceMessages.yourWorkMayAlreadyBeGeneratedInTheBackgroundBut")}
                detail={reason ? translate("shared.create.creationWorkspaceMessages.reason", { v0: String(reason) }) : undefined}
                actions={
                    <>
                        <CreationNoticeButton primary icon={RefreshCw} busy={refreshing} busyLabel={translate("shared.create.creationWorkspaceMessages.fetching")} onClick={onRefresh}>
                            {translate("shared.create.creationWorkspaceMessages.fetchResultAgain")}
                        </CreationNoticeButton>
                        <CreationNoticeButton icon={RotateCcw} onClick={onRetry}>
                            {translate("shared.create.creationWorkspaceMessages.regenerate")}
                        </CreationNoticeButton>
                    </>
                }
            />
        );
    }
    if (item.mediaRecoverable) {
        return (
            <CreationMediaNotice
                tone="warning"
                icon={AlertTriangle}
                title={translate("shared.create.creationWorkspaceMessages.generatedButSavingIsIncomplete")}
                description={translate("shared.create.creationWorkspaceMessages.anErrorOccurredSavingToTheAssetLibrarySavingAgain")}
                detail={reason ? translate("shared.create.creationWorkspaceMessages.reason", { v0: String(reason) }) : undefined}
                actions={
                    <>
                        <CreationNoticeButton primary icon={RefreshCw} busy={refreshing} busyLabel={translate("shared.create.creationWorkspaceMessages.saving")} onClick={onRecoverMedia}>
                            {translate("shared.create.creationWorkspaceMessages.saveAgain")}
                        </CreationNoticeButton>
                        <CreationNoticeButton icon={RotateCcw} onClick={onRetry}>
                            {translate("shared.create.creationWorkspaceMessages.regenerate")}
                        </CreationNoticeButton>
                    </>
                }
            />
        );
    }
    // 524 这类失败是同步请求被网关截断：上游可能仍在出图并计费，原任务也没有可回查的上游任务 ID。
    // 不能像普通失败一样把“重新生成”放在主按钮，否则一次超时会被点成两笔费用。
    if (isGenerationCostUncertainError(item.error)) {
        return (
            <CreationMediaNotice
                tone="warning"
                icon={AlertTriangle}
                title={translate("shared.create.creationWorkspaceMessages.providerTimedOutChargesPendingReview")}
                description={translate("shared.create.creationWorkspaceMessages.thisRequestMayStillBeRunningWithTheProviderAnd")}
                detail={reason ? translate("shared.create.creationWorkspaceMessages.reason", { v0: String(reason) }) : undefined}
                actions={
                    <CreationNoticeButton icon={RotateCcw} onClick={onRetry}>
                        {translate("shared.create.creationWorkspaceMessages.regenerate")}
                    </CreationNoticeButton>
                }
            />
        );
    }
    const started = Boolean(item.taskIds?.length);
    return (
        <CreationMediaNotice
            tone="error"
            icon={AlertCircle}
            title={started ? translate("canvasPage.batches.generationFailed") : translate("shared.create.creationWorkspaceMessages.unableToStartGeneration")}
            description={reason}
            actions={
                <CreationNoticeButton primary icon={RotateCcw} onClick={onRetry}>
                    {started ? translate("shared.create.creationWorkspaceMessages.regenerate") : translate("shared.create.creationWorkspaceMessages.editAgain")}
                </CreationNoticeButton>
            }
        />
    );
}

function CreationMediaNotice({ tone, icon: Icon, title, description, detail, actions }: { tone: "warning" | "error" | "neutral"; icon: LucideIcon; title: string; description: string; detail?: string; actions: ReactNode }) {
    return (
        <div className={`creation-media-notice is-${tone}`}>
            <span className="creation-media-notice-icon" aria-hidden="true">
                <Icon />
            </span>
            <div className="creation-media-notice-copy">
                <strong>{title}</strong>
                <p>{description}</p>
                {detail ? <small>{detail}</small> : null}
            </div>
            <div className="creation-media-notice-actions">{actions}</div>
        </div>
    );
}

function CreationNoticeButton({ primary = false, icon: Icon, busy = false, busyLabel, onClick, children }: { primary?: boolean; icon: LucideIcon; busy?: boolean; busyLabel?: string; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" className={primary ? "is-primary" : undefined} onClick={onClick} disabled={busy} aria-busy={busy || undefined}>
            <Icon aria-hidden="true" className={busy ? "animate-spin" : undefined} />
            {busy && busyLabel ? busyLabel : children}
        </button>
    );
}

export function CreationMessageReferences({ references }: { references: CreationReference[] }) {
    return (
        <div className="creation-user-message-references" aria-label={translate("shared.create.creationWorkspaceMessages.thisReference")}>
            {references.map((reference) => {
                const Icon = reference.kind === "skill" ? Blocks : reference.kind === "image" ? ImageIcon : reference.kind === "video" ? Film : reference.kind === "audio" ? Music2 : FileText;
                const imageUrl = reference.kind === "image" ? resolveResourceUrl(reference.storageKey, reference.previewUrl) : reference.previewUrl;
                return (
                    <span key={reference.id} className="creation-user-message-reference">
                        {imageUrl && reference.kind === "video" ? (
                            <video src={imageUrl} muted playsInline preload="metadata" aria-label={reference.label} />
                        ) : imageUrl && reference.kind === "image" ? (
                            <CachedResourceImage storageKey={reference.storageKey} src={imageUrl} alt="" loading="lazy" decoding="async" />
                        ) : (
                            <Icon />
                        )}
                        <span>{reference.label}</span>
                    </span>
                );
            })}
        </div>
    );
}

export function CreationMediaPreviewModal({ url, type, onClose }: { url: string; type: "image" | "video"; onClose: () => void }) {
    if (type === "image") return <CanvasImagePreview src={url} alt={translate("shared.create.creationWorkspaceMessages.mediaPreview")} onClose={onClose} />;

    return (
        <AppModal flush open={Boolean(url)} title={null} footer={null} centered destroyOnHidden width="min(1160px, calc(100vw - 32px))" onCancel={onClose} className="creation-media-preview-modal">
            {url ? <video controls autoPlay className="creation-media-preview-video" src={url} /> : null}
        </AppModal>
    );
}

export function CreationAttachmentThumbnail({ item, onPreview, onRemove }: { item: CreationAttachment; onPreview: (type: "image" | "video", url: string) => void; onRemove: (id: string) => void }) {
    const kind = creationAttachmentKind(item);
    const previewable = kind === "image" || kind === "video";
    const url = (kind === "video" ? item.url : item.previewUrl) || "";
    const imageUrl = kind === "image" ? resolveResourceUrl(item.storageKey, item.previewUrl) : "";
    const previewUrl = kind === "image" ? imageUrl : url;
    const content =
        kind === "video" ? (
            <video src={item.url} poster={item.previewUrl !== item.url ? item.previewUrl : undefined} muted playsInline preload="metadata" aria-label={item.name} />
        ) : kind === "image" ? (
            <CachedResourceImage
                storageKey={item.storageKey}
                src={imageUrl}
                alt={item.name}
                loading="lazy"
                decoding="async"
                fallback={
                    <span className="creation-chat-file-icon">
                        <ImageIcon />
                    </span>
                }
            />
        ) : (
            <span className="creation-chat-file-icon">
                {kind === "audio" ? <Music2 /> : <FileText />}
                <em>{item.name}</em>
            </span>
        );
    return (
        <div className="creation-reference-card-content">
            {previewable ? (
                <button
                    type="button"
                    className="creation-reference-card-preview"
                    onClick={() => onPreview(kind === "video" ? "video" : "image", previewUrl)}
                    aria-label={translate("shared.create.creationWorkspaceMessages.enlargePreview", { v0: String(item.name) })}
                    disabled={!previewUrl}
                >
                    {content}
                    <span aria-hidden="true">
                        <Maximize2 />
                    </span>
                </button>
            ) : (
                <div className="creation-reference-card-preview is-file" aria-label={item.name}>
                    {content}
                </div>
            )}
            <button
                type="button"
                className="creation-reference-card-remove"
                onPointerDownCapture={(event) => event.stopPropagation()}
                onMouseDownCapture={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.stopPropagation();
                    onRemove(item.id);
                }}
                aria-label={translate("shared.create.creationWorkspaceMessages.remove", { v0: String(item.name) })}
            >
                <X />
            </button>
        </div>
    );
}

export type CreationThinking = { title: string; hint: string; steps: string[]; activity: string };

export function thinkingFor(mode: CreationMode, brandName: string): CreationThinking {
    if (mode === "image")
        return {
            title: translate("shared.create.creationWorkspaceMessages.drawingThisShotForYou"),
            hint: translate("shared.create.creationWorkspaceMessages.isInterpretingYourCompositionAndSendingItToTheImage", { v0: String(brandName) }),
            steps: [translate("shared.create.creationWorkspaceMessages.understandComposition"), translate("shared.create.creationWorkspaceMessages.setVisualStyle"), translate("shared.create.creationWorkspaceMessages.generateImage")],
            activity: translate("shared.create.creationWorkspaceMessages.analyzingTheCompositionAndSendingItToTheImageModel"),
        };
    if (mode === "text")
        return {
            title: translate("shared.create.creationWorkspaceMessages.writingThisPassageForYou"),
            hint: translate("shared.create.creationWorkspaceMessages.isOrganizingYourCreativeDirectionLanguageAndStructure", { v0: String(brandName) }),
            steps: [translate("shared.create.creationWorkspaceMessages.organizeContext"), translate("shared.create.creationWorkspaceMessages.composeText"), translate("shared.create.creationWorkspaceMessages.writePassage")],
            activity: translate("shared.create.creationWorkspaceMessages.organizingContextAndComposingTheText"),
        };
    return {
        title: translate("shared.create.creationWorkspaceMessages.creatingThisShotForYou"),
        hint: translate("shared.create.creationWorkspaceMessages.isBreakingDownYourShotScriptDesigningCameraMovementAnd", { v0: String(brandName) }),
        steps: [
            translate("shared.create.creationWorkspaceMessages.breakDownShots"),
            translate("shared.create.creationWorkspaceMessages.planCameraMovement"),
            translate("shared.create.creationWorkspaceMessages.setLighting"),
            translate("shared.create.creationWorkspaceMessages.renderVideo"),
        ],
        activity: translate("shared.create.creationWorkspaceMessages.planningShotsAndRenderingWithADirectorSApproach"),
    };
}

export function formatMessageTime(value: string) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? conversationTimeFormatter.format(timestamp) : "";
}
