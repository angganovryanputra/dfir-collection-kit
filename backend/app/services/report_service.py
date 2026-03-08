"""
Incident report generation service.
Generates a standalone HTML report with all forensic findings.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Severity CSS colours
_SEV_COLORS = {
    "critical": "#ef4444",
    "high": "#f97316",
    "medium": "#eab308",
    "low": "#3b82f6",
    "informational": "#6b7280",
}

_TACTIC_ORDER = [
    "initial_access", "execution", "persistence", "privilege_escalation",
    "defense_evasion", "credential_access", "discovery", "lateral_movement",
    "collection", "command_and_control", "exfiltration", "impact",
]


def _sev_badge(severity: str) -> str:
    color = _SEV_COLORS.get(severity.lower(), "#6b7280")
    return (
        f'<span style="background:{color};color:#fff;padding:2px 8px;'
        f'border-radius:3px;font-size:11px;font-weight:bold;'
        f'text-transform:uppercase">{html.escape(severity)}</span>'
    )


def _h(text: str) -> str:
    return html.escape(str(text))


def _fmt_ts(ts) -> str:
    if ts is None:
        return "—"
    try:
        if isinstance(ts, str):
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        else:
            dt = ts
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except (ValueError, AttributeError):
        return str(ts)


def _css() -> str:
    return """
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; background: #0a0a0a; color: #d1d5db;
             margin: 0; padding: 24px; line-height: 1.5; }
      .container { max-width: 1100px; margin: 0 auto; }
      h1 { color: #10b981; font-size: 22px; border-bottom: 1px solid #10b981;
           padding-bottom: 8px; margin-bottom: 4px; }
      h2 { color: #10b981; font-size: 15px; margin: 24px 0 8px;
           text-transform: uppercase; letter-spacing: 1px; }
      h3 { color: #9ca3af; font-size: 13px; margin: 16px 0 6px; }
      .meta { font-size: 11px; color: #6b7280; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
      th { text-align: left; padding: 6px 10px; background: #1f2937;
           color: #9ca3af; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
      td { padding: 6px 10px; border-bottom: 1px solid #1f2937; vertical-align: top; }
      tr:hover td { background: #111827; }
      .kv { display: grid; grid-template-columns: 180px 1fr; gap: 4px 12px;
            font-size: 12px; margin-bottom: 12px; }
      .kv-label { color: #6b7280; }
      .kv-value { color: #d1d5db; }
      .panel { border: 1px solid #1f2937; padding: 16px; margin-bottom: 20px;
               background: #111827; }
      .stat-row { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 12px; }
      .stat { background: #1f2937; padding: 12px 20px; }
      .stat-num { font-size: 28px; font-weight: bold; color: #10b981; }
      .stat-label { font-size: 10px; color: #6b7280; text-transform: uppercase; }
      .chain { border-left: 3px solid #10b981; padding-left: 12px; margin-bottom: 12px; }
      .tactic-pill { display: inline-block; background: #064e3b; color: #10b981;
                     padding: 2px 8px; border-radius: 3px; font-size: 10px;
                     margin: 2px; text-transform: uppercase; }
      .tech-pill  { display: inline-block; background: #451a03; color: #f97316;
                    padding: 2px 8px; border-radius: 3px; font-size: 10px; margin: 2px; }
      .footer { text-align: center; font-size: 11px; color: #374151; margin-top: 40px;
                border-top: 1px solid #1f2937; padding-top: 16px; }
      .hash { font-size: 10px; color: #4b5563; word-break: break-all; }
      .not-started { color: #6b7280; font-style: italic; }
    </style>
    """


async def generate_incident_report(incident_id: str, db: AsyncSession) -> str:
    """Generate a full HTML incident report. Returns HTML string."""
    from app.crud.incident import get_incident
    from app.crud.chain_of_custody import list_entries
    from app.crud.evidence import list_items
    from app.crud.processing import (
        get_latest_processing_job_by_incident_id,
        list_sigma_hits,
        count_sigma_hits_by_severity,
    )
    from app.crud.analytics import list_attack_chains, list_ioc_matches, list_yara_matches

    # Load data
    incident = await get_incident(db, incident_id)
    if not incident:
        raise ValueError(f"Incident not found: {incident_id}")

    custody_entries, _ = await list_entries(db, incident_id)
    evidence_items = await list_items(db, incident_id)
    proc_job = await get_latest_processing_job_by_incident_id(db, incident_id)
    sigma_hits: list = []
    sigma_counts: dict = {}
    attack_chains: list = []
    ioc_matches: list = []
    yara_matches: list = []

    if proc_job:
        sigma_hits, _ = await list_sigma_hits(db, incident_id, limit=500)
        sigma_counts = await count_sigma_hits_by_severity(db, incident_id)
        attack_chains = await list_attack_chains(db, incident_id)
        ioc_matches, _ = await list_ioc_matches(db, incident_id, limit=200)
        yara_matches, _ = await list_yara_matches(db, incident_id, limit=200)

    gen_ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # ── Build HTML ─────────────────────────────────────────────────────────────
    parts: list[str] = []
    parts.append(f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DFIR Report — {_h(incident_id)}</title>
{_css()}
</head>
<body>
<div class="container">
""")

    # Header
    parts.append(f"""
<h1>&#x1F50D; DFIR INCIDENT REPORT</h1>
<div class="meta">Generated: {gen_ts} &nbsp;|&nbsp; DFIR Rapid Collection Kit</div>
""")

    # Incident Summary
    parts.append('<h2>1. Incident Summary</h2><div class="panel"><div class="kv">')
    for label, value in [
        ("Incident ID", incident.id),
        ("Type", incident.type),
        ("Status", incident.status),
        ("Operator", incident.operator),
        ("Target Endpoints", ", ".join(incident.target_endpoints or [])),
        ("Created", _fmt_ts(incident.created_at)),
        ("Updated", _fmt_ts(incident.updated_at)),
    ]:
        parts.append(
            f'<span class="kv-label">{_h(label)}</span>'
            f'<span class="kv-value">{_h(str(value or "—"))}</span>'
        )
    parts.append("</div></div>")

    # Evidence Inventory
    parts.append('<h2>2. Evidence Inventory</h2>')
    if evidence_items:
        parts.append('<div class="panel"><table><thead><tr>')
        for col in ["Filename", "Type", "Size", "Status", "SHA-256 Hash", "Collected"]:
            parts.append(f"<th>{_h(col)}</th>")
        parts.append("</tr></thead><tbody>")
        for item in evidence_items:
            parts.append(
                f"<tr><td>{_h(item.name)}</td>"
                f"<td>{_h(item.type)}</td>"
                f"<td>{_h(item.size or '—')}</td>"
                f"<td>{_h(item.status)}</td>"
                f'<td class="hash">{_h(item.hash or "—")}</td>'
                f"<td>{_fmt_ts(item.collected_at)}</td></tr>"
            )
        parts.append("</tbody></table></div>")
    else:
        parts.append('<p class="not-started">No evidence items collected.</p>')

    # Sigma Detection
    parts.append('<h2>3. Sigma Detection Results</h2>')
    if proc_job:
        total_hits = sum(sigma_counts.values())
        parts.append('<div class="stat-row">')
        parts.append(
            f'<div class="stat"><div class="stat-num">{total_hits}</div>'
            f'<div class="stat-label">Total Detections</div></div>'
        )
        for sev in ["critical", "high", "medium", "low", "informational"]:
            count = sigma_counts.get(sev, 0)
            if count:
                color = _SEV_COLORS.get(sev, "#6b7280")
                parts.append(
                    f'<div class="stat"><div class="stat-num" style="color:{color}">{count}</div>'
                    f'<div class="stat-label">{sev.upper()}</div></div>'
                )
        parts.append("</div>")

        if sigma_hits:
            parts.append('<div class="panel"><table><thead><tr>')
            for col in ["Severity", "Rule Name", "Artifact", "Event Time", "MITRE Tags"]:
                parts.append(f"<th>{_h(col)}</th>")
            parts.append("</tr></thead><tbody>")
            for hit in sigma_hits[:200]:
                tags_str = ", ".join(hit.rule_tags or [])
                parts.append(
                    f"<tr><td>{_sev_badge(hit.severity)}</td>"
                    f"<td>{_h(hit.rule_name)}</td>"
                    f"<td>{_h(hit.artifact_file or '—')}</td>"
                    f"<td>{_fmt_ts(hit.event_timestamp)}</td>"
                    f"<td><small>{_h(tags_str)}</small></td></tr>"
                )
            if len(sigma_hits) > 200:
                parts.append(
                    f'<tr><td colspan="5" style="color:#6b7280;text-align:center">'
                    f'{len(sigma_hits) - 200} more hits not shown</td></tr>'
                )
            parts.append("</tbody></table></div>")
        else:
            parts.append('<p class="not-started">No Sigma detections.</p>')
    else:
        parts.append('<p class="not-started">Forensics pipeline has not run yet.</p>')

    # Attack Chain Reconstruction
    parts.append('<h2>4. ATT&amp;CK Chain Reconstruction</h2>')
    if attack_chains:
        for chain in attack_chains:
            sorted_tactics = sorted(
                chain.tactics or [],
                key=lambda t: _TACTIC_ORDER.index(t) if t in _TACTIC_ORDER else 99,
            )
            window = ""
            if chain.window_start:
                window = f" | Window: {_fmt_ts(chain.window_start)} – {_fmt_ts(chain.window_end)}"
            parts.append(
                f'<div class="chain">'
                f'<h3>{_sev_badge(chain.severity)} &nbsp;{chain.hit_count} hit(s){_h(window)}</h3>'
            )
            if sorted_tactics:
                parts.append("<div>")
                for t in sorted_tactics:
                    label = t.replace("_", " ").upper()
                    parts.append(f'<span class="tactic-pill">{_h(label)}</span>')
                parts.append("</div>")
            if chain.techniques:
                parts.append("<div style='margin-top:4px'>")
                for tech in chain.techniques:
                    parts.append(f'<span class="tech-pill">{_h(tech)}</span>')
                parts.append("</div>")
            parts.append("</div>")
    elif proc_job:
        parts.append('<p class="not-started">No ATT&CK chains reconstructed.</p>')
    else:
        parts.append('<p class="not-started">Pipeline not run yet.</p>')

    # IOC Matches
    parts.append('<h2>5. IOC Matches</h2>')
    if ioc_matches:
        parts.append('<div class="panel"><table><thead><tr>')
        for col in ["Type", "IOC Value", "Matched Field", "Source", "Event Time", "Severity"]:
            parts.append(f"<th>{_h(col)}</th>")
        parts.append("</tr></thead><tbody>")
        for m in ioc_matches:
            parts.append(
                f"<tr><td>{_h(m.ioc_type.upper())}</td>"
                f"<td><b>{_h(m.ioc_value)}</b></td>"
                f"<td>{_h(m.matched_field)}</td>"
                f"<td>{_h(m.event_source or '—')}</td>"
                f"<td>{_fmt_ts(m.event_timestamp)}</td>"
                f"<td>{_sev_badge(m.severity)}</td></tr>"
            )
        parts.append("</tbody></table></div>")
    elif proc_job:
        parts.append('<p class="not-started">No IOC matches found.</p>')
    else:
        parts.append('<p class="not-started">Pipeline not run yet.</p>')

    # YARA Matches
    parts.append('<h2>6. YARA Scan Results</h2>')
    if yara_matches:
        parts.append('<div class="panel"><table><thead><tr>')
        for col in ["Rule", "Matched File", "File Size", "SHA-256", "Severity"]:
            parts.append(f"<th>{_h(col)}</th>")
        parts.append("</tr></thead><tbody>")
        for m in yara_matches:
            size_str = f"{m.file_size:,} bytes" if m.file_size else "—"
            parts.append(
                f"<tr><td><b>{_h(m.rule_name)}</b></td>"
                f"<td>{_h(m.matched_file)}</td>"
                f"<td>{_h(size_str)}</td>"
                f'<td class="hash">{_h(m.file_sha256 or "—")}</td>'
                f"<td>{_sev_badge(m.severity)}</td></tr>"
            )
        parts.append("</tbody></table></div>")
    elif proc_job:
        parts.append('<p class="not-started">No YARA matches found.</p>')
    else:
        parts.append('<p class="not-started">Pipeline not run yet.</p>')

    # Chain of Custody
    parts.append('<h2>7. Chain of Custody</h2>')
    if custody_entries:
        parts.append('<div class="panel"><table><thead><tr>')
        for col in ["#", "Timestamp", "Action", "Actor", "Target"]:
            parts.append(f"<th>{_h(col)}</th>")
        parts.append("</tr></thead><tbody>")
        for entry in custody_entries:
            parts.append(
                f"<tr><td>{entry.sequence}</td>"
                f"<td>{_fmt_ts(entry.timestamp)}</td>"
                f"<td>{_h(entry.action)}</td>"
                f"<td>{_h(entry.actor)}</td>"
                f"<td>{_h(entry.target)}</td></tr>"
            )
        parts.append("</tbody></table></div>")
    else:
        parts.append('<p class="not-started">No chain of custody entries.</p>')

    # Footer
    parts.append(f"""
<div class="footer">
  DFIR Rapid Collection Kit &nbsp;|&nbsp; Report generated: {gen_ts}<br>
  Incident: {_h(incident_id)} &nbsp;|&nbsp; This report is CONFIDENTIAL
</div>
</div>
</body>
</html>
""")

    return "".join(parts)
