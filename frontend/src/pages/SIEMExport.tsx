/**
 * SIEMExport — push super timeline events to Splunk, Elastic, or Timesketch
 * and export incident to case management systems (TheHive, Jira, Slack).
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Share2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

type ExportResult = {
  success: boolean;
  service?: string;
  error?: string;
  external_id?: string;
  url?: string;
};

type SIEMTarget = "splunk" | "elastic" | "timesketch";

export default function SIEMExport() {
  const navigate = useNavigate();
  const { id: incidentId } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [siemTarget, setSiemTarget] = useState<SIEMTarget>("splunk");
  const [maxEvents, setMaxEvents] = useState(10000);
  const [cfg, setCfg] = useState({
    splunk_hec_url: "", splunk_hec_token: "",
    elastic_url: "", elastic_index: "dfir-events", elastic_api_key: "",
    timesketch_url: "", timesketch_token: "", timesketch_sketch_id: "1",
  });
  const [siemResult, setSiemResult] = useState<{ sent?: number; error?: string } | null>(null);
  const [caseResults, setCaseResults] = useState<ExportResult[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isCaseExporting, setIsCaseExporting] = useState(false);

  const handleSIEM = async () => {
    setIsExporting(true);
    setSiemResult(null);
    try {
      const body: Record<string, unknown> = { target: siemTarget, incident_id: incidentId, max_events: maxEvents };
      if (siemTarget === "splunk") { body.splunk_hec_url = cfg.splunk_hec_url; body.splunk_hec_token = cfg.splunk_hec_token; }
      else if (siemTarget === "elastic") { body.elastic_url = cfg.elastic_url; body.elastic_index = cfg.elastic_index; if (cfg.elastic_api_key) body.elastic_api_key = cfg.elastic_api_key; }
      else { body.timesketch_url = cfg.timesketch_url; body.timesketch_token = cfg.timesketch_token; body.timesketch_sketch_id = parseInt(cfg.timesketch_sketch_id, 10) || 1; }
      const r = await apiPost<{ sent: number }>("/platform/siem-export", body);
      setSiemResult({ sent: r.sent });
      toast({ title: `Exported ${r.sent.toLocaleString()} events to ${siemTarget}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 200) : "Export failed";
      setSiemResult({ error: msg });
      toast({ title: "Export failed", description: msg, variant: "destructive" });
    } finally { setIsExporting(false); }
  };

  const handleCaseExport = async () => {
    setIsCaseExporting(true);
    setCaseResults([]);
    try {
      const results = await apiPost<ExportResult[]>(`/case/export/all/${incidentId}`, {});
      setCaseResults(results);
    } catch {
      toast({ title: "Case export failed", variant: "destructive" });
    } finally { setIsCaseExporting(false); }
  };

  const field = (label: string, key: keyof typeof cfg, pw = false) => (
    <div>
      <label className="text-xs text-muted-foreground uppercase">{label}</label>
      <input
        type={pw ? "password" : "text"}
        className="mt-1 w-full h-7 px-2 bg-background border border-input rounded-sm text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        value={cfg[key]}
        onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <AppLayout
      title="EXPORT"
      subtitle={`INCIDENT: ${incidentId}`}
      headerActions={
        <Button variant="ghost" size="sm" onClick={() => navigate(`/incidents/${incidentId}`)}>
          <ChevronLeft className="w-4 h-4 mr-2" />BACK
        </Button>
      }
    >
      <div className="p-6 flex flex-col gap-6 max-w-3xl mx-auto w-full">
        {/* SIEM */}
        <TacticalPanel title="SIEM EXPORT" status="active">
          <div className="space-y-3 font-mono text-sm">
            <div className="flex items-center gap-3 flex-wrap">
              {(["splunk", "elastic", "timesketch"] as SIEMTarget[]).map((t) => (
                <button key={t}
                  className={`px-3 py-1 border rounded-sm text-xs font-bold uppercase ${siemTarget === t ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  onClick={() => setSiemTarget(t)}>{t}</button>
              ))}
              <div className="ml-auto flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Max events:</span>
                <select className="h-7 px-1 bg-background border border-input rounded-sm text-xs" value={maxEvents}
                  onChange={(e) => setMaxEvents(parseInt(e.target.value, 10))}>
                  {[1000, 5000, 10000, 50000, 100000].map((n) => <option key={n} value={n}>{n.toLocaleString()}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {siemTarget === "splunk" && <>{field("HEC URL *", "splunk_hec_url")}{field("HEC Token *", "splunk_hec_token", true)}</>}
              {siemTarget === "elastic" && <>{field("Elastic URL *", "elastic_url")}{field("Index *", "elastic_index")}{field("API Key", "elastic_api_key", true)}</>}
              {siemTarget === "timesketch" && <>{field("Timesketch URL *", "timesketch_url")}{field("Token *", "timesketch_token", true)}{field("Sketch ID *", "timesketch_sketch_id")}</>}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="tactical" size="sm" disabled={isExporting} onClick={handleSIEM}>
                <Share2 className="w-3 h-3 mr-2" />
                {isExporting ? "EXPORTING..." : `PUSH TO ${siemTarget.toUpperCase()}`}
              </Button>
              {siemResult && (
                <span className={`text-xs font-mono ${siemResult.error ? "text-destructive" : "text-primary"}`}>
                  {siemResult.error ? `Error: ${siemResult.error}` : `✓ ${siemResult.sent?.toLocaleString()} events sent`}
                </span>
              )}
            </div>
          </div>
        </TacticalPanel>

        {/* Case Management */}
        <TacticalPanel title="CASE MANAGEMENT EXPORT" status="warning">
          <div className="space-y-3 font-mono text-sm">
            <div className="text-xs text-muted-foreground">
              Export to TheHive, Jira, and Slack simultaneously. Configure credentials in .env:
              THEHIVE_URL+THEHIVE_API_KEY, JIRA_URL+JIRA_EMAIL+JIRA_API_TOKEN, SLACK_WEBHOOK_URL.
            </div>
            <Button variant="outline" size="sm" disabled={isCaseExporting} onClick={handleCaseExport}>
              {isCaseExporting ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Share2 className="w-3 h-3 mr-2" />}
              {isCaseExporting ? "EXPORTING..." : "EXPORT TO ALL CONFIGURED SERVICES"}
            </Button>
            {caseResults.length > 0 && (
              <div className="space-y-1.5">
                {caseResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {r.success ? <CheckCircle2 className="w-3 h-3 text-primary shrink-0" /> : <XCircle className="w-3 h-3 text-destructive shrink-0" />}
                    <span className="font-bold uppercase shrink-0">{r.service ?? `svc-${i}`}</span>
                    {r.success
                      ? <span className="text-primary">{r.external_id ? `#${r.external_id}` : "OK"}</span>
                      : <span className="text-destructive">{r.error}</span>}
                    {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary underline truncate">{r.url}</a>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TacticalPanel>
      </div>
    </AppLayout>
  );
}
