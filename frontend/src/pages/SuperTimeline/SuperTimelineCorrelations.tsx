import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Result = {
    items: { rule_id: string; rule_name: string; host: string; description: string }[];
    coverage: { examined_candidates: number; candidate_limit: number; truncated: boolean; result_count: number; result_limit: number; results_truncated: boolean };
};

export function SuperTimelineCorrelations({ incidentId, snapshot }: { incidentId: string; snapshot?: string | null }) {
    const { data, error, isFetching, refetch } = useQuery<Result>({
        queryKey: ["timeline-correlations", incidentId, snapshot],
        queryFn: () => apiGet(`/processing/incident/${incidentId}/correlations?with_coverage=true`),
        enabled: false,
        retry: false,
    });
    return <details className="border-b border-border/40 px-6 py-2 text-xs font-mono">
        <summary className="cursor-pointer text-muted-foreground">MULTI-EVENT CORRELATIONS</summary>
        <div className="mt-2 space-y-2">
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "ANALYZING…" : "RUN CORRELATION"}</Button>
            {error && <p role="alert" className="text-destructive">{error.message}</p>}
            {data && <>
                <p role="status" className={data.coverage.truncated ? "text-yellow-400" : "text-muted-foreground"}>
                    Examined {data.coverage.examined_candidates.toLocaleString()} relevant event candidates. {data.coverage.truncated ? `Coverage is partial (limit ${data.coverage.candidate_limit.toLocaleString()}); later events were not analyzed.` : "All candidates for the configured rules were examined."}
                </p>
                {!data.items.length && <p>No correlations recorded within this coverage.</p>}
                {data.coverage.results_truncated && <p className="text-yellow-400">Showing the first {data.coverage.result_limit.toLocaleString()} of {data.coverage.result_count.toLocaleString()} findings, ordered by confidence.</p>}
                <div className="max-h-48 overflow-auto space-y-2">
                    {data.items.map((item, index) => <div key={`${item.rule_id}-${index}`} className="rounded-sm border border-border/40 p-2">
                        <strong>{item.rule_name} · {item.host}</strong><p className="text-muted-foreground">{item.description}</p>
                    </div>)}
                </div>
            </>}
        </div>
    </details>;
}
