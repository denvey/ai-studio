import { doubaoAudioVoiceOptions, doubaoDefaultAudioVoice } from "@/lib/doubao-audio-voices";
import { resolveModelRequestConfig } from "@/stores/use-config-store";
import type { AiConfig } from "@/stores/use-config-store";
import { translate } from "@/i18n";


export { doubaoAudioVoiceOptions, doubaoDefaultAudioVoice };

export const openAIAudioVoiceOptions = [
    { value: "alloy", label: "Alloy" },
    { value: "ash", label: "Ash" },
    { value: "ballad", label: "Ballad" },
    { value: "coral", label: "Coral" },
    { value: "echo", label: "Echo" },
    { value: "fable", label: "Fable" },
    { value: "nova", label: "Nova" },
    { value: "onyx", label: "Onyx" },
    { value: "sage", label: "Sage" },
    { value: "shimmer", label: "Shimmer" },
    { value: "verse", label: "Verse" },
    { value: "marin", label: "Marin" },
    { value: "cedar", label: "Cedar" },
];

export const doubaoAudioLanguageOptions = [
    { value: "", label: translate("shared.audioGeneration.autoDetect") },
    { value: "zh-cn", label: translate("shared.audioGeneration.chineseMandarin") },
    { value: "en", label: translate("shared.audioGeneration.english") },
    { value: "ja", label: translate("shared.audioGeneration.japanese") },
    { value: "es-mx", label: translate("shared.audioGeneration.spanishMexico") },
    { value: "id", label: translate("shared.audioGeneration.indonesian") },
    { value: "pt-br", label: translate("shared.audioGeneration.portugueseBrazil") },
    { value: "pt", label: translate("shared.audioGeneration.portuguese") },
    { value: "ko", label: translate("shared.audioGeneration.korean") },
    { value: "it", label: translate("shared.audioGeneration.italian") },
    { value: "de", label: translate("shared.audioGeneration.german") },
    { value: "fr", label: translate("shared.audioGeneration.french") },
    { value: "th", label: translate("shared.audioGeneration.thai") },
    { value: "vi", label: translate("shared.audioGeneration.vietnamese") },
    { value: "ru", label: translate("shared.audioGeneration.russian") },
    { value: "fil", label: translate("shared.audioGeneration.filipino") },
    { value: "ms", label: translate("shared.audioGeneration.malay") },
    { value: "ar", label: translate("shared.audioGeneration.arabic") },
    { value: "pl", label: translate("shared.audioGeneration.polish") },
    { value: "tr", label: translate("shared.audioGeneration.turkish") },
    { value: "sv", label: translate("shared.audioGeneration.swedish") },
    { value: "nl", label: translate("shared.audioGeneration.dutch") },
    { value: "no", label: translate("shared.audioGeneration.norwegian") },
    { value: "uk", label: translate("shared.audioGeneration.ukrainian") },
    { value: "fi", label: translate("shared.audioGeneration.finnish") },
    { value: "da", label: translate("shared.audioGeneration.danish") },
    { value: "cs", label: translate("shared.audioGeneration.czech") },
    { value: "hu", label: translate("shared.audioGeneration.hungarian") },
    { value: "el", label: translate("shared.audioGeneration.greek") },
    { value: "ro", label: translate("shared.audioGeneration.romanian") },
    { value: "hi", label: translate("shared.audioGeneration.hindi") },
    { value: "es-es", label: translate("shared.audioGeneration.spanishSpain") },
];

export const doubaoAudioDialectOptions = [
    { value: "", label: translate("account.layout.oss.auto") },
    { value: "beijing", label: translate("shared.audioGeneration.beijingDialect") },
    { value: "dongbei", label: translate("shared.audioGeneration.northeasternMandarin") },
    { value: "henan", label: translate("shared.audioGeneration.henanDialect") },
    { value: "shaanxi", label: translate("shared.audioGeneration.shaanxiDialect") },
    { value: "shanghai", label: translate("shared.audioGeneration.shanghainese") },
    { value: "sichuan", label: translate("shared.audioGeneration.sichuanDialect") },
    { value: "tianjin", label: translate("shared.audioGeneration.tianjinDialect") },
    { value: "yue", label: translate("shared.audioGeneration.cantonese") },
];

export const openAIAudioFormatOptions = [
    { value: "mp3", label: "MP3" },
    { value: "wav", label: "WAV" },
    { value: "opus", label: "Opus" },
    { value: "aac", label: "AAC" },
    { value: "flac", label: "FLAC" },
    { value: "pcm", label: "PCM" },
];

export const doubaoAudioFormatOptions = [
    { value: "mp3", label: "MP3" },
    { value: "wav", label: "WAV" },
    { value: "ogg_opus", label: "OGG Opus" },
    { value: "pcm", label: "PCM" },
];

export function isDoubaoAudioConfig(config: AiConfig) {
    return resolveModelRequestConfig(config, config.model || config.audioModel).interfaceType === "doubao-streaming-tts";
}

export function audioVoiceOptionsForConfig(config: AiConfig) {
    return isDoubaoAudioConfig(config) ? doubaoAudioVoiceOptions : openAIAudioVoiceOptions;
}

export function audioFormatOptionsForConfig(config: AiConfig) {
    return isDoubaoAudioConfig(config) ? doubaoAudioFormatOptions : openAIAudioFormatOptions;
}

export function normalizeAudioVoiceForConfig(config: AiConfig, value: string) {
    const options = audioVoiceOptionsForConfig(config);
    const normalized = String(value || "").trim();
    if (isDoubaoAudioConfig(config)) {
        if (!normalized || normalized === "alloy") return "";
        return normalized;
    }
    if (options.some((item) => item.value === normalized)) return normalized;
    return normalized || "alloy";
}

export function normalizeAudioFormatForConfig(config: AiConfig, value: string) {
    const options = audioFormatOptionsForConfig(config);
    return options.some((item) => item.value === value) ? value : "mp3";
}

export function audioVoiceLabelForConfig(config: AiConfig, value: string) {
    const normalized = normalizeAudioVoiceForConfig(config, value);
    const options = audioVoiceOptionsForConfig(config);
    return options.find((item) => item.value === normalized)?.label || normalized;
}

export function audioFormatLabelForConfig(config: AiConfig, value: string) {
    const normalized = normalizeAudioFormatForConfig(config, value);
    const options = audioFormatOptionsForConfig(config);
    return options.find((item) => item.value === normalized)?.label || normalized;
}

export function normalizeAudioVoiceValue(value: string) {
    const normalized = String(value || "").trim();
    return normalized || "alloy";
}

export function normalizeAudioFormatValue(value: string) {
    return openAIAudioFormatOptions.some((item) => item.value === value) ? value : "mp3";
}

export function normalizeAudioSpeedValue(value: string) {
    if (!String(value ?? "").trim()) return "1";
    const speed = Number(value);
    if (!Number.isFinite(speed)) return "1";
    return String(Math.max(0.25, Math.min(4, Number(speed.toFixed(2)))));
}

export function audioVoiceLabel(value: string) {
    const voice = normalizeAudioVoiceValue(value);
    return openAIAudioVoiceOptions.find((item) => item.value === voice)?.label || voice;
}

export function audioFormatLabel(value: string) {
    const format = normalizeAudioFormatValue(value);
    return openAIAudioFormatOptions.find((item) => item.value === format)?.label || format;
}

export function audioSpeedLabel(value: string) {
    return `${normalizeAudioSpeedValue(value)}x`;
}

export function audioMimeType(format: string) {
    if (format === "wav") return "audio/wav";
    if (format === "opus") return "audio/opus";
    if (format === "aac") return "audio/aac";
    if (format === "flac") return "audio/flac";
    if (format === "pcm") return "audio/pcm";
    return "audio/mpeg";
}
