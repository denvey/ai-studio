// 对象存储设置的表单模型：表单值与接口载荷互转、变更检测与草稿校验。
//
// 服务器访问地址只校验 http/https 格式，允许本机、局域网与 HTTP 地址（产品约定，勿收紧）。

import { type AdminOSSSetting } from "@/services/api/auth";
import { DEFAULT_OSS_PATH_PREFIX, normalizeOSSConnectionTestInput, normalizeVolcengineTOSLocation, volcengineTOSLocationError } from "@/lib/oss-settings";
import { type S3Preset } from "@/lib/oss-settings";
import { currentLocale, translate } from "@/i18n";

export type StorageMode = "local" | AdminOSSSetting["provider"];

export type OSSFormValues = {
    mode: StorageMode;
    publicBaseUrl: string;
    region: string;
    endpoint: string;
    cdnBaseUrl: string;
    cdnAuthMode: "" | "public" | "qiniu" | string;
    requireCDN: boolean;
    allowPrivateProxy: boolean;
    bucket: string;
    accessKeyId: string;
    accessKeySecret: string;
    sessionToken: string;
    pathPrefix: string;
    s3Preset: S3Preset;
    pathStyle: boolean;
    allowUserS3: boolean;
};

export type StoragePayload = Pick<
    AdminOSSSetting,
    | "enabled"
    | "provider"
    | "region"
    | "endpoint"
    | "cdnBaseUrl"
    | "cdnAuthMode"
    | "requireCDN"
    | "allowPrivateProxy"
    | "bucket"
    | "accessKeyId"
    | "accessKeySecret"
    | "sessionToken"
    | "publicBaseUrl"
    | "pathPrefix"
    | "s3Preset"
    | "pathStyle"
    | "allowUserS3"
>;

export function formValues(setting: AdminOSSSetting): OSSFormValues {
    return {
        mode: setting.enabled ? setting.provider : "local",
        publicBaseUrl: setting.publicBaseUrl || "",
        region: setting.region || "",
        endpoint: setting.endpoint || "",
        cdnBaseUrl: setting.cdnBaseUrl || "",
        cdnAuthMode: setting.cdnAuthMode || "",
        requireCDN: setting.requireCDN === true,
        allowPrivateProxy: setting.allowPrivateProxy === true,
        bucket: setting.bucket || "",
        accessKeyId: setting.accessKeyId || "",
        accessKeySecret: "",
        sessionToken: "",
        pathPrefix: setting.pathPrefix || DEFAULT_OSS_PATH_PREFIX,
        s3Preset: setting.s3Preset || "custom",
        pathStyle: setting.pathStyle === true,
        allowUserS3: setting.allowUserS3 === true,
    };
}

export function providerDraftValues(mode: Exclude<StorageMode, "local">, setting: AdminOSSSetting, pathPrefix: string): Partial<OSSFormValues> {
    if (mode === setting.provider) {
        return {
            region: setting.region || "",
            endpoint: setting.endpoint || "",
            cdnBaseUrl: setting.cdnBaseUrl || "",
            cdnAuthMode: setting.cdnAuthMode || "",
            requireCDN: setting.requireCDN === true,
            allowPrivateProxy: setting.allowPrivateProxy === true,
            bucket: setting.bucket || "",
            accessKeyId: setting.accessKeyId || "",
            accessKeySecret: "",
            sessionToken: "",
            pathPrefix: setting.pathPrefix || pathPrefix || "",
            s3Preset: setting.s3Preset || "custom",
            pathStyle: setting.pathStyle === true,
        };
    }
    return {
        region: "",
        endpoint: "",
        cdnBaseUrl: "",
        cdnAuthMode: "",
        requireCDN: false,
        allowPrivateProxy: false,
        bucket: "",
        accessKeyId: "",
        accessKeySecret: "",
        sessionToken: "",
        pathPrefix: pathPrefix || DEFAULT_OSS_PATH_PREFIX,
        s3Preset: "custom",
        pathStyle: false,
    };
}

export function normalizeStoragePayload(values: Partial<OSSFormValues>, setting: AdminOSSSetting): StoragePayload {
    const mode = values.mode || "local";
    const provider = mode === "local" ? setting.provider || "aliyun" : mode;
    let region = values.region?.trim() || "";
    let endpoint = trimTrailingSlash(values.endpoint || "");
    const bucket = values.bucket?.trim() || "";
    if (provider === "tencent" && !endpoint && region) endpoint = `https://cos.${region}.myqcloud.com`;
    if (provider === "volcengine") ({ region, endpoint } = normalizeVolcengineTOSLocation({ region, endpoint, bucket }));
    return {
        enabled: mode !== "local",
        provider,
        region,
        endpoint,
        cdnBaseUrl: trimTrailingSlash(values.cdnBaseUrl || ""),
        cdnAuthMode: values.cdnAuthMode || "",
        requireCDN: values.requireCDN === true,
        allowPrivateProxy: values.allowPrivateProxy === true,
        bucket,
        accessKeyId: values.accessKeyId?.trim() || "",
        accessKeySecret: values.accessKeySecret?.trim() || "",
        sessionToken: provider === "volcengine" ? "" : values.sessionToken?.trim() || "",
        publicBaseUrl: trimTrailingSlash(values.publicBaseUrl || ""),
        pathPrefix: (values.pathPrefix?.trim() || DEFAULT_OSS_PATH_PREFIX).replace(/^\/+|\/+$/g, ""),
        s3Preset: values.s3Preset || "custom",
        pathStyle: provider === "volcengine" ? false : values.pathStyle === true,
        allowUserS3: values.allowUserS3 === true,
    };
}

export function hasStorageChanges(values: Partial<OSSFormValues>, setting: AdminOSSSetting | null) {
    if (!setting) return false;
    const draft = normalizeStoragePayload(values, setting);
    const saved = normalizeStoragePayload(formValues(setting), setting);
    if (draft.accessKeySecret || draft.sessionToken) return true;
    return (Object.keys(saved) as Array<keyof StoragePayload>).some((key) => key !== "accessKeySecret" && key !== "sessionToken" && draft[key] !== saved[key]);
}

export function validateStorageDraft(values: OSSFormValues, setting: AdminOSSSetting) {
    const draft = normalizeStoragePayload(values, setting);
    if (!draft.enabled) return validatePublicBaseURL(draft.publicBaseUrl);
    if (!draft.bucket) return translate("adminPages.settings.storageSettingsModel.pleaseEnterAnObjectStorageBucket");
    if (!draft.endpoint)
        return draft.provider === "tencent"
            ? translate("adminPages.settings.storageSettingsModel.pleaseEnterATencentCloudCOSRegionOrEndpoint")
            : draft.provider === "qiniu"
              ? translate("adminPages.settings.storageSettingsModel.pleaseEnterAQiniuKodoUploadEndpoint")
              : draft.provider === "volcengine"
                ? translate("adminPages.settings.storageSettingsModel.pleaseEnterAVolcengineTOSRegionOrEndpoint")
                : draft.provider === "s3"
                  ? translate("adminPages.settings.storageSettingsModel.pleaseEnterTheS3EndpointServiceRootURL")
                  : translate("adminPages.settings.storageSettingsModel.pleaseEnterAnAlibabaCloudOSSEndpoint");
    if (draft.provider === "s3" && !draft.region) return translate("adminPages.settings.storageSettingsModel.pleaseEnterAnS3Region");
    if (draft.provider === "volcengine" && !draft.region) return translate("adminPages.settings.storageSettingsModel.pleaseEnterAVolcengineTOSRegion");
    if (draft.provider === "volcengine" && volcengineTOSLocationError(draft.region, draft.endpoint)) return volcengineTOSLocationError(draft.region, draft.endpoint);
    if (!isHTTPURL(draft.endpoint)) return translate("adminPages.settings.storageSettingsModel.endpointMustBeACompleteHttpHttpsURL");
    if (draft.cdnBaseUrl && !isValidCDNBaseURL(draft.cdnBaseUrl)) return translate("adminPages.settings.storageSettingsModel.cDNOrBoundDomainMustBeAnHttpHttpsRoot");
    if (!draft.accessKeyId) return translate("adminPages.settings.storageSettingsModel.pleaseEnter", { v0: String(accessKeyIdLabel(draft.provider)) });
    if (!draft.accessKeySecret && !(setting.provider === draft.provider && setting.hasAccessKeySecret)) return translate("adminPages.settings.storageSettingsModel.pleaseEnter", { v0: String(accessKeySecretLabel(draft.provider)) });
    return "";
}

export function validatePublicBaseURL(value: string) {
    if (!value) return translate("adminPages.settings.storageSettingsModel.localServerStorageRequiresAServerAccessURL");
    try {
        const parsed = new URL(value);
        if (!parsed.hostname || !["http:", "https:"].includes(parsed.protocol)) return translate("adminPages.settings.storageSettingsModel.serverAccessURLMustBeACompleteHttpHttpsURL");
        if (parsed.search || parsed.hash) return translate("adminPages.settings.storageSettingsModel.serverAccessURLCannotContainQueryParametersOrFragments");
        if (parsed.pathname.replace(/\/+$/, "").endsWith("/api")) return translate("adminPages.settings.storageSettingsModel.enterTheSiteRootURLForServerAccessWithoutApi");
        return "";
    } catch {
        return translate("adminPages.settings.storageSettingsModel.serverAccessURLMustBeACompleteHttpHttpsURL");
    }
}

export function storageResponseMatches(setting: AdminOSSSetting, expected: StoragePayload) {
    const actual = normalizeStoragePayload(formValues(setting), setting);
    const fields: Array<keyof StoragePayload> = ["enabled", "provider", "region", "endpoint", "cdnBaseUrl", "cdnAuthMode", "requireCDN", "allowPrivateProxy", "bucket", "accessKeyId", "publicBaseUrl", "pathPrefix", "s3Preset", "pathStyle", "allowUserS3"];
    if (expected.accessKeySecret && !setting.hasAccessKeySecret) return false;
    if (expected.sessionToken && !setting.hasSessionToken) return false;
    return fields.every((key) => actual[key] === expected[key]);
}

export function isAdminOSSSetting(value: unknown): value is AdminOSSSetting {
    if (!value || typeof value !== "object") return false;
    const setting = value as Partial<AdminOSSSetting>;
    return (
        typeof setting.enabled === "boolean" &&
        ["aliyun", "tencent", "qiniu", "volcengine", "s3"].includes(setting.provider || "") &&
        ["aws", "r2", "b2", "rustfs", "custom"].includes(setting.s3Preset || "") &&
        typeof setting.region === "string" &&
        typeof setting.endpoint === "string" &&
        typeof setting.cdnBaseUrl === "string" &&
        typeof setting.cdnAuthMode === "string" &&
        typeof setting.requireCDN === "boolean" &&
        typeof setting.allowPrivateProxy === "boolean" &&
        typeof setting.bucket === "string" &&
        typeof setting.accessKeyId === "string" &&
        typeof setting.hasAccessKeySecret === "boolean" &&
        typeof setting.hasSessionToken === "boolean" &&
        typeof setting.pathStyle === "boolean" &&
        typeof setting.allowUserS3 === "boolean" &&
        typeof setting.publicBaseUrl === "string" &&
        typeof setting.pathPrefix === "string"
    );
}

export function storageConfigurationReady(mode: StorageMode, values: StoragePayload, setting: AdminOSSSetting) {
    if (mode === "local") return !validatePublicBaseURL(values.publicBaseUrl);
    return !validateStorageDraft({ ...formValues(setting), ...values, mode }, setting);
}

export function storageProviderLabel(provider?: StorageMode) {
    return provider === "s3"
        ? translate("account.layout.oss.providers.s3")
        : provider === "tencent"
          ? translate("account.layout.oss.providers.tencent")
          : provider === "qiniu"
            ? translate("account.layout.oss.providers.qiniu")
            : provider === "volcengine"
              ? translate("account.layout.oss.providers.volcengine")
              : provider === "aliyun"
                ? translate("account.layout.oss.providers.aliyun")
                : translate("adminPages.settings.storageSettingsModel.localServer");
}

export function providerGuidance(mode: Exclude<StorageMode, "local">) {
    if (mode === "s3") return translate("adminPages.settings.storageSettingsModel.useAPresetToFillRegionAndEndpointQuicklyOr");
    if (mode === "tencent") return translate("adminPages.settings.storageSettingsModel.forTencentCloudEnterRegionToLetTheServerGenerate");
    if (mode === "qiniu") return translate("adminPages.settings.storageSettingsModel.qiniuRequiresAnUploadEndpointABoundDomainIsOptional");
    if (mode === "volcengine") return translate("adminPages.settings.storageSettingsModel.forVolcengineEnterRegionToGenerateAnS3CompatibleEndpoint");
    return translate("adminPages.settings.storageSettingsModel.alibabaCloudRequiresAFullOSSEndpointBucketAndCredentials");
}

export function accessKeyIdLabel(mode: Exclude<StorageMode, "local"> | AdminOSSSetting["provider"]) {
    return mode === "tencent" ? "SecretId" : mode === "qiniu" ? "AccessKey" : mode === "volcengine" ? "Access Key ID" : "AccessKey ID";
}

export function accessKeySecretLabel(mode: Exclude<StorageMode, "local"> | AdminOSSSetting["provider"]) {
    return mode === "tencent" || mode === "qiniu" ? "SecretKey" : mode === "volcengine" ? "Secret Access Key" : "AccessKey Secret";
}

export function isHTTPURL(value: string) {
    try {
        const parsed = new URL(value);
        return Boolean(parsed.hostname) && ["http:", "https:"].includes(parsed.protocol);
    } catch {
        return false;
    }
}

export function isValidCDNBaseURL(value: string) {
    try {
        const parsed = new URL(value);
        return Boolean(parsed.hostname) && ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && !parsed.pathname.replace(/\/+$/, "");
    } catch {
        return false;
    }
}

export function trimTrailingSlash(value: string) {
    return value.trim().replace(/\/+$/, "");
}

export function connectionInput(values: Partial<OSSFormValues>) {
    return normalizeOSSConnectionTestInput({
        provider: !values.mode || values.mode === "local" ? ("aliyun" as const) : values.mode,
        s3Preset: values.s3Preset,
        region: values.region,
        endpoint: values.endpoint,
        cdnBaseUrl: values.cdnBaseUrl,
        bucket: values.bucket,
        accessKeyId: values.accessKeyId,
        accessKeySecret: values.accessKeySecret,
        sessionToken: values.sessionToken,
        pathPrefix: values.pathPrefix,
        pathStyle: values.pathStyle === true,
    });
}

export function hasValidSettingTime(value?: string) {
    if (!value) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.getFullYear() >= 2000;
}

export function formatSettingTime(value: string | undefined, fallback: string) {
    if (!hasValidSettingTime(value)) return fallback;
    return translate("adminPages.settings.libtvSettingsPage.updated", { v0: String(new Date(value as string).toLocaleString(currentLocale(), { hour12: false })) });
}
