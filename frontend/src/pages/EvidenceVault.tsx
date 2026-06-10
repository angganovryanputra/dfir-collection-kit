import React, { useEffect, useState, useMemo, memo, useCallback } from "react";
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
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SafeText } from "@/components/common/SafeText";
import { EvidenceIntegrityBadge } from "@/components/common/EvidenceIntegrityBadge";
import { DataTable, ColumnDef } from "@/components/common/DataTable";

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

  const { data: folders = [], isLoading: isLoadingFolders } = useQuery<EvidenceFolderResponse[]>({
    queryKey: ["evidence-folders"],
    queryFn: () => apiGet<EvidenceFolderResponse[]>("/evidence/folders"),
  });

  const activeFolderId = incidentId || (folders.length > 0 ? folders[0].id : null);
  const activeFolder = useMemo(() => folders.find(f => f.incident_id === activeFolderId), [folders, activeFolderId]);

  const { data: items = [], isLoading: isLoadingItems } = useQuery<EvidenceItemResponse[]>({
    queryKey: ["evidence-items", activeFolderId],
    queryFn: () => apiGet<EvidenceItemResponse[]>(`/evidence/items?incident_id=${encodeURIComponent(activeFolderId!)}`),
    enabled: !!activeFolderId,
  });

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const q = searchTerm.toLowerCase();
    return items.filter(i => 
      i.name.toLowerCase().includes(q) || 
      i.type.toLowerCase().includes(q) ||
      i.hash.toLowerCase().includes(q)
    );
  }, [items, searchTerm]);

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
      width: 40,
      cell: (item) => (
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-primary/20 hover:text-primary transition-colors">
          <Download className="w-4 h-4" />
        </Button>
      )
    }
  ], []);

  return (
    <AppLayout 
      title="EVIDENCE VAULT" 
      subtitle="CRYPTOGRAPHIC STORAGE SECTOR"
    >
      <div className="flex h-full overflow-hidden">
        {/* Sidebar - Case Folders */}
        <aside className="w-72 border-r border-border/40 bg-card/30 flex flex-col shrink-0">
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
                    activeFolderId === folder.incident_id
                      ? "border-primary/50 bg-primary/5 ring-1 ring-inset ring-primary/20"
                      : "border-transparent hover:border-border hover:bg-secondary/40"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className={cn(
                        "font-mono text-xs font-bold truncate",
                        activeFolderId === folder.incident_id ? "text-primary" : "text-foreground/80"
                      )}>
                        {folder.incident_id}
                      </div>
                      <div className="flex items-center gap-2 mt-1 font-mono text-[9px] text-muted-foreground uppercase tracking-tighter">
                        <Clock className="w-2.5 h-2.5" /> {folder.date.split(' ')[0]}
                      </div>
                    </div>
                    {activeFolderId === folder.incident_id && (
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
          <header className="p-6 border-b border-border/40 flex items-center justify-between gap-6 shrink-0 bg-card/20">
            <div className="flex items-center gap-4 flex-1">
              <div className="p-2 bg-primary/10 rounded-sm border border-primary/20">
                <FolderLock className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-mono text-sm font-bold tracking-widest text-foreground uppercase truncate">
                  {activeFolderId ? `Sector: ${activeFolderId}` : "Select a Case Sector"}
                </h3>
                {activeFolder && (
                  <div className="flex items-center gap-3 mt-1 font-mono text-[9px] text-muted-foreground uppercase tracking-tight">
                    <span className="flex items-center gap-1"><Server className="w-3 h-3" /> Targets: 1</span>
                    <span className="opacity-40">|</span>
                    <span className="flex items-center gap-1 font-bold text-foreground/70">{activeFolder.files_count} Objects</span>
                    <span className="opacity-40">|</span>
                    <span className="font-bold text-foreground/70">{activeFolder.total_size} Total</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
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
              <Button variant="outline" size="sm" className="h-9 border-border/60 text-[10px] font-bold tracking-widest px-4">
                <Filter className="w-3.5 h-3.5 mr-2" /> EXPORT MANIFEST
              </Button>
            </div>
          </header>

          <div className="flex-1 overflow-hidden p-6 flex flex-col gap-6">
            {activeFolder ? (
              <DataTable
                data={filteredItems}
                columns={columns}
                loading={isLoadingItems}
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
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
