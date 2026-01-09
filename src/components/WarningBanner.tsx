import { AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface WarningBannerProps {
  variant?: "warning" | "critical";
  children: React.ReactNode;
  className?: string;
}

export function WarningBanner({
  variant = "warning",
  children,
  className,
}: WarningBannerProps) {
  const Icon = variant === "critical" ? ShieldAlert : AlertTriangle;

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        variant === "warning" ? "warning-banner" : "critical-banner",
        className
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{children}</span>
    </div>
  );
}
