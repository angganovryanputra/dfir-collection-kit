import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { Button } from "@/components/ui/button";
import {
  Server,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface CollectorOut {
  id: string;
  name: string;
  endpoint: string;
  status: string;
  last_heartbeat: string | null;
}

export default function Collectors() {
  const queryClient = useQueryClient();
  const userRole = getStoredRole();
  const isAdmin = userRole === "admin";

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEndpoint, setNewEndpoint] = useState("");
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: collectors = [], isLoading, refetch, isRefetching } = useQuery<CollectorOut[]>({
    queryKey: ["collectors-page"],
    queryFn: () => apiGet<CollectorOut[]>("/collectors"),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const onlineCount = collectors.filter((c) => c.status.toUpperCase() === "ONLINE").length;

  const handleAdd = async () => {
    if (!newName.trim() || !newEndpoint.trim()) {
      setErrorMsg("Name and endpoint are required.");
      return;
    }
    setAdding(true);
    setErrorMsg(null);
    try {
      await apiPost("/collectors", { name: newName.trim(), endpoint: newEndpoint.trim() });
      await queryClient.invalidateQueries({ queryKey: ["collectors-page"] });
      setNewName("");
      setNewEndpoint("");
      setShowAdd(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add collector.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/collectors/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["collectors-page"] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete collector.");
    }
  };

  const fmtHeartbeat = (ts: string | null) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
  };

  const statusChip = (status: string) => {
    const upper = status.toUpperCase();
    if (upper === "ONLINE") return <StatusIndicator status="online" label="ONLINE" size="sm" />;
    if (upper === "BUSY")   return <StatusIndicator status="pending" label="BUSY" size="sm" />;
    return <StatusIndicator status="offline" label="OFFLINE" size="sm" />;
  };

  return (
    <AppLayout
      title="COLLECTORS"
      subtitle="AGENT COLLECTION NODES"
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            disabled={isRefetching}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isRefetching && "animate-spin")} />
            REFRESH
          </Button>
          {isAdmin && (
            <Button variant="tactical" size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-2" />
              ADD COLLECTOR
            </Button>
          )}
        </div>
      }
    >
      <div className="p-6 space-y-5">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground font-mono text-xs">
              <Server className="w-4 h-4" />
              TOTAL COLLECTORS
            </div>
            <div className="font-mono text-2xl font-bold text-foreground">{collectors.length}</div>
          </div>
          <div className="border border-green-500/30 bg-green-500/5 p-4 space-y-1">
            <div className="flex items-center gap-2 text-green-400 font-mono text-xs">
              <Wifi className="w-4 h-4" />
              ONLINE
            </div>
            <div className="font-mono text-2xl font-bold text-green-400">{onlineCount}</div>
          </div>
          <div className="border border-border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground font-mono text-xs">
              <WifiOff className="w-4 h-4" />
              OFFLINE / BUSY
            </div>
            <div className="font-mono text-2xl font-bold text-muted-foreground">
              {collectors.length - onlineCount}
            </div>
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
            {errorMsg}
          </div>
        )}

        {/* Add Collector form */}
        {showAdd && isAdmin && (
          <TacticalPanel title="ADD COLLECTOR NODE">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground uppercase">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. GAMMA-NODE"
                    className="w-full px-3 py-2 bg-secondary border border-border font-mono text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-xs text-muted-foreground uppercase">Endpoint URL</label>
                  <input
                    type="text"
                    value={newEndpoint}
                    onChange={(e) => setNewEndpoint(e.target.value)}
                    placeholder="http://192.168.1.202:8080"
                    className="w-full px-3 py-2 bg-secondary border border-border font-mono text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void handleAdd()} disabled={adding}>
                  {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  ADD
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setErrorMsg(null); }}>
                  CANCEL
                </Button>
              </div>
            </div>
          </TacticalPanel>
        )}

        {/* Collector list */}
        <TacticalPanel
          title="REGISTERED COLLECTORS"
          status={collectors.length === 0 ? "offline" : onlineCount > 0 ? "online" : "warning"}
          headerActions={
            <span className="font-mono text-xs text-primary">{onlineCount}/{collectors.length} ONLINE</span>
          }
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : collectors.length === 0 ? (
            <div className="py-8 text-center font-mono text-xs text-muted-foreground">
              No collectors registered.
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-border bg-secondary/30">
                <div className="col-span-3 font-mono text-xs text-muted-foreground uppercase">NAME</div>
                <div className="col-span-4 font-mono text-xs text-muted-foreground uppercase">ENDPOINT</div>
                <div className="col-span-2 font-mono text-xs text-muted-foreground uppercase">STATUS</div>
                <div className="col-span-2 font-mono text-xs text-muted-foreground uppercase">LAST HEARTBEAT</div>
                <div className="col-span-1" />
              </div>
              {collectors.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors items-center"
                >
                  <div className="col-span-3 flex items-center gap-2">
                    <Server className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-mono text-sm font-bold truncate">{c.name}</span>
                  </div>
                  <div className="col-span-4 font-mono text-xs text-muted-foreground truncate">{c.endpoint}</div>
                  <div className="col-span-2">{statusChip(c.status)}</div>
                  <div className="col-span-2 font-mono text-xs text-muted-foreground">
                    {fmtHeartbeat(c.last_heartbeat)}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDelete(c.id)}
                        title="Remove collector"
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TacticalPanel>
      </div>
    </AppLayout>
  );
}
