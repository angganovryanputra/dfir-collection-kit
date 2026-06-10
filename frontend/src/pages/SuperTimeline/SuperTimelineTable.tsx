import React, { useMemo, useRef } from "react";
import { 
    Server, Clock, User, Trash2, Search, AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Shield, Database, Pin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEvidence } from "@/context/EvidenceContext";
import { 
    SortKey, ColumnKey, Bookmark, EventTagValue, EVENT_TAG_META, PAGE_SIZE_OPTIONS
} from "./SuperTimelineTypes";
import { 
    getHostColor, getSourceColor, truncate, hashEvent 
} from "./SuperTimelineUtils";
import { cn } from "@/lib/utils";
import { SafeText } from "@/components/common/SafeText";
import { VirtualizedDataTable, VirtualColumnDef } from "@/components/common/VirtualizedDataTable";
import { SeverityBadge } from "@/components/common/SeverityBadge";

// ─── Table Sub-components ────────────────────────────────────────────────────

interface SortableHeaderProps {
    label: string;
    col: SortKey;
    sortBy: SortKey;
    sortOrder: "asc" | "desc";
    onSort: (col: SortKey) => void;
    className?: string;
}

function SortableHeader({
    label,
    col,
    sortBy,
    sortOrder,
    onSort,
    className = "",
}: SortableHeaderProps) {
    const isSorted = sortBy === col;
    return (
        <div
            className={cn(
                "flex items-center gap-1.5 h-full w-full cursor-pointer hover:text-foreground transition-colors select-none",
                className
            )}
            onClick={(e) => { e.stopPropagation(); onSort(col); }}
        >
            {label}
            <div className="flex flex-col h-2 justify-center opacity-40">
                <span className={cn("leading-[0] text-[8px]", isSorted && sortOrder === "asc" && "text-primary opacity-100")}>▲</span>
                <span className={cn("leading-[0] text-[8px]", isSorted && sortOrder === "desc" && "text-primary opacity-100")}>▼</span>
            </div>
        </div>
    );
}

interface SuperTimelineTableProps {
    data: Record<string, unknown>[];
    total: number;
    page: number;
    setPage: (p: number | ((p: number) => number)) => void;
    pageSize: number;
    setPageSize: (s: number) => void;
    sortBy: SortKey;
    sortOrder: "asc" | "desc";
    onSort: (col: SortKey) => void;
    visibleCols: Set<ColumnKey>;
    loading: boolean;
    error: Error | null;
    selectedEvent: Record<string, unknown> | null;
    onRowClick: (e: React.MouseEvent | null, row: Record<string, unknown>, idx: number) => void;
    focusedRowIndex: number;
    highlightCache: Map<Record<string, unknown>, React.ReactNode>;
    eventHashCache: Map<Record<string, unknown>, string>;
    eventTags: Record<string, EventTagValue | null>;
    setEventTag: (hash: string, tag: EventTagValue | null) => void;
    activeFilterCount: number;
    clearFilters: () => void;
    knownHosts: string[];
    lmWindowSet: Set<Record<string, unknown>>;
    onSearchChange: (q: string) => void;
    bookmarks: Bookmark[];
    onRemoveBookmark: (hash: string) => void;
    showBookmarks: boolean;
}

export function SuperTimelineTable({
    data, total, page, setPage, pageSize, setPageSize, sortBy, sortOrder, onSort,
    visibleCols, loading, error, selectedEvent, onRowClick, focusedRowIndex,
    highlightCache, eventHashCache, eventTags, setEventTag,
    activeFilterCount, clearFilters, knownHosts, lmWindowSet,
    onSearchChange, bookmarks, onRemoveBookmark, showBookmarks
}: SuperTimelineTableProps) {
    const { pinItem, pinnedItems } = useEvidence();
    const totalPages = Math.ceil(total / pageSize);
    const [pageJumpInput, setPageJumpInput] = React.useState("");

    const columns = useMemo<VirtualColumnDef<Record<string, unknown>>[]>(() => [
        {
            id: "seq",
            header: "#",
            width: 55,
            className: "text-right font-mono text-[9px] text-muted-foreground/40 pr-3",
            cell: (row, index) => {
                const evHash = eventHashCache.get(row) ?? hashEvent(row);
                const isPinned = pinnedItems.some(i => i.id === evHash);
                const eventSeq = row["event_seq"] != null ? Number(row["event_seq"]) + 1 : ((page - 1) * pageSize + index + 1);
                
                return (
                    <div className="relative group/pin w-full h-full flex items-center justify-end">
                         <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                pinItem({
                                    id: evHash,
                                    type: "event",
                                    title: truncate(String(row["message"] ?? row["description"] ?? ""), 60),
                                    content: String(row["message"] ?? row["description"] ?? ""),
                                    timestamp: String(row["datetime"] ?? row["timestamp"] ?? ""),
                                    metadata: { host: String(row["host"] ?? ""), source: String(row["source_short"] ?? "") }
                                });
                            }}
                            className={cn(
                                "absolute left-0 top-1/2 -translate-y-1/2 p-1 transition-all z-10",
                                isPinned ? "text-primary opacity-100" : "text-muted-foreground/20 opacity-0 group-hover/pin:opacity-100 hover:text-primary"
                            )}
                        >
                            <Pin className={cn("w-2.5 h-2.5", isPinned && "fill-current")} />
                        </button>
                        {eventSeq}
                    </div>
                );
            }
        },
        {
            id: "host",
            header: <SortableHeader label="HOST" col="host" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />,
            width: 100,
            cell: (row) => {
                const host = String(row["host"] ?? row["computer"] ?? "UNKNOWN");
                const color = getHostColor(host, knownHosts);
                return (
                    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-sm border text-[9px] font-mono font-bold tracking-tighter", color.bg, color.text, color.border)}>
                        {host}
                    </span>
                );
            }
        },
        {
            id: "datetime",
            header: <SortableHeader label="DATETIME (UTC)" col="datetime" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />,
            width: 160,
            cell: (row) => (
                <span className="text-muted-foreground/80 tabular-nums font-mono text-[10px]">
                    {String(row["datetime"] ?? row["timestamp"] ?? "—")}
                </span>
            )
        },
        {
            id: "source",
            header: <SortableHeader label="SOURCE" col="source" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />,
            width: 130,
            cell: (row) => {
                const srcShort = String(row["source_short"] ?? "").toUpperCase();
                const srcColor = getSourceColor(srcShort);
                return (
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className={cn("px-1.5 py-0.5 rounded-sm border text-[9px] font-bold shrink-0 font-mono", srcColor)}>
                            {srcShort}
                        </span>
                        <span className="text-muted-foreground/60 truncate block text-[9px] font-mono uppercase tracking-tight">
                            {truncate(String(row["source"] ?? "—"), 18)}
                        </span>
                    </div>
                );
            }
        },
        {
            id: "message",
            header: <SortableHeader label="MESSAGE" col="message" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />,
            width: "1fr",
            cell: (row) => {
                const highlighted = highlightCache.get(row);
                const severity = String(row["severity"] || "").toLowerCase();
                const hasSeverity = severity && ["critical", "high", "medium", "low"].includes(severity);

                return (
                    <div className="flex items-start gap-2 py-1 w-full overflow-hidden">
                        {hasSeverity && (
                            <SeverityBadge severity={severity} iconOnly className="mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        <SafeText 
                            text={highlighted ? undefined : String(row["message"] ?? row["description"] ?? "—")}
                            className="text-[11px] text-foreground/90 leading-tight font-sans"
                            truncate={500}
                            monospace={false}
                        >
                            {highlighted}
                        </SafeText>
                    </div>
                );
            }
        },
        {
            id: "tag",
            header: "TAG",
            width: 45,
            cell: (row) => {
                const evHash = eventHashCache.get(row) ?? hashEvent(row);
                const tag = eventTags[evHash];
                const tagMeta = tag ? EVENT_TAG_META[tag] : null;
                return (
                    <div className="flex justify-center w-full">
                        <button
                            className={cn(
                                "px-1.5 py-0.5 rounded-sm border font-mono text-[9px] transition-all font-bold",
                                tagMeta ? tagMeta.color : "border-border/10 text-muted-foreground/20 hover:border-border/40 hover:text-muted-foreground/60"
                            )}
                            onClick={(e) => { e.stopPropagation(); /* tag picker handled in parent if needed */ }}
                        >
                            {tagMeta ? tagMeta.short : "+"}
                        </button>
                    </div>
                );
            }
        }
    ], [eventHashCache, pinnedItems, page, pageSize, highlightCache, eventTags, knownHosts, pinItem, sortBy, sortOrder, onSort]);

    if (showBookmarks) {
        return (
            <div className="flex-1 overflow-auto min-h-[400px] bg-card/10 border border-border/40 rounded-sm">
                {bookmarks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3 font-mono text-sm text-muted-foreground italic">
                        <Database className="w-6 h-6 opacity-20" />
                        NO BOOKMARKED EVENTS FOR THIS INCIDENT
                    </div>
                ) : (
                    <div className="divide-y divide-border/10 px-4">
                        {bookmarks.map((bm) => (
                            <div key={bm.eventHash} className="py-4 hover:bg-secondary/10 flex items-start gap-4 group transition-colors">
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        {bm.datetime}
                                        <span className="opacity-30">|</span>
                                        <Server className="w-3 h-3" />
                                        {bm.host}
                                        <span className="opacity-30">|</span>
                                        <span className="font-bold text-primary">{bm.source_short}</span>
                                    </div>
                                    <SafeText text={bm.message} className="text-xs text-foreground/90 leading-relaxed" truncate={500} />
                                    {bm.note && (
                                        <div className="font-mono text-[10px] text-amber-400/80 bg-amber-500/5 px-2 py-1 rounded-sm border border-amber-500/20 max-w-fit">
                                            NOTE: {bm.note}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => onRemoveBookmark(bm.eventHash)}
                                    className="shrink-0 p-2 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 relative">
            <VirtualizedDataTable
                data={data}
                columns={columns}
                height="auto"
                rowHeight={38}
                className="flex-1"
                loading={loading}
                error={error}
                onRowClick={(e, row, idx) => onRowClick(e, row, idx)}
                rowClassName={(row) => {
                    const srcShort = String(row["source_short"] ?? "").toUpperCase();
                    const isSigma = srcShort === "SIGMA" || srcShort === "HAYABUSA";
                    const isMft = srcShort === "MFT" || srcShort === "FILE";
                    const isReg = srcShort === "REG" || srcShort === "REGISTRY";
                    const isLog = srcShort === "EVTX" || srcShort === "LOG";

                    return cn(
                        "cursor-pointer border-l-2 border-l-transparent",
                        selectedEvent === row ? "ring-1 ring-inset ring-primary/60 bg-primary/10 z-10" :
                        isSigma ? "bg-red-500/5 border-l-red-500 hover:bg-red-500/10" :
                        isMft ? "bg-green-500/5 border-l-green-500 hover:bg-green-500/10" :
                        isReg ? "bg-purple-500/5 border-l-purple-500 hover:bg-purple-500/10" :
                        isLog ? "bg-blue-500/5 border-l-blue-500 hover:bg-blue-500/10" :
                        lmWindowSet.has(row) ? "bg-orange-500/5 border-l-orange-500 hover:bg-orange-500/10" :
                        "hover:bg-secondary/40"
                    );
                }}
            />

            {/* Pagination footer */}
            {data.length > 0 && (
                <div className="flex items-center justify-between pt-3 border-t border-border mt-3 shrink-0 font-mono text-[10px] text-muted-foreground flex-wrap gap-2 px-1">
                    <div className="flex items-center gap-4">
                        <span>
                            {((page - 1) * pageSize + 1).toLocaleString()}–
                            {Math.min(page * pageSize, total).toLocaleString()} OF{" "}
                            <span className="text-foreground font-bold">{total.toLocaleString()}</span> EVENTS
                            {activeFilterCount > 0 && (
                                <span className="ml-2 text-primary font-bold">(FILTERED)</span>
                            )}
                        </span>
                        <div className="flex items-center gap-1">
                            <span className="opacity-50 uppercase tracking-tighter">Rows:</span>
                            {PAGE_SIZE_OPTIONS.map((n) => (
                                <button
                                    key={n}
                                    onClick={() => setPageSize(n)}
                                    className={cn(
                                        "px-1.5 py-0.5 rounded-sm border transition-all text-[9px]",
                                        pageSize === n ? "border-primary bg-primary/10 text-primary font-bold" : "border-border/40 hover:border-border"
                                    )}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                            <span className="opacity-50 text-[9px] uppercase tracking-tighter">Jump:</span>
                            <input
                                type="number"
                                min={1}
                                max={totalPages}
                                value={pageJumpInput}
                                onChange={(e) => setPageJumpInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        const p = parseInt(pageJumpInput, 10);
                                        if (!isNaN(p) && p >= 1 && p <= totalPages) {
                                            setPage(p);
                                            setPageJumpInput("");
                                        }
                                    }
                                }}
                                placeholder={String(page)}
                                className="w-10 h-6 px-1 bg-secondary/40 border border-border/40 rounded-sm text-center focus:outline-none focus:ring-1 focus:ring-primary text-[10px]"
                            />
                            <span className="opacity-50 text-[9px]">/ {totalPages}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-6 w-6 p-0 border-border/40" disabled={page <= 1 || loading} onClick={() => setPage(1)}>
                                <ChevronsLeft className="w-3 h-3" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-6 text-[9px] px-2 border-border/40 font-bold" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>
                                PREV
                            </Button>
                            <Button variant="outline" size="sm" className="h-6 text-[9px] px-2 border-border/40 text-primary border-primary/40 font-bold" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>
                                NEXT
                            </Button>
                            <Button variant="outline" size="sm" className="h-6 w-6 p-0 border-border/40" disabled={page >= totalPages || loading} onClick={() => setPage(totalPages)}>
                                <ChevronsRight className="w-3 h-3" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
