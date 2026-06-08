import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { DecryptedText } from "@/components/DecryptedText";

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
    online: "bg-status-online shadow-[0_0_5px_hsl(var(--status-online))]",
    offline: "bg-status-offline",
    warning: "bg-status-pending shadow-[0_0_5px_hsl(var(--status-pending))]",
    active: "bg-status-online animate-pulse-glow shadow-[0_0_8px_hsl(var(--status-online))]",
    locked: "bg-status-locked",
    verified: "bg-status-verified shadow-[0_0_5px_hsl(var(--status-verified))]",
  };

  return (
    <div className={cn("border border-border bg-card/40 backdrop-blur-sm relative group", className)}>
      <div className="panel-header flex items-center gap-2">
        {status && (
          <span
            className={cn("w-1.5 h-1.5 rounded-full", statusColors[status])}
          />
        )}
        <span className="flex-1 font-bold">
          <DecryptedText text={title} />
        </span>
        {headerActions}
      </div>
      <div className="p-4 relative z-10">{children}</div>
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-primary/40 group-hover:border-primary transition-colors" />
      <div className="absolute top-0 right-0 w-1 h-1 border-t border-r border-primary/40 group-hover:border-primary transition-colors" />
      <div className="absolute bottom-0 left-0 w-1 h-1 border-b border-l border-primary/40 group-hover:border-primary transition-colors" />
      <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-primary/40 group-hover:border-primary transition-colors" />
    </div>
  );
}
