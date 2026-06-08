import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/StatusIndicator";
import { KeyValueRow } from "@/components/common/KeyValueRow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Plus, Edit2, Trash2, Target, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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
            <div className="space-y-4 font-mono text-sm">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Title *</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Attacker used Pass-the-Hash for lateral movement"
                  className="h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">MITRE Tactic</Label>
                  <Select 
                    value={form.tactic} 
                    onValueChange={val => setForm(f => ({ ...f, tactic: val }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="— select —" />
                    </SelectTrigger>
                    <SelectContent>
                      {MITRE_TACTICS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Technique ID</Label>
                  <Input
                    value={form.technique_id}
                    onChange={e => setForm(f => ({ ...f, technique_id: e.target.value }))}
                    placeholder="e.g. T1550.002"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Confidence</Label>
                  <Select 
                    value={form.confidence} 
                    onValueChange={(val: any) => setForm(f => ({ ...f, confidence: val }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">LOW</SelectItem>
                      <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                      <SelectItem value="HIGH">HIGH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Status</Label>
                  <Select 
                    value={form.status} 
                    onValueChange={(val: any) => setForm(f => ({ ...f, status: val }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">OPEN</SelectItem>
                      <SelectItem value="CONFIRMED">CONFIRMED</SelectItem>
                      <SelectItem value="REFUTED">REFUTED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Description</Label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Supporting narrative..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Evidence References (one per line)</Label>
                <Textarea
                  rows={2}
                  value={form.evidence_refs}
                  onChange={e => setForm(f => ({ ...f, evidence_refs: e.target.value }))}
                  placeholder="Event ID 4624 logon from DC01"
                  className="min-h-[60px]"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-border/40">
                <Button
                  variant="tactical"
                  size="sm"
                  disabled={!form.title || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  className="gap-2"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : null}
                  {saveMutation.isPending ? "SAVING..." : "SAVE HYPOTHESIS"}
                </Button>
                <Button variant="ghost" size="sm" onClick={resetForm}>CANCEL</Button>
              </div>
            </div>
          </TacticalPanel>
        )}

        <TacticalPanel title={`HYPOTHESES (${hypotheses.length})`} status={hypotheses.length > 0 ? "online" : "warning"}>
          {isLoading ? (
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground py-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              LOADING...
            </div>
          ) : hypotheses.length === 0 ? (
            <div className="font-mono text-xs text-muted-foreground py-4 italic">
              No hypotheses yet. Create one to track ATT&CK-framed investigation threads.
            </div>
          ) : (
            <div className="space-y-3">
              {hypotheses.map(h => (
                <div key={h.id} className="border border-border rounded-sm p-4 font-mono text-xs space-y-3 bg-secondary/5 hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      {h.status === "CONFIRMED" ? (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      ) : h.status === "REFUTED" ? (
                        <XCircle className="w-4 h-4 text-destructive shrink-0" />
                      ) : (
                        <Target className="w-4 h-4 text-orange-400 shrink-0" />
                      )}
                      <span className="font-bold text-sm truncate">{h.title}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 border border-current rounded-sm ${CONFIDENCE_COLORS[h.confidence]}`}>
                        {h.confidence} CONFIDENCE
                      </span>
                      <StatusIndicator
                        status={h.status === "CONFIRMED" ? "verified" : h.status === "REFUTED" ? "offline" : "active"}
                        label={h.status}
                      />
                      {canEdit && (
                        <div className="flex items-center gap-1 ml-1 border-l border-border/40 pl-2">
                          <button 
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors" 
                            onClick={() => handleEdit(h)}
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors" 
                            onClick={() => deleteMutation.mutate(h.id)}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {(h.tactic || h.technique_id) && (
                    <div className="flex gap-4 border-b border-border/20 pb-2">
                      {h.tactic && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase">Tactic</span>
                          <span className="text-foreground">{h.tactic}</span>
                        </div>
                      )}
                      {h.technique_id && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase">Technique</span>
                          <span className="text-primary font-bold">{h.technique_id}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {h.description && (
                    <p className="text-muted-foreground leading-relaxed italic border-l-2 border-primary/20 pl-3">
                      {h.description}
                    </p>
                  )}

                  {h.evidence_refs.length > 0 && (
                    <div className="space-y-1.5 bg-secondary/10 p-2 rounded-sm border border-border/30">
                      <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Evidence Items</div>
                      <div className="space-y-1">
                        {h.evidence_refs.map((ref, i) => (
                          <div key={i} className="text-muted-foreground flex gap-2">
                            <span className="text-primary/50 text-[10px]">•</span>
                            <span className="flex-1">{ref}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <KeyValueRow label="LAST UPDATE:" value={new Date(h.updated_at).toLocaleString()} />
                  </div>
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