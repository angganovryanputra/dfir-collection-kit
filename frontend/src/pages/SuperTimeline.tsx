import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/common/SearchInput";
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

const DETECTION_TYPE_COLORS: Record<LateralMovementDetection["detection_type"], string> = {
    account_pivot: "text-red-400 border-red-400/40 bg-red-400/10",
    process_spread: "text-orange-400 border-orange-400/40 bg-orange-400/10",
    credential_reuse: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
};

const LIMIT = 100;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHostColor(host: string, allHosts: string[]) {
    const idx = allHosts.indexOf(host);
    return HOST_COLORS[idx % HOST_COLORS.length] ?? HOST_COLORS[0];
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

    // Timeline grid state
    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);
    const [activeHosts, setActiveHosts] = useState<Set<string>>(new Set());
    const [allHostsActive, setAllHostsActive] = useState(true);

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
            // 404 is expected when no super timeline has been built yet
            if (!msg.includes("404") && !msg.includes("not found")) {
                setStatusError(msg);
            }
            setStStatus(null);
        } finally {
            setStatusLoading(false);
        }
    }, [incidentId]);

    // Initial fetch
    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    // Polling while PENDING or BUILDING
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

    // ── Timeline data query ───────────────────────────────────────────────────
    const isDone = stStatus?.status === "DONE";

    const hostsParam = allHostsActive
        ? ""
        : Array.from(activeHosts).join(",");

    const { data: timelineData, isLoading: tlLoading, error: tlError } =
        useQuery<SuperTimelineResponse>({
            queryKey: [
                "super-timeline-data",
                incidentId,
                debouncedSearch,
                page,
                hostsParam,
            ],
            queryFn: () => {
                const params = new URLSearchParams({
                    page: String(page),
                    limit: String(LIMIT),
                });
                if (debouncedSearch) params.set("q", debouncedSearch);
                if (hostsParam) params.set("hosts", hostsParam);
                return apiGet<SuperTimelineResponse>(
                    `/evidence/super-timeline/${incidentId}?${params}`
                );
            },
            enabled: isDone,
        });

    // ── Lateral movement query ────────────────────────────────────────────────
    const {
        data: lmData,
        isLoading: lmLoading,
        error: lmError,
    } = useQuery<LateralMovementDetection[]>({
        queryKey: ["lateral-movement", incidentId, stStatus?.id],
        queryFn: () =>
            apiGet<LateralMovementDetection[]>(
                `/processing/incident/${incidentId}/super-timeline/lateral-movement`
            ),
        enabled: isDone,
    });

    // ── Error side-effects (TanStack Query v5 — no onError callback) ──────────
    useEffect(() => {
        if (tlError) {
            console.error("[SuperTimeline] timeline query error:", tlError);
        }
    }, [tlError]);

    useEffect(() => {
        if (lmError) {
            console.error("[SuperTimeline] lateral movement query error:", lmError);
        }
    }, [lmError]);

    // ── Host list derived from timeline data ──────────────────────────────────
    const knownHosts: string[] = timelineData?.hosts ?? [];

    // Initialise activeHosts when host list first arrives
    useEffect(() => {
        if (knownHosts.length > 0 && activeHosts.size === 0) {
            setActiveHosts(new Set(knownHosts));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [knownHosts.join(",")]);

    // ── Search debounce ───────────────────────────────────────────────────────
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
        setSearchInput(e.target.value);
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            setDebouncedSearch(e.target.value);
            setPage(1);
        }, 400);
    }

    // ── Pagination ────────────────────────────────────────────────────────────
    const totalPages = timelineData ? Math.ceil(timelineData.total / LIMIT) : 0;

    // ── Host filter helpers ───────────────────────────────────────────────────
    function toggleHost(host: string) {
        setAllHostsActive(false);
        setActiveHosts((prev) => {
            const next = new Set(prev);
            if (next.has(host)) {
                next.delete(host);
            } else {
                next.add(host);
            }
            return next;
        });
        setPage(1);
    }

    function toggleAllHosts() {
        setAllHostsActive(true);
        setActiveHosts(new Set(knownHosts));
        setPage(1);
    }

    // ── Derived build state ───────────────────────────────────────────────────
    const isBuilding =
        building ||
        stStatus?.status === "BUILDING" ||
        stStatus?.status === "PENDING";

    const isFailed = stStatus?.status === "FAILED";
    const canBuild = !isBuilding;

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
            <div className="p-6 flex flex-col gap-6 h-full">

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
                                cross-host timeline for correlation analysis.
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
                                    disabled={!canBuild}
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
                                    <span className="font-bold text-foreground">
                                        {stStatus.host_count ?? 0}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/40 rounded-sm font-mono text-xs">
                                    <Database className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-muted-foreground">EVENTS</span>
                                    <span className="font-bold text-foreground">
                                        {stStatus.event_count?.toLocaleString() ?? 0}
                                    </span>
                                </div>
                                {stStatus.completed_at && (
                                    <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/40 rounded-sm font-mono text-xs">
                                        <Clock className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-muted-foreground">COMPLETED</span>
                                        <span className="font-bold text-foreground">
                                            {formatTs(stStatus.completed_at)}
                                        </span>
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

                {/* ── Host Filter (DONE) ──────────────────────────────────── */}
                {isDone && knownHosts.length > 0 && (
                    <TacticalPanel title="HOST FILTER" className="shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={toggleAllHosts}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border font-mono text-xs transition-colors ${
                                    allHostsActive
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border/40 text-muted-foreground hover:border-border"
                                }`}
                            >
                                <Users className="w-3 h-3" />
                                ALL HOSTS
                                <span className="ml-1 px-1.5 py-0.5 bg-secondary rounded-sm text-xs">
                                    {knownHosts.length}
                                </span>
                            </button>

                            {knownHosts.map((host) => (
                                <HostChip
                                    key={host}
                                    host={host}
                                    allHosts={knownHosts}
                                    active={allHostsActive || activeHosts.has(host)}
                                    onClick={toggleHost.bind(null, host)}
                                />
                            ))}

                            {!allHostsActive && (
                                <span className="ml-auto font-mono text-xs text-muted-foreground">
                                    {activeHosts.size}/{knownHosts.length} ACTIVE
                                </span>
                            )}
                        </div>
                    </TacticalPanel>
                )}

                {/* ── Timeline Grid (DONE) ────────────────────────────────── */}
                {isDone && (
                    <TacticalPanel
                        title="CROSS-HOST EVENT TIMELINE"
                        className="flex-1 flex flex-col min-h-0"
                        status={tlLoading ? "active" : "online"}
                        headerActions={
                            <div className="flex items-center gap-3">
                                <SearchInput
                                    value={searchInput}
                                    onChange={handleSearchChange}
                                    placeholder="Search events, hosts, sources..."
                                    className="w-64 h-7 text-xs"
                                />
                                <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                    PAGE {page}/{totalPages || 1}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7"
                                    disabled={page <= 1 || tlLoading}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                    <ChevronLeft className="w-3 h-3" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7"
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
                                <div className="flex items-center justify-center h-40 font-mono text-sm text-muted-foreground">
                                    <Search className="w-4 h-4 mr-2 opacity-50" />
                                    {debouncedSearch
                                        ? "NO EVENTS MATCH SEARCH QUERY"
                                        : "NO TIMELINE EVENTS AVAILABLE"}
                                </div>
                            ) : (
                                <table className="w-full text-sm font-mono">
                                    <thead className="sticky top-0 bg-card border-b border-border z-10">
                                        <tr className="text-muted-foreground text-xs">
                                            <th className="px-3 py-2 text-left font-bold uppercase whitespace-nowrap">
                                                HOST
                                            </th>
                                            <th className="px-3 py-2 text-left font-bold uppercase whitespace-nowrap">
                                                DATETIME
                                            </th>
                                            <th className="px-3 py-2 text-left font-bold uppercase whitespace-nowrap">
                                                TYPE
                                            </th>
                                            <th className="px-3 py-2 text-left font-bold uppercase whitespace-nowrap">
                                                SOURCE
                                            </th>
                                            <th className="px-3 py-2 text-left font-bold uppercase">
                                                MESSAGE
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {timelineData.data.map((row, i) => {
                                            const host = String(
                                                row["computer"] ?? row["host"] ?? row["hostname"] ?? "UNKNOWN"
                                            );
                                            const color = getHostColor(host, knownHosts);
                                            const datetime =
                                                String(row["datetime"] ?? row["timestamp"] ?? "—");
                                            const tsDesc = String(row["timestamp_desc"] ?? "—");
                                            const source = String(row["source"] ?? row["source_name"] ?? "—");
                                            const message = String(row["message"] ?? row["description"] ?? row["msg"] ?? "—");

                                            return (
                                                <tr
                                                    key={i}
                                                    className="border-b border-border/30 hover:bg-primary/5 transition-colors text-xs"
                                                >
                                                    <td className="px-3 py-1.5 whitespace-nowrap">
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-xs font-mono ${color.bg} ${color.text} ${color.border}`}
                                                        >
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
                                                            className="px-1.5 py-0.5 bg-secondary/60 border border-border/40 rounded-sm text-muted-foreground text-xs truncate block max-w-[120px]"
                                                            title={tsDesc}
                                                        >
                                                            {truncate(tsDesc, 30)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-1.5 max-w-[140px]">
                                                        <span
                                                            className="truncate block text-muted-foreground"
                                                            title={source}
                                                        >
                                                            {truncate(source, 40)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-1.5 max-w-[400px]">
                                                        <span
                                                            className="truncate block"
                                                            title={String(row["message"] ?? row["description"] ?? row["msg"] ?? "")}
                                                        >
                                                            {truncate(message, 120)}
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
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-xs"
                                        disabled={page <= 1 || tlLoading}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    >
                                        <ChevronLeft className="w-3 h-3 mr-1" />
                                        PREV
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-xs"
                                        disabled={page >= totalPages || tlLoading}
                                        onClick={() => setPage((p) => p + 1)}
                                    >
                                        NEXT
                                        <ChevronRight className="w-3 h-3 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </TacticalPanel>
                )}

                {/* ── Lateral Movement Panel (DONE + detections) ─────────── */}
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
                                {lmLoading && (
                                    <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground py-3">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        LOADING DETECTIONS...
                                    </div>
                                )}
                                {lmError && (
                                    <div className="font-mono text-xs text-destructive py-2">
                                        ERROR: {(lmError as Error).message}
                                    </div>
                                )}
                                {lmData.map((det) => (
                                    <div
                                        key={det.id}
                                        className="border border-border/60 bg-secondary/20 p-4 rounded-sm space-y-3"
                                    >
                                        {/* Top row: type badge + host path */}
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span
                                                className={`px-2 py-0.5 rounded-sm border text-xs font-mono font-bold uppercase ${
                                                    DETECTION_TYPE_COLORS[det.detection_type]
                                                }`}
                                            >
                                                {det.detection_type.replace(/_/g, " ")}
                                            </span>

                                            <div className="flex items-center gap-2 font-mono text-sm">
                                                <span
                                                    className={`px-2 py-0.5 rounded-sm border text-xs ${(() => {
                                                        const c = getHostColor(det.source_host, [
                                                            det.source_host,
                                                            det.target_host,
                                                        ]);
                                                        return `${c.bg} ${c.text} ${c.border}`;
                                                    })()}`}
                                                >
                                                    {det.source_host}
                                                </span>
                                                <Network className="w-3.5 h-3.5 text-muted-foreground" />
                                                <span
                                                    className={`px-2 py-0.5 rounded-sm border text-xs ${(() => {
                                                        const c = getHostColor(det.target_host, [
                                                            det.source_host,
                                                            det.target_host,
                                                        ]);
                                                        return `${c.bg} ${c.text} ${c.border}`;
                                                    })()}`}
                                                >
                                                    {det.target_host}
                                                </span>
                                            </div>

                                            {det.actor && (
                                                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                                    <Shield className="w-3 h-3" />
                                                    {det.actor}
                                                </span>
                                            )}
                                        </div>

                                        {/* Metadata grid */}
                                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs">
                                            <div>
                                                <span className="text-muted-foreground">FIRST SEEN: </span>
                                                {formatTs(det.first_seen)}
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">LAST SEEN: </span>
                                                {formatTs(det.last_seen)}
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">EVENT COUNT: </span>
                                                {det.event_count.toLocaleString()}
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">DETECTED: </span>
                                                {formatTs(det.detected_at)}
                                            </div>
                                        </div>

                                        {/* Confidence bar */}
                                        <div>
                                            <div className="font-mono text-xs text-muted-foreground mb-1">
                                                CONFIDENCE
                                            </div>
                                            <ConfidenceBar value={det.confidence} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TacticalPanel>
                )}

                {/* ── Lateral movement loading placeholder ────────────────── */}
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
