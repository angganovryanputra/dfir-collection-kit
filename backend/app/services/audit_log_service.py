from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import create_entry, get_latest_entry
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def _hash_payload(payload: str) -> str:
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def compute_entry_payload_hash(entry: AuditLog) -> str:
    ts = entry.timestamp
    if isinstance(ts, str):
        ts_str = ts
    elif ts.tzinfo is None:
        ts_str = ts.replace(tzinfo=timezone.utc).isoformat()
    else:
        ts_str = ts.isoformat()

    payload = "|".join(
        [
            entry.event_type,
            entry.actor_type,
            entry.actor_id,
            entry.source,
            entry.action,
            entry.target_type or "",
            entry.target_id or "",
            entry.status,
            entry.message,
            ts_str,
            entry.previous_hash or "",
        ]
    )
    return _hash_payload(payload)


def verify_audit_log_chain(entries: list[AuditLog]) -> tuple[bool, str | None]:
    """Verify cryptographic hash chain integrity across audit log entries.

    Returns (True, None) if the chain is valid, or (False, error_description) on mismatch.
    """
    if not entries:
        return True, None

    sorted_entries = sorted(entries, key=lambda e: e.timestamp)
    expected_previous_hashes: set[str | None] = {None}
    is_first = True

    for entry in sorted_entries:
        expected_hash = compute_entry_payload_hash(entry)
        if entry.entry_hash != expected_hash:
            return False, f"Hash mismatch at entry {entry.id}"

        if entry.event_type == "audit.archive_checkpoint":
            expected_previous_hashes = {entry.entry_hash, entry.previous_hash}
            is_first = False
            continue

        if is_first:
            if entry.previous_hash is not None:
                return False, f"Broken chain link at entry {entry.id}"
            is_first = False
        else:
            if entry.previous_hash not in expected_previous_hashes:
                return False, f"Broken chain link at entry {entry.id}"

        expected_previous_hashes = {entry.entry_hash}

    return True, None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def record_event(
    db: AsyncSession,
    *,
    event_type: str,
    actor_type: str,
    actor_id: str,
    source: str,
    action: str,
    target_type: str | None,
    target_id: str | None,
    status: str,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    timestamp = _utc_now()
    metadata = metadata or {}
    previous = await get_latest_entry(db)
    previous_hash = previous.entry_hash if previous else None
    payload = "|".join(
        [
            event_type,
            actor_type,
            actor_id,
            source,
            action,
            target_type or "",
            target_id or "",
            status,
            message,
            timestamp.isoformat(),
            previous_hash or "",
        ]
    )
    entry_hash = _hash_payload(payload)
    entry = AuditLog(
        id=str(uuid4()),
        event_id=str(uuid4()),
        timestamp=timestamp,
        event_type=event_type,
        actor_type=actor_type,
        actor_id=actor_id,
        source=source,
        action=action,
        target_type=target_type,
        target_id=target_id,
        status=status,
        message=message,
        event_metadata=metadata,
        previous_hash=previous_hash,
        entry_hash=entry_hash,
    )
    await create_entry(db, entry)


async def safe_record_event(
    db: AsyncSession,
    *,
    event_type: str,
    actor_type: str,
    actor_id: str,
    source: str,
    action: str,
    target_type: str | None,
    target_id: str | None,
    status: str,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    try:
        await record_event(
            db,
            event_type=event_type,
            actor_type=actor_type,
            actor_id=actor_id,
            source=source,
            action=action,
            target_type=target_type,
            target_id=target_id,
            status=status,
            message=message,
            metadata=metadata,
        )
    except Exception as exc:
        logger.warning("Audit log write failed (non-critical): %s", exc)
        return
