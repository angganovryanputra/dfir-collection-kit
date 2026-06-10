/**
 * IncidentHub — central command page for a single incident.
 */
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, memo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import {
    ChevronLeft,
    Layers,
    Activity,
    FolderOpen,
    ShieldAlert,
    Bug,
    GitBranch,
    Search,
    CheckCircle2,
    AlertTriangle,
    AlertCircle,
    Server,
    Network,
    Shield,
    Loader2,
    ArrowRight,
    Users,
    FileText,
    XCircle,
    Upload,
    Target,
    Lock,
    Clock,
    Share2,
    Brain,
    Printer,
    ExternalLink,
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { getStoredAuth, getStoredRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useAdaptivePolling } from "@/lib/useAdaptivePolling";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentOut {
    id: string;
    type: string;
    status: string;
    operator: string;
    target_endpoints: string[];
    collection_progress: number;
    template_id: string | null;
    created_at: string;
    updated_at: string;
}

interface ProcessingJobOut {
    id: string;
    incident_id: string;
    job_id: string;
    status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
    phase: string | null;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    created_at: string;
}

interface SuperTimelineOut {
    id: string;
    incident_id: string;
    status: "PENDING" | "BUILDING" | "DONE" | "FAILED";
    host_count: number | null;
    event_count: number | null;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
}

interface LateralMovementOut {
    id: string;
    detection_type: string;
    source_host: string;
    target_host: string;
    actor: string | null;
    confidence: number;
    first_seen?: string;
    last_seen?: string;
}

interface EvidenceFolderOut {
    id: string;
    incident_id: string;
    files_count: number;
    total_size: string;
    status: string;
}

interface SigmaHitListOut {
    total: number;
    severity_counts: Record<string, number>;
    items: unknown[];
}

interface LegalHoldOut {
    id: string;
    incident_id: string;
    reason: string;
    status: "ACTIVE" | "RELEASED" | "EXPIRED";
    expires_at: string | null;
    created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtTs = (ts: string | null | undefined): string => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
};

const fmtStatus = (s: string): string => s.replace(/_/g, " ");

function incidentStatusChip(status: string): string {
    switch (status) {
        case "COLLECTION_IN_PROGRESS": return "border-primary/50 bg-primary/10 text-primary animate-pulse";
        case "COLLECTION_COMPLETE":    return "border-green-500/40 bg-green-500/10 text-green-400";
        case "COLLECTION_FAILED":      return "border-destructive/40 bg-destructive/10 text-destructive";
        case "CLOSED":                 return "border-border/40 bg-secondary/30 text-muted-foreground";
        case "ACTIVE":                 return "border-yellow-500/40 bg-yellow-500/10 text-yellow-400";
        default:                       return "border-border/40 bg-secondary/30 text-muted-foreground";
    }
}

async function apiGetOrNull<T>(path: string): Promise<T | null> {
    try {
        return await apiGet<T>(path);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("404") || msg.includes("not found")) return null;
        throw err;
    }
}

// ─── Memoized Components ──────────────────────────────────────────────────

const ActionCard = memo(({
    icon, title, description, badge, status = "ready", onClick, disabled = false, highlight = false, preview,
}: {
    icon: React.ReactNode; title: string; description: string; badge?: React.ReactNode;
    status?: "ready" | "pending" | "unavailable" | "warning"; onClick: () => void;
    disabled?: boolean; highlight?: boolean; preview?: React.ReactNode;
}) => {
    const borderColor = highlight ? "border-primary/60 hover:border-primary shadow-[0_0_15px_rgba(21,245,116,0.05)]" : status === "warning" ? "border-red-500/40 hover:border-red-500/60" : status === "unavailable" ? "border-border/30" : "border-border/60 hover:border-primary/50";
    const bgColor = highlight ? "bg-primary/5 hover:bg-primary/10" : status === "warning" ? "bg-red-500/5 hover:bg-red-500/8" : status === "unavailable" ? "bg-secondary/5" : "bg-secondary/20 hover:bg-secondary/40";

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "flex flex-col gap-3 p-4 rounded-sm border text-left transition-all w-full group relative overflow-hidden",
                borderColor, bgColor,
                disabled && "opacity-50 cursor-not-allowed grayscale"
            )}
        >
            <div className="flex items-start justify-between">
                <div className={cn(
                    "p-2 rounded-sm transition-colors",
                    highlight ? "bg-primary text-primary-foreground" :
                    status === "warning" ? "bg-red-500/20 text-red-400" :
                    "bg-secondary/80 text-muted-foreground group-hover:text-foreground"
                )}>
                    {icon}
                </div>
                {badge}
            </div>
            <div className="space-y-1">
                <div className={cn(
                    "font-bold text-xs uppercase tracking-wider",
                    highlight ? "text-primary" :
                    status === "warning" ? "text-red-400" :
                    status === "unavailable" ? "text-muted-foreground" : "text-foreground"
                )}>
                    {title}
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight line-clamp-2 font-medium">
                    {description}
                </div>
            </div>
            {preview && (
                <div className="mt-2 pt-3 border-t border-border/20">
                    {preview}
                </div>
            )}
            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <ExternalLink className="w-3 h-3 text-primary/60" />
            </div>
        </button>
    );
});
ActionCard.displayName = "ActionCard";

const TimelineStep = memo(({ done, active, failed, label, detail, progress }: {
    done: boolean; active: boolean; failed: boolean; label: string; detail: string; progress?: number;
}) => (
    <div className="flex items-start gap-4">
        <div className="flex flex-col items-center shrink-0 pt-1">
            {done ? (
                <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center shadow-[0_0_8px_rgba(34,197,94,0.2)]">
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                </div>
            ) : active ? (
                <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center animate-pulse shadow-[0_0_8px_rgba(21,245,116,0.2)]">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                </div>
            ) : failed ? (
                <div className="w-5 h-5 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center">
                    <XCircle className="w-3 h-3 text-destructive" />
                </div>
            ) : (
                <div className="w-5 h-5 rounded-full bg-secondary/60 border border-border/50" />
            )}
        </div>
        <div className="flex-1 min-w-0">
            <div className={cn(
                "text-xs font-bold mb-0.5",
                done ? "text-green-400" : active ? "text-primary font-mono tracking-wider" : failed ? "text-destructive" : "text-muted-foreground"
            )}>
                {label}
            </div>
            <div className="text-[10px] text-muted-foreground leading-relaxed font-medium">{detail}</div>
            {active && progress !== undefined && (
                <div className="mt-2 w-full max-w-[200px] h-1 bg-secondary rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-primary transition-all duration-500" 
                        style={{ width: `${progress}%` }} 
                    />
                </div>
            )}
        </div>
    </div>
));
TimelineStep.displayName = "TimelineStep";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IncidentHub() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const [isClosing, setIsClosing] = useState(false);
    const [isPushingTs, setIsPushingTs] = useState(false);
    const [tsError, setTsError] = useState<string | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);
    const [retryResult, setRetryResult] = useState<string | null>(null);
    const [retryError, setRetryError] = useState<string | null>(null);
    const [isDownloadingNavigator, setIsDownloadingNavigator] = useState(false);
    const [navigatorError, setNavigatorError] = useState<string | null>(null);
    const [isStartingProc, setIsStartingProc] = useState(false);
    const [procStartError, setProcStartError] = useState<string | null>(null);
    const userRole = getStoredRole();

    // ── Data fetching ─────────────────────────────────────────────────────────
    const { data: incident, isLoading: incLoading, error: incError } = useQuery<IncidentOut | null>({
        queryKey: ["incident", incidentId],
        queryFn: () => apiGetOrNull<IncidentOut>(`/incidents/${incidentId}`),
        enabled: !!incidentId,
        staleTime: 60_000, // Metadata rarely changes
    });

    const { data: procJob, refetch: refetchProc } = useQuery<ProcessingJobOut | null>({
        queryKey: ["processing-status", incidentId],
        queryFn: () => apiGetOrNull<ProcessingJobOut>(`/processing/incident/${incidentId}/status`),
        enabled: !!incidentId,
        staleTime: 5000,
    });

    const { data: superTimeline, refetch: refetchST } = useQuery<SuperTimelineOut | null>({
        queryKey: ["super-timeline-status", incidentId],
        queryFn: () => apiGetOrNull<SuperTimelineOut>(`/processing/incident/${incidentId}/super-timeline/status`),
        enabled: !!incidentId,
        staleTime: 10000,
    });

    const pollingEnabled = useMemo(() => {
        const pStatus = procJob?.status;
        const sStatus = superTimeline?.status;
        return pStatus === "RUNNING" || pStatus === "PENDING" || sStatus === "BUILDING" || sStatus === "PENDING";
    }, [procJob?.status, superTimeline?.status]);

    useAdaptivePolling({
        enabled: pollingEnabled,
        onPoll: async () => {
            await Promise.all([refetchProc(), refetchST()]);
            return "polled";
        },
        initialInterval: 5000,
        maxInterval: 30000,
    });

    const { data: lmDetections = [] } = useQuery<LateralMovementOut[]>({
        queryKey: ["lateral-movements", incidentId],
        queryFn: () => apiGet<LateralMovementOut[]>(`/processing/incident/${incidentId}/super-timeline/lateral-movement`),
        enabled: superTimeline?.status === "DONE",
        staleTime: 60_000,
    });

    const { data: evidenceFolders = [] } = useQuery<EvidenceFolderOut[]>({
        queryKey: ["evidence-folders", incidentId],
        queryFn: () => apiGet<EvidenceFolderOut[]>(`/evidence/folders?incident_id=${encodeURIComponent(incidentId!)}`),
        enabled: !!incidentId,
        staleTime: 60_000,
    });

    const { data: sigmaHits } = useQuery<SigmaHitListOut | null>({
        queryKey: ["sigma-hits-count", incidentId],
        queryFn: () => apiGetOrNull<SigmaHitListOut>(`/processing/incident/${incidentId}/sigma-hits?limit=1`),
        enabled: procJob?.status === "DONE",
        staleTime: 60_000,
    });

    const { data: legalHolds = [] } = useQuery<LegalHoldOut[]>({
        queryKey: ["legal-holds-hub", incidentId],
        queryFn: () => apiGet<LegalHoldOut[]>(`/platform/incidents/${incidentId}/legal-holds`),
        enabled: !!incidentId,
        staleTime: 60_000,
    });

    // ── Derived state ─────────────────────────────────────────────────────────
    const evidenceFolder = useMemo(() => evidenceFolders?.find((f) => f.incident_id === incidentId), [evidenceFolders, incidentId]);
    const hasActiveLegalHold = legalHolds.some((h) => h.status === "ACTIVE");

    const collectionDone = incident?.status === "COLLECTION_COMPLETE" || incident?.status === "CLOSED";
    const procDone   = procJob?.status === "DONE";
    const procFailed = procJob?.status === "FAILED";
    const procActive = procJob?.status === "RUNNING" || procJob?.status === "PENDING";
    const stDone    = superTimeline?.status === "DONE";
    const stFailed  = superTimeline?.status === "FAILED";
    const stActive  = superTimeline?.status === "BUILDING" || superTimeline?.status === "PENDING";
    const lmCount   = lmDetections.length;
    const criticalSigmaCount = sigmaHits?.severity_counts?.["critical"] ?? 0;
    const sigmaTotal = sigmaHits?.total ?? 0;

    const handleCloseIncident = async () => {
        if (!incidentId) return;
        setIsClosing(true);
        try {
            await apiPatch(`/incidents/${incidentId}`, { status: "CLOSED" });
            await queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
        } finally {
            setIsClosing(false);
        }
    };

    const handleRetryJobs = async () => {
        if (!incidentId) return;
        setIsRetrying(true); setRetryResult(null); setRetryError(null);
        try {
            const result = await apiPost<{ reset: number }>(`/incidents/${incidentId}/collect/retry`, {});
            setRetryResult(`${result.reset} job${result.reset !== 1 ? "s" : ""} reset to pending`);
            await queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
        } catch (err) { setRetryError(err instanceof Error ? err.message : "Retry failed"); }
        finally { setIsRetrying(false); }
    };

    const handleStartProcessing = async () => {
        if (!incidentId) return;
        setIsStartingProc(true);
        setProcStartError(null);
        try {
            await apiPost(`/processing/incident/${incidentId}/trigger`, {});
            await queryClient.invalidateQueries({ queryKey: ["processing-status", incidentId] });
            await refetchProc();
        } catch (err) {
            setProcStartError(err instanceof Error ? err.message : "Failed to start processing");
        } finally {
            setIsStartingProc(false);
        }
    };

    if (incLoading) return <AppLayout title="INCIDENT HUB" subtitle="LOADING..."><div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
    if (incError || !incident) return <AppLayout title="INCIDENT HUB" subtitle="ERROR"><div className="p-6"><TacticalPanel title="INCIDENT NOT FOUND" status="offline"><div className="font-mono text-sm text-destructive py-4">{incError instanceof Error ? incError.message : `Incident ${incidentId} not found.`}</div><Button variant="outline" onClick={() => navigate("/dashboard")}><ChevronLeft className="w-4 h-4 mr-2" /> BACK TO DASHBOARD</Button></TacticalPanel></div></AppLayout>;

    return (
        <AppLayout
            title={incident.id}
            subtitle={`${fmtStatus(incident.type).toUpperCase()} INCIDENT`}
            headerActions={
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="text-[10px] h-8"><ChevronLeft className="w-3.5 h-3.5 mr-1" />DASHBOARD</Button>
                    <div className="h-4 w-px bg-border/40 mx-2" />
                    {hasActiveLegalHold && (
                        <span className="px-2 py-1 rounded-sm border border-yellow-500/40 bg-yellow-500/10 font-mono text-[9px] font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1">
                            <Lock className="w-3 h-3" />LEGAL HOLD ACTIVE
                        </span>
                    )}
                    {incident?.status !== "CLOSED" && (
                        <>
                            {(userRole === "admin" || userRole === "operator") && (
                                <Button variant="outline" size="sm" onClick={() => void handleRetryJobs()} disabled={isRetrying} className="h-8 text-[10px] gap-2 border-orange-500/40 text-orange-400 hover:bg-orange-500/10">
                                    {isRetrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}RETRY JOBS
                                </Button>
                            )}
                            {(userRole === "admin" || userRole === "operator") && (
                                <Button variant="outline" size="sm" onClick={() => void handleCloseIncident()} disabled={isClosing || hasActiveLegalHold} title={hasActiveLegalHold ? "Cannot close: active legal hold" : undefined} className="h-8 text-[10px] gap-2 border-destructive/40 text-destructive hover:bg-destructive/10">
                                    {isClosing ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}CLOSE
                                </Button>
                            )}
                        </>
                    )}
                </div>
            }
        >
            <div className="flex flex-col h-full">
                {/* ── Sub-Navigation Bar ── */}
                <div className="bg-card/50 border-b border-border/40 px-6 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
                    {[
                        { label: "OVERVIEW", path: "", icon: Activity, active: true },
                        { label: "TIMELINE", path: "/super-timeline", icon: Layers, enabled: stDone },
                        { label: "SIGMA", path: "/sigma-hits", icon: Search, enabled: procDone },
                        { label: "VAULT", path: `/evidence/${incidentId}`, icon: FolderOpen, enabled: collectionDone, absolute: true },
                        { label: "OPERATIONS", path: "/setup", icon: Users },
                    ].map((item) => (
                        <Button
                            key={item.label}
                            variant="ghost"
                            size="sm"
                            disabled={item.enabled === false}
                            onClick={() => item.absolute ? navigate(item.path) : navigate(`/incidents/${incidentId}${item.path}`)}
                            className={cn(
                                "h-7 px-3 text-[9px] font-bold tracking-widest gap-2 rounded-none border-b-2 transition-all",
                                item.active ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <item.icon className="w-3 h-3" />
                            {item.label}
                        </Button>
                    ))}
                </div>

                <div className="p-6 space-y-6 overflow-auto">
                    {/* ── Incident Header Card ─────────────────────────────────── */}
                    <TacticalPanel title="INCIDENT STATUS HUD" status={incident.status === "COLLECTION_IN_PROGRESS" ? "active" : incident.status === "COLLECTION_COMPLETE" ? "verified" : incident.status === "COLLECTION_FAILED" ? "offline" : "online"}>
                        <div className="flex items-start justify-between gap-8 flex-wrap">
                            <div className="space-y-4 flex-1 min-w-0">
                                <div className="flex items-center gap-3">
                                    <span className={cn("px-2 py-0.5 rounded-sm border font-mono text-[10px] font-bold", incidentStatusChip(incident.status))}>{fmtStatus(incident.status)}</span>
                                    <span className="px-2 py-0.5 rounded-sm border border-primary/20 bg-primary/5 font-mono text-[10px] text-primary/80 font-bold uppercase tracking-tight">{incident.type.replace(/_/g, " ")}</span>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div><div className="text-[9px] text-muted-foreground uppercase mb-1">Operator</div><div className="font-mono text-xs text-foreground font-bold">{incident.operator}</div></div>
                                    <div><div className="text-[9px] text-muted-foreground uppercase mb-1">Created</div><div className="font-mono text-xs text-foreground">{fmtTs(incident.created_at)}</div></div>
                                    <div><div className="text-[9px] text-muted-foreground uppercase mb-1">Endpoints</div><div className="font-mono text-xs text-foreground flex items-center gap-1.5"><Server className="w-3 h-3 text-primary/60" /> {incident.target_endpoints.length} Targets</div></div>
                                    <div><div className="text-[9px] text-muted-foreground uppercase mb-1">Template</div><div className="font-mono text-xs text-foreground">{incident.template_id ?? "NONE"}</div></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap shrink-0">
                                {evidenceFolder && (
                                    <div className="bg-secondary/30 border border-border/40 p-3 min-w-[100px] text-center rounded-sm">
                                        <div className="text-xl font-mono font-bold text-foreground leading-none">{evidenceFolder.files_count}</div>
                                        <div className="text-[9px] text-muted-foreground uppercase mt-1">Files</div>
                                    </div>
                                )}
                                {stDone && (
                                    <div className="bg-primary/5 border border-primary/20 p-3 min-w-[100px] text-center rounded-sm">
                                        <div className="text-xl font-mono font-bold text-primary leading-none">{superTimeline?.event_count?.toLocaleString() ?? "—"}</div>
                                        <div className="text-[9px] text-primary/60 uppercase mt-1">Events</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TacticalPanel>

                    <div className="grid grid-cols-12 gap-6">
                        {/* Analysis Hub - Bento Grid */}
                        <div className="col-span-12 lg:col-span-9 space-y-6">
                            {collectionDone && !procJob && !procActive && (
                                <div className="border border-primary/40 bg-primary/5 rounded-sm p-4 flex items-center justify-between gap-4">
                                    <div>
                                        <div className="text-xs font-bold text-primary uppercase tracking-wider">COLLECTION COMPLETE — READY TO PROCESS</div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5">Start artifact parsing to enable Sigma detections, YARA, IOCs, and timeline analysis.</div>
                                        {procStartError && <div className="text-[10px] text-destructive mt-1">{procStartError}</div>}
                                    </div>
                                    <Button variant="tactical" size="sm" onClick={() => void handleStartProcessing()} disabled={isStartingProc} className="shrink-0">
                                        {isStartingProc ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Activity className="w-3 h-3 mr-1" />}
                                        START PROCESSING
                                    </Button>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <ActionCard
                                    icon={<Layers className="w-6 h-6" />} title="Super Timeline" highlight={stDone}
                                    status={stDone ? "ready" : stFailed ? "warning" : stActive ? "pending" : "unavailable"}
                                    description={stDone ? `Unified timeline for ${superTimeline?.host_count} hosts.` : "Aggregate all artifacts into a master timeline."}
                                    badge={stDone ? <span className="text-[9px] font-bold text-green-400">ANALYSIS READY</span> : undefined}
                                    onClick={() => navigate(`/incidents/${incidentId}/super-timeline`)} disabled={!collectionDone}
                                    preview={stDone && lmCount > 0 ? (
                                        <div className="flex items-center gap-2 text-red-400 animate-pulse">
                                            <AlertTriangle className="w-3 h-3" />
                                            <span className="text-[9px] font-bold uppercase">{lmCount} Lateral Movements Found</span>
                                        </div>
                                    ) : null}
                                />
                                <ActionCard
                                    icon={<Search className="w-6 h-6" />} title="Sigma Detections"
                                    status={procDone && sigmaTotal > 0 ? (criticalSigmaCount > 0 ? "warning" : "ready") : "unavailable"}
                                    description="Automated threat hunting via Sigma rules."
                                    badge={procDone && sigmaTotal > 0 ? <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold">{sigmaTotal} HITS</span> : undefined}
                                    onClick={() => navigate(`/incidents/${incidentId}/sigma-hits`)} disabled={!procDone}
                                    preview={criticalSigmaCount > 0 ? (
                                        <div className="px-2 py-1 bg-red-500/10 border border-red-500/20 rounded-[2px] flex items-center justify-between">
                                            <span className="text-[9px] text-red-400 font-bold uppercase">Critical Threats</span>
                                            <span className="text-[10px] font-mono font-bold text-red-400">{criticalSigmaCount}</span>
                                        </div>
                                    ) : null}
                                />
                                <ActionCard
                                    icon={<Activity className="w-6 h-6" />} title="Processing"
                                    status={procDone ? "ready" : procFailed ? "warning" : procActive ? "pending" : "unavailable"}
                                    description="Artifact parsing and enrichment pipeline."
                                    onClick={() => navigate(`/incidents/${incidentId}/processing`)} disabled={!collectionDone}
                                    preview={procActive ? (
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between text-[9px] font-mono">
                                                <span className="text-primary animate-pulse uppercase">{procJob?.phase}</span>
                                                <span className="text-muted-foreground uppercase">RUNNING</span>
                                            </div>
                                            <div className="h-1 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary animate-progress-indeterminate" /></div>
                                        </div>
                                    ) : null}
                                />
                            </div>

                            <section className="space-y-4 pt-2">
                                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                        <ShieldAlert className="w-3.5 h-3.5" /> Extended Investigation
                                    </h3>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <ActionCard
                                        icon={<ShieldAlert className="w-4 h-4" />} title="IOCs" status={procDone ? "ready" : "unavailable"}
                                        description="Network & Hash IOCs" onClick={() => navigate(`/incidents/${incidentId}/ioc-matches`)} disabled={!procDone}
                                    />
                                    <ActionCard
                                        icon={<Bug className="w-4 h-4" />} title="YARA" status={procDone ? "ready" : "unavailable"}
                                        description="Malware Signatures" onClick={() => navigate(`/incidents/${incidentId}/yara-matches`)} disabled={!procDone}
                                    />
                                    <ActionCard
                                        icon={<Brain className="w-4 h-4" />} title="AI Audit" status={procDone ? "ready" : "unavailable"}
                                        description="LLM Reasoning" onClick={() => navigate(`/incidents/${incidentId}/ai-analysis`)} disabled={!procDone}
                                    />
                                    <ActionCard
                                        icon={<GitBranch className="w-4 h-4" />} title="Chains" status={procDone ? "ready" : "unavailable"}
                                        description="Attack Chains" onClick={() => navigate(`/incidents/${incidentId}/attack-chains`)} disabled={!procDone}
                                    />
                                </div>
                            </section>
                        </div>

                        {/* Operations & Evidence */}
                        <div className="col-span-12 lg:col-span-3 space-y-6">
                            <TacticalPanel title="EVIDENCE VAULT" status={collectionDone ? "online" : "warning"}>
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-2">
                                        <Button variant="secondary" size="sm" className="w-full justify-start text-[10px] font-bold gap-2 h-9" onClick={() => navigate(`/evidence/${incidentId}`)} disabled={!collectionDone}>
                                            <FolderOpen className="w-4 h-4 text-primary/60" /> EXPLORE FILES
                                        </Button>
                                        <Button variant="ghost" size="sm" className="w-full justify-start text-[10px] font-medium gap-2 h-8 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/chain-of-custody?incident_id=${encodeURIComponent(incidentId!)}`)} disabled={!collectionDone}>
                                            <FileText className="w-3.5 h-3.5" /> CHAIN OF CUSTODY
                                        </Button>
                                    </div>
                                    <div className="p-3 bg-secondary/20 border border-border/40 rounded-sm">
                                        <div className="text-[9px] text-muted-foreground uppercase mb-2">Executive Summary</div>
                                        <Button variant="outline" size="sm" className="w-full text-[10px] gap-2 h-8" onClick={() => navigate(`/incidents/${incidentId}/report`)} disabled={!procDone}>
                                            <Printer className="w-3.5 h-3.5" /> GENERATE REPORT
                                        </Button>
                                    </div>
                                </div>
                            </TacticalPanel>

                            <TacticalPanel title="OPERATIONS">
                                <div className="space-y-3">
                                    <button onClick={() => navigate(`/incidents/${incidentId}/setup`)} className="w-full flex items-center justify-between p-2 hover:bg-secondary/40 rounded-sm group transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-secondary/60 rounded-sm text-muted-foreground group-hover:text-primary"><Users className="w-4 h-4" /></div>
                                            <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground group-hover:text-foreground">Collection Setup</span>
                                        </div>
                                        <ChevronLeft className="w-3.5 h-3.5 rotate-180 text-muted-foreground/40" />
                                    </button>
                                    <button onClick={() => navigate(`/incidents/${incidentId}/legal-holds`)} className="w-full flex items-center justify-between p-2 hover:bg-secondary/40 rounded-sm group transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-secondary/60 rounded-sm text-muted-foreground group-hover:text-primary"><Lock className="w-4 h-4" /></div>
                                            <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground group-hover:text-foreground">Retention Policy</span>
                                        </div>
                                        <ChevronLeft className="w-3.5 h-3.5 rotate-180 text-muted-foreground/40" />
                                    </button>
                                </div>
                            </TacticalPanel>
                        </div>
                    </div>

                    {/* ── Analysis Progress Timeline ───────────────────────────── */}
                    <TacticalPanel title="LIFECYCLE PIPELINE PROGRESS">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 py-2 relative">
                            <TimelineStep
                                done={collectionDone}
                                active={incident.status === "COLLECTION_IN_PROGRESS"}
                                failed={incident.status === "COLLECTION_FAILED"}
                                progress={incident.collection_progress}
                                label="COLLECTION"
                                detail={collectionDone ? "Data acquisition complete." : "Gathering artifacts from targets."}
                            />
                            <TimelineStep
                                done={procDone}
                                active={procActive}
                                failed={procFailed}
                                label="PARSING"
                                detail={procDone ? "Artifacts enriched & indexed." : "Processing raw forensic data."}
                            />
                            <TimelineStep
                                done={stDone}
                                active={stActive}
                                failed={stFailed}
                                label="TIMELINE"
                                detail={stDone ? "Master timeline build ready." : "Merging host event data."}
                            />
                            <TimelineStep
                                done={stDone && lmCount >= 0}
                                active={false}
                                failed={false}
                                label="HUNTING"
                                detail={lmCount > 0 ? `${lmCount} Lateral movements detected.` : "Threat hunting rules applied."}
                            />
                        </div>
                    </TacticalPanel>
                </div>
            </div>
        </AppLayout>
    );
}
