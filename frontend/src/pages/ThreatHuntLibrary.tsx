import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { Plus, Play, Edit2, Trash2, Search } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";

type ThreatHuntQuery = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  query: string;
  sigma_rule: string | null;
  tags: string[];
  mitre_technique: string | null;
  is_public: boolean;
  created_by: string;
  created_at: string;
};

type RunResult = {
  query_id: string;
  incident_id: string;
  row_count: number;
  rows: Record<string, unknown>[];
};

const CATEGORIES = [
  "Persistence", "Lateral Movement", "Credential Access", "Defense Evasion",
  "Exfiltration", "Discovery", "Execution", "Other",
];

export default function ThreatHuntLibrary() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const role = getStoredRole();
  const canEdit = role === "admin" || role === "operator";

  const [catFilter, setCatFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [runIncidentId, setRunIncidentId] = useState("");
  const [runResults, setRunResults] = useState<RunResult | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "Other",
    query: "",
    sigma_rule: "",
    tags: "",
    mitre_technique: "",
    is_public: true,
  });

  const { data: queries = [], isLoading } = useQuery<ThreatHuntQuery[]>({
    queryKey: ["threat-hunt-queries", catFilter],
    queryFn: () =>
      apiGet<ThreatHuntQuery[]>(
        `/platform/threat-hunt-queries${catFilter ? `?category=${encodeURIComponent(catFilter)}` : ""}`
      ),
  });

  const resetForm = () => {
    setForm({ name: "", description: "", category: "Other", query: "", sigma_rule: "", tags: "", mitre_technique: "", is_public: true });
    setEditId(null);
    setShowForm(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        description: form.description || null,
        category: form.category,
        query: form.query,
        sigma_rule: form.sigma_rule || null,
        tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        mitre_technique: form.mitre_technique || null,
        is_public: form.is_public,
      };
      if (editId) {
        return apiPatch(`/platform/threat-hunt-queries/${editId}`, body);
      }
      return apiPost("/platform/threat-hunt-queries", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threat-hunt-queries"] });
      toast({ title: editId ? "Query updated" : "Query created" });
      resetForm();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/platform/threat-hunt-queries/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threat-hunt-queries"] });
      toast({ title: "Query deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleEdit = (q: ThreatHuntQuery) => {
    setForm({
      name: q.name,
      description: q.description ?? "",
      category: q.category,
      query: q.query,
      sigma_rule: q.sigma_rule ?? "",
      tags: q.tags.join(", "),
      mitre_technique: q.mitre_technique ?? "",
      is_public: q.is_public,
    });
    setEditId(q.id);
    setShowForm(true);
  };

  const handleRun = async (queryId: string) => {
    if (!runIncidentId.trim()) {
      toast({ title: "Enter an incident ID first", variant: "destructive" });
      return;
    }
    setRunningId(queryId);
    setRunResults(null);
    try {
      const result = await apiPost<RunResult>(
        `/platform/threat-hunt-queries/${queryId}/run?incident_id=${encodeURIComponent(runIncidentId.trim())}`,
        {}
      );
      setRunResults(result);
    } catch {
      toast({ title: "Query execution failed", variant: "destructive" });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <AppLayout title="THREAT HUNT LIBRARY" subtitle="Reusable DuckDB queries for timeline hunting">
      <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <select
              className="h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none"
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
            >
              <option value="">ALL CATEGORIES</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">RUN IN INCIDENT:</span>
            <input
              className="h-8 w-40 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="INC-001"
              value={runIncidentId}
              onChange={e => setRunIncidentId(e.target.value)}
            />
          </div>
          {canEdit && (
            <Button variant="tactical" size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              NEW QUERY
            </Button>
          )}
        </div>

        {showForm && (
          <TacticalPanel title={editId ? "EDIT QUERY" : "NEW QUERY"} status="active">
            <div className="space-y-3 font-mono text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Name *</label>
                  <input
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Query name"
                  />
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
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase">DuckDB SQL *</label>
                <textarea
                  className="mt-1 w-full px-2 py-1 bg-background border border-input rounded-sm text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={5}
                  value={form.query}
                  onChange={e => setForm(f => ({ ...f, query: e.target.value }))}
                  placeholder="SELECT * FROM events WHERE message ILIKE '%mimikatz%' ORDER BY datetime LIMIT 100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase">MITRE Technique</label>
                  <input
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.mitre_technique}
                    onChange={e => setForm(f => ({ ...f, mitre_technique: e.target.value }))}
                    placeholder="T1003.001"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Tags (comma-separated)</label>
                  <input
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.tags}
                    onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                    placeholder="lsass, credential, mimikatz"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="tactical"
                  size="sm"
                  disabled={!form.name || !form.query || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? "SAVING..." : "SAVE"}
                </Button>
                <Button variant="ghost" size="sm" onClick={resetForm}>CANCEL</Button>
              </div>
            </div>
          </TacticalPanel>
        )}

        {runResults && (
          <TacticalPanel
            title={`QUERY RESULTS — ${runResults.row_count} ROWS (showing ${Math.min(runResults.rows.length, 50)})`}
            status="online"
          >
            <div className="overflow-x-auto font-mono text-xs">
              {runResults.rows.length === 0 ? (
                <div className="text-muted-foreground py-2">No results matching query.</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {Object.keys(runResults.rows[0]).slice(0, 8).map(col => (
                        <th key={col} className="text-left text-muted-foreground px-2 py-1 border-b border-border text-xs uppercase whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runResults.rows.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-secondary/30">
                        {Object.values(row).slice(0, 8).map((v, j) => (
                          <td key={j} className="px-2 py-1 truncate max-w-[180px]" title={String(v ?? "")}>
                            {String(v ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </TacticalPanel>
        )}

        <TacticalPanel title={`QUERY LIBRARY (${queries.length})`}>
          {isLoading ? (
            <div className="font-mono text-xs text-muted-foreground py-4">LOADING...</div>
          ) : queries.length === 0 ? (
            <div className="font-mono text-xs text-muted-foreground py-4">
              No queries in library. Add reusable DuckDB SQL queries to hunt across incident timelines.
            </div>
          ) : (
            <div className="space-y-2">
              {queries.map(q => (
                <div key={q.id} className="border border-border rounded-sm p-3 font-mono text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-bold truncate">{q.name}</span>
                      <span className="shrink-0 text-primary text-xs px-1 border border-primary/40 rounded">{q.category}</span>
                      {q.mitre_technique && (
                        <span className="shrink-0 text-muted-foreground text-xs">{q.mitre_technique}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        disabled={runningId === q.id}
                        onClick={() => handleRun(q.id)}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        {runningId === q.id ? "..." : "RUN"}
                      </Button>
                      {canEdit && (
                        <>
                          <button className="text-muted-foreground hover:text-foreground p-1" onClick={() => handleEdit(q)}>
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button className="text-muted-foreground hover:text-destructive p-1" onClick={() => deleteMutation.mutate(q.id)}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {q.description && <div className="text-muted-foreground">{q.description}</div>}
                  <pre className="bg-secondary/30 px-2 py-1 rounded-sm text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all text-xs">
                    {q.query.slice(0, 200)}{q.query.length > 200 ? "..." : ""}
                  </pre>
                  {q.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {q.tags.map(tag => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TacticalPanel>
      </div>
    </AppLayout>
  );
}
