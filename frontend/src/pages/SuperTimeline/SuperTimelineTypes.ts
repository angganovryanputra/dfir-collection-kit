import React from "react";

export type SuperTimelineStatusData = {
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

export type LateralMovementDetection = {
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

export type SuperTimelineResponse = {
    data: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    hosts: string[];
    source_shorts: string[];
};

export type QuickFilter = {
    id: string;
    label: string;
    q?: string;
    sources?: string[];
};

export type ColumnKey = "event_id" | "user" | "display_name";
export type SortKey = "datetime" | "host" | "source" | "type" | "message";

export interface Bookmark {
    eventHash: string;
    note: string;
    createdAt: string;
    datetime: string;
    host: string;
    message: string;
    source_short: string;
}

export type EventTagValue = "confirmed" | "suspicious" | "fp" | "interesting";

export const HOST_COLORS = [
    { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" },
    { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
    { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
    { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
    { bg: "bg-pink-500/20", text: "text-pink-400", border: "border-pink-500/30" },
    { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30" },
    { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
    { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30" },
];

export const SOURCE_SHORT_COLORS: Record<string, string> = {
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

export const SOURCE_METADATA: Record<string, {
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

export const DETECTION_TYPE_COLORS: Record<LateralMovementDetection["detection_type"], string> = {
    account_pivot:    "text-red-400 border-red-400/40 bg-red-400/10",
    process_spread:   "text-orange-400 border-orange-400/40 bg-orange-400/10",
    credential_reuse: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
};

export const QUICK_FILTERS: QuickFilter[] = [
    { id: "sigma",    label: "SIGMA ALERTS",     sources: ["SIGMA", "HAYABUSA"] },
    { id: "logon",    label: "LOGON EVENTS",      q: "logon" },
    { id: "process",  label: "PROCESS EXECUTION", sources: ["PREFETCH", "AMCACHE"] },
    { id: "fileops",  label: "FILE OPERATIONS",   sources: ["MFT", "LNK"] },
    { id: "network",  label: "NETWORK ACTIVITY",  sources: ["SYSMON"], q: "network" },
    { id: "registry", label: "REGISTRY",          sources: ["REGISTRY"] },
    { id: "lateral",  label: "LATERAL MOVEMENT",  q: "lateral" },
    { id: "ransom",   label: "RANSOMWARE",         q: "ransom" },
];

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

export const OPTIONAL_COLS: { key: ColumnKey; label: string }[] = [
    { key: "event_id",    label: "EVENT ID / RULE" },
    { key: "user",        label: "USER" },
    { key: "display_name", label: "PATH / ARTIFACT" },
];

export const COL_STORAGE_KEY = "dfir_st_cols";
export const DEFAULT_VISIBLE: ColumnKey[] = ["event_id", "user"];

export const EVENT_TAG_META: Record<EventTagValue, { label: string; color: string; short: string }> = {
    confirmed:   { label: "CONFIRMED",   short: "C", color: "border-red-500/50 bg-red-500/15 text-red-400" },
    suspicious:  { label: "SUSPICIOUS",  short: "S", color: "border-orange-500/50 bg-orange-500/15 text-orange-400" },
    interesting: { label: "INTERESTING", short: "I", color: "border-blue-500/50 bg-blue-500/15 text-blue-400" },
    fp:          { label: "FALSE POS",   short: "F", color: "border-border/40 bg-secondary/30 text-muted-foreground line-through" },
};

export const IOC_COLORS: Record<string, string> = {
    IPv4:   "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
    MD5:    "border-purple-500/40 bg-purple-500/10 text-purple-400",
    SHA1:   "border-purple-500/40 bg-purple-500/10 text-purple-400",
    SHA256: "border-purple-500/40 bg-purple-500/10 text-purple-400",
    Domain: "border-green-500/40 bg-green-500/10 text-green-400",
};
