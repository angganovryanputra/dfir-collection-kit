import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface KeyValueRowProps {
  label: ReactNode;
  value: ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

export function KeyValueRow({
  label,
  value,
  className,
  labelClassName,
  valueClassName,
}: KeyValueRowProps) {
  return (
    <div className={cn("flex justify-between", className)}>
      <span className={cn("text-muted-foreground", labelClassName)}>{label}</span>
      <span className={cn("text-foreground", valueClassName)}>{value}</span>
    </div>
  );
}
