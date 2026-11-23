import { ApiError } from "@/services/api/request";
import { AgentStreamError } from "@/services/api/agent";
import { translate } from "@/i18n";

export function agentErrorPresentation(cause: unknown, fallback = translate("shared.canvas.agentErrorPresentation.agentExecutionFailed")) {
    const text = typeof cause === "string" ? cause.trim() : cause instanceof Error ? cause.message : fallback;
    if ((cause instanceof ApiError || cause instanceof AgentStreamError) && cause.status === 404) {
        return {
            title: translate("shared.canvas.agentErrorPresentation.agentEndpointOrResourceNotFound"),
            text: text || translate("shared.canvas.agentErrorPresentation.theBackendCouldNotFindTheRequestedAgentEndpointOr"),
            meta: translate("shared.canvas.agentErrorPresentation.checkThatTheBackendHasLoadedTheAgentRoutesAnd"),
        };
    }
    if (cause instanceof ApiError && cause.status === 501) {
        return {
            title: translate("shared.canvas.agentErrorPresentation.thisAgentCapabilityIsNotAvailableYet"),
            text: text || translate("shared.canvas.agentErrorPresentation.theRequestedAgentCapabilityIsNotAvailableYetUseThe"),
        };
    }
    // 渠道、鉴权、配额等业务错误保留真实语义，不能按 message 猜测为服务未部署。
    return { title: fallback, text: text || fallback };
}

export function agentErrorContent(text: string, title: string) {
    // 只拆分服务端公开提示中的诊断尾注，不据此推断错误类型或改变业务语义。
    const diagnostic = text.trim().match(/^([\s\S]*?)；如反复出现，请把诊断号\s+([a-zA-Z0-9:_-]+)\s+反馈给管理员[。.]?$/);
    const description = (diagnostic?.[1] ?? text).trim();
    return { description: description === title.trim() ? "" : description, diagnosticId: diagnostic?.[2] };
}

export function agentSubmissionErrorTitle(cause: unknown, accepted: boolean, requestSent = true) {
    if (accepted) return translate("shared.canvas.agentErrorPresentation.runAcceptedButLocalSubmissionRecordCleanupFailed");
    if (!requestSent) return translate("shared.canvas.agentErrorPresentation.messageNotSentYourInputWasPreserved");
    const status = cause instanceof ApiError ? cause.status : undefined;
    if (status && [400, 401, 403, 404, 422].includes(status)) return translate("shared.canvas.agentErrorPresentation.theServerRejectedTheRequest");
    if (status) return translate("shared.canvas.agentErrorPresentation.theServerReturnedAnErrorRetryingChecksTheOriginalRequest");
    return translate("shared.canvas.agentErrorPresentation.noServerConfirmationReceivedRetryingChecksTheOriginalRequestWithout");
}
