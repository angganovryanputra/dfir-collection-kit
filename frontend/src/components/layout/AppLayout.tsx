import { ReactNode, useState, useEffect } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { WarningBanner } from "@/components/WarningBanner";
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


interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showWarning?: boolean;
  warningMessage?: string;
  warningVariant?: "warning" | "critical";
  headerActions?: ReactNode;
}

export function AppLayout({
  children,
  title,
  subtitle,
  showWarning,
  warningMessage,
  warningVariant = "warning",
  headerActions,
}: AppLayoutProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

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
        // ignore sidebar stats errors
      }
    };
    load();
  }, []);

  const activeIncidents = incidents.filter((i) => i.status !== "CLOSED").length;
  const onlineCollectors = collectors.filter((c) => c.status !== "OFFLINE").length;
  const hasActiveCollection = incidents.some((i) => i.status === "COLLECTION_IN_PROGRESS");

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
        <AppSidebar
          activeIncidents={activeIncidents}
          onlineCollectors={onlineCollectors}
          totalCollectors={collectors.length}
          isCollapsed={isSidebarCollapsed}
          onCollapsedChange={setIsSidebarCollapsed}
        />


      {/* Main Content */}
      <div
        className="flex-1 flex flex-col min-h-screen overflow-hidden transition-[padding] duration-300"
        style={{ paddingLeft: isSidebarCollapsed ? "4rem" : "16rem" }}
      >
        {/* Header */}
        <header className="border-b border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-mono text-lg font-bold tracking-wider text-foreground">
                {title}
              </h1>
              {subtitle && (
                <p className="font-mono text-xs text-muted-foreground mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              {headerActions}
              <div className="font-mono text-xs text-muted-foreground">
                {currentTime.toISOString()}
              </div>
            </div>
          </div>
        </header>

        {/* Warning Banner */}
        {(showWarning || hasActiveCollection) && (
          <WarningBanner variant={warningVariant}>
            {warningMessage || "COLLECTION IN PROGRESS — DO NOT INTERRUPT TARGET SYSTEMS"}
          </WarningBanner>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto tactical-grid">
          {children}
        </main>

        {/* Footer Status Bar */}
        <footer className="border-t border-border bg-secondary px-6 py-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-primary rounded-full" />
            SYS: OPERATIONAL
          </span>
          <span>OPERATOR: J.SMITH | ROLE: OPERATOR</span>
          <span>{currentTime.toLocaleTimeString()}</span>
        </footer>
      </div>
    </div>
  );
}
