"""
IOC matching service.

Loads all IOCIndicator records, scans the incident timeline JSONL for values
matching known bad IPs, domains, hashes, and URLs, then stores IOCMatch records.
"""
from __future__ import annotations

import ipaddress
import json
import logging
import re
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Regex patterns for extracting observable values from free-text event fields
_IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_DOMAIN_RE = re.compile(
    r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)"
    r"+(?:com|net|org|io|gov|edu|mil|biz|info|ru|cn|de|uk|fr|nl|br|jp|kr|au|ca|ch|se|no|fi|dk)\b",
    re.IGNORECASE,
)
_HASH_RE = re.compile(r"\b[0-9a-fA-F]{32}\b|\b[0-9a-fA-F]{40}\b|\b[0-9a-fA-F]{64}\b")


def _is_private_ip(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


def _extract_observables(event: dict) -> dict[str, list[tuple[str, str]]]:
    """
    Extract observable values from a timeline event dict.
    Returns {ioc_type: [(field_name, value), ...]}
    """
    observables: dict[str, list[tuple[str, str]]] = {"ip": [], "domain": [], "sha256": [], "md5": [], "sha1": []}

    for field, val in event.items():
        if not isinstance(val, str) or not val:
            continue
        # IPs
        for ip in _IP_RE.findall(val):
            if not _is_private_ip(ip):
                observables["ip"].append((field, ip))
        # Domains
        for domain in _DOMAIN_RE.findall(val):
            observables["domain"].append((field, domain.lower()))
        # Hashes by length
        for h in _HASH_RE.findall(val):
            h_lower = h.lower()
            if len(h) == 64:
                observables["sha256"].append((field, h_lower))
            elif len(h) == 40:
                observables["sha1"].append((field, h_lower))
            elif len(h) == 32:
                observables["md5"].append((field, h_lower))

    return observables


async def run_ioc_matching(
    incident_id: str,
    processing_job_id: str,
    timeline_dir: Path,
    db: AsyncSession,
) -> int:
    """
    Scan timeline.jsonl against known IOC indicators.
    Returns number of matches stored.
    """
    from app.models.analytics import IOCIndicator, IOCMatch
    from sqlalchemy import delete, select

    timeline_path = timeline_dir / "timeline.jsonl"
    if not timeline_path.exists():
        logger.info("No timeline.jsonl for incident %s — skipping IOC matching", incident_id)
        return 0

    # Load all indicators into memory (small table, fast path)
    result = await db.execute(select(IOCIndicator))
    indicators = result.scalars().all()
    if not indicators:
        logger.info("No IOC indicators configured — skipping IOC matching")
        return 0

    # Build lookup: {(ioc_type, normalized_value): IOCIndicator}
    indicator_map: dict[tuple[str, str], IOCIndicator] = {}
    for ind in indicators:
        key = (ind.ioc_type.lower(), ind.value.lower())
        indicator_map[key] = ind

    # Clear previous matches for this processing job
    await db.execute(
        delete(IOCMatch).where(IOCMatch.processing_job_id == processing_job_id)
    )

    matches: list[IOCMatch] = []
    matched_keys: set[str] = set()  # deduplicate per (indicator_id, field, value)

    try:
        with timeline_path.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if not isinstance(event, dict):
                    continue

                observables = _extract_observables(event)

                for ioc_type, field_values in observables.items():
                    for field_name, value in field_values:
                        indicator = indicator_map.get((ioc_type, value))
                        if not indicator:
                            continue

                        dedup_key = f"{indicator.id}:{field_name}:{value}"
                        if dedup_key in matched_keys:
                            continue
                        matched_keys.add(dedup_key)

                        # Parse event timestamp
                        ts_raw = event.get("datetime") or event.get("timestamp") or ""
                        event_ts: datetime | None = None
                        if ts_raw:
                            try:
                                ts_str = str(ts_raw).replace("Z", "+00:00")
                                event_ts = datetime.fromisoformat(ts_str)
                            except (ValueError, TypeError):
                                pass

                        matches.append(
                            IOCMatch(
                                id=str(uuid.uuid4()),
                                incident_id=incident_id,
                                processing_job_id=processing_job_id,
                                indicator_id=indicator.id,
                                ioc_type=ioc_type,
                                ioc_value=value,
                                matched_field=field_name,
                                matched_value=value,
                                event_source=event.get("source_short") or event.get("source"),
                                event_timestamp=event_ts,
                                event_data={k: v for k, v in event.items() if k != "event_data"},
                                severity=indicator.severity,
                            )
                        )

    except OSError as exc:
        logger.error("Failed to read timeline for IOC matching: %s", exc)
        return 0

    if matches:
        db.add_all(matches)
        await db.flush()

    logger.info(
        "IOC matching complete for incident %s: %d matches from %d indicators",
        incident_id, len(matches), len(indicators),
    )
    return len(matches)
