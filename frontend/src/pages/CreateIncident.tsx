import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { FormLabel } from "@/components/common/FormLabel";
import { InputWithIcon } from "@/components/common/InputWithIcon";
import { SelectableButton } from "@/components/common/SelectableButton";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, X, AlertTriangle, Target, FileStack } from "lucide-react";
import type { IncidentType } from "@/types/dfir";
import { apiPost } from "@/lib/api";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Apply template on mount
  useEffect(() => {
    if (template) {
      setIncidentType(template.incidentType);
      setEndpoints([...template.defaultEndpoints]);
      setCustomChecklist([...template.preflightChecklist]);
    }
  }, [template]);

  // Auto-generated incident ID
  const [incidentId] = useState(
    `INC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(4, "0")}`
  );

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
    if (!incidentType || endpoints.length === 0 || !operatorName.trim()) {
      setErrorMessage("Complete incident type, targets, and operator.");
      return;
    }

    setIsStarting(true);
    setErrorMessage(null);
    try {
      await apiPost("/incidents", {
        id: incidentId,
        type: incidentType,
        status: "COLLECTION_IN_PROGRESS",
        target_endpoints: endpoints,
        operator: operatorName.trim().toUpperCase(),
      });
      await apiPost("/chain-of-custody", {
        id: `${incidentId}-created`,
        incident_id: incidentId,
        timestamp: new Date().toISOString(),
        action: "INCIDENT CREATED",
        actor: operatorName.trim().toUpperCase(),
        target: incidentId,
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      navigate(`/incidents/${incidentId}/collect`);
    } catch {
      setErrorMessage("Failed to create incident. Verify backend connectivity.");
    } finally {
      setIsStarting(false);
    }
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
    <AppLayout
      title="CREATE INCIDENT"
      subtitle="INITIALIZE NEW COLLECTION OPERATION"
      showWarning
      warningMessage="ENSURE TARGET SYSTEMS ARE ISOLATED BEFORE INITIATING COLLECTION"
      headerActions={
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="font-mono text-sm text-primary">ID: {incidentId}</div>
        </div>
      }
    >
      <div className="p-6">
        {template && (
          <div className="mb-6 flex items-center gap-3 p-3 border border-primary/30 bg-primary/5">
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
                setErrorMessage(null);
                navigate("/incidents/create", { replace: true, state: {} });
              }}
            >
              CLEAR
            </Button>
          </div>
        )}

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

          {errorMessage && (
            <div className="border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
              {errorMessage}
            </div>
          )}

          {/* Incident Type */}
          <TacticalPanel title="INCIDENT TYPE" status={incidentType ? "online" : undefined}>
            <div className="grid grid-cols-3 gap-3">
              {incidentTypes.map((type) => (
                <SelectableButton
                  key={type.value}
                  isActive={incidentType === type.value}
                  onClick={() => setIncidentType(type.value)}
                  className="p-4 text-left"
                  activeClassName="border-primary bg-primary/10 text-primary glow-green"
                  inactiveClassName="border-border bg-secondary text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                >
                  <AlertTriangle className="w-4 h-4 mb-2" />
                  {type.label}
                </SelectableButton>
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
                <InputWithIcon
                  icon={<Target className="w-4 h-4" />}
                  wrapperClassName="flex-1"
                  value={newEndpoint}
                  onChange={(e) => setNewEndpoint(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addEndpoint()}
                  placeholder="Enter hostname or IP address"
                />
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
              <FormLabel>
                Operator Name / Badge ID
              </FormLabel>
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
      </div>
    </AppLayout>
  );
}
