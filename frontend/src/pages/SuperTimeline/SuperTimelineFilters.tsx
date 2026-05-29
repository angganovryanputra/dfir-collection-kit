import React from "react";
import { 
    Search, X, HelpCircle, CalendarRange, Zap, Users, Tag 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import {
    QuickFilter, QUICK_FILTERS, SOURCE_METADATA
} from "./SuperTimelineTypes";
import { getHostColor, getSourceColor, type ParsedDSL } from "./SuperTimelineUtils";
import { cn } from "@/lib/utils";

// ─── Filter Sub-components ──────────────────────────────────────────────────

function HostChip({
    host,
    allHosts,
    active,
    onClick,
}: {
    host: string;
    allHosts: string[];
    active: boolean;
    onClick: () => void;
}) {
    const color = getHostColor(host, allHosts);
    return (
        <button
            onClick={onClick}
            className={`px-2.5 py-1 rounded-sm border font-mono text-xs transition-all ${
                active
                    ? `${color.bg} ${color.text} ${color.border}`
                    : "border-border/40 text-muted-foreground hover:border-border"
            }`}
        >
            {host}
        </button>
    );
}

function SourceChip({
    source,
    active,
    onClick,
}: {
    source: string;
    active: boolean;
    onClick: () => void;
}) {
    const activeColor = getSourceColor(source);
    const meta = SOURCE_METADATA[source?.toUpperCase()];
    return (
        <button
            onClick={onClick}
            title={meta ? `${meta.desc} (${meta.category})` : source}
            className={`px-2.5 py-1 rounded-sm border font-mono text-xs transition-all ${
                active
                    ? activeColor
                    : "border-border/40 text-muted-foreground hover:border-border"
            }`}
        >
            {source}
        </button>
    );
}

// ─── Main Filters Component ──────────────────────────────────────────────────

interface SuperTimelineFiltersProps {
    searchInput: string;
    onSearchChange: (val: string) => void;
    dateFrom: string;
    setDateFrom: (val: string) => void;
    dateTo: string;
    setDateTo: (val: string) => void;
    dateFilterActive: boolean;
    applyDateFilter: () => void;
    clearDateFilter: () => void;
    activeQuickFilter: string | null;
    applyQuickFilter: (qf: QuickFilter) => void;
    knownHosts: string[];
    activeHosts: Set<string>;
    allHostsActive: boolean;
    toggleHost: (h: string) => void;
    toggleAllHosts: () => void;
    knownSources: string[];
    activeSources: Set<string>;
    allSourcesActive: boolean;
    toggleSource: (s: string) => void;
    toggleAllSources: () => void;
    clearAll: () => void;
    activeFilterCount: number;
}

export function SuperTimelineFilters({
    searchInput, onSearchChange, dateFrom, setDateFrom, dateTo, setDateTo, dateFilterActive,
    applyDateFilter, clearDateFilter, activeQuickFilter, applyQuickFilter,
    knownHosts, activeHosts, allHostsActive, toggleHost, toggleAllHosts,
    knownSources, activeSources, allSourcesActive, toggleSource, toggleAllSources,
    clearAll, activeFilterCount
}: SuperTimelineFiltersProps) {
    const [showQueryHelp, setShowQueryHelp] = React.useState(false);

    return (
        <TacticalPanel
            title={`FILTERS${activeFilterCount > 0 ? ` (${activeFilterCount} ACTIVE)` : ""}`}
            className="shrink-0"
            headerActions={
                activeFilterCount > 0 ? (
                    <button
                        onClick={clearAll}
                        className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-3 h-3" />
                        CLEAR ALL
                    </button>
                ) : undefined
            }
        >
            <div className="space-y-4">
                {/* Search + Date range */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-xl">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => onSearchChange(e.target.value)}
                                placeholder='host:DC01 source:EVTX eid:4624 user:admin "phrase"'
                                className="w-full pl-8 pr-7 h-8 bg-background border border-input rounded-sm font-mono text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            {searchInput && (
                                <button
                                    onClick={() => onSearchChange("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        <div className="relative">
                            <button
                                onClick={() => setShowQueryHelp((v) => !v)}
                                className={`h-8 w-8 flex items-center justify-center rounded-sm border transition-colors ${showQueryHelp ? "border-primary text-primary bg-primary/10" : "border-border/40 text-muted-foreground hover:text-foreground hover:border-border"}`}
                                title="Query syntax help"
                            >
                                <HelpCircle className="w-3.5 h-3.5" />
                            </button>
                            {showQueryHelp && (
                                <div className="absolute top-10 left-0 z-50 w-80 border border-primary/30 bg-card shadow-xl p-4 font-mono text-xs space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-primary font-bold tracking-wider">DSL QUERY SYNTAX</span>
                                        <button onClick={() => setShowQueryHelp(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                                    </div>
                                    <div className="space-y-2 text-muted-foreground">
                                        <div className="text-foreground text-[10px] uppercase tracking-wider border-b border-border/40 pb-1">Field Filters</div>
                                        {[
                                            ["host:DC01",       "filter by hostname"],
                                            ["source:EVTX",     "filter by source type"],
                                            ["user:admin",      "filter by username"],
                                            ["eid:4624",        "filter by event ID"],
                                            ["rule:mimikatz",   "filter by Sigma rule"],
                                        ].map(([ex, desc]) => (
                                            <div key={ex} className="flex justify-between gap-2">
                                                <code className="text-primary">{ex}</code>
                                                <span className="text-[10px]">{desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-2 text-muted-foreground">
                                        <div className="text-foreground text-[10px] uppercase tracking-wider border-b border-border/40 pb-1">Operators & Syntax</div>
                                        {[
                                            ["user:*admin*",          "wildcard match"],
                                            ['"lateral movement"',    "exact phrase"],
                                            ["-source:SIGMA",         "exclude (NOT)"],
                                            ["host:DC01 eid:4624",    "implicit AND"],
                                        ].map(([ex, desc]) => (
                                            <div key={ex} className="flex justify-between gap-2">
                                                <code className="text-primary">{ex}</code>
                                                <span className="text-[10px]">{desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <input
                            type="datetime-local"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                        />
                        <span className="font-mono text-xs text-muted-foreground">TO</span>
                        <input
                            type="datetime-local"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                        />
                        {(dateFrom || dateTo) && (
                            <Button
                                variant={dateFilterActive ? "tactical" : "outline"}
                                size="sm"
                                className="h-8 font-mono text-xs px-3"
                                onClick={dateFilterActive ? clearDateFilter : applyDateFilter}
                            >
                                {dateFilterActive ? (
                                    <><X className="w-3 h-3 mr-1" />CLEAR</>
                                ) : (
                                    "APPLY"
                                )}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Quick filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        QUICK:
                    </span>
                    {QUICK_FILTERS.map((qf) => (
                        <button
                            key={qf.id}
                            onClick={() => applyQuickFilter(qf)}
                            className={`px-2.5 py-1 rounded-sm border font-mono text-xs transition-all ${
                                activeQuickFilter === qf.id
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                            }`}
                        >
                            {qf.label}
                        </button>
                    ))}
                </div>

                {/* Host filter */}
                {knownHosts.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 shrink-0">
                            <Users className="w-3 h-3" />
                            HOSTS:
                        </span>
                        <button
                            onClick={toggleAllHosts}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm border font-mono text-xs transition-colors ${
                                allHostsActive
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border/40 text-muted-foreground hover:border-border"
                            }`}
                        >
                            ALL
                            <span className="px-1 py-0.5 bg-secondary rounded-sm text-[10px]">
                                {knownHosts.length}
                            </span>
                        </button>
                        {knownHosts.map((host) => (
                            <HostChip
                                key={host}
                                host={host}
                                allHosts={knownHosts}
                                active={allHostsActive || activeHosts.has(host)}
                                onClick={() => toggleHost(host)}
                            />
                        ))}
                    </div>
                )}

                {/* Source filter */}
                {knownSources.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 shrink-0">
                            <Tag className="w-3 h-3" />
                            SOURCE:
                        </span>
                        <button
                            onClick={toggleAllSources}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm border font-mono text-xs transition-colors ${
                                allSourcesActive
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border/40 text-muted-foreground hover:border-border"
                            }`}
                        >
                            ALL
                            <span className="px-1 py-0.5 bg-secondary rounded-sm text-[10px]">
                                {knownSources.length}
                            </span>
                        </button>
                        {knownSources.map((src) => (
                            <SourceChip
                                key={src}
                                source={src}
                                active={allSourcesActive || activeSources.has(src)}
                                onClick={() => toggleSource(src)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </TacticalPanel>
    );
}
