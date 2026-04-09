import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import React, { Component } from "react";
import { getStoredAuth } from "@/lib/auth";
import AdminSettings from "./pages/AdminSettings";
import ChainOfCustody from "./pages/ChainOfCustody";
import CollectionExecution from "./pages/CollectionExecution";
import CollectionSetup from "./pages/CollectionSetup";
import CreateIncident from "./pages/CreateIncident";
import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import EvidenceVault from "./pages/EvidenceVault";
import IncidentTemplates from "./pages/IncidentTemplates";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import ProcessingStatus from "./pages/ProcessingStatus";
import SigmaHits from "./pages/SigmaHits";
import AttackChains from "./pages/AttackChains";
import IOCMatches from "./pages/IOCMatches";
import YaraMatches from "./pages/YaraMatches";
import SuperTimeline from "./pages/SuperTimeline";
import IncidentHub from "./pages/IncidentHub";
import IncidentReport from "./pages/IncidentReport";
import Collectors from "./pages/Collectors";
import UserManagement from "./pages/UserManagement";

const queryClient = new QueryClient();

/** Redirects unauthenticated users to /login before rendering the page.
 *  Passes the original path via router state so Login can redirect back after auth. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = getStoredAuth();
  const location = useLocation();
  if (!auth?.token) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}

type ErrorBoundaryProps = { children: React.ReactNode };
type ErrorBoundaryState = { error: Error | null };

/** Global last-resort boundary — wraps the entire app including the Router.
 *  Navigation uses window.location since React Router context may be unavailable. */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    console.error("[ErrorBoundary] Caught error:", error);
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Component did catch:", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "40px", color: "white", backgroundColor: "#09090b", fontFamily: "monospace", minHeight: "100vh" }}>
          <div style={{ color: "#dc2626", marginBottom: "8px", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            Critical Application Error
          </div>
          <div style={{ marginBottom: "16px", fontSize: "14px", color: "#a1a1aa" }}>
            {this.state.error.message}
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "8px 16px", border: "1px solid #3f3f46", background: "transparent", color: "white", cursor: "pointer", fontSize: "11px", letterSpacing: "0.1em" }}
            >
              RELOAD
            </button>
            <button
              onClick={() => { window.location.href = "/dashboard"; }}
              style={{ padding: "8px 16px", border: "1px solid #3f3f46", background: "transparent", color: "white", cursor: "pointer", fontSize: "11px", letterSpacing: "0.1em" }}
            >
              GO TO DASHBOARD
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Per-page boundary — catches errors in individual page components.
 *  Offers retry (resets state) and navigation to dashboard. */
class PageBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    console.error("[PageBoundary] Caught error:", error);
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[PageBoundary] Component did catch:", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 font-mono text-center">
          <div className="text-destructive text-xs uppercase tracking-widest">Page Error</div>
          <div className="text-xs text-muted-foreground max-w-sm">{this.state.error.message}</div>
          <div className="flex gap-3 mt-2">
            <button
              className="px-4 py-2 text-xs border border-border bg-transparent text-foreground hover:bg-secondary transition-colors cursor-pointer"
              onClick={() => this.setState({ error: null })}
            >
              RETRY
            </button>
            <button
              className="px-4 py-2 text-xs border border-border bg-transparent text-foreground hover:bg-secondary transition-colors cursor-pointer"
              onClick={() => { window.location.href = "/dashboard"; }}
            >
              GO TO DASHBOARD
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Resets the per-page boundary when navigating to a different route. */
function RouteBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <PageBoundary key={location.pathname}>{children}</PageBoundary>;
}

const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />

                {/* Protected routes — each wrapped in its own error boundary so a single
                    page crash is contained and the user can navigate away. */}
                <Route path="/dashboard" element={<ProtectedRoute><RouteBoundary><Dashboard /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/create" element={<ProtectedRoute><RouteBoundary><CreateIncident /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id" element={<ProtectedRoute><RouteBoundary><IncidentHub /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/setup" element={<ProtectedRoute><RouteBoundary><CollectionSetup /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/collect" element={<ProtectedRoute><RouteBoundary><CollectionExecution /></RouteBoundary></ProtectedRoute>} />
                <Route path="/evidence" element={<ProtectedRoute><RouteBoundary><EvidenceVault /></RouteBoundary></ProtectedRoute>} />
                <Route path="/evidence/:id" element={<ProtectedRoute><RouteBoundary><EvidenceVault /></RouteBoundary></ProtectedRoute>} />
                <Route path="/chain-of-custody" element={<ProtectedRoute><RouteBoundary><ChainOfCustody /></RouteBoundary></ProtectedRoute>} />
                <Route path="/collectors" element={<ProtectedRoute><RouteBoundary><Collectors /></RouteBoundary></ProtectedRoute>} />
                <Route path="/devices" element={<ProtectedRoute><RouteBoundary><Devices /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incident-templates" element={<ProtectedRoute><RouteBoundary><IncidentTemplates /></RouteBoundary></ProtectedRoute>} />
                <Route path="/admin/settings" element={<ProtectedRoute><RouteBoundary><AdminSettings /></RouteBoundary></ProtectedRoute>} />
                <Route path="/admin/users" element={<ProtectedRoute><RouteBoundary><UserManagement /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/processing" element={<ProtectedRoute><RouteBoundary><ProcessingStatus /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/sigma-hits" element={<ProtectedRoute><RouteBoundary><SigmaHits /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/attack-chains" element={<ProtectedRoute><RouteBoundary><AttackChains /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/ioc-matches" element={<ProtectedRoute><RouteBoundary><IOCMatches /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/yara-matches" element={<ProtectedRoute><RouteBoundary><YaraMatches /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/super-timeline" element={<ProtectedRoute><RouteBoundary><SuperTimeline /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/report" element={<ProtectedRoute><RouteBoundary><IncidentReport /></RouteBoundary></ProtectedRoute>} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
