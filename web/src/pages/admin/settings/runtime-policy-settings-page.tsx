import { App, Button, Form, InputNumber, Skeleton } from "antd";
import { AlertTriangle, Database, Gauge, Infinity as InfinityIcon, Network, RefreshCw, RotateCcw, Save, ShieldCheck, TimerReset, Orbit } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "react-router";

import { cn } from "@/lib/utils";
import { getAdminRuntimePolicySetting, getAdminSelfUseRuntimePolicy, resetAdminRuntimePolicySetting, updateAdminRuntimePolicySetting, type RuntimePolicySetting } from "@/services/api/auth";
import { useAdminContext } from "../admin-context";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatTile, AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";
import { currentLocale, translate } from "@/i18n";

type PolicyGroup = "resource" | "storage" | "task" | "request";
type RuntimePolicyDraft = Pick<RuntimePolicySetting, "resource" | "storage" | "task" | "request">;
type PolicyField = { group: PolicyGroup; name: string; label: string; extra: string; unit: string; min?: number; max: number };
type PolicySectionDefinition = {
    id: string;
    icon: ReactNode;
    title: string;
    shortTitle: string;
    description: string;
    fields: PolicyField[];
    status?: ReactNode;
};

const resourceFields: PolicyField[] = [
    {
        group: "resource",
        name: "resourceUploadMB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.singleRegularResourceFile"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.perFileLimitForAssetUploadsAndRemoteImports"),
        unit: "MB",
        max: 999,
    },
    {
        group: "resource",
        name: "generatedFileMB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.aSingleGeneratedResource"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.perFileLimitForUpstreamGenerationResponsesAndStoredResources"),
        unit: "MB",
        max: 999,
    },
    {
        group: "resource",
        name: "dailyUploadMB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.dailyUploadTotal"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.resourceAndAttachmentUploadsAreCountedPerUTCCalendarDay"),
        unit: "MB",
        max: 999_999,
    },
    {
        group: "resource",
        name: "storedFileGB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.totalAccountFiles"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.totalOfResourceFilesAndAgentSessionAttachments"),
        unit: "GB",
        max: 999,
    },
    {
        group: "resource",
        name: "structuredDataMB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.totalStructuredData"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.totalStructuredDataForCanvasesAssetsAndAgentSessions"),
        unit: "MB",
        max: 999_999,
    },
    {
        group: "resource",
        name: "taskDataGB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.totalTaskData"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.totalOfTaskHistoryResultsAndUpstreamRequestLogs"),
        unit: "GB",
        max: 999,
    },
    {
        group: "resource",
        name: "assetCount",
        label: translate("adminPages.settings.runtimePolicySettingsPage.assets"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.numberOfAssetRecordsAnAccountCanStore"),
        unit: translate("account.layout.pagination.item"),
        max: 999_999_999,
    },
    {
        group: "resource",
        name: "canvasCount",
        label: translate("adminPages.settings.runtimePolicySettingsPage.canvases"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.numberOfCanvasesAnAccountCanStore"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.items"),
        max: 999_999_999,
    },
    {
        group: "resource",
        name: "taskCount",
        label: translate("adminPages.settings.runtimePolicySettingsPage.taskHistoryEntries"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.numberOfTaskHistoryRecordsRetainedPerAccount"),
        unit: translate("account.layout.pagination.item"),
        max: 999_999_999,
    },
    {
        group: "resource",
        name: "apiCallLogCount",
        label: translate("adminPages.settings.runtimePolicySettingsPage.requestLogs"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.numberOfUpstreamRequestLogsRetainedPerAccount"),
        unit: translate("account.layout.pagination.item"),
        max: 999_999_999,
    },
    {
        group: "resource",
        name: "recycleBinRetentionDays",
        label: translate("adminPages.settings.runtimePolicySettingsPage.recycleBinAutomaticCleanupInterval"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.daysBeforeAssetsInTheRecycleBinArePermanentlyDeleted"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.days"),
        min: 0,
        max: 365,
    },
];

const storageFields: PolicyField[] = [
    {
        group: "storage",
        name: "transferTimeoutSeconds",
        label: translate("adminPages.settings.runtimePolicySettingsPage.objectStorageTransferTimeout"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumWaitTimeForObjectStorageUploadsDownloadsDeletionsAnd"),
        unit: translate("account.settings.models.unitSecond"),
        min: 10,
        max: 3_600,
    },
    {
        group: "storage",
        name: "accessURLTTLSeconds",
        label: translate("adminPages.settings.runtimePolicySettingsPage.accessURLValidity"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.validityOfSignedURLsUsedByBrowsersToAccessObject"),
        unit: translate("account.settings.models.unitSecond"),
        min: 60,
        max: 86_400,
    },
    {
        group: "storage",
        name: "providerAccessURLTTLSeconds",
        label: translate("adminPages.settings.runtimePolicySettingsPage.providerAccessURLValidity"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.validityOfURLsUsedByModelsOrOtherExternalProviders"),
        unit: translate("account.settings.models.unitSecond"),
        min: 300,
        max: 86_400,
    },
    {
        group: "storage",
        name: "nonSeekableBufferMB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.nonSeekableUploadBuffer"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumMemoryBufferForS3CompatibleStorageWhenReceivingA"),
        unit: "MB",
        max: 999,
    },
    {
        group: "storage",
        name: "errorBodyKB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.errorResponseRetention"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumDiagnosticContentRetainedFromObjectStorageErrorResponses"),
        unit: "KB",
        max: 1_024,
    },
];
const concurrencyFields: PolicyField[] = [
    {
        group: "task",
        name: "workerConcurrency",
        label: translate("adminPages.settings.runtimePolicySettingsPage.workerConcurrency"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.backgroundTasksTheClusterRunsConcurrently"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.items"),
        max: 999,
    },
    {
        group: "task",
        name: "channelConcurrency",
        label: translate("adminPages.settings.runtimePolicySettingsPage.globalChannelConcurrency"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.concurrencyLimitUsedWhenChannelSelectionFollowsTheSystemDefault"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.items"),
        max: 999,
    },
    {
        group: "task",
        name: "activeTaskLimit",
        label: translate("adminPages.settings.runtimePolicySettingsPage.accountActiveTasks"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.totalTasksQueuedOrRunningAtOncePerAccountAcross"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.items"),
        max: 999,
    },
];

const timeoutFields: PolicyField[] = [
    {
        group: "task",
        name: "imageTimeoutMinutes",
        label: translate("adminPages.settings.runtimePolicySettingsPage.imageTaskTimeout"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumRunTimeBeforeAnImageTaskIsMarkedFailed"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.minutes"),
        max: 9_999,
    },
    {
        group: "task",
        name: "textTimeoutMinutes",
        label: translate("adminPages.settings.runtimePolicySettingsPage.textTaskTimeout"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumRunTimeForTextTasks"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.minutes"),
        max: 9_999,
    },
    {
        group: "task",
        name: "audioTimeoutMinutes",
        label: translate("adminPages.settings.runtimePolicySettingsPage.audioTaskTimeout"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumRunTimeForAudioTasks"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.minutes"),
        max: 9_999,
    },
    {
        group: "task",
        name: "videoTimeoutMinutes",
        label: translate("adminPages.settings.runtimePolicySettingsPage.videoTaskTimeout"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumRunTimeForVideoTasks"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.minutes"),
        max: 9_999,
    },
    {
        group: "task",
        name: "storyboardTimeoutMinutes",
        label: translate("adminPages.settings.runtimePolicySettingsPage.storyboardTaskTimeout"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumRunTimeForAgentStoryboardTasks"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.minutes"),
        max: 9_999,
    },
    {
        group: "task",
        name: "defaultTimeoutMinutes",
        label: translate("adminPages.settings.runtimePolicySettingsPage.defaultTaskTimeout"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumRunTimeUsedWhenNoSpecificTypeMatches"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.minutes"),
        max: 9_999,
    },
];

const agentFields: PolicyField[] = [
    {
        group: "task",
        name: "agentStepMaxOutputTokens",
        label: translate("adminPages.settings.runtimePolicySettingsPage.outputLimitPerStep"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.outputLimitForEachCanvasAgentModelCallIncludingReasoning"),
        unit: "token",
        min: 0,
        max: 131_072,
    },
    {
        group: "task",
        name: "agentStepTimeoutSeconds",
        label: translate("adminPages.settings.runtimePolicySettingsPage.stepTimeout"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumWaitTimeForEachCanvasAgentModelCallOn"),
        unit: translate("account.settings.models.unitSecond"),
        min: 0,
        max: 3_600,
    },
    {
        group: "task",
        name: "agentMaxSessions",
        label: translate("adminPages.settings.runtimePolicySettingsPage.concurrentConversationLimit"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.concurrentCanvasAgentTurnsNewInstallationsDefaultTo30Waiting"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.items"),
        max: 64,
    },
];

const rateFields: PolicyField[] = [
    {
        group: "request",
        name: "taskCreatePerMinute",
        label: translate("adminPages.settings.runtimePolicySettingsPage.taskCreated"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.tasksThatCanBeCreatedPerAccountPerMinute"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.min"),
        max: 999_999,
    },
    {
        group: "request",
        name: "resourceUploadPerMinute",
        label: translate("adminPages.settings.runtimePolicySettingsPage.resourceUploads"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.resourceUploadsPerAccountPerMinute"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.min"),
        max: 999_999,
    },
    {
        group: "request",
        name: "resourceImportPerMinute",
        label: translate("adminPages.settings.runtimePolicySettingsPage.resourceImports"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.remoteResourceImportsPerAccountPerMinute"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.min"),
        max: 999_999,
    },
    {
        group: "request",
        name: "assetWritePerMinute",
        label: translate("adminPages.settings.runtimePolicySettingsPage.assetWrites"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.assetWritesPerAccountPerMinute"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.min"),
        max: 999_999,
    },
    {
        group: "request",
        name: "canvasWritePerMinute",
        label: translate("adminPages.settings.runtimePolicySettingsPage.canvasWrites"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.canvasWritesPerAccountPerMinute"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.min"),
        max: 999_999,
    },
    {
        group: "request",
        name: "registerPerHour",
        label: translate("adminPages.settings.runtimePolicySettingsPage.accountRegistration"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.registrationRequestsAllowedPerIPPerHourIncludingFailedAttempts"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.hour"),
        max: 999_999,
    },
    {
        group: "request",
        name: "emailCodePerHour",
        label: translate("auth.recovery.code"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.verificationCodeRequestsPerIPPerHourAtLeast60"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.hour"),
        max: 999_999,
    },
    {
        group: "request",
        name: "loginIPPerTenMinutes",
        label: translate("adminPages.settings.runtimePolicySettingsPage.signInIP"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.signInAttemptsAllowedPerIPPer10Minutes"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.item10Min"),
        max: 999_999,
    },
    {
        group: "request",
        name: "loginAccountPerTenMinutes",
        label: translate("adminPages.settings.runtimePolicySettingsPage.accountAndIPCombination"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.signInAttemptsPer10MinutesForAGivenIP"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.item10Min"),
        max: 999_999,
    },
    {
        group: "request",
        name: "systemRelayPerMinute",
        label: translate("adminPages.settings.runtimePolicySettingsPage.systemChannelRelay"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.systemChannelRequestsPerAccountPerMinute"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.min"),
        max: 999_999,
    },
    {
        group: "request",
        name: "customRelayPerMinute",
        label: translate("adminPages.settings.runtimePolicySettingsPage.customChannelRelay"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.customChannelRequestsPerAccountPerMinute"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.min"),
        max: 999_999,
    },
];

const relayFields: PolicyField[] = [
    {
        group: "request",
        name: "customRelayConcurrency",
        label: translate("adminPages.settings.runtimePolicySettingsPage.customChannelConcurrency"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.numberOfConcurrentCustomChannelRequestsPerAccount"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.items"),
        max: 999,
    },
    {
        group: "request",
        name: "customRelayRequestMB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.customChannelRequestBody"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.requestBodyLimitWhenRelayingToCustomUpstreams"),
        unit: "MB",
        max: 999,
    },
    {
        group: "request",
        name: "customRelayResponseMB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.customChannelResponseBody"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.readLimitForCustomUpstreamJSONAndStreamingResponses"),
        unit: "MB",
        max: 999,
    },
    {
        group: "request",
        name: "customRelayTimeoutMinutes",
        label: translate("adminPages.settings.runtimePolicySettingsPage.customChannelTimeout"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.maximumWaitTimeForCustomChannelConnectionsAndResponses"),
        unit: translate("adminPages.settings.runtimePolicySettingsPage.minutes"),
        max: 9_999,
    },
    {
        group: "request",
        name: "systemRelayRequestMB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.systemChannelRequestBody"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.requestBodyLimitWhenRelayingToSystemChannels"),
        unit: "MB",
        max: 999,
    },
    {
        group: "request",
        name: "systemRelayResponseMB",
        label: translate("adminPages.settings.runtimePolicySettingsPage.systemChannelResponseBody"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.readLimitForUpstreamResponsesOnSystemChannels"),
        unit: "MB",
        max: 999,
    },
    {
        group: "request",
        name: "channelCircuitFailureCount",
        label: translate("adminPages.settings.runtimePolicySettingsPage.circuitBreakerFailureThreshold"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.theCircuitBreakerOpensAfterThisManyConsecutiveFailuresWithin"),
        unit: translate("account.settings.models.unitCall"),
        max: 999,
    },
    {
        group: "request",
        name: "channelCircuitOpenSeconds",
        label: translate("adminPages.settings.runtimePolicySettingsPage.circuitBreakerDuration"),
        extra: translate("adminPages.settings.runtimePolicySettingsPage.howLongRequestsAreRejectedOnceTheChannelSCircuit"),
        unit: translate("account.settings.models.unitSecond"),
        max: 86_400,
    },
];

const policySections: PolicySectionDefinition[] = [
    {
        id: "policy-resource",
        icon: <Database className="size-4" aria-hidden="true" />,
        title: translate("adminPages.settings.runtimePolicySettingsPage.resourceAndAccountQuotas"),
        shortTitle: translate("adminPages.settings.runtimePolicySettingsPage.resourceQuotas"),
        description: translate("adminPages.settings.runtimePolicySettingsPage.limitsForUploadsFileSizeStructuredDataAndHistory"),
        fields: resourceFields,
    },
    {
        id: "policy-storage",
        icon: <Database className="size-4" aria-hidden="true" />,
        title: translate("adminPages.settings.runtimePolicySettingsPage.objectStorageRuntime"),
        shortTitle: translate("adminPages.settings.runtimePolicySettingsPage.objectStorage"),
        description: translate("adminPages.settings.runtimePolicySettingsPage.objectStorageTransfersSignedURLsAndUploadBufferPolicies"),
        fields: storageFields,
        status: <AdminStatusBadge label={translate("adminPages.settings.runtimePolicySettingsPage.hotReloadedAfterSaving")} tone="info" />,
    },
    {
        id: "policy-concurrency",
        icon: <Gauge className="size-4" aria-hidden="true" />,
        title: translate("adminPages.settings.runtimePolicySettingsPage.tasksAndConcurrency"),
        shortTitle: translate("adminPages.settings.runtimePolicySettingsPage.taskConcurrency"),
        description: translate("adminPages.settings.runtimePolicySettingsPage.backgroundTaskConsumptionChannelSchedulingAndThePerAccountActive"),
        fields: concurrencyFields,
        status: <AdminStatusBadge label={translate("adminPages.settings.runtimePolicySettingsPage.hotReloadedAfterSaving")} tone="info" />,
    },
    {
        id: "policy-timeout",
        icon: <TimerReset className="size-4" aria-hidden="true" />,
        title: translate("adminPages.settings.runtimePolicySettingsPage.taskTimeout"),
        shortTitle: translate("adminPages.settings.runtimePolicySettingsPage.taskTimeout"),
        description: translate("adminPages.settings.runtimePolicySettingsPage.maximumRunTimePerGenerationType"),
        fields: timeoutFields,
    },
    {
        id: "policy-agent",
        icon: <Orbit className="size-4" aria-hidden="true" />,
        title: translate("adminPages.settings.runtimePolicySettingsPage.canvasAgentSteps"),
        shortTitle: translate("adminPages.settings.runtimePolicySettingsPage.agentSteps"),
        description: translate("adminPages.settings.runtimePolicySettingsPage.outputLimitAndTimeoutForEachCanvasAgentModelCall"),
        fields: agentFields,
        status: <AdminStatusBadge label={translate("adminPages.settings.runtimePolicySettingsPage.hotReloadedAfterSaving")} tone="info" />,
    },
    {
        id: "policy-rate",
        icon: <ShieldCheck className="size-4" aria-hidden="true" />,
        title: translate("adminPages.settings.runtimePolicySettingsPage.businessRateLimits"),
        shortTitle: translate("adminPages.settings.runtimePolicySettingsPage.businessRateLimits"),
        description: translate("adminPages.settings.runtimePolicySettingsPage.fixedWindowRequestLimitsByAccountAndIP"),
        fields: rateFields,
    },
    {
        id: "policy-relay",
        icon: <Network className="size-4" aria-hidden="true" />,
        title: translate("adminPages.settings.runtimePolicySettingsPage.channelRelayingAndCircuitBreaking"),
        shortTitle: translate("adminPages.settings.runtimePolicySettingsPage.relayAndCircuitBreakers"),
        description: translate("adminPages.settings.runtimePolicySettingsPage.requestBodyResponseBodyConcurrencyTimeoutsAndUpstreamFailureProtection"),
        fields: relayFields,
    },
];
const allPolicyFields = policySections.flatMap((section) => section.fields);

export default function RuntimePolicySettingsPage() {
    const { message, modal } = App.useApp();
    const { references } = useAdminContext();
    const [savedSetting, setSavedSetting] = useState<RuntimePolicySetting | null>(null);
    const [draft, setDraft] = useState<RuntimePolicyDraft | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [presetLoading, setPresetLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [form] = Form.useForm<RuntimePolicyDraft>();
    const requestVersionRef = useRef(0);
    const formReadyRef = useRef(false);
    const navigationConfirmOpenRef = useRef(false);
    const navigationTriggerRef = useRef<HTMLElement | null>(null);
    const userNameById = useMemo(() => new Map(references.users.map((user) => [user.id, user.displayName || user.username])), [references.users]);

    const load = useCallback(
        async (initial = false, announce = false) => {
            const requestVersion = ++requestVersionRef.current;
            if (initial) setLoading(true);
            else setRefreshing(true);
            setLoadError("");
            try {
                const result = await getAdminRuntimePolicySetting();
                const value = parseRuntimePolicySetting(result.setting);
                if (requestVersion !== requestVersionRef.current) return;
                const nextDraft = toPolicyDraft(value);
                setSavedSetting(value);
                setDraft(nextDraft);
                if (formReadyRef.current) form.setFieldsValue(nextDraft);
                setSaveError("");
                if (announce) message.success(translate("adminPages.settings.runtimePolicySettingsPage.currentResourceAndPolicySettingsReloaded"));
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.runtimePolicySettingsPage.failedToLoadResourcesAndPolicies");
                setLoadError(errorMessage);
                if (!initial) message.error(errorMessage);
            } finally {
                if (requestVersion === requestVersionRef.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [form, message],
    );

    useEffect(() => {
        void load(true);
        return () => {
            requestVersionRef.current += 1;
        };
    }, [load]);

    useEffect(() => {
        if (draft) formReadyRef.current = true;
    }, [draft]);

    const dirtyFields = useMemo(() => {
        if (!savedSetting || !draft) return [];
        return allPolicyFields.filter((field) => readPolicyValue(savedSetting, field) !== readPolicyValue(draft, field));
    }, [draft, savedSetting]);
    const dirty = dirtyFields.length > 0;
    const busy = loading || refreshing || saving || resetting || presetLoading;
    const blocker = useBlocker(dirty && !saving && !resetting);

    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (!dirty || saving || resetting) return;
            event.preventDefault();
        };
        window.addEventListener("beforeunload", beforeUnload);
        return () => window.removeEventListener("beforeunload", beforeUnload);
    }, [dirty, resetting, saving]);

    useEffect(() => {
        if (blocker.state !== "blocked" || navigationConfirmOpenRef.current) return;
        navigationConfirmOpenRef.current = true;
        navigationTriggerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        modal.confirm({
            title: translate("adminPages.settings.runtimePolicySettingsPage.discardResourceAndPolicyChanges"),
            content: translate("adminPages.settings.runtimePolicySettingsPage.thereAreUnsavedChangesLeavingDiscardsTheDraft", { v0: String(dirtyFields.length) }),
            okText: translate("adminPages.settings.runtimePolicySettingsPage.discardAndLeave"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => {
                navigationConfirmOpenRef.current = false;
                navigationTriggerRef.current = null;
                blocker.proceed();
            },
            onCancel: () => {
                navigationConfirmOpenRef.current = false;
                blocker.reset();
                window.requestAnimationFrame(() => {
                    const fallback = document.querySelector<HTMLButtonElement>(".admin-runtime-policy-command-actions button");
                    const target = navigationTriggerRef.current?.isConnected ? navigationTriggerRef.current : fallback;
                    target?.focus();
                    navigationTriggerRef.current = null;
                });
            },
        });
    }, [blocker, dirtyFields.length, modal]);

    const resetDraft = () => {
        if (!savedSetting || busy) return;
        const nextDraft = toPolicyDraft(savedSetting);
        form.setFieldsValue(nextDraft);
        setDraft(nextDraft);
        setSaveError("");
        message.info(translate("adminPages.settings.runtimePolicySettingsPage.unsavedChangesOnThisPageDiscarded"));
    };

    const requestRefresh = () => {
        if (!dirty) {
            void load(false, true);
            return;
        }
        modal.confirm({
            title: translate("adminPages.settings.runtimePolicySettingsPage.discardChangesAndReload"),
            content: translate("adminPages.settings.runtimePolicySettingsPage.thereAreUnsavedChangesReloadingDiscardsTheDraftAndUses", { v0: String(dirtyFields.length) }),
            okText: translate("adminPages.settings.runtimePolicySettingsPage.discardAndRefresh"),
            cancelText: translate("account.settings.prompts.switchCancel"),
            okButtonProps: { danger: true },
            onOk: () => load(false, true),
        });
    };

    const requestSelfMode = () => {
        modal.confirm({
            rootClassName: "admin-runtime-policy-confirm-modal",
            width: 580,
            icon: <AlertTriangle className="size-5" aria-hidden="true" />,
            title: translate("adminPages.settings.runtimePolicySettingsPage.fillInPersonalUseLimits"),
            content: (
                <div className="admin-runtime-policy-confirm-copy">
                    <p>{translate("adminPages.settings.runtimePolicySettingsPage.thisSetsAll42QuotaConcurrencyRateAndTimeoutValues")}</p>
                    <p>
                        {dirty
                            ? translate("adminPages.settings.runtimePolicySettingsPage.theCurrentDraftChangesWillBeOverwritten", { v0: String(dirtyFields.length) })
                            : translate("adminPages.settings.runtimePolicySettingsPage.onlyTheDraftOnThisPageChangesSaveChangesTo")}
                    </p>
                </div>
            ),
            okText: translate("adminPages.settings.runtimePolicySettingsPage.fillDraft"),
            cancelText: translate("common.cancel"),
            onOk: async () => {
                setPresetLoading(true);
                try {
                    const result = await getAdminSelfUseRuntimePolicy();
                    const value = parseRuntimePolicySetting(result.setting);
                    const nextDraft = toPolicyDraft(value);
                    form.setFieldsValue(nextDraft);
                    setDraft(nextDraft);
                    setSaveError("");
                    message.info(translate("adminPages.settings.runtimePolicySettingsPage.personalUseLimitsFilledInSaveChangesToApplyThem"));
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.runtimePolicySettingsPage.failedToLoadPersonalUseMode");
                    message.error(errorMessage);
                    throw error;
                } finally {
                    setPresetLoading(false);
                }
            },
        });
    };

    const requestReset = () => {
        if (!savedSetting?.configured || resetting) return;
        modal.confirm({
            rootClassName: "admin-runtime-policy-confirm-modal",
            width: 580,
            icon: <AlertTriangle className="size-5" aria-hidden="true" />,
            title: translate("adminPages.settings.runtimePolicySettingsPage.restoreAllDefaultSystemPolicies"),
            content: (
                <div className="admin-runtime-policy-confirm-copy">
                    <p>{translate("adminPages.settings.runtimePolicySettingsPage.thisDeletesAdminSavedCustomPoliciesAndImmediatelyRestoresAll")}</p>
                    {dirty ? (
                        <p>
                            {translate("canvasB.mediaVersion.current")} {dirtyFields.length} {translate("adminPages.settings.runtimePolicySettingsPage.unsavedChangesWillAlsoBeDiscarded")}
                        </p>
                    ) : null}
                </div>
            ),
            okText: translate("adminPages.settings.runtimePolicySettingsPage.restoreSystemDefaults"),
            cancelText: translate("common.cancel"),
            okButtonProps: { danger: true },
            onOk: async () => {
                setResetting(true);
                setSaveError("");
                try {
                    const result = await resetAdminRuntimePolicySetting();
                    const value = parseRuntimePolicySetting(result.setting);
                    if (value.configured) throw new Error(translate("adminPages.settings.runtimePolicySettingsPage.theServerDidNotConfirmThatDefaultPoliciesWereRestored"));
                    const nextDraft = toPolicyDraft(value);
                    setSavedSetting(value);
                    setDraft(nextDraft);
                    form.setFieldsValue(nextDraft);
                    message.success(translate("adminPages.settings.runtimePolicySettingsPage.restoredTheSystemDefaultPolicy"));
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.runtimePolicySettingsPage.failedToRestoreDefaultSystemPolicies");
                    setSaveError(translate("adminPages.settings.runtimePolicySettingsPage.noAutomaticRetryWasMadeReloadTheCurrentSettingsAnd", { v0: String(errorMessage) }));
                    message.error(errorMessage);
                    throw error;
                } finally {
                    setResetting(false);
                }
            },
        });
    };

    const save = async () => {
        if (!draft || !dirty || saving) return;
        const values = await form.validateFields();
        const expected = toPolicyDraft(values);
        const relationshipError = validatePolicyRelationships(expected);
        if (relationshipError) {
            setSaveError(relationshipError);
            form.scrollToField(["resource", "storedFileGB"], { behavior: "smooth", block: "center" });
            throw new Error(relationshipError);
        }
        setSaving(true);
        setSaveError("");
        try {
            const result = await updateAdminRuntimePolicySetting(expected);
            const value = parseRuntimePolicySetting(result.setting);
            if (!samePolicy(value, expected)) throw new Error(translate("adminPages.settings.runtimePolicySettingsPage.theServerSPoliciesDifferFromTheSubmittedValuesRefresh"));
            const nextDraft = toPolicyDraft(value);
            setSavedSetting(value);
            setDraft(nextDraft);
            form.setFieldsValue(nextDraft);
            message.success(translate("adminPages.settings.runtimePolicySettingsPage.resourcesAndPoliciesSavedAndAppliedImmediately"));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : translate("adminPages.settings.runtimePolicySettingsPage.failedToSaveResourcesAndPolicies");
            setSaveError(translate("adminPages.settings.runtimePolicySettingsPage.noAutomaticRetryWasMadeReloadTheCurrentSettingsBefore", { v0: String(errorMessage) }));
            message.error(errorMessage);
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const submitSave = async () => {
        if (!savedSetting || !draft || !dirty || busy) return;
        try {
            await save();
        } catch {
            // 表单与业务错误已在 save 中就地提示。
        }
    };

    if (loading && !draft) {
        return (
            <AdminPageFrame title={translate("adminPages.settings.runtimePolicySettingsPage.resourcesAndPolicy")} description={translate("adminPages.settings.runtimePolicySettingsPage.accountQuotasTaskSchedulingAndRequestSecurityPolicy")} scroll>
                <div className="admin-settings-stack admin-runtime-policy" aria-label={translate("adminPages.settings.runtimePolicySettingsPage.loadingResourceAndPolicySettings")} role="status">
                    <div className="admin-runtime-policy-command-bar">
                        <Skeleton active title={{ width: 190 }} paragraph={false} />
                    </div>
                    <div className="admin-runtime-policy-overview">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="admin-stat-tile">
                                <Skeleton active title={{ width: 96 }} paragraph={{ rows: 1 }} />
                            </div>
                        ))}
                    </div>
                    <div className="admin-runtime-policy-loading-card">
                        <Skeleton active paragraph={{ rows: 8 }} />
                    </div>
                </div>
            </AdminPageFrame>
        );
    }

    if (!draft || !savedSetting) {
        return (
            <AdminPageFrame title={translate("adminPages.settings.runtimePolicySettingsPage.resourcesAndPolicy")} description={translate("adminPages.settings.runtimePolicySettingsPage.accountQuotasTaskSchedulingAndRequestSecurityPolicy")} scroll>
                <div className="admin-settings-stack admin-runtime-policy">
                    <div className="admin-runtime-policy-load-error" role="alert">
                        <span className="admin-runtime-policy-load-error-icon">
                            <AlertTriangle className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                            <h2>{translate("adminPages.settings.runtimePolicySettingsPage.unableToLoadResourceAndPolicySettings")}</h2>
                            <p>{loadError || translate("adminPages.settings.runtimePolicySettingsPage.noSettingsAreAvailableToDisplayPleaseTryAgainLater")}</p>
                        </div>
                        <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load(true)}>
                            {translate("auth.register.reload")}
                        </Button>
                    </div>
                </div>
            </AdminPageFrame>
        );
    }

    const updateActor = savedSetting.updatedBy ? userNameById.get(savedSetting.updatedBy) || savedSetting.updatedBy : "";
    const updateDetail = savedSetting.configured ? `${formatTime(savedSetting.updatedAt)}${updateActor ? ` · ${updateActor}` : ""}` : translate("adminPages.settings.runtimePolicySettingsPage.notYetSavedByAnAdministratorUsingSystemDefaults");
    const workerConcurrency = readDraftNumber(draft, "task", "workerConcurrency");
    const activeTaskLimit = readDraftNumber(draft, "task", "activeTaskLimit");

    return (
        <AdminPageFrame title={translate("adminPages.settings.runtimePolicySettingsPage.resourcesAndPolicy")} description={translate("adminPages.settings.runtimePolicySettingsPage.accountQuotasTaskSchedulingAndRequestSecurityPolicy")} scroll>
            <Form
                form={form}
                initialValues={draft}
                layout="vertical"
                requiredMark={false}
                disabled={busy}
                onValuesChange={(_, values) => {
                    setDraft(toPolicyDraft(values));
                    setSaveError("");
                }}
            >
                <div className="admin-settings-stack admin-runtime-policy">
                    <div className={cn("admin-runtime-policy-command-bar", dirty && "is-dirty")}>
                        <div className="admin-runtime-policy-command-copy" aria-live="polite">
                            <span className="admin-runtime-policy-command-icon">
                                <ShieldCheck className="size-4" aria-hidden="true" />
                            </span>
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <strong>
                                        {dirty ? translate("adminPages.settings.runtimePolicySettingsPage.unsavedChanges", { v0: String(dirtyFields.length) }) : translate("adminPages.settings.runtimePolicySettingsPage.resourceAndPolicyStatusSynced")}
                                    </strong>
                                    <AdminStatusBadge
                                        label={
                                            dirty
                                                ? translate("adminPages.settings.runtimePolicySettingsPage.notYetApplied")
                                                : savedSetting.configured
                                                  ? translate("adminPages.settings.runtimePolicySettingsPage.adminConfiguration")
                                                  : translate("adminPages.settings.runtimePolicySettingsPage.systemDefault")
                                        }
                                        tone={dirty ? "warning" : savedSetting.configured ? "success" : "neutral"}
                                    />
                                </div>
                                <p>{dirty ? translate("adminPages.settings.runtimePolicySettingsPage.changesAreDraftsOnThisPageTheyAffectRunningOperations") : updateDetail}</p>
                            </div>
                        </div>
                        <div className="admin-runtime-policy-command-actions">
                            {dirty ? (
                                <Button icon={<RotateCcw className="size-4" />} disabled={busy} onClick={resetDraft}>
                                    {translate("adminPages.settings.runtimePolicySettingsPage.discardChanges")}
                                </Button>
                            ) : null}
                            <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={saving || resetting || presetLoading} onClick={requestRefresh}>
                                {translate("library.ark.asset.refresh")}
                            </Button>
                            <Button icon={<InfinityIcon className="size-4" />} loading={presetLoading} disabled={saving || resetting || refreshing} onClick={requestSelfMode}>
                                {translate("adminPages.settings.runtimePolicySettingsPage.personalUseDraft")}
                            </Button>
                            {savedSetting.configured && !dirty ? (
                                <Button danger icon={<RotateCcw className="size-4" />} loading={resetting} disabled={saving || refreshing || presetLoading} onClick={requestReset}>
                                    {translate("adminPages.settings.runtimePolicySettingsPage.restoreSystemDefaults")}
                                </Button>
                            ) : null}
                            {dirty ? (
                                <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={busy} onClick={() => void submitSave()}>
                                    {translate("adminPages.settings.runtimePolicySettingsPage.saveChanges")}
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    {loadError || saveError ? (
                        <div className="admin-runtime-policy-inline-alert" role="alert">
                            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                            <span>{saveError || translate("adminPages.settings.runtimePolicySettingsPage.thePageStillShowsTheLastSettingsLoadedSuccessfully", { v0: String(loadError) })}</span>
                        </div>
                    ) : null}

                    <div className="admin-runtime-policy-overview" aria-label={translate("adminPages.settings.runtimePolicySettingsPage.resourceAndPolicyOverview")}>
                        <AdminStatTile
                            label={translate("adminPages.settings.runtimePolicySettingsPage.configurationSource")}
                            value={savedSetting.configured ? translate("adminPages.settings.runtimePolicySettingsPage.adminConfiguration") : translate("adminPages.settings.runtimePolicySettingsPage.systemDefault")}
                            detail={updateDetail}
                        />
                        <AdminStatTile
                            label={translate("adminPages.settings.runtimePolicySettingsPage.unsavedChanges2")}
                            value={dirtyFields.length}
                            detail={dirty ? translate("adminPages.settings.runtimePolicySettingsPage.draftOnThisPageNotYetApplied") : translate("adminPages.settings.runtimePolicySettingsPage.currentDraftMatchesTheServer")}
                        />
                        <AdminStatTile
                            label={translate("adminPages.settings.runtimePolicySettingsPage.workerConcurrency")}
                            value={formatNumber(workerConcurrency)}
                            detail={
                                dirtyFields.some((field) => field.name === "workerConcurrency")
                                    ? translate("adminPages.settings.runtimePolicySettingsPage.draftStatusPreview")
                                    : translate("adminPages.settings.runtimePolicySettingsPage.clusterBackgroundTaskConcurrency")
                            }
                        />
                        <AdminStatTile
                            label={translate("adminPages.settings.runtimePolicySettingsPage.accountActiveTasks")}
                            value={formatNumber(activeTaskLimit)}
                            detail={
                                dirtyFields.some((field) => field.name === "activeTaskLimit")
                                    ? translate("adminPages.settings.runtimePolicySettingsPage.draftStatusPreview")
                                    : translate("adminPages.settings.runtimePolicySettingsPage.queuedAndRunningTasksPerAccount")
                            }
                        />
                    </div>

                    {policySections.map((section) => (
                        <div key={section.id} id={section.id} className="admin-settings-anchor admin-runtime-policy-anchor">
                            <PolicySection {...section} />
                        </div>
                    ))}
                </div>
            </Form>
        </AdminPageFrame>
    );
}

function PolicySection({ icon, title, description, fields, status }: PolicySectionDefinition) {
    return (
        <SettingsSectionCard icon={icon} title={title} description={description} status={status}>
            <div className="admin-runtime-policy-field-grid">
                {fields.map((field) => {
                    const inputId = `admin-runtime-policy-${field.group}-${field.name}`;
                    const min = field.min ?? 1;
                    return (
                        <Form.Item key={`${field.group}.${field.name}`} label={field.label} htmlFor={inputId} extra={field.extra}>
                            <div className="admin-runtime-policy-number-control">
                                <Form.Item
                                    noStyle
                                    name={[field.group, field.name]}
                                    rules={[
                                        { required: true, message: translate("adminPages.settings.runtimePolicySettingsPage.enter", { v0: String(field.label) }) },
                                        { type: "number", min, max: field.max, message: translate("adminPages.settings.runtimePolicySettingsPage.mustBeAnIntegerFromTo", { v0: String(field.label), v1: String(min), v2: String(field.max) }) },
                                    ]}
                                >
                                    <InputNumber id={inputId} min={min} max={field.max} precision={0} aria-label={field.label} />
                                </Form.Item>
                                <span className="admin-runtime-policy-number-unit" aria-hidden="true">
                                    {field.unit}
                                </span>
                            </div>
                        </Form.Item>
                    );
                })}
            </div>
        </SettingsSectionCard>
    );
}

function toPolicyDraft(value: RuntimePolicyDraft): RuntimePolicyDraft {
    return { resource: { ...value.resource }, storage: { ...value.storage }, task: { ...value.task }, request: { ...value.request } };
}

function readPolicyValue(value: RuntimePolicyDraft, field: PolicyField) {
    return Number((value[field.group] as unknown as Record<string, unknown>)?.[field.name]);
}

function readDraftNumber(value: RuntimePolicyDraft, group: PolicyGroup, name: string) {
    return Number((value[group] as unknown as Record<string, unknown>)?.[name]);
}

function samePolicy(left: RuntimePolicyDraft, right: RuntimePolicyDraft) {
    return allPolicyFields.every((field) => readPolicyValue(left, field) === readPolicyValue(right, field));
}

function parseRuntimePolicySetting(value: RuntimePolicySetting): RuntimePolicySetting {
    if (!value || typeof value !== "object") throw new Error(translate("adminPages.settings.runtimePolicySettingsPage.theServerReturnedInvalidResourceAndPolicySettings"));
    for (const field of allPolicyFields) {
        const fieldValue = readPolicyValue(value, field);
        const min = field.min ?? 1;
        if (!Number.isInteger(fieldValue) || fieldValue < min || fieldValue > field.max) throw new Error(translate("adminPages.settings.runtimePolicySettingsPage.theServerReturnedAnInvalidValue", { v0: String(field.label) }));
    }
    if (typeof value.configured !== "boolean") throw new Error(translate("adminPages.settings.runtimePolicySettingsPage.theServerDidNotReturnAValidConfigurationSourceStatus"));
    return value;
}

function validatePolicyRelationships(value: RuntimePolicyDraft) {
    const accountCapacityMB = readDraftNumber(value, "resource", "storedFileGB") * 1024;
    const oversized = resourceFields.slice(0, 3).find((field) => readPolicyValue(value, field) > accountCapacityMB);
    return oversized ? translate("adminPages.settings.runtimePolicySettingsPage.cannotExceedTheAccountSTotalFileQuota", { v0: String(oversized.label) }) : "";
}

function formatPolicyValue(value: number, unit: string) {
    return `${formatNumber(value)} ${unit}`;
}
function formatNumber(value: number) {
    return Number.isFinite(value) ? new Intl.NumberFormat(currentLocale()).format(value) : "--";
}
function formatTime(value?: string) {
    if (!value) return "--";
    const time = new Date(value);
    if (!Number.isFinite(time.getTime()) || time.getUTCFullYear() <= 1) return "--";
    return time.toLocaleString(currentLocale(), { hour12: false });
}
