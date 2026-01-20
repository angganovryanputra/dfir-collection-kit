from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import create_entry, get_latest_entry
from app.models.audit_log import AuditLog


def _hash_payload(payload: str) -> str:
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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
        metadata=metadata,
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
    except Exception:
        return
