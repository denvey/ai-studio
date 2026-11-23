import { AutoComplete, Input } from "antd";
import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { searchAdminNavigation, type AdminSearchEntry } from "../lib/navigation-search";
import "./admin-global-search.css";
import { translate } from "@/i18n";

export function AdminGlobalSearch({ entries }: { entries: readonly AdminSearchEntry[] }) {
    const navigate = useNavigate();
    const [query, setQuery] = useState("");
    const results = searchAdminNavigation(entries, query);
    return (
        <div className="admin-global-search" role="search" aria-label={translate("admin.adminGlobalSearch.adminPageSearch")}>
            <AutoComplete<string, { value: string; label: ReactNode; disabled?: boolean }>
                value={query}
                onChange={setQuery}
                allowClear
                virtual={false}
                showSearch={{ filterOption: false }}
                options={
                    results.length
                        ? results.map((entry) => ({
                              value: entry.path,
                              label: (
                                  <span className="admin-global-search-result">
                                      <strong>{entry.label}</strong>
                                      <small>{entry.group}</small>
                                  </span>
                              ),
                          }))
                        : [{ value: "", disabled: true, label: <span role="status">{translate("admin.adminGlobalSearch.noMatchingAdminPagesTryAnotherKeyword")}</span> }]
                }
                onSelect={(path) => {
                    if (!entries.some((entry) => entry.path === path)) return;
                    setQuery("");
                    navigate(path);
                }}
            >
                <Input aria-label={translate("admin.adminGlobalSearch.searchAdminPages")} placeholder={translate("admin.adminGlobalSearch.searchAdminPagesOrFeatures")} prefix={<Search className="size-4" aria-hidden="true" />} />
            </AutoComplete>
        </div>
    );
}
