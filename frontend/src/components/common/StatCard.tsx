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
    <div className={cn(
      "border border-border bg-card p-4 transition-all duration-300 transition-spring relative overflow-hidden group hover:scale-[1.02] hover:border-primary/30 hover:shadow-[0_0_15px_rgba(21,245,116,0.08)]",
      className
    )}>
      {/* Decorative top accent line that slides in on hover */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-primary/80 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 transition-spring origin-left" />
      
      <div className="flex items-center justify-between mb-2">
        <div className="transition-transform duration-300 transition-spring group-hover:scale-110">
          {icon}
        </div>
        <span
          className={cn("font-mono text-3xl font-bold tracking-tight text-foreground transition-all duration-300 group-hover:text-glow-green", valueClassName)}
        >
          {value}
        </span>
      </div>
      <div
        className={cn(
          "font-mono text-xs text-muted-foreground uppercase tracking-wider transition-colors duration-300 group-hover:text-foreground/80",
          labelClassName
        )}
      >
        {label}
      </div>
    </div>
  );
}
