import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Brain, ChevronLeft, Loader2, AlertTriangle, Sparkles, FileText,
    MessageSquare, Copy, Check, RefreshCw, Send, Lightbulb, User, Bot,
    ShieldCheck, Terminal,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LLMError({ message }: { message: string }) {
    const isConfig = message.includes("503") || message.toLowerCase().includes("llm") || message.toLowerCase().includes("api_key");
    return (
        <div className="flex items-start gap-3 p-4 border border-destructive/40 bg-destructive/5 rounded-sm font-mono text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
                <div className="font-bold text-xs uppercase mb-1">Configuration Error</div>
                {isConfig ? (
                    <span className="text-xs leading-relaxed">
                        LLM API is not reachable. Ensure <code className="bg-destructive/10 px-1">LLM_API_KEY</code> and endpoint are correctly configured in the backend environment.
                    </span>
                ) : <span className="text-xs">{message}</span>}
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
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <TacticalPanel title="EVENT_INGESTION_BUFFER" status="online">
                <div className="space-y-4">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Input a JSON array of raw timeline events for AI enrichment. The reasoning engine will map artifacts to 
                        <span className="text-primary font-bold"> MITRE ATT&CK</span> techniques and assess threat severity.
                    </p>
                    <textarea
                        value={eventsJson}
                        onChange={e => setEventsJson(e.target.value)}
                        rows={10}
                        spellCheck={false}
                        className="w-full bg-secondary/10 border border-border/40 p-4 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:bg-secondary/20 transition-all rounded-sm placeholder:text-muted-foreground/30"
                        placeholder='[{"datetime": "...", "source": "...", "message": "..."}]'
                    />
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => void handleAnnotate()}
                            disabled={loading || !eventsJson.trim()}
                            className="gap-2 px-6"
                            variant="tactical"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                            {loading ? "PROCESSING..." : "RUN ANNOTATOR"}
                        </Button>
                        {result && (
                            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2 font-mono text-[10px] h-9">
                                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                EXPORT ENRICHED JSON
                            </Button>
                        )}
                    </div>
                </div>
            </TacticalPanel>

            {error && <LLMError message={error} />}

            {result && (
                <div className="space-y-3">
                    <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] px-1">Enrichment Results ({result.length})</div>
                    <div className="space-y-3">
                        {result.map((ann, i) => (
                            <div key={i} className="border border-border/40 bg-card rounded-sm p-4 space-y-3 relative overflow-hidden group">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20 group-hover:bg-primary transition-colors" />
                                <div className="flex items-start justify-between gap-4">
                                    <div className="font-mono text-[11px] text-muted-foreground/80 leading-tight flex-1">
                                        <span className="text-primary/40 mr-2">[{i+1}]</span>
                                        {String(ann.original["message"] ?? ann.original["datetime"] ?? `Event #${i + 1}`).slice(0, 160)}
                                    </div>
                                    {ann.severity && (
                                        <span className={cn(
                                            "shrink-0 px-2 py-0.5 rounded-sm border font-mono text-[9px] font-bold uppercase tracking-tighter",
                                            SEVERITY_COLORS[ann.severity.toLowerCase()] ?? "border-border/40 text-muted-foreground"
                                        )}>
                                            {ann.severity}
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {ann.mitre_tactic && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/5 border border-primary/20 rounded-sm">
                                            <ShieldCheck className="w-3 h-3 text-primary" />
                                            <span className="font-mono text-[9px] text-primary font-bold uppercase italic">{ann.mitre_tactic}</span>
                                        </div>
                                    )}
                                    {ann.mitre_technique && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-secondary/40 border border-border/40 rounded-sm">
                                            <Terminal className="w-3 h-3 text-muted-foreground" />
                                            <span className="font-mono text-[9px] text-foreground/80 font-bold">{ann.mitre_technique}</span>
                                        </div>
                                    )}
                                </div>
                                {ann.description && (
                                    <p className="text-[11px] text-foreground/80 leading-relaxed font-medium pl-1">
                                        {ann.description}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
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
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <TacticalPanel title="CASE_INTELLIGENCE_REPORT" status="online">
                <div className="space-y-4">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Generate a high-level executive summary based on cross-host artifact analysis. The AI will synthesize 
                        attack vectors, lateral movement patterns, and initial access points.
                    </p>
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => void handleGenerate()}
                            disabled={loading}
                            variant="tactical"
                            className="gap-2 px-6"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {loading ? "ANALYZING..." : "GENERATE SUMMARY"}
                        </Button>
                        {summary && (
                            <Button
                                variant="outline" size="sm"
                                onClick={() => { void navigator.clipboard.writeText(summary ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                                className="gap-2 h-9 text-[10px]"
                            >
                                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                COPY REPORT
                            </Button>
                        )}
                    </div>
                </div>
            </TacticalPanel>

            {error && <LLMError message={error} />}

            {summary && (
                <TacticalPanel title="EXECUTIVE SUMMARY VIEW" status="verified">
                    <div className="space-y-6">
                        {model && (
                            <div className="flex items-center justify-between pb-3 border-b border-border/20">
                                <div className="flex items-center gap-3">
                                    <Brain className="w-4 h-4 text-primary" />
                                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                                        Agent: <span className="text-primary font-bold">{model}</span>
                                    </span>
                                </div>
                                {sampleEvents != null && <span className="font-mono text-[9px] text-muted-foreground bg-secondary/40 px-2 py-0.5 rounded-full">{sampleEvents} Events Analysed</span>}
                            </div>
                        )}
                        <div className="prose prose-invert max-w-none">
                            {summary.split("\n\n").map((para, i) => (
                                <p key={i} className="text-[13px] text-foreground/90 leading-relaxed mb-4 last:mb-0 font-medium">
                                    {para}
                                </p>
                            ))}
                        </div>
                        <div className="pt-4 border-t border-border/10 flex items-center gap-2">
                            <ShieldCheck className="w-3.5 h-3.5 text-green-500/60" />
                            <span className="text-[9px] text-muted-foreground uppercase font-bold italic">AI-Generated Analysis - Verify with raw artifacts</span>
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
    "Identify any persistence mechanisms found.",
    "Was there any suspicious network exfiltration?",
];

function QueryTab({ incidentId }: { incidentId: string }) {
    const [question, setQuestion] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<Array<{ q: string; a: string; model?: string; events?: number }>>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [history, loading]);

    const handleQuery = async (qText?: string) => {
        const activeQuestion = qText || question.trim();
        if (!activeQuestion) return;
        
        setLoading(true);
        setError(null);
        if (!qText) setQuestion("");

        try {
            const res = await apiPost<{ answer: string; context_events: number; model: string; question: string }>(
                "/ai/query",
                { incident_id: incidentId, question: activeQuestion, context_limit: 30 }
            );
            setHistory(prev => [...prev, { 
                q: activeQuestion, 
                a: res.answer, 
                model: res.model, 
                events: res.context_events 
            }]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Query failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[600px] gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div 
                ref={scrollRef}
                className="flex-1 overflow-auto space-y-6 pr-2 custom-scrollbar"
            >
                {history.length === 0 && !loading && (
                    <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6 opacity-80">
                        <div className="p-4 bg-primary/5 rounded-full border border-primary/20">
                            <MessageSquare className="w-8 h-8 text-primary" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-bold text-sm uppercase tracking-[0.2em]">Evidence Query Engine</h3>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Interact with the collected artifacts using natural language. The AI will scan the super-timeline 
                                for relevant context to answer your forensic questions.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 w-full">
                            {SUGGESTED_QUESTIONS.map(q => (
                                <button
                                    key={q}
                                    onClick={() => void handleQuery(q)}
                                    className="flex items-center gap-3 px-4 py-2.5 border border-border/40 hover:border-primary/50 bg-secondary/10 hover:bg-primary/5 text-left transition-all rounded-sm group"
                                >
                                    <Lightbulb className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                                    <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground">{q}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {history.map((item, i) => (
                    <div key={i} className="space-y-4">
                        {/* User Question */}
                        <div className="flex justify-end pl-12">
                            <div className="bg-primary/10 border border-primary/30 rounded-sm px-4 py-2 flex items-start gap-3">
                                <div className="text-[11px] font-bold text-primary leading-relaxed">{item.q}</div>
                                <User className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            </div>
                        </div>
                        {/* AI Answer */}
                        <div className="flex justify-start pr-12">
                            <div className="bg-secondary/20 border border-border/40 rounded-sm p-4 w-full space-y-3">
                                <div className="flex items-center justify-between border-b border-border/10 pb-2">
                                    <div className="flex items-center gap-2">
                                        <Bot className="w-4 h-4 text-primary" />
                                        <span className="font-mono text-[9px] font-bold text-primary uppercase tracking-widest">Analysis Engine</span>
                                    </div>
                                    <div className="font-mono text-[8px] text-muted-foreground uppercase">
                                        {item.model} · {item.events} ctx events
                                    </div>
                                </div>
                                <p className="text-[12px] text-foreground/90 leading-relaxed font-medium">{item.a}</p>
                            </div>
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start pr-12 animate-pulse">
                        <div className="bg-secondary/10 border border-border/20 rounded-sm p-4 w-full flex items-center gap-4">
                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.3em]">Processing Incident Context...</span>
                        </div>
                    </div>
                )}
            </div>

            {error && <LLMError message={error} />}

            <div className="flex gap-3 pt-4 border-t border-border/40">
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !loading) void handleQuery(); }}
                        placeholder="Ask about compromised accounts, persistence, network patterns..."
                        className="w-full bg-secondary/10 border border-border px-4 py-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary rounded-sm placeholder:text-muted-foreground/30 transition-all"
                        disabled={loading}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
                        {history.length > 0 && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setHistory([])}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                </div>
                <Button
                    onClick={() => void handleQuery()}
                    disabled={loading || !question.trim()}
                    variant="tactical"
                    className="gap-2 px-6 h-auto"
                >
                    <Send className="w-4 h-4" />
                    <span className="font-bold text-[10px] tracking-widest uppercase">Query</span>
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
        { id: "annotate", label: "ANNOTATOR", icon: Brain,         desc: "MITRE ATT&CK context enrichment" },
        { id: "summary",  label: "REPORT",    icon: FileText,      desc: "Executive intelligence synthesis" },
        { id: "query",    label: "QUERY",     icon: MessageSquare, desc: "Evidence Q&A via natural language" },
    ];

    return (
        <AppLayout
            title="AI_ANALYSIS_INTELLIGENCE"
            subtitle={`SECTOR: ${incidentId ?? "UNKNOWN"}`}
            headerActions={
                <Button
                    variant="ghost"
                    onClick={() => navigate(`/incidents/${incidentId}`)}
                    size="sm"
                    className="h-8 gap-2 border border-border/40 hover:bg-secondary/40 text-[10px] uppercase font-bold tracking-widest"
                >
                    <ChevronLeft className="w-3.5 h-3.5" /> BACK TO HUB
                </Button>
            }
        >
            <div className="flex flex-col h-full min-h-0 p-6 gap-6 max-w-6xl mx-auto w-full">
                {/* Status Bar */}
                <div className="flex items-center justify-between px-4 py-2 border border-primary/20 bg-primary/5 rounded-sm shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/20 blur-sm rounded-full animate-pulse" />
                            <Sparkles className="w-4 h-4 text-primary relative z-10" />
                        </div>
                        <p className="font-mono text-[9px] text-primary/80 uppercase tracking-widest font-bold">
                            Cognitive Reasoning Engine: <span className="text-foreground">ONLINE</span>
                        </p>
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 font-mono hidden md:block">
                        COMPATIBLE: OPENAI / AZURE / OLLAMA
                    </div>
                </div>

                {/* Tab Controller */}
                <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-1 bg-secondary/20 p-1 rounded-sm border border-border/40">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2 rounded-sm font-bold transition-all uppercase tracking-[0.1em] text-[9px]",
                                    activeTab === tab.id
                                        ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(21,245,116,0.2)]"
                                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                                )}
                            >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-tighter italic text-right">
                        {tabs.find(t => t.id === activeTab)?.desc}
                    </div>
                </div>

                <div className="flex-1 overflow-auto min-h-0">
                    {incidentId && activeTab === "annotate" && <AnnotateTab />}
                    {incidentId && activeTab === "summary"  && <SummaryTab  incidentId={incidentId} />}
                    {incidentId && activeTab === "query"    && <QueryTab    incidentId={incidentId} />}
                </div>
            </div>
        </AppLayout>
    );
}
