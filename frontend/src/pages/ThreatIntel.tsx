/**
 * ThreatIntel — IOC enrichment against VirusTotal and MISP (R-12).
 *
 * Configure VIRUSTOTAL_API_KEY and/or MISP_URL + MISP_API_KEY in your .env
 * to enable live lookups.  Without credentials the backend returns explanatory
 * errors rather than failing silently.
 */
import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import { Search, AlertTriangle, CheckCircle2, HelpCircle, ExternalLink } from "lucide-react";
import { apiPost } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

type EnrichResult = {
  ioc_type: string;
  ioc_value: string;
  service: string;
  found: boolean;
  score: number | null;
  labels: string[];
  permalink: string | null;
  raw: Record<string, unknown> | null;
  error: string | null;
};

const IOC_TYPES = ["hash", "ip", "domain", "url"] as const;

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground">—</span>;
  const cls = score >= 70 ? "text-destructive" : score >= 30 ? "text-yellow-500" : "text-primary";
  return <span className={`font-bold ${cls}`}>{score}% malicious</span>;
}

export default function ThreatIntel() {
  const { toast } = useToast();
  const [iocType, setIocType] = useState<string>("hash");
  const [iocValue, setIocValue] = useState("");
  const [results, setResults] = useState<EnrichResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ value: string; type: string }>>([]);

  const handleEnrich = async () => {
    const value = iocValue.trim();
    if (!value) return;
    setIsLoading(true);
    setResults([]);
    try {
      const data = await apiPost<EnrichResult[]>("/threat-intel/enrich", {
        ioc_type: iocType,
        ioc_value: value,
      });
      setResults(data);
      setHistory((h) => [{ value, type: iocType }, ...h.filter((x) => x.value !== value).slice(0, 19)]);
    } catch (err) {
      toast({
        title: "Enrichment failed",
        description: err instanceof Error ? err.message.slice(0, 200) : undefined,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const PLACEHOLDERS: Record<string, string> = {
    hash: "d41d8cd98f00b204e9800998ecf8427e...",
    ip: "1.2.3.4",
    domain: "evil.example.com",
    url: "https://evil.example.com/payload.exe",
  };

  return (
    <AppLayout title="THREAT INTELLIGENCE" subtitle="IOC enrichment — VirusTotal · MISP">
      <div className="p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">
        <TacticalPanel title="IOC LOOKUP" status="active">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none"
              value={iocType}
              onChange={(e) => setIocType(e.target.value)}
            >
              {IOC_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
            <input
              className="flex-1 min-w-[200px] h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={PLACEHOLDERS[iocType] ?? "IOC value..."}
              value={iocValue}
              onChange={(e) => setIocValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleEnrich(); }}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              variant="tactical"
              size="sm"
              disabled={!iocValue.trim() || isLoading}
              onClick={() => void handleEnrich()}
            >
              <Search className="w-4 h-4 mr-2" />
              {isLoading ? "ENRICHING..." : "ENRICH"}
            </Button>
          </div>

          {history.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap items-center">
              <span className="font-mono text-xs text-muted-foreground shrink-0">Recent:</span>
              {history.slice(0, 8).map((h, i) => (
                <button
                  key={i}
                  className="font-mono text-xs px-1.5 py-0.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-primary/40 truncate max-w-[160px]"
                  onClick={() => { setIocType(h.type); setIocValue(h.value); }}
                  title={h.value}
                >
                  [{h.type}] {h.value.slice(0, 16)}{h.value.length > 16 ? "…" : ""}
                </button>
              ))}
            </div>
          )}
        </TacticalPanel>

        {results.length > 0 && (
          <TacticalPanel
            title={`RESULTS — ${iocType.toUpperCase()}: ${iocValue.slice(0, 48)}${iocValue.length > 48 ? "…" : ""}`}
            status={results.some((r) => r.found && (r.score ?? 0) >= 50) ? "offline" : "online"}
          >
            <div className="space-y-3">
              {results.map((r, i) => {
                const isMalicious = r.found && (r.score ?? 0) >= 50;
                const isWarning = r.found && (r.score ?? 0) >= 20 && (r.score ?? 0) < 50;
                return (
                  <div
                    key={i}
                    className={`border rounded-sm p-3 font-mono text-xs space-y-2 ${
                      r.error ? "border-border/40 opacity-70" :
                      !r.found ? "border-primary/30 bg-primary/5" :
                      isMalicious ? "border-destructive/50 bg-destructive/5" :
                      isWarning ? "border-yellow-500/40 bg-yellow-500/5" :
                      "border-primary/30 bg-primary/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {r.error ? (
                          <HelpCircle className="w-3 h-3 text-muted-foreground shrink-0" />
                        ) : !r.found ? (
                          <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                        ) : (
                          <AlertTriangle className={`w-3 h-3 shrink-0 ${isMalicious ? "text-destructive" : "text-yellow-500"}`} />
                        )}
                        <span className="font-bold uppercase tracking-wider">{r.service}</span>
                        <span className="text-muted-foreground">—</span>
                        {r.error ? (
                          <span className="text-muted-foreground text-xs">{r.error}</span>
                        ) : !r.found ? (
                          <span className="text-primary">NOT FOUND (clean)</span>
                        ) : (
                          <ScoreBadge score={r.score} />
                        )}
                      </div>
                      {r.permalink && (
                        <a
                          href={r.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-muted-foreground hover:text-primary shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="text-xs">VIEW</span>
                        </a>
                      )}
                    </div>
                    {r.labels.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {r.labels.slice(0, 12).map((l) => (
                          <span key={l} className="px-1.5 py-0.5 bg-secondary rounded text-[10px] text-muted-foreground">
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.raw && (
                      <div className="text-muted-foreground text-xs">
                        {Object.entries(r.raw).map(([k, v]) => (
                          <span key={k} className="mr-3">
                            {k.replace(/_/g, " ").toUpperCase()}:{" "}
                            <span className="text-foreground font-bold">{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TacticalPanel>
        )}
      </div>
    </AppLayout>
  );
}
