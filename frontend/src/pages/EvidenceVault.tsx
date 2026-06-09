import React, { useEffect, useState, useMemo, memo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { SearchInput } from "@/components/common/SearchInput";
import { TableHeaderRow } from "@/components/common/TableHeaderRow";
import {
  Folder,
  FileText,
  Download,
  Lock,
  CheckCircle2,
  ChevronRight,
  HardDrive,
  Activity,
  GitBranch,
  ShieldAlert,
  Search,
  Bug,
  Loader2,
  Target,
} from "lucide-react";
import type { Evidence } from "@/types/dfir";
import { apiGet, apiPost } from "@/lib/api";
import { TimelineExplorer } from "@/components/TimelineExplorer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvidenceFolder {
  id: string;
  incidentId: string;
  type: string;
  date: string;
  filesCount: number;
  totalSize: string;
  status: "LOCKED" | "HASH_VERIFIED";
}

interface EvidenceFolderResponse {
  id: string;
  incident_id: string;
  type: string;
  date: string;
  files_count: number;
  total_size: string;
  status: "LOCKED" | "HASH_VERIFIED";
}

interface EvidenceItemResponse {
  id: string;
  incident_id: string;
  name: string;
  type: string;
  size: string;
  status: "COLLECTING" | "LOCKED" | "HASH_VERIFIED" | "EXPORTED";
  hash: string;
  collected_at: string;
}

interface DiagnosticsResponse {
  storage_used_percent: number | null;
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

// ─── Mapping ──────────────────────────────────────────────────────────────────

const mapFolder = (folder: EvidenceFolderResponse): EvidenceFolder => ({
  id: folder.id,
  incidentId: folder.incident_id,
  type: folder.type,
  date: folder.date,
  filesCount: folder.files_count,
  totalSize: folder.total_size,
  status: folder.status,
});

const mapEvidence = (item: EvidenceItemResponse): Evidence => ({
  id: item.id,
  incidentId: item.incident_id,
  name: item.name,
  type: item.type,
  size: item.size,
  status: item.status,
  hash: item.hash,
  collectedAt: item.collected_at,
});

// ─── Memoized Row ─────────────────────────────────────────────────────────────

const EvidenceRow = memo(({ 
    evidence, 
    onExport, 
    onHunt, 
    isExporting 
}: { 
    evidence: Evidence; 
    onExport: (id: string) => void; 
    onHunt: (id: string) => void;
    isExporting: boolean;
}) => (
    <div
      className="grid grid-cols-12 gap-4 px-4 py-3 bg-secondary/20 hover:bg-secondary/40 transition-colors border border-transparent hover:border-border/60 group"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 48px" }}
    >
      <div className="col-span-4 flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="font-mono text-sm truncate font-bold">{evidence.name}</span>
      </div>
      <div className="col-span-2 font-mono text-xs text-muted-foreground uppercase">{evidence.type}</div>
      <div className="col-span-2 font-mono text-xs text-muted-foreground tabular-nums">{evidence.size}</div>
      <div className="col-span-2">
        <div className="flex items-center gap-1.5">
          {evidence.status === "HASH_VERIFIED" ? (
            <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="font-mono text-[10px] text-green-400 font-bold uppercase">VERIFIED</span></>
          ) : (
            <><Lock className="w-3.5 h-3.5 text-primary/60" /><span className="font-mono text-[10px] text-primary/60 uppercase">LOCKED</span></>
          )}
        </div>
      </div>
      <div className="col-span-2 flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="sm" onClick={() => onExport(evidence.id)} disabled={isExporting} title="Download Raw File" className="h-7 w-8 p-0">
          <Download className="w-4 h-4" />
        </Button>
        {(evidence.type === 'PROCESSED_TIMELINE' || evidence.name.includes("super_timeline")) && (
          <Button variant="tactical" size="sm" onClick={() => onHunt(evidence.id)} className="h-7 px-3 bg-primary/10 border-primary/40 text-primary text-[10px]">
            <Target className="w-3.5 h-3.5 mr-1.5" /> HUNT
          </Button>
        )}
      </div>
    </div>
));
EvidenceRow.displayName = "EvidenceRow";

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function EvidenceVault() {
  const { id: incidentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);

  // Queries
  const { data: folders = [], isLoading: foldersLoading } = useQuery<EvidenceFolderResponse[], Error, EvidenceFolder[]>({
    queryKey: ["evidence-folders", incidentId ?? "all"],
    queryFn: () => apiGet<EvidenceFolderResponse[]>(incidentId ? `/evidence/folders?incident_id=${encodeURIComponent(incidentId)}` : "/evidence/folders"),
    select: (data) => data.map(mapFolder),
    staleTime: 30_000,
  });

  const { data: diagnostics } = useQuery<DiagnosticsResponse>({
    queryKey: ["diagnostics"],
    queryFn: () => apiGet<DiagnosticsResponse>("/status/diagnostics"),
    staleTime: 60_000,
  });

  const selectedFolder = useMemo(() => {
      if (selectedFolderId) return folders.find(f => f.id === selectedFolderId);
      if (incidentId) return folders.find(f => f.incidentId === incidentId);
      return undefined;
  }, [folders, selectedFolderId, incidentId]);

  const { data: evidenceItems = [], isLoading: itemsLoading } = useQuery<EvidenceItemResponse[], Error, Evidence[]>({
    queryKey: ["evidence-items", selectedFolder?.incidentId],
    queryFn: () => apiGet<EvidenceItemResponse[]>(`/evidence/items?incident_id=${selectedFolder?.incidentId}`),
    enabled: !!selectedFolder,
    select: (data) => data.map(mapEvidence),
    staleTime: 30_000,
  });

  const { data: procJob } = useQuery<ProcessingJobOut>({
    queryKey: ["processing-job-status", selectedFolder?.incidentId],
    queryFn: () => apiGet<ProcessingJobOut>(`/processing/incident/${selectedFolder?.incidentId}/status`),
    enabled: !!selectedFolder,
    refetchInterval: (q) => {
        const s = q.state.data?.status;
        return (s === "RUNNING" || s === "PENDING") ? 5000 : 30000;
    },
  });

  const filteredEvidence = useMemo(() => {
      if (!searchQuery.trim()) return evidenceItems;
      const q = searchQuery.toLowerCase();
      return evidenceItems.filter((e) => e.name.toLowerCase().includes(q));
  }, [evidenceItems, searchQuery]);

  const capacityPercent = diagnostics?.storage_used_percent ?? null;
  const formattedCapacity = capacityPercent !== null ? `${Math.round(capacityPercent)}%` : "--";

  const handleExportAll = async () => {
    if (!selectedFolder) return;
    setIsExporting(true);
    try {
      const response = await apiPost<{ download_url: string; signature?: string | null }>("/evidence/exports", { incident_id: selectedFolder.incidentId });
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api/v1";
      const sig = response.signature ? `?signature=${encodeURIComponent(response.signature)}` : "";
      window.location.assign(`${baseUrl}${response.download_url}${sig}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportItem = useCallback(async (evidenceId: string) => {
    setIsExporting(true);
    try {
      const response = await apiPost<{ download_url: string; signature?: string | null }>("/evidence/exports", { evidence_id: evidenceId });
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api/v1";
      const sig = response.signature ? `?signature=${encodeURIComponent(response.signature)}` : "";
      window.location.assign(`${baseUrl}${response.download_url}${sig}`);
    } finally {
      setIsExporting(false);
    }
  }, []);

  if (selectedTimelineId && selectedFolder) {
    return <TimelineExplorer evidenceId={selectedTimelineId} incidentId={selectedFolder.incidentId} onBack={() => setSelectedTimelineId(null)} />;
  }

  return (
    <AppLayout
      title="EVIDENCE VAULT"
      subtitle="SECURE FORENSIC STORAGE"
      headerActions={
        <div className="flex items-center gap-3 font-mono text-[10px] tracking-widest uppercase text-muted-foreground border-l border-border pl-4">
          <HardDrive className="w-3.5 h-3.5" />
          <span>CAPACITY: <span className={cn("font-bold", capacityPercent && capacityPercent >= 75 ? "text-warning" : "text-foreground")}>{formattedCapacity}</span></span>
        </div>
      }
    >
      <div className="p-6 h-full flex flex-col gap-6">
        <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
          
          {/* Case Navigator */}
          <div className="col-span-4 flex flex-col min-h-0">
            <TacticalPanel title="CASE FOLDERS" status={foldersLoading ? "active" : "online"} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto space-y-1 pr-1 custom-scrollbar">
                {foldersLoading ? (
                    <div className="flex items-center justify-center py-12 text-primary/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : folders.length === 0 ? (
                    <div className="p-8 text-center font-mono text-xs text-muted-foreground uppercase opacity-40">Empty database</div>
                ) : (
                  folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFolderId(f.id)}
                      className={cn(
                          "w-full text-left p-3 border transition-all rounded-sm flex items-start gap-3 group",
                          (selectedFolderId === f.id || incidentId === f.incidentId) ? "border-primary bg-primary/10" : "border-border/40 bg-secondary/15 hover:border-border"
                      )}
                    >
                      <Folder className={cn("w-4 h-4 mt-0.5", (selectedFolderId === f.id || incidentId === f.incidentId) ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold truncate tracking-tighter uppercase">{f.incidentId}</span>
                          {f.status === "HASH_VERIFIED" && <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground uppercase opacity-70">{f.type.replace(/_/g, " ")}</div>
                        <div className="font-mono text-[9px] text-muted-foreground mt-1 uppercase tracking-tight">{f.filesCount} FILES • {f.totalSize}</div>
                      </div>
                      <ChevronRight className={cn("w-3.5 h-3.5 self-center", (selectedFolderId === f.id || incidentId === f.incidentId) ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100")} />
                    </button>
                  ))
                )}
              </div>
            </TacticalPanel>
          </div>

          {/* Evidence Browser */}
          <div className="col-span-8 flex flex-col gap-4 min-h-0">
            {selectedFolder ? (
              <>
                <TacticalPanel title={`ANALYSIS_HUB_ROOT:/${selectedFolder.incidentId}`} status={selectedFolder.status === "HASH_VERIFIED" ? "verified" : "locked"}>
                  <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider">
                    <div className="flex gap-6">
                        <div><span className="text-muted-foreground">ORIGIN: </span><span className="text-foreground">{selectedFolder.type.replace(/_/g, " ")}</span></div>
                        <div><span className="text-muted-foreground">STAMP: </span><span className="text-foreground">{selectedFolder.date}</span></div>
                        <div><span className="text-muted-foreground">VOLUME: </span><span className="text-foreground">{selectedFolder.totalSize}</span></div>
                    </div>
                    <StatusIndicator status={selectedFolder.status === "HASH_VERIFIED" ? "verified" : "locked"} />
                  </div>
                </TacticalPanel>

                {procJob && (
                    <div className={cn(
                        "flex items-center gap-3 px-4 py-2 border font-mono text-[10px] uppercase tracking-widest rounded-sm",
                        procJob.status === "DONE" ? "border-green-500/40 bg-green-500/5 text-green-400" :
                        procJob.status === "FAILED" ? "border-red-500/40 bg-red-500/5 text-red-400" : "border-primary/40 bg-primary/5 text-primary"
                    )}>
                        {procJob.status === "DONE" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Activity className={cn("w-3.5 h-3.5", (procJob.status === "RUNNING" || procJob.status === "PENDING") && "animate-pulse")} />}
                        <span>Pipeline: {procJob.status} {procJob.phase && `(${procJob.phase})`}</span>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/incidents/${selectedFolder.incidentId}/processing`)} className="ml-auto h-6 px-2 text-[9px] border border-border/60 hover:border-primary/40">VIEW PIPELINE →</Button>
                    </div>
                )}

                <div className="flex items-center gap-3">
                  <SearchInput value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filter artifacts..." className="flex-1 h-8 text-[11px]" />
                  <Button variant="tactical" size="sm" onClick={handleExportAll} disabled={isExporting} className="h-8 font-mono text-[10px] tracking-widest">
                    <Download className="w-3.5 h-3.5 mr-2" /> EXPORT ALL
                  </Button>
                </div>

                <TacticalPanel title="ARTIFACT_MANIFEST" className="flex-1 flex flex-col min-h-0" status={itemsLoading ? "active" : "online"}>
                    <div className="flex-1 overflow-auto pr-1 custom-scrollbar">
                        <TableHeaderRow className="grid grid-cols-12 gap-4 py-2 px-4 border-b border-border/40 font-mono text-[10px] uppercase text-muted-foreground tracking-widest sticky top-0 bg-background/95 backdrop-blur z-10">
                          <div className="col-span-4 text-left">Entity</div>
                          <div className="col-span-2">Type</div>
                          <div className="col-span-2">Size</div>
                          <div className="col-span-2">Status</div>
                          <div className="col-span-2 text-right">Ops</div>
                        </TableHeaderRow>
                        <div className="divide-y divide-border/10">
                            {itemsLoading ? (
                                <div className="flex items-center justify-center py-12 text-primary/40 font-mono text-xs animate-pulse">INDEXING FILESYSTEM...</div>
                            ) : filteredEvidence.length === 0 ? (
                                <div className="py-12 text-center font-mono text-xs text-muted-foreground uppercase opacity-40">No entries in manifest</div>
                            ) : (
                                filteredEvidence.map((e) => (
                                    <EvidenceRow key={e.id} evidence={e} onExport={handleExportItem} onHunt={setSelectedTimelineId} isExporting={isExporting} />
                                ))
                            )}
                        </div>
                    </div>
                </TacticalPanel>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center border border-dashed border-border/40 rounded-sm bg-secondary/5">
                <div className="text-center space-y-4 opacity-30 group">
                  <Folder className="w-16 h-16 text-muted-foreground mx-auto transition-transform group-hover:scale-110" />
                  <div className="font-mono text-xs text-muted-foreground uppercase tracking-[0.3em]">Select Case Sequence</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
