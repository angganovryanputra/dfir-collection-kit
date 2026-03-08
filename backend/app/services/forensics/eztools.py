"""
Wrappers for Eric Zimmerman's DFIR tools.

Each function locates relevant artifact files inside *source_dir*,
invokes the corresponding EZTools binary, and writes CSV output
into *output_dir*.  Returns the Path to the generated CSV on success
or ``None`` when no matching artifacts are found / the tool fails.

By default every tool is resolved via ``shutil.which``.  Override the
lookup by setting the environment variable ``EZTOOLS_DIR`` to the
directory that contains all the EZTools binaries (e.g. the unzipped
net6 release).
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Sequence

logger = logging.getLogger(__name__)

EZTOOLS_DIR: str | None = os.getenv("EZTOOLS_DIR")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_binary(name: str) -> str | None:
    """Return the full path of *name*, looking in EZTOOLS_DIR first."""
    if EZTOOLS_DIR:
        candidate = Path(EZTOOLS_DIR) / name
        if candidate.exists():
            return str(candidate)
    return shutil.which(name)


def _has_files(directory: Path, extensions: Sequence[str]) -> bool:
    """Return True when *directory* contains at least one file with one of
    the given extensions (case-insensitive, recursive)."""
    for ext in extensions:
        if any(directory.rglob(f"*{ext}")):
            return True
    return False


def _run_tool(
    binary: str,
    args: list[str],
    output_dir: Path,
    output_csv_name: str,
    timeout: int = 600,
) -> Path | None:
    """Execute *binary* with *args*, capture output, and return the CSV path
    if the tool ran successfully and produced a non-empty file."""
    cmd = [binary, *args]
    logger.info("Executing: %s", " ".join(cmd))
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            logger.error(
                "Tool %s exited with code %d.\nstdout: %s\nstderr: %s",
                binary, result.returncode,
                result.stdout[-2000:] if result.stdout else "",
                result.stderr[-2000:] if result.stderr else "",
            )
            return None
    except FileNotFoundError:
        logger.error("Binary not found: %s", binary)
        return None
    except subprocess.TimeoutExpired:
        logger.error("Tool %s timed out after %ds", binary, timeout)
        return None

    # EZTools typically drop one or more CSVs into output_dir.
    # Find the first matching file.
    candidates = sorted(output_dir.glob(f"*{output_csv_name}*"), key=lambda p: p.stat().st_mtime, reverse=True)
    if candidates and candidates[0].stat().st_size > 0:
        logger.info("Tool %s produced: %s (%d bytes)", binary, candidates[0], candidates[0].stat().st_size)
        return candidates[0]

    logger.warning("Tool %s ran but no output CSV found matching '%s' in %s", binary, output_csv_name, output_dir)
    return None


# ---------------------------------------------------------------------------
# EvtxECmd — Windows XML Event Log (.evtx) parser
# ---------------------------------------------------------------------------

def run_evtxecmd(source_dir: Path, output_dir: Path) -> Path | None:
    """Parse all EVTX files in *source_dir* into CSV."""
    if not _has_files(source_dir, [".evtx"]):
        logger.info("No .evtx files in %s — skipping EvtxECmd.", source_dir)
        return None
    binary = _resolve_binary("EvtxECmd")
    if not binary:
        logger.error("EvtxECmd binary not found.")
        return None
    return _run_tool(
        binary,
        ["-d", str(source_dir), "--csv", str(output_dir), "--csvf", "evtx_parsed.csv"],
        output_dir,
        "evtx_parsed",
    )


# ---------------------------------------------------------------------------
# MFTECmd — $MFT / $UsnJrnl / $LogFile parser
# ---------------------------------------------------------------------------

def run_mftecmd(source_dir: Path, output_dir: Path) -> Path | None:
    """Parse MFT, UsnJrnl, or LogFile artifacts."""
    mft_extensions = ["$MFT", "$J", "$UsnJrnl", "$LogFile", ".bin"]
    # MFTECmd expects a single file.  Find the first $MFT-like file.
    target: Path | None = None
    for pattern in ["$MFT", "*$MFT*", "*.bin"]:
        hits = list(source_dir.rglob(pattern))
        if hits:
            target = hits[0]
            break
    if not target:
        logger.info("No MFT artifacts in %s — skipping MFTECmd.", source_dir)
        return None
    binary = _resolve_binary("MFTECmd")
    if not binary:
        logger.error("MFTECmd binary not found.")
        return None
    return _run_tool(
        binary,
        ["-f", str(target), "--csv", str(output_dir), "--csvf", "mft_parsed.csv"],
        output_dir,
        "mft_parsed",
    )


# ---------------------------------------------------------------------------
# RECmd — Windows Registry Hive parser
# ---------------------------------------------------------------------------

def run_recmd(source_dir: Path, output_dir: Path) -> Path | None:
    """Parse Registry hives (SYSTEM, SAM, SOFTWARE, NTUSER, etc.)."""
    hive_names = {"SYSTEM", "SAM", "SOFTWARE", "SECURITY", "DEFAULT", "NTUSER.DAT", "UsrClass.dat"}
    found = any(
        p.name.upper() in {h.upper() for h in hive_names}
        for p in source_dir.rglob("*")
        if p.is_file()
    )
    if not found:
        logger.info("No registry hives in %s — skipping RECmd.", source_dir)
        return None
    binary = _resolve_binary("RECmd")
    if not binary:
        logger.error("RECmd binary not found.")
        return None
    return _run_tool(
        binary,
        ["-d", str(source_dir), "--csv", str(output_dir), "--csvf", "registry_parsed.csv", "--bn", "BatchExamples/RECmd_Batch_MC.reb"],
        output_dir,
        "registry_parsed",
    )


# ---------------------------------------------------------------------------
# PECmd — Prefetch (.pf) parser
# ---------------------------------------------------------------------------

def run_pecmd(source_dir: Path, output_dir: Path) -> Path | None:
    """Parse Prefetch files."""
    if not _has_files(source_dir, [".pf"]):
        logger.info("No .pf files in %s — skipping PECmd.", source_dir)
        return None
    binary = _resolve_binary("PECmd")
    if not binary:
        logger.error("PECmd binary not found.")
        return None
    return _run_tool(
        binary,
        ["-d", str(source_dir), "--csv", str(output_dir), "--csvf", "prefetch_parsed.csv"],
        output_dir,
        "prefetch_parsed",
    )


# ---------------------------------------------------------------------------
# LECmd — LNK / Shortcut (.lnk) parser
# ---------------------------------------------------------------------------

def run_lecmd(source_dir: Path, output_dir: Path) -> Path | None:
    """Parse LNK shortcut files."""
    if not _has_files(source_dir, [".lnk"]):
        logger.info("No .lnk files in %s — skipping LECmd.", source_dir)
        return None
    binary = _resolve_binary("LECmd")
    if not binary:
        logger.error("LECmd binary not found.")
        return None
    return _run_tool(
        binary,
        ["-d", str(source_dir), "--csv", str(output_dir), "--csvf", "lnk_parsed.csv"],
        output_dir,
        "lnk_parsed",
    )


# ---------------------------------------------------------------------------
# JLECmd — Jump Lists parser
# ---------------------------------------------------------------------------

def run_jlecmd(source_dir: Path, output_dir: Path) -> Path | None:
    """Parse Jump List files (AutomaticDestinations / CustomDestinations)."""
    if not _has_files(source_dir, [".automaticDestinations-ms", ".customDestinations-ms"]):
        logger.info("No Jump List files in %s — skipping JLECmd.", source_dir)
        return None
    binary = _resolve_binary("JLECmd")
    if not binary:
        logger.error("JLECmd binary not found.")
        return None
    return _run_tool(
        binary,
        ["-d", str(source_dir), "--csv", str(output_dir), "--csvf", "jumplists_parsed.csv"],
        output_dir,
        "jumplists_parsed",
    )


# ---------------------------------------------------------------------------
# AppCompatCacheParser — ShimCache parser
# ---------------------------------------------------------------------------

def run_appcompatcacheparser(source_dir: Path, output_dir: Path) -> Path | None:
    """Parse AppCompatCache (ShimCache) from SYSTEM hive."""
    system_hive: Path | None = None
    for p in source_dir.rglob("*"):
        if p.is_file() and p.name.upper() == "SYSTEM":
            system_hive = p
            break
    if not system_hive:
        logger.info("No SYSTEM hive in %s — skipping AppCompatCacheParser.", source_dir)
        return None
    binary = _resolve_binary("AppCompatCacheParser")
    if not binary:
        logger.error("AppCompatCacheParser binary not found.")
        return None
    return _run_tool(
        binary,
        ["-f", str(system_hive), "--csv", str(output_dir), "--csvf", "shimcache_parsed.csv"],
        output_dir,
        "shimcache_parsed",
    )


# ---------------------------------------------------------------------------
# AmcacheParser — Amcache.hve parser
# ---------------------------------------------------------------------------

def run_amcacheparser(source_dir: Path, output_dir: Path) -> Path | None:
    """Parse Amcache.hve."""
    amcache: Path | None = None
    for p in source_dir.rglob("*"):
        if p.is_file() and p.name.lower() == "amcache.hve":
            amcache = p
            break
    if not amcache:
        logger.info("No Amcache.hve in %s — skipping AmcacheParser.", source_dir)
        return None
    binary = _resolve_binary("AmcacheParser")
    if not binary:
        logger.error("AmcacheParser binary not found.")
        return None
    return _run_tool(
        binary,
        ["-f", str(amcache), "--csv", str(output_dir), "--csvf", "amcache_parsed.csv"],
        output_dir,
        "amcache_parsed",
    )
