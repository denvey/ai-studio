import { Alert } from "antd";
import dayjs from "dayjs";
import { BadgeCheck, Boxes, KeyRound, Package, ShieldAlert, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import type { PluginManifest, PluginManifestV2 } from "@/lib/plugins/plugin-types";
import type { AdminPluginState, PluginManagement } from "@/services/api/plugins";
import { getPluginDocumentation, pluginPermissionLabel } from "@/pages/plugins/plugin-documentation";
import { PluginMarkdown } from "@/pages/plugins/plugin-markdown";

import { AdminStatusBadge } from "../components/admin-ui";
import { AdminModal } from "../ui/overlays";
import { translate } from "@/i18n";

export type AdminPluginDetail = {
    manifest: PluginManifest | PluginManifestV2;
    source: string;
    management: PluginManagement;
    status?: string;
    error?: string;
    /** 以下只有后端登记过的插件（上传或后端内置）才有。 */
    fileName?: string;
    sha256?: string;
    installedAt?: string;
    updatedAt?: string;
};

type Props = {
    plugin: AdminPluginDetail | null;
    state?: AdminPluginState;
    typeLabel: string;
    icon?: ReactNode;
    onClose: () => void;
};

/**
 * 插件管理的只读详情：固定尺寸的大弹窗，顶部是插件身份，左栏分组列出管理与清单信息，
 * 右栏整栏阅读说明文档；两栏各自滚动。开关和卸载仍在列表行内操作。
 */
export function AdminPluginDetailModal({ plugin, state, typeLabel, icon, onClose }: Props) {
    return (
        <AdminModal flush open={Boolean(plugin)} centered title={null} footer={null} width="min(1240px, calc(100vw - 48px))" rootClassName="admin-plugin-detail-modal" onCancel={onClose}>
            {plugin ? <PluginDetail plugin={plugin} state={state} typeLabel={typeLabel} icon={icon} /> : null}
        </AdminModal>
    );
}

function PluginDetail({ plugin, state, typeLabel, icon }: { plugin: AdminPluginDetail; state?: AdminPluginState; typeLabel: string; icon?: ReactNode }) {
    const { manifest, management } = plugin;
    const available = state?.platformAvailable ?? plugin.status === "enabled";
    const contributions = contributionSummary(manifest);
    const hasPackage = Boolean(plugin.fileName || plugin.sha256 || plugin.installedAt);
    return (
        <div className="admin-plugin-detail">
            <header className="admin-plugin-detail-header">
                <div className="admin-plugin-detail-icon">{icon}</div>
                <div className="min-w-0 flex-1">
                    <div className="admin-plugin-detail-heading">
                        <h2>{manifest.name}</h2>
                        <span className="admin-plugin-detail-version">v{manifest.version}</span>
                    </div>
                    <p className="admin-plugin-detail-description">{manifest.description || translate("adminPages.plugins.pluginDetailModal.noPluginDescriptionProvided")}</p>
                    <div className="admin-plugin-detail-badges">
                        <AdminStatusBadge label={typeLabel} tone={management.origin === "uploaded" ? "warning" : management.kind === "application" ? "info" : "neutral"} />
                        <AdminStatusBadge label={available ? translate("adminPages.plugins.pluginDetailModal.enabledOnPlatform") : translate("adminPages.plugins.pluginDetailModal.disabledOnPlatform")} tone={available ? "success" : "neutral"} />
                        {manifest.trusted ? (
                            <AdminStatusBadge label={translate("adminPages.plugins.pluginDetailModal.sourceVerified")} tone="success" />
                        ) : (
                            <AdminStatusBadge label={translate("adminPages.plugins.pluginDetailModal.sourceNotVerified")} tone="warning" />
                        )}
                        {plugin.status === "invalid" ? <AdminStatusBadge label={translate("adminPages.plugins.pluginDetailModal.invalidPluginPackage")} tone="error" /> : null}
                        <span className="admin-plugin-detail-id" title={manifest.id}>
                            {manifest.id}
                        </span>
                    </div>
                </div>
            </header>
            <div className="admin-plugin-detail-body">
                <aside className="admin-plugin-detail-aside" aria-label={translate("adminPages.plugins.pluginDetailModal.pluginInformation")}>
                    {plugin.error ? <Alert type="error" showIcon title={translate("adminPages.plugins.pluginDetailModal.failedToLoadPlugin")} description={plugin.error} /> : null}
                    <FactGroup icon={<SlidersHorizontal />} title={translate("adminPages.plugins.pluginDetailModal.manage")}>
                        <Fact label={translate("canvasA.assetView.origin")}>{originLabel(management.origin)}</Fact>
                        <Fact label={translate("adminPages.plugins.pluginDetailModal.scope")}>
                            {management.activationScope === "user" ? translate("adminPages.plugins.pluginDetailModal.usersEnableIndividually") : translate("adminPages.plugins.pluginDetailModal.appliesGloballyControlledByAdministrators")}
                        </Fact>
                        {management.activationScope === "user" ? (
                            <Fact label={translate("adminPages.plugins.pluginDetailModal.enabledUsers")}>{translate("adminPages.plugins.pluginDetailModal.users", { v0: String(state?.enabledUserCount || 0) })}</Fact>
                        ) : null}
                        <Fact label={translate("adminPages.plugins.pluginDetailModal.configurationMethod")}>{configurationLabel(management.configurationScope)}</Fact>
                    </FactGroup>
                    <FactGroup icon={<KeyRound />} title={translate("adminPages.plugins.pluginDetailModal.permissions")}>
                        {manifest.permissions.length ? (
                            <div className="admin-plugin-detail-chips">
                                {manifest.permissions.map((permission) => (
                                    <span key={permission} title={permission}>
                                        {pluginPermissionLabel(permission)}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="admin-plugin-detail-empty">{translate("adminPages.plugins.pluginDetailModal.noPermissionsDeclared")}</p>
                        )}
                    </FactGroup>
                    <FactGroup icon={<Boxes />} title={translate("adminPages.plugins.pluginDetailModal.capabilitiesProvided")}>
                        {contributions.length ? (
                            contributions.map(([label, value]) => (
                                <Fact key={label} label={label}>
                                    {value}
                                </Fact>
                            ))
                        ) : (
                            <p className="admin-plugin-detail-empty">{translate("adminPages.plugins.pluginDetailModal.notDeclared")}</p>
                        )}
                        <Fact label={translate("adminPages.plugins.pluginDetailModal.executionMode")}>{runtimeLabel(manifest)}</Fact>
                    </FactGroup>
                    <FactGroup icon={hasPackage ? <Package /> : manifest.trusted ? <BadgeCheck /> : <ShieldAlert />} title={translate("adminPages.plugins.pluginDetailModal.versionAndInstallation")}>
                        <Fact label={translate("adminPages.plugins.pluginDetailModal.author")}>{manifest.author || translate("adminPages.plugins.pluginDetailModal.notDeclared")}</Fact>
                        <Fact label={translate("adminPages.plugins.pluginDetailModal.publishedAt")}>{formatTime(manifest.publishedAt)}</Fact>
                        <Fact label={translate("adminPages.plugins.pluginDetailModal.manifestUpdated")}>{formatTime(manifest.updatedAt)}</Fact>
                        {hasPackage ? (
                            <>
                                <Fact label={translate("adminPages.plugins.pluginDetailModal.installationPackage")}>{plugin.fileName || translate("adminPages.plugins.pluginDetailModal.notRecorded")}</Fact>
                                <Fact label={translate("adminPages.plugins.pluginDetailModal.installedAt")}>{formatTime(plugin.installedAt)}</Fact>
                                <Fact label={translate("adminPages.plugins.pluginDetailModal.lastUpdated")}>{formatTime(plugin.updatedAt)}</Fact>
                                <Fact label="SHA-256">
                                    <span className="admin-plugin-detail-mono">{plugin.sha256 || translate("adminPages.plugins.pluginDetailModal.notRecorded")}</span>
                                </Fact>
                            </>
                        ) : (
                            <Fact label={translate("adminPages.plugins.pluginDetailModal.installationPackage")}>{translate("adminPages.plugins.pluginDetailModal.bundledWithThePlatform")}</Fact>
                        )}
                    </FactGroup>
                </aside>
                <section className="admin-plugin-detail-doc" aria-label={translate("adminPages.plugins.pluginDetailModal.documentation")}>
                    <div className="admin-plugin-detail-doc-inner">
                        <PluginMarkdown source={getPluginDocumentation(manifest)} />
                    </div>
                </section>
            </div>
        </div>
    );
}

function FactGroup({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
    return (
        <section className="admin-plugin-detail-group">
            <h3>
                <span aria-hidden="true">{icon}</span>
                {title}
            </h3>
            <dl>{children}</dl>
        </section>
    );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="admin-plugin-detail-fact">
            <dt>{label}</dt>
            <dd>{children}</dd>
        </div>
    );
}

function originLabel(origin: PluginManagement["origin"]) {
    if (origin === "uploaded") return translate("adminPages.plugins.pluginDetailModal.adminUpload");
    return origin === "official" ? translate("adminPages.plugins.pluginDetailModal.officialBuiltIn") : translate("adminPages.plugins.pluginDetailModal.systemBuiltIn");
}

function configurationLabel(scope: PluginManagement["configurationScope"]) {
    if (scope === "system") return translate("adminPages.plugins.pluginDetailModal.configuredByAdministrator");
    if (scope === "user") return translate("adminPages.plugins.pluginDetailModal.configuredIndividuallyByUsers");
    return translate("adminPages.plugins.pluginDetailModal.noConfigurationNeeded");
}

function runtimeLabel(manifest: PluginManifest | PluginManifestV2) {
    const names: Record<string, string> = {
        declarative: translate("adminPages.plugins.pluginDetailModal.declarative"),
        sandbox: translate("adminPages.plugins.pluginDetailModal.sandbox"),
        worker: "Worker",
        "trusted-backend": translate("adminPages.plugins.pluginDetailModal.trustedBackend"),
    };
    const parts = [
        manifest.runtime?.backend ? translate("adminPages.plugins.pluginDetailModal.backend", { v0: String(names[manifest.runtime.backend] || manifest.runtime.backend) }) : "",
        manifest.runtime?.web ? translate("adminPages.plugins.pluginDetailModal.frontend", { v0: String(names[manifest.runtime.web] || manifest.runtime.web) }) : "",
    ].filter(Boolean);
    return parts.join(" · ") || translate("adminPages.plugins.pluginDetailModal.notDeclared");
}

function contributionSummary(manifest: PluginManifest | PluginManifestV2): Array<[string, string]> {
    const contributes = manifest.contributes || {};
    const labels = (items?: Array<{ id: string; label?: string }>) => (items || []).map((item) => item.label || item.id).join("、");
    const rows: Array<[string, string]> = [
        [translate("adminPages.plugins.pluginDetailModal.modelIntegration"), labels(contributes.providers)],
        [translate("adminPages.plugins.pluginDetailModal.payment"), labels(contributes.paymentProviders)],
        [translate("library.tasks.model.workflow"), labels(contributes.workflows)],
        [translate("canvasB.mention.canvasNodes"), labels(contributes.canvasNodes)],
        [translate("adminPages.plugins.pluginDetailModal.commands"), labels(contributes.commands)],
        [translate("adminPages.plugins.pluginDetailModal.mediaConversion"), contributes.transforms?.length ? translate("adminPages.plugins.pluginDetailModal.items", { v0: String(contributes.transforms.length) }) : ""],
        [translate("create.page.sourcesSummary"), (contributes.assetSources || []).join("、")],
        ["Agent", (contributes.agents || []).join("、")],
    ];
    return rows.filter(([, value]) => value);
}

function formatTime(value?: string) {
    if (!value) return translate("adminPages.plugins.pluginDetailModal.notRecorded");
    const time = dayjs(value);
    return time.isValid() && time.year() > 1 ? time.format("YYYY-MM-DD HH:mm") : translate("adminPages.plugins.pluginDetailModal.notRecorded");
}
