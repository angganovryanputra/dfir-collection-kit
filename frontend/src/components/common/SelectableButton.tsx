import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface SelectableButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isActive: boolean;
  children: ReactNode;
  activeClassName?: string;
  inactiveClassName?: string;
}

export function SelectableButton({
  isActive,
  children,
  className,
  activeClassName = "border-primary bg-primary/10 text-primary",
  inactiveClassName =
    "border-border bg-secondary text-muted-foreground hover:border-muted-foreground",
  ...props
}: SelectableButtonProps) {
  return (
    <button
      className={cn(
        "border font-mono text-xs uppercase tracking-wider transition-all",
        className,
        isActive ? activeClassName : inactiveClassName
      )}
      {...props}
    >
      {children}
    </button>
  );
}
