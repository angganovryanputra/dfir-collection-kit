import { cn } from "@/lib/utils";
import type { LabelHTMLAttributes, ReactNode } from "react";

interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
}

export function FormLabel({ children, className, ...props }: FormLabelProps) {
  return (
    <label
      className={cn(
        "font-mono text-xs uppercase tracking-wider text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
}
