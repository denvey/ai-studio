import { App, Button, Modal, Select, Switch } from "antd";
import { Check, Images, Search, Trash2, ZoomIn } from "lucide-react";
import { useState } from "react";
import { resourceStorageKey } from "@/services/api/resources";
import { CachedResourceImage } from "@/components/cached-resource-image";
import type { EcommerceReference } from "@/services/api/ecommerce";
import { commerceModelCatalog, commerceModelById, type CommerceModelProfile } from "./model-catalog";
import { commerceUiText } from "./ui-text";
import "./model-picker.css";

import { translate } from "@/i18n";
type Props = {
    enabled: boolean;
    references: EcommerceReference[];
    primaryId?: string;
    uploading: boolean;
    onEnabledChange: (enabled: boolean) => void;
    onUpload: (files: FileList | null) => void;
    onAddCatalog: (profile: CommerceModelProfile) => Promise<void>;
    onRemove: (resourceId: string) => void;
    onPrimary: (resourceId: string) => void;
};

export function EcommerceModelPicker({ enabled, references, primaryId, uploading, onEnabledChange, onUpload, onAddCatalog, onRemove, onPrimary }: Props) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const [preview, setPreview] = useState<CommerceModelProfile | null>(null);
    const [kind, setKind] = useState("all");
    const [gender, setGender] = useState("all");
    const [age, setAge] = useState("all");
    const [country, setCountry] = useState("all");
    const [adding, setAdding] = useState("");
    const visible = commerceModelCatalog.filter((item) => (kind === "all" || item.kind === kind) && (gender === "all" || item.gender === gender) && (age === "all" || item.age === age) && (country === "all" || item.country === country));
    const add = async (profile: CommerceModelProfile) => {
        if (references.some((ref) => ref.catalogId === profile.id)) return;
        setAdding(profile.id);
        try {
            await onAddCatalog(profile);
            message.success(translate("ecommerce.modelPicker.added", { v0: commerceUiText(profile.name) }));
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : translate("ecommerce.modelPicker.failedToAddModel"));
        } finally {
            setAdding("");
        }
    };
    return (
        <section className="ecommerce-model-picker" aria-label={translate("ecommerce.modelPicker.modelReferenceImages")}>
            <div className="ecommerce-model-heading">
                <strong>{translate("ecommerce.modelPicker.modelReferenceImages")}</strong>
                <div>
                    <span>{translate("ecommerce.modelPicker.useAModel")}</span>
                    <Switch aria-label={translate("ecommerce.modelPicker.useAModel")} checked={enabled} onChange={onEnabledChange} />
                    <Button size="small" icon={<Images size={14} />} onClick={() => setOpen(true)}>
                        {translate("ecommerce.modelPicker.exampleLibrary")}
                    </Button>
                </div>
            </div>
            {enabled ? (
                <>
                    <p className="ecommerce-model-hint">{translate("ecommerce.modelPicker.uploadAPersonOrMannequinOrChooseFromTheExample")}</p>
                    <div className="ecommerce-model-refs">
                        {references.map((ref) => (
                            <div className="ecommerce-model-ref" key={ref.resourceId}>
                                <CachedResourceImage
                                    storageKey={resourceStorageKey(ref.resourceId)}
                                    alt={ref.name || translate("ecommerce.modelPicker.modelReferenceImages")}
                                    loading="lazy"
                                    decoding="async"
                                    fallback={<span className="ecommerce-model-ref-image-fallback" aria-label={translate("ecommerce.modelPicker.imageTemporarilyUnavailable")} />}
                                    loadingFallback={<span className="ecommerce-model-ref-image-fallback" aria-label={translate("ecommerce.modelPicker.readingImage")} />}
                                />
                                <div>
                                    <strong>{ref.name || commerceModelById(ref.catalogId)?.name || translate("ecommerce.modelPicker.customModel")}</strong>
                                    <Button type="text" size="small" aria-label={translate("ecommerce.modelPicker.remove", { v0: String(ref.name || translate("ecommerce.modelPicker.model")) })} icon={<Trash2 size={13} />} onClick={() => onRemove(ref.resourceId)} />
                                </div>
                                <Select
                                    size="small"
                                    aria-label={translate("ecommerce.modelPicker.roleOf", { v0: String(ref.name || translate("ecommerce.modelPicker.model")) })}
                                    value={primaryId === ref.resourceId ? "primary" : "support"}
                                    options={[
                                        { value: "primary", label: translate("ecommerce.modelPicker.primaryModelThroughoutTheSet") },
                                        { value: "support", label: translate("ecommerce.modelPicker.supportingModelMultiplePersonScenesOnly") },
                                    ]}
                                    onChange={(value) => {
                                        if (value === "primary") onPrimary(ref.resourceId);
                                        else if (primaryId === ref.resourceId) onPrimary(references.find((item) => item.resourceId !== ref.resourceId)?.resourceId || ref.resourceId);
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                    <label className="ecommerce-model-upload">
                        {uploading ? translate("ecommerce.modelPicker.uploading") : translate("ecommerce.modelPicker.uploadModelReference")}
                        <input
                            type="file"
                            aria-label={translate("ecommerce.modelPicker.uploadModelReferenceImages")}
                            accept="image/png,image/jpeg,image/webp"
                            multiple
                            disabled={uploading}
                            onChange={(event) => {
                                onUpload(event.target.files);
                                event.target.value = "";
                            }}
                        />
                    </label>
                </>
            ) : (
                <p className="ecommerce-model-hint">{translate("ecommerce.modelPicker.whenDisabledModelReferencesAreUsedInNeitherPlanningNor")}</p>
            )}
            <Modal title={translate("ecommerce.modelPicker.modelExampleLibraryMultipleViewsAndDetails")} open={open} onCancel={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>{translate("account.payment.done")}</Button>} width={1000} destroyOnHidden>
                <p className="ecommerce-model-hint">{translate("ecommerce.modelPicker.theInitialCollectionCoversChinaTheUnitedStatesIndiaJapan")}</p>
                <div className="ecommerce-model-filters">
                    <Select
                        aria-label={translate("ecommerce.modelPicker.characterType")}
                        value={kind}
                        onChange={setKind}
                        options={[
                            { value: "all", label: translate("ecommerce.modelPicker.peopleAndMannequins") },
                            { value: "person", label: translate("ecommerce.modelPicker.humanModels") },
                            { value: "mannequin", label: translate("ecommerce.modelPicker.clothingMannequins") },
                        ]}
                    />
                    <Select
                        aria-label={translate("ecommerce.modelPicker.gender")}
                        value={gender}
                        onChange={setGender}
                        options={[
                            { value: "all", label: translate("ecommerce.modelPicker.anyGender") },
                            { value: "female", label: translate("ecommerce.modelPicker.female") },
                            { value: "male", label: translate("ecommerce.modelPicker.male") },
                        ]}
                    />
                    <Select
                        aria-label={translate("ecommerce.modelPicker.age")}
                        value={age}
                        onChange={setAge}
                        options={[
                            { value: "all", label: translate("ecommerce.modelPicker.anyAge") },
                            { value: "child", label: translate("ecommerce.modelPicker.children") },
                            { value: "adult", label: translate("ecommerce.modelPicker.adults") },
                            { value: "mature", label: translate("ecommerce.modelPicker.olderAdults") },
                        ]}
                    />
                    <Select aria-label={translate("ecommerce.modelPicker.countriesAndRegions")} value={country} onChange={setCountry} options={[{ value: "all", label: translate("ecommerce.modelPicker.allMarkets") }, ...[...new Set(commerceModelCatalog.map((item) => item.country))].map((value) => ({ value, label: commerceUiText(value ) }))]} />
                </div>
                <div className="ecommerce-model-grid">
                    {visible.map((item) => {
                        const selected = references.some((ref) => ref.catalogId === item.id);
                        return (
                            <article className="ecommerce-model-card" key={item.id}>
                                <div className="ecommerce-model-card-image">
                                    <button type="button" className="ecommerce-model-image-open" aria-label={translate("ecommerce.modelPicker.enlarge", { v0: commerceUiText(item.name) })} onClick={() => setPreview(item)}>
                                        <img src={item.image} alt={translate("ecommerce.modelPicker.multipleViewsAndDetails", { v0: commerceUiText(item.name) })} loading="lazy" />
                                    </button>
                                    <div className="ecommerce-model-card-actions">
                                        <Button icon={<ZoomIn size={14} />} onClick={() => setPreview(item)}>
                                            {translate("canvasA.focusBar.zoomIn")}
                                        </Button>
                                        <Button type={selected ? "default" : "primary"} icon={selected ? <Check size={14} /> : <Search size={14} />} loading={adding === item.id} disabled={selected || Boolean(adding)} onClick={() => void add(item)}>
                                            {selected ? translate("ecommerce.modelPicker.selected") : translate("ecommerce.modelPicker.select")}
                                        </Button>
                                    </div>
                                </div>
                                <strong>{commerceUiText(item.name)}</strong>
                                <small>{commerceUiText(item.description)}</small>
                            </article>
                        );
                    })}
                </div>
            </Modal>
            <Modal
                title={preview? commerceUiText(preview.name ) : translate("ecommerce.modelPicker.modelPreview")}
                open={Boolean(preview)}
                onCancel={() => setPreview(null)}
                footer={
                    preview ? (
                        <Button type="primary" disabled={references.some((ref) => ref.catalogId === preview.id)} loading={adding === preview.id} onClick={() => void add(preview)}>
                            {references.some((ref) => ref.catalogId === preview.id) ? translate("ecommerce.modelPicker.selected") : translate("ecommerce.modelPicker.selectThisModel")}
                        </Button>
                    ) : null
                }
                width={1120}
            >
                {preview ? <img className="ecommerce-model-preview" src={preview.image} alt={translate("ecommerce.modelPicker.frontSideAngledViewsAndDetails", { v0: commerceUiText(preview.name) })} /> : null}
            </Modal>
        </section>
    );
}
