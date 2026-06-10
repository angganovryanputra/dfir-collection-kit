/**
 * IncidentHub — central command page for a single incident.
 * Refactored into a Unified Cockpit for P1 Productivity Sprint.
 */
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, memo } from "react";
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
    AlertCircle,
    Server,
    Shield,
    Loader2,
    Users,
    FileText,
    XCircle,
    Lock,
    Brain,
    Printer,
    ExternalLink,
    Zap,
    LayoutGrid,
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useAdaptivePolling } from "@/lib/useAdaptivePolling";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { EvidenceIntegrityBadge } from "@/components/common/EvidenceIntegrityBadge";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtTs = (ts: string | null | undefined): string => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
};

async function apiGetOrNull<T>(path: string): Promise<T | null> {
    try {
        return await apiGet<T>(path);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("404") || msg.includes("not found")) return null;
        throw err;
    }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ActionCard = memo(({
    icon, title, description, badge, status = "ready", onClick, disabled = false, highlight = false, preview,
}: {
    icon: React.ReactNode; title: string; description: string; badge?: React.ReactNode;
    status?: "ready" | "pending" | "unavailable" | "warning"; onClick: () => void;
    disabled?: boolean; highlight?: boolean; preview?: React.ReactNode;
}) => {
    const borderColor = highlight 
        ? "border-primary/60 hover:border-primary shadow-[0_0_15px_rgba(21,245,116,0.05)]" 
        : status === "warning" ? "border-red-500/40 hover:border-red-500/60" 
        : status === "unavailable" ? "border-border/20 opacity-60" 
        : "border-border/60 hover:border-primary/50";
    
    const bgColor = highlight 
        ? "bg-primary/5 hover:bg-primary/10" 
        : status === "warning" ? "bg-red-500/5 hover:bg-red-500/8" 
        : status === "unavailable" ? "bg-secondary/5" 
        : "bg-secondary/20 hover:bg-secondary/40";

    return (
        <button
            onClick={onClick}
            disabled={disabled || status === "unavailable"}
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
                <div className="mt-2 pt-3 border-t border-border/20 w-full">
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

const DetectionHeatmap = memo(({ counts }: { counts: Record<string, number> }) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return null;

    const severities = ["critical", "high", "medium", "low", "informational"];
    
    return (
        <div className="flex items-center gap-1.5 w-full h-1.5 rounded-full overflow-hidden bg-secondary/40">
            {severities.map(s => {
                const count = counts[s] || 0;
                if (count === 0) return null;
                const width = `${(count / total) * 100}%`;
                const color = 
                    s === "critical" ? "bg-red-600" :
                    s === "high" ? "bg-orange-500" :
                    s === "medium" ? "bg-yellow-500" :
                    s === "low" ? "bg-green-500" : "bg-blue-500";
                return <div key={s} className={cn("h-full", color)} style={{ width }} title={`${s.toUpperCase()}: ${count}`} />;
            })}
        </div>
    );
});
DetectionHeatmap.displayName = "DetectionHeatmap";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IncidentHub() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const [isClosing, setIsClosing] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);
    const [isStartingProc, setIsStartingProc] = useState(false);
    const [procStartError, setProcStartError] = useState<string | null>(null);
    const userRole = getStoredRole();

    // ── Queries ───────────────────────────────────────────────────────────────
    const { data: incident, isLoading: incLoading, error: incError } = useQuery<IncidentOut | null>({
        queryKey: ["incident", incidentId],
        queryFn: () => apiGetOrNull<IncidentOut>(`/incidents/${incidentId}`),
        enabled: !!incidentId,
    });

    const { data: procJob, refetch: refetchProc } = useQuery<ProcessingJobOut | null>({
        queryKey: ["processing-status", incidentId],
        queryFn: () => apiGetOrNull<ProcessingJobOut>(`/processing/incident/${incidentId}/status`),
        enabled: !!incidentId,
    });

    const { data: superTimeline, refetch: refetchST } = useQuery<SuperTimelineOut | null>({
        queryKey: ["super-timeline-status", incidentId],
        queryFn: () => apiGetOrNull<SuperTimelineOut>(`/processing/incident/${incidentId}/super-timeline/status`),
        enabled: !!incidentId,
    });

    const pollingEnabled = useMemo(() => {
        return procJob?.status === "RUNNING" || superTimeline?.status === "BUILDING";
    }, [procJob?.status, superTimeline?.status]);

    useAdaptivePolling({
        enabled: pollingEnabled,
        onPoll: async () => {
            await Promise.all([refetchProc(), refetchST()]);
            return "polled";
        },
    });

    const { data: lmDetections = [] } = useQuery<LateralMovementOut[]>({
        queryKey: ["lateral-movements", incidentId],
        queryFn: () => apiGet<LateralMovementOut[]>(`/processing/incident/${incidentId}/super-timeline/lateral-movement`),
        enabled: superTimeline?.status === "DONE",
    });

    const { data: evidenceFolders = [] } = useQuery<EvidenceFolderOut[]>({
        queryKey: ["evidence-folders", incidentId],
        queryFn: () => apiGet<EvidenceFolderOut[]>(`/evidence/folders?incident_id=${encodeURIComponent(incidentId!)}`),
    });

    const { data: sigmaHits } = useQuery<SigmaHitListOut | null>({
        queryKey: ["sigma-hits-summary", incidentId],
        queryFn: () => apiGetOrNull<SigmaHitListOut>(`/processing/incident/${incidentId}/sigma-hits?limit=1`),
        enabled: procJob?.status === "DONE",
    });

    // ── Derived ───────────────────────────────────────────────────────────────
    const evidenceFolder = evidenceFolders?.find(f => f.incident_id === incidentId);
    const collectionDone = incident?.status === "COLLECTION_COMPLETE" || incident?.status === "CLOSED";
    const procDone = procJob?.status === "DONE";
    const stDone = superTimeline?.status === "DONE";
    const stActive = superTimeline?.status === "BUILDING" || superTimeline?.status === "PENDING";
    const procActive = procJob?.status === "RUNNING" || procJob?.status === "PENDING";

    const handleCloseIncident = async () => {
        if (!incidentId || isClosing) return;
        setIsClosing(true);
        try {
            await apiPatch(`/incidents/${incidentId}`, { status: "CLOSED" });
            queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
        } finally {
            setIsClosing(false);
        }
    };

    const handleStartProcessing = async () => {
        if (!incidentId || isStartingProc) return;
        setIsStartingProc(true);
        setProcStartError(null);
        try {
            await apiPost(`/processing/incident/${incidentId}/trigger`, {});
            refetchProc();
        } catch (err) {
            setProcStartError(err instanceof Error ? err.message : "Activation failed");
        } finally {
            setIsStartingProc(false);
        }
    };

    if (incLoading) return <AppLayout title="COCKPIT" subtitle="INITIALIZING..."><div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
    if (incError || !incident) return <AppLayout title="COCKPIT" subtitle="ERROR"><div className="p-6"><TacticalPanel title="MODULE LOAD FAILURE" status="offline"><div className="font-mono text-sm text-destructive py-4">Incident {incidentId} context could not be loaded.</div><Button variant="outline" onClick={() => navigate("/dashboard")}><ChevronLeft className="w-4 h-4 mr-2" /> RETURN TO BASE</Button></TacticalPanel></div></AppLayout>;

    return (
        <AppLayout
            title={incident.id}
            subtitle={`${incident.type.replace(/_/g, " ")} INCIDENT`}
            headerActions={
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="text-[10px] h-8 tracking-widest font-bold font-mono text-muted-foreground hover:text-foreground">
                        <ChevronLeft className="w-3.5 h-3.5 mr-1" /> BASE
                    </Button>
                    {incident.status !== "CLOSED" && (userRole === "admin" || userRole === "operator") && (
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleCloseIncident} 
                            disabled={isClosing}
                            className="h-8 text-[10px] gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 font-mono font-bold tracking-widest"
                        >
                            {isClosing ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} CLOSE CASE
                        </Button>
                    )}
                </div>
            }
        >
            <div className="flex flex-col h-full overflow-hidden">
                {/* ── Cockpit Sub-Nav ── */}
                <div className="bg-card/50 border-b border-border/40 px-6 py-2 flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-1 bg-secondary/40 p-0.5 rounded-sm">
                        <Button variant="ghost" size="sm" className="h-7 px-3 text-[9px] font-bold tracking-widest gap-2 bg-primary text-primary-foreground shadow-md rounded-sm"><Activity className="w-3 h-3" /> OVERVIEW</Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/incidents/${incidentId}/setup`)} className="h-7 px-3 text-[9px] font-bold tracking-widest gap-2 text-muted-foreground hover:text-foreground rounded-sm"><Users className="w-3 h-3" /> SETUP</Button>
                    </div>
                    <div className="h-4 w-px bg-border/40" />
                    <div className="flex items-center gap-4 font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
                        <span>OPERATOR: <span className="text-foreground font-bold">{incident.operator}</span></span>
                        <span>TARGETS: <span className="text-foreground font-bold">{incident.target_endpoints.length}</span></span>
                    </div>
                </div>

                <div className="p-6 space-y-6 overflow-auto custom-scrollbar">
                    {/* ── Status HUD ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        <TacticalPanel title="COLLECTION_STATE" className="lg:col-span-1">
                            <div className="flex flex-col gap-3">
                                <StatusBadge status={incident.status} />
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[9px] font-mono text-muted-foreground uppercase">
                                        <span>Progress</span>
                                        <span>{incident.collection_progress}%</span>
                                    </div>
                                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                                        <div className={cn("h-full bg-primary transition-all duration-500", incident.status === "COLLECTION_IN_PROGRESS" && "animate-pulse")} style={{ width: `${incident.collection_progress}%` }} />
                                    </div>
                                </div>
                            </div>
                        </TacticalPanel>

                        <TacticalPanel title="PARSING_ENGINE" className="lg:col-span-1">
                            <div className="flex flex-col gap-3">
                                <StatusBadge status={procJob?.status ?? "IDLE"} />
                                {procActive && (
                                    <div className="flex items-center gap-2 text-[10px] font-mono text-primary animate-pulse">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        PHASE: {procJob?.phase?.toUpperCase() ?? "INITIALIZING"}
                                    </div>
                                )}
                                {!procJob && collectionDone && (
                                    <Button variant="tactical" size="sm" className="h-7 text-[9px] w-full" onClick={handleStartProcessing} disabled={isStartingProc}>
                                        ACTIVATE ANALYTICS
                                    </Button>
                                )}
                            </div>
                        </TacticalPanel>

                        <TacticalPanel title="EVIDENCE_VAULT" className="lg:col-span-1">
                            <div className="flex flex-col gap-3">
                                <EvidenceIntegrityBadge status={evidenceFolder?.status ?? "PENDING"} />
                                <div className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="text-muted-foreground">OBJ_COUNT</span>
                                    <span className="text-foreground font-bold">{evidenceFolder?.files_count ?? 0}</span>
                                </div>
                                <div className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="text-muted-foreground">STORAGE</span>
                                    <span className="text-foreground font-bold">{evidenceFolder?.total_size ?? "—"}</span>
                                </div>
                            </div>
                        </TacticalPanel>

                        <TacticalPanel title="THREAT_INDEX" className="lg:col-span-1">
                            <div className="flex flex-col gap-3">
                                {sigmaHits ? (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xl font-mono font-bold text-foreground leading-none">{sigmaHits.total}</span>
                                            <span className="font-mono text-[9px] text-muted-foreground uppercase">Detections</span>
                                        </div>
                                        <DetectionHeatmap counts={sigmaHits.severity_counts} />
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-2 opacity-30 italic font-mono text-[10px]">
                                        NO ANALYTICS DATA
                                    </div>
                                )}
                            </div>
                        </TacticalPanel>
                    </div>

                    {/* ── Action Grid ── */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Primary Investigation Tools */}
                        <div className="md:col-span-2 space-y-6">
                            <div className="flex items-center gap-2 mb-2">
                                <LayoutGrid className="w-4 h-4 text-primary/60" />
                                <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Investigation Modules</h2>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <ActionCard
                                    icon={<Layers className="w-6 h-6" />} title="Super Timeline" highlight={stDone}
                                    status={stDone ? "ready" : stActive ? "pending" : "unavailable"}
                                    description="Unified artifact-driven timeline across all targets."
                                    badge={stDone ? <span className="text-[9px] font-bold text-green-400">READY</span> : undefined}
                                    onClick={() => navigate(`/incidents/${incidentId}/super-timeline`)}
                                    preview={stDone && lmDetections.length > 0 ? (
                                        <div className="flex items-center gap-2 text-red-400 font-mono text-[9px] animate-pulse">
                                            <AlertCircle className="w-3 h-3" /> {lmDetections.length} LATERAL MOVEMENTS
                                        </div>
                                    ) : null}
                                />
                                <ActionCard
                                    icon={<ShieldAlert className="w-6 h-6" />} title="Sigma Detections"
                                    status={procDone ? "ready" : "unavailable"}
                                    description="Rule-based threat hunting on Windows Event Logs."
                                    onClick={() => navigate(`/incidents/${incidentId}/sigma-hits`)}
                                    preview={sigmaHits && sigmaHits.total > 0 && (
                                        <div className="flex items-center gap-3">
                                            {Object.entries(sigmaHits.severity_counts).filter(([_, c]) => c > 0).slice(0, 3).map(([s, c]) => (
                                                <SeverityBadge key={s} severity={s} label={String(c)} iconOnly className="h-5 px-1.5" />
                                            ))}
                                        </div>
                                    )}
                                />
                                <ActionCard
                                    icon={<Activity className="w-6 h-6" />} title="Processing Logs"
                                    status={procActive ? "pending" : collectionDone ? "ready" : "unavailable"}
                                    description="Diagnostics for the artifact parsing pipeline."
                                    onClick={() => navigate(`/incidents/${incidentId}/processing`)}
                                />
                                <ActionCard
                                    icon={<FolderOpen className="w-6 h-6" />} title="File Explorer"
                                    status={collectionDone ? "ready" : "unavailable"}
                                    description="Browse raw artifacts and forensic evidence."
                                    onClick={() => navigate(`/evidence/${incidentId}`)}
                                />
                            </div>

                            {/* Extended Analysis */}
                            <div className="pt-4 border-t border-border/20">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <ActionCard
                                        icon={<Shield className="w-4 h-4" />} title="IOCs" status={procDone ? "ready" : "unavailable"}
                                        description="Network & Hash Hits" onClick={() => navigate(`/incidents/${incidentId}/ioc-matches`)}
                                    />
                                    <ActionCard
                                        icon={<Bug className="w-4 h-4" />} title="YARA" status={procDone ? "ready" : "unavailable"}
                                        description="Malware Scanning" onClick={() => navigate(`/incidents/${incidentId}/yara-matches`)}
                                    />
                                    <ActionCard
                                        icon={<Brain className="w-4 h-4" />} title="AI Insight" status={procDone ? "ready" : "unavailable"}
                                        description="LLM Reasoning" onClick={() => navigate(`/incidents/${incidentId}/ai-analysis`)}
                                    />
                                    <ActionCard
                                        icon={<GitBranch className="w-4 h-4" />} title="Att&ck" status={procDone ? "ready" : "unavailable"}
                                        description="Kill Chain View" onClick={() => navigate(`/incidents/${incidentId}/attack-chains`)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Operations & Reports */}
                        <div className="md:col-span-1 space-y-6">
                            <TacticalPanel title="COCKPIT_OPERATIONS">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Button variant="secondary" size="sm" className="w-full justify-start text-[10px] font-bold gap-2 h-9 tracking-widest" onClick={() => navigate(`/incidents/${incidentId}/setup`)}>
                                            <Users className="w-4 h-4 text-primary" /> RECONFIGURE COLLECTION
                                        </Button>
                                        <Button variant="ghost" size="sm" className="w-full justify-start text-[10px] font-bold gap-2 h-9 text-muted-foreground tracking-widest" onClick={() => navigate(`/chain-of-custody?incident_id=${incidentId}`)}>
                                            <FileText className="w-4 h-4" /> CHAIN OF CUSTODY
                                        </Button>
                                    </div>
                                    
                                    <div className="pt-4 border-t border-border/20">
                                        <div className="text-[9px] font-mono text-muted-foreground uppercase mb-3">Case Reporting</div>
                                        <Button variant="outline" size="sm" className="w-full text-[10px] font-bold gap-2 h-9 tracking-widest border-primary/40 text-primary hover:bg-primary/5" onClick={() => navigate(`/incidents/${incidentId}/report`)} disabled={!procDone}>
                                            <Printer className="w-3.5 h-3.5" /> GENERATE FINAL REPORT
                                        </Button>
                                    </div>
                                </div>
                            </TacticalPanel>

                            <TacticalPanel title="CASE_TIMELINE">
                                <div className="space-y-3 font-mono text-[9px]">
                                    <div className="flex gap-3">
                                        <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                                        <div>
                                            <div className="text-muted-foreground">CREATED</div>
                                            <div className="text-foreground">{fmtTs(incident.created_at)}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1", collectionDone ? "bg-primary" : "bg-secondary")} />
                                        <div>
                                            <div className="text-muted-foreground uppercase">Collection Complete</div>
                                            <div className="text-foreground">{incident.status === "COLLECTION_COMPLETE" ? fmtTs(incident.updated_at) : "PENDING"}</div>
                                        </div>
                                    </div>
                                    {procJob?.completed_at && (
                                        <div className="flex gap-3">
                                            <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                                            <div>
                                                <div className="text-muted-foreground uppercase">Analysis Ready</div>
                                                <div className="text-foreground">{fmtTs(procJob.completed_at)}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </TacticalPanel>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
