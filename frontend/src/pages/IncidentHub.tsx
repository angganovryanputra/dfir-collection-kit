/**
 * IncidentHub — central command page for a single incident.
 *
 * Shows: incident metadata, collection status, processing pipeline state,
 * super timeline stats, and a quick-action grid to every analysis view.
 */
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
    Server,
    Network,
    Loader2,
    ArrowRight,
    Users,
    FileText,
    XCircle,
    Upload,
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

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

function fmtTs(ts: string | null | undefined): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
}

function fmtStatus(s: string): string {
    return s.replace(/_/g, " ");
}

/** Returns Tailwind classes for an incident status chip. */
function incidentStatusChip(status: string): string {
    switch (status) {
        case "COLLECTION_IN_PROGRESS":
            return "border-primary/50 bg-primary/10 text-primary animate-pulse";
        case "COLLECTION_COMPLETE":
            return "border-green-500/40 bg-green-500/10 text-green-400";
        case "COLLECTION_FAILED":
            return "border-destructive/40 bg-destructive/10 text-destructive";
        case "CLOSED":
            return "border-border/40 bg-secondary/30 text-muted-foreground";
        case "ACTIVE":
            return "border-yellow-500/40 bg-yellow-500/10 text-yellow-400";
        default:
            return "border-border/40 bg-secondary/30 text-muted-foreground";
    }
}

/** Safe API fetch that returns null on 404 instead of throwing. */
async function apiGetOrNull<T>(path: string): Promise<T | null> {
    try {
        return await apiGet<T>(path);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("404") || msg.includes("not found") || msg.includes("Not Found")) {
            return null;
        }
        throw err;
    }
}

// ─── Lateral Movement Graph ───────────────────────────────────────────────────

const LM_TYPE_COLOR: Record<string, { stroke: string; label: string }> = {
    account_pivot:    { stroke: "#ef4444", label: "Account Pivot" },
    process_spread:   { stroke: "#f97316", label: "Process Spread" },
    credential_reuse: { stroke: "#eab308", label: "Credential Reuse" },
};

function LateralMovementGraph({ detections }: { detections: LateralMovementOut[] }) {
    if (!detections.length) return null;

    // Collect unique hosts and assign positions
    const hosts = Array.from(new Set(
        detections.flatMap((d) => [d.source_host, d.target_host])
    ));
    const W = 520, H = 180, PAD = 60, R = 20;
    const count = hosts.length;
    // Spread hosts evenly across the width
    const positions: Record<string, { x: number; y: number }> = {};
    hosts.forEach((h, i) => {
        positions[h] = {
            x: count === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / Math.max(1, count - 1),
            y: H / 2,
        };
    });

    // Offset source/target nodes slightly to avoid overlap on same-row layout
    const sources = new Set(detections.map((d) => d.source_host));
    const targets = new Set(detections.map((d) => d.target_host));
    hosts.forEach((h) => {
        if (sources.has(h) && !targets.has(h)) positions[h].y = H * 0.38;
        if (targets.has(h) && !sources.has(h)) positions[h].y = H * 0.62;
    });

    return (
        <div className="border border-red-500/20 bg-red-500/3 rounded-sm p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-red-400/70 uppercase tracking-wider">LATERAL MOVEMENT GRAPH</span>
                <div className="flex items-center gap-3">
                    {Object.entries(LM_TYPE_COLOR).map(([k, v]) => (
                        <span key={k} className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                            <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: v.stroke }} />
                            {v.label}
                        </span>
                    ))}
                </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
                <defs>
                    {Object.entries(LM_TYPE_COLOR).map(([k, v]) => (
                        <marker key={k} id={`arrow-${k}`} markerWidth="8" markerHeight="8"
                            refX="7" refY="3" orient="auto">
                            <path d="M0,0 L0,6 L8,3 z" fill={v.stroke} opacity="0.8" />
                        </marker>
                    ))}
                </defs>

                {/* Edges */}
                {detections.map((d, i) => {
                    const s = positions[d.source_host];
                    const t = positions[d.target_host];
                    if (!s || !t) return null;
                    const color = LM_TYPE_COLOR[d.detection_type] ?? LM_TYPE_COLOR.account_pivot;
                    const dx = t.x - s.x, dy = t.y - s.y;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    const ux = dx / len, uy = dy / len;
                    const x1 = s.x + ux * (R + 2), y1 = s.y + uy * (R + 2);
                    const x2 = t.x - ux * (R + 8), y2 = t.y - uy * (R + 8);
                    // Slight curve offset for parallel edges
                    const cx = (x1 + x2) / 2 + uy * (i % 2 === 0 ? 20 : -20);
                    const cy = (y1 + y2) / 2 - ux * (i % 2 === 0 ? 20 : -20);
                    const conf = Math.round(d.confidence * 100);
                    return (
                        <g key={d.id}>
                            <path
                                d={`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`}
                                fill="none"
                                stroke={color.stroke}
                                strokeWidth={1 + d.confidence * 2}
                                strokeOpacity={0.6}
                                markerEnd={`url(#arrow-${d.detection_type})`}
                            />
                            <text
                                x={(x1 + cx + x2) / 3}
                                y={(y1 + cy + y2) / 3 - 4}
                                textAnchor="middle"
                                fontSize="9"
                                fill={color.stroke}
                                opacity="0.8"
                                fontFamily="monospace"
                            >
                                {d.actor ? `${d.actor} · ${conf}%` : `${conf}%`}
                            </text>
                        </g>
                    );
                })}

                {/* Nodes */}
                {hosts.map((h) => {
                    const p = positions[h];
                    const isSrc = sources.has(h);
                    const isTgt = targets.has(h);
                    const fill = isSrc && isTgt ? "#7c3aed" : isSrc ? "#f97316" : "#ef4444";
                    const label = h.length > 10 ? h.slice(0, 9) + "…" : h;
                    return (
                        <g key={h}>
                            <circle cx={p.x} cy={p.y} r={R} fill={fill} fillOpacity="0.15"
                                stroke={fill} strokeOpacity="0.6" strokeWidth="1.5" />
                            <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle"
                                fontSize="9" fill={fill} fontFamily="monospace" fontWeight="bold">
                                {label}
                            </text>
                            <text x={p.x} y={p.y + R + 12} textAnchor="middle"
                                fontSize="8" fill="#6b7280" fontFamily="monospace">
                                {isSrc && isTgt ? "SRC+TGT" : isSrc ? "SOURCE" : "TARGET"}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ─── Quick Action Card ────────────────────────────────────────────────────────

interface ActionCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    badge?: React.ReactNode;
    status?: "ready" | "pending" | "unavailable" | "warning";
    onClick: () => void;
    disabled?: boolean;
    highlight?: boolean;
}

function ActionCard({
    icon,
    title,
    description,
    badge,
    status = "ready",
    onClick,
    disabled = false,
    highlight = false,
}: ActionCardProps) {
    const borderColor =
        highlight
            ? "border-primary/60 hover:border-primary"
            : status === "warning"
            ? "border-red-500/40 hover:border-red-500/60"
            : status === "unavailable"
            ? "border-border/30"
            : "border-border/60 hover:border-primary/50";

    const bgColor =
        highlight
            ? "bg-primary/5 hover:bg-primary/10"
            : status === "warning"
            ? "bg-red-500/5 hover:bg-red-500/8"
            : status === "unavailable"
            ? "bg-secondary/10"
            : "bg-secondary/20 hover:bg-secondary/40";

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "flex flex-col gap-3 p-4 rounded-sm border text-left transition-all w-full group",
                borderColor,
                bgColor,
                disabled && "opacity-40 cursor-not-allowed hover:bg-secondary/10 hover:border-border/30"
            )}
        >
            <div className="flex items-start justify-between">
                <div className={cn(
                    "p-2 rounded-sm",
                    highlight ? "bg-primary/20 text-primary" :
                    status === "warning" ? "bg-red-500/15 text-red-400" :
                    status === "unavailable" ? "bg-secondary/40 text-muted-foreground" :
                    "bg-secondary/60 text-muted-foreground group-hover:text-foreground"
                )}>
                    {icon}
                </div>
                {badge}
            </div>
            <div>
                <div className={cn(
                    "font-mono text-sm font-bold mb-0.5",
                    highlight ? "text-primary" :
                    status === "warning" ? "text-red-400" :
                    status === "unavailable" ? "text-muted-foreground" : "text-foreground"
                )}>
                    {title}
                </div>
                <div className="font-mono text-xs text-muted-foreground leading-relaxed">
                    {description}
                </div>
            </div>
            {!disabled && (
                <div className={cn(
                    "flex items-center gap-1 font-mono text-xs opacity-0 group-hover:opacity-100 transition-opacity mt-auto",
                    highlight ? "text-primary" : "text-muted-foreground"
                )}>
                    OPEN <ArrowRight className="w-3 h-3" />
                </div>
            )}
        </button>
    );
}

// ─── Timeline step ────────────────────────────────────────────────────────────

function TimelineStep({
    done,
    active,
    failed,
    label,
    detail,
}: {
    done: boolean;
    active: boolean;
    failed: boolean;
    label: string;
    detail?: string;
}) {
    const icon = failed ? (
        <AlertTriangle className="w-4 h-4 text-destructive" />
    ) : done ? (
        <CheckCircle2 className="w-4 h-4 text-green-400" />
    ) : active ? (
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
    ) : (
        <div className="w-4 h-4 rounded-full border-2 border-border/40" />
    );

    return (
        <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">{icon}</div>
            <div className="flex-1 min-w-0">
                <div className={cn(
                    "font-mono text-xs font-bold",
                    failed ? "text-destructive" :
                    done ? "text-foreground" :
                    active ? "text-primary" :
                    "text-muted-foreground"
                )}>
                    {label}
                </div>
                {detail && (
                    <div className="font-mono text-xs text-muted-foreground mt-0.5">{detail}</div>
                )}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IncidentHub() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const [isClosing, setIsClosing] = useState(false);
    const [isPushingTs, setIsPushingTs] = useState(false);
    const [tsError, setTsError] = useState<string | null>(null);
    const userRole = getStoredRole();

    // ── Data fetching ─────────────────────────────────────────────────────────
    const { data: incident, isLoading: incLoading, error: incError } = useQuery<IncidentOut | null>({
        queryKey: ["incident", incidentId],
        queryFn: () => apiGetOrNull<IncidentOut>(`/incidents/${incidentId}`),
        enabled: !!incidentId,
    });

    const { data: procJob } = useQuery<ProcessingJobOut | null>({
        queryKey: ["processing-status", incidentId],
        queryFn: () => apiGetOrNull<ProcessingJobOut>(`/processing/incident/${incidentId}/status`),
        enabled: !!incidentId,
        refetchInterval: (q) => {
            const status = q.state.data?.status;
            return status === "RUNNING" || status === "PENDING" ? 5000 : false;
        },
    });

    const { data: superTimeline } = useQuery<SuperTimelineOut | null>({
        queryKey: ["super-timeline-status", incidentId],
        queryFn: () => apiGetOrNull<SuperTimelineOut>(`/processing/incident/${incidentId}/super-timeline/status`),
        enabled: !!incidentId,
        refetchInterval: (q) => {
            const status = q.state.data?.status;
            return status === "BUILDING" || status === "PENDING" ? 4000 : false;
        },
    });

    const { data: lmDetections } = useQuery<LateralMovementOut[]>({
        queryKey: ["lateral-movements", incidentId],
        queryFn: () => apiGet<LateralMovementOut[]>(`/processing/incident/${incidentId}/super-timeline/lateral-movement`),
        enabled: superTimeline?.status === "DONE",
    });

    const { data: evidenceFolders } = useQuery<EvidenceFolderOut[]>({
        queryKey: ["evidence-folders-all"],
        queryFn: () => apiGet<EvidenceFolderOut[]>("/evidence/folders"),
        enabled: !!incidentId,
    });

    const { data: sigmaHits } = useQuery<SigmaHitListOut | null>({
        queryKey: ["sigma-hits-count", incidentId],
        queryFn: () => apiGetOrNull<SigmaHitListOut>(`/processing/incident/${incidentId}/sigma-hits?limit=1`),
        enabled: procJob?.status === "DONE",
    });

    // ── Derived state ─────────────────────────────────────────────────────────
    const evidenceFolder = evidenceFolders?.find((f) => f.incident_id === incidentId);

    const collectionDone =
        incident?.status === "COLLECTION_COMPLETE" ||
        incident?.status === "CLOSED";

    const procDone   = procJob?.status === "DONE";
    const procFailed = procJob?.status === "FAILED";
    const procActive = procJob?.status === "RUNNING" || procJob?.status === "PENDING";

    const stDone    = superTimeline?.status === "DONE";
    const stFailed  = superTimeline?.status === "FAILED";
    const stActive  = superTimeline?.status === "BUILDING" || superTimeline?.status === "PENDING";
    const lmCount   = lmDetections?.length ?? 0;

    const criticalSigmaCount = sigmaHits?.severity_counts?.["critical"] ?? 0;
    const highSigmaCount     = sigmaHits?.severity_counts?.["high"] ?? 0;
    const sigmaTotal         = sigmaHits?.total ?? 0;

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

    const handlePushTimesketch = async () => {
        if (!procJob?.job_id) return;
        setIsPushingTs(true);
        setTsError(null);
        try {
            await apiPost(`/processing/${procJob.job_id}/timeline/push-timesketch`, {});
        } catch (err) {
            setTsError(err instanceof Error ? err.message : "Push failed");
        } finally {
            setIsPushingTs(false);
        }
    };

    if (incLoading) {
        return (
            <AppLayout title="INCIDENT HUB" subtitle="LOADING...">
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            </AppLayout>
        );
    }

    if (incError || !incident) {
        return (
            <AppLayout title="INCIDENT HUB" subtitle="ERROR">
                <div className="p-6">
                    <TacticalPanel title="INCIDENT NOT FOUND" status="offline">
                        <div className="font-mono text-sm text-destructive py-4">
                            {incError instanceof Error ? incError.message : `Incident ${incidentId} not found.`}
                        </div>
                        <Button variant="outline" onClick={() => navigate("/dashboard")}>
                            <ChevronLeft className="w-4 h-4 mr-2" /> BACK TO DASHBOARD
                        </Button>
                    </TacticalPanel>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout
            title={incident.id}
            subtitle={`${fmtStatus(incident.type).toUpperCase()} INCIDENT`}
            headerActions={
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        DASHBOARD
                    </Button>
                    {/* Close Incident */}
                    {incident?.status !== "CLOSED" && (userRole === "admin" || userRole === "operator") && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleCloseIncident()}
                            disabled={isClosing}
                            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                        >
                            {isClosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                            CLOSE INCIDENT
                        </Button>
                    )}
                    {/* Primary CTA: Super Timeline when ready */}
                    {stDone && (
                        <Button
                            variant="tactical"
                            size="sm"
                            onClick={() => navigate(`/incidents/${incidentId}/super-timeline`)}
                            className="gap-2"
                        >
                            <Layers className="w-4 h-4" />
                            OPEN SUPER TIMELINE
                        </Button>
                    )}
                </div>
            }
        >
            <div className="p-6 space-y-5">

                {/* ── Incident Header Card ─────────────────────────────────── */}
                <TacticalPanel
                    title="INCIDENT OVERVIEW"
                    status={
                        incident.status === "COLLECTION_IN_PROGRESS" ? "active" :
                        incident.status === "COLLECTION_COMPLETE"    ? "verified" :
                        incident.status === "COLLECTION_FAILED"      ? "offline" :
                        "online"
                    }
                >
                    <div className="flex items-start justify-between gap-6 flex-wrap">
                        <div className="space-y-3 flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className={cn(
                                    "px-2.5 py-1 rounded-sm border font-mono text-xs font-bold",
                                    incidentStatusChip(incident.status)
                                )}>
                                    {fmtStatus(incident.status)}
                                </span>
                                <span className="px-2.5 py-1 rounded-sm border border-primary/30 bg-primary/10 font-mono text-xs text-primary">
                                    {incident.type.replace(/_/g, " ").toUpperCase()}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs">
                                <div>
                                    <span className="text-muted-foreground">OPERATOR: </span>
                                    <span className="text-foreground">{incident.operator}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">CREATED: </span>
                                    <span className="text-foreground">{fmtTs(incident.created_at)}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">LAST UPDATED: </span>
                                    <span className="text-foreground">{fmtTs(incident.updated_at)}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">TEMPLATE: </span>
                                    <span className="text-foreground">{incident.template_id ?? "—"}</span>
                                </div>
                            </div>

                            {incident.target_endpoints.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                                        <Server className="w-3 h-3" />
                                        TARGETS:
                                    </span>
                                    {incident.target_endpoints.map((ep) => (
                                        <span
                                            key={ep}
                                            className="px-2 py-0.5 border border-border/50 bg-secondary/40 rounded-sm font-mono text-xs"
                                        >
                                            {ep}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Summary stats */}
                        <div className="flex items-center gap-3 flex-wrap shrink-0">
                            {evidenceFolder && (
                                <div className="flex flex-col items-center gap-1 px-4 py-2 border border-border/50 bg-secondary/30 rounded-sm">
                                    <span className="font-mono text-lg font-bold text-foreground">
                                        {evidenceFolder.files_count.toLocaleString()}
                                    </span>
                                    <span className="font-mono text-[10px] text-muted-foreground uppercase">
                                        Evidence Files
                                    </span>
                                </div>
                            )}
                            {stDone && (
                                <div className="flex flex-col items-center gap-1 px-4 py-2 border border-border/50 bg-secondary/30 rounded-sm">
                                    <span className="font-mono text-lg font-bold text-foreground">
                                        {superTimeline?.event_count?.toLocaleString() ?? "—"}
                                    </span>
                                    <span className="font-mono text-[10px] text-muted-foreground uppercase">
                                        Timeline Events
                                    </span>
                                </div>
                            )}
                            {stDone && lmCount > 0 && (
                                <div className="flex flex-col items-center gap-1 px-4 py-2 border border-red-500/40 bg-red-500/10 rounded-sm">
                                    <span className="font-mono text-lg font-bold text-red-400">
                                        {lmCount}
                                    </span>
                                    <span className="font-mono text-[10px] text-red-400/70 uppercase">
                                        Lateral Movements
                                    </span>
                                </div>
                            )}
                            {procDone && sigmaTotal > 0 && (
                                <div className={cn(
                                    "flex flex-col items-center gap-1 px-4 py-2 border rounded-sm",
                                    criticalSigmaCount > 0
                                        ? "border-red-500/40 bg-red-500/10"
                                        : "border-orange-500/30 bg-orange-500/5"
                                )}>
                                    <span className={cn(
                                        "font-mono text-lg font-bold",
                                        criticalSigmaCount > 0 ? "text-red-400" : "text-orange-400"
                                    )}>
                                        {sigmaTotal}
                                    </span>
                                    <span className={cn(
                                        "font-mono text-[10px] uppercase",
                                        criticalSigmaCount > 0 ? "text-red-400/70" : "text-orange-400/70"
                                    )}>
                                        Sigma Hits
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </TacticalPanel>

                {/* ── Lateral movement alert banner (if detections exist) ───── */}
                {stDone && lmCount > 0 && (
                    <div
                        className="flex items-center gap-3 p-3 border border-red-500/40 bg-red-500/5 rounded-sm cursor-pointer hover:bg-red-500/10 transition-colors"
                        onClick={() => navigate(`/incidents/${incidentId}/super-timeline`)}
                    >
                        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="font-mono text-xs font-bold text-red-400">
                                {lmCount} LATERAL MOVEMENT DETECTION{lmCount > 1 ? "S" : ""} — IMMEDIATE ATTENTION REQUIRED
                            </div>
                            <div className="font-mono text-xs text-muted-foreground mt-0.5">
                                {lmDetections?.map((d) => `${d.source_host} → ${d.target_host}`).join("   •   ")}
                            </div>
                        </div>
                        <div className="font-mono text-xs text-red-400 flex items-center gap-1 shrink-0">
                            VIEW <ArrowRight className="w-3 h-3" />
                        </div>
                    </div>
                )}

                {/* ── LM Network Graph ─────────────────────────────────────── */}
                {stDone && lmDetections && lmDetections.length > 0 && (
                    <LateralMovementGraph detections={lmDetections} />
                )}

                {/* ── Quick Action Grid ────────────────────────────────────── */}
                <TacticalPanel title="ANALYSIS ACTIONS">
                    <div className="grid grid-cols-3 gap-3">

                        {/* Super Timeline — primary action */}
                        <ActionCard
                            icon={<Layers className="w-5 h-5" />}
                            title="SUPER TIMELINE"
                            highlight={stDone}
                            status={
                                stDone    ? "ready" :
                                stFailed  ? "warning" :
                                stActive  ? "pending" :
                                "unavailable"
                            }
                            description={
                                stDone
                                    ? `${superTimeline?.host_count ?? "?"} hosts · ${(superTimeline?.event_count ?? 0).toLocaleString()} events${lmCount > 0 ? ` · ${lmCount} lateral movements` : ""}`
                                    : stFailed
                                    ? `Build failed: ${superTimeline?.error_message ?? "unknown error"}`
                                    : stActive
                                    ? "Building cross-host merged timeline…"
                                    : collectionDone && procDone
                                    ? "Ready to build — trigger from this page or pipeline"
                                    : "Available after processing pipeline completes"
                            }
                            badge={
                                stDone && lmCount > 0 ? (
                                    <span className="px-2 py-0.5 border border-red-500/40 bg-red-500/15 text-red-400 font-mono text-[10px] rounded-sm font-bold">
                                        {lmCount} DETECTIONS
                                    </span>
                                ) : stDone ? (
                                    <span className="px-2 py-0.5 border border-green-500/30 bg-green-500/10 text-green-400 font-mono text-[10px] rounded-sm">
                                        READY
                                    </span>
                                ) : stActive ? (
                                    <span className="px-2 py-0.5 border border-primary/30 bg-primary/10 text-primary font-mono text-[10px] rounded-sm animate-pulse">
                                        BUILDING
                                    </span>
                                ) : undefined
                            }
                            onClick={() => navigate(`/incidents/${incidentId}/super-timeline`)}
                            disabled={!collectionDone}
                        />

                        {/* Processing Pipeline */}
                        <ActionCard
                            icon={<Activity className="w-5 h-5" />}
                            title="PROCESSING PIPELINE"
                            status={
                                procDone   ? "ready" :
                                procFailed ? "warning" :
                                procActive ? "pending" :
                                "unavailable"
                            }
                            description={
                                procDone
                                    ? `Pipeline complete · Phase: ${procJob?.phase ?? "timeline"}`
                                    : procFailed
                                    ? `Failed: ${procJob?.error_message ?? "unknown error"}`
                                    : procActive
                                    ? `Running: ${procJob?.phase ?? "initializing"}…`
                                    : "Trigger after collection completes"
                            }
                            badge={
                                procDone ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                                ) : procActive ? (
                                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                ) : procFailed ? (
                                    <AlertTriangle className="w-4 h-4 text-destructive" />
                                ) : undefined
                            }
                            onClick={() => navigate(`/incidents/${incidentId}/processing`)}
                            disabled={!collectionDone}
                        />

                        {/* Evidence Vault */}
                        <ActionCard
                            icon={<FolderOpen className="w-5 h-5" />}
                            title="EVIDENCE VAULT"
                            status={collectionDone ? "ready" : "unavailable"}
                            description={
                                evidenceFolder
                                    ? `${evidenceFolder.files_count} files · ${evidenceFolder.total_size} · ${evidenceFolder.status}`
                                    : collectionDone
                                    ? "Evidence collected and locked"
                                    : "Available after collection"
                            }
                            onClick={() => navigate(`/evidence/${incidentId}`)}
                            disabled={!collectionDone}
                        />

                        {/* Sigma Hits */}
                        <ActionCard
                            icon={<Search className="w-5 h-5" />}
                            title="SIGMA HITS"
                            status={
                                procDone && sigmaTotal > 0
                                    ? criticalSigmaCount > 0 ? "warning" : "ready"
                                    : "unavailable"
                            }
                            description={
                                procDone
                                    ? sigmaTotal > 0
                                        ? `${sigmaTotal} detections · ${criticalSigmaCount} critical · ${highSigmaCount} high`
                                        : "No Sigma detections found"
                                    : "Available after processing"
                            }
                            badge={
                                criticalSigmaCount > 0 ? (
                                    <span className="px-2 py-0.5 border border-red-500/40 bg-red-500/15 text-red-400 font-mono text-[10px] rounded-sm font-bold">
                                        {criticalSigmaCount} CRIT
                                    </span>
                                ) : undefined
                            }
                            onClick={() => navigate(`/incidents/${incidentId}/sigma-hits`)}
                            disabled={!procDone}
                        />

                        {/* IOC Matches */}
                        <ActionCard
                            icon={<ShieldAlert className="w-5 h-5" />}
                            title="IOC MATCHES"
                            status={procDone ? "ready" : "unavailable"}
                            description={
                                procDone
                                    ? "Cross-reference against known bad indicators"
                                    : "Available after processing"
                            }
                            onClick={() => navigate(`/incidents/${incidentId}/ioc-matches`)}
                            disabled={!procDone}
                        />

                        {/* YARA Matches */}
                        <ActionCard
                            icon={<Bug className="w-5 h-5" />}
                            title="YARA MATCHES"
                            status={procDone ? "ready" : "unavailable"}
                            description={
                                procDone
                                    ? "File-level malware signature detections"
                                    : "Available after processing"
                            }
                            onClick={() => navigate(`/incidents/${incidentId}/yara-matches`)}
                            disabled={!procDone}
                        />

                        {/* Attack Chains */}
                        <ActionCard
                            icon={<GitBranch className="w-5 h-5" />}
                            title="ATTACK CHAINS"
                            status={procDone ? "ready" : "unavailable"}
                            description={
                                procDone
                                    ? "ATT&CK kill-chain reconstruction"
                                    : "Available after processing"
                            }
                            onClick={() => navigate(`/incidents/${incidentId}/attack-chains`)}
                            disabled={!procDone}
                        />

                        {/* Chain of Custody */}
                        <ActionCard
                            icon={<FileText className="w-5 h-5" />}
                            title="CHAIN OF CUSTODY"
                            status={collectionDone ? "ready" : "unavailable"}
                            description="Tamper-evident evidence handling log"
                            onClick={() => navigate("/chain-of-custody")}
                            disabled={!collectionDone}
                        />

                        {/* Collection Setup / Recollect */}
                        <ActionCard
                            icon={<Users className="w-5 h-5" />}
                            title={
                                incident.status === "COLLECTION_IN_PROGRESS"
                                    ? "COLLECTION IN PROGRESS"
                                    : "COLLECTION SETUP"
                            }
                            status={
                                incident.status === "COLLECTION_IN_PROGRESS" ? "pending" :
                                collectionDone ? "ready" : "ready"
                            }
                            description={
                                incident.status === "COLLECTION_IN_PROGRESS"
                                    ? "Agent collection is currently running"
                                    : collectionDone
                                    ? "Recollect or add new hosts to incident"
                                    : "Configure and launch agent collection"
                            }
                            onClick={() =>
                                incident.status === "COLLECTION_IN_PROGRESS"
                                    ? navigate(`/incidents/${incidentId}/collect`)
                                    : navigate(`/incidents/${incidentId}/setup`)
                            }
                        />

                        {/* Push to Timesketch — admin only */}
                        {userRole === "admin" && (
                            <ActionCard
                                icon={isPushingTs
                                    ? <Loader2 className="w-5 h-5 animate-spin" />
                                    : <Upload className="w-5 h-5" />
                                }
                                title="PUSH TO TIMESKETCH"
                                status={procDone ? "ready" : "unavailable"}
                                description={
                                    isPushingTs
                                        ? "Uploading timeline to Timesketch…"
                                        : tsError
                                        ? tsError
                                        : procDone
                                        ? "Export timeline.jsonl to connected Timesketch instance"
                                        : "Available after processing pipeline completes"
                                }
                                onClick={() => void handlePushTimesketch()}
                                disabled={!procDone || isPushingTs}
                            />
                        )}
                    </div>
                </TacticalPanel>

                {/* ── Analysis Progress Timeline ───────────────────────────── */}
                <TacticalPanel title="ANALYSIS PROGRESS">
                    <div className="space-y-4">
                        <TimelineStep
                            done={collectionDone}
                            active={incident.status === "COLLECTION_IN_PROGRESS"}
                            failed={incident.status === "COLLECTION_FAILED"}
                            label="EVIDENCE COLLECTION"
                            detail={
                                collectionDone
                                    ? `Completed ${fmtTs(incident.updated_at)} · ${incident.target_endpoints.length} host(s)`
                                    : incident.status === "COLLECTION_IN_PROGRESS"
                                    ? `In progress · ${incident.collection_progress}% complete`
                                    : "Pending"
                            }
                        />
                        <div className="ml-2 pl-5 border-l border-border/30" />
                        <TimelineStep
                            done={procDone}
                            active={procActive}
                            failed={procFailed}
                            label="ARTIFACT PROCESSING PIPELINE"
                            detail={
                                procDone
                                    ? `Completed ${fmtTs(procJob?.completed_at)}`
                                    : procActive
                                    ? `Running phase: ${procJob?.phase ?? "…"}`
                                    : procFailed
                                    ? `Failed: ${procJob?.error_message ?? "unknown"}`
                                    : "Pending — trigger from Pipeline page after collection"
                            }
                        />
                        <div className="ml-2 pl-5 border-l border-border/30" />
                        <TimelineStep
                            done={stDone}
                            active={stActive}
                            failed={stFailed}
                            label="SUPER TIMELINE BUILD"
                            detail={
                                stDone
                                    ? `Completed ${fmtTs(superTimeline?.completed_at)} · ${superTimeline?.host_count} hosts · ${(superTimeline?.event_count ?? 0).toLocaleString()} events${lmCount > 0 ? ` · ${lmCount} lateral movement detections` : ""}`
                                    : stActive
                                    ? "Merging per-host timelines into unified DuckDB store…"
                                    : stFailed
                                    ? `Failed: ${superTimeline?.error_message ?? "unknown"}`
                                    : procDone
                                    ? "Ready — trigger from Super Timeline page"
                                    : "Pending — requires pipeline completion"
                            }
                        />
                        <div className="ml-2 pl-5 border-l border-border/30" />
                        <TimelineStep
                            done={stDone && lmCount >= 0}
                            active={false}
                            failed={false}
                            label="LATERAL MOVEMENT DETECTION"
                            detail={
                                stDone
                                    ? lmCount > 0
                                        ? `${lmCount} detection${lmCount > 1 ? "s" : ""} — review in Super Timeline`
                                        : "No lateral movement detected"
                                    : "Runs automatically with Super Timeline build"
                            }
                        />
                    </div>
                </TacticalPanel>

                {/* ── Lateral movement summary ─────────────────────────────── */}
                {stDone && lmDetections && lmDetections.length > 0 && (
                    <TacticalPanel title="LATERAL MOVEMENT SUMMARY" status="offline">
                        <div className="space-y-2">
                            {lmDetections.map((det) => (
                                <div
                                    key={det.id}
                                    className="flex items-center gap-3 p-3 border border-border/50 bg-secondary/20 rounded-sm"
                                >
                                    <Network className="w-4 h-4 text-red-400 shrink-0" />
                                    <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                                        <span className="px-1.5 py-0.5 border border-red-500/30 bg-red-500/10 text-red-400 font-mono text-[10px] rounded-sm uppercase font-bold">
                                            {det.detection_type.replace(/_/g, " ")}
                                        </span>
                                        <span className="font-mono text-xs">{det.source_host}</span>
                                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                        <span className="font-mono text-xs">{det.target_host}</span>
                                        {det.actor && (
                                            <span className="font-mono text-xs text-muted-foreground">
                                                via <span className="text-foreground">{det.actor}</span>
                                            </span>
                                        )}
                                    </div>
                                    <span className={cn(
                                        "font-mono text-xs shrink-0",
                                        det.confidence >= 0.8 ? "text-red-400" :
                                        det.confidence >= 0.5 ? "text-orange-400" :
                                        "text-yellow-400"
                                    )}>
                                        {Math.round(det.confidence * 100)}% CONF
                                    </span>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full font-mono text-xs mt-2"
                                onClick={() => navigate(`/incidents/${incidentId}/super-timeline`)}
                            >
                                <Layers className="w-3.5 h-3.5 mr-2" />
                                OPEN SUPER TIMELINE FOR FULL ANALYSIS
                            </Button>
                        </div>
                    </TacticalPanel>
                )}

            </div>
        </AppLayout>
    );
}
