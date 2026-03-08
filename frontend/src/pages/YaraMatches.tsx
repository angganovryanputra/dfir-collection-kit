import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ShieldCheck, Bug } from "lucide-react";
import { apiGet } from "@/lib/api";

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
    informational: "text-muted-foreground border-border bg-secondary",
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
            title="YARA SCAN RESULTS"
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
            <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto w-full">
                {/* Summary */}
                <TacticalPanel title="YARA SCAN SUMMARY" status={total > 0 ? "offline" : "online"}>
                    <div className="flex items-center gap-6 font-mono text-sm pt-1">
                        <div>
                            <span className="text-3xl font-bold text-primary">{total}</span>
                            <span className="text-muted-foreground ml-2 text-sm">MATCHES</span>
                        </div>
                        {total > 0 && (
                            <div className="flex items-center gap-2 text-xs text-destructive">
                                <Bug className="w-4 h-4" />
                                MALICIOUS PATTERNS FOUND IN COLLECTED FILES
                            </div>
                        )}
                        {total === 0 && !isLoading && !error && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <ShieldCheck className="w-4 h-4" />
                                No YARA matches — files are clean or no rules configured.
                            </div>
                        )}
                    </div>
                </TacticalPanel>

                {/* Table */}
                <TacticalPanel
                    title={`MATCHES (${total})`}
                    headerActions={
                        total > LIMIT ? (
                            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                                <span>PAGE {page}/{totalPages}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6"
                                    disabled={page === 1}
                                    onClick={() => setPage((p) => p - 1)}
                                >
                                    <ChevronLeft className="w-3 h-3" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    <ChevronRight className="w-3 h-3" />
                                </Button>
                            </div>
                        ) : undefined
                    }
                >
                    {isLoading ? (
                        <div className="font-mono text-sm text-muted-foreground py-8">
                            SCANNING COLLECTED FILES FOR YARA MATCHES...
                        </div>
                    ) : error ? (
                        <div className="font-mono text-sm text-muted-foreground py-6">
                            No YARA data available. Run the forensics pipeline first.
                        </div>
                    ) : matches.length === 0 ? (
                        <div className="font-mono text-sm text-muted-foreground py-6">
                            No YARA matches found.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full font-mono text-xs">
                                <thead>
                                    <tr className="text-left text-muted-foreground border-b border-border">
                                        <th className="pb-2 pr-4 font-normal uppercase">RULE</th>
                                        <th className="pb-2 pr-4 font-normal uppercase">MATCHED FILE</th>
                                        <th className="pb-2 pr-4 font-normal uppercase">SIZE</th>
                                        <th className="pb-2 pr-4 font-normal uppercase">SHA-256</th>
                                        <th className="pb-2 font-normal uppercase">SEVERITY</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matches.map((m) => {
                                        const sevClass =
                                            SEVERITY_COLOR[m.severity] ??
                                            SEVERITY_COLOR.informational;
                                        return (
                                            <tr
                                                key={m.id}
                                                className="border-b border-border/40 hover:bg-secondary/30 transition-colors cursor-pointer"
                                                onClick={() => setSelected(m)}
                                            >
                                                <td className="py-2 pr-4 font-bold text-foreground">
                                                    {m.rule_name}
                                                </td>
                                                <td className="py-2 pr-4 text-muted-foreground max-w-[240px] truncate">
                                                    <span title={m.matched_file}>
                                                        {m.matched_file.split(/[\\/]/).pop() ?? m.matched_file}
                                                    </span>
                                                </td>
                                                <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                                                    {formatBytes(m.file_size)}
                                                </td>
                                                <td className="py-2 pr-4 text-muted-foreground font-mono text-[10px] max-w-[140px] truncate">
                                                    {m.file_sha256 ?? "—"}
                                                </td>
                                                <td className="py-2">
                                                    <span
                                                        className={`px-2 py-0.5 border rounded-sm uppercase text-xs ${sevClass}`}
                                                    >
                                                        {m.severity}
                                                    </span>
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
                    className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center p-6"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="bg-card border border-border rounded-sm shadow-2xl w-full max-w-xl max-h-[80vh] overflow-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                            <div className="font-mono text-sm font-bold uppercase tracking-wider">
                                YARA MATCH DETAIL
                            </div>
                            <button
                                onClick={() => setSelected(null)}
                                className="text-muted-foreground hover:text-foreground font-mono text-xs"
                            >
                                ✕ CLOSE
                            </button>
                        </div>
                        <div className="p-5 space-y-4 font-mono text-xs">
                            <div className="flex items-center gap-3">
                                <span
                                    className={`px-2 py-0.5 border rounded-sm uppercase text-xs ${
                                        SEVERITY_COLOR[selected.severity] ?? SEVERITY_COLOR.informational
                                    }`}
                                >
                                    {selected.severity}
                                </span>
                                <span className="font-bold text-sm text-foreground">
                                    {selected.rule_name}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                <div>
                                    <span className="text-muted-foreground">FILE: </span>
                                    <span className="break-all">{selected.matched_file}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">SIZE: </span>
                                    {formatBytes(selected.file_size)}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">DETECTED: </span>
                                    {new Date(selected.detected_at).toLocaleString()}
                                </div>
                            </div>
                            {selected.file_sha256 && (
                                <div>
                                    <div className="text-muted-foreground mb-1">SHA-256:</div>
                                    <div className="bg-secondary border border-border p-2 rounded-sm break-all text-[10px]">
                                        {selected.file_sha256}
                                    </div>
                                </div>
                            )}
                            {selected.rule_namespace && (
                                <div>
                                    <span className="text-muted-foreground">NAMESPACE: </span>
                                    <span>{selected.rule_namespace}</span>
                                </div>
                            )}
                            {selected.strings.length > 0 && (
                                <div>
                                    <div className="text-muted-foreground mb-1">MATCHED STRINGS ({selected.strings.length}):</div>
                                    <div className="bg-secondary border border-border p-2 rounded-sm space-y-1 max-h-40 overflow-auto">
                                        {selected.strings.map((s, i) => (
                                            <div key={i} className="text-[10px] font-mono">
                                                <span className="text-muted-foreground">{s.name} @0x{s.offset.toString(16)}: </span>
                                                <span className="text-primary break-all">{s.data}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
