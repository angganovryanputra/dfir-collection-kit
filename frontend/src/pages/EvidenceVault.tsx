import React, { useEffect, useState, useMemo, memo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { 
  FolderLock, 
  Search, 
  Download, 
  FileText, 
  Clock, 
  Server,
  Filter,
  ArrowRight,
  Database,
  Terminal,
  ChevronRight,
  Eye,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SafeText } from "@/components/common/SafeText";
import { EvidenceIntegrityBadge } from "@/components/common/EvidenceIntegrityBadge";
import { DataTable, ColumnDef } from "@/components/common/DataTable";
import { toast } from "sonner";
import { evidenceItems } from "@/lib/evidence";

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

interface EvidenceItemListResponse {
  items: EvidenceItemResponse[];
  total: number;
}

interface EvidenceExportResponse {
  download_url: string;
  signature?: string | null;
}

interface EvidenceActivity {
  id: string;
  timestamp: string;
  action: string;
  status: "success" | "error";
  detail: string;
}

const EvidenceItemRow = memo(({ item }: { item: EvidenceItemResponse }) => (
  <div className="flex items-center justify-between p-3 border border-border/40 bg-secondary/20 hover:bg-secondary/40 transition-all group">
    <div className="flex items-center gap-3 min-w-0">
      <FileText className="w-4 h-4 text-primary/60 shrink-0" />
      <div className="flex flex-col min-w-0">
        <SafeText text={item.name} className="font-mono text-xs font-bold text-foreground truncate" />
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-tight">{item.type}</span>
          <span className="w-1 h-1 rounded-full bg-border/60" />
          <span className="text-[10px] text-muted-foreground tabular-nums">{item.size}</span>
        </div>
      </div>
    </div>
    <div className="flex items-center gap-4 shrink-0">
      <EvidenceIntegrityBadge status={item.status} />
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Download className="w-4 h-4" />
      </Button>
    </div>
  </div>
));
EvidenceItemRow.displayName = "EvidenceItemRow";

export default function EvidenceVault() {
  const { id: incidentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItem, setSelectedItem] = useState<EvidenceItemResponse | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isExportingCase, setIsExportingCase] = useState(false);
  const [activityQuery, setActivityQuery] = useState("");
  const [activityHistory, setActivityHistory] = useState<EvidenceActivity[]>(() => {
    try { return JSON.parse(localStorage.getItem("evidence-vault-activity") || "[]") as EvidenceActivity[]; }
    catch { return []; }
  });
  const detailPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!selectedItem) return;

    const keepFocusInPanel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedItem(null);
        return;
      }
      if (event.key !== "Tab" || !detailPanelRef.current) return;

      const focusable = Array.from(detailPanelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", keepFocusInPanel);
    return () => document.removeEventListener("keydown", keepFocusInPanel);
  }, [selectedItem]);

  const recordActivity = useCallback((action: string, status: EvidenceActivity["status"], detail: string) => {
    const entry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), action, status, detail };
    setActivityHistory((previous) => {
      const next = [entry, ...previous].slice(0, 50);
      localStorage.setItem("evidence-vault-activity", JSON.stringify(next));
      return next;
    });
    if (status === "success") toast.success(action, { description: detail });
    else toast.error(action, { description: detail });
  }, []);

  const { data: folders = [], isLoading: isLoadingFolders } = useQuery<EvidenceFolderResponse[]>({
    queryKey: ["evidence-folders"],
    queryFn: () => apiGet<EvidenceFolderResponse[]>("/evidence/folders"),
  });

  // Evidence item APIs are scoped by incident ID, while folder.id identifies a
  // storage folder.  Never use the latter as an incident filter.
  // A global /evidence route must not silently open the first available case:
  // accidental cross-case review is a DFIR workflow and chain-of-custody risk.
  const activeIncidentId = incidentId ?? null;
  const activeFolder = useMemo(() => folders.find(f => f.incident_id === activeIncidentId), [folders, activeIncidentId]);

  const { data: itemList, isLoading: isLoadingItems, error: itemsError } = useQuery<EvidenceItemListResponse>({
    queryKey: ["evidence-items", activeIncidentId],
    queryFn: () => apiGet<EvidenceItemListResponse>(`/evidence/items?incident_id=${encodeURIComponent(activeIncidentId!)}`),
    enabled: !!activeIncidentId,
  });
  const items = useMemo(() => evidenceItems(itemList), [itemList]);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const q = searchTerm.toLowerCase();
    return items.filter(i => 
      i.name.toLowerCase().includes(q) || 
      i.type.toLowerCase().includes(q) ||
      i.hash.toLowerCase().includes(q)
    );
  }, [items, searchTerm]);

  const downloadEvidence = useCallback(async (item: EvidenceItemResponse) => {
    setDownloadError(null);
    setDownloadingId(item.id);
    try {
      const preparedExport = await apiPost<EvidenceExportResponse>("/evidence/exports", { evidence_id: item.id });
      const downloadUrl = new URL(preparedExport.download_url, window.location.origin);
      if (preparedExport.signature) downloadUrl.searchParams.set("signature", preparedExport.signature);
      const response = await fetch(downloadUrl, {
        credentials: "include",
      });
      if (!response.ok) {
        let detail = `Download failed (${response.status})`;
        try {
          const payload = await response.json() as { detail?: string };
          detail = payload.detail || detail;
        } catch {
          // A non-JSON error response still receives a useful status message.
        }
        throw new Error(detail);
      }

      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = item.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      recordActivity("Evidence downloaded", "success", item.name);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to download this evidence item.";
      setDownloadError(detail);
      recordActivity("Evidence download failed", "error", detail);
    } finally {
      setDownloadingId(null);
    }
  }, [recordActivity]);

  const exportCase = useCallback(async () => {
    if (!activeIncidentId) return;
    setDownloadError(null);
    setIsExportingCase(true);
    try {
      const preparedExport = await apiPost<EvidenceExportResponse>("/evidence/exports", { incident_id: activeIncidentId });
      const downloadUrl = new URL(preparedExport.download_url, window.location.origin);
      if (preparedExport.signature) downloadUrl.searchParams.set("signature", preparedExport.signature);
      const response = await fetch(downloadUrl, { credentials: "include" });
      if (!response.ok) throw new Error(`Case export failed (${response.status})`);

      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${activeIncidentId}-evidence-export.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      recordActivity("Case export downloaded", "success", activeIncidentId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to export this case.";
      setDownloadError(detail);
      recordActivity("Case export failed", "error", detail);
    } finally {
      setIsExportingCase(false);
    }
  }, [activeIncidentId, recordActivity]);

  const columns = useMemo<ColumnDef<EvidenceItemResponse>[]>(() => [
    {
      id: "name",
      header: "ARTIFACT NAME",
      cell: (item) => (
        <div className="flex items-center gap-3">
          <FileText className="w-4 h-4 text-primary/60 shrink-0" />
          <div className="flex flex-col min-w-0">
            <SafeText text={item.name} className="font-mono text-xs font-bold text-foreground" truncate={50} />
            <div className="text-[10px] text-muted-foreground uppercase tracking-tight">{item.type}</div>
          </div>
        </div>
      )
    },
    {
      id: "status",
      header: "INTEGRITY",
      width: 140,
      cell: (item) => <EvidenceIntegrityBadge status={item.status} />
    },
    {
      id: "hash",
      header: "SHA-256 HASH",
      cell: (item) => <SafeText text={item.hash} monospace className="text-[10px] opacity-60" truncate={32} showCopy />
    },
    {
      id: "size",
      header: "SIZE",
      width: 80,
      cell: (item) => <span className="font-mono text-[10px] tabular-nums">{item.size}</span>
    },
    {
      id: "actions",
      header: "",
      width: 72,
      cell: (item) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary transition-colors"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedItem(item);
            }}
            aria-label={`View ${item.name}`}
            title="View evidence details"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={downloadingId === item.id}
            className="h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary transition-colors"
            onClick={(event) => {
              event.stopPropagation();
              void downloadEvidence(item);
            }}
            aria-label={`Download ${item.name}`}
            title="Download evidence export"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>
      )
    }
  ], [downloadEvidence, downloadingId]);

  return (
    <AppLayout 
      title="EVIDENCE VAULT" 
      subtitle="CRYPTOGRAPHIC STORAGE SECTOR"
    >
      <div className="flex flex-col md:flex-row h-full min-h-[700px] overflow-hidden">
        {/* Sidebar - Case Folders */}
        <aside className="w-full max-h-36 md:max-h-none md:w-72 border-r border-border/40 bg-card/30 flex flex-col shrink-0">
          <div className="p-4 border-b border-border/40 flex items-center justify-between">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Database className="w-3.5 h-3.5" /> Case Sectors
            </h2>
            <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded-sm">{folders.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {isLoadingFolders ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-secondary/20 rounded-sm animate-pulse m-2" />
              ))
            ) : folders.length === 0 ? (
              <div className="p-8 text-center opacity-30 italic font-mono text-[10px]">No cases found</div>
            ) : (
              folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => navigate(`/evidence/${folder.incident_id}`)}
                  className={cn(
                    "w-full text-left p-3 rounded-sm border transition-all group",
                    activeIncidentId === folder.incident_id
                      ? "border-primary/50 bg-primary/5 ring-1 ring-inset ring-primary/20"
                      : "border-transparent hover:border-border hover:bg-secondary/40"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className={cn(
                        "font-mono text-xs font-bold truncate",
                        activeIncidentId === folder.incident_id ? "text-primary" : "text-foreground/80"
                      )}>
                        {folder.incident_id}
                      </div>
                      <div className="flex items-center gap-2 mt-1 font-mono text-[9px] text-muted-foreground uppercase tracking-tighter">
                        <Clock className="w-2.5 h-2.5" /> {folder.date.split(' ')[0]}
                      </div>
                    </div>
                    {activeIncidentId === folder.incident_id && (
                      <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Main View - Artifact List */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background/40">
          <header className="p-4 md:p-6 border-b border-border/40 flex flex-wrap items-center justify-between gap-4 shrink-0 bg-card/20">
            <div className="flex items-center gap-4 flex-1">
              <div className="p-2 bg-primary/10 rounded-sm border border-primary/20">
                <FolderLock className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-mono text-sm font-bold tracking-widest text-foreground uppercase truncate">
                  {activeIncidentId ? `Sector: ${activeIncidentId}` : "Select a Case Sector"}
                </h3>
                {activeFolder && (
                  <div className="flex items-center gap-3 mt-1 font-mono text-[9px] text-muted-foreground uppercase tracking-tight">
                    <span className="flex items-center gap-1"><Server className="w-3 h-3" /> Targets: 1</span>
                    <span className="opacity-40">|</span>
                    <span className="flex items-center gap-1 font-bold text-foreground/70">{itemList?.total ?? activeFolder.files_count} Objects</span>
                    <span className="opacity-40">|</span>
                    <span className="font-bold text-foreground/70">{activeFolder.total_size} Total</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="FILTER OBJECTS..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 bg-secondary/30 border border-border/40 rounded-sm font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
                />
              </div>
              <Button variant="outline" size="sm" disabled={!activeIncidentId || isExportingCase} onClick={() => void exportCase()} className="h-9 border-border/60 text-[10px] font-bold tracking-widest px-4">
                <Filter className="w-3.5 h-3.5 mr-2" /> {isExportingCase ? "PREPARING..." : "EXPORT CASE"}
              </Button>
            </div>
          </header>

          <div className="flex-1 overflow-hidden p-6 flex flex-col gap-6 relative">
            {downloadError && (
              <div role="alert" className="shrink-0 flex items-center justify-between gap-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <span>{downloadError}</span>
                <button onClick={() => setDownloadError(null)} aria-label="Dismiss download error" className="p-0.5 hover:bg-destructive/10"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            {activeFolder && !isLoadingItems && !itemsError && items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center border border-dashed border-border/50 bg-card/20 p-8 text-center">
                <Database className="mb-4 h-10 w-10 text-primary/50" />
                <h4 className="font-mono text-sm font-bold uppercase tracking-widest">No captured artifacts yet</h4>
                <p className="mt-2 max-w-md text-xs text-muted-foreground">Start a collection to populate this case. Demo mode will include verified synthetic artifacts after the next backend restart.</p>
                <Button className="mt-5" variant="tactical" size="sm" onClick={() => navigate(`/incidents/${activeIncidentId}/collect`)}>OPEN COLLECTION</Button>
              </div>
            ) : activeFolder ? (
              <DataTable
                data={filteredItems}
                columns={columns}
                loading={isLoadingItems}
                error={itemsError}
                onRowClick={(item) => setSelectedItem(item)}
                className="flex-1"
                emptyMessage={searchTerm ? "No objects matching filter" : "Sector is empty"}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full scale-150 animate-pulse" />
                  <Database className="w-16 h-16 text-muted-foreground/20 relative z-10" />
                </div>
                <h3 className="font-mono text-sm font-bold text-muted-foreground uppercase tracking-[0.4em] mb-4">
                  Standby for Case Selection
                </h3>
                <p className="text-[10px] text-muted-foreground/60 max-w-xs uppercase tracking-widest leading-relaxed">
                  Encryption keys ready. Access terminal via sidebar to begin artifact verification.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-md">
                   <div className="p-4 border border-dashed border-border/40 rounded-sm text-left group hover:border-primary/40 transition-colors">
                      <Terminal className="w-4 h-4 text-muted-foreground group-hover:text-primary mb-3" />
                      <div className="font-mono text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase mb-1">Verify Chain</div>
                      <div className="text-[9px] text-muted-foreground/40 uppercase leading-tight">Validate cryptographic evidence hashes</div>
                   </div>
                   <div className="p-4 border border-dashed border-border/40 rounded-sm text-left group hover:border-primary/40 transition-colors">
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary mb-3" />
                      <div className="font-mono text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase mb-1">Incident Hub</div>
                      <div className="text-[9px] text-muted-foreground/40 uppercase leading-tight">Return to the command center</div>
                   </div>
                </div>
              </div>
            )}
            {selectedItem && (
              <aside ref={detailPanelRef} role="dialog" aria-modal="true" aria-label="Evidence details" className="fixed inset-0 z-50 w-full overflow-auto border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200 sm:absolute sm:inset-y-6 sm:right-6 sm:left-auto sm:w-full sm:max-w-md sm:border">
                <div className="sticky top-0 flex items-center justify-between border-b border-border bg-secondary/30 p-4">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Evidence details</div>
                    <SafeText text={selectedItem.name} className="mt-1 block truncate font-mono text-xs font-bold" />
                  </div>
                  <Button autoFocus variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedItem(null)} aria-label="Close evidence details"><X className="w-4 h-4" /></Button>
                </div>
                <div className="space-y-5 p-4 font-mono text-xs">
                  <EvidenceIntegrityBadge status={selectedItem.status} />
                  <dl className="space-y-3">
                    <div><dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Type</dt><dd className="mt-1">{selectedItem.type}</dd></div>
                    <div><dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Size</dt><dd className="mt-1">{selectedItem.size}</dd></div>
                    <div><dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Collected at</dt><dd className="mt-1">{selectedItem.collected_at}</dd></div>
                    <div><dt className="text-[10px] uppercase tracking-widest text-muted-foreground">SHA-256</dt><dd className="mt-1 break-all text-[10px]"><SafeText text={selectedItem.hash} monospace showCopy /></dd></div>
                  </dl>
                  <Button variant="tactical" size="sm" className="w-full" disabled={downloadingId === selectedItem.id} onClick={() => void downloadEvidence(selectedItem)}>
                    <Download className="mr-2 h-3.5 w-3.5" /> {downloadingId === selectedItem.id ? "PREPARING DOWNLOAD..." : "DOWNLOAD EVIDENCE"}
                  </Button>
                </div>
              </aside>
            )}
            <details className="shrink-0 border border-border/40 bg-card/20 p-3">
              <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Transfer activity ({activityHistory.length})</summary>
              <input value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} placeholder="Filter activity" className="mt-3 h-8 w-full border border-border/50 bg-background px-2 font-mono text-xs" />
              <div className="mt-2 max-h-32 space-y-1 overflow-auto font-mono text-[10px]">
                {activityHistory.filter((entry) => `${entry.action} ${entry.detail}`.toLowerCase().includes(activityQuery.toLowerCase())).map((entry) => <div key={entry.id} className={cn("flex justify-between gap-3 p-1", entry.status === "error" ? "text-destructive" : "text-muted-foreground")}><span>{entry.action}: {entry.detail}</span><time>{new Date(entry.timestamp).toLocaleTimeString()}</time></div>)}
              </div>
            </details>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
