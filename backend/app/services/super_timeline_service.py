"""
Super Timeline Service — merge per-host timelines into a single cross-host DuckDB store
and run lightweight lateral movement detection.

Architecture:
  - Called by Celery task with incident_id and evidence_base_path
  - Finds all DONE ProcessingJobs for the incident
  - For each job: loads timeline.jsonl, stamps with host/job_id
  - Merges into a single DuckDB store at {incident_dir}/super_timeline.duckdb
  - Runs lateral movement detection using simple heuristics on the merged data
  - Stores SuperTimeline + LateralMovement records in PostgreSQL
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

# ── helpers ────────────────────────────────────────────────────────────────────


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    """Read a JSONL file and return a list of parsed objects (skip malformed lines).

    Args:
        path: Path to the ``.jsonl`` file.

    Returns:
        List of parsed event dicts; malformed lines are silently skipped.
    """
    events: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return events


def _extract_dt(event: dict[str, Any]) -> datetime | None:
    """Parse the datetime field from a timeline event.

    Tries common ISO-8601 formats and falls back to ``python-dateutil`` if
    installed.

    Args:
        event: A single timeline event dict.

    Returns:
        A timezone-aware ``datetime`` object, or ``None`` if unparseable.
    """
    raw = event.get("datetime") or event.get("timestamp") or ""
    if not raw:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            pass
    try:
        from dateutil import parser as dtparse  # type: ignore

        dt = dtparse.parse(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass
    return None


# ── DuckDB merge ───────────────────────────────────────────────────────────────


def _build_duckdb_store(duckdb_path: Path, all_events: list[dict[str, Any]]) -> int:
    """Write merged events into a persistent DuckDB file using pandas for bulk insert.

    Args:
        duckdb_path: Destination path for the DuckDB database file.
        all_events: Merged, host-stamped timeline events.

    Returns:
        Number of rows written.

    Raises:
        ImportError: If ``pandas`` is not installed (caller should fall back).
    """
    import duckdb  # optional, checked by caller

    duckdb_path.parent.mkdir(parents=True, exist_ok=True)
    if duckdb_path.exists():
        duckdb_path.unlink()  # start fresh on rebuild

    con = duckdb.connect(str(duckdb_path))
    try:
        con.execute("""
            CREATE TABLE timeline_events (
                row_id         BIGINT,
                host           VARCHAR,
                job_id         VARCHAR,
                event_dt       TIMESTAMPTZ,
                message        VARCHAR,
                timestamp_desc VARCHAR,
                source         VARCHAR,
                source_short   VARCHAR,
                incident_id    VARCHAR,
                extra          JSON
            )
        """)
        con.execute("CREATE INDEX idx_st_dt   ON timeline_events(event_dt)")
        con.execute("CREATE INDEX idx_st_host ON timeline_events(host)")
        con.execute("CREATE INDEX idx_st_src  ON timeline_events(source_short)")

        FIXED = {
            "datetime", "timestamp", "message", "timestamp_desc",
            "source", "source_short", "incident_id", "host", "job_id",
        }

        rows = []
        for i, ev in enumerate(all_events):
            extra = {k: v for k, v in ev.items() if k not in FIXED}
            dt = _extract_dt(ev)
            rows.append({
                "row_id": i,
                "host": ev.get("host", "unknown"),
                "job_id": ev.get("job_id", ""),
                "event_dt": dt.isoformat() if dt else None,
                "message": str(ev.get("message", ""))[:2000],
                "timestamp_desc": str(ev.get("timestamp_desc", "")),
                "source": str(ev.get("source", "")),
                "source_short": str(ev.get("source_short", "")),
                "incident_id": str(ev.get("incident_id", "")),
                "extra": json.dumps(extra),
            })

        if rows:
            import pandas as pd  # noqa — optional; fall back if absent

            df = pd.DataFrame(rows)
            con.register("df_tmp", df)
            con.execute("INSERT INTO timeline_events SELECT * FROM df_tmp")
            con.unregister("df_tmp")

        count = con.execute("SELECT COUNT(*) FROM timeline_events").fetchone()[0]
        return count
    finally:
        con.close()


def _build_duckdb_store_no_pandas(
    duckdb_path: Path, all_events: list[dict[str, Any]]
) -> int:
    """Fallback DuckDB writer: insert events row-by-row without pandas.

    Args:
        duckdb_path: Destination path for the DuckDB database file.
        all_events: Merged, host-stamped timeline events.

    Returns:
        Number of rows written.
    """
    import duckdb

    duckdb_path.parent.mkdir(parents=True, exist_ok=True)
    if duckdb_path.exists():
        duckdb_path.unlink()

    con = duckdb.connect(str(duckdb_path))
    try:
        con.execute("""
            CREATE TABLE timeline_events (
                row_id         BIGINT,
                host           VARCHAR,
                job_id         VARCHAR,
                event_dt       TIMESTAMPTZ,
                message        VARCHAR,
                timestamp_desc VARCHAR,
                source         VARCHAR,
                source_short   VARCHAR,
                incident_id    VARCHAR,
                extra          JSON
            )
        """)
        con.execute("CREATE INDEX idx_st_dt   ON timeline_events(event_dt)")
        con.execute("CREATE INDEX idx_st_host ON timeline_events(host)")
        con.execute("CREATE INDEX idx_st_src  ON timeline_events(source_short)")

        FIXED = {
            "datetime", "timestamp", "message", "timestamp_desc",
            "source", "source_short", "incident_id", "host", "job_id",
        }

        for i, ev in enumerate(all_events):
            extra = {k: v for k, v in ev.items() if k not in FIXED}
            dt = _extract_dt(ev)
            con.execute(
                "INSERT INTO timeline_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    i,
                    ev.get("host", "unknown"),
                    ev.get("job_id", ""),
                    dt.isoformat() if dt else None,
                    str(ev.get("message", ""))[:2000],
                    str(ev.get("timestamp_desc", "")),
                    str(ev.get("source", "")),
                    str(ev.get("source_short", "")),
                    str(ev.get("incident_id", "")),
                    json.dumps(extra),
                ],
            )

        count = con.execute("SELECT COUNT(*) FROM timeline_events").fetchone()[0]
        return count
    finally:
        con.close()


def _merge_events_to_duckdb(duckdb_path: Path, all_events: list[dict[str, Any]]) -> int:
    """Merge events to DuckDB, preferring pandas for bulk insert with row-by-row fallback.

    Args:
        duckdb_path: Destination path for the DuckDB database file.
        all_events: Merged, host-stamped timeline events.

    Returns:
        Number of rows written to DuckDB.
    """
    try:
        return _build_duckdb_store(duckdb_path, all_events)
    except ImportError:
        return _build_duckdb_store_no_pandas(duckdb_path, all_events)


# ── Lateral Movement Detection ─────────────────────────────────────────────────


def _detect_lateral_movement(
    all_events: list[dict[str, Any]],
    incident_id: str,
    super_timeline_id: str,
) -> list[dict[str, Any]]:
    """Lightweight lateral movement heuristics on merged events.

    Detection types:

    - ``account_pivot``: same username seen on 2+ distinct hosts (from EVTX
      logon events) within a 6-hour window.
    - ``process_spread``: same process name seen on 2+ hosts within a 15-minute
      window (from Prefetch/Amcache artefacts).

    Args:
        all_events: All merged timeline events across all hosts.
        incident_id: Parent incident identifier (stored on each detection).
        super_timeline_id: Parent SuperTimeline identifier.

    Returns:
        Deduplicated list of detection dicts (capped at 100).
    """
    from collections import defaultdict

    detections: list[dict[str, Any]] = []

    # Index events by host
    host_events: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ev in all_events:
        host_events[ev.get("host", "unknown")].append(ev)

    hosts = list(host_events.keys())
    if len(hosts) < 2:
        return detections  # need at least 2 hosts for lateral movement

    # ── 1. Account pivot: same username on 2+ hosts (EVTX logon events) ──────
    # Map actor → {host → [datetimes]}
    actor_host_times: dict[str, dict[str, list[datetime]]] = defaultdict(
        lambda: defaultdict(list)
    )

    for ev in all_events:
        host = ev.get("host", "unknown")
        src_short = str(ev.get("source_short", "")).upper()
        if src_short not in ("EVTX", "WEVT", "WINDOWS EVENT LOG"):
            continue
        msg = str(ev.get("message", ""))
        # Extract username patterns common in Windows event messages
        for marker in (
            "TargetUserName:",
            "SubjectUserName:",
            "AccountName:",
            "UserName:",
        ):
            idx = msg.find(marker)
            if idx == -1:
                continue
            remainder = msg[idx + len(marker):].lstrip()
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
            dt = _extract_dt(ev)
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
    proc_host_times: dict[str, dict[str, list[datetime]]] = defaultdict(
        lambda: defaultdict(list)
    )

    for ev in all_events:
        host = ev.get("host", "unknown")
        src_short = str(ev.get("source_short", "")).upper()
        if src_short not in ("PREFETCH", "AMCACHE"):
            continue
        msg = str(ev.get("message", "")).lower()
        # Extract executable name from message
        for ext in (".exe", ".dll", ".bat", ".ps1", ".vbs"):
            idx = msg.rfind(ext)
            if idx != -1:
                start = max(0, msg.rfind(" ", 0, idx) + 1)
                proc = msg[start:idx + len(ext)].strip().lstrip("\\").lstrip("/")
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
                dt = _extract_dt(ev)
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


# ── Main background runner ─────────────────────────────────────────────────────


async def build_super_timeline_background(
    incident_id: str,
    evidence_base_path: Path,
) -> None:
    """Background runner: merge all per-host timelines and run lateral movement detection.

    Finds all ``DONE`` ProcessingJobs for the incident, loads each
    ``timeline.jsonl``, stamps events with host/job_id, merges into a single
    DuckDB store, runs lateral movement heuristics, and persists results to
    PostgreSQL.

    Called by the Celery task via ``asyncio.run()``.

    Args:
        incident_id: The incident whose timelines should be merged.
        evidence_base_path: Root directory where evidence folders live
            (``EVIDENCE_STORAGE_PATH``).

    Raises:
        Exception: Re-raises any unexpected error after recording FAILED status.
    """
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
        # ── Collect all per-host timelines ────────────────────────────────────
        all_events: list[dict[str, Any]] = []
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

                logger.info(
                    "SuperTimeline: loading timeline from %s (host=%s)",
                    timeline_path,
                    hostname,
                )
                events = await asyncio.to_thread(_read_jsonl, timeline_path)

                # Stamp each event with host and job_id
                for ev in events:
                    ev["host"] = hostname
                    ev["job_id"] = proc_job.job_id

                all_events.extend(events)
                host_set.add(hostname)
                logger.info(
                    "SuperTimeline: loaded %d events from %s", len(events), hostname
                )

        if not all_events:
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

        # Sort merged events by datetime (None timestamps sort to the front)
        all_events.sort(
            key=lambda ev: (
                _extract_dt(ev) or datetime.min.replace(tzinfo=timezone.utc)
            )
        )

        # ── Build DuckDB store ─────────────────────────────────────────────────
        duckdb_path = evidence_base_path / incident_id / "super_timeline.duckdb"
        logger.info(
            "SuperTimeline: writing %d events to DuckDB at %s",
            len(all_events),
            duckdb_path,
        )
        event_count = await asyncio.to_thread(
            _merge_events_to_duckdb, duckdb_path, all_events
        )

        # ── Lateral movement detection ─────────────────────────────────────────
        logger.info(
            "SuperTimeline: running lateral movement detection (%d events, %d hosts)",
            event_count,
            len(host_set),
        )
        detections = await asyncio.to_thread(
            _detect_lateral_movement, all_events, incident_id, suptl_id
        )
        logger.info(
            "SuperTimeline: found %d lateral movement candidates", len(detections)
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
