from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def get_latest_entry(db: AsyncSession) -> AuditLog | None:
    result = await db.execute(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(1))
    return result.scalar_one_or_none()


async def create_entry(db: AsyncSession, entry: AuditLog) -> AuditLog:
    db.add(entry)
    await db.flush()
    return entry


async def list_entries(
    db: AsyncSession,
    event_type: str | None = None,
    actor_id: str | None = None,
    target_id: str | None = None,
    target_type: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[AuditLog]:
    stmt = select(AuditLog)
    if event_type:
        stmt = stmt.where(AuditLog.event_type == event_type)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if target_id:
        stmt = stmt.where(AuditLog.target_id == target_id)
    if target_type:
        stmt = stmt.where(AuditLog.target_type == target_type)
    if start_time:
        stmt = stmt.where(AuditLog.timestamp >= start_time)
    if end_time:
        stmt = stmt.where(AuditLog.timestamp <= end_time)
    stmt = stmt.order_by(AuditLog.timestamp.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_entries_with_total(
    db: AsyncSession,
    event_type: str | None = None,
    actor_id: str | None = None,
    target_id: str | None = None,
    target_type: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[AuditLog], int]:
    stmt = select(AuditLog)
    count_stmt = select(func.count()).select_from(AuditLog)
    if event_type:
        stmt = stmt.where(AuditLog.event_type == event_type)
        count_stmt = count_stmt.where(AuditLog.event_type == event_type)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
        count_stmt = count_stmt.where(AuditLog.actor_id == actor_id)
    if target_id:
        stmt = stmt.where(AuditLog.target_id == target_id)
        count_stmt = count_stmt.where(AuditLog.target_id == target_id)
    if target_type:
        stmt = stmt.where(AuditLog.target_type == target_type)
        count_stmt = count_stmt.where(AuditLog.target_type == target_type)
    if start_time:
        stmt = stmt.where(AuditLog.timestamp >= start_time)
        count_stmt = count_stmt.where(AuditLog.timestamp >= start_time)
    if end_time:
        stmt = stmt.where(AuditLog.timestamp <= end_time)
        count_stmt = count_stmt.where(AuditLog.timestamp <= end_time)
    stmt = stmt.order_by(AuditLog.timestamp.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    count_result = await db.execute(count_stmt)
    total = int(count_result.scalar() or 0)
    return list(result.scalars().all()), total


async def count_recent_login_failures(db: AsyncSession, username: str, window_days: int) -> int:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    result = await db.execute(
        select(func.count())
        .select_from(AuditLog)
        .where(AuditLog.event_type == "auth.login_failure")
        .where(AuditLog.actor_id == username)
        .where(AuditLog.timestamp >= since)
    )
    return int(result.scalar_one())


async def prune_old_entries(db: AsyncSession, retention_days: int) -> int:
    if retention_days <= 0:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(delete(AuditLog).where(AuditLog.timestamp < cutoff))
    await db.flush()
    return int(result.rowcount or 0)
