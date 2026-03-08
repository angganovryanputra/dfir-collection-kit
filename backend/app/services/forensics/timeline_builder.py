"""
Timeline Builder — normalise and merge CSV outputs from EZTools, Hayabusa,
and Chainsaw into a single ``super_timeline.csv``.

The normalisation maps every tool's heterogeneous column names to a
consistent schema:

    datetime | source | computer | event_id | description | details |
    rule_title | sigma_level | user | original_file
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Column-normalisation maps — one per tool output
# ---------------------------------------------------------------------------

_EVTX_MAP = {
    "TimeCreated": "datetime",
    "Computer": "computer",
    "EventId": "event_id",
    "PayloadData1": "description",
    "Channel": "source",
    "UserName": "user",
}

_MFT_MAP = {
    "Created0x10": "datetime",
    "FileName": "description",
    "ParentPath": "details",
}

_REG_MAP = {
    "LastWriteTimestamp": "datetime",
    "HivePath": "source",
    "Description": "description",
    "ValueName": "details",
}

_PREFETCH_MAP = {
    "LastRun": "datetime",
    "ExecutableName": "description",
    "RunCount": "details",
}

_LNK_MAP = {
    "TargetCreated": "datetime",
    "LocalPath": "description",
    "Arguments": "details",
    "TargetModified": "details",
}

_JUMPLIST_MAP = {
    "TargetCreated": "datetime",
    "AppId": "source",
    "LocalPath": "description",
}

_SHIMCACHE_MAP = {
    "LastModifiedTimeUTC": "datetime",
    "Path": "description",
    "Executed": "details",
}

_AMCACHE_MAP = {
    "FileKeyLastWriteTimestamp": "datetime",
    "FullPath": "description",
    "SHA1": "details",
    "Publisher": "user",
}

_HAYABUSA_MAP = {
    "Timestamp": "datetime",
    "Computer": "computer",
    "EventID": "event_id",
    "Channel": "source",
    "Details": "description",
    "RuleTitle": "rule_title",
    "Level": "sigma_level",
    "RuleFile": "details",
    "MitreTactics": "details",
}

_CHAINSAW_MAP = {
    "timestamp": "datetime",
    "name": "rule_title",
    "level": "sigma_level",
    "computer": "computer",
    "message": "description",
    "Event.System.EventID": "event_id",
}

# Map from a substring of the filename to its normalisation mapping
_FILE_TO_MAP: dict[str, dict[str, str]] = {
    "evtx_parsed": _EVTX_MAP,
    "mft_parsed": _MFT_MAP,
    "registry_parsed": _REG_MAP,
    "prefetch_parsed": _PREFETCH_MAP,
    "lnk_parsed": _LNK_MAP,
    "jumplists_parsed": _JUMPLIST_MAP,
    "shimcache_parsed": _SHIMCACHE_MAP,
    "amcache_parsed": _AMCACHE_MAP,
    "hayabusa": _HAYABUSA_MAP,
    "chainsaw": _CHAINSAW_MAP,
}

_FINAL_COLUMNS = [
    "datetime",
    "source",
    "computer",
    "event_id",
    "description",
    "details",
    "rule_title",
    "sigma_level",
    "user",
    "original_file",
]


def _detect_mapping(filepath: Path) -> dict[str, str]:
    """Return the normalisation map matching *filepath*'s name."""
    stem = filepath.stem.lower()
    for key, mapping in _FILE_TO_MAP.items():
        if key in stem:
            return mapping
    return {}


def _normalise(df: pd.DataFrame, mapping: dict[str, str], origin: str) -> pd.DataFrame:
    """Apply the *mapping* to *df*, add ``original_file``, keep only known cols."""
    # Rename columns that exist in the DataFrame
    rename_dict = {src: dst for src, dst in mapping.items() if src in df.columns}
    df = df.rename(columns=rename_dict)

    # Tag with the originating file
    df["original_file"] = origin

    # Keep only the well-known columns (fill missing ones with empty str)
    for col in _FINAL_COLUMNS:
        if col not in df.columns:
            df[col] = ""

    return df[_FINAL_COLUMNS]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_super_timeline(csv_files: List[Path | None], output_path: Path) -> Path | None:
    """
    Read every CSV in *csv_files*, normalise columns, concatenate, sort by
    ``datetime``, and write to *output_path*.

    Returns *output_path* on success or ``None`` if no data was produced.
    """
    logger.info("Building super timeline from %d potential CSV inputs ...", len(csv_files))

    dataframes: list[pd.DataFrame] = []

    for filepath in csv_files:
        if filepath is None or not filepath.exists():
            continue
        try:
            df = pd.read_csv(filepath, low_memory=False, dtype=str)
            if df.empty:
                logger.info("Skipping empty CSV: %s", filepath)
                continue

            mapping = _detect_mapping(filepath)
            if not mapping:
                logger.warning("No column mapping found for %s — including raw.", filepath)

            df = _normalise(df, mapping, filepath.name)
            dataframes.append(df)
            logger.info("Normalised %d rows from %s", len(df), filepath.name)
        except Exception as exc:
            logger.error("Failed to read %s: %s", filepath, exc)

    if not dataframes:
        logger.warning("No data to build timeline — no CSV files had content.")
        return None

    super_df = pd.concat(dataframes, ignore_index=True)

    # Best-effort datetime sort
    try:
        super_df["datetime"] = pd.to_datetime(super_df["datetime"], errors="coerce", utc=True)
        super_df.sort_values(by="datetime", inplace=True, na_position="last")
        super_df["datetime"] = super_df["datetime"].astype(str)
    except Exception as exc:
        logger.warning("Could not sort by datetime: %s — writing unsorted.", exc)

    super_df.to_csv(output_path, index=False)
    logger.info(
        "Super timeline written: %s (%d rows, %.2f MB)",
        output_path,
        len(super_df),
        output_path.stat().st_size / (1024 * 1024),
    )
    return output_path
