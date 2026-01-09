import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { WarningBanner } from "@/components/WarningBanner";
import {
  Shield,
  Plus,
  Activity,
  HardDrive,
  Settings,
  FolderLock,
  FileText,
  LogOut,
  Server,
  AlertTriangle,
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

  const activeIncidents = incidents.filter((i) => i.status !== "CLOSED").length;
  const onlineCollectors = collectors.filter((c) => c.status !== "OFFLINE").length;
  const hasActiveCollection = incidents.some((i) => i.status === "COLLECTION_IN_PROGRESS");

  const handleLogout = () => {
    localStorage.removeItem("dfir_auth");
    navigate("/");
  };

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
    <div className="min-h-screen bg-background tactical-grid flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="font-mono text-lg font-bold tracking-wider text-foreground">
                DFIR COMMAND CENTER
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                RAPID COLLECTION KIT v2.1.0
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-6 font-mono text-xs">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">ACTIVE:</span>
                <span className="text-primary font-bold">{activeIncidents}</span>
              </div>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">COLLECTORS:</span>
                <span className="text-primary font-bold">{onlineCollectors}/{collectors.length}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
                <Settings className="w-4 h-4" />
                ADMIN
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
                LOGOUT
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Active Collection Warning */}
      {hasActiveCollection && (
        <WarningBanner variant="warning">
          COLLECTION IN PROGRESS — DO NOT INTERRUPT TARGET SYSTEMS
        </WarningBanner>
      )}

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="grid grid-cols-12 gap-6 h-full">
          {/* Left Column - Incidents */}
          <div className="col-span-8 space-y-6">
            {/* Quick Actions */}
            <div className="flex items-center gap-4">
              <Button
                variant="tactical"
                size="lg"
                onClick={() => navigate("/create-incident")}
              >
                <Plus className="w-5 h-5" />
                CREATE INCIDENT
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate("/evidence")}
              >
                <FolderLock className="w-5 h-5" />
                EVIDENCE VAULT
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate("/chain-of-custody")}
              >
                <FileText className="w-5 h-5" />
                CHAIN OF CUSTODY
              </Button>
            </div>

            {/* Active Incidents */}
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
                {incidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="border border-border bg-secondary/50 p-4 hover:border-primary/50 transition-colors cursor-pointer"
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
                          <div>
                            TARGETS: {incident.targetEndpoints.join(", ")}
                          </div>
                          <div>OPERATOR: {incident.operator}</div>
                        </div>
                      </div>
                      <div className="text-right space-y-2">
                        {getIncidentStatusIndicator(incident.status)}
                        <div className="font-mono text-xs text-muted-foreground">
                          {new Date(incident.updatedAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TacticalPanel>
          </div>

          {/* Right Column - System Status */}
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

            {/* Quick Stats */}
            <TacticalPanel title="STATISTICS">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 border border-border">
                  <div className="font-mono text-3xl font-bold text-primary">142</div>
                  <div className="font-mono text-xs text-muted-foreground mt-1">
                    TOTAL INCIDENTS
                  </div>
                </div>
                <div className="text-center p-4 border border-border">
                  <div className="font-mono text-3xl font-bold text-primary">2.4TB</div>
                  <div className="font-mono text-xs text-muted-foreground mt-1">
                    EVIDENCE STORED
                  </div>
                </div>
              </div>
            </TacticalPanel>
          </div>
        </div>
      </main>

      {/* Footer Status Bar */}
      <footer className="border-t border-border bg-secondary px-6 py-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>OPERATOR: J.SMITH | ROLE: OPERATOR</span>
        <span>SESSION: 00:14:32</span>
        <span>{new Date().toISOString()}</span>
      </footer>
    </div>
  );
}
