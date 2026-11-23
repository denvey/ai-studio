import { translate } from "@/i18n";
export const loginMethodLabels: Record<string, string> = {
    password: translate("auth.login.passwordLabel"),
    email: translate("adminPages.loginLogs.loginLogDisplay.emailVerificationCode"),
    sms: translate("adminPages.loginLogs.loginLogDisplay.sMSVerificationCode"),
    linuxdo: "Linux.do",
    verification: translate("adminPages.loginLogs.loginLogDisplay.verificationCodeUnknownMethod"),
    unknown: translate("adminPages.loginLogs.loginLogDetailDrawer.notRecorded"),
};
export const loginEventLabels: Record<string, string> = { login: translate("adminPages.loginLogs.loginLogDisplay.login"), logout: translate("adminPages.loginLogs.loginLogDisplay.userLogout") };
export const loginSourceLabels: Record<string, string> = {
    login: translate("adminPages.loginLogs.loginLogDisplay.userLogin"),
    registration: translate("adminPages.loginLogs.loginLogDisplay.automaticLoginAfterRegistration"),
    logout: translate("adminPages.loginLogs.loginLogDisplay.userLogout"),
};

// UA 只用于描述客户端自报信息，不能作为身份或安全判断依据。
export function loginLogDevice(userAgent: string) {
    if (!userAgent) return { browser: translate("adminPages.loginLogs.loginLogDetailDrawer.notRecorded"), os: translate("adminPages.loginLogs.loginLogDetailDrawer.notRecorded") };
    const browsers: Array<[RegExp, string]> = [
        [/(?:Edg|EdgA|EdgiOS)\/(\d+)/, "Edge"],
        [/OPR\/(\d+)/, "Opera"],
        [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
        [/(?:Chrome|CriOS)\/(\d+)/, "Chrome"],
        [/Version\/(\d+).*Safari\//, "Safari"],
    ];
    let browser = translate("adminPages.loginLogs.loginLogDisplay.unrecognizedBrowser");
    for (const [pattern, name] of browsers) {
        const match = userAgent.match(pattern);
        if (match) {
            browser = `${name} ${match[1]}`;
            break;
        }
    }
    const android = userAgent.match(/Android ([\d.]+)/);
    const ios = userAgent.match(/(?:iPhone|iPad|iPod).*OS ([\d_]+)/);
    const mac = userAgent.match(/Mac OS X ([\d_]+)/);
    const os = android
        ? `Android ${android[1]}`
        : ios
          ? `iOS ${ios[1].replaceAll("_", ".")}`
          : /Windows NT/.test(userAgent)
            ? "Windows"
            : mac
              ? `macOS ${mac[1].replaceAll("_", ".")}`
              : /Linux/.test(userAgent)
                ? "Linux"
                : translate("adminPages.loginLogs.loginLogDisplay.unrecognizedOperatingSystem");
    return { browser, os };
}
