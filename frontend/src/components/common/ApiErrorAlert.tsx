import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiError {
  status?: number;
  code?: string;
  message?: string;
  detail?: string;
}

interface ApiErrorAlertProps {
  error: unknown;
  title?: string;
  className?: string;
}

/**
 * Safely renders normalized API errors without leaking sensitive internals.
 */
export const ApiErrorAlert: React.FC<ApiErrorAlertProps> = ({
  error,
  title = "System Error",
  className,
}) => {
  if (!error) return null;

  let message = "An unexpected error occurred. Please contact an administrator.";
  let code = "UNKNOWN_ERROR";
  let status: number | undefined;

  // Try to parse the error
  try {
    if (typeof error === "string") {
      try {
        const parsed = JSON.parse(error) as ApiError;
        message = parsed.detail || parsed.message || message;
        code = parsed.code || code;
        status = parsed.status;
      } catch {
        message = error;
      }
    } else if (error instanceof Error) {
      try {
        const parsed = JSON.parse(error.message) as ApiError;
        message = parsed.detail || parsed.message || message;
        code = parsed.code || code;
        status = parsed.status;
      } catch {
        message = error.message;
      }
    } else if (typeof error === "object" && error !== null) {
      const e = error as ApiError;
      message = e.detail || e.message || message;
      code = e.code || code;
      status = e.status;
    }
  } catch {
    // Fallback to defaults
  }

  // Sanitize message to prevent long stack traces or raw HTML leaks
  if (message.length > 500) {
    message = message.slice(0, 500) + "... (truncated)";
  }

  return (
    <Alert variant="destructive" className={cn("bg-destructive/10 border-destructive/30", className)}>
      <XCircle className="h-4 w-4" />
      <AlertTitle className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2 text-destructive">
        {title}
        {status && <span className="opacity-50 text-[8px]">[HTTP {status}]</span>}
      </AlertTitle>
      <AlertDescription className="font-mono text-xs leading-relaxed text-destructive-foreground/90">
        <div className="flex items-start gap-2">
          <Terminal className="w-3 h-3 mt-0.5 shrink-0 opacity-40" />
          <span className="break-all">{message}</span>
        </div>
        {code !== "UNKNOWN_ERROR" && (
          <div className="mt-2 text-[9px] opacity-40 uppercase tracking-tighter">
            REF_CODE: {code}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};
