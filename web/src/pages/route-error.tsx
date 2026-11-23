import { Button } from "antd";
import { Home, RefreshCw } from "lucide-react";
import { useNavigate, useRouteError } from "react-router";

import { WorkspaceSignalIcon } from "@/components/ui/aceternity/workspace-signal-icon";
import { reloadAfterChunkFailure } from "@/lib/chunk-recovery";
import { translate } from "@/i18n";


export default function RouteErrorPage() {
    const error = useRouteError();
    const navigate = useNavigate();
    const message = error instanceof Error ? error.message : translate("shared.routeError.thisPageCannotBeDisplayedRightNow");

    return (
        <main className="app-workspace-page grid h-dvh place-items-center px-6 text-foreground">
            <section className="w-full max-w-md text-center">
                <WorkspaceSignalIcon variant="error" size="lg" className="mx-auto" />
                <p className="text-xs font-medium text-muted-foreground">{translate("shared.routeError.thePageHitAnError")}</p>
                <h1 className="mt-3 text-2xl font-semibold">{translate("shared.routeError.thisPageDidNotLoadCorrectly")}</h1>
                <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">{message}</p>
                <div className="mt-6 flex justify-center gap-3">
                    <Button icon={<RefreshCw className="size-4" />} onClick={reloadAfterChunkFailure}>{translate("account.layout.state.reload")}</Button>
                    <Button type="primary" icon={<Home className="size-4" />} onClick={() => navigate("/")}>{translate("shared.routeError.backToHome")}</Button>
                </div>
            </section>
        </main>
    );
}
