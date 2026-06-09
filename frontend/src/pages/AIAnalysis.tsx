import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Brain, ChevronLeft, Loader2, AlertTriangle, Sparkles, FileText,
    MessageSquare, Copy, Check, RefreshCw, Send, Lightbulb,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnnotatedEvent {
    original: Record<string, unknown>;
    mitre_technique: string | null;
    mitre_tactic: string | null;
    description: string | null;
    severity: string | null;
}

type Tab = "annotate" | "summary" | "query";

const SEVERITY_COLORS: Record<string, string> = {
    critical: "text-red-400 border-red-400/40 bg-red-400/10",
    high:     "text-orange-400 border-orange-400/40 bg-orange-400/10",
    medium:   "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
    low:      "text-blue-400 border-blue-400/40 bg-blue-400/10",
};

const SAMPLE_EVENTS = JSON.stringify([
    {
        datetime: "2026-01-15T06:10:22Z",
        source: "Sysmon",
        host: "WORKSTATION-01",
        user: "svc_backup",
        event_id: "1",
        message: "Process Creation: mimikatz.exe CommandLine: sekurlsa::logonpasswords ParentImage: cmd.exe",
    },
    {
        datetime: "2026-01-15T06:14:08Z",
        source: "Security",
        host: "WORKSTATION-01",
        user: "svc_backup",
        event_id: "4648",
        message: "Logon attempt using explicit credentials: target DC01, username Administrator",
    },
    {
        datetime: "2026-01-15T06:18:45Z",
        source: "Sysmon",
        host: "DC01",
        user: "Administrator",
        event_id: "3",
        message: "Network connection: coral_reef_ransom.exe → 185.220.101.47:443",
    },
], null, 2);

// ─── LLM Error Helper ─────────────────────────────────────────────────────────

function LLMError({ message }: { message: string }) {
    const isConfig = message.includes("503") || message.toLowerCase().includes("llm") || message.toLowerCase().includes("api_key");
    return (
        <div className="flex items-start gap-3 p-4 border border-destructive/40 bg-destructive/5 rounded-sm font-mono text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
                <div className="font-bold text-xs uppercase mb-1">Error</div>
                {isConfig ? (
                    <span>
                        LLM not configured — set{" "}
                        <code className="bg-secondary/40 px-1">LLM_API_URL</code>,{" "}
                        <code className="bg-secondary/40 px-1">LLM_API_KEY</code>, and{" "}
                        <code className="bg-secondary/40 px-1">LLM_MODEL</code> in your{" "}
                        <code className="bg-secondary/40 px-1">.env</code> file.
                    </span>
                ) : message}
            </div>
        </div>
    );
}

// ─── Tab: Annotate ────────────────────────────────────────────────────────────

function AnnotateTab() {
    const [eventsJson, setEventsJson] = useState(SAMPLE_EVENTS);
    const [result, setResult] = useState<AnnotatedEvent[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleAnnotate = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const events = JSON.parse(eventsJson) as Record<string, unknown>[];
            const res = await apiPost<AnnotatedEvent[]>("/ai/annotate", { events, max_events: 20 });
            setResult(res);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Annotation failed");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!result) return;
        void navigator.clipboard.writeText(JSON.stringify(result, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col gap-4">
            <TacticalPanel title="EVENT INPUT" status="online">
                <div className="space-y-3">
                    <p className="font-mono text-[11px] text-muted-foreground">
                        Paste a JSON array of timeline events. The LLM will annotate each with MITRE ATT&amp;CK
                        technique, tactic, description, and severity. Max 20 events per request.
                    </p>
                    <textarea
                        value={eventsJson}
                        onChange={e => setEventsJson(e.target.value)}
                        rows={12}
                        spellCheck={false}
                        className="w-full bg-background border border-border p-3 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y rounded-sm placeholder:text-muted-foreground/40"
                        placeholder='[{"datetime": "...", "source": "...", "message": "..."}]'
                    />
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => void handleAnnotate()}
                            disabled={loading || !eventsJson.trim()}
                            className="gap-2 font-mono text-xs"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                            {loading ? "ANNOTATING…" : "ANNOTATE EVENTS"}
                        </Button>
                        {result && (
                            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2 font-mono text-xs">
                                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                COPY JSON
                            </Button>
                        )}
                    </div>
                </div>
            </TacticalPanel>

            {error && <LLMError message={error} />}

            {result && (
                <TacticalPanel title={`ANNOTATIONS — ${result.length} EVENT${result.length !== 1 ? "S" : ""}`} status="verified">
                    <div className="space-y-3">
                        {result.map((ann, i) => (
                            <div key={i} className="border border-border/40 bg-background/40 rounded-sm p-4 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="font-mono text-[11px] text-muted-foreground truncate flex-1">
                                        {String(ann.original["message"] ?? ann.original["datetime"] ?? `Event #${i + 1}`).slice(0, 120)}
                                    </div>
                                    {ann.severity && (
                                        <span className={cn(
                                            "shrink-0 px-2 py-0.5 rounded-sm border font-mono text-[9px] font-bold uppercase",
                                            SEVERITY_COLORS[ann.severity.toLowerCase()] ?? "border-border/40 text-muted-foreground"
                                        )}>
                                            {ann.severity}
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {ann.mitre_tactic && (
                                        <span className="px-2 py-0.5 bg-primary/10 border border-primary/30 rounded-sm font-mono text-[10px] text-primary">
                                            {ann.mitre_tactic}
                                        </span>
                                    )}
                                    {ann.mitre_technique && (
                                        <span className="px-2 py-0.5 bg-secondary/40 border border-border/40 rounded-sm font-mono text-[10px] text-foreground/70">
                                            {ann.mitre_technique}
                                        </span>
                                    )}
                                </div>
                                {ann.description && (
                                    <p className="font-mono text-[11px] text-foreground/80 leading-relaxed">
                                        {ann.description}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </TacticalPanel>
            )}
        </div>
    );
}

// ─── Tab: Summary ─────────────────────────────────────────────────────────────

function SummaryTab({ incidentId }: { incidentId: string }) {
    const [summary, setSummary] = useState<string | null>(null);
    const [model, setModel] = useState<string | null>(null);
    const [sampleEvents, setSampleEvents] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        setSummary(null);
        try {
            const res = await apiPost<{ summary: string; sample_events: number; model: string }>(
                `/ai/summary/${incidentId}`, {}
            );
            setSummary(res.summary);
            setModel(res.model);
            setSampleEvents(res.sample_events);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Summary generation failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <TacticalPanel title="EXECUTIVE SUMMARY GENERATOR" status="online">
                <div className="space-y-3">
                    <p className="font-mono text-[11px] text-muted-foreground">
                        Generates a 3–5 paragraph executive summary from the Super Timeline — covering attack
                        vector, key findings, and containment recommendations. Requires a built Super Timeline.
                    </p>
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => void handleGenerate()}
                            disabled={loading}
                            className="gap-2 font-mono text-xs"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {loading ? "GENERATING…" : "GENERATE SUMMARY"}
                        </Button>
                        {summary && (
                            <Button
                                variant="outline" size="sm"
                                onClick={() => { void navigator.clipboard.writeText(summary ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                                className="gap-2 font-mono text-xs"
                            >
                                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                COPY
                            </Button>
                        )}
                    </div>
                </div>
            </TacticalPanel>

            {error && <LLMError message={error} />}

            {summary && (
                <TacticalPanel title="EXECUTIVE SUMMARY" status="verified">
                    <div className="space-y-4">
                        {model && (
                            <div className="flex items-center gap-3 pb-3 border-b border-border/30">
                                <Brain className="w-3.5 h-3.5 text-primary" />
                                <span className="font-mono text-[10px] text-muted-foreground">
                                    Model: <span className="text-primary">{model}</span>
                                    {sampleEvents != null && <span> · {sampleEvents} events analysed</span>}
                                </span>
                            </div>
                        )}
                        <div>
                            {summary.split("\n\n").map((para, i) => (
                                <p key={i} className="font-mono text-[12px] text-foreground/85 leading-relaxed mb-3 last:mb-0">
                                    {para}
                                </p>
                            ))}
                        </div>
                    </div>
                </TacticalPanel>
            )}
        </div>
    );
}

// ─── Tab: NL Query ────────────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
    "What was the initial entry point?",
    "Which user accounts were compromised?",
    "What files were created or modified by the attacker?",
    "Was there any data exfiltration?",
    "What persistence mechanisms were established?",
];

function QueryTab({ incidentId }: { incidentId: string }) {
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState<string | null>(null);
    const [contextEvents, setContextEvents] = useState<number | null>(null);
    const [model, setModel] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);

    const handleQuery = async () => {
        if (!question.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const res = await apiPost<{ answer: string; context_events: number; model: string; question: string }>(
                "/ai/query",
                { incident_id: incidentId, question: question.trim(), context_limit: 25 }
            );
            setAnswer(res.answer);
            setContextEvents(res.context_events);
            setModel(res.model);
            setHistory(prev => [...prev, { q: question.trim(), a: res.answer }]);
            setQuestion("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Query failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {history.length > 0 && (
                <div className="space-y-4 border border-border/30 rounded-sm p-4 bg-background/30">
                    {history.map((item, i) => (
                        <div key={i} className="space-y-2">
                            <div className="flex items-start gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                <span className="font-mono text-[11px] text-primary/90 font-semibold">{item.q}</span>
                            </div>
                            <div className="ml-5 pl-3 border-l border-border/40">
                                <p className="font-mono text-[11px] text-foreground/80 leading-relaxed">{item.a}</p>
                            </div>
                        </div>
                    ))}
                    <div className="flex justify-end pt-1">
                        <button
                            onClick={() => setHistory([])}
                            className="font-mono text-[9px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        >
                            <RefreshCw className="w-2.5 h-2.5" /> CLEAR HISTORY
                        </button>
                    </div>
                </div>
            )}

            {history.length === 0 && (
                <TacticalPanel title="SUGGESTED QUESTIONS" status="online">
                    <div className="space-y-3">
                        <p className="font-mono text-[11px] text-muted-foreground">
                            Ask natural-language questions about the incident evidence. The LLM searches the
                            Super Timeline for relevant context to answer your question.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {SUGGESTED_QUESTIONS.map(q => (
                                <button
                                    key={q}
                                    onClick={() => setQuestion(q)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border/40 hover:border-primary/50 bg-secondary/20 hover:bg-primary/5 font-mono text-[10px] text-muted-foreground hover:text-primary transition-all rounded-sm"
                                >
                                    <Lightbulb className="w-3 h-3" />
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                </TacticalPanel>
            )}

            {answer && (
                <div className="border border-primary/20 bg-primary/5 rounded-sm p-4 space-y-2">
                    <div className="flex items-center gap-3 font-mono text-[9px] text-muted-foreground">
                        <Brain className="w-3 h-3 text-primary" />
                        {model && <span>Model: <span className="text-primary">{model}</span></span>}
                        {contextEvents != null && <span>· {contextEvents} events used as context</span>}
                    </div>
                    <p className="font-mono text-[12px] text-foreground/85 leading-relaxed">{answer}</p>
                </div>
            )}

            {error && <LLMError message={error} />}

            <div className="flex gap-3">
                <input
                    type="text"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !loading) void handleQuery(); }}
                    placeholder="Ask anything about this incident…"
                    className="flex-1 bg-background border border-border px-4 py-2.5 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary rounded-sm placeholder:text-muted-foreground/40"
                    disabled={loading}
                />
                <Button
                    onClick={() => void handleQuery()}
                    disabled={loading || !question.trim()}
                    className="gap-2 font-mono text-xs px-5"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    ASK
                </Button>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AIAnalysis() {
    const { id: incidentId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>("annotate");

    const tabs: Array<{ id: Tab; label: string; icon: React.ElementType; desc: string }> = [
        { id: "annotate", label: "EVENT ANNOTATOR",  icon: Brain,         desc: "MITRE ATT&CK labeling per event" },
        { id: "summary",  label: "INCIDENT SUMMARY", icon: FileText,      desc: "AI-generated executive report" },
        { id: "query",    label: "NL QUERY",         icon: MessageSquare, desc: "Natural language evidence Q&A" },
    ];

    return (
        <AppLayout
            title="AI ANALYSIS"
            subtitle={`INCIDENT: ${incidentId ?? ""}`}
            headerActions={
                <Button
                    variant="ghost"
                    onClick={() => navigate(`/incidents/${incidentId}`)}
                    size="sm"
                    className="h-8 gap-2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                >
                    <ChevronLeft className="w-3.5 h-3.5" /> BACK TO HUB
                </Button>
            }
        >
            <div className="flex flex-col h-full min-h-0 p-6 gap-5">
                {/* LLM config notice */}
                <div className="flex items-center gap-3 px-4 py-2.5 border border-primary/20 bg-primary/5 rounded-sm">
                    <Sparkles className="w-4 h-4 text-primary shrink-0" />
                    <p className="font-mono text-[11px] text-muted-foreground">
                        Requires{" "}
                        <code className="bg-secondary/40 px-1 text-foreground">LLM_API_URL</code>,{" "}
                        <code className="bg-secondary/40 px-1 text-foreground">LLM_API_KEY</code>, and{" "}
                        <code className="bg-secondary/40 px-1 text-foreground">LLM_MODEL</code> in{" "}
                        <code className="bg-secondary/40 px-1 text-foreground">.env</code>.
                        Compatible with OpenAI, Azure OpenAI, and Ollama (
                        <code className="bg-secondary/40 px-1 text-foreground">LLM_API_URL=http://localhost:11434/v1</code>).
                    </p>
                </div>

                {/* Tab bar */}
                <div className="flex items-center gap-1 bg-secondary/30 p-1 rounded-sm border border-border/40 self-start">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-sm font-mono text-[10px] font-bold transition-all",
                                activeTab === tab.id
                                    ? "bg-primary text-primary-foreground shadow"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                            )}
                        >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <p className="font-mono text-[10px] text-muted-foreground -mt-2">
                    {tabs.find(t => t.id === activeTab)?.desc}
                </p>

                <div className="flex-1 overflow-auto min-h-0">
                    {incidentId && activeTab === "annotate" && <AnnotateTab />}
                    {incidentId && activeTab === "summary"  && <SummaryTab  incidentId={incidentId} />}
                    {incidentId && activeTab === "query"    && <QueryTab    incidentId={incidentId} />}
                </div>
            </div>
        </AppLayout>
    );
}
