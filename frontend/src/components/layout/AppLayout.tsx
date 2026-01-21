import { ReactNode, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const incidentsQuery = useQuery({
    queryKey: ["incidents"],
    queryFn: () => apiGet<IncidentResponse[]>("/incidents"),
  });

  const collectorsQuery = useQuery({
    queryKey: ["collectors"],
    queryFn: () => apiGet<CollectorResponse[]>("/collectors"),
  });

  useEffect(() => {
    if (incidentsQuery.data) {
      setIncidents(incidentsQuery.data.map(mapIncident));
    }
  }, [incidentsQuery.data]);

  useEffect(() => {
    if (collectorsQuery.data) {
      setCollectors(collectorsQuery.data.map(mapCollector));
    }
  }, [collectorsQuery.data]);

  useEffect(() => {
    const raw = localStorage.getItem("dfir_auth");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { username?: string; role?: string };
        if (parsed.username && parsed.role) {
          setCurrentUser({ username: parsed.username, role: parsed.role });
        }
      } catch {
        // ignore parse errors
      }
    }
    apiGet<{ username: string; role: string }>("/users/me")
      .then((data) => setCurrentUser({ username: data.username, role: data.role }))
      .catch(() => {
        // ignore user fetch errors
      });
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
          <span>
            OPERATOR: {currentUser?.username ?? "UNKNOWN"} | ROLE: {currentUser?.role ?? "UNKNOWN"}
          </span>
          <span>{currentTime.toLocaleTimeString()}</span>
        </footer>
      </div>
    </div>
  );
}
