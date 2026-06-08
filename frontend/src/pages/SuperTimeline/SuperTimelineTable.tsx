import React from "react";
import { 
    Server, Clock, User, Trash2, Search, AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Shield, Database, LayoutGrid, Pin
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
        <th
            className={`px-3 py-2 text-left font-bold cursor-pointer hover:bg-secondary/40 transition-colors select-none whitespace-nowrap ${className}`}
            onClick={() => onSort(col)}
        >
            <div className="flex items-center gap-1.5">
                {label}
                <div className="flex flex-col h-2 justify-center opacity-40">
                    <span className={`leading-[0] text-[8px] ${isSorted && sortOrder === "asc" ? "text-primary opacity-100" : ""}`}>▲</span>
                    <span className={`leading-[0] text-[8px] ${isSorted && sortOrder === "desc" ? "text-primary opacity-100" : ""}`}>▼</span>
                </div>
            </div>
        </th>
    );
}

// ─── Memoized Row Component ──────────────────────────────────────────────────

interface SuperTimelineRowProps {
    row: Record<string, unknown>;
    index: number;
    page: number;
    pageSize: number;
    knownHosts: string[];
    visibleCols: Set<ColumnKey>;
    isSelected: boolean;
    isFocused: boolean;
    isInLmWindow: boolean;
    highlightedMessage: React.ReactNode;
    evHash: string;
    tag: EventTagValue | null;
    onRowClick: (e: React.MouseEvent, row: Record<string, unknown>, idx: number) => void;
    onSearchChange: (q: string) => void;
    setEventTag: (hash: string, tag: EventTagValue | null) => void;
}

const SuperTimelineRow = React.memo(({
    row, index, page, pageSize, knownHosts, visibleCols, isSelected, isFocused,
    isInLmWindow, highlightedMessage, evHash, tag, onRowClick, onSearchChange, setEventTag
}: SuperTimelineRowProps) => {
    const { pinItem, pinnedItems } = useEvidence();
    const eventSeq   = row["event_seq"] != null ? Number(row["event_seq"]) + 1 : ((page - 1) * pageSize + index + 1);
    const host       = String(row["host"] ?? row["computer"] ?? "UNKNOWN");
    const color      = getHostColor(host, knownHosts);
    const srcShort   = String(row["source_short"] ?? "");
    const srcColor   = getSourceColor(srcShort);
    const datetime   = String(row["datetime"] ?? row["timestamp"] ?? "—");
    const tsDesc     = String(row["timestamp_desc"] ?? "—");
    const source     = String(row["source"] ?? "—");
    const message    = String(row["message"] ?? row["description"] ?? "—");
    const user       = row["user"] ? String(row["user"]) : null;
    const eventId     = row["event_id"] ? String(row["event_id"]) : null;
    const ruleName    = row["rule_name"] ? String(row["rule_name"]) : null;
    const eventLabel  = eventId ?? ruleName ?? null;
    const isEvtxLike  = eventId != null;
    const displayName = row["display_name"] ? String(row["display_name"]) : null;

    const isSigma = srcShort === "SIGMA" || srcShort === "HAYABUSA";
    
    const rowCls = isSigma
        ? "border-b border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
        : isInLmWindow
            ? "border-b border-border/20 bg-orange-500/5 hover:bg-orange-500/10 border-l-2 border-l-orange-500/60"
            : "border-b border-border/20 hover:bg-primary/5";

    const tagMeta = tag ? EVENT_TAG_META[tag] : null;
    const isPinned = pinnedItems.some(i => i.id === evHash);

    const handlePin = (e: React.MouseEvent) => {
        e.stopPropagation();
        pinItem({
            id: evHash,
            type: "event",
            title: truncate(message, 60),
            content: message,
            timestamp: datetime,
            metadata: { host, source: srcShort }
        });
    };

    return (
        <tr
            className={cn(
                "transition-colors text-xs cursor-pointer group/row",
                rowCls,
                isSelected && "ring-1 ring-inset ring-primary/60",
                isFocused && "bg-secondary/60 ring-1 ring-inset ring-primary/30"
            )}
            style={{ contentVisibility: "auto", containIntrinsicSize: "0 40px" }}
            onClick={(e) => onRowClick(e, row, index)}
        >
            <td className="px-2 py-1.5 text-right text-muted-foreground/50 text-[10px] select-none tabular-nums w-10 relative">
                <button 
                    onClick={handlePin}
                    className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 p-1 transition-all z-10",
                        isPinned ? "text-primary opacity-100" : "text-muted-foreground/20 opacity-0 group-hover/row:opacity-100 hover:text-primary"
                    )}
                    title={isPinned ? "Pinned to Workspace" : "Pin to Workspace"}
                >
                    <Pin className={cn("w-2.5 h-2.5", isPinned && "fill-current")} />
                </button>
                {eventSeq.toLocaleString()}
            </td>
            <td className="px-3 py-1.5 whitespace-nowrap">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] font-mono ${color.bg} ${color.text} ${color.border}`}>
                    <Server className="w-2 h-2 shrink-0" />
                    {host}
                </span>
            </td>
            <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground tabular-nums">
                <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5 shrink-0 text-muted-foreground/50" />
                    {datetime}
                </span>
            </td>
            <td className="px-3 py-1.5 whitespace-nowrap">
                <span
                    className="px-1.5 py-0.5 rounded-sm border border-border/40 bg-secondary/30 text-[10px] truncate block max-w-[130px]"
                    title={tsDesc}
                >
                    {truncate(tsDesc, 22)}
                </span>
            </td>
            <td className="px-3 py-1.5 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                    {srcShort && (
                        <span className={`px-1.5 py-0.5 rounded-sm border text-[10px] font-bold shrink-0 ${srcColor}`}>
                            {srcShort}
                        </span>
                    )}
                    <span className="text-muted-foreground truncate block max-w-[90px] text-[10px]" title={source}>
                        {truncate(source, 22)}
                    </span>
                </div>
            </td>
            {visibleCols.has("event_id") && (
                <td className="px-3 py-1.5 whitespace-nowrap">
                    {eventLabel ? (
                        <span
                            className={`px-1.5 py-0.5 rounded-sm border text-[10px] truncate block max-w-[110px] ${
                                isEvtxLike
                                    ? "border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold"
                                    : "border-orange-500/30 bg-orange-500/10 text-orange-400"
                            }`}
                            title={eventLabel}
                        >
                            {isEvtxLike ? `EID:${eventLabel}` : truncate(eventLabel, 18)}
                        </span>
                    ) : (
                        <span className="text-muted-foreground/30">—</span>
                    )}
                </td>
            )}
            {visibleCols.has("user") && (
                <td className="px-3 py-1.5 whitespace-nowrap">
                    {user ? (
                        <span className="flex items-center gap-1 text-[10px]">
                            <User className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
                            <button
                                className="text-foreground/80 hover:text-primary transition-colors"
                                title={`Filter by user: ${user}`}
                                onClick={(e) => { e.stopPropagation(); onSearchChange(`user:"${user}"`); }}
                            >
                                {truncate(user, 16)}
                            </button>
                        </span>
                    ) : (
                        <span className="text-muted-foreground/30">—</span>
                    )}
                </td>
            )}
            {visibleCols.has("display_name") && (
                <td className="px-3 py-1.5 max-w-[160px]">
                    {displayName ? (
                        <span
                            className="block truncate text-[10px] text-muted-foreground font-mono"
                            title={displayName}
                            style={{ direction: "rtl", textAlign: "left" }}
                        >
                            {displayName}
                        </span>
                    ) : (
                        <span className="text-muted-foreground/30">—</span>
                    )}
                </td>
            )}
            <td className="px-3 py-1.5 max-w-[0] w-full">
                <span className="truncate block" title={message}>
                    {highlightedMessage ?? message}
                </span>
            </td>
            <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <div className="relative group/tag">
                    <button
                        className={cn(
                            "px-1.5 py-0.5 rounded-sm border font-mono text-[10px] transition-all",
                            tagMeta ? tagMeta.color : "border-border/20 text-muted-foreground/30 hover:border-border/60 hover:text-muted-foreground"
                        )}
                        title={tagMeta ? `Tag: ${tagMeta.label} (click to change)` : "Add tag"}
                    >
                        {tagMeta ? tagMeta.short : "+"}
                    </button>
                    <div className="absolute right-0 top-full mt-0.5 z-50 hidden group-hover/tag:flex flex-col bg-card border border-border shadow-lg rounded-sm overflow-hidden min-w-[110px]">
                        {(Object.entries(EVENT_TAG_META) as [EventTagValue, typeof EVENT_TAG_META[EventTagValue]][]).map(([k, v]) => (
                            <button
                                key={k}
                                onClick={() => setEventTag(evHash, k)}
                                className={cn(
                                    "px-2 py-1.5 text-left font-mono text-[10px] transition-colors hover:bg-secondary/50 flex items-center gap-2",
                                    tag === k ? v.color : "text-muted-foreground"
                                )}
                            >
                                <span className={cn("w-1.5 h-1.5 rounded-full", tag === k ? "" : "bg-muted-foreground/30")}
                                    style={tag === k ? { background: "currentColor" } : {}} />
                                {v.label}
                            </button>
                        ))}
                        {tag && (
                            <button
                                onClick={() => setEventTag(evHash, null)}
                                className="px-2 py-1.5 text-left font-mono text-[10px] text-destructive/60 hover:bg-secondary/50 border-t border-border/40"
                            >
                                CLEAR
                            </button>
                        )}
                    </div>
                </div>
            </td>
        </tr>
    );
});

SuperTimelineRow.displayName = "SuperTimelineRow";

// ─── Main Table Component ────────────────────────────────────────────────────

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
    onRowClick: (e: React.MouseEvent, row: Record<string, unknown>, idx: number) => void;
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
    const totalPages = Math.ceil(total / pageSize);
    const [pageJumpInput, setPageJumpInput] = React.useState("");
    const [showScrollTop, setShowScrollTop] = React.useState(false);
    const tableContainerRef = React.useRef<HTMLDivElement>(null);

    const handlePageJump = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            const p = parseInt(pageJumpInput, 10);
            if (!isNaN(p) && p >= 1 && p <= totalPages) {
                setPage(p);
                setPageJumpInput("");
            }
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setShowScrollTop(e.currentTarget.scrollTop > 400);
    };

    const scrollToTop = () => {
        tableContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (showBookmarks) {
        return (
            <div className="flex-1 overflow-auto min-h-[400px]">
                {bookmarks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3 font-mono text-sm text-muted-foreground italic">
                        <Database className="w-6 h-6 opacity-20" />
                        NO BOOKMARKED EVENTS FOR THIS INCIDENT
                    </div>
                ) : (
                    <div className="divide-y divide-border/40">
                        {bookmarks.map((bm) => (
                            <div key={bm.eventHash} className="p-3 hover:bg-secondary/20 flex items-start gap-4 group transition-colors">
                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        {bm.datetime}
                                        <span className="opacity-30">|</span>
                                        <Server className="w-3 h-3" />
                                        {bm.host}
                                        <span className="opacity-30">|</span>
                                        <span className="font-bold text-primary">{bm.source_short}</span>
                                    </div>
                                    <div className="font-mono text-xs text-foreground/90 break-all leading-relaxed">
                                        {bm.message}
                                    </div>
                                    {bm.note && (
                                        <div className="font-mono text-[10px] text-amber-400/80 bg-amber-500/5 px-2 py-1 rounded-sm border border-amber-500/20">
                                            NOTE: {bm.note}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => onRemoveBookmark(bm.eventHash)}
                                    className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                    title="Remove bookmark"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
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
            <div 
                ref={tableContainerRef}
                className="flex-1 overflow-auto min-h-[300px]" 
                onScroll={handleScroll}
            >
                {error ? (
                    <div className="flex items-center justify-center h-40 font-mono text-sm text-destructive">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        ERROR: {error.message}
                    </div>
                ) : loading ? (
                    <div className="space-y-2 p-2">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-7 bg-secondary/40 rounded-sm animate-pulse"
                                style={{ opacity: 1 - i * 0.08 }}
                            />
                        ))}
                    </div>
                ) : data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3 font-mono text-sm text-muted-foreground">
                        <Search className="w-6 h-6 opacity-30" />
                        {activeFilterCount > 0
                            ? "NO EVENTS MATCH THE ACTIVE FILTERS"
                            : "NO TIMELINE EVENTS AVAILABLE"}
                        {activeFilterCount > 0 && (
                            <button
                                onClick={clearFilters}
                                className="text-xs text-primary hover:underline"
                            >
                                CLEAR FILTERS
                            </button>
                        )}
                    </div>
                ) : (
                    <table className="w-full text-sm font-mono border-collapse">
                        <thead className="sticky top-0 bg-card border-b border-border z-10">
                            <tr className="text-muted-foreground text-[10px] uppercase tracking-wider">
                                <th className="px-2 py-2 text-right font-bold w-10 text-muted-foreground/60">#</th>
                                <SortableHeader label="HOST"     col="host"     sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
                                <SortableHeader label="DATETIME (UTC)" col="datetime" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
                                <SortableHeader label="TYPE"     col="type"     sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
                                <SortableHeader label="SOURCE"   col="source"   sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
                                {visibleCols.has("event_id") && (
                                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">EVENT ID / RULE</th>
                                )}
                                {visibleCols.has("user") && (
                                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">USER</th>
                                )}
                                {visibleCols.has("display_name") && (
                                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">PATH / ARTIFACT</th>
                                )}
                                <SortableHeader label="MESSAGE"  col="message"  sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} className="w-full" />
                                <th className="px-2 py-2 text-left font-bold whitespace-nowrap text-muted-foreground/50 w-8">TAG</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, i) => (
                                <SuperTimelineRow 
                                    key={i}
                                    row={row}
                                    index={i}
                                    page={page}
                                    pageSize={pageSize}
                                    knownHosts={knownHosts}
                                    visibleCols={visibleCols}
                                    isSelected={selectedEvent === row}
                                    isFocused={focusedRowIndex === i && !selectedEvent}
                                    isInLmWindow={lmWindowSet.has(row)}
                                    highlightedMessage={highlightCache.get(row)}
                                    evHash={eventHashCache.get(row) ?? hashEvent(row)}
                                    tag={eventTags[eventHashCache.get(row) ?? hashEvent(row)]}
                                    onRowClick={onRowClick}
                                    onSearchChange={onSearchChange}
                                    setEventTag={setEventTag}
                                />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Scroll to Top FAB */}
            {showScrollTop && (
                <button
                    onClick={scrollToTop}
                    className="absolute bottom-16 right-6 p-2 bg-primary text-primary-foreground rounded-full shadow-lg hover:scale-110 transition-all z-20 animate-in fade-in zoom-in duration-200"
                    title="Scroll to Top"
                >
                    <ChevronLeft className="w-5 h-5 rotate-90" />
                </button>
            )}

            {/* Pagination footer */}
            {data.length > 0 && (
                <div className="flex items-center justify-between pt-3 border-t border-border mt-3 shrink-0 font-mono text-xs text-muted-foreground flex-wrap gap-2">
                    <span>
                        {((page - 1) * pageSize + 1).toLocaleString()}–
                        {Math.min(page * pageSize, total).toLocaleString()} OF{" "}
                        <span className="text-foreground font-bold">{total.toLocaleString()}</span> EVENTS
                        {activeFilterCount > 0 && (
                            <span className="ml-2 text-primary">(FILTERED)</span>
                        )}
                        {!selectedEvent && focusedRowIndex < 0 && (
                            <span className="ml-3 text-muted-foreground/50">SHIFT+CLICK any row to compare</span>
                        )}
                    </span>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">ROWS:</span>
                            {PAGE_SIZE_OPTIONS.map((n) => (
                                <button
                                    key={n}
                                    onClick={() => setPageSize(n)}
                                    className={`px-1.5 py-0.5 rounded-sm border text-xs transition-colors ${
                                        pageSize === n
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border/40 hover:border-border"
                                    }`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        <div className="h-3 border-l border-border/40" />
                        <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">PAGE:</span>
                            <input
                                type="number"
                                min={1}
                                max={totalPages}
                                value={pageJumpInput}
                                onChange={(e) => setPageJumpInput(e.target.value)}
                                onKeyDown={handlePageJump}
                                placeholder={String(page)}
                                className="w-12 h-6 px-1 bg-background border border-input rounded-sm text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <span className="text-muted-foreground">/ {totalPages}</span>
                        </div>
                        <div className="h-3 border-l border-border/40" />
                        <Button
                            variant="outline" size="sm" className="h-6 w-6 p-0"
                            disabled={page <= 1 || loading}
                            onClick={() => setPage(1)}
                        >
                            <ChevronsLeft className="w-3 h-3" />
                        </Button>
                        <Button
                            variant="outline" size="sm" className="h-6 text-xs px-2"
                            disabled={page <= 1 || loading}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                            <ChevronLeft className="w-3 h-3 mr-0.5" />PREV
                        </Button>
                        <Button
                            variant="outline" size="sm" className="h-6 text-xs px-2"
                            disabled={page >= totalPages || loading}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            NEXT<ChevronRight className="w-3 h-3 ml-0.5" />
                        </Button>
                        <Button
                            variant="outline" size="sm" className="h-6 w-6 p-0"
                            disabled={page >= totalPages || loading}
                            onClick={() => setPage(totalPages)}
                        >
                            <ChevronsRight className="w-3 h-3" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
