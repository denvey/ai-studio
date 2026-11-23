import { useEffect, useState } from "react";
import { Alert, Breadcrumb, Button, Input, Space, Table, Tag, Typography } from "antd";
import { FolderTree, RefreshCw } from "lucide-react";
import { EcommerceLibraryPanel } from "./ecommerce-library-panel";
import { getIndustryCategories, type IndustryCategoryPage, type IndustryCategoryMatch } from "@/services/api/ecommerce-categories";
import { currentLocale, translate } from "@/i18n";

export default function EcommerceCategoriesPage() {
    const [data, setData] = useState<IndustryCategoryPage>();
    const [parent, setParent] = useState("");
    const [query, setQuery] = useState("");
    const [searchText, setSearchText] = useState("");
    const [page, setPage] = useState(1);
    const [refresh, setRefresh] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        setLoading(true);
        void getIndustryCategories(parent, query, page)
            .then((next) => {
                if (active) {
                    setData(next);
                    setError("");
                }
            })
            .catch((cause: unknown) => {
                if (active) setError(cause instanceof Error ? cause.message : String(cause));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [parent, query, page, refresh]);
    const open = (id: string) => {
        setParent(id);
        setQuery("");
        setSearchText("");
        setPage(1);
    };
    const source = data?.coverage.source;
    const lineage = (data?.lineage ?? []).slice().reverse();
    return (
        <EcommerceLibraryPanel
            description={translate("adminPages.ecommerceCategoriesPage.locateProductsByTheirFullChineseAndEnglishCategoryPaths")}
            actions={
                <Button icon={<RefreshCw size={14} />} loading={loading} onClick={() => setRefresh((value) => value + 1)}>
                    {translate("common.refresh")}
                </Button>
            }
        >
            {error ? <Alert type="error" showIcon message={error} /> : null}
            <Space wrap size={16}>
                <Typography.Text>
                    <strong>{source?.roots ?? "—"}</strong> {translate("adminPages.ecommerceCategoriesPage.topLevelIndustries")}
                </Typography.Text>
                <Typography.Text>
                    <strong>{source?.nodes.toLocaleString(currentLocale()) ?? "—"}</strong> {translate("adminPages.ecommerceCategoriesPage.categoryNodes")}
                </Typography.Text>
                <Typography.Text>
                    <strong>{source?.leaves.toLocaleString(currentLocale()) ?? "—"}</strong> {translate("adminPages.ecommerceCategoriesPage.leafSubcategories")}
                </Typography.Text>
                <Typography.Text>
                    {translate("adminPages.ecommerceCategoriesPage.knowledgeIndex")} <strong>{data?.coverage.indexedNodes.toLocaleString(currentLocale()) ?? "—"}</strong> {translate("account.layout.pagination.item")}
                </Typography.Text>
                {source ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                        Shopify {source.version} · MIT
                    </a>
                ) : null}
            </Space>
            <Alert
                type="info"
                showIcon
                message={translate("adminPages.ecommerceCategoriesPage.categoryDirectoriesAndDedicatedCreativeMethodsAreCountedSeparatelySubcategories")}
                description={
                    data ? translate("adminPages.ecommerceCategoriesPage.industryMethodsAndAncestorsWithSpecializedMethodsManageTheirSwitches", { v0: String(data.coverage.industryMethods), v1: String(data.coverage.specializedAncestors) }) : undefined
                }
            />
            <Space wrap>
                <Input.Search
                    placeholder={translate("adminPages.ecommerceCategoriesPage.searchChineseOrEnglishCategoriesOrCategoryIDs")}
                    allowClear
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    onSearch={(value) => {
                        setQuery(value);
                        setParent("");
                        setPage(1);
                    }}
                    style={{ width: 360 }}
                />
                <Button icon={<FolderTree size={14} />} onClick={() => open("")}>
                    {translate("adminPages.ecommerceCategoriesPage.allIndustries")}
                </Button>
            </Space>
            <Breadcrumb
                items={[
                    {
                        title: (
                            <Button type="link" size="small" onClick={() => open("")}>
                                {translate("adminPages.ecommerceCategoriesPage.allIndustries")}
                            </Button>
                        ),
                    },
                    ...lineage.map((node) => ({
                        title: (
                            <Button type="link" size="small" onClick={() => open(node.id)}>
                                {node.name}
                            </Button>
                        ),
                    })),
                ]}
            />
            <Table<IndustryCategoryMatch>
                rowKey={(entry) => entry.node.id}
                size="small"
                loading={loading}
                dataSource={data?.nodes ?? []}
                pagination={{ current: page, pageSize: 40, total: data?.total ?? 0, showSizeChanger: false, onChange: setPage }}
                expandable={{
                    expandedRowRender: ({ node, playbook }) => (
                        <Space direction="vertical">
                            <Typography.Text>
                                {translate("adminPages.ecommerceCategoriesPage.categoryID")}
                                {node.id}
                            </Typography.Text>
                            <Typography.Text>
                                {translate("adminPages.ecommerceCategoriesPage.scene")}
                                {playbook.scene}
                            </Typography.Text>
                            <Typography.Text>
                                {translate("adminPages.ecommerceCategoriesPage.focus")}
                                {playbook.focus}
                            </Typography.Text>
                            <Typography.Text>
                                {translate("adminPages.ecommerceCategoriesPage.typography")}
                                {playbook.typography}
                            </Typography.Text>
                            <Typography.Text>
                                {translate("adminPages.ecommerceCategoriesPage.layout")}
                                {playbook.layout}
                            </Typography.Text>
                            <Typography.Text>
                                {translate("adminPages.ecommerceCategoriesPage.narrative")}
                                {playbook.story}
                            </Typography.Text>
                        </Space>
                    ),
                }}
                columns={[
                    {
                        title: translate("adminPages.ecommerceCategoriesPage.industryCategorySubcategory"),
                        key: "node",
                        render: (_, { node }) => (
                            <div>
                                {node.children > 0 ? (
                                    <Button type="link" size="small" onClick={() => open(node.id)}>
                                        {node.name}
                                    </Button>
                                ) : (
                                    <Typography.Text strong>{node.name}</Typography.Text>
                                )}
                                <br />
                                <Typography.Text type="secondary">{node.path}</Typography.Text>
                                <br />
                                <Typography.Text type="secondary">{node.pathEn}</Typography.Text>
                            </div>
                        ),
                    },
                    {
                        title: translate("adminPages.ecommerceCategoriesPage.subcategories"),
                        width: 140,
                        key: "children",
                        render: (_, { node }) => (
                            <span>
                                {node.children} {translate("adminPages.ecommerceCategoriesPage.directChildren")}
                                <br />
                                <Typography.Text type="secondary">
                                    {translate("adminPages.ecommerceCategoriesPage.total")} {node.descendants} {translate("adminPages.ecommerceCategoriesPage.descendants")}
                                </Typography.Text>
                            </span>
                        ),
                    },
                    {
                        title: translate("adminPages.ecommerceCategoriesPage.creativeMethods"),
                        width: 210,
                        key: "scope",
                        render: (_, entry) => (
                            <div>
                                <Tag color={entry.methodScope === "specific" ? "blue" : "default"}>
                                    {entry.methodScope === "specific" ? translate("adminPages.ecommerceCategoriesPage.methodForThisCategory") : translate("adminPages.ecommerceCategoriesPage.inheritedAncestorMethod")}
                                </Tag>
                                <br />
                                <Typography.Text type="secondary">
                                    {translate("adminPages.ecommerceCategoriesPage.methodAncestor")}
                                    {entry.methodAncestorId}
                                </Typography.Text>
                            </div>
                        ),
                    },
                ]}
            />
        </EcommerceLibraryPanel>
    );
}
