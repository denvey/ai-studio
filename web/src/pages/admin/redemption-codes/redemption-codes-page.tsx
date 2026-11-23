import { Button } from "antd";
import { TicketCheck } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { AdminPageFrame } from "../components/admin-shell";
import { translate } from "@/i18n";


const RedemptionCodesPanel = lazy(() => import("../components/redemption-codes-panel"));

export default function RedemptionCodesPage() {
    const [createOpen, setCreateOpen] = useState(false);
    const [createBlocked, setCreateBlocked] = useState(false);

    return (
        <AdminPageFrame
            title={translate("account.wallet.redeemTitle")}
            description={translate("adminPages.redemptionCodes.redemptionCodesPage.issueBatchesAndTrackRedemptionStatusAndDetails")}
            actions={
                <Button type="primary" disabled={createBlocked} title={createBlocked ? translate("adminPages.redemptionCodes.redemptionCodesPage.pleaseCheckThePreviousGenerationRequestWithAnUncertainResult") : undefined} icon={<TicketCheck className="size-4" />} onClick={() => setCreateOpen(true)}>
                    {translate("adminPages.redemptionCodes.redemptionCodesPage.generateBatch")}
                </Button>
            }
        >
            <Suspense fallback={<div className="py-16 text-center text-sm text-foreground/50">{translate("adminPages.redemptionCodes.redemptionCodesPage.loadingRedemptionCodeBatches")}</div>}>
                <RedemptionCodesPanel createOpen={createOpen} onCreateOpenChange={setCreateOpen} onCreateBlockedChange={setCreateBlocked} />
            </Suspense>
        </AdminPageFrame>
    );
}
