import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { TablePagination } from "@/components/TablePagination";
import { SearchInput } from "@/components/common/SearchInput";
import { SelectableButton } from "@/components/common/SelectableButton";
import { TableHeaderRow } from "@/components/common/TableHeaderRow";
import { usePagination } from "@/hooks/usePagination";
import {
  Lock,
  FileText,
  Download,
} from "lucide-react";
import type { ChainOfCustodyEntry } from "@/types/dfir";
import { apiGet } from "@/lib/api";


export default function ChainOfCustody() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [custodyLog, setCustodyLog] = useState<(ChainOfCustodyEntry & { incidentId: string })[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const hasIntegrityError = errorMessage?.toLowerCase().includes("integrity");

  const custodyQuery = useQuery({
    queryKey: ["chain-of-custody"],
    queryFn: () =>
      apiGet<{
        id: string;
        incident_id: string;
        timestamp: string;
        action: string;
        actor: string;
        target: string;
      }[]>("/chain-of-custody"),
  });

  useEffect(() => {
    if (custodyQuery.data) {
      setCustodyLog(
        custodyQuery.data.map((entry) => ({
          id: entry.id,
          incident_id: entry.incident_id,
          incidentId: entry.incident_id,
          timestamp: entry.timestamp,
          action: entry.action,
          actor: entry.actor,
          target: entry.target,
        }))
      );
      setErrorMessage(null);
    }
  }, [custodyQuery.data]);

  useEffect(() => {
    if (custodyQuery.error) {
      const error = custodyQuery.error;
      const message = error instanceof Error ? error.message : "Unable to load custody log.";
      setErrorMessage(message.includes("integrity") ? message : "Unable to load custody log.");
    }
  }, [custodyQuery.error]);

  const handleExport = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
      const base = (baseUrl?.trim() || "http://localhost:8000/api/v1").replace(/\/$/, "");
      const params = selectedIncident ? `?incident_id=${encodeURIComponent(selectedIncident)}` : "";
      const url = `${base}/chain-of-custody/export${params}`;
      const raw = localStorage.getItem("dfir_auth");
      const token = raw ? (JSON.parse(raw) as { token?: string }).token : null;
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed: ${response.status}`);
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = selectedIncident
        ? `chain_of_custody_${selectedIncident}.csv`
        : "chain_of_custody.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to export custody log.";
      setErrorMessage(message.includes("integrity") ? message : "Unable to export custody log.");
    } finally {
      setIsExporting(false);
    }
  };

  const incidents = [...new Set(custodyLog.map((l) => l.incidentId))];

  const filteredLog = custodyLog.filter((entry) => {
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
        {errorMessage && (
          <div className="mb-4 border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
            {errorMessage}
          </div>
        )}
        {hasIntegrityError && (
          <div className="mb-4 font-mono text-xs text-muted-foreground">
            Integrity verification failed. Review custody hashes before continuing.
          </div>
        )}
        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search actions, actors, targets..."
          />
          <div className="flex items-center gap-2">
            <SelectableButton
              isActive={selectedIncident === null}
              onClick={() => setSelectedIncident(null)}
              className="px-3 py-2"
            >
              ALL
            </SelectableButton>
            {incidents.slice(0, 3).map((inc) => (
              <SelectableButton
                key={inc}
                isActive={selectedIncident === inc}
                onClick={() => setSelectedIncident(inc)}
                className="px-3 py-2"
              >
                {inc}
              </SelectableButton>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleExport} disabled={isExporting}>
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? "EXPORTING" : "EXPORT"}
            </Button>
            <span className="font-mono text-xs text-muted-foreground">
              Signature required for downloads.
            </span>
          </div>
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
            <TableHeaderRow className="grid grid-cols-12 gap-4 sticky top-0 bg-card">
              <div className="col-span-3">Timestamp</div>
              <div className="col-span-3">Action</div>
              <div className="col-span-2">Actor</div>
              <div className="col-span-4">Target</div>
            </TableHeaderRow>

            {/* Rows */}
            {paginatedItems.length === 0 ? (
              <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                No chain-of-custody entries available.
              </div>
            ) : (
              paginatedItems.map((entry, index) => (
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
              ))
            )}
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
