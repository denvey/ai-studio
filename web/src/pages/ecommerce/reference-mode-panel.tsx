import { Select } from "antd";
import { Images, LoaderCircle, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { EcommerceDraft, EcommerceReference, EcommerceReferenceMode, EcommerceReferenceScreen } from "@/services/api/ecommerce";
import { resourceStorageKey } from "@/services/api/resources";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { COMMERCE_IMAGE_ACCEPT, mightContainCommerceImage, readCommerceImageTransfer, type CommerceImageTransfer } from "./image-transfer";

import { translate } from "@/i18n";
const modeOptions: Array<{ value: EcommerceReferenceMode; label: string; description: string }> = [
    { value: "product", label: translate("ecommerce.referenceModePanel.independentProductPlanning"), description: translate("ecommerce.referenceModePanel.designSellingPointsScenesCopyAndVisualsFromYourProduct") },
    { value: "style", label: translate("ecommerce.referenceModePanel.referenceStyleAndLayout"), description: translate("ecommerce.referenceModePanel.useTheColorsCompositionAndLayoutOfTheImagesBelow") },
    { value: "detail", label: translate("ecommerce.referenceModePanel.screenByScreenDetailPageReference"), description: translate("ecommerce.referenceModePanel.identifyContentLayoutAndVisualsOnEveryScreenOfThe") },
];
const uploadLabels: Record<EcommerceReferenceMode, string> = {
    product: translate("ecommerce.referenceModePanel.productImages"),
    style: translate("ecommerce.referenceModePanel.styleAndLayoutReferences"),
    detail: translate("ecommerce.referenceModePanel.screenByScreenLongImageReference"),
};
const fallbackNames: Record<EcommerceReferenceMode, string> = {
    product: translate("ecommerce.referenceModePanel.productReferenceImage"),
    style: translate("ecommerce.referenceModePanel.styleReferenceImage"),
    detail: translate("ecommerce.referenceModePanel.longDetailImage"),
};

function referenceName(reference: EcommerceReference, mode: EcommerceReferenceMode, index?: number) {
    const name = reference.name?.trim() || "";
    const stem = name.replace(/\.[a-z0-9]{2,8}$/i, "");
    const opaque =
        !name || name === reference.resourceId || (reference.resourceId.length >= 16 && name.includes(reference.resourceId)) || /[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/i.test(name) || /^(?:resource:)?[a-f\d]{24,64}$/i.test(stem);
    return opaque ? `${fallbackNames[mode]}${index == null ? "" : ` ${index + 1}`}` : name;
}

function ReferenceThumbnail({ reference, name }: { reference: EcommerceReference; name: string }) {
    return (
        <CachedResourceImage
            storageKey={resourceStorageKey(reference.resourceId)}
            variant="thumbnail"
            alt={name}
            loading="lazy"
            decoding="async"
            fallback={
                <span className="ecommerce-reference-thumbnail-empty" aria-label={translate("ecommerce.referenceModePanel.imageTemporarilyUnavailable")}>
                    <Images size={22} />
                </span>
            }
            loadingFallback={
                <span className="ecommerce-reference-thumbnail-empty" aria-label={translate("ecommerce.referenceModePanel.readingImage")}>
                    <LoaderCircle size={18} />
                </span>
            }
        />
    );
}

export function ReferenceModePanel({
    draft,
    onChange,
    onUpload,
    uploading = false,
    uploadProgress,
}: {
    draft: EcommerceDraft;
    onChange: (patch: Partial<EcommerceDraft>) => void;
    onUpload: (source: CommerceImageTransfer, mode: EcommerceReferenceMode) => Promise<void>;
    uploading?: boolean;
    uploadProgress?: string;
}) {
    const fileInput = useRef<HTMLInputElement>(null);
    const mounted = useRef(false);
    const lock = useRef(false);
    const depth = useRef(0);
    const lastUpload = useRef<{ source: CommerceImageTransfer; mode: EcommerceReferenceMode } | undefined>(undefined);
    const [pending, setPending] = useState(false);
    const [batchProgress, setBatchProgress] = useState("");
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState("");
    const helpId = useId();
    const busy = uploading || pending;
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const mode = modeOptions.find((option) => option.value === draft.referenceMode) || modeOptions[0];
    const references = draft.layoutReferences || [];
    const label = uploadLabels[mode.value];

    const chooseMode = (value: EcommerceReferenceMode) => {
        if (busy || lock.current) return;
        setError("");
        lastUpload.current = undefined;
        onChange({ referenceMode: value, ...(value === "detail" ? { imageType: "detail" } : {}) });
    };
    const removeReference = (index: number) => {
        if (busy || lock.current) return;
        setError("");
        lastUpload.current = undefined;
        onChange({ layoutReferences: references.filter((_, position) => position !== index) });
    };
    const upload = async (source: CommerceImageTransfer, uploadMode = mode.value) => {
        if (!mounted.current || uploading || lock.current) return;
        if (!source.files.length && !source.resourceId && !source.url) {
            lastUpload.current = undefined;
            setError(translate("ecommerce.referenceModePanel.noImageFoundChooseAnImageFileOrCopyAnd"));
            return;
        }
        lock.current = true;
        setPending(true);
        setError("");
        lastUpload.current = undefined;
        const items: CommerceImageTransfer[] = source.files.length ? source.files.map((file) => ({ files: [file] })) : [source];
        const failed: CommerceImageTransfer[] = [];
        const messages: string[] = [];
        try {
            for (const [index, item] of items.entries()) {
                if (!mounted.current) return;
                const name = item.files[0]?.name || item.name || uploadLabels[uploadMode];
                setBatchProgress(translate("ecommerce.referenceModePanel.adding", { v0: String(index + 1), v1: String(items.length), v2: String(name) }));
                try {
                    await onUpload(item, uploadMode);
                } catch (cause) {
                    if (!mounted.current) return;
                    failed.push(item);
                    messages.push(`${name}：${cause instanceof Error ? cause.message : translate("ecommerce.referenceModePanel.imageUploadFailedRetry")}`);
                }
                if (!mounted.current) return;
            }
            if (failed.length) {
                lastUpload.current = { source: source.files.length ? { files: failed.flatMap((item) => item.files) } : source, mode: uploadMode };
                setError(
                    translate("ecommerce.referenceModePanel.imagesWereNotAdded", {
                        v0: String(items.length - failed.length ? translate("ecommerce.referenceModePanel.addedImages", { v0: String(items.length - failed.length) }) : ""),
                        v1: String(failed.length),
                        v2: String(messages.join("；")),
                    }),
                );
            }
        } finally {
            lock.current = false;
            if (mounted.current) {
                setPending(false);
                setBatchProgress("");
            }
        }
    };
    return (
        <section className="ecommerce-reference-mode" aria-label={translate("ecommerce.referenceModePanel.referenceModeSettings")}>
            <Select<EcommerceReferenceMode>
                variant="filled"
                aria-label={translate("ecommerce.referenceModePanel.referenceMode")}
                value={mode.value}
                options={modeOptions.map(({ value, label }) => ({ value, label }))}
                onChange={chooseMode}
                disabled={busy}
            />
            {mode.value === "product" ? (
                <p className="ecommerce-reference-mode-description">{translate("ecommerce.referenceModePanel.useYourOwnProductImagesAboveToPlanSellingPoints")}</p>
            ) : (
                <>
                    <p className="ecommerce-reference-mode-description">{mode.description}</p>
                    <div
                        className={`ecommerce-reference-upload${dragging ? " is-dragging" : ""}`}
                        role="group"
                        aria-label={translate("ecommerce.referenceModePanel.uploadArea", { v0: String(label) })}
                        aria-busy={busy}
                        aria-describedby={helpId}
                        tabIndex={0}
                        onDragEnter={(event) => {
                            if (!mightContainCommerceImage(event.dataTransfer)) return;
                            event.preventDefault();
                            depth.current += 1;
                            setDragging(true);
                        }}
                        onDragOver={(event) => {
                            if (!mightContainCommerceImage(event.dataTransfer)) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = busy ? "none" : "copy";
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
                            void upload(readCommerceImageTransfer(event.dataTransfer));
                        }}
                        onPaste={(event) => {
                            if ((event.target as HTMLElement).closest('textarea,input:not([type="file"]),[contenteditable="true"]')) return;
                            const source = readCommerceImageTransfer(event.clipboardData);
                            if (!source.files.length && !source.resourceId && !source.url) return;
                            event.preventDefault();
                            event.stopPropagation();
                            void upload(source);
                        }}
                    >
                        {references.length ? (
                            <ol className="ecommerce-reference-gallery" aria-label={translate("ecommerce.referenceModePanel.uploadedInspirationImages")}>
                                {references.map((reference, index) => {
                                    const name = referenceName(reference, mode.value, index);
                                    return (
                                        <li key={`${reference.resourceId}:${index}`}>
                                            <ReferenceThumbnail reference={reference} name={name} />
                                            <span className="ecommerce-reference-gallery-name" title={name}>
                                                <small>{index + 1}</small>
                                                {name}
                                            </span>
                                            <button
                                                type="button"
                                                aria-label={translate("ecommerce.referenceModePanel.remove", { v0: String(name) })}
                                                title={translate("ecommerce.referenceModePanel.remove", { v0: String(name) })}
                                                disabled={busy}
                                                onClick={() => removeReference(index)}
                                            >
                                                <X size={13} aria-hidden="true" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : null}
                        <button type="button" className="ecommerce-reference-upload-button" disabled={busy} aria-label={translate("ecommerce.referenceModePanel.upload", { v0: String(label) })} onClick={() => fileInput.current?.click()}>
                            <Upload size={25} strokeWidth={1.5} aria-hidden="true" />
                            <span>
                                <strong>{references.length ? translate("ecommerce.referenceModePanel.addMore", { v0: String(label) }) : translate("ecommerce.referenceModePanel.clickToUpload", { v0: String(label) })}</strong>
                                <small>
                                    {busy ? translate("ecommerce.referenceModePanel.uploading") : dragging ? translate("ecommerce.referenceModePanel.dropToAddImages") : translate("ecommerce.referenceModePanel.multipleImagesSupportedDragOrPasteImagesToo")}
                                </small>
                            </span>
                        </button>
                        <input
                            ref={fileInput}
                            type="file"
                            multiple
                            hidden
                            aria-label={translate("ecommerce.referenceModePanel.uploadFiles", { v0: String(label) })}
                            accept={COMMERCE_IMAGE_ACCEPT}
                            disabled={busy}
                            onChange={(event) => {
                                const files = Array.from(event.target.files || []);
                                event.target.value = "";
                                if (files.length) void upload({ files });
                            }}
                        />
                    </div>
                    <p id={helpId} className="ecommerce-reference-upload-help">
                        {translate("ecommerce.referenceModePanel.onlyUploadImagesYouWantToReferenceAllAreUsed")}
                    </p>
                    {busy ? (
                        <p className="ecommerce-reference-upload-status" role="status">
                            <LoaderCircle size={13} className="commerce-planning-spin" />
                            {batchProgress || uploadProgress || translate("ecommerce.referenceModePanel.addingImages")}
                        </p>
                    ) : null}
                    {error ? (
                        <div className="ecommerce-reference-upload-error" role="alert">
                            <span>{error}</span>
                            {lastUpload.current ? (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                        if (lastUpload.current) void upload(lastUpload.current.source, lastUpload.current.mode);
                                    }}
                                >
                                    {translate("ecommerce.referenceModePanel.retryUpload")}
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                    {!references.length ? (
                        <p className="sr-only" role="status">
                            {translate("ecommerce.referenceModePanel.uploadInspirationImagesHerePlaceYourOwnProductImagesAbove")}
                        </p>
                    ) : null}
                </>
            )}
        </section>
    );
}

export function ReferenceScreenSummary({ screen }: { screen?: EcommerceReferenceScreen }) {
    if (!screen) return null;
    return (
        <div className="ecommerce-reference-screen-summary" aria-label={translate("ecommerce.referenceModePanel.originalLongImageScreenAnalysis", { v0: String(screen.screenIndex) })}>
            <strong>{translate("ecommerce.referenceModePanel.originalScreen", { count: screen.screenIndex })}</strong>
            {screen.resourceId ? (
                <CachedResourceImage
                    className="ecommerce-reference-screen-preview"
                    storageKey={resourceStorageKey(screen.resourceId)}
                    variant="thumbnail"
                    alt={translate("ecommerce.referenceModePanel.originalLongImageScreenReference", { v0: String(screen.screenIndex) })}
                    loading="lazy"
                    decoding="async"
                    fallback={
                        <span className="ecommerce-reference-thumbnail-empty" aria-label={translate("ecommerce.referenceModePanel.imageTemporarilyUnavailable")}>
                            <Images size={22} />
                        </span>
                    }
                    loadingFallback={
                        <span className="ecommerce-reference-thumbnail-empty" aria-label={translate("ecommerce.referenceModePanel.readingImage")}>
                            <LoaderCircle size={18} />
                        </span>
                    }
                />
            ) : null}
            <dl>
                <div>
                    <dt>{translate("ecommerce.referenceModePanel.content")}</dt>
                    <dd>{screen.content}</dd>
                </div>
                <div>
                    <dt>{translate("ecommerce.referenceModePanel.layout")}</dt>
                    <dd>{screen.layout}</dd>
                </div>
                <div>
                    <dt>{translate("ecommerce.referenceModePanel.visuals")}</dt>
                    <dd>{screen.visual}</dd>
                </div>
            </dl>
            {screen.sourceCopy ? (
                <details>
                    <summary>{translate("ecommerce.referenceModePanel.viewTextFromTheOriginalImage")}</summary>
                    <p>{screen.sourceCopy}</p>
                </details>
            ) : null}
        </div>
    );
}
