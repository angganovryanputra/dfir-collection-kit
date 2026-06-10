import React from "react";
import { cn } from "@/lib/utils";
import { 
  ShieldCheck, 
  Lock, 
  Fingerprint, 
  ShieldAlert,
  FileSignature
} from "lucide-react";

export type IntegrityStatus = 
  | "LOCKED" 
  | "HASH_VERIFIED" 
  | "CHAIN_VERIFIED" 
  | "EXPORT_SIGNED" 
  | "FAILED";

interface EvidenceIntegrityBadgeProps {
  status: IntegrityStatus | string;
  label?: string;
  className?: string;
}

/**
 * Visual indicator for evidence integrity and chain-of-custody.
 */
export const EvidenceIntegrityBadge: React.FC<EvidenceIntegrityBadgeProps> = ({
  status,
  label,
  className,
}) => {
  const s = status.toUpperCase();
  const displayLabel = label || s.replace(/_/g, " ");

  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    LOCKED: {
      color: "border-primary/30 bg-secondary/40 text-primary/70",
      icon: <Lock className="w-3 h-3" />,
    },
    HASH_VERIFIED: {
      color: "border-green-500/40 bg-green-500/10 text-green-400",
      icon: <Fingerprint className="w-3 h-3" />,
    },
    CHAIN_VERIFIED: {
      color: "border-green-500/60 bg-green-500/20 text-green-400 shadow-[0_0_8px_rgba(34,197,94,0.2)]",
      icon: <ShieldCheck className="w-3 h-3" />,
    },
    EXPORT_SIGNED: {
      color: "border-blue-500/40 bg-blue-500/10 text-blue-400",
      icon: <FileSignature className="w-3 h-3" />,
    },
    FAILED: {
      color: "border-destructive/40 bg-destructive/10 text-destructive",
      icon: <ShieldAlert className="w-3 h-3" />,
    },
  };

  const current = config[s] || config.LOCKED;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border font-mono text-[9px] font-bold tracking-tight",
        current.color,
        className
      )}
    >
      {current.icon}
      <span>{displayLabel}</span>
    </div>
  );
};
