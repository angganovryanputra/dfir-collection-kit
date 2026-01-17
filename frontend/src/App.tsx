import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import CreateIncident from "./pages/CreateIncident";
import CollectionExecution from "./pages/CollectionExecution";
import EvidenceVault from "./pages/EvidenceVault";
import ChainOfCustody from "./pages/ChainOfCustody";
import AdminSettings from "./pages/AdminSettings";
import Devices from "./pages/Devices";
import IncidentTemplates from "./pages/IncidentTemplates";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/incidents/create" element={<CreateIncident />} />
            <Route path="/incidents/:id/collect" element={<CollectionExecution />} />
            <Route path="/evidence" element={<EvidenceVault />} />
            <Route path="/evidence/:id" element={<EvidenceVault />} />
            <Route path="/chain-of-custody" element={<ChainOfCustody />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/incident-templates" element={<IncidentTemplates />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
