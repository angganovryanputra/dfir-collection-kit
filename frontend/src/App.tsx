import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

const queryClient = new QueryClient();

/** Redirects unauthenticated users to /login before rendering the page. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = getStoredAuth();
  if (!auth?.token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

type ErrorBoundaryProps = { children: React.ReactNode };

type ErrorBoundaryState = { error: Error | null };

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
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "20px", color: "white", backgroundColor: "#dc2626" }}>
          <h1>Something went wrong</h1>
          <p>{this.state.error.message}</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => {
  console.log("[App] App mounted");

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

                {/* Protected routes — redirect to /login if not authenticated */}
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/incidents/create" element={<ProtectedRoute><CreateIncident /></ProtectedRoute>} />
                <Route path="/incidents/:id/setup" element={<ProtectedRoute><CollectionSetup /></ProtectedRoute>} />
                <Route path="/incidents/:id/collect" element={<ProtectedRoute><CollectionExecution /></ProtectedRoute>} />
                <Route path="/evidence" element={<ProtectedRoute><EvidenceVault /></ProtectedRoute>} />
                <Route path="/evidence/:id" element={<ProtectedRoute><EvidenceVault /></ProtectedRoute>} />
                <Route path="/chain-of-custody" element={<ProtectedRoute><ChainOfCustody /></ProtectedRoute>} />
                <Route path="/devices" element={<ProtectedRoute><Devices /></ProtectedRoute>} />
                <Route path="/incident-templates" element={<ProtectedRoute><IncidentTemplates /></ProtectedRoute>} />
                <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
                <Route path="/incidents/:id/processing" element={<ProtectedRoute><ProcessingStatus /></ProtectedRoute>} />
                <Route path="/incidents/:id/sigma-hits" element={<ProtectedRoute><SigmaHits /></ProtectedRoute>} />
                <Route path="/incidents/:id/attack-chains" element={<ProtectedRoute><AttackChains /></ProtectedRoute>} />
                <Route path="/incidents/:id/ioc-matches" element={<ProtectedRoute><IOCMatches /></ProtectedRoute>} />
                <Route path="/incidents/:id/yara-matches" element={<ProtectedRoute><YaraMatches /></ProtectedRoute>} />

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
