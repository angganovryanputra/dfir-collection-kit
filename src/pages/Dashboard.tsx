import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { TablePagination } from "@/components/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import {
  Plus,
  Activity,
  HardDrive,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import type { Incident, Collector } from "@/types/dfir";

// Mock data
const mockIncidents: Incident[] = [
  {
    id: "INC-2025-0142",
    type: "RANSOMWARE",
    status: "COLLECTION_IN_PROGRESS",
    targetEndpoints: ["WS-FINANCE-01", "WS-FINANCE-02"],
    operator: "J.SMITH",
    createdAt: "2025-01-09T08:30:00Z",
    updatedAt: "2025-01-09T09:15:00Z",
  },
  {
    id: "INC-2025-0141",
    type: "ACCOUNT_COMPROMISE",
    status: "COLLECTION_COMPLETE",
    targetEndpoints: ["DC-PRIMARY"],
    operator: "M.CHEN",
    createdAt: "2025-01-08T14:20:00Z",
    updatedAt: "2025-01-08T16:45:00Z",
  },
  {
    id: "INC-2025-0140",
    type: "DATA_EXFILTRATION",
    status: "ACTIVE",
    targetEndpoints: ["SRV-DB-01"],
    operator: "K.JOHNSON",
    createdAt: "2025-01-09T10:00:00Z",
    updatedAt: "2025-01-09T10:00:00Z",
  },
  {
    id: "INC-2025-0139",
    type: "MALWARE",
    status: "CLOSED",
    targetEndpoints: ["WS-HR-01"],
    operator: "J.SMITH",
    createdAt: "2025-01-07T09:00:00Z",
    updatedAt: "2025-01-07T15:00:00Z",
  },
  {
    id: "INC-2025-0138",
    type: "UNAUTHORIZED_ACCESS",
    status: "COLLECTION_COMPLETE",
    targetEndpoints: ["SRV-FILE-01"],
    operator: "M.CHEN",
    createdAt: "2025-01-06T11:00:00Z",
    updatedAt: "2025-01-06T14:00:00Z",
  },
  {
    id: "INC-2025-0137",
    type: "RANSOMWARE",
    status: "CLOSED",
    targetEndpoints: ["WS-LEGAL-01", "WS-LEGAL-02"],
    operator: "K.JOHNSON",
    createdAt: "2025-01-05T08:00:00Z",
    updatedAt: "2025-01-05T18:00:00Z",
  },
  {
    id: "INC-2025-0136",
    type: "INSIDER_THREAT",
    status: "ACTIVE",
    targetEndpoints: ["WS-EXEC-01"],
    operator: "J.SMITH",
    createdAt: "2025-01-04T10:00:00Z",
    updatedAt: "2025-01-04T10:00:00Z",
  },
  {
    id: "INC-2025-0135",
    type: "DATA_EXFILTRATION",
    status: "COLLECTION_COMPLETE",
    targetEndpoints: ["SRV-DB-02"],
    operator: "M.CHEN",
    createdAt: "2025-01-03T14:00:00Z",
    updatedAt: "2025-01-03T20:00:00Z",
  },
  {
    id: "INC-2025-0134",
    type: "ACCOUNT_COMPROMISE",
    status: "CLOSED",
    targetEndpoints: ["DC-BACKUP"],
    operator: "K.JOHNSON",
    createdAt: "2025-01-02T09:00:00Z",
    updatedAt: "2025-01-02T17:00:00Z",
  },
  {
    id: "INC-2025-0133",
    type: "MALWARE",
    status: "COLLECTION_IN_PROGRESS",
    targetEndpoints: ["WS-DEV-01", "WS-DEV-02"],
    operator: "J.SMITH",
    createdAt: "2025-01-01T08:00:00Z",
    updatedAt: "2025-01-01T12:00:00Z",
  },
  {
    id: "INC-2025-0132",
    type: "RANSOMWARE",
    status: "CLOSED",
    targetEndpoints: ["SRV-WEB-01"],
    operator: "M.CHEN",
    createdAt: "2024-12-31T10:00:00Z",
    updatedAt: "2024-12-31T22:00:00Z",
  },
  {
    id: "INC-2025-0131",
    type: "UNAUTHORIZED_ACCESS",
    status: "ACTIVE",
    targetEndpoints: ["WS-SALES-01"],
    operator: "K.JOHNSON",
    createdAt: "2024-12-30T15:00:00Z",
    updatedAt: "2024-12-30T15:00:00Z",
  },
];

const mockCollectors: Collector[] = [
  { id: "COL-01", name: "COLLECTOR-ALPHA", status: "ONLINE", lastSeen: "2025-01-09T10:30:00Z" },
  { id: "COL-02", name: "COLLECTOR-BRAVO", status: "BUSY", lastSeen: "2025-01-09T10:30:00Z" },
  { id: "COL-03", name: "COLLECTOR-CHARLIE", status: "ONLINE", lastSeen: "2025-01-09T10:28:00Z" },
  { id: "COL-04", name: "COLLECTOR-DELTA", status: "OFFLINE", lastSeen: "2025-01-09T08:15:00Z" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [incidents] = useState<Incident[]>(mockIncidents);
  const [collectors] = useState<Collector[]>(mockCollectors);

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

  return (
    <AppLayout
      title="COMMAND CENTER"
      subtitle="DFIR RAPID COLLECTION KIT"
      showWarning={hasActiveCollection}
      headerActions={
        <Button variant="tactical" onClick={() => navigate("/create-incident")}>
          <Plus className="w-4 h-4 mr-2" />
          CREATE INCIDENT
        </Button>
      }
    >
      <div className="p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-5 h-5 text-primary" />
              <span className="font-mono text-3xl font-bold text-primary">{activeIncidents}</span>
            </div>
            <div className="font-mono text-xs text-muted-foreground uppercase">
              Active Incidents
            </div>
          </div>
          <div className="border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <HardDrive className="w-5 h-5 text-primary" />
              <span className="font-mono text-3xl font-bold text-primary">
                {onlineCollectors}/{collectors.length}
              </span>
            </div>
            <div className="font-mono text-xs text-muted-foreground uppercase">
              Collectors Online
            </div>
          </div>
          <div className="border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-5 h-5 flex items-center justify-center font-mono text-xs text-primary">TB</div>
              <span className="font-mono text-3xl font-bold text-primary">2.4</span>
            </div>
            <div className="font-mono text-xs text-muted-foreground uppercase">
              Evidence Stored
            </div>
          </div>
          <div className="border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-5 h-5 flex items-center justify-center font-mono text-xs text-warning">!</div>
              <span className="font-mono text-3xl font-bold text-warning">2</span>
            </div>
            <div className="font-mono text-xs text-muted-foreground uppercase">
              System Alerts
            </div>
          </div>
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
                    onClick={() => {
                      if (incident.status === "COLLECTION_IN_PROGRESS") {
                        navigate(`/collection/${incident.id}`);
                      }
                    }}
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
