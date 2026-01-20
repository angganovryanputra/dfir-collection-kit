import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import React, { Component } from "react";
import AdminSettings from "./pages/AdminSettings";
import ChainOfCustody from "./pages/ChainOfCustody";
import CollectionExecution from "./pages/CollectionExecution";
import CreateIncident from "./pages/CreateIncident";
import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import EvidenceVault from "./pages/EvidenceVault";
import IncidentTemplates from "./pages/IncidentTemplates";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/incidents/create" element={<CreateIncident />} />
                <Route path="/incidents/:id/collect" element={<CollectionExecution />} />
                <Route path="/evidence" element={<EvidenceVault />} />
                <Route path="/evidence/:id" element={<EvidenceVault />} />
                <Route path="/chain-of-custody" element={<ChainOfCustody />} />
                <Route path="/devices" element={<Devices />} />
                <Route path="/incident-templates" element={<IncidentTemplates />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
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
