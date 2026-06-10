import React, { useEffect, useState, useMemo, memo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import { SearchInput } from "@/components/common/SearchInput";
import { TableHeaderRow } from "@/components/common/TableHeaderRow";
import { TablePagination } from "@/components/TablePagination";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
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
  ShieldCheck,
  Fingerprint,
  Filter,
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

interface EvidenceItemListOut {
  items: EvidenceItemResponse[];
  total: number;
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

// ─── Memoized Components ──────────────────────────────────────────────────

const HashInspector = ({ hash, status, name }: { hash: string; status: string; name: string }) => (
    <Popover>
        <PopoverTrigger asChild>
            <button className="flex items-center gap-1.5 hover:bg-secondary/40 px-1.5 py-0.5 rounded-sm transition-colors group">
                {status === "HASH_VERIFIED" ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="font-mono text-[9px] text-green-400 font-bold uppercase">VERIFIED</span></>
                ) : (
                    <><Lock className="w-3.5 h-3.5 text-primary/60" /><span className="font-mono text-[9px] text-primary/60 uppercase">LOCKED</span></>
                )}
            </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 bg-card border-border shadow-xl p-0 overflow-hidden" align="start">
            <div className="bg-secondary/30 p-3 border-b border-border/40">
                <div className="flex items-center gap-2 text-primary">
                    <Fingerprint className="w-4 h-4" />
                    <span className="font-bold text-[10px] uppercase tracking-widest">Integritas Forensik</span>
                </div>
            </div>
            <div className="p-3 space-y-3">
                <div>
                    <div className="text-[9px] text-muted-foreground uppercase mb-1">Entity Name</div>
                    <div className="text-xs font-medium truncate">{name}</div>
                </div>
                <div>
                    <div className="text-[9px] text-muted-foreground uppercase mb-1">SHA256 Fingerprint</div>
                    <div className="bg-background border border-border/60 p-2 font-mono text-[10px] break-all leading-tight rounded-sm select-all">
                        {hash || "PENDING_CALCULATION"}
                    </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                    <ShieldCheck className={cn("w-3.5 h-3.5", status === "HASH_VERIFIED" ? "text-green-400" : "text-muted-foreground")} />
                    <span className="text-[9px] font-bold uppercase tracking-tight">
                        {status === "HASH_VERIFIED" ? "Chain of custody verified" : "Awaiting validation"}
                    </span>
                </div>
            </div>
        </PopoverContent>
    </Popover>
);

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
      className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-secondary/10 hover:bg-secondary/30 transition-colors border-b border-border/5 group"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 44px" }}
    >
      <div className="col-span-4 flex items-center gap-3 min-w-0">
        <div className="p-1.5 bg-secondary/60 rounded-sm text-muted-foreground shrink-0">
            <FileText className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs truncate font-medium text-foreground/90 leading-none">{evidence.name}</span>
      </div>
      <div className="col-span-2 flex items-center">
        <span className="font-mono text-[9px] text-primary/60 border border-primary/20 bg-primary/5 px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-tighter">
            {evidence.type.replace(/_/g, " ")}
        </span>
      </div>
      <div className="col-span-2 font-mono text-[10px] text-muted-foreground flex items-center tabular-nums">{evidence.size}</div>
      <div className="col-span-2 flex items-center">
        <HashInspector hash={evidence.hash} status={evidence.status} name={evidence.name} />
      </div>
      <div className="col-span-2 flex items-center gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => onExport(evidence.id)} disabled={isExporting} title="Export Artifact" className="h-7 w-7 p-0 opacity-40 hover:opacity-100 group-hover:bg-background border border-transparent hover:border-border">
          <Download className="w-3.5 h-3.5" />
        </Button>
        {(evidence.type === 'PROCESSED_TIMELINE' || evidence.name.includes("super_timeline")) && (
          <Button variant="outline" size="sm" onClick={() => onHunt(evidence.id)} className="h-7 px-2.5 border-primary/40 text-primary text-[9px] font-bold uppercase tracking-widest hover:bg-primary/10">
            HUNT
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
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Queries
  const { data: folders = [], isLoading: foldersLoading } = useQuery<EvidenceFolderResponse[], Error, EvidenceFolder[]>({
    queryKey: ["evidence-folders", incidentId ?? "all"],
    queryFn: () => apiGet<EvidenceFolderResponse[]>(incidentId ? `/evidence/folders?incident_id=${encodeURIComponent(incidentId)}` : "/evidence/folders"),
    select: (data) => data.map(mapFolder),
    staleTime: 60_000,
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

  // Reset pagination when folder, search or filter changes
  useEffect(() => {
      setPage(1);
  }, [selectedFolder?.id, searchQuery, activeTypeFilter]);

  const { data: evidenceData = { items: [], total: 0 }, isLoading: itemsLoading } = useQuery<EvidenceItemListOut, Error, { items: Evidence[], total: number }>({
    queryKey: ["evidence-items", selectedFolder?.incidentId, page, pageSize, searchQuery, activeTypeFilter],
    queryFn: () => {
        const params = new URLSearchParams({
            incident_id: selectedFolder?.incidentId ?? "",
            limit: String(pageSize),
            offset: String((page - 1) * pageSize)
        });
        if (searchQuery.trim()) params.append("search", searchQuery.trim());
        if (activeTypeFilter) params.append("type", activeTypeFilter);
        return apiGet<EvidenceItemListOut>(`/evidence/items?${params.toString()}`);
    },
    enabled: !!selectedFolder,
    select: (data) => ({
        items: data.items.map(mapEvidence),
        total: data.total
    }),
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

  const artifactTypes = ["LOG", "REGISTRY", "FILE", "MEMORY", "MFT", "PROCESSED_TIMELINE"];

  if (selectedTimelineId && selectedFolder) {
    return <TimelineExplorer evidenceId={selectedTimelineId} incidentId={selectedFolder.incidentId} onBack={() => setSelectedTimelineId(null)} />;
  }

  return (
    <AppLayout
      title="EVIDENCE VAULT"
      subtitle="SECURE FORENSIC STORAGE"
      headerActions={
        <div className="flex items-center gap-3 font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground border-l border-border/40 pl-4">
          <HardDrive className="w-3 h-3" />
          <span>CAPACITY: <span className={cn("font-bold tabular-nums", capacityPercent && capacityPercent >= 75 ? "text-warning animate-pulse" : "text-foreground")}>{formattedCapacity}</span></span>
        </div>
      }
    >
      <div className="p-6 h-full flex flex-col gap-6">
        <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
          
          {/* Case Navigator */}
          <div className="col-span-12 lg:col-span-4 flex flex-col min-h-0">
            <TacticalPanel title="CASE_FOLDERS" status={foldersLoading ? "active" : "online"} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto space-y-1.5 pr-2 custom-scrollbar">
                {foldersLoading ? (
                    <div className="flex items-center justify-center py-12 text-primary/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : folders.length === 0 ? (
                    <div className="p-12 text-center text-[10px] text-muted-foreground uppercase opacity-40 border border-dashed border-border/40 rounded-sm">No active collections found</div>
                ) : (
                  folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFolderId(f.id)}
                      className={cn(
                          "w-full text-left p-3 border transition-all rounded-sm flex items-start gap-4 group relative overflow-hidden",
                          (selectedFolderId === f.id || incidentId === f.incidentId) ? "border-primary bg-primary/10" : "border-border/20 bg-secondary/10 hover:border-border/60"
                      )}
                    >
                      {(selectedFolderId === f.id || incidentId === f.incidentId) && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                      <div className={cn(
                          "p-2 rounded-sm shrink-0",
                          (selectedFolderId === f.id || incidentId === f.incidentId) ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground group-hover:text-foreground"
                      )}>
                        <Folder className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-xs font-bold truncate tracking-tight text-foreground uppercase">{f.incidentId}</span>
                          {f.status === "HASH_VERIFIED" && <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-medium uppercase leading-none mb-2">{f.type.replace(/_/g, " ")}</div>
                        <div className="flex items-center gap-3 font-mono text-[9px] text-muted-foreground/60 uppercase tracking-tighter">
                            <span>{f.filesCount} OBJ</span>
                            <span className="w-1 h-1 bg-border/40 rounded-full" />
                            <span>{f.totalSize}</span>
                        </div>
                      </div>
                      <ChevronRight className={cn("w-3.5 h-3.5 self-center", (selectedFolderId === f.id || incidentId === f.incidentId) ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity")} />
                    </button>
                  ))
                )}
              </div>
            </TacticalPanel>
          </div>

          {/* Evidence Browser */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-4 min-h-0">
            {selectedFolder ? (
              <>
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-1">
                    <div className="flex gap-4 items-center">
                        <span className="text-primary font-bold">DIRECTORY:</span>
                        <span className="text-foreground">/{selectedFolder.incidentId}</span>
                        <span className="opacity-30">|</span>
                        <span>ORIGIN: {selectedFolder.type}</span>
                        <span className="opacity-30">|</span>
                        <span>STAMP: {selectedFolder.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px]">ENCRYPTION: AES-256</span>
                        <ShieldCheck className="w-3 h-3 text-green-500" />
                    </div>
                </div>

                {procJob && (
                    <div className={cn(
                        "flex items-center gap-3 px-4 py-2 border font-mono text-[10px] uppercase tracking-widest rounded-sm transition-all",
                        procJob.status === "DONE" ? "border-green-500/30 bg-green-500/5 text-green-400" :
                        procJob.status === "FAILED" ? "border-red-500/30 bg-red-500/5 text-red-400" : "border-primary/30 bg-primary/5 text-primary"
                    )}>
                        {procJob.status === "DONE" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Activity className={cn("w-3.5 h-3.5", (procJob.status === "RUNNING" || procJob.status === "PENDING") && "animate-pulse")} />}
                        <span className="font-bold">PARSING ENGINE: {procJob.status} {procJob.phase && `[PHASE: ${procJob.phase}]`}</span>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/incidents/${selectedFolder.incidentId}/processing`)} className="ml-auto h-6 px-2 text-[8px] font-bold border border-border/40 hover:bg-background transition-colors">DIAGNOSTICS →</Button>
                    </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <SearchInput value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filter artifacts by name, extension, or hash..." className="flex-1 h-9 text-[11px] bg-secondary/10" />
                    <Button variant="tactical" size="sm" onClick={handleExportAll} disabled={isExporting} className="h-9 px-4 font-mono text-[10px] tracking-widest">
                      <Download className="w-3.5 h-3.5 mr-2" /> EXPORT FULL ARCHIVE
                    </Button>
                  </div>
                  
                  {/* Quick Filters */}
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                    <div className="flex items-center gap-1.5 pr-2 border-r border-border/40 mr-1 shrink-0">
                        <Filter className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Quick Filter</span>
                    </div>
                    <button 
                        onClick={() => setActiveTypeFilter(null)}
                        className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-tight border transition-all whitespace-nowrap",
                            activeTypeFilter === null ? "bg-primary text-primary-foreground border-primary shadow-[0_0_8px_rgba(21,245,116,0.3)]" : "bg-secondary/40 text-muted-foreground border-border/20 hover:border-border/60"
                        )}
                    >
                        All Entities
                    </button>
                    {artifactTypes.map((t) => (
                        <button 
                            key={t}
                            onClick={() => setActiveTypeFilter(t)}
                            className={cn(
                                "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-tight border transition-all whitespace-nowrap",
                                activeTypeFilter === t ? "bg-primary text-primary-foreground border-primary shadow-[0_0_8px_rgba(21,245,116,0.3)]" : "bg-secondary/40 text-muted-foreground border-border/20 hover:border-border/60"
                            )}
                        >
                            {t.replace(/_/g, " ")}
                        </button>
                    ))}
                  </div>
                </div>

                <TacticalPanel title="ARTIFACT_MANIFEST_VIEW" className="flex-1 flex flex-col min-h-0" status={itemsLoading ? "active" : "online"}>
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <TableHeaderRow className="grid grid-cols-12 gap-4 py-3 px-4 border-b border-border/60 font-mono text-[9px] font-bold uppercase text-muted-foreground/60 tracking-[0.2em] sticky top-0 bg-background/95 backdrop-blur z-20">
                              <div className="col-span-4 text-left">ENTITY_IDENTIFIER</div>
                              <div className="col-span-2">TYPE_TAG</div>
                              <div className="col-span-2">ALLOC_SIZE</div>
                              <div className="col-span-2">INTEGRITY_STATUS</div>
                              <div className="col-span-2 text-right">SYSTEM_OPS</div>
                            </TableHeaderRow>
                            <div className="divide-y divide-border/5">
                                {itemsLoading && page === 1 ? (
                                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                                        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                                        <div className="font-mono text-[10px] text-primary/40 uppercase tracking-[0.3em] animate-pulse">Scanning Evidence Sector...</div>
                                    </div>
                                ) : evidenceData.items.length === 0 ? (
                                    <div className="py-20 text-center flex flex-col items-center gap-3 opacity-30">
                                        <Search className="w-10 h-10 text-muted-foreground" />
                                        <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">No entries match the defined sector query</div>
                                    </div>
                                ) : (
                                    evidenceData.items.map((e) => (
                                        <EvidenceRow key={e.id} evidence={e} onExport={handleExportItem} onHunt={setSelectedTimelineId} isExporting={isExporting} />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Pagination */}
                        {evidenceData.total > 0 && (
                            <div className="border-t border-border/40 bg-secondary/10 px-4 py-2 flex items-center justify-between shrink-0">
                                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-tighter">
                                    Displaying {evidenceData.items.length} of {evidenceData.total} forensic artifacts
                                </div>
                                <TablePagination
                                    currentPage={page}
                                    totalPages={Math.ceil(evidenceData.total / pageSize)}
                                    totalItems={evidenceData.total}
                                    itemsPerPage={pageSize}
                                    onPageChange={setPage}
                                    onItemsPerPageChange={setPageSize}
                                />
                            </div>
                        )}
                    </div>
                </TacticalPanel>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-border/20 rounded-sm bg-secondary/5 group">
                <div className="text-center space-y-6 max-w-xs transition-all transform group-hover:scale-[1.02]">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full" />
                    <Folder className="w-20 h-20 text-muted-foreground/20 mx-auto relative z-10" />
                  </div>
                  <div className="space-y-2">
                    <div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.4em] font-bold">Select Case Sector</div>
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">Please select a case folder from the sidebar to begin artifact analysis and verification.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
