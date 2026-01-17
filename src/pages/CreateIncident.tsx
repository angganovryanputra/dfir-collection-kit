import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TacticalPanel } from "@/components/TacticalPanel";
import { WarningBanner } from "@/components/WarningBanner";
import {
  Shield,
  ArrowLeft,
  Plus,
  X,
  AlertTriangle,
  Target,
  FileStack,
} from "lucide-react";
import type { IncidentType } from "@/types/dfir";

const incidentTypes: { value: IncidentType; label: string }[] = [
  { value: "RANSOMWARE", label: "RANSOMWARE" },
  { value: "ACCOUNT_COMPROMISE", label: "ACCOUNT COMPROMISE" },
  { value: "DATA_EXFILTRATION", label: "DATA EXFILTRATION" },
  { value: "MALWARE", label: "MALWARE" },
  { value: "UNAUTHORIZED_ACCESS", label: "UNAUTHORIZED ACCESS" },
  { value: "INSIDER_THREAT", label: "INSIDER THREAT" },
];

interface TemplateData {
  id: string;
  name: string;
  incidentType: IncidentType;
  defaultEndpoints: string[];
  description: string;
  preflightChecklist: string[];
}

export default function CreateIncident() {
  const navigate = useNavigate();
  const location = useLocation();
  const template = location.state?.template as TemplateData | undefined;

  const [incidentType, setIncidentType] = useState<IncidentType | null>(null);
  const [endpoints, setEndpoints] = useState<string[]>([]);
  const [newEndpoint, setNewEndpoint] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [customChecklist, setCustomChecklist] = useState<string[]>([]);

  // Apply template on mount
  useEffect(() => {
    if (template) {
      setIncidentType(template.incidentType);
      setEndpoints([...template.defaultEndpoints]);
      setCustomChecklist([...template.preflightChecklist]);
    }
  }, [template]);

  // Auto-generated incident ID
  const incidentId = `INC-${new Date().getFullYear()}-${String(
    Math.floor(Math.random() * 1000)
  ).padStart(4, "0")}`;

  const addEndpoint = () => {
    if (newEndpoint.trim() && !endpoints.includes(newEndpoint.trim())) {
      setEndpoints([...endpoints, newEndpoint.trim().toUpperCase()]);
      setNewEndpoint("");
    }
  };

  const removeEndpoint = (endpoint: string) => {
    setEndpoints(endpoints.filter((e) => e !== endpoint));
  };

  const handleStartCollection = async () => {
    if (!incidentType || endpoints.length === 0 || !operatorName) return;

    setIsStarting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    navigate(`/collection/${incidentId}`);
  };

  const isValid = incidentType && endpoints.length > 0 && operatorName.trim();

  const defaultChecklist = [
    "Target system(s) network isolated if required",
    "Incident ticket created in tracking system",
    "Legal/HR notified if insider threat",
    "Collection scope approved by incident commander",
  ];

  const checklist = customChecklist.length > 0 ? customChecklist : defaultChecklist;

  return (
    <div className="min-h-screen bg-background tactical-grid flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="font-mono text-lg font-bold tracking-wider text-foreground">
                CREATE INCIDENT
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                INITIALIZE NEW COLLECTION OPERATION
              </p>
            </div>
          </div>
          <div className="font-mono text-sm text-primary">
            ID: {incidentId}
          </div>
        </div>
      </header>

      {/* Warning */}
      <WarningBanner variant="warning">
        ENSURE TARGET SYSTEMS ARE ISOLATED BEFORE INITIATING COLLECTION
      </WarningBanner>

      {/* Template Badge */}
      {template && (
        <div className="mx-6 mt-4 flex items-center gap-3 p-3 border border-primary/30 bg-primary/5">
          <FileStack className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <div className="font-mono text-xs text-muted-foreground">USING TEMPLATE</div>
            <div className="font-mono text-sm text-primary font-bold">{template.name}</div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              setIncidentType(null);
              setEndpoints([]);
              setCustomChecklist([]);
              navigate("/create-incident", { replace: true, state: {} });
            }}
          >
            CLEAR
          </Button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Incident ID Display */}
          <TacticalPanel title="INCIDENT IDENTIFIER">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="font-mono text-xs text-muted-foreground mb-1">
                  AUTO-GENERATED CASE ID
                </div>
                <div className="font-mono text-2xl font-bold text-primary text-glow-green">
                  {incidentId}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs text-muted-foreground">
                  TIMESTAMP
                </div>
                <div className="font-mono text-sm text-foreground">
                  {new Date().toISOString()}
                </div>
              </div>
            </div>
          </TacticalPanel>

          {/* Incident Type */}
          <TacticalPanel title="INCIDENT TYPE" status={incidentType ? "online" : undefined}>
            <div className="grid grid-cols-3 gap-3">
              {incidentTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setIncidentType(type.value)}
                  className={`p-4 border font-mono text-xs uppercase tracking-wider transition-all text-left ${
                    incidentType === type.value
                      ? "border-primary bg-primary/10 text-primary glow-green"
                      : "border-border bg-secondary text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 mb-2" />
                  {type.label}
                </button>
              ))}
            </div>
          </TacticalPanel>

          {/* Target Endpoints */}
          <TacticalPanel
            title="TARGET ENDPOINTS"
            status={endpoints.length > 0 ? "online" : undefined}
          >
            <div className="space-y-4">
              {/* Add Endpoint */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={newEndpoint}
                    onChange={(e) => setNewEndpoint(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addEndpoint()}
                    placeholder="Enter hostname or IP address"
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" onClick={addEndpoint}>
                  <Plus className="w-4 h-4" />
                  ADD
                </Button>
              </div>

              {/* Endpoint List */}
              {endpoints.length > 0 ? (
                <div className="space-y-2">
                  {endpoints.map((endpoint) => (
                    <div
                      key={endpoint}
                      className="flex items-center justify-between p-3 bg-secondary border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <Target className="w-4 h-4 text-primary" />
                        <span className="font-mono text-sm">{endpoint}</span>
                      </div>
                      <button
                        onClick={() => removeEndpoint(endpoint)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                  NO TARGETS SPECIFIED
                </div>
              )}
            </div>
          </TacticalPanel>

          {/* Operator */}
          <TacticalPanel
            title="OPERATOR IDENTIFICATION"
            status={operatorName.trim() ? "online" : undefined}
          >
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Operator Name / Badge ID
              </label>
              <Input
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value.toUpperCase())}
                placeholder="Enter operator name"
              />
            </div>
          </TacticalPanel>

          {/* Action Buttons */}
          <div className="flex items-center gap-4">
            <Button
              variant="destructive"
              size="lg"
              onClick={() => navigate("/dashboard")}
            >
              ABORT
            </Button>
            <Button
              variant="tactical"
              size="lg"
              className="flex-1"
              onClick={handleStartCollection}
              disabled={!isValid || isStarting}
            >
              {isStarting ? (
                <>
                  <span className="animate-pulse">INITIALIZING COLLECTION</span>
                  <span className="cursor-blink">_</span>
                </>
              ) : (
                <>START COLLECTION</>
              )}
            </Button>
          </div>

          {/* Pre-flight Checklist */}
          <div className="border border-warning/30 bg-warning/5 p-4">
            <div className="font-mono text-xs text-warning font-bold mb-2">
              PRE-FLIGHT CHECKLIST
            </div>
            <ul className="font-mono text-xs text-muted-foreground space-y-1">
              {checklist.map((item, index) => (
                <li key={index}>☐ {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-secondary px-6 py-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>TARGETS: {endpoints.length}</span>
        <span>TYPE: {incidentType || "NOT SELECTED"}</span>
        <span>{new Date().toISOString()}</span>
      </footer>
    </div>
  );
}
