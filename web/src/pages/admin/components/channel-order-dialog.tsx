import { App, Button, InputNumber, Spin } from "antd";
import { AdminModal } from "@/pages/admin/ui/overlays";
import { ArrowDown, ArrowUp, GripVertical, ListOrdered } from "lucide-react";
import { useRef, useState } from "react";
import { AdminEmpty } from "@/pages/admin/components/admin-ui";
import { getChannelOrder, saveChannelOrder, type ChannelOrderItem } from "@/services/api/channel-order";
import { Select } from "@/components/ui/base/select";
import { translate } from "@/i18n";

export function moveOrderItem<T extends { id: string }>(items: T[], id: string, target: number): T[] {
    const from = items.findIndex((item) => item.id === id);
    if (from < 0 || !Number.isInteger(target) || target < 0 || target >= items.length || from === target) return items;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(target, 0, item!);
    return next;
}

export function ChannelOrderDialog({ channelId, onSaved }: { channelId?: string; onSaved: () => Promise<void> }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false),
        [loading, setLoading] = useState(false),
        [saving, setSaving] = useState(false);
    const [items, setItems] = useState<ChannelOrderItem[]>([]),
        [original, setOriginal] = useState<string[]>([]);
    const [targetId, setTargetId] = useState<string>();
    const [targetPosition, setTargetPosition] = useState<number | null>(null);
    const dragged = useRef<string | null>(null),
        pending = useRef(false);
    const changed = items.some((item, index) => item.id !== original[index]);
    const start = async () => {
        setOpen(true);
        setLoading(true);
        setItems([]);
        setOriginal([]);
        setTargetId(undefined);
        setTargetPosition(null);
        try {
            const result = await getChannelOrder(channelId);
            setItems(result.items);
            setOriginal(result.items.map((item) => item.id));
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channelOrderDialog.failedToLoadItemOrder"));
            setOpen(false);
        } finally {
            setLoading(false);
        }
    };
    const save = async () => {
        if (pending.current || !changed) return;
        pending.current = true;
        setSaving(true);
        try {
            await saveChannelOrder(
                channelId,
                items.map((item) => item.id),
                original,
            );
            setOpen(false);
            message.success(translate("admin.channelOrderDialog.orderSavedUsersWillSeeItemsInThisOrder"));
            try {
                await onSaved();
            } catch (error) {
                message.warning(error instanceof Error ? translate("admin.channelOrderDialog.orderSavedButRefreshingTheListFailed", { v0: String(error.message) }) : translate("admin.channelOrderDialog.orderSavedRefreshThePageToViewIt"));
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channelOrderDialog.failedToSaveItemOrder"));
        } finally {
            pending.current = false;
            setSaving(false);
        }
    };
    return (
        <>
            <Button icon={<ListOrdered className="size-4" />} onClick={() => void start()}>
                {channelId ? translate("admin.channelOrderDialog.customOrder") : translate("admin.channelOrderDialog.setOrder")}
            </Button>
            <AdminModal
                title={channelId ? translate("admin.channelOrderDialog.customModelOrder") : translate("admin.channelOrderDialog.reorderChannels")}
                open={open}
                onCancel={() => setOpen(false)}
                closable={!saving && !loading}
                mask={{ closable: !saving && !loading }}
                keyboard={!saving && !loading}
                width={600}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button disabled={saving || loading} onClick={() => setOpen(false)}>
                            {translate("common.cancel")}
                        </Button>
                        <Button type="primary" loading={saving} disabled={!changed || loading} onClick={() => void save()}>
                            {translate("admin.channelOrderDialog.saveOrder")}
                        </Button>
                    </div>
                }
            >
                <p className="mb-4 text-sm text-foreground/60">{translate("admin.channelOrderDialog.selectAnItemAndEnterItsTargetPositionDragIt")}</p>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Select
                        className="min-w-40 flex-1"
                        aria-label={channelId ? translate("admin.channelOrderDialog.selectAModelToReorder") : translate("admin.channelOrderDialog.selectAChannelToReorder")}
                        placeholder={channelId ? translate("admin.channelOrderDialog.searchAndSelectAModel") : translate("admin.channelOrderDialog.searchAndSelectAChannel")}
                        showSearch={{ optionFilterProp: "label" }}
                        value={targetId}
                        disabled={loading || saving || !items.length}
                        options={items.map((item, index) => ({ value: item.id, label: `${index + 1}. ${item.name}${item.enabled ? "" : translate("admin.channelOrderDialog.disabled")}` }))}
                        onChange={(id: string) => {
                            setTargetId(id);
                            setTargetPosition(items.findIndex((item) => item.id === id) + 1);
                        }}
                    />
                    <InputNumber
                        aria-label={translate("admin.channelOrderDialog.targetPosition")}
                        placeholder={translate("admin.channelOrderDialog.position")}
                        min={1}
                        max={items.length || 1}
                        precision={0}
                        value={targetPosition}
                        disabled={loading || saving || !targetId}
                        onChange={setTargetPosition}
                    />
                    <Button
                        disabled={loading || saving || !targetId || targetPosition === null || !Number.isInteger(targetPosition) || targetPosition < 1 || targetPosition > items.length}
                        onClick={() => {
                            if (targetId && targetPosition !== null) setItems((current) => moveOrderItem(current, targetId, targetPosition - 1));
                        }}
                    >
                        {translate("admin.channelOrderDialog.moveToThisPosition")}
                    </Button>
                </div>
                <Spin spinning={loading}>
                    <div className="max-h-[55vh] overflow-y-auto space-y-2" role="list" aria-label={translate("admin.channelOrderDialog.displayOrder")}>
                        {!loading && !items.length ? (
                            <AdminEmpty size="compact" title={translate("admin.channelOrderDialog.noItemsToReorder")} />
                        ) : (
                            items.map((item, index) => (
                                <div
                                    role="listitem"
                                    key={item.id}
                                    draggable={!saving}
                                    onDragStart={(event) => {
                                        event.dataTransfer.setData("text/plain", item.id);
                                        dragged.current = item.id;
                                    }}
                                    onDragEnd={() => {
                                        dragged.current = null;
                                    }}
                                    onDragOver={(event) => {
                                        if (!saving) event.preventDefault();
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        const source = dragged.current;
                                        if (!saving && source) setItems((current) => moveOrderItem(current, source, index));
                                        dragged.current = null;
                                    }}
                                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
                                >
                                    <GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-foreground/40" />
                                    <span className="shrink-0 text-xs tabular-nums text-foreground/50">{index + 1}</span>
                                    <span className="min-w-0 flex-1 break-words">
                                        {item.name}
                                        {!item.enabled && <span className="ml-2 text-xs text-foreground/45">{translate("admin.channelOrderDialog.disabled2")}</span>}
                                    </span>
                                    <Button
                                        aria-label={translate("admin.channelOrderDialog.moveUp", { v0: String(item.name) })}
                                        title={translate("admin.channelOrderDialog.moveUp2")}
                                        icon={<ArrowUp className="size-4" />}
                                        disabled={saving || index === 0}
                                        onClick={() => setItems((current) => moveOrderItem(current, item.id, index - 1))}
                                    />
                                    <Button
                                        aria-label={translate("admin.channelOrderDialog.moveDown", { v0: String(item.name) })}
                                        title={translate("admin.channelOrderDialog.moveDown2")}
                                        icon={<ArrowDown className="size-4" />}
                                        disabled={saving || index === items.length - 1}
                                        onClick={() => setItems((current) => moveOrderItem(current, item.id, index + 1))}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </Spin>
            </AdminModal>
        </>
    );
}
