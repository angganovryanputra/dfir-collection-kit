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

# EZ Tools DLL paths relative to ez_tools_path root directory
_EZ_TOOLS_DLLS: dict[str, str] = {
    "EvtxECmd": "EvtxECmd/EvtxECmd.dll",
    "MFTECmd": "MFTECmd/MFTECmd.dll",
    "RECmd": "RECmd/RECmd.dll",
    "PECmd": "PECmd/PECmd.dll",
    "LECmd": "LECmd/LECmd.dll",
    "WxTCmd": "WxTCmd/WxTCmd.dll",
    "AmcacheParser": "AmcacheParser/AmcacheParser.dll",
}


# ── Subprocess helper ──────────────────────────────────────────────────────────

async def _run_subprocess(cmd: list[str]) -> tuple[bool, str]:
    """Run a command asynchronously. Returns (success, stderr_snippet)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=_SUBPROCESS_TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return False, f"Timeout after {_SUBPROCESS_TIMEOUT}s"
        return proc.returncode == 0, stderr.decode(errors="replace")[:500]
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


# ── Phase 1: EZ Tools parsing ─────────────────────────────────────────────────

async def _run_parsing_phase(
    extracted_dir: Path, parsed_dir: Path, ez_tools_path: str
) -> dict[str, int]:
    """Scan extracted/ for known artifacts and run matching EZ Tools.
    Returns {tool_name: files_processed}."""
    parsed_dir.mkdir(parents=True, exist_ok=True)
    stats: dict[str, int] = {}

    # EVTX — parallel per-file
    evtx_files = list(extracted_dir.rglob("*.evtx"))
    if evtx_files:
        dll = _tool_dll("EvtxECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "evtx"
            out.mkdir(parents=True, exist_ok=True)

            async def _parse_evtx(f: Path) -> bool:
                cmd = ["dotnet", str(dll), "-f", str(f), "--csv", str(out), "--csvf", f"{f.stem}.csv"]
                ok, err = await _run_subprocess(cmd)
                if not ok:
                    logger.warning("EvtxECmd failed on %s: %s", f.name, err)
                return ok

            results = await asyncio.gather(*[_parse_evtx(f) for f in evtx_files])
            stats["EvtxECmd"] = sum(1 for r in results if r)
        else:
            logger.info("EvtxECmd not found at %s — skipping", ez_tools_path)

    # $MFT — agent saves as "MFT" (ntfs/MFT); also accept legacy "$MFT" name
    mft_files = [f for f in extracted_dir.rglob("*") if f.name in ("MFT", "$MFT") and not f.suffix]
    if mft_files:
        dll = _tool_dll("MFTECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "mft"
            out.mkdir(parents=True, exist_ok=True)
            cmd = ["dotnet", str(dll), "-f", str(mft_files[0]), "--csv", str(out), "--csvf", "mft.csv"]
            ok, err = await _run_subprocess(cmd)
            stats["MFTECmd_mft"] = 1 if ok else 0
            if not ok:
                logger.warning("MFTECmd ($MFT) failed: %s", err)

    # $UsnJrnl:$J — agent saves as "UsnJrnl_$J"; also accept legacy "$J" name
    usnjrnl_files = [f for f in extracted_dir.rglob("*") if f.name in ("UsnJrnl_$J", "$J")]
    if usnjrnl_files:
        dll = _tool_dll("MFTECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "usnjrnl"
            out.mkdir(parents=True, exist_ok=True)
            cmd = ["dotnet", str(dll), "-f", str(usnjrnl_files[0]), "--csv", str(out), "--csvf", "usnjrnl.csv"]
            ok, err = await _run_subprocess(cmd)
            stats["MFTECmd_usnjrnl"] = 1 if ok else 0
            if not ok:
                logger.warning("MFTECmd ($J) failed: %s", err)

    # Amcache.hve (must run before generic *.hve to avoid double-processing)
    amcache_files = list(extracted_dir.rglob("Amcache.hve"))
    if amcache_files:
        dll = _tool_dll("AmcacheParser", ez_tools_path)
        if dll:
            out = parsed_dir / "amcache"
            out.mkdir(parents=True, exist_ok=True)
            cmd = ["dotnet", str(dll), "-f", str(amcache_files[0]), "--csv", str(out), "--csvf", "amcache.csv"]
            ok, err = await _run_subprocess(cmd)
            stats["AmcacheParser"] = 1 if ok else 0
            if not ok:
                logger.warning("AmcacheParser failed: %s", err)

    # Registry hives (*.hve, excluding Amcache.hve) — parallel per-file
    hve_files = [f for f in extracted_dir.rglob("*.hve") if f.name != "Amcache.hve"]
    if hve_files:
        dll = _tool_dll("RECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "registry"
            out.mkdir(parents=True, exist_ok=True)

            async def _parse_hve(f: Path) -> bool:
                cmd = ["dotnet", str(dll), "-f", str(f), "--csv", str(out)]
                ok, err = await _run_subprocess(cmd)
                if not ok:
                    logger.warning("RECmd failed on %s: %s", f.name, err)
                return ok

            hve_results = await asyncio.gather(*[_parse_hve(f) for f in hve_files])
            stats["RECmd"] = sum(1 for r in hve_results if r)

    # Prefetch (*.pf) — pass directory to PECmd
    prefetch_dirs = {f.parent for f in extracted_dir.rglob("*.pf")}
    if prefetch_dirs:
        dll = _tool_dll("PECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "prefetch"
            out.mkdir(parents=True, exist_ok=True)
            for d in prefetch_dirs:
                cmd = ["dotnet", str(dll), "-d", str(d), "--csv", str(out), "--csvf", "prefetch.csv"]
                ok, err = await _run_subprocess(cmd)
                if not ok:
                    logger.warning("PECmd failed on %s: %s", d.name, err)
            stats["PECmd"] = len(prefetch_dirs)

    # LNK files (*.lnk) — pass parent directories to LECmd
    lnk_dirs = {f.parent for f in extracted_dir.rglob("*.lnk")}
    if lnk_dirs:
        dll = _tool_dll("LECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "lnk"
            out.mkdir(parents=True, exist_ok=True)
            for d in lnk_dirs:
                cmd = ["dotnet", str(dll), "-d", str(d), "--csv", str(out), "--csvf", "lnk.csv"]
                ok, err = await _run_subprocess(cmd)
                if not ok:
                    logger.warning("LECmd failed on %s: %s", d.name, err)
            stats["LECmd"] = len(lnk_dirs)

    # Jump lists
    jl_dirs = {f.parent for f in extracted_dir.rglob("*.automaticDestinations-ms")}
    if jl_dirs:
        dll = _tool_dll("WxTCmd", ez_tools_path)
        if dll:
            out = parsed_dir / "jumplists"
            out.mkdir(parents=True, exist_ok=True)
            for d in jl_dirs:
                cmd = ["dotnet", str(dll), "-d", str(d), "--csv", str(out)]
                ok, err = await _run_subprocess(cmd)
                if not ok:
                    logger.warning("WxTCmd failed on %s: %s", d.name, err)
            stats["WxTCmd"] = len(jl_dirs)

    return stats


# ── Phase 2: Sigma detection ───────────────────────────────────────────────────

async def _run_hayabusa(
    extracted_dir: Path,
    sigma_dir: Path,
    hayabusa_path: str,
) -> list[dict]:
    """Run Hayabusa against EVTX files. Returns parsed hits as list of dicts."""
    if not hayabusa_path or not Path(hayabusa_path).exists():
        logger.info("Hayabusa not found at %s — skipping", hayabusa_path)
        return []

    evtx_files = list(extracted_dir.rglob("*.evtx"))
    if not evtx_files:
        return []

    output_json = sigma_dir / f"hayabusa_hits_{uuid.uuid4().hex[:8]}.json"
    # Use one directory that contains all evtx files — pick the deepest common ancestor
    evtx_dir = extracted_dir

    cmd = [
        hayabusa_path, "json-timeline",
        "-d", str(evtx_dir),
        "-o", str(output_json),
        "--no-color",
        "--quiet",
    ]
    ok, err = await _run_subprocess(cmd)

    hits: list[dict] = []
    if output_json.exists():
        try:
            for line in output_json.read_text(encoding="utf-8", errors="replace").splitlines():
                line = line.strip()
                if line:
                    try:
                        hits.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        except OSError as exc:
            logger.warning("Failed to read Hayabusa output: %s", exc)
        finally:
            try:
                output_json.unlink()
            except OSError:
                pass
    elif not ok:
        logger.warning("Hayabusa failed: %s", err)

    logger.info("Hayabusa: %d hits from %s", len(hits), evtx_dir)
    return hits


async def _run_chainsaw(
    extracted_dir: Path,
    sigma_dir: Path,
    chainsaw_path: str,
    sigma_rules_path: str,
) -> list[dict]:
    """Run Chainsaw against EVTX files. Returns parsed hits as list of dicts."""
    if not chainsaw_path or not Path(chainsaw_path).exists():
        logger.info("chainsaw not found at %s — skipping", chainsaw_path)
        return []
    if not sigma_rules_path or not Path(sigma_rules_path).exists():
        logger.info("Sigma rules not found at %s — skipping", sigma_rules_path)
        return []

    evtx_files = list(extracted_dir.rglob("*.evtx"))
    if not evtx_files:
        return []

    # Resolve rules directory
    rules_dir = Path(sigma_rules_path) / "rules" / "windows"
    if not rules_dir.exists():
        rules_dir = Path(sigma_rules_path)

    mapping_candidates = [
        Path(sigma_rules_path) / "tools" / "chainsaw" / "sigma-event-logs-all.yml",
        Path(sigma_rules_path) / "sigma-event-logs-all.yml",
        Path(chainsaw_path).parent / "mappings" / "sigma-event-logs-all.yml",
    ]
    mapping_file = next((m for m in mapping_candidates if m.exists()), None)

    all_hits: list[dict] = []
    evtx_parent_dirs = list({f.parent for f in evtx_files})

    for evtx_dir in evtx_parent_dirs:
        tmp_hits_path = sigma_dir / f"tmp_chainsaw_{evtx_dir.name}_{uuid.uuid4().hex[:8]}.json"
        cmd = [
            chainsaw_path, "hunt", str(evtx_dir),
            "--sigma", str(rules_dir),
            "--json",
            "--output", str(tmp_hits_path),
        ]
        if mapping_file:
            cmd.extend(["--mapping", str(mapping_file)])

        ok, err = await _run_subprocess(cmd)
        if tmp_hits_path.exists():
            try:
                content = json.loads(tmp_hits_path.read_text())
                if isinstance(content, list):
                    all_hits.extend(content)
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Failed to parse chainsaw output for %s: %s", evtx_dir, exc)
            finally:
                try:
                    tmp_hits_path.unlink()
                except OSError:
                    pass
        elif not ok:
            logger.warning("chainsaw failed for %s: %s", evtx_dir.name, err)

    logger.info("Chainsaw: %d hits from %d dirs", len(all_hits), len(evtx_parent_dirs))
    return all_hits


async def _run_sigma_phase(
    extracted_dir: Path,
    sigma_dir: Path,
    chainsaw_path: str,
    sigma_rules_path: str,
    hayabusa_path: str,
    incident_id: str,
    processing_job_id: str,
    db: AsyncSession,
) -> int:
    """Run Hayabusa + Chainsaw against EVTX files. Returns total hits stored."""
    evtx_files = list(extracted_dir.rglob("*.evtx"))
    if not evtx_files:
        logger.info("No EVTX files found — skipping sigma phase")
        return 0

    sigma_dir.mkdir(parents=True, exist_ok=True)

    # Run both tools concurrently
    chainsaw_hits, hayabusa_hits = await asyncio.gather(
        _run_chainsaw(extracted_dir, sigma_dir, chainsaw_path, sigma_rules_path),
        _run_hayabusa(extracted_dir, sigma_dir, hayabusa_path),
    )

    # Merge hits, deduplicate by (rule_name, event_record_id) if possible
    all_hits = chainsaw_hits + hayabusa_hits
    if not all_hits:
        return 0

    # Write combined hits file for timeline export
    combined_path = sigma_dir / "chainsaw_hits.json"
    combined_path.write_text(json.dumps(all_hits, indent=2))

    return await _store_sigma_hits(all_hits, incident_id, processing_job_id, db)


async def _store_sigma_hits(
    hits: list[dict],
    incident_id: str,
    processing_job_id: str,
    db: AsyncSession,
) -> int:
    """Parse chainsaw hit dicts and store SigmaHit records. Returns count."""
    records: list[SigmaHit] = []
    for hit in hits:
        try:
            rule_name = hit.get("name") or hit.get("rule") or "Unknown"
            severity = (hit.get("level") or hit.get("severity") or "informational").lower()
            tags = hit.get("tags") or []
            if not isinstance(tags, list):
                tags = [str(tags)]
            description = hit.get("description") or rule_name
            rule_id = hit.get("hunt_id") or hit.get("rule_id") or str(uuid.uuid4())
            doc = hit.get("document") or hit.get("event") or {}

            artifact_file = ""
            if isinstance(hit.get("source"), dict):
                artifact_file = hit["source"].get("name", "")

            # Parse event timestamp
            ts_raw = hit.get("timestamp") or ""
            event_ts: datetime | None = None
            if ts_raw:
                try:
                    ts_str = str(ts_raw).replace("Z", "+00:00")
                    event_ts = datetime.fromisoformat(ts_str)
                except (ValueError, TypeError):
                    pass

            record_id = str(doc.get("EventRecordId", "")) or None

            records.append(SigmaHit(
                id=str(uuid.uuid4()),
                incident_id=incident_id,
                processing_job_id=processing_job_id,
                rule_id=rule_id,
                rule_name=rule_name,
                rule_tags=tags,
                severity=severity,
                description=description,
                artifact_file=artifact_file,
                event_timestamp=event_ts,
                event_record_id=record_id,
                event_data=doc if isinstance(doc, dict) else {"raw": str(doc)},
            ))
        except Exception as exc:
            logger.warning("Failed to parse sigma hit: %s — %s", exc, str(hit)[:100])

    if records:
        db.add_all(records)
        await db.flush()
    return len(records)


# ── Phase 4: Advanced analytics ───────────────────────────────────────────────

async def _run_analytics_phase(
    incident_id: str,
    processing_job_id: str,
    extracted_dir: Path,
    timeline_dir: Path,
    settings,
    db: AsyncSession,
) -> None:
    """Run attack chain reconstruction, IOC matching, and YARA scanning.
    Best-effort: errors are logged but never propagate to the caller."""
    from app.services.attack_chain_service import build_attack_chains
    from app.services.ioc_service import run_ioc_matching
    from app.services.yara_service import run_yara_scan

    # Attack chain reconstruction from sigma hits
    try:
        chains = await build_attack_chains(incident_id, processing_job_id, db)
        logger.info("Attack chain: %d chains for incident %s", chains, incident_id)
    except Exception as exc:
        logger.warning("Attack chain build failed for %s: %s", incident_id, exc)

    # IOC matching against timeline
    try:
        matches = await run_ioc_matching(incident_id, processing_job_id, timeline_dir, db)
        logger.info("IOC matching: %d matches for incident %s", matches, incident_id)
    except Exception as exc:
        logger.warning("IOC matching failed for %s: %s", incident_id, exc)

    # YARA scanning of extracted files
    try:
        yara_rules_path = getattr(settings, "yara_rules_path", "") or ""
        yara_hits = await run_yara_scan(
            incident_id, processing_job_id, extracted_dir, yara_rules_path, db
        )
        logger.info("YARA scan: %d hits for incident %s", yara_hits, incident_id)
    except Exception as exc:
        logger.warning("YARA scan failed for %s: %s", incident_id, exc)


# ── Chain of Custody helper ───────────────────────────────────────────────────

async def _add_coc_entry(db: AsyncSession, incident_id: str, action: str, detail: str) -> None:
    from app.crud.chain_of_custody import create_entry
    from app.schemas.chain_of_custody import ChainOfCustodyEntryCreate

    ts = datetime.now(timezone.utc).isoformat()
    try:
        await create_entry(
            db,
            ChainOfCustodyEntryCreate(
                id=f"coc-proc-{uuid.uuid4().hex[:12]}",
                incident_id=incident_id,
                timestamp=ts,
                action=action,
                actor="SYSTEM",
                target=detail,
            ),
        )
    except Exception as exc:
        logger.warning("CoC entry failed (%s): %s", action, exc)


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def run_parsing_pipeline(
    incident_id: str,
    job_id: str,
    base_path: Path,
    db: AsyncSession,
) -> str:
    """
    Run the full three-phase pipeline for a completed evidence collection.
    Creates a ProcessingJob record and updates it throughout.
    Returns the ProcessingJob ID.
    """
    from app.services.system_settings_service import get_runtime_settings

    # Idempotency: skip if already running or done
    existing = await get_processing_job_by_evidence_job_id(db, job_id)
    if existing and existing.status in ("RUNNING", "DONE"):
        logger.info("Pipeline already %s for job %s — skipping", existing.status, job_id)
        return existing.id

    proc_job_id = f"proc-{job_id}"
    if not existing:
        await create_processing_job(db, proc_job_id, incident_id, job_id)
        await db.commit()

    await update_processing_job(
        db, proc_job_id,
        status="RUNNING", phase="parsing",
        started_at=datetime.now(timezone.utc),
    )
    await db.commit()

    settings = await get_runtime_settings(db)
    extracted_dir = base_path / "extracted"
    parsed_dir = base_path / "parsed"
    sigma_dir = base_path / "sigma"
    timeline_dir = base_path / "timeline"

    try:
        # ── Phase 1: EZ Tools ──────────────────────────────────────────────
        ez_tools_path = getattr(settings, "ez_tools_path", "") or ""
        parsing_stats = await _run_parsing_phase(extracted_dir, parsed_dir, ez_tools_path)
        total_parsed = sum(parsing_stats.values())
        logger.info("Parsing complete for job %s: %s", job_id, parsing_stats)
        await _add_coc_entry(
            db, incident_id,
            "ARTIFACT PARSING COMPLETE",
            f"{total_parsed} artifacts parsed via EZ Tools",
        )
        await db.commit()

        # ── Phase 2: Sigma detection ────────────────────────────────────────
        await update_processing_job(db, proc_job_id, phase="sigma")
        await db.commit()

        chainsaw_path = getattr(settings, "chainsaw_path", "") or ""
        sigma_rules_path = getattr(settings, "sigma_rules_path", "") or ""
        hayabusa_path = getattr(settings, "hayabusa_path", "") or ""
        hits_count = await _run_sigma_phase(
            extracted_dir, sigma_dir,
            chainsaw_path, sigma_rules_path,
            hayabusa_path,
            incident_id, proc_job_id, db,
        )
        logger.info("Sigma phase complete for job %s: %d hits", job_id, hits_count)
        await _add_coc_entry(
            db, incident_id,
            "SIGMA DETECTION COMPLETE",
            f"{hits_count} sigma hits detected",
        )
        await db.commit()

        # ── Phase 3: Timeline export ────────────────────────────────────────
        await update_processing_job(db, proc_job_id, phase="timeline")
        await db.commit()

        entries = await export_to_jsonl(parsed_dir, sigma_dir, timeline_dir, incident_id)
        logger.info("Timeline phase complete for job %s: %d entries", job_id, entries)
        await _add_coc_entry(
            db, incident_id,
            "TIMELINE GENERATED",
            f"{entries} entries written to timeline.jsonl",
        )
        await db.commit()

        # ── Phase 4: Advanced analytics (best-effort — never fail pipeline) ─
        await update_processing_job(db, proc_job_id, phase="analytics")
        await db.commit()

        await _run_analytics_phase(
            incident_id=incident_id,
            processing_job_id=proc_job_id,
            extracted_dir=extracted_dir,
            timeline_dir=timeline_dir,
            settings=settings,
            db=db,
        )
        await db.commit()

        await update_processing_job(
            db, proc_job_id,
            status="DONE", phase="analytics",
            completed_at=datetime.now(timezone.utc),
        )
        await db.commit()
        return proc_job_id

    except Exception as exc:
        logger.error("Pipeline failed for job %s: %s", job_id, exc, exc_info=True)
        await update_processing_job(
            db, proc_job_id,
            status="FAILED",
            error_message=str(exc)[:500],
            completed_at=datetime.now(timezone.utc),
        )
        await db.commit()
        return proc_job_id


async def run_pipeline_background(
    incident_id: str, job_id: str, base_path: Path
) -> None:
    """
    Wrapper that creates its own DB session.
    Safe to use with asyncio.create_task() after the HTTP response is sent.
    """
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            await run_parsing_pipeline(incident_id, job_id, base_path, db)
        except Exception as exc:
            logger.error(
                "Background pipeline error for job %s: %s", job_id, exc, exc_info=True
            )


def dispatch_pipeline(incident_id: str, job_id: str, base_path: Path) -> None:
    """
    Dispatch the forensics pipeline. Tries Celery first; falls back to
    asyncio.create_task() if Celery is unavailable (e.g. local dev without Redis).
    """
    try:
        from app.worker import run_pipeline_task
        run_pipeline_task.delay(incident_id, job_id, str(base_path))
        logger.info("Pipeline dispatched via Celery for job %s", job_id)
    except Exception as exc:
        logger.warning("Celery unavailable (%s) — falling back to asyncio.create_task", exc)
        import asyncio
        asyncio.create_task(run_pipeline_background(incident_id, job_id, base_path))
