import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

export interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

interface TerminalLogProps {
  entries: LogEntry[];
  className?: string;
  autoScroll?: boolean;
}

export function TerminalLog({ entries, className, autoScroll = true }: TerminalLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "terminal-output relative overflow-auto max-h-[400px] scanlines",
        className
      )}
    >
      {entries.map((entry, index) => (
        <div key={index} className="flex gap-2">
          <span className="timestamp text-muted-foreground shrink-0">
            [{entry.timestamp}]
          </span>
          <span className={entry.level}>{entry.message}</span>
        </div>
      ))}
      <span className="inline-block w-2 h-4 bg-primary cursor-blink ml-1" />
    </div>
  );
}
