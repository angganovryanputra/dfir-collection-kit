import React, { useState, useMemo, memo, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { TablePagination } from "@/components/TablePagination";
import { StatCard } from "@/components/common/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdaptivePolling } from "@/lib/useAdaptivePolling";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Plus,
  Activity,
  HardDrive,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ShieldAlert,
  Database,
  Archive,
  Trash2,
  X,
  Volume2,
  VolumeX,
  Search as SearchIcon
} from "lucide-react";
import type { Incident, Collector } from "@/types/dfir";
import { apiGet, apiPatch } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

// ─── Sound System (Synthesized) ───────────────────────────────────────────

const playTacticalPing = () => {
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.1);
        
        setTimeout(() => void ctx.close(), 200);
    } catch (e) {
        console.warn("Audio synthesis failed:", e);
    }
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemSettingsPartial {
  ez_tools_path: string | null;
  hayabusa_path: string | null;
  chainsaw_path: string | null;
}

interface IncidentResponse {
  id: string;
  type: Incident["type"];
  status: Incident["status"];
  template_id?: string | null;
  target_endpoints: string[];
  operator: string;
  created_at: string;
  updated_at: string;
}

interface CollectorResponse {
  id: string;
  name: string;
  status: string;
  last_heartbeat: string;
}

interface EvidenceFolderResponse {
  id: string;
  incident_id: string;
  files_count: number;
  total_size: string;
  status: string;
}

interface DiagnosticsResponse {
  storage_used_percent: number | null;
}

const normalizeCollectorStatus = (status: string): Collector["status"] => {
  const normalized = status.toUpperCase();
  if (normalized === "ONLINE" || normalized === "OFFLINE" || normalized === "BUSY") {
    return normalized;
  }
  return "OFFLINE";
};

const mapIncident = (incident: IncidentResponse): Incident => ({
  id: incident.id,
  type: incident.type,
  status: incident.status,
  templateId: incident.template_id ?? null,
  targetEndpoints: incident.target_endpoints,
  operator: incident.operator,
  createdAt: incident.created_at,
  updatedAt: incident.updated_at,
});

const mapCollector = (collector: CollectorResponse): Collector => ({
  id: collector.id,
  name: collector.name,
  status: normalizeCollectorStatus(collector.status),
  lastSeen: collector.last_heartbeat,
});

// ─── Memoized Components ──────────────────────────────────────────────────

interface IncidentRowProps {
    incident: Incident;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
    onClick: (i: Incident) => void;
}

const IncidentRow = memo(({ incident, isSelected, onToggleSelect, onClick }: IncidentRowProps) => {
    const isCollectionDone = incident.status === "COLLECTION_COMPLETE" || incident.status === "CLOSED";
    const isCollecting = incident.status === "COLLECTION_IN_PROGRESS";

    const getIndicator = (status: Incident["status"]) => {
        switch (status) {
          case "PENDING":                return <StatusIndicator status="pending" label="PENDING" />;
          case "ACTIVE":                 return <StatusIndicator status="online" label="ACTIVE" />;
          case "COLLECTION_IN_PROGRESS": return <StatusIndicator status="active" label="COLLECTING" pulse />;
          case "COLLECTION_COMPLETE":    return <StatusIndicator status="verified" label="COMPLETE" />;
          case "COLLECTION_FAILED":      return <StatusIndicator status="offline" label="FAILED" />;
          case "CLOSED":                 return <StatusIndicator status="offline" label="CLOSED" />;
          default:                       return <StatusIndicator status="pending" label={status} />;
        }
    };

    return (
        <div
            className={cn(
                "border border-border bg-secondary/30 p-4 hover:border-primary/40 hover:bg-secondary/50 hover:scale-[1.01] hover:shadow-[0_0_12px_rgba(21,245,116,0.05)] transition-all duration-300 transition-spring cursor-pointer group relative overflow-hidden flex items-center gap-4",
                isSelected && "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
            )}
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 86px" }}
            onClick={() => onClick(incident)}
        >
            <div 
                className="shrink-0 relative z-30" 
                onClick={(e) => { e.stopPropagation(); onToggleSelect(incident.id); }}
            >
                <div className={cn(
                    "w-4 h-4 border border-primary/40 rounded-sm transition-colors flex items-center justify-center",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-background/50 hover:border-primary"
                )}>
                    {isSelected && <CheckCircle2 className="w-3 h-3" />}
                </div>
            </div>

            <div className="absolute top-0 left-0 bottom-0 w-[1.5px] bg-primary scale-y-0 group-hover:scale-y-100 transition-transform duration-300 transition-spring origin-top" />
            
            <div className="flex-1 flex items-start justify-between gap-4 min-w-0">
                <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-sm font-bold text-foreground">{incident.id}</span>
                        <span className="font-mono text-[10px] px-2 py-0.5 bg-primary/10 text-primary border border-primary/30 rounded-sm font-bold tracking-tight">
                            {incident.type.replace(/_/g, " ")}
                        </span>
                        {isCollectionDone && (
                            <span className="flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 border border-green-500/30 bg-green-500/10 text-green-400 rounded-sm">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                ANALYSIS READY
                            </span>
                        )}
                        {isCollecting && (
                            <span className="flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 border border-primary/30 bg-primary/10 text-primary rounded-sm animate-pulse">
                                COLLECTING…
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-muted-foreground space-y-1">
                        <div className="truncate">TARGETS: <span className="font-mono text-foreground/80">{incident.targetEndpoints.slice(0, 4).join(", ")}{incident.targetEndpoints.length > 4 ? ` +${incident.targetEndpoints.length - 4}` : ""}</span></div>
                        <div>OPERATOR: <span className="font-mono text-foreground/80">{incident.operator}</span></div>
                    </div>
                </div>
                <div className="text-right space-y-2 shrink-0">
                    {getIndicator(incident.status)}
                    <div className="font-mono text-[10px] text-muted-foreground">
                        {new Date(incident.updatedAt).toLocaleString()}
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                </div>
            </div>
        </div>
    );
});
IncidentRow.displayName = "IncidentRow";

const DashboardSkeleton = () => (
    <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-12 gap-6">
            <div className="col-span-8">
                <Skeleton className="h-[600px]" />
            </div>
            <div className="col-span-4 space-y-6">
                <Skeleton className="h-[300px]" />
                <Skeleton className="h-[200px]" />
            </div>
        </div>
    </div>
);

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [incidentSearch, setIncidentSearch] = useState("");
  const [incidentStatusFilter, setIncidentStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const searchRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(incidentSearch, 350);

  // Keyboard Shortcut: Shift + S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.shiftKey && e.key === "S") {
            e.preventDefault();
            searchRef.current?.focus();
        }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const incidentParams = useMemo(() => {
      const p = new URLSearchParams({ 
        limit: itemsPerPage.toString(),
        offset: ((currentPage - 1) * itemsPerPage).toString()
      });
      if (debouncedSearch) p.set("search", debouncedSearch);
      if (incidentStatusFilter) p.set("status", incidentStatusFilter);
      return p.toString();
  }, [debouncedSearch, incidentStatusFilter, currentPage, itemsPerPage]);

  const { data: incidentData, error: incError, isLoading: isIncLoading } = useQuery({
    queryKey: ["incidents", debouncedSearch, incidentStatusFilter, currentPage, itemsPerPage],
    queryFn: () => apiGet<{ total: number; items: IncidentResponse[] }>(`/incidents?${incidentParams}`),
    staleTime: 20_000,
  });

  const incidents = useMemo(() => incidentData?.items.map(mapIncident) ?? [], [incidentData]);
  const totalItems = incidentData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  // Sound cue for new critical items
  useEffect(() => {
    if (soundEnabled && incidents.some(i => i.status === "COLLECTION_FAILED")) {
        playTacticalPing();
    }
  }, [incidents.length, soundEnabled]);

  const { data: collectors = [], refetch: refetchCollectors, isLoading: isCollLoading } = useQuery<CollectorResponse[], Error, Collector[]>({
    queryKey: ["collectors"],
    queryFn: () => apiGet<CollectorResponse[]>("/collectors"),
    select: (data) => data.map(mapCollector),
    staleTime: 15_000,
  });

  useAdaptivePolling({
      enabled: true,
      onPoll: async () => {
          await refetchCollectors();
          return "polled";
      },
      initialInterval: 15000,
      maxInterval: 60000,
  });

  const { data: evidenceFolders = [] } = useQuery<EvidenceFolderResponse[]>({
    queryKey: ["evidence-folders"],
    queryFn: () => apiGet<EvidenceFolderResponse[]>("/evidence/folders"),
    staleTime: 30_000,
  });

  const { data: diagnostics } = useQuery<DiagnosticsResponse>({
    queryKey: ["diagnostics"],
    queryFn: () => apiGet<DiagnosticsResponse>("/status/diagnostics"),
    enabled: getStoredRole() !== "viewer",
    staleTime: 60_000,
  });

  const role = getStoredRole();
  const { data: settings } = useQuery<SystemSettingsPartial>({
    queryKey: ["settings-tools"],
    queryFn: () => apiGet<SystemSettingsPartial>("/settings"),
    enabled: role === "admin",
    staleTime: 5 * 60 * 1000,
  });

  const toolsConfigured = !settings
    ? true // can't check → don't show warning
    : Boolean(settings.ez_tools_path || settings.hayabusa_path);

  const errorMessage = useMemo(() => {
    if (!incError) return null;
    const msg = incError instanceof Error ? incError.message : String(incError);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ECONNREFUSED")) {
      return "Cannot reach the backend server. Check network or service status.";
    }
    return "Unable to load dashboard data. The server returned an error.";
  }, [incError]);

  const activeIncidents = incidents.filter((i) => i.status !== "CLOSED").length;
  const onlineCollectors = collectors.filter((c) => c.status !== "OFFLINE").length;
  
  const hasActiveCollection = useMemo(() => incidents.some((i) => i.status === "COLLECTION_IN_PROGRESS"), [incidents]);
  const totalEvidenceFiles = useMemo(() => evidenceFolders.reduce((total, folder) => total + folder.files_count, 0), [evidenceFolders]);
  const offlineCollectors = collectors.filter((c) => c.status === "OFFLINE").length;
  const storageUsedPercent = diagnostics?.storage_used_percent ?? null;
  const hasStorageWarning = storageUsedPercent !== null && storageUsedPercent >= 75;
  const systemAlerts = offlineCollectors + (hasStorageWarning ? 1 : 0);
  
  const offlineCollector = collectors.find((collector) => collector.status === "OFFLINE");
  const formattedStoragePercent = storageUsedPercent !== null ? `${Math.round(storageUsedPercent)}%` : "--";
  const offlineCollectorLastSeen = offlineCollector ? new Date(offlineCollector.lastSeen).toLocaleString() : "";

  const handleIncidentClick = useCallback((incident: Incident) => {
    navigate(`/incidents/${incident.id}`);
  }, [navigate]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  }, []);

  const handleBulkClose = async () => {
    if (selectedIds.size === 0) return;
    try {
        await Promise.all(
            Array.from(selectedIds).map(id => apiPatch(`/incidents/${id}`, { status: "CLOSED" }))
        );
        setSelectedIds(new Set());
        void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    } catch (e) {
        console.error("Bulk action failed:", e);
    }
  };

  const isInitialLoading = (isIncLoading || isCollLoading) && !incidentData;

  return (
    <AppLayout
      title="COMMAND CENTER"
      subtitle="DFIR RAPID COLLECTION KIT"
      showWarning={hasActiveCollection}
      headerActions={
        <div className="flex items-center gap-3">
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? "Disable Tactical Audio" : "Enable Tactical Audio"}
            >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
            </Button>
            <Button variant="tactical" onClick={() => navigate("/incidents/create")}>
                <Plus className="w-4 h-4 mr-2" />
                CREATE INCIDENT
            </Button>
        </div>
      }
    >
      <div className="p-6 space-y-6 relative">
        {/* Bulk Actions Floating Bar */}
        {selectedIds.size > 0 && (
            <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] bg-background/95 border border-primary/40 shadow-[0_0_30px_rgba(21,245,116,0.15)] rounded-sm px-6 py-3 flex items-center gap-6 animate-in slide-in-from-bottom-4 duration-300 backdrop-blur-md ring-1 ring-primary/10">
                <div className="flex items-center gap-3 pr-6 border-r border-border/60">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-mono text-sm font-bold text-primary">
                        {selectedIds.size}
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Incidents Selected</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleBulkClose}
                        className="h-9 px-4 gap-2 text-primary hover:bg-primary/5 font-bold text-[10px] tracking-widest"
                    >
                        <Archive className="w-3.5 h-3.5" /> CLOSE_ALL
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-9 px-4 gap-2 text-destructive hover:bg-destructive/5 font-bold text-[10px] tracking-widest"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> PURGE_SECTOR
                    </Button>
                </div>
                <button 
                    onClick={() => setSelectedIds(new Set())}
                    className="p-1 hover:bg-secondary rounded-full transition-colors ml-4"
                >
                    <X className="w-4 h-4 text-muted-foreground" />
                </button>
            </div>
        )}

        {isInitialLoading ? (
            <DashboardSkeleton />
        ) : (
          <>
            {/* Alerts Section */}
            {(!toolsConfigured || errorMessage) && (
                <div className="space-y-2">
                    {!toolsConfigured && (
                      <div className="border border-warning/40 bg-warning/5 p-3 text-xs text-warning flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="w-4 h-4" />
                            <span className="font-medium">
                              CRITICAL: FORENSICS TOOLS NOT CONFIGURED — Analysis capabilities (Hayabusa/Chainsaw) are currently offline.
                            </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-warning border border-warning/40 hover:bg-warning/10 h-7 text-[10px]"
                          onClick={() => navigate("/admin/settings")}
                        >
                          RESOLVE
                        </Button>
                      </div>
                    )}
                    {errorMessage && (
                      <div className="border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-medium">{errorMessage}</span>
                      </div>
                    )}
                </div>
            )}

            {/* Stats HUD */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                icon={<Activity className="w-5 h-5 text-primary" />}
                value={activeIncidents}
                valueClassName="text-primary"
                label="Active Incidents (Page)"
                onClick={() => setIncidentStatusFilter("ACTIVE")}
              />
              <StatCard
                icon={<HardDrive className="w-5 h-5 text-primary" />}
                value={`${onlineCollectors}/${collectors.length}`}
                valueClassName="text-primary"
                label="Collectors Online"
                onClick={() => navigate("/collectors")}
              />
              <StatCard
                icon={<Database className="w-5 h-5 text-primary" />}
                value={String(totalEvidenceFiles)}
                valueClassName="text-primary"
                label="Evidence Items"
                onClick={() => navigate("/evidence")}
              />
              <StatCard
                icon={<AlertTriangle className={cn("w-5 h-5", systemAlerts > 0 ? "text-warning" : "text-muted-foreground")} />}
                value={String(systemAlerts)}
                valueClassName={systemAlerts > 0 ? "text-warning" : "text-muted-foreground"}
                label="System Alerts"
              />
            </div>

            <div className="grid grid-cols-12 gap-6">
              {/* Main Content - Incidents */}
              <div className="col-span-8 space-y-6">
                <TacticalPanel
                  title="ACTIVE INCIDENTS"
                  status="active"
                  headerActions={
                    <div className="flex items-center gap-4">
                      {incidentStatusFilter && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setIncidentStatusFilter("")}
                          className="h-6 px-2 text-[10px] text-primary border border-primary/20 hover:bg-primary/10"
                        >
                          CLEAR FILTER
                        </Button>
                      )}
                      <span className="font-mono text-[10px] text-primary font-bold">
                        {totalItems} TOTAL
                      </span>
                    </div>
                  }
                >
                  <div className="flex items-center gap-2 mb-3 relative">
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50">
                        <SearchIcon className="w-3.5 h-3.5" />
                    </div>
                    <input
                      ref={searchRef}
                      className="flex-1 h-9 pl-8 pr-12 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary transition-all group"
                      placeholder="Search incident ID or operator... (Shift + S)"
                      value={incidentSearch}
                      onChange={e => {
                        setIncidentSearch(e.target.value);
                        setCurrentPage(1);
                      }}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:block">
                        <kbd className="px-1.5 py-0.5 bg-secondary border border-border rounded text-[9px] text-muted-foreground font-mono">⇧S</kbd>
                    </div>
                    <select
                      className="h-9 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none cursor-pointer"
                      value={incidentStatusFilter}
                      onChange={e => {
                        setIncidentStatusFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                    >
                      <option value="">ALL STATUS</option>
                      <option value="PENDING">PENDING</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="COLLECTION_IN_PROGRESS">COLLECTING</option>
                      <option value="COLLECTION_COMPLETE">COMPLETE</option>
                      <option value="COLLECTION_FAILED">FAILED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    {incidents.length === 0 ? (
                      <div className="px-4 py-12 text-center text-xs text-muted-foreground border border-dashed border-border/40">
                        No incidents matching the current criteria.
                      </div>
                    ) : (
                      incidents.map((incident) => (
                          <IncidentRow 
                            key={incident.id} 
                            incident={incident} 
                            isSelected={selectedIds.has(incident.id)}
                            onToggleSelect={toggleSelect}
                            onClick={handleIncidentClick} 
                          />
                      ))
                    )}
                  </div>
                  <TablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={(val) => {
                      setItemsPerPage(val);
                      setCurrentPage(1);
                    }}
                  />
                </TacticalPanel>
              </div>

              {/* Sidebar - System Status */}
              <div className="col-span-4 space-y-6">
                {/* Collectors Status */}
                <TacticalPanel
                  title="COLLECTOR STATUS"
                  status={onlineCollectors === collectors.length ? "online" : "warning"}
                >
                  <div className="space-y-3">
                    {collectors.slice(0, 10).map((collector) => (
                      <div
                        key={collector.id}
                        className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <HardDrive className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate">{collector.name}</span>
                        </div>
                        <StatusIndicator 
                            status={collector.status === "ONLINE" ? "online" : collector.status === "BUSY" ? "pending" : "offline"} 
                            size="sm" 
                        />
                      </div>
                    ))}
                    {collectors.length > 10 && (
                        <div className="text-center pt-2">
                            <Button variant="link" size="sm" onClick={() => navigate("/collectors")} className="text-[10px] h-auto p-0 text-primary/80 hover:text-primary">
                                VIEW ALL {collectors.length} COLLECTORS →
                            </Button>
                        </div>
                    )}
                    {collectors.length === 0 && (
                      <div className="py-4 text-center text-[10px] text-muted-foreground">
                        No collectors registered.
                      </div>
                    )}
                  </div>
                </TacticalPanel>

                {/* System Alerts */}
                <TacticalPanel title="SYSTEM ALERTS" status={systemAlerts > 0 ? "warning" : "online"}>
                  <div className="space-y-3">
                    {systemAlerts === 0 ? (
                      <div className="p-3 text-center text-[10px] text-muted-foreground bg-secondary/10 border border-dashed border-border/40">
                        SYSTEM INTEGRITY NOMINAL
                      </div>
                    ) : (
                      <>
                        {hasStorageWarning && (
                          <div className="flex items-start gap-3 p-3 bg-warning/5 border border-warning/20">
                            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                            <div className="text-[11px] space-y-1">
                              <div className="text-warning font-bold">STORAGE WARNING</div>
                              <div className="text-muted-foreground leading-tight">
                                Evidence vault is reaching capacity ({formattedStoragePercent}). Consider offloading evidence.
                              </div>
                            </div>
                          </div>
                        )}
                        {offlineCollector && (
                          <div className="flex items-start gap-3 p-3 bg-destructive/5 border border-destructive/20">
                            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            <div className="text-[11px] space-y-1">
                              <div className="text-destructive font-bold">COLLECTOR OFFLINE</div>
                              <div className="text-muted-foreground leading-tight">
                                {offlineCollector.name} has missed heartbeats since {offlineCollectorLastSeen}.
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </TacticalPanel>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
