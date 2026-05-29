import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

export interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

interface TerminalLogProps {
  entries: LogEntry[];
  className?: string;
  autoScroll?: boolean;
  /** Show a filter input above the log (default false). */
  searchable?: boolean;
}

export function TerminalLog({
  entries,
  className,
  autoScroll = true,
  searchable = false,
}: TerminalLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");

  const displayed = filter
    ? entries.filter((e) => e.message.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  // Auto-scroll to bottom whenever entries change (unless user has filtered)
  useEffect(() => {
    if (autoScroll && !filter && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, autoScroll, filter]);

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      {searchable && (
        <div className="flex items-center gap-2 px-2 py-1 border-b border-border/30 shrink-0">
          <input
            className="flex-1 bg-transparent text-xs font-mono text-muted-foreground/70 placeholder:text-muted-foreground/40 focus:outline-none"
            placeholder="Filter log..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setFilter("")}
            >
              ✕ {displayed.length}/{entries.length}
            </button>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className="terminal-output relative overflow-y-auto flex-1 min-h-0 scanlines"
      >
        {displayed.length === 0 && entries.length > 0 && (
          <div className="text-muted-foreground text-xs font-mono px-1">No entries match filter.</div>
        )}
        {displayed.map((entry, index) => (
          <div key={index} className="flex gap-2">
            <span className="timestamp text-muted-foreground shrink-0 select-none">
              [{entry.timestamp}]
            </span>
            <span className={entry.level}>{entry.message}</span>
          </div>
        ))}
        <span className="inline-block w-2 h-4 bg-primary cursor-blink ml-1" />
      </div>
    </div>
  );
}
