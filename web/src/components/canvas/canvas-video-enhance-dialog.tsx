import { useEffect, useMemo, useState, type ReactNode } from "react";
import { InputNumber } from "antd";
import { ChevronDown } from "lucide-react";

import { AppModal } from "@/components/ui/product/app-modal";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import {
    listVideoEnhanceModels,
    videoEnhanceProfile,
    videoEnhanceQuoteRequest,
    videoEnhanceResolutionShortEdge,
    videoEnhanceSourceError,
    type VideoEnhanceBitrateLevel,
    type VideoEnhanceParams,
} from "@/lib/canvas/canvas-video-enhance";
import { modelQuoteDescription } from "@/lib/model-pricing";
import { quoteModel, type LogicalModelQuote } from "@/services/api/logical-models";
import { modelDisplayName, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasNodeData } from "@/types/canvas";
import { translate } from "@/i18n";

type Props = {
    node: CanvasNodeData;
    open: boolean;
    config: AiConfig;
    onClose: () => void;
    onConfirm: (params: VideoEnhanceParams) => void;
};

const bitrateLevelOptions: Array<{ label: string; value: VideoEnhanceBitrateLevel }> = [
    { label: translate("canvasTools.canvasVideoEnhanceDialog.low"), value: "low" },
    { label: translate("canvasTools.canvasVideoEnhanceDialog.medium"), value: "medium" },
    { label: translate("canvasTools.canvasVideoEnhanceDialog.high"), value: "high" },
];

export function CanvasVideoEnhanceDialog(props: Props) {
    // 以节点为 key 重新挂载，避免沿用上一个视频的选项。
    return props.open ? <EnhanceEditor key={props.node.id} {...props} /> : null;
}

function EnhanceEditor({ node, config, onClose, onConfirm }: Props) {
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const models = useMemo(() => listVideoEnhanceModels(config), [config]);
    const [model, setModel] = useState(models[0] || "");
    const profile = useMemo(() => videoEnhanceProfile(config, model), [config, model]);
    const sourceShortEdge = Math.min(node.metadata?.naturalWidth || 0, node.metadata?.naturalHeight || 0);
    const resolutionOptions = profile.resolutions.map((value) => {
        const edge = videoEnhanceResolutionShortEdge(value);
        // 低于源视频短边的档位不会提升画质，直接禁用。
        const disabled = sourceShortEdge > 0 && edge > 0 && edge < sourceShortEdge;
        return { value, label: value.toUpperCase(), disabled, title: disabled ? translate("canvasTools.canvasVideoEnhanceDialog.lowerThanSourceVideoResolution") : undefined };
    });
    const defaultResolution = resolutionOptions.find((item) => item.value === profile.defaultResolution && !item.disabled)?.value || resolutionOptions.find((item) => !item.disabled)?.value || "";
    const [resolution, setResolution] = useState(defaultResolution);
    const userSelectFps = profile.processing.fpsPolicy === "user_select";
    const fpsOptions = profile.processing.fpsOptions || [];
    const [fps, setFps] = useState<number | undefined>(fpsOptions[0]);
    const [bitrateLevel, setBitrateLevel] = useState<VideoEnhanceBitrateLevel>("medium");
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [bitrate, setBitrate] = useState<number | null>(null);
    const [quote, setQuote] = useState<LogicalModelQuote | null>(null);

    useEffect(() => {
        setResolution(defaultResolution);
        setFps(fpsOptions[0]);
        // 切换模型时重置依赖模型配置的选项。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model]);

    const sourceError = videoEnhanceSourceError(node, profile.maxSourceSeconds);
    const params: VideoEnhanceParams = {
        model,
        resolution,
        ...(userSelectFps && fps ? { fps } : {}),
        ...(bitrate ? { bitrate } : { bitrateLevel }),
    };
    const ready = Boolean(model && resolution && !sourceError && (!userSelectFps || fps));
    const quoteRequest = ready ? videoEnhanceQuoteRequest(config, params, node.metadata?.durationMs) : undefined;
    const quoteKey = JSON.stringify(quoteRequest || null);

    useEffect(() => {
        if (!creditsEnabled || !quoteRequest) {
            setQuote(null);
            return;
        }
        const controller = new AbortController();
        setQuote(null);
        quoteModel(quoteRequest, controller.signal)
            .then(({ quote: next }) => setQuote(next))
            .catch(() => {
                if (!controller.signal.aborted) setQuote(null);
            });
        return () => controller.abort();
        // quoteKey 是请求的完整序列化，避免对象引用变化重复报价。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [creditsEnabled, quoteKey]);

    const seconds = node.metadata?.durationMs ? Math.ceil(node.metadata.durationMs / 1000) : 0;
    const width = node.metadata?.naturalWidth;
    const height = node.metadata?.naturalHeight;
    const quoteText = creditsEnabled && quote ? modelQuoteDescription(quote) : "";

    return (
        <AppModal
            open
            centered
            title={translate("canvasTools.canvasVideoEnhanceDialog.videoEnhancement")}
            width={520}
            onCancel={onClose}
            okText={translate("canvasTools.canvasVideoEnhanceDialog.startEnhancement")}
            okButtonProps={{ disabled: !ready }}
            onOk={() => ready && onConfirm(params)}
            footer={(_, { OkBtn, CancelBtn }) => (
                <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-left text-xs text-muted-foreground" title={quote?.billingMode === "per_second" ? translate("canvasTools.canvasVideoEnhanceDialog.creditsAreReservedBasedOnSourceDurationThenSettledAgainst") : undefined}>
                        {quoteText || (creditsEnabled && ready ? translate("canvasTools.canvasVideoEnhanceDialog.calculatingCredits") : "")}
                    </span>
                    <div className="flex shrink-0 gap-2">
                        <CancelBtn />
                        <OkBtn />
                    </div>
                </div>
            )}
        >
            <p className="mb-4 text-sm text-muted-foreground">{translate("canvasTools.canvasVideoEnhanceDialog.generativeVideoEnhancementSavesTheResultAsANewVideo")}</p>

            <div className="mb-5 flex flex-wrap gap-2 text-xs">
                <InfoChip>{width && height ? `${width} × ${height}` : translate("canvasTools.canvasVideoEnhanceDialog.unknownDimensions")}</InfoChip>
                {seconds ? <InfoChip>{translate("canvasTools.inline.canvasVideoEnhanceDialog.seconds", { v0: String(seconds) })}</InfoChip> : null}
                <InfoChip>{translate("canvasTools.inline.canvasVideoEnhanceDialog.limitSeconds", { v0: String(profile.maxSourceSeconds) })}</InfoChip>
            </div>

            {!models.length ? (
                <p role="alert" className="text-sm text-destructive">{translate("canvasTools.canvasVideoEnhanceDialog.theAdministratorHasNotConfiguredAnAvailableEnhancementModel")}</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {models.length > 1 ? (
                        <OptionRow label={translate("canvasTools.canvasVideoEnhanceDialog.enhancementModel")}>
                            <SegmentedControl ariaLabel={translate("canvasTools.canvasVideoEnhanceDialog.enhancementModel")} value={model} onChange={setModel} options={models.map((value) => ({ value, label: modelDisplayName(config, value) }))} />
                        </OptionRow>
                    ) : null}
                    <OptionRow label={translate("canvasTools.canvasVideoEnhanceDialog.targetResolution")}>
                        <SegmentedControl ariaLabel={translate("canvasTools.canvasVideoEnhanceDialog.targetResolution")} block value={resolution} onChange={setResolution} options={resolutionOptions} />
                    </OptionRow>
                    <OptionRow label={translate("canvasTools.canvasVideoEnhanceDialog.outputFrameRate")}>
                        {userSelectFps ? (
                            <SegmentedControl ariaLabel={translate("canvasTools.canvasVideoEnhanceDialog.outputFrameRate")} block value={fps ? String(fps) : undefined} onChange={(value) => setFps(Number(value))} options={fpsOptions.map((value) => ({ value: String(value), label: `${value} fps` }))} />
                        ) : (
                            <span className="text-sm text-muted-foreground">{translate("canvasTools.canvasVideoEnhanceDialog.keepOriginalFrameRate")}</span>
                        )}
                    </OptionRow>
                    <OptionRow label={translate("canvasTools.canvasVideoEnhanceDialog.bitrate")}>
                        <SegmentedControl ariaLabel={translate("canvasTools.canvasVideoEnhanceDialog.bitratePreset")} block disabled={Boolean(bitrate)} value={bitrateLevel} onChange={setBitrateLevel} options={bitrateLevelOptions} />
                    </OptionRow>

                    <div>
                        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((value) => !value)}>
                            <ChevronDown className={`size-3.5 transition-transform motion-reduce:transition-none ${advancedOpen ? "rotate-180" : ""}`} />
                            {translate("canvasTools.canvasVideoEnhanceDialog.advancedExactBitrate")}
                        </button>
                        {advancedOpen ? (
                            <div className="mt-2 flex items-center gap-3">
                                <InputNumber
                                    aria-label={translate("canvasTools.canvasVideoEnhanceDialog.exactBitrateKbps")}
                                    style={{ width: 200 }}
                                    min={10}
                                    max={150000}
                                    step={500}
                                    precision={0}
                                    value={bitrate}
                                    suffix="kbps"
                                    placeholder={translate("canvasTools.canvasVideoEnhanceDialog.leaveBlankToUseTheBitratePreset")}
                                    onChange={(value) => setBitrate(typeof value === "number" ? value : null)}
                                />
                                <span className="text-xs text-muted-foreground">{translate("canvasTools.canvasVideoEnhanceDialog.takesPriorityOverTheBitratePresetWhenEntered")}</span>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}

            {sourceError ? (
                <p role="alert" className="mt-4 text-sm text-destructive">{sourceError}</p>
            ) : null}
        </AppModal>
    );
}

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
            <span className="whitespace-nowrap text-sm text-foreground/70">{label}</span>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

function InfoChip({ children }: { children: ReactNode }) {
    return <span className="rounded-full bg-surface-tertiary px-2 py-1 text-foreground/70">{children}</span>;
}
