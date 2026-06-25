import { useCallback, useEffect, useRef, useState } from "react"; // useCallback used in fetchPipelineLogs
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/StatusIndicator";
import { KeyValueRow } from "@/components/common/KeyValueRow";
import { TerminalLog } from "@/components/TerminalLog";
import type { LogEntry } from "@/components/TerminalLog";
import { useAdaptivePolling } from "@/lib/useAdaptivePolling";
import { ChevronLeft, Activity, CheckCircle2, AlertTriangle, Search, Download, GitBranch, ShieldAlert, FileText, Bug, Layers, ChevronDown, ChevronUp, Info, Clock } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";

interface PreflightPhaseStatus {
  ok: boolean;
  status: "ok" | "not_configured" | "missing";
  path: string | null;
}

interface PreflightResponse {
  incident_id: string;
  ready: boolean;
  warnings: string[];
  phases: {
    phase1_artifact_parsing: { ready: boolean; tool: string; status: PreflightPhaseStatus };
    phase2_detection: {
      ready: boolean;
      tools: {
        hayabusa: PreflightPhaseStatus;
        chainsaw: PreflightPhaseStatus;
        sigma_rules: PreflightPhaseStatus;
      };
    };
    phase3_timeline: { ready: boolean };
    phase4_analytics: { ready: boolean; tool: string; status: PreflightPhaseStatus };
  };
  settings_path: string;
}

interface ProcessingJobOut {
    id: string;
    incident_id: string;
    job_id: string;
    status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
    phase: string | null;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    created_at: string;
}

const PHASES = [
    {
        id: "parsing",
        label: "PHASE 1: ARTIFACT PARSING",
        desc: "EZ Tools parsing EVTX, MFT, Registry, Prefetch, LNK",
        toolName: "EZ Tools",
    },
    {
        id: "sigma",
        label: "PHASE 2: SIGMA DETECTION",
        desc: "Hayabusa + Chainsaw hunting Sigma rules against event logs",
        toolName: "Hayabusa / Chainsaw",
    },
    {
        id: "timeline",
        label: "PHASE 3: TIMELINE BUILD",
        desc: "Merging all parsed sources into Timesketch-compatible JSONL",
        toolName: null,
    },
    {
        id: "analytics",
        label: "PHASE 4: ADVANCED ANALYTICS",
        desc: "ATT&CK chain reconstruction, IOC matching, YARA scanning",
        toolName: null,
    },
];

function phaseStatus(
    phase: ProcessingJobOut["phase"],
    jobStatus: ProcessingJobOut["status"],
    phaseId: string
): "pending" | "active" | "complete" | "failed" {
    const order = ["parsing", "sigma", "timeline", "analytics"];
    const current = phase ? order.indexOf(phase) : -1;
    const idx = order.indexOf(phaseId);

    if (jobStatus === "FAILED" && current === idx) return "failed";
    if (jobStatus === "DONE") return "complete";
    if (current > idx) return "complete";
    if (current === idx && jobStatus === "RUNNING") return "active";
    return "pending";
}

export default function ProcessingStatus() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();
    const [errorExpanded, setErrorExpanded] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const { toast } = useToast();

    // Pipeline terminal log state
    const [pipelineLogs, setPipelineLogs] = useState<LogEntry[]>([]);
    const lastLogSeqRef = useRef(0);
    const startedAtRef = useRef<number | null>(null);
    const [elapsedSec, setElapsedSec] = useState(0);

    // Adaptive polling for job status (replaces hardcoded 2000ms refetchInterval)
    const { data: job, isLoading, error, refetch } = useQuery<ProcessingJobOut>({
        queryKey: ["processing-status", incidentId],
        queryFn: () => apiGet<ProcessingJobOut>(`/processing/incident/${incidentId}/status`),
        retry: false,
        refetchInterval: false, // controlled by useAdaptivePolling below
    });

    const isRunning = job?.status === "RUNNING" || job?.status === "PENDING";
    const isDone = job?.status === "DONE";
    const isFailed = job?.status === "FAILED";

    useAdaptivePolling({
        enabled: isRunning,
        onPoll: async () => {
            const res = await refetch();
            const newJob = res.data;
            return newJob ? `${newJob.status}:${newJob.phase}` : null;
        },
        initialInterval: 2000,
        maxInterval: 15_000,
        backoffFactor: 1.3,
    });

    // Fetch pipeline logs (collection_logs written during processing phases)
    const fetchPipelineLogs = useCallback(async () => {
        if (!incidentId) return 0;
        try {
            const data = await apiGet<{
                logs: Array<{ sequence: number; level: string; message: string; timestamp: string }>;
                last_sequence: number;
            }>(`/processing/incident/${incidentId}/logs?since_sequence=${lastLogSeqRef.current}&limit=100`);
            if (data.logs.length > 0) {
                setPipelineLogs((prev) => [
                    ...prev,
                    ...data.logs.map((e) => ({
                        timestamp: new Date(e.timestamp).toLocaleTimeString("en-US", { hour12: false }),
                        level: e.level as LogEntry["level"],
                        message: e.message,
                    })),
                ]);
                lastLogSeqRef.current = data.last_sequence;
            }
            return data.logs.length;
        } catch {
            return 0;
        }
    }, [incidentId]);

    useAdaptivePolling({
        enabled: isRunning,
        onPoll: async () => {
            const count = await fetchPipelineLogs();
            return count > 0 ? `logs-${Date.now()}` : "no-new-logs";
        },
        initialInterval: 2000,
        maxInterval: 10_000,
        backoffFactor: 1.2,
    });

    // Elapsed time counter while running
    useEffect(() => {
        if (isRunning && !startedAtRef.current) {
            startedAtRef.current = Date.now();
        }
        if (!isRunning) return;
        const timer = setInterval(() => {
            if (startedAtRef.current) {
                setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [isRunning]);

    const formatElapsed = (s: number) => {
        const m = Math.floor(s / 60);
        return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
    };

    const handleStartProcessing = async () => {
        if (!incidentId) return;
        setIsStarting(true);
        setStartError(null);
        try {
            await apiPost(`/processing/incident/${incidentId}/trigger`, {});
            await refetch();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to start pipeline";
            setStartError(msg);
            toast({ title: "Start Failed", description: msg, variant: "destructive" });
        } finally {
            setIsStarting(false);
        }
    };

    const role = getStoredRole();
    const { data: preflight } = useQuery<PreflightResponse>({
        queryKey: ["processing-preflight", incidentId],
        queryFn: () => apiGet<PreflightResponse>(`/processing/incident/${incidentId}/preflight`),
        enabled: (role === "admin" || role === "operator") && Boolean(incidentId),
        staleTime: 2 * 60 * 1000,
        retry: false,
    });

    return (
        <AppLayout
            title="FORENSICS PROCESSING PIPELINE"
            subtitle={`INCIDENT: ${incidentId}`}
            headerActions={
                <Button variant="ghost" onClick={() => navigate(`/incidents/${incidentId}`)} size="sm">
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    BACK TO HUB
                </Button>
            }
        >
            <div className="p-6 flex flex-col gap-6 max-w-3xl mx-auto w-full">
                {/* Pre-flight Check Panel — shown to admin/operator when tools are missing */}
                {preflight && !preflight.ready && preflight.warnings.length > 0 && (
                    <TacticalPanel title="PRE-FLIGHT CHECK" status="warning">
                        <div className="space-y-2">
                            <p className="font-mono text-xs text-muted-foreground mb-3">
                                Some pipeline phases will be skipped due to missing tools. The pipeline can still run with partial results.
                            </p>
                            {preflight.warnings.map((w, i) => (
                                <div key={i} className="flex items-start gap-2 font-mono text-xs text-warning/90">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span>{w}</span>
                                </div>
                            ))}
                            <div className="pt-2">
                                <button
                                    onClick={() => navigate("/admin/settings")}
                                    className="font-mono text-[10px] text-primary hover:text-primary/80 underline transition-colors"
                                >
                                    CONFIGURE TOOLS IN SETTINGS →
                                </button>
                            </div>
                        </div>
                    </TacticalPanel>
                )}

                {/* Overall Status */}
                <TacticalPanel
                    title="PIPELINE STATUS"
                    status={isDone ? "online" : isFailed ? "offline" : isRunning ? "active" : "warning"}
                >
                    {isLoading ? (
                        <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground py-4">
                            <Activity className="w-5 h-5 animate-pulse text-primary" />
                            CHECKING PIPELINE STATUS...
                        </div>
                    ) : error ? (
                        <div className="space-y-4 py-2">
                            <div className="font-mono text-sm text-muted-foreground">
                                No processing job found. Collection must complete before the pipeline can run.
                            </div>
                            {startError && (
                                <div className="font-mono text-xs text-destructive">{startError}</div>
                            )}
                            <Button
                                variant="tactical"
                                size="sm"
                                onClick={() => void handleStartProcessing()}
                                disabled={isStarting}
                            >
                                {isStarting ? (
                                    <><Activity className="w-4 h-4 mr-2 animate-pulse" />STARTING...</>
                                ) : (
                                    <><Activity className="w-4 h-4 mr-2" />START PROCESSING PIPELINE</>
                                )}
                            </Button>
                        </div>
                    ) : job ? (
                        <div className="space-y-3 font-mono text-sm">
                            <div className="flex items-center justify-between">
                                <StatusIndicator
                                    status={isDone ? "verified" : isFailed ? "offline" : "active"}
                                    label={job.status}
                                    pulse={isRunning}
                                />
                                <div className="flex items-center gap-3">
                                    {isRunning && elapsedSec > 0 && (
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                                            <Clock className="w-3 h-3" />
                                            {formatElapsed(elapsedSec)}
                                        </span>
                                    )}
                                    {isRunning && (
                                        <span className="text-xs text-muted-foreground animate-pulse">
                                            AUTO-REFRESH
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-2">
                                <KeyValueRow label="JOB ID:" value={job.id} />
                                <KeyValueRow label="EVIDENCE JOB:" value={job.job_id} />
                                <KeyValueRow
                                    label="STARTED:"
                                    value={job.started_at ? new Date(job.started_at).toLocaleString() : "—"}
                                />
                                <KeyValueRow
                                    label="COMPLETED:"
                                    value={job.completed_at ? new Date(job.completed_at).toLocaleString() : "—"}
                                />
                            </div>
                            {isFailed && job.error_message && (
                                <div className="mt-3 border border-destructive/40 bg-destructive/10 text-destructive text-xs">
                                    <button
                                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-destructive/10 transition-colors"
                                        onClick={() => setErrorExpanded((v) => !v)}
                                    >
                                        <span className="font-bold uppercase tracking-wider">ERROR DETAILS</span>
                                        {errorExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </button>
                                    {errorExpanded && (
                                        <div className="px-3 pb-3 font-mono text-xs whitespace-pre-wrap break-words border-t border-destructive/30 pt-2">
                                            {job.error_message}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : null}
                </TacticalPanel>

                {/* Pipeline terminal — live output from EZ Tools, Sigma, Timeline build */}
                {(isRunning || pipelineLogs.length > 0) && (
                    <TacticalPanel
                        title={`PIPELINE LOG${pipelineLogs.length > 0 ? ` — ${pipelineLogs.length} entries` : ""}`}
                        status={isRunning ? "active" : "online"}
                        className="flex flex-col"
                        headerActions={
                            <span className="font-mono text-xs text-muted-foreground">
                                {isRunning ? "Live" : "Completed"}
                            </span>
                        }
                    >
                        <div className="h-72 flex flex-col min-h-0">
                            <TerminalLog
                                entries={pipelineLogs}
                                className="flex-1"
                                searchable
                                autoScroll={isRunning}
                            />
                        </div>
                    </TacticalPanel>
                )}

                {/* Phase Progress */}
                <TacticalPanel title="PIPELINE PHASES">
                    <div className="space-y-4">
                        {PHASES.map((p) => {
                            const st = job
                                ? phaseStatus(job.phase, job.status, p.id)
                                : "pending";
                            const toolMissing = (() => {
                                if (!preflight) return false;
                                if (p.id === "parsing") return !preflight.phases.phase1_artifact_parsing.ready;
                                if (p.id === "sigma") return !preflight.phases.phase2_detection.ready;
                                if (p.id === "analytics") return !preflight.phases.phase4_analytics.ready;
                                return false;
                            })();
                            return (
                                <div
                                    key={p.id}
                                    className={`flex items-start gap-4 p-3 border rounded-sm font-mono text-sm transition-colors ${
                                        st === "active"
                                            ? "border-primary/60 bg-primary/5"
                                            : st === "complete"
                                            ? "border-border bg-secondary/30"
                                            : st === "failed"
                                            ? "border-destructive/60 bg-destructive/5"
                                            : "border-border/40 opacity-50"
                                    }`}
                                >
                                    <div className="shrink-0 mt-0.5">
                                        {st === "complete" ? (
                                            <CheckCircle2 className="w-4 h-4 text-primary" />
                                        ) : st === "active" ? (
                                            <Activity className="w-4 h-4 text-primary animate-pulse" />
                                        ) : st === "failed" ? (
                                            <AlertTriangle className="w-4 h-4 text-destructive" />
                                        ) : (
                                            <div className="w-4 h-4 rounded-full border border-muted-foreground/40" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold uppercase tracking-wider text-xs">
                                            {p.label}
                                        </div>
                                        <div className="text-muted-foreground text-xs mt-0.5">
                                            {p.desc}
                                        </div>
                                        {toolMissing && (
                                            <div className="flex items-center gap-1 mt-1 text-yellow-500/80 text-xs">
                                                <Info className="w-3 h-3 shrink-0" />
                                                <span>{p.toolName} not configured — phase will complete with 0 results</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="ml-auto shrink-0 text-xs text-muted-foreground uppercase">
                                        {st}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </TacticalPanel>

                {/* Actions */}
                {isDone && (
                    <TacticalPanel title="ANALYSIS READY">
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                variant="tactical"
                                className="col-span-2"
                                onClick={() => navigate(`/incidents/${incidentId}/sigma-hits`)}
                            >
                                <Search className="w-4 h-4 mr-2" />
                                VIEW SIGMA HITS
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => navigate(`/incidents/${incidentId}/attack-chains`)}
                            >
                                <GitBranch className="w-4 h-4 mr-2" />
                                ATTACK CHAINS
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => navigate(`/incidents/${incidentId}/ioc-matches`)}
                            >
                                <ShieldAlert className="w-4 h-4 mr-2" />
                                IOC MATCHES
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => navigate(`/incidents/${incidentId}/yara-matches`)}
                            >
                                <Bug className="w-4 h-4 mr-2" />
                                YARA MATCHES
                            </Button>
                            <Button
                                variant="outline"
                                className="col-span-2"
                                onClick={() => navigate(`/incidents/${incidentId}/super-timeline`)}
                            >
                                <Layers className="w-4 h-4 mr-2" />
                                SUPER TIMELINE (MULTI-HOST)
                            </Button>
                            <Button
                                variant="ghost"
                                className="col-span-2"
                                disabled={!job?.job_id}
                                onClick={async () => {
                                    if (!job?.job_id) return;
                                    try {
                                        const blob = await apiGet<Blob>(`/processing/${encodeURIComponent(job.job_id)}/timeline/download`);
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `timeline_${job.job_id}.jsonl`;
                                        document.body.appendChild(a);
                                        a.click();
                                        a.remove();
                                        window.URL.revokeObjectURL(url);
                                    } catch (err) {
                                        console.error("Timeline download failed:", err);
                                        toast({
                                            title: "Download Failed",
                                            description: "Could not download timeline.jsonl. Check the console for details.",
                                            variant: "destructive",
                                        });
                                    }
                                }}
                            >
                                <Download className="w-4 h-4 mr-2" />
                                DOWNLOAD TIMELINE.JSONL
                            </Button>
                            <Button
                                variant="outline"
                                className="col-span-2"
                                onClick={() => navigate(`/incidents/${incidentId}/report`)}
                            >
                                <FileText className="w-4 h-4 mr-2" />
                                VIEW REPORT
                            </Button>
                        </div>
                    </TacticalPanel>
                )}
            </div>
        </AppLayout>
    );
}
