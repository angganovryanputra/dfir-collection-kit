import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TacticalPanel } from "@/components/TacticalPanel";
import { TablePagination } from "@/components/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { FormLabel } from "@/components/common/FormLabel";
import { InputWithIcon } from "@/components/common/InputWithIcon";
import { SelectableButton } from "@/components/common/SelectableButton";
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
  Plus,
  FileText,
  Edit,
  Trash2,
  Copy,
  Target,
  X,
  Save,
} from "lucide-react";
import type { IncidentType } from "@/types/dfir";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

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

interface TemplateResponse {
  id: string;
  name: string;
  incident_type: IncidentType;
  default_endpoints: string[];
  description: string;
  preflight_checklist: string[];
  created_at: string;
  created_by: string;
  usage_count: number;
}

const mapTemplate = (template: TemplateResponse): IncidentTemplate => ({
  id: template.id,
  name: template.name,
  incidentType: template.incident_type,
  defaultEndpoints: template.default_endpoints,
  description: template.description,
  preflightChecklist: template.preflight_checklist,
  createdAt: template.created_at,
  createdBy: template.created_by,
  usageCount: template.usage_count,
});

const toTemplatePayload = (template: IncidentTemplate) => ({
  id: template.id,
  name: template.name,
  incident_type: template.incidentType,
  default_endpoints: template.defaultEndpoints,
  description: template.description,
  preflight_checklist: template.preflightChecklist,
  created_at: template.createdAt,
  created_by: template.createdBy,
  usage_count: template.usageCount,
});

const incidentTypes: { value: IncidentType; label: string }[] = [
  { value: "RANSOMWARE", label: "RANSOMWARE" },
  { value: "ACCOUNT_COMPROMISE", label: "ACCOUNT COMPROMISE" },
  { value: "DATA_EXFILTRATION", label: "DATA EXFILTRATION" },
  { value: "MALWARE", label: "MALWARE" },
  { value: "UNAUTHORIZED_ACCESS", label: "UNAUTHORIZED ACCESS" },
  { value: "INSIDER_THREAT", label: "INSIDER THREAT" },
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
  const [templates, setTemplates] = useState<IncidentTemplate[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<IncidentTemplate | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(initialFormData);
  const [newEndpoint, setNewEndpoint] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTemplates = async () => {
    setErrorMessage(null);
    try {
      const data = await apiGet<TemplateResponse[]>("/templates");
      setTemplates(data.map(mapTemplate));
    } catch {
      setErrorMessage("Unable to load templates.");
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

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

  const allowedModules = ["MEMORY", "DISK", "LOGS", "NETWORK", "REGISTRY", "BROWSER"];
  const legacyModules = editingTemplate
    ? editingTemplate.preflightChecklist.map((item) => item.trim().toUpperCase())
    : [];
  const allowedModuleSet = new Set([...allowedModules, ...legacyModules]);

  const sanitizeChecklist = (items: string[]) =>
    items
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .filter((item) => allowedModuleSet.has(item.toUpperCase()));

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
    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      if (editingTemplate) {
        const updatedTemplate: IncidentTemplate = {
          ...editingTemplate,
          name: formData.name,
          incidentType: formData.incidentType!,
          defaultEndpoints: formData.defaultEndpoints,
          description: formData.description,
          preflightChecklist: sanitizeChecklist(formData.preflightChecklist),
        };
        await apiPatch(`/templates/${updatedTemplate.id}`, {
          name: updatedTemplate.name,
          incident_type: updatedTemplate.incidentType,
          default_endpoints: updatedTemplate.defaultEndpoints,
          description: updatedTemplate.description,
          preflight_checklist: updatedTemplate.preflightChecklist,
          created_by: updatedTemplate.createdBy,
          usage_count: updatedTemplate.usageCount,
        });
        setTemplates((current) =>
          current.map((t) => (t.id === editingTemplate.id ? updatedTemplate : t))
        );
      } else {
        const newTemplate: IncidentTemplate = {
          id: `TPL-${String(templates.length + 1).padStart(3, "0")}`,
          name: formData.name.toUpperCase(),
          incidentType: formData.incidentType!,
          defaultEndpoints: formData.defaultEndpoints,
          description: formData.description,
          preflightChecklist: sanitizeChecklist(formData.preflightChecklist),
          createdAt: new Date().toISOString(),
          createdBy: "OPERATOR",
          usageCount: 0,
        };
        await apiPost("/templates", toTemplatePayload(newTemplate));
        setTemplates([...templates, newTemplate]);
      }
    } catch {
      setErrorMessage("Unable to save template.");
    }

    setIsSaving(false);
    setIsDialogOpen(false);
  };

  const duplicateTemplate = async (template: IncidentTemplate) => {
    const duplicate: IncidentTemplate = {
      ...template,
      id: `TPL-${String(templates.length + 1).padStart(3, "0")}`,
      name: `${template.name} (COPY)`,
      preflightChecklist: sanitizeChecklist(template.preflightChecklist),
      createdAt: new Date().toISOString(),
      usageCount: 0,
    };
    try {
      await apiPost("/templates", toTemplatePayload(duplicate));
      setTemplates([...templates, duplicate]);
    } catch {
      setErrorMessage("Unable to duplicate template.");
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await apiDelete(`/templates/${id}`);
      setTemplates(templates.filter((t) => t.id !== id));
    } catch {
      setErrorMessage("Unable to delete template.");
    }
  };

  const useTemplate = (template: IncidentTemplate) => {
    navigate("/incidents/create", { state: { template } });
  };

  const isFormValid = formData.name.trim() && formData.incidentType;

  const moduleHint = formData.preflightChecklist
    .filter((item) => item.trim().length > 0)
    .some((item) => !allowedModuleSet.has(item.trim().toUpperCase()))
    ? "Only approved module names are saved."
    : null;

  return (
    <AppLayout
      title="INCIDENT TEMPLATES"
      subtitle="MANAGE COLLECTION OPERATION TEMPLATES"
      headerActions={
        <Button variant="tactical" onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          CREATE TEMPLATE
        </Button>
      }
    >
      <div className="p-6">
        {errorMessage && (
          <div className="mb-4 border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
            {errorMessage}
          </div>
        )}
        <div className="mb-3 font-mono text-[10px] text-muted-foreground">
          APPROVED MODULES: {allowedModules.join(" • ")}
          {legacyModules.length > 0
            ? ` • LEGACY MODULES: ${legacyModules.join(" • ")}`
            : ""}
          {moduleHint ? ` · ${moduleHint}` : ""}
        </div>
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
              <FormLabel>
                Template Name
              </FormLabel>
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
              <FormLabel>
                Incident Type
              </FormLabel>
              <div className="grid grid-cols-3 gap-2">
                {incidentTypes.map((type) => (
                  <SelectableButton
                    key={type.value}
                    type="button"
                    isActive={formData.incidentType === type.value}
                    onClick={() => setFormData({ ...formData, incidentType: type.value })}
                    className="p-3"
                  >
                    {type.label}
                  </SelectableButton>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <FormLabel>
                Description
              </FormLabel>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Template description"
              />
            </div>

            {/* Default Endpoints */}
            <div className="space-y-2">
              <FormLabel>
                Default Endpoints
              </FormLabel>
               <div className="flex gap-2">
                <InputWithIcon
                  icon={<Target className="w-4 h-4" />}
                  wrapperClassName="flex-1"
                  value={newEndpoint}
                  onChange={(e) => setNewEndpoint(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEndpoint())}
                  placeholder="Add default endpoint"
                />

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
              <FormLabel>
                Preflight Checklist
              </FormLabel>
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
    </AppLayout>
  );
}
