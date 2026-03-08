"""
YARA scanning service.

Scans files in the extracted/ evidence directory against YARA rules.
Requires: pip install yara-python
Rules directory: configurable, defaults to /opt/yara-rules
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Extensions to scan (skip obviously uninteresting files)
_SCAN_EXTENSIONS = {
    ".exe", ".dll", ".sys", ".bat", ".ps1", ".vbs", ".js", ".wsf",
    ".lnk", ".hta", ".scr", ".com", ".pif", ".jar", ".zip", ".7z",
    ".rar", ".doc", ".docm", ".xls", ".xlsm", ".ppt", ".pptm",
    ".pdf", ".iso", ".img", ".bin",
}
# Max file size to scan (50 MB — avoid scanning huge raw images)
_MAX_SCAN_BYTES = 50 * 1024 * 1024


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    try:
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
    except OSError:
        return ""
    return h.hexdigest()


def _load_rules(yara_rules_path: str):  # type: ignore[return]
    """Compile YARA rules from directory. Returns compiled rules or None."""
    if not yara_rules_path:
        return None
    rules_dir = Path(yara_rules_path)
    if not rules_dir.exists():
        logger.info("YARA rules path not found: %s — skipping", yara_rules_path)
        return None
    try:
        import yara  # type: ignore[import]
    except ImportError:
        logger.info("yara-python not installed — skipping YARA scan")
        return None

    # Collect .yar / .yara files
    rule_files = list(rules_dir.rglob("*.yar")) + list(rules_dir.rglob("*.yara"))
    if not rule_files:
        logger.info("No YARA rule files found in %s", yara_rules_path)
        return None

    filepaths = {f"ns_{i}": str(f) for i, f in enumerate(rule_files)}
    try:
        rules = yara.compile(filepaths=filepaths)
        logger.info("Loaded %d YARA rule files", len(rule_files))
        return rules
    except Exception as exc:
        logger.warning("Failed to compile YARA rules: %s", exc)
        return None


async def run_yara_scan(
    incident_id: str,
    processing_job_id: str,
    extracted_dir: Path,
    yara_rules_path: str,
    db: AsyncSession,
) -> int:
    """
    Scan files in extracted_dir against YARA rules.
    Returns number of matches stored.
    """
    from app.models.analytics import YaraMatch
    from sqlalchemy import delete

    rules = _load_rules(yara_rules_path)
    if rules is None:
        return 0

    if not extracted_dir.exists():
        logger.info("extracted/ dir not found — skipping YARA scan")
        return 0

    # Clear previous YARA matches for this processing job
    await db.execute(
        delete(YaraMatch).where(YaraMatch.processing_job_id == processing_job_id)
    )

    records: list[YaraMatch] = []

    for file_path in extracted_dir.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in _SCAN_EXTENSIONS:
            continue
        try:
            file_size = file_path.stat().st_size
        except OSError:
            continue
        if file_size > _MAX_SCAN_BYTES:
            continue

        try:
            matches = rules.match(str(file_path))
        except Exception as exc:
            logger.debug("YARA scan error on %s: %s", file_path.name, exc)
            continue

        if not matches:
            continue

        sha256 = _sha256_file(file_path)
        rel_path = str(file_path.relative_to(extracted_dir))

        for match in matches:
            # Extract matched strings [{offset, name, data}]
            strings_info: list[dict] = []
            for string_match in match.strings:
                for instance in string_match.instances:
                    strings_info.append({
                        "offset": instance.offset,
                        "name": string_match.identifier,
                        "data": instance.matched_data.hex(),
                    })
                    if len(strings_info) >= 20:
                        break
                if len(strings_info) >= 20:
                    break

            records.append(
                YaraMatch(
                    id=str(uuid.uuid4()),
                    incident_id=incident_id,
                    processing_job_id=processing_job_id,
                    rule_name=match.rule,
                    rule_namespace=match.namespace,
                    matched_file=rel_path,
                    file_size=file_size,
                    file_sha256=sha256,
                    strings=strings_info,
                    severity="high",
                )
            )

    if records:
        db.add_all(records)
        await db.flush()

    logger.info("YARA scan complete for incident %s: %d file matches", incident_id, len(records))
    return len(records)
