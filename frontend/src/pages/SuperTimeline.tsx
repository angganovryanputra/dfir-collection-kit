import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import {
    ChevronLeft,
    ChevronRight,
    Database,
    Server,
    AlertTriangle,
    RefreshCw,
    Loader2,
    Shield,
    Network,
    Clock,
    Search,
    Users,
    X,
    CalendarRange,
    Tag,
    Zap,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type SuperTimelineStatus = {
    id: string;
    incident_id: string;
    status: "PENDING" | "BUILDING" | "DONE" | "FAILED";
    host_count: number | null;
    event_count: number | null;
    duckdb_path: string | null;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
};

type LateralMovementDetection = {
    id: string;
    incident_id: string;
    super_timeline_id: string;
    detection_type: "account_pivot" | "process_spread" | "credential_reuse";
    source_host: string;
    target_host: string;
    actor: string | null;
    first_seen: string | null;
    last_seen: string | null;
    event_count: number;
    confidence: number;
    details: Record<string, unknown>;
    detected_at: string;
};

type SuperTimelineResponse = {
    data: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
    hosts: string[];
    source_shorts: string[];
};

type QuickFilter = {
    id: string;
    label: string;
    q?: string;
    sources?: string[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const HOST_COLORS = [
    { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" },
    { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
    { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
    { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
    { bg: "bg-pink-500/20", text: "text-pink-400", border: "border-pink-500/30" },
    { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30" },
    { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
    { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30" },
];

const SOURCE_SHORT_COLORS: Record<string, string> = {
    EVTX:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
    SIGMA:    "bg-red-500/15 text-red-400 border-red-500/30",
    MFT:      "bg-green-500/15 text-green-400 border-green-500/30",
    PREFETCH: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    REGISTRY: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    SYSMON:   "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    AMCACHE:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
    LNK:      "bg-pink-500/15 text-pink-400 border-pink-500/30",
    HAYABUSA: "bg-red-600/15 text-red-300 border-red-600/30",
};

const DETECTION_TYPE_COLORS: Record<LateralMovementDetection["detection_type"], string> = {
    account_pivot:    "text-red-400 border-red-400/40 bg-red-400/10",
    process_spread:   "text-orange-400 border-orange-400/40 bg-orange-400/10",
    credential_reuse: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
};

const QUICK_FILTERS: QuickFilter[] = [
    { id: "sigma",    label: "SIGMA ALERTS",     sources: ["SIGMA", "HAYABUSA"] },
    { id: "logon",    label: "LOGON EVENTS",      q: "logon" },
    { id: "process",  label: "PROCESS EXECUTION", sources: ["PREFETCH", "AMCACHE"] },
    { id: "fileops",  label: "FILE OPERATIONS",   sources: ["MFT", "LNK"] },
    { id: "network",  label: "NETWORK ACTIVITY",  sources: ["SYSMON"], q: "network" },
    { id: "registry", label: "REGISTRY",          sources: ["REGISTRY"] },
    { id: "lateral",  label: "LATERAL MOVEMENT",  q: "lateral" },
    { id: "ransom",   label: "RANSOMWARE",         q: "ransom" },
];

const LIMIT = 100;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHostColor(host: string, allHosts: string[]) {
    const idx = allHosts.indexOf(host);
    return HOST_COLORS[idx % HOST_COLORS.length] ?? HOST_COLORS[0];
}

function getSourceColor(sourceShort: string): string {
    return (
        SOURCE_SHORT_COLORS[sourceShort?.toUpperCase()] ??
        "bg-secondary/60 text-muted-foreground border-border/40"
    );
}

function formatTs(ts: string | null): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
}

function truncate(val: unknown, max = 120): string {
    if (val === null || val === undefined) return "—";
    const str = String(val);
    return str.length > max ? str.slice(0, max) + "…" : str;
}

/** Highlight query term in a string with <mark> spans (returns JSX-safe string chunks). */
function highlightTerms(text: string, term: string): React.ReactNode {
    if (!term || term.length < 2) return text;
    const lower = text.toLowerCase();
    const lowerTerm = term.toLowerCase();
    const idx = lower.indexOf(lowerTerm);
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="bg-primary/30 text-primary rounded-sm px-0.5">
                {text.slice(idx, idx + term.length)}
            </mark>
            {text.slice(idx + term.length)}
        </>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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
    return (
        <button
            onClick={onClick}
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

function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
    const color =
        pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-orange-500" : "bg-yellow-500";
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="font-mono text-xs text-muted-foreground w-8 text-right">
                {pct}%
            </span>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperTimeline() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();

    // Build / status polling
    const [stStatus, setStStatus] = useState<SuperTimelineStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [building, setBuilding] = useState(false);
    const [buildError, setBuildError] = useState<string | null>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Search & filter state
    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);

    // Host filter
    const [activeHosts, setActiveHosts] = useState<Set<string>>(new Set());
    const [allHostsActive, setAllHostsActive] = useState(true);

    // Source filter
    const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
    const [allSourcesActive, setAllSourcesActive] = useState(true);

    // Date range filter
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [dateFilterActive, setDateFilterActive] = useState(false);

    // Active quick filter
    const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);

    // Lateral movement collapsible
    const [lmExpanded, setLmExpanded] = useState(true);

    // ── Fetch current status ──────────────────────────────────────────────────
    const fetchStatus = useCallback(async () => {
        if (!incidentId) return;
        try {
            const data = await apiGet<SuperTimelineStatus>(
                `/processing/incident/${incidentId}/super-timeline/status`
            );
            setStStatus(data);
            setStatusError(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            if (!msg.includes("404") && !msg.includes("not found")) {
                setStatusError(msg);
            }
            setStStatus(null);
        } finally {
            setStatusLoading(false);
        }
    }, [incidentId]);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    // Polling while PENDING / BUILDING
    useEffect(() => {
        const shouldPoll =
            stStatus?.status === "BUILDING" || stStatus?.status === "PENDING";
        if (shouldPoll) {
            pollingRef.current = setInterval(fetchStatus, 3000);
        } else {
            if (pollingRef.current !== null) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        }
        return () => {
            if (pollingRef.current !== null) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [stStatus?.status, fetchStatus]);

    // ── Build trigger ─────────────────────────────────────────────────────────
    async function triggerBuild() {
        if (!incidentId) return;
        setBuildError(null);
        setBuilding(true);
        try {
            const data = await apiPost<SuperTimelineStatus>(
                `/processing/incident/${incidentId}/super-timeline/trigger`,
                {}
            );
            setStStatus(data);
        } catch (err) {
            setBuildError(err instanceof Error ? err.message : "Build trigger failed");
        } finally {
            setBuilding(false);
        }
    }

    // ── Query param builders ──────────────────────────────────────────────────
    const isDone = stStatus?.status === "DONE";

    const hostsParam = allHostsActive ? "" : Array.from(activeHosts).join(",");
    const sourceParam = allSourcesActive ? "" : Array.from(activeSources).join(",");

    const { data: timelineData, isLoading: tlLoading, error: tlError } =
        useQuery<SuperTimelineResponse>({
            queryKey: [
                "super-timeline-data",
                incidentId,
                debouncedSearch,
                page,
                hostsParam,
                sourceParam,
                dateFilterActive ? dateFrom : "",
                dateFilterActive ? dateTo : "",
            ],
            queryFn: () => {
                const params = new URLSearchParams({
                    page: String(page),
                    limit: String(LIMIT),
                });
                if (debouncedSearch) params.set("q", debouncedSearch);
                if (hostsParam)     params.set("hosts", hostsParam);
                if (sourceParam)    params.set("source", sourceParam);
                if (dateFilterActive && dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
                if (dateFilterActive && dateTo)   params.set("date_to",   new Date(dateTo).toISOString());
                return apiGet<SuperTimelineResponse>(
                    `/evidence/super-timeline/${incidentId}?${params}`
                );
            },
            enabled: isDone,
        });

    // ── Lateral movement query ────────────────────────────────────────────────
    const { data: lmData, isLoading: lmLoading, error: lmError } =
        useQuery<LateralMovementDetection[]>({
            queryKey: ["lateral-movement", incidentId, stStatus?.id],
            queryFn: () =>
                apiGet<LateralMovementDetection[]>(
                    `/processing/incident/${incidentId}/super-timeline/lateral-movement`
                ),
            enabled: isDone,
        });

    useEffect(() => {
        if (tlError) console.error("[SuperTimeline] timeline query error:", tlError);
    }, [tlError]);
    useEffect(() => {
        if (lmError) console.error("[SuperTimeline] lateral movement query error:", lmError);
    }, [lmError]);

    // ── Derived lists from response ───────────────────────────────────────────
    const knownHosts: string[]  = timelineData?.hosts ?? [];
    const knownSources: string[] = timelineData?.source_shorts ?? [];

    // Initialise activeHosts on first load
    useEffect(() => {
        if (knownHosts.length > 0 && activeHosts.size === 0) {
            setActiveHosts(new Set(knownHosts));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [knownHosts.join(",")]);

    // Initialise activeSources on first load
    useEffect(() => {
        if (knownSources.length > 0 && activeSources.size === 0) {
            setActiveSources(new Set(knownSources));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [knownSources.join(",")]);

    // ── Search debounce ───────────────────────────────────────────────────────
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    function handleSearchChange(val: string) {
        setSearchInput(val);
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            setDebouncedSearch(val);
            setPage(1);
        }, 400);
    }

    // ── Quick filter ──────────────────────────────────────────────────────────
    function applyQuickFilter(qf: QuickFilter) {
        if (activeQuickFilter === qf.id) {
            // Toggle off — clear
            setActiveQuickFilter(null);
            setDebouncedSearch("");
            setSearchInput("");
            setAllSourcesActive(true);
            setActiveSources(new Set(knownSources));
        } else {
            setActiveQuickFilter(qf.id);
            const newQ = qf.q ?? "";
            setSearchInput(newQ);
            setDebouncedSearch(newQ);
            if (qf.sources) {
                setAllSourcesActive(false);
                setActiveSources(new Set(qf.sources));
            } else {
                setAllSourcesActive(true);
                setActiveSources(new Set(knownSources));
            }
        }
        setPage(1);
    }

    // ── Pagination ────────────────────────────────────────────────────────────
    const totalPages = timelineData ? Math.ceil(timelineData.total / LIMIT) : 0;

    // ── Host filter helpers ───────────────────────────────────────────────────
    function toggleHost(host: string) {
        setAllHostsActive(false);
        setActiveHosts((prev) => {
            const next = new Set(prev);
            next.has(host) ? next.delete(host) : next.add(host);
            return next;
        });
        setPage(1);
    }
    function toggleAllHosts() {
        setAllHostsActive(true);
        setActiveHosts(new Set(knownHosts));
        setPage(1);
    }

    // ── Source filter helpers ─────────────────────────────────────────────────
    function toggleSource(src: string) {
        setAllSourcesActive(false);
        setActiveQuickFilter(null);
        setActiveSources((prev) => {
            const next = new Set(prev);
            next.has(src) ? next.delete(src) : next.add(src);
            return next;
        });
        setPage(1);
    }
    function toggleAllSources() {
        setAllSourcesActive(true);
        setActiveSources(new Set(knownSources));
        setActiveQuickFilter(null);
        setPage(1);
    }

    // ── Date filter helpers ───────────────────────────────────────────────────
    function applyDateFilter() {
        setDateFilterActive(true);
        setPage(1);
    }
    function clearDateFilter() {
        setDateFrom("");
        setDateTo("");
        setDateFilterActive(false);
        setPage(1);
    }

    // ── Active filter count (for badge) ──────────────────────────────────────
    const activeFilterCount =
        (debouncedSearch ? 1 : 0) +
        (!allHostsActive ? 1 : 0) +
        (!allSourcesActive ? 1 : 0) +
        (dateFilterActive ? 1 : 0);

    // ── Derived build state ───────────────────────────────────────────────────
    const isBuilding = building || stStatus?.status === "BUILDING" || stStatus?.status === "PENDING";
    const isFailed   = stStatus?.status === "FAILED";

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <AppLayout
            title="SUPER TIMELINE"
            subtitle={`INCIDENT: ${incidentId}`}
            headerActions={
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/incidents/${incidentId}/processing`)}
                >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    BACK TO PIPELINE
                </Button>
            }
        >
            <div className="p-6 flex flex-col gap-5 h-full">

                {/* ── Initial loading ─────────────────────────────────────── */}
                {statusLoading && (
                    <TacticalPanel title="SUPER TIMELINE STATUS" status="active">
                        <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            CHECKING STATUS...
                        </div>
                    </TacticalPanel>
                )}

                {/* ── Status error (non-404) ──────────────────────────────── */}
                {!statusLoading && statusError && (
                    <TacticalPanel title="STATUS ERROR" status="offline">
                        <div className="font-mono text-sm text-destructive py-4">
                            ERROR: {statusError}
                        </div>
                    </TacticalPanel>
                )}

                {/* ── Build Panel (null / FAILED / not started) ───────────── */}
                {!statusLoading && !isDone && (
                    <TacticalPanel
                        title="BUILD SUPER TIMELINE"
                        status={isBuilding ? "active" : isFailed ? "offline" : "warning"}
                    >
                        <div className="space-y-5">
                            <p className="font-mono text-sm text-muted-foreground leading-relaxed">
                                Merge timelines from all processed hosts into a unified
                                cross-host timeline with lateral movement detection.
                            </p>
                            {isFailed && stStatus?.error_message && (
                                <div className="p-3 border border-destructive/40 bg-destructive/10 text-destructive font-mono text-xs">
                                    LAST BUILD FAILED: {stStatus.error_message}
                                </div>
                            )}
                            {buildError && (
                                <div className="p-3 border border-destructive/40 bg-destructive/10 text-destructive font-mono text-xs">
                                    ERROR: {buildError}
                                </div>
                            )}
                            {isBuilding ? (
                                <div className="flex items-center gap-4 font-mono text-sm text-primary py-3">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <div>
                                        <div className="font-bold">
                                            {stStatus?.status === "PENDING"
                                                ? "QUEUED — WAITING FOR WORKER..."
                                                : "BUILDING SUPER TIMELINE..."}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5 animate-pulse">
                                            AUTO-REFRESH ACTIVE (3s)
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    variant="tactical"
                                    onClick={triggerBuild}
                                    disabled={isBuilding}
                                    className="gap-2"
                                >
                                    <Database className="w-4 h-4" />
                                    {isFailed ? "REBUILD SUPER TIMELINE" : "BUILD SUPER TIMELINE"}
                                </Button>
                            )}
                        </div>
                    </TacticalPanel>
                )}

                {/* ── Status Bar (DONE) ───────────────────────────────────── */}
                {isDone && stStatus && (
                    <TacticalPanel title="SUPER TIMELINE STATUS" status="verified">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/40 rounded-sm font-mono text-xs">
                                    <Server className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-muted-foreground">HOSTS</span>
                                    <span className="font-bold">{stStatus.host_count ?? 0}</span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/40 rounded-sm font-mono text-xs">
                                    <Database className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-muted-foreground">EVENTS</span>
                                    <span className="font-bold">{stStatus.event_count?.toLocaleString() ?? 0}</span>
                                </div>
                                {stStatus.completed_at && (
                                    <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/40 rounded-sm font-mono text-xs">
                                        <Clock className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-muted-foreground">COMPLETED</span>
                                        <span className="font-bold">{formatTs(stStatus.completed_at)}</span>
                                    </div>
                                )}
                                {lmData && lmData.length > 0 && (
                                    <div className="flex items-center gap-2 px-3 py-2 border border-red-500/40 bg-red-500/10 rounded-sm font-mono text-xs text-red-400">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        <span>{lmData.length} LATERAL MOVEMENT DETECTIONS</span>
                                    </div>
                                )}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={triggerBuild}
                                disabled={isBuilding}
                                className="gap-2 font-mono text-xs"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                REBUILD
                            </Button>
                        </div>
                    </TacticalPanel>
                )}

                {/* ── Filter Panel ────────────────────────────────────────── */}
                {isDone && (
                    <TacticalPanel
                        title={`FILTERS${activeFilterCount > 0 ? ` (${activeFilterCount} ACTIVE)` : ""}`}
                        className="shrink-0"
                        headerActions={
                            activeFilterCount > 0 ? (
                                <button
                                    onClick={() => {
                                        setDebouncedSearch(""); setSearchInput("");
                                        setAllHostsActive(true); setActiveHosts(new Set(knownHosts));
                                        setAllSourcesActive(true); setActiveSources(new Set(knownSources));
                                        clearDateFilter();
                                        setActiveQuickFilter(null);
                                        setPage(1);
                                    }}
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
                                {/* Search input */}
                                <div className="relative flex-1 min-w-[200px] max-w-md">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                                    <input
                                        type="text"
                                        value={searchInput}
                                        onChange={(e) => handleSearchChange(e.target.value)}
                                        placeholder="Search events, processes, IPs, users..."
                                        className="w-full pl-8 pr-3 h-8 bg-background border border-input rounded-sm font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                    {searchInput && (
                                        <button
                                            onClick={() => { handleSearchChange(""); setActiveQuickFilter(null); }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>

                                {/* Date from */}
                                <div className="flex items-center gap-2">
                                    <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    <input
                                        type="datetime-local"
                                        value={dateFrom}
                                        onChange={(e) => { setDateFrom(e.target.value); setDateFilterActive(false); }}
                                        className="h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                                    />
                                    <span className="font-mono text-xs text-muted-foreground">TO</span>
                                    <input
                                        type="datetime-local"
                                        value={dateTo}
                                        onChange={(e) => { setDateTo(e.target.value); setDateFilterActive(false); }}
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
                )}

                {/* ── Timeline Grid ────────────────────────────────────────── */}
                {isDone && (
                    <TacticalPanel
                        title="CROSS-HOST EVENT TIMELINE"
                        className="flex-1 flex flex-col min-h-0"
                        status={tlLoading ? "active" : "online"}
                        headerActions={
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                    PAGE {page}/{totalPages || 1}
                                </span>
                                <Button
                                    variant="outline" size="sm" className="h-7"
                                    disabled={page <= 1 || tlLoading}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                    <ChevronLeft className="w-3 h-3" />
                                </Button>
                                <Button
                                    variant="outline" size="sm" className="h-7"
                                    disabled={page >= totalPages || tlLoading}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    <ChevronRight className="w-3 h-3" />
                                </Button>
                            </div>
                        }
                    >
                        <div className="flex-1 overflow-auto min-h-[300px]">
                            {tlError ? (
                                <div className="flex items-center justify-center h-40 font-mono text-sm text-destructive">
                                    <AlertTriangle className="w-4 h-4 mr-2" />
                                    ERROR: {(tlError as Error).message}
                                </div>
                            ) : tlLoading ? (
                                <div className="space-y-2 p-2">
                                    {Array.from({ length: 8 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="h-7 bg-secondary/40 rounded-sm animate-pulse"
                                            style={{ opacity: 1 - i * 0.1 }}
                                        />
                                    ))}
                                </div>
                            ) : !timelineData?.data.length ? (
                                <div className="flex flex-col items-center justify-center h-40 gap-3 font-mono text-sm text-muted-foreground">
                                    <Search className="w-6 h-6 opacity-30" />
                                    {activeFilterCount > 0
                                        ? "NO EVENTS MATCH THE ACTIVE FILTERS"
                                        : "NO TIMELINE EVENTS AVAILABLE"}
                                    {activeFilterCount > 0 && (
                                        <button
                                            onClick={() => {
                                                setDebouncedSearch(""); setSearchInput("");
                                                setAllHostsActive(true); setActiveHosts(new Set(knownHosts));
                                                setAllSourcesActive(true); setActiveSources(new Set(knownSources));
                                                clearDateFilter(); setActiveQuickFilter(null);
                                            }}
                                            className="text-xs text-primary hover:underline"
                                        >
                                            CLEAR FILTERS
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <table className="w-full text-sm font-mono">
                                    <thead className="sticky top-0 bg-card border-b border-border z-10">
                                        <tr className="text-muted-foreground text-xs">
                                            <th className="px-3 py-2 text-left font-bold uppercase whitespace-nowrap">HOST</th>
                                            <th className="px-3 py-2 text-left font-bold uppercase whitespace-nowrap">DATETIME</th>
                                            <th className="px-3 py-2 text-left font-bold uppercase whitespace-nowrap">TYPE</th>
                                            <th className="px-3 py-2 text-left font-bold uppercase whitespace-nowrap">SOURCE</th>
                                            <th className="px-3 py-2 text-left font-bold uppercase">MESSAGE</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {timelineData.data.map((row, i) => {
                                            const host       = String(row["host"] ?? row["computer"] ?? "UNKNOWN");
                                            const color      = getHostColor(host, knownHosts);
                                            const srcShort   = String(row["source_short"] ?? "");
                                            const srcColor   = getSourceColor(srcShort);
                                            const datetime   = String(row["datetime"] ?? row["timestamp"] ?? "—");
                                            const tsDesc     = String(row["timestamp_desc"] ?? "—");
                                            const source     = String(row["source"] ?? "—");
                                            const message    = String(row["message"] ?? row["description"] ?? "—");

                                            // Highlight SIGMA rows
                                            const isSigma = srcShort === "SIGMA" || srcShort === "HAYABUSA";
                                            const rowCls = isSigma
                                                ? "border-b border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
                                                : "border-b border-border/30 hover:bg-primary/5";

                                            return (
                                                <tr key={i} className={`transition-colors text-xs ${rowCls}`}>
                                                    <td className="px-3 py-1.5 whitespace-nowrap">
                                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-xs font-mono ${color.bg} ${color.text} ${color.border}`}>
                                                            <Server className="w-2.5 h-2.5" />
                                                            {host}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-2.5 h-2.5 shrink-0" />
                                                            {datetime}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap">
                                                        <span
                                                            className="px-1.5 py-0.5 rounded-sm border text-xs truncate block max-w-[120px]"
                                                            title={tsDesc}
                                                        >
                                                            {truncate(tsDesc, 30)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5">
                                                            {srcShort && (
                                                                <span className={`px-1.5 py-0.5 rounded-sm border text-[10px] font-bold shrink-0 ${srcColor}`}>
                                                                    {srcShort}
                                                                </span>
                                                            )}
                                                            <span className="text-muted-foreground truncate block max-w-[100px]" title={source}>
                                                                {truncate(source, 28)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-1.5 max-w-[420px]">
                                                        <span className="truncate block" title={message}>
                                                            {highlightTerms(truncate(message, 120), debouncedSearch)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Pagination footer */}
                        {timelineData && timelineData.total > 0 && (
                            <div className="flex items-center justify-between pt-3 border-t border-border mt-3 shrink-0 font-mono text-xs text-muted-foreground">
                                <span>
                                    {((page - 1) * LIMIT + 1).toLocaleString()}–
                                    {Math.min(page * LIMIT, timelineData.total).toLocaleString()} OF{" "}
                                    {timelineData.total.toLocaleString()} EVENTS
                                    {activeFilterCount > 0 && (
                                        <span className="ml-2 text-primary">
                                            (FILTERED)
                                        </span>
                                    )}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline" size="sm" className="h-6 text-xs"
                                        disabled={page <= 1 || tlLoading}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    >
                                        <ChevronLeft className="w-3 h-3 mr-1" />PREV
                                    </Button>
                                    <Button
                                        variant="outline" size="sm" className="h-6 text-xs"
                                        disabled={page >= totalPages || tlLoading}
                                        onClick={() => setPage((p) => p + 1)}
                                    >
                                        NEXT<ChevronRight className="w-3 h-3 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </TacticalPanel>
                )}

                {/* ── Lateral Movement Panel ──────────────────────────────── */}
                {isDone && lmData && lmData.length > 0 && (
                    <TacticalPanel
                        title={`LATERAL MOVEMENT DETECTIONS (${lmData.length})`}
                        status="offline"
                        headerActions={
                            <button
                                onClick={() => setLmExpanded((v) => !v)}
                                className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
                            >
                                {lmExpanded ? "COLLAPSE ▲" : "EXPAND ▼"}
                            </button>
                        }
                    >
                        {lmExpanded && (
                            <div className="space-y-3">
                                {lmData.map((det) => (
                                    <div
                                        key={det.id}
                                        className="border border-border/60 bg-secondary/20 p-4 rounded-sm space-y-3"
                                    >
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-sm border text-xs font-mono font-bold uppercase ${DETECTION_TYPE_COLORS[det.detection_type]}`}>
                                                {det.detection_type.replace(/_/g, " ")}
                                            </span>
                                            <div className="flex items-center gap-2 font-mono text-sm">
                                                <span className={`px-2 py-0.5 rounded-sm border text-xs ${(() => { const c = getHostColor(det.source_host, knownHosts); return `${c.bg} ${c.text} ${c.border}`; })()}`}>
                                                    {det.source_host}
                                                </span>
                                                <Network className="w-3.5 h-3.5 text-muted-foreground" />
                                                <span className={`px-2 py-0.5 rounded-sm border text-xs ${(() => { const c = getHostColor(det.target_host, knownHosts); return `${c.bg} ${c.text} ${c.border}`; })()}`}>
                                                    {det.target_host}
                                                </span>
                                            </div>
                                            {det.actor && (
                                                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                                    <Shield className="w-3 h-3" />
                                                    {det.actor}
                                                </span>
                                            )}
                                            {/* Quick pivot — filter timeline by this actor */}
                                            {det.actor && (
                                                <button
                                                    onClick={() => {
                                                        handleSearchChange(det.actor!);
                                                        setActiveQuickFilter(null);
                                                        setAllSourcesActive(true);
                                                        setActiveSources(new Set(knownSources));
                                                        setPage(1);
                                                        window.scrollTo({ top: 0, behavior: "smooth" });
                                                    }}
                                                    className="ml-auto font-mono text-[10px] text-primary hover:underline"
                                                >
                                                    PIVOT → TIMELINE
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs">
                                            <div><span className="text-muted-foreground">FIRST SEEN: </span>{formatTs(det.first_seen)}</div>
                                            <div><span className="text-muted-foreground">LAST SEEN: </span>{formatTs(det.last_seen)}</div>
                                            <div><span className="text-muted-foreground">EVENT COUNT: </span>{det.event_count.toLocaleString()}</div>
                                            <div><span className="text-muted-foreground">DETECTED: </span>{formatTs(det.detected_at)}</div>
                                        </div>
                                        <div>
                                            <div className="font-mono text-xs text-muted-foreground mb-1">CONFIDENCE</div>
                                            <ConfidenceBar value={det.confidence} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TacticalPanel>
                )}

                {/* ── LM loading placeholder ───────────────────────────────── */}
                {isDone && lmLoading && !lmData && (
                    <TacticalPanel title="LATERAL MOVEMENT DETECTIONS" status="active">
                        <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            ANALYZING LATERAL MOVEMENT...
                        </div>
                    </TacticalPanel>
                )}

            </div>
        </AppLayout>
    );
}
