import React, { useState, useEffect } from "react";
import { 
    X, Server, Clock, User, Shield, ExternalLink, Bookmark as BookmarkIcon, Check, Copy, Tag, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
    getHostColor, detectIOCs, truncate 
} from "./SuperTimelineUtils";
import { EVENT_TAG_META, IOC_COLORS } from "./SuperTimelineTypes";

// ─── Event Detail Panel ──────────────────────────────────────────────────────

interface EventDetailPanelProps {
    event: Record<string, unknown>;
    knownHosts: string[];
    onClose: () => void;
    onFilterSearch: (q: string) => void;
    incidentId: string;
    isBookmarked: boolean;
    onBookmarkToggle: (event: Record<string, unknown>, note: string) => void;
    onNavigateIOC: (value: string, type: string) => void;
}

export function EventDetailPanel({
    event, knownHosts, onClose, onFilterSearch, incidentId,
    isBookmarked, onBookmarkToggle, onNavigateIOC
}: EventDetailPanelProps) {
    const [noteInput, setNoteInput] = useState("");
    const [copied, setCopied] = useState<string | null>(null);

    const host = String(event["host"] ?? event["computer"] ?? "UNKNOWN");
    const hColor = getHostColor(host, knownHosts);
    const message = String(event["message"] ?? event["description"] ?? "");
    const iocs = detectIOCs(message + " " + JSON.stringify(event));

    const handleCopy = (val: string, label: string) => {
        navigator.clipboard.writeText(val);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="fixed inset-y-0 right-0 w-[500px] bg-card border-l border-border shadow-2xl z-50 flex flex-col font-mono animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/20">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold tracking-tight">EVENT INSPECTOR</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-secondary rounded-sm transition-colors text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-6">
                {/* Core Context */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className={`px-2 py-1 border rounded-sm text-[10px] font-bold ${hColor.bg} ${hColor.text} ${hColor.border}`}>
                            {host}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{String(event["datetime"])}</span>
                    </div>
                    <div className="text-sm font-bold text-foreground leading-relaxed">
                        {message}
                    </div>
                </div>

                {/* Artifact Metadata */}
                <div className="space-y-2">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest border-b border-border/40 pb-1 flex items-center gap-2">
                        <Server className="w-3 h-3" /> Artifact Data
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[10px]">
                        <div>
                            <div className="text-muted-foreground mb-0.5">SOURCE</div>
                            <div className="text-foreground truncate">{String(event["source"])}</div>
                        </div>
                        <div>
                            <div className="text-muted-foreground mb-0.5">TYPE</div>
                            <div className="text-foreground truncate">{String(event["timestamp_desc"])}</div>
                        </div>
                    </div>
                </div>

                {/* IOC Detection */}
                {iocs.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest border-b border-border/40 pb-1 flex items-center gap-2">
                            <ExternalLink className="w-3 h-3" /> Detected Indicators
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {iocs.map((ioc, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => onNavigateIOC(ioc.value, ioc.type)}
                                    className={`px-2 py-1 border rounded-sm flex items-center gap-1.5 transition-all hover:scale-105 ${IOC_COLORS[ioc.type] ?? "border-border bg-secondary/30"}`}
                                >
                                    <span className="text-[8px] opacity-60 font-bold">{ioc.type}</span>
                                    <span className="text-[10px]">{truncate(ioc.value, 30)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Raw Attributes */}
                <div className="space-y-2">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest border-b border-border/40 pb-1 flex items-center gap-2">
                        <LayoutGrid className="w-3 h-3" /> Full Attribute Map
                    </div>
                    <div className="bg-secondary/10 border border-border/40 rounded-sm p-3 space-y-1.5 overflow-hidden">
                        {Object.entries(event).map(([key, val]) => {
                            if (["message", "description", "datetime", "timestamp"].includes(key)) return null;
                            if (val === null || val === undefined || val === "") return null;
                            return (
                                <div key={key} className="flex gap-3 text-[10px] group/row">
                                    <span className="text-muted-foreground shrink-0 w-24 truncate" title={key}>{key}:</span>
                                    <span className="text-foreground/90 break-all flex-1">{String(val)}</span>
                                    <button 
                                        onClick={() => handleCopy(String(val), key)}
                                        className="opacity-0 group-hover/row:opacity-100 p-0.5 hover:text-primary transition-opacity"
                                    >
                                        {copied === key ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Bookmarking & Notes */}
                <div className="space-y-3 pt-4 border-t border-border/40">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                        <BookmarkIcon className="w-3 h-3" /> Analysis Notes
                    </div>
                    <textarea
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Add investigative context or hypothesis..."
                        className="w-full min-h-[80px] bg-background border border-border p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary rounded-sm placeholder:text-muted-foreground/40"
                    />
                    <Button 
                        variant={isBookmarked ? "outline" : "tactical"} 
                        className="w-full h-9 font-bold text-xs"
                        onClick={() => {
                            onBookmarkToggle(event, noteInput);
                            if (!isBookmarked) setNoteInput("");
                        }}
                    >
                        {isBookmarked ? "REMOVE FROM BOOKMARKS" : "ADD TO INVESTIGATION"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Compare Panel ───────────────────────────────────────────────────────────

interface ComparePanelProps {
    events: Record<string, unknown>[];
    knownHosts: string[];
    onClose: () => void;
    onFilterSearch: (q: string) => void;
}

export function ComparePanel({
    events, knownHosts, onClose, onFilterSearch
}: ComparePanelProps) {
    const allKeys = Array.from(new Set(events.flatMap(e => Object.keys(e)))).sort();

    return (
        <div className="fixed inset-x-10 bottom-0 top-20 bg-card border border-border shadow-2xl z-50 flex flex-col font-mono animate-in slide-in-from-bottom duration-300 rounded-t-lg">
            <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/40 rounded-t-lg">
                <div className="flex items-center gap-3">
                    <LayoutGrid className="w-5 h-5 text-primary" />
                    <span className="text-sm font-bold tracking-tight">DIFFERENTIAL ANALYSIS — {events.length} EVENTS</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-secondary rounded-sm transition-colors">
                    <X className="w-6 h-6 text-muted-foreground hover:text-foreground" />
                </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
                <div className="inline-block min-w-full">
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="bg-secondary/20">
                                <th className="px-4 py-2 text-left text-muted-foreground w-40 border-b border-border/40">ATTRIBUTE</th>
                                {events.map((_, i) => (
                                    <th key={i} className="px-4 py-2 text-left text-primary border-b border-border/40">EVENT #{i + 1}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {allKeys.map(key => {
                                const vals = events.map(e => String(e[key] ?? "—"));
                                const allSame = vals.every(v => v === vals[0]);
                                if (allSame && !["host", "datetime", "message"].includes(key)) return null;

                                return (
                                    <tr key={key} className={cn("hover:bg-secondary/10", !allSame && "bg-primary/5")}>
                                        <td className="px-4 py-2 font-bold text-muted-foreground border-b border-border/20 uppercase text-[9px]">{key}</td>
                                        {vals.map((v, i) => (
                                            <td key={i} className={cn("px-4 py-2 border-b border-border/20 whitespace-pre-wrap max-w-md break-all", !allSame && "text-primary/90 font-bold")}>
                                                {v}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
