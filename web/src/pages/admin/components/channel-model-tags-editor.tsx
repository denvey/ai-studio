import { Button, Form, Input } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { ModelTags } from "@/components/model-tags";
import { modelTagColors, type ModelTag } from "@/lib/model-tags";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

export function ChannelModelTagsEditor() {
    const form = Form.useFormInstance();
    const tags: ModelTag[] = Form.useWatch("tags", form) || [];
    return <Form.Item label={translate("admin.channelModelTagsEditor.displayTags")} extra={translate("admin.channelModelTagsEditor.upTo5Tags12CharactersEachShownInUsers")}>
        <Form.List name="tags" rules={[{ validator: async (_, value: ModelTag[] = []) => {
            if (value.length > 5) throw new Error(translate("admin.channelModelTagsEditor.addUpTo5Tags"));
            const texts = value.map((tag) => tag?.text?.trim()).filter(Boolean);
            if (new Set(texts).size !== texts.length) throw new Error(translate("admin.channelModelTagsEditor.tagTextMustBeUnique"));
        } }]}>
            {(fields, { add, remove }, { errors }) => <div className="grid gap-2">
                {fields.map(({ key, name, ...rest }) => <div key={key} className="flex flex-wrap items-start gap-2">
                    <Form.Item {...rest} name={[name, "text"]} className="mb-0 min-w-32 flex-1" rules={[{ validator: async (_, value: string) => {
                        const length = Array.from(value?.trim() || "").length;
                        if (length < 1 || length > 12) throw new Error(translate("admin.channelModelTagsEditor.tagTextMustContain112Characters"));
                    } }]}>
                        <Input aria-label={translate("admin.channelModelTagsEditor.tagText", { v0: String(name + 1) })} placeholder={translate("admin.channelModelTagsEditor.eGLimitedTimeOffer90OffOfficialPrice")} />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, "color"]} className="mb-0 w-28" rules={[{ required: true, message: translate("admin.channelModelTagsEditor.selectAColor") }]}>
                        <Select aria-label={translate("admin.channelModelTagsEditor.tagColor", { v0: String(name + 1) })} options={modelTagColors.map((color) => ({ value: color.value, label: <span className="model-tag" data-color={color.value}>{color.label}</span> }))} />
                    </Form.Item>
                    <Button type="text" aria-label={translate("admin.channelModelTagsEditor.deleteTag", { v0: String(name + 1) })} icon={<Trash2 className="size-4" />} onClick={() => remove(name)} />
                </div>)}
                <Button type="dashed" icon={<Plus className="size-4" />} disabled={fields.length >= 5} onClick={() => add({ text: "", color: "purple" })}>{translate("admin.channelModelTagsEditor.addTag")}</Button>
                <Form.ErrorList errors={errors} />
                {tags.some((tag) => tag?.text?.trim()) ? <div><span className="text-xs text-foreground/60">{translate("admin.channelModelTagsEditor.displayPreview")}</span><ModelTags tags={tags.filter((tag) => tag?.text?.trim())} /></div> : null}
            </div>}
        </Form.List>
    </Form.Item>;
}
