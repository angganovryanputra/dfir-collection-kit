import React from "react";
import { cn } from "@/lib/utils";
import { 
  Clock, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Lock, 
  ShieldCheck,
  Activity,
  AlertCircle
} from "lucide-react";

export type StatusType = 
  | "pending" 
  | "running" 
  | "complete" 
  | "failed" 
  | "locked" 
  | "verified" 
  | "active" 
  | "idle";

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
}

/**
 * Unified badge for incident, job, agent, and evidence status.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className,
  iconOnly = false,
}) => {
  const s = status.toLowerCase();
  const displayLabel = label || status.toUpperCase().replace(/_/g, " ");

  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    pending: {
      color: "border-border/40 bg-secondary/30 text-muted-foreground",
      icon: <Clock className="w-3 h-3" />,
    },
    running: {
      color: "border-primary/50 bg-primary/10 text-primary animate-pulse",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    active: {
      color: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
      icon: <Activity className="w-3 h-3" />,
    },
    complete: {
      color: "border-green-500/40 bg-green-500/10 text-green-400",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    verified: {
      color: "border-green-500/60 bg-green-500/20 text-green-400 shadow-[0_0_8px_rgba(34,197,94,0.2)]",
      icon: <ShieldCheck className="w-3 h-3" />,
    },
    failed: {
      color: "border-destructive/40 bg-destructive/10 text-destructive",
      icon: <XCircle className="w-3 h-3" />,
    },
    locked: {
      color: "border-primary/40 bg-secondary/50 text-primary/80",
      icon: <Lock className="w-3 h-3" />,
    },
    idle: {
      color: "border-border/20 bg-secondary/10 text-muted-foreground/60",
      icon: <AlertCircle className="w-3 h-3 opacity-40" />,
    },
  };

  const current = config[s] || config.pending;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[9px] font-bold tracking-wider",
        current.color,
        className
      )}
    >
      {current.icon}
      {!iconOnly && <span>{displayLabel}</span>}
    </div>
  );
};
