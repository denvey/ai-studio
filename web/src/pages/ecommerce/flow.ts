/**
 * 电商创作的一条完整流程：准备素材 → 选视觉方向 → 确认方案 → 生成图片 → 交付。
 * 页面状态很多，这里只把它们折算成「现在在哪一步、这一步在做什么」，供进度条和下一步提示共用。
 */
import { translate } from "@/i18n";
export type CommerceFlowStepKey = "material" | "direction" | "plan" | "generate" | "deliver";
export type CommerceFlowStepStatus = "done" | "current" | "todo";
export type CommerceFlowStep = { key: CommerceFlowStepKey; label: string; status: CommerceFlowStepStatus; detail: string; running: boolean };

export type CommerceFlowInput = {
    /** 直接生成的旧项目：没有方向和方案两步。 */
    direct: boolean;
    hasProduct: boolean;
    hasInstruction: boolean;
    directionsLoading: boolean;
    /** 四套方向已经出来，等用户选。 */
    directionsReady: boolean;
    directionChosen: boolean;
    planningPending: boolean;
    /** 本轮方案已经写好（还没提交出图也算）。 */
    planReady: boolean;
    planCount: number;
    submitted: number;
    completed: number;
    failed: number;
    active: number;
};

const labels: Record<CommerceFlowStepKey, string> = {
    material: translate("ecommerce.flow.material"),
    direction: translate("ecommerce.flow.direction"),
    plan: translate("ecommerce.flow.plan"),
    generate: translate("ecommerce.flow.generate"),
    deliver: translate("ecommerce.flow.deliver"),
};

function currentStep(input: CommerceFlowInput): CommerceFlowStepKey {
    // 正在进行的分析优先：上一轮已交付后继续下一组时，进度回到选方向 / 策划。
    if (!input.direct && input.planningPending) return "plan";
    if (!input.direct && (input.directionsLoading || input.directionsReady)) return "direction";
    if (input.submitted > 0) return input.planCount > 0 && input.completed >= input.planCount ? "deliver" : "generate";
    if (input.direct) return input.hasProduct && input.hasInstruction ? "generate" : "material";
    if (input.planReady || input.directionChosen) return "plan";
    return input.hasProduct && input.hasInstruction ? "direction" : "material";
}

function stepDetail(key: CommerceFlowStepKey, input: CommerceFlowInput): string {
    switch (key) {
        case "material":
            return translate(input.hasProduct ? "ecommerce.flow.describe" : "ecommerce.flow.addProduct");
        case "direction":
            return translate(input.directionsLoading ? "ecommerce.flow.recommending" : input.directionsReady ? "ecommerce.flow.chooseDirection" : "ecommerce.flow.startPlanning");
        case "plan":
            if (input.planningPending) return translate(input.directionChosen ? "ecommerce.flow.writingThenGenerate" : "ecommerce.flow.writingThenReview");
            return input.planReady ? translate("ecommerce.flow.reviewCount", { count: input.planCount }) : translate("ecommerce.flow.planDirection");
        case "generate":
            if (!input.submitted) return translate(input.direct ? "ecommerce.flow.startDirect" : "ecommerce.flow.confirmThenGenerate");
            return input.failed
                ? translate("ecommerce.flow.progressWithFailures", { completed: input.completed, total: input.planCount, failed: input.failed })
                : translate("ecommerce.flow.progress", { completed: input.completed, total: input.planCount });
        case "deliver":
            return translate("ecommerce.flow.complete");
    }
}

export function resolveCommerceFlow(input: CommerceFlowInput): CommerceFlowStep[] {
    const keys: CommerceFlowStepKey[] = input.direct ? ["material", "generate", "deliver"] : ["material", "direction", "plan", "generate", "deliver"];
    const current = keys.indexOf(currentStep(input));
    return keys.map((key, index) => {
        // 交付是终点：到了这一步就算完成，同时保持高亮提示下一步可做的事。
        const status: CommerceFlowStepStatus = index < current ? "done" : index === current ? "current" : "todo";
        const running = status === "current" && ((key === "direction" && input.directionsLoading) || (key === "plan" && input.planningPending) || (key === "generate" && input.active > 0));
        return { key, label: labels[key], status, detail: status === "todo" ? "" : stepDetail(key, input), running };
    });
}

/** 当前这一步的说明，作品区空态和进度条共用同一句话。 */
export function commerceFlowNextStep(steps: CommerceFlowStep[]) {
    return steps.find((step) => step.status === "current")?.detail || "";
}
