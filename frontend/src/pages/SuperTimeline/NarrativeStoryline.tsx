import React from "react";
import { Bookmark, getSourceColor, getHostColor } from "./SuperTimeline/SuperTimelineTypes";
import { 
    Clock, Server, Shield, Activity, GitBranch, Target, AlertTriangle, ChevronRight, MessageSquare 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NarrativeStorylineProps {
    bookmarks: Bookmark[];
    knownHosts: string[];
}

export function NarrativeStoryline({ bookmarks, knownHosts }: NarrativeStorylineProps) {
    if (bookmarks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground animate-in fade-in duration-700">
                <GitBranch className="w-12 h-12 opacity-10" />
                <p className="font-mono text-sm uppercase tracking-widest">No bookmarked events to build narrative</p>
                <p className="text-xs opacity-60">Bookmark critical events in the timeline to generate a storyline</p>
            </div>
        );
    }

    // Sort bookmarks by datetime for the storyline
    const sortedBookmarks = [...bookmarks].sort((a, b) => a.datetime.localeCompare(b.datetime));

    return (
        <div className="p-8 max-w-3xl mx-auto space-y-0 relative">
            {/* Central Line */}
            <div className="absolute left-[47px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-primary/5 via-primary/20 to-primary/5 hidden md:block" />

            {sortedBookmarks.map((bm, i) => {
                const hColor = getHostColor(bm.host, knownHosts);
                const isSigma = bm.source_short === "SIGMA" || bm.source_short === "HAYABUSA";

                return (
                    <div 
                        key={bm.eventHash} 
                        className="relative flex gap-8 pb-12 animate-in slide-in-from-bottom-4 duration-500"
                        style={{ animationDelay: `${i * 100}ms` }}
                    >
                        {/* Milestone Indicator */}
                        <div className="relative z-10 flex-shrink-0">
                            <div className={cn(
                                "w-12 h-12 rounded-full border-2 flex items-center justify-center bg-background shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all group-hover:scale-110",
                                isSigma ? "border-destructive text-destructive shadow-[0_0_10px_hsl(var(--destructive)/0.3)]" : "border-primary text-primary shadow-[0_0_10px_hsl(var(--primary)/0.3)]"
                            )}>
                                {isSigma ? <AlertTriangle className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                            </div>
                        </div>

                        {/* Content Card */}
                        <div className="flex-1 space-y-3 pt-1">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 font-mono text-[10px] tracking-tighter uppercase text-muted-foreground">
                                    <span className="flex items-center gap-1 bg-secondary/50 px-2 py-0.5 rounded-sm border border-border/40">
                                        <Clock className="w-3 h-3" />
                                        {bm.datetime}
                                    </span>
                                    <span className={cn(
                                        "flex items-center gap-1 px-2 py-0.5 rounded-sm border",
                                        hColor.bg, hColor.text, hColor.border
                                    )}>
                                        <Server className="w-3 h-3" />
                                        {bm.host}
                                    </span>
                                </div>
                                <div className="text-[10px] font-bold text-primary opacity-40 font-mono italic">
                                    STEP #{String(i + 1).padStart(2, '0')}
                                </div>
                            </div>

                            <div className="glass-panel p-5 rounded-sm border border-primary/10 relative overflow-hidden group hover:border-primary/30 transition-colors">
                                {/* Subtle scanline effect for the card */}
                                <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
                                
                                <div className="font-mono text-sm font-bold text-foreground mb-2 leading-snug">
                                    {bm.message}
                                </div>

                                {bm.note && (
                                    <div className="mt-4 p-3 bg-primary/5 border-l-2 border-primary rounded-r-sm space-y-1">
                                        <div className="flex items-center gap-1.5 font-mono text-[9px] text-primary font-bold uppercase tracking-widest">
                                            <MessageSquare className="w-3 h-3" />
                                            Analyst Note
                                        </div>
                                        <p className="font-mono text-xs text-foreground/90 italic leading-relaxed">
                                            "{bm.note}"
                                        </p>
                                    </div>
                                )}
                                
                                <div className="mt-4 flex items-center gap-3 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <span className="font-mono text-[9px] text-muted-foreground uppercase border-r border-border/40 pr-3">
                                        SOURCE: <span className="text-foreground">{bm.source_short}</span>
                                    </span>
                                    <button className="flex items-center gap-1 font-mono text-[9px] text-primary hover:underline">
                                        VIEW ARTIFACT <ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* End Milestone */}
            <div className="flex justify-center pt-8">
                <div className="px-6 py-2 border border-primary/20 bg-primary/5 rounded-full font-mono text-[10px] text-primary uppercase tracking-[0.2em] animate-pulse">
                    End of Mission Log
                </div>
            </div>
        </div>
    );
}
