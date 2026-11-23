import { Button, Form, Input, Select } from "antd";

import { AppModal } from "@/components/ui/product/app-modal";
import type { CreationInspiration } from "@/lib/inspirations/catalog";
import { normalizeDraft, type InspirationDraft } from "@/stores/use-inspiration-store";
import { translate } from "@/i18n";


export type InspirationCategoryChoice = { label: string; value: string };

/** 编辑器只收集用户能填的字段；id、来源、署名由本地库自己管。 */
type FormValues = {
    title: string;
    description?: string;
    image: string;
    mode: CreationInspiration["mode"];
    category?: string;
    tags?: string;
    ratio?: string;
    prompt: string;
    promptZh?: string;
};

function toFormValues(item: CreationInspiration | null): FormValues {
    return {
        title: item?.title ?? "",
        description: item?.description ?? "",
        image: item?.image ?? "",
        mode: item?.mode ?? "image",
        category: item?.category ?? "",
        tags: item?.tags?.join("，") ?? "",
        ratio: item?.ratio ?? "",
        prompt: item?.prompt ?? "",
        promptZh: item?.promptZh ?? "",
    };
}

export function InspirationEditorModal({
    open,
    item,
    categoryOptions,
    onClose,
    onSubmit,
}: {
    open: boolean;
    item: CreationInspiration | null;
    categoryOptions: InspirationCategoryChoice[];
    onClose: () => void;
    onSubmit: (draft: InspirationDraft) => void;
}) {
    const [form] = Form.useForm<FormValues>();

    const handleOk = async () => {
        const values = await form.validateFields().catch(() => null);
        if (!values) return;
        const tags = (values.tags ?? "")
            .split(/[，,]/)
            .map((tag) => tag.trim())
            .filter(Boolean);
        // 走 store 里同一套收敛规则，表单不做第二套校验。
        const draft = normalizeDraft({
            title: values.title,
            description: values.description ?? "",
            image: values.image,
            mode: values.mode,
            prompt: values.prompt,
            promptZh: values.promptZh,
            category: values.category,
            ratio: values.ratio,
            ...(tags.length ? { tags } : {}),
        });
        onSubmit(draft);
        form.resetFields();
        onClose();
    };

    return (
        <AppModal
            open={open}
            title={item ? translate("shared.inspirations.inspirationEditorModal.editInspiration") : translate("shared.inspirations.inspirationEditorModal.newInspiration")}
            width={720}
            onCancel={() => {
                form.resetFields();
                onClose();
            }}
            afterOpenChange={(visible) => {
                if (visible) form.setFieldsValue(toFormValues(item));
            }}
            footer={
                <div className="flex justify-end gap-2">
                    <Button
                        onClick={() => {
                            form.resetFields();
                            onClose();
                        }}
                    >
                        {translate("common.cancel")}
                    </Button>
                    <Button type="primary" onClick={() => void handleOk()}>
                        {item ? translate("common.save") : translate("shared.inspirations.inspirationEditorModal.created")}
                    </Button>
                </div>
            }
        >
            <Form form={form} layout="vertical" initialValues={toFormValues(item)} preserve={false}>
                {/* 字段较多，不限高的话底部按钮会被顶出视口，提交就点不到了。 */}
                <div className="max-h-[64vh] overflow-y-auto pr-1">
                    <Form.Item name="title" label={translate("library.assets.form.title")} rules={[{ required: true, message: translate("shared.inspirations.inspirationEditorModal.enterATitle") }]}>
                        <Input placeholder={translate("shared.inspirations.inspirationEditorModal.forExamplePremiumSkincareCampaignVisual")} maxLength={80} />
                    </Form.Item>
                    <Form.Item name="description" label={translate("shared.inspirations.inspirationEditorModal.oneLineDescription")}>
                        <Input placeholder={translate("shared.inspirations.inspirationEditorModal.explainWhatThisPromptIsUsefulForInTwoLines")} maxLength={120} />
                    </Form.Item>
                    <Form.Item name="image" label={translate("shared.inspirations.inspirationEditorModal.coverURL")} rules={[{ required: true, message: translate("shared.inspirations.inspirationEditorModal.enterACoverImageURL") }]}>
                        <Input placeholder={translate("shared.inspirations.inspirationEditorModal.anImageURLStartingWithHttpsOrALocalPath")} />
                    </Form.Item>
                    <div className="grid gap-x-4 sm:grid-cols-3">
                        <Form.Item name="mode" label={translate("shared.inspirations.inspirationEditorModal.creationType")} rules={[{ required: true }]}>
                            <Select
                                options={[
                                    { label: translate("account.feedback.image"), value: "image" },
                                    { label: translate("account.feedback.video"), value: "video" },
                                    { label: translate("account.settings.modelConfig.capabilities.text"), value: "text" },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item name="category" label={translate("library.picker.category")}>
                            <Select allowClear showSearch placeholder={translate("shared.inspirations.inspirationEditorModal.selectOneOrLeaveBlank")} options={categoryOptions} />
                        </Form.Item>
                        <Form.Item name="ratio" label={translate("shared.inspirations.inspirationEditorModal.aspectRatio")}>
                            <Input placeholder={translate("shared.inspirations.inspirationEditorModal.forExample169")} maxLength={12} />
                        </Form.Item>
                    </div>
                    <Form.Item name="tags" label={translate("library.assets.form.tags")} extra={translate("shared.inspirations.inspirationEditorModal.separateWithCommasUpToSix")}>
                        <Input placeholder={translate("shared.inspirations.inspirationEditorModal.productPhotographyPosterLayout")} maxLength={120} />
                    </Form.Item>
                    <Form.Item name="prompt" label={translate("shared.inspirations.inspirationEditorModal.promptText")} rules={[{ required: true, message: translate("shared.inspirations.inspirationEditorModal.enterThePromptText") }]}>
                        <Input.TextArea rows={6} placeholder={translate("shared.inspirations.inspirationEditorModal.pasteTheFullPromptEnglishPromptsFromOtherSourcesCan")} />
                    </Form.Item>
                    <Form.Item name="promptZh" label={translate("shared.inspirations.inspirationEditorModal.chineseTextOptional")} extra={translate("shared.inspirations.inspirationEditorModal.whenProvidedCardsAndCreateWithThisIdeaWillPrefer")}>
                        <Input.TextArea rows={4} placeholder={translate("shared.inspirations.inspirationEditorModal.chineseRewriteLeaveBlankToUseOnlyTheTextAbove")} />
                    </Form.Item>
                </div>
            </Form>
        </AppModal>
    );
}
