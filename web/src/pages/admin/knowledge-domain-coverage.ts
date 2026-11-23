
import { translate } from "@/i18n";
export const commerceKnowledgeDomains = [
    { id: "KB01", label: translate("adminPages.knowledgeDomainCoverage.globalEcommerceIndustry") },
    { id: "KB02", label: translate("adminPages.knowledgeDomainCoverage.productSellingPointsAndMarketing") },
    { id: "KB03", label: translate("adminPages.knowledgeDomainCoverage.advancedVisualDesign") },
    { id: "KB04", label: translate("adminPages.knowledgeDomainCoverage.mainImageAndProductDetailLayouts") },
    { id: "KB05", label: translate("adminPages.knowledgeDomainCoverage.ecommerceCopywriting") },
    { id: "KB06", label: translate("adminPages.knowledgeDomainCoverage.commercialProductPhotography") },
    { id: "KB07", label: translate("adminPages.knowledgeDomainCoverage.modelsAndScenes") },
    { id: "KB08", label: translate("adminPages.knowledgeDomainCoverage.domesticAndInternationalPlatformGuidelines") },
    { id: "KB09", label: translate("adminPages.knowledgeDomainCoverage.popularTopicsAndCreativeTrends") },
    { id: "KB10", label: translate("adminPages.knowledgeDomainCoverage.faithfulRepresentationAndQualityControl") },
    { id: "KB11", label: translate("adminPages.knowledgeDomainCoverage.categorySpecificStorytelling") },
    { id: "KB12", label: translate("adminPages.knowledgeDomainCoverage.typographyAndInformationComponents") },
    { id: "KB13", label: translate("adminPages.knowledgeDomainCoverage.realismInPortraitPhotography") },
    { id: "KB14", label: translate("adminPages.knowledgeDomainCoverage.featuresAndSpecifications") },
    { id: "KB15", label: translate("adminPages.knowledgeDomainCoverage.callableSkillMethods") },
    { id: "KB16", label: translate("adminPages.knowledgeDomainCoverage.imageExecutionStrategies") },
    { id: "KB17", label: translate("adminPages.knowledgeDomainCoverage.generatedResultAcceptance") },
    { id: "KB18", label: translate("adminPages.knowledgeDomainCoverage.industryWideCategoryDictionary") },
    { id: "KB19", label: translate("adminPages.knowledgeDomainCoverage.industryAndSubcategoryRouting") },
] as const;

export function commerceKnowledgeDomainRows(coverage?: Record<string, number>) {
    return commerceKnowledgeDomains.map(({ id, label }) => ({ id, label, count: Math.max(0, Number(coverage?.[id]) || 0) }));
}
