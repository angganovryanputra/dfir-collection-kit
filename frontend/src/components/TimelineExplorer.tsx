import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { SearchInput } from "@/components/common/SearchInput";
import { TableHeaderRow } from "@/components/common/TableHeaderRow";
import { Activity, Clock, Search, ChevronLeft, ChevronRight, Hash } from "lucide-react";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface TimelineExplorerProps {
    evidenceId: string;
    incidentId: string;
    onBack: () => void;
}

interface TimelineRow {
    [key: string]: string | null;
}

interface TimelineResponse {
    data: TimelineRow[];
    total: number;
    page: number;
    limit: number;
}

export function TimelineExplorer({ evidenceId, incidentId, onBack }: TimelineExplorerProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [page, setPage] = useState(1);
    const limit = 100;

    // Debounce search to avoid rapid API calls while hunting
    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setDebouncedQuery(searchQuery);
        setPage(1);
    };

    const { data, isLoading, error } = useQuery<TimelineResponse>({
        queryKey: ["timeline", evidenceId, debouncedQuery, page],
        queryFn: () =>
            apiGet<TimelineResponse>(
                `/evidence/timeline/${evidenceId}?page=${page}&limit=${limit}&q=${encodeURIComponent(
                    debouncedQuery
                )}`
            ),
    });

    const totalPages = data ? Math.ceil(data.total / limit) : 0;

    // Auto-detect columns from the first row of data
    // In a real scenario, Super Timeline has fixed columns like datetime, source, computer, message, etc.
    const columns = data?.data && data.data.length > 0
        ? Object.keys(data.data[0]).filter(k => !k.startsWith('_')).slice(0, 6) // limit to 6 cols for UI
        : ["datetime", "source", "computer", "message", "event_id"];

    return (
        <AppLayout
            title={`HUNT: TIMELINE EXPLORER`}
            subtitle={`INCIDENT: ${incidentId} | EVIDENCE: ${evidenceId}`}
            headerActions={
                <Button variant="ghost" onClick={onBack} size="sm">
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    RETURN TO VAULT
                </Button>
            }
        >
            <div className="p-6 h-full flex flex-col gap-6">
                {/* Hunting Query Bar */}
                <TacticalPanel title="THREAT HUNTING / QUERY" className="shrink-0">
                    <form onSubmit={handleSearchSubmit} className="flex items-center gap-4">
                        <div className="flex-1">
                            <SearchInput
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Enter Sigma Query, Term, or Wildcard (e.g. *powershell* AND EventID:4104)..."
                                className="w-full text-lg font-mono py-6"
                            />
                        </div>
                        <Button type="submit" variant="tactical" size="lg" className="px-8" disabled={isLoading}>
                            <Search className="w-5 h-5 mr-3" />
                            EXECUTE HUNT
                        </Button>
                    </form>

                    <div className="flex items-center gap-2 mt-4">
                        <span className="font-mono text-xs text-muted-foreground">QUICK HUNTS:</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => { setSearchQuery("mimikatz"); setDebouncedQuery("mimikatz"); setPage(1); }} className="h-6 text-xs font-mono">mimikatz</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => { setSearchQuery("suspicious_powershell"); setDebouncedQuery("suspicious_powershell"); setPage(1); }} className="h-6 text-xs font-mono">suspicious_powershell</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => { setSearchQuery("whoami"); setDebouncedQuery("whoami"); setPage(1); }} className="h-6 text-xs font-mono">whoami /all</Button>
                    </div>
                </TacticalPanel>

                {/* Timeline Grid */}
                <TacticalPanel
                    title="SUPER TIMELINE (LOG2TIMELINE OUT)"
                    className="flex-1 flex flex-col min-h-0"
                    status={isLoading ? "active" : "online"}
                >
                    {/* Pagination Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-border mb-4 shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 font-mono text-xs text-primary">
                                <Hash className="w-3 h-3" />
                                TOTAL EVENTS MATCHED: {data?.total ?? 0}
                            </div>
                        </div>
                        <div className="flex items-center gap-4 font-mono text-xs">
                            <span className="text-muted-foreground text-xs uppercase bg-secondary px-2 rounded">
                                PAGE {page} OF {totalPages || 1}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1 || isLoading}
                                className="h-7"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" /> PREV
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages || totalPages === 0 || isLoading}
                                className="h-7"
                            >
                                NEXT <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-auto relative min-h-[300px]">
                        {error ? (
                            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                                <div className="font-mono text-sm text-destructive border border-destructive/40 bg-destructive/10 p-4">
                                    ERROR EXECUTING QUERY: {(error as Error).message}
                                </div>
                            </div>
                        ) : isLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                                <div className="font-mono text-sm text-muted-foreground flex flex-col items-center gap-4">
                                    <Activity className="w-8 h-8 animate-pulse text-primary" />
                                    SEARCHING TIMELINE ARCHIVE...
                                </div>
                            </div>
                        ) : !data?.data || data.data.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                                <div className="font-mono text-sm text-muted-foreground flex flex-col items-center gap-4">
                                    <Search className="w-8 h-8 opacity-50" />
                                    NO EVENTS FOUND MATCHING QUERY
                                </div>
                            </div>
                        ) : (
                            <div className="w-full text-left font-mono text-xs">
                                <div className="grid border-b border-border pb-2 mb-2 sticky top-0 bg-background/95 backdrop-blur z-10"
                                    style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(100px, 1fr))` }}>
                                    {columns.map(col => (
                                        <div key={col} className="px-2 font-bold text-muted-foreground uppercase truncate">
                                            {col}
                                        </div>
                                    ))}
                                </div>

                                {data.data.map((row, i) => (
                                    <div
                                        key={i}
                                        className={`grid py-2 border-b border-border/30 hover:bg-primary/10 transition-colors ${
                                            // Optional: Highlight sigma alerts if there's a specific column indicating it
                                            row['rule_title'] || row['sigma_level'] ? 'bg-warning/10 border-l-2 border-l-warning' : ''
                                            }`}
                                        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(100px, 1fr))` }}
                                    >
                                        {columns.map(col => {
                                            let val = row[col];
                                            if (val && typeof val === 'string' && val.length > 100) {
                                                val = val.substring(0, 100) + "..."; // truncate for view
                                            }
                                            return (
                                                <div key={col} className="px-2 truncate" title={row[col] || ""}>
                                                    {col === 'datetime' ? (
                                                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                                                            <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                                                            {val}
                                                        </span>
                                                    ) : val || '-'}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </TacticalPanel>
            </div>
        </AppLayout>
    );
}
