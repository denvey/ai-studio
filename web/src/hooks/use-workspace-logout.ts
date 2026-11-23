import { App } from "antd";
import { useState } from "react";

import { useAuthEntry } from "@/hooks/use-auth-entry";
import { applyUserSession } from "@/lib/user-session";
import { logout } from "@/services/api/auth";
import { translate } from "@/i18n";

/**
 * 工作区退出登录：供侧栏底部与顶部账户菜单共用。
 * 写路径强校验：失败必须明确提示，不得静默吞错。
 */
export function useWorkspaceLogout() {
    const { showLoginAfterSignOut } = useAuthEntry();
    const { message } = App.useApp();
    const [loggingOut, setLoggingOut] = useState(false);

    const handleLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            await logout();
            await applyUserSession({ user: null });
            message.success(translate("account.layout.footerMenu.loggedOut"));
            showLoginAfterSignOut();
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("account.layout.footerMenu.logoutFailed"));
        } finally {
            setLoggingOut(false);
        }
    };

    return { handleLogout, loggingOut };
}
