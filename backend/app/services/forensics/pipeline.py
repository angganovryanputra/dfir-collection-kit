"""
Scalable Forensics Pipeline — Background Orchestrator.

Called by ``BackgroundTasks`` after evidence upload.  Orchestrates:

1. EZTools parsing  (EvtxECmd, MFTECmd, RECmd, PECmd, LECmd, JLECmd,
   AppCompatCacheParser, AmcacheParser)
2. Sigma hunting    (Hayabusa, Chainsaw)
3. Super Timeline   (normalise + merge all CSVs)
4. DB persistence   (insert ``PROCESSED_TIMELINE`` EvidenceItem)
"""

from __future__ import annotations

import hashlib
import logging
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from uuid import uuid4

logger = logging.getLogger(__name__)

from app.services.forensics.eztools import (
    run_amcacheparser,
    run_appcompatcacheparser,
    run_evtxecmd,
    run_jlecmd,
    run_lecmd,
    run_mftecmd,
    run_pecmd,
    run_recmd,
)
from app.services.forensics.sigma_hunter import run_chainsaw, run_hayabusa
from app.services.forensics.timeline_builder import build_super_timeline

# Back-reference for DB access outside of a request context
from app.db.session import AsyncSessionLocal
from app.models.evidence import EvidenceItem


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sha256(path: Path) -> str:
    """Return hex-encoded SHA-256 digest of *path*."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _human_size(size_bytes: int) -> str:
    """Return a human-friendly file size string."""
    for unit in ("B", "KB", "MB", "GB"):
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024  # type: ignore[assignment]
    return f"{size_bytes:.1f} TB"


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

async def process_forensic_artifacts(
    incident_id: str,
    job_id: str,
    extracted_dir: Path,
) -> None:
    """
    Background task entry-point.

    Runs all parsing tools in a thread-pool, builds the super-timeline,
    and registers the result as a new ``EvidenceItem`` in the database.
    """
    logger.info(
        ">>> FORENSICS PIPELINE START  |  incident=%s  job=%s  dir=%s",
        incident_id, job_id, extracted_dir,
    )
    start = datetime.now(timezone.utc)

    output_dir = extracted_dir.parent / "processed"
    output_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # 1. Run parsers in parallel via a thread-pool (they are CPU/IO bound
    #    subprocess calls, so threads work fine).
    # ------------------------------------------------------------------
    parser_tasks: dict[str, Callable[[], Path | None]] = {
        "EvtxECmd":              lambda: run_evtxecmd(extracted_dir, output_dir),
        "MFTECmd":               lambda: run_mftecmd(extracted_dir, output_dir),
        "RECmd":                 lambda: run_recmd(extracted_dir, output_dir),
        "PECmd":                 lambda: run_pecmd(extracted_dir, output_dir),
        "LECmd":                 lambda: run_lecmd(extracted_dir, output_dir),
        "JLECmd":                lambda: run_jlecmd(extracted_dir, output_dir),
        "AppCompatCacheParser":  lambda: run_appcompatcacheparser(extracted_dir, output_dir),
        "AmcacheParser":         lambda: run_amcacheparser(extracted_dir, output_dir),
        "Hayabusa":              lambda: run_hayabusa(extracted_dir, output_dir),
        "Chainsaw":              lambda: run_chainsaw(extracted_dir, output_dir),
    }

    csv_results: dict[str, Path | None] = {}

    with ThreadPoolExecutor(max_workers=4) as pool:
        future_map = {
            pool.submit(fn): name for name, fn in parser_tasks.items()
        }
        for future in as_completed(future_map):
            name = future_map[future]
            try:
                csv_results[name] = future.result()
            except Exception:
                logger.error("Parser %s raised an exception:\n%s", name, traceback.format_exc())
                csv_results[name] = None

    successful = {k: v for k, v in csv_results.items() if v is not None}
    logger.info(
        "Parsing complete: %d/%d tools produced output.  Successful: %s",
        len(successful), len(parser_tasks), ", ".join(successful.keys()) or "(none)",
    )

    # ------------------------------------------------------------------
    # 2. Build the super timeline
    # ------------------------------------------------------------------
    timeline_path = output_dir / "super_timeline.csv"
    csv_files = list(csv_results.values())  # includes None entries

    result = build_super_timeline(csv_files, timeline_path)

    if result is None:
        logger.warning(
            ">>> FORENSICS PIPELINE COMPLETE (NO DATA)  |  incident=%s  job=%s",
            incident_id, job_id,
        )
        return

    # ------------------------------------------------------------------
    # 3. Persist the super timeline as an EvidenceItem
    # ------------------------------------------------------------------
    evidence_id = f"timeline-{uuid4().hex[:12]}"
    file_hash = _sha256(timeline_path)
    file_size = _human_size(timeline_path.stat().st_size)

    async with AsyncSessionLocal() as db:
        try:
            item = EvidenceItem(
                id=evidence_id,
                incident_id=str(incident_id),
                name=timeline_path.name,
                type="PROCESSED_TIMELINE",
                size=file_size,
                status="HASH_VERIFIED",
                hash=file_hash,
                collected_at=datetime.now(timezone.utc).isoformat() + "Z",
            )
            db.add(item)
            await db.commit()
            logger.info("EvidenceItem created: id=%s  type=PROCESSED_TIMELINE", evidence_id)
        except Exception:
            await db.rollback()
            logger.error("Failed to persist timeline EvidenceItem:\n%s", traceback.format_exc())

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    logger.info(
        ">>> FORENSICS PIPELINE COMPLETE  |  incident=%s  job=%s  elapsed=%.1fs  "
        "timeline=%s  rows=%s  size=%s  hash=%s",
        incident_id, job_id, elapsed,
        timeline_path.name, "see log above", file_size, file_hash[:16] + "...",
    )
