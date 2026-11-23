import { translate } from "@/i18n";
export function shouldShowSidebarCheckin(input: { creditsEnabled?: boolean; checkinBonusMicrocredits?: number | null; checkedInToday?: boolean }) {
    return Boolean(input.creditsEnabled && (input.checkinBonusMicrocredits || 0) > 0 && !input.checkedInToday);
}

export function sidebarCheckinTitle(brandName: string) {
    const name = brandName.trim() || translate("shared.appearance.brandName");
    return translate("shared.sidebarCheckin.checkIn", { v0: String(name) });
}
