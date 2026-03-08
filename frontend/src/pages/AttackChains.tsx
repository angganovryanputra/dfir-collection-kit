import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { ChevronLeft, GitBranch, Shield, Clock } from "lucide-react";
import { apiGet } from "@/lib/api";

interface AttackChain {
    id: string;
    incident_id: string;
    window_start: string | null;
    window_end: string | null;
    tactics: string[];
    techniques: string[];
    hit_count: number;
    severity: string;
    sigma_hit_ids: string[];
    graph_nodes: { id: string; label: string; type: string }[];
    graph_edges: { source: string; target: string; label: string }[];
}

const SEVERITY_COLOR: Record<string, string> = {
    critical: "text-red-400 bg-red-400/10 border-red-400/30",
    high: "text-orange-400 bg-orange-400/10 border-orange-400/30",
    medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    low: "text-blue-400 bg-blue-400/10 border-blue-400/30",
    informational: "text-muted-foreground bg-secondary border-border",
};

// Kill-chain tactic order for display
const TACTIC_ORDER = [
    "initial_access", "execution", "persistence", "privilege_escalation",
    "defense_evasion", "credential_access", "discovery", "lateral_movement",
    "collection", "command_and_control", "exfiltration", "impact",
];

function TacticPill({ tactic }: { tactic: string }) {
    const idx = TACTIC_ORDER.indexOf(tactic);
    const label = tactic.replace(/_/g, " ").toUpperCase();
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-primary/30 bg-primary/5 text-primary text-xs font-mono rounded-sm">
            {idx >= 0 && <span className="opacity-50">TA{String(idx + 1).padStart(4, "0")} </span>}
            {label}
        </span>
    );
}

function TechniquePill({ tech }: { tech: string }) {
    return (
        <span className="inline-flex items-center px-2 py-0.5 border border-amber-500/30 bg-amber-500/5 text-amber-400 text-xs font-mono rounded-sm">
            {tech}
        </span>
    );
}

function ChainCard({ chain }: { chain: AttackChain }) {
    const sevClass = SEVERITY_COLOR[chain.severity] ?? SEVERITY_COLOR.informational;
    const sortedTactics = [...chain.tactics].sort(
        (a, b) => TACTIC_ORDER.indexOf(a) - TACTIC_ORDER.indexOf(b)
    );

    return (
        <div className="border border-border rounded-sm p-4 space-y-3 font-mono text-sm bg-secondary/10">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground">
                        {chain.window_start
                            ? new Date(chain.window_start).toLocaleString()
                            : "NO TIMESTAMP"}
                        {chain.window_end &&
                            ` — ${new Date(chain.window_end).toLocaleString()}`}
                    </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                        {chain.hit_count} HIT{chain.hit_count !== 1 ? "S" : ""}
                    </span>
                    <span
                        className={`px-2 py-0.5 border text-xs uppercase rounded-sm ${sevClass}`}
                    >
                        {chain.severity}
                    </span>
                </div>
            </div>

            {/* Kill chain flow */}
            {sortedTactics.length > 0 && (
                <div className="space-y-1">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        KILL CHAIN
                    </div>
                    <div className="flex flex-wrap gap-1 items-center">
                        {sortedTactics.map((t, i) => (
                            <span key={t} className="flex items-center gap-1">
                                <TacticPill tactic={t} />
                                {i < sortedTactics.length - 1 && (
                                    <span className="text-muted-foreground/40">→</span>
                                )}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Techniques */}
            {chain.techniques.length > 0 && (
                <div className="space-y-1">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        TECHNIQUES
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {chain.techniques.map((t) => (
                            <TechniquePill key={t} tech={t} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AttackChains() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();

    const { data: chains = [], isLoading, error } = useQuery<AttackChain[]>({
        queryKey: ["attack-chains", incidentId],
        queryFn: () => apiGet<AttackChain[]>(`/processing/incident/${incidentId}/attack-chains`),
        retry: false,
    });

    const critical = chains.filter((c) => c.severity === "critical").length;
    const high = chains.filter((c) => c.severity === "high").length;
    const totalHits = chains.reduce((s, c) => s + c.hit_count, 0);

    return (
        <AppLayout
            title="ATT&CK CHAIN RECONSTRUCTION"
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
            <div className="p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                    <TacticalPanel title="CHAINS DETECTED" status="active">
                        <div className="text-3xl font-mono font-bold text-primary pt-1">
                            {chains.length}
                        </div>
                    </TacticalPanel>
                    <TacticalPanel title="CRITICAL / HIGH">
                        <div className="text-3xl font-mono font-bold text-orange-400 pt-1">
                            {critical + high}
                        </div>
                    </TacticalPanel>
                    <TacticalPanel title="TOTAL SIGMA HITS">
                        <div className="text-3xl font-mono font-bold text-muted-foreground pt-1">
                            {totalHits}
                        </div>
                    </TacticalPanel>
                </div>

                {/* Chain list */}
                <TacticalPanel title="ATTACK CHAINS">
                    {isLoading ? (
                        <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground py-8">
                            <Clock className="w-4 h-4 animate-spin" />
                            LOADING ATTACK CHAINS...
                        </div>
                    ) : error ? (
                        <div className="font-mono text-sm text-muted-foreground py-6">
                            No attack chain data available. Run the forensics pipeline first.
                        </div>
                    ) : chains.length === 0 ? (
                        <div className="font-mono text-sm text-muted-foreground py-6 flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            No ATT&CK chains reconstructed — no Sigma hits with attack.* tags found.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {chains.map((chain) => (
                                <ChainCard key={chain.id} chain={chain} />
                            ))}
                        </div>
                    )}
                </TacticalPanel>
            </div>
        </AppLayout>
    );
}
