import React, { useState } from "react";
import { useEvidence, EvidenceItem } from "@/context/EvidenceContext";
import { 
    ChevronRight, ChevronLeft, Trash2, Pin, Layers, Search, Bug, X, Clock, ExternalLink 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EvidenceWorkspace() {
    const { pinnedItems, unpinItem, clearWorkspace } = useEvidence();
    const [isExpanded, setIsExpanded] = useState(false);

    const iconMap = {
        event: <Layers className="w-3 h-3" />,
        hit: <Search className="w-3 h-3" />,
        match: <Bug className="w-3 h-3" />,
    };

    return (
        <div 
            className={cn(
                "fixed top-20 bottom-10 right-0 z-40 transition-all duration-300 flex",
                isExpanded ? "w-80" : "w-10"
            )}
        >
            {/* Toggle Button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center rounded-l-sm mt-4 shadow-xl hover:scale-105 transition-transform"
                title={isExpanded ? "Collapse Workspace" : "Open Evidence Workspace"}
            >
                {isExpanded ? <ChevronRight className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
                {pinnedItems.length > 0 && !isExpanded && (
                    <span className="absolute -top-1 -left-1 w-4 h-4 bg-destructive text-[8px] flex items-center justify-center rounded-full animate-pulse border border-background">
                        {pinnedItems.length}
                    </span>
                )}
            </button>

            {/* Sidebar Content */}
            <div className={cn(
                "flex-1 glass-panel border-l border-primary/20 flex flex-col overflow-hidden",
                !isExpanded && "hidden"
            )}>
                <div className="p-4 border-b border-primary/20 flex items-center justify-between bg-primary/5">
                    <div className="flex items-center gap-2">
                        <Pin className="w-4 h-4 text-primary" />
                        <span className="font-mono text-sm font-bold tracking-tight">EVIDENCE WORKSPACE</span>
                    </div>
                    <button 
                        onClick={clearWorkspace} 
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Clear all"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-3 space-y-3">
                    {pinnedItems.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-6">
                            <Pin className="w-8 h-8 text-muted-foreground opacity-20" />
                            <p className="font-mono text-[10px] text-muted-foreground uppercase leading-relaxed">
                                Pin events and detections here to build your investigation narrative
                            </p>
                        </div>
                    ) : (
                        pinnedItems.map((item) => (
                            <div 
                                key={item.id} 
                                className="group relative bg-card/40 border border-border/40 p-3 rounded-sm space-y-2 hover:border-primary/40 transition-colors"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 font-mono text-[9px] text-primary">
                                        {iconMap[item.type]}
                                        <span className="uppercase tracking-widest">{item.type}</span>
                                    </div>
                                    <button 
                                        onClick={() => unpinItem(item.id)}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="font-mono text-[11px] font-bold leading-tight line-clamp-2">
                                    {item.title}
                                </div>
                                <div className="font-mono text-[9px] text-muted-foreground line-clamp-3 leading-relaxed opacity-70">
                                    {item.content}
                                </div>
                                <div className="flex items-center justify-between font-mono text-[8px] text-muted-foreground pt-1 border-t border-border/20">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-2.5 h-2.5" />
                                        {new Date(item.timestamp).toLocaleTimeString()}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <ExternalLink className="w-2.5 h-2.5" />
                                        REF: {item.metadata.host || "N/A"}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-3 border-t border-primary/20 bg-primary/5">
                    <Button 
                        variant="tactical" 
                        size="sm" 
                        className="w-full text-[10px] h-8"
                        disabled={pinnedItems.length === 0}
                    >
                        EXPORT MISSION DEBRIEF
                    </Button>
                </div>
            </div>
        </div>
    );
}
