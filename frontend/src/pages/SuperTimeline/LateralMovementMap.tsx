import { useState, useMemo } from "react";
import {
    AlertTriangle, Activity, Shield, User, ChevronRight, Zap, Network,
    Clock, TrendingUp, RefreshCw, Eye
} from "lucide-react";
import { LateralMovementDetection } from "./SuperTimelineTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CFG = {
    account_pivot: {
        label: "Account Pivot",
        short: "ACCT",
        color: "#ef4444",
        bg: "bg-red-500/10 border-red-500/30 text-red-400",
        bar: "bg-red-500",
        icon: User,
    },
    process_spread: {
        label: "Process Spread",
        short: "PROC",
        color: "#f97316",
        bg: "bg-orange-500/10 border-orange-500/30 text-orange-400",
        bar: "bg-orange-500",
        icon: Activity,
    },
    credential_reuse: {
        label: "Credential Reuse",
        short: "CRED",
        color: "#eab308",
        bg: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
        bar: "bg-yellow-500",
        icon: Shield,
    },
} as const;

type DetectionType = keyof typeof TYPE_CFG;

// ─── SVG Graph Helpers ─────────────────────────────────────────────────────────

const SVG_W = 520;
const SVG_H = 340;
const NODE_R = 32;

function computeLayout(hosts: string[]): Record<string, { x: number; y: number }> {
    const cx = SVG_W / 2;
    const cy = SVG_H / 2;
    const n = hosts.length;
    const positions: Record<string, { x: number; y: number }> = {};

    if (n === 1) {
        positions[hosts[0]] = { x: cx, y: cy };
    } else if (n === 2) {
        positions[hosts[0]] = { x: SVG_W * 0.3, y: cy };
        positions[hosts[1]] = { x: SVG_W * 0.7, y: cy };
    } else {
        const rx = SVG_W * 0.36;
        const ry = SVG_H * 0.36;
        hosts.forEach((h, i) => {
            const angle = (2 * Math.PI * i / n) - Math.PI / 2;
            positions[h] = {
                x: cx + rx * Math.cos(angle),
                y: cy + ry * Math.sin(angle),
            };
        });
    }
    return positions;
}

function buildArrowPath(
    positions: Record<string, { x: number; y: number }>,
    src: string, tgt: string,
    edgeIndex: number, totalEdges: number
): string {
    if (!positions[src] || !positions[tgt]) return "";
    const p1 = positions[src];
    const p2 = positions[tgt];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;

    const sx = p1.x + ux * (NODE_R + 4);
    const sy = p1.y + uy * (NODE_R + 4);
    const ex = p2.x - ux * (NODE_R + 14);
    const ey = p2.y - uy * (NODE_R + 14);

    // Vary curvature to separate parallel edges
    const curvature = 0.2 + (edgeIndex / Math.max(totalEdges, 1)) * 0.4;
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const nx = -dy / dist;
    const ny = dx / dist;
    const offset = dist * curvature;
    const cx1 = mx + nx * offset;
    const cy1 = my + ny * offset;

    return `M ${sx} ${sy} Q ${cx1} ${cy1} ${ex} ${ey}`;
}

// ─── Host Node ─────────────────────────────────────────────────────────────────

interface HostNodeProps {
    host: string;
    x: number;
    y: number;
    role: "source" | "target" | "both" | "none";
    isHighlighted: boolean;
    onClick: () => void;
}

function HostNode({ host, x, y, role, isHighlighted, onClick }: HostNodeProps) {
    const label = host.length > 11 ? host.slice(0, 10) + "…" : host;
    const strokeColor =
        role === "source" ? "#ef4444" :
        role === "target" ? "#f97316" :
        role === "both" ? "#a855f7" :
        "#6366f1";
    const roleLabel =
        role === "source" ? "SOURCE" :
        role === "target" ? "TARGET" :
        role === "both" ? "PIVOT" :
        "HOST";

    return (
        <g className="cursor-pointer" onClick={onClick}>
            {/* Pulse ring */}
            {role !== "none" && (
                <circle cx={x} cy={y} r={NODE_R + 12} fill="none" stroke={strokeColor} strokeWidth={1} strokeOpacity={0.15}>
                    <animate attributeName="r" values={`${NODE_R + 8};${NODE_R + 20};${NODE_R + 8}`} dur="2.8s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.25;0;0.25" dur="2.8s" repeatCount="indefinite" />
                </circle>
            )}
            {/* Dashed outer ring */}
            <circle
                cx={x} cy={y} r={NODE_R + 8}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isHighlighted ? 2 : 0.8}
                strokeOpacity={isHighlighted ? 0.6 : 0.2}
                strokeDasharray={isHighlighted ? "0" : "3 4"}
            />
            {/* Main node */}
            <circle
                cx={x} cy={y} r={NODE_R}
                fill={`rgba(${role === "source" ? "239,68,68" : role === "target" ? "249,115,22" : role === "both" ? "168,85,247" : "99,102,241"},0.10)`}
                stroke={strokeColor}
                strokeWidth={isHighlighted ? 2.5 : 1.5}
            />
            {/* Server icon */}
            <text x={x} y={y - 7} textAnchor="middle" fill={strokeColor} fontSize="15" opacity="0.9">⬡</text>
            {/* Hostname */}
            <text
                x={x} y={y + 9}
                textAnchor="middle"
                fill={isHighlighted ? strokeColor : "rgba(255,255,255,0.82)"}
                fontSize="9"
                fontWeight="bold"
                fontFamily="monospace"
                letterSpacing="0.3"
            >
                {label}
            </text>
            {/* Role badge */}
            <text
                x={x} y={y + 20}
                textAnchor="middle"
                fill="rgba(255,255,255,0.38)"
                fontSize="7"
                fontFamily="monospace"
                letterSpacing="0.5"
            >
                {roleLabel}
            </text>
        </g>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface LateralMovementMapProps {
    detections: LateralMovementDetection[];
    onFilterHost?: (host: string) => void;
    onTriggerRebuild?: () => void;
    isBuilding?: boolean;
}

export function LateralMovementMap({
    detections, onFilterHost, onTriggerRebuild, isBuilding
}: LateralMovementMapProps) {
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [activeType, setActiveType] = useState<DetectionType | null>(null);
    const [highlightedHost, setHighlightedHost] = useState<string | null>(null);

    const filtered = useMemo(() =>
        activeType ? detections.filter(d => d.detection_type === activeType) : detections,
        [detections, activeType]
    );

    const allHosts = useMemo(() => {
        const s = new Set<string>();
        detections.forEach(d => { s.add(d.source_host); s.add(d.target_host); });
        return Array.from(s).sort();
    }, [detections]);

    const positions = useMemo(() => computeLayout(allHosts), [allHosts]);

    const hostRoles = useMemo(() => {
        const sources = new Set(detections.map(d => d.source_host));
        const targets = new Set(detections.map(d => d.target_host));
        const roles: Record<string, "source" | "target" | "both" | "none"> = {};
        allHosts.forEach(h => {
            const isSrc = sources.has(h);
            const isTgt = targets.has(h);
            roles[h] = isSrc && isTgt ? "both" : isSrc ? "source" : isTgt ? "target" : "none";
        });
        return roles;
    }, [allHosts, detections]);

    const typeCounts = useMemo(() => {
        const c: Partial<Record<DetectionType, number>> = {};
        detections.forEach(d => { c[d.detection_type] = (c[d.detection_type] ?? 0) + 1; });
        return c;
    }, [detections]);

    const maxConf = useMemo(() =>
        detections.reduce((m, d) => Math.max(m, d.confidence), 0),
        [detections]
    );

    const edgeParallelCount = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach(d => {
            const key = `${d.source_host}|${d.target_host}`;
            map.set(key, (map.get(key) ?? 0) + 1);
        });
        return map;
    }, [filtered]);

    const selectedDetection = selectedIdx != null ? filtered[selectedIdx] : null;
    const sourceHosts = useMemo(() => new Set(detections.map(d => d.source_host)), [detections]);
    const targetHosts = useMemo(() => new Set(detections.map(d => d.target_host)), [detections]);

    return (
        <div className="flex flex-col border border-red-500/20 bg-card/80 rounded-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-red-500/20 bg-red-500/5">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Network className="w-5 h-5 text-red-400" />
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    </div>
                    <div>
                        <span className="font-mono text-sm font-bold text-red-400 tracking-widest">
                            LATERAL MOVEMENT DETECTED
                        </span>
                        <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                            {detections.length} detection{detections.length !== 1 ? "s" : ""} across {allHosts.length} hosts
                            {" · "}max confidence {Math.round(maxConf * 100)}%
                        </p>
                    </div>
                </div>
                {onTriggerRebuild && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onTriggerRebuild}
                        disabled={isBuilding}
                        className="h-7 gap-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                    >
                        <RefreshCw className={cn("w-3 h-3", isBuilding && "animate-spin")} />
                        REDETECT
                    </Button>
                )}
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2 px-5 py-2 border-b border-border/30 bg-background/30">
                <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest">Filter:</span>
                <button
                    onClick={() => { setActiveType(null); setSelectedIdx(null); }}
                    className={cn(
                        "px-2.5 py-1 rounded-sm border font-mono text-[10px] font-bold transition-all",
                        activeType === null
                            ? "border-primary/60 bg-primary/10 text-primary"
                            : "border-border/40 text-muted-foreground hover:border-border"
                    )}
                >
                    ALL ({detections.length})
                </button>
                {(Object.keys(TYPE_CFG) as DetectionType[]).map(type => {
                    const cfg = TYPE_CFG[type];
                    const count = typeCounts[type] ?? 0;
                    if (!count) return null;
                    return (
                        <button
                            key={type}
                            onClick={() => { setActiveType(activeType === type ? null : type); setSelectedIdx(null); }}
                            className={cn(
                                "px-2.5 py-1 rounded-sm border font-mono text-[10px] font-bold transition-all flex items-center gap-1.5",
                                activeType === type ? cfg.bg : "border-border/40 text-muted-foreground hover:border-border"
                            )}
                        >
                            <cfg.icon className="w-3 h-3" />
                            {cfg.short} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Body */}
            <div className="flex min-h-0">
                {/* SVG Graph */}
                <div
                    className="relative border-r border-border/30 bg-background/40 flex-shrink-0"
                    style={{ width: SVG_W }}
                >
                    <svg
                        width={SVG_W}
                        height={SVG_H}
                        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                        style={{ fontFamily: "monospace", display: "block" }}
                    >
                        <defs>
                            <pattern id="lm-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                            </pattern>
                            {(Object.keys(TYPE_CFG) as DetectionType[]).map(type => (
                                <marker
                                    key={type}
                                    id={`arrow-${type}`}
                                    viewBox="0 0 10 10" refX="9" refY="5"
                                    markerWidth="6" markerHeight="6" orient="auto"
                                >
                                    <path d="M 0 0 L 10 5 L 0 10 z" fill={TYPE_CFG[type].color} opacity="0.9" />
                                </marker>
                            ))}
                            <marker id="arrow-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.12)" />
                            </marker>
                        </defs>

                        <rect width={SVG_W} height={SVG_H} fill="url(#lm-grid)" />
                        <circle cx={SVG_W / 2} cy={SVG_H / 2} r={SVG_H * 0.42} fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth={1} />

                        {/* Edges */}
                        {(() => {
                            const indexTracker = new Map<string, number>();
                            return filtered.map((det, i) => {
                                const key = `${det.source_host}|${det.target_host}`;
                                const idx = indexTracker.get(key) ?? 0;
                                indexTracker.set(key, idx + 1);
                                const total = edgeParallelCount.get(key) ?? 1;

                                const d = buildArrowPath(positions, det.source_host, det.target_host, idx, total);
                                if (!d) return null;

                                const cfg = TYPE_CFG[det.detection_type as DetectionType] ?? TYPE_CFG.process_spread;
                                const isSelected = selectedIdx === i;
                                const isRelated = highlightedHost
                                    ? det.source_host === highlightedHost || det.target_host === highlightedHost
                                    : true;
                                const dim = !isRelated && (selectedIdx != null ? !isSelected : false);

                                return (
                                    <g key={i} style={{ cursor: "pointer" }} onClick={() => setSelectedIdx(isSelected ? null : i)}>
                                        {isSelected && (
                                            <path d={d} fill="none" stroke={cfg.color} strokeWidth={7} strokeOpacity={0.15} strokeLinecap="round" />
                                        )}
                                        <path
                                            d={d}
                                            fill="none"
                                            stroke={dim ? "rgba(255,255,255,0.07)" : cfg.color}
                                            strokeWidth={isSelected ? 2.5 : 1.5}
                                            strokeOpacity={dim ? 0.3 : isSelected ? 1 : 0.55}
                                            strokeLinecap="round"
                                            markerEnd={dim ? "url(#arrow-dim)" : `url(#arrow-${det.detection_type})`}
                                        />
                                    </g>
                                );
                            });
                        })()}

                        {/* Nodes */}
                        {allHosts.map(host => (
                            <HostNode
                                key={host}
                                host={host}
                                x={positions[host]?.x ?? 0}
                                y={positions[host]?.y ?? 0}
                                role={hostRoles[host] ?? "none"}
                                isHighlighted={
                                    highlightedHost === host ||
                                    selectedDetection?.source_host === host ||
                                    selectedDetection?.target_host === host
                                }
                                onClick={() => {
                                    setHighlightedHost(highlightedHost === host ? null : host);
                                    if (onFilterHost) onFilterHost(host);
                                }}
                            />
                        ))}

                        {/* Legend */}
                        <g transform={`translate(10, ${SVG_H - 56})`}>
                            {(Object.keys(TYPE_CFG) as DetectionType[]).filter(t => typeCounts[t]).map((type, i) => (
                                <g key={type} transform={`translate(0, ${i * 16})`}>
                                    <line x1={0} y1={5} x2={18} y2={5} stroke={TYPE_CFG[type].color} strokeWidth={2} markerEnd={`url(#arrow-${type})`} />
                                    <text x={22} y={9} fill="rgba(255,255,255,0.45)" fontSize="9" fontFamily="monospace">
                                        {TYPE_CFG[type].label}
                                    </text>
                                </g>
                            ))}
                        </g>
                    </svg>
                    <div className="absolute bottom-2 right-2 font-mono text-[9px] text-muted-foreground/35 pointer-events-none">
                        CLICK EDGE · CLICK NODE TO FILTER
                    </div>
                </div>

                {/* Detection Cards */}
                <div className="flex-1 overflow-auto min-h-0 max-h-[340px]">
                    {filtered.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-xs">
                            NO DETECTIONS FOR SELECTED TYPE
                        </div>
                    ) : (
                        <div className="divide-y divide-border/20">
                            {filtered.map((det, i) => {
                                const cfg = TYPE_CFG[det.detection_type as DetectionType] ?? TYPE_CFG.process_spread;
                                const isSelected = selectedIdx === i;

                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "px-4 py-3 cursor-pointer transition-all",
                                            isSelected
                                                ? "bg-primary/8 border-l-2 border-l-primary"
                                                : "hover:bg-secondary/20"
                                        )}
                                        onClick={() => setSelectedIdx(isSelected ? null : i)}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded-sm border font-mono text-[9px] font-bold shrink-0",
                                                    cfg.bg
                                                )}>
                                                    {cfg.short}
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1 font-mono text-[11px] font-bold">
                                                        <span className="text-foreground/80 truncate max-w-[80px]" title={det.source_host}>
                                                            {det.source_host}
                                                        </span>
                                                        <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                                                        <span className="text-orange-400 truncate max-w-[80px]" title={det.target_host}>
                                                            {det.target_host}
                                                        </span>
                                                    </div>
                                                    <div className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                                                        {det.actor ?? "Unknown actor"}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end shrink-0 gap-1">
                                                <span className="font-mono text-[10px] font-bold text-foreground/70">
                                                    {Math.round(det.confidence * 100)}%
                                                </span>
                                                <div className="w-16 h-1 bg-secondary/60 rounded-full overflow-hidden">
                                                    <div
                                                        className={cn("h-full rounded-full", cfg.bar)}
                                                        style={{ width: `${det.confidence * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded detail */}
                                        {isSelected && (
                                            <div className="mt-3 pt-3 border-t border-border/30 space-y-2.5 animate-in fade-in duration-200">
                                                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                                    <div>
                                                        <div className="text-[9px] text-muted-foreground uppercase mb-1">Detection Type</div>
                                                        <div className={cn("px-2 py-1 rounded-sm border text-center font-bold", cfg.bg)}>
                                                            {cfg.label}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[9px] text-muted-foreground uppercase mb-1">Event Count</div>
                                                        <div className="px-2 py-1 rounded-sm border border-border/40 bg-secondary/30 text-center font-bold text-foreground">
                                                            {det.event_count} events
                                                        </div>
                                                    </div>
                                                </div>

                                                {det.actor && (
                                                    <div>
                                                        <div className="text-[9px] text-muted-foreground uppercase mb-1">Actor / Process</div>
                                                        <div className="flex items-center gap-2 px-2 py-1.5 bg-secondary/20 border border-border/30 rounded-sm">
                                                            <User className="w-3 h-3 text-muted-foreground shrink-0" />
                                                            <span className="font-mono text-[10px] text-foreground/80 break-all">{det.actor}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {(det.first_seen || det.last_seen) && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {det.first_seen && (
                                                            <div>
                                                                <div className="text-[9px] text-muted-foreground mb-1 flex items-center gap-1 font-mono">
                                                                    <Clock className="w-2.5 h-2.5" />FIRST SEEN
                                                                </div>
                                                                <div className="font-mono text-[9px] text-foreground/70">
                                                                    {new Date(det.first_seen).toLocaleString()}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {det.last_seen && (
                                                            <div>
                                                                <div className="text-[9px] text-muted-foreground mb-1 flex items-center gap-1 font-mono">
                                                                    <TrendingUp className="w-2.5 h-2.5" />LAST SEEN
                                                                </div>
                                                                <div className="font-mono text-[9px] text-foreground/70">
                                                                    {new Date(det.last_seen).toLocaleString()}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {det.details && Object.keys(det.details).length > 0 && (
                                                    <div>
                                                        <div className="text-[9px] text-muted-foreground uppercase mb-1 font-mono">Details</div>
                                                        <div className="bg-background/60 border border-border/30 rounded-sm p-2 space-y-1">
                                                            {Object.entries(det.details).map(([k, v]) => (
                                                                <div key={k} className="flex gap-2 text-[10px] font-mono">
                                                                    <span className="text-muted-foreground shrink-0 w-24 truncate">{k}:</span>
                                                                    <span className="text-foreground/80 break-all">{String(v)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {onFilterHost && (
                                                    <div className="flex gap-2 pt-1">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onFilterHost(det.source_host); }}
                                                            className="flex-1 px-2 py-1 border border-border/40 hover:border-primary/40 font-mono text-[9px] text-muted-foreground hover:text-primary transition-colors rounded-sm flex items-center justify-center gap-1"
                                                        >
                                                            <Eye className="w-2.5 h-2.5" />
                                                            FILTER: {det.source_host}
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onFilterHost(det.target_host); }}
                                                            className="flex-1 px-2 py-1 border border-orange-500/30 hover:border-orange-500/60 font-mono text-[9px] text-orange-400/70 hover:text-orange-400 transition-colors rounded-sm flex items-center justify-center gap-1"
                                                        >
                                                            <Eye className="w-2.5 h-2.5" />
                                                            FILTER: {det.target_host}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-6 px-5 py-2 border-t border-border/30 bg-background/20">
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <Zap className="w-3 h-3 text-red-400" />
                    <span className="text-red-400 font-bold">{sourceHosts.size}</span>
                    &nbsp;SOURCE{sourceHosts.size !== 1 ? "S" : ""}
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <AlertTriangle className="w-3 h-3 text-orange-400" />
                    <span className="text-orange-400 font-bold">{targetHosts.size}</span>
                    &nbsp;COMPROMISED
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <Shield className="w-3 h-3 text-primary" />
                    MAX CONF <span className="text-primary font-bold ml-1">{Math.round(maxConf * 100)}%</span>
                </div>
                <div className="ml-auto font-mono text-[9px] text-muted-foreground/35">
                    AUTO-DETECTED · HEURISTIC ENGINE v1
                </div>
            </div>
        </div>
    );
}
