import React from "react";
import { 
    LayoutGrid, Bookmark as BookmarkIcon, Download, Check, Settings2, Trash2, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
    ColumnKey, OPTIONAL_COLS
} from "./SuperTimelineTypes";
import { cn } from "@/lib/utils";

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
    visibleCols, toggleCol, showBookmarks, setShowBookmarks, bookmarkCount, onExport, isExporting, activeFilterCount, totalEvents
}: SuperTimelineToolbarProps) {
    const [showColPicker, setShowColPicker] = React.useState(false);

    return (
        <div className="flex items-center justify-between gap-4 py-2 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Button
                        variant={showBookmarks ? "tactical" : "ghost"}
                        size="sm"
                        onClick={() => setShowBookmarks(!showBookmarks)}
                        className="h-8 gap-2 font-mono text-[10px]"
                    >
                        <BookmarkIcon className={cn("w-3.5 h-3.5", bookmarkCount > 0 && !showBookmarks && "fill-primary text-primary")} />
                        BOOKMARKS ({bookmarkCount})
                    </Button>

                    <div className="relative">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowColPicker(!showColPicker)}
                            className={cn("h-8 gap-2 font-mono text-[10px]", showColPicker && "bg-secondary text-foreground")}
                        >
                            <Settings2 className="w-3.5 h-3.5" />
                            COLUMNS
                        </Button>
                        {showColPicker && (
                            <div className="absolute top-10 left-0 z-50 w-56 border border-border bg-card shadow-xl p-3 font-mono text-[10px] space-y-1 rounded-sm">
                                <div className="text-muted-foreground uppercase tracking-wider border-b border-border/40 pb-1 mb-2">Display Columns</div>
                                {OPTIONAL_COLS.map((col) => (
                                    <button
                                        key={col.key}
                                        onClick={() => toggleCol(col.key)}
                                        className="flex items-center justify-between w-full p-1.5 hover:bg-secondary/50 rounded-sm transition-colors text-left"
                                    >
                                        <span className={visibleCols.has(col.key) ? "text-foreground" : "text-muted-foreground"}>{col.label}</span>
                                        {visibleCols.has(col.key) && <Check className="w-3 h-3 text-primary" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="h-4 w-[1px] bg-border/40 hidden md:block" />

                <div className="hidden md:flex items-center gap-3 font-mono text-[10px]">
                    <span className="text-muted-foreground uppercase tracking-tighter">Matches:</span>
                    <span className="text-primary font-bold">{totalEvents.toLocaleString()}</span>
                    {activeFilterCount > 0 && (
                        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm border border-primary/20 flex items-center gap-1">
                            <Filter className="w-2.5 h-2.5" />
                            FILTERED
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2">
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
