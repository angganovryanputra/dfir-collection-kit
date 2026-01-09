import { cn } from "@/lib/utils";

interface StatusIndicatorProps {
  status: "online" | "offline" | "pending" | "locked" | "verified" | "active";
  label?: string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
}

export function StatusIndicator({
  status,
  label,
  size = "md",
  pulse = false,
}: StatusIndicatorProps) {
  const statusConfig = {
    online: { color: "bg-status-online", text: "ONLINE", textColor: "text-status-online" },
    offline: { color: "bg-status-offline", text: "OFFLINE", textColor: "text-status-offline" },
    pending: { color: "bg-status-pending", text: "PENDING", textColor: "text-status-pending" },
    locked: { color: "bg-status-locked", text: "LOCKED", textColor: "text-status-locked" },
    verified: { color: "bg-status-verified", text: "VERIFIED", textColor: "text-status-verified" },
    active: { color: "bg-status-online", text: "ACTIVE", textColor: "text-status-online" },
  };

  const sizes = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-3 h-3",
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          sizes[size],
          config.color,
          pulse && "animate-pulse-glow"
        )}
      />
      <span className={cn("font-mono text-xs uppercase tracking-wider", config.textColor)}>
        {label || config.text}
      </span>
    </div>
  );
}
