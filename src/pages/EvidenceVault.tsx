import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TacticalPanel } from "@/components/TacticalPanel";
import { StatusIndicator } from "@/components/StatusIndicator";
import {
  Folder,
  FileText,
  Download,
  Lock,
  CheckCircle2,
  Search,
  ChevronRight,
  HardDrive,
} from "lucide-react";
import type { Evidence } from "@/types/dfir";

interface EvidenceFolder {
  id: string;
  incidentId: string;
  type: string;
  date: string;
  filesCount: number;
  totalSize: string;
  status: "LOCKED" | "HASH_VERIFIED";
}

const mockFolders: EvidenceFolder[] = [
  {
    id: "1",
    incidentId: "INC-2025-0142",
    type: "RANSOMWARE",
    date: "2025-01-09",
    filesCount: 47,
    totalSize: "2.4 GB",
    status: "HASH_VERIFIED",
  },
  {
    id: "2",
    incidentId: "INC-2025-0141",
    type: "ACCOUNT_COMPROMISE",
    date: "2025-01-08",
    filesCount: 32,
    totalSize: "1.8 GB",
    status: "LOCKED",
  },
  {
    id: "3",
    incidentId: "INC-2025-0139",
    type: "MALWARE",
    date: "2025-01-07",
    filesCount: 89,
    totalSize: "5.2 GB",
    status: "HASH_VERIFIED",
  },
];

const mockEvidence: Evidence[] = [
  {
    id: "1",
    incidentId: "INC-2025-0142",
    name: "memory_dump.raw",
    type: "Memory Dump",
    size: "1.2 GB",
    status: "HASH_VERIFIED",
    hash: "a3f2b8c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
    collectedAt: "2025-01-09T09:15:00Z",
  },
  {
    id: "2",
    incidentId: "INC-2025-0142",
    name: "process_list.json",
    type: "Process Data",
    size: "245 KB",
    status: "HASH_VERIFIED",
    hash: "b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3",
    collectedAt: "2025-01-09T09:12:00Z",
  },
  {
    id: "3",
    incidentId: "INC-2025-0142",
    name: "network_connections.json",
    type: "Network Data",
    size: "128 KB",
    status: "HASH_VERIFIED",
    hash: "c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4",
    collectedAt: "2025-01-09T09:13:00Z",
  },
  {
    id: "4",
    incidentId: "INC-2025-0142",
    name: "registry_autoruns.reg",
    type: "Registry",
    size: "89 KB",
    status: "LOCKED",
    hash: "d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5",
    collectedAt: "2025-01-09T09:18:00Z",
  },
  {
    id: "5",
    incidentId: "INC-2025-0142",
    name: "security_events.evtx",
    type: "Event Log",
    size: "856 MB",
    status: "HASH_VERIFIED",
    hash: "e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6",
    collectedAt: "2025-01-09T09:22:00Z",
  },
];

export default function EvidenceVault() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedFolderData = mockFolders.find((f) => f.id === selectedFolder);
  const evidenceList = selectedFolder
    ? mockEvidence.filter((e) => e.incidentId === selectedFolderData?.incidentId)
    : [];

  const filteredEvidence = evidenceList.filter((e) =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout
      title="EVIDENCE VAULT"
      subtitle="SECURE FORENSIC STORAGE"
      headerActions={
        <div className="flex items-center gap-2 font-mono text-xs">
          <HardDrive className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">CAPACITY:</span>
          <span className="text-warning">78%</span>
        </div>
      }
    >
      <div className="p-6 h-full">
        <div className="grid grid-cols-12 gap-6 h-full">
          {/* Left - Folder Structure */}
          <div className="col-span-4">
            <TacticalPanel title="CASE FOLDERS" status="online" className="h-full">
              <div className="space-y-2">
                {mockFolders.map((folder) => (
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
                ))}
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
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search evidence files..."
                      className="pl-10"
                    />
                  </div>
                  <Button variant="tactical">
                    <Download className="w-4 h-4 mr-2" />
                    EXPORT ALL
                  </Button>
                </div>

                {/* Evidence Table */}
                <TacticalPanel title="EVIDENCE FILES" className="flex-1">
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-2 font-mono text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                      <div className="col-span-4">Filename</div>
                      <div className="col-span-2">Type</div>
                      <div className="col-span-2">Size</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-2">Actions</div>
                    </div>

                    {/* Rows */}
                    {filteredEvidence.map((evidence) => (
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
                          <Button variant="ghost" size="sm">
                            <Download className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
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
