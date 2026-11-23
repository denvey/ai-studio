import { apiBaseURL } from "@/services/api/request";
import { isSystemProxyBaseUrl, type AiConfig, type ChannelHeader } from "@/stores/use-config-store";
import { translate } from "@/i18n";

type RelayConfig = Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat"> & { headers?: ChannelHeader[] };

export type ChannelRequest = {
    url: string;
    headers: Record<string, string>;
    credentials: RequestCredentials;
};

/** 自定义渠道统一经登录态后端中转，避免依赖第三方服务的浏览器 CORS。 */
export function channelRequest(config: RelayConfig, upstreamUrl: string, headers: HeadersInit = {}): ChannelRequest {
    const normalizedHeaders = new Headers(headers);
    if (isSystemProxyBaseUrl(config.baseUrl)) {
        return { url: upstreamUrl, headers: Object.fromEntries(normalizedHeaders.entries()), credentials: "include" };
    }

    const normalizedBaseUrl = requireHttpUrl(config.baseUrl, translate("shared.api.customChannelRelay.currentModelChannelBaseURL"));
    const normalizedUpstreamUrl = requireHttpUrl(upstreamUrl, translate("shared.api.customChannelRelay.currentModelRequestURL"));
    normalizedHeaders.delete("X-Canvas-Upstream-Headers");
    normalizedHeaders.delete("x-goog-api-key");
    normalizedHeaders.set("Authorization", `Bearer ${config.apiKey}`);
    normalizedHeaders.set("X-Canvas-Upstream-URL", normalizedUpstreamUrl);
    normalizedHeaders.set("X-Canvas-Upstream-Format", config.apiFormat === "gemini" ? "gemini" : config.apiFormat === "claude" ? "claude" : "openai");
    normalizedHeaders.set("X-Canvas-Upstream-Base-URL", normalizedBaseUrl);
    if (config.headers?.length) normalizedHeaders.set("X-Canvas-Upstream-Headers", encodeChannelHeaders(config.headers));
    return {
        url: `${apiBaseURL.replace(/\/+$/u, "")}/ai/custom`,
        headers: Object.fromEntries(normalizedHeaders.entries()),
        credentials: "include",
    };
}

function requireHttpUrl(value: string, label: string) {
    const normalized = value.trim();
    let parsed: URL;
    try {
        parsed = new URL(normalized);
    } catch {
        throw new Error(translate("shared.api.customChannelRelay.invalidEnterAFullURLForExampleHttpsApiExample", { v0: String(label) }));
    }
    if (!parsed.hostname || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
        throw new Error(translate("shared.api.customChannelRelay.invalidEnterAFullURLForExampleHttpsApiExample", { v0: String(label) }));
    }
    return parsed.toString();
}

function encodeChannelHeaders(headers: ChannelHeader[]) {
    const bytes = new TextEncoder().encode(JSON.stringify(headers));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}
