import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import React, { Suspense } from "react";
import { getStoredAuth, isSessionValid } from "@/lib/auth";
import { EvidenceProvider } from "@/context/EvidenceContext";
import { PageErrorBoundary } from "@/components/common/PageErrorBoundary";

// Eagerly load only the entry points users hit immediately
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// All protected pages are lazy-loaded
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
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden font-mono">
      {/* Fake Sidebar */}
      <div className="w-64 border-r border-border/40 bg-card/10 flex flex-col shrink-0 p-4 space-y-6">
        <div className="h-8 bg-secondary/30 rounded-sm animate-pulse w-3/4" />
        <div className="space-y-3 flex-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-7 bg-secondary/20 rounded-sm animate-pulse w-full" />
          ))}
        </div>
        <div className="h-8 bg-secondary/30 rounded-sm animate-pulse w-1/2" />
      </div>

      {/* Fake Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Fake Topbar */}
        <div className="h-14 border-b border-border/40 bg-card/10 px-6 flex items-center justify-between shrink-0">
          <div className="h-4 bg-secondary/30 rounded-sm animate-pulse w-1/4" />
          <div className="h-6 bg-secondary/30 rounded-sm animate-pulse w-32" />
        </div>

        {/* Loading Content */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3 bg-background/50">
          <div className="w-8 h-8 border-2 border-primary/40 border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest animate-pulse">
            LOADING SECURE MODULE…
          </span>
        </div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/** Redirects unauthenticated or expired users to /login. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = getStoredAuth();
  const valid = isSessionValid();
  const location = useLocation();

  if (!auth?.token || !valid) {
    // If token exists but is invalid, we don't clear it here (api.ts does on next call),
    // but we proactively redirect.
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}

/** Resets the per-page boundary when navigating to a different route. */
function RouteBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <PageErrorBoundary key={location.pathname}>{children}</PageErrorBoundary>;
}

const App = () => {
  return (
    <PageErrorBoundary>
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

                {/* Protected routes */}
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
    </PageErrorBoundary>
  );
};

export default App;
