import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import React, { Component, Suspense } from "react";
import { getStoredAuth } from "@/lib/auth";
import { EvidenceProvider } from "@/context/EvidenceContext";

// Eagerly load only the entry points users hit immediately
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// All protected pages are lazy-loaded — browsers only fetch the chunk when
// the user navigates to that route, cutting initial JS from ~1.2 MB to ~200 KB.
const AdminSettings        = React.lazy(() => import("./pages/AdminSettings"));
const ChainOfCustody       = React.lazy(() => import("./pages/ChainOfCustody"));
const CollectionExecution  = React.lazy(() => import("./pages/CollectionExecution"));
const CollectionSetup      = React.lazy(() => import("./pages/CollectionSetup"));
const CreateIncident       = React.lazy(() => import("./pages/CreateIncident"));
const Dashboard            = React.lazy(() => import("./pages/Dashboard"));
const Devices              = React.lazy(() => import("./pages/Devices"));
const EvidenceVault        = React.lazy(() => import("./pages/EvidenceVault"));
const IncidentTemplates    = React.lazy(() => import("./pages/IncidentTemplates"));
const ProcessingStatus     = React.lazy(() => import("./pages/ProcessingStatus"));
const SigmaHits            = React.lazy(() => import("./pages/SigmaHits"));
const AttackChains         = React.lazy(() => import("./pages/AttackChains"));
const IOCMatches           = React.lazy(() => import("./pages/IOCMatches"));
const YaraMatches          = React.lazy(() => import("./pages/YaraMatches"));
const SuperTimeline        = React.lazy(() => import("./pages/SuperTimeline"));
const IncidentHub          = React.lazy(() => import("./pages/IncidentHub"));
const IncidentReport       = React.lazy(() => import("./pages/IncidentReport"));
const Collectors           = React.lazy(() => import("./pages/Collectors"));
const UserManagement       = React.lazy(() => import("./pages/UserManagement"));
const HypothesisBuilder    = React.lazy(() => import("./pages/HypothesisBuilder"));
const LegalHolds           = React.lazy(() => import("./pages/LegalHolds"));
const ThreatHuntLibrary    = React.lazy(() => import("./pages/ThreatHuntLibrary"));
const CustomModules        = React.lazy(() => import("./pages/CustomModules"));
const CorrelationView      = React.lazy(() => import("./pages/CorrelationView"));
const AuditLog             = React.lazy(() => import("./pages/AuditLog"));
const ScheduledCollections = React.lazy(() => import("./pages/ScheduledCollections"));
const AgentConsole         = React.lazy(() => import("./pages/AgentConsole"));
const ThreatIntel          = React.lazy(() => import("./pages/ThreatIntel"));
const SIEMExport           = React.lazy(() => import("./pages/SIEMExport"));
const AIAnalysis           = React.lazy(() => import("./pages/AIAnalysis"));

/** Tactical loading skeleton — shown while a lazy page chunk is fetching. */
function PageSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest animate-pulse">
          LOADING MODULE…
        </span>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Global staleTime — prevents redundant refetches on every navigation.
      // Individual queries with dynamic data override this with their own value.
      staleTime: 30_000,
      retry: 1,
    },
  },
});

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
            <EvidenceProvider>
            <BrowserRouter>
              <Suspense fallback={<PageSkeleton />}>
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
                <Route path="/incidents/:id/hypotheses" element={<ProtectedRoute><RouteBoundary><HypothesisBuilder /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/legal-holds" element={<ProtectedRoute><RouteBoundary><LegalHolds /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/scheduled" element={<ProtectedRoute><RouteBoundary><ScheduledCollections /></RouteBoundary></ProtectedRoute>} />
                <Route path="/scheduled-collections" element={<ProtectedRoute><RouteBoundary><ScheduledCollections /></RouteBoundary></ProtectedRoute>} />
                <Route path="/threat-hunt" element={<ProtectedRoute><RouteBoundary><ThreatHuntLibrary /></RouteBoundary></ProtectedRoute>} />
                <Route path="/admin/custom-modules" element={<ProtectedRoute><RouteBoundary><CustomModules /></RouteBoundary></ProtectedRoute>} />
                <Route path="/admin/audit-log" element={<ProtectedRoute><RouteBoundary><AuditLog /></RouteBoundary></ProtectedRoute>} />
                <Route path="/correlate" element={<ProtectedRoute><RouteBoundary><CorrelationView /></RouteBoundary></ProtectedRoute>} />
                <Route path="/agents/:agentId/console" element={<ProtectedRoute><RouteBoundary><AgentConsole /></RouteBoundary></ProtectedRoute>} />
                <Route path="/threat-intel" element={<ProtectedRoute><RouteBoundary><ThreatIntel /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/siem-export" element={<ProtectedRoute><RouteBoundary><SIEMExport /></RouteBoundary></ProtectedRoute>} />
                <Route path="/incidents/:id/ai-analysis" element={<ProtectedRoute><RouteBoundary><AIAnalysis /></RouteBoundary></ProtectedRoute>} />

                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </BrowserRouter>
            </EvidenceProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
