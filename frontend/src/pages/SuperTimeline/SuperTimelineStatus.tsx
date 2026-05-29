import React from "react";
import { 
    Search, X, HelpCircle, CalendarRange, Zap, Users, Tag, Loader2, Database, Clock, Server, AlertTriangle, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TacticalPanel } from "@/components/TacticalPanel";
import {
    QuickFilter, QUICK_FILTERS, SuperTimelineStatusData
} from "./SuperTimelineTypes";
import { formatTs } from "./SuperTimelineUtils";

// ─── Status Component ─────────────────────────────────────────────────────────

interface SuperTimelineStatusProps {
    stStatus: SuperTimelineStatusData | null;
    statusLoading: boolean;
    statusError: string | null;
    isBuilding: boolean;
    isFailed: boolean;
    isDone: boolean;
    buildError: string | null;
    triggerBuild: () => void;
    lmCount: number;
}

export function SuperTimelineStatus({
    stStatus, statusLoading, statusError, isBuilding, isFailed, isDone, buildError, triggerBuild, lmCount
}: SuperTimelineStatusProps) {
    if (statusLoading) {
        return (
            <TacticalPanel title="SUPER TIMELINE STATUS" status="active">
                <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    CHECKING STATUS...
                </div>
            </TacticalPanel>
        );
    }

    if (statusError) {
        return (
            <TacticalPanel title="STATUS ERROR" status="offline">
                <div className="font-mono text-sm text-destructive py-4">
                    ERROR: {statusError}
                </div>
            </TacticalPanel>
        );
    }

    if (!isDone && stStatus) {
        return (
            <TacticalPanel
                title="BUILD SUPER TIMELINE"
                status={isBuilding ? "active" : isFailed ? "offline" : "warning"}
            >
                <div className="space-y-5">
                    <p className="font-mono text-sm text-muted-foreground leading-relaxed">
                        Merge timelines from all processed hosts into a unified
                        cross-host timeline with lateral movement detection.
                    </p>
                    {isFailed && stStatus.error_message && (
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
                                    {stStatus.status === "PENDING"
                                        ? "QUEUED — WAITING FOR WORKER..."
                                        : "BUILDING SUPER TIMELINE..."}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 animate-pulse">
                                    AUTO-REFRESH ACTIVE (5s)
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
        );
    }

    if (isDone && stStatus) {
        return (
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
                        {lmCount > 0 && (
                            <div className="flex items-center gap-2 px-3 py-2 border border-red-500/40 bg-red-500/10 rounded-sm font-mono text-xs text-red-400">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>{lmCount} LATERAL MOVEMENT DETECTIONS</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
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
        );
    }

    return null;
}
