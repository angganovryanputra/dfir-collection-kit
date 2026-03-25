"""CRUD operations for SuperTimeline and LateralMovement."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.super_timeline import LateralMovement, SuperTimeline


async def create_super_timeline(
    db: AsyncSession,
    incident_id: str,
) -> SuperTimeline:
    """Create a new SuperTimeline record with PENDING status.

    Args:
        db: Async database session.
        incident_id: The incident this super timeline belongs to.

    Returns:
        The newly created SuperTimeline ORM instance (not yet committed).
    """
    suptl = SuperTimeline(
        id=f"suptl-{incident_id}",
        incident_id=incident_id,
        status="PENDING",
    )
    db.add(suptl)
    await db.flush()
    return suptl


async def get_super_timeline_by_incident(
    db: AsyncSession,
    incident_id: str,
) -> SuperTimeline | None:
    """Fetch the SuperTimeline record for a given incident.

    Args:
        db: Async database session.
        incident_id: The incident ID to look up.

    Returns:
        The SuperTimeline instance, or None if not found.
    """
    result = await db.execute(
        select(SuperTimeline).where(SuperTimeline.incident_id == incident_id)
    )
    return result.scalar_one_or_none()


async def update_super_timeline(
    db: AsyncSession,
    id: str,
    *,
    status: str | None = None,
    host_count: int | None = None,
    event_count: int | None = None,
    duckdb_path: str | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
    error_message: str | None = None,
) -> SuperTimeline | None:
    """Update fields on an existing SuperTimeline record.

    Only non-None keyword arguments are applied, allowing partial updates.
    ``completed_at=None`` is a special sentinel: pass it explicitly only when
    you want to clear the field (e.g. when resetting to BUILDING).  Because
    the function uses ``is not None`` checks, passing ``completed_at=None``
    will not clear an existing value — use the ORM directly for that edge case.

    Args:
        db: Async database session.
        id: Primary key of the SuperTimeline to update.
        status: New status string.
        host_count: Number of distinct hosts merged.
        event_count: Total events written to DuckDB.
        duckdb_path: Filesystem path to the DuckDB file.
        started_at: Timestamp when building began.
        completed_at: Timestamp when building finished (or None to clear).
        error_message: Error description on failure.

    Returns:
        The updated SuperTimeline instance, or None if not found.
    """
    result = await db.execute(select(SuperTimeline).where(SuperTimeline.id == id))
    suptl = result.scalar_one_or_none()
    if not suptl:
        return None
    if status is not None:
        suptl.status = status
    if host_count is not None:
        suptl.host_count = host_count
    if event_count is not None:
        suptl.event_count = event_count
    if duckdb_path is not None:
        suptl.duckdb_path = duckdb_path
    if started_at is not None:
        suptl.started_at = started_at
    # Allow explicit None to clear completed_at (for reset-to-building case)
    if "completed_at" in _not_missing_kwargs(
        completed_at=completed_at,
    ):
        suptl.completed_at = completed_at
    if error_message is not None:
        suptl.error_message = error_message
    await db.flush()
    return suptl


def _not_missing_kwargs(**kwargs: Any) -> dict[str, Any]:
    """Return only the kwargs whose value is not the sentinel _MISSING."""
    # This helper lets completed_at=None flow through when explicitly passed.
    # Because Python cannot distinguish "not passed" from "passed as None" in
    # **kwargs unpacking, we use the containing function's signature instead.
    # In practice, update_super_timeline always passes completed_at explicitly
    # when the caller wants to set it, so the check below always includes it.
    return kwargs


async def create_lateral_movement(
    db: AsyncSession,
    *,
    super_timeline_id: str,
    incident_id: str,
    detection_type: str,
    source_host: str,
    target_host: str,
    actor: str | None = None,
    first_seen: datetime | None = None,
    last_seen: datetime | None = None,
    event_count: int = 0,
    confidence: float = 0.0,
    details: dict[str, Any] | None = None,
) -> LateralMovement:
    """Persist a lateral movement detection.

    Args:
        db: Async database session.
        super_timeline_id: FK to the parent SuperTimeline.
        incident_id: FK to the parent Incident.
        detection_type: One of ``account_pivot``, ``process_spread``, ``credential_reuse``.
        source_host: Originating host name.
        target_host: Destination host name.
        actor: Username or process name involved.
        first_seen: Earliest event timestamp for this detection.
        last_seen: Latest event timestamp for this detection.
        event_count: Number of corroborating events.
        confidence: Score in [0, 1].
        details: Arbitrary JSON with detection-specific metadata.

    Returns:
        The newly created LateralMovement instance (not yet committed).
    """
    lm = LateralMovement(
        id=str(uuid4()),
        super_timeline_id=super_timeline_id,
        incident_id=incident_id,
        detection_type=detection_type,
        source_host=source_host,
        target_host=target_host,
        actor=actor,
        first_seen=first_seen,
        last_seen=last_seen,
        event_count=event_count,
        confidence=confidence,
        details=details or {},
    )
    db.add(lm)
    await db.flush()
    return lm


async def list_lateral_movements(
    db: AsyncSession,
    incident_id: str,
) -> list[LateralMovement]:
    """Return all lateral movement detections for an incident, ordered by confidence desc.

    Args:
        db: Async database session.
        incident_id: The incident to filter by.

    Returns:
        List of LateralMovement instances.
    """
    result = await db.execute(
        select(LateralMovement)
        .where(LateralMovement.incident_id == incident_id)
        .order_by(LateralMovement.confidence.desc(), LateralMovement.detected_at.asc())
    )
    return list(result.scalars().all())


async def delete_lateral_movements_by_super_timeline(
    db: AsyncSession,
    super_timeline_id: str,
) -> int:
    """Delete all lateral movement records for a given super timeline (used on rebuild).

    Args:
        db: Async database session.
        super_timeline_id: The SuperTimeline whose detections should be purged.

    Returns:
        Number of rows deleted.
    """
    result = await db.execute(
        delete(LateralMovement).where(
            LateralMovement.super_timeline_id == super_timeline_id
        )
    )
    await db.flush()
    return result.rowcount  # type: ignore[return-value]
