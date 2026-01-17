import { ReactNode, useState, useEffect } from "react";
import { AppSidebar } from "./AppSidebar";
import { WarningBanner } from "./WarningBanner";
import type { Incident, Collector } from "@/types/dfir";

// Mock data for stats - in production this would come from context/API
const mockIncidents: Incident[] = [
  {
    id: "INC-2025-0142",
    type: "RANSOMWARE",
    status: "COLLECTION_IN_PROGRESS",
    targetEndpoints: ["WS-FINANCE-01"],
    operator: "J.SMITH",
    createdAt: "2025-01-09T08:30:00Z",
    updatedAt: "2025-01-09T09:15:00Z",
  },
  {
    id: "INC-2025-0141",
    type: "ACCOUNT_COMPROMISE",
    status: "ACTIVE",
    targetEndpoints: ["DC-PRIMARY"],
    operator: "M.CHEN",
    createdAt: "2025-01-08T14:20:00Z",
    updatedAt: "2025-01-08T16:45:00Z",
  },
  {
    id: "INC-2025-0140",
    type: "DATA_EXFILTRATION",
    status: "CLOSED",
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

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeIncidents = mockIncidents.filter((i) => i.status !== "CLOSED").length;
  const onlineCollectors = mockCollectors.filter((c) => c.status !== "OFFLINE").length;
  const hasActiveCollection = mockIncidents.some((i) => i.status === "COLLECTION_IN_PROGRESS");

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <AppSidebar
        activeIncidents={activeIncidents}
        onlineCollectors={onlineCollectors}
        totalCollectors={mockCollectors.length}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
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
