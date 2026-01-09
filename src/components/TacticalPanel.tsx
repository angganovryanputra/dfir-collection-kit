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
    online: "bg-status-online",
    offline: "bg-status-offline",
    warning: "bg-status-pending",
    active: "bg-status-online animate-pulse-glow",
    locked: "bg-status-locked",
    verified: "bg-status-verified",
  };

  return (
    <div className={cn("border border-border bg-card", className)}>
      <div className="panel-header">
        {status && (
          <span
            className={cn("w-2 h-2", statusColors[status])}
          />
        )}
        <span className="flex-1">{title}</span>
        {headerActions}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
