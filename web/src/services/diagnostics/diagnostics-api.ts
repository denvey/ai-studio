import { http, ApiError } from "@/services/api/request";
import { localizedApiErrorMessage } from "@/services/api/error-codes";
import type { ClientDiagnosticEvent } from "./client-diagnostics";
import { translate } from "@/i18n";


export type DiagnosticExportInput = {
    from: string;
    to: string;
    taskId?: string;
    projectId?: string;
    description?: string;
    runtime: {
        appVersion?: string;
        buildCommit?: string;
        buildTime?: string;
        browser?: string;
        os?: string;
        timezone?: string;
    };
    clientEvents: ClientDiagnosticEvent[];
};

export type DiagnosticPreview = {
    clientEventLimit: number;
    taskCount: number;
    taskLogCount: number;
    apiCallCount: number;
    estimatedBytes: number;
    willTruncate: boolean;
};

export type DiagnosticDownload = {
    blob: Blob;
    bundleId: string;
    fileName: string;
};

export function previewDiagnosticBundle(input: DiagnosticExportInput) {
    return http.post<DiagnosticPreview>("/diagnostics/preview", input);
}

export async function exportDiagnosticBundle(input: DiagnosticExportInput): Promise<DiagnosticDownload> {
    try {
        const response = await http.raw<Blob>({ method: "post", url: "/diagnostics/export", data: input, responseType: "blob" });
        return {
            blob: response.data,
            bundleId: readHeader(response.headers, "x-diagnostic-bundle-id") || "",
            fileName: parseFileName(readHeader(response.headers, "content-disposition")) || "yingce-diagnostics.zip",
        };
    } catch (error) {
        if (error instanceof ApiError) {
            const status = error.status;
            const raw = await readErrorBody(responseDataFromCause(error));
            try {
                const payload = raw ? (JSON.parse(raw) as { code?: number; msg?: string }) : null;
                if (payload) {
                    const message = status === 404 ? translate("shared.diagnostics.diagnosticsApi.theDiagnosticsEndpointIsNotDeployedRestartOrRebuildThe") : localizedApiErrorMessage(undefined, payload.msg || translate("shared.diagnostics.diagnosticsApi.failedToExportTheDiagnosticsBundle"));
                    throw new ApiError(message, { status, code: payload.code, cause: error });
                }
            } catch (parseError) {
                if (parseError instanceof ApiError) throw parseError;
            }
            if (status === 404) {
                throw new ApiError(translate("shared.diagnostics.diagnosticsApi.theDiagnosticsEndpointIsNotDeployedRestartOrRebuildThe"), { status, cause: error });
            }
            if (status === 502 || status === 503 || status === 504) {
                throw new ApiError(translate("shared.diagnostics.diagnosticsApi.theBackendIsTemporarilyUnavailableRestartItAndTryAgain"), { status, cause: error });
            }
        }
        throw error;
    }
}

function responseDataFromCause(error: ApiError): unknown {
    const cause = error.cause;
    if (cause && typeof cause === "object" && "response" in cause) {
        return (cause as { response?: { data?: unknown } }).response?.data;
    }
    return undefined;
}

async function readErrorBody(data: unknown) {
    if (data instanceof Blob) return data.text();
    return typeof data === "string" ? data : "";
}

export function downloadDiagnosticBundle(download: DiagnosticDownload) {
    const url = URL.createObjectURL(download.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = download.fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function readHeader(headers: unknown, name: string) {
    if (!headers || typeof headers !== "object") return "";
    const value = headers as { get?: (key: string) => string | null; [key: string]: unknown };
    if (typeof value.get === "function") return value.get(name) || "";
    const direct = value[name] ?? value[name.toLowerCase()];
    return typeof direct === "string" ? direct : "";
}

function parseFileName(contentDisposition: string) {
    const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encoded) {
        try {
            return decodeURIComponent(encoded.replace(/^"|"$/g, ""));
        } catch {
            return encoded;
        }
    }
    return contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] || "";
}
