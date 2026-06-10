/**
 * SIEMExport — push super timeline events to Splunk, Elastic, or Timesketch
 * and export incident to case management systems (TheHive, Jira, Slack).
 */
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { 
    ChevronLeft, Share2, CheckCircle2, XCircle, Loader2, 
    Database, ExternalLink, Settings2, ShieldAlert, Zap
} from "lucide-react";
import { apiPost, apiGet } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    apiGet<{ timesketch_url?: string | null; timesketch_token?: string }>("/admin/settings")
      .then((s) => {
        setCfg((c) => ({
          ...c,
          ...(s.timesketch_url ? { timesketch_url: s.timesketch_url } : {}),
          // token comes back masked as "***" — don't pre-fill if masked
          ...(s.timesketch_token && s.timesketch_token !== "***" ? { timesketch_token: s.timesketch_token } : {}),
        }));
      })
      .catch(() => { /* settings fetch is best-effort */ });
  }, []);

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
      toast({ title: "Telemetri Terkirim", description: `${r.sent.toLocaleString()} event berhasil di-push ke ${siemTarget.toUpperCase()}.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 200) : "Export failed";
      setSiemResult({ error: msg });
      toast({ title: "Export Gagal", description: msg, variant: "destructive" });
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
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{label}</label>
      <input
        type={pw ? "password" : "text"}
        className="w-full h-8 px-3 bg-secondary/10 border border-border/60 rounded-sm font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:bg-secondary/20 transition-all placeholder:text-muted-foreground/30"
        value={cfg[key]}
        onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value }))}
        placeholder={pw ? "••••••••••••" : ""}
      />
    </div>
  );

  return (
    <AppLayout
      title="TELEMETRY_EXPORT_CENTER"
      subtitle={`SECTOR: ${incidentId}`}
      headerActions={
        <Button variant="ghost" size="sm" onClick={() => navigate(`/incidents/${incidentId}`)} className="h-8 text-[10px] font-bold border border-border/40 hover:bg-secondary/40">
          <ChevronLeft className="w-3.5 h-3.5 mr-1" /> BACK TO HUB
        </Button>
      }
    >
      <div className="p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full animate-in fade-in duration-300">
        {/* SIEM Section */}
        <TacticalPanel title="SIEM_INTEGRATION_STREAM" status="active">
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-border/40">
                <div className="flex items-center gap-1.5 bg-secondary/30 p-1 rounded-sm border border-border/20">
                    {(["splunk", "elastic", "timesketch"] as SIEMTarget[]).map((t) => (
                        <button 
                            key={t}
                            className={cn(
                                "px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all",
                                siemTarget === t ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(21,245,116,0.2)]" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                            )}
                            onClick={() => setSiemTarget(t)}
                        >
                            {t}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Stream Volume:</span>
                    <select 
                        className="h-8 px-2 bg-secondary/20 border border-border/40 rounded-sm font-mono text-[10px] focus:outline-none"
                        value={maxEvents}
                        onChange={(e) => setMaxEvents(parseInt(e.target.value, 10))}
                    >
                        {[1000, 5000, 10000, 50000, 100000].map((n) => <option key={n} value={n}>{n.toLocaleString()} EVENTS</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {siemTarget === "splunk" && <>{field("Splunk HEC URL *", "splunk_hec_url")}{field("HEC Access Token *", "splunk_hec_token", true)}</>}
              {siemTarget === "elastic" && <>{field("Elasticsearch Node URL *", "elastic_url")}{field("Target Index *", "elastic_index")}{field("Cloud API Key", "elastic_api_key", true)}</>}
              {siemTarget === "timesketch" && <>{field("Timesketch Server URL *", "timesketch_url")}{field("API Auth Token *", "timesketch_token", true)}{field("Sketch ID Mapping *", "timesketch_sketch_id")}</>}
            </div>

            <div className="pt-4 space-y-4">
                <div className="flex items-center gap-4">
                    <Button variant="tactical" size="lg" disabled={isExporting} onClick={handleSIEM} className="h-10 px-8 gap-2 group">
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                        <span className="font-bold text-[11px] tracking-[0.2em] uppercase">Initialize Export</span>
                    </Button>
                    
                    {isExporting && (
                        <div className="flex-1 space-y-1.5">
                            <div className="flex justify-between text-[9px] font-mono text-primary animate-pulse uppercase font-bold">
                                <span>Piping Evidence Stream...</span>
                                <span>EST: 4s</span>
                            </div>
                            <div className="h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                                <div className="h-full bg-primary animate-progress-indeterminate shadow-[0_0_10px_rgba(21,245,116,0.5)]" />
                            </div>
                        </div>
                    )}

                    {siemResult && !isExporting && (
                        <div className={cn(
                            "flex items-center gap-2 px-4 py-2 border rounded-sm animate-in zoom-in-95 duration-200",
                            siemResult.error ? "border-red-500/30 bg-red-500/5 text-red-400" : "border-green-500/30 bg-green-500/5 text-green-400"
                        )}>
                            {siemResult.error ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            <span className="font-mono text-[10px] font-bold uppercase tracking-tight">
                                {siemResult.error ? `FAILURE: ${siemResult.error}` : `SUCCESS: ${siemResult.sent?.toLocaleString()} OBJECTS SYNCED`}
                            </span>
                        </div>
                    )}
                </div>
                
                {!isExporting && !siemResult && (
                    <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/10 rounded-sm">
                        <Zap className="w-3.5 h-3.5 text-primary/60" />
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                            Destination mapping for <span className="text-foreground font-bold uppercase tracking-tighter">{siemTarget}</span> is ready. Ensure network routes allow outbound traffic from the backend server.
                        </p>
                    </div>
                )}
            </div>
          </div>
        </TacticalPanel>

        {/* Case Management Section */}
        <TacticalPanel title="MULTI_PLATFORM_CASE_SYNC" status="warning">
          <div className="space-y-5">
            <div className="flex items-start gap-4">
                <div className="p-2.5 bg-warning/10 border border-warning/20 rounded-sm text-warning shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-tight text-foreground">External Case Integration</div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed max-w-2xl">
                        Synchronize incident metadata and executive summary with <span className="text-warning font-medium">TheHive, Jira, and Slack</span>. 
                        Credentials must be pre-configured in the platform environment settings for the sync to initialize.
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" disabled={isCaseExporting} onClick={handleCaseExport} className="h-9 px-5 gap-2 border-border/60 hover:bg-secondary/40 font-bold text-[10px] uppercase tracking-widest">
                    {isCaseExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    {isCaseExporting ? "Syncing..." : "Broadcast Case Sync"}
                </Button>
                {isCaseExporting && <span className="font-mono text-[9px] text-muted-foreground animate-pulse uppercase tracking-[0.2em]">Contacting configured endpoints...</span>}
            </div>

            {caseResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {caseResults.map((r, i) => (
                  <div key={i} className={cn(
                      "p-3 border rounded-sm flex flex-col gap-2 relative overflow-hidden transition-all hover:scale-[1.02]",
                      r.success ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
                  )}>
                    <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-[10px] uppercase tracking-widest">{r.service ?? `Service-${i}`}</span>
                        {r.success ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                    {r.success ? (
                        <div className="space-y-2">
                            <div className="text-[10px] text-primary font-mono font-bold tracking-tighter">ID: {r.external_id ? `#${r.external_id}` : "SYNC_OK"}</div>
                            {r.url && (
                                <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[9px] text-muted-foreground hover:text-primary transition-colors group">
                                    OPEN IN PLATFORM <ExternalLink className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" />
                                </a>
                            )}
                        </div>
                    ) : (
                        <div className="text-[9px] text-red-400 font-mono leading-tight uppercase">Error: {r.error || "Unknown Failure"}</div>
                    )}
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
