import React, { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Loader2, Inbox, AlertTriangle } from "lucide-react";

export interface ColumnDef<T> {
  id: string;
  header: string | React.ReactNode;
  cell: (item: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  error?: unknown;
  emptyMessage?: string;
  onRowClick?: (item: T, index: number) => void;
  rowClassName?: (item: T, index: number) => string;
  className?: string;
}

/**
 * Reusable data table with loading, error, and empty states.
 * Note: For massive datasets (1k+ rows), use a virtualized variant.
 */
export function DataTable<T>({
  data,
  columns,
  loading = false,
  error,
  emptyMessage = "No data available in this sector.",
  onRowClick,
  rowClassName,
  className,
}: DataTableProps<T>) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-destructive/5 border border-dashed border-destructive/20 rounded-sm">
        <AlertTriangle className="w-10 h-10 text-destructive/40 mb-4" />
        <div className="font-mono text-xs text-destructive uppercase tracking-widest mb-1">
          Data Acquisition Failure
        </div>
        <div className="text-[10px] text-muted-foreground max-w-xs">
          The telemetry stream could not be established. Check network or permissions.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-auto custom-scrollbar border border-border/40 bg-card/30", className)}>
      <Table>
        <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-20">
          <TableRow className="border-b border-border/60 hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.id}
                className={cn(
                  "font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground h-10 px-4",
                  col.headerClassName
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-40 text-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
                  <span className="font-mono text-[10px] text-primary/40 uppercase tracking-[0.3em] animate-pulse">
                    Scanning Storage Sector...
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-40 text-center">
                <div className="flex flex-col items-center gap-3 opacity-30">
                  <Inbox className="w-8 h-8 text-muted-foreground" />
                  <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                    {emptyMessage}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            data.map((item, idx) => (
              <TableRow
                key={idx}
                onClick={() => onRowClick?.(item, idx)}
                className={cn(
                  "border-b border-border/5 transition-colors group",
                  onRowClick && "cursor-pointer hover:bg-secondary/40",
                  rowClassName?.(item, idx)
                )}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.id}
                    className={cn("px-4 py-2.5 text-xs", col.className)}
                  >
                    {col.cell(item, idx)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
