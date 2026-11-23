import type { ArkCertification, ArkCertificationKind, Asset, AssetKind, AssetStatus, AudioAsset, EntityAsset, ImageAsset, ModelAsset, TextAsset, VideoAsset } from "@/stores/use-asset-store";
import { normalizeAssetCategory, parseAssetCategory } from "@/lib/asset-category";
import { translate } from "@/i18n";

const ASSET_KINDS: readonly AssetKind[] = ["text", "image", "video", "audio", "model", "entity"];
const ASSET_STATUSES: readonly AssetStatus[] = ["draft", "review", "confirmed", "archived"];

/**
 * 素材持久化合同的运行时边界。它只接受能被后续业务安全消费的完整记录，绝不通过空 URL、通配 MIME 或零尺寸伪造默认值。
 * 展示层可以隔离历史坏记录，但新增、更新和写回前必须经过这里的严格校验。
 */

export function parseAssetRecord(value: unknown): Asset {
    if (!isRecord(value)) throw new Error(translate("shared.assetRecord.assetRecordIsNotAnObject"));
    const id = requireTrimmedString(value, "id");
    const kind = requireTrimmedString(value, "kind");
    if (!ASSET_KINDS.includes(kind as AssetKind)) throw new Error(translate("shared.assetRecord.unsupportedAssetType", { v0: String(kind) }));
    const title = requireString(value, "title");
    const coverUrl = requireString(value, "coverUrl");
    const tags = requireStringArray(value.tags, "tags");
    const createdAt = requireString(value, "createdAt");
    const updatedAt = requireString(value, "updatedAt");
    const folderId = optionalTrimmedString(value, "folderId");
    const status = optionalAssetStatus(value.status);
    const primaryVersionId = optionalTrimmedString(value, "primaryVersionId");
    const source = optionalString(value, "source");
    const note = optionalString(value, "note");
    const arkAssetId = optionalTrimmedString(value, "arkAssetId");
    const arkCertification = parseArkCertification(value.arkCertification);
    const metadata = optionalRecord(value.metadata, "metadata");
    const category = value.category === undefined ? undefined : parseAssetCategory(value.category);
    const data = requireRecord(value.data, "data");
    const base = {
        id,
        title,
        coverUrl,
        tags,
        createdAt,
        updatedAt,
        ...(folderId ? { folderId } : {}),
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
        ...(primaryVersionId ? { primaryVersionId } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(arkAssetId ? { arkAssetId } : {}),
        ...(arkCertification ? { arkCertification } : {}),
        ...(metadata ? { metadata } : {}),
    };

    if (kind === "text") {
        return { ...base, kind, data: { content: requireString(data, "content") } } satisfies TextAsset;
    }
    if (kind === "image") {
        const parsed = {
            dataUrl: requireString(data, "dataUrl"),
            storageKey: optionalString(data, "storageKey"),
            width: requirePositiveNumber(data, "width"),
            height: requirePositiveNumber(data, "height"),
            bytes: requireNonNegativeNumber(data, "bytes"),
            mimeType: requireMediaMimeType(data, "image"),
        };
        requireMediaLocator(parsed.dataUrl, parsed.storageKey, translate("account.feedback.image"), "dataUrl");
        return { ...base, kind, data: parsed } satisfies ImageAsset;
    }
    if (kind === "video") {
        const parsed = {
            url: requireString(data, "url"),
            storageKey: optionalString(data, "storageKey"),
            // 上游视频结果经常不带 width/height。0 表示未知，不是伪造尺寸；
            // 若按「必须大于 0」拒绝，生成成功并已扣费的视频会在入库时被判失败。
            width: requireNonNegativeNumber(data, "width"),
            height: requireNonNegativeNumber(data, "height"),
            durationMs: optionalNonNegativeNumber(data, "durationMs"),
            hasAudio: optionalBoolean(data, "hasAudio"),
            bytes: requireNonNegativeNumber(data, "bytes"),
            mimeType: requireMediaMimeType(data, "video"),
        };
        requireMediaLocator(parsed.url, parsed.storageKey, translate("account.feedback.video"), "url");
        return { ...base, kind, data: parsed } satisfies VideoAsset;
    }
    if (kind === "audio") {
        const parsed = {
            url: requireString(data, "url"),
            storageKey: optionalString(data, "storageKey"),
            durationMs: optionalNonNegativeNumber(data, "durationMs"),
            bytes: requireNonNegativeNumber(data, "bytes"),
            mimeType: requireMediaMimeType(data, "audio"),
        };
        requireMediaLocator(parsed.url, parsed.storageKey, translate("account.settings.modelConfig.capabilities.audio"), "url");
        return { ...base, kind, data: parsed } satisfies AudioAsset;
    }
    if (kind === "model") {
        const parsed = {
            url: requireString(data, "url"),
            storageKey: optionalString(data, "storageKey"),
            bytes: requireNonNegativeNumber(data, "bytes"),
            mimeType: requireConcreteMimeType(data),
            fileName: requireTrimmedString(data, "fileName"),
        };
        requireMediaLocator(parsed.url, parsed.storageKey, translate("canvasA.assetView.model"), "url");
        return { ...base, kind, data: parsed } satisfies ModelAsset;
    }
    if (kind === "entity") {
        const entity: EntityAsset["data"] = { definition: requireRecord(data.definition, "definition") };
        // 以下是列表接口补的只读展示字段，缺失或类型不对时直接忽略，不影响角色合同。
        if (typeof data.version === "number") entity.version = data.version;
        for (const key of ["coverStorageKey", "voiceName", "voiceSampleStorageKey", "visualStatus", "voiceStatus"] as const) {
            if (typeof data[key] === "string" && data[key]) entity[key] = data[key];
        }
        return { ...base, kind, data: entity } satisfies EntityAsset;
    }
    throw new Error(translate("shared.assetRecord.unsupportedAssetType", { v0: String(kind) }));
}

export function parseAssetRecordList(values: unknown): Asset[] {
    if (!Array.isArray(values)) throw new Error(translate("shared.assetRecord.invalidAssetList"));
    return values.map((item, index) => {
        try {
            return parseAssetRecord(item);
        } catch (error) {
            const id = isRecord(item) && typeof item.id === "string" && item.id.trim() ? item.id : `#${index}`;
            throw new Error(translate("shared.assetRecord.invalidContractForAsset", { v0: String(id), v1: String(error instanceof Error ? error.message : String(error)) }));
        }
    });
}

const ARK_CERTIFICATION_KINDS: readonly ArkCertificationKind[] = ["real", "virtual", "ip"];

/**
 * 方舟认证只由服务端写入，属于展示与引用提示，不承载权限（生成时服务端按素材组归属与授权复核）。
 * 结构不完整时整体忽略，不能伪造认证类型。
 */
function parseArkCertification(value: unknown): ArkCertification | undefined {
    if (!isRecord(value) || !ARK_CERTIFICATION_KINDS.includes(value.kind as ArkCertificationKind)) return undefined;
    const text = (key: string) => (typeof value[key] === "string" && (value[key] as string).trim() ? (value[key] as string).trim() : undefined);
    const scope = value.scope === "user" || value.scope === "platform" ? value.scope : undefined;
    const previousCategory = text("previousCategory");
    return {
        kind: value.kind as ArkCertificationKind,
        ...(scope ? { scope } : {}),
        ...(text("portraitAssetId") ? { portraitAssetId: text("portraitAssetId") } : {}),
        ...(text("groupId") ? { groupId: text("groupId") } : {}),
        ...(text("groupName") ? { groupName: text("groupName") } : {}),
        ...(text("arkGroupId") ? { arkGroupId: text("arkGroupId") } : {}),
        ...(text("certifiedAt") ? { certifiedAt: text("certifiedAt") } : {}),
        ...(text("expiresAt") ? { expiresAt: text("expiresAt") } : {}),
        ...(previousCategory ? { previousCategory: normalizeAssetCategory(previousCategory) } : {}),
    };
}

function requireMediaLocator(primary: string, storageKey: string | undefined, label: string, primaryKey: string) {
    if (!primary.trim() && !storageKey?.trim()) {
        throw new Error(translate("shared.assetRecord.assetIsMissingOrStorageKey", { v0: String(label), v1: String(primaryKey) }));
    }
}

function requireString(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    if (typeof value !== "string") throw new Error(translate("shared.assetRecord.assetFieldMustBeAString", { v0: String(key) }));
    return value;
}

function requireTrimmedString(record: Record<string, unknown>, key: string): string {
    const value = requireString(record, key).trim();
    if (!value) throw new Error(translate("shared.assetRecord.assetFieldCannotBeEmpty", { v0: String(key) }));
    return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) return undefined;
    if (typeof record[key] !== "string") throw new Error(translate("shared.assetRecord.assetFieldMustBeAString", { v0: String(key) }));
    return record[key] as string;
}

function optionalTrimmedString(record: Record<string, unknown>, key: string): string | undefined {
    const value = optionalString(record, key)?.trim();
    return value || undefined;
}

function requireStringArray(value: unknown, key: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(translate("shared.assetRecord.assetFieldMustBeAnArrayOfStrings", { v0: String(key) }));
    }
    return value;
}

function requireRecord(value: unknown, key: string): Record<string, unknown> {
    if (!isRecord(value)) throw new Error(translate("shared.assetRecord.assetFieldMustBeAnObject", { v0: String(key) }));
    return value;
}

function optionalRecord(value: unknown, key: string): Record<string, unknown> | undefined {
    if (value === undefined) return undefined;
    return requireRecord(value, key);
}

function requireNonNegativeNumber(record: Record<string, unknown>, key: string): number {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(translate("shared.assetRecord.assetFieldMustBeANonNegativeNumber", { v0: String(key) }));
    }
    return value;
}

function requirePositiveNumber(record: Record<string, unknown>, key: string): number {
    const value = requireNonNegativeNumber(record, key);
    if (value === 0) throw new Error(translate("shared.assetRecord.assetFieldMustBeGreaterThan0", { v0: String(key) }));
    return value;
}

function requireConcreteMimeType(record: Record<string, unknown>): string {
    const mimeType = requireTrimmedString(record, "mimeType").toLowerCase();
    if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType) || mimeType.endsWith("/*")) {
        throw new Error(translate("shared.assetRecord.assetFieldMimeTypeMustBeASpecificMIMEType"));
    }
    return mimeType;
}

function requireMediaMimeType(record: Record<string, unknown>, kind: "image" | "video" | "audio"): string {
    const mimeType = requireConcreteMimeType(record);
    // application/octet-stream 是诚实的“类型未知”；除此之外必须与素材种类一致，
    // 防止图片记录携带 audio/* 等跨类型元数据后在下载、转码阶段才暴露错误。
    if (mimeType !== "application/octet-stream" && !mimeType.startsWith(`${kind}/`)) {
        throw new Error(translate("shared.assetRecord.assetFieldMimeTypeDoesNotMatchType", { v0: String(kind) }));
    }
    return mimeType;
}

function optionalNonNegativeNumber(record: Record<string, unknown>, key: string): number | undefined {
    if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) return undefined;
    return requireNonNegativeNumber(record, key);
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
    if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) return undefined;
    if (typeof record[key] !== "boolean") throw new Error(translate("shared.assetRecord.assetFieldMustBeABoolean", { v0: String(key) }));
    return record[key] as boolean;
}

function optionalAssetStatus(value: unknown): AssetStatus | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !ASSET_STATUSES.includes(value as AssetStatus)) {
        throw new Error(translate("shared.assetRecord.invalidAssetStatus"));
    }
    return value as AssetStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
