import React, { useEffect, useState, useMemo, memo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/common/SearchInput";
import { useDebounce } from "@/hooks/useDebounce";
import { useEvidence } from "@/context/EvidenceContext";
import {
    ChevronLeft,
    AlertTriangle,
    Shield,
    Activity,
    ChevronRight,
    X,
    Search,
    Pin,
    Loader2,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SigmaHitOut {
    id: string;
    incident_id: string;
    processing_job_id: string;
    rule_id: string;
    rule_name: string;
    rule_tags: string[];
    severity: string;
    description: string;
    artifact_file: string;
    event_timestamp: string | null;
    event_record_id: string | null;
    event_data: Record<string, unknown>;
    detected_at: string;
}

interface SigmaHitListOut {
    total: number;
    items: SigmaHitOut[];
    severity_counts: Record<string, number>;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "informational"];

const SEVERITY_COLORS: Record<string, string> = {
    critical: "text-red-400 border-red-400/40 bg-red-400/10",
    high: "text-orange-400 border-orange-400/40 bg-orange-400/10",
    medium: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
    low: "text-blue-400 border-blue-400/40 bg-blue-400/10",
    informational: "text-muted-foreground border-border bg-secondary/30",
};

const SeverityBadge = memo(({ severity }: { severity: string }) => {
    const cls = SEVERITY_COLORS[severity.toLowerCase()] ?? SEVERITY_COLORS.informational;
    return (
        <span className={cn("px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold border uppercase whitespace-nowrap", cls)}>
            {severity}
        </span>
    );
});
SeverityBadge.displayName = "SeverityBadge";

// ─── Memoized Hit Row ────────────────────────────────────────────────────────

const SigmaHitRow = memo(({ hit, onSelect }: { hit: SigmaHitOut; onSelect: (h: SigmaHitOut) => void }) => {
    const fileName = useMemo(() => hit.artifact_file ? hit.artifact_file.split(/[\\/]/).pop() : "—", [hit.artifact_file]);
    
    return (
        <tr
            className="border-b border-border/30 hover:bg-primary/5 transition-colors cursor-pointer group"
            onClick={() => onSelect(hit)}
            style={{ contentVisibility: "auto", containIntrinsicSize: "0 40px" }}
        >
            <td className="px-3 py-2"><SeverityBadge severity={hit.severity} /></td>
            <td className="px-3 py-2 max-w-[200px]">
                <span className="truncate block font-mono text-[11px] font-bold" title={hit.rule_name}>
                    {hit.rule_name}
                </span>
            </td>
            <td className="px-3 py-2 max-w-[160px]">
                <span className="truncate block text-muted-foreground text-[10px]" title={hit.artifact_file ?? ""}>
                    {fileName}
                </span>
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums text-[10px]">
                {hit.event_timestamp ? new Date(hit.event_timestamp).toLocaleString() : "—"}
            </td>
            <td className="px-3 py-2 max-w-[180px]">
                <div className="flex flex-wrap gap-1">
                    {(hit.rule_tags ?? []).slice(0, 2).map((tag) => (
                        <span key={tag} className="bg-secondary/60 border border-border/40 px-1 rounded-[1px] text-muted-foreground truncate text-[9px] uppercase">
                            {tag}
                        </span>
                    ))}
                    {(hit.rule_tags ?? []).length > 2 && (
                        <span className="text-muted-foreground text-[9px]">+{(hit.rule_tags ?? []).length - 2}</span>
                    )}
                </div>
            </td>
            <td className="px-3 py-2 text-primary text-[10px] text-right font-bold opacity-0 group-hover:opacity-100 transition-opacity">DETAIL →</td>
        </tr>
    );
});
SigmaHitRow.displayName = "SigmaHitRow";

// ─── Main Component ─────────────────────────────────────────────────────────

const LIMIT = 50;

export default function SigmaHits() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();
    const { pinItem, pinnedItems } = useEvidence();
    
    const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [selectedHit, setSelectedHit] = useState<SigmaHitOut | null>(null);
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 350);

    // Reset offset when filters change
    useEffect(() => { setOffset(0); }, [debouncedSearch, selectedSeverity]);

    const { data, isLoading } = useQuery<SigmaHitListOut>({
        queryKey: ["sigma-hits", incidentId, selectedSeverity, offset, debouncedSearch],
        queryFn: () => {
            const params = new URLSearchParams({
                limit: String(LIMIT),
                offset: String(offset),
            });
            if (selectedSeverity) params.set("severity", selectedSeverity);
            if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
            return apiGet<SigmaHitListOut>(`/processing/incident/${incidentId}/sigma-hits?${params}`);
        },
        staleTime: 60_000,
    });

    const totalPages = useMemo(() => data ? Math.ceil(data.total / LIMIT) : 0, [data]);
    const currentPage = useMemo(() => Math.floor(offset / LIMIT) + 1, [offset]);

    const handlePin = useCallback(() => {
        if (!selectedHit) return;
        pinItem({
            id: selectedHit.id,
            type: "hit",
            title: `Sigma: ${selectedHit.rule_name}`,
            content: selectedHit.description || selectedHit.rule_name,
            timestamp: selectedHit.event_timestamp || selectedHit.detected_at,
            metadata: { severity: selectedHit.severity, artifact: selectedHit.artifact_file }
        });
    }, [selectedHit, pinItem]);

    return (
        <AppLayout
            title="SIGMA DETECTION HITS"
            subtitle={`INCIDENT: ${incidentId}`}
            headerActions={
                <Button variant="ghost" onClick={() => navigate(`/incidents/${incidentId}/processing`)} size="sm">
                    <ChevronLeft className="w-4 h-4 mr-2" /> BACK TO PIPELINE
                </Button>
            }
        >
            <div className="p-6 flex flex-col gap-6 h-full">
                {/* Severity Summary */}
                <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                        onClick={() => setSelectedSeverity(null)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-sm border font-mono text-[10px] uppercase tracking-widest transition-all",
                            !selectedSeverity ? "border-primary bg-primary/10 text-primary shadow-[0_0_8px_rgba(0,255,128,0.1)]" : "border-border/60 text-muted-foreground hover:border-border"
                        )}
                    >
                        <Shield className="w-3 h-3" /> ALL ({data?.total ?? 0})
                    </button>
                    {SEVERITY_ORDER.map((sev) => {
                        const count = data?.severity_counts?.[sev] ?? 0;
                        if (count === 0 && selectedSeverity !== sev) return null;
                        return (
                            <button
                                key={sev}
                                onClick={() => setSelectedSeverity(sev)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-sm border font-mono text-[10px] uppercase tracking-widest transition-all",
                                    selectedSeverity === sev ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-border"
                                )}
                            >
                                <AlertTriangle className="w-3 h-3" /> {sev} ({count})
                            </button>
                        );
                    })}
                </div>

                {/* Hits Table */}
                <TacticalPanel
                    title="RULE MATCHES"
                    className="flex-1 flex flex-col min-h-0"
                    status={isLoading ? "active" : "online"}
                    headerActions={
                        <div className="flex items-center gap-3">
                            <SearchInput
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Filter by rule, file, tag..."
                                className="w-64 h-7 text-[10px]"
                            />
                            <span className="font-mono text-[10px] text-muted-foreground uppercase">
                                Page {currentPage}/{totalPages || 1}
                            </span>
                            <div className="flex gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-8 p-0"
                                    disabled={offset === 0 || isLoading}
                                    onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-8 p-0"
                                    disabled={currentPage >= totalPages || isLoading}
                                    onClick={() => setOffset((o) => o + LIMIT)}
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className="flex-1 overflow-auto min-h-[200px]">
                        {isLoading ? (
                            <div className="flex items-center justify-center gap-3 h-40 font-mono text-xs text-muted-foreground">
                                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                SCANNING DETECTION DATA...
                            </div>
                        ) : data?.items.length === 0 ? (
                            <div className="flex items-center justify-center h-40 font-mono text-xs text-muted-foreground italic uppercase tracking-widest opacity-40">
                                {data?.total === 0 ? "No matches recorded" : "Filtered result empty"}
                            </div>
                        ) : (
                            <table className="w-full font-mono text-[11px] border-collapse">
                                <thead className="sticky top-0 bg-background/95 backdrop-blur z-10">
                                    <tr className="border-b border-border/60 text-muted-foreground uppercase text-[10px] tracking-tighter font-bold">
                                        <th className="px-3 py-2 text-left w-24">SEVERITY</th>
                                        <th className="px-3 py-2 text-left">RULE</th>
                                        <th className="px-3 py-2 text-left">ARTIFACT</th>
                                        <th className="px-3 py-2 text-left">TIMESTAMP</th>
                                        <th className="px-3 py-2 text-left">TAGS</th>
                                        <th className="px-3 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {data?.items.map((hit) => (
                                        <SigmaHitRow key={hit.id} hit={hit} onSelect={setSelectedHit} />
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </TacticalPanel>
            </div>

            {/* Detail Overlay */}
            {selectedHit && (
                <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setSelectedHit(null)}>
                    <div className="bg-card border border-primary/20 rounded-sm shadow-[0_0_40px_rgba(0,0,0,0.5)] w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 bg-secondary/20 shrink-0">
                            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                <Search className="w-3.5 h-3.5 text-primary" /> DETECTION_META_ANALYSIS
                            </div>
                            <button onClick={() => setSelectedHit(null)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-6 space-y-5 font-mono text-[11px] overflow-auto flex-1 custom-scrollbar">
                            <div className="flex items-center gap-4 border-b border-border/40 pb-4">
                                <SeverityBadge severity={selectedHit.severity} />
                                <span className="font-bold text-sm tracking-tight">{selectedHit.rule_name}</span>
                            </div>
                            
                            {selectedHit.description && <p className="text-muted-foreground leading-relaxed italic bg-secondary/10 p-3 border-l-2 border-primary/40">"{selectedHit.description}"</p>}
                            
                            <div className="grid grid-cols-2 gap-x-10 gap-y-3 border-b border-border/20 pb-4 uppercase tracking-tighter">
                                <div><span className="text-muted-foreground">RULE_ID: </span>{selectedHit.rule_id}</div>
                                <div><span className="text-muted-foreground">RECORD_ID: </span>{selectedHit.event_record_id ?? "—"}</div>
                                <div><span className="text-muted-foreground">ARTIFACT: </span><span className="text-foreground truncate block">{selectedHit.artifact_file ?? "—"}</span></div>
                                <div><span className="text-muted-foreground">TIMESTAMP: </span>{selectedHit.event_timestamp ? new Date(selectedHit.event_timestamp).toLocaleString() : "—"}</div>
                            </div>
                            
                            {(selectedHit.rule_tags ?? []).length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">Mitre ATT&CK Framework:</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(selectedHit.rule_tags ?? []).map((tag) => (
                                            <span key={tag} className="bg-secondary/40 border border-border/60 px-2 py-0.5 rounded-[1px] text-primary/80 uppercase text-[9px]">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedHit.event_data && (
                                <div className="space-y-2">
                                    <div className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">Raw Event Payload:</div>
                                    <pre className="bg-background/80 border border-border/40 p-4 rounded-sm overflow-auto text-[10px] max-h-64 leading-tight">
                                        {JSON.stringify(selectedHit.event_data, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                        <div className="px-5 py-3 border-t border-border/60 bg-secondary/10 flex justify-end gap-3 shrink-0">
                            <Button variant="outline" size="sm" className="h-8 gap-2 font-mono text-[10px]" onClick={handlePin}>
                                <Pin className={cn("w-3.5 h-3.5", pinnedItems.some(i => i.id === selectedHit.id) && "fill-current text-primary")} />
                                {pinnedItems.some(i => i.id === selectedHit.id) ? "PINNED" : "PIN_TO_WORKSPACE"}
                            </Button>
                            <Button variant="tactical" size="sm" className="h-8 font-mono text-[10px]" onClick={() => {
                                    const ed = selectedHit.event_data || {};
                                    const host = (ed.Computer || ed.ComputerName || ed.host || ed.Hostname || "");
                                    const q = host ? `host:${host} rule:"${selectedHit.rule_name}"` : `rule:"${selectedHit.rule_name}"`;
                                    navigate(`/incidents/${incidentId}/super-timeline?q=${encodeURIComponent(q)}`);
                                }}>
                                <Search className="w-3.5 h-3.5 mr-2" /> PIVOT_TO_TIMELINE
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
