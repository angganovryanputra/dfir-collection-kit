import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { Search, Plus, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

type CorrelationResult = {
  incident_ids: string[];
  row_count: number;
  rows: Record<string, unknown>[];
};

export default function CorrelationView() {
  const { toast } = useToast();
  const [incidentIds, setIncidentIds] = useState<string[]>(["", ""]);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<CorrelationResult | null>(null);

  const addId = () => setIncidentIds(ids => [...ids, ""]);
  const removeId = (i: number) => setIncidentIds(ids => ids.filter((_, j) => j !== i));
  const updateId = (i: number, v: string) =>
    setIncidentIds(ids => ids.map((id, j) => (j === i ? v : id)));

  const handleCorrelate = async () => {
    const ids = incidentIds.filter(id => id.trim());
    if (ids.length < 2) {
      toast({ title: "Provide at least 2 incident IDs", variant: "destructive" });
      return;
    }
    setIsRunning(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ incident_ids: ids.join(",") });
      if (query) params.set("q", query);
      if (dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
      if (dateTo) params.set("date_to", new Date(dateTo).toISOString());
      const data = await apiGet<CorrelationResult>(
        `/platform/correlate-timelines?${params.toString()}`
      );
      setResult(data);
    } catch {
      toast({ title: "Correlation failed — ensure super timelines exist for all incidents", variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  const DISPLAY_COLS = ["corr_incident_id", "datetime", "host", "source", "message"];

  return (
    <AppLayout
      title="CROSS-INCIDENT TIMELINE CORRELATION"
      subtitle="Merge and search timelines across multiple incidents"
    >
      <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto w-full">
        <TacticalPanel title="CORRELATION PARAMETERS" status="active">
          <div className="space-y-4 font-mono text-sm">
            <div>
              <label className="text-xs text-muted-foreground uppercase">Incident IDs (2–10 required)</label>
              <div className="mt-2 space-y-2">
                {incidentIds.map((id, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="flex-1 h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      value={id}
                      onChange={e => updateId(i, e.target.value)}
                      placeholder={`Incident ID ${i + 1}`}
                    />
                    {incidentIds.length > 2 && (
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeId(i)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                {incidentIds.length < 10 && (
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
                    onClick={addId}
                  >
                    <Plus className="w-3 h-3" />
                    ADD INCIDENT
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase">Keyword Filter</label>
                <input
                  className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="e.g. mimikatz"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase">Date From</label>
                <input
                  type="datetime-local"
                  className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase">Date To</label>
                <input
                  type="datetime-local"
                  className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                />
              </div>
            </div>
            <Button variant="tactical" size="sm" disabled={isRunning} onClick={handleCorrelate}>
              <Search className="w-4 h-4 mr-2" />
              {isRunning ? "CORRELATING..." : "CORRELATE TIMELINES"}
            </Button>
          </div>
        </TacticalPanel>

        {result && (
          <TacticalPanel
            title={`CORRELATION RESULTS — ${result.row_count} EVENTS ACROSS ${result.incident_ids.length} INCIDENTS`}
            status="online"
          >
            <div className="font-mono text-xs space-y-2">
              <div className="text-muted-foreground">
                Incidents: {result.incident_ids.join(", ")} | Showing up to 200 events sorted by datetime
              </div>
              {result.rows.length === 0 ? (
                <div className="text-muted-foreground py-4">No correlated events found with the given filters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {DISPLAY_COLS.map(col => (
                          <th
                            key={col}
                            className="text-left text-muted-foreground px-2 py-1 border-b border-border text-xs uppercase whitespace-nowrap"
                          >
                            {col.replace("corr_", "")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 200).map((row, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-secondary/30">
                          {DISPLAY_COLS.map(col => (
                            <td
                              key={col}
                              className="px-2 py-1 truncate max-w-[250px]"
                              title={String(row[col] ?? "")}
                            >
                              {String(row[col] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.rows.length > 200 && (
                    <div className="text-muted-foreground mt-2 text-xs">
                      Showing 200 of {result.rows.length} results. Use date/keyword filters to narrow.
                    </div>
                  )}
                </div>
              )}
            </div>
          </TacticalPanel>
        )}
      </div>
    </AppLayout>
  );
}
