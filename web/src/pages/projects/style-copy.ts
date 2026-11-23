import { translate } from "@/i18n";
import { DRAMA_STYLES, filterDramaStyles, type DramaStyle, type DramaStyleCategory } from "@/lib/drama/drama-styles";

/** 风格详情同时参与生成提示词，翻译只用于展示，prompt 保留源内容。 */
export function dramaStyleDisplay(style: DramaStyle): DramaStyle {
    const prefix = `drama.styleCatalog.${style.id}`;
    return {
        ...style,
        name: translate(`${prefix}.name`, { defaultValue: style.name }),
        description: translate(`${prefix}.description`, { defaultValue: style.description }),
        tags: style.tags.map((tag, index) => translate(`${prefix}.tags.${index}`, { defaultValue: tag })),
        detail: {
            medium: translate(`${prefix}.detail.medium`, { defaultValue: style.detail.medium }),
            world: translate(`${prefix}.detail.world`, { defaultValue: style.detail.world }),
            look: translate(`${prefix}.detail.look`, { defaultValue: style.detail.look }),
            wardrobe: translate(`${prefix}.detail.wardrobe`, { defaultValue: style.detail.wardrobe }),
            forbid: translate(`${prefix}.detail.forbid`, { defaultValue: style.detail.forbid }),
        },
    };
}

export function dramaStyleDisplayName(name: string) {
    const style = DRAMA_STYLES.find((item) => item.name === name);
    return style ? dramaStyleDisplay(style).name : name;
}

export function filterDramaStyleDisplay(category: "all" | "hot" | DramaStyleCategory, query: string) {
    const keyword = query.trim().toLowerCase();
    return filterDramaStyles(category, "").flatMap((source) => {
        const display = dramaStyleDisplay(source);
        const texts = [source.name, source.description, ...source.tags, display.name, display.description, ...display.tags];
        return !keyword || texts.some((text) => text.toLowerCase().includes(keyword)) ? [display] : [];
    });
}
