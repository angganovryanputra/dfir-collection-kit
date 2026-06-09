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
    """Execute EZ Tools in parallel where possible."""
    parsed_dir.mkdir(parents=True, exist_ok=True)
    stats: dict[str, int] = {}
    tasks = []

    # 1. EVTX
    evtx_files = cache.get_by_ext(".evtx")
    if evtx_files:
        dll = _tool_dll("EvtxECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "evtx"
            out.mkdir(parents=True, exist_ok=True)
            async def wrap_evtx():
                results = await asyncio.gather(*[
                    _run_subprocess(["dotnet", str(dll), "-f", str(f), "--csv", str(out), "--csvf", f"{f.stem}.csv"])
                    for f in evtx_files
                ])
                stats["EvtxECmd"] = sum(1 for r in results if r[0])
            tasks.append(wrap_evtx())
        elif ez_tools_path:
            stats["EvtxECmd"] = -1

    # 2. $MFT
    mft_files = [f for f in cache.get_by_name("MFT") + cache.get_by_name("$MFT") if not f.suffix]
    if mft_files:
        dll = _tool_dll("MFTECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "mft"
            out.mkdir(parents=True, exist_ok=True)
            async def wrap_mft():
                ok, _ = await _run_subprocess(["dotnet", str(dll), "-f", str(mft_files[0]), "--csv", str(out), "--csvf", "mft.csv"])
                stats["MFTECmd_mft"] = 1 if ok else 0
            tasks.append(wrap_mft())

    # 3. Registry & Amcache
    amcache_files = cache.get_by_name("AMCACHE.HVE")
    if amcache_files:
        dll = _tool_dll("AmcacheParser", ez_tools_path)
        if dll:
            out = parsed_dir / "amcache"
            out.mkdir(parents=True, exist_ok=True)
            async def wrap_amcache():
                ok, _ = await _run_subprocess(["dotnet", str(dll), "-f", str(amcache_files[0]), "--csv", str(out), "--csvf", "amcache.csv"])
                stats["AmcacheParser"] = 1 if ok else 0
            tasks.append(wrap_amcache())

    hve_files = [f for f in cache.get_by_ext(".hve") if f.name.upper() != "AMCACHE.HVE"]
    if hve_files:
        dll = _tool_dll("RECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "registry"
            out.mkdir(parents=True, exist_ok=True)
            async def wrap_recmd():
                results = await asyncio.gather(*[_run_subprocess(["dotnet", str(dll), "-f", str(f), "--csv", str(out)]) for f in hve_files])
                stats["RECmd"] = sum(1 for r in results if r[0])
            tasks.append(wrap_recmd())

    # 4. Prefetch & LNK (directory based)
    pf_dirs = {f.parent for f in cache.get_by_ext(".pf")}
    if pf_dirs:
        dll = _tool_dll("PECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "prefetch"
            out.mkdir(parents=True, exist_ok=True)
            async def wrap_pecmd():
                results = await asyncio.gather(*[
                    _run_subprocess(["dotnet", str(dll), "-d", str(d), "--csv", str(out), "--csvf", "prefetch.csv"])
                    for d in pf_dirs
                ])
                stats["PECmd"] = len(pf_dirs)
            tasks.append(wrap_pecmd())

    lnk_dirs = {f.parent for f in cache.get_by_ext(".lnk")}
    if lnk_dirs:
        dll = _tool_dll("LECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "lnk"
            out.mkdir(parents=True, exist_ok=True)
            async def wrap_lecmd():
                await asyncio.gather(*[
                    _run_subprocess(["dotnet", str(dll), "-d", str(d), "--csv", str(out), "--csvf", "lnk.csv"])
                    for d in lnk_dirs
                ])
                stats["LECmd"] = len(lnk_dirs)
            tasks.append(wrap_lecmd())

    # 5. ShellBags
    shellbag_hives = cache.get_by_name("USRCLASS.DAT") + cache.get_by_name("NTUSER.DAT")
    if shellbag_hives:
        dll = _tool_dll("SBECmd", ez_tools_path)
        if dll:
            out = parsed_dir / "shellbags"
            out.mkdir(parents=True, exist_ok=True)
            async def wrap_sbecmd():
                results = await asyncio.gather(*[
                    _run_subprocess(["dotnet", str(dll), "-f", str(f), "--csv", str(out), "--csvf", f"shellbags_{f.stem}.csv"])
                    for f in shellbag_hives
                ])
                stats["SBECmd"] = sum(1 for r in results if r[0])
            tasks.append(wrap_sbecmd())

    # Run all tasks concurrently
    if tasks:
        await asyncio.gather(*tasks)

    return stats


# ── Phase 2: Sigma detection ───────────────────────────────────────────────────

async def _run_hayabusa(extracted_dir: Path, sigma_dir: Path, hayabusa_path: str) -> list[dict]:
    if not hayabusa_path or not Path(hayabusa_path).exists():
        return []
    output_json = sigma_dir / f"hayabusa_hits_{uuid.uuid4().hex[:8]}.json"
    cmd = [hayabusa_path, "json-timeline", "-d", str(extracted_dir), "-o", str(output_json), "--no-color", "--quiet"]
    ok, _ = await _run_subprocess(cmd)
    hits: list[dict] = []
    if output_json.exists():
        try:
            for line in output_json.read_text(encoding="utf-8", errors="replace").splitlines():
                if line.strip():
                    try:
                        hits.append(json.loads(line))
                    except json.JSONDecodeError: pass
            output_json.unlink()
        except OSError: pass
    return hits


async def _run_chainsaw(extracted_dir: Path, sigma_dir: Path, chainsaw_path: str, sigma_rules_path: str) -> list[dict]:
    if not chainsaw_path or not Path(chainsaw_path).exists() or not sigma_rules_path:
        return []
    rules_dir = Path(sigma_rules_path) / "rules" / "windows"
    if not rules_dir.exists(): rules_dir = Path(sigma_rules_path)
    
    mapping_candidates = [
        Path(sigma_rules_path) / "tools" / "chainsaw" / "sigma-event-logs-all.yml",
        Path(sigma_rules_path) / "sigma-event-logs-all.yml",
        Path(chainsaw_path).parent / "mappings" / "sigma-event-logs-all.yml",
    ]
    mapping_file = next((m for m in mapping_candidates if m.exists()), None)
    
    tmp_hits_path = sigma_dir / f"tmp_chainsaw_{uuid.uuid4().hex[:8]}.json"
    cmd = [chainsaw_path, "hunt", str(extracted_dir), "--sigma", str(rules_dir), "--json", "--output", str(tmp_hits_path)]
    if mapping_file: cmd.extend(["--mapping", str(mapping_file)])
    
    ok, _ = await _run_subprocess(cmd)
    hits: list[dict] = []
    if tmp_hits_path.exists():
        try:
            content = json.loads(tmp_hits_path.read_text())
            if isinstance(content, list): hits = content
            tmp_hits_path.unlink()
        except Exception: pass
    return hits


async def _run_sigma_phase(
    extracted_dir: Path, sigma_dir: Path,
    chainsaw_path: str, sigma_rules_path: str, hayabusa_path: str,
    incident_id: str, proc_job_id: str, db: AsyncSession,
) -> int:
    sigma_dir.mkdir(parents=True, exist_ok=True)
    chainsaw_hits, hayabusa_hits = await asyncio.gather(
        _run_chainsaw(extracted_dir, sigma_dir, chainsaw_path, sigma_rules_path),
        _run_hayabusa(extracted_dir, sigma_dir, hayabusa_path),
    )
    all_hits = chainsaw_hits + hayabusa_hits
    if not all_hits: return 0
    (sigma_dir / "chainsaw_hits.json").write_text(json.dumps(all_hits, indent=2))
    return await _store_sigma_hits(all_hits, incident_id, proc_job_id, db)


async def _store_sigma_hits(hits: list[dict], incident_id: str, proc_job_id: str, db: AsyncSession) -> int:
    records: list[SigmaHit] = []
    for hit in hits:
        try:
            rule_name = hit.get("name") or hit.get("rule") or "Unknown"
            severity = (hit.get("level") or hit.get("severity") or "informational").lower()
            doc = hit.get("document") or hit.get("event") or {}
            ts_raw = hit.get("timestamp") or ""
            event_ts = None
            if ts_raw:
                try: event_ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                except Exception: pass
            
            records.append(SigmaHit(
                id=str(uuid.uuid4()), incident_id=incident_id, processing_job_id=proc_job_id,
                rule_id=hit.get("rule_id") or str(uuid.uuid4()), rule_name=rule_name,
                rule_tags=hit.get("tags") or [], severity=severity,
                description=hit.get("description") or rule_name,
                artifact_file=hit.get("source", {}).get("name", "") if isinstance(hit.get("source"), dict) else "",
                event_timestamp=event_ts, event_record_id=str(doc.get("EventRecordId", "")) or None,
                event_data=doc if isinstance(doc, dict) else {"raw": str(doc)},
            ))
        except Exception: pass
    if records:
        db.add_all(records)
        await db.flush()
    return len(records)


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def run_parsing_pipeline(
    incident_id: str, job_id: str, base_path: Path, db: AsyncSession, *, force: bool = False
) -> str:
    from app.services.system_settings_service import get_runtime_settings
    
    existing = await get_processing_job_by_evidence_job_id(db, job_id)
    if existing and existing.status in ("RUNNING", "DONE"): return existing.id
    if force: _clear_phase_markers(base_path)

    proc_job_id = f"proc-{job_id}"
    if not existing:
        await create_processing_job(db, proc_job_id, incident_id, job_id)
    
    await update_processing_job(db, proc_job_id, status="RUNNING", phase="parsing", started_at=datetime.now(timezone.utc))
    await db.commit()

    settings = await get_runtime_settings(db)
    extracted_dir, parsed_dir = base_path / "extracted", base_path / "parsed"
    sigma_dir, timeline_dir = base_path / "sigma", base_path / "timeline"
    cache = ArtifactCache(extracted_dir)

    try:
        # Phase 1: EZ Tools
        if not _phase_is_done(base_path, 1):
            await _pipeline_log(db, incident_id, "─── Phase 1: Artifact Parsing (Parallel) ───")
            stats = await _run_parsing_phase(extracted_dir, parsed_dir, getattr(settings, "ez_tools_path", "") or "", cache)
            await _pipeline_log(db, incident_id, f"Phase 1 complete: {sum(stats.values())} artifacts parsed", "success")
            _mark_phase_done(base_path, 1)

        # Phase 2: Sigma
        await update_processing_job(db, proc_job_id, phase="sigma")
        if not _phase_is_done(base_path, 2):
            await _pipeline_log(db, incident_id, "─── Phase 2: Sigma Detection (Parallel) ───")
            hits = await _run_sigma_phase(extracted_dir, sigma_dir, getattr(settings, "chainsaw_path", ""), getattr(settings, "sigma_rules_path", ""), getattr(settings, "hayabusa_path", ""), incident_id, proc_job_id, db)
            await _pipeline_log(db, incident_id, f"Phase 2 complete: {hits} hits detected", "success")
            _mark_phase_done(base_path, 2)

        # Phase 3: Timeline
        await update_processing_job(db, proc_job_id, phase="timeline")
        if not _phase_is_done(base_path, 3):
            await _pipeline_log(db, incident_id, "─── Phase 3: Timeline Build ───")
            entries = await export_to_jsonl(parsed_dir, sigma_dir, timeline_dir, incident_id)
            await _pipeline_log(db, incident_id, f"Phase 3 complete: {entries} entries generated", "success")
            _mark_phase_done(base_path, 3)

        await update_processing_job(db, proc_job_id, status="DONE", phase="analytics", completed_at=datetime.now(timezone.utc))
        await db.commit()
        return proc_job_id

    except Exception as exc:
        logger.error("Pipeline failed: %s", exc)
        await update_processing_job(db, proc_job_id, status="FAILED", error_message=str(exc)[:500], completed_at=datetime.now(timezone.utc))
        await db.commit()
        return proc_job_id


async def run_pipeline_background(incident_id: str, job_id: str, base_path: Path) -> None:
    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await run_parsing_pipeline(incident_id, job_id, base_path, db)

def dispatch_pipeline(incident_id: str, job_id: str, base_path: Path) -> None:
    try:
        from app.worker import run_pipeline_task
        run_pipeline_task.delay(incident_id, job_id, str(base_path))
    except Exception:
        import asyncio
        asyncio.create_task(run_pipeline_background(incident_id, job_id, base_path))
