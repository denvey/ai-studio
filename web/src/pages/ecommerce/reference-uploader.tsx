import { Plus, X } from "lucide-react";
import { Popover, Select } from "antd";
import { useRef, useState } from "react";
import { resourceFileUrl, resourceStorageKey } from "@/services/api/resources";
import { CachedResourceImage } from "@/components/cached-resource-image";
import type { EcommerceReference, EcommerceReferenceRole } from "@/services/api/ecommerce";
import { CommerceHint } from "./commerce-hint";
import { COMMERCE_IMAGE_ACCEPT, mightContainCommerceImage, readCommerceImageTransfer, writeCommerceImageTransfer, type CommerceImageTransfer } from "./image-transfer";
import "./reference-uploader.css";

import { translate } from "@/i18n";
export const referenceRoleOptions = [
    { value: "primary", label: translate("ecommerce.referenceUploader.mainProductImage") },
    { value: "detail", label: translate("ecommerce.referenceUploader.detailReference") },
    { value: "sku", label: translate("ecommerce.referenceUploader.sKUReference") },
    { value: "logo", label: translate("ecommerce.referenceUploader.brandLogo") },
    { value: "package", label: translate("ecommerce.referenceUploader.packagingImage") },
];

export function ReferenceUploader({
    references,
    uploading,
    uploadProgress,
    maxReferences = 24,
    compact = false,
    onUpload,
    onTransfer,
    onChange,
}: {
    references: EcommerceReference[];
    uploading: boolean;
    uploadProgress?: string;
    maxReferences?: number;
    compact?: boolean;
    onUpload: (files: File[]) => void | Promise<void>;
    onTransfer: (source: CommerceImageTransfer) => void | Promise<void>;
    onChange: (references: EcommerceReference[]) => void;
}) {
    const [dragging, setDragging] = useState(false);
    const [pending, setPending] = useState(false);
    const [previews, setPreviews] = useState<Array<{ name: string; url: string }>>([]);
    const [error, setError] = useState("");
    const lock = useRef(false);
    const depth = useRef(0);
    const busy = uploading || pending;
    const full = references.length >= maxReferences;
    const run = async (action: () => void | Promise<void>, files: File[] = []) => {
        if (uploading || lock.current) {
            setError(translate("ecommerce.referenceUploader.imagesAreUploadingWaitUntilTheyFinishBeforeAddingMore"));
            return;
        }
        if (full) {
            setError(translate("ecommerce.referenceUploader.referenceImageLimitReachedRemoveSomeImagesFirst"));
            return;
        }
        lock.current = true;
        setPending(true);
        setError("");
        const nextPreviews = files.filter((file) => file.type.startsWith("image/")).map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
        setPreviews(nextPreviews);
        try {
            await action();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : translate("ecommerce.referenceUploader.failedToAddImagesRetry"));
        } finally {
            lock.current = false;
            setPending(false);
            setPreviews([]);
            nextPreviews.forEach((item) => URL.revokeObjectURL(item.url));
        }
    };
    const tiles = references.map((ref, index) => {
        const thumbnail = (
            <CachedResourceImage
                storageKey={resourceStorageKey(ref.resourceId)}
                alt={ref.name || translate("ecommerce.referenceUploader.productReferenceImage")}
                loading="lazy"
                decoding="async"
                draggable
                onDragStart={(event) => writeCommerceImageTransfer(event.dataTransfer, { resourceId: ref.resourceId, name: ref.name || translate("ecommerce.referenceUploader.productReferenceImage"), url: resourceFileUrl(ref.resourceId) })}
                fallback={<span className="commerce-reference-item-image-fallback" aria-label={translate("ecommerce.referenceUploader.imageTemporarilyUnavailable")} />}
                loadingFallback={<span className="commerce-reference-item-image-fallback" aria-label={translate("ecommerce.referenceUploader.readingImage")} />}
            />
        );
        return (
            <div className="commerce-reference-item" key={`${ref.resourceId}-${index}`} title={compact ? undefined : ref.name || translate("ecommerce.referenceUploader.productReferenceImage2", { v0: String(index + 1) })}>
                {/* 紧凑模式缩略图很小，悬停时放大预览，便于确认上传的是哪张商品图。 */}
                {compact ? (
                    <Popover
                        placement="top"
                        arrow={false}
                        mouseEnterDelay={0.35}
                        classNames={{ root: "commerce-reference-preview-popover" }}
                        content={
                            <figure className="commerce-reference-preview">
                                <CachedResourceImage storageKey={resourceStorageKey(ref.resourceId)} alt={ref.name || translate("ecommerce.referenceUploader.productReferencePreview")} decoding="async" />
                                <figcaption>{ref.name || translate("ecommerce.referenceUploader.productReferenceImage2", { v0: String(index + 1) })}</figcaption>
                            </figure>
                        }
                    >
                        <span className="commerce-reference-thumb">{thumbnail}</span>
                    </Popover>
                ) : (
                    thumbnail
                )}
                <div className="commerce-reference-item-actions">
                    {!compact ? (
                        <Select
                            aria-label={translate("ecommerce.referenceUploader.roleOfAsset", { v0: String(index + 1) })}
                            size="small"
                            value={ref.role}
                            options={referenceRoleOptions}
                            disabled={busy}
                            popupMatchSelectWidth={180}
                            onChange={(role: EcommerceReferenceRole) => onChange(references.map((item, i) => (i === index ? { ...item, role } : item)))}
                        />
                    ) : null}
                    <CommerceHint text={translate("ecommerce.referenceUploader.removeThisProductReferenceFromTheCurrentCreation")}>
                        <button className="commerce-reference-remove" type="button" aria-label={translate("ecommerce.referenceUploader.removeReferenceImage", { v0: String(index + 1) })} disabled={busy} onClick={() => onChange(references.filter((_, i) => i !== index))}>
                            <X size={13} />
                        </button>
                    </CommerceHint>
                </div>
            </div>
        );
    });
    const addTile = (
        <CommerceHint text={translate("ecommerce.referenceUploader.uploadLocalMainOrDetailProductImagesMultipleImagesDragging")}>
            <label className={`commerce-reference-add ${busy ? "is-uploading" : ""}`}>
                {busy ? <span className="commerce-reference-spinner" aria-hidden="true" /> : <Plus size={25} strokeWidth={1.5} aria-hidden="true" />}
                <span>{busy ? translate("ecommerce.referenceUploader.uploading") : full ? translate("ecommerce.referenceUploader.referenceLimitReached") : dragging ? translate("ecommerce.referenceUploader.dropToAdd") : references.length ? translate("ecommerce.referenceUploader.addMore") : compact ? translate("ecommerce.referenceUploader.productImages") : translate("ecommerce.referenceUploader.uploadOrDragProductImages")}</span>
                <input
                    type="file"
                    aria-label={translate("ecommerce.referenceUploader.addProductReferences")}
                    accept={COMMERCE_IMAGE_ACCEPT}
                    multiple
                    disabled={busy || full}
                    onChange={(event) => {
                        const files = Array.from(event.target.files || []);
                        event.target.value = "";
                        if (files.length) void run(() => onUpload(files), files);
                    }}
                />
            </label>
        </CommerceHint>
    );
    return (
        <section
            className={`commerce-reference-dropzone${dragging ? " is-dragging" : ""}${compact ? " is-compact" : ""}`}
            aria-label={translate("ecommerce.referenceUploader.productReferenceUploadArea")}
            tabIndex={0}
            aria-busy={busy}
            aria-describedby="commerce-reference-help"
            onDragEnter={(event) => {
                if (!mightContainCommerceImage(event.dataTransfer)) return;
                event.preventDefault();
                depth.current += 1;
                setDragging(true);
            }}
            onDragOver={(event) => {
                if (!mightContainCommerceImage(event.dataTransfer)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = busy || full ? "none" : "copy";
            }}
            onDragLeave={() => {
                depth.current = Math.max(0, depth.current - 1);
                if (!depth.current) setDragging(false);
            }}
            onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                depth.current = 0;
                setDragging(false);
                const source = readCommerceImageTransfer(event.dataTransfer);
                void run(() => onTransfer(source), source.files);
            }}
            onPaste={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest('textarea,input:not([type="file"]),[contenteditable="true"],[role="combobox"]')) return;
                const source = readCommerceImageTransfer(event.clipboardData);
                if (!source.files.length && !source.resourceId && !source.url) return;
                event.preventDefault();
                event.stopPropagation();
                void run(() => onTransfer(source), source.files);
            }}
        >
            {/* 紧凑模式由外层区块提供标题与说明，这里不再重复。 */}
            {compact ? null : (
                <>
                    <strong>{translate("ecommerce.referenceUploader.yourOwnProductImages")}</strong>
                    <p className="commerce-reference-help">{translate("ecommerce.referenceUploader.uploadYourProductSMainImagesDetailsPackagingOrLogo")}</p>
                </>
            )}
            <div className="commerce-reference-list" aria-label={translate("ecommerce.referenceUploader.productReferenceImages")}>
                {compact ? addTile : null}
                {tiles}
                {previews.map((item, index) => (
                    <div className="commerce-reference-item is-pending" key={`${item.url}-${index}`}>
                        <img src={item.url} alt={translate("ecommerce.referenceUploader.uploading2", { v0: String(item.name) })} />
                        <span className="commerce-reference-pending-pulse" aria-hidden="true" />
                    </div>
                ))}
                {!compact ? addTile : null}
            </div>
            <p id="commerce-reference-help" className={compact ? "sr-only" : "commerce-reference-help"}>
                {translate("ecommerce.referenceUploader.dragImagesFromWeChatYourComputerAWebpageOrThe")}
            </p>
            {busy ? (
                <p className="commerce-reference-status" role="status">
                    {uploadProgress || translate("ecommerce.referenceUploader.addingImages")}
                </p>
            ) : null}
            {error ? (
                <p className="commerce-reference-error" role="alert">
                    {error}
                </p>
            ) : null}
        </section>
    );
}
