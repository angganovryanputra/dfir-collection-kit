import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Lock, Unlock, Plus } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { KeyValueRow } from "@/components/common/KeyValueRow";

type LegalHold = {
  id: string;
  incident_id: string;
  reason: string;
  custodian: string;
  retention_days: number;
  status: "ACTIVE" | "RELEASED" | "EXPIRED";
  created_by: string;
  created_at: string;
  expires_at: string | null;
  released_at: string | null;
};

export default function LegalHolds() {
  const navigate = useNavigate();
  const { id: incidentId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = getStoredRole() === "admin";

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ reason: "", custodian: "", retention_days: "0" });

  const { data: holds = [], isLoading } = useQuery<LegalHold[]>({
    queryKey: ["legal-holds", incidentId],
    queryFn: () => apiGet<LegalHold[]>(`/platform/incidents/${incidentId}/legal-holds`),
    enabled: !!incidentId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost(`/platform/incidents/${incidentId}/legal-holds`, {
        reason: form.reason,
        custodian: form.custodian,
        retention_days: parseInt(form.retention_days) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["legal-holds", incidentId] });
      toast({ title: "Legal hold created" });
      setForm({ reason: "", custodian: "", retention_days: "0" });
      setShowForm(false);
    },
    onError: () => toast({ title: "Failed to create legal hold", variant: "destructive" }),
  });

  const releaseMutation = useMutation({
    mutationFn: (holdId: string) =>
      apiPost(`/platform/incidents/${incidentId}/legal-holds/${holdId}/release`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["legal-holds", incidentId] });
      toast({ title: "Legal hold released" });
    },
    onError: () => toast({ title: "Failed to release hold", variant: "destructive" }),
  });

  const activeHolds = holds.filter(h => h.status === "ACTIVE");

  return (
    <AppLayout
      title="LEGAL HOLDS"
      subtitle={`INCIDENT: ${incidentId}`}
      headerActions={
        <Button variant="ghost" size="sm" onClick={() => navigate(`/incidents/${incidentId}`)}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          BACK
        </Button>
      }
    >
      <div className="p-6 flex flex-col gap-6 max-w-3xl mx-auto w-full">
        {isAdmin && (
          <div className="flex justify-end">
            <Button variant="tactical" size="sm" onClick={() => setShowForm(s => !s)}>
              <Plus className="w-4 h-4 mr-2" />
              NEW HOLD
            </Button>
          </div>
        )}

        {showForm && (
          <TacticalPanel title="CREATE LEGAL HOLD" status="active">
            <div className="space-y-3 font-mono text-sm">
              <div>
                <label className="text-xs text-muted-foreground uppercase">Reason *</label>
                <textarea
                  className="mt-1 w-full px-2 py-1 bg-background border border-input rounded-sm text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={2}
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Legal hold reason..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Custodian *</label>
                  <input
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.custodian}
                    onChange={e => setForm(f => ({ ...f, custodian: e.target.value }))}
                    placeholder="Legal hold owner"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase">Retention Days (0=indefinite)</label>
                  <input
                    type="number"
                    min="0"
                    className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.retention_days}
                    onChange={e => setForm(f => ({ ...f, retention_days: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="tactical"
                  size="sm"
                  disabled={!form.reason || !form.custodian || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? "CREATING..." : "CREATE HOLD"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>CANCEL</Button>
              </div>
            </div>
          </TacticalPanel>
        )}

        <TacticalPanel
          title={`LEGAL HOLDS (${holds.length}) — ${activeHolds.length} ACTIVE`}
          status={activeHolds.length > 0 ? "offline" : "online"}
        >
          {isLoading ? (
            <div className="font-mono text-xs text-muted-foreground py-4">LOADING...</div>
          ) : holds.length === 0 ? (
            <div className="font-mono text-xs text-muted-foreground py-4">
              No legal holds. Evidence is subject to standard retention policy.
            </div>
          ) : (
            <div className="space-y-3">
              {holds.map(h => (
                <div
                  key={h.id}
                  className={`border rounded-sm p-3 font-mono text-xs space-y-2 ${
                    h.status === "ACTIVE"
                      ? "border-destructive/50 bg-destructive/5"
                      : "border-border/40 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {h.status === "ACTIVE" ? (
                        <Lock className="w-3 h-3 text-destructive shrink-0" />
                      ) : (
                        <Unlock className="w-3 h-3 shrink-0" />
                      )}
                      <span className={`font-bold ${h.status === "ACTIVE" ? "text-destructive" : "text-muted-foreground"}`}>
                        {h.status}
                      </span>
                      <span className="text-muted-foreground">— {h.id}</span>
                    </div>
                    {isAdmin && h.status === "ACTIVE" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        disabled={releaseMutation.isPending}
                        onClick={() => releaseMutation.mutate(h.id)}
                      >
                        RELEASE
                      </Button>
                    )}
                  </div>
                  <div className="text-muted-foreground">{h.reason}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    <KeyValueRow label="CUSTODIAN:" value={h.custodian} />
                    <KeyValueRow
                      label="RETENTION:"
                      value={h.retention_days === 0 ? "INDEFINITE" : `${h.retention_days} days`}
                    />
                    <KeyValueRow label="CREATED:" value={new Date(h.created_at).toLocaleDateString()} />
                    {h.expires_at && (
                      <KeyValueRow label="EXPIRES:" value={new Date(h.expires_at).toLocaleDateString()} />
                    )}
                    {h.released_at && (
                      <KeyValueRow label="RELEASED:" value={new Date(h.released_at).toLocaleDateString()} />
                    )}
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
