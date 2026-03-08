"""
Attack chain reconstruction from Sigma hits.

Groups hits into 15-minute temporal windows, maps rule tags to MITRE ATT&CK
tactics/techniques, builds a directed graph per window, and stores AttackChain records.
"""
from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Kill-chain ordered list of ATT&CK tactic slug → display name
_TACTIC_ORDER: list[tuple[str, str]] = [
    ("initial_access", "Initial Access"),
    ("execution", "Execution"),
    ("persistence", "Persistence"),
    ("privilege_escalation", "Privilege Escalation"),
    ("defense_evasion", "Defense Evasion"),
    ("credential_access", "Credential Access"),
    ("discovery", "Discovery"),
    ("lateral_movement", "Lateral Movement"),
    ("collection", "Collection"),
    ("command_and_control", "Command and Control"),
    ("exfiltration", "Exfiltration"),
    ("impact", "Impact"),
]
_TACTIC_SLUGS = {slug for slug, _ in _TACTIC_ORDER}
_TACTIC_DISPLAY = {slug: display for slug, display in _TACTIC_ORDER}

_SEVERITY_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "informational": 0}
_WINDOW_MINUTES = 15


def _extract_attack_tags(rule_tags: list[str]) -> tuple[list[str], list[str]]:
    """Extract (tactics, techniques) from Sigma rule tags like 'attack.t1059.001'."""
    tactics: list[str] = []
    techniques: list[str] = []
    for tag in rule_tags:
        tag_lower = tag.lower().strip()
        if not tag_lower.startswith("attack."):
            continue
        part = tag_lower[len("attack."):]
        if part in _TACTIC_SLUGS:
            tactics.append(part)
        elif part.startswith("t") and len(part) >= 5:
            techniques.append(part.upper())  # e.g. T1059.001
    return tactics, techniques


def _window_key(ts: datetime | None) -> datetime | None:
    """Floor timestamp to the nearest 15-minute window."""
    if ts is None:
        return None
    floored = ts.replace(
        minute=(ts.minute // _WINDOW_MINUTES) * _WINDOW_MINUTES,
        second=0,
        microsecond=0,
    )
    return floored


def _highest_severity(severities: list[str]) -> str:
    best = "informational"
    best_rank = -1
    for s in severities:
        r = _SEVERITY_RANK.get(s.lower(), 0)
        if r > best_rank:
            best_rank = r
            best = s.lower()
    return best


def _build_graph(
    tactics_ordered: list[str],
    techniques: list[str],
) -> tuple[list[dict], list[dict]]:
    """Build a simple directed graph: tactics in order → techniques underneath each."""
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_nodes: set[str] = set()

    def add_node(node_id: str, label: str, node_type: str) -> None:
        if node_id not in seen_nodes:
            nodes.append({"id": node_id, "label": label, "type": node_type})
            seen_nodes.add(node_id)

    prev_tactic: str | None = None
    for slug in tactics_ordered:
        label = _TACTIC_DISPLAY.get(slug, slug.replace("_", " ").title())
        add_node(slug, label, "tactic")
        if prev_tactic:
            edges.append({"source": prev_tactic, "target": slug, "label": "leads_to"})
        prev_tactic = slug

    for tech in techniques:
        add_node(tech, tech, "technique")
        # Link technique to the first tactic present (best effort)
        if tactics_ordered:
            edges.append({"source": tactics_ordered[0], "target": tech, "label": "uses"})

    return nodes, edges


async def build_attack_chains(
    incident_id: str,
    processing_job_id: str,
    db: AsyncSession,
) -> int:
    """
    Read SigmaHit records for an incident, cluster into 15-min windows,
    reconstruct ATT&CK chains, and store AttackChain records.
    Returns number of chains created.
    """
    from app.models.analytics import AttackChain
    from sqlalchemy import select, delete
    from app.models.processing import SigmaHit

    # Clear previous chains for this processing job
    await db.execute(
        delete(AttackChain).where(AttackChain.processing_job_id == processing_job_id)
    )

    # Load all sigma hits for the incident
    result = await db.execute(
        select(SigmaHit)
        .where(SigmaHit.incident_id == incident_id)
        .order_by(SigmaHit.event_timestamp.nullslast())
    )
    hits = result.scalars().all()

    if not hits:
        logger.info("No sigma hits for incident %s — skipping attack chain build", incident_id)
        return 0

    # Group by 15-minute window key
    windows: dict[datetime | str, list[SigmaHit]] = defaultdict(list)
    for hit in hits:
        wk = _window_key(hit.event_timestamp)
        key = wk if wk is not None else "no_timestamp"
        windows[key].append(hit)

    chains: list[AttackChain] = []
    for wk, window_hits in windows.items():
        all_tactics: list[str] = []
        all_techniques: list[str] = []
        severities: list[str] = []
        hit_ids: list[str] = []

        for hit in window_hits:
            tags = hit.rule_tags or []
            t, tech = _extract_attack_tags(tags)
            all_tactics.extend(t)
            all_techniques.extend(tech)
            severities.append(hit.severity or "informational")
            hit_ids.append(hit.id)

        # Deduplicate and order tactics by kill-chain position
        unique_tactics = list(dict.fromkeys(
            slug for slug in (s[0] for s in _TACTIC_ORDER) if slug in set(all_tactics)
        ))
        unique_techniques = list(dict.fromkeys(all_techniques))

        nodes, edges = _build_graph(unique_tactics, unique_techniques)

        window_start: datetime | None = None
        window_end: datetime | None = None
        if isinstance(wk, datetime):
            window_start = wk.replace(tzinfo=timezone.utc) if wk.tzinfo is None else wk
            window_end = window_start + timedelta(minutes=_WINDOW_MINUTES)

        chains.append(
            AttackChain(
                id=str(uuid.uuid4()),
                incident_id=incident_id,
                processing_job_id=processing_job_id,
                window_start=window_start,
                window_end=window_end,
                tactics=unique_tactics,
                techniques=unique_techniques,
                graph_nodes=nodes,
                graph_edges=edges,
                hit_count=len(window_hits),
                severity=_highest_severity(severities),
                sigma_hit_ids=hit_ids,
            )
        )

    if chains:
        db.add_all(chains)
        await db.flush()

    logger.info(
        "Attack chain reconstruction complete for incident %s: %d chains from %d hits",
        incident_id, len(chains), len(hits),
    )
    return len(chains)
