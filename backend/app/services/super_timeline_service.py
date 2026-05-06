"""
Super Timeline Service — merge per-host timelines into a single cross-host DuckDB store
and run lightweight lateral movement detection.

Architecture:
  - Called by Celery task with incident_id and evidence_base_path
  - Finds all DONE ProcessingJobs for the incident
  - For each job: reads timeline.jsonl in bulk via DuckDB
  - Merges into a single DuckDB store at {incident_dir}/super_timeline.duckdb
  - Runs lateral movement detection using simple heuristics via DuckDB queries
  - Stores SuperTimeline + LateralMovement records in PostgreSQL
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import statistics
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)


# ── Lateral Movement Detection ─────────────────────────────────────────────────


def _detect_lateral_movement(
    duckdb_path: Path,
    incident_id: str,
    super_timeline_id: str,
) -> list[dict[str, Any]]:
    """Lightweight lateral movement heuristics on merged events via DuckDB queries.

    Detection types:

    - ``account_pivot``: same username seen on 2+ distinct hosts (from EVTX
      logon events) within a 6-hour window.
    - ``process_spread``: same process name seen on 2+ hosts within a 15-minute
      window (from Prefetch/Amcache artefacts).

    Args:
        duckdb_path: Path to the generated DuckDB database.
        incident_id: Parent incident identifier (stored on each detection).
        super_timeline_id: Parent SuperTimeline identifier.

    Returns:
        Deduplicated list of detection dicts (capped at 100).
    """
    import duckdb
    from collections import defaultdict

    detections: list[dict[str, Any]] = []

    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        # Check if we have at least 2 distinct hosts
        host_count = con.execute("SELECT COUNT(DISTINCT host) FROM timeline_events").fetchone()[0]
        if host_count < 2:
            return detections

        # ── 1. Account pivot: same username on 2+ hosts (EVTX logon events) ──────
        evtx_events = con.execute("""
            SELECT host, event_dt, message 
            FROM timeline_events 
            WHERE source_short IN ('EVTX', 'WEVT', 'WINDOWS EVENT LOG')
        """).fetchall()

        actor_host_times: dict[str, dict[str, list[datetime]]] = defaultdict(
            lambda: defaultdict(list)
        )

        for host, dt, msg in evtx_events:
            msg_str = str(msg or "")
            # Extract username patterns common in Windows event messages
            for marker in (
                "TargetUserName:",
                "SubjectUserName:",
                "AccountName:",
                "UserName:",
            ):
                idx = msg_str.find(marker)
                if idx == -1:
                    continue
                remainder = msg_str[idx + len(marker):].lstrip()
                actor = remainder.split()[0].rstrip(",.;") if remainder.split() else ""
                # Skip built-in accounts and empties
                if not actor or actor in (
                    "-",
                    "SYSTEM",
                    "ANONYMOUS LOGON",
                    "LOCAL SERVICE",
                    "NETWORK SERVICE",
                ):
                    continue
                if actor.endswith("$"):  # skip machine accounts
                    continue
                actor_host_times[actor][host].append(dt or datetime.now(timezone.utc))

        for actor, host_times in actor_host_times.items():
            if len(host_times) < 2:
                continue
            all_host_dts: list[tuple[str, datetime]] = []
            for host, dts in host_times.items():
                for dt in dts:
                    all_host_dts.append((host, dt))
            all_host_dts.sort(key=lambda x: x[1])

            # Find pivot: same actor on different hosts within 6 hours
            for i, (src_host, src_dt) in enumerate(all_host_dts):
                window_end = src_dt + timedelta(hours=6)
                targets = {
                    h
                    for h, dt in all_host_dts[i + 1:]
                    if h != src_host and dt <= window_end
                }
                if not targets:
                    continue
                for tgt_host in targets:
                    tgt_dts = [
                        dt
                        for h, dt in all_host_dts
                        if h == tgt_host and src_dt <= dt <= window_end
                    ]
                    detections.append({
                        "id": str(uuid4()),
                        "incident_id": incident_id,
                        "super_timeline_id": super_timeline_id,
                        "detection_type": "account_pivot",
                        "source_host": src_host,
                        "target_host": tgt_host,
                        "actor": actor,
                        "first_seen": src_dt,
                        "last_seen": max(tgt_dts) if tgt_dts else src_dt,
                        "event_count": len(tgt_dts) + 1,
                        "confidence": 0.75,
                        "details": {
                            "marker": "EVTX logon event",
                            "window_hours": 6,
                            "target_host_events": len(tgt_dts),
                        },
                    })

        # ── 2. Process spread: same process name on 2+ hosts in 15-min window ────
        proc_events = con.execute("""
            SELECT host, event_dt, message 
            FROM timeline_events 
            WHERE source_short IN ('PREFETCH', 'AMCACHE')
        """).fetchall()

        proc_host_times: dict[str, dict[str, list[datetime]]] = defaultdict(
            lambda: defaultdict(list)
        )

        for host, dt, msg in proc_events:
            msg_str = str(msg or "").lower()
            # Extract executable name from message
            for ext in (".exe", ".dll", ".bat", ".ps1", ".vbs"):
                idx = msg_str.rfind(ext)
                if idx != -1:
                    start = max(0, msg_str.rfind(" ", 0, idx) + 1)
                    proc = msg_str[start:idx + len(ext)].strip().lstrip("\\").lstrip("/")
                    # Skip common Windows processes
                    if proc in (
                        "svchost.exe",
                        "explorer.exe",
                        "conhost.exe",
                        "lsass.exe",
                        "csrss.exe",
                        "wininit.exe",
                        "winlogon.exe",
                        "services.exe",
                    ):
                        continue
                    if dt:
                        proc_host_times[proc][host].append(dt)
                    break

        WINDOW = timedelta(minutes=15)
        for proc, host_times in proc_host_times.items():
            if len(host_times) < 2:
                continue
            all_dts: list[tuple[str, datetime]] = sorted(
                [(h, dt) for h, dts in host_times.items() for dt in dts],
                key=lambda x: x[1],
            )
            for i, (src_host, src_dt) in enumerate(all_dts):
                targets = {
                    h
                    for h, dt in all_dts[i + 1:]
                    if h != src_host and dt - src_dt <= WINDOW
                }
                if not targets:
                    continue
                for tgt_host in targets:
                    tgt_dts = [
                        dt
                        for h, dt in all_dts
                        if h == tgt_host and src_dt <= dt <= src_dt + WINDOW
                    ]
                    detections.append({
                        "id": str(uuid4()),
                        "incident_id": incident_id,
                        "super_timeline_id": super_timeline_id,
                        "detection_type": "process_spread",
                        "source_host": src_host,
                        "target_host": tgt_host,
                        "actor": proc,
                        "first_seen": src_dt,
                        "last_seen": max(tgt_dts) if tgt_dts else src_dt,
                        "event_count": len(tgt_dts) + 1,
                        "confidence": 0.65,
                        "details": {
                            "process": proc,
                            "window_minutes": 15,
                        },
                    })
    finally:
        con.close()

    # Deduplicate: keep highest-confidence detection per (src_host, tgt_host, actor, type)
    seen: set[tuple[str, str, str | None, str]] = set()
    deduped: list[dict[str, Any]] = []
    for det in sorted(detections, key=lambda d: d["confidence"], reverse=True):
        key = (
            det["source_host"],
            det["target_host"],
            det.get("actor"),
            det["detection_type"],
        )
        if key not in seen:
            seen.add(key)
            deduped.append(det)

    return deduped[:100]  # cap at 100 detections


# ── Beaconing Detection ────────────────────────────────────────────────────────


def _detect_beaconing(
    duckdb_path: Path,
    incident_id: str,
    super_timeline_id: str,
) -> list[dict[str, Any]]:
    """Detect C2 beaconing: same external IP contacted at regular intervals from the same host.

    Algorithm (DuckDB-based):
    - Query EVTX/SYSMON events with extractable DestinationIp in the extra JSON
    - Group by (host, dest_ip) — skip RFC-1918 / private addresses
    - For groups with ≥ 5 connections, compute inter-connection intervals
    - Accept groups where coefficient of variation (stdev/mean) < 0.3 (regular pattern)
    - Confidence scales with regularity and connection count

    Args:
        duckdb_path: Path to the merged DuckDB database.
        incident_id: Parent incident identifier.
        super_timeline_id: Parent SuperTimeline identifier.

    Returns:
        Beaconing detection dicts sorted by confidence, capped at 50.
    """
    import duckdb

    detections: list[dict[str, Any]] = []

    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        # Pull network events with their timestamps
        rows = con.execute("""
            SELECT host, event_dt,
                   json_extract_string(extra, '$.DestinationIp')  AS dest_ip1,
                   json_extract_string(extra, '$.dest_ip')         AS dest_ip2,
                   json_extract_string(extra, '$.destination_ip')  AS dest_ip3,
                   json_extract_string(extra, '$.DestIp')          AS dest_ip4
            FROM timeline_events
            WHERE source_short IN ('EVTX', 'SYSMON', 'WEVT')
              AND event_dt IS NOT NULL
            ORDER BY host, event_dt
        """).fetchall()
    except Exception:
        con.close()
        return detections

    # Build (host, dest_ip) → sorted list of datetimes
    from collections import defaultdict

    host_ip_times: dict[tuple[str, str], list[datetime]] = defaultdict(list)

    for row in rows:
        host, dt, *ip_candidates = row
        dest_ip: str | None = None
        for candidate in ip_candidates:
            if candidate and candidate.strip():
                dest_ip = candidate.strip()
                break
        if not dest_ip:
            continue
        # Skip private / link-local / loopback
        try:
            addr = ipaddress.ip_address(dest_ip)
            if addr.is_private or addr.is_loopback or addr.is_link_local:
                continue
        except ValueError:
            continue
        if isinstance(dt, datetime):
            event_dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        else:
            try:
                event_dt = datetime.fromisoformat(str(dt)).replace(tzinfo=timezone.utc)
            except Exception:
                continue
        host_ip_times[(str(host), dest_ip)].append(event_dt)

    con.close()

    _MIN_CONNS = 5
    for (host, dest_ip), times in host_ip_times.items():
        if len(times) < _MIN_CONNS:
            continue
        sorted_times = sorted(times)
        intervals = [
            (sorted_times[i + 1] - sorted_times[i]).total_seconds()
            for i in range(len(sorted_times) - 1)
        ]
        if not intervals:
            continue
        mean_s = statistics.mean(intervals)
        if mean_s < 1.0:
            continue
        stdev_s = statistics.stdev(intervals) if len(intervals) > 1 else 0.0
        cv = stdev_s / mean_s if mean_s > 0 else 1.0
        if cv >= 0.3:
            continue
        confidence = round(
            min(0.95, 0.65 + (0.3 - cv) / 0.3 * 0.20 + min(len(times), 30) / 300), 2
        )
        detections.append({
            "id": str(uuid4()),
            "incident_id": incident_id,
            "super_timeline_id": super_timeline_id,
            "detection_type": "beaconing",
            "source_host": host,
            "target_host": dest_ip,
            "actor": dest_ip,
            "first_seen": sorted_times[0],
            "last_seen": sorted_times[-1],
            "event_count": len(times),
            "confidence": confidence,
            "details": {
                "dest_ip": dest_ip,
                "mean_interval_seconds": round(mean_s, 1),
                "interval_minutes": round(mean_s / 60, 2),
                "coefficient_of_variation": round(cv, 3),
                "connection_count": len(times),
            },
        })

    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections[:50]


# ── Main background runner ─────────────────────────────────────────────────────


async def build_super_timeline_background(
    incident_id: str,
    evidence_base_path: Path,
) -> None:
    """Background runner: merge all per-host timelines and run lateral movement detection.

    Finds all ``DONE`` ProcessingJobs for the incident, loads each
    ``timeline.jsonl``, stamps events with host/job_id, merges into a single
    DuckDB store via high-performance JSONL bulk loading, runs lateral movement heuristics, 
    and persists results to PostgreSQL.

    Called by the Celery task via ``asyncio.run()``.

    Args:
        incident_id: The incident whose timelines should be merged.
        evidence_base_path: Root directory where evidence folders live
            (``EVIDENCE_STORAGE_PATH``).

    Raises:
        Exception: Re-raises any unexpected error after recording FAILED status.
    """
    import duckdb
    from sqlalchemy import select

    from app.crud.super_timeline import (
        create_super_timeline,
        create_lateral_movement,
        delete_lateral_movements_by_super_timeline,
        get_super_timeline_by_incident,
        update_super_timeline,
    )
    from app.db.session import AsyncSessionLocal
    from app.models.device import Device
    from app.models.job import Job
    from app.models.processing import ProcessingJob

    logger.info("SuperTimeline: starting build for incident %s", incident_id)

    async with AsyncSessionLocal() as db:
        # Create or reset SuperTimeline record
        existing = await get_super_timeline_by_incident(db, incident_id)
        if existing:
            suptl_id = existing.id
            await update_super_timeline(
                db,
                suptl_id,
                status="BUILDING",
                started_at=datetime.now(timezone.utc),
                error_message=None,
            )
        else:
            suptl = await create_super_timeline(db, incident_id)
            suptl_id = suptl.id
            await update_super_timeline(
                db, suptl_id, status="BUILDING", started_at=datetime.now(timezone.utc)
            )
        await db.commit()

    try:
        # ── Find all timelines ────────────────────────────────────────────────
        timeline_sources: list[tuple[str, str, Path]] = []
        host_set: set[str] = set()

        async with AsyncSessionLocal() as db:
            # Get all DONE processing jobs for this incident
            result = await db.execute(
                select(ProcessingJob)
                .where(ProcessingJob.incident_id == incident_id)
                .where(ProcessingJob.status == "DONE")
            )
            proc_jobs = list(result.scalars().all())
            logger.info(
                "SuperTimeline: found %d completed jobs for incident %s",
                len(proc_jobs),
                incident_id,
            )

            for proc_job in proc_jobs:
                # Get the evidence job to find the agent
                job_result = await db.execute(select(Job).where(Job.id == proc_job.job_id))
                job = job_result.scalar_one_or_none()
                if not job:
                    continue

                # Get hostname from device; fall back to agent_id then job_id
                hostname = job.agent_id or proc_job.job_id
                if job.agent_id:
                    dev_result = await db.execute(
                        select(Device).where(Device.id == job.agent_id)
                    )
                    device = dev_result.scalar_one_or_none()
                    if device:
                        hostname = device.hostname

                # Find timeline.jsonl produced by the processing pipeline
                timeline_path = (
                    evidence_base_path
                    / incident_id
                    / proc_job.job_id
                    / "timeline"
                    / "timeline.jsonl"
                )
                if not timeline_path.exists():
                    logger.warning(
                        "SuperTimeline: timeline not found at %s", timeline_path
                    )
                    continue
                
                timeline_sources.append((hostname, proc_job.job_id, timeline_path))
                host_set.add(hostname)

        if not timeline_sources:
            async with AsyncSessionLocal() as db:
                await update_super_timeline(
                    db,
                    suptl_id,
                    status="FAILED",
                    completed_at=datetime.now(timezone.utc),
                    error_message=(
                        "No timeline events found — ensure processing pipeline has "
                        "completed for all jobs"
                    ),
                )
                await db.commit()
            return

        # ── Build DuckDB store ─────────────────────────────────────────────────
        duckdb_path = evidence_base_path / incident_id / "super_timeline.duckdb"
        logger.info("SuperTimeline: building DuckDB store at %s", duckdb_path)

        def _bulk_ingest_duckdb() -> int:
            duckdb_path.parent.mkdir(parents=True, exist_ok=True)
            if duckdb_path.exists():
                duckdb_path.unlink()  # start fresh on rebuild

            con = duckdb.connect(str(duckdb_path))
            try:
                con.execute("CREATE SEQUENCE row_id_seq")
                con.execute("""
                    CREATE TABLE timeline_events (
                        row_id         BIGINT,
                        host           VARCHAR,
                        job_id         VARCHAR,
                        event_dt       TIMESTAMP,
                        message        VARCHAR,
                        timestamp_desc VARCHAR,
                        source         VARCHAR,
                        source_short   VARCHAR,
                        incident_id    VARCHAR,
                        extra          JSON
                    )
                """)

                # Ingest each file natively via DuckDB C++ backend
                for h_name, j_id, tl_path in timeline_sources:
                    logger.info("SuperTimeline: ingesting %s (host=%s)", tl_path, h_name)
                    con.execute("""
                        INSERT INTO timeline_events (row_id, host, job_id, event_dt, message, timestamp_desc, source, source_short, incident_id, extra)
                        SELECT 
                            nextval('row_id_seq'),
                            ?,
                            ?,
                            TRY_CAST(COALESCE(json->>'datetime', json->>'timestamp') AS TIMESTAMP),
                            substring(CAST(json->>'message' AS VARCHAR), 1, 2000),
                            json->>'timestamp_desc',
                            json->>'source',
                            json->>'source_short',
                            json->>'incident_id',
                            json
                        FROM read_json_objects(?)
                    """, [h_name, j_id, str(tl_path)])

                # Create indexes after ingestion for speed
                con.execute("CREATE INDEX idx_st_dt   ON timeline_events(event_dt)")
                con.execute("CREATE INDEX idx_st_host ON timeline_events(host)")
                con.execute("CREATE INDEX idx_st_src  ON timeline_events(source_short)")

                return con.execute("SELECT COUNT(*) FROM timeline_events").fetchone()[0]
            finally:
                con.close()

        event_count = await asyncio.to_thread(_bulk_ingest_duckdb)

        # ── Lateral movement + beaconing detection ────────────────────────────
        logger.info(
            "SuperTimeline: running detection passes (%d events, %d hosts)",
            event_count,
            len(host_set),
        )
        lateral_detections = await asyncio.to_thread(
            _detect_lateral_movement, duckdb_path, incident_id, suptl_id
        )
        beaconing_detections = await asyncio.to_thread(
            _detect_beaconing, duckdb_path, incident_id, suptl_id
        )
        detections = lateral_detections + beaconing_detections
        logger.info(
            "SuperTimeline: %d lateral + %d beaconing = %d total detections",
            len(lateral_detections),
            len(beaconing_detections),
            len(detections),
        )

        # ── Persist results ────────────────────────────────────────────────────
        async with AsyncSessionLocal() as db:
            # Clear old detections for this super timeline before re-populating
            await delete_lateral_movements_by_super_timeline(db, suptl_id)

            for det in detections:
                await create_lateral_movement(
                    db,
                    super_timeline_id=suptl_id,
                    incident_id=incident_id,
                    detection_type=det["detection_type"],
                    source_host=det["source_host"],
                    target_host=det["target_host"],
                    actor=det.get("actor"),
                    first_seen=det.get("first_seen"),
                    last_seen=det.get("last_seen"),
                    event_count=det.get("event_count", 0),
                    confidence=det.get("confidence", 0.0),
                    details=det.get("details", {}),
                )

            await update_super_timeline(
                db,
                suptl_id,
                status="DONE",
                host_count=len(host_set),
                event_count=event_count,
                duckdb_path=str(duckdb_path),
                completed_at=datetime.now(timezone.utc),
            )
            await db.commit()

        logger.info(
            "SuperTimeline: completed for incident %s — %d events, %d hosts, %d detections",
            incident_id,
            event_count,
            len(host_set),
            len(detections),
        )

        # ── Webhook notification (best-effort) ────────────────────────────────
        try:
            from app.services.notification_service import notify_super_timeline_complete
            from app.services.system_settings_service import get_runtime_settings

            async with AsyncSessionLocal() as _ndb:
                _rt = await get_runtime_settings(_ndb)
                _wh = getattr(_rt, "webhook_url", None) or ""
            if _wh:
                await notify_super_timeline_complete(
                    incident_id, len(host_set), event_count, _wh
                )
        except Exception as _nex:
            logger.debug("SuperTimeline notification failed (non-fatal): %s", _nex)

    except Exception as exc:
        logger.error(
            "SuperTimeline: failed for incident %s: %s", incident_id, exc, exc_info=True
        )
        async with AsyncSessionLocal() as db:
            await update_super_timeline(
                db,
                suptl_id,
                status="FAILED",
                completed_at=datetime.now(timezone.utc),
                error_message=str(exc)[:1000],
            )
            await db.commit()
        raise


def dispatch_super_timeline(incident_id: str, evidence_base_path: Path) -> None:
    """Queue the super timeline build as a Celery task.

    Args:
        incident_id: The incident to build a super timeline for.
        evidence_base_path: Root evidence storage directory.
    """
    from app.worker import run_super_timeline_task

    run_super_timeline_task.delay(incident_id, str(evidence_base_path))
