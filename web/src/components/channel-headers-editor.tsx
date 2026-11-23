import { Button, Input } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";

import { Plus, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";

import type { ChannelHeader } from "@/stores/use-config-store";
import { translate } from "@/i18n";


const DEFAULT_USER_AGENT = "Yingce/1.0 (+https://github.com/ddcat-ai/open-ai-canvas)";
const MAX_HEADER_COUNT = 32;
const BLOCKED_HEADERS = new Set([
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "host",
    "content-length",
    "content-type",
    "accept",
    "connection",
    "proxy-connection",
    "keep-alive",
    "transfer-encoding",
    "te",
    "trailer",
    "upgrade",
    "forwarded",
    "x-goog-api-key",
]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

type Props = {
    value?: ChannelHeader[];
    onChange?: (headers: ChannelHeader[]) => void;
    disabled?: boolean;
};

export function ChannelHeadersEditor({ value = [], onChange, disabled }: Props) {
    const headers = Array.isArray(value) ? value : [];
    const validation = validateChannelHeaders(headers);
    const hasUserAgent = headers.some((header) => header.name.trim().toLowerCase() === "user-agent");
    const updateHeader = (index: number, patch: Partial<ChannelHeader>) => {
        onChange?.(headers.map((header, itemIndex) => (itemIndex === index ? { ...header, ...patch } : header)));
    };

    return (
        <div className="space-y-2 rounded-md border border-border/70 bg-muted/[.1] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{translate("shared.channelHeadersEditor.customHeaders")}</div>
                    <div className="mt-0.5 break-all text-xs leading-5 text-foreground/50">{translate("shared.channelHeadersEditor.sendByDefault")} {DEFAULT_USER_AGENT}{translate("shared.channelHeadersEditor.addingAUserAgentOverridesTheDefault")}</div>
                </div>
                {!hasUserAgent ? (
                    <Button size="small" disabled={disabled || headers.length >= MAX_HEADER_COUNT} onClick={() => onChange?.([...headers, { name: "User-Agent", value: DEFAULT_USER_AGENT }])}>
                        {translate("shared.channelHeadersEditor.addUserAgent")}
                    </Button>
                ) : null}
            </div>
            {headers.length ? (
                <div className="space-y-2">
                    {headers.map((header, index) => {
                        const inputProps = {
                            "aria-label": translate("shared.channelHeadersEditor.headerValue", { v0: String(index + 1) }),
                            disabled,
                            value: header.value,
                            placeholder: translate("shared.channelHeadersEditor.headerValue2"),
                            onChange: (event: ChangeEvent<HTMLInputElement>) => updateHeader(index, { value: event.target.value }),
                        };
                        return (
                            <div key={index} className="grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_32px] gap-2">
                                <Input aria-label={translate("shared.channelHeadersEditor.headerName", { v0: String(index + 1) })} disabled={disabled} value={header.name} placeholder={translate("shared.channelHeadersEditor.headerName2")} onChange={(event) => updateHeader(index, { name: event.target.value })} />
                                {/token|key|secret/i.test(header.name) ? <Input.Password {...inputProps} /> : <Input {...inputProps} />}
                                <Tooltip title={translate("shared.channelHeadersEditor.deleteHeader")}>
                                    <Button aria-label={translate("shared.channelHeadersEditor.deleteHeader2", { v0: String(index + 1) })} className="size-8 p-0" disabled={disabled} icon={<Trash2 className="size-3.5" />} onClick={() => onChange?.(headers.filter((_, itemIndex) => itemIndex !== index))} />
                                </Tooltip>
                            </div>
                        );
                    })}
                </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Button size="small" type="dashed" icon={<Plus className="size-3.5" />} disabled={disabled || headers.length >= MAX_HEADER_COUNT} onClick={() => onChange?.([...headers, { name: "", value: "" }])}>
                    {translate("shared.channelHeadersEditor.addHeader")}
                </Button>
                <span className={`text-xs ${validation ? "text-destructive" : "text-foreground/45"}`}>{validation || `${headers.length}/${MAX_HEADER_COUNT}`}</span>
            </div>
        </div>
    );
}

export function validateChannelHeaders(headers?: ChannelHeader[]) {
    if (!headers?.length) return "";
    if (headers.length > MAX_HEADER_COUNT) return translate("shared.channelHeadersEditor.upToCustomHeadersSupported", { v0: String(MAX_HEADER_COUNT) });
    const seen = new Set<string>();
    let totalBytes = 0;
    for (const header of headers) {
        const name = header.name.trim();
        const value = header.value.trim();
        if (!name && !value) continue;
        if (!name || !HEADER_NAME_PATTERN.test(name)) return translate("shared.channelHeadersEditor.invalidHeaderNameUseAStandardHTTPHeaderName");
        const normalizedName = name.toLowerCase();
        if (BLOCKED_HEADERS.has(normalizedName) || normalizedName.startsWith("x-canvas-") || normalizedName.startsWith("x-forwarded-")) return translate("shared.channelHeadersEditor.isManagedByTheSystemAndCannotBeCustomized", { v0: String(name) });
        if (seen.has(normalizedName)) return translate("shared.channelHeadersEditor.duplicateHeader", { v0: String(name) });
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return translate("shared.channelHeadersEditor.theValueOfContainsInvalidControlCharacters", { v0: String(name) });
        if (name.length > 128 || value.length > 4096) return translate("shared.channelHeadersEditor.aHeaderNameOrValueIsTooLong");
        totalBytes += new TextEncoder().encode(name + value).length;
        if (totalBytes > 16 * 1024) return translate("shared.channelHeadersEditor.customHeadersCannotExceed16KBInTotal");
        seen.add(normalizedName);
    }
    return "";
}
