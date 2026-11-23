import { translate } from "@/i18n";
import sourceMessages from "@/i18n/messages/areas/ecommerce/additional.zh-CN.json";

// These values also feed model instructions or existing state comparisons. Keep
// the source data intact and translate only when displaying it in the UI.
const entries = Object.entries(sourceMessages.display);
const exactKeys = new Map(entries.map(([key, text]) => [text, `ecommerce.display.${key}`]));
const templates = entries
    .filter(([, text]) => text.includes("{{"))
    .map(([key, text]) => {
        const names: string[] = [];
        const parts = text.split(/(\{\{[^{}]+\}\})/g).map((part) => {
            const match = /^\{\{([^{}]+)\}\}$/.exec(part);
            if (match) {
                names.push(match[1]);
                return "([\\s\\S]*?)";
            }
            return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        });
        return { key: `ecommerce.display.${key}`, names, pattern: new RegExp(`^${parts.join("")}$`), specificity: text.replace(/\{\{[^{}]+\}\}/g, "").length };
    })
    .sort((left, right) => right.specificity - left.specificity);

export function commerceUiText(text: string): string {
    const exact = exactKeys.get(text);
    if (exact) return translate(exact);
    for (const { key, names, pattern } of templates) {
        const match = pattern.exec(text);
        if (match) return translate(key, Object.fromEntries(names.map((name, index) => [name, match[index + 1]])));
    }
    return text;
}
