import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface TableHeaderRowProps {
  children: ReactNode;
  className?: string;
}

export function TableHeaderRow({ children, className }: TableHeaderRowProps) {
  return (
    <div
      className={cn(
        "px-4 py-3 font-mono text-xs text-muted-foreground uppercase tracking-wider border-b border-border",
        className
      )}
    >
      {children}
    </div>
  );
}
