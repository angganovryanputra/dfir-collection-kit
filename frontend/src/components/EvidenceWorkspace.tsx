import React, { useState, useRef, useEffect, useCallback } from "react";
import { useEvidence } from "@/context/EvidenceContext";
import { 
    ChevronRight, Trash2, Pin, Layers, Search, Bug, X, Clock, ExternalLink, GripVertical 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EvidenceWorkspace() {
    const { pinnedItems, unpinItem, clearWorkspace } = useEvidence();
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Dragging State
    const [position, setPosition] = useState({ x: 0, y: 120 }); // initial Y: 120px from top
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const iconMap = {
        event: <Layers className="w-3 h-3" />,
        hit: <Search className="w-3 h-3" />,
        match: <Bug className="w-3 h-3" />,
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Only allow dragging via the toggle button or specifically designated handle
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;

        let newX = e.clientX - dragOffset.current.x;
        let newY = e.clientY - dragOffset.current.y;

        // Bounds checking (keep within viewport)
        const margin = 10;
        const panelWidth = isExpanded ? 320 : 40;
        
        newX = Math.max(-panelWidth + 40, Math.min(newX, window.innerWidth - 40));
        newY = Math.max(margin, Math.min(newY, window.innerHeight - 60));

        setPosition({ x: newX, y: newY });
    }, [isDragging, isExpanded]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
        } else {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        }
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    return (
        <div 
            ref={containerRef}
            className={cn(
                "fixed z-50 flex shadow-2xl",
                !isDragging && "transition-all duration-300"
            )}
            style={{ 
                top: `${position.y}px`, 
                right: `${-position.x}px`,
                height: isExpanded ? "500px" : "auto",
                maxHeight: "80vh"
            }}
        >
            {/* Toggle & Drag Handle */}
            <div className="flex flex-col items-center shrink-0">
                <button
                    onMouseDown={handleMouseDown}
                    className={cn(
                        "w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center rounded-l-sm shadow-xl transition-transform relative cursor-grab active:cursor-grabbing group",
                        isDragging ? "scale-110" : "hover:scale-105"
                    )}
                    onClick={(e) => {
                        // Prevent click if we were just dragging
                        if (dragOffset.current.x !== 0) {
                           // setIsExpanded(!isExpanded);
                        }
                    }}
                >
                    <div 
                        className="absolute -left-2 top-0 bottom-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Drag to reposition"
                    >
                        <GripVertical className="w-4 h-4 text-primary bg-background rounded-full border border-primary/20" />
                    </div>
                    
                    <div onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="w-full h-full flex items-center justify-center">
                        {isExpanded ? <ChevronRight className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
                        {pinnedItems.length > 0 && !isExpanded && (
                            <span className="absolute -top-1 -left-1 w-4 h-4 bg-destructive text-[8px] flex items-center justify-center rounded-full animate-pulse border border-background">
                                {pinnedItems.length}
                            </span>
                        )}
                    </div>
                </button>
            </div>

            {/* Sidebar Content */}
            <div className={cn(
                "w-80 glass-panel border border-primary/20 flex flex-col overflow-hidden bg-card/95 backdrop-blur-md",
                !isExpanded && "hidden"
            )}>
                <div className="p-3 border-b border-primary/20 flex items-center justify-between bg-primary/10">
                    <div className="flex items-center gap-2">
                        <Pin className="w-3.5 h-3.5 text-primary" />
                        <span className="font-mono text-[10px] font-bold tracking-widest uppercase">EVIDENCE_WORKSPACE</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={clearWorkspace} 
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                            title="Purge Workspace"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-3 space-y-3 custom-scrollbar">
                    {pinnedItems.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 text-center opacity-40">
                            <Pin className="w-10 h-10 text-muted-foreground" />
                            <p className="font-mono text-[9px] text-muted-foreground uppercase leading-relaxed max-w-[160px]">
                                PIN CRITICAL ARTIFACTS TO BUILD YOUR MISSION NARRATIVE
                            </p>
                        </div>
                    ) : (
                        pinnedItems.map((item) => (
                            <div 
                                key={item.id} 
                                className="group relative bg-secondary/20 border border-border/40 p-3 rounded-sm space-y-2 hover:border-primary/40 transition-colors"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 font-mono text-[9px] text-primary font-bold">
                                        {iconMap[item.type]}
                                        <span className="uppercase tracking-widest">{item.type}</span>
                                    </div>
                                    <button 
                                        onClick={() => unpinItem(item.id)}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-opacity"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="text-[11px] font-bold leading-tight line-clamp-2">
                                    {item.title}
                                </div>
                                <div className="text-[10px] text-muted-foreground line-clamp-3 leading-relaxed font-medium">
                                    {item.content}
                                </div>
                                <div className="flex items-center justify-between font-mono text-[8px] text-muted-foreground pt-1 border-t border-border/10">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-2.5 h-2.5" />
                                        {new Date(item.timestamp).toLocaleTimeString()}
                                    </span>
                                    <span className="flex items-center gap-1 uppercase truncate max-w-[120px]">
                                        <ExternalLink className="w-2.5 h-2.5" />
                                        {item.metadata.host || "UNKNOWN"}
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
                        className="w-full text-[9px] h-8 font-bold tracking-widest"
                        disabled={pinnedItems.length === 0}
                    >
                        GENERATE MISSION DEBRIEF
                    </Button>
                </div>
            </div>
        </div>
    );
}
