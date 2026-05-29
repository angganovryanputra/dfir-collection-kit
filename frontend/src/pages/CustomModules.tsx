import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";

type CustomModule = {
  id: string;
  name: string;
  description: string | null;
  os: string;
  category: string;
  command: string;
  output_relpath: string;
  enabled: boolean;
  created_by: string;
  created_at: string;
};

const CATEGORIES = ["volatile", "logs", "persistence", "system", "artifacts"];
const OS_OPTIONS = ["windows", "linux", "macos"];

export default function CustomModules() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const role = getStoredRole();
  const isAdmin = role === "admin";
  const canEdit = role === "admin" || role === "operator";

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    os: "windows",
    category: "artifacts",
    command: "",
    output_relpath: "",
    enabled: true,
  });

  const { data: modules = [], isLoading } = useQuery<CustomModule[]>({
    queryKey: ["custom-modules"],
    queryFn: () => apiGet<CustomModule[]>("/platform/custom-modules"),
  });

  const resetForm = () => {
    setForm({ name: "", description: "", os: "windows", category: "artifacts", command: "", output_relpath: "", enabled: true });
    setShowForm(false);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost("/platform/custom-modules", {
        name: form.name,
        description: form.description || null,
        os: form.os,
        category: form.category,
        command: form.command,
        output_relpath:
          form.output_relpath || `custom/${form.name.toLowerCase().replace(/\s+/g, "_")}.txt`,
        enabled: form.enabled,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-modules"] });
      toast({ title: "Custom module created" });
      resetForm();
    },
    onError: () => toast({ title: "Failed to create module", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/platform/custom-modules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-modules"] });
      toast({ title: "Module deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  return (
    <AppLayout title="CUSTOM MODULE AUTHORING" subtitle="Define additional collection commands for the agent">
      <div className="p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">
        {canEdit && (
          <div className="flex justify-end">
            <Button variant="tactical" size="sm" onClick={() => setShowForm(s => !s)}>
              <Plus className="w-4 h-4 mr-2" />
              NEW MODULE
            </Button>
          </div>
        )}

        {showForm && (
          <TacticalPanel title="CREATE CUSTOM MODULE" status="active">
            <div className="space-y-3 font-mono text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Module Name *</label>
                  <input
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="my_custom_collector"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Target OS *</label>
                  <select
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none"
                    value={form.os}
                    onChange={e => setForm(f => ({ ...f, os: e.target.value }))}
                  >
                    {OS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Category</label>
                  <select
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Output Path (relative)</label>
                  <input
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.output_relpath}
                    onChange={e => setForm(f => ({ ...f, output_relpath: e.target.value }))}
                    placeholder="custom/output.txt"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase">Shell Command *</label>
                <textarea
                  className="mt-1 w-full px-2 py-1 bg-background border border-input rounded-sm text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={3}
                  value={form.command}
                  onChange={e => setForm(f => ({ ...f, command: e.target.value }))}
                  placeholder="cmd /c dir /s C:\Windows\Prefetch > output.txt"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase">Description</label>
                <input
                  className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What does this module collect?"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="tactical"
                  size="sm"
                  disabled={!form.name || !form.command || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? "CREATING..." : "CREATE MODULE"}
                </Button>
                <Button variant="ghost" size="sm" onClick={resetForm}>CANCEL</Button>
              </div>
            </div>
          </TacticalPanel>
        )}

        <TacticalPanel title={`CUSTOM MODULES (${modules.length})`} status={modules.length > 0 ? "online" : "warning"}>
          {isLoading ? (
            <div className="font-mono text-xs text-muted-foreground py-4">LOADING...</div>
          ) : modules.length === 0 ? (
            <div className="font-mono text-xs text-muted-foreground py-4">
              No custom modules defined. Create one to extend agent collection beyond built-in modules.
            </div>
          ) : (
            <div className="space-y-2">
              {modules.map(m => (
                <div
                  key={m.id}
                  className={`border rounded-sm p-3 font-mono text-xs space-y-1.5 ${
                    m.enabled ? "border-border" : "border-border/30 opacity-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-bold truncate">{m.name}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        [{m.os} / {m.category}]
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {m.enabled ? (
                        <ToggleRight className="w-4 h-4 text-primary" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                      )}
                      {isAdmin && (
                        <button
                          className="text-muted-foreground hover:text-destructive p-1"
                          onClick={() => deleteMutation.mutate(m.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {m.description && <div className="text-muted-foreground">{m.description}</div>}
                  <pre className="bg-secondary/30 px-2 py-1 rounded-sm text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all text-xs">
                    {m.command}
                  </pre>
                  <div className="text-muted-foreground text-xs">→ {m.output_relpath}</div>
                </div>
              ))}
            </div>
          )}
        </TacticalPanel>
      </div>
    </AppLayout>
  );
}
