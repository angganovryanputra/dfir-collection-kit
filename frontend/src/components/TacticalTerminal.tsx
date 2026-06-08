import React, { useState, useEffect, useRef } from "react";
import { Terminal, ChevronUp, ChevronDown, X, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export const TacticalTerminal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Simulate real-time logs for atmosphere
  useEffect(() => {
    const initialLogs: LogEntry[] = [
      { id: "1", timestamp: new Date().toISOString(), message: "INITIALIZING TACTICAL HUD...", type: "info" },
      { id: "2", timestamp: new Date().toISOString(), message: "ESTABLISHING SECURE AGENT CHANNEL...", type: "info" },
      { id: "3", timestamp: new Date().toISOString(), message: "CHANNEL VERIFIED: AES-256-GCM ACTIVE", type: "success" },
    ];
    setLogs(initialLogs);

    const messages = [
      { msg: "HEARTBEAT RECEIVED FROM COLLECTOR-01", type: "info" },
      { msg: "STORAGE INTEGRITY CHECK: 100% OK", type: "success" },
      { msg: "NEW AUDIT LOG ENTRY RECORDED", type: "info" },
      { msg: "POLLING FOR NEW INCIDENT JOBS...", type: "info" },
      { msg: "MEMORY USAGE STABLE: 4.2GB", type: "info" },
    ];

    const interval = setInterval(() => {
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      setLogs((prev) => [
        ...prev.slice(-49),
        {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          message: randomMsg.msg,
          type: randomMsg.type as any,
        },
      ]);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-10 right-10 z-50 p-3 bg-card border border-primary/40 text-primary shadow-glow-green hover:bg-primary/10 transition-all flex items-center gap-2 font-mono text-xs uppercase tracking-widest"
      >
        <Terminal className="w-4 h-4" />
        <span className="animate-pulse">Open Terminal HUD</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-10 right-10 z-50 border border-primary/40 bg-card/95 backdrop-blur-xl shadow-2xl transition-all flex flex-col font-mono",
        isExpanded ? "w-[600px] h-[400px]" : "w-[400px] h-[250px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold tracking-tighter text-muted-foreground uppercase">
            System Tactical Feed
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsExpanded(!isExpanded)} className="text-muted-foreground hover:text-foreground">
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-destructive">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Log Feed */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto p-3 text-[10px] space-y-1 scrollbar-hide scanlines"
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2">
            <span className="text-muted-foreground/50 shrink-0">
              [{new Date(log.timestamp).toLocaleTimeString()}]
            </span>
            <span className={cn(
              "break-all",
              log.type === "success" ? "text-primary" : 
              log.type === "error" ? "text-destructive" : 
              log.type === "warning" ? "text-warning" : "text-foreground"
            )}>
              {log.message}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="text-primary animate-pulse">{">"}</span>
          <span className="w-1.5 h-3 bg-primary/60 cursor-blink" />
        </div>
      </div>

      {/* Footer Decoration */}
      <div className="px-3 py-1 flex items-center justify-between border-t border-border/50 bg-secondary/20">
        <span className="text-[8px] text-muted-foreground uppercase tracking-widest">
          Auth: Encrypted | Buffer: Active
        </span>
        <div className="flex gap-1">
            {[1, 2, 3].map(i => (
                <div key={i} className="w-1 h-1 bg-primary/40 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
        </div>
      </div>
    </div>
  );
};
