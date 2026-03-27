/**
 * IncidentReport — printable incident report page.
 *
 * Fetches incident metadata, super-timeline status, lateral movements,
 * sigma hits, evidence folders and renders a structured print-friendly report.
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import {
    Printer,
    CheckCircle2,
    XCircle,
    Clock,
    Server,
    Network,
    AlertTriangle,
    Shield,
    Database,
    FileText,
    Loader2,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { getStoredAuth } from "@/lib/auth";

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
    status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
    phase: string | null;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    created_at: string;
}

interface SuperTimelineOut {
    id: string;
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
    first_seen: string | null;
    last_seen: string | null;
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

interface YaraMatchListOut {
    total: number;
    items: unknown[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTs(ts: string | null | undefined): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
}

function NOTES_KEY(id: string) {
    return `dfir_report_notes_${id}`;
}

function loadNotes(id: string): string {
    try { return localStorage.getItem(NOTES_KEY(id)) ?? ""; } catch { return ""; }
}

function saveNotes(id: string, notes: string): void {
    try { localStorage.setItem(NOTES_KEY(id), notes); } catch { /* ignore */ }
}

function StatusBadge({ status }: { status: string }) {
    const cls =
        status === "DONE" || status === "COLLECTION_COMPLETE"
            ? "text-green-400 border-green-500/40 bg-green-500/10"
            : status === "FAILED"
            ? "text-red-400 border-red-500/40 bg-red-500/10"
            : status === "RUNNING" || status === "BUILDING"
            ? "text-yellow-400 border-yellow-500/40 bg-yellow-500/10"
            : "text-muted-foreground border-border/40 bg-secondary/30";

    return (
        <span className={`px-2 py-0.5 rounded-sm border font-mono text-xs font-bold ${cls}`}>
            {status}
        </span>
    );
}

function CheckRow({ label, done, note }: { label: string; done: boolean; note?: string }) {
    return (
        <div className="flex items-center gap-2 font-mono text-xs py-1">
            {done
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />}
            <span className={done ? "text-foreground" : "text-muted-foreground/60"}>{label}</span>
            {note && <span className="text-muted-foreground/50">{note}</span>}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IncidentReport() {
    const { id: incidentId } = useParams<{ id: string }>();
    const auth = getStoredAuth();
    const [notes, setNotes] = useState(() => loadNotes(incidentId ?? ""));

    // ── Data fetching ─────────────────────────────────────────────────────────

    const { data: incident, isLoading: incidentLoading } = useQuery<IncidentOut>({
        queryKey: ["incident", incidentId],
        queryFn: () => apiGet<IncidentOut>(`/incidents/${incidentId}`),
        enabled: !!incidentId,
    });

    const { data: processingJob } = useQuery<ProcessingJobOut | null>({
        queryKey: ["processing-status", incidentId],
        queryFn: async () => {
            try {
                return await apiGet<ProcessingJobOut>(`/processing/incident/${incidentId}/status`);
            } catch {
                return null;
            }
        },
        enabled: !!incidentId,
    });

    const { data: stStatus } = useQuery<SuperTimelineOut | null>({
        queryKey: ["super-timeline-status", incidentId],
        queryFn: async () => {
            try {
                return await apiGet<SuperTimelineOut>(
                    `/processing/incident/${incidentId}/super-timeline/status`
                );
            } catch {
                return null;
            }
        },
        enabled: !!incidentId,
    });

    const { data: lmData } = useQuery<LateralMovementOut[]>({
        queryKey: ["lateral-movement-report", incidentId],
        queryFn: async () => {
            try {
                return await apiGet<LateralMovementOut[]>(
                    `/processing/incident/${incidentId}/super-timeline/lateral-movement`
                );
            } catch {
                return [];
            }
        },
        enabled: !!incidentId,
    });

    const { data: evidenceFolders } = useQuery<EvidenceFolderOut[]>({
        queryKey: ["evidence-folders-report", incidentId],
        queryFn: async () => {
            try {
                return await apiGet<EvidenceFolderOut[]>(`/evidence/folders/${incidentId}`);
            } catch {
                return [];
            }
        },
        enabled: !!incidentId,
    });

    const { data: sigmaHits } = useQuery<SigmaHitListOut | null>({
        queryKey: ["sigma-hits-report", incidentId],
        queryFn: async () => {
            try {
                return await apiGet<SigmaHitListOut>(
                    `/processing/incident/${incidentId}/sigma-hits?limit=1`
                );
            } catch {
                return null;
            }
        },
        enabled: !!incidentId,
    });

    const { data: yaraMatches } = useQuery<YaraMatchListOut | null>({
        queryKey: ["yara-matches-report", incidentId],
        queryFn: async () => {
            try {
                return await apiGet<YaraMatchListOut>(
                    `/processing/incident/${incidentId}/yara-matches?limit=1`
                );
            } catch {
                return null;
            }
        },
        enabled: !!incidentId,
    });

    // ── Derived values ────────────────────────────────────────────────────────

    const totalFiles = evidenceFolders?.reduce((s, f) => s + (f.files_count ?? 0), 0) ?? 0;
    const collectionDone =
        incident?.status === "COLLECTION_COMPLETE" ||
        incident?.status === "ANALYSIS_COMPLETE";
    const processingDone = processingJob?.status === "DONE";
    const stDone = stStatus?.status === "DONE";

    const generatedAt = new Date().toLocaleString();

    const CONFIDENCE_COLORS: Record<string, string> = {
        account_pivot: "text-red-400",
        process_spread: "text-orange-400",
        credential_reuse: "text-yellow-400",
    };

    if (incidentLoading) {
        return (
            <AppLayout title="INCIDENT REPORT" subtitle={`INCIDENT: ${incidentId}`}>
                <div className="flex items-center justify-center h-64 gap-3 font-mono text-sm text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    LOADING REPORT DATA...
                </div>
            </AppLayout>
        );
    }

    return (
        <>
            {/* Print CSS */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body, html { background: white !important; color: black !important; }
                    .print-section { page-break-inside: avoid; }
                    * { color-adjust: exact; -webkit-print-color-adjust: exact; }
                }
            `}</style>

            <AppLayout
                title="INCIDENT REPORT"
                subtitle={`INCIDENT: ${incidentId}`}
                headerActions={
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 font-mono text-xs no-print"
                        onClick={() => window.print()}
                    >
                        <Printer className="w-4 h-4" />
                        PRINT / SAVE PDF
                    </Button>
                }
            >
                <div className="p-6 flex flex-col gap-5 max-w-4xl mx-auto">

                    {/* ── Report Header ──────────────────────────────────── */}
                    <div className="print-section">
                        <TacticalPanel title="REPORT HEADER" status="verified">
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="font-mono text-xl font-bold tracking-widest text-primary">
                                        DFIR RCK
                                    </div>
                                    <div className="font-mono text-xs text-muted-foreground border border-border/40 px-2 py-1 rounded-sm">
                                        RAPID COLLECTION KIT v2.1.0
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                                    <div>
                                        <span className="text-muted-foreground">INCIDENT ID: </span>
                                        <span className="font-bold text-foreground">{incidentId}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">GENERATED: </span>
                                        <span className="text-foreground">{generatedAt}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">OPERATOR: </span>
                                        <span className="text-foreground">{incident?.operator ?? auth?.username ?? "—"}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">STATUS: </span>
                                        {incident ? <StatusBadge status={incident.status} /> : <span>—</span>}
                                    </div>
                                </div>
                            </div>
                        </TacticalPanel>
                    </div>

                    {/* ── Incident Summary ───────────────────────────────── */}
                    {incident && (
                        <div className="print-section">
                            <TacticalPanel title="INCIDENT SUMMARY">
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                                        <div>
                                            <span className="text-muted-foreground">TYPE: </span>
                                            <span className="font-bold text-foreground uppercase">{incident.type}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">COLLECTION PROGRESS: </span>
                                            <span className="text-foreground">{incident.collection_progress}%</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">CREATED: </span>
                                            <span className="text-foreground">{fmtTs(incident.created_at)}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">LAST UPDATED: </span>
                                            <span className="text-foreground">{fmtTs(incident.updated_at)}</span>
                                        </div>
                                    </div>

                                    {incident.target_endpoints.length > 0 && (
                                        <div>
                                            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                                                TARGET ENDPOINTS ({incident.target_endpoints.length})
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {incident.target_endpoints.map((ep) => (
                                                    <span
                                                        key={ep}
                                                        className="flex items-center gap-1 px-2 py-0.5 rounded-sm border border-border/40 bg-secondary/30 font-mono text-xs"
                                                    >
                                                        <Server className="w-2.5 h-2.5 text-muted-foreground" />
                                                        {ep}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </TacticalPanel>
                        </div>
                    )}

                    {/* ── Collection Summary ─────────────────────────────── */}
                    <div className="print-section">
                        <TacticalPanel title="COLLECTION SUMMARY">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/30 rounded-sm font-mono text-xs">
                                    <FileText className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-muted-foreground">FOLDERS</span>
                                    <span className="font-bold">{evidenceFolders?.length ?? 0}</span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/30 rounded-sm font-mono text-xs">
                                    <Database className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-muted-foreground">FILES</span>
                                    <span className="font-bold">{totalFiles.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/30 rounded-sm font-mono text-xs">
                                    <Server className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-muted-foreground">HOSTS</span>
                                    <span className="font-bold">{stStatus?.host_count ?? incident?.target_endpoints?.length ?? 0}</span>
                                </div>
                            </div>
                        </TacticalPanel>
                    </div>

                    {/* ── Analysis Progress ──────────────────────────────── */}
                    <div className="print-section">
                        <TacticalPanel title="ANALYSIS PROGRESS">
                            <div className="space-y-1">
                                <CheckRow
                                    label="EVIDENCE COLLECTION"
                                    done={collectionDone}
                                    note={collectionDone ? fmtTs(incident?.updated_at) : undefined}
                                />
                                <CheckRow
                                    label="FORENSIC PROCESSING (YARA / SIGMA / IOC)"
                                    done={processingDone}
                                    note={processingDone ? fmtTs(processingJob?.completed_at) : undefined}
                                />
                                <CheckRow
                                    label="SUPER TIMELINE BUILD"
                                    done={stDone}
                                    note={stDone ? fmtTs(stStatus?.completed_at) : undefined}
                                />
                                <CheckRow
                                    label="LATERAL MOVEMENT ANALYSIS"
                                    done={stDone && (lmData?.length ?? 0) > 0}
                                />
                            </div>
                        </TacticalPanel>
                    </div>

                    {/* ── Super Timeline Stats ────────────────────────────── */}
                    {stStatus && (
                        <div className="print-section">
                            <TacticalPanel title="SUPER TIMELINE STATISTICS" status={stDone ? "verified" : "warning"}>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="font-mono text-xs space-y-1">
                                        <div className="text-muted-foreground uppercase text-[10px] tracking-wider">STATUS</div>
                                        <StatusBadge status={stStatus.status} />
                                    </div>
                                    <div className="font-mono text-xs space-y-1">
                                        <div className="text-muted-foreground uppercase text-[10px] tracking-wider">HOSTS MERGED</div>
                                        <div className="font-bold text-lg tabular-nums">{stStatus.host_count ?? "—"}</div>
                                    </div>
                                    <div className="font-mono text-xs space-y-1">
                                        <div className="text-muted-foreground uppercase text-[10px] tracking-wider">TOTAL EVENTS</div>
                                        <div className="font-bold text-lg tabular-nums">{stStatus.event_count?.toLocaleString() ?? "—"}</div>
                                    </div>
                                </div>
                                {stStatus.started_at && stStatus.completed_at && (
                                    <div className="mt-3 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        BUILD TIME: {fmtTs(stStatus.started_at)} → {fmtTs(stStatus.completed_at)}
                                    </div>
                                )}
                            </TacticalPanel>
                        </div>
                    )}

                    {/* ── Lateral Movement Detections ────────────────────── */}
                    {lmData && lmData.length > 0 && (
                        <div className="print-section">
                            <TacticalPanel
                                title={`LATERAL MOVEMENT DETECTIONS (${lmData.length})`}
                                status="offline"
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full font-mono text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b border-border text-muted-foreground text-[10px] uppercase tracking-wider">
                                                <th className="text-left px-3 py-2">TYPE</th>
                                                <th className="text-left px-3 py-2">SOURCE</th>
                                                <th className="text-left px-3 py-2">TARGET</th>
                                                <th className="text-left px-3 py-2">ACTOR</th>
                                                <th className="text-left px-3 py-2">CONFIDENCE</th>
                                                <th className="text-left px-3 py-2">FIRST SEEN</th>
                                                <th className="text-left px-3 py-2">LAST SEEN</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lmData.map((det) => (
                                                <tr key={det.id} className="border-b border-border/20 hover:bg-secondary/20">
                                                    <td className="px-3 py-1.5">
                                                        <span className={`font-bold uppercase ${CONFIDENCE_COLORS[det.detection_type] ?? "text-muted-foreground"}`}>
                                                            {det.detection_type.replace(/_/g, " ")}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-1.5">
                                                        <span className="flex items-center gap-1">
                                                            <Server className="w-2.5 h-2.5 text-muted-foreground" />
                                                            {det.source_host}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-1.5">
                                                        <span className="flex items-center gap-1">
                                                            <Network className="w-2.5 h-2.5 text-muted-foreground" />
                                                            {det.target_host}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-1.5 text-muted-foreground">{det.actor ?? "—"}</td>
                                                    <td className="px-3 py-1.5 tabular-nums">{Math.round(det.confidence * 100)}%</td>
                                                    <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{fmtTs(det.first_seen)}</td>
                                                    <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{fmtTs(det.last_seen)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </TacticalPanel>
                        </div>
                    )}

                    {/* ── Sigma Hits Summary ─────────────────────────────── */}
                    <div className="print-section">
                        <TacticalPanel
                            title="SIGMA HITS SUMMARY"
                            status={sigmaHits && sigmaHits.total > 0 ? "offline" : "online"}
                        >
                            {sigmaHits ? (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 font-mono text-xs">
                                        <AlertTriangle className="w-4 h-4 text-red-400" />
                                        <span className="text-muted-foreground">TOTAL ALERTS:</span>
                                        <span className="font-bold text-lg tabular-nums text-foreground">{sigmaHits.total.toLocaleString()}</span>
                                    </div>
                                    {Object.keys(sigmaHits.severity_counts ?? {}).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(sigmaHits.severity_counts).map(([sev, count]) => {
                                                const cls =
                                                    sev.toLowerCase() === "critical"
                                                        ? "border-red-500/50 bg-red-500/10 text-red-400"
                                                        : sev.toLowerCase() === "high"
                                                        ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                                                        : sev.toLowerCase() === "medium"
                                                        ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                                                        : "border-border/40 bg-secondary/30 text-muted-foreground";
                                                return (
                                                    <span key={sev} className={`px-2 py-1 rounded-sm border font-mono text-xs font-bold ${cls}`}>
                                                        {sev.toUpperCase()}: {count.toLocaleString()}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <span className="font-mono text-xs text-muted-foreground">NO DATA</span>
                            )}
                        </TacticalPanel>
                    </div>

                    {/* ── YARA Matches ───────────────────────────────────── */}
                    <div className="print-section">
                        <TacticalPanel
                            title="YARA MATCH SUMMARY"
                            status={yaraMatches && yaraMatches.total > 0 ? "offline" : "online"}
                        >
                            <div className="flex items-center gap-2 font-mono text-xs">
                                <Shield className="w-4 h-4 text-orange-400" />
                                <span className="text-muted-foreground">TOTAL MATCHES:</span>
                                <span className="font-bold text-lg tabular-nums text-foreground">
                                    {yaraMatches?.total?.toLocaleString() ?? "—"}
                                </span>
                            </div>
                        </TacticalPanel>
                    </div>

                    {/* ── Analyst Notes ──────────────────────────────────── */}
                    <div className="print-section no-print">
                        <TacticalPanel title="ANALYST NOTES">
                            <textarea
                                value={notes}
                                onChange={(e) => {
                                    setNotes(e.target.value);
                                    saveNotes(incidentId ?? "", e.target.value);
                                }}
                                placeholder="Add analyst notes here (stored locally, not synced)..."
                                className="w-full h-32 bg-background border border-input rounded-sm font-mono text-xs p-3 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground resize-y"
                            />
                        </TacticalPanel>
                    </div>

                    {/* Printed notes (only if filled) */}
                    {notes.trim() && (
                        <div className="print-section hidden print:block">
                            <TacticalPanel title="ANALYST NOTES">
                                <pre className="font-mono text-xs whitespace-pre-wrap">{notes}</pre>
                            </TacticalPanel>
                        </div>
                    )}

                    {/* ── Report Footer ──────────────────────────────────── */}
                    <div className="print-section border-t border-border/40 pt-4 font-mono text-[10px] text-muted-foreground/60 flex items-center justify-between flex-wrap gap-2">
                        <span>Generated by DFIR Rapid Collection Kit v2.1.0</span>
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {generatedAt}
                        </span>
                    </div>

                </div>
            </AppLayout>
        </>
    );
}
