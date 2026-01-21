import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
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
} from "lucide-react";
import type { Evidence } from "@/types/dfir";
import { apiGet, apiPost } from "@/lib/api";

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


export default function EvidenceVault() {
  const { id: incidentId } = useParams<{ id: string }>();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [folders, setFolders] = useState<EvidenceFolder[]>([]);
  const [evidenceItems, setEvidenceItems] = useState<Evidence[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!incidentId) return;
    const match = folders.find((folder) => folder.incidentId === incidentId);
    if (match) {
      setSelectedFolder(match.id);
    }
  }, [incidentId, folders]);

  const foldersQuery = useQuery<EvidenceFolderResponse[]>({
    queryKey: ["evidence-folders"],
    queryFn: () => apiGet<EvidenceFolderResponse[]>("/evidence/folders"),
  });

  const diagnosticsQuery = useQuery<DiagnosticsResponse>({
    queryKey: ["diagnostics"],
    queryFn: () => apiGet<DiagnosticsResponse>("/status/diagnostics"),
  });

  useEffect(() => {
    if (foldersQuery.data) {
      setFolders(foldersQuery.data.map(mapFolder));
      setErrorMessage(null);
    }
  }, [foldersQuery.data]);

  const selectedFolderData = folders.find((f) => f.id === selectedFolder);

  const itemsQuery = useQuery<EvidenceItemResponse[]>({
    queryKey: ["evidence-items", selectedFolderData?.incidentId],
    queryFn: () =>
      apiGet<EvidenceItemResponse[]>(
        `/evidence/items?incident_id=${selectedFolderData?.incidentId}`
      ),
    enabled: Boolean(selectedFolderData),
  });

  useEffect(() => {
    if (foldersQuery.error || itemsQuery.error) {
      setErrorMessage("Unable to load evidence data.");
    }
  }, [foldersQuery.error, itemsQuery.error]);

  useEffect(() => {
    if (itemsQuery.data) {
      setEvidenceItems(itemsQuery.data.map(mapEvidence));
      setErrorMessage(null);
    }
  }, [itemsQuery.data]);

  const evidenceList = selectedFolder ? evidenceItems : [];

  const filteredEvidence = evidenceList.filter((e) =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const capacityPercent = diagnosticsQuery.data?.storage_used_percent ?? null;
  const formattedCapacity = capacityPercent !== null
    ? `${Math.round(capacityPercent)}%`
    : "--";

  const handleExportAll = async () => {
    if (!selectedFolderData) return;
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const response = await apiPost<{ download_url: string; signature?: string | null }>(
        "/evidence/exports",
        {
        incident_id: selectedFolderData.incidentId,
      }
      );
      const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
      const url = baseUrl ? `${baseUrl.replace(/\/$/, "")}${response.download_url}` : response.download_url;
      const signature = response.signature ? `?signature=${response.signature}` : "";
      const target = `${url}${signature}`;
      window.location.assign(target);
    } catch {
      setErrorMessage("Unable to export evidence package.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportItem = async (evidenceId: string) => {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const response = await apiPost<{ download_url: string; signature?: string | null }>(
        "/evidence/exports",
        {
        evidence_id: evidenceId,
      }
      );
      const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
      const url = baseUrl ? `${baseUrl.replace(/\/$/, "")}${response.download_url}` : response.download_url;
      const signature = response.signature ? `?signature=${response.signature}` : "";
      const target = `${url}${signature}`;
      window.location.assign(target);
    } catch {
      setErrorMessage("Unable to export evidence file.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AppLayout
      title="EVIDENCE VAULT"
      subtitle="SECURE FORENSIC STORAGE"
      headerActions={
        <div className="flex items-center gap-2 font-mono text-xs">
          <HardDrive className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">CAPACITY:</span>
          <span className={capacityPercent !== null && capacityPercent >= 75 ? "text-warning" : "text-muted-foreground"}>
            {formattedCapacity}
          </span>
        </div>
      }
    >
      <div className="p-6 h-full">
        {errorMessage && (
          <div className="mb-4 border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
            {errorMessage}
          </div>
        )}
        <div className="grid grid-cols-12 gap-6 h-full">
          {/* Left - Folder Structure */}
          <div className="col-span-4">
            <TacticalPanel title="CASE FOLDERS" status="online" className="h-full">
              <div className="space-y-2">
                {folders.length === 0 ? (
                  <div className="p-4 text-center font-mono text-xs text-muted-foreground">
                    No evidence folders available.
                  </div>
                ) : (
                  folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => setSelectedFolder(folder.id)}
                      className={`w-full text-left p-4 border transition-all ${
                        selectedFolder === folder.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-secondary/50 hover:border-muted-foreground"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Folder
                          className={`w-5 h-5 mt-0.5 ${
                            selectedFolder === folder.id
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold truncate">
                              {folder.incidentId}
                            </span>
                            {folder.status === "HASH_VERIFIED" && (
                              <CheckCircle2 className="w-3 h-3 text-status-verified shrink-0" />
                            )}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground mt-1">
                            {folder.type.replace("_", " ")}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {folder.filesCount} files • {folder.totalSize}
                          </div>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 shrink-0 ${
                            selectedFolder === folder.id
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                        />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </TacticalPanel>
          </div>

          {/* Right - Evidence List */}
          <div className="col-span-8 flex flex-col gap-6">
            {selectedFolder ? (
              <>
                {/* Case Info */}
                <TacticalPanel
                  title={`CASE: ${selectedFolderData?.incidentId}`}
                  status={selectedFolderData?.status === "HASH_VERIFIED" ? "verified" : "locked"}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6 font-mono text-sm">
                      <div>
                        <span className="text-muted-foreground">TYPE: </span>
                        <span className="text-foreground">
                          {selectedFolderData?.type.replace("_", " ")}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">DATE: </span>
                        <span className="text-foreground">{selectedFolderData?.date}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">SIZE: </span>
                        <span className="text-foreground">{selectedFolderData?.totalSize}</span>
                      </div>
                    </div>
                    <StatusIndicator
                      status={selectedFolderData?.status === "HASH_VERIFIED" ? "verified" : "locked"}
                    />
                  </div>
                </TacticalPanel>

                {/* Search & Actions */}
                <div className="flex items-center gap-4">
                  <SearchInput
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search evidence files..."
                  />
                  <Button variant="tactical" onClick={handleExportAll} disabled={isExporting}>
                    <Download className="w-4 h-4 mr-2" />
                    {isExporting ? "EXPORTING" : "EXPORT ALL"}
                  </Button>
                </div>

                {/* Evidence Table */}
                <TacticalPanel title="EVIDENCE FILES" className="flex-1">
                  <div className="space-y-2">
                    {/* Header */}
                    <TableHeaderRow className="grid grid-cols-12 gap-4 py-2">
                      <div className="col-span-4">Filename</div>
                      <div className="col-span-2">Type</div>
                      <div className="col-span-2">Size</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-2">Actions</div>
                    </TableHeaderRow>

                    {/* Rows */}
                    {filteredEvidence.length === 0 ? (
                      <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                        No evidence items available.
                      </div>
                    ) : (
                      filteredEvidence.map((evidence) => (
                        <div
                          key={evidence.id}
                          className="grid grid-cols-12 gap-4 px-4 py-3 bg-secondary/30 hover:bg-secondary/50 transition-colors border border-transparent hover:border-border"
                        >
                          <div className="col-span-4 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="font-mono text-sm truncate">
                              {evidence.name}
                            </span>
                          </div>
                          <div className="col-span-2 font-mono text-sm text-muted-foreground">
                            {evidence.type}
                          </div>
                          <div className="col-span-2 font-mono text-sm text-muted-foreground">
                            {evidence.size}
                          </div>
                          <div className="col-span-2">
                            <div className="flex items-center gap-1.5">
                              {evidence.status === "HASH_VERIFIED" ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-status-verified" />
                                  <span className="font-mono text-xs text-status-verified">
                                    VERIFIED
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3 text-status-locked" />
                                  <span className="font-mono text-xs text-status-locked">
                                    LOCKED
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleExportItem(evidence.id)}
                              disabled={isExporting}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TacticalPanel>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Folder className="w-16 h-16 text-muted-foreground mx-auto" />
                  <div className="font-mono text-muted-foreground">
                    SELECT A CASE FOLDER TO VIEW EVIDENCE
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
