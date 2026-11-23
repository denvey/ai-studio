import { create } from "zustand";
import { persist } from "zustand/middleware";

import { detectBrowserLocale, isAppLocale, type AppLocale } from "@/i18n/locales";

type LocaleStore = {
    locale: AppLocale;
    setLocale: (locale: AppLocale) => void;
};

/** 界面语言是本设备的小型偏好，保存在 localStorage；首次访问按浏览器语言选择。 */
export const useLocaleStore = create<LocaleStore>()(
    persist(
        (set) => ({
            locale: detectBrowserLocale(),
            // 写入前校验，防止非法值经同步或旧数据进入 i18next。
            setLocale: (next) => set((state) => (isAppLocale(next) ? { locale: next } : state)),
        }),
        {
            name: "yingce:locale",
            merge: (persisted, current) => {
                const stored = (persisted || {}) as Partial<LocaleStore>;
                return { ...current, locale: isAppLocale(stored.locale) ? stored.locale : current.locale };
            },
        },
    ),
);

const LOCALE_PARAM = "set-locale";

/**
 * 等新页面真正加载后再保存语言：设置页可能通过 beforeunload 取消跳转，
 * 提前落库会使界面与偏好不一致。整页加载也能更新模块级的翻译常量。
 */
export function switchLocale(next: AppLocale) {
    if (!isAppLocale(next) || next === useLocaleStore.getState().locale) return;
    if (typeof window === "undefined" || !window.location) {
        useLocaleStore.getState().setLocale(next);
        return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set(LOCALE_PARAM, next);
    window.location.replace(url.toString());
}

// 必须先消费参数，i18n 才能在模块初始化时读到本次页面真正采用的语言。
if (typeof window !== "undefined" && window.location) {
    const url = new URL(window.location.href);
    const pending = url.searchParams.get(LOCALE_PARAM);
    if (isAppLocale(pending)) {
        useLocaleStore.getState().setLocale(pending);
        url.searchParams.delete(LOCALE_PARAM);
        window.history.replaceState(window.history.state, "", url.toString());
    }
}
