import { Button, Input } from "antd";
import { useState } from "react";
import "./fact-review.css";

import { translate } from "@/i18n";
export function CommerceFactReview({ facts, onApply, onExclude, excludeLabel }: { facts: string[]; onApply: (verified: string) => void; onExclude: () => void; excludeLabel?: string }) {
    const [verified, setVerified] = useState("");
    if (!facts.length) return null;
    return (
        <div className="ecommerce-fact-review">
            <strong>{translate("ecommerce.factReview.verifyProductInformation")}</strong>
            <ul>
                {facts.map((fact, index) => (
                    <li key={index}>{fact}</li>
                ))}
            </ul>
            <label>{translate("ecommerce.factReview.addVerifiedFacts")}<Input.TextArea rows={3} value={verified} placeholder={translate("ecommerce.factReview.forExampleTheStrapMaterialIsConfirmedAsPUEnter")} onChange={(event) => setVerified(event.target.value)} />
            </label>
            <p>{translate("ecommerce.factReview.replanAfterAddingVerifiedFactsYouCanAlsoReviewThe")}</p>
            <Button size="small" disabled={!verified.trim()} onClick={() => onApply(verified.trim())}>{translate("ecommerce.factReview.saveVerifiedDetails")}</Button>{" "}
            <Button size="small" onClick={onExclude}>
                {excludeLabel || translate("ecommerce.factReview.reviewedExcludeTheseClaims")}
            </Button>
        </div>
    );
}
