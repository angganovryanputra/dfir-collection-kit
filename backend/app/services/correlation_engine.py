"""Bounded cross-event detections over a Super Timeline DuckDB database."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

_RDP_LOGON_PATTERN = re.compile(r"\b(?:logontype|logon\s+type)[\s:=]+10\b", re.IGNORECASE)


def _is_rdp_logon(event: dict[str, Any]) -> bool:
    if event.get("event_id") != "4624":
        return False
    extra = event.get("extra") or {}
    logon_type = str(
        extra.get("logon_type")
        or extra.get("LogonType")
        or extra.get("logonType")
        or ""
    ).strip()
    if logon_type == "10":
        return True
    return bool(_RDP_LOGON_PATTERN.search(str(event.get("message") or "")))



def _parse_extra(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if value is None:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _detection(
    rule_id: str,
    title: str,
    severity: str,
    confidence: int,
    event: dict[str, Any],
    evidence: list[dict[str, Any]],
    description: str,
) -> dict[str, Any]:
    return {
        "rule_id": rule_id,
        "rule_name": title,
        "severity": severity,
        "confidence": confidence,
        "host": event.get("host") or "UNKNOWN",
        "actor": event.get("actor") or event.get("user") or None,
        "event_time": event["event_dt"].isoformat() if event.get("event_dt") else None,
        "description": description,
        "evidence": evidence[:25],
    }


def run_correlations(
    duckdb_path: Path, max_events: int = 250_000, coverage: dict | None = None
) -> list[dict[str, Any]]:
    """Return deterministic correlations without modifying the evidence store.

    The input is capped and the SQL uses parameters, so an analyst request
    cannot turn a UI call into an unbounded scan or SQL injection primitive.
    """
    import duckdb

    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        rows = con.execute(
            """
            SELECT row_id, host, event_dt, message, source_short, extra
            FROM timeline_events
            WHERE event_dt IS NOT NULL
              AND (
                json_extract_string(extra, '$.event_id') IN ('4624','4625','4698','1102','4728','4732','4756')
                OR lower(message) LIKE '%scheduled task%'
                OR lower(message) LIKE '%admin$%'
              )
            ORDER BY event_dt ASC, row_id ASC
            LIMIT ?
            """,
            [max_events + 1],
        ).fetchall()
    finally:
        con.close()

    if coverage is not None:
        coverage.update(
            examined_candidates=min(len(rows), max_events),
            candidate_limit=max_events,
            truncated=len(rows) > max_events,
        )
    rows = rows[:max_events]
    events: list[dict[str, Any]] = []
    for row_id, host, event_dt, message, source_short, extra_raw in rows:
        extra = _parse_extra(extra_raw)
        events.append(
            {
                "row_id": row_id,
                "host": host,
                "event_dt": _as_datetime(event_dt),
                "message": message or "",
                "source_short": source_short or "",
                "extra": extra,
                "event_id": str(extra.get("event_id") or extra.get("EventId") or ""),
                "actor": extra.get("actor") or extra.get("user") or extra.get("UserName"),
                "user": extra.get("user") or extra.get("UserName"),
            }
        )

    results: list[dict[str, Any]] = []
    failed: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        host = str(event.get("host") or "UNKNOWN")
        actor = str(event.get("actor") or "UNKNOWN")
        if event["event_id"] == "4625":
            failed[(host, actor)].append(event)
        elif event["event_id"] == "4624" and (attempts := failed.get((host, actor))):
            recent = [
                x
                for x in attempts
                if x["event_dt"]
                and event["event_dt"]
                and 0 <= (event["event_dt"] - x["event_dt"]).total_seconds() <= 3600
            ]
            if len(recent) >= 5:
                results.append(
                    _detection(
                        "DFIR-CORR-001",
                        "Brute-force followed by successful logon",
                        "high",
                        85,
                        event,
                        recent + [event],
                        f"{len(recent)} failed logons for {actor} on {host} were followed by a successful logon within one hour.",
                    )
                )
                failed[(host, actor)] = []

    rdp_logons: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        actor = str(event.get("actor") or "")
        if (
            _is_rdp_logon(event)
            and actor.upper() not in {"", "-", "SYSTEM", "ANONYMOUS LOGON"}
            and not actor.endswith("$")
        ):
            rdp_logons[actor].append(event)
    for actor, logons in rdp_logons.items():
        hosts = {str(item.get("host") or "UNKNOWN") for item in logons}
        if len(hosts) >= 3:
            results.append(
                _detection(
                    "DFIR-CORR-006",
                    "RDP lateral movement",
                    "critical",
                    90,
                    logons[-1],
                    logons,
                    f"{actor} performed Remote Desktop logons on {len(hosts)} hosts in the available timeline window.",
                )
            )

    for event in events:
        event_id = event["event_id"]
        message = str(event["message"]).lower()
        if event_id == "1102":
            results.append(
                _detection(
                    "DFIR-CORR-002",
                    "Windows audit log cleared",
                    "high",
                    90,
                    event,
                    [event],
                    "Windows event ID 1102 indicates that the audit log was cleared.",
                )
            )
        elif event_id == "4698" or "scheduled task" in message:
            results.append(
                _detection(
                    "DFIR-CORR-003",
                    "Scheduled task creation",
                    "medium",
                    70,
                    event,
                    [event],
                    "A scheduled task creation artifact may indicate persistence or execution.",
                )
            )
        elif event_id in {"4728", "4732", "4756"}:
            results.append(
                _detection(
                    "DFIR-CORR-004",
                    "Privileged group membership change",
                    "high",
                    80,
                    event,
                    [event],
                    "A security group membership change warrants validation against approved administration activity.",
                )
            )
        elif "admin$" in message:
            results.append(
                _detection(
                    "DFIR-CORR-005",
                    "Administrative share access",
                    "medium",
                    65,
                    event,
                    [event],
                    "Administrative share access can be consistent with lateral movement.",
                )
            )

    # Avoid duplicate UI cards when multiple parsers describe the same artifact.
    unique: dict[tuple[str, str, str | None], dict[str, Any]] = {}
    for result in results:
        key = (result["rule_id"], result["host"], result["event_time"])
        unique.setdefault(key, result)
    return sorted(unique.values(), key=lambda item: (-item["confidence"], item["event_time"] or ""))
