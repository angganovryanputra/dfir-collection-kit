import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TacticalPanel } from "@/components/TacticalPanel";
import { TablePagination } from "@/components/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import {
  Search,
  Lock,
  FileText,
  Download,
} from "lucide-react";
import type { ChainOfCustodyEntry } from "@/types/dfir";

const mockCustodyLog: (ChainOfCustodyEntry & { incidentId: string })[] = [
  {
    incidentId: "INC-2025-0142",
    timestamp: "2025-01-09T10:45:23Z",
    action: "EVIDENCE EXPORTED",
    actor: "J.SMITH",
    target: "INC-2025-0142_full_package.zip",
  },
  {
    incidentId: "INC-2025-0142",
    timestamp: "2025-01-09T09:30:12Z",
    action: "HASH VERIFICATION COMPLETE",
    actor: "SYSTEM",
    target: "All artifacts (47 files)",
  },
  {
    incidentId: "INC-2025-0142",
    timestamp: "2025-01-09T09:25:45Z",
    action: "COLLECTION COMPLETE",
    actor: "COLLECTOR-BRAVO",
    target: "WS-FINANCE-01",
  },
  {
    incidentId: "INC-2025-0142",
    timestamp: "2025-01-09T09:10:00Z",
    action: "COLLECTION STARTED",
    actor: "J.SMITH",
    target: "WS-FINANCE-01",
  },
  {
    incidentId: "INC-2025-0142",
    timestamp: "2025-01-09T08:55:30Z",
    action: "INCIDENT CREATED",
    actor: "J.SMITH",
    target: "INC-2025-0142",
  },
  {
    incidentId: "INC-2025-0141",
    timestamp: "2025-01-08T16:45:00Z",
    action: "EVIDENCE LOCKED",
    actor: "SYSTEM",
    target: "All artifacts (32 files)",
  },
  {
    incidentId: "INC-2025-0141",
    timestamp: "2025-01-08T16:30:22Z",
    action: "COLLECTION COMPLETE",
    actor: "COLLECTOR-ALPHA",
    target: "DC-PRIMARY",
  },
  {
    incidentId: "INC-2025-0141",
    timestamp: "2025-01-08T15:00:00Z",
    action: "COLLECTION STARTED",
    actor: "M.CHEN",
    target: "DC-PRIMARY",
  },
  {
    incidentId: "INC-2025-0141",
    timestamp: "2025-01-08T14:20:00Z",
    action: "INCIDENT CREATED",
    actor: "M.CHEN",
    target: "INC-2025-0141",
  },
  {
    incidentId: "INC-2025-0140",
    timestamp: "2025-01-09T10:05:00Z",
    action: "COLLECTION STARTED",
    actor: "K.JOHNSON",
    target: "SRV-DB-01",
  },
  {
    incidentId: "INC-2025-0140",
    timestamp: "2025-01-09T10:00:00Z",
    action: "INCIDENT CREATED",
    actor: "K.JOHNSON",
    target: "INC-2025-0140",
  },
  {
    incidentId: "INC-2025-0139",
    timestamp: "2025-01-07T15:00:00Z",
    action: "EVIDENCE LOCKED",
    actor: "SYSTEM",
    target: "All artifacts (28 files)",
  },
  {
    incidentId: "INC-2025-0139",
    timestamp: "2025-01-07T14:30:00Z",
    action: "COLLECTION COMPLETE",
    actor: "COLLECTOR-ALPHA",
    target: "WS-HR-01",
  },
  {
    incidentId: "INC-2025-0139",
    timestamp: "2025-01-07T12:00:00Z",
    action: "COLLECTION STARTED",
    actor: "J.SMITH",
    target: "WS-HR-01",
  },
  {
    incidentId: "INC-2025-0139",
    timestamp: "2025-01-07T09:00:00Z",
    action: "INCIDENT CREATED",
    actor: "J.SMITH",
    target: "INC-2025-0139",
  },
];

export default function ChainOfCustody() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);

  const incidents = [...new Set(mockCustodyLog.map((l) => l.incidentId))];

  const filteredLog = mockCustodyLog.filter((entry) => {
    const matchesSearch =
      entry.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.target.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesIncident = selectedIncident
      ? entry.incidentId === selectedIncident
      : true;
    return matchesSearch && matchesIncident;
  });

  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    goToPage,
    setPerPage,
  } = usePagination(filteredLog);

  const getActionColor = (action: string) => {
    if (action.includes("CREATED")) return "text-primary";
    if (action.includes("STARTED")) return "text-warning";
    if (action.includes("COMPLETE")) return "text-primary";
    if (action.includes("VERIFIED") || action.includes("LOCKED"))
      return "text-status-verified";
    if (action.includes("EXPORTED")) return "text-foreground";
    return "text-muted-foreground";
  };

  return (
    <AppLayout
      title="CHAIN OF CUSTODY"
      subtitle="IMMUTABLE AUDIT LOG"
      headerActions={
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="w-4 h-4" />
          <span className="font-mono text-xs">READ-ONLY</span>
        </div>
      }
    >
      <div className="p-6 h-full flex flex-col">
        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actions, actors, targets..."
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIncident(null)}
              className={`px-3 py-2 border font-mono text-xs uppercase tracking-wider transition-all ${
                selectedIncident === null
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              ALL
            </button>
            {incidents.slice(0, 3).map((inc) => (
              <button
                key={inc}
                onClick={() => setSelectedIncident(inc)}
                className={`px-3 py-2 border font-mono text-xs uppercase tracking-wider transition-all ${
                  selectedIncident === inc
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                {inc}
              </button>
            ))}
          </div>
          <Button variant="secondary">
            <Download className="w-4 h-4 mr-2" />
            EXPORT
          </Button>
        </div>

        {/* Log Table */}
        <TacticalPanel
          title="CUSTODY LOG"
          status="locked"
          className="flex-1 overflow-hidden flex flex-col"
          headerActions={
            <span className="font-mono text-xs text-muted-foreground">
              {filteredLog.length} ENTRIES
            </span>
          }
        >
          <div className="flex-1 overflow-auto">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 font-mono text-xs text-muted-foreground uppercase tracking-wider border-b border-border sticky top-0 bg-card">
              <div className="col-span-3">Timestamp</div>
              <div className="col-span-3">Action</div>
              <div className="col-span-2">Actor</div>
              <div className="col-span-4">Target</div>
            </div>

            {/* Rows */}
            {paginatedItems.map((entry, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors"
              >
                <div className="col-span-3 font-mono text-sm text-muted-foreground">
                  <div>{new Date(entry.timestamp).toLocaleDateString()}</div>
                  <div className="text-xs">
                    {new Date(entry.timestamp).toLocaleTimeString("en-US", {
                      hour12: false,
                    })}
                  </div>
                </div>
                <div className="col-span-3">
                  <span
                    className={`font-mono text-sm font-bold ${getActionColor(
                      entry.action
                    )}`}
                  >
                    {entry.action}
                  </span>
                </div>
                <div className="col-span-2 font-mono text-sm">
                  {entry.actor}
                </div>
                <div className="col-span-4 font-mono text-sm text-muted-foreground flex items-center gap-2">
                  <FileText className="w-3 h-3 shrink-0" />
                  <span className="truncate">{entry.target}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={goToPage}
            onItemsPerPageChange={setPerPage}
          />
        </TacticalPanel>

        {/* Integrity Notice */}
        <div className="border border-primary/30 bg-primary/5 p-4 mt-6">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-primary shrink-0" />
            <div className="font-mono text-xs text-muted-foreground">
              <span className="text-primary font-bold">INTEGRITY NOTICE:</span>{" "}
              This log is cryptographically signed and append-only. All entries
              are timestamped with UTC and cannot be modified or deleted.
              Suitable for legal proceedings and regulatory compliance.
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
