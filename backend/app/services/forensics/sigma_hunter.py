"""
Wrappers for Sigma-based EVTX hunting tools — Hayabusa and Chainsaw.

Both tools scan directories of Windows XML Event Log (.evtx) files against
Sigma detection rules and produce CSV timeline output suitable for
aggregation in the Super Timeline.

Binary locations are resolved via ``shutil.which`` unless overridden by the
``HAYABUSA_PATH`` or ``CHAINSAW_PATH`` environment variables.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

HAYABUSA_PATH: str | None = os.getenv("HAYABUSA_PATH")
CHAINSAW_PATH: str | None = os.getenv("CHAINSAW_PATH")
SIGMA_RULES_DIR: str | None = os.getenv("SIGMA_RULES_DIR")
CHAINSAW_MAPPING: str | None = os.getenv(
    "CHAINSAW_MAPPING",
    "mappings/sigma-event-logs-all.yml",
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _has_evtx(directory: Path) -> bool:
    """Return True when *directory* contains at least one .evtx file."""
    return any(directory.rglob("*.evtx"))


def _resolve(env: str | None, name: str) -> str | None:
    """Return a path for the given binary, preferring *env* over PATH."""
    if env and Path(env).exists():
        return env
    return shutil.which(name)


# ---------------------------------------------------------------------------
# Hayabusa — Fast Windows Event Log Analyzer
# ---------------------------------------------------------------------------

def run_hayabusa(evtx_dir: Path, output_dir: Path, *, timeout: int = 900) -> Path | None:
    """
    Scan *evtx_dir* with Hayabusa producing a CSV timeline of Sigma alerts.

    Returns the output CSV ``Path`` on success, ``None`` on failure.
    """
    if not _has_evtx(evtx_dir):
        logger.info("No .evtx files in %s — skipping Hayabusa.", evtx_dir)
        return None

    binary = _resolve(HAYABUSA_PATH, "hayabusa")
    if not binary:
        logger.error("Hayabusa binary not found. Set HAYABUSA_PATH or add to PATH.")
        return None

    output_csv = output_dir / "hayabusa_sigma_alerts.csv"

    cmd = [
        binary,
        "csv-timeline",
        "-d", str(evtx_dir),
        "-o", str(output_csv),
        "--no-color",
        "-p", "verbose",
    ]
    logger.info("Executing: %s", " ".join(cmd))

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if result.returncode != 0:
            logger.error(
                "Hayabusa exited %d.\nstdout: %s\nstderr: %s",
                result.returncode,
                result.stdout[-2000:] if result.stdout else "",
                result.stderr[-2000:] if result.stderr else "",
            )
            return None
    except FileNotFoundError:
        logger.error("Hayabusa binary not found at %s", binary)
        return None
    except subprocess.TimeoutExpired:
        logger.error("Hayabusa timed out after %ds", timeout)
        return None

    if output_csv.exists() and output_csv.stat().st_size > 0:
        logger.info("Hayabusa produced: %s (%d bytes)", output_csv, output_csv.stat().st_size)
        return output_csv

    logger.warning("Hayabusa ran but produced no output CSV.")
    return None


# ---------------------------------------------------------------------------
# Chainsaw — Rapidly search & hunt through Windows EVTX
# ---------------------------------------------------------------------------

def run_chainsaw(evtx_dir: Path, output_dir: Path, *, timeout: int = 900) -> Path | None:
    """
    Scan *evtx_dir* with Chainsaw + Sigma rules producing a CSV of alerts.

    Returns the output CSV ``Path`` on success, ``None`` on failure.
    """
    if not _has_evtx(evtx_dir):
        logger.info("No .evtx files in %s — skipping Chainsaw.", evtx_dir)
        return None

    binary = _resolve(CHAINSAW_PATH, "chainsaw")
    if not binary:
        logger.error("Chainsaw binary not found. Set CHAINSAW_PATH or add to PATH.")
        return None

    sigma_dir = SIGMA_RULES_DIR or "rules/"
    output_csv = output_dir / "chainsaw_sigma_alerts.csv"

    cmd = [
        binary,
        "hunt",
        str(evtx_dir),
        "-s", sigma_dir,
        "--mapping", CHAINSAW_MAPPING or "mappings/sigma-event-logs-all.yml",
        "--csv",
        "--output", str(output_csv),
        "--full",
    ]
    logger.info("Executing: %s", " ".join(cmd))

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if result.returncode != 0:
            logger.error(
                "Chainsaw exited %d.\nstdout: %s\nstderr: %s",
                result.returncode,
                result.stdout[-2000:] if result.stdout else "",
                result.stderr[-2000:] if result.stderr else "",
            )
            return None
    except FileNotFoundError:
        logger.error("Chainsaw binary not found at %s", binary)
        return None
    except subprocess.TimeoutExpired:
        logger.error("Chainsaw timed out after %ds", timeout)
        return None

    # Chainsaw --csv writes a directory of CSV files; pick the first.
    if output_csv.is_dir():
        csvs = sorted(output_csv.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
        if csvs:
            logger.info("Chainsaw produced: %s (%d bytes)", csvs[0], csvs[0].stat().st_size)
            return csvs[0]
    elif output_csv.exists() and output_csv.stat().st_size > 0:
        logger.info("Chainsaw produced: %s (%d bytes)", output_csv, output_csv.stat().st_size)
        return output_csv

    logger.warning("Chainsaw ran but produced no output CSV.")
    return None
