import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";

interface SafeTextProps {
  text: string | null | undefined;
  monospace?: boolean;
  truncate?: number;
  showCopy?: boolean;
  preserveLineBreaks?: boolean;
  className?: string;
}

/**
 * Safely renders untrusted text from forensic artifacts.
 * Prevents XSS by avoiding dangerouslySetInnerHTML and enforcing text-only nodes.
 */
export const SafeText: React.FC<SafeTextProps> = ({
  text,
  monospace = false,
  truncate,
  showCopy = false,
  preserveLineBreaks = true,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  if (!text) return <span className="text-muted-foreground/40">—</span>;

  let displayRef = text;
  if (truncate && displayRef.length > truncate) {
    displayRef = displayRef.slice(0, truncate) + "...";
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("relative group/safetext inline-flex items-center gap-2 max-w-full", className)}>
      <span
        className={cn(
          "max-w-full",
          monospace && "font-mono",
          preserveLineBreaks && "whitespace-pre-wrap break-all",
          !preserveLineBreaks && "truncate"
        )}
      >
        {displayRef}
      </span>
      {showCopy && (
        <button
          onClick={handleCopy}
          className="shrink-0 p-1 opacity-0 group-hover/safetext:opacity-100 transition-opacity hover:bg-secondary rounded-sm"
          title="Copy full text"
        >
          {copied ? (
            <Check className="w-3 h-3 text-green-500" />
          ) : (
            <Copy className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      )}
    </div>
  );
};
