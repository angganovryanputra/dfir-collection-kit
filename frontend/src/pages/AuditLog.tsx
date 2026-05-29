import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { Search, Download, RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api";

type AuditEntry = {
  id: string;
  event_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  source: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  status: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AuditLogResponse = {
  entries: AuditEntry[];
  total: number;
};

const STATUS_COLORS: Record<string, string> = {
  success: "text-primary",
  failure: "text-destructive",
  warning: "text-yellow-500",
};

export default function AuditLog() {
  const [eventType, setEventType] = useState("");
  const [actorId, setActorId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String((page - 1) * limit),
  });
  if (eventType) params.set("event_type", eventType);
  if (actorId) params.set("actor_id", actorId);
  if (targetId) params.set("target_id", targetId);

  const { data, isLoading, refetch } = useQuery<AuditLogResponse>({
    queryKey: ["audit-log", eventType, actorId, targetId, page],
    queryFn: () => apiGet<AuditLogResponse>(`/audit-logs?${params.toString()}`),
    refetchInterval: 30_000,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;

  const handleExport = () => {
    const header = ["timestamp", "event_type", "actor_id", "action", "target_type", "target_id", "status", "message"];
    const rows = entries.map(e => [
      new Date(e.created_at).toISOString(),
      e.event_type,
      e.actor_id,
      e.action,
      e.target_type ?? "",
      e.target_id ?? "",
      e.status,
      (e.message ?? "").replace(/,/g, ";"),
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title="AUDIT LOG" subtitle={`Tamper-evident system event record — ${total.toLocaleString()} entries`}>
      <div className="p-6 flex flex-col gap-4 max-w-6xl mx-auto w-full">
        <TacticalPanel title="FILTERS" status="active">
          <div className="flex items-center gap-3 flex-wrap font-mono text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <Search className="w-3 h-3 text-muted-foreground shrink-0" />
              <input
                className="flex-1 h-7 px-2 bg-background border border-input rounded-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Target ID (incident/evidence/user)"
                value={targetId}
                onChange={e => { setTargetId(e.target.value); setPage(1); }}
              />
            </div>
            <input
              className="h-7 w-44 px-2 bg-background border border-input rounded-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Event type"
              value={eventType}
              onChange={e => { setEventType(e.target.value); setPage(1); }}
            />
            <input
              className="h-7 w-32 px-2 bg-background border border-input rounded-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Actor ID"
              value={actorId}
              onChange={e => { setActorId(e.target.value); setPage(1); }}
            />
            <Button variant="ghost" size="sm" className="h-7" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3 mr-1" />
              REFRESH
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={handleExport}
              disabled={entries.length === 0}
            >
              <Download className="w-3 h-3 mr-1" />
              EXPORT CSV
            </Button>
          </div>
        </TacticalPanel>

        <TacticalPanel title={`ENTRIES (${entries.length} of ${total})`} status="online">
          {isLoading ? (
            <div className="font-mono text-xs text-muted-foreground py-4 animate-pulse">LOADING...</div>
          ) : entries.length === 0 ? (
            <div className="font-mono text-xs text-muted-foreground py-4">No audit entries found.</div>
          ) : (
            <div className="overflow-x-auto font-mono text-xs">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    {["TIMESTAMP", "EVENT TYPE", "ACTOR", "ACTION", "TARGET", "STATUS"].map(h => (
                      <th
                        key={h}
                        className="text-left text-muted-foreground px-2 py-1.5 uppercase font-normal whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id} className="border-b border-border/30 hover:bg-secondary/20">
                      <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-primary whitespace-nowrap">{e.event_type}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{e.actor_id}</td>
                      <td className="px-2 py-1 text-muted-foreground">{e.action}</td>
                      <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                        {e.target_type ? `${e.target_type}:${e.target_id ?? ""}` : "—"}
                      </td>
                      <td
                        className={`px-2 py-1 font-bold whitespace-nowrap ${STATUS_COLORS[e.status] ?? "text-foreground"}`}
                      >
                        {e.status.toUpperCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 font-mono text-xs text-muted-foreground">
              <span>
                Page {page} of {totalPages} — {total.toLocaleString()} total entries
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  PREV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  NEXT
                </Button>
              </div>
            </div>
          )}
        </TacticalPanel>
      </div>
    </AppLayout>
  );
}
