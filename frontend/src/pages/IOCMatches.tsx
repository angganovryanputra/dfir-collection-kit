import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ShieldAlert, Globe, Hash, Wifi } from "lucide-react";
import { apiGet } from "@/lib/api";

interface IOCMatch {
    id: string;
    incident_id: string;
    ioc_type: string;
    ioc_value: string;
    matched_field: string;
    matched_value: string;
    event_source: string | null;
    event_timestamp: string | null;
    severity: string;
    detected_at: string;
}

interface IOCMatchList {
    total: number;
    items: IOCMatch[];
}

const IOC_TYPES = ["all", "ip", "domain", "sha256", "md5", "sha1"];

const TYPE_ICONS: Record<string, React.ReactNode> = {
    ip: <Wifi className="w-3 h-3" />,
    domain: <Globe className="w-3 h-3" />,
    sha256: <Hash className="w-3 h-3" />,
    md5: <Hash className="w-3 h-3" />,
    sha1: <Hash className="w-3 h-3" />,
};

const SEVERITY_COLOR: Record<string, string> = {
    critical: "text-red-400 border-red-400/30 bg-red-400/10",
    high: "text-orange-400 border-orange-400/30 bg-orange-400/10",
    medium: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    low: "text-blue-400 border-blue-400/30 bg-blue-400/10",
};

export default function IOCMatches() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();
    const [activeType, setActiveType] = useState("all");
    const [page, setPage] = useState(1);
    const LIMIT = 100;

    const { data, isLoading, error } = useQuery<IOCMatchList>({
        queryKey: ["ioc-matches", incidentId, activeType, page],
        queryFn: () =>
            apiGet<IOCMatchList>(
                `/processing/incident/${incidentId}/ioc-matches?` +
                new URLSearchParams({
                    ...(activeType !== "all" ? { ioc_type: activeType } : {}),
                    limit: String(LIMIT),
                    offset: String((page - 1) * LIMIT),
                })
            ),
        retry: false,
    });

    const matches = data?.items ?? [];
    const total = data?.total ?? 0;

    return (
        <AppLayout
            title="IOC MATCHES"
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
                <TacticalPanel title="IOC SCAN RESULTS" status={total > 0 ? "offline" : "online"}>
                    <div className="flex items-center gap-6 font-mono text-sm pt-1">
                        <div>
                            <span className="text-3xl font-bold text-primary">{total}</span>
                            <span className="text-muted-foreground ml-2 text-sm">MATCHES</span>
                        </div>
                        {total > 0 && (
                            <div className="flex items-center gap-2 text-xs text-destructive">
                                <ShieldAlert className="w-4 h-4" />
                                KNOWN BAD INDICATORS FOUND IN TIMELINE
                            </div>
                        )}
                        {total === 0 && !isLoading && !error && (
                            <div className="text-xs text-muted-foreground">
                                No IOC matches found — timeline is clean or no indicators configured.
                            </div>
                        )}
                    </div>
                </TacticalPanel>

                {/* Type filter */}
                <div className="flex flex-wrap gap-2 font-mono text-xs">
                    {IOC_TYPES.map((t) => (
                        <button
                            key={t}
                            onClick={() => { setActiveType(t); setPage(1); }}
                            className={`flex items-center gap-1 px-3 py-1.5 border rounded-sm uppercase transition-colors ${
                                activeType === t
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                        >
                            {t !== "all" && TYPE_ICONS[t]}
                            {t}
                        </button>
                    ))}
                </div>

                {/* Table */}
                <TacticalPanel title={`MATCHES (${total})`}>
                    {isLoading ? (
                        <div className="font-mono text-sm text-muted-foreground py-8">
                            SCANNING TIMELINE FOR IOC MATCHES...
                        </div>
                    ) : error ? (
                        <div className="font-mono text-sm text-muted-foreground py-6">
                            No IOC data available. Run the forensics pipeline first.
                        </div>
                    ) : matches.length === 0 ? (
                        <div className="font-mono text-sm text-muted-foreground py-6">
                            No matches for selected filter.
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full font-mono text-xs">
                                    <thead>
                                        <tr className="text-left text-muted-foreground border-b border-border">
                                            <th className="pb-2 pr-4 font-normal uppercase">TYPE</th>
                                            <th className="pb-2 pr-4 font-normal uppercase">IOC VALUE</th>
                                            <th className="pb-2 pr-4 font-normal uppercase">MATCHED FIELD</th>
                                            <th className="pb-2 pr-4 font-normal uppercase">SOURCE</th>
                                            <th className="pb-2 pr-4 font-normal uppercase">TIMESTAMP</th>
                                            <th className="pb-2 font-normal uppercase">SEVERITY</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {matches.map((m) => {
                                            const sevClass =
                                                SEVERITY_COLOR[m.severity] ??
                                                "text-muted-foreground border-border bg-secondary";
                                            return (
                                                <tr
                                                    key={m.id}
                                                    className="border-b border-border/40 hover:bg-secondary/30 transition-colors"
                                                >
                                                    <td className="py-2 pr-4">
                                                        <span className="flex items-center gap-1 text-primary uppercase">
                                                            {TYPE_ICONS[m.ioc_type]}
                                                            {m.ioc_type}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 pr-4 font-bold text-foreground max-w-[200px] truncate">
                                                        {m.ioc_value}
                                                    </td>
                                                    <td className="py-2 pr-4 text-muted-foreground">
                                                        {m.matched_field}
                                                    </td>
                                                    <td className="py-2 pr-4 text-muted-foreground">
                                                        {m.event_source ?? "—"}
                                                    </td>
                                                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                                                        {m.event_timestamp
                                                            ? new Date(m.event_timestamp).toLocaleString()
                                                            : "—"}
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

                            {/* Pagination */}
                            {total > LIMIT && (
                                <div className="flex items-center justify-between pt-4 font-mono text-xs text-muted-foreground">
                                    <span>
                                        SHOWING {(page - 1) * LIMIT + 1}–
                                        {Math.min(page * LIMIT, total)} OF {total}
                                    </span>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page === 1}
                                            onClick={() => setPage((p) => p - 1)}
                                        >
                                            PREV
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page * LIMIT >= total}
                                            onClick={() => setPage((p) => p + 1)}
                                        >
                                            NEXT
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </TacticalPanel>
            </div>
        </AppLayout>
    );
}
