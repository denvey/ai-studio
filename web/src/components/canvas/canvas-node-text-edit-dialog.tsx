import { useEffect, useState } from "react";
import { Alert, Button, Input, Modal, Spin } from "antd";
import { FileText, RefreshCw, ScanText, X, Check } from "lucide-react";

import { modelDisplayName, useEffectiveConfig } from "@/stores/use-config-store";
import { canvasTextDetectionModel, canvasTextDetectionPriceLabel, canvasTextDetectionSupportError } from "./canvas-node-text-detection";
import { translate } from "@/i18n";

export type CanvasImageTextLine = { original: string; text: string; location: string };
export type CanvasImageTextEditPayload = { lines: CanvasImageTextLine[] };

export function buildCanvasTextEditPrompt(lines: CanvasImageTextLine[]) {
    const changed = lines.filter((line) => line.text.trim() && line.text !== line.original);
    return `编辑提供的原图，仅修改指定位置的文字。保持原图构图、字体风格、字号、颜色、排版、材质和其他画面细节不变，不要新增水印或其他文字。${changed.map((line) => `在“${line.location}”位置，将“${line.original}”改为“${line.text}”。`).join("\n")}`;
}

export function CanvasNodeTextEditDialog({
    dataUrl,
    open,
    onClose,
    onDetect,
    onConfirm,
}: {
    dataUrl: string;
    open: boolean;
    onClose: () => void;
    onDetect: () => Promise<CanvasImageTextLine[]>;
    onConfirm: (payload: CanvasImageTextEditPayload) => void;
}) {
    const config = useEffectiveConfig();
    const [lines, setLines] = useState<CanvasImageTextLine[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    // 是否已经发起过识别：打开弹窗只展示说明，用户点击后才调用计费的文字模型。
    const [requested, setRequested] = useState(false);
    const model = canvasTextDetectionModel(config);
    const modelName = model ? modelDisplayName(config, model) : "";
    const priceLabel = canvasTextDetectionPriceLabel(config, model);
    const supportError = canvasTextDetectionSupportError(config, model);

    const detect = async () => {
        setRequested(true);
        setLoading(true);
        setError("");
        try {
            const detected = await onDetect();
            setLines(detected.map((line) => ({ ...line, text: line.text || line.original })));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : translate("canvasTools.canvasNodeTextEditDialog.textRecognitionFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        setLines([]);
        setError("");
        setLoading(false);
        setRequested(false);
    }, [dataUrl, open]);

    const changed = lines.some((line) => line.text.trim() && line.text !== line.original);
    const billingNote = modelName ? translate("canvasTools.canvasNodeTextEditDialog.recognitionUsesTextModelAndIsBilledAccordingToThat", { v0: String(modelName), v1: String(priceLabel ? `（${priceLabel}）` : "") }) : translate("canvasTools.canvasNodeTextEditDialog.configureATextModelInSettingsBeforeRecognizingText");

    const body = loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm opacity-65">
            <Spin size="small" />
            {translate("canvasTools.canvasNodeTextEditDialog.recognizingTextInImage")}
        </div>
    ) : error ? (
        <div className="space-y-3">
            <Alert type="error" showIcon message={error} />
            <Button onClick={() => void detect()}>{translate("common.retry")}</Button>
        </div>
    ) : !requested ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm opacity-65">{billingNote}</p>
            {supportError ? <Alert type="warning" showIcon className="text-left" message={supportError} /> : null}
            <Button type="primary" icon={<ScanText className="size-4" />} disabled={Boolean(supportError)} onClick={() => void detect()}>
                {translate("canvasTools.canvasNodeTextEditDialog.recognizeText")}
            </Button>
        </div>
    ) : lines.length ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {lines.map((line, index) => (
                <div key={`${line.original}-${index}`} className="rounded-xl border p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs opacity-60">
                        <FileText className="size-3.5" />
                        <span>
                            {translate("canvasTools.inline.canvasNodeTextEditDialog.line", { v0: String(index + 1), v1: String(line.location) })}
                        </span>
                    </div>
                    <Input value={line.text} placeholder={line.original} onChange={(event) => setLines((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, text: event.target.value } : item)))} />
                </div>
            ))}
        </div>
    ) : (
        <div className="flex flex-1 items-center justify-center text-sm opacity-55">{translate("canvasPage.mediaTools.noEditableText")}</div>
    );

    return (
        <Modal open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} centered destroyOnHidden width={980} title={translate("canvasTools.canvasNodeTextEditDialog.editTextInImage")}>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_390px]">
                <div className="grid min-h-[360px] place-items-center overflow-hidden rounded-xl bg-black/5 p-3 dark:bg-white/[0.04]">
                    <img src={dataUrl} alt={translate("canvasTools.canvasNodeTextEditDialog.imageToEdit")} className="max-h-[64vh] max-w-full object-contain" draggable={false} />
                </div>
                <div className="flex min-h-[360px] flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-lg font-semibold">{translate("canvasTools.canvasNodeTextEditDialog.recognizeTextInImage")}</h3>
                            <p className="mt-1 text-sm opacity-60">{translate("canvasTools.canvasNodeTextEditDialog.editTextLineByLinePositionDescriptionsOnlyHelpThe")}</p>
                        </div>
                        {requested ? (
                            <Button size="small" icon={<RefreshCw className="size-3.5" />} onClick={() => void detect()} disabled={loading}>
                                {translate("canvasTools.canvasNodeTextEditDialog.recognizeAgain")}
                            </Button>
                        ) : null}
                    </div>
                    {body}
                    <div className="mt-auto flex justify-end gap-2 border-t pt-3">
                        <Button icon={<X className="size-4" />} onClick={onClose}>
                            {translate("common.cancel")}
                        </Button>
                        <Button type="primary" icon={<Check className="size-4" />} disabled={!changed || loading} onClick={() => onConfirm({ lines })}>
                            {translate("canvasTools.canvasNodeTextEditDialog.generateEditedImage")}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
