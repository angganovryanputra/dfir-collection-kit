import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { WarningBanner } from "@/components/WarningBanner";
import { TerminalLog, LogEntry } from "@/components/TerminalLog";
import { ProgressPhase } from "@/components/ProgressPhase";
import { StatusIndicator } from "@/components/StatusIndicator";
import {
  Shield,
  StopCircle,
  Download,
  AlertTriangle,
} from "lucide-react";
import type { CollectionPhase } from "@/types/dfir";

// Simulated log entries that will appear over time
const simulatedLogs: Omit<LogEntry, "timestamp">[] = [
  { level: "info", message: "Initializing collection engine..." },
  { level: "success", message: "Connection established to target: WS-FINANCE-01" },
  { level: "info", message: "Starting volatile data acquisition..." },
  { level: "info", message: "Collecting process list..." },
  { level: "success", message: "Process list captured (342 processes)" },
  { level: "info", message: "Collecting network connections..." },
  { level: "success", message: "Network state captured (89 connections)" },
  { level: "info", message: "Collecting memory dump..." },
  { level: "warning", message: "Large memory footprint detected (32GB) - this may take time" },
  { level: "success", message: "Memory acquisition complete" },
  { level: "info", message: "Starting persistence mechanism scan..." },
  { level: "info", message: "Scanning registry autorun keys..." },
  { level: "success", message: "Registry scan complete (23 entries)" },
  { level: "info", message: "Scanning scheduled tasks..." },
  { level: "success", message: "Scheduled tasks captured (45 tasks)" },
  { level: "info", message: "Scanning services..." },
  { level: "success", message: "Services enumeration complete (189 services)" },
  { level: "info", message: "Starting log collection..." },
  { level: "info", message: "Collecting Windows Event Logs..." },
  { level: "success", message: "Security log captured (50,000 events)" },
  { level: "success", message: "System log captured (25,000 events)" },
  { level: "success", message: "Application log captured (15,000 events)" },
  { level: "info", message: "Generating evidence hashes..." },
  { level: "success", message: "SHA-256 hashes computed for all artifacts" },
  { level: "success", message: "Collection complete - transferring to vault..." },
];

export default function CollectionExecution() {
  const navigate = useNavigate();
  const { incidentId } = useParams();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [phases, setPhases] = useState<CollectionPhase[]>([
    { id: "volatile", name: "Volatile Data", status: "pending" },
    { id: "persistence", name: "Persistence Mechanisms", status: "pending" },
    { id: "logs", name: "System Logs", status: "pending" },
    { id: "hashing", name: "Evidence Hashing", status: "pending" },
  ]);
  const [isComplete, setIsComplete] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Simulate collection progress
  useEffect(() => {
    let logIndex = 0;
    let phaseIndex = 0;
    
    const phaseThresholds = [0, 8, 14, 19, 22];
    
    const logInterval = setInterval(() => {
      if (logIndex < simulatedLogs.length) {
        const newLog = {
          ...simulatedLogs[logIndex],
          timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
        };
        setLogs((prev) => [...prev, newLog]);
        
        // Update phases based on log progress
        if (logIndex === phaseThresholds[1]) {
          setPhases((prev) =>
            prev.map((p, i) =>
              i === 0 ? { ...p, status: "active", progress: 0 } : p
            )
          );
        } else if (logIndex === phaseThresholds[2]) {
          setPhases((prev) =>
            prev.map((p, i) => {
              if (i === 0) return { ...p, status: "complete" };
              if (i === 1) return { ...p, status: "active", progress: 0 };
              return p;
            })
          );
        } else if (logIndex === phaseThresholds[3]) {
          setPhases((prev) =>
            prev.map((p, i) => {
              if (i === 1) return { ...p, status: "complete" };
              if (i === 2) return { ...p, status: "active", progress: 0 };
              return p;
            })
          );
        } else if (logIndex === phaseThresholds[4]) {
          setPhases((prev) =>
            prev.map((p, i) => {
              if (i === 2) return { ...p, status: "complete" };
              if (i === 3) return { ...p, status: "active", progress: 0 };
              return p;
            })
          );
        } else if (logIndex === simulatedLogs.length - 1) {
          setPhases((prev) =>
            prev.map((p) => ({ ...p, status: "complete" as const }))
          );
          setIsComplete(true);
        }
        
        logIndex++;
      } else {
        clearInterval(logInterval);
      }
    }, 800);

    // Update phase progress
    const progressInterval = setInterval(() => {
      setPhases((prev) =>
        prev.map((p) => {
          if (p.status === "active" && p.progress !== undefined) {
            return { ...p, progress: Math.min((p.progress || 0) + 5, 95) };
          }
          return p;
        })
      );
    }, 200);

    // Elapsed time counter
    const timeInterval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(logInterval);
      clearInterval(progressInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background tactical-grid flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Shield className="w-6 h-6 text-primary animate-pulse-glow" />
            <div>
              <h1 className="font-mono text-lg font-bold tracking-wider text-foreground">
                COLLECTION IN PROGRESS
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                INCIDENT: {incidentId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="font-mono text-sm">
              <span className="text-muted-foreground">ELAPSED: </span>
              <span className="text-primary font-bold">{formatTime(elapsedTime)}</span>
            </div>
            <StatusIndicator
              status={isComplete ? "verified" : "active"}
              label={isComplete ? "COMPLETE" : "COLLECTING"}
              pulse={!isComplete}
            />
          </div>
        </div>
      </header>

      {/* Critical Warning Banner */}
      {!isComplete && (
        <WarningBanner variant="critical" className="animate-pulse">
          <AlertTriangle className="inline w-4 h-4 mr-2" />
          DO NOT SHUT DOWN OR RESTART TARGET SYSTEM — COLLECTION IN PROGRESS
        </WarningBanner>
      )}

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-hidden">
        <div className="grid grid-cols-12 gap-6 h-full">
          {/* Left - Terminal Log */}
          <div className="col-span-8 flex flex-col">
            <TacticalPanel
              title="COLLECTION LOG"
              status="active"
              className="flex-1 flex flex-col"
              headerActions={
                <span className="font-mono text-xs text-muted-foreground">
                  {logs.length} ENTRIES
                </span>
              }
            >
              <TerminalLog entries={logs} className="flex-1" />
            </TacticalPanel>
          </div>

          {/* Right - Status */}
          <div className="col-span-4 space-y-6">
            {/* Target Info */}
            <TacticalPanel title="TARGET INFORMATION">
              <div className="space-y-3 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HOSTNAME:</span>
                  <span className="text-foreground">WS-FINANCE-01</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IP ADDRESS:</span>
                  <span className="text-foreground">192.168.1.105</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">OS:</span>
                  <span className="text-foreground">Windows 11 Pro</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">COLLECTOR:</span>
                  <span className="text-primary">COLLECTOR-BRAVO</span>
                </div>
              </div>
            </TacticalPanel>

            {/* Collection Phases */}
            <TacticalPanel title="COLLECTION PHASES" status={isComplete ? "online" : "active"}>
              <ProgressPhase phases={phases} />
            </TacticalPanel>

            {/* Actions */}
            <div className="space-y-3">
              {isComplete ? (
                <>
                  <Button
                    variant="tactical"
                    size="lg"
                    className="w-full"
                    onClick={() => navigate("/evidence")}
                  >
                    <Download className="w-4 h-4" />
                    VIEW EVIDENCE
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    onClick={() => navigate("/dashboard")}
                  >
                    RETURN TO DASHBOARD
                  </Button>
                </>
              ) : (
                <Button
                  variant="destructive"
                  size="lg"
                  className="w-full"
                >
                  <StopCircle className="w-4 h-4" />
                  EMERGENCY ABORT
                </Button>
              )}
            </div>

            {/* Collection Stats */}
            {isComplete && (
              <TacticalPanel title="COLLECTION SUMMARY">
                <div className="space-y-2 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ARTIFACTS:</span>
                    <span className="text-primary">47 files</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TOTAL SIZE:</span>
                    <span className="text-primary">2.4 GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">HASH ALG:</span>
                    <span className="text-primary">SHA-256</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">STATUS:</span>
                    <span className="text-primary">HASH VERIFIED</span>
                  </div>
                </div>
              </TacticalPanel>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-secondary px-6 py-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>OPERATOR: J.SMITH</span>
        <span>COLLECTOR: COLLECTOR-BRAVO</span>
        <span>{new Date().toISOString()}</span>
      </footer>
    </div>
  );
}
