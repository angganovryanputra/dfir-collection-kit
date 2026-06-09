import React, { useState, useMemo, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { TablePagination } from "@/components/TablePagination";
import { StatCard } from "@/components/common/StatCard";
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
  Database
} from "lucide-react";
import type { Incident, Collector } from "@/types/dfir";
import { apiGet } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

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

const IncidentRow = memo(({ incident, onClick }: { incident: Incident; onClick: (i: Incident) => void }) => {
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
            className="border border-border bg-secondary/30 p-4 hover:border-primary/40 hover:bg-secondary/50 hover:scale-[1.01] hover:shadow-[0_0_12px_rgba(21,245,116,0.05)] transition-all duration-300 transition-spring cursor-pointer group relative overflow-hidden"
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 86px" }}
            onClick={() => onClick(incident)}
        >
            {/* Slide-in vertical accent line on hover */}
            <div className="absolute top-0 left-0 bottom-0 w-[1.5px] bg-primary scale-y-0 group-hover:scale-y-100 transition-transform duration-300 transition-spring origin-top" />
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-sm font-bold text-foreground">{incident.id}</span>
                        <span className="font-mono text-xs px-2 py-0.5 bg-primary/10 text-primary border border-primary/30">
                            {incident.type.replace(/_/g, " ")}
                        </span>
                        {isCollectionDone && (
                            <span className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 border border-green-500/30 bg-green-500/10 text-green-400 rounded-sm">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                ANALYSIS READY
                            </span>
                        )}
                        {isCollecting && (
                            <span className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 border border-primary/30 bg-primary/10 text-primary rounded-sm animate-pulse">
                                COLLECTING…
                            </span>
                        )}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground space-y-1">
                        <div>TARGETS: {incident.targetEndpoints.slice(0, 4).join(", ")}{incident.targetEndpoints.length > 4 ? ` +${incident.targetEndpoints.length - 4}` : ""}</div>
                        <div>OPERATOR: {incident.operator}</div>
                    </div>
                </div>
                <div className="text-right space-y-2 shrink-0">
                    {getIndicator(incident.status)}
                    <div className="font-mono text-xs text-muted-foreground">
                        {new Date(incident.updatedAt).toLocaleString()}
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                </div>
            </div>
        </div>
    );
});
IncidentRow.displayName = "IncidentRow";

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const [incidentSearch, setIncidentSearch] = useState("");
  const [incidentStatusFilter, setIncidentStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const debouncedSearch = useDebounce(incidentSearch, 350);

  const incidentParams = useMemo(() => {
      const p = new URLSearchParams({ 
        limit: itemsPerPage.toString(),
        offset: ((currentPage - 1) * itemsPerPage).toString()
      });
      if (debouncedSearch) p.set("search", debouncedSearch);
      if (incidentStatusFilter) p.set("status", incidentStatusFilter);
      return p.toString();
  }, [debouncedSearch, incidentStatusFilter, currentPage, itemsPerPage]);

  const { data: incidentData, error: incError } = useQuery({
    queryKey: ["incidents", debouncedSearch, incidentStatusFilter, currentPage, itemsPerPage],
    queryFn: () => apiGet<{ total: number; items: IncidentResponse[] }>(`/incidents?${incidentParams}`),
    staleTime: 20_000,
  });

  const incidents = useMemo(() => incidentData?.items.map(mapIncident) ?? [], [incidentData]);
  const totalItems = incidentData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const { data: collectors = [], refetch: refetchCollectors } = useQuery<CollectorResponse[], Error, Collector[]>({
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

  return (
    <AppLayout
      title="COMMAND CENTER"
      subtitle="DFIR RAPID COLLECTION KIT"
      showWarning={hasActiveCollection}
      headerActions={
        <Button variant="tactical" onClick={() => navigate("/incidents/create")}>
          <Plus className="w-4 h-4 mr-2" />
          CREATE INCIDENT
        </Button>
      }
    >
      <div className="p-6 space-y-6">
        {/* Alerts Section */}
        {(!toolsConfigured || errorMessage) && (
            <div className="space-y-2">
                {!toolsConfigured && (
                  <div className="border border-warning/40 bg-warning/5 p-3 font-mono text-xs text-warning flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <ShieldAlert className="w-4 h-4" />
                        <span>
                          CRITICAL: FORENSICS TOOLS NOT CONFIGURED — Analysis capabilities (Hayabusa/Chainsaw) are currently offline.
                        </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-warning border border-warning/40 hover:bg-warning/10 h-7"
                      onClick={() => navigate("/admin/settings")}
                    >
                      RESOLVE
                    </Button>
                  </div>
                )}
                {errorMessage && (
                  <div className="border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs text-destructive flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{errorMessage}</span>
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
          />
          <StatCard
            icon={<HardDrive className="w-5 h-5 text-primary" />}
            value={`${onlineCollectors}/${collectors.length}`}
            valueClassName="text-primary"
            label="Collectors Online"
          />
          <StatCard
            icon={<Database className="w-5 h-5 text-primary" />}
            value={String(totalEvidenceFiles)}
            valueClassName="text-primary"
            label="Evidence Items"
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
                <span className="font-mono text-xs text-primary">
                  {totalItems} TOTAL INCIDENTS
                </span>
              }
            >
              <div className="flex items-center gap-2 mb-3">
                <input
                  className="flex-1 h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Search incident ID or operator..."
                  value={incidentSearch}
                  onChange={e => {
                    setIncidentSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                />
                <select
                  className="h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none"
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
                  <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                    No incidents available.
                  </div>
                ) : (
                  incidents.map((incident) => (
                      <IncidentRow 
                        key={incident.id} 
                        incident={incident} 
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
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <HardDrive className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-mono text-sm truncate">{collector.name}</span>
                    </div>
                    <StatusIndicator 
                        status={collector.status === "ONLINE" ? "online" : collector.status === "BUSY" ? "pending" : "offline"} 
                        size="sm" 
                    />
                  </div>
                ))}
                {collectors.length > 10 && (
                    <div className="text-center pt-2">
                        <Button variant="link" size="sm" onClick={() => navigate("/collectors")} className="text-[10px] h-auto p-0">
                            VIEW ALL {collectors.length} COLLECTORS →
                        </Button>
                    </div>
                )}
              </div>
            </TacticalPanel>

            {/* System Alerts */}
            <TacticalPanel title="SYSTEM ALERTS" status={systemAlerts > 0 ? "warning" : "online"}>
              <div className="space-y-3">
                {systemAlerts === 0 ? (
                  <div className="p-3 text-center font-mono text-xs text-muted-foreground">
                    No active alerts.
                  </div>
                ) : (
                  <>
                    {hasStorageWarning && (
                      <div className="flex items-start gap-3 p-3 bg-warning/5 border border-warning/20">
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <div className="font-mono text-xs space-y-1">
                          <div className="text-warning font-bold">STORAGE WARNING</div>
                          <div className="text-muted-foreground">
                            Evidence vault at {formattedStoragePercent} capacity
                          </div>
                        </div>
                      </div>
                    )}
                    {offlineCollector && (
                      <div className="flex items-start gap-3 p-3 bg-destructive/5 border border-destructive/20">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <div className="font-mono text-xs space-y-1">
                          <div className="text-destructive font-bold">COLLECTOR OFFLINE</div>
                          <div className="text-muted-foreground">
                            {offlineCollector.name} last seen {offlineCollectorLastSeen}
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
      </div>
    </AppLayout>
  );
}
