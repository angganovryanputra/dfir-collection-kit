import React, { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { Loader2, Inbox, AlertTriangle } from "lucide-react";

export interface VirtualColumnDef<T> {
  id: string;
  header: string | React.ReactNode;
  cell: (item: T, index: number) => React.ReactNode;
  width?: string | number;
  className?: string;
  headerClassName?: string;
}

interface VirtualizedDataTableProps<T> {
  data: T[];
  columns: VirtualColumnDef<T>[];
  height?: string | number;
  rowHeight?: number;
  loading?: boolean;
  error?: unknown;
  emptyMessage?: string;
  onRowClick?: (e: React.MouseEvent, item: T, index: number) => void;
  rowClassName?: (item: T, index: number) => string;
  className?: string;
}

/**
 * High-performance virtualized data table for massive forensic datasets.
 * Powered by @tanstack/react-virtual.
 */
export function VirtualizedDataTable<T>({
  data,
  columns,
  height = "600px",
  rowHeight = 40,
  loading = false,
  error,
  emptyMessage = "No data available in this sector.",
  onRowClick,
  rowClassName,
  className,
}: VirtualizedDataTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  const columnWidths = useMemo(() => {
    return columns.map(c => c.width || "1fr");
  }, [columns]);

  const gridTemplateColumns = columnWidths.map(w => (typeof w === "number" ? `${w}px` : w)).join(" ");

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-destructive/5 border border-dashed border-destructive/20 rounded-sm">
        <AlertTriangle className="w-10 h-10 text-destructive/40 mb-4" />
        <div className="font-mono text-xs text-destructive uppercase tracking-widest mb-1">
          Data Acquisition Failure
        </div>
        <div className="text-[10px] text-muted-foreground">
          The telemetry stream could not be established.
        </div>
      </div>
    );
  }

  if (loading && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-card/30 border border-border/40 rounded-sm" style={{ height }}>
        <Loader2 className="w-8 h-8 animate-spin text-primary/40 mb-4" />
        <span className="font-mono text-[10px] text-primary/40 uppercase tracking-[0.3em] animate-pulse">
          Indexing Evidence Stream...
        </span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-card/30 border border-border/40 rounded-sm" style={{ height }}>
        <Inbox className="w-10 h-10 text-muted-foreground/30 mb-4" />
        <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div 
      className={cn("relative border border-border/40 bg-card/20 rounded-sm flex flex-col", className)}
      style={{ height }}
    >
      {/* Header */}
      <div 
        className="grid border-b border-border/60 bg-background/95 backdrop-blur z-20 sticky top-0"
        style={{ gridTemplateColumns }}
      >
        {columns.map((col) => (
          <div
            key={col.id}
            className={cn(
              "font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground h-9 px-4 flex items-center",
              col.headerClassName
            )}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Body */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto custom-scrollbar"
        style={{ contain: "strict" }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = data[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                onClick={(e) => onRowClick?.(e, item, virtualRow.index)}
                className={cn(
                  "absolute top-0 left-0 w-full grid border-b border-border/5 transition-colors group",
                  onRowClick && "cursor-pointer hover:bg-secondary/40",
                  rowClassName?.(item, virtualRow.index)
                )}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns,
                }}
              >
                {columns.map((col) => (
                  <div
                    key={col.id}
                    className={cn("px-4 py-2 text-xs flex items-center min-w-0", col.className)}
                  >
                    {col.cell(item, virtualRow.index)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
