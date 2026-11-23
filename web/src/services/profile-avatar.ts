import { assertPixelSize, resolveCropPixels, type ImageCropRect, type PixelSize } from "@/lib/canvas/image-operation-plan";
import { loadRasterImage } from "@/lib/image-raster";
import { translate } from "@/i18n";


const MAX_AVATAR_PIXELS = 16_000_000;
const MAX_AVATAR_SIDE = 512;

export function planProfileAvatarCrop(size: PixelSize, crop: ImageCropRect): { source: ImageCropRect; outputSide: number } {
    assertPixelSize(size);
    if (size.width * size.height > MAX_AVATAR_PIXELS) throw new RangeError(translate("shared.profileAvatar.theImageMustNotExceed16MegapixelsResizeItFirst"));
    const source = resolveCropPixels(size, crop);
    if (crop.x < -1e-12 || crop.y < -1e-12 || crop.x + crop.width > 1 + 1e-12 || crop.y + crop.height > 1 + 1e-12) throw new RangeError(translate("shared.profileAvatar.theCropAreaExtendsBeyondTheImageBoundaries"));
    if (Math.abs(crop.width * size.width - crop.height * size.height) > 1e-6) throw new RangeError(translate("shared.profileAvatar.theAvatarCropAreaMustBeSquare"));
    // 浮点选区向像素取整可能多出一列或一行，保留选区中心并输出严格方形。
    const side = Math.min(source.width, source.height);
    return { source: { x: source.x + Math.floor((source.width - side) / 2), y: source.y + Math.floor((source.height - side) / 2), width: side, height: side }, outputSide: Math.min(side, MAX_AVATAR_SIDE) };
}

export async function cropProfileAvatar(sourceURL: string, crop: ImageCropRect, _originalName: string): Promise<File> {
    const image = await loadRasterImage(sourceURL);
    let canvas: HTMLCanvasElement | undefined;
    try {
        const { source, outputSide } = planProfileAvatarCrop({ width: image.naturalWidth, height: image.naturalHeight }, crop);
        canvas = document.createElement("canvas");
        canvas.width = outputSide;
        canvas.height = outputSide;
        const context = canvas.getContext("2d");
        if (!context) throw new Error(translate("shared.profileAvatar.theBrowserCannotCreateAnAvatarCroppingCanvas"));
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, outputSide, outputSide);
        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas!.toBlob((result) => (result && result.size > 0 ? resolve(result) : reject(new Error(translate("shared.profileAvatar.failedToExportAvatarPNGTryAgain")))), "image/png");
        });
        return new File([blob], "avatar.png", { type: "image/png" });
    } finally {
        image.src = "";
        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        }
    }
}
