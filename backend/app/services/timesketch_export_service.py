"""Convert parsed EZ Tools CSVs and Sigma hits to Timesketch JSONL format."""
from __future__ import annotations

import csv
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Per-source column mappings ─────────────────────────────────────────────────
# Each entry: {timestamp_col, timestamp_desc, source, source_short, message_cols, extra_cols}
_SOURCE_MAPS: dict[str, dict] = {
    "evtx": {
        "timestamp_cols": ["TimeCreated", "TimeStamp", "Timestamp"],
        "timestamp_desc": "Event Logged",
        "source": "Windows Event Log",
        "source_short": "EVTX",
        "message_cols": ["MapDescription", "PayloadData1", "Description"],
        "extra_cols": ["EventId", "Channel", "Computer", "UserName", "EventRecordId",
                       "PayloadData2", "PayloadData3"],
    },
    "mft": {
        "timestamp_cols": ["Created0x10", "LastModified0x10", "SourceCreated"],
        "timestamp_desc": "File Created (MFT)",
        "source": "NTFS Master File Table",
        "source_short": "MFT",
        "message_cols": ["FullPath", "FileName"],
        "extra_cols": ["FileSize", "IsDirectory", "LastModified0x10", "LastAccess0x10",
                       "LastAttrChange0x10", "EntryNumber"],
    },
    "usnjrnl": {
        "timestamp_cols": ["UpdateTimestamp", "TimeStamp"],
        "timestamp_desc": "USN Record",
        "source": "NTFS USN Journal",
        "source_short": "USNJRNL",
        "message_cols": ["Name", "FullPath"],
        "extra_cols": ["Reason", "FileAttributes", "ParentPath", "SecurityDescriptor"],
    },
    "registry": {
        "timestamp_cols": ["LastWriteTimestamp", "LastWrite"],
        "timestamp_desc": "Registry Modified",
        "source": "Windows Registry",
        "source_short": "REG",
        "message_cols": ["KeyPath", "ValueName"],
        "extra_cols": ["ValueType", "ValueData", "Hive"],
    },
    "prefetch": {
        "timestamp_cols": ["LastRun", "SourceCreated", "SourceModified"],
        "timestamp_desc": "Prefetch Executed",
        "source": "Windows Prefetch",
        "source_short": "PREFETCH",
        "message_cols": ["ExecutableName", "SourceFilename"],
        "extra_cols": ["RunCount", "Size", "Hash", "Volume0Name"],
    },
    "lnk": {
        "timestamp_cols": ["SourceCreated", "TargetCreated", "SourceModified"],
        "timestamp_desc": "LNK File Created",
        "source": "Windows LNK File",
        "source_short": "LNK",
        "message_cols": ["LocalPath", "Name"],
        "extra_cols": ["TargetMD5", "FileSize", "WorkingDirectory", "Arguments"],
    },
    "jumplists": {
        "timestamp_cols": ["SourceCreated", "LastModified", "TargetCreated"],
        "timestamp_desc": "Jump List Entry",
        "source": "Windows Jump Lists",
        "source_short": "JUMPLIST",
        "message_cols": ["Path", "LocalPath", "Name"],
        "extra_cols": ["AppId", "AppIdDescription"],
    },
    "amcache": {
        "timestamp_cols": ["FileKeyLastWriteTimestamp", "ProgramId"],
        "timestamp_desc": "Amcache Entry",
        "source": "Windows Amcache",
        "source_short": "AMCACHE",
        "message_cols": ["ApplicationName", "ProgramName", "Name"],
        "extra_cols": ["SHA1", "FileVersion", "Publisher", "Language"],
    },
}


def _parse_timestamp(value: str) -> str | None:
    """Try to parse a timestamp string and return ISO 8601 with timezone."""
    if not value or value.strip() in ("", "0", "N/A", "null"):
        return None
    value = value.strip()

    # Already ISO-ish with Z or +
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    if "+" in value or (value.count("-") >= 3):
        try:
            dt = datetime.fromisoformat(value)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except (ValueError, OverflowError):
            pass

    # Common EZ Tools format: "2026-01-01 12:00:00.000"
    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
    ):
        try:
            dt = datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue

    return None


def _row_to_entry(row: dict, source_map: dict, incident_id: str) -> dict | None:
    """Convert a single CSV row to a Timesketch JSONL dict. Returns None if no timestamp."""
    # Find first valid timestamp
    ts_iso: str | None = None
    for col in source_map["timestamp_cols"]:
        if col in row:
            ts_iso = _parse_timestamp(row[col])
            if ts_iso:
                break

    if not ts_iso:
        # Try any column that looks like a timestamp (fallback)
        for key, val in row.items():
            if any(k in key.lower() for k in ("time", "date", "created", "modified", "last")):
                ts_iso = _parse_timestamp(val)
                if ts_iso:
                    break

    if not ts_iso:
        return None

    # Build message from message columns (first non-empty)
    msg_parts = []
    for col in source_map["message_cols"]:
        if col in row and row[col] and row[col].strip():
            msg_parts.append(row[col].strip())
    message = " | ".join(msg_parts) if msg_parts else f"{source_map['source']} event"

    entry: dict = {
        "message": message,
        "datetime": ts_iso,
        "timestamp_desc": source_map["timestamp_desc"],
        "source": source_map["source"],
        "source_short": source_map["source_short"],
        "incident_id": incident_id,
    }

    # Add extra columns (lower-cased keys)
    for col in source_map.get("extra_cols", []):
        if col in row and row[col] and row[col].strip():
            entry[col.lower()] = row[col].strip()

    return entry


def _csv_to_entries(csv_path: Path, source_key: str, incident_id: str) -> list[dict]:
    """Parse one CSV file and return Timesketch JSONL entries."""
    source_map = _SOURCE_MAPS.get(source_key)
    if not source_map:
        logger.warning("No source map for %s — skipping %s", source_key, csv_path.name)
        return []

    entries: list[dict] = []
    try:
        with csv_path.open(encoding="utf-8-sig", errors="replace", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                entry = _row_to_entry(row, source_map, incident_id)
                if entry:
                    entries.append(entry)
    except (OSError, csv.Error) as exc:
        logger.warning("Failed to read CSV %s: %s", csv_path, exc)
    return entries


def _sigma_hits_to_entries(sigma_dir: Path, incident_id: str) -> list[dict]:
    """Convert chainsaw JSON hits to Timesketch JSONL entries."""
    hits_file = sigma_dir / "chainsaw_hits.json"
    if not hits_file.exists():
        return []

    entries: list[dict] = []
    try:
        hits = json.loads(hits_file.read_text())
        if not isinstance(hits, list):
            return []
        for hit in hits:
            ts_raw = hit.get("timestamp") or ""
            ts_iso = _parse_timestamp(str(ts_raw)) if ts_raw else None
            if not ts_iso:
                ts_iso = datetime.now(timezone.utc).isoformat()

            rule_name = hit.get("name") or hit.get("rule") or "Sigma Detection"
            level = (hit.get("level") or "informational").lower()
            tags = hit.get("tags") or []
            doc = hit.get("document") or {}

            entry: dict = {
                "message": f"[SIGMA/{level.upper()}] {rule_name}",
                "datetime": ts_iso,
                "timestamp_desc": "Sigma Detection",
                "source": "Sigma Rule Detection",
                "source_short": "SIGMA",
                "incident_id": incident_id,
                "sigma_rule": rule_name,
                "sigma_level": level,
                "tag": tags if isinstance(tags, list) else [str(tags)],
            }
            if isinstance(doc, dict):
                for k in ("Computer", "EventId", "Channel", "UserName"):
                    if k in doc and doc[k]:
                        entry[k.lower()] = str(doc[k])
            entries.append(entry)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Failed to parse sigma hits: %s", exc)
    return entries


async def export_to_jsonl(
    parsed_dir: Path,
    sigma_dir: Path,
    timeline_dir: Path,
    incident_id: str,
) -> int:
    """
    Merge all parsed CSVs and sigma hits into a single Timesketch JSONL file.
    Returns number of entries written.
    """
    timeline_dir.mkdir(parents=True, exist_ok=True)
    timeline_path = timeline_dir / "timeline.jsonl"

    all_entries: list[dict] = []

    # Collect entries from each parsed artifact subdirectory
    if parsed_dir.exists():
        for source_dir in sorted(parsed_dir.iterdir()):
            if not source_dir.is_dir():
                continue
            source_key = source_dir.name  # e.g. "evtx", "mft", "prefetch"
            for csv_file in sorted(source_dir.glob("*.csv")):
                entries = _csv_to_entries(csv_file, source_key, incident_id)
                all_entries.extend(entries)
                logger.info(
                    "Timeline: %d entries from %s/%s",
                    len(entries), source_key, csv_file.name,
                )

    # Add sigma hits
    sigma_entries = _sigma_hits_to_entries(sigma_dir, incident_id)
    all_entries.extend(sigma_entries)

    # Sort by datetime (best-effort)
    def _sort_key(e: dict) -> str:
        return e.get("datetime") or ""

    all_entries.sort(key=_sort_key)

    # Write JSONL
    try:
        with timeline_path.open("w", encoding="utf-8") as fh:
            for entry in all_entries:
                fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError as exc:
        logger.error("Failed to write timeline.jsonl: %s", exc)
        raise

    logger.info("Timeline export complete: %d entries → %s", len(all_entries), timeline_path)

    # Build persistent DuckDB store for fast ad-hoc queries
    _build_duckdb_store(timeline_path, timeline_dir)

    return len(all_entries)


def _build_duckdb_store(timeline_path: Path, timeline_dir: Path) -> None:
    """Load timeline.jsonl into a persistent DuckDB file for fast queries.
    Silently skips if duckdb is not installed."""
    try:
        import duckdb  # type: ignore[import]
    except ImportError:
        logger.debug("duckdb not installed — skipping persistent store build")
        return

    db_path = timeline_dir / "duckdb.db"
    try:
        # Remove stale DB before rebuilding
        if db_path.exists():
            db_path.unlink()

        con = duckdb.connect(str(db_path))
        try:
            path_str = str(timeline_path).replace("\\", "/")
            con.execute(
                f"""
                CREATE TABLE timeline_events AS
                SELECT * FROM read_json_auto('{path_str}', ignore_errors=true)
                """
            )
            count = con.execute("SELECT COUNT(*) FROM timeline_events").fetchone()[0]
            logger.info("DuckDB store built: %d rows → %s", count, db_path)
        finally:
            con.close()
    except Exception as exc:
        logger.warning("Failed to build DuckDB store: %s", exc)
        # Don't leave a broken DB file
        if db_path.exists():
            try:
                db_path.unlink()
            except OSError:
                pass


async def push_to_timesketch(
    timeline_path: Path,
    sketch_name: str,
    timesketch_url: str,
    timesketch_token: str,
) -> dict:
    """
    Push timeline.jsonl to a Timesketch instance via the import client.
    Requires: pip install timesketch-import-client
    """
    try:
        from timesketch_import_client import importer  # type: ignore[import]
        from timesketch_api_client import config as ts_config  # type: ignore[import]
    except ImportError:
        return {"success": False, "error": "timesketch-import-client not installed"}

    try:
        ts_client = ts_config.get_client(
            host_uri=timesketch_url,
            auth_mode="http-basic",
        )
        with importer.ImportStreamer() as streamer:
            streamer.set_sketch(ts_client.create_sketch(sketch_name))
            streamer.set_timeline_name(sketch_name)
            streamer.add_file(str(timeline_path))
        return {"success": True, "sketch_name": sketch_name}
    except Exception as exc:
        logger.error("Timesketch push failed: %s", exc)
        return {"success": False, "error": str(exc)}
