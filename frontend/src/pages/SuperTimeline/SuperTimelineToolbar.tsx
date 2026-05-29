import React from "react";
import { 
    LayoutGrid, Bookmark as BookmarkIcon, Download, Check, Settings2, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
    ColumnKey, OPTIONAL_COLS
} from "./SuperTimelineTypes";

interface SuperTimelineToolbarProps {
    visibleCols: Set<ColumnKey>;
    toggleCol: (k: ColumnKey) => void;
    showBookmarks: boolean;
    setShowBookmarks: (v: boolean) => void;
    bookmarkCount: number;
    onExport: () => void;
    isExporting: boolean;
    activeFilterCount: number;
    totalEvents: number;
}

export function SuperTimelineToolbar({
    visibleCols, toggleCol, showBookmarks, setShowBookmarks, bookmarkCount,
    onExport, isExporting, activeFilterCount, totalEvents
}: SuperTimelineToolbarProps) {
    const [showColPicker, setShowColPicker] = React.useState(false);

    return (
        <div className="flex items-center justify-between gap-4 py-2 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-2">
                <Button
                    variant={showBookmarks ? "tactical" : "ghost"}
                    size="sm"
                    onClick={() => setShowBookmarks(!showBookmarks)}
                    className="h-8 gap-2 font-mono text-[10px]"
                >
                    <BookmarkIcon className={`w-3.5 h-3.5 ${showBookmarks ? "fill-primary" : ""}`} />
                    BOOKMARKS
                    <span className="px-1.5 py-0.5 bg-secondary/50 rounded-sm text-primary">
                        {bookmarkCount}
                    </span>
                </Button>
                <div className="h-4 border-l border-border/40 mx-1" />
                <div className="relative">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowColPicker(!showColPicker)}
                        className={`h-8 gap-2 font-mono text-[10px] ${showColPicker ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                    >
                        <Settings2 className="w-3.5 h-3.5" />
                        COLUMNS
                    </Button>
                    {showColPicker && (
                        <div className="absolute top-10 left-0 z-50 w-48 border border-border bg-card shadow-xl p-2 rounded-sm space-y-1">
                            <div className="text-[10px] text-muted-foreground uppercase font-mono px-2 py-1 border-b border-border/40 mb-1">Toggle Columns</div>
                            {OPTIONAL_COLS.map((col) => (
                                <button
                                    key={col.key}
                                    onClick={() => toggleCol(col.key)}
                                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm hover:bg-secondary transition-colors text-left font-mono text-[10px]"
                                >
                                    <span className={visibleCols.has(col.key) ? "text-foreground" : "text-muted-foreground"}>{col.label}</span>
                                    {visibleCols.has(col.key) && <Check className="w-3 h-3 text-primary" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3">
                {activeFilterCount > 0 && (
                    <div className="font-mono text-[10px] text-primary/70 animate-pulse hidden md:block">
                        {totalEvents.toLocaleString()} EVENTS MATCH FILTERS
                    </div>
                )}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onExport}
                    disabled={isExporting || totalEvents === 0}
                    className="h-8 gap-2 font-mono text-[10px] border-primary/20 text-primary/80 hover:bg-primary/5"
                >
                    <Download className="w-3.5 h-3.5" />
                    {isExporting ? "EXPORTING..." : "EXPORT CSV"}
                </Button>
            </div>
        </div>
    );
}
