import { useCallback, useEffect, useState } from "react";
import { Alert, App, Button, Input, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import { Database, RefreshCw, Search } from "lucide-react";
import { AdminStatTile } from "./components/admin-ui";
import { EcommerceLibraryPanel } from "./ecommerce-library-panel";
import { commerceKnowledgeDomainRows } from "./knowledge-domain-coverage";
import {
    getCommerceKnowledgeStats,
    listCommerceKnowledgeEntries,
    reviewCommerceKnowledgeEntry,
    setCommerceKnowledgeSourceEnabled,
    syncCommerceKnowledge,
    type CommerceKnowledgeEntry,
    type CommerceKnowledgePage,
    type CommerceKnowledgeStats,
} from "@/services/api/ecommerce-knowledge";
import { currentLocale, translate } from "@/i18n";

export default function EcommerceKnowledgePage() {
    const { message } = App.useApp();
    const [stats, setStats] = useState<CommerceKnowledgeStats>();
    const [data, setData] = useState<CommerceKnowledgePage>();
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState("approved");
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState("");
    const [sourceSearch, setSourceSearch] = useState("");
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [nextStats, nextPage] = await Promise.all([getCommerceKnowledgeStats(), listCommerceKnowledgeEntries(page, 20, status, keyword)]);
            setStats(nextStats);
            setData(nextPage);
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setLoading(false);
        }
    }, [page, status, keyword]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const visibleSources = (stats?.sources || []).filter((source) => [source.name, source.repository, source.license, source.status].some((value) => value.toLowerCase().includes(sourceSearch.trim().toLowerCase())));

    const runSync = async () => {
        setSyncing(true);
        try {
            const result = await syncCommerceKnowledge();
            message.success(translate("adminPages.ecommerceKnowledgePage.addedSkippedDuplicatesAndFailedToImportFiles", { v0: String(result.imported), v1: String(result.duplicates), v2: String(result.failed.length) }));
            await refresh();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setSyncing(false);
        }
    };
    const review = async (entry: CommerceKnowledgeEntry, next: "approved" | "rejected" | "pending") => {
        try {
            await reviewCommerceKnowledgeEntry(entry.id, next);
            await refresh();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : String(cause));
        }
    };
    const toggleSource = async (id: string, enabled: boolean) => {
        try {
            await setCommerceKnowledgeSourceEnabled(id, enabled);
            await refresh();
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : String(cause));
        }
    };
    return (
        <EcommerceLibraryPanel
            description={translate("adminPages.ecommerceKnowledgePage.visualRulesRetrievedDuringECommerceAgentPlanningSourcesAre")}
            actions={
                <Space>
                    <Button icon={<RefreshCw size={14} />} onClick={() => void refresh()} loading={loading}>
                        {translate("common.refresh")}
                    </Button>
                    <Button type="primary" icon={<Database size={14} />} onClick={() => void runSync()} loading={syncing}>
                        {translate("adminPages.ecommerceKnowledgePage.syncPinnedSources")}
                    </Button>
                </Space>
            }
        >
            {error ? <Alert type="error" showIcon message={error} /> : null}
            <div className="eal-stats" aria-label={translate("adminPages.ecommerceKnowledgePage.knowledgeOverview")}>
                <AdminStatTile label={translate("adminPages.ecommerceKnowledgePage.knowledgeEntries")} value={stats?.entryCount ?? "—"} detail={translate("adminPages.ecommerceKnowledgePage.sources", { v0: String(stats?.sourceCount ?? "—") })} />
                <AdminStatTile label={translate("library.ark.expiry.valid")} value={stats?.approvedCount ?? "—"} detail={translate("adminPages.ecommerceKnowledgePage.reviewedAndUnexpired")} />
                <AdminStatTile label={translate("adminPages.ecommerceKnowledgePage.inReview")} value={stats?.pendingCount ?? "—"} detail={translate("adminPages.ecommerceKnowledgePage.communitySourcesAwaitReviewByDefault")} />
                <AdminStatTile
                    label={translate("adminPages.ecommerceKnowledgePage.rejectedExpired")}
                    value={stats ? `${stats.rejectedCount} / ${stats.expiredCount}` : "—"}
                    detail={translate("adminPages.ecommerceKnowledgePage.duplicatesRemovedInTheLatestSync", { v0: String(stats?.lastSyncDuplicateCount ?? "—") })}
                />
            </div>
            {stats ? (
                <div className="eal-stack">
                    <Typography.Paragraph type="secondary">
                        {translate("adminPages.ecommerceKnowledgePage.coveredCategories")}
                        {Object.entries(stats.categoryCoverage || {})
                            .map(([category, count]) => `${category} ${count}`)
                            .join(" · ") || translate("account.settings.memory.none")}
                        {translate("adminPages.ecommerceKnowledgePage.theCategoryCountMeasuresKnowledgeRecordsAndDoesNotIndicate")}
                    </Typography.Paragraph>
                    <section aria-label={translate("adminPages.ecommerceKnowledgePage.knowledgeDomainCoverage")}>
                        <Typography.Title level={5} style={{ marginTop: 0 }}>
                            {translate("adminPages.ecommerceKnowledgePage.knowledgeDomain")}
                        </Typography.Title>
                        <Typography.Paragraph type="secondary">{translate("adminPages.ecommerceKnowledgePage.countsBelowIncludeOnlyApprovedUnexpiredEntriesTheyDoNot")}</Typography.Paragraph>
                        <Space wrap size={[8, 8]}>
                            {commerceKnowledgeDomainRows(stats.domainCoverage).map(({ id, label, count }) => (
                                <Tag key={id} color={count > 0 ? "blue" : "default"}>
                                    <strong>{id}</strong> {label} · {count > 0 ? translate("adminPages.ecommerceKnowledgePage.activeKnowledgeEntries", { v0: String(count) }) : translate("adminPages.ecommerceKnowledgePage.noActiveKnowledgeEntries")}
                                </Tag>
                            ))}
                        </Space>
                    </section>
                </div>
            ) : null}
            <Tabs
                items={[
                    {
                        key: "sources",
                        label: translate("adminPages.ecommerceKnowledgePage.knowledgeSources", { v0: String(stats?.sourceCount ?? 0) }),
                        children: (
                            <div className="eal-stack">
                                <Input
                                    allowClear
                                    prefix={<Search size={14} />}
                                    value={sourceSearch}
                                    onChange={(event) => setSourceSearch(event.target.value)}
                                    placeholder={translate("adminPages.ecommerceKnowledgePage.searchSourceNameRepositoryLicenseOrStatus")}
                                    style={{ maxWidth: 430, marginBottom: 14 }}
                                />
                                <Table
                                    rowKey="id"
                                    size="small"
                                    loading={loading}
                                    dataSource={visibleSources}
                                    pagination={false}

                                    columns={[
                                        {
                                            title: translate("adminPages.ecommerceKnowledgePage.knowledgeSource"),
                                            dataIndex: "name",
                                            render: (_: unknown, source) =>
                                                source.repository && source.commit ? (
                                                    <a href={`https://github.com/${source.repository}/tree/${source.commit}`} target="_blank" rel="noreferrer">
                                                        {source.name}
                                                    </a>
                                                ) : (
                                                    <span>{source.name}</span>
                                                ),
                                        },
                                        { title: translate("adminPages.ecommerceKnowledgePage.pinnedVersion"), dataIndex: "commit", render: (value: string) => value.slice(0, 12) },
                                        { title: translate("adminPages.ecommerceKnowledgePage.license"), dataIndex: "license" },
                                        { title: translate("library.tasks.detail.status"), dataIndex: "status", render: (value: string) => <Tag color={value === "ready" ? "green" : value === "partial" ? "gold" : "default"}>{value}</Tag> },
                                        {
                                            title: translate("adminPages.ecommerceKnowledgePage.lastSynced"),
                                            dataIndex: "lastSyncedAt",
                                            render: (value?: string) => (value ? new Date(value).toLocaleString(currentLocale()) : translate("adminPages.ecommerceKnowledgePage.notSynced")),
                                        },
                                        {
                                            title: translate("account.settings.runninghub.actions"),
                                            key: "actions",
                                            render: (_: unknown, source) => (
                                                <Button size="small" onClick={() => void toggleSource(source.id, source.status === "disabled")}>
                                                    {source.status === "disabled" ? translate("adminPages.ecommerceKnowledgePage.enable") : translate("adminPages.ecommerceKnowledgePage.disable")}
                                                </Button>
                                            ),
                                        },
                                    ]}
                                    expandable={{
                                        expandedRowRender: (source) => (
                                            <Typography.Paragraph style={{ whiteSpace: "pre-wrap", maxWidth: 760 }}>{source.licenseText || source.errorMessage || translate("adminPages.ecommerceKnowledgePage.noLicenseTextAvailable")}</Typography.Paragraph>
                                        ),
                                    }}
                                />
                            </div>
                        ),
                    },
                    {
                        key: "entries",
                        label: translate("adminPages.ecommerceKnowledgePage.knowledgeEntries2", { v0: String(stats?.entryCount ?? 0) }),
                        children: (
                            <div className="eal-stack">
                                <Space wrap>
                                    <Input.Search
                                        placeholder={translate("adminPages.ecommerceKnowledgePage.searchKnowledgeTitles")}
                                        allowClear
                                        onSearch={(value) => {
                                            setPage(1);
                                            setKeyword(value);
                                        }}
                                    />
                                    <Select
                                        value={status}
                                        style={{ width: 130 }}
                                        onChange={(value) => {
                                            setPage(1);
                                            setStatus(value);
                                        }}
                                        options={[
                                            { value: "pending", label: translate("adminPages.ecommerceKnowledgePage.inReview") },
                                            { value: "approved", label: translate("library.ark.expiry.valid") },
                                            { value: "rejected", label: translate("account.settings.memory.statusRejected") },
                                            { value: "", label: translate("canvasA.toolPicker.all") },
                                        ]}
                                    />
                                </Space>
                                {!loading && data?.total === 0 ? <Alert type="info" showIcon message={translate("adminPages.ecommerceKnowledgePage.noEntriesMatchTheCurrentFiltersSwitchToActiveOr")} /> : null}
                                <Table
                                    rowKey="id"
                                    size="small"
                                    loading={loading}
                                    dataSource={data?.entries || []}
                                    pagination={{ current: page, pageSize: 20, total: data?.total || 0, onChange: setPage }}
                                    columns={[
                                        {
                                            title: translate("adminPages.ecommerceKnowledgePage.knowledge"),
                                            dataIndex: "title",
                                            render: (_: unknown, item) => (
                                                <div>
                                                    <strong>{item.title}</strong>
                                                    <br />
                                                    <Typography.Text type="secondary">
                                                        {item.knowledgeType} · {item.category}
                                                    </Typography.Text>
                                                </div>
                                            ),
                                        },
                                        {
                                            title: translate("canvasA.assetView.origin"),
                                            dataIndex: "sourceUrl",
                                            render: (value: string, item) => (
                                                <a href={value} target="_blank" rel="noreferrer">
                                                    {item.sourceId} · {item.license}
                                                </a>
                                            ),
                                        },
                                        { title: translate("library.tasks.detail.status"), dataIndex: "reviewStatus", render: (value: string) => <Tag color={value === "approved" ? "green" : value === "pending" ? "gold" : "default"}>{value}</Tag> },
                                        {
                                            title: translate("adminPages.ecommerceKnowledgePage.review"),
                                            key: "actions",
                                            render: (_: unknown, item) => (
                                                <Space>
                                                    <Button size="small" onClick={() => void review(item, "approved")}>
                                                        {translate("adminPages.ecommerceKnowledgePage.approve")}
                                                    </Button>
                                                    <Button size="small" danger onClick={() => void review(item, "rejected")}>
                                                        {translate("account.settings.memory.reject")}
                                                    </Button>
                                                </Space>
                                            ),
                                        },
                                    ]}
                                    expandable={{ expandedRowRender: (item) => <Typography.Paragraph style={{ whiteSpace: "pre-wrap", maxWidth: 760 }}>{item.contentJson}</Typography.Paragraph> }}
                                />
                            </div>
                        ),
                    },
                ]}
            />
        </EcommerceLibraryPanel>
    );
}
