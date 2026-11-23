import { App, Button, Checkbox, Input, InputNumber, Spin } from "antd";
import { ArrowLeft, Check, ExternalLink, Gift, RefreshCw, Search, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminModal } from "@/pages/admin/ui/overlays";
import {
    getProviderCatalog,
    installProviderCatalog,
    refreshProviderCatalog,
    verifyProviderCatalogKey,
    type ProviderCatalogModel,
    type ProviderCatalogProvider,
    type ProviderCatalogVerifyResult,
    type ProviderCatalogView,
} from "@/services/api/provider-catalog";
import type { ModelChannel } from "@/stores/use-config-store";
import { formatCredits, formatWindow, promotionExpiry, matchesProvider, tierPriceLines, tierSpecLabel, validMarkup } from "./provider-catalog-pricing";
import "./provider-catalog-wizard.css";
import { currentLocale, translate } from "@/i18n";

type Step = "pick" | "connect" | "pricing";

const capabilityLabels: Record<ProviderCatalogModel["capability"], string> = { text: translate("account.settings.modelConfig.capabilities.text"), image: translate("account.feedback.image"), video: translate("account.feedback.video"), audio: translate("account.settings.modelConfig.capabilities.audio") };
const stepLabels: Array<{ key: Step; label: string }> = [
    { key: "pick", label: translate("admin.channels.providerCatalogWizard.chooseAProvider") },
    { key: "connect", label: translate("admin.channels.providerCatalogWizard.enterAPIKey") },
    { key: "pricing", label: translate("admin.channels.providerCatalogWizard.modelsAndPricing") },
];

type Props = {
    open: boolean;
    onClose: () => void;
    onCustom: () => void;
    onInstalled: (channel: ModelChannel) => void | Promise<void>;
};

export function ProviderCatalogWizard({ open, onClose, onCustom, onInstalled }: Props) {
    const { message } = App.useApp();
    const [step, setStep] = useState<Step>("pick");
    const [catalog, setCatalog] = useState<ProviderCatalogView | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [keyword, setKeyword] = useState("");
    const [tag, setTag] = useState("");
    const [provider, setProvider] = useState<ProviderCatalogProvider | null>(null);
    const [name, setName] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState("");
    const [verified, setVerified] = useState<ProviderCatalogVerifyResult | null>(null);
    const [markup, setMarkup] = useState<number | null>(30);
    const [overrides, setOverrides] = useState<Record<string, number | null>>({});
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [installing, setInstalling] = useState(false);

    const load = async (refresh = false) => {
        setLoading(true);
        setLoadError("");
        try {
            setCatalog(await (refresh ? refreshProviderCatalog() : getProviderCatalog()));
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : translate("admin.channels.providerCatalogWizard.failedToLoadTheProviderCatalog"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        setStep("pick");
        setProvider(null);
        setKeyword("");
        setTag("");
        void load();
    }, [open]);

    const visibleProviders = useMemo(() => (catalog?.providers || []).filter((item) => (!tag || item.tags.includes(tag)) && matchesProvider(item, keyword)), [catalog, tag, keyword]);
    const tagLookup = useMemo(() => new Map((catalog?.tags || []).map((item) => [item.id, item])), [catalog]);
    const usedTags = useMemo(() => (catalog?.tags || []).filter((item) => catalog?.providers.some((p) => p.tags.includes(item.id))), [catalog]);

    const choose = (next: ProviderCatalogProvider) => {
        setProvider(next);
        setName(next.name);
        setApiKey("");
        setVerified(null);
        setVerifyError("");
        setOverrides({});
        setSelected(Object.fromEntries(next.models.map((item) => [item.modelKey, item.supported])));
        setStep("connect");
    };

    const keyHint = useMemo(() => {
        if (!provider?.keyGuide.keyPattern || !apiKey.trim()) return null;
        try {
            return new RegExp(provider.keyGuide.keyPattern).test(apiKey.trim());
        } catch {
            return null;
        }
    }, [provider, apiKey]);

    const verify = async (skip: boolean) => {
        if (!provider) return;
        if (!apiKey.trim()) {
            setVerifyError(translate("admin.channels.providerCatalogWizard.enterAnAPIKey"));
            return;
        }
        if (skip) {
            setVerified(null);
            setStep("pricing");
            return;
        }
        setVerifying(true);
        setVerifyError("");
        try {
            const result = await verifyProviderCatalogKey(provider.id, apiKey.trim());
            setVerified(result);
            setSelected((current) => Object.fromEntries(provider.models.map((item) => [item.modelKey, Boolean(current[item.modelKey]) && item.supported && !result.missingModels.includes(item.modelKey)])));
            setStep("pricing");
        } catch (error) {
            setVerifyError(error instanceof Error ? error.message : translate("admin.channels.providerCatalogWizard.verificationFailedCheckYourKey"));
        } finally {
            setVerifying(false);
        }
    };

    const chosenModels = provider ? provider.models.filter((item) => selected[item.modelKey]) : [];
    const overridesValid = chosenModels.every((item) => overrides[item.modelKey] === undefined || overrides[item.modelKey] === null || validMarkup(overrides[item.modelKey]));
    const canInstall = Boolean(provider && chosenModels.length && validMarkup(markup) && overridesValid && name.trim() && apiKey.trim());

    const install = async () => {
        if (!provider || !canInstall || markup === null) return;
        setInstalling(true);
        try {
            const { channel } = await installProviderCatalog(provider.id, {
                name: name.trim(),
                apiKey: apiKey.trim(),
                markupPercent: markup,
                models: chosenModels.map((item) => ({ modelKey: item.modelKey, markupPercent: overrides[item.modelKey] ?? null })),
                // 跳过验证时先停用，避免未确认可用的渠道进入线上路由。
                enabled: verified !== null,
            });
            message.success(translate("admin.channels.providerCatalogWizard.connectedWithModels", { v0: String(provider.name), v1: String(chosenModels.length), v2: String(verified ? translate("admin.channels.providerCatalogWizard.areAvailable") : translate("admin.channels.providerCatalogWizard.createdChannelDisabledByDefault")) }));
            await onInstalled(channel);
        } catch (error) {
            message.error(error instanceof Error ? error.message : translate("admin.channels.providerCatalogWizard.failedToConnectTheProvider"));
        } finally {
            setInstalling(false);
        }
    };

    const stepIndex = stepLabels.findIndex((item) => item.key === step);

    return (
        <AdminModal flush centered open={open} width={1080} onCancel={() => !installing && onClose()} footer={null} title={null} rootClassName="pcw-root" mask={{ closable: !installing }}>
            <div className="pcw">
                <header className="pcw-header">
                    <div className="pcw-title-row">
                        {step !== "pick" ? <Button type="text" size="small" aria-label={translate("canvasC.previsOnboarding.back")} icon={<ArrowLeft className="size-4" />} disabled={installing || verifying} onClick={() => setStep(step === "pricing" ? "connect" : "pick")} /> : null}
                        <h2 className="pcw-title">{translate("admin.channels.providerCatalogWizard.addSystemChannel")}</h2>
                    </div>
                    <ol className="pcw-steps" aria-label={translate("admin.channels.providerCatalogWizard.connectionSteps")}>
                        {stepLabels.map((item, index) => (
                            <li key={item.key} className="pcw-step" data-state={index < stepIndex ? "done" : index === stepIndex ? "current" : "todo"} aria-current={index === stepIndex ? "step" : undefined}>
                                <span className="pcw-step-dot">{index < stepIndex ? <Check className="size-3" /> : index + 1}</span>
                                {item.label}
                            </li>
                        ))}
                    </ol>
                </header>
                {step === "pick" ? renderPick() : null}
                {step === "connect" && provider ? renderConnect(provider) : null}
                {step === "pricing" && provider ? renderPricing(provider) : null}
            </div>
        </AdminModal>
    );

    function renderPick() {
        const sourceText = catalog?.source === "cache" ? translate("admin.channels.providerCatalogWizard.offlineCatalog") : catalog?.source === "unavailable" ? translate("admin.channels.providerCatalogWizard.catalogTemporarilyUnavailable") : catalog?.source === "disabled" ? translate("admin.channels.providerCatalogWizard.catalogDisabled") : translate("admin.channels.providerCatalogWizard.catalog");
        return (
            <div className="pcw-body">
                <div className="pcw-toolbar">
                    <Input
                        size="large"
                        allowClear
                        autoFocus
                        prefix={<Search className="size-4 text-foreground/40" />}
                        placeholder={translate("admin.channels.providerCatalogWizard.searchProvidersModelsOrURLsSuchAsSeedanceSoraOr")}
                        aria-label={translate("admin.channels.providerCatalogWizard.searchProviders")}
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                    />
                    <span className="pcw-source" title={catalog?.fetchedAt ? translate("admin.channels.providerCatalogWizard.synced", { v0: String(new Date(catalog.fetchedAt).toLocaleString(currentLocale())) }) : undefined}>
                        {sourceText}
                        {catalog?.updatedAt ? translate("admin.channels.providerCatalogWizard.updated", { v0: String(catalog.updatedAt.slice(5, 10)) }) : ""}
                        <Button type="text" size="small" aria-label={translate("admin.channels.providerCatalogWizard.refreshCatalog")} icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load(true)} />
                    </span>
                </div>
                {usedTags.length ? (
                    <div className="pcw-tags" role="group" aria-label={translate("admin.channels.providerCatalogWizard.filterByTag")}>
                        <button type="button" className="pcw-tag-filter" aria-pressed={!tag} onClick={() => setTag("")}>
                            {translate("canvasA.toolPicker.all")} <span>{catalog?.providers.length || 0}</span>
                        </button>
                        {usedTags.map((item) => (
                            <button type="button" key={item.id} className="pcw-tag-filter" aria-pressed={tag === item.id} onClick={() => setTag(tag === item.id ? "" : item.id)}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                ) : null}
                <div className="pcw-scroll">
                    {loadError ? (
                        <p className="pcw-notice" role="alert">
                            <TriangleAlert className="size-4" /> {loadError}
                        </p>
                    ) : null}
                    {catalog && (catalog.source === "unavailable" || catalog.source === "disabled") ? <p className="pcw-notice">{catalog.notice || translate("admin.channels.providerCatalogWizard.recommendedProvidersAreTemporarilyUnavailableYouCanAddOneManually")}</p> : null}
                    <div className="pcw-grid">
                        <button type="button" className="pcw-card pcw-card-custom" onClick={onCustom}>
                            <span className="pcw-logo pcw-logo-custom">
                                <SlidersHorizontal className="size-5" />
                            </span>
                            <span className="pcw-card-main">
                                <span className="pcw-card-name">{translate("admin.channels.providerCatalogWizard.customSettings")}</span>
                                <span className="pcw-card-summary">{translate("admin.channels.providerCatalogWizard.enterABaseURLAndAPIKeyManually")}</span>
                            </span>
                        </button>
                        {visibleProviders.map((item) => (
                            <button type="button" key={item.id} className="pcw-card" onClick={() => choose(item)}>
                                <span className="pcw-card-top">
                                    <ProviderLogo provider={item} />
                                    <span className="pcw-card-main">
                                        <span className="pcw-card-name">{item.name}</span>
                                        <span className="pcw-card-summary">{item.summary || hostOf(item.baseUrl)}</span>
                                    </span>
                                </span>
                                <span className="pcw-card-tags">
                                    {item.tags.map((id) => (
                                        <span key={id} className="pcw-chip" data-tone={tagLookup.get(id)?.tone || "neutral"}>
                                            {tagLookup.get(id)?.label || id}
                                        </span>
                                    ))}
                                </span>
                                <span className="pcw-card-meta">
                                    <span>{item.models.length} {translate("admin.channels.providerCatalogWizard.recommendedModels")}</span>
                                    {item.installedCount ? (
                                        <span className="pcw-installed">
                                            <Check className="size-3" /> {translate("admin.channels.providerCatalogWizard.connected")} {item.installedCount}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="pcw-card-summary" title={item.models.map((model) => model.providerModelKey).join("、")}>
                                    {translate("admin.channels.providerCatalogWizard.recommended")}{item.models.map((model) => (model.displayName === model.providerModelKey ? model.displayName : `${model.displayName} / ${model.providerModelKey}`)).join("、")}
                                </span>
                                <span className="pcw-card-window">
                                    <span>{item.permanent ? formatWindow(item) : translate("admin.channels.providerCatalogWizard.promotion", { v0: String(formatWindow(item)) })}</span>
                                    <span className="block mt-1">{promotionExpiry(item)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                    {loading && !catalog ? (
                        <div className="pcw-loading" role="status" aria-label={translate("admin.channels.providerCatalogWizard.loadingProviderCatalog")}>
                            <Spin />
                        </div>
                    ) : null}
                    {catalog && catalog.providers.length > 0 && !visibleProviders.length ? <p className="pcw-notice">{translate("admin.channels.providerCatalogWizard.noMatchingProvidersTryAnotherKeyword")}</p> : null}
                </div>
            </div>
        );
    }

    function renderConnect(current: ProviderCatalogProvider) {
        const guide = current.keyGuide;
        return (
            <div className="pcw-body pcw-split">
                <section className="pcw-form" aria-label={translate("admin.channels.providerCatalogWizard.connect", { v0: String(current.name) })}>
                    <div className="pcw-provider-head">
                        <ProviderLogo provider={current} />
                        <div className="min-w-0">
                            <div className="pcw-card-name">{current.name}</div>
                            <div className="pcw-card-window">{current.permanent ? formatWindow(current) : translate("admin.channels.providerCatalogWizard.promotion", { v0: String(formatWindow(current)) })}</div>
                        </div>
                    </div>
                    <label className="pcw-field">
                        <span>{translate("account.settings.channels.name")}</span>
                        <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
                    </label>
                    <label className="pcw-field">
                        <span>API Key</span>
                        <Input.Password
                            autoFocus
                            autoComplete="new-password"
                            value={apiKey}
                            placeholder={translate("admin.channels.providerCatalogWizard.pasteTheKeyCopiedFromTheProviderConsole")}
                            onChange={(event) => {
                                setApiKey(event.target.value);
                                setVerifyError("");
                            }}
                            onPressEnter={() => void verify(false)}
                        />
                        {keyHint === true ? (
                            <em className="pcw-hint" data-tone="success">
                                {translate("admin.channels.providerCatalogWizard.validFormat")}
                            </em>
                        ) : null}
                        {keyHint === false ? (
                            <em className="pcw-hint" data-tone="warning">
                                {translate("admin.channels.providerCatalogWizard.thisFormatDiffersFromTheProviderSUsualKeysMake")}
                            </em>
                        ) : null}
                    </label>
                    <div className="pcw-readonly">
                        <span>Base URL</span>
                        <code>{current.baseUrl}</code>
                    </div>
                    {verifyError ? (
                        <div className="pcw-notice pcw-notice-error" role="alert">
                            <TriangleAlert className="size-4" />
                            <span>{verifyError}</span>
                        </div>
                    ) : null}
                    <div className="pcw-actions">
                        {verifyError ? (
                            <Button disabled={verifying || !apiKey.trim()} onClick={() => void verify(true)}>
                                {translate("admin.channels.providerCatalogWizard.skipVerification")}
                            </Button>
                        ) : null}
                        <Button type="primary" loading={verifying} disabled={!apiKey.trim() || !name.trim()} onClick={() => void verify(false)}>
                            {translate("admin.channels.providerCatalogWizard.verifyAndContinue")}
                        </Button>
                    </div>
                    {verifyError ? <p className="pcw-footnote">{translate("admin.channels.providerCatalogWizard.channelsCreatedWithoutVerificationStartDisabledEnableThemManuallyAfter")}</p> : null}
                </section>
                <aside className="pcw-guide" aria-label={translate("admin.channels.providerCatalogWizard.getAPIKey")}>
                    <h3>{translate("admin.channels.providerCatalogWizard.getAPIKey")}</h3>
                    {guide.steps.length ? (
                        <ol>
                            {guide.steps.map((stepText, index) => (
                                <li key={index}>
                                    <span>{index + 1}</span>
                                    {stepText}
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="pcw-footnote">{translate("admin.channels.providerCatalogWizard.createAnAPIKeyInTheProviderConsoleThenPaste")}</p>
                    )}
                    {guide.promo ? (
                        <p className="pcw-promo">
                            <Gift className="size-4" /> {guide.promo}
                        </p>
                    ) : null}
                    {guide.url || current.website ? (
                        <Button block href={guide.url || current.website} target="_blank" rel="noopener noreferrer" icon={<ExternalLink className="size-4" />}>
                            {translate("admin.channels.providerCatalogWizard.goTo")} {current.name} {translate("admin.channels.providerCatalogWizard.getKey")}
                        </Button>
                    ) : null}
                </aside>
            </div>
        );
    }

    function renderPricing(current: ProviderCatalogProvider) {
        const totalTiers = chosenModels.reduce((sum, item) => sum + item.priceTiers.length, 0);
        return (
            <div className="pcw-body">
                <div className="pcw-pricing-bar">
                    <label className="pcw-markup">
                        <span>{translate("admin.channels.providerCatalogWizard.bulkMarkup")}</span>
                        <InputNumber aria-label={translate("admin.channels.providerCatalogWizard.defaultMarkupRate")} value={markup} min={0} max={1000} step={5} precision={2} suffix="%" status={validMarkup(markup) ? undefined : "error"} onChange={(value) => setMarkup(value)} />
                    </label>
                    <span className="pcw-formula">{translate("admin.channels.providerCatalogWizard.sellingPriceCost1MarkupRateCNY11Credit")}</span>
                    {verified ? (
                        <span className="pcw-verified">
                            <Check className="size-3.5" /> {translate("admin.channels.providerCatalogWizard.connectedUpstreamAvailable")} {verified.availableModels.length}/{current.models.length} {translate("admin.channels.providerCatalogWizard.recommendedModels")}
                        </span>
                    ) : (
                        <span className="pcw-unverified">{translate("admin.channels.providerCatalogWizard.notVerifiedChannelWillStartDisabled")}</span>
                    )}
                </div>
                <div className="pcw-scroll">
                    <ul className="pcw-models">
                        {current.models.map((item) => {
                            const missing = verified?.missingModels.includes(item.modelKey);
                            const disabledReason = !item.supported ? item.unsupportedReason || translate("admin.channels.providerCatalogWizard.notSupportedInThisVersion") : missing ? translate("admin.channels.providerCatalogWizard.modelNotReturnedByUpstream") : "";
                            const override = overrides[item.modelKey];
                            const effective = override ?? markup ?? 0;
                            const checked = Boolean(selected[item.modelKey]);
                            return (
                                <li key={item.modelKey} className="pcw-model" data-disabled={Boolean(disabledReason) || undefined} data-checked={checked || undefined}>
                                    <div className="pcw-model-head">
                                        <Checkbox checked={checked} disabled={Boolean(disabledReason) && !checked} onChange={(event) => setSelected((state) => ({ ...state, [item.modelKey]: event.target.checked }))}>
                                            <span className="pcw-model-name">{item.displayName}</span>
                                        </Checkbox>
                                        <span className="pcw-chip" data-tone="neutral">
                                            {capabilityLabels[item.capability]}
                                        </span>
                                        <code className="pcw-model-key">{item.providerModelKey}</code>
                                        <span className="flex-1" />
                                        {disabledReason ? (
                                            <span className="pcw-model-reason">{disabledReason}</span>
                                        ) : (
                                            <label className="pcw-override">
                                                <span>{translate("admin.channels.providerCatalogWizard.markup")}</span>
                                                <InputNumber
                                                    size="small"
                                                    aria-label={translate("admin.channels.providerCatalogWizard.markupRateFor", { v0: String(item.displayName) })}
                                                    value={override ?? null}
                                                    placeholder={markup === null ? "" : String(markup)}
                                                    min={0}
                                                    max={1000}
                                                    precision={2}
                                                    suffix="%"
                                                    disabled={!checked}
                                                    onChange={(value) => setOverrides((state) => ({ ...state, [item.modelKey]: value }))}
                                                />
                                            </label>
                                        )}
                                    </div>
                                    {item.description ? <p className="pcw-model-desc">{item.description}</p> : null}
                                    <table className="pcw-tiers">
                                        <thead>
                                            <tr>
                                                <th scope="col">{translate("admin.channels.providerCatalogWizard.specifications")}</th>
                                                <th scope="col">{translate("admin.channels.providerCatalogWizard.pricing")}</th>
                                                <th scope="col">{translate("admin.channels.providerCatalogWizard.costCredits")}</th>
                                                <th scope="col">{translate("admin.channels.providerCatalogWizard.sellingPriceCredits")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {item.priceTiers.flatMap((tier, tierIndex) =>
                                                tierPriceLines(item.capability, tier, effective).map((line, lineIndex) => (
                                                    <tr key={`${tierIndex}-${lineIndex}`}>
                                                        <td>{lineIndex === 0 ? tierSpecLabel(tier) : ""}</td>
                                                        <td>{line.label}</td>
                                                        <td>{formatCredits(line.cost)}</td>
                                                        <td className="pcw-sale">{formatCredits(line.sale)}</td>
                                                    </tr>
                                                )),
                                            )}
                                        </tbody>
                                    </table>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                <footer className="pcw-footer">
                    <span>
                        {translate("admin.channels.providerCatalogWizard.willCreate1Channel")} {chosenModels.length} {translate("admin.channels.providerCatalogWizard.models")} {totalTiers} {translate("admin.channels.providerCatalogWizard.specificationTiers")}
                    </span>
                    <div className="pcw-actions">
                        <Button disabled={installing} onClick={() => setStep("connect")}>
                            {translate("canvasC.previsOnboarding.back")}
                        </Button>
                        <Button type="primary" loading={installing} disabled={!canInstall} onClick={() => void install()}>
                            {translate("admin.channels.providerCatalogWizard.connectProvider")}
                        </Button>
                    </div>
                </footer>
            </div>
        );
    }
}

function hostOf(url: string) {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

function ProviderLogo({ provider }: { provider: Pick<ProviderCatalogProvider, "logo" | "name"> }) {
    const [failed, setFailed] = useState(false);
    if (!provider.logo || failed) {
        return (
            <span className="pcw-logo" aria-hidden="true">
                {provider.name.slice(0, 1).toUpperCase()}
            </span>
        );
    }
    return (
        <span className="pcw-logo" aria-hidden="true">
            <img src={provider.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        </span>
    );
}
