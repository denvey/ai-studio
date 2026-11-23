import { Button, Modal } from "antd";
import { useRef, useState } from "react";
import type { EcommerceDraft, EcommercePlan } from "@/services/api/ecommerce";
import { assertCommerceClaimsGrounded, assertCommercePlanCurrent, excludeCommerceFacts } from "./planner";
import { CommerceFactReview } from "./fact-review";

import { translate } from "@/i18n";
export function GenerationConfirmation({
    plan,
    draft,
    busy,
    completed,
    label,
    onConfirm,
    onSupplement,
}: {
    plan: EcommercePlan;
    draft: EcommerceDraft;
    busy: boolean;
    completed: boolean;
    label?: string;
    onConfirm: (reviewed: EcommercePlan) => Promise<void>;
    onSupplement: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState("");
    const locked = useRef(false);
    const remaining = plan.images.filter((image) => !image.taskId).length;
    const submit = async (reviewed: EcommercePlan) => {
        if (locked.current) return;
        locked.current = true;
        setConfirming(true);
        setError("");
        try {
            assertCommercePlanCurrent(reviewed, draft);
            assertCommerceClaimsGrounded(reviewed, draft);
            await onConfirm(reviewed);
            setOpen(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : translate("ecommerce.generationConfirmation.submissionFailedCheckThePlanAndRetry"));
        } finally {
            locked.current = false;
            setConfirming(false);
        }
    };
    return (
        <>
            {error ? (
                <p className="ecommerce-confirmation-note" role="alert">
                    {error}
                </p>
            ) : null}
            {!completed && plan.uncertainFacts.length ? (
                <p className="ecommerce-confirmation-note">
                    {translate("ecommerce.generationConfirmation.thereAre")} {plan.uncertainFacts.length} {translate("ecommerce.generationConfirmation.productDetailsToVerifyUseTheButtonBelowToAdd")}
                </p>
            ) : null}
            <Button
                type="primary"
                block
                loading={busy || confirming}
                disabled={busy || completed}
                onClick={() => {
                    setError("");
                    try {
                        assertCommercePlanCurrent(plan, draft);
                    } catch (cause) {
                        setError((cause as Error).message);
                        return;
                    }
                    if (plan.uncertainFacts.length) setOpen(true);
                    else void submit(plan);
                }}
            >
                {label ||
                    (completed
                        ? translate("ecommerce.generationConfirmation.imageTasksSubmitted")
                        : remaining < plan.images.length
                          ? translate("ecommerce.generationConfirmation.generateTheRemainingImages", { v0: String(remaining) })
                          : translate("ecommerce.generationConfirmation.confirmAndGenerateImages", { v0: String(plan.images.length) }))}
            </Button>
            <Modal
                title={translate("ecommerce.generationConfirmation.reviewProductInformationBeforeGenerating")}
                open={open}
                footer={null}
                onCancel={() => {
                    if (!confirming) setOpen(false);
                }}
                closable={!confirming}
                maskClosable={!confirming}
            >
                <p>{translate("ecommerce.generationConfirmation.theFollowingDetailsAreUnverifiedAndWillNotAutomaticallyBecome")}</p>
                {error ? (
                    <p className="ecommerce-confirmation-note" role="alert">
                        {error}
                    </p>
                ) : null}
                <div inert={confirming}>
                    <CommerceFactReview
                        facts={plan.uncertainFacts}
                        onApply={(value) => {
                            onSupplement(value);
                            setOpen(false);
                        }}
                        onExclude={() => void submit(excludeCommerceFacts(plan))}
                        excludeLabel={translate("ecommerce.generationConfirmation.excludeUnverifiedClaimsAndStartGenerating")}
                    />
                </div>
                {confirming ? <p role="status">{translate("ecommerce.generationConfirmation.savingTheReviewedPlanAndSubmittingImageTasks")}</p> : null}
            </Modal>
        </>
    );
}
