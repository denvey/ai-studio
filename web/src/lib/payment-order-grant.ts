import { formatCredits } from "@/constant/credits";
import { formatStorageCapacity, formatStorageDuration } from "@/lib/account-storage-usage";
import type { PaymentOrder } from "@/services/api/payments";
import { translate } from "@/i18n";

/** 订单发放的权益描述：积分数量或扩容容量与有效期。 */
export function paymentOrderGrantLabel(order: Pick<PaymentOrder, "productKind" | "creditsMicrocredits" | "storageBytes" | "storageDurationDays">) {
    if (order.productKind === "storage") return translate("shared.paymentOrderGrant.storage", { v0: String(formatStorageCapacity(order.storageBytes || 0)), v1: String(formatStorageDuration(order.storageDurationDays || 0)) });
    return translate("shared.modelPicker.credits", { v0: String(formatCredits(order.creditsMicrocredits, 6)) });
}
