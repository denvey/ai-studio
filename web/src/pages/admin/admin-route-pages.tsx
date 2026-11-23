import { Button } from "antd";
import { Plus, Settings2, UserRoundCog } from "lucide-react";
import { lazy, useState } from "react";

import { useAdminContext } from "./admin-context";
import { AdminPageFrame } from "./components/admin-shell";
import { readAnnouncementPendingReview } from "./components/admin-announcement-safety";
import { BillingAutoRefundToggle } from "./components/billing-auto-refund-toggle";
import { AdminSegmented } from "./ui/controls";
import { translate } from "@/i18n";

const AnalyticsPanel = lazy(() => import("./components/analytics-panel"));
const AdminAnnouncementsPanel = lazy(() => import("./components/admin-announcements-panel"));
const AdminBannerAnnouncementsPanel = lazy(() => import("./components/admin-banner-announcements-panel"));
const CreditOperationsPanel = lazy(() => import("./components/credit-operations-panel"));
const AccessSettingsPanel = lazy(() => import("./components/access-settings-panel"));
const EmailSettingsPanel = lazy(() => import("./components/email-settings-panel"));
const FeatureAvailabilityPanel = lazy(() => import("./components/feature-availability-panel"));
const StorageResourcesPanel = lazy(() => import("./components/storage-resources-panel"));
const AgentLessonsPanel = lazy(() => import("./components/agent-lessons-panel"));
const AgentMemoryDocumentsPanel = lazy(() => import("./components/agent-memory-documents-panel"));

export function AnalyticsPage() {
    const { references } = useAdminContext();
    return (
        <AdminPageFrame title={translate("adminPages.adminRoutePages.overview")} description={translate("adminPages.adminRoutePages.requestQualityTaskQueuesAndCostsTrendsUseCalendarDays")} scroll>
            <AnalyticsPanel users={references.users} channels={references.channels} />
        </AdminPageFrame>
    );
}

export function AnnouncementsPage() {
    const [publishOpen, setPublishOpen] = useState(false);
    const [publishBlocked, setPublishBlocked] = useState(() => Boolean(readAnnouncementPendingReview()));
    const [publishReturnFocus, setPublishReturnFocus] = useState<HTMLElement | null>(null);
    return (
        <AdminPageFrame
            title={translate("account.layout.announcements.title")}
            description={translate("adminPages.adminRoutePages.publishNoticesToAllUsersAndManageTheirStatus")}
            actions={
                <Button
                    id="admin-announcement-publish-trigger"
                    type="primary"
                    disabled={publishBlocked}
                    title={publishBlocked ? translate("adminPages.adminRoutePages.reviewThePreviousPublicationRequestWhoseResultIsStillUncertain") : undefined}
                    icon={<Plus className="size-4" />}
                    onClick={(event) => {
                        setPublishReturnFocus(event.currentTarget);
                        setPublishOpen(true);
                    }}
                >
                    {translate("adminPages.adminRoutePages.publishAnnouncement")}
                </Button>
            }
        >
            <AdminAnnouncementsPanel publishOpen={publishOpen} publishBlocked={publishBlocked} publishReturnFocus={publishReturnFocus} onPublishOpenChange={setPublishOpen} onPublishBlockedChange={setPublishBlocked} />
        </AdminPageFrame>
    );
}

export function BannerAnnouncementsPage() {
    const [createOpen, setCreateOpen] = useState(false);
    return (
        <AdminPageFrame
            title={translate("adminPages.adminRoutePages.persistentNotices")}
            description={translate("adminPages.adminRoutePages.configurePersistentNoticesAtTheTopOfTheHomePage")}
            actions={
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                    {translate("adminPages.adminRoutePages.addPersistentNotice")}
                </Button>
            }
        >
            <AdminBannerAnnouncementsPanel createOpen={createOpen} onCreateOpenChange={setCreateOpen} />
        </AdminPageFrame>
    );
}

export function CreditOperationsPage() {
    const { references } = useAdminContext();
    const [activeOperation, setActiveOperation] = useState<"policy" | "adjustment" | null>(null);
    return (
        <AdminPageFrame
            title={translate("adminPages.adminRoutePages.creditOperations")}
            description={translate("adminPages.adminRoutePages.reviewBillingExceptionsManageRegistrationAndCheckInRewardsAnd")}
            actions={
                <>
                    <BillingAutoRefundToggle />
                    <Button icon={<Settings2 className="size-4" />} onClick={() => setActiveOperation("policy")}>
                        {translate("adminPages.adminRoutePages.registrationAndCheckInRewards")}
                    </Button>
                    <Button type="primary" icon={<UserRoundCog className="size-4" />} onClick={() => setActiveOperation("adjustment")}>
                        {translate("adminPages.adminRoutePages.manualBalanceAdjustment")}
                    </Button>
                </>
            }
        >
            <CreditOperationsPanel users={references.users} activeOperation={activeOperation} onOperationChange={setActiveOperation} />
        </AdminPageFrame>
    );
}

export function AccessSettingsPage() {
    return (
        <AdminPageFrame title={translate("adminPages.adminRoutePages.signInAndRegistration")} description={translate("adminPages.adminRoutePages.controlAccountCreationThenConfigureThirdPartySignInTerms")} scroll>
            <AccessSettingsPanel />
        </AdminPageFrame>
    );
}

export function EmailSettingsPage() {
    return (
        <AdminPageFrame title={translate("adminPages.adminRoutePages.emailService")} description={translate("adminPages.adminRoutePages.chooseWhetherToSendRegistrationVerificationCodesThenConfigureSMTP")} scroll>
            <EmailSettingsPanel />
        </AdminPageFrame>
    );
}

export function FeatureAvailabilityPage() {
    return (
        <AdminPageFrame title={translate("adminPages.adminRoutePages.featureAvailability")} description={translate("adminPages.adminRoutePages.chooseWhichFeaturesUsersCanSeeAndUse")} scroll>
            <FeatureAvailabilityPanel />
        </AdminPageFrame>
    );
}

export function StorageResourcesPage() {
    return (
        <AdminPageFrame title={translate("adminPages.adminRoutePages.storedResources")} description={translate("adminPages.adminRoutePages.viewResourceRecordsStorageDistributionAndFilePreviewsDeleteResources")} scroll>
            <StorageResourcesPanel />
        </AdminPageFrame>
    );
}

export function AgentLessonsPage() {
    const [view, setView] = useState<"documents" | "lessons">("documents");
    return (
        <AdminPageFrame
            title={translate("settings.sections.agent-memory.label")}
            description={translate("adminPages.adminRoutePages.viewEachUserSMemoryFilesInReadOnlyMode")}
            actions={
                <AdminSegmented<"documents" | "lessons">
                    ariaLabel={translate("adminPages.adminRoutePages.memoryView")}
                    value={view}
                    onChange={setView}
                    options={[
                        { value: "documents", label: translate("adminPages.adminRoutePages.memoryFiles") },
                        { value: "lessons", label: translate("adminPages.adminRoutePages.previousExperiences") },
                    ]}
                />
            }
            scroll
        >
            {view === "documents" ? <AgentMemoryDocumentsPanel /> : <AgentLessonsPanel />}
        </AdminPageFrame>
    );
}
