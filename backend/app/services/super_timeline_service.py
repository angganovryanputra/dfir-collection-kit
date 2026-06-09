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
    """High-performance lateral movement detection using pure SQL in DuckDB.

    Detection types:
    - `account_pivot`: same username seen on 2+ distinct hosts within a 6-hour window.
    - `process_spread`: same process name seen on 2+ hosts within a 15-minute window.
    """
    import duckdb

    detections: list[dict[str, Any]] = []

    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        # Check if we have at least 2 distinct hosts
        host_count = con.execute("SELECT COUNT(DISTINCT host) FROM timeline_events").fetchone()[0]
        if host_count < 2:
            return detections

        # ── 1. Account pivot: SQL-based window analysis ───────────────────────
        # This query finds instances where the same actor logs onto different hosts
        # within a 6-hour sliding window.
        pivot_query = """
            WITH evtx_logons AS (
                SELECT 
                    host, 
                    event_dt,
                    COALESCE(
                        regexp_extract(message, '(?:TargetUserName|SubjectUserName|AccountName|UserName):\\s*([^\\s,.;]+)', 1),
                        ''
                    ) as actor
                FROM timeline_events 
                WHERE source_short IN ('EVTX', 'WEVT', 'WINDOWS EVENT LOG')
                  AND actor != ''
                  AND actor NOT IN ('-', 'SYSTEM', 'ANONYMOUS LOGON', 'LOCAL SERVICE', 'NETWORK SERVICE')
                  AND NOT actor ENDS WITH '$'
            ),
            pivots AS (
                SELECT 
                    a1.actor,
                    a1.host as source_host,
                    a2.host as target_host,
                    a1.event_dt as first_seen,
                    a2.event_dt as last_seen
                FROM evtx_logons a1
                JOIN evtx_logons a2 ON a1.actor = a2.actor 
                                    AND a1.host != a2.host
                                    AND a2.event_dt >= a1.event_dt 
                                    AND a2.event_dt <= a1.event_dt + INTERVAL 6 HOUR
            )
            SELECT 
                actor, source_host, target_host, MIN(first_seen), MAX(last_seen), COUNT(*)
            FROM pivots
            GROUP BY actor, source_host, target_host
            LIMIT 100
        """
        
        pivot_results = con.execute(pivot_query).fetchall()
        for actor, src, tgt, first, last, count in pivot_results:
            detections.append({
                "id": str(uuid4()),
                "incident_id": incident_id,
                "super_timeline_id": super_timeline_id,
                "detection_type": "account_pivot",
                "source_host": src,
                "target_host": tgt,
                "actor": actor,
                "first_seen": first,
                "last_seen": last,
                "event_count": count,
                "confidence": 0.75,
                "details": {
                    "marker": "EVTX logon event",
                    "window_hours": 6,
                },
            })

        # ── 2. Process spread: SQL-based window analysis ──────────────────────
        # Find same executable name appearing on multiple hosts in a 15-min window.
        proc_query = """
            WITH procs AS (
                SELECT 
                    host, 
                    event_dt,
                    lower(regexp_extract(message, '([^\\\\/\\s]+\\.(?:exe|dll|bat|ps1|vbs))', 1)) as proc
                FROM timeline_events 
                WHERE source_short IN ('PREFETCH', 'AMCACHE')
                  AND proc != ''
                  AND proc NOT IN (
                    'svchost.exe', 'explorer.exe', 'conhost.exe', 'lsass.exe', 
                    'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe'
                  )
            ),
            spreads AS (
                SELECT 
                    p1.proc,
                    p1.host as source_host,
                    p2.host as target_host,
                    p1.event_dt as first_seen,
                    p2.event_dt as last_seen
                FROM procs p1
                JOIN procs p2 ON p1.proc = p2.proc 
                               AND p1.host != p2.host
                               AND p2.event_dt >= p1.event_dt 
                               AND p2.event_dt <= p1.event_dt + INTERVAL 15 MINUTE
            )
            SELECT 
                proc, source_host, target_host, MIN(first_seen), MAX(last_seen), COUNT(*)
            FROM spreads
            GROUP BY proc, source_host, target_host
            LIMIT 100
        """
        
        proc_results = con.execute(proc_query).fetchall()
        for proc, src, tgt, first, last, count in proc_results:
            detections.append({
                "id": str(uuid4()),
                "incident_id": incident_id,
                "super_timeline_id": super_timeline_id,
                "detection_type": "process_spread",
                "source_host": src,
                "target_host": tgt,
                "actor": proc,
                "first_seen": first,
                "last_seen": last,
                "event_count": count,
                "confidence": 0.65,
                "details": {
                    "process": proc,
                    "window_minutes": 15,
                },
            })

    finally:
        con.close()

    return detections[:100]


# ── Beaconing Detection ────────────────────────────────────────────────────────


def _detect_beaconing(
    duckdb_path: Path,
    incident_id: str,
    super_timeline_id: str,
) -> list[dict[str, Any]]:
    """Detect C2 beaconing using DuckDB for windowing and Python for statistics."""
    import duckdb

    detections: list[dict[str, Any]] = []

    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        # Pre-filter and group network events in SQL to minimize data transfer
        # We look for external IPs only.
        beacon_candidates = con.execute("""
            WITH net_events AS (
                SELECT 
                    host, 
                    event_dt,
                    COALESCE(
                        json_extract_string(extra, '$.DestinationIp'),
                        json_extract_string(extra, '$.dest_ip'),
                        json_extract_string(extra, '$.destination_ip'),
                        json_extract_string(extra, '$.DestIp')
                    ) as dest_ip
                FROM timeline_events
                WHERE source_short IN ('EVTX', 'SYSMON', 'WEVT')
                  AND event_dt IS NOT NULL
            )
            SELECT host, dest_ip, list(event_dt ORDER BY event_dt) as times
            FROM net_events
            WHERE dest_ip IS NOT NULL 
              AND dest_ip != ''
              -- Basic exclusion for private IPs (could be more robust with inet functions)
              AND NOT (dest_ip LIKE '10.%' OR dest_ip LIKE '192.168.%' OR dest_ip LIKE '172.1[6-9].%' OR dest_ip LIKE '172.2[0-9].%' OR dest_ip LIKE '172.3[0-1].%' OR dest_ip = '127.0.0.1')
            GROUP BY host, dest_ip
            HAVING count(*) >= 5
        """).fetchall()
    except Exception as exc:
        logger.warning("Beaconing SQL failed: %s", exc)
        con.close()
        return detections

    for host, dest_ip, times in beacon_candidates:
        if len(times) < 5:
            continue
            
        intervals = [
            (times[i + 1] - times[i]).total_seconds()
            for i in range(len(times) - 1)
        ]
        if not intervals:
            continue
            
        mean_s = statistics.mean(intervals)
        if mean_s < 1.0:
            continue
            
        stdev_s = statistics.stdev(intervals) if len(intervals) > 1 else 0.0
        cv = stdev_s / mean_s if mean_s > 0 else 1.0
        
        if cv < 0.3:
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
                "first_seen": times[0],
                "last_seen": times[-1],
                "event_count": len(times),
                "confidence": confidence,
                "details": {
                    "dest_ip": dest_ip,
                    "mean_interval_seconds": round(mean_s, 1),
                    "coefficient_of_variation": round(cv, 3),
                },
            })

    con.close()
    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections[:50]


# ── Main background runner ─────────────────────────────────────────────────────


async def build_super_timeline_background(
    incident_id: str,
    evidence_base_path: Path,
) -> None:
    """Background runner: merge all per-host timelines and run lateral movement detection."""
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
            
            for proc_job in proc_jobs:
                job_result = await db.execute(select(Job).where(Job.id == proc_job.job_id))
                job = job_result.scalar_one_or_none()
                if not job:
                    continue

                hostname = job.agent_id or proc_job.job_id
                if job.agent_id:
                    dev_result = await db.execute(
                        select(Device).where(Device.id == job.agent_id)
                    )
                    device = dev_result.scalar_one_or_none()
                    if device:
                        hostname = device.hostname

                timeline_path = (
                    evidence_base_path
                    / incident_id
                    / proc_job.job_id
                    / "timeline"
                    / "timeline.jsonl"
                )
                if timeline_path.exists():
                    timeline_sources.append((hostname, proc_job.job_id, timeline_path))
                    host_set.add(hostname)

        if not timeline_sources:
            async with AsyncSessionLocal() as db:
                await update_super_timeline(
                    db,
                    suptl_id,
                    status="FAILED",
                    completed_at=datetime.now(timezone.utc),
                    error_message="No timeline events found",
                )
                await db.commit()
            return

        # ── Build DuckDB store ─────────────────────────────────────────────────
        duckdb_path = evidence_base_path / incident_id / "super_timeline.duckdb"
        
        def _bulk_ingest_duckdb() -> int:
            duckdb_path.parent.mkdir(parents=True, exist_ok=True)
            if duckdb_path.exists():
                duckdb_path.unlink()

            con = duckdb.connect(str(duckdb_path))
            try:
                con.execute("CREATE SEQUENCE row_id_seq")
                con.execute("""
                    CREATE TABLE timeline_events AS 
                    SELECT 
                        nextval('row_id_seq') as row_id,
                        CAST('' AS VARCHAR) as host,
                        CAST('' AS VARCHAR) as job_id,
                        TRY_CAST(COALESCE(json->>'datetime', json->>'timestamp') AS TIMESTAMP) as event_dt,
                        substring(CAST(json->>'message' AS VARCHAR), 1, 2000) as message,
                        json->>'timestamp_desc' as timestamp_desc,
                        json->>'source' as source,
                        json->>'source_short' as source_short,
                        json->>'incident_id' as incident_id,
                        json as extra
                    FROM read_json_objects(?) WHERE 1=0
                """, [str(timeline_sources[0][2])])

                # High-performance bulk ingestion
                for h_name, j_id, tl_path in timeline_sources:
                    con.execute("""
                        INSERT INTO timeline_events
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
                    incident_id, len(host_set), event_count, _wh,
                    getattr(_rt, "webhook_secret", None),
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
