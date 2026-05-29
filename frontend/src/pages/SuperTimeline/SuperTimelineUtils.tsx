import React from "react";
import { HOST_COLORS, SOURCE_SHORT_COLORS, ColumnKey } from "./SuperTimelineTypes";

export function getHostColor(host: string, allHosts: string[]) {
    const idx = allHosts.indexOf(host);
    return HOST_COLORS[idx % HOST_COLORS.length] ?? HOST_COLORS[0];
}

export function getSourceColor(sourceShort: string): string {
    return (
        SOURCE_SHORT_COLORS[sourceShort?.toUpperCase()] ??
        "bg-secondary/60 text-muted-foreground border-border/40"
    );
}

export function formatTs(ts: string | null): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
}

export function truncate(val: unknown, max = 120): string {
    if (val === null || val === undefined) return "—";
    const str = String(val);
    return str.length > max ? str.slice(0, max) + "…" : str;
}

export function highlightTerms(text: string, term: string): React.ReactNode {
    if (!term || term.length < 2) return text;
    const lower = text.toLowerCase();
    const lowerTerm = term.toLowerCase();
    const idx = lower.indexOf(lowerTerm);
    if (idx === -1) return text;
    // We use regular text nodes and <mark> elements for highlighting
    // This is safe as it doesn't use dangerouslySetInnerHTML
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

export type ParsedDSL = {
    q: string;
    hosts: string[];
    sources: string[];
    users: string[];
    eventIds: string[];
    rules: string[];
};

export function parseDSLQuery(input: string): ParsedDSL {
    const result: ParsedDSL = { q: "", hosts: [], sources: [], users: [], eventIds: [], rules: [] };
    if (!input.trim()) return result;

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

export function hashEvent(event: Record<string, unknown>): string {
    const str = `${String(event.datetime)}|${String(event.host ?? event.computer)}|${String(event.message ?? event.description)}`;
    let h = 0;
    for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return Math.abs(h).toString(36);
}

export function detectIOCs(text: string) {
    const results: { type: "IPv4" | "MD5" | "SHA1" | "SHA256" | "Domain"; value: string }[] = [];
    const seen = new Set<string>();

    function add(type: any, value: string) {
        const key = `${type}:${value.toLowerCase()}`;
        if (!seen.has(key)) { seen.add(key); results.push({ type, value }); }
    }

    const ipv4Re   = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
    const sha256Re = /\b[0-9a-fA-F]{64}\b/g;
    const sha1Re   = /\b[0-9a-fA-F]{40}\b/g;
    const md5Re    = /\b[0-9a-fA-F]{32}\b/g;
    const domainRe = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|gov|mil|edu|ru|cn|de|uk)\b/gi;

    for (const m of text.matchAll(sha256Re)) add("SHA256", m[0]);
    for (const m of text.matchAll(sha1Re))   add("SHA1",   m[0]);
    for (const m of text.matchAll(md5Re))    add("MD5",    m[0]);
    for (const m of text.matchAll(ipv4Re))   add("IPv4",   m[0]);
    for (const m of text.matchAll(domainRe)) add("Domain", m[0]);

    return results;
}
