import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  value: ReactNode;
  label: ReactNode;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
}

export function StatCard({
  icon,
  value,
  label,
  className,
  valueClassName,
  labelClassName,
}: StatCardProps) {
  return (
    <div className={cn("border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between mb-2">
        {icon}
        <span
          className={cn("font-mono text-3xl font-bold", valueClassName)}
        >
          {value}
        </span>
      </div>
      <div
        className={cn(
          "font-mono text-xs text-muted-foreground uppercase",
          labelClassName
        )}
      >
        {label}
      </div>
    </div>
  );
}
