import additionalZhCN from "./additional.zh-CN.json";
import additionalEnUS from "./additional.en-US.json";
import { zhCN } from "./zh-CN";
import { enUS } from "./en-US";
import { frFR } from "./fr-FR";
import { deDE } from "./de-DE";
import { jaJP } from "./ja-JP";
import { koKR } from "./ko-KR";

export const catalog = { "zh-CN": { ...zhCN, ...additionalZhCN }, "en-US": { ...enUS, ...additionalEnUS }, "fr-FR": { ...additionalZhCN, ...frFR }, "de-DE": { ...additionalZhCN, ...deDE }, "ja-JP": { ...additionalZhCN, ...jaJP }, "ko-KR": { ...additionalZhCN, ...koKR } };
