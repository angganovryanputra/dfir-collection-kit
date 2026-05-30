import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/StatusIndicator";
import { KeyValueRow } from "@/components/common/KeyValueRow";
import { ChevronLeft, Plus, Edit2, Trash2, Target, CheckCircle2, XCircle } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";

type Hypothesis = {
  id: string;
  incident_id: string;
  title: string;
  description: string | null;
  tactic: string | null;
  technique_id: string | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  status: "OPEN" | "CONFIRMED" | "REFUTED";
  evidence_refs: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

const MITRE_TACTICS = [
  "Initial Access", "Execution", "Persistence", "Privilege Escalation",
  "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
  "Collection", "Command and Control", "Exfiltration", "Impact",
];

const CONFIDENCE_COLORS: Record<string, string> = {
  LOW: "text-yellow-500",
  MEDIUM: "text-orange-400",
  HIGH: "text-destructive",
};

export default function HypothesisBuilder() {
  const navigate = useNavigate();
  const { id: incidentId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const role = getStoredRole();
  const canEdit = role === "admin" || role === "operator";

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    tactic: "",
    technique_id: "",
    confidence: "LOW",
    status: "OPEN",
    evidence_refs: "",
  });

  // Handle pre-filled data from URL
  useEffect(() => {
    const preTitle = searchParams.get("title");
    const preEvidence = searchParams.get("evidence");
    if (preTitle || preEvidence) {
      setForm((prev) => ({
        ...prev,
        title: preTitle || prev.title,
        evidence_refs: preEvidence || prev.evidence_refs,
      }));
      setShowForm(true);
    }
  }, [searchParams]);

  const { data: hypotheses = [], isLoading } = useQuery<Hypothesis[]>({
    queryKey: ["hypotheses", incidentId],
    queryFn: () => apiGet<Hypothesis[]>(`/platform/incidents/${incidentId}/hypotheses`),
    enabled: !!incidentId,
  });

  const resetForm = () => {
    setForm({ title: "", description: "", tactic: "", technique_id: "", confidence: "LOW", status: "OPEN", evidence_refs: "" });
    setEditId(null);
    setShowForm(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        title: form.title,
        description: form.description || null,
        tactic: form.tactic || null,
        technique_id: form.technique_id || null,
        confidence: form.confidence,
        status: form.status,
        evidence_refs: form.evidence_refs ? form.evidence_refs.split("\n").map(s => s.trim()).filter(Boolean) : [],
      };
      if (editId) {
        return apiPatch(`/platform/incidents/${incidentId}/hypotheses/${editId}`, body);
      }
      return apiPost(`/platform/incidents/${incidentId}/hypotheses`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hypotheses", incidentId] });
      toast({ title: editId ? "Hypothesis updated" : "Hypothesis created" });
      resetForm();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/platform/incidents/${incidentId}/hypotheses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hypotheses", incidentId] });
      toast({ title: "Hypothesis deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleEdit = (h: Hypothesis) => {
    setForm({
      title: h.title,
      description: h.description ?? "",
      tactic: h.tactic ?? "",
      technique_id: h.technique_id ?? "",
      confidence: h.confidence,
      status: h.status,
      evidence_refs: h.evidence_refs.join("\n"),
    });
    setEditId(h.id);
    setShowForm(true);
  };

  return (
    <AppLayout
      title="ATTACK HYPOTHESIS BUILDER"
      subtitle={`INCIDENT: ${incidentId}`}
      headerActions={
        <Button variant="ghost" size="sm" onClick={() => navigate(`/incidents/${incidentId}`)}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          BACK
        </Button>
      }
    >
      <div className="p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">
        {canEdit && (
          <div className="flex justify-end">
            <Button
              variant="tactical"
              size="sm"
              onClick={() => { resetForm(); setShowForm(true); }}
            >
              <Plus className="w-4 h-4 mr-2" />
              NEW HYPOTHESIS
            </Button>
          </div>
        )}

        {showForm && (
          <TacticalPanel title={editId ? "EDIT HYPOTHESIS" : "NEW HYPOTHESIS"} status="active">
            <div className="space-y-3 font-mono text-sm">
              <div>
                <label className="text-xs text-muted-foreground uppercase">Title *</label>
                <input
                  className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Attacker used Pass-the-Hash for lateral movement"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase">MITRE Tactic</label>
                  <select
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none"
                    value={form.tactic}
                    onChange={e => setForm(f => ({ ...f, tactic: e.target.value }))}
                  >
                    <option value="">— select —</option>
                    {MITRE_TACTICS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Technique ID</label>
                  <input
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.technique_id}
                    onChange={e => setForm(f => ({ ...f, technique_id: e.target.value }))}
                    placeholder="e.g. T1550.002"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Confidence</label>
                  <select
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none"
                    value={form.confidence}
                    onChange={e => setForm(f => ({ ...f, confidence: e.target.value }))}
                  >
                    <option>LOW</option>
                    <option>MEDIUM</option>
                    <option>HIGH</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Status</label>
                  <select
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none"
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  >
                    <option>OPEN</option>
                    <option>CONFIRMED</option>
                    <option>REFUTED</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase">Description</label>
                <textarea
                  className="mt-1 w-full px-2 py-1 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Supporting narrative..."
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase">Evidence References (one per line)</label>
                <textarea
                  className="mt-1 w-full px-2 py-1 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={2}
                  value={form.evidence_refs}
                  onChange={e => setForm(f => ({ ...f, evidence_refs: e.target.value }))}
                  placeholder="Event ID 4624 logon from DC01"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="tactical"
                  size="sm"
                  disabled={!form.title || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? "SAVING..." : "SAVE"}
                </Button>
                <Button variant="ghost" size="sm" onClick={resetForm}>CANCEL</Button>
              </div>
            </div>
          </TacticalPanel>
        )}

        <TacticalPanel title={`HYPOTHESES (${hypotheses.length})`} status={hypotheses.length > 0 ? "online" : "warning"}>
          {isLoading ? (
            <div className="font-mono text-xs text-muted-foreground py-4">LOADING...</div>
          ) : hypotheses.length === 0 ? (
            <div className="font-mono text-xs text-muted-foreground py-4">
              No hypotheses yet. Create one to track ATT&CK-framed investigation threads.
            </div>
          ) : (
            <div className="space-y-3">
              {hypotheses.map(h => (
                <div key={h.id} className="border border-border rounded-sm p-3 font-mono text-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {h.status === "CONFIRMED" ? (
                        <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                      ) : h.status === "REFUTED" ? (
                        <XCircle className="w-3 h-3 text-destructive shrink-0" />
                      ) : (
                        <Target className="w-3 h-3 shrink-0" />
                      )}
                      <span className="font-bold truncate">{h.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold ${CONFIDENCE_COLORS[h.confidence]}`}>
                        {h.confidence}
                      </span>
                      <StatusIndicator
                        status={h.status === "CONFIRMED" ? "verified" : h.status === "REFUTED" ? "offline" : "active"}
                        label={h.status}
                      />
                      {canEdit && (
                        <>
                          <button className="text-muted-foreground hover:text-foreground" onClick={() => handleEdit(h)}>
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button className="text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(h.id)}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {(h.tactic || h.technique_id) && (
                    <div className="text-muted-foreground">
                      {h.tactic && <span className="mr-3">{h.tactic}</span>}
                      {h.technique_id && <span className="text-primary font-bold">{h.technique_id}</span>}
                    </div>
                  )}
                  {h.description && <div className="text-muted-foreground">{h.description}</div>}
                  {h.evidence_refs.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {h.evidence_refs.map((ref, i) => (
                        <div key={i} className="text-muted-foreground">• {ref}</div>
                      ))}
                    </div>
                  )}
                  <KeyValueRow label="UPDATED:" value={new Date(h.updated_at).toLocaleString()} />
                </div>
              ))}
            </div>
          )}
        </TacticalPanel>
      </div>
    </AppLayout>
  );
}
 Here is the updated code:
...
import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
...
  const navigate = useNavigate();
  const { id: incidentId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { toast } = useToast();
...
    evidence_refs: "",
  });

  // Handle pre-filled data from URL
  useEffect(() => {
    const preTitle = searchParams.get("title");
    const preEvidence = searchParams.get("evidence");
    if (preTitle || preEvidence) {
      setForm((prev) => ({
        ...prev,
        title: preTitle || prev.title,
        evidence_refs: preEvidence || prev.evidence_refs,
      }));
      setShowForm(true);
    }
  }, [searchParams]);

  const { data: hypotheses = [], isLoading } = useQuery<Hypothesis[]>({
...