import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { WarningBanner } from "@/components/WarningBanner";
import { TerminalLog, LogEntry } from "@/components/TerminalLog";
import { ProgressPhase } from "@/components/ProgressPhase";
import { StatusIndicator } from "@/components/StatusIndicator";
import { KeyValueRow } from "@/components/common/KeyValueRow";
import {
  Shield,
  StopCircle,
  Download,
  AlertTriangle,
  Search,
} from "lucide-react";
import type { CollectionPhase } from "@/types/dfir";
import { apiGet, apiPost } from "@/lib/api";
import { getStoredRole, isViewerRole } from "@/lib/auth";


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

type CollectionStatusResponse = {
  incident_id: string;
  status: string;
  progress: number;
  phase: string | null;
  logs: CollectionLogResponse[];
  last_log_index: number;
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

const PHASE_NAME_MAP: Record<string, string> = {
  volatile: "Volatile Data",
  persistence: "Persistence Mechanisms",
  logs: "System Logs",
  hashing: "Evidence Hashing",
};

const PHASE_IDS = Object.keys(PHASE_NAME_MAP);

const derivePhaseFromStatus = (status: string) => {
  const match = status.match(/collecting\s*\((\d+)\/(\d+)\)/i);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
  const ratio = Math.min(1, Math.max(0, current / total));
  const index = Math.min(PHASE_IDS.length - 1, Math.floor(ratio * PHASE_IDS.length));
  return PHASE_IDS[index] ?? null;
};

export default function CollectionExecution() {
  const navigate = useNavigate();
  const { id: incidentId } = useParams<{ id: string }>();
  const location = useLocation();
  const _rawModuleIds = (location.state as { selectedModuleIds?: unknown } | null)?.selectedModuleIds;
  const selectedModuleIds: string[] | null =
    Array.isArray(_rawModuleIds) && _rawModuleIds.every((x) => typeof x === "string")
      ? (_rawModuleIds as string[])
      : null;
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [phases, setPhases] = useState<CollectionPhase[]>(
    Object.entries(PHASE_NAME_MAP).map(([id, name]) => ({
      id,
      name,
      status: "pending",
    }))
  );
  const [isComplete, setIsComplete] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [incident, setIncident] = useState<IncidentSummary | null>(null);
  const [device, setDevice] = useState<DeviceSummary | null>(null);
  const [collector, setCollector] = useState<CollectorSummary | null>(null);
  const [summary, setSummary] = useState({
    artifacts: 0,
    totalSize: "--",
    hashAlg: "UNKNOWN",
    status: "LOCKED" as "LOCKED" | "HASH_VERIFIED",
  });
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const isViewer = isViewerRole(getStoredRole());
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const loadContext = async () => {
      if (!incidentId) {
        setErrorMessage("Missing incident identifier.");
        return;
      }
      try {
        const incidents = await apiGet<IncidentSummary[]>("/incidents");
        const current = incidents.find((entry) => entry.id === incidentId) ?? null;
        setIncident(current);

        const devices = await apiGet<DeviceSummary[]>("/devices");
        const target = current?.target_endpoints[0]?.toLowerCase() ?? "";
        const matchedDevice = target
          ? devices.find((entry) => entry.hostname.toLowerCase() === target) ?? null
          : null;
        setDevice(matchedDevice);

        const collectors = await apiGet<CollectorSummary[]>("/collectors");
        setCollector(collectors[0] ?? null);
      } catch {
        setErrorMessage("Unable to load collection context.");
      }
    };

    loadContext();
  }, [incidentId]);

  useEffect(() => {
    const startCollection = async () => {
      if (!incidentId || startedRef.current) return;
      if (isViewer) {
        setErrorMessage("Viewer accounts cannot start collections.");
        return;
      }
      setIsStarting(true);
      try {
        const collectBody = selectedModuleIds
          ? { module_ids: selectedModuleIds }
          : {};
        await apiPost(`/incidents/${incidentId}/collect`, collectBody);
        startedRef.current = true;
        startedAtRef.current = Date.now();
        setErrorMessage(null);
      } catch {
        setErrorMessage("Unable to start collection.");
      } finally {
        setIsStarting(false);
      }
    };

    startCollection();
  }, [incidentId, isViewer]);

  useEffect(() => {
    const pollStatus = async () => {
      if (!incidentId || !startedRef.current) return;
      try {
        const status = await apiPost<CollectionStatusResponse>(
          `/incidents/${incidentId}/collect/poll`,
          {}
        );
        if (status.logs.length > 0) {
          setLogs((prev) => [
            ...prev,
            ...status.logs.map((entry) => ({
              timestamp: new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false }),
              level: entry.level,
              message: entry.message,
            })),
          ]);
        }
        setElapsedTime(() => {
          if (startedAtRef.current) {
            return Math.floor((Date.now() - startedAtRef.current) / 1000);
          }
          return 0;
        });
        const derivedPhase = derivePhaseFromStatus(status.status);
        const phaseId = status.phase ?? derivedPhase ?? "volatile";
        setPhases((prev) =>
          prev.map((phase) => {
            if (status.progress >= 100) {
              return { ...phase, status: "complete", progress: 100 };
            }
            if (phase.id === phaseId) {
              return { ...phase, status: "active", progress: status.progress };
            }
            if (phase.status === "active") {
              return { ...phase, status: "complete", progress: 100 };
            }
            return phase;
          })
        );
        if (status.status === "COLLECTION_COMPLETE") {
          setIsComplete(true);
          setCompletionMessage("Collection completed. Chain-of-custody updated.");
          setPhases((prev) =>
            prev.map((phase) => ({ ...phase, status: "complete", progress: 100 }))
          );
          if (pollerRef.current) {
            clearInterval(pollerRef.current);
            pollerRef.current = null;
          }
        } else if (status.status === "COLLECTION_FAILED") {
          setIsComplete(false);
          setErrorMessage("Collection failed. Review logs for details.");
          setCompletionMessage(null);
          if (pollerRef.current) {
            clearInterval(pollerRef.current);
            pollerRef.current = null;
          }
        }
      } catch {
        setErrorMessage("Unable to poll collection status.");
      }
    };

    if (incidentId) {
      pollStatus();
      pollerRef.current = setInterval(pollStatus, 3000);
    }

    return () => {
      if (pollerRef.current) {
        clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
    };
  }, [incidentId]);

  useEffect(() => {
    const fetchExistingEvidence = async () => {
      if (!incidentId || !isComplete) return;
      try {
        const folders = await apiGet<EvidenceFolderResponse[]>("/evidence/folders");
        const folder = folders.find((entry) => entry.incident_id === incidentId) ?? null;
        if (!folder) return;
        const items = await apiGet<EvidenceItemResponse[]>(
          `/evidence/items?incident_id=${folder.incident_id}`
        );
        const hasHash = items.some((item) => item.hash && item.hash.trim().length > 0);
        setSummary({
          artifacts: items.length || folder.files_count,
          totalSize: folder.total_size || "--",
          hashAlg: hasHash ? "SHA-256" : "UNKNOWN",
          status: folder.status,
        });
      } catch {
        // summary fetch is best-effort; silently skip on error
      }
    };

    fetchExistingEvidence();
  }, [incidentId, isComplete]);

  const handleAbort = async () => {
    if (!incidentId || isViewer) return;
    setIsAborting(true);
    try {
      type JobSummary = { id: string; status: string };
      const jobs = await apiGet<JobSummary[]>(`/jobs/incident/${incidentId}`);
      const activeJob = jobs.find((j) =>
        ["pending", "collecting", "in_progress", "running"].includes(j.status.toLowerCase())
      );
      if (!activeJob) {
        setErrorMessage("No active job found to abort.");
        return;
      }
      await apiPost(`/jobs/${activeJob.id}/cancel`, {});
      setErrorMessage("Collection aborted by operator.");
      if (pollerRef.current) {
        clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
    } catch {
      setErrorMessage("Failed to abort collection. Try again.");
    } finally {
      setIsAborting(false);
    }
  };

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
                  INCIDENT: {incident?.id ?? incidentId ?? "PENDING"}
                </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
              {selectedModuleIds && (
                <div className="font-mono text-sm">
                  <span className="text-muted-foreground">MODULES: </span>
                  <span className="text-primary font-bold">{selectedModuleIds.length}</span>
                </div>
              )}
              <div className="font-mono text-sm">
                <span className="text-muted-foreground">ELAPSED: </span>
                <span className="text-primary font-bold">{formatTime(elapsedTime)}</span>
              </div>
              <StatusIndicator
                status={isComplete ? "verified" : "active"}
                label={isStarting ? "INITIALIZING" : isComplete ? "COMPLETE" : "COLLECTING"}
                pulse={!isComplete}
              />
            </div>
          </div>
        </header>

        {errorMessage && (
          <WarningBanner variant="critical" className="animate-pulse">
            <AlertTriangle className="inline w-4 h-4 mr-2" />
            {errorMessage}
          </WarningBanner>
        )}

        {completionMessage && !errorMessage && (
          <WarningBanner variant="warning">
            {completionMessage}
          </WarningBanner>
        )}

        {/* Critical Warning Banner */}
        {!isComplete && !errorMessage && (
          <WarningBanner variant="critical" className="animate-pulse">
            <AlertTriangle className="inline w-4 h-4 mr-2" />
            {isStarting
              ? "INITIALIZING COLLECTION ENGINE — STAND BY"
              : "DO NOT SHUT DOWN OR RESTART TARGET SYSTEM — COLLECTION IN PROGRESS"}
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
                <KeyValueRow label="HOSTNAME:" value={device?.hostname ?? "PENDING"} />
                <KeyValueRow label="IP ADDRESS:" value={device?.ip_address ?? "PENDING"} />
                <KeyValueRow label="OS:" value={device?.os ?? "PENDING"} />
                <KeyValueRow
                  label="COLLECTOR:"
                  value={collector?.name ?? "PENDING"}
                  valueClassName={collector ? "text-primary" : undefined}
                />
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
                    onClick={() => navigate(`/incidents/${incident?.id ?? incidentId ?? ""}/processing`)}
                  >
                    <Search className="w-4 h-4" />
                    ANALYZE FORENSICS
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => navigate(`/evidence/${incident?.id ?? incidentId ?? ""}`)}
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
                  disabled={isViewer || isAborting}
                  onClick={handleAbort}
                >
                  <StopCircle className="w-4 h-4" />
                  {isAborting ? "ABORTING..." : "EMERGENCY ABORT"}
                </Button>
              )}
            </div>

            {/* Collection Stats */}
            {isComplete && (
              <TacticalPanel title="COLLECTION SUMMARY">
                <div className="space-y-2 font-mono text-xs">
                  <KeyValueRow
                    label="ARTIFACTS:"
                    value={`${summary.artifacts || 0} files`}
                    valueClassName="text-primary"
                  />
                  <KeyValueRow
                    label="TOTAL SIZE:"
                    value={summary.totalSize}
                    valueClassName="text-primary"
                  />
                  <KeyValueRow
                    label="HASH ALG:"
                    value={summary.hashAlg}
                    valueClassName="text-primary"
                  />
                  <KeyValueRow
                    label="STATUS:"
                    value={summary.status === "HASH_VERIFIED" ? "HASH VERIFIED" : "LOCKED"}
                    valueClassName="text-primary"
                  />
                </div>
              </TacticalPanel>
            )}

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-secondary px-6 py-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>OPERATOR: {incident?.operator ?? "PENDING"}</span>
        <span>COLLECTOR: {collector?.name ?? "PENDING"}</span>
        <span>{new Date().toISOString()}</span>
      </footer>
    </div>
  );
}
