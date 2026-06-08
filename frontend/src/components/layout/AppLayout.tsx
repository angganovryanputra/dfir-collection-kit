import { ReactNode, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { WarningBanner } from "@/components/WarningBanner";
import { EvidenceProvider } from "@/context/EvidenceContext";
import { EvidenceWorkspace } from "@/components/EvidenceWorkspace";
import { 
    CommandDialog, 
    CommandInput, 
    CommandList, 
    CommandEmpty, 
    CommandGroup, 
    CommandItem,
    CommandSeparator
} from "@/components/ui/command";
import { 
    Activity, 
    FolderOpen,
    Server,
    Target,
    Terminal,
    HeartPulse
} from "lucide-react";
import type { Incident, Collector } from "@/types/dfir";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

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


interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showWarning?: boolean;
  warningMessage?: string;
  warningVariant?: "warning" | "critical";
  headerActions?: ReactNode;
}

// ─── Heartbeat Pulse Component ───────────────────────────────────────────────

function SystemHeartbeat() {
    return (
        <div className="flex items-center gap-2 px-3 py-1 border border-primary/20 bg-primary/5 rounded-sm">
            <HeartPulse className="w-3 h-3 text-primary animate-pulse" />
            <div className="flex gap-0.5 items-end h-3 w-12">
                {[40, 70, 45, 90, 30, 60, 50, 80].map((h, i) => (
                    <div 
                        key={i} 
                        className="w-1 bg-primary/40 rounded-t-[1px]" 
                        style={{ height: `${h}%`, animation: `status-pulse ${1 + (i*0.2)}s ease-in-out infinite` }}
                    />
                ))}
            </div>
            <span className="font-mono text-[9px] text-primary font-bold tracking-tighter">SYS.HEALTH: 98%</span>
        </div>
    );
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
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const incidentsQuery = useQuery({
    queryKey: ["incidents"],
    queryFn: () => apiGet<{ total: number; items: IncidentResponse[] }>("/incidents?limit=1000"),
  });

  const collectorsQuery = useQuery({
    queryKey: ["collectors"],
    queryFn: () => apiGet<CollectorResponse[]>("/collectors"),
  });

  useEffect(() => {
    if (incidentsQuery.data) {
      setIncidents(incidentsQuery.data.items.map(mapIncident));
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

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <EvidenceProvider>
      <div className="min-h-screen bg-background flex digital-flicker relative">
        {/* Global Overlays */}
        <div className="scanner-overlay"><div className="scanner-line" /></div>
        <div className="crt-warp" />
        <div className="fixed inset-0 pointer-events-none z-[60] opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

        {/* Global Command Palette */}
        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList className="font-mono">
            <CommandEmpty>No results found.</CommandEmpty>
            
            <CommandGroup heading="Investigations">
              <CommandItem onSelect={() => runCommand(() => navigate("/dashboard"))}>
                <Activity className="mr-2 h-4 w-4" />
                <span>Incident Dashboard</span>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => navigate("/evidence/folders"))}>
                <FolderOpen className="mr-2 h-4 w-4" />
                <span>Evidence Vault</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Active Incidents">
              {incidents.filter(i => i.status !== "CLOSED").slice(0, 5).map(incident => (
                <CommandItem key={incident.id} onSelect={() => runCommand(() => navigate(`/incidents/${incident.id}`))}>
                  <Target className="mr-2 h-4 w-4 text-orange-400" />
                  <span>{incident.id}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground uppercase">{incident.type}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Active Collectors">
              {collectors.filter(c => c.status !== "OFFLINE").slice(0, 5).map(collector => (
                <CommandItem key={collector.id} onSelect={() => runCommand(() => navigate(`/agent-console/${collector.id}`))}>
                  <Server className="mr-2 h-4 w-4 text-green-400" />
                  <span>{collector.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground uppercase">{collector.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        {/* Sidebar */}
        <AppSidebar
            activeIncidents={activeIncidents}
            onlineCollectors={onlineCollectors}
            totalCollectors={collectors.length}
            isCollapsed={isSidebarCollapsed}
            onCollapsedChange={setIsSidebarCollapsed}
        />

        {/* Evidence Workspace Sidebar */}
        <EvidenceWorkspace />

        {/* Main Content */}
        <div
          className="flex-1 flex flex-col min-h-screen overflow-hidden transition-[padding] duration-300"
          style={{ paddingLeft: isSidebarCollapsed ? "4rem" : "16rem" }}
        >
          {/* Header */}
          <header className="border-b border-border bg-card/80 backdrop-blur-md px-6 py-4 z-30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <h1 className="font-mono text-lg font-bold tracking-wider text-foreground flex items-center gap-2">
                    <span className="text-primary/40 text-xs">//</span> {title}
                  </h1>
                  {subtitle && (
                    <p className="font-mono text-[10px] text-muted-foreground mt-0.5 uppercase tracking-tighter">
                      {subtitle}
                    </p>
                  )}
                </div>
                <SystemHeartbeat />
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 border border-border bg-secondary/50 rounded-sm text-[10px] text-muted-foreground font-mono">
                  <Terminal className="w-3 h-3" />
                  <span>PRESS</span>
                  <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-foreground font-bold text-[9px]">⌘K</kbd>
                  <span>TO NAVIGATE</span>
                </div>
                {headerActions}
                <div className="font-mono text-[10px] text-muted-foreground tabular-nums border-l border-border pl-4">
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
          <main className="flex-1 overflow-auto tactical-grid relative z-10 scanlines">
            {children}
          </main>

          {/* Footer Status Bar */}
          <footer className="border-t border-border bg-card px-6 py-1.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground relative z-20">
            <div className="flex items-center gap-6 flex-1 overflow-hidden">
                <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-[0_0_8px_hsl(var(--primary))]" />
                    OP.STATUS: ACTIVE
                </span>
                
                {/* Scrolling Ticker */}
                <div className="flex-1 overflow-hidden border-x border-border/40 px-4 relative">
                    <div className="animate-[scanner-sweep_20s_linear_infinite] whitespace-nowrap inline-block text-primary/60">
                        LATEST DETECTIONS: {incidents.slice(0, 3).map(i => `[INCIDENT ${i.id} - ${i.type}]`).join("  •  ")}  •  COLLECTOR HEARTBEAT: STABLE  •  STORAGE INTEGRITY: 100%  •  ENCRYPTION: AES-256-GCM ACTIVE
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4 border-l border-border pl-4">
                <span>
                    OPERATOR: <span className="text-foreground font-bold">{currentUser?.username ?? "UNKNOWN"}</span>
                </span>
                <span>
                    ROLE: <span className="text-primary font-bold">{currentUser?.role?.toUpperCase() ?? "UNKNOWN"}</span>
                </span>
                <span className="tabular-nums">{currentTime.toLocaleTimeString()}</span>
            </div>
          </footer>
        </div>
      </div>
    </EvidenceProvider>
  );
}
