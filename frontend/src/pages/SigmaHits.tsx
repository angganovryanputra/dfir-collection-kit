import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/common/SearchInput";
import {
    ChevronLeft,
    AlertTriangle,
    Shield,
    Activity,
    ChevronRight,
    X,
} from "lucide-react";
import { apiGet } from "@/lib/api";

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

const severityBadge = (sev: string) => {
    const cls = SEVERITY_COLORS[sev.toLowerCase()] ?? SEVERITY_COLORS.informational;
    return (
        <span className={`px-1.5 py-0.5 rounded-sm text-xs font-mono font-bold border uppercase ${cls}`}>
            {sev}
        </span>
    );
};

const LIMIT = 50;

export default function SigmaHits() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();
    const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [selectedHit, setSelectedHit] = useState<SigmaHitOut | null>(null);
    const [search, setSearch] = useState("");

    const { data, isLoading, error } = useQuery<SigmaHitListOut>({
        queryKey: ["sigma-hits", incidentId, selectedSeverity, offset],
        queryFn: () => {
            const params = new URLSearchParams({
                limit: String(LIMIT),
                offset: String(offset),
            });
            if (selectedSeverity) params.set("severity", selectedSeverity);
            return apiGet<SigmaHitListOut>(
                `/processing/incident/${incidentId}/sigma-hits?${params}`
            );
        },
    });

    const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;
    const currentPage = Math.floor(offset / LIMIT) + 1;

    const filteredItems = search
        ? (data?.items ?? []).filter(
              (h) =>
                  h.rule_name?.toLowerCase().includes(search.toLowerCase()) ||
                  h.artifact_file?.toLowerCase().includes(search.toLowerCase()) ||
                  h.rule_tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
          )
        : (data?.items ?? []);

    return (
        <AppLayout
            title="SIGMA DETECTION HITS"
            subtitle={`INCIDENT: ${incidentId}`}
            headerActions={
                <Button
                    variant="ghost"
                    onClick={() => navigate(`/incidents/${incidentId}/processing`)}
                    size="sm"
                >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    BACK TO PIPELINE
                </Button>
            }
        >
            <div className="p-6 flex flex-col gap-6 h-full">
                {/* Severity Summary */}
                <TacticalPanel title="DETECTION SUMMARY" className="shrink-0">
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => { setSelectedSeverity(null); setOffset(0); }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-sm border font-mono text-sm transition-colors ${
                                !selectedSeverity
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border hover:border-primary/50"
                            }`}
                        >
                            <Shield className="w-4 h-4" />
                            ALL ({data?.total ?? 0})
                        </button>
                        {SEVERITY_ORDER.map((sev) => {
                            const count = data?.severity_counts?.[sev] ?? 0;
                            if (count === 0) return null;
                            return (
                                <button
                                    key={sev}
                                    onClick={() => { setSelectedSeverity(sev); setOffset(0); }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-sm border font-mono text-sm transition-colors ${
                                        selectedSeverity === sev
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border hover:border-primary/50"
                                    }`}
                                >
                                    <AlertTriangle className="w-3 h-3" />
                                    {sev.toUpperCase()} ({count})
                                </button>
                            );
                        })}
                    </div>
                </TacticalPanel>

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
                                className="w-64 h-7 text-xs"
                            />
                            <span className="font-mono text-xs text-muted-foreground">
                                PAGE {currentPage}/{totalPages || 1}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                disabled={offset === 0 || isLoading}
                                onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
                            >
                                <ChevronLeft className="w-3 h-3" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                disabled={currentPage >= totalPages || isLoading}
                                onClick={() => setOffset((o) => o + LIMIT)}
                            >
                                <ChevronRight className="w-3 h-3" />
                            </Button>
                        </div>
                    }
                >
                    <div className="flex-1 overflow-auto min-h-[200px]">
                        {error ? (
                            <div className="flex items-center justify-center h-40 font-mono text-sm text-destructive">
                                ERROR: {(error as Error).message}
                            </div>
                        ) : isLoading ? (
                            <div className="flex items-center justify-center gap-3 h-40 font-mono text-sm text-muted-foreground">
                                <Activity className="w-5 h-5 animate-pulse text-primary" />
                                LOADING DETECTIONS...
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <div className="flex items-center justify-center h-40 font-mono text-sm text-muted-foreground">
                                {data?.total === 0 ? "NO SIGMA HITS DETECTED" : "NO MATCHES FOR FILTER"}
                            </div>
                        ) : (
                            <table className="w-full font-mono text-xs">
                                <thead className="sticky top-0 bg-background/95 backdrop-blur z-10">
                                    <tr className="border-b border-border text-muted-foreground">
                                        <th className="px-3 py-2 text-left font-bold uppercase">SEVERITY</th>
                                        <th className="px-3 py-2 text-left font-bold uppercase">RULE</th>
                                        <th className="px-3 py-2 text-left font-bold uppercase">ARTIFACT</th>
                                        <th className="px-3 py-2 text-left font-bold uppercase">TIMESTAMP</th>
                                        <th className="px-3 py-2 text-left font-bold uppercase">TAGS</th>
                                        <th className="px-3 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.map((hit) => (
                                        <tr
                                            key={hit.id}
                                            className="border-b border-border/30 hover:bg-primary/5 transition-colors cursor-pointer"
                                            onClick={() => setSelectedHit(hit)}
                                        >
                                            <td className="px-3 py-2">{severityBadge(hit.severity)}</td>
                                            <td className="px-3 py-2 max-w-[200px]">
                                                <span className="truncate block" title={hit.rule_name}>
                                                    {hit.rule_name}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 max-w-[160px]">
                                                <span
                                                    className="truncate block text-muted-foreground"
                                                    title={hit.artifact_file ?? ""}
                                                >
                                                    {hit.artifact_file
                                                        ? hit.artifact_file.split(/[\\/]/).pop()
                                                        : "—"}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                                                {hit.event_timestamp
                                                    ? new Date(hit.event_timestamp).toLocaleString()
                                                    : "—"}
                                            </td>
                                            <td className="px-3 py-2 max-w-[180px]">
                                                <div className="flex flex-wrap gap-1">
                                                    {hit.rule_tags.slice(0, 3).map((tag) => (
                                                        <span
                                                            key={tag}
                                                            className="bg-secondary px-1 rounded text-muted-foreground truncate"
                                                        >
                                                            {tag}
                                                        </span>
                                                    ))}
                                                    {hit.rule_tags.length > 3 && (
                                                        <span className="text-muted-foreground">
                                                            +{hit.rule_tags.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-primary text-xs">DETAIL →</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </TacticalPanel>
            </div>

            {/* Detail Modal */}
            {selectedHit && (
                <div
                    className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-6"
                    onClick={() => setSelectedHit(null)}
                >
                    <div
                        className="bg-card border border-border rounded-sm shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                            <div className="font-mono text-sm font-bold uppercase tracking-wider">
                                DETECTION DETAIL
                            </div>
                            <button
                                onClick={() => setSelectedHit(null)}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 font-mono text-xs">
                            <div className="flex items-center gap-3">
                                {severityBadge(selectedHit.severity)}
                                <span className="font-bold text-sm">{selectedHit.rule_name}</span>
                            </div>
                            {selectedHit.description && (
                                <p className="text-muted-foreground">{selectedHit.description}</p>
                            )}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                <div>
                                    <span className="text-muted-foreground">RULE ID: </span>
                                    {selectedHit.rule_id}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">RECORD ID: </span>
                                    {selectedHit.event_record_id ?? "—"}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">ARTIFACT: </span>
                                    {selectedHit.artifact_file ?? "—"}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">EVENT TIME: </span>
                                    {selectedHit.event_timestamp
                                        ? new Date(selectedHit.event_timestamp).toLocaleString()
                                        : "—"}
                                </div>
                            </div>
                            {selectedHit.rule_tags.length > 0 && (
                                <div>
                                    <div className="text-muted-foreground mb-1">MITRE TAGS:</div>
                                    <div className="flex flex-wrap gap-1">
                                        {selectedHit.rule_tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="bg-secondary border border-border px-2 py-0.5 rounded-sm"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedHit.event_data && (
                                <div>
                                    <div className="text-muted-foreground mb-1">EVENT DATA:</div>
                                    <pre className="bg-secondary border border-border p-3 rounded-sm overflow-auto text-xs max-h-60">
                                        {JSON.stringify(selectedHit.event_data, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
