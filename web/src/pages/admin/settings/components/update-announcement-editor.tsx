import { createClientUUID } from "@/lib/client-id";
import { useRef, useState } from "react";
import { App, Button, Form, Input, Select } from "antd";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, Upload, Video, Type } from "lucide-react";
import { Switch } from "@/pages/admin/ui/controls";
import { UpdateAnnouncementContent } from "@/components/layout/update-announcement-content";
import { moveUpdateItem, type UpdateAnnouncement, type UpdateBlock, type UpdateRelease } from "@/lib/update-announcement";
import { updateAnnouncementPreviewURL, uploadAppearanceAsset } from "@/services/api/appearance";
import "./update-announcement-editor.css";
import { translate } from "@/i18n";

export function UpdateAnnouncementEditor({ value, onChange, disabled, onUploading }: { value: UpdateAnnouncement; onChange: (value: UpdateAnnouncement) => void; disabled: boolean; onUploading: (value: boolean) => void }) {
    const { message } = App.useApp();
    const [uploading, setUploading] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);
    const target = useRef<{ releaseId: string; blockId: string; type: "image" | "video" } | null>(null);
    const locked = disabled || Boolean(uploading);
    const change = (patch: Partial<UpdateAnnouncement>) => onChange({ ...value, ...patch });
    const changeRelease = (id: string, patch: Partial<UpdateRelease>) => {
        const before = value.releases.find((release) => release.id === id);
        change({ releases: value.releases.map((release) => (release.id === id ? { ...release, ...patch } : release)), ...(patch.version !== undefined && before?.version === value.currentVersion ? { currentVersion: patch.version } : {}) });
    };
    const changeBlock = (release: UpdateRelease, id: string, patch: Partial<UpdateBlock>) => changeRelease(release.id, { blocks: release.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)) });
    const addBlock = (release: UpdateRelease, type: UpdateBlock["type"]) => changeRelease(release.id, { blocks: [...release.blocks, { id: createClientUUID(), type, text: "", resourceId: "", caption: "", layout: "full" }] });
    async function upload(file?: File) {
        const selected = target.current;
        if (!file || !selected) return;
        const video = selected.type === "video";
        const allowed = video ? ["video/mp4", "video/webm"] : ["image/png", "image/jpeg", "image/webp"];
        const maxMB = video ? 256 : 10;
        if (!allowed.includes(file.type) || file.size <= 0 || file.size > maxMB * 1024 * 1024) {
            message.error(
                translate("adminPages.settings.updateAnnouncementEditor.pleaseSelectUpToMB", {
                    v0: String(video ? translate("adminPages.settings.updateAnnouncementEditor.mP4WebMVideo") : translate("adminPages.settings.updateAnnouncementEditor.pNGJPEGWebPImage")),
                    v1: String(maxMB),
                }),
            );
            return;
        }
        setUploading(selected.blockId);
        onUploading(true);
        try {
            const resource = await uploadAppearanceAsset(video ? "update-video" : "update-image", file);
            const release = value.releases.find((item) => item.id === selected.releaseId);
            if (release) changeBlock(release, selected.blockId, { resourceId: resource.id });
            message.success(translate("adminPages.settings.updateAnnouncementEditor.mediaUploadedItWillBeAppliedWithTheAnnouncementWhen"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("adminPages.settings.updateAnnouncementEditor.announcementMediaUploadFailed"));
        } finally {
            setUploading("");
            onUploading(false);
            target.current = null;
        }
    }
    return (
        <div className="admin-update-announcement-editor">
            <div className="admin-update-announcement-switch">
                <div>
                    <h3>{translate("adminPages.settings.updateAnnouncementEditor.customAnnouncements")}</h3>
                    <p>{translate("adminPages.settings.updateAnnouncementEditor.whenDisabledTheOriginalChangelogIsDisplayedWhenEnabledThe")}</p>
                </div>
                <Switch checked={value.enabled} disabled={locked} aria-label={translate("adminPages.settings.updateAnnouncementEditor.enableCustomAnnouncements")} onChange={(enabled) => change({ enabled })} />
            </div>
            <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(event) => {
                    void upload(event.target.files?.[0]);
                    event.currentTarget.value = "";
                }}
            />
            <div className="admin-update-announcement-layout">
                <div className="admin-update-announcement-fields">
                    <Form layout="vertical" disabled={locked}>
                        <Form.Item label={translate("adminPages.settings.updateAnnouncementEditor.currentlyDisplayedVersion")} htmlFor="update-current-version">
                            <Select
                                id="update-current-version"
                                aria-label={translate("adminPages.settings.updateAnnouncementEditor.currentlyDisplayedVersion")}
                                placeholder={translate("adminPages.settings.updateAnnouncementEditor.addAnAnnouncementVersionToSelectIt")}
                                value={value.currentVersion || undefined}
                                options={value.releases.filter((release) => release.version.trim()).map((release) => ({ value: release.version, label: release.version }))}
                                onChange={(currentVersion) => change({ currentVersion })}
                            />
                        </Form.Item>
                    </Form>
                    {value.releases.map((release, index) => (
                        <section className="admin-update-announcement-release" key={release.id}>
                            <div className="admin-update-announcement-toolbar">
                                <strong>
                                    {translate("adminPages.settings.updateAnnouncementEditor.announcementVersions")} {index + 1}
                                </strong>
                                <div>
                                    <Button
                                        aria-label={translate("adminPages.settings.updateAnnouncementEditor.moveAnnouncementVersionUp", { v0: String(index + 1) })}
                                        icon={<ArrowUp className="size-4" />}
                                        disabled={locked || index === 0}
                                        onClick={() => change({ releases: moveUpdateItem(value.releases, index, -1) })}
                                    />
                                    <Button
                                        aria-label={translate("adminPages.settings.updateAnnouncementEditor.moveAnnouncementVersionDown", { v0: String(index + 1) })}
                                        icon={<ArrowDown className="size-4" />}
                                        disabled={locked || index === value.releases.length - 1}
                                        onClick={() => change({ releases: moveUpdateItem(value.releases, index, 1) })}
                                    />
                                    <Button
                                        aria-label={translate("adminPages.settings.updateAnnouncementEditor.deleteAnnouncementVersion", { v0: String(index + 1) })}
                                        icon={<Trash2 className="size-4" />}
                                        disabled={locked}
                                        onClick={() => {
                                            const releases = value.releases.filter((item) => item.id !== release.id);
                                            change({ releases, currentVersion: release.version === value.currentVersion ? releases[0]?.version || "" : value.currentVersion });
                                        }}
                                    />
                                </div>
                            </div>
                            <Form layout="vertical" disabled={locked}>
                                <div className="admin-update-announcement-meta">
                                    <Form.Item label={translate("adminPages.settings.updateAnnouncementEditor.versionNumber")} htmlFor={`update-version-${release.id}`}>
                                        <Input
                                            id={`update-version-${release.id}`}
                                            value={release.version}
                                            maxLength={40}
                                            placeholder={translate("adminPages.settings.updateAnnouncementEditor.forExampleV200")}
                                            onChange={(event) => changeRelease(release.id, { version: event.target.value })}
                                        />
                                    </Form.Item>
                                    <Form.Item label={translate("adminPages.settings.updateAnnouncementEditor.releaseDateOptional")} htmlFor={`update-date-${release.id}`}>
                                        <Input id={`update-date-${release.id}`} type="date" value={release.date} onChange={(event) => changeRelease(release.id, { date: event.target.value })} />
                                    </Form.Item>
                                </div>
                                <Form.Item label={translate("adminPages.settings.updateAnnouncementEditor.titleOptional")} htmlFor={`update-title-${release.id}`}>
                                    <Input
                                        id={`update-title-${release.id}`}
                                        value={release.title}
                                        maxLength={100}
                                        placeholder={translate("adminPages.settings.updateAnnouncementEditor.thisUpdateSTheme")}
                                        onChange={(event) => changeRelease(release.id, { title: event.target.value })}
                                    />
                                </Form.Item>
                            </Form>
                            {release.blocks.map((block, blockIndex) => (
                                <div className="admin-update-announcement-block" key={block.id}>
                                    <div className="admin-update-announcement-toolbar">
                                        <strong>
                                            {block.type === "text" ? translate("adminPages.settings.updateAnnouncementEditor.text") : block.type === "image" ? translate("account.feedback.image") : translate("account.feedback.video")} {blockIndex + 1}
                                        </strong>
                                        <div>
                                            <Button
                                                aria-label={translate("adminPages.settings.updateAnnouncementEditor.moveContentBlockUpVersion", { v0: String(blockIndex + 1), v1: String(index + 1) })}
                                                icon={<ArrowUp className="size-4" />}
                                                disabled={locked || blockIndex === 0}
                                                onClick={() => changeRelease(release.id, { blocks: moveUpdateItem(release.blocks, blockIndex, -1) })}
                                            />
                                            <Button
                                                aria-label={translate("adminPages.settings.updateAnnouncementEditor.moveContentBlockDownVersion", { v0: String(blockIndex + 1), v1: String(index + 1) })}
                                                icon={<ArrowDown className="size-4" />}
                                                disabled={locked || blockIndex === release.blocks.length - 1}
                                                onClick={() => changeRelease(release.id, { blocks: moveUpdateItem(release.blocks, blockIndex, 1) })}
                                            />
                                            <Button
                                                aria-label={translate("adminPages.settings.updateAnnouncementEditor.deleteContentBlockVersion", { v0: String(blockIndex + 1), v1: String(index + 1) })}
                                                icon={<Trash2 className="size-4" />}
                                                disabled={locked}
                                                onClick={() => changeRelease(release.id, { blocks: release.blocks.filter((item) => item.id !== block.id) })}
                                            />
                                        </div>
                                    </div>
                                    <Form layout="vertical" disabled={locked}>
                                        <Form.Item label={translate("adminPages.settings.updateAnnouncementEditor.layout")} htmlFor={`update-layout-${block.id}`}>
                                            <Select
                                                id={`update-layout-${block.id}`}
                                                value={block.layout}
                                                options={[
                                                    { value: "full", label: translate("adminPages.settings.updateAnnouncementEditor.fullWidth") },
                                                    { value: "half", label: translate("adminPages.settings.updateAnnouncementEditor.halfWidthAdjacentHalfWidthBlocksAppearSideBySide") },
                                                ]}
                                                onChange={(layout) => changeBlock(release, block.id, { layout })}
                                            />
                                        </Form.Item>
                                        {block.type === "text" ? (
                                            <Form.Item
                                                label={translate("adminPages.settings.updateAnnouncementEditor.body")}
                                                htmlFor={`update-text-${block.id}`}
                                                extra={translate("adminPages.settings.updateAnnouncementEditor.supportsLineBreaksListsAndMarkdownBoldText")}
                                            >
                                                <Input.TextArea
                                                    id={`update-text-${block.id}`}
                                                    value={block.text}
                                                    maxLength={10000}
                                                    autoSize={{ minRows: 4, maxRows: 14 }}
                                                    onChange={(event) => changeBlock(release, block.id, { text: event.target.value })}
                                                />
                                            </Form.Item>
                                        ) : (
                                            <>
                                                <Button
                                                    disabled={locked}
                                                    loading={uploading === block.id}
                                                    icon={<Upload className="size-4" />}
                                                    onClick={() => {
                                                        target.current = { releaseId: release.id, blockId: block.id, type: block.type as "image" | "video" };
                                                        if (fileInput.current) {
                                                            fileInput.current.accept = block.type === "image" ? "image/png,image/jpeg,image/webp" : "video/mp4,video/webm";
                                                            fileInput.current.click();
                                                        }
                                                    }}
                                                >
                                                    {block.resourceId ? translate("adminPages.settings.updateAnnouncementEditor.change") : translate("canvasA.assetView.upload")}
                                                    {block.type === "image" ? translate("adminPages.settings.updateAnnouncementEditor.imageUpTo10MB") : translate("adminPages.settings.updateAnnouncementEditor.videoUpTo256MB")}
                                                </Button>
                                                <Form.Item label={translate("adminPages.settings.updateAnnouncementEditor.mediaCaptionOptional")} htmlFor={`update-caption-${block.id}`}>
                                                    <Input id={`update-caption-${block.id}`} value={block.caption} maxLength={200} onChange={(event) => changeBlock(release, block.id, { caption: event.target.value })} />
                                                </Form.Item>
                                            </>
                                        )}
                                    </Form>
                                </div>
                            ))}
                            <div className="admin-update-announcement-add-actions">
                                {(
                                    [
                                        ["text", translate("adminPages.settings.updateAnnouncementEditor.addText"), Type],
                                        ["image", translate("adminPages.settings.updateAnnouncementEditor.addImage"), ImagePlus],
                                        ["video", translate("adminPages.settings.updateAnnouncementEditor.addVideo"), Video],
                                    ] as const
                                ).map(([type, label, Icon]) => (
                                    <Button key={type} disabled={locked || release.blocks.length >= 50} icon={<Icon className="size-4" />} onClick={() => addBlock(release, type)}>
                                        {label}
                                    </Button>
                                ))}
                            </div>
                        </section>
                    ))}
                    <Button
                        disabled={locked || value.releases.length >= 30}
                        icon={<Plus className="size-4" />}
                        onClick={() => change({ releases: [...value.releases, { id: createClientUUID(), version: "", title: "", date: "", blocks: [{ id: createClientUUID(), type: "text", text: "", resourceId: "", caption: "", layout: "full" }] }] })}
                    >
                        {translate("adminPages.settings.updateAnnouncementEditor.addAnnouncementVersion")}
                    </Button>
                </div>
                <aside className="admin-update-announcement-preview" aria-label={translate("adminPages.settings.updateAnnouncementEditor.liveAnnouncementPreview")}>
                    <div className="admin-update-announcement-preview-heading">
                        <strong>
                            {translate("adminPages.settings.updateAnnouncementEditor.announcement")} {value.currentVersion || translate("adminPages.settings.updateAnnouncementEditor.versionNotEntered")}
                        </strong>
                        <span>{translate("adminPages.settings.updateAnnouncementEditor.livePreviewAppliedAfterSaving")}</span>
                    </div>
                    <UpdateAnnouncementContent value={value} mediaURL={(block) => (block.resourceId ? updateAnnouncementPreviewURL(block.resourceId) : "")} />
                </aside>
            </div>
        </div>
    );
}
