import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import CreateIncident from "./pages/CreateIncident";
import CollectionExecution from "./pages/CollectionExecution";
import EvidenceVault from "./pages/EvidenceVault";
import ChainOfCustody from "./pages/ChainOfCustody";
import AdminSettings from "./pages/AdminSettings";
import Devices from "./pages/Devices";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/create-incident" element={<CreateIncident />} />
          <Route path="/collection/:incidentId" element={<CollectionExecution />} />
          <Route path="/evidence" element={<EvidenceVault />} />
          <Route path="/chain-of-custody" element={<ChainOfCustody />} />
          <Route path="/admin" element={<AdminSettings />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
