import { useState } from "react";
import { Radio, Select } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { MAX_UPSCALE_LONG_EDGE, resolveUpscaleSize, type ImageUpscaleAlgorithm, type ImageUpscaleParams } from "@/lib/canvas/image-operation-plan";
import { useImageToolSource } from "./use-image-tool-source";
import { translate } from "@/i18n";

export type CanvasImageUpscaleParams = ImageUpscaleParams;
type UpscaleDialogProps = { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageUpscaleParams) => void };
const pixelTargets = [1024, 2048, MAX_UPSCALE_LONG_EDGE];

export function CanvasNodeUpscaleDialog(props: UpscaleDialogProps) {
    return props.open && props.dataUrl ? <ResizeEditor key={props.dataUrl} {...props} /> : null;
}

function ResizeEditor({ dataUrl, onClose, onConfirm }: UpscaleDialogProps) {
    const { size, error } = useImageToolSource(dataUrl);
    const [chosen, setChosen] = useState<number | null>(null);
    const [algorithm, setAlgorithm] = useState<ImageUpscaleAlgorithm>("high");
    const edge = size ? Math.max(size.width, size.height) : 0;
    const target = chosen ?? pixelTargets.find((pixels) => pixels > edge) ?? MAX_UPSCALE_LONG_EDGE;
    const output = size ? resolveUpscaleSize(size.width, size.height, target) : null;
    const ready = Boolean(size && target > edge);
    return (
        <AppModal
            open
            centered
            title={translate("canvasTools.canvasNodeUpscaleDialog.resizeImage")}
            width={760}
            onCancel={onClose}
            okText={translate("canvasTools.canvasNodeUpscaleDialog.generateAnUpscaledImage")}
            okButtonProps={{ disabled: !ready }}
            onOk={() => ready && onConfirm({ targetLongEdge: target, algorithm })}
        >
            <p className="mb-4 text-sm text-muted-foreground">{translate("canvasTools.canvasNodeUpscaleDialog.enlargeWithInterpolationAndSaveAsANewImagePreserving")}</p>
            <div className="grid gap-5 md:grid-cols-2">
                <figure className="m-0 flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface-active p-3">
                    <img alt={translate("canvasTools.canvasNodeUpscaleDialog.imageToResize")} src={dataUrl} draggable={false} className="max-h-[320px] max-w-full object-contain" />
                    <figcaption className="text-sm text-muted-foreground">
                        {size ? translate("canvasTools.canvasNodeUpscaleDialog.originalPx", { v0: String(size.width), v1: String(size.height) }) : error || translate("canvasTools.canvasNodeUpscaleDialog.loadingImage")}
                    </figcaption>
                </figure>
                <div className="flex flex-col gap-5">
                    <label className="flex flex-col gap-2 text-sm">
                        {translate("canvasTools.canvasNodeUpscaleDialog.targetLongEdge")}
                        <Select
                            aria-label={translate("canvasTools.canvasNodeUpscaleDialog.targetLongEdge")}
                            value={target}
                            onChange={setChosen}
                            options={pixelTargets.map((pixels) => ({ value: pixels, label: `${pixels} px`, disabled: pixels <= edge }))}
                        />
                    </label>
                    <fieldset className="space-y-2">
                        <legend className="mb-2 text-sm">{translate("canvasTools.canvasNodeUpscaleDialog.interpolationMethod")}</legend>
                        <Radio.Group value={algorithm} onChange={(event) => setAlgorithm(event.target.value)} className="flex flex-col gap-2">
                            <Radio value="high">{translate("canvasTools.canvasNodeUpscaleDialog.highQualityPhotosAndDetailedImages")}</Radio>
                            <Radio value="bilinear">{translate("canvasTools.canvasNodeUpscaleDialog.bilinearSmoothAndFast")}</Radio>
                            <Radio value="nearest">{translate("canvasTools.canvasNodeUpscaleDialog.nearestNeighborPixelArt")}</Radio>
                        </Radio.Group>
                    </fieldset>
                    <output className="text-sm">
                        {output ? translate("canvasTools.canvasNodeUpscaleDialog.outputPx", { v0: String(output.width), v1: String(output.height) }) : translate("canvasTools.canvasNodeUpscaleDialog.waitingForImageDimensions")}
                    </output>
                    {error || (size && !ready) ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error || (edge >= MAX_UPSCALE_LONG_EDGE ? translate("canvasTools.canvasNodeUpscaleDialog.theImageIsAlready4KNoUpscaleNeeded") : translate("canvasTools.canvasNodeUpscaleDialog.selectATargetSizeLargerThanTheOriginal"))}
                        </p>
                    ) : null}
                </div>
            </div>
        </AppModal>
    );
}
