import React from "react";
import { cn } from "@/lib/utils";
import { 
  AlertTriangle, 
  ShieldAlert, 
  Info, 
  Shield, 
  Zap 
} from "lucide-react";

export type SeverityType = 
  | "informational" 
  | "low" 
  | "medium" 
  | "high" 
  | "critical";

interface SeverityBadgeProps {
  severity: SeverityType | string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
}

/**
 * Unified severity badge for Sigma, YARA, IOC, and timeline risk.
 */
export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  label,
  className,
  iconOnly = false,
}) => {
  const s = severity.toLowerCase();
  const displayLabel = label || severity.toUpperCase();

  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    informational: {
      color: "border-blue-500/30 bg-blue-500/10 text-blue-400",
      icon: <Info className="w-3 h-3" />,
    },
    low: {
      color: "border-green-500/30 bg-green-500/10 text-green-400",
      icon: <Shield className="w-3 h-3" />,
    },
    medium: {
      color: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    high: {
      color: "border-orange-500/40 bg-orange-500/15 text-orange-400",
      icon: <Zap className="w-3 h-3" />,
    },
    critical: {
      color: "border-destructive/50 bg-destructive/20 text-destructive animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.2)]",
      icon: <ShieldAlert className="w-3 h-3" />,
    },
  };

  const current = config[s] || config.informational;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[9px] font-bold tracking-widest",
        current.color,
        className
      )}
    >
      {current.icon}
      {!iconOnly && <span>{displayLabel}</span>}
    </div>
  );
};
