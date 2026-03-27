import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { TablePagination } from "@/components/TablePagination";
import { StatCard } from "@/components/common/StatCard";
import { usePagination } from "@/hooks/usePagination";
import {
  Plus,
  Activity,
  HardDrive,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import type { Incident, Collector } from "@/types/dfir";
import { apiGet } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";

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

export default function Dashboard() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [evidenceFolders, setEvidenceFolders] = useState<EvidenceFolderResponse[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const incidentsQuery = useQuery<IncidentResponse[]>({
    queryKey: ["incidents"],
    queryFn: () => apiGet<IncidentResponse[]>("/incidents"),
  });

  const collectorsQuery = useQuery<CollectorResponse[]>({
    queryKey: ["collectors"],
    queryFn: () => apiGet<CollectorResponse[]>("/collectors"),
  });

  const evidenceQuery = useQuery<EvidenceFolderResponse[]>({
    queryKey: ["evidence-folders"],
    queryFn: () => apiGet<EvidenceFolderResponse[]>("/evidence/folders"),
  });

  const diagnosticsQuery = useQuery<DiagnosticsResponse>({
    queryKey: ["diagnostics"],
    queryFn: () => apiGet<DiagnosticsResponse>("/status/diagnostics"),
    enabled: getStoredRole() !== "viewer",
  });

  useEffect(() => {
    if (incidentsQuery.error || collectorsQuery.error || evidenceQuery.error) {
      setErrorMessage("Unable to load dashboard data.");
    }
  }, [incidentsQuery.error, collectorsQuery.error, evidenceQuery.error]);

  useEffect(() => {
    if (incidentsQuery.data) {
      setIncidents(incidentsQuery.data.map(mapIncident));
      setErrorMessage(null);
    }
  }, [incidentsQuery.data]);

  useEffect(() => {
    if (collectorsQuery.data) {
      setCollectors(collectorsQuery.data.map(mapCollector));
      setErrorMessage(null);
    }
  }, [collectorsQuery.data]);

  useEffect(() => {
    if (evidenceQuery.data) {
      setEvidenceFolders(evidenceQuery.data);
      setErrorMessage(null);
    }
  }, [evidenceQuery.data]);


  const {
    paginatedItems: paginatedIncidents,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    goToPage,
    setPerPage,
  } = usePagination(incidents);

  const activeIncidents = incidents.filter((i) => i.status !== "CLOSED").length;
  const onlineCollectors = collectors.filter((c) => c.status !== "OFFLINE").length;
  const statusBreakdown = {
    active: incidents.filter((i) => i.status === "ACTIVE" || i.status === "PENDING").length,
    collecting: incidents.filter((i) => i.status === "COLLECTION_IN_PROGRESS").length,
    complete: incidents.filter((i) => i.status === "COLLECTION_COMPLETE").length,
    closed: incidents.filter((i) => i.status === "CLOSED").length,
  };
  const hasActiveCollection = incidents.some((i) => i.status === "COLLECTION_IN_PROGRESS");
  const totalEvidenceFiles = evidenceFolders.reduce((total, folder) => total + folder.files_count, 0);
  const offlineCollectors = collectors.filter((c) => c.status === "OFFLINE").length;
  const storageUsedPercent = diagnosticsQuery.data?.storage_used_percent ?? null;
  const hasStorageWarning = storageUsedPercent !== null && storageUsedPercent >= 75;
  const systemAlerts = offlineCollectors + (hasStorageWarning ? 1 : 0);
  const offlineCollector = collectors.find((collector) => collector.status === "OFFLINE");
  const formattedStoragePercent = storageUsedPercent !== null
    ? `${Math.round(storageUsedPercent)}%`
    : "--";
  const offlineCollectorLastSeen = offlineCollector
    ? new Date(offlineCollector.lastSeen).toLocaleString()
    : "";

  const getIncidentStatusIndicator = (status: Incident["status"]) => {
    switch (status) {
      case "PENDING":
        return <StatusIndicator status="pending" label="PENDING" />;
      case "ACTIVE":
        return <StatusIndicator status="online" label="ACTIVE" />;
      case "COLLECTION_IN_PROGRESS":
        return <StatusIndicator status="active" label="COLLECTING" pulse />;
      case "COLLECTION_COMPLETE":
        return <StatusIndicator status="verified" label="COMPLETE" />;
      case "COLLECTION_FAILED":
        return <StatusIndicator status="offline" label="FAILED" />;
      case "CLOSED":
        return <StatusIndicator status="offline" label="CLOSED" />;
      default:
        return <StatusIndicator status="pending" label={status} />;
    }
  };

  const getCollectorStatus = (status: Collector["status"]) => {
    switch (status) {
      case "ONLINE":
        return <StatusIndicator status="online" size="sm" />;
      case "BUSY":
        return <StatusIndicator status="pending" label="BUSY" size="sm" />;
      default:
        return <StatusIndicator status="offline" size="sm" />;
    }
  };

  // All incidents route to the IncidentHub — the hub decides the right state view.
  const handleIncidentClick = (incident: Incident) => {
    navigate(`/incidents/${incident.id}`);
  };

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
      <div className="p-6">
        {errorMessage && (
          <div className="mb-4 border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
            {errorMessage}
          </div>
        )}
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Activity className="w-5 h-5 text-primary" />}
            value={activeIncidents}
            valueClassName="text-primary"
            label="Active Incidents"
          />
          <StatCard
            icon={<HardDrive className="w-5 h-5 text-primary" />}
            value={`${onlineCollectors}/${collectors.length}`}
            valueClassName="text-primary"
            label="Collectors Online"
          />
            <StatCard
              icon={(
                <div className="w-5 h-5 flex items-center justify-center font-mono text-xs text-primary">
                  TB
                </div>
              )}
              value={String(totalEvidenceFiles)}
              valueClassName="text-primary"
              label="Evidence Files"
            />
            <StatCard
            icon={(
              <div className="w-5 h-5 flex items-center justify-center font-mono text-xs text-warning">
                !
              </div>
            )}
              value={String(systemAlerts)}
              valueClassName="text-warning"
              label="System Alerts"
            />
        </div>

        {/* Incident status breakdown */}
        {incidents.length > 0 && (
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">STATUS BREAKDOWN</span>
            {statusBreakdown.collecting > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 border border-primary/40 bg-primary/10 font-mono text-xs text-primary rounded-sm animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                {statusBreakdown.collecting} COLLECTING
              </span>
            )}
            {statusBreakdown.active > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 border border-yellow-500/40 bg-yellow-500/10 font-mono text-xs text-yellow-400 rounded-sm">
                {statusBreakdown.active} ACTIVE
              </span>
            )}
            {statusBreakdown.complete > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 border border-green-500/40 bg-green-500/10 font-mono text-xs text-green-400 rounded-sm">
                <CheckCircle2 className="w-3 h-3" />
                {statusBreakdown.complete} ANALYSIS READY
              </span>
            )}
            {statusBreakdown.closed > 0 && (
              <span className="px-2.5 py-1 border border-border/40 bg-secondary/30 font-mono text-xs text-muted-foreground rounded-sm">
                {statusBreakdown.closed} CLOSED
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {/* Main Content - Incidents */}
          <div className="col-span-8 space-y-6">
            <TacticalPanel
              title="ACTIVE INCIDENTS"
              status="active"
              headerActions={
                <span className="font-mono text-xs text-primary">
                  {activeIncidents} ACTIVE
                </span>
              }
            >
              <div className="space-y-3">
                {paginatedIncidents.length === 0 ? (
                  <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                    No incidents available.
                  </div>
                ) : (
                  paginatedIncidents.map((incident) => {
                    const isCollectionDone =
                      incident.status === "COLLECTION_COMPLETE" || incident.status === "CLOSED";
                    const isCollecting = incident.status === "COLLECTION_IN_PROGRESS";
                    return (
                      <div
                        key={incident.id}
                        className="border border-border bg-secondary/30 p-4 hover:border-primary/50 hover:bg-secondary/50 transition-all cursor-pointer group"
                        onClick={() => handleIncidentClick(incident)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-mono text-sm font-bold text-foreground">
                                {incident.id}
                              </span>
                              <span className="font-mono text-xs px-2 py-0.5 bg-primary/10 text-primary border border-primary/30">
                                {incident.type.replace(/_/g, " ")}
                              </span>
                              {/* Status badge for collection-complete incidents */}
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
                            {getIncidentStatusIndicator(incident.status)}
                            <div className="font-mono text-xs text-muted-foreground">
                              {new Date(incident.updatedAt).toLocaleString()}
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={goToPage}
                onItemsPerPageChange={setPerPage}
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
                {collectors.map((collector) => (
                  <div
                    key={collector.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <HardDrive className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono text-sm">{collector.name}</span>
                    </div>
                    {getCollectorStatus(collector.status)}
                  </div>
                ))}
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
