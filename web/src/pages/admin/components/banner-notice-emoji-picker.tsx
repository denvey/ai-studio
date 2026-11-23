import { Input, Popover, Button } from "antd";
import { SmilePlus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { BANNER_NOTICE_EMOJI_GROUPS, searchBannerNoticeEmojis } from "@/lib/announcements/banner-notice";
import { translate } from "@/i18n";

/**
 * emoji 图标素材面板：按分组铺开，支持按中文名搜索。
 * 选中即作为普通文本插进标题光标处，可插任意多个、任意位置，并跟随光标处的字号 / 颜色样式。
 * 面板不自动关闭，方便连续插入；点击面板外任意位置收起。
 */
export function BannerNoticeEmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
    const [keyword, setKeyword] = useState("");

    const matched = useMemo(() => new Set(searchBannerNoticeEmojis(keyword).map((item) => item.char)), [keyword]);
    const groups = useMemo(
        () =>
            BANNER_NOTICE_EMOJI_GROUPS.map((group) => ({
                ...group,
                emoji: group.emoji.filter((item) => matched.has(item.char)),
            })).filter((group) => group.emoji.length > 0),
        [matched],
    );

    return (
        <div className="admin-banner-icon-picker">
            <div className="admin-banner-icon-picker-search">
                <Input
                    size="small"
                    allowClear
                    aria-label={translate("admin.bannerNoticeEmojiPicker.searchIconAssets")}
                    placeholder={translate("admin.bannerNoticeEmojiPicker.searchAssetsForExampleGiftRocket")}
                    prefix={<Search className="size-3.5 text-foreground/40" aria-hidden="true" />}
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                />
            </div>

            <div className="admin-banner-icon-picker-body">
                {groups.length ? (
                    groups.map((group) => (
                        <div key={group.key} className="admin-banner-icon-picker-group">
                            <span className="admin-banner-icon-picker-group-label">{group.label}</span>
                            <div className="admin-banner-icon-picker-grid" role="listbox" aria-label={translate("admin.bannerNoticeEmojiPicker.assets", { v0: String(group.label) })}>
                                {group.emoji.map((item) => (
                                    <button
                                        key={item.char}
                                        type="button"
                                        role="option"
                                        aria-selected="false"
                                        aria-label={item.label}
                                        title={item.label}
                                        className="admin-banner-icon-picker-option admin-banner-icon-picker-option-emoji"
                                        onClick={() => onPick(item.char)}
                                    >
                                        {item.char}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="admin-banner-icon-picker-empty">{translate("admin.bannerNoticeEmojiPicker.noAssetsMatching")}{keyword.trim()}{translate("admin.bannerNoticeEmojiPicker.assets2")}</p>
                )}
            </div>
        </div>
    );
}

/**
 * 标题编辑工具栏的「插入图标」入口：默认不占任何视觉位，点了才弹出素材面板。
 * onPick 由调用方提供（编辑器要把内容插到光标处）。
 */
export function BannerNoticeEmojiPopover({ onPick }: { onPick: (emoji: string) => void }) {
    return (
        <Popover
            trigger="click"
            placement="bottomLeft"
            arrow={false}
            content={<BannerNoticeEmojiPanel onPick={onPick} />}
            // AntD 6 Popover 的语义样式键是 content / container / root / arrow，没有 body；
            // container 对应 .ant-popover-inner（内边距所在元素）。
            styles={{ container: { padding: 0 } }}
        >
            <Button size="small" type="text" title={translate("admin.bannerNoticeEmojiPicker.insertAnEmojiIconAtTheCursor")} icon={<SmilePlus className="size-3.5" />} aria-label={translate("admin.bannerNoticeEmojiPicker.insertIconAsset")}>
                {translate("admin.bannerNoticeEmojiPicker.icons")}
            </Button>
        </Popover>
    );
}
