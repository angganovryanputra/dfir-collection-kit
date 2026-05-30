import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { 
    ChevronLeft, Loader2, Network, Shield, ArrowRight
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";

// Sub-components
import { SuperTimelineStatus } from "./SuperTimeline/SuperTimelineStatus";
import { SuperTimelineFilters } from "./SuperTimeline/SuperTimelineFilters";
import { SuperTimelineTable } from "./SuperTimeline/SuperTimelineTable";
import { SuperTimelineToolbar } from "./SuperTimeline/SuperTimelineToolbar";
import { SuperTimelineChart } from "./SuperTimeline/SuperTimelineChart";
import { EventDetailPanel, ComparePanel } from "./SuperTimeline/SuperTimelinePanels";

// Types & Utils
import { 
    SuperTimelineStatusData, LateralMovementDetection, SuperTimelineResponse, 
    QuickFilter, SortKey, ColumnKey, Bookmark, EventTagValue,
    DEFAULT_VISIBLE, COL_STORAGE_KEY, PAGE_SIZE_OPTIONS
} from "./SuperTimeline/SuperTimelineTypes";
import { 
    parseDSLQuery, hashEvent, highlightTerms, getHostColor
} from "./SuperTimeline/SuperTimelineUtils";

export default function SuperTimeline() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();

    // ─── UI State ────────────────────────────────────────────────────────────
    const initialQ = searchParams.get("q") || "";
    const initialStart = searchParams.get("start_date") || "";
    const initialEnd = searchParams.get("end_date") || "";
    
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
    const [sortBy, setSortBy] = useState<SortKey>("datetime");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [searchInput, setSearchInput] = useState(initialQ);
    const [debouncedSearch, setDebouncedSearch] = useState(initialQ);
    const [dateFrom, setDateFrom] = useState(initialStart);
    const [dateTo, setDateTo] = useState(initialEnd);
    const [dateFilterActive, setDateFilterActive] = useState(!!(initialStart || initialEnd));
    const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);

    const [activeHosts, setActiveHosts] = useState<Set<string>>(new Set());
    const [allHostsActive, setAllHostsActive] = useState(true);
    const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
    const [allSourcesActive, setAllSourcesActive] = useState(true);

    const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(() => {
        const stored = localStorage.getItem(COL_STORAGE_KEY);
        return stored ? new Set(JSON.parse(stored)) : new Set(DEFAULT_VISIBLE);
    });

    const [selectedEvent, setSelectedEvent] = useState<Record<string, unknown> | null>(null);
    const [compareEvents, setCompareEvents] = useState<Record<string, unknown>[] | null>(null);
    const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
    const [showBookmarks, setShowBookmarks] = useState(false);
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [eventTags, setEventTags] = useState<Record<string, EventTagValue | null>>({});

    const [isBuilding, setIsBuilding] = useState(false);
    const [buildError, setBuildError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    // ─── Data Fetching ───────────────────────────────────────────────────────
    const { data: stStatus, isLoading: statusLoading, error: statusError } = useQuery<SuperTimelineStatusData | null>({
        queryKey: ["super-timeline-status", incidentId],
        queryFn: () => apiGet<SuperTimelineStatusData>(`/processing/incident/${incidentId}/super-timeline/status`),
        refetchInterval: (q) => {
            const s = q.state.data?.status;
            return s === "BUILDING" || s === "PENDING" ? 5000 : false;
        },
    });

    const isDone = stStatus?.status === "DONE";
    const isFailed = stStatus?.status === "FAILED";

    const { data: timelineData, isLoading: tlLoading, error: tlError } = useQuery<SuperTimelineResponse>({
        queryKey: ["super-timeline-data", incidentId, page, pageSize, sortBy, sortOrder, debouncedSearch, dateFilterActive ? dateFrom : "", dateFilterActive ? dateTo : "", Array.from(activeHosts), Array.from(activeSources)],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(pageSize),
                sort_by: sortBy,
                sort_order: sortOrder,
            });
            if (debouncedSearch) params.append("q", debouncedSearch);
            if (dateFilterActive) {
                if (dateFrom) params.append("start_date", dateFrom);
                if (dateTo) params.append("end_date", dateTo);
            }
            if (!allHostsActive && activeHosts.size > 0) {
                activeHosts.forEach(h => params.append("hosts", h));
            }
            if (!allSourcesActive && activeSources.size > 0) {
                activeSources.forEach(s => params.append("sources", s));
            }
            return apiGet<SuperTimelineResponse>(`/processing/incident/${incidentId}/super-timeline?${params.toString()}`);
        },
        enabled: isDone,
    });

    const { data: lmDetections, isLoading: lmLoading } = useQuery<LateralMovementDetection[]>({
        queryKey: ["lateral-movements", incidentId],
        queryFn: () => apiGet<LateralMovementDetection[]>(`/processing/incident/${incidentId}/super-timeline/lateral-movement`),
        enabled: isDone,
    });

    // ─── Effects ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchInput), 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    useEffect(() => {
        if (incidentId) {
            const b = localStorage.getItem(`bookmarks_${incidentId}`);
            if (b) setBookmarks(JSON.parse(b));
            const t = localStorage.getItem(`tags_${incidentId}`);
            if (t) setEventTags(JSON.parse(t));
        }
    }, [incidentId]);

    const saveBookmarks = (id: string, b: Bookmark[]) => localStorage.setItem(`bookmarks_${id}`, JSON.stringify(b));
    const saveTags = (id: string, t: Record<string, EventTagValue | null>) => localStorage.setItem(`tags_${id}`, JSON.stringify(t));

    // ─── Handlers ────────────────────────────────────────────────────────────
    const triggerBuild = async () => {
        setIsBuilding(true);
        setBuildError(null);
        try {
            await apiPost(`/processing/incident/${incidentId}/super-timeline/build`, {});
            queryClient.invalidateQueries({ queryKey: ["super-timeline-status", incidentId] });
        } catch (err) {
            setBuildError(err instanceof Error ? err.message : "Build trigger failed");
        } finally {
            setIsBuilding(false);
        }
    };

    const handleSort = (col: SortKey) => {
        if (sortBy === col) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        else { setSortBy(col); setSortOrder("asc"); }
        setPage(1);
    };

    const toggleHost = (h: string) => {
        const next = new Set(activeHosts);
        if (allHostsActive) {
            next.clear();
            (timelineData?.hosts ?? []).forEach(x => { if (x !== h) next.add(x); });
            setAllHostsActive(false);
        } else {
            if (next.has(h)) next.delete(h); else next.add(h);
            if (next.size === 0 || next.size === (timelineData?.hosts ?? []).length) {
                setAllHostsActive(true); next.clear();
            }
        }
        setActiveHosts(next); setPage(1);
    };

    const toggleSource = (s: string) => {
        const next = new Set(activeSources);
        if (allSourcesActive) {
            next.clear();
            (timelineData?.source_shorts ?? []).forEach(x => { if (x !== s) next.add(x); });
            setAllSourcesActive(false);
        } else {
            if (next.has(s)) next.delete(s); else next.add(s);
            if (next.size === 0 || next.size === (timelineData?.source_shorts ?? []).length) {
                setAllSourcesActive(true); next.clear();
            }
        }
        setActiveSources(next); setPage(1);
    };

    const applyQuickFilter = (qf: QuickFilter) => {
        if (activeQuickFilter === qf.id) {
            setActiveQuickFilter(null); setSearchInput(""); setAllSourcesActive(true); setActiveSources(new Set());
        } else {
            setActiveQuickFilter(qf.id);
            if (qf.q) setSearchInput(qf.q);
            if (qf.sources) {
                setAllSourcesActive(false);
                setActiveSources(new Set(qf.sources));
            } else {
                setAllSourcesActive(true); setActiveSources(new Set());
            }
        }
        setPage(1);
    };

    const handleExport = async () => {
        if (!incidentId) return;
        setIsExporting(true);
        try {
            const params = new URLSearchParams({ format: "csv" });
            if (debouncedSearch) params.append("q", debouncedSearch);
            window.location.href = `${import.meta.env.VITE_API_BASE_URL || "/api/v1"}/processing/incident/${incidentId}/super-timeline/export?${params.toString()}`;
        } finally {
            setTimeout(() => setIsExporting(false), 2000);
        }
    };

    const toggleBookmark = (event: Record<string, unknown>, note: string) => {
        if (!incidentId) return;
        const hash = hashEvent(event);
        const existing = bookmarks.find(b => b.eventHash === hash);
        let next: Bookmark[];
        if (existing) {
            next = bookmarks.filter(b => b.eventHash !== hash);
        } else {
            next = [...bookmarks, {
                eventHash: hash,
                note,
                createdAt: new Date().toISOString(),
                datetime: String(event["datetime"]),
                host: String(event["host"] ?? event["computer"] ?? "UNKNOWN"),
                message: String(event["message"] ?? event["description"] ?? ""),
                source_short: String(event["source_short"] ?? ""),
            }];
        }
        setBookmarks(next);
        saveBookmarks(incidentId, next);
    };

    const setEventTag = (hash: string, tag: EventTagValue | null) => {
        if (!incidentId) return;
        const next = { ...eventTags, [hash]: tag };
        setEventTags(next);
        saveTags(incidentId, next);
    };

    const onSelectChartWindow = (from: string, to: string) => {
        setDateFrom(from.replace(" ", "T"));
        setDateTo(to.replace(" ", "T"));
        setDateFilterActive(true);
        setPage(1);
    };

    // ─── Caches ──────────────────────────────────────────────────────────────
    const highlightCache = useMemo(() => {
        const cache = new Map<Record<string, unknown>, React.ReactNode>();
        if (!timelineData?.data || !debouncedSearch) return cache;
        const terms = parseDSLQuery(debouncedSearch);
        if (!terms.q) return cache;
        timelineData.data.forEach(row => {
            const msg = String(row["message"] ?? row["description"] ?? "");
            cache.set(row, highlightTerms(msg, terms.q));
        });
        return cache;
    }, [timelineData?.data, debouncedSearch]);

    const eventHashCache = useMemo(() => {
        const cache = new Map<Record<string, unknown>, string>();
        if (!timelineData?.data) return cache;
        timelineData.data.forEach(row => cache.set(row, hashEvent(row)));
        return cache;
    }, [timelineData?.data]);

    const lmWindowSet = useMemo(() => {
        const s = new Set<Record<string, unknown>>();
        return s;
    }, [lmDetections, timelineData?.data]);

    const activeFilterCount = (debouncedSearch ? 1 : 0) + (dateFilterActive ? 1 : 0) + (allHostsActive ? 0 : 1) + (allSourcesActive ? 0 : 1);

    return (
        <AppLayout
            title="SUPER TIMELINE"
            subtitle={`INCIDENT: ${incidentId}`}
            headerActions={
                <Button variant="ghost" onClick={() => navigate(`/incidents/${incidentId}`)} size="sm">
                    <ChevronLeft className="w-4 h-4 mr-2" /> BACK TO HUB
                </Button>
            }
        >
            <div className="p-6 flex flex-col gap-6 max-w-[1600px] mx-auto w-full h-[calc(100vh-120px)]">
                
                <SuperTimelineStatus 
                    stStatus={stStatus ?? null}
                    statusLoading={statusLoading}
                    statusError={statusError instanceof Error ? statusError.message : null}
                    isBuilding={isBuilding || stStatus?.status === "BUILDING" || stStatus?.status === "PENDING"}
                    isFailed={isFailed}
                    isDone={isDone}
                    buildError={buildError}
                    triggerBuild={triggerBuild}
                    lmCount={lmDetections?.length ?? 0}
                />

                {isDone && (
                    <div className="flex flex-col flex-1 gap-4 min-h-0">
                        
                        <SuperTimelineFilters 
                            searchInput={searchInput}
                            onSearchChange={setSearchInput}
                            dateFrom={dateFrom}
                            setDateFrom={setDateFrom}
                            dateTo={dateTo}
                            setDateTo={setDateTo}
                            dateFilterActive={dateFilterActive}
                            applyDateFilter={() => setDateFilterActive(true)}
                            clearDateFilter={() => { setDateFilterActive(false); setDateFrom(""); setDateTo(""); }}
                            activeQuickFilter={activeQuickFilter}
                            applyQuickFilter={applyQuickFilter}
                            knownHosts={timelineData?.hosts ?? []}
                            activeHosts={activeHosts}
                            allHostsActive={allHostsActive}
                            toggleHost={toggleHost}
                            toggleAllHosts={() => { setAllHostsActive(true); setActiveHosts(new Set()); setPage(1); }}
                            knownSources={timelineData?.source_shorts ?? []}
                            activeSources={activeSources}
                            allSourcesActive={allSourcesActive}
                            toggleSource={toggleSource}
                            toggleAllSources={() => { setAllSourcesActive(true); setActiveSources(new Set()); setPage(1); }}
                            clearAll={() => {
                                setSearchInput(""); setDebouncedSearch("");
                                setAllHostsActive(true); setActiveHosts(new Set());
                                setAllSourcesActive(true); setActiveSources(new Set());
                                setDateFilterActive(false); setDateFrom(""); setDateTo("");
                                setActiveQuickFilter(null); setPage(1);
                            }}
                            activeFilterCount={activeFilterCount}
                        />

                        <TacticalPanel title={showBookmarks ? "BOOKMARKED EVENTS" : "UNIFIED EVENT TIMELINE"} className="flex-1 flex flex-col min-h-0 overflow-hidden p-0">
                            <div className="flex flex-col h-full">
                                <SuperTimelineToolbar 
                                    visibleCols={visibleCols}
                                    toggleCol={(k) => {
                                        const next = new Set(visibleCols);
                                        if (next.has(k)) next.delete(k); else next.add(k);
                                        setVisibleCols(next);
                                        localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(Array.from(next)));
                                    }}
                                    showBookmarks={showBookmarks}
                                    setShowBookmarks={setShowBookmarks}
                                    bookmarkCount={bookmarks.length}
                                    onExport={handleExport}
                                    isExporting={isExporting}
                                    activeFilterCount={activeFilterCount}
                                    totalEvents={timelineData?.total ?? 0}
                                />

                                {!showBookmarks && timelineData && (
                                    <SuperTimelineChart 
                                        data={timelineData.data} 
                                        onSelectWindow={onSelectChartWindow}
                                    />
                                )}

                                <SuperTimelineTable 
                                    data={showBookmarks ? [] : (timelineData?.data ?? [])}
                                    total={timelineData?.total ?? 0}
                                    page={page}
                                    setPage={setPage}
                                    pageSize={pageSize}
                                    setPageSize={setPageSize}
                                    sortBy={sortBy}
                                    sortOrder={sortOrder}
                                    onSort={handleSort}
                                    visibleCols={visibleCols}
                                    loading={tlLoading}
                                    error={tlError as Error}
                                    selectedEvent={selectedEvent}
                                    onRowClick={(e, row, i) => {
                                        if (e.shiftKey) {
                                            if (!compareEvents) setCompareEvents([row]);
                                            else if (compareEvents.includes(row)) setCompareEvents(compareEvents.filter(x => x !== row));
                                            else setCompareEvents([...compareEvents, row]);
                                        } else {
                                            setSelectedEvent(row);
                                            setFocusedRowIndex(i);
                                        }
                                    } }
                                    focusedRowIndex={focusedRowIndex}
                                    highlightCache={highlightCache}
                                    eventHashCache={eventHashCache}
                                    eventTags={eventTags}
                                    setEventTag={setEventTag}
                                    activeFilterCount={activeFilterCount}
                                    clearFilters={() => {}}
                                    knownHosts={timelineData?.hosts ?? []}
                                    lmWindowSet={lmWindowSet}
                                    onSearchChange={(q) => { setSearchInput(q); setPage(1); }}
                                    bookmarks={bookmarks}
                                    onRemoveBookmark={(hash) => {
                                        const next = bookmarks.filter(b => b.eventHash !== hash);
                                        setBookmarks(next);
                                        saveBookmarks(incidentId ?? "", next);
                                    }}
                                    showBookmarks={showBookmarks}
                                />
                            </div>
                        </TacticalPanel>
                    </div>
                )}
            </div>

            {selectedEvent && (
                <EventDetailPanel 
                    event={selectedEvent}
                    knownHosts={timelineData?.hosts ?? []}
                    onClose={() => setSelectedEvent(null)}
                    onFilterSearch={(q) => { setSearchInput(q); setPage(1); }}
                    incidentId={incidentId ?? ""}
                    isBookmarked={!!bookmarks.find(b => b.eventHash === (eventHashCache.get(selectedEvent) ?? hashEvent(selectedEvent)))}
                    onBookmarkToggle={toggleBookmark}
                    onNavigateIOC={(val, type) => navigate(`/incidents/${incidentId}/ioc-matches`)}
                />
            )}

            {compareEvents && (
                <ComparePanel 
                    events={compareEvents}
                    knownHosts={timelineData?.hosts ?? []}
                    onClose={() => setCompareEvents(null)}
                    onFilterSearch={(q) => { setSearchInput(q); setPage(1); }}
                />
            )}
        </AppLayout>
    );
}
