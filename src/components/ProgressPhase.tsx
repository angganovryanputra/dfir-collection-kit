import { cn } from "@/lib/utils";
import { Check, Loader2, Circle } from "lucide-react";

interface Phase {
  id: string;
  name: string;
  status: "pending" | "active" | "complete" | "error";
  progress?: number;
}

interface ProgressPhaseProps {
  phases: Phase[];
  className?: string;
}

export function ProgressPhase({ phases, className }: ProgressPhaseProps) {
  const getStatusIcon = (status: Phase["status"]) => {
    switch (status) {
      case "complete":
        return <Check className="w-4 h-4 text-primary" />;
      case "active":
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case "error":
        return <Circle className="w-4 h-4 text-destructive fill-destructive" />;
      default:
        return <Circle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: Phase["status"]) => {
    switch (status) {
      case "complete":
        return "text-primary";
      case "active":
        return "text-foreground";
      case "error":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {phases.map((phase) => (
        <div key={phase.id} className="space-y-1">
          <div className="flex items-center gap-3">
            {getStatusIcon(phase.status)}
            <span
              className={cn(
                "font-mono text-sm uppercase tracking-wider flex-1",
                getStatusColor(phase.status)
              )}
            >
              {phase.name}
            </span>
            {phase.status === "active" && phase.progress !== undefined && (
              <span className="font-mono text-xs text-primary">
                {phase.progress}%
              </span>
            )}
          </div>
          {phase.status === "active" && phase.progress !== undefined && (
            <div className="ml-7 h-1 bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${phase.progress}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
