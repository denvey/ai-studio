import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Select } from "antd";
import { Mic, MicOff, Pause, Play, Square, Upload, X } from "lucide-react";

import { useVoiceRecording } from "@/hooks/use-voice-recording";
import { clearDramaCastVoice, setDramaCastVoice, type DramaCast } from "@/services/api/drama";
import { listVoiceProfiles } from "@/services/api/projects";
import { getResourceAccess, resolveResourceAccessURL, resourceStorageKey, uploadResourceFile } from "@/services/api/resources";
import { translate } from "@/i18n";

const VOICE_PROFILES_KEY = ["voice-profiles"] as const;
const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;
const MAX_RECORD_SECONDS = 30;
const AUDIO_ACCEPT = "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/flac,audio/ogg,audio/webm,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.webm";

/** 试听服务端的声音样本；换样本或卸载时停止播放。 */
function useSamplePlayer(resourceId: string) {
    const { message } = App.useApp();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const requestRef = useRef(0);
    const [playing, setPlaying] = useState(false);
    useEffect(() => {
        setPlaying(false);
        return () => {
            requestRef.current++;
            audioRef.current?.pause();
            audioRef.current = null;
        };
    }, [resourceId]);
    const toggle = async () => {
        if (!resourceId) return;
        const audio = audioRef.current || (audioRef.current = new Audio());
        const version = ++requestRef.current;
        if (playing) {
            audio.pause();
            setPlaying(false);
            return;
        }
        setPlaying(true);
        try {
            const access = await getResourceAccess(resourceStorageKey(resourceId), "display", "playback");
            if (version !== requestRef.current) return;
            audio.src = resolveResourceAccessURL(access.url);
            audio.onended = () => setPlaying(false);
            audio.onerror = () => {
                setPlaying(false);
                message.error(translate("drama.studio.castVoice.voiceSamplePlaybackFailedTryAgain"));
            };
            await audio.play();
            if (version !== requestRef.current) audio.pause();
        } catch (error) {
            if (version !== requestRef.current) return;
            setPlaying(false);
            message.error(error instanceof Error ? error.message : translate("drama.studio.castVoice.voiceSamplePlaybackFailed"));
        }
    };
    return { playing, toggle };
}

/** 卡片与参考面板共用声音状态和试听入口。 */
export function CastVoicePreview({ resourceId, name }: { resourceId?: string; name: string }) {
    const player = useSamplePlayer(resourceId || "");
    return (
        <button
            type="button"
            className="drama-voice-preview"
            disabled={!resourceId}
            aria-label={resourceId ? translate("drama.studio.castVoice.audioFor", { v0: String(player.playing ? translate("canvasA.outbox.pause") : translate("settings.preferences.previewSound")), v1: String(name) }) : translate("drama.studio.castVoice.hasNoAudio", { v0: String(name) })}
            onClick={(event) => {
                event.stopPropagation();
                void player.toggle();
            }}
        >
            {player.playing ? <Pause className="size-3.5" /> : resourceId ? <Play className="size-3.5" /> : <MicOff className="size-3.5" />}
            {resourceId ? (player.playing ? translate("drama.studio.castVoice.pausePreview") : translate("drama.studio.castVoice.audioAvailablePreview")) : translate("drama.studio.castVoice.noAudio")}
        </button>
    );
}

/**
 * 角色声音：从声音库选一条带样本的声音，或上传 / 录制一段角色的声音。视频模型支持参考音频时，
 * 该角色开口的剧情段会带上这段样本；不支持时按声线描述生成。造型沿用所属角色的声音。
 */
export function CastVoiceField({ projectId, cast, restyle, onChanged }: { projectId: string; cast: DramaCast; restyle: boolean; onChanged: () => void }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const fileRef = useRef<HTMLInputElement>(null);
    const profilesQuery = useQuery({ queryKey: VOICE_PROFILES_KEY, queryFn: listVoiceProfiles, staleTime: 60_000 });
    // 只有带样本音频的声音能随视频请求发送；只有音色名的内置声音不列出。
    const profiles = (profilesQuery.data?.profiles || []).filter((profile) => profile.status === "active" && profile.sampleResourceId);
    const current = profiles.find((profile) => profile.id === cast.voiceProfileId);
    const sampleId = cast.voiceSampleResourceId || "";
    const player = useSamplePlayer(sampleId);
    // 录音 Hook 到达上限时只停止录制、不交出音频，所以上限由这里在录音仍在进行时主动结束（见下方 effect）。
    const recorder = useVoiceRecording({ maxDuration: MAX_RECORD_SECONDS * 20 });
    const finishingRef = useRef(false);
    const done = (result: { affectedSegments: number }, text: string) => {
        message.success(result.affectedSegments ? translate("drama.studio.castVoice.segmentVideosNeedRegeneration", { v0: String(text), v1: String(result.affectedSegments) }) : text);
        void queryClient.invalidateQueries({ queryKey: VOICE_PROFILES_KEY });
        onChanged();
    };
    const bind = useMutation({
        mutationFn: (input: { voiceProfileId?: string; sampleResourceId?: string; voiceName?: string }) => setDramaCastVoice(projectId, cast.id, { ...input, restyleSegments: restyle }),
        onSuccess: (result) => done(result, translate("drama.studio.castVoice.characterVoiceAssigned")),
        onError: (error) => message.error(error instanceof Error ? error.message : translate("drama.studio.castVoice.failedToAssignVoice")),
    });
    const upload = useMutation({
        mutationFn: async ({ file, name }: { file: Blob; name: string }) => {
            const resource = await uploadResourceFile(file, "audio", { fileName: name });
            return setDramaCastVoice(projectId, cast.id, { sampleResourceId: resource.id, voiceName: name.replace(/\.[^.]+$/, "").slice(0, 60), restyleSegments: restyle });
        },
        onSuccess: (result) => done(result, translate("drama.studio.castVoice.characterVoiceUploadedAndAssigned")),
        onError: (error) => message.error(error instanceof Error ? error.message : translate("library.assets.batch.uploadFailed")),
    });
    const clear = useMutation({
        mutationFn: () => clearDramaCastVoice(projectId, cast.id, restyle),
        onSuccess: (result) => done(result, translate("drama.studio.castVoice.characterVoiceClearedGenerationWillUseTheVoiceDescription")),
        onError: (error) => message.error(error instanceof Error ? error.message : translate("drama.studio.castVoice.failedToClear")),
    });
    const busy = bind.isPending || upload.isPending || clear.isPending;
    const recording = recorder.state !== "idle";
    const finishRecording = async () => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        try {
            const blob = await recorder.stop();
            if (!blob || !blob.size) {
                message.warning(translate("drama.studio.castVoice.noAudioRecordedTryAgain"));
                return;
            }
            const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
            upload.mutate({ file: blob, name: translate("drama.studio.castVoice.recording2", { v0: String(cast.name), v1: String(extension) }) });
        } finally {
            finishingRef.current = false;
        }
    };
    useEffect(() => {
        if (recorder.state === "recording" && recorder.duration >= MAX_RECORD_SECONDS) void finishRecording();
        // finishRecording 每次渲染都是新函数；只在时长到达上限时触发一次。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recorder.duration, recorder.state]);
    return (
        <div className="drama-voice">
            <div className="drama-voice-current">
                <button type="button" className="drama-voice-play" disabled={!sampleId} aria-label={sampleId ? translate("drama.studio.castVoice.voiceFor", { v0: String(player.playing ? translate("canvasA.outbox.pause") : translate("settings.preferences.previewSound")), v1: String(cast.name) }) : translate("drama.studio.castVoice.noVoiceSampleSelected")} onClick={() => void player.toggle()}>
                    {player.playing ? <Pause className="size-3.5" /> : sampleId ? <Play className="size-3.5" /> : <Mic className="size-3.5" />}
                </button>
                <span className="min-w-0 flex-1 truncate">{sampleId ? current?.name || translate("drama.studio.castVoice.voiceSampleSelected") : translate("drama.studio.castVoice.noVoiceSampleSelectedGenerateFromTheVoiceDescription")}</span>
                {sampleId ? <Button size="small" type="text" icon={<X className="size-3.5" />} loading={clear.isPending} disabled={busy && !clear.isPending} aria-label={translate("drama.studio.castVoice.clearCharacterVoice")} onClick={() => clear.mutate()} /> : null}
            </div>
            {recording ? (
                <div className="drama-voice-recording" role="status">
                    <span className="drama-voice-dot" aria-hidden="true" />
                    {translate("drama.studio.castVoice.recording")} {Math.floor(recorder.duration)} / {MAX_RECORD_SECONDS} {translate("account.settings.models.unitSecond")}
                    <span className="flex-1" />
                    <Button size="small" onClick={() => recorder.cancel()}>
                        {translate("common.cancel")}
                    </Button>
                    <Button size="small" type="primary" icon={<Square className="size-3" />} onClick={() => void finishRecording()}>
                        {translate("account.payment.done")}
                    </Button>
                </div>
            ) : (
                <div className="drama-voice-actions">
                    <Select
                        size="small"
                        className="min-w-0 flex-1"
                        value={current?.id ?? null}
                        placeholder={profilesQuery.isLoading ? translate("drama.studio.castVoice.loadingVoiceLibrary") : profiles.length ? translate("drama.studio.castVoice.chooseFromVoiceLibrary") : translate("drama.studio.castVoice.noSamplesInTheVoiceLibraryYet")}
                        options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
                        disabled={busy || !profiles.length}
                        showSearch
                        optionFilterProp="label"
                        aria-label={translate("drama.studio.castVoice.chooseFromVoiceLibrary")}
                        onChange={(id: string | null) => {
                            if (id && id !== cast.voiceProfileId) bind.mutate({ voiceProfileId: id });
                        }}
                    />
                    <Button size="small" icon={<Upload className="size-3.5" />} loading={upload.isPending} disabled={busy && !upload.isPending} onClick={() => fileRef.current?.click()}>
                        {translate("canvasA.assetView.upload")}
                    </Button>
                    <Button
                        size="small"
                        icon={<Mic className="size-3.5" />}
                        disabled={busy}
                        onClick={() =>
                            void recorder.start().catch(() => {
                                message.error(translate("drama.studio.castVoice.microphoneUnavailableCheckBrowserPermissions"));
                            })
                        }
                    >
                        {translate("drama.studio.castVoice.record")}
                    </Button>
                </div>
            )}
            {recorder.error ? <p className="drama-voice-error">{recorder.error}</p> : null}
            <input
                ref={fileRef}
                type="file"
                accept={AUDIO_ACCEPT}
                className="hidden"
                aria-label={translate("drama.studio.castVoice.uploadAVoiceSampleFor", { v0: String(cast.name) })}
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (file.size > MAX_SAMPLE_BYTES) {
                        message.warning(translate("drama.studio.castVoice.voiceSamplesMustBeNoLargerThan20MB5"));
                        return;
                    }
                    upload.mutate({ file, name: file.name });
                }}
            />
        </div>
    );
}
