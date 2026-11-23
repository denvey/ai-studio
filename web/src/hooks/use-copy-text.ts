import copy from "copy-to-clipboard";
import { App } from "antd";
import { translate } from "@/i18n";


const COPIED_HINT = translate("canvasB.common.copied");

export function useCopyText() {
    const feedback = App.useApp().message;
    return (value: string, successText = COPIED_HINT) => {
        copy(String(value));
        feedback.success(successText);
    };
}
