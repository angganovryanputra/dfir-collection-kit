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
        <div className="space-y-3">
            {/* Top row: Search + Date */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 flex-1 min-w-[300px]">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder='Search by host, user, eid, rule, or phrase...'
                            className="w-full pl-8 pr-7 h-8 bg-secondary/30 border border-border/40 rounded-sm font-mono text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background transition-all"
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
                            <div className="absolute top-10 left-0 z-50 w-80 border border-primary/30 bg-card shadow-xl p-4 font-mono text-xs space-y-3 rounded-sm">
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

                <div className="flex items-center gap-2 bg-secondary/20 px-2 py-1 rounded-sm border border-border/40">
                    <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                        type="datetime-local"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-6 px-1 bg-transparent font-mono text-[10px] focus:outline-none text-foreground w-[150px]"
                    />
                    <span className="font-mono text-[10px] text-muted-foreground mx-1">→</span>
                    <input
                        type="datetime-local"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-6 px-1 bg-transparent font-mono text-[10px] focus:outline-none text-foreground w-[150px]"
                    />
                    {(dateFrom || dateTo) && (
                        <button
                            className={cn(
                                "h-6 px-2 font-mono text-[9px] rounded-sm transition-all",
                                dateFilterActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                            )}
                            onClick={dateFilterActive ? clearDateFilter : applyDateFilter}
                        >
                            {dateFilterActive ? "CLEAR" : "APPLY"}
                        </button>
                    )}
                </div>

                {activeFilterCount > 0 && (
                    <button
                        onClick={clearAll}
                        className="flex items-center gap-1.5 px-2 py-1 border border-destructive/30 bg-destructive/5 font-mono text-[10px] text-destructive hover:bg-destructive/10 transition-colors rounded-sm"
                    >
                        <X className="w-3 h-3" />
                        RESET ALL
                    </button>
                )}
            </div>

            {/* Bottom row: Chips */}
            <div className="flex items-center gap-6 divide-x divide-border/40 overflow-hidden">
                {/* Quick filters */}
                <div className="flex items-center gap-2 shrink-0">
                    <Zap className="w-3 h-3 text-warning" />
                    <div className="flex gap-1">
                        {QUICK_FILTERS.map((qf) => (
                            <button
                                key={qf.id}
                                onClick={() => applyQuickFilter(qf)}
                                className={`px-2 py-0.5 rounded-sm border font-mono text-[9px] transition-all uppercase ${
                                    activeQuickFilter === qf.id
                                        ? "border-warning bg-warning/15 text-warning shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                                        : "border-border/40 text-muted-foreground hover:border-border/80 hover:text-foreground"
                                }`}
                            >
                                {qf.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Hosts */}
                {knownHosts.length > 0 && (
                    <div className="flex items-center gap-2 pl-4 overflow-hidden">
                        <Users className="w-3 h-3 text-muted-foreground shrink-0" />
                        <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5">
                            <button
                                onClick={toggleAllHosts}
                                className={`px-2 py-0.5 rounded-sm border font-mono text-[9px] transition-colors shrink-0 ${
                                    allHostsActive
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border/40 text-muted-foreground hover:border-border"
                                }`}
                            >
                                ALL ({knownHosts.length})
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
                    </div>
                )}
            </div>
        </div>
    );
}
