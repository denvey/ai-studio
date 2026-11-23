import { Button } from "antd";
import { Check, ChevronDown, X } from "lucide-react";
import { GlobeIcon } from "@/components/ui/ecommerce-icons";
import { useState } from "react";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { commercePlatformGroups, displayLabelOf, languageVisuals, languages, platforms } from "./catalog";
import { commerceKnowledgeFor, commercePlatformKnowledge } from "./platform-knowledge";
import { commerceUiText } from "./ui-text";
import "./market-picker.css";

import { translate } from "@/i18n";
export function PlatformMark({ platform }: { platform: string }) {
    return <img className="commerce-platform-logo" data-monochrome={["amazon", "tiktok", "douyin", "ozon", "dewu"].includes(platform)} src={`/commerce/platforms/${platform}.svg`} alt="" width={28} height={28} />;
}

export function LanguageFlag({ language }: { language: string }) {
    const flag = languageVisuals[language]?.flag;
    return flag ? <img className="commerce-language-flag" src={`/commerce/flags/${flag}.svg`} alt="" width={20} height={15} /> : <GlobeIcon size={16} />;
}

const groups = [
    ["domestic", translate("ecommerce.marketPicker.chineseEcommerce")],
    ["crossBorder", translate("ecommerce.marketPicker.crossBorderEcommerce")],
] as const;

/** 投放平台与输出语言：居中弹窗，单层表面，平台按分组平铺。 */
export function CommerceMarketPicker({
    platform,
    language,
    region,
    onPlatform,
    onLanguage,
    onRegion,
    onClose,
}: {
    platform: string;
    language: string;
    region: string;
    onPlatform: (value: string) => void;
    onLanguage: (value: string) => void;
    onRegion: (value: string) => void;
    onClose: () => void;
}) {
    const [languageOpen, setLanguageOpen] = useState(false);
    const knowledge = commerceKnowledgeFor(platform);
    return (
        <AppModal open flush closable={false} footer={null} width="min(680px, calc(100vw - 32px))" onCancel={onClose} centered className="commerce-market-modal">
            <section className="commerce-market" role="dialog" aria-label={translate("ecommerce.marketPicker.ecommercePlatformAndLanguage")} data-canvas-no-zoom>
                <header className="commerce-market-head">
                    <div>
                        <h2>{translate("ecommerce.marketPicker.targetPlatformAndLanguage")}</h2>
                        <p>{translate("ecommerce.marketPicker.thePlatformDeterminesImageRulesAndCopyConstraintsTheLanguage")}</p>
                    </div>
                    <button type="button" className="commerce-market-close" aria-label={translate("ecommerce.marketPicker.closeSettings")} onClick={onClose}>
                        <X size={16} />
                    </button>
                </header>
                <div className="commerce-market-body" data-canvas-wheel-scroll>
                    {groups.map(([group, title]) => (
                        <section key={group} className="commerce-market-group">
                            <h3>{title}</h3>
                            <div className="commerce-market-grid">
                                {commercePlatformGroups[group].map((id) => (
                                    <button type="button" key={id} className={platform === id ? "is-selected" : ""} aria-pressed={platform === id} title={displayLabelOf(platforms, id)} onClick={() => onPlatform(id)}>
                                        <span className="commerce-market-logo" aria-hidden="true">
                                            <PlatformMark platform={id} />
                                        </span>
                                        <span className="commerce-market-name">{displayLabelOf(platforms, id)}</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                    <div className="commerce-market-fields">
                        <div className="commerce-market-field">
                            <h3>{translate("ecommerce.marketPicker.outputLanguage")}</h3>
                            <button className="commerce-language-trigger" type="button" aria-expanded={languageOpen} aria-controls="commerce-language-options" onClick={() => setLanguageOpen((open) => !open)}>
                                <LanguageFlag language={language} />
                                <strong>{commerceUiText(languageVisuals[language]?.label || displayLabelOf(languages, language))}</strong>
                                <ChevronDown size={14} className={languageOpen ? "is-open" : ""} />
                            </button>
                        </div>
                        <label className="commerce-market-field">
                            <h3>{translate("ecommerce.marketPicker.targetRegionOptional")}</h3>
                            <input aria-label={translate("ecommerce.marketPicker.targetCountryOrRegion")} value={region} maxLength={80} placeholder={translate("ecommerce.marketPicker.eGUnitedStatesJapan")} onChange={(event) => onRegion(event.target.value)} />
                        </label>
                    </div>
                    {languageOpen ? (
                        <div id="commerce-language-options" className="commerce-language-options" role="listbox" aria-label={translate("ecommerce.marketPicker.outputLanguage")}>
                            {languages.map(([id, label]) => (
                                <button
                                    type="button"
                                    key={id}
                                    role="option"
                                    aria-selected={language === id}
                                    onClick={() => {
                                        onLanguage(id);
                                        setLanguageOpen(false);
                                    }}
                                >
                                    <LanguageFlag language={id} />
                                    <strong>{commerceUiText(languageVisuals[id]?.label || label)}</strong>
                                    {language === id ? <Check size={14} /> : null}
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {knowledge ? (
                        <details className="commerce-market-rules" aria-label={translate("ecommerce.marketPicker.imageRulesForTheSelectedPlatform")}>
                            <summary>{displayLabelOf(platforms, platform)} {translate("ecommerce.marketPicker.imageAndContentRequirements")}</summary>
                            <div>
                                {[knowledge.style, knowledge.risk, knowledge.scope].filter(Boolean).map((text) => (
                                    <p key={text}>{commerceUiText(text)}</p>
                                ))}
                                {knowledge.officialRules.length ? (
                                    <ul>
                                        {knowledge.officialRules.map((rule) => (
                                            <li key={rule}>{commerceUiText(rule)}</li>
                                        ))}
                                    </ul>
                                ) : null}
                                <p className="commerce-market-source">
                                    {knowledge.reviewStatus === "pending" ? translate("ecommerce.marketPicker.detailedRulesRequireVerificationInTheOfficialDashboard") : translate("ecommerce.marketPicker.somePublicSourcesVerified", { v0: String(knowledge.checkedAt) })}
                                    {knowledge.sources.map((url, index) => (
                                        <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                            {translate("ecommerce.marketPicker.officialSources")} {index + 1}
                                        </a>
                                    ))}
                                </p>
                                <p className="commerce-market-source">
                                    {translate("ecommerce.marketPicker.commonRiskyWordingExamples")}{commercePlatformKnowledge.restrictedPhrases.join("、")}{translate("ecommerce.marketPicker.notACompleteOfficialProhibitedWordList")}{commerceUiText(commercePlatformKnowledge.boundary)}
                                </p>
                            </div>
                        </details>
                    ) : null}
                </div>
                <footer className="commerce-market-foot">
                    <span>
                        {translate("ecommerce.marketPicker.current")}{displayLabelOf(platforms, platform)} · {commerceUiText(languageVisuals[language]?.label || displayLabelOf(languages, language))}
                        {region.trim() ? ` · ${region.trim()}` : ""}
                    </span>
                    <Button type="primary" onClick={onClose}>
                        {translate("account.payment.done")}
                    </Button>
                </footer>
            </section>
        </AppModal>
    );
}
