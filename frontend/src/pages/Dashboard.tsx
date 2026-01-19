import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import type { Incident, Collector } from "@/types/dfir";
import { apiGet } from "@/lib/api";

interface IncidentResponse {
  id: string;
  type: Incident["type"];
  status: Incident["status"];
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [incidentsData, collectorsData] = await Promise.all([
          apiGet<IncidentResponse[]>("/incidents"),
          apiGet<CollectorResponse[]>("/collectors"),
        ]);
        setIncidents(incidentsData.map(mapIncident));
        setCollectors(collectorsData.map(mapCollector));
      } catch {
        setErrorMessage("Unable to load dashboard data.");
      }
    };
    load();
  }, []);


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
  const hasActiveCollection = incidents.some((i) => i.status === "COLLECTION_IN_PROGRESS");

  const getIncidentStatusIndicator = (status: Incident["status"]) => {
    switch (status) {
      case "COLLECTION_IN_PROGRESS":
        return <StatusIndicator status="active" label="COLLECTING" pulse />;
      case "COLLECTION_COMPLETE":
        return <StatusIndicator status="verified" label="COMPLETE" />;
      case "ACTIVE":
        return <StatusIndicator status="pending" label="PENDING" />;
      default:
        return <StatusIndicator status="offline" label="CLOSED" />;
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

  const handleIncidentClick = (incident: Incident) => {
    if (incident.status === "COLLECTION_IN_PROGRESS") {
      navigate(`/incidents/${incident.id}/collect`);
    } else {
      navigate(`/evidence/${incident.id}`);
    }
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
            value="2.4"
            valueClassName="text-primary"
            label="Evidence Stored"
          />
          <StatCard
            icon={(
              <div className="w-5 h-5 flex items-center justify-center font-mono text-xs text-warning">
                !
              </div>
            )}
            value="2"
            valueClassName="text-warning"
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
                  {activeIncidents} ACTIVE
                </span>
              }
            >
              <div className="space-y-3">
                {paginatedIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="border border-border bg-secondary/30 p-4 hover:border-primary/50 hover:bg-secondary/50 transition-all cursor-pointer group"
                    onClick={() => handleIncidentClick(incident)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-bold text-foreground">
                            {incident.id}
                          </span>
                          <span className="font-mono text-xs px-2 py-0.5 bg-primary/10 text-primary border border-primary/30">
                            {incident.type.replace("_", " ")}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground space-y-1">
                          <div>TARGETS: {incident.targetEndpoints.join(", ")}</div>
                          <div>OPERATOR: {incident.operator}</div>
                        </div>
                      </div>
                      <div className="text-right space-y-2">
                        {getIncidentStatusIndicator(incident.status)}
                        <div className="font-mono text-xs text-muted-foreground">
                          {new Date(incident.updatedAt).toLocaleTimeString()}
                        </div>
                        {incident.status === "COLLECTION_IN_PROGRESS" && (
                          <ArrowUpRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
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
            <TacticalPanel title="SYSTEM ALERTS" status="warning">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-warning/5 border border-warning/20">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div className="font-mono text-xs space-y-1">
                    <div className="text-warning font-bold">STORAGE WARNING</div>
                    <div className="text-muted-foreground">
                      Evidence vault at 78% capacity
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-destructive/5 border border-destructive/20">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div className="font-mono text-xs space-y-1">
                    <div className="text-destructive font-bold">COLLECTOR OFFLINE</div>
                    <div className="text-muted-foreground">
                      COLLECTOR-DELTA last seen 2h ago
                    </div>
                  </div>
                </div>
              </div>
            </TacticalPanel>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
