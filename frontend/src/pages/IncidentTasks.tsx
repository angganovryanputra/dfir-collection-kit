import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, CheckCircle2, Circle, Plus, Loader2 } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { getStoredRole } from "@/lib/auth";

type Task = { id: string; title: string; description?: string | null; status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED"; assignee?: string | null; due_at?: string | null };

export default function IncidentTasks() {
  const { id: incidentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEdit = ["admin", "operator"].includes(getStoredRole() ?? "");
  const [title, setTitle] = useState("");
  const { data: tasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["incident-tasks", incidentId], queryFn: () => apiGet<Task[]>(`/platform/incidents/${incidentId}/tasks`), enabled: !!incidentId });
  const create = useMutation({ mutationFn: () => apiPost(`/platform/incidents/${incidentId}/tasks`, { title: title.trim() }), onSuccess: () => { setTitle(""); qc.invalidateQueries({ queryKey: ["incident-tasks", incidentId] }); } });
  const update = useMutation({ mutationFn: ({ id, status }: { id: string; status: Task["status"] }) => apiPatch(`/platform/incidents/${incidentId}/tasks/${id}`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ["incident-tasks", incidentId] }) });
  return <AppLayout title="INVESTIGATION TASKS" subtitle={`INCIDENT: ${incidentId}`} headerActions={<Button variant="ghost" size="sm" onClick={() => navigate(`/incidents/${incidentId}`)}><ChevronLeft className="w-4 h-4 mr-2" /> BACK</Button>}>
    <div className="p-6 max-w-3xl mx-auto w-full space-y-6">
      {canEdit && <div className="flex gap-2"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add investigation task..." onKeyDown={e => { if (e.key === "Enter" && title.trim()) create.mutate(); }} /><Button variant="tactical" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}><Plus className="w-4 h-4 mr-1" /> ADD</Button></div>}
      <TacticalPanel title={`TASK CHECKLIST (${tasks.length})`} status={isLoading ? "active" : "online"}>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : tasks.length === 0 ? <div className="text-xs text-muted-foreground font-mono">No investigation tasks.</div> : <div className="space-y-2">{tasks.map(task => <div key={task.id} className="flex items-center gap-3 border border-border/40 rounded-sm p-3 font-mono text-xs"><button disabled={!canEdit} onClick={() => update.mutate({ id: task.id, status: task.status === "DONE" ? "OPEN" : "DONE" })} aria-label={`Mark ${task.title} ${task.status === "DONE" ? "open" : "done"}`} className="text-primary">{task.status === "DONE" ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}</button><span className={task.status === "DONE" ? "line-through text-muted-foreground" : "text-foreground"}>{task.title}</span><span className="ml-auto text-[9px] text-muted-foreground">{task.status}</span></div>)}</div>}
      </TacticalPanel>
    </div>
  </AppLayout>;
}
