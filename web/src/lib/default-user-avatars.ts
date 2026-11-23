
import { translate } from "@/i18n";
export const DEFAULT_USER_AVATARS = [
    { id: "person", label: translate("shared.defaultUserAvatars.defaultPortrait") },
    { id: "director", label: translate("shared.defaultUserAvatars.director") },
    { id: "camera", label: translate("shared.defaultUserAvatars.cinematographer") },
    { id: "cat", label: translate("shared.defaultUserAvatars.cat") },
    { id: "rabbit", label: translate("shared.defaultUserAvatars.rabbit") },
    { id: "robot", label: translate("shared.defaultUserAvatars.robot") },
    { id: "rocket", label: translate("shared.defaultUserAvatars.explorer") },
    { id: "sparkles", label: translate("shared.defaultUserAvatars.inspiration") },
] as const;

export type DefaultUserAvatarID = (typeof DEFAULT_USER_AVATARS)[number]["id"];

export function isDefaultUserAvatarID(value: unknown): value is DefaultUserAvatarID {
    return DEFAULT_USER_AVATARS.some((avatar) => avatar.id === value);
}
