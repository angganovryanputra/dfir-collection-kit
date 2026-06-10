import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface TacticalPanelProps {
  title: string;
  children: ReactNode;
  className?: string;
  headerActions?: ReactNode;
  status?: "online" | "offline" | "warning" | "active" | "locked" | "verified";
}

export function TacticalPanel({
  title,
  children,
  className,
  headerActions,
  status,
}: TacticalPanelProps) {
  const statusColors = {
    online: "bg-status-online shadow-[0_0_8px_rgba(21,245,116,0.5)]",
    offline: "bg-status-offline shadow-[0_0_8px_rgba(239,68,68,0.5)]",
    warning: "bg-status-pending shadow-[0_0_8px_rgba(245,158,11,0.5)]",
    active: "bg-status-online animate-pulse shadow-[0_0_10px_rgba(21,245,116,0.6)]",
    locked: "bg-status-locked",
    verified: "bg-status-verified shadow-[0_0_8px_rgba(34,197,94,0.5)]",
  };

  return (
    <div className={cn("border border-border bg-card relative overflow-hidden group", className)}>
      {/* Subtle Scan-line Animation */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03] bg-gradient-to-b from-transparent via-primary to-transparent h-[200%] animate-scan-line" />
      
      {/* Corner Accents */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/40 z-10" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/40 z-10" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-primary/40 z-10" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/40 z-10" />

      <div className="panel-header flex items-center justify-between relative z-20">
        <div className="flex items-center gap-2">
            {status && (
              <span
                className={cn("w-1.5 h-1.5 rounded-full transition-all duration-500", statusColors[status])}
              />
            )}
            <span className="flex-1 font-mono text-[11px] font-bold tracking-widest uppercase">
              {title}
            </span>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <div className="w-1 h-3 bg-primary/20 rounded-full ml-1" />
        </div>
      </div>
      <div className="p-4 relative z-20">{children}</div>
    </div>
  );
}
