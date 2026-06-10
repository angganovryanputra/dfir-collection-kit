import React, { Component, ReactNode, ErrorInfo } from "react";
import { AlertCircle, RefreshCw, Home, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Per-page error boundary to contain crashes and offer tactical recovery options.
 */
export class PageErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[PageErrorBoundary] Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = () => {
    window.location.href = "/dashboard";
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-12 text-center bg-card/50 rounded-sm border border-destructive/20 m-6">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-destructive/10 blur-2xl rounded-full" />
            <ShieldAlert className="w-16 h-16 text-destructive relative z-10" />
          </div>
          
          <h2 className="font-mono text-sm font-bold text-foreground uppercase tracking-[0.3em] mb-2">
            Module Exception Detected
          </h2>
          
          <p className="text-xs text-muted-foreground font-medium mb-8 max-w-md leading-relaxed">
            The analyst workspace encountered a critical error during component rendering. 
            Local state may be corrupted.
          </p>

          <div className="bg-background border border-border/40 p-4 rounded-sm mb-8 w-full max-w-xl text-left font-mono text-[10px] text-destructive/80 overflow-auto max-h-40 whitespace-pre-wrap break-all">
            {this.state.error?.name}: {this.state.error?.message}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button 
              variant="tactical" 
              size="sm" 
              onClick={this.handleReset}
              className="gap-2 h-9 px-6 font-mono text-[10px] tracking-widest"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              HOT RELOAD
            </Button>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={this.handleGoHome}
              className="gap-2 h-9 px-6 border-border/60 font-mono text-[10px] tracking-widest"
            >
              <Home className="w-3.5 h-3.5" />
              RETURN TO BASE
            </Button>
          </div>
          
          <div className="mt-8 pt-8 border-t border-border/20 w-full max-w-md">
            <div className="text-[9px] text-muted-foreground/40 uppercase tracking-tighter">
              Telemetry recorded. Incident ID: {Math.random().toString(36).slice(2, 11).toUpperCase()}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
