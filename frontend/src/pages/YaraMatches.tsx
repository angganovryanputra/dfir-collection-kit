import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { useEvidence } from "@/context/EvidenceContext";
import { 
    ChevronLeft, ChevronRight, ShieldCheck, Bug, AlertTriangle, 
    Search, Pin, FileCode, Hash, HardDrive, ExternalLink, Activity
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

interface YaraMatchString {
    offset: number;
    name: string;
    data: string;
}

interface YaraMatch {
    id: string;
    incident_id: string;
    processing_job_id: string | null;
    rule_name: string;
    rule_namespace: string | null;
    matched_file: string;
    file_size: number | null;
    file_sha256: string | null;
    strings: YaraMatchString[];
    severity: string;
    detected_at: string;
}

interface YaraMatchListOut {
    total: number;
    items: YaraMatch[];
}

const SEVERITY_COLOR: Record<string, string> = {
    critical: "text-red-400 border-red-400/30 bg-red-400/10",
    high: "text-orange-400 border-orange-400/30 bg-orange-400/10",
    medium: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    low: "text-blue-400 border-blue-400/30 bg-blue-400/10",
    informational: "text-muted-foreground border-border bg-secondary/50",
};

const LIMIT = 50;

function formatBytes(bytes: number | null): string {
    if (bytes === null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function YaraMatches() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();
    const { pinItem, pinnedItems } = useEvidence();
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<YaraMatch | null>(null);

    const { data, isLoading, error } = useQuery<YaraMatchListOut>({
        queryKey: ["yara-matches", incidentId, page],
        queryFn: () =>
            apiGet<YaraMatchListOut>(
                `/processing/incident/${incidentId}/yara-matches?` +
                new URLSearchParams({
                    limit: String(LIMIT),
                    offset: String((page - 1) * LIMIT),
                })
            ),
        retry: false,
    });

    const matches = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / LIMIT));

    return (
        <AppLayout
            title="YARA_PATTERN_MATCHES"
            subtitle={`SECTOR: ${incidentId}`}
            headerActions={
                <Button
                    variant="ghost"
                    onClick={() => navigate(`/incidents/${incidentId}/processing`)}
                    size="sm"
                    className="h-8 text-[10px] uppercase font-bold tracking-widest border border-border/40 hover:bg-secondary/40"
                >
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" /> BACK TO PIPELINE
                </Button>
            }
        >
            <div className="p-6 flex flex-col gap-6 max-w-6xl mx-auto w-full animate-in fade-in duration-300">
                {/* Error state */}
                {error && (
                    <div className="flex items-center gap-3 px-4 py-3 border border-destructive/40 bg-destructive/5 text-destructive font-mono text-[11px] rounded-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>OPERATIONAL ERROR: {error instanceof Error ? error.message : "Failure during telemetry retrieval"}</span>
                    </div>
                )}

                {/* Status HUD */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border border-border/40 bg-card p-4 rounded-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Bug className="w-12 h-12" />
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 font-bold">Total Detections</div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-mono font-bold text-primary tabular-nums">{total}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">MATCHES</span>
                        </div>
                    </div>
                    
                    <div className={cn(
                        "border p-4 rounded-sm flex items-center gap-4",
                        total > 0 ? "border-red-500/20 bg-red-500/5" : "border-green-500/20 bg-green-500/5"
                    )}>
                        {total > 0 ? (
                            <AlertTriangle className="w-8 h-8 text-red-400 shrink-0" />
                        ) : (
                            <ShieldCheck className="w-8 h-8 text-green-400 shrink-0" />
                        )}
                        <div>
                            <div className={cn(
                                "text-[11px] font-bold uppercase tracking-tight",
                                total > 0 ? "text-red-400" : "text-green-400"
                            )}>
                                {total > 0 ? "Malicious Artifacts Detected" : "System Integrity Verified"}
                            </div>
                            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                                {total > 0 
                                    ? "Multiple files matched static malware signatures. Immediate review recommended."
                                    : "No malicious patterns identified in the current forensic collection."}
                            </div>
                        </div>
                    </div>

                    <div className="border border-border/40 bg-secondary/10 p-4 rounded-sm flex items-center justify-between">
                        <div className="space-y-1">
                            <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Scanner Status</div>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                <span className="font-mono text-[10px] font-bold">ENGINE_ACTIVE</span>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-[8px] border border-border/40" onClick={() => navigate(`/incidents/${incidentId}/setup`)}>
                            RE-SCAN →
                        </Button>
                    </div>
                </div>

                {/* Table View */}
                <TacticalPanel
                    title="MATCH_REGISTRY"
                    headerActions={
                        total > LIMIT ? (
                            <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                                <span className="tracking-tighter uppercase">Sector {page} / {totalPages}</span>
                                <div className="flex items-center border border-border/40 rounded-sm overflow-hidden">
                                    <button
                                        disabled={page === 1}
                                        onClick={() => setPage((p) => p - 1)}
                                        className="px-2 py-1 hover:bg-secondary/40 disabled:opacity-20 transition-colors"
                                    >
                                        <ChevronLeft className="w-3 h-3" />
                                    </button>
                                    <div className="w-px h-3 bg-border/40" />
                                    <button
                                        disabled={page >= totalPages}
                                        onClick={() => setPage((p) => p + 1)}
                                        className="px-2 py-1 hover:bg-secondary/40 disabled:opacity-20 transition-colors"
                                    >
                                        <ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ) : undefined
                    }
                >
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                            <div className="font-mono text-[10px] text-primary/40 uppercase tracking-[0.3em] animate-pulse">Scanning Bitstreams...</div>
                        </div>
                    ) : matches.length === 0 ? (
                        <div className="py-20 text-center flex flex-col items-center gap-3 opacity-30">
                            <ShieldCheck className="w-10 h-10 text-muted-foreground" />
                            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest font-bold">No Match Signatures Recorded</div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="text-left text-muted-foreground/60 border-b border-border/60 font-mono text-[9px] font-bold uppercase tracking-[0.2em]">
                                        <th className="px-4 py-3 font-normal">SIGNATURE_RULE</th>
                                        <th className="px-4 py-3 font-normal">ENTITY_TARGET</th>
                                        <th className="px-4 py-3 font-normal">ALLOC_SIZE</th>
                                        <th className="px-4 py-3 font-normal text-center">SEVERITY</th>
                                        <th className="px-4 py-3 font-normal text-right">OPERATIONS</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/5">
                                    {matches.map((m) => {
                                        const sevClass = SEVERITY_COLOR[m.severity] ?? SEVERITY_COLOR.informational;
                                        return (
                                            <tr
                                                key={m.id}
                                                className="bg-secondary/10 hover:bg-secondary/30 transition-colors cursor-pointer group"
                                                onClick={() => setSelected(m)}
                                            >
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <FileCode className="w-3.5 h-3.5 text-primary/60" />
                                                        <span className="text-xs font-bold text-foreground tracking-tight">{m.rule_name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <div className="text-[11px] text-muted-foreground max-w-[300px] truncate font-medium">
                                                        <span title={m.matched_file}>
                                                            {m.matched_file.split(/[\\/]/).pop() ?? m.matched_file}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                                                    {formatBytes(m.file_size)}
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className={cn(
                                                        "px-2 py-0.5 border rounded-sm uppercase text-[9px] font-bold tracking-tighter",
                                                        sevClass
                                                    )}>
                                                        {m.severity}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 border border-transparent hover:border-border">
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </TacticalPanel>
            </div>

            {/* Detail modal */}
            {selected && (
                <div
                    className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="bg-card border border-border rounded-sm shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden ring-1 ring-primary/20"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="bg-secondary/40 px-6 py-4 border-b border-border/60 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-sm">
                                    <Bug className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <div className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary">Signature Match Detail</div>
                                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">OBJECT_ID: {selected.id.slice(0, 8)}...</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelected(null)}
                                className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all rounded-sm font-mono"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 space-y-6 overflow-auto flex-1 custom-scrollbar">
                            {/* Primary Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Rule Identifier</label>
                                        <div className="text-sm font-bold text-foreground flex items-center gap-2">
                                            {selected.rule_name}
                                            <span className={cn(
                                                "px-1.5 py-0.5 border rounded-sm text-[8px] uppercase tracking-tighter",
                                                SEVERITY_COLOR[selected.severity] ?? SEVERITY_COLOR.informational
                                            )}>
                                                {selected.severity}
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Matched Artifact</label>
                                        <div className="text-[11px] font-medium text-foreground bg-secondary/30 p-2 border border-border/40 rounded-sm break-all font-mono">
                                            {selected.matched_file}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">File Size</label>
                                            <div className="font-mono text-xs text-foreground">{formatBytes(selected.file_size)}</div>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Detection Time</label>
                                            <div className="font-mono text-xs text-foreground">{new Date(selected.detected_at).toLocaleString()}</div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">SHA-256 Fingerprint</label>
                                        <div className="font-mono text-[10px] text-primary/80 bg-primary/5 p-2 border border-primary/20 rounded-sm break-all">
                                            {selected.file_sha256 ?? "NOT_AVAILABLE"}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Matched Strings */}
                            {selected.strings.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between border-b border-border/40 pb-1">
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Malicious Byte Patterns ({selected.strings.length})</label>
                                        <div className="text-[8px] font-mono text-muted-foreground">HEX_ENCODED</div>
                                    </div>
                                    <div className="space-y-2 max-h-60 overflow-auto pr-2 custom-scrollbar">
                                        {selected.strings.map((s, i) => (
                                            <div key={i} className="bg-secondary/20 border border-border/20 p-2.5 rounded-sm group/string hover:bg-secondary/40 transition-colors">
                                                <div className="flex items-center justify-between mb-1.5 font-mono text-[9px]">
                                                    <span className="text-primary font-bold">{s.name}</span>
                                                    <span className="text-muted-foreground/60 group-hover/string:text-muted-foreground transition-colors">Offset: 0x{s.offset.toString(16).toUpperCase()}</span>
                                                </div>
                                                <div className="font-mono text-[10px] text-foreground/90 break-all leading-relaxed select-all">
                                                    {s.data}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selected.rule_namespace && (
                                <div className="flex items-center gap-2 p-2 bg-secondary/10 border border-border/20 rounded-sm">
                                    <Hash className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Namespace: <span className="text-foreground">{selected.rule_namespace}</span></span>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-secondary/40 border-t border-border/60 flex justify-end gap-3 shrink-0">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 gap-2 text-[10px] font-bold uppercase tracking-widest border-border/60"
                                onClick={() => {
                                    pinItem({
                                        id: selected.id,
                                        type: "match",
                                        title: `YARA: ${selected.rule_name}`,
                                        content: selected.matched_file,
                                        timestamp: selected.detected_at,
                                        metadata: { severity: selected.severity, sha256: selected.file_sha256 }
                                    });
                                }}
                            >
                                <Pin className={cn("w-3.5 h-3.5", pinnedItems.some(i => i.id === selected.id) && "fill-current")} />
                                {pinnedItems.some(i => i.id === selected.id) ? "PINNED" : "PIN TO WORKSPACE"}
                            </Button>
                            <Button
                                variant="tactical"
                                size="sm"
                                className="h-9 px-5 text-[10px] font-bold uppercase tracking-widest"
                                onClick={() => {
                                    const fileName = selected.matched_file.split(/[\\/]/).pop();
                                    const q = fileName ? `"${fileName}"` : `rule:"${selected.rule_name}"`;
                                    navigate(`/incidents/${incidentId}/super-timeline?q=${encodeURIComponent(q)}`);
                                }}
                            >
                                <Search className="w-3.5 h-3.5 mr-2" />
                                CROSS_REFERENCE TIMELINE
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
