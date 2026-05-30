import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Plus, Trash2, ToggleLeft, ToggleRight, Clock } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { KeyValueRow } from "@/components/common/KeyValueRow";

type ScheduledCollection = {
  id: string;
  incident_id: string;
  cron_expr: string;
  profile: string | null;
  module_ids: string[];
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_by: string;
  created_at: string;
};

const PROFILES = ["triage", "ransomware", "insider_threat", "full"];
const CRON_PRESETS = [
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily 02:00", value: "0 2 * * *" },
  { label: "Weekly Mon 02:00", value: "0 2 * * 1" },
  { label: "Monthly 1st", value: "0 2 1 * *" },
];

function humanizeCron(expr: string): string {
  const found = CRON_PRESETS.find((p) => p.value === expr.trim());
  return found ? found.label : expr;
}

export default function ScheduledCollections() {
  const navigate = useNavigate();
  const { id: incidentId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const role = getStoredRole();
  const canEdit = role === "admin" || role === "operator";

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    cron_expr: "0 2 * * *",
    profile: "triage",
    enabled: true,
  });

  const queryKey = ["scheduled-collections", incidentId ?? "all"];

  const { data: schedules = [], isLoading } = useQuery<ScheduledCollection[]>({
    queryKey,
    queryFn: () => {
      const url = incidentId
        ? `/platform/scheduled-collections?incident_id=${encodeURIComponent(incidentId)}`
        : "/platform/scheduled-collections";
      return apiGet<ScheduledCollection[]>(url);
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost("/platform/scheduled-collections", {
        incident_id: incidentId,
        cron_expr: form.cron_expr,
        profile: form.profile || null,
        module_ids: [],
        enabled: form.enabled,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Scheduled collection created" });
      setShowForm(false);
    },
    onError: (err) =>
      toast({
        title: "Failed to create schedule",
        description: err instanceof Error ? err.message.slice(0, 200) : undefined,
        variant: "destructive",
      }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      apiPatch(`/platform/scheduled-collections/${id}/toggle`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: () => toast({ title: "Toggle failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/platform/scheduled-collections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Schedule deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  return (
    <AppLayout
      title="SCHEDULED COLLECTIONS"
      subtitle={incidentId ? `INCIDENT: ${incidentId}` : "All scheduled collections"}
      headerActions={
        incidentId ? (
          <Button variant="ghost" size="sm" onClick={() => navigate(`/incidents/${incidentId}`)}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            BACK
          </Button>
        ) : undefined
      }
    >
      <div className="p-6 flex flex-col gap-6 max-w-3xl mx-auto w-full">
        {canEdit && incidentId && (
          <div className="flex justify-end">
            <Button variant="tactical" size="sm" onClick={() => setShowForm((s) => !s)}>
              <Plus className="w-4 h-4 mr-2" />
              NEW SCHEDULE
            </Button>
          </div>
        )}

        {showForm && (
          <TacticalPanel title="CREATE SCHEDULE" status="active">
            <div className="space-y-3 font-mono text-sm">
              <div>
                <label className="text-xs text-muted-foreground uppercase">Cron Expression *</label>
                <div className="mt-1 flex gap-2 flex-wrap">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      className={`px-2 py-0.5 text-xs border rounded-sm transition-colors ${
                        form.cron_expr === p.value
                          ? "border-primary text-primary bg-primary/10"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                      onClick={() => setForm((f) => ({ ...f, cron_expr: p.value }))}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  className="mt-2 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.cron_expr}
                  onChange={(e) => setForm((f) => ({ ...f, cron_expr: e.target.value }))}
                  placeholder="0 2 * * * (minute hour dom month dow)"
                />
                <div className="mt-1 text-xs text-muted-foreground">
                  → {humanizeCron(form.cron_expr)}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase">Collection Profile</label>
                <select
                  className="mt-1 w-full h-8 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none"
                  value={form.profile}
                  onChange={(e) => setForm((f) => ({ ...f, profile: e.target.value }))}
                >
                  {PROFILES.map((p) => (
                    <option key={p} value={p}>
                      {p.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sched-enabled"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
                <label htmlFor="sched-enabled" className="text-xs text-muted-foreground uppercase">
                  Enable immediately
                </label>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="tactical"
                  size="sm"
                  disabled={!form.cron_expr || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? "CREATING..." : "CREATE"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  CANCEL
                </Button>
              </div>
            </div>
          </TacticalPanel>
        )}

        <TacticalPanel
          title={`SCHEDULES (${schedules.length})`}
          status={schedules.some((s) => s.enabled) ? "active" : "warning"}
        >
          {isLoading ? (
            <div className="font-mono text-xs text-muted-foreground py-4 animate-pulse">LOADING...</div>
          ) : schedules.length === 0 ? (
            <div className="font-mono text-xs text-muted-foreground py-4">
              No scheduled collections. Create one to automatically re-collect on a cron schedule.
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((sc) => (
                <div
                  key={sc.id}
                  className={`border rounded-sm p-3 font-mono text-xs space-y-2 ${
                    sc.enabled
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/40 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Clock
                        className={`w-3 h-3 shrink-0 ${sc.enabled ? "text-primary animate-pulse" : "text-muted-foreground"}`}
                      />
                      <span className="font-bold">{humanizeCron(sc.cron_expr)}</span>
                      <span className="text-muted-foreground text-xs">({sc.cron_expr})</span>
                      {sc.profile && (
                        <span className="shrink-0 text-xs px-1.5 border border-border rounded text-muted-foreground">
                          {sc.profile.toUpperCase()}
                        </span>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          title={sc.enabled ? "Disable" : "Enable"}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => toggleMutation.mutate(sc.id)}
                        >
                          {sc.enabled ? (
                            <ToggleRight className="w-4 h-4 text-primary" />
                          ) : (
                            <ToggleLeft className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(sc.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    <KeyValueRow
                      label="LAST RUN:"
                      value={sc.last_run_at ? new Date(sc.last_run_at).toLocaleString() : "Never"}
                    />
                    <KeyValueRow
                      label="NEXT RUN:"
                      value={sc.next_run_at ? new Date(sc.next_run_at).toLocaleString() : "Pending"}
                    />
                    <KeyValueRow label="INCIDENT:" value={sc.incident_id} />
                    <KeyValueRow
                      label="STATUS:"
                      value={sc.enabled ? "ENABLED" : "DISABLED"}
                      valueClassName={sc.enabled ? "text-primary" : "text-muted-foreground"}
                    />
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
