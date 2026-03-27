import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/StatusIndicator";
import { KeyValueRow } from "@/components/common/KeyValueRow";
import { ChevronLeft, Activity, CheckCircle2, AlertTriangle, Search, Download, GitBranch, ShieldAlert, FileText, Bug, Layers } from "lucide-react";
import { apiGet } from "@/lib/api";

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
    },
    {
        id: "sigma",
        label: "PHASE 2: SIGMA DETECTION",
        desc: "Hayabusa + Chainsaw hunting Sigma rules against event logs",
    },
    {
        id: "timeline",
        label: "PHASE 3: TIMELINE BUILD",
        desc: "Merging all sources into Timesketch-compatible JSONL",
    },
    {
        id: "analytics",
        label: "PHASE 4: ADVANCED ANALYTICS",
        desc: "ATT&CK chain reconstruction, IOC matching, YARA scanning",
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

    const { data: job, isLoading, error } = useQuery<ProcessingJobOut>({
        queryKey: ["processing-status", incidentId],
        queryFn: () => apiGet<ProcessingJobOut>(`/processing/incident/${incidentId}/status`),
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status === "RUNNING" || status === "PENDING" ? 2000 : false;
        },
        retry: false,
    });

    const isDone = job?.status === "DONE";
    const isFailed = job?.status === "FAILED";
    const isRunning = job?.status === "RUNNING" || job?.status === "PENDING";

    return (
        <AppLayout
            title="FORENSICS PROCESSING PIPELINE"
            subtitle={`INCIDENT: ${incidentId}`}
            headerActions={
                <Button variant="ghost" onClick={() => navigate(`/evidence/${incidentId}`)} size="sm">
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    BACK TO VAULT
                </Button>
            }
        >
            <div className="p-6 flex flex-col gap-6 max-w-3xl mx-auto w-full">
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
                        <div className="font-mono text-sm text-muted-foreground py-4">
                            No processing job found. Evidence may still be collecting, or pipeline
                            has not been triggered yet.
                        </div>
                    ) : job ? (
                        <div className="space-y-3 font-mono text-sm">
                            <div className="flex items-center justify-between">
                                <StatusIndicator
                                    status={isDone ? "verified" : isFailed ? "offline" : "active"}
                                    label={job.status}
                                    pulse={isRunning}
                                />
                                {isRunning && (
                                    <span className="text-xs text-muted-foreground animate-pulse">
                                        AUTO-REFRESH ACTIVE
                                    </span>
                                )}
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
                                <div className="mt-3 p-3 border border-destructive/40 bg-destructive/10 text-destructive text-xs">
                                    ERROR: {job.error_message}
                                </div>
                            )}
                        </div>
                    ) : null}
                </TacticalPanel>

                {/* Phase Progress */}
                <TacticalPanel title="PIPELINE PHASES">
                    <div className="space-y-4">
                        {PHASES.map((p) => {
                            const st = job
                                ? phaseStatus(job.phase, job.status, p.id)
                                : "pending";
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
                                    <div>
                                        <div className="font-bold uppercase tracking-wider text-xs">
                                            {p.label}
                                        </div>
                                        <div className="text-muted-foreground text-xs mt-0.5">
                                            {p.desc}
                                        </div>
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
                                    } catch { /* ignore */ }
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
