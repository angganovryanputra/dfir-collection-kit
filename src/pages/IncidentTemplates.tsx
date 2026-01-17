import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TacticalPanel } from "@/components/TacticalPanel";
import { WarningBanner } from "@/components/WarningBanner";
import { TablePagination } from "@/components/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Shield,
  ArrowLeft,
  Plus,
  FileText,
  Edit,
  Trash2,
  Copy,
  Target,
  X,
  Save,
  AlertTriangle,
} from "lucide-react";
import type { IncidentType } from "@/types/dfir";

interface IncidentTemplate {
  id: string;
  name: string;
  incidentType: IncidentType;
  defaultEndpoints: string[];
  description: string;
  preflightChecklist: string[];
  createdAt: string;
  createdBy: string;
  usageCount: number;
}

const incidentTypes: { value: IncidentType; label: string }[] = [
  { value: "RANSOMWARE", label: "RANSOMWARE" },
  { value: "ACCOUNT_COMPROMISE", label: "ACCOUNT COMPROMISE" },
  { value: "DATA_EXFILTRATION", label: "DATA EXFILTRATION" },
  { value: "MALWARE", label: "MALWARE" },
  { value: "UNAUTHORIZED_ACCESS", label: "UNAUTHORIZED ACCESS" },
  { value: "INSIDER_THREAT", label: "INSIDER THREAT" },
];

// Mock templates data
const mockTemplates: IncidentTemplate[] = [
  {
    id: "TPL-001",
    name: "RANSOMWARE STANDARD",
    incidentType: "RANSOMWARE",
    defaultEndpoints: ["DC-01", "FILE-SERVER-01"],
    description: "Standard ransomware response template for enterprise environments",
    preflightChecklist: [
      "Isolate affected systems from network",
      "Notify security operations center",
      "Preserve initial evidence state",
      "Document ransom note if present",
    ],
    createdAt: "2024-01-15T08:00:00Z",
    createdBy: "ADMIN",
    usageCount: 24,
  },
  {
    id: "TPL-002",
    name: "ACCOUNT TAKEOVER",
    incidentType: "ACCOUNT_COMPROMISE",
    defaultEndpoints: ["EXCHANGE-01", "AD-DC-01"],
    description: "Response template for compromised user account incidents",
    preflightChecklist: [
      "Reset affected account credentials",
      "Check for mailbox forwarding rules",
      "Review recent login activity",
      "Notify affected user",
    ],
    createdAt: "2024-01-20T10:30:00Z",
    createdBy: "SOC-OPS",
    usageCount: 18,
  },
  {
    id: "TPL-003",
    name: "DATA BREACH RESPONSE",
    incidentType: "DATA_EXFILTRATION",
    defaultEndpoints: ["DB-SERVER-01", "WEB-APP-01"],
    description: "Template for suspected data exfiltration events",
    preflightChecklist: [
      "Identify scope of exposed data",
      "Notify legal and compliance",
      "Preserve network flow logs",
      "Check for data staging locations",
    ],
    createdAt: "2024-02-01T14:00:00Z",
    createdBy: "IR-LEAD",
    usageCount: 8,
  },
  {
    id: "TPL-004",
    name: "MALWARE INFECTION",
    incidentType: "MALWARE",
    defaultEndpoints: ["WORKSTATION-01"],
    description: "Generic malware infection response template",
    preflightChecklist: [
      "Disconnect affected system",
      "Capture memory dump if possible",
      "Identify malware family",
      "Check for lateral movement",
    ],
    createdAt: "2024-02-10T09:15:00Z",
    createdBy: "ADMIN",
    usageCount: 42,
  },
];

interface TemplateFormData {
  name: string;
  incidentType: IncidentType | null;
  defaultEndpoints: string[];
  description: string;
  preflightChecklist: string[];
}

const initialFormData: TemplateFormData = {
  name: "",
  incidentType: null,
  defaultEndpoints: [],
  description: "",
  preflightChecklist: [""],
};

export default function IncidentTemplates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<IncidentTemplate[]>(mockTemplates);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<IncidentTemplate | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(initialFormData);
  const [newEndpoint, setNewEndpoint] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const pagination = usePagination(templates);
  const paginatedTemplates = pagination.paginatedItems;

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const openEditDialog = (template: IncidentTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      incidentType: template.incidentType,
      defaultEndpoints: [...template.defaultEndpoints],
      description: template.description,
      preflightChecklist: [...template.preflightChecklist],
    });
    setIsDialogOpen(true);
  };

  const addEndpoint = () => {
    if (newEndpoint.trim() && !formData.defaultEndpoints.includes(newEndpoint.trim())) {
      setFormData({
        ...formData,
        defaultEndpoints: [...formData.defaultEndpoints, newEndpoint.trim().toUpperCase()],
      });
      setNewEndpoint("");
    }
  };

  const removeEndpoint = (endpoint: string) => {
    setFormData({
      ...formData,
      defaultEndpoints: formData.defaultEndpoints.filter((e) => e !== endpoint),
    });
  };

  const addChecklistItem = () => {
    setFormData({
      ...formData,
      preflightChecklist: [...formData.preflightChecklist, ""],
    });
  };

  const updateChecklistItem = (index: number, value: string) => {
    const updated = [...formData.preflightChecklist];
    updated[index] = value;
    setFormData({ ...formData, preflightChecklist: updated });
  };

  const removeChecklistItem = (index: number) => {
    setFormData({
      ...formData,
      preflightChecklist: formData.preflightChecklist.filter((_, i) => i !== index),
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.incidentType) return;

    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (editingTemplate) {
      setTemplates(
        templates.map((t) =>
          t.id === editingTemplate.id
            ? {
                ...t,
                name: formData.name,
                incidentType: formData.incidentType!,
                defaultEndpoints: formData.defaultEndpoints,
                description: formData.description,
                preflightChecklist: formData.preflightChecklist.filter((c) => c.trim()),
              }
            : t
        )
      );
    } else {
      const newTemplate: IncidentTemplate = {
        id: `TPL-${String(templates.length + 1).padStart(3, "0")}`,
        name: formData.name.toUpperCase(),
        incidentType: formData.incidentType!,
        defaultEndpoints: formData.defaultEndpoints,
        description: formData.description,
        preflightChecklist: formData.preflightChecklist.filter((c) => c.trim()),
        createdAt: new Date().toISOString(),
        createdBy: "OPERATOR",
        usageCount: 0,
      };
      setTemplates([...templates, newTemplate]);
    }

    setIsSaving(false);
    setIsDialogOpen(false);
  };

  const duplicateTemplate = (template: IncidentTemplate) => {
    const duplicate: IncidentTemplate = {
      ...template,
      id: `TPL-${String(templates.length + 1).padStart(3, "0")}`,
      name: `${template.name} (COPY)`,
      createdAt: new Date().toISOString(),
      usageCount: 0,
    };
    setTemplates([...templates, duplicate]);
  };

  const deleteTemplate = (id: string) => {
    setTemplates(templates.filter((t) => t.id !== id));
  };

  const useTemplate = (template: IncidentTemplate) => {
    // Navigate to create incident with template data
    navigate("/create-incident", { state: { template } });
  };

  const isFormValid = formData.name.trim() && formData.incidentType;

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
                INCIDENT TEMPLATES
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                MANAGE COLLECTION OPERATION TEMPLATES
              </p>
            </div>
          </div>
          <Button variant="tactical" onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            CREATE TEMPLATE
          </Button>
        </div>
      </header>

      <WarningBanner variant="warning">
        TEMPLATES ENABLE RAPID INCIDENT RESPONSE WITH PRE-CONFIGURED COLLECTION PARAMETERS
      </WarningBanner>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Templates Table */}
          <TacticalPanel 
            title="AVAILABLE TEMPLATES" 
            headerActions={
              <span className="font-mono text-xs text-primary">{templates.length} TOTAL</span>
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-mono">ID</TableHead>
                    <TableHead className="font-mono">NAME</TableHead>
                    <TableHead className="font-mono">TYPE</TableHead>
                    <TableHead className="font-mono">ENDPOINTS</TableHead>
                    <TableHead className="font-mono">CREATED BY</TableHead>
                    <TableHead className="font-mono">USAGE</TableHead>
                    <TableHead className="font-mono text-right">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-mono text-primary">
                        {template.id}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          {template.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 bg-warning/10 border border-warning/30 text-warning font-mono text-xs">
                          {template.incidentType.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {template.defaultEndpoints.length} TARGETS
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {template.createdBy}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {template.usageCount}x
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => useTemplate(template)}
                          >
                            USE
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(template)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => duplicateTemplate(template)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteTemplate(template.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              itemsPerPage={pagination.itemsPerPage}
              onPageChange={pagination.goToPage}
              onItemsPerPageChange={pagination.setPerPage}
            />
          </TacticalPanel>
        </div>
      </main>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-lg tracking-wider">
              {editingTemplate ? "EDIT TEMPLATE" : "CREATE NEW TEMPLATE"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Template Name */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Template Name
              </label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value.toUpperCase() })
                }
                placeholder="Enter template name"
              />
            </div>

            {/* Incident Type */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Incident Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {incidentTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, incidentType: type.value })}
                    className={`p-3 border font-mono text-xs uppercase tracking-wider transition-all ${
                      formData.incidentType === type.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Description
              </label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Template description"
              />
            </div>

            {/* Default Endpoints */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Default Endpoints
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={newEndpoint}
                    onChange={(e) => setNewEndpoint(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEndpoint())}
                    placeholder="Add default endpoint"
                    className="pl-10"
                  />
                </div>
                <Button type="button" variant="outline" onClick={addEndpoint}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {formData.defaultEndpoints.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.defaultEndpoints.map((endpoint) => (
                    <span
                      key={endpoint}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-secondary border border-border font-mono text-xs"
                    >
                      {endpoint}
                      <button
                        type="button"
                        onClick={() => removeEndpoint(endpoint)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Preflight Checklist */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Preflight Checklist
              </label>
              <div className="space-y-2">
                {formData.preflightChecklist.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={item}
                      onChange={(e) => updateChecklistItem(index, e.target.value)}
                      placeholder={`Checklist item ${index + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeChecklistItem(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addChecklistItem}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  ADD CHECKLIST ITEM
                </Button>
              </div>
            </div>
          </div>

          {/* Dialog Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1">
              CANCEL
            </Button>
            <Button
              variant="tactical"
              onClick={handleSave}
              disabled={!isFormValid || isSaving}
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <span className="animate-pulse">SAVING</span>
                  <span className="cursor-blink">_</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {editingTemplate ? "UPDATE TEMPLATE" : "CREATE TEMPLATE"}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-border bg-secondary px-6 py-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>TEMPLATES: {templates.length}</span>
        <span>SYSTEM: OPERATIONAL</span>
        <span>{new Date().toISOString()}</span>
      </footer>
    </div>
  );
}
