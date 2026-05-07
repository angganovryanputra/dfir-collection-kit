import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ShieldAlert, Globe, Hash, Wifi, HelpCircle, AlertTriangle, Upload, Loader2, CheckCircle2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { getStoredAuth } from "@/lib/auth";

interface IOCMatch {
    id: string;
    incident_id: string;
    ioc_type: string;
    ioc_value: string;
    matched_field: string;
    matched_value: string;
    event_source: string | null;
    event_timestamp: string | null;
    severity: string;
    detected_at: string;
}

interface IOCMatchList {
    total: number;
    items: IOCMatch[];
}

interface BulkImportResult {
    imported: number;
    skipped: number;
    errors: string[];
}

const IOC_TYPES = ["all", "ip", "domain", "sha256", "md5", "sha1"];

const TYPE_ICONS: Record<string, React.ReactNode> = {
    ip: <Wifi className="w-3 h-3" />,
    domain: <Globe className="w-3 h-3" />,
    sha256: <Hash className="w-3 h-3" />,
    md5: <Hash className="w-3 h-3" />,
    sha1: <Hash className="w-3 h-3" />,
};

const SEVERITY_COLOR: Record<string, string> = {
    critical: "text-red-400 border-red-400/30 bg-red-400/10",
    high: "text-orange-400 border-orange-400/30 bg-orange-400/10",
    medium: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    low: "text-blue-400 border-blue-400/30 bg-blue-400/10",
};

export default function IOCMatches() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const [activeType, setActiveType] = useState("all");
    const [page, setPage] = useState(1);
    const LIMIT = 100;

    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleBulkImport = async () => {
        if (!importFile) return;
        setIsImporting(true);
        setImportResult(null);
        setImportError(null);
        try {
            const auth = getStoredAuth();
            const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "/api/v1";
            const formData = new FormData();
            formData.append("file", importFile);
            const resp = await fetch(`${baseUrl}/processing/ioc/indicators/bulk`, {
                method: "POST",
                headers: { Authorization: `Bearer ${auth?.token ?? ""}` },
                body: formData,
            });
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(text || `HTTP ${resp.status}`);
            }
            const result = (await resp.json()) as BulkImportResult;
            setImportResult(result);
            setImportFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            await queryClient.invalidateQueries({ queryKey: ["ioc-matches", incidentId] });
        } catch (err) {
            setImportError(err instanceof Error ? err.message : "Import failed");
        } finally {
            setIsImporting(false);
        }
    };

    const { data, isLoading, error } = useQuery<IOCMatchList>({
        queryKey: ["ioc-matches", incidentId, activeType, page],
        queryFn: () =>
            apiGet<IOCMatchList>(
                `/processing/incident/${incidentId}/ioc-matches?` +
                new URLSearchParams({
                    ...(activeType !== "all" ? { ioc_type: activeType } : {}),
                    limit: String(LIMIT),
                    offset: String((page - 1) * LIMIT),
                })
            ),
        retry: false,
    });

    const matches = data?.items ?? [];
    const total = data?.total ?? 0;

    return (
        <AppLayout
            title="IOC MATCHES"
            subtitle={`INCIDENT: ${incidentId}`}
            headerActions={
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setImportResult(null);
                            setImportError(null);
                            setIsImportOpen(true);
                        }}
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        IMPORT IOCs
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => navigate(`/incidents/${incidentId}/processing`)}
                        size="sm"
                    >
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        BACK TO PIPELINE
                    </Button>
                </div>
            }
        >
            <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto w-full">
                {/* Error state */}
                {error && (
                    <div className="flex items-center gap-3 px-4 py-3 border border-destructive/40 bg-destructive/10 text-destructive font-mono text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Failed to load IOC matches: {error instanceof Error ? error.message : "Unknown error"}</span>
                    </div>
                )}

                {/* Summary */}
                <TacticalPanel title="IOC SCAN RESULTS" status={total > 0 ? "offline" : "online"}>
                    <div className="flex items-center gap-6 font-mono text-sm pt-1">
                        <div>
                            <span className="text-3xl font-bold text-primary">{total}</span>
                            <span className="text-muted-foreground ml-2 text-sm">MATCHES</span>
                        </div>
                        {total > 0 && (
                            <div className="flex items-center gap-2 text-xs text-destructive">
                                <ShieldAlert className="w-4 h-4" />
                                KNOWN BAD INDICATORS FOUND IN TIMELINE
                            </div>
                        )}
                        {total === 0 && !isLoading && !error && (
                            <div className="text-xs text-muted-foreground">
                                No IOC matches found — timeline is clean or no indicators configured.
                            </div>
                        )}
                    </div>
                </TacticalPanel>

                {/* Type filter */}
                <div className="flex flex-wrap gap-2 font-mono text-xs">
                    {IOC_TYPES.map((t) => (
                        <button
                            key={t}
                            onClick={() => { setActiveType(t); setPage(1); }}
                            className={`flex items-center gap-1 px-3 py-1.5 border rounded-sm uppercase transition-colors ${
                                activeType === t
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                        >
                            {t !== "all" && TYPE_ICONS[t]}
                            {t}
                        </button>
                    ))}
                </div>

                {/* Table */}
                <TacticalPanel title={`MATCHES (${total})`}>
                    {isLoading ? (
                        <div className="font-mono text-sm text-muted-foreground py-8">
                            SCANNING TIMELINE FOR IOC MATCHES...
                        </div>
                    ) : error ? (
                        <div className="font-mono text-sm text-muted-foreground py-6">
                            No IOC data available. Run the forensics pipeline first.
                        </div>
                    ) : matches.length === 0 ? (
                        <div className="font-mono text-sm text-muted-foreground py-6">
                            No matches for selected filter.
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full font-mono text-xs">
                                    <thead>
                                        <tr className="text-left text-muted-foreground border-b border-border">
                                            <th className="pb-2 pr-4 font-normal uppercase">TYPE</th>
                                            <th className="pb-2 pr-4 font-normal uppercase">IOC VALUE</th>
                                            <th className="pb-2 pr-4 font-normal uppercase">MATCHED FIELD</th>
                                            <th className="pb-2 pr-4 font-normal uppercase">SOURCE</th>
                                            <th className="pb-2 pr-4 font-normal uppercase">TIMESTAMP</th>
                                            <th className="pb-2 font-normal uppercase">SEVERITY</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {matches.map((m) => {
                                            const sevClass =
                                                SEVERITY_COLOR[m.severity] ??
                                                "text-muted-foreground border-border bg-secondary";
                                            return (
                                                <tr
                                                    key={m.id}
                                                    className="border-b border-border/40 hover:bg-secondary/30 transition-colors"
                                                >
                                                    <td className="py-2 pr-4">
                                                        <span className="flex items-center gap-1 text-primary uppercase">
                                                            {TYPE_ICONS[m.ioc_type] ?? <HelpCircle className="w-3 h-3" />}
                                                            {m.ioc_type}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 pr-4 font-bold text-foreground max-w-[200px] truncate">
                                                        {m.ioc_value}
                                                    </td>
                                                    <td className="py-2 pr-4 text-muted-foreground">
                                                        {m.matched_field}
                                                    </td>
                                                    <td className="py-2 pr-4 text-muted-foreground">
                                                        {m.event_source ?? "—"}
                                                    </td>
                                                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                                                        {m.event_timestamp
                                                            ? new Date(m.event_timestamp).toLocaleString()
                                                            : "—"}
                                                    </td>
                                                    <td className="py-2">
                                                        <span
                                                            className={`px-2 py-0.5 border rounded-sm uppercase text-xs ${sevClass}`}
                                                        >
                                                            {m.severity}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {total > LIMIT && (
                                <div className="flex items-center justify-between pt-4 font-mono text-xs text-muted-foreground">
                                    <span>
                                        SHOWING {(page - 1) * LIMIT + 1}–
                                        {Math.min(page * LIMIT, total)} OF {total}
                                    </span>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page === 1}
                                            onClick={() => setPage((p) => p - 1)}
                                        >
                                            PREV
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page * LIMIT >= total}
                                            onClick={() => setPage((p) => p + 1)}
                                        >
                                            NEXT
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </TacticalPanel>
            </div>

            <Dialog open={isImportOpen} onOpenChange={(open) => {
                setIsImportOpen(open);
                if (!open) {
                    setImportFile(null);
                    setImportResult(null);
                    setImportError(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                }
            }}>
                <DialogContent className="max-w-lg bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-lg tracking-wider">IMPORT IOC INDICATORS</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="font-mono text-xs text-muted-foreground">
                            Upload a <span className="text-foreground">.csv</span> or <span className="text-foreground">.json</span> file containing IOC indicators to bulk-import into the threat intelligence database.
                        </p>
                        <div className="space-y-2">
                            <label className="font-mono text-xs text-muted-foreground uppercase">File</label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.json"
                                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                                className="w-full font-mono text-xs text-foreground bg-secondary border border-border px-3 py-2 file:mr-3 file:bg-primary/10 file:border file:border-primary/30 file:text-primary file:font-mono file:text-xs file:px-2 file:py-1 file:cursor-pointer cursor-pointer"
                            />
                        </div>

                        {importResult && (
                            <div className="p-3 border border-green-500/40 bg-green-500/5 space-y-1">
                                <div className="flex items-center gap-2 font-mono text-xs text-green-400 font-bold">
                                    <CheckCircle2 className="w-4 h-4" />
                                    IMPORT COMPLETE
                                </div>
                                <div className="font-mono text-xs text-muted-foreground">
                                    Imported: <span className="text-foreground">{importResult.imported}</span>
                                    {"  ·  "}
                                    Skipped: <span className="text-foreground">{importResult.skipped}</span>
                                </div>
                                {importResult.errors.length > 0 && (
                                    <div className="font-mono text-xs text-destructive mt-1">
                                        {importResult.errors.slice(0, 5).map((e, i) => (
                                            <div key={i}>{e}</div>
                                        ))}
                                        {importResult.errors.length > 5 && (
                                            <div>…and {importResult.errors.length - 5} more errors</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {importError && (
                            <div className="flex items-center gap-2 p-3 border border-destructive/40 bg-destructive/5 font-mono text-xs text-destructive">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {importError}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2 border-t border-border">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setIsImportOpen(false)}
                                disabled={isImporting}
                            >
                                {importResult ? "CLOSE" : "CANCEL"}
                            </Button>
                            {!importResult && (
                                <Button
                                    variant="tactical"
                                    className="flex-1"
                                    onClick={() => void handleBulkImport()}
                                    disabled={!importFile || isImporting}
                                >
                                    {isImporting
                                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />IMPORTING…</>
                                        : <><Upload className="w-4 h-4 mr-2" />IMPORT</>
                                    }
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
