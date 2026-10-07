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
        part = tag_lower[len("attack.") :]
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


TECHNIQUE_TACTIC_MAP: dict[str, list[str]] = {
    # Initial Access
    "T1189": ["initial_access"],
    "T1190": ["initial_access"],
    "T1566": ["initial_access"],
    "T1078": ["initial_access", "persistence", "privilege_escalation", "defense_evasion"],
    # Execution
    "T1059": ["execution"],
    "T1204": ["execution"],
    "T1047": ["execution"],
    "T1053": ["execution", "persistence", "privilege_escalation"],
    "T1106": ["execution"],
    "T1569": ["execution"],
    # Persistence
    "T1547": ["persistence", "privilege_escalation"],
    "T1543": ["persistence", "privilege_escalation"],
    "T1136": ["persistence"],
    "T1546": ["persistence", "privilege_escalation"],
    "T1574": ["persistence", "privilege_escalation", "defense_evasion"],
    # Privilege Escalation
    "T1068": ["privilege_escalation"],
    "T1055": ["privilege_escalation", "defense_evasion"],
    # Defense Evasion
    "T1070": ["defense_evasion"],
    "T1036": ["defense_evasion"],
    "T1027": ["defense_evasion"],
    "T1112": ["defense_evasion"],
    "T1562": ["defense_evasion"],
    "T1218": ["defense_evasion"],
    # Credential Access
    "T1003": ["credential_access"],
    "T1110": ["credential_access"],
    "T1555": ["credential_access"],
    "T1558": ["credential_access"],
    "T1552": ["credential_access"],
    # Discovery
    "T1087": ["discovery"],
    "T1082": ["discovery"],
    "T1083": ["discovery"],
    "T1057": ["discovery"],
    "T1018": ["discovery"],
    "T1016": ["discovery"],
    "T1049": ["discovery"],
    # Lateral Movement
    "T1021": ["lateral_movement"],
    "T1570": ["lateral_movement"],
    "T1563": ["lateral_movement"],
    "T1080": ["lateral_movement"],
    # Collection
    "T1005": ["collection"],
    "T1114": ["collection"],
    "T1560": ["collection"],
    "T1115": ["collection"],
    "T1113": ["collection"],
    # Command and Control
    "T1071": ["command_and_control"],
    "T1090": ["command_and_control"],
    "T1095": ["command_and_control"],
    "T1573": ["command_and_control"],
    "T1105": ["command_and_control"],
    "T1219": ["command_and_control"],
    # Exfiltration
    "T1048": ["exfiltration"],
    "T1041": ["exfiltration"],
    "T1567": ["exfiltration"],
    # Impact
    "T1485": ["impact"],
    "T1486": ["impact"],
    "T1489": ["impact"],
    "T1490": ["impact"],
    "T1529": ["impact"],
}


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
    technique_to_tactics: dict[str, set[str]] | None = None,
) -> tuple[list[dict], list[dict]]:
    """Build a directed graph: tactics in kill-chain order -> techniques bound to matching tactics."""
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_nodes: set[str] = set()
    technique_to_tactics = technique_to_tactics or {}

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

    tactics_set = set(tactics_ordered)

    for tech in techniques:
        add_node(tech, tech, "technique")
        # 1. Check explicit associations from co-occurring rule tags
        assigned_tactics = [t for t in technique_to_tactics.get(tech, set()) if t in tactics_set]
        # 2. If none, check ATT&CK taxonomy lookup (full technique ID or base ID)
        if not assigned_tactics:
            base_id = tech.split(".")[0].upper()
            lookup_tactics = TECHNIQUE_TACTIC_MAP.get(tech.upper()) or TECHNIQUE_TACTIC_MAP.get(base_id) or []
            assigned_tactics = [t for t in lookup_tactics if t in tactics_set]

        # 3. If matching tactics exist in current chain, link edges
        if assigned_tactics:
            for t in assigned_tactics:
                edges.append({"source": t, "target": tech, "label": "uses"})
        elif tactics_ordered:
            # Fallback to the first tactic present
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
    from sqlalchemy import delete, select

    from app.models.analytics import AttackChain
    from app.models.processing import SigmaHit

    # Clear previous chains for this processing job
    await db.execute(delete(AttackChain).where(AttackChain.processing_job_id == processing_job_id))

    # Load all sigma hits for the incident
    result = await db.execute(
        select(SigmaHit)
        .where(SigmaHit.incident_id == incident_id)
        .where(SigmaHit.processing_job_id == processing_job_id)
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
        technique_to_tactics: dict[str, set[str]] = defaultdict(set)

        for hit in window_hits:
            tags = hit.rule_tags or []
            t, tech = _extract_attack_tags(tags)
            all_tactics.extend(t)
            all_techniques.extend(tech)
            severities.append(hit.severity or "informational")
            hit_ids.append(hit.id)
            for tc in tech:
                for ta in t:
                    technique_to_tactics[tc].add(ta)

        # Deduplicate and order tactics by kill-chain position
        unique_tactics = list(
            dict.fromkeys(
                slug for slug in (s[0] for s in _TACTIC_ORDER) if slug in set(all_tactics)
            )
        )
        unique_techniques = list(dict.fromkeys(all_techniques))

        nodes, edges = _build_graph(unique_tactics, unique_techniques, technique_to_tactics)

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
        incident_id,
        len(chains),
        len(hits),
    )
    return len(chains)
