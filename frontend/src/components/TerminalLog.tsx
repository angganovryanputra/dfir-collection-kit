import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, memo, useMemo } from "react";
import { Trash2, AlertCircle } from "lucide-react";

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

// ─── Memoized Log Entry ──────────────────────────────────────────────────────

const LogLine = memo(({ entry }: { entry: LogEntry }) => (
    <div 
        className="flex gap-2 py-0.5" 
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 20px" }}
    >
        <span className="timestamp text-muted-foreground shrink-0 select-none text-[10px]">
            [{entry.timestamp}]
        </span>
        <span className={cn("break-all whitespace-pre-wrap", entry.level)}>
            {entry.message}
        </span>
    </div>
));
LogLine.displayName = "LogLine";

// ─── Main Component ─────────────────────────────────────────────────────────

export function TerminalLog({
  entries,
  className,
  autoScroll = true,
  searchable = false,
}: TerminalLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const [isPaused, setIsPaused] = useState(false);

  // Keep a local buffer to allow 'Clear' UX without changing parent state
  const [clearedBefore, setClearedBefore] = useState(-1);

  const displayedBuffer = useMemo(() => {
    const startIdx = clearedBefore + 1;
    let pool = entries.slice(startIdx);
    
    // Limit DOM weight to last 1000 lines for performance
    if (pool.length > 1000) {
        pool = pool.slice(-1000);
    }

    if (!filter) return pool;
    const f = filter.toLowerCase();
    return pool.filter((e) => e.message.toLowerCase().includes(f));
  }, [entries, filter, clearedBefore]);

  const handleClear = () => {
    setClearedBefore(entries.length - 1);
    setFilter("");
  };

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll && !filter && !isPaused && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedBuffer.length, autoScroll, filter, isPaused]);

  return (
    <div className={cn("flex flex-col min-h-0 bg-background/50 border border-border/40 rounded-sm", className)}>
      <div className="flex items-center justify-between px-2 py-1 border-b border-border/30 bg-secondary/20 shrink-0">
        <div className="flex items-center gap-3 flex-1">
            {searchable ? (
              <div className="flex-1 max-w-xs relative">
                <input
                    className="w-full bg-transparent text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                    placeholder="FILTER LOGS..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            ) : (
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" /> Console Output
                </span>
            )}
        </div>
        
        <div className="flex items-center gap-3">
            {filter && (
                <span className="text-[10px] font-mono text-primary/70 uppercase">
                    Matches: {displayedBuffer.length}
                </span>
            )}
            <button
                onClick={() => setIsPaused(!isPaused)}
                className={cn(
                    "font-mono text-[9px] px-1.5 py-0.5 border rounded-sm transition-all",
                    isPaused ? "bg-primary/20 border-primary text-primary" : "border-border/60 text-muted-foreground hover:border-border"
                )}
            >
                {isPaused ? "RESUME" : "PAUSE"}
            </button>
            <button
                onClick={handleClear}
                className="text-muted-foreground hover:text-destructive transition-colors p-1"
                title="Clear view"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onWheel={() => { if (autoScroll) setIsPaused(true); }}
        className="terminal-output relative overflow-y-auto flex-1 min-h-0 p-2 font-mono text-[11px] leading-relaxed scrollbar-hide"
      >
        {displayedBuffer.length === 0 && entries.length > 0 && (
          <div className="text-muted-foreground/50 italic py-2">
            {filter ? "No entries match search criteria." : "Logs cleared."}
          </div>
        )}
        
        {displayedBuffer.map((entry, idx) => (
          <LogLine key={`${entry.timestamp}-${idx}`} entry={entry} />
        ))}
        
        {!isPaused && autoScroll && (
            <div className="flex items-center gap-2 mt-1">
                <span className="w-1.5 h-3 bg-primary/60 cursor-blink" />
                <span className="text-[9px] text-primary/40 animate-pulse uppercase tracking-tighter">Streaming Active</span>
            </div>
        )}
      </div>
    </div>
  );
}
