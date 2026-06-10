import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAdaptivePolling } from "@/lib/useAdaptivePolling";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { WarningBanner } from "@/components/WarningBanner";
import { TerminalLog, LogEntry } from "@/components/TerminalLog";
import { ProgressPhase } from "@/components/ProgressPhase";
import { KeyValueRow } from "@/components/common/KeyValueRow";
import {
  Shield,
  StopCircle,
  Download,
  AlertTriangle,
  Search,
  Activity,
  Terminal as TerminalIcon,
  Server,
  Box,
} from "lucide-react";
import type { CollectionPhase } from "@/types/dfir";
import { apiGet, apiPost } from "@/lib/api";
import { getStoredRole, isViewerRole } from "@/lib/auth";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SafeText } from "@/components/common/SafeText";

type IncidentSummary = {
  id: string;
  type: string;
  status: string;
  target_endpoints: string[];
  operator: string;
  created_at: string;
  updated_at: string;
  collection_progress?: number | null;
  collection_phase?: string | null;
  last_log_index?: number | null;
};

type DeviceSummary = {
  id: string;
  hostname: string;
  ip_address: string;
  type: string;
  os: string;
  agent_version: string;
  status: string;
  last_seen: string;
};

type CollectorSummary = {
  id: string;
  name: string;
  endpoint: string;
  status: string;
  last_heartbeat: string;
};

type CollectionLogResponse = {
  sequence: number;
  level: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: string;
};

type PerHostJobStatus = {
  job_id: string;
  hostname: string | null;
  status: string;
  module_count: number;
  message: string | null;
};

type CollectionStatusResponse = {
  incident_id: string;
  status: string;
  progress: number;
  phase: string | null;
  logs: CollectionLogResponse[];
  last_log_index: number;
  jobs: PerHostJobStatus[];
};

type EvidenceFolderResponse = {
  id: string;
  incident_id: string;
  type: string;
  date: string;
  files_count: number;
  total_size: string;
  status: "LOCKED" | "HASH_VERIFIED";
};

type EvidenceItemResponse = {
  id: string;
  incident_id: string;
  name: string;
  type: string;
  size: string;
  status: "COLLECTING" | "LOCKED" | "HASH_VERIFIED" | "EXPORTED";
  hash: string;
  collected_at: string;
};

const PHASES: { id: string; name: string }[] = [
  { id: "collecting", name: "Acquisition" },
  { id: "parsing", name: "Local Analysis" },
  { id: "uploading", name: "Data Transfer" },
];

const resolveActivePhaseId = (backendPhase: string | null): string => {
  if (backendPhase === "parsing") return "parsing";
  if (backendPhase === "uploading") return "uploading";
  return "collecting";
};

export default function CollectionExecution() {
  const navigate = useNavigate();
  const { id: incidentId } = useParams<{ id: string }>();
  const location = useLocation();
  const locationState = location.state as any;

  const selectedModuleIds = locationState?.selectedModuleIds || [];
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [phases, setPhases] = useState<CollectionPhase[]>(
    PHASES.map(({ id, name }) => ({ id, name, status: "pending" }))
  );
  const [isComplete, setIsComplete] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [incident, setIncident] = useState<IncidentSummary | null>(null);
  const [device, setDevice] = useState<DeviceSummary | null>(null);
  const [collector, setCollector] = useState<CollectorSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [perHostJobs, setPerHostJobs] = useState<PerHostJobStatus[]>([]);
  const [currentModule, setCurrentModule] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const isViewer = isViewerRole(getStoredRole());
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const startedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const loadContext = async () => {
      if (!incidentId) return;
      try {
        const current = await apiGet<IncidentSummary>(`/incidents/${incidentId}`);
        setIncident(current);

        const devices = await apiGet<DeviceSummary[]>("/devices");
        const target = current?.target_endpoints[0]?.toLowerCase() ?? "";
        const matchedDevice = devices.find((entry) => entry.hostname.toLowerCase() === target) ?? null;
        setDevice(matchedDevice);

        const collectors = await apiGet<CollectorSummary[]>("/collectors");
        setCollector(collectors[0] ?? null);
      } catch {
        setErrorMessage("Acquisition context unavailable.");
      }
    };
    loadContext();
  }, [incidentId]);

  useEffect(() => {
    const startCollection = async () => {
      if (!incidentId || startedRef.current || isViewer) return;

      setIsStarting(true);
      try {
        const currentIncident = await apiGet<IncidentSummary>(`/incidents/${incidentId}`).catch(() => null);
        if (currentIncident && ["COLLECTION_IN_PROGRESS", "COLLECTION_COMPLETE"].includes(currentIncident.status)) {
           startedRef.current = true;
           startedAtRef.current = Date.now();
           setPollingEnabled(currentIncident.status === "COLLECTION_IN_PROGRESS");
           if (currentIncident.status === "COLLECTION_COMPLETE") {
             setIsComplete(true);
             setPhases(prev => prev.map(p => ({ ...p, status: "complete", progress: 100 })));
           }
           return;
        }

        const collectBody: any = { 
          module_ids: selectedModuleIds,
          os_override: locationState?.osOverride
        };
        await apiPost(`/incidents/${incidentId}/collect`, collectBody);
        startedRef.current = true;
        startedAtRef.current = Date.now();
        setPollingEnabled(true);
      } catch (err: any) {
        setErrorMessage(err.message || "Activation failure.");
      } finally {
        setIsStarting(false);
      }
    };
    startCollection();
  }, [incidentId, isViewer, selectedModuleIds, locationState?.osOverride]);

  const handlePoll = useCallback(async (): Promise<string | null> => {
    if (!incidentId || !startedRef.current) return null;
    try {
      const status = await apiPost<CollectionStatusResponse>(`/incidents/${incidentId}/collect/poll`, {});
      
      if (status.logs.length > 0) {
        setLogs(prev => [
          ...prev, 
          ...status.logs.map(l => ({
            timestamp: new Date(l.timestamp).toLocaleTimeString("en-US", { hour12: false }),
            level: l.level,
            message: l.message
          }))
        ]);
        const latestMsg = status.logs[status.logs.length - 1].message;
        const m = latestMsg.match(/(?:Executing|Starting) module\s+(\S+)/i);
        if (m) setCurrentModule(m[1]);
      }

      setPerHostJobs(status.jobs || []);
      setElapsedTime(startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0);

      if (status.status === "COLLECTION_COMPLETE") {
        setIsComplete(true);
        setPhases(prev => prev.map(p => ({ ...p, status: "complete", progress: 100 })));
        setPollingEnabled(false);
        return null;
      }

      if (status.status === "COLLECTION_FAILED") {
        setErrorMessage("Acquisition sequence failed.");
        setPhases(prev => prev.map(p => p.status === "active" ? { ...p, status: "error" } : p));
        setPollingEnabled(false);
        return null;
      }

      const activeId = resolveActivePhaseId(status.phase);
      setPhases(prev => prev.map(p => {
        const pIdx = PHASES.findIndex(x => x.id === p.id);
        const aIdx = PHASES.findIndex(x => x.id === activeId);
        if (pIdx < aIdx) return { ...p, status: "complete", progress: 100 };
        if (p.id === activeId) return { ...p, status: "active", progress: p.id === "collecting" ? status.progress : undefined };
        return { ...p, status: "pending" };
      }));

      return status.status;
    } catch {
      return null;
    }
  }, [incidentId]);

  useAdaptivePolling({ enabled: pollingEnabled, onPoll: handlePoll, initialInterval: 2000 });

  const handleAbort = async () => {
    if (!incidentId || isViewer) return;
    setIsAborting(true);
    try {
      const activeJobs = await apiGet<any[]>(`/jobs/incident/${incidentId}`);
      await Promise.allSettled(activeJobs.map(j => apiPost(`/jobs/${j.id}/cancel`, {})));
      setPollingEnabled(false);
      setErrorMessage("Sequence aborted by analyst.");
    } catch {
      setErrorMessage("Abort command failed.");
    } finally {
      setIsAborting(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background tactical-grid flex flex-col overflow-hidden font-mono">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-primary/10 rounded-sm border border-primary/20">
              <Shield className={cn("w-6 h-6 text-primary", !isComplete && "animate-pulse")} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-[0.2em] text-foreground uppercase">
                {isComplete ? "Sector Secured" : "Acquisition Active"}
              </h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                STREAM_ID: <span className="text-foreground font-bold">{incidentId}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <div className="hidden lg:flex flex-col items-end gap-1">
              <div className="text-[9px] text-muted-foreground uppercase tracking-tighter opacity-60">Elapsed</div>
              <div className="text-sm font-bold text-primary tabular-nums">{formatTime(elapsedTime)}</div>
            </div>
            <StatusBadge 
              status={isComplete ? "verified" : "running"} 
              label={isStarting ? "INITIALIZING" : isComplete ? "COMPLETE" : resolveActivePhaseId(phases.find(p => p.status === "active")?.id ?? "collecting").toUpperCase()} 
            />
          </div>
        </div>
      </header>

      {errorMessage && (
        <WarningBanner variant="critical" className="shrink-0">
          <AlertTriangle className="w-4 h-4 mr-2" /> {errorMessage}
        </WarningBanner>
      )}

      {/* Main Grid */}
      <main className="flex-1 p-6 overflow-hidden min-h-0">
        <div className="grid grid-cols-12 gap-6 h-full">
          {/* Telemetry Stream */}
          <div className="col-span-8 flex flex-col min-h-0">
            <TacticalPanel 
              title="TELEMETRY_LOG" 
              status="active" 
              className="flex-1 flex flex-col"
              headerActions={<span className="text-[9px] text-muted-foreground">{logs.length} EVENTS RECORDED</span>}
            >
              <TerminalLog entries={logs} className="flex-1" autoScroll searchable />
            </TacticalPanel>
          </div>

          {/* Controls & Metrics */}
          <div className="col-span-4 flex flex-col gap-6 overflow-y-auto pr-1 custom-scrollbar">
            <TacticalPanel title="TARGET_IDENTITY">
              <div className="space-y-2.5 text-[10px]">
                <KeyValueRow label="HOSTNAME" value={device?.hostname ?? "ACQUIRING..."} />
                <KeyValueRow label="INTERFACE" value={device?.ip_address ?? "---"} />
                <KeyValueRow label="PLATFORM" value={device?.os ?? "---"} />
                <KeyValueRow label="COLLECTOR" value={collector?.name ?? "---"} valueClassName="text-primary font-bold" />
              </div>
            </TacticalPanel>

            <TacticalPanel title="SEQUENCE_PHASES" status={isComplete ? "verified" : "active"}>
              <ProgressPhase phases={phases} />
              {currentModule && !isComplete && (
                <div className="mt-4 pt-4 border-t border-border/20">
                   <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-2">
                     <Activity className="w-3 h-3 animate-pulse text-primary" /> Active Module
                   </div>
                   <div className="flex items-center gap-2 bg-secondary/20 p-2 rounded-sm border border-border/40">
                      <Box className="w-3.5 h-3.5 text-primary" />
                      <SafeText text={currentModule} className="text-[10px] font-bold text-foreground" truncate={30} />
                   </div>
                </div>
              )}
            </TacticalPanel>

            {perHostJobs.length > 1 && (
              <TacticalPanel title="GRID_CONCURRENCY">
                <div className="space-y-1.5">
                  {perHostJobs.map(job => (
                    <div key={job.job_id} className="flex items-center justify-between py-1.5 border-b border-border/10 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Server className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-[10px] truncate">{job.hostname || job.job_id}</span>
                      </div>
                      <StatusBadge status={job.status} iconOnly className="h-4 px-1" />
                    </div>
                  ))}
                </div>
              </TacticalPanel>
            )}

            <div className="space-y-3 mt-auto pt-4">
              {isComplete ? (
                <>
                  <Button variant="tactical" size="lg" className="w-full h-11 text-[11px] font-bold tracking-[0.2em]" onClick={() => navigate(`/incidents/${incidentId}`)}>
                    <Search className="w-4 h-4" /> ACTIVATE ANALYSIS
                  </Button>
                  <Button variant="secondary" size="lg" className="w-full h-11 text-[11px] font-bold tracking-[0.2em]" onClick={() => navigate("/dashboard")}>
                    RETURN TO BASE
                  </Button>
                </>
              ) : (
                <Button variant="destructive" size="lg" className="w-full h-11 text-[11px] font-bold tracking-[0.2em] animate-pulse" onClick={handleAbort} disabled={isAborting || isViewer}>
                  <StopCircle className="w-4 h-4" /> {isAborting ? "SENDING ABORT..." : "EMERGENCY SHUTDOWN"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Ticker Footer */}
      <footer className="border-t border-border bg-card px-6 py-1.5 flex items-center justify-between text-[9px] text-muted-foreground uppercase tracking-tighter">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-primary font-bold">
            <TerminalIcon className="w-3 h-3" /> ANALYST_OPS: ACTIVE
          </span>
          <span className="opacity-40">|</span>
          <span>OPERATOR: {incident?.operator ?? "SYSTEM"}</span>
        </div>
        <div className="flex items-center gap-4">
           <span>{new Date().toISOString()}</span>
           <span className="opacity-40">|</span>
           <span className="text-green-500/60 font-bold">Encrypted: AES-GCM</span>
        </div>
      </footer>
    </div>
  );
}
