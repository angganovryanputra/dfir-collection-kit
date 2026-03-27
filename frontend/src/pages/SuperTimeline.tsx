import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { TacticalPanel } from "@/components/TacticalPanel";
import { Button } from "@/components/ui/button";
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ChevronUp,
    ChevronDown,
    Database,
    Server,
    AlertTriangle,
    RefreshCw,
    Loader2,
    Shield,
    Network,
    Clock,
    Search,
    Users,
    X,
    CalendarRange,
    Tag,
    Zap,
    User,
    Hash,
    Download,
    Columns,
    FileText,
    Bookmark,
    BookmarkCheck,
    Trash2,
    BarChart2,
    Globe,
    HelpCircle,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type SuperTimelineStatus = {
    id: string;
    incident_id: string;
    status: "PENDING" | "BUILDING" | "DONE" | "FAILED";
    host_count: number | null;
    event_count: number | null;
    duckdb_path: string | null;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
};

type LateralMovementDetection = {
    id: string;
    incident_id: string;
    super_timeline_id: string;
    detection_type: "account_pivot" | "process_spread" | "credential_reuse";
    source_host: string;
    target_host: string;
    actor: string | null;
    first_seen: string | null;
    last_seen: string | null;
    event_count: number;
    confidence: number;
    details: Record<string, unknown>;
    detected_at: string;
};

type SuperTimelineResponse = {
    data: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    hosts: string[];
    source_shorts: string[];
};

type QuickFilter = {
    id: string;
    label: string;
    q?: string;
    sources?: string[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const HOST_COLORS = [
    { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" },
    { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
    { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
    { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
    { bg: "bg-pink-500/20", text: "text-pink-400", border: "border-pink-500/30" },
    { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30" },
    { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
    { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30" },
];

const SOURCE_SHORT_COLORS: Record<string, string> = {
    EVTX:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
    SIGMA:    "bg-red-500/15 text-red-400 border-red-500/30",
    MFT:      "bg-green-500/15 text-green-400 border-green-500/30",
    PREFETCH: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    REGISTRY: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    SYSMON:   "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    AMCACHE:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
    LNK:      "bg-pink-500/15 text-pink-400 border-pink-500/30",
    HAYABUSA: "bg-red-600/15 text-red-300 border-red-600/30",
};

const SOURCE_METADATA: Record<string, {
    label: string;
    category: "security" | "filesystem" | "execution" | "registry" | "network";
    desc: string;
    color: string;
}> = {
    EVTX:     { label: "EVTX",     category: "security",   desc: "Windows Event Logs",       color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
    SYSMON:   { label: "SYSMON",   category: "security",   desc: "Sysmon Events",             color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10" },
    SIGMA:    { label: "SIGMA",    category: "security",   desc: "Sigma Rule Matches",        color: "text-red-400 border-red-500/30 bg-red-500/10" },
    MFT:      { label: "MFT",      category: "filesystem", desc: "NTFS Master File Table",    color: "text-green-400 border-green-500/30 bg-green-500/10" },
    PREFETCH: { label: "PREFETCH", category: "execution",  desc: "Windows Prefetch",          color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
    AMCACHE:  { label: "AMCACHE",  category: "execution",  desc: "AmCache Entries",           color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
    LNK:      { label: "LNK",      category: "execution",  desc: "Shell Link Files",          color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
    REGISTRY: { label: "REGISTRY", category: "registry",   desc: "Registry Artifacts",        color: "text-pink-400 border-pink-500/30 bg-pink-500/10" },
};

const DETECTION_TYPE_COLORS: Record<LateralMovementDetection["detection_type"], string> = {
    account_pivot:    "text-red-400 border-red-400/40 bg-red-400/10",
    process_spread:   "text-orange-400 border-orange-400/40 bg-orange-400/10",
    credential_reuse: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
};

const QUICK_FILTERS: QuickFilter[] = [
    { id: "sigma",    label: "SIGMA ALERTS",     sources: ["SIGMA", "HAYABUSA"] },
    { id: "logon",    label: "LOGON EVENTS",      q: "logon" },
    { id: "process",  label: "PROCESS EXECUTION", sources: ["PREFETCH", "AMCACHE"] },
    { id: "fileops",  label: "FILE OPERATIONS",   sources: ["MFT", "LNK"] },
    { id: "network",  label: "NETWORK ACTIVITY",  sources: ["SYSMON"], q: "network" },
    { id: "registry", label: "REGISTRY",          sources: ["REGISTRY"] },
    { id: "lateral",  label: "LATERAL MOVEMENT",  q: "lateral" },
    { id: "ransom",   label: "RANSOMWARE",         q: "ransom" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

type ColumnKey = "event_id" | "user" | "display_name";
type SortKey = "datetime" | "host" | "source" | "type" | "message";

const OPTIONAL_COLS: { key: ColumnKey; label: string }[] = [
    { key: "event_id",    label: "EVENT ID / RULE" },
    { key: "user",        label: "USER" },
    { key: "display_name", label: "PATH / ARTIFACT" },
];

const COL_STORAGE_KEY = "dfir_st_cols";
const DEFAULT_VISIBLE: ColumnKey[] = ["event_id", "user"];

function loadVisibleCols(): Set<ColumnKey> {
    try {
        const raw = localStorage.getItem(COL_STORAGE_KEY);
        if (raw) return new Set(JSON.parse(raw) as ColumnKey[]);
    } catch { /* ignore */ }
    return new Set(DEFAULT_VISIBLE);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHostColor(host: string, allHosts: string[]) {
    const idx = allHosts.indexOf(host);
    return HOST_COLORS[idx % HOST_COLORS.length] ?? HOST_COLORS[0];
}

function getSourceColor(sourceShort: string): string {
    return (
        SOURCE_SHORT_COLORS[sourceShort?.toUpperCase()] ??
        "bg-secondary/60 text-muted-foreground border-border/40"
    );
}

function formatTs(ts: string | null): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
}

function truncate(val: unknown, max = 120): string {
    if (val === null || val === undefined) return "—";
    const str = String(val);
    return str.length > max ? str.slice(0, max) + "…" : str;
}

/** Highlight query term in a string with <mark> spans (returns JSX-safe string chunks). */
function highlightTerms(text: string, term: string): React.ReactNode {
    if (!term || term.length < 2) return text;
    const lower = text.toLowerCase();
    const lowerTerm = term.toLowerCase();
    const idx = lower.indexOf(lowerTerm);
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="bg-primary/30 text-primary rounded-sm px-0.5">
                {text.slice(idx, idx + term.length)}
            </mark>
            {text.slice(idx + term.length)}
        </>
    );
}

// ─── DSL Query Parser ─────────────────────────────────────────────────────────

type ParsedDSL = {
    q: string;
    hosts: string[];
    sources: string[];
    users: string[];
    eventIds: string[];
    rules: string[];
};

/**
 * Parses an Elastic/Splunk-like query string into structured filter params.
 * Supports: host:X  source:X  user:X  eid:X  rule:X
 *           "quoted phrases"  wildcards (user:*admin*)  NOT/-prefix  AND/OR (structural)
 */
function parseDSLQuery(input: string): ParsedDSL {
    const result: ParsedDSL = { q: "", hosts: [], sources: [], users: [], eventIds: [], rules: [] };
    if (!input.trim()) return result;

    // Tokenize: field:"quoted value", field:value, "quoted bare", bare
    const re = /(?:NOT\s+)?-?[a-z_]+:"[^"]*"|(?:NOT\s+)?-?[a-z_]+:\S+|"[^"]*"|\S+/gi;
    const freeTerms: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
        const token = m[0];
        if (/^(AND|OR)$/i.test(token)) continue;

        const negated = token.startsWith("-") || /^NOT\s/i.test(token);
        const clean = negated
            ? token.replace(/^-/, "").replace(/^NOT\s+/i, "")
            : token;

        const fieldMatch = /^([a-z_]+):(.*)/i.exec(clean);
        if (fieldMatch) {
            const field = fieldMatch[1].toLowerCase();
            const value = fieldMatch[2].replace(/^"|"$/g, "").trim();
            if (!negated && value) {
                switch (field) {
                    case "host":   result.hosts.push(value); break;
                    case "source": result.sources.push(value.toUpperCase()); break;
                    case "user":   result.users.push(value); break;
                    case "eid":    result.eventIds.push(value); break;
                    case "rule":   result.rules.push(value); break;
                    default:       freeTerms.push(value); break;
                }
            }
        } else {
            const bare = token.replace(/^"|"$/g, "").trim();
            if (!negated && bare) freeTerms.push(bare);
        }
    }

    result.q = freeTerms.join(" ");
    return result;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function HostChip({
    host,
    allHosts,
    active,
    onClick,
}: {
    host: string;
    allHosts: string[];
    active: boolean;
    onClick: () => void;
}) {
    const color = getHostColor(host, allHosts);
    return (
        <button
            onClick={onClick}
            className={`px-2.5 py-1 rounded-sm border font-mono text-xs transition-all ${
                active
                    ? `${color.bg} ${color.text} ${color.border}`
                    : "border-border/40 text-muted-foreground hover:border-border"
            }`}
        >
            {host}
        </button>
    );
}

function SourceChip({
    source,
    active,
    onClick,
}: {
    source: string;
    active: boolean;
    onClick: () => void;
}) {
    const activeColor = getSourceColor(source);
    const meta = SOURCE_METADATA[source?.toUpperCase()];
    return (
        <button
            onClick={onClick}
            title={meta ? `${meta.desc} (${meta.category})` : source}
            className={`px-2.5 py-1 rounded-sm border font-mono text-xs transition-all ${
                active
                    ? activeColor
                    : "border-border/40 text-muted-foreground hover:border-border"
            }`}
        >
            {source}
        </button>
    );
}

function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
    const color =
        pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-orange-500" : "bg-yellow-500";
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="font-mono text-xs text-muted-foreground w-8 text-right">
                {pct}%
            </span>
        </div>
    );
}

// ─── Bookmark utilities ───────────────────────────────────────────────────────

interface Bookmark {
    eventHash: string;
    note: string;
    createdAt: string;
    datetime: string;
    host: string;
    message: string;
    source_short: string;
}

function hashEvent(event: Record<string, unknown>): string {
    const str = `${String(event.datetime)}|${String(event.host ?? event.computer)}|${String(event.message ?? event.description)}`;
    let h = 0;
    for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return Math.abs(h).toString(36);
}

function loadBookmarks(incidentId: string): Bookmark[] {
    try {
        const raw = localStorage.getItem(`dfir_bookmarks_${incidentId}`);
        return raw ? (JSON.parse(raw) as Bookmark[]) : [];
    } catch { return []; }
}

function saveBookmarks(incidentId: string, bms: Bookmark[]): void {
    try { localStorage.setItem(`dfir_bookmarks_${incidentId}`, JSON.stringify(bms)); } catch { /* ignore */ }
}

// ─── Event Tags ───────────────────────────────────────────────────────────────

type EventTagValue = "confirmed" | "suspicious" | "fp" | "interesting";

const EVENT_TAG_META: Record<EventTagValue, { label: string; color: string; short: string }> = {
    confirmed:   { label: "CONFIRMED",   short: "C", color: "border-red-500/50 bg-red-500/15 text-red-400" },
    suspicious:  { label: "SUSPICIOUS",  short: "S", color: "border-orange-500/50 bg-orange-500/15 text-orange-400" },
    interesting: { label: "INTERESTING", short: "I", color: "border-blue-500/50 bg-blue-500/15 text-blue-400" },
    fp:          { label: "FALSE POS",   short: "F", color: "border-border/40 bg-secondary/30 text-muted-foreground line-through" },
};

const TAG_STORAGE_KEY = (incidentId: string) => `dfir_event_tags_${incidentId}`;

function loadTags(incidentId: string): Record<string, EventTagValue> {
    try {
        const raw = localStorage.getItem(TAG_STORAGE_KEY(incidentId));
        return raw ? (JSON.parse(raw) as Record<string, EventTagValue>) : {};
    } catch { return {}; }
}

function saveTags(incidentId: string, tags: Record<string, EventTagValue>): void {
    try { localStorage.setItem(TAG_STORAGE_KEY(incidentId), JSON.stringify(tags)); } catch { /* ignore */ }
}

// ─── IOC Detection ────────────────────────────────────────────────────────────

interface DetectedIOC {
    type: "IPv4" | "MD5" | "SHA1" | "SHA256" | "Domain";
    value: string;
}

const IOC_COLORS: Record<DetectedIOC["type"], string> = {
    IPv4:   "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
    MD5:    "border-purple-500/40 bg-purple-500/10 text-purple-400",
    SHA1:   "border-purple-500/40 bg-purple-500/10 text-purple-400",
    SHA256: "border-purple-500/40 bg-purple-500/10 text-purple-400",
    Domain: "border-green-500/40 bg-green-500/10 text-green-400",
};

function detectIOCs(text: string): DetectedIOC[] {
    const results: DetectedIOC[] = [];
    const seen = new Set<string>();

    function add(type: DetectedIOC["type"], value: string) {
        const key = `${type}:${value.toLowerCase()}`;
        if (!seen.has(key)) { seen.add(key); results.push({ type, value }); }
    }

    const ipv4Re   = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
    const sha256Re = /\b[0-9a-fA-F]{64}\b/g;
    const sha1Re   = /\b[0-9a-fA-F]{40}\b/g;
    const md5Re    = /\b[0-9a-fA-F]{32}\b/g;
    const domainRe = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|gov|mil|edu|ru|cn|de|uk)\b/gi;

    // Order matters: longer hashes first to avoid false matches
    for (const m of text.matchAll(sha256Re)) add("SHA256", m[0]);
    for (const m of text.matchAll(sha1Re))   add("SHA1",   m[0]);
    for (const m of text.matchAll(md5Re))    add("MD5",    m[0]);
    for (const m of text.matchAll(ipv4Re))   add("IPv4",   m[0]);
    for (const m of text.matchAll(domainRe)) add("Domain", m[0]);

    return results;
}

// ─── Event Histogram ─────────────────────────────────────────────────────────

function EventHistogram({
    data,
    onSelectWindow,
}: {
    data: Record<string, unknown>[];
    onSelectWindow: (from: string, to: string) => void;
}) {
    const [hoveredHour, setHoveredHour] = useState<string | null>(null);

    const hourCounts = new Map<string, number>();
    for (const row of data) {
        const dt = String(row["datetime"] ?? row["timestamp"] ?? "");
        if (dt.length >= 13) {
            const hour = dt.slice(0, 13); // e.g. "2026-01-15T07"
            hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
        }
    }

    const hours = Array.from(hourCounts.keys()).sort();
    if (hours.length < 2) return null;

    const maxCount = Math.max(...hourCounts.values());
    const BAR_W = 8;
    const GAP = 2;
    const HEIGHT = 40;
    const totalW = hours.length * (BAR_W + GAP);

    return (
        <div className="px-1 pb-1 shrink-0">
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                <BarChart2 className="w-3 h-3" />
                EVENT DENSITY
                {hoveredHour && (
                    <span className="ml-2 text-foreground tabular-nums">
                        {hoveredHour}:00 — {hourCounts.get(hoveredHour)?.toLocaleString()} events
                    </span>
                )}
            </div>
            <div className="overflow-x-auto">
                <svg
                    width={totalW}
                    height={HEIGHT + 14}
                    className="block"
                    style={{ minWidth: "100%" }}
                >
                    {hours.map((hour, idx) => {
                        const count = hourCounts.get(hour) ?? 0;
                        const barH = Math.max(2, Math.round((count / maxCount) * HEIGHT));
                        const x = idx * (BAR_W + GAP);
                        const y = HEIGHT - barH;
                        const isHovered = hoveredHour === hour;
                        return (
                            <g key={hour}>
                                <rect
                                    x={x}
                                    y={y}
                                    width={BAR_W}
                                    height={barH}
                                    fill="hsl(var(--primary))"
                                    opacity={isHovered ? 0.9 : 0.45}
                                    rx={1}
                                    style={{ cursor: "pointer" }}
                                    onMouseEnter={() => setHoveredHour(hour)}
                                    onMouseLeave={() => setHoveredHour(null)}
                                    onClick={() => {
                                        onSelectWindow(
                                            hour.replace("T", " ") + ":00:00",
                                            hour.replace("T", " ") + ":59:59"
                                        );
                                    }}
                                />
                            </g>
                        );
                    })}
                    {/* First/last label */}
                    <text x={0} y={HEIGHT + 12} fill="currentColor" fontSize={8} opacity={0.5} className="font-mono">
                        {hours[0]?.slice(0, 13)}
                    </text>
                    <text x={totalW} y={HEIGHT + 12} fill="currentColor" fontSize={8} opacity={0.5} textAnchor="end" className="font-mono">
                        {hours[hours.length - 1]?.slice(0, 13)}
                    </text>
                </svg>
            </div>
        </div>
    );
}

// ─── Compare Panel ────────────────────────────────────────────────────────────

function ComparePanel({
    events,
    knownHosts,
    onClose,
    onFilterSearch,
}: {
    events: [Record<string, unknown>, Record<string, unknown>];
    knownHosts: string[];
    onClose: () => void;
    onFilterSearch: (q: string) => void;
}) {
    const [a, b] = events;
    const allKeys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();

    function renderVal(val: unknown) {
        if (val === null || val === undefined) return <span className="text-muted-foreground/30">—</span>;
        return <span className="break-all">{String(val)}</span>;
    }

    function isDiff(key: string) {
        return String(a[key] ?? "") !== String(b[key] ?? "");
    }

    const hostA = String(a["host"] ?? a["computer"] ?? "?");
    const hostB = String(b["host"] ?? b["computer"] ?? "?");
    const colorA = getHostColor(hostA, knownHosts);
    const colorB = getHostColor(hostB, knownHosts);

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
            <div className="fixed right-0 top-0 h-full w-[700px] max-w-[98vw] bg-card border-l border-border z-50 flex flex-col shadow-2xl">
                {/* Header */}
                <div className="p-4 border-b border-border flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">COMPARE EVENTS</span>
                        <span className="font-mono text-[10px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded-sm">SHIFT+CLICK TO COMPARE</span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-sm hover:bg-secondary/60 text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Column labels */}
                <div className="grid grid-cols-[140px_1fr_1fr] gap-1 px-4 py-2 border-b border-border bg-secondary/20 shrink-0">
                    <div />
                    <div className={`font-mono text-[10px] font-bold px-2 py-1 rounded-sm ${colorA.bg} ${colorA.text} ${colorA.border} border`}>
                        EVENT A — {hostA}
                    </div>
                    <div className={`font-mono text-[10px] font-bold px-2 py-1 rounded-sm ${colorB.bg} ${colorB.text} ${colorB.border} border`}>
                        EVENT B — {hostB}
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {allKeys.map((key) => {
                        const diff = isDiff(key);
                        return (
                            <div
                                key={key}
                                className={`grid grid-cols-[140px_1fr_1fr] gap-1 px-4 py-1.5 border-b border-border/10 text-xs font-mono ${diff ? "bg-yellow-500/5" : ""}`}
                            >
                                <span className="text-muted-foreground/70 uppercase text-[10px] tracking-wide pt-0.5 truncate">{key}</span>
                                <span className={diff ? "text-yellow-400" : "text-foreground/70"}>{renderVal(a[key])}</span>
                                <span className={diff ? "text-yellow-400" : "text-foreground/70"}>{renderVal(b[key])}</span>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-border bg-secondary/10 flex gap-2 shrink-0">
                    <button
                        onClick={() => { onFilterSearch(hostA); onClose(); }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-sm font-mono text-xs hover:opacity-80 transition-opacity ${colorA.bg} ${colorA.text} ${colorA.border}`}
                    >
                        <Server className="w-3 h-3" />PIVOT HOST A: {hostA}
                    </button>
                    <button
                        onClick={() => { onFilterSearch(hostB); onClose(); }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-sm font-mono text-xs hover:opacity-80 transition-opacity ${colorB.bg} ${colorB.text} ${colorB.border}`}
                    >
                        <Server className="w-3 h-3" />PIVOT HOST B: {hostB}
                    </button>
                </div>
            </div>
        </>
    );
}

// ─── Event Detail Panel ───────────────────────────────────────────────────────

const PANEL_SKIP_KEYS = new Set([
    "host", "computer", "source_short", "datetime", "timestamp",
    "timestamp_desc", "source", "message", "description",
    "user", "event_id", "rule_name", "display_name", "event_seq",
]);

function EventDetailPanel({
    event,
    knownHosts,
    onClose,
    onFilterSearch,
    incidentId,
    isBookmarked,
    onBookmarkToggle,
    onNavigateIOC,
}: {
    event: Record<string, unknown>;
    knownHosts: string[];
    onClose: () => void;
    onFilterSearch: (q: string) => void;
    incidentId: string;
    isBookmarked: boolean;
    onBookmarkToggle: (event: Record<string, unknown>) => void;
    onNavigateIOC: (value: string, type: string) => void;
}) {
    const host        = String(event["host"] ?? event["computer"] ?? "UNKNOWN");
    const srcShort    = String(event["source_short"] ?? "");
    const datetime    = String(event["datetime"] ?? event["timestamp"] ?? "—");
    const tsDesc      = String(event["timestamp_desc"] ?? "—");
    const source      = String(event["source"] ?? "—");
    const message     = String(event["message"] ?? event["description"] ?? "—");
    const user        = event["user"]         ? String(event["user"])         : null;
    const eventId     = event["event_id"]     ? String(event["event_id"])     : null;
    const ruleName    = event["rule_name"]    ? String(event["rule_name"])    : null;
    const displayName = event["display_name"] ? String(event["display_name"]) : null;

    const hostColor = getHostColor(host, knownHosts);
    const srcColor  = getSourceColor(srcShort);
    const isSigma   = srcShort === "SIGMA" || srcShort === "HAYABUSA";

    const extraFields = Object.entries(event).filter(
        ([k, v]) => !PANEL_SKIP_KEYS.has(k) && v !== null && v !== undefined && String(v) !== ""
    );

    const keyFields: [string, string][] = [
        ["SOURCE", source],
        ...(eventId     ? [["EVENT ID", `EID:${eventId}`] as [string, string]]   : []),
        ...(ruleName    ? [["RULE",     ruleName]          as [string, string]]   : []),
        ...(user        ? [["USER",     user]              as [string, string]]   : []),
        ...(displayName ? [["PATH / ARTIFACT", displayName] as [string, string]] : []),
    ];

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

            {/* Slide-in panel */}
            <div className="fixed right-0 top-0 h-full w-[480px] max-w-[95vw] bg-card border-l border-border z-50 flex flex-col shadow-2xl">
                {/* Header */}
                <div className={`p-4 border-b space-y-2.5 ${isSigma ? "border-red-500/30 bg-red-500/5" : "border-border"}`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            {srcShort && (
                                <span className={`px-2 py-0.5 rounded-sm border text-xs font-mono font-bold ${srcColor}`}>
                                    {srcShort}
                                </span>
                            )}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-xs font-mono ${hostColor.bg} ${hostColor.text} ${hostColor.border}`}>
                                <Server className="w-2.5 h-2.5 shrink-0" />
                                {host}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={() => onBookmarkToggle(event)}
                                className={`p-1.5 rounded-sm transition-colors ${isBookmarked ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}
                                title={isBookmarked ? "Remove bookmark" : "Bookmark this event"}
                            >
                                {isBookmarked
                                    ? <BookmarkCheck className="w-4 h-4" />
                                    : <Bookmark className="w-4 h-4" />}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-sm hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground flex-wrap">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span className="tabular-nums text-foreground/80">{datetime}</span>
                        <span className="text-border/60">·</span>
                        <span className="px-1.5 py-0.5 rounded-sm border border-border/40 bg-secondary/30 text-[10px]">
                            {tsDesc}
                        </span>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    {/* Message */}
                    <div>
                        <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                            MESSAGE
                        </div>
                        <div className={`p-3 rounded-sm border font-mono text-xs leading-relaxed break-words whitespace-pre-wrap ${
                            isSigma
                                ? "border-red-500/30 bg-red-500/5 text-red-300"
                                : "border-border/40 bg-secondary/30 text-foreground"
                        }`}>
                            {message}
                        </div>
                    </div>

                    {/* Structured fields */}
                    {keyFields.length > 0 && (
                        <div>
                            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                                FIELDS
                            </div>
                            <div className="space-y-1.5">
                                {keyFields.map(([k, v]) => (
                                    <div key={k} className="grid grid-cols-[130px_1fr] gap-3 items-start">
                                        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide pt-0.5">
                                            {k}
                                        </span>
                                        <span className="font-mono text-xs text-foreground break-all">{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Extra / raw fields */}
                    {extraFields.length > 0 && (
                        <div>
                            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                                RAW FIELDS
                            </div>
                            <div className="border border-border/30 rounded-sm divide-y divide-border/20">
                                {extraFields.map(([k, v]) => (
                                    <div key={k} className="grid grid-cols-[130px_1fr] gap-3 items-start px-3 py-1.5">
                                        <span className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wide pt-0.5 truncate" title={k}>
                                            {k}
                                        </span>
                                        <span className="font-mono text-[10px] text-foreground/60 break-all">{String(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer: Pivot actions */}
                <div className="p-3 border-t border-border bg-secondary/10 space-y-2 shrink-0">
                    <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                        PIVOT ACTIONS
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => { onFilterSearch(host); onClose(); }}
                            className="flex items-center gap-1.5 px-2.5 py-1 border border-border/50 rounded-sm font-mono text-xs hover:bg-secondary/50 hover:border-primary/40 transition-colors text-muted-foreground hover:text-foreground"
                        >
                            <Server className="w-3 h-3" />
                            HOST: {host}
                        </button>
                        {user && (
                            <button
                                onClick={() => { onFilterSearch(user); onClose(); }}
                                className="flex items-center gap-1.5 px-2.5 py-1 border border-border/50 rounded-sm font-mono text-xs hover:bg-secondary/50 hover:border-primary/40 transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <User className="w-3 h-3" />
                                USER: {user}
                            </button>
                        )}
                        {eventId && (
                            <button
                                onClick={() => { onFilterSearch(eventId); onClose(); }}
                                className="flex items-center gap-1.5 px-2.5 py-1 border border-blue-500/30 bg-blue-500/10 rounded-sm font-mono text-xs hover:bg-blue-500/20 transition-colors text-blue-400"
                            >
                                EID:{eventId}
                            </button>
                        )}
                        {ruleName && (
                            <button
                                onClick={() => { onFilterSearch(ruleName); onClose(); }}
                                className="flex items-center gap-1.5 px-2.5 py-1 border border-orange-500/30 bg-orange-500/10 rounded-sm font-mono text-xs hover:bg-orange-500/20 transition-colors text-orange-400"
                            >
                                {truncate(ruleName, 28)}
                            </button>
                        )}
                    </div>
                </div>

                {/* IOC Indicators section */}
                {(() => {
                    const scanText = `${message} ${displayName ?? ""}`;
                    const iocs = detectIOCs(scanText);
                    if (iocs.length === 0) return null;
                    return (
                        <div className="p-3 border-t border-border bg-secondary/5 space-y-2 shrink-0">
                            <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                                <Globe className="w-3 h-3" />
                                INDICATORS DETECTED
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {iocs.map((ioc) => (
                                    <button
                                        key={`${ioc.type}:${ioc.value}`}
                                        onClick={() => onNavigateIOC(ioc.value, ioc.type)}
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded-sm border font-mono text-[10px] hover:opacity-80 transition-opacity ${IOC_COLORS[ioc.type]}`}
                                        title={`Navigate to IOC Matches: ${ioc.value}`}
                                    >
                                        <span className="opacity-70">{ioc.type}</span>
                                        <span className="truncate max-w-[160px]">{ioc.value}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })()}
            </div>
        </>
    );
}

// ─── Sortable header ──────────────────────────────────────────────────────────

function SortableHeader({
    label,
    col,
    sortBy,
    sortOrder,
    onSort,
    className = "",
}: {
    label: string;
    col: SortKey;
    sortBy: SortKey;
    sortOrder: "asc" | "desc";
    onSort: (col: SortKey) => void;
    className?: string;
}) {
    const active = sortBy === col;
    return (
        <th
            className={`px-3 py-2 text-left font-bold whitespace-nowrap cursor-pointer select-none group ${className}`}
            onClick={() => onSort(col)}
        >
            <span className="flex items-center gap-1">
                {label}
                <span className={`transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}>
                    {active && sortOrder === "desc"
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronUp className="w-3 h-3" />}
                </span>
            </span>
        </th>
    );
}

// ─── Entity Relationship Graph ────────────────────────────────────────────────

type GNodeType = "host" | "user" | "process" | "ip" | "domain" | "alert";
type GEdgeType = "logon" | "ran" | "executed" | "alert_edge" | "network" | "dns" | "lateral";

interface GNode {
    id: string;
    type: GNodeType;
    label: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    pinned: boolean;
    weight: number;
}

interface GEdge {
    source: string;
    target: string;
    edgeType: GEdgeType;
    weight: number;
}

const G_NODE_STYLES: Record<GNodeType, { r: number; fill: string; stroke: string; icon: string }> = {
    host:    { r: 22, fill: "#0f2a3d", stroke: "#22d3ee", icon: "⬡" },
    user:    { r: 16, fill: "#3b0d02", stroke: "#fb923c", icon: "◉" },
    process: { r: 14, fill: "#1e0a40", stroke: "#a78bfa", icon: "▶" },
    ip:      { r: 12, fill: "#0b1f2e", stroke: "#38bdf8", icon: "◎" },
    domain:  { r: 12, fill: "#052e16", stroke: "#4ade80", icon: "⊙" },
    alert:   { r: 18, fill: "#3b0000", stroke: "#f87171", icon: "⚠" },
};

const G_NODE_TYPE_LABELS: Record<GNodeType, string> = {
    host: "HOST", user: "USER", process: "PROCESS", ip: "IP", domain: "DOMAIN", alert: "ALERT",
};

const G_EDGE_STYLES: Record<GEdgeType, { stroke: string; dash?: string; width: number }> = {
    logon:      { stroke: "#60a5fa", width: 1.5 },
    ran:        { stroke: "#a78bfa", dash: "4,2", width: 1 },
    executed:   { stroke: "#fb923c", dash: "4,2", width: 1 },
    alert_edge: { stroke: "#f87171", width: 2 },
    network:    { stroke: "#22d3ee", dash: "2,3", width: 1 },
    dns:        { stroke: "#4ade80", dash: "2,3", width: 1 },
    lateral:    { stroke: "#ef4444", width: 3 },
};

const G_SYSTEM_USERS = new Set([
    "system", "nt authority\\system", "nt authority\\local service",
    "nt authority\\network service", "local service", "network service",
    "-", "n/a", "anonymous", "guest", "", "null", "—",
]);

const G_MAX_NODES: Record<GNodeType, number> = {
    host: 20, user: 15, process: 15, ip: 10, domain: 10, alert: 12,
};

function gIsPrivateIP(ip: string): boolean {
    const p = ip.split(".").map(Number);
    if (p.length !== 4) return true;
    return p[0] === 10 || p[0] === 127 ||
        (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
        (p[0] === 192 && p[1] === 168) ||
        (p[0] === 169 && p[1] === 254);
}

function buildEntityGraph(
    events: Record<string, unknown>[],
    lmDetections: LateralMovementDetection[],
    w: number,
    h: number,
): { nodes: GNode[]; edges: GEdge[] } {
    const cx = w / 2, cy = h / 2;
    const nodeMap = new Map<string, GNode>();
    const edgeMap = new Map<string, GEdge>();

    const typeFreqs: Record<GNodeType, Map<string, number>> = {
        host: new Map(), user: new Map(), process: new Map(),
        ip: new Map(), domain: new Map(), alert: new Map(),
    };

    // Pass 1: count frequencies
    for (const ev of events) {
        const host = String(ev.host ?? ev.computer ?? "").trim();
        if (host) typeFreqs.host.set(host, (typeFreqs.host.get(host) ?? 0) + 1);

        const user = String(ev.user ?? "").trim();
        if (user && !G_SYSTEM_USERS.has(user.toLowerCase())) {
            typeFreqs.user.set(user, (typeFreqs.user.get(user) ?? 0) + 1);
        }

        const src = String(ev.source_short ?? "").toUpperCase();
        const dn = String(ev.display_name ?? "").trim();
        if (dn && (src === "PREFETCH" || src === "AMCACHE")) {
            const parts = dn.split(/[/\\]/);
            const name = parts[parts.length - 1] ?? dn;
            typeFreqs.process.set(name, (typeFreqs.process.get(name) ?? 0) + 1);
        }

        if (src === "SIGMA" || src === "HAYABUSA") {
            const rule = String(ev.rule_name ?? ev.event_id ?? "").trim();
            if (rule) typeFreqs.alert.set(rule, (typeFreqs.alert.get(rule) ?? 0) + 1);
        }

        const msg = String(ev.message ?? ev.description ?? "");
        for (const ioc of detectIOCs(msg)) {
            if (ioc.type === "IPv4" && !gIsPrivateIP(ioc.value))
                typeFreqs.ip.set(ioc.value, (typeFreqs.ip.get(ioc.value) ?? 0) + 1);
            if (ioc.type === "Domain") {
                const d = ioc.value.toLowerCase();
                typeFreqs.domain.set(d, (typeFreqs.domain.get(d) ?? 0) + 1);
            }
        }
    }
    for (const lm of lmDetections) {
        typeFreqs.host.set(lm.source_host, (typeFreqs.host.get(lm.source_host) ?? 0) + 3);
        typeFreqs.host.set(lm.target_host, (typeFreqs.host.get(lm.target_host) ?? 0) + 3);
        if (lm.actor) typeFreqs.user.set(lm.actor, (typeFreqs.user.get(lm.actor) ?? 0) + 2);
    }

    // Build allowed top-N sets
    const allowed: Record<GNodeType, Set<string>> = {
        host: new Set(), user: new Set(), process: new Set(),
        ip: new Set(), domain: new Set(), alert: new Set(),
    };
    for (const [t, fm] of Object.entries(typeFreqs) as [GNodeType, Map<string, number>][]) {
        for (const [id] of [...fm.entries()].sort((a, b) => b[1] - a[1]).slice(0, G_MAX_NODES[t])) {
            allowed[t].add(id);
        }
    }

    function ensureNode(id: string, type: GNodeType, label: string): GNode {
        const ex = nodeMap.get(id);
        if (ex) { ex.weight++; return ex; }
        const angle = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 80;
        const n: GNode = { id, type, label, x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, vx: 0, vy: 0, pinned: false, weight: 1 };
        nodeMap.set(id, n);
        return n;
    }

    function ensureEdge(src: string, tgt: string, type: GEdgeType) {
        if (src === tgt) return;
        const key = `${src}→${tgt}:${type}`;
        const ex = edgeMap.get(key);
        if (ex) { ex.weight++; return; }
        edgeMap.set(key, { source: src, target: tgt, edgeType: type, weight: 1 });
    }

    // Pass 2: build nodes/edges
    for (const ev of events) {
        const hostRaw = String(ev.host ?? ev.computer ?? "").trim();
        if (!hostRaw || !allowed.host.has(hostRaw)) continue;
        const hostId = `host:${hostRaw}`;
        ensureNode(hostId, "host", hostRaw);

        const userRaw = String(ev.user ?? "").trim();
        if (userRaw && !G_SYSTEM_USERS.has(userRaw.toLowerCase()) && allowed.user.has(userRaw)) {
            const uid = `user:${userRaw}`;
            ensureNode(uid, "user", userRaw);
            ensureEdge(hostId, uid, "logon");
        }

        const src = String(ev.source_short ?? "").toUpperCase();
        const dn = String(ev.display_name ?? "").trim();
        if (dn && (src === "PREFETCH" || src === "AMCACHE")) {
            const parts = dn.split(/[/\\]/);
            const pName = parts[parts.length - 1] ?? dn;
            if (allowed.process.has(pName)) {
                const pid = `proc:${pName}`;
                ensureNode(pid, "process", pName);
                ensureEdge(hostId, pid, "ran");
                if (userRaw && !G_SYSTEM_USERS.has(userRaw.toLowerCase()) && allowed.user.has(userRaw))
                    ensureEdge(`user:${userRaw}`, pid, "executed");
            }
        }

        if ((src === "SIGMA" || src === "HAYABUSA")) {
            const rule = String(ev.rule_name ?? ev.event_id ?? "").trim();
            if (rule && allowed.alert.has(rule)) {
                const aid = `alert:${rule}`;
                ensureNode(aid, "alert", rule.length > 30 ? rule.slice(0, 28) + "…" : rule);
                ensureEdge(hostId, aid, "alert_edge");
            }
        }

        const msg = String(ev.message ?? ev.description ?? "");
        for (const ioc of detectIOCs(msg)) {
            if (ioc.type === "IPv4" && !gIsPrivateIP(ioc.value) && allowed.ip.has(ioc.value)) {
                const iid = `ip:${ioc.value}`;
                ensureNode(iid, "ip", ioc.value);
                ensureEdge(hostId, iid, "network");
            }
            if (ioc.type === "Domain") {
                const d = ioc.value.toLowerCase();
                if (allowed.domain.has(d)) {
                    const did = `domain:${d}`;
                    ensureNode(did, "domain", d);
                    ensureEdge(hostId, did, "dns");
                }
            }
        }
    }

    for (const lm of lmDetections) {
        const sid = `host:${lm.source_host}`;
        const tid = `host:${lm.target_host}`;
        ensureNode(sid, "host", lm.source_host);
        ensureNode(tid, "host", lm.target_host);
        ensureEdge(sid, tid, "lateral");
        if (lm.actor) {
            const uid = `user:${lm.actor}`;
            ensureNode(uid, "user", lm.actor);
            ensureEdge(sid, uid, "logon");
            ensureEdge(tid, uid, "logon");
        }
    }

    // Remove truly isolated non-host nodes
    const connIds = new Set<string>();
    for (const e of edgeMap.values()) { connIds.add(e.source); connIds.add(e.target); }
    const finalNodes = [...nodeMap.values()].filter((n) => n.type === "host" || connIds.has(n.id));
    const finalIds = new Set(finalNodes.map((n) => n.id));
    const finalEdges = [...edgeMap.values()].filter((e) => finalIds.has(e.source) && finalIds.has(e.target));

    return { nodes: finalNodes, edges: finalEdges };
}

// Physics constants
const G_REPULSION = 9000;
const G_SPRING_K = 0.025;
const G_SPRING_REST = 130;
const G_FRICTION = 0.87;
const G_GRAVITY = 0.004;

function gSimStep(nodes: GNode[], edges: GEdge[], w: number, h: number): boolean {
    const cx = w / 2, cy = h / 2;
    let moving = false;

    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) {
        adj.get(e.source)?.push(e.target);
        adj.get(e.target)?.push(e.source);
    }
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    for (const node of nodes) {
        if (node.pinned) continue;
        let fx = 0, fy = 0;

        for (const other of nodes) {
            if (other.id === node.id) continue;
            const dx = node.x - other.x, dy = node.y - other.y;
            const d2 = Math.max(1, dx * dx + dy * dy);
            const d = Math.sqrt(d2);
            const f = G_REPULSION / d2;
            fx += (dx / d) * f; fy += (dy / d) * f;
        }

        for (const nid of (adj.get(node.id) ?? [])) {
            const nb = nodeById.get(nid);
            if (!nb) continue;
            const dx = nb.x - node.x, dy = nb.y - node.y;
            const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const f = G_SPRING_K * (d - G_SPRING_REST);
            fx += (dx / d) * f; fy += (dy / d) * f;
        }

        fx += (cx - node.x) * G_GRAVITY;
        fy += (cy - node.y) * G_GRAVITY;

        node.vx = (node.vx + fx) * G_FRICTION;
        node.vy = (node.vy + fy) * G_FRICTION;

        const spd = Math.sqrt(node.vx ** 2 + node.vy ** 2);
        if (spd > 12) { node.vx = (node.vx / spd) * 12; node.vy = (node.vy / spd) * 12; }

        node.x = Math.max(40, Math.min(w - 40, node.x + node.vx));
        node.y = Math.max(40, Math.min(h - 40, node.y + node.vy));

        if (spd > 0.15) moving = true;
    }
    return moving;
}

function GMiniMap({ nodes, edges, panX, panY, zoom, gw, gh }: {
    nodes: GNode[]; edges: GEdge[];
    panX: number; panY: number; zoom: number; gw: number; gh: number;
}) {
    const MW = 130, MH = 85;
    if (nodes.length === 0) return null;
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const dw = Math.max(1, maxX - minX), dh = Math.max(1, maxY - minY);
    const sc = Math.min((MW * 0.85) / dw, (MH * 0.85) / dh);
    const ox = (MW - dw * sc) / 2, oy = (MH - dh * sc) / 2;
    const mx = (x: number) => (x - minX) * sc + ox;
    const my = (y: number) => (y - minY) * sc + oy;
    const vl = (-panX / zoom - minX) * sc + ox;
    const vt = (-panY / zoom - minY) * sc + oy;
    const vw = (gw / zoom) * sc, vh = (gh / zoom) * sc;
    return (
        <div className="absolute bottom-10 right-2 z-20 border border-border/50 bg-card/90 rounded-sm overflow-hidden shadow-lg">
            <svg width={MW} height={MH}>
                {edges.slice(0, 150).map((e, i) => {
                    const s = nodes.find((n) => n.id === e.source), t = nodes.find((n) => n.id === e.target);
                    if (!s || !t) return null;
                    return <line key={i} x1={mx(s.x)} y1={my(s.y)} x2={mx(t.x)} y2={my(t.y)} stroke="#ffffff18" strokeWidth={0.5} />;
                })}
                {nodes.map((n) => (
                    <circle key={n.id} cx={mx(n.x)} cy={my(n.y)} r={2.5} fill={G_NODE_STYLES[n.type].stroke} opacity={0.8} />
                ))}
                <rect x={vl} y={vt} width={Math.max(4, vw)} height={Math.max(4, vh)} fill="none" stroke="#ffffff50" strokeWidth={1} />
            </svg>
        </div>
    );
}

function EntityGraph({
    events,
    lmDetections,
    onNodeClick,
}: {
    events: Record<string, unknown>[];
    lmDetections: LateralMovementDetection[];
    onNodeClick: (dsl: string) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dim, setDim] = useState({ w: 900, h: 500 });
    const nodesRef = useRef<GNode[]>([]);
    const edgesRef = useRef<GEdge[]>([]);
    const [, setTick] = useState(0);
    const rafRef = useRef<number | null>(null);
    const simRef = useRef(true);
    const stepsRef = useRef(0);

    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const panActiveRef = useRef(false);
    const lastPanRef = useRef({ x: 0, y: 0 });
    const draggingRef = useRef<string | null>(null);
    const dragOffRef = useRef({ x: 0, y: 0 });

    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Rebuild graph when inputs change
    useEffect(() => {
        const g = buildEntityGraph(events, lmDetections, dim.w, dim.h);
        nodesRef.current = g.nodes;
        edgesRef.current = g.edges;
        stepsRef.current = 0;
        simRef.current = true;
        setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events.length, lmDetections.length]);

    // Measure container
    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (r?.width && r.height) setDim({ w: r.width, h: r.height });
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Simulation RAF loop
    useEffect(() => {
        function step() {
            if (!simRef.current) return;
            const moving = gSimStep(nodesRef.current, edgesRef.current, dim.w, dim.h);
            stepsRef.current++;
            setTick((t) => t + 1);
            if (moving && stepsRef.current < 250) {
                rafRef.current = requestAnimationFrame(step);
            } else {
                simRef.current = false;
            }
        }
        rafRef.current = requestAnimationFrame(step);
        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dim.w, dim.h, nodesRef.current.length]);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;

    const focusSet = useMemo(() => {
        const id = hoveredId ?? selectedId;
        if (!id) return null;
        const s = new Set<string>([id]);
        for (const e of edges) {
            if (e.source === id) s.add(e.target);
            if (e.target === id) s.add(e.source);
        }
        return s;
    }, [hoveredId, selectedId, edges]);

    function handleWheel(e: React.WheelEvent) {
        e.preventDefault();
        setZoom((z) => Math.min(3, Math.max(0.2, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    }

    function handleBgDown(e: React.MouseEvent) {
        if (e.button !== 0) return;
        panActiveRef.current = true;
        lastPanRef.current = { x: e.clientX, y: e.clientY };
    }

    function handleMouseMove(e: React.MouseEvent) {
        if (draggingRef.current) {
            const node = nodesRef.current.find((n) => n.id === draggingRef.current);
            if (node && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                node.x = (e.clientX - rect.left - pan.x - dragOffRef.current.x) / zoom;
                node.y = (e.clientY - rect.top - pan.y - dragOffRef.current.y) / zoom;
                node.vx = 0; node.vy = 0; node.pinned = true;
                setTick((t) => t + 1);
            }
        } else if (panActiveRef.current) {
            const dx = e.clientX - lastPanRef.current.x;
            const dy = e.clientY - lastPanRef.current.y;
            lastPanRef.current = { x: e.clientX, y: e.clientY };
            setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        }
    }

    function handleMouseUp() { draggingRef.current = null; panActiveRef.current = false; }

    function handleNodeDown(e: React.MouseEvent, node: GNode) {
        e.stopPropagation();
        if (e.button !== 0) return;
        draggingRef.current = node.id;
        const rect = containerRef.current?.getBoundingClientRect();
        dragOffRef.current = {
            x: node.x * zoom - (e.clientX - (rect?.left ?? 0) - pan.x),
            y: node.y * zoom - (e.clientY - (rect?.top ?? 0) - pan.y),
        };
        if (!simRef.current) { simRef.current = true; stepsRef.current = 0; }
    }

    function handleNodeClick(e: React.MouseEvent, node: GNode) {
        e.stopPropagation();
        setSelectedId((prev) => (prev === node.id ? null : node.id));
        const q = nodeToDSL(node);
        if (q) onNodeClick(q);
    }

    function nodeToDSL(node: GNode): string {
        switch (node.type) {
            case "host":    return `host:${node.label}`;
            case "user":    return `user:${node.label}`;
            case "process": return `"${node.label}"`;
            case "ip":      return `"${node.label}"`;
            case "domain":  return `"${node.label}"`;
            case "alert":   return `rule:${node.label.replace(/…$/, "").trim()}`;
        }
    }

    function resetLayout() {
        const { w, h } = dim;
        for (const n of nodesRef.current) {
            const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 100;
            n.x = w / 2 + Math.cos(a) * d; n.y = h / 2 + Math.sin(a) * d;
            n.vx = 0; n.vy = 0; n.pinned = false;
        }
        stepsRef.current = 0; simRef.current = true;
        setPan({ x: 0, y: 0 }); setZoom(1);
        setTick((t) => t + 1);
    }

    const selectedNode = nodes.find((n) => n.id === selectedId);
    const connCount = useMemo(() => {
        if (!selectedId) return 0;
        return edges.filter((e) => e.source === selectedId || e.target === selectedId).length;
    }, [selectedId, edges]);

    if (nodes.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 font-mono text-sm text-muted-foreground">
                <Network className="w-4 h-4 mr-2" />
                No graph entities in current page events.
            </div>
        );
    }

    return (
        <div className="relative" style={{ height: "520px" }}>
            {/* Toolbar */}
            <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5">
                <button onClick={resetLayout} className="px-2 py-1 border border-border/50 bg-card/90 font-mono text-[10px] text-muted-foreground hover:text-foreground rounded-sm">RESET</button>
                <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} className="w-6 h-6 flex items-center justify-center border border-border/50 bg-card/90 font-mono text-xs text-muted-foreground hover:text-foreground rounded-sm">+</button>
                <button onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))} className="w-6 h-6 flex items-center justify-center border border-border/50 bg-card/90 font-mono text-xs text-muted-foreground hover:text-foreground rounded-sm">−</button>
                <span className="px-2 py-1 border border-border/40 bg-card/80 font-mono text-[10px] text-muted-foreground rounded-sm tabular-nums">{Math.round(zoom * 100)}%</span>
                <span className="px-2 py-1 border border-border/40 bg-card/80 font-mono text-[10px] text-muted-foreground rounded-sm">{nodes.length}N · {edges.length}E</span>
                {simRef.current && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" title="Simulation running" />}
            </div>

            {/* Selected node panel */}
            {selectedNode && (
                <div className="absolute top-2 right-36 z-20 min-w-[200px] max-w-[240px] border border-primary/40 bg-card/95 rounded-sm p-3 shadow-xl font-mono">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: G_NODE_STYLES[selectedNode.type].stroke }} />
                            <span className="text-[10px] text-muted-foreground">{G_NODE_TYPE_LABELS[selectedNode.type]}</span>
                        </div>
                        <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                    </div>
                    <div className="text-xs font-bold text-foreground break-all mb-1.5">{selectedNode.label}</div>
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                        <div>seen ×{selectedNode.weight} · {connCount} edge{connCount !== 1 ? "s" : ""}</div>
                        <div className="text-primary/70 pt-1">↑ timeline filtered above</div>
                    </div>
                </div>
            )}

            {/* SVG canvas */}
            <div
                ref={containerRef}
                className="w-full h-full overflow-hidden bg-black/20 border border-border/30 rounded-sm cursor-grab active:cursor-grabbing"
                onMouseDown={handleBgDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <svg width="100%" height="100%">
                    <defs>
                        {(Object.entries(G_EDGE_STYLES) as [GEdgeType, typeof G_EDGE_STYLES[GEdgeType]][]).map(([type, s]) => (
                            <marker key={type} id={`garrow-${type}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                <path d="M0,0 L0,6 L6,3 z" fill={s.stroke} opacity={0.65} />
                            </marker>
                        ))}
                    </defs>
                    <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                        {/* Edges */}
                        {edges.map((edge, i) => {
                            const s = nodes.find((n) => n.id === edge.source);
                            const t = nodes.find((n) => n.id === edge.target);
                            if (!s || !t) return null;
                            const es = G_EDGE_STYLES[edge.edgeType];
                            const dim2 = focusSet ? !focusSet.has(s.id) && !focusSet.has(t.id) : false;
                            const dx = t.x - s.x, dy = t.y - s.y;
                            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                            const sr = G_NODE_STYLES[s.type].r + 2;
                            const tr = G_NODE_STYLES[t.type].r + 5;
                            const x1 = s.x + (dx / dist) * sr, y1 = s.y + (dy / dist) * sr;
                            const x2 = t.x - (dx / dist) * tr, y2 = t.y - (dy / dist) * tr;
                            // Slight curve via quadratic bezier
                            const mx2 = (x1 + x2) / 2 + (dy / dist) * 18;
                            const my2 = (y1 + y2) / 2 - (dx / dist) * 18;
                            return (
                                <path key={i}
                                    d={`M${x1},${y1} Q${mx2},${my2} ${x2},${y2}`}
                                    fill="none"
                                    stroke={es.stroke}
                                    strokeWidth={es.width * Math.min(2.5, edge.weight * 0.6 + 0.4)}
                                    strokeDasharray={es.dash}
                                    opacity={dim2 ? 0.05 : 0.5}
                                    markerEnd={`url(#garrow-${edge.edgeType})`}
                                />
                            );
                        })}
                        {/* Nodes */}
                        {nodes.map((node) => {
                            const ns = G_NODE_STYLES[node.type];
                            const isHov = hoveredId === node.id;
                            const isSel = selectedId === node.id;
                            const dim2 = focusSet ? !focusSet.has(node.id) : false;
                            const r = ns.r * (isHov || isSel ? 1.15 : 1);
                            return (
                                <g key={node.id}
                                    transform={`translate(${node.x},${node.y})`}
                                    onMouseDown={(e) => handleNodeDown(e, node)}
                                    onClick={(e) => handleNodeClick(e, node)}
                                    onMouseEnter={() => setHoveredId(node.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    style={{ cursor: "pointer", opacity: dim2 ? 0.15 : 1 }}
                                >
                                    {(isHov || isSel) && (
                                        <circle r={r + 7} fill="none" stroke={ns.stroke} strokeWidth={1} opacity={0.3} />
                                    )}
                                    <circle r={r} fill={ns.fill} stroke={ns.stroke} strokeWidth={isSel ? 2.5 : isHov ? 2 : 1.5} opacity={0.92} />
                                    <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.72} fill={ns.stroke} opacity={0.85} style={{ pointerEvents: "none", userSelect: "none" }}>
                                        {ns.icon}
                                    </text>
                                    <text y={r + 12} textAnchor="middle" fontSize={9} fill="#94a3b8" fontFamily="monospace" style={{ pointerEvents: "none", userSelect: "none" }}>
                                        {node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label}
                                    </text>
                                    {node.weight > 2 && (
                                        <text x={r - 2} y={-r + 6} fontSize={7} fill={ns.stroke} fontFamily="monospace" opacity={0.65} style={{ pointerEvents: "none", userSelect: "none" }}>
                                            ×{node.weight}
                                        </text>
                                    )}
                                    {node.pinned && (
                                        <circle r={3} cx={r - 4} cy={-r + 4} fill={ns.stroke} opacity={0.6} />
                                    )}
                                </g>
                            );
                        })}
                    </g>
                </svg>
                <GMiniMap nodes={nodes} edges={edges} panX={pan.x} panY={pan.y} zoom={zoom} gw={dim.w} gh={dim.h} />
            </div>

            {/* Legend */}
            <div className="absolute bottom-1 left-1 z-20 flex flex-wrap items-center gap-2 px-2 py-1.5 border border-border/40 bg-card/90 rounded-sm">
                {(Object.entries(G_NODE_STYLES) as [GNodeType, typeof G_NODE_STYLES[GNodeType]][]).map(([type, s]) => (
                    <div key={type} className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: s.fill, borderColor: s.stroke }} />
                        <span className="font-mono text-[9px] text-muted-foreground">{G_NODE_TYPE_LABELS[type]}</span>
                    </div>
                ))}
                <div className="w-px h-3 bg-border/50 mx-1" />
                <span className="font-mono text-[9px] text-muted-foreground/60">DRAG·SCROLL·CLICK</span>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperTimeline() {
    const navigate = useNavigate();
    const { id: incidentId } = useParams<{ id: string }>();

    // Build / status polling
    const [stStatus, setStStatus] = useState<SuperTimelineStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [building, setBuilding] = useState(false);
    const [buildError, setBuildError] = useState<string | null>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Search & filter state
    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(100);
    const [pageJumpInput, setPageJumpInput] = useState("");

    // Host filter
    const [activeHosts, setActiveHosts] = useState<Set<string>>(new Set());
    const [allHostsActive, setAllHostsActive] = useState(true);

    // Source filter
    const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
    const [allSourcesActive, setAllSourcesActive] = useState(true);

    // Date range filter
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [dateFilterActive, setDateFilterActive] = useState(false);

    // Active quick filter
    const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);

    // Sort state
    const [sortBy, setSortBy] = useState<SortKey>("datetime");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    // Column visibility
    const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(loadVisibleCols);
    const [colPickerOpen, setColPickerOpen] = useState(false);

    // Export loading
    const [exportLoading, setExportLoading] = useState(false);

    // Selected event for detail panel
    const [selectedEvent, setSelectedEvent] = useState<Record<string, unknown> | null>(null);

    // Compare events mode (Shift+click)
    const [compareEvents, setCompareEvents] = useState<[Record<string, unknown>, Record<string, unknown>] | null>(null);

    // Bookmarks
    const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks(incidentId ?? ""));
    const [showBookmarks, setShowBookmarks] = useState(false);

    // Keyboard navigation
    const [focusedRowIndex, setFocusedRowIndex] = useState(-1);

    // Event tags (per-incident, persisted in localStorage)
    const [eventTags, setEventTags] = useState<Record<string, EventTagValue>>(
        () => loadTags(incidentId ?? "")
    );
    const [tagFilterActive, setTagFilterActive] = useState<EventTagValue | null>(null);

    function setEventTag(hash: string, tag: EventTagValue | null) {
        setEventTags((prev) => {
            const next = { ...prev };
            if (tag === null || next[hash] === tag) {
                delete next[hash]; // toggle off
            } else {
                next[hash] = tag;
            }
            saveTags(incidentId ?? "", next);
            return next;
        });
    }

    // Lateral movement collapsible
    const [lmExpanded, setLmExpanded] = useState(true);

    // Query help tooltip
    const [showQueryHelp, setShowQueryHelp] = useState(false);

    // Entity graph toggle
    const [showGraph, setShowGraph] = useState(false);

    // ── Close column picker on outside click ─────────────────────────────────
    useEffect(() => {
        if (!colPickerOpen) return;
        function handler(e: MouseEvent) {
            if (!(e.target as HTMLElement).closest("[data-col-picker]")) {
                setColPickerOpen(false);
            }
        }
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [colPickerOpen]);

    // ── Fetch current status ──────────────────────────────────────────────────
    const fetchStatus = useCallback(async () => {
        if (!incidentId) return;
        try {
            const data = await apiGet<SuperTimelineStatus>(
                `/processing/incident/${incidentId}/super-timeline/status`
            );
            setStStatus(data);
            setStatusError(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            if (!msg.includes("404") && !msg.includes("not found")) {
                setStatusError(msg);
            }
            setStStatus(null);
        } finally {
            setStatusLoading(false);
        }
    }, [incidentId]);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    // Polling while PENDING / BUILDING
    useEffect(() => {
        const shouldPoll =
            stStatus?.status === "BUILDING" || stStatus?.status === "PENDING";
        if (shouldPoll) {
            pollingRef.current = setInterval(fetchStatus, 3000);
        } else {
            if (pollingRef.current !== null) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        }
        return () => {
            if (pollingRef.current !== null) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [stStatus?.status, fetchStatus]);

    // ── Build trigger ─────────────────────────────────────────────────────────
    async function triggerBuild() {
        if (!incidentId) return;
        setBuildError(null);
        setBuilding(true);
        try {
            const data = await apiPost<SuperTimelineStatus>(
                `/processing/incident/${incidentId}/super-timeline/trigger`,
                {}
            );
            setStStatus(data);
        } catch (err) {
            setBuildError(err instanceof Error ? err.message : "Build trigger failed");
        } finally {
            setBuilding(false);
        }
    }

    // ── Query param builders ──────────────────────────────────────────────────
    const isDone = stStatus?.status === "DONE";

    // Parse DSL from debounced search input
    const parsedDSL = useMemo(() => parseDSLQuery(debouncedSearch), [debouncedSearch]);

    // Resolved filter params: DSL field values take priority over chip selection
    const hostsParam = parsedDSL.hosts.length > 0
        ? parsedDSL.hosts.join(",")
        : allHostsActive ? "" : Array.from(activeHosts).join(",");
    const sourceParam = parsedDSL.sources.length > 0
        ? parsedDSL.sources.join(",")
        : allSourcesActive ? "" : Array.from(activeSources).join(",");
    const userFilterParam  = parsedDSL.users.join(",");
    const eidFilterParam   = parsedDSL.eventIds.join(",");
    const ruleFilterParam  = parsedDSL.rules.join(",");

    const { data: timelineData, isLoading: tlLoading, error: tlError } =
        useQuery<SuperTimelineResponse>({
            queryKey: [
                "super-timeline-data",
                incidentId,
                parsedDSL.q,
                parsedDSL.hosts.join(","),
                parsedDSL.sources.join(","),
                userFilterParam,
                eidFilterParam,
                ruleFilterParam,
                page,
                pageSize,
                hostsParam,
                sourceParam,
                dateFilterActive ? dateFrom : "",
                dateFilterActive ? dateTo : "",
                sortBy,
                sortOrder,
            ],
            queryFn: () => {
                const params = new URLSearchParams({
                    page: String(page),
                    limit: String(pageSize),
                    sort_by: sortBy,
                    sort_dir: sortOrder,
                });
                if (parsedDSL.q) params.set("q", parsedDSL.q);
                if (hostsParam)  params.set("hosts", hostsParam);
                if (sourceParam) params.set("source", sourceParam);
                if (userFilterParam)  params.set("user_filter", userFilterParam);
                if (eidFilterParam)   params.set("event_id_filter", eidFilterParam);
                if (ruleFilterParam)  params.set("rule_filter", ruleFilterParam);
                if (dateFilterActive && dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
                if (dateFilterActive && dateTo)   params.set("date_to",   new Date(dateTo).toISOString());
                return apiGet<SuperTimelineResponse>(
                    `/evidence/super-timeline/${incidentId}?${params}`
                );
            },
            enabled: isDone,
        });

    // ── Lateral movement query ────────────────────────────────────────────────
    const { data: lmData, isLoading: lmLoading, error: lmError } =
        useQuery<LateralMovementDetection[]>({
            queryKey: ["lateral-movement", incidentId, stStatus?.id],
            queryFn: () =>
                apiGet<LateralMovementDetection[]>(
                    `/processing/incident/${incidentId}/super-timeline/lateral-movement`
                ),
            enabled: isDone,
        });

    useEffect(() => {
        if (tlError) console.error("[SuperTimeline] timeline query error:", tlError);
    }, [tlError]);
    useEffect(() => {
        if (lmError) console.error("[SuperTimeline] lateral movement query error:", lmError);
    }, [lmError]);

    // ── Derived lists from response ───────────────────────────────────────────
    const knownHosts: string[]  = timelineData?.hosts ?? [];
    const knownSources: string[] = timelineData?.source_shorts ?? [];

    // Initialise activeHosts on first load
    useEffect(() => {
        if (knownHosts.length > 0 && activeHosts.size === 0) {
            setActiveHosts(new Set(knownHosts));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [knownHosts.join(",")]);

    // Initialise activeSources on first load
    useEffect(() => {
        if (knownSources.length > 0 && activeSources.size === 0) {
            setActiveSources(new Set(knownSources));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [knownSources.join(",")]);

    // ── Search debounce ───────────────────────────────────────────────────────
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    function handleSearchChange(val: string) {
        setSearchInput(val);
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            setDebouncedSearch(val);
            setPage(1);
        }, 400);
    }

    // ── Quick filter ──────────────────────────────────────────────────────────
    function applyQuickFilter(qf: QuickFilter) {
        if (activeQuickFilter === qf.id) {
            // Toggle off — clear
            setActiveQuickFilter(null);
            setDebouncedSearch("");
            setSearchInput("");
            setAllSourcesActive(true);
            setActiveSources(new Set(knownSources));
        } else {
            setActiveQuickFilter(qf.id);
            const newQ = qf.q ?? "";
            setSearchInput(newQ);
            setDebouncedSearch(newQ);
            if (qf.sources) {
                setAllSourcesActive(false);
                setActiveSources(new Set(qf.sources));
            } else {
                setAllSourcesActive(true);
                setActiveSources(new Set(knownSources));
            }
        }
        setPage(1);
    }

    // ── Pagination ────────────────────────────────────────────────────────────
    const totalPages = timelineData?.total_pages ?? (timelineData ? Math.ceil(timelineData.total / pageSize) : 0);

    function handlePageSizeChange(newSize: number) {
        setPageSize(newSize);
        setPage(1);
    }

    function handlePageJump(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key !== "Enter") return;
        const target = parseInt(pageJumpInput, 10);
        if (!isNaN(target) && target >= 1 && target <= totalPages) {
            setPage(target);
        }
        setPageJumpInput("");
    }

    // ── Host filter helpers ───────────────────────────────────────────────────
    function toggleHost(host: string) {
        setAllHostsActive(false);
        setActiveHosts((prev) => {
            const next = new Set(prev);
            next.has(host) ? next.delete(host) : next.add(host);
            return next;
        });
        setPage(1);
    }
    function toggleAllHosts() {
        setAllHostsActive(true);
        setActiveHosts(new Set(knownHosts));
        setPage(1);
    }

    // ── Source filter helpers ─────────────────────────────────────────────────
    function toggleSource(src: string) {
        setAllSourcesActive(false);
        setActiveQuickFilter(null);
        setActiveSources((prev) => {
            const next = new Set(prev);
            next.has(src) ? next.delete(src) : next.add(src);
            return next;
        });
        setPage(1);
    }
    function toggleAllSources() {
        setAllSourcesActive(true);
        setActiveSources(new Set(knownSources));
        setActiveQuickFilter(null);
        setPage(1);
    }

    // ── Date filter helpers ───────────────────────────────────────────────────
    function applyDateFilter() {
        setDateFilterActive(true);
        setPage(1);
    }
    function clearDateFilter() {
        setDateFrom("");
        setDateTo("");
        setDateFilterActive(false);
        setPage(1);
    }

    // ── Sort handler ─────────────────────────────────────────────────────────
    function handleSort(col: SortKey) {
        if (sortBy === col) {
            setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        } else {
            setSortBy(col);
            setSortOrder("asc");
        }
        setPage(1);
    }

    // ── Column visibility ─────────────────────────────────────────────────────
    function toggleCol(key: ColumnKey) {
        setVisibleCols((prev) => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            try { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
            return next;
        });
    }

    // ── Export download ───────────────────────────────────────────────────────
    async function downloadExport(fmt: "csv" | "jsonl") {
        if (!incidentId || exportLoading) return;
        setExportLoading(true);
        try {
            const params = new URLSearchParams({ format: fmt });
            if (debouncedSearch) params.set("q", debouncedSearch);
            if (hostsParam)      params.set("hosts", hostsParam);
            if (sourceParam)     params.set("source", sourceParam);
            if (dateFilterActive && dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
            if (dateFilterActive && dateTo)   params.set("date_to", new Date(dateTo).toISOString());

            const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:8000/api/v1";
            const url = `${baseUrl}/evidence/super-timeline/${incidentId}/export?${params}`;
            const raw = localStorage.getItem("dfir_auth");
            const token = raw ? (JSON.parse(raw) as { token?: string }).token : null;
            const res = await fetch(url, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error(`Export failed: ${res.status}`);
            const blob = await res.blob();
            const href = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = href;
            a.download = `super-timeline-${incidentId}.${fmt}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(href);
        } catch (err) {
            console.error("[SuperTimeline] export failed:", err);
        } finally {
            setExportLoading(false);
        }
    }

    // ── Bookmark toggle ───────────────────────────────────────────────────────
    function toggleBookmark(event: Record<string, unknown>) {
        if (!incidentId) return;
        const eventHash = hashEvent(event);
        setBookmarks((prev) => {
            const exists = prev.some((b) => b.eventHash === eventHash);
            let next: Bookmark[];
            if (exists) {
                next = prev.filter((b) => b.eventHash !== eventHash);
            } else {
                const bm: Bookmark = {
                    eventHash,
                    note: "",
                    createdAt: new Date().toISOString(),
                    datetime: String(event["datetime"] ?? event["timestamp"] ?? ""),
                    host: String(event["host"] ?? event["computer"] ?? "UNKNOWN"),
                    message: String(event["message"] ?? event["description"] ?? ""),
                    source_short: String(event["source_short"] ?? ""),
                };
                next = [...prev, bm];
            }
            saveBookmarks(incidentId, next);
            return next;
        });
    }

    function isEventBookmarked(event: Record<string, unknown>): boolean {
        const h = hashEvent(event);
        return bookmarks.some((b) => b.eventHash === h);
    }

    // ── Row click handler ─────────────────────────────────────────────────────
    function handleRowClick(e: React.MouseEvent, row: Record<string, unknown>, index: number) {
        setFocusedRowIndex(index);
        if (e.shiftKey) {
            if (!selectedEvent || selectedEvent === row) {
                setSelectedEvent(row);
            } else {
                setCompareEvents([selectedEvent, row]);
                setSelectedEvent(null);
            }
        } else {
            setCompareEvents(null);
            setSelectedEvent((prev) => (prev === row ? null : row));
        }
    }

    // ── Keyboard navigation ───────────────────────────────────────────────────
    const rows = timelineData?.data ?? [];
    useEffect(() => {
        if (!isDone) return;
        function handleKeyDown(e: KeyboardEvent) {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === "Escape") {
                setSelectedEvent(null);
                setCompareEvents(null);
            } else if (e.key === "ArrowDown" && !selectedEvent) {
                e.preventDefault();
                setFocusedRowIndex((i) => Math.min(i + 1, rows.length - 1));
            } else if (e.key === "ArrowUp" && !selectedEvent) {
                e.preventDefault();
                setFocusedRowIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
                if (focusedRowIndex >= 0 && rows[focusedRowIndex]) {
                    setSelectedEvent(rows[focusedRowIndex] ?? null);
                    setCompareEvents(null);
                }
            } else if ((e.key === "b" || e.key === "B") && focusedRowIndex >= 0 && rows[focusedRowIndex]) {
                toggleBookmark(rows[focusedRowIndex]!);
            }
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDone, focusedRowIndex, rows, selectedEvent]);

    // ── Active filter count (for badge) ──────────────────────────────────────
    const activeFilterCount =
        (debouncedSearch ? 1 : 0) +
        (!allHostsActive ? 1 : 0) +
        (!allSourcesActive ? 1 : 0) +
        (dateFilterActive ? 1 : 0);

    // ── Derived build state ───────────────────────────────────────────────────
    const isBuilding = building || stStatus?.status === "BUILDING" || stStatus?.status === "PENDING";
    const isFailed   = stStatus?.status === "FAILED";

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <AppLayout
            title="SUPER TIMELINE"
            subtitle={`INCIDENT: ${incidentId}`}
            headerActions={
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/incidents/${incidentId}/processing`)}
                >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    BACK TO PIPELINE
                </Button>
            }
        >
            <div className="p-6 flex flex-col gap-5 h-full">

                {/* ── Initial loading ─────────────────────────────────────── */}
                {statusLoading && (
                    <TacticalPanel title="SUPER TIMELINE STATUS" status="active">
                        <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            CHECKING STATUS...
                        </div>
                    </TacticalPanel>
                )}

                {/* ── Status error (non-404) ──────────────────────────────── */}
                {!statusLoading && statusError && (
                    <TacticalPanel title="STATUS ERROR" status="offline">
                        <div className="font-mono text-sm text-destructive py-4">
                            ERROR: {statusError}
                        </div>
                    </TacticalPanel>
                )}

                {/* ── Build Panel (null / FAILED / not started) ───────────── */}
                {!statusLoading && !isDone && (
                    <TacticalPanel
                        title="BUILD SUPER TIMELINE"
                        status={isBuilding ? "active" : isFailed ? "offline" : "warning"}
                    >
                        <div className="space-y-5">
                            <p className="font-mono text-sm text-muted-foreground leading-relaxed">
                                Merge timelines from all processed hosts into a unified
                                cross-host timeline with lateral movement detection.
                            </p>
                            {isFailed && stStatus?.error_message && (
                                <div className="p-3 border border-destructive/40 bg-destructive/10 text-destructive font-mono text-xs">
                                    LAST BUILD FAILED: {stStatus.error_message}
                                </div>
                            )}
                            {buildError && (
                                <div className="p-3 border border-destructive/40 bg-destructive/10 text-destructive font-mono text-xs">
                                    ERROR: {buildError}
                                </div>
                            )}
                            {isBuilding ? (
                                <div className="flex items-center gap-4 font-mono text-sm text-primary py-3">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <div>
                                        <div className="font-bold">
                                            {stStatus?.status === "PENDING"
                                                ? "QUEUED — WAITING FOR WORKER..."
                                                : "BUILDING SUPER TIMELINE..."}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5 animate-pulse">
                                            AUTO-REFRESH ACTIVE (3s)
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    variant="tactical"
                                    onClick={triggerBuild}
                                    disabled={isBuilding}
                                    className="gap-2"
                                >
                                    <Database className="w-4 h-4" />
                                    {isFailed ? "REBUILD SUPER TIMELINE" : "BUILD SUPER TIMELINE"}
                                </Button>
                            )}
                        </div>
                    </TacticalPanel>
                )}

                {/* ── Status Bar (DONE) ───────────────────────────────────── */}
                {isDone && stStatus && (
                    <TacticalPanel title="SUPER TIMELINE STATUS" status="verified">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/40 rounded-sm font-mono text-xs">
                                    <Server className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-muted-foreground">HOSTS</span>
                                    <span className="font-bold">{stStatus.host_count ?? 0}</span>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/40 rounded-sm font-mono text-xs">
                                    <Database className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-muted-foreground">EVENTS</span>
                                    <span className="font-bold">{stStatus.event_count?.toLocaleString() ?? 0}</span>
                                </div>
                                {stStatus.completed_at && (
                                    <div className="flex items-center gap-2 px-3 py-2 border border-border/60 bg-secondary/40 rounded-sm font-mono text-xs">
                                        <Clock className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-muted-foreground">COMPLETED</span>
                                        <span className="font-bold">{formatTs(stStatus.completed_at)}</span>
                                    </div>
                                )}
                                {lmData && lmData.length > 0 && (
                                    <div className="flex items-center gap-2 px-3 py-2 border border-red-500/40 bg-red-500/10 rounded-sm font-mono text-xs text-red-400">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        <span>{lmData.length} LATERAL MOVEMENT DETECTIONS</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant={showGraph ? "tactical" : "outline"}
                                    size="sm"
                                    onClick={() => setShowGraph((v) => !v)}
                                    className="gap-2 font-mono text-xs"
                                >
                                    <Network className="w-3.5 h-3.5" />
                                    {showGraph ? "HIDE GRAPH" : "ENTITY GRAPH"}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={triggerBuild}
                                    disabled={isBuilding}
                                    className="gap-2 font-mono text-xs"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    REBUILD
                                </Button>
                            </div>
                        </div>
                    </TacticalPanel>
                )}

                {/* ── Entity Relationship Graph ────────────────────────────── */}
                {isDone && showGraph && (
                    <TacticalPanel
                        title="ENTITY RELATIONSHIP GRAPH"
                        status="active"
                        headerActions={
                            <span className="font-mono text-[10px] text-muted-foreground">
                                built from current page · click node to filter timeline
                            </span>
                        }
                    >
                        <EntityGraph
                            events={rows}
                            lmDetections={lmData ?? []}
                            onNodeClick={(q) => { handleSearchChange(q); setPage(1); }}
                        />
                    </TacticalPanel>
                )}

                {/* ── Filter Panel ────────────────────────────────────────── */}
                {isDone && (
                    <TacticalPanel
                        title={`FILTERS${activeFilterCount > 0 ? ` (${activeFilterCount} ACTIVE)` : ""}`}
                        className="shrink-0"
                        headerActions={
                            activeFilterCount > 0 ? (
                                <button
                                    onClick={() => {
                                        setDebouncedSearch(""); setSearchInput("");
                                        setAllHostsActive(true); setActiveHosts(new Set(knownHosts));
                                        setAllSourcesActive(true); setActiveSources(new Set(knownSources));
                                        clearDateFilter();
                                        setActiveQuickFilter(null);
                                        setPage(1);
                                    }}
                                    className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                    CLEAR ALL
                                </button>
                            ) : undefined
                        }
                    >
                        <div className="space-y-4">

                            {/* Search + Date range */}
                            <div className="flex items-center gap-3 flex-wrap">
                                {/* Search input */}
                                <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-xl">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                                        <input
                                            type="text"
                                            value={searchInput}
                                            onChange={(e) => handleSearchChange(e.target.value)}
                                            placeholder='host:DC01 source:EVTX eid:4624 user:admin "phrase"'
                                            className="w-full pl-8 pr-7 h-8 bg-background border border-input rounded-sm font-mono text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                        {searchInput && (
                                            <button
                                                onClick={() => { handleSearchChange(""); setActiveQuickFilter(null); }}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                    {/* Query help button */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowQueryHelp((v) => !v)}
                                            className={`h-8 w-8 flex items-center justify-center rounded-sm border transition-colors ${showQueryHelp ? "border-primary text-primary bg-primary/10" : "border-border/40 text-muted-foreground hover:text-foreground hover:border-border"}`}
                                            title="Query syntax help"
                                        >
                                            <HelpCircle className="w-3.5 h-3.5" />
                                        </button>
                                        {showQueryHelp && (
                                            <div className="absolute top-10 left-0 z-50 w-80 border border-primary/30 bg-card shadow-xl p-4 font-mono text-xs space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-primary font-bold tracking-wider">DSL QUERY SYNTAX</span>
                                                    <button onClick={() => setShowQueryHelp(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                                                </div>
                                                <div className="space-y-2 text-muted-foreground">
                                                    <div className="text-foreground text-[10px] uppercase tracking-wider border-b border-border/40 pb-1">Field Filters</div>
                                                    {[
                                                        ["host:DC01",       "filter by hostname"],
                                                        ["source:EVTX",     "filter by source type"],
                                                        ["user:admin",      "filter by username"],
                                                        ["eid:4624",        "filter by event ID"],
                                                        ["rule:mimikatz",   "filter by Sigma rule"],
                                                    ].map(([ex, desc]) => (
                                                        <div key={ex} className="flex justify-between gap-2">
                                                            <code className="text-primary">{ex}</code>
                                                            <span className="text-[10px]">{desc}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="space-y-2 text-muted-foreground">
                                                    <div className="text-foreground text-[10px] uppercase tracking-wider border-b border-border/40 pb-1">Operators &amp; Syntax</div>
                                                    {[
                                                        ["user:*admin*",          "wildcard match"],
                                                        ['"lateral movement"',    "exact phrase"],
                                                        ["-source:SIGMA",         "exclude (NOT)"],
                                                        ["host:DC01 eid:4624",    "implicit AND"],
                                                    ].map(([ex, desc]) => (
                                                        <div key={ex} className="flex justify-between gap-2">
                                                            <code className="text-primary">{ex}</code>
                                                            <span className="text-[10px]">{desc}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
                                                    Bare terms search across all fields. Multiple field: filters are OR'd within the same field type.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Date from */}
                                <div className="flex items-center gap-2">
                                    <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    <input
                                        type="datetime-local"
                                        value={dateFrom}
                                        onChange={(e) => { setDateFrom(e.target.value); setDateFilterActive(false); }}
                                        className="h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                                    />
                                    <span className="font-mono text-xs text-muted-foreground">TO</span>
                                    <input
                                        type="datetime-local"
                                        value={dateTo}
                                        onChange={(e) => { setDateTo(e.target.value); setDateFilterActive(false); }}
                                        className="h-8 px-2 bg-background border border-input rounded-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                                    />
                                    {(dateFrom || dateTo) && (
                                        <Button
                                            variant={dateFilterActive ? "tactical" : "outline"}
                                            size="sm"
                                            className="h-8 font-mono text-xs px-3"
                                            onClick={dateFilterActive ? clearDateFilter : applyDateFilter}
                                        >
                                            {dateFilterActive ? (
                                                <><X className="w-3 h-3 mr-1" />CLEAR</>
                                            ) : (
                                                "APPLY"
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Quick filters */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                    <Zap className="w-3 h-3" />
                                    QUICK:
                                </span>
                                {QUICK_FILTERS.map((qf) => (
                                    <button
                                        key={qf.id}
                                        onClick={() => applyQuickFilter(qf)}
                                        className={`px-2.5 py-1 rounded-sm border font-mono text-xs transition-all ${
                                            activeQuickFilter === qf.id
                                                ? "border-primary bg-primary/15 text-primary"
                                                : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                                        }`}
                                    >
                                        {qf.label}
                                    </button>
                                ))}
                            </div>

                            {/* Host filter */}
                            {knownHosts.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 shrink-0">
                                        <Users className="w-3 h-3" />
                                        HOSTS:
                                    </span>
                                    <button
                                        onClick={toggleAllHosts}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm border font-mono text-xs transition-colors ${
                                            allHostsActive
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-border/40 text-muted-foreground hover:border-border"
                                        }`}
                                    >
                                        ALL
                                        <span className="px-1 py-0.5 bg-secondary rounded-sm text-[10px]">
                                            {knownHosts.length}
                                        </span>
                                    </button>
                                    {knownHosts.map((host) => (
                                        <HostChip
                                            key={host}
                                            host={host}
                                            allHosts={knownHosts}
                                            active={allHostsActive || activeHosts.has(host)}
                                            onClick={() => toggleHost(host)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Source filter */}
                            {knownSources.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 shrink-0">
                                        <Tag className="w-3 h-3" />
                                        SOURCE:
                                    </span>
                                    <button
                                        onClick={toggleAllSources}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm border font-mono text-xs transition-colors ${
                                            allSourcesActive
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-border/40 text-muted-foreground hover:border-border"
                                        }`}
                                    >
                                        ALL
                                        <span className="px-1 py-0.5 bg-secondary rounded-sm text-[10px]">
                                            {knownSources.length}
                                        </span>
                                    </button>
                                    {knownSources.map((src) => (
                                        <SourceChip
                                            key={src}
                                            source={src}
                                            active={allSourcesActive || activeSources.has(src)}
                                            onClick={() => toggleSource(src)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </TacticalPanel>
                )}

                {/* ── Timeline Grid ────────────────────────────────────────── */}
                {isDone && (
                    <TacticalPanel
                        title="CROSS-HOST EVENT TIMELINE"
                        className="flex-1 flex flex-col min-h-0"
                        status={tlLoading ? "active" : "online"}
                        headerActions={
                            <div className="flex items-center gap-1.5">
                                {timelineData && !showBookmarks && (
                                    <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                        {timelineData.total.toLocaleString()} EVENTS
                                        {totalPages > 1 && <span className="ml-1 text-muted-foreground/60">· PG {page}/{totalPages}</span>}
                                    </span>
                                )}

                                {/* Bookmarks button */}
                                {bookmarks.length > 0 && (
                                    <Button
                                        variant={showBookmarks ? "tactical" : "outline"}
                                        size="sm"
                                        className="h-7 gap-1 px-2 font-mono text-[10px]"
                                        onClick={() => setShowBookmarks((v) => !v)}
                                        title="Show bookmarks"
                                    >
                                        <BookmarkCheck className="w-3 h-3" />
                                        BOOKMARKS ({bookmarks.length})
                                    </Button>
                                )}

                                {/* Tag filter */}
                                {Object.keys(eventTags).length > 0 && (
                                    <div className="relative">
                                        <select
                                            value={tagFilterActive ?? ""}
                                            onChange={(e) => setTagFilterActive((e.target.value as EventTagValue) || null)}
                                            className="h-7 px-2 bg-card border border-border rounded-sm font-mono text-[10px] text-muted-foreground focus:outline-none focus:border-primary cursor-pointer"
                                            title="Filter by tag"
                                        >
                                            <option value="">TAGS ({Object.keys(eventTags).length})</option>
                                            {(Object.entries(EVENT_TAG_META) as [EventTagValue, typeof EVENT_TAG_META[EventTagValue]][]).map(([k, v]) => {
                                                const count = Object.values(eventTags).filter((t) => t === k).length;
                                                return count > 0 ? <option key={k} value={k}>{v.label} ({count})</option> : null;
                                            })}
                                        </select>
                                    </div>
                                )}

                                {/* Column picker */}
                                <div className="relative" data-col-picker>
                                    <Button
                                        variant="outline" size="sm"
                                        className="h-7 gap-1 px-2 font-mono text-[10px]"
                                        onClick={() => setColPickerOpen((v) => !v)}
                                        title="Toggle columns"
                                    >
                                        <Columns className="w-3 h-3" />
                                        COLS
                                    </Button>
                                    {colPickerOpen && (
                                        <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-sm shadow-lg p-2 min-w-[160px] space-y-1">
                                            {OPTIONAL_COLS.map((c) => (
                                                <label
                                                    key={c.key}
                                                    className="flex items-center gap-2 font-mono text-xs cursor-pointer hover:text-foreground text-muted-foreground px-1 py-0.5 rounded-sm hover:bg-secondary/50"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={visibleCols.has(c.key)}
                                                        onChange={() => toggleCol(c.key)}
                                                        className="w-3 h-3 accent-primary"
                                                    />
                                                    {c.label}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Export dropdown */}
                                <div className="relative group">
                                    <Button
                                        variant="outline" size="sm"
                                        className="h-7 gap-1 px-2 font-mono text-[10px]"
                                        disabled={exportLoading || !timelineData}
                                        title="Export timeline"
                                    >
                                        {exportLoading
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : <Download className="w-3 h-3" />}
                                        EXPORT
                                        <ChevronDown className="w-2.5 h-2.5" />
                                    </Button>
                                    <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block bg-card border border-border rounded-sm shadow-lg overflow-hidden min-w-[110px]">
                                        <button
                                            onClick={() => downloadExport("csv")}
                                            className="flex items-center gap-2 w-full px-3 py-1.5 font-mono text-xs hover:bg-secondary/60 text-left"
                                        >
                                            <FileText className="w-3 h-3" />CSV
                                        </button>
                                        <button
                                            onClick={() => downloadExport("jsonl")}
                                            className="flex items-center gap-2 w-full px-3 py-1.5 font-mono text-xs hover:bg-secondary/60 text-left"
                                        >
                                            <Hash className="w-3 h-3" />JSONL
                                        </button>
                                    </div>
                                </div>

                                <Button
                                    variant="outline" size="sm" className="h-7 w-7 p-0"
                                    disabled={page <= 1 || tlLoading}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                    <ChevronLeft className="w-3 h-3" />
                                </Button>
                                <Button
                                    variant="outline" size="sm" className="h-7 w-7 p-0"
                                    disabled={page >= totalPages || tlLoading}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    <ChevronRight className="w-3 h-3" />
                                </Button>
                            </div>
                        }
                    >
                        {/* Histogram */}
                        {!showBookmarks && timelineData && timelineData.data.length > 0 && (
                            <EventHistogram
                                data={timelineData.data}
                                onSelectWindow={(from, to) => {
                                    setDateFrom(from);
                                    setDateTo(to);
                                    setDateFilterActive(true);
                                    setPage(1);
                                }}
                            />
                        )}

                        {/* Bookmarks view */}
                        {showBookmarks && (
                            <div className="flex-1 overflow-auto min-h-[300px]">
                                <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                                    <button
                                        onClick={() => setShowBookmarks(false)}
                                        className="flex items-center gap-1.5 font-mono text-xs text-primary hover:underline"
                                    >
                                        <ChevronLeft className="w-3 h-3" />
                                        BACK TO TIMELINE
                                    </button>
                                    {bookmarks.length > 0 && (
                                        <button
                                            onClick={() => {
                                                if (!incidentId) return;
                                                setBookmarks([]);
                                                saveBookmarks(incidentId, []);
                                            }}
                                            className="flex items-center gap-1.5 font-mono text-[10px] text-destructive hover:underline"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            CLEAR ALL
                                        </button>
                                    )}
                                </div>
                                {bookmarks.length === 0 ? (
                                    <div className="flex items-center justify-center h-40 font-mono text-sm text-muted-foreground">
                                        NO BOOKMARKS
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border/20">
                                        {bookmarks.map((bm) => (
                                            <div key={bm.eventHash} className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/20 text-xs font-mono">
                                                <span className="tabular-nums text-muted-foreground whitespace-nowrap shrink-0">{bm.datetime.slice(0, 19)}</span>
                                                <span className={`px-1.5 py-0.5 rounded-sm border text-[10px] shrink-0 ${(() => { const c = getHostColor(bm.host, knownHosts); return `${c.bg} ${c.text} ${c.border}`; })()}`}>
                                                    {bm.host}
                                                </span>
                                                {bm.source_short && (
                                                    <span className={`px-1.5 py-0.5 rounded-sm border text-[10px] shrink-0 ${getSourceColor(bm.source_short)}`}>
                                                        {bm.source_short}
                                                    </span>
                                                )}
                                                <span className="flex-1 truncate text-foreground/70">{truncate(bm.message, 100)}</span>
                                                <button
                                                    onClick={() => {
                                                        if (!incidentId) return;
                                                        const next = bookmarks.filter((b) => b.eventHash !== bm.eventHash);
                                                        setBookmarks(next);
                                                        saveBookmarks(incidentId, next);
                                                    }}
                                                    className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors"
                                                    title="Remove bookmark"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Timeline table view */}
                        {!showBookmarks && (<>
                        <div className="flex-1 overflow-auto min-h-[300px]">
                            {tlError ? (
                                <div className="flex items-center justify-center h-40 font-mono text-sm text-destructive">
                                    <AlertTriangle className="w-4 h-4 mr-2" />
                                    ERROR: {(tlError as Error).message}
                                </div>
                            ) : tlLoading ? (
                                <div className="space-y-2 p-2">
                                    {Array.from({ length: 8 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="h-7 bg-secondary/40 rounded-sm animate-pulse"
                                            style={{ opacity: 1 - i * 0.1 }}
                                        />
                                    ))}
                                </div>
                            ) : !timelineData?.data.length ? (
                                <div className="flex flex-col items-center justify-center h-40 gap-3 font-mono text-sm text-muted-foreground">
                                    <Search className="w-6 h-6 opacity-30" />
                                    {activeFilterCount > 0
                                        ? "NO EVENTS MATCH THE ACTIVE FILTERS"
                                        : "NO TIMELINE EVENTS AVAILABLE"}
                                    {activeFilterCount > 0 && (
                                        <button
                                            onClick={() => {
                                                setDebouncedSearch(""); setSearchInput("");
                                                setAllHostsActive(true); setActiveHosts(new Set(knownHosts));
                                                setAllSourcesActive(true); setActiveSources(new Set(knownSources));
                                                clearDateFilter(); setActiveQuickFilter(null);
                                            }}
                                            className="text-xs text-primary hover:underline"
                                        >
                                            CLEAR FILTERS
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <table className="w-full text-sm font-mono border-collapse">
                                    <thead className="sticky top-0 bg-card border-b border-border z-10">
                                        <tr className="text-muted-foreground text-[10px] uppercase tracking-wider">
                                            <th className="px-2 py-2 text-right font-bold w-10 text-muted-foreground/60">#</th>
                                            <SortableHeader label="HOST"     col="host"     sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                                            <SortableHeader label="DATETIME (UTC)" col="datetime" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                                            <SortableHeader label="TYPE"     col="type"     sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                                            <SortableHeader label="SOURCE"   col="source"   sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                                            {visibleCols.has("event_id") && (
                                                <th className="px-3 py-2 text-left font-bold whitespace-nowrap">EVENT ID / RULE</th>
                                            )}
                                            {visibleCols.has("user") && (
                                                <th className="px-3 py-2 text-left font-bold whitespace-nowrap">USER</th>
                                            )}
                                            {visibleCols.has("display_name") && (
                                                <th className="px-3 py-2 text-left font-bold whitespace-nowrap">PATH / ARTIFACT</th>
                                            )}
                                            <SortableHeader label="MESSAGE"  col="message"  sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="w-full" />
                                            <th className="px-2 py-2 text-left font-bold whitespace-nowrap text-muted-foreground/50 w-8">TAG</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {timelineData.data.filter((row) => {
                                            if (!tagFilterActive) return true;
                                            const h = hashEvent(row);
                                            return eventTags[h] === tagFilterActive;
                                        }).map((row, i) => {
                                            const eventSeq   = row["event_seq"] != null ? Number(row["event_seq"]) + 1 : ((page - 1) * pageSize + i + 1);
                                            const host       = String(row["host"] ?? row["computer"] ?? "UNKNOWN");
                                            const color      = getHostColor(host, knownHosts);
                                            const srcShort   = String(row["source_short"] ?? "");
                                            const srcColor   = getSourceColor(srcShort);
                                            const datetime   = String(row["datetime"] ?? row["timestamp"] ?? "—");
                                            const tsDesc     = String(row["timestamp_desc"] ?? "—");
                                            const source     = String(row["source"] ?? "—");
                                            const message    = String(row["message"] ?? row["description"] ?? "—");
                                            const user       = row["user"] ? String(row["user"]) : null;
                                            // EVENT ID: Windows Event ID for EVTX/Sysmon, rule name for SIGMA
                                            const eventId     = row["event_id"] ? String(row["event_id"]) : null;
                                            const ruleName    = row["rule_name"] ? String(row["rule_name"]) : null;
                                            const eventLabel  = eventId ?? ruleName ?? null;
                                            const isEvtxLike  = eventId != null;
                                            const displayName = row["display_name"] ? String(row["display_name"]) : null;

                                            // Row styling
                                            const isSigma = srcShort === "SIGMA" || srcShort === "HAYABUSA";
                                            const isInLmWindow = lmData?.some((det) => {
                                                const dt = new Date(datetime).getTime();
                                                if (isNaN(dt)) return false;
                                                const first = det.first_seen ? new Date(det.first_seen).getTime() : -Infinity;
                                                const last  = det.last_seen  ? new Date(det.last_seen).getTime()  : Infinity;
                                                return dt >= first && dt <= last && (det.source_host === host || det.target_host === host);
                                            }) ?? false;

                                            const rowCls = isSigma
                                                ? "border-b border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
                                                : isInLmWindow
                                                    ? "border-b border-border/20 bg-orange-500/5 hover:bg-orange-500/10 border-l-2 border-l-orange-500/60"
                                                    : "border-b border-border/20 hover:bg-primary/5";

                                            const isSelected = selectedEvent === row;
                                            const isFocused = focusedRowIndex === i && !selectedEvent;
                                            return (
                                                <tr
                                                    key={i}
                                                    className={`transition-colors text-xs cursor-pointer ${rowCls} ${isSelected ? "ring-1 ring-inset ring-primary/60" : ""} ${isFocused ? "bg-secondary/60 ring-1 ring-inset ring-primary/30" : ""}`}
                                                    onClick={(e) => handleRowClick(e, row, i)}
                                                >
                                                    {/* # */}
                                                    <td className="px-2 py-1.5 text-right text-muted-foreground/50 text-[10px] select-none tabular-nums w-10">
                                                        {eventSeq.toLocaleString()}
                                                    </td>
                                                    {/* HOST */}
                                                    <td className="px-3 py-1.5 whitespace-nowrap">
                                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] font-mono ${color.bg} ${color.text} ${color.border}`}>
                                                            <Server className="w-2 h-2 shrink-0" />
                                                            {host}
                                                        </span>
                                                    </td>
                                                    {/* DATETIME */}
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground tabular-nums">
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-2.5 h-2.5 shrink-0 text-muted-foreground/50" />
                                                            {datetime}
                                                        </span>
                                                    </td>
                                                    {/* TYPE */}
                                                    <td className="px-3 py-1.5 whitespace-nowrap">
                                                        <span
                                                            className="px-1.5 py-0.5 rounded-sm border border-border/40 bg-secondary/30 text-[10px] truncate block max-w-[130px]"
                                                            title={tsDesc}
                                                        >
                                                            {truncate(tsDesc, 22)}
                                                        </span>
                                                    </td>
                                                    {/* SOURCE */}
                                                    <td className="px-3 py-1.5 whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5">
                                                            {srcShort && (
                                                                <span className={`px-1.5 py-0.5 rounded-sm border text-[10px] font-bold shrink-0 ${srcColor}`}>
                                                                    {srcShort}
                                                                </span>
                                                            )}
                                                            <span className="text-muted-foreground truncate block max-w-[90px] text-[10px]" title={source}>
                                                                {truncate(source, 22)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    {/* EVENT ID / RULE */}
                                                    {visibleCols.has("event_id") && (
                                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                                            {eventLabel ? (
                                                                <span
                                                                    className={`px-1.5 py-0.5 rounded-sm border text-[10px] truncate block max-w-[110px] ${
                                                                        isEvtxLike
                                                                            ? "border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold"
                                                                            : "border-orange-500/30 bg-orange-500/10 text-orange-400"
                                                                    }`}
                                                                    title={eventLabel}
                                                                >
                                                                    {isEvtxLike ? `EID:${eventLabel}` : truncate(eventLabel, 18)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground/30">—</span>
                                                            )}
                                                        </td>
                                                    )}
                                                    {/* USER */}
                                                    {visibleCols.has("user") && (
                                                        <td className="px-3 py-1.5 whitespace-nowrap">
                                                            {user ? (
                                                                <span className="flex items-center gap-1 text-[10px]">
                                                                    <User className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
                                                                    <button
                                                                        className="text-foreground/80 hover:text-primary transition-colors"
                                                                        title={`Filter by user: ${user}`}
                                                                        onClick={(e) => { e.stopPropagation(); handleSearchChange(user); setPage(1); }}
                                                                    >
                                                                        {truncate(user, 16)}
                                                                    </button>
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground/30">—</span>
                                                            )}
                                                        </td>
                                                    )}
                                                    {/* PATH / ARTIFACT */}
                                                    {visibleCols.has("display_name") && (
                                                        <td className="px-3 py-1.5 max-w-[160px]">
                                                            {displayName ? (
                                                                <span
                                                                    className="block truncate text-[10px] text-muted-foreground font-mono"
                                                                    title={displayName}
                                                                    style={{ direction: "rtl", textAlign: "left" }}
                                                                >
                                                                    {displayName}
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground/30">—</span>
                                                            )}
                                                        </td>
                                                    )}
                                                    {/* MESSAGE */}
                                                    <td className="px-3 py-1.5 max-w-[0] w-full">
                                                        <span className="truncate block" title={message}>
                                                            {highlightTerms(truncate(message, 140), debouncedSearch)}
                                                        </span>
                                                    </td>
                                                    {/* TAG */}
                                                    <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                        {(() => {
                                                            const evHash = hashEvent(row);
                                                            const tag = eventTags[evHash];
                                                            const meta = tag ? EVENT_TAG_META[tag] : null;
                                                            return (
                                                                <div className="relative group/tag">
                                                                    <button
                                                                        className={`px-1.5 py-0.5 rounded-sm border font-mono text-[10px] transition-all ${
                                                                            meta
                                                                                ? meta.color
                                                                                : "border-border/20 text-muted-foreground/30 hover:border-border/60 hover:text-muted-foreground"
                                                                        }`}
                                                                        title={meta ? `Tag: ${meta.label} (click to change)` : "Add tag"}
                                                                    >
                                                                        {meta ? meta.short : "+"}
                                                                    </button>
                                                                    <div className="absolute right-0 top-full mt-0.5 z-50 hidden group-hover/tag:flex flex-col bg-card border border-border shadow-lg rounded-sm overflow-hidden min-w-[110px]">
                                                                        {(Object.entries(EVENT_TAG_META) as [EventTagValue, typeof EVENT_TAG_META[EventTagValue]][]).map(([k, v]) => (
                                                                            <button
                                                                                key={k}
                                                                                onClick={() => setEventTag(evHash, k)}
                                                                                className={`px-2 py-1.5 text-left font-mono text-[10px] transition-colors hover:bg-secondary/50 flex items-center gap-2 ${tag === k ? v.color : "text-muted-foreground"}`}
                                                                            >
                                                                                <span className={`w-1.5 h-1.5 rounded-full ${tag === k ? "" : "bg-muted-foreground/30"}`}
                                                                                    style={tag === k ? { background: "currentColor" } : {}} />
                                                                                {v.label}
                                                                            </button>
                                                                        ))}
                                                                        {tag && (
                                                                            <button
                                                                                onClick={() => setEventTag(evHash, null)}
                                                                                className="px-2 py-1.5 text-left font-mono text-[10px] text-destructive/60 hover:bg-secondary/50 border-t border-border/40"
                                                                            >
                                                                                CLEAR
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Pagination footer */}
                        {!showBookmarks && timelineData && timelineData.total > 0 && (
                            <div className="flex items-center justify-between pt-3 border-t border-border mt-3 shrink-0 font-mono text-xs text-muted-foreground flex-wrap gap-2">
                                {/* Left: record range + filter indicator */}
                                <span>
                                    {((page - 1) * pageSize + 1).toLocaleString()}–
                                    {Math.min(page * pageSize, timelineData.total).toLocaleString()} OF{" "}
                                    <span className="text-foreground font-bold">{timelineData.total.toLocaleString()}</span> EVENTS
                                    {activeFilterCount > 0 && (
                                        <span className="ml-2 text-primary">(FILTERED)</span>
                                    )}
                                    {!selectedEvent && focusedRowIndex < 0 && (
                                        <span className="ml-3 text-muted-foreground/50">SHIFT+CLICK any row to compare</span>
                                    )}
                                    {focusedRowIndex >= 0 && !selectedEvent && (
                                        <span className="ml-3 text-primary/60">ROW {focusedRowIndex + 1} FOCUSED — ENTER to open · B to bookmark</span>
                                    )}
                                </span>

                                {/* Right: per-page selector + navigation */}
                                <div className="flex items-center gap-2">
                                    {/* Per-page selector */}
                                    <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">ROWS:</span>
                                        {PAGE_SIZE_OPTIONS.map((n) => (
                                            <button
                                                key={n}
                                                onClick={() => handlePageSizeChange(n)}
                                                className={`px-1.5 py-0.5 rounded-sm border text-xs transition-colors ${
                                                    pageSize === n
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-border/40 hover:border-border"
                                                }`}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="h-3 border-l border-border/40" />

                                    {/* Page jump */}
                                    <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground">PAGE:</span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={totalPages}
                                            value={pageJumpInput}
                                            onChange={(e) => setPageJumpInput(e.target.value)}
                                            onKeyDown={handlePageJump}
                                            placeholder={String(page)}
                                            className="w-12 h-6 px-1 bg-background border border-input rounded-sm text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                        <span className="text-muted-foreground">/ {totalPages}</span>
                                    </div>

                                    <div className="h-3 border-l border-border/40" />

                                    {/* Navigation buttons */}
                                    <Button
                                        variant="outline" size="sm" className="h-6 w-6 p-0"
                                        disabled={page <= 1 || tlLoading}
                                        onClick={() => setPage(1)}
                                        title="First page"
                                    >
                                        <ChevronsLeft className="w-3 h-3" />
                                    </Button>
                                    <Button
                                        variant="outline" size="sm" className="h-6 text-xs px-2"
                                        disabled={page <= 1 || tlLoading}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    >
                                        <ChevronLeft className="w-3 h-3 mr-0.5" />PREV
                                    </Button>
                                    <Button
                                        variant="outline" size="sm" className="h-6 text-xs px-2"
                                        disabled={page >= totalPages || tlLoading}
                                        onClick={() => setPage((p) => p + 1)}
                                    >
                                        NEXT<ChevronRight className="w-3 h-3 ml-0.5" />
                                    </Button>
                                    <Button
                                        variant="outline" size="sm" className="h-6 w-6 p-0"
                                        disabled={page >= totalPages || tlLoading}
                                        onClick={() => setPage(totalPages)}
                                        title="Last page"
                                    >
                                        <ChevronsRight className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        )}
                        {/* End !showBookmarks timeline table */}
                        </>)}
                    </TacticalPanel>
                )}

                {/* ── Lateral Movement Panel ──────────────────────────────── */}
                {isDone && lmData && lmData.length > 0 && (
                    <TacticalPanel
                        title={`LATERAL MOVEMENT DETECTIONS (${lmData.length})`}
                        status="offline"
                        headerActions={
                            <button
                                onClick={() => setLmExpanded((v) => !v)}
                                className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
                            >
                                {lmExpanded ? "COLLAPSE ▲" : "EXPAND ▼"}
                            </button>
                        }
                    >
                        {lmExpanded && (
                            <div className="space-y-3">
                                {lmData.map((det) => (
                                    <div
                                        key={det.id}
                                        className="border border-border/60 bg-secondary/20 p-4 rounded-sm space-y-3"
                                    >
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-sm border text-xs font-mono font-bold uppercase ${DETECTION_TYPE_COLORS[det.detection_type]}`}>
                                                {det.detection_type.replace(/_/g, " ")}
                                            </span>
                                            <div className="flex items-center gap-2 font-mono text-sm">
                                                <span className={`px-2 py-0.5 rounded-sm border text-xs ${(() => { const c = getHostColor(det.source_host, knownHosts); return `${c.bg} ${c.text} ${c.border}`; })()}`}>
                                                    {det.source_host}
                                                </span>
                                                <Network className="w-3.5 h-3.5 text-muted-foreground" />
                                                <span className={`px-2 py-0.5 rounded-sm border text-xs ${(() => { const c = getHostColor(det.target_host, knownHosts); return `${c.bg} ${c.text} ${c.border}`; })()}`}>
                                                    {det.target_host}
                                                </span>
                                            </div>
                                            {det.actor && (
                                                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                                    <Shield className="w-3 h-3" />
                                                    {det.actor}
                                                </span>
                                            )}
                                            {/* Quick pivot — filter timeline by this actor */}
                                            {det.actor && (
                                                <button
                                                    onClick={() => {
                                                        handleSearchChange(det.actor!);
                                                        setActiveQuickFilter(null);
                                                        setAllSourcesActive(true);
                                                        setActiveSources(new Set(knownSources));
                                                        setPage(1);
                                                        window.scrollTo({ top: 0, behavior: "smooth" });
                                                    }}
                                                    className="ml-auto font-mono text-[10px] text-primary hover:underline"
                                                >
                                                    PIVOT → TIMELINE
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs">
                                            <div><span className="text-muted-foreground">FIRST SEEN: </span>{formatTs(det.first_seen)}</div>
                                            <div><span className="text-muted-foreground">LAST SEEN: </span>{formatTs(det.last_seen)}</div>
                                            <div><span className="text-muted-foreground">EVENT COUNT: </span>{det.event_count.toLocaleString()}</div>
                                            <div><span className="text-muted-foreground">DETECTED: </span>{formatTs(det.detected_at)}</div>
                                        </div>
                                        <div>
                                            <div className="font-mono text-xs text-muted-foreground mb-1">CONFIDENCE</div>
                                            <ConfidenceBar value={det.confidence} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TacticalPanel>
                )}

                {/* ── LM loading placeholder ───────────────────────────────── */}
                {isDone && lmLoading && !lmData && (
                    <TacticalPanel title="LATERAL MOVEMENT DETECTIONS" status="active">
                        <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            ANALYZING LATERAL MOVEMENT...
                        </div>
                    </TacticalPanel>
                )}

            </div>

            {/* ── Event Detail Panel ───────────────────────────────────── */}
            {selectedEvent && (
                <EventDetailPanel
                    event={selectedEvent}
                    knownHosts={knownHosts}
                    onClose={() => setSelectedEvent(null)}
                    onFilterSearch={(q) => { handleSearchChange(q); setPage(1); }}
                    incidentId={incidentId ?? ""}
                    isBookmarked={isEventBookmarked(selectedEvent)}
                    onBookmarkToggle={toggleBookmark}
                    onNavigateIOC={(_value, _type) => {
                        navigate(`/incidents/${incidentId}/ioc-matches`);
                    }}
                />
            )}

            {/* ── Compare Panel ────────────────────────────────────────── */}
            {compareEvents && (
                <ComparePanel
                    events={compareEvents}
                    knownHosts={knownHosts}
                    onClose={() => setCompareEvents(null)}
                    onFilterSearch={(q) => { handleSearchChange(q); setPage(1); }}
                />
            )}
        </AppLayout>
    );
}
