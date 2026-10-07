"""
Artifact parsing pipeline: EZ Tools (Phase 1) → Sigma/chainsaw (Phase 2) → Timeline (Phase 3).

Entry points:
  run_pipeline_background()  — creates its own DB session; safe for asyncio.create_task()
  run_parsing_pipeline()     — requires an open DB session; called by trigger endpoint
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.processing import (
    create_processing_job,
    get_processing_job_by_evidence_job_id,
    update_processing_job,
)
from app.models.processing import SigmaHit
from app.services.timesketch_export_service import export_to_jsonl

logger = logging.getLogger(__name__)

_SUBPROCESS_TIMEOUT = 600  # 10 minutes per tool


# ── Processing log helper — writes to collection_logs so the frontend sees it ─


async def _pipeline_log(
    db: AsyncSession,
    incident_id: str,
    message: str,
    level: str = "info",
) -> None:
    """Persist a pipeline progress message to collection_logs."""
    from app.crud.collection_log import create_log_entries, get_last_sequence

    try:
        seq = await get_last_sequence(db, incident_id) + 1
        await create_log_entries(db, incident_id, seq, [{"level": level, "message": message}])
        await db.flush()
    except Exception as exc:
        logger.debug("_pipeline_log flush failed (non-fatal): %s", exc)


# ── Phase checkpoint helpers ──────────────────────────────────────────────────


def _phase_marker(base_path: Path, phase: int) -> Path:
    return base_path / f".phase{phase}_done"


def _phase_is_done(base_path: Path, phase: int) -> bool:
    return _phase_marker(base_path, phase).exists()


def _mark_phase_done(base_path: Path, phase: int) -> None:
    try:
        _phase_marker(base_path, phase).write_text(datetime.now(timezone.utc).isoformat())
    except OSError as exc:
        logger.warning("Failed to write phase marker %d: %s", phase, exc)


def _clear_phase_markers(base_path: Path) -> None:
    for phase in range(1, 4):
        marker = _phase_marker(base_path, phase)
        if marker.exists():
            try:
                marker.unlink()
            except OSError as exc:
                logger.warning("Failed to remove phase marker %d: %s", phase, exc)


# EZ Tools DLL paths
_EZ_TOOLS_DLLS: dict[str, str] = {
    "EvtxECmd": "EvtxECmd/EvtxECmd.dll",
    "MFTECmd": "MFTECmd/MFTECmd.dll",
    "RECmd": "RECmd/RECmd.dll",
    "PECmd": "PECmd/PECmd.dll",
    "LECmd": "LECmd/LECmd.dll",
    "WxTCmd": "WxTCmd/WxTCmd.dll",
    "AmcacheParser": "AmcacheParser/AmcacheParser.dll",
    "SrumECmd": "SrumECmd/SrumECmd.dll",
    "AppCompatCacheParser": "AppCompatCacheParser/AppCompatCacheParser.dll",
    "SBECmd": "SBECmd/SBECmd.dll",
    "JLECmd": "JLECmd/JLECmd.dll",
    "RBCmd": "RBCmd/RBCmd.dll",
    "SQLECmd": "SQLECmd/SQLECmd.dll",
}


# ── Subprocess helper ──────────────────────────────────────────────────────────


async def _run_subprocess(
    cmd: list[str], *, capture_stdout: bool = False, cwd: str | None = None
) -> tuple[bool, str]:
    """Run a command asynchronously. Returns (success, stderr_snippet)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE if capture_stdout else asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=_SUBPROCESS_TIMEOUT)
        except asyncio.CancelledError:
            proc.kill()
            await proc.communicate()
            raise
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return False, f"Timeout after {_SUBPROCESS_TIMEOUT}s"
        output = stdout if capture_stdout and proc.returncode == 0 else stderr
        return (
            proc.returncode == 0,
            (output or b"").decode(errors="replace")[: 32000 if capture_stdout else 500],
        )
    except FileNotFoundError:
        return False, f"Binary not found: {cmd[0]}"
    except Exception as exc:
        return False, str(exc)[:500]


def _tool_dll(tool_name: str, ez_tools_path: str) -> Path | None:
    """Return Path to EZ Tool DLL if it exists, else None."""
    if not ez_tools_path:
        return None
    rel = _EZ_TOOLS_DLLS.get(tool_name)
    if not rel:
        return None
    dll = Path(ez_tools_path) / rel
    return dll if dll.exists() else None


# ── Single-pass discovery ──────────────────────────────────────────────────────


class ArtifactCache:
    """Cache of discovered files to avoid multiple filesystem walks."""

    def __init__(self, root: Path):
        self.root = root
        self.files_by_ext: dict[str, list[Path]] = defaultdict(list)
        self.files_by_name: dict[str, list[Path]] = defaultdict(list)
        self._populated = False

    def populate(self):
        if self._populated:
            return
        for p in self.root.rglob("*"):
            if p.is_file():
                self.files_by_ext[p.suffix.lower()].append(p)
                self.files_by_name[p.name.upper()].append(p)
        self._populated = True

    def get_by_ext(self, ext: str) -> list[Path]:
        self.populate()
        return self.files_by_ext.get(ext.lower(), [])

    def get_by_name(self, name: str) -> list[Path]:
        self.populate()
        return self.files_by_name.get(name.upper(), [])


# ── Phase 1: EZ Tools parsing ─────────────────────────────────────────────────


async def _run_parsing_phase(
    extracted_dir: Path, parsed_dir: Path, ez_tools_path: str, cache: ArtifactCache
) -> dict[str, int]:
    """Run every input in an isolated output directory with explicit coverage."""
    from app.services.parser_execution import execute_parsers

    return await execute_parsers(
        extracted_dir, parsed_dir, ez_tools_path, cache, _tool_dll, _run_subprocess
    )


async def _run_hayabusa(extracted_dir: Path, sigma_dir: Path, hayabusa_path: str) -> list[dict]:
    from app.services.sigma_adapters import hayabusa

    return await hayabusa(extracted_dir, sigma_dir, hayabusa_path, _run_subprocess)


async def _run_chainsaw(
    extracted_dir: Path, sigma_dir: Path, chainsaw_path: str, sigma_rules_path: str
) -> list[dict]:
    from app.services.sigma_adapters import chainsaw

    return await chainsaw(
        extracted_dir, sigma_dir, chainsaw_path, sigma_rules_path, _run_subprocess
    )


async def _run_sigma_phase(
    extracted_dir: Path,
    sigma_dir: Path,
    chainsaw_path: str,
    sigma_rules_path: str,
    hayabusa_path: str,
    incident_id: str,
    proc_job_id: str,
    db: AsyncSession,
    stage_results: dict | None = None,
) -> int:
    from sqlalchemy import delete

    reports = stage_results if stage_results is not None else {}
    sigma_dir.mkdir(parents=True, exist_ok=True)
    has_evtx = bool(ArtifactCache(extracted_dir).get_by_ext(".evtx"))
    all_hits = []
    for name, executable, run in (
        (
            "chainsaw",
            chainsaw_path,
            lambda: _run_chainsaw(extracted_dir, sigma_dir, chainsaw_path, sigma_rules_path),
        ),
        ("hayabusa", hayabusa_path, lambda: _run_hayabusa(extracted_dir, sigma_dir, hayabusa_path)),
    ):
        key = f"sigma:{name}"
        if not has_evtx:
            reports[key] = {"status": "SKIPPED", "reason": "No EVTX artifacts"}
        elif (
            not executable
            or not Path(executable).is_file()
            or (name == "chainsaw" and not sigma_rules_path)
        ):
            reports[key] = {
                "status": "NOT_CONFIGURED",
                "reason": "Detector binary or rules unavailable",
            }
        else:
            try:
                hits = await run()
                all_hits.extend(hits)
                reports[key] = {"status": "SUCCESS", "matches": len(hits)}
            except Exception as exc:
                reports[key] = {"status": "FAILED", "reason": str(exc)[:500]}
    await db.execute(delete(SigmaHit).where(SigmaHit.processing_job_id == proc_job_id))
    (sigma_dir / "chainsaw_hits.json").write_text(json.dumps(all_hits, indent=2), encoding="utf-8")
    return await _store_sigma_hits(all_hits, incident_id, proc_job_id, db)


async def _store_sigma_hits(
    hits: list[dict], incident_id: str, proc_job_id: str, db: AsyncSession
) -> int:
    records: list[SigmaHit] = []
    for hit in hits:
        try:
            rule_name = hit.get("name") or hit.get("rule") or "Unknown"
            severity = (hit.get("level") or hit.get("severity") or "informational").lower()
            doc = hit.get("document") or hit.get("event") or {}
            ts_raw = hit.get("timestamp") or ""
            event_ts = None
            if ts_raw:
                try:
                    event_ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                except Exception:
                    pass

            records.append(
                SigmaHit(
                    id=str(uuid.uuid4()),
                    incident_id=incident_id,
                    processing_job_id=proc_job_id,
                    rule_id=hit.get("rule_id") or str(uuid.uuid4()),
                    rule_name=rule_name,
                    rule_tags=hit.get("tags") or [],
                    severity=severity,
                    description=hit.get("description") or rule_name,
                    artifact_file=(
                        hit.get("source", {}).get("name", "")
                        if isinstance(hit.get("source"), dict)
                        else ""
                    ),
                    event_timestamp=event_ts,
                    event_record_id=str(doc.get("EventRecordId", "")) or None,
                    event_data=doc if isinstance(doc, dict) else {"raw": str(doc)},
                )
            )
        except Exception:
            pass
    if records:
        db.add_all(records)
        await db.flush()
    return len(records)


# ── Main pipeline ─────────────────────────────────────────────────────────────


async def run_parsing_pipeline(
    incident_id: str, job_id: str, base_path: Path, db: AsyncSession, *, force: bool = False
) -> str:
    from app.services.workspace_lock import WorkspaceLock

    # OS locks are released on worker death, unlike stale RUNNING flags.
    with WorkspaceLock(base_path / ".pipeline.lock"):
        return await _run_parsing_pipeline_locked(incident_id, job_id, base_path, db, force=force)


async def _run_parsing_pipeline_locked(
    incident_id: str, job_id: str, base_path: Path, db: AsyncSession, *, force: bool = False
) -> str:
    from sqlalchemy import func, select

    from app.models.analytics import IOCIndicator
    from app.services.attack_chain_service import build_attack_chains
    from app.services.ioc_service import run_ioc_matching
    from app.services.system_settings_service import get_runtime_settings
    from app.services.yara_service import run_yara_scan

    existing = await get_processing_job_by_evidence_job_id(db, job_id)
    if existing and existing.status in ("DONE", "PARTIAL") and not force:
        return existing.id
    proc_job_id = existing.id if existing else f"proc-{job_id}"
    if not existing:
        existing = await create_processing_job(db, proc_job_id, incident_id, job_id)
    reports = {} if force else dict(existing.stage_results or {})
    reports.pop("failure", None)
    existing.error_message = None
    existing.completed_at = None
    await update_processing_job(
        db,
        proc_job_id,
        status="RUNNING",
        phase="parsing",
        started_at=datetime.now(timezone.utc),
        stage_results=reports,
    )
    await db.commit()

    async def persist(phase):
        await update_processing_job(db, proc_job_id, phase=phase, stage_results=dict(reports))
        await db.commit()

    try:
        # Preparation failures must also leave a terminal, actionable status.
        if not (base_path / "extracted").is_dir():
            raise RuntimeError("Extracted evidence is unavailable; finish upload before processing")
        if force:
            # Archive only derived outputs; collected evidence is never modified.
            archive = base_path / "derived-history" / uuid.uuid4().hex
            archive.mkdir(parents=True, exist_ok=True)
            for name in ("parsed", "sigma", "timeline"):
                source = base_path / name
                if source.exists():
                    source.rename(archive / name)
            _clear_phase_markers(base_path)
        settings = await get_runtime_settings(db)
        extracted_dir, parsed_dir = base_path / "extracted", base_path / "parsed"
        sigma_dir, timeline_dir = base_path / "sigma", base_path / "timeline"
        cache = ArtifactCache(extracted_dir)
        await _pipeline_log(db, incident_id, "Artifact parsing started")
        stats = await _run_parsing_phase(
            extracted_dir, parsed_dir, settings.ez_tools_path or "", cache
        )
        reports.update(getattr(stats, "stages", {}))
        await persist("sigma")
        _mark_phase_done(base_path, 1)

        await _run_sigma_phase(
            extracted_dir,
            sigma_dir,
            settings.chainsaw_path or "",
            settings.sigma_rules_path or "",
            settings.hayabusa_path or "",
            incident_id,
            proc_job_id,
            db,
            reports,
        )
        await persist("timeline")
        _mark_phase_done(base_path, 2)

        entries = await export_to_jsonl(parsed_dir, sigma_dir, timeline_dir, incident_id)
        reports["timeline"] = {"status": "SUCCESS", "events": entries}
        await persist("analytics")
        _mark_phase_done(base_path, 3)

        if settings.yara_rules_path:
            yara_report = {}
            matches = await run_yara_scan(
                incident_id,
                proc_job_id,
                extracted_dir,
                settings.yara_rules_path,
                db,
                report=yara_report,
            )
            reports["analytics:yara"] = {**yara_report, "matches": matches}
        else:
            reports["analytics:yara"] = {
                "status": "NOT_CONFIGURED",
                "reason": "YARA rules not configured",
            }
        await persist("analytics")
        indicator_count = (
            await db.execute(select(func.count()).select_from(IOCIndicator))
        ).scalar_one()
        if indicator_count:
            matches = await run_ioc_matching(incident_id, proc_job_id, timeline_dir, db)
            reports["analytics:ioc"] = {
                "status": "SUCCESS",
                "matches": matches,
                "indicators": indicator_count,
            }
        else:
            reports["analytics:ioc"] = {"status": "NOT_CONFIGURED", "reason": "No IOC indicators"}
        chains = await build_attack_chains(incident_id, proc_job_id, db)
        reports["analytics:attack_chains"] = {"status": "SUCCESS", "chains": chains}
        await persist("analytics")

        failed = [name for name, result in reports.items() if result.get("status") == "FAILED"]
        if failed:
            raise RuntimeError("Failed stages: " + ", ".join(failed))
        partial = any(
            result.get("status") in {"NOT_CONFIGURED", "PARTIAL"} for result in reports.values()
        )
        await update_processing_job(
            db,
            proc_job_id,
            status="PARTIAL" if partial else "DONE",
            phase="analytics",
            completed_at=datetime.now(timezone.utc),
            stage_results=reports,
        )
        await _pipeline_log(
            db,
            incident_id,
            (
                "Processing completed with coverage warnings"
                if partial
                else "All configured processing stages completed"
            ),
            "warning" if partial else "success",
        )
        await db.commit()

        # Automatic super timeline chaining if configured
        try:
            from app.crud.system_settings import get_runtime_settings
            from app.crud.super_timeline import create_super_timeline, get_super_timeline_by_incident
            from app.services.super_timeline_service import dispatch_super_timeline

            runtime = await get_runtime_settings(db)
            if getattr(runtime, "auto_process", True):
                st = await get_super_timeline_by_incident(db, incident_id)
                if not st:
                    st = await create_super_timeline(db, incident_id)
                st.status = "PENDING"
                st.error_message = None
                await db.commit()
                dispatch_super_timeline(incident_id, base_path)
                logger.info("Auto-dispatched super timeline build for incident %s", incident_id)
        except Exception as st_err:
            logger.warning("Could not auto-dispatch super timeline for %s: %s", incident_id, st_err)

        return proc_job_id
    except Exception as exc:
        logger.exception("Pipeline failed for %s", job_id)
        await db.rollback()
        reports["failure"] = {"status": "FAILED", "reason": str(exc)[:500]}
        await update_processing_job(
            db,
            proc_job_id,
            status="FAILED",
            error_message=str(exc)[:500],
            completed_at=datetime.now(timezone.utc),
            stage_results=reports,
        )
        await db.commit()
        raise


async def run_pipeline_background(
    incident_id: str, job_id: str, base_path: Path, *, force: bool = False
) -> None:
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await run_parsing_pipeline(incident_id, job_id, base_path, db, force=force)


def dispatch_pipeline(
    incident_id: str, job_id: str, base_path: Path, *, force: bool = False
) -> None:
    from app.worker import run_pipeline_task

    # A broker failure is surfaced to the caller; do not silently move durable
    # forensic work into an untracked web-process background task.
    run_pipeline_task.delay(incident_id, job_id, str(base_path), force=force)
