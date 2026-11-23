import type { Live2DLoader as Loader } from "pixi-live2d-display/cubism4";
import { apiBaseURL } from "@/services/api/request";
import { translate } from "@/i18n";

const installed = new WeakSet<typeof Loader>();

// The SDK's default XHR loader omits cross-origin cookies and has no deadline.
// Restrict credentialed requests to our own model API, never model-provided hosts.
export function installLive2DLoader(loader: typeof Loader) {
    if (installed.has(loader)) return;
    installed.add(loader);
    loader.middlewares.unshift(async (context) => {
        const base = new URL(`${apiBaseURL.replace(/\/$/, "")}/`, window.location.href);
        const url = new URL(context.settings ? context.settings.resolveURL(context.url) : context.url, window.location.href);
        const allowed = ["public", "admin/settings"].some((prefix) => url.pathname.startsWith(`${base.pathname}${prefix}/appearance/live2d/`));
        if (url.origin !== base.origin || !allowed) throw new Error(translate("shared.live2dLoader.live2DResourcesMustComeFromThisSiteSModelAPI"));
        const controller = new AbortController();
        const abort = () => controller.abort();
        const deadline = setTimeout(abort, 20000);
        context.target?.once("destroy", abort);
        try {
            const response = await fetch(url, { credentials: "include", signal: controller.signal });
            if (!response.ok) throw new Error(translate("shared.live2dLoader.failedToLoadLive2DResource", { v0: String(response.status) }));
            context.result = context.type === "json" ? await response.json() : await response.arrayBuffer();
        } finally {
            clearTimeout(deadline);
            context.target?.off("destroy", abort);
        }
    });
}
