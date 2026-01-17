from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection_log import CollectionLog


async def list_logs(
    db: AsyncSession,
    incident_id: str,
    since_sequence: int = 0,
    until_sequence: int | None = None,
) -> list[CollectionLog]:
    stmt = (
        select(CollectionLog)
        .where(CollectionLog.incident_id == incident_id)
        .where(CollectionLog.sequence > since_sequence)
    )
    if until_sequence is not None:
        stmt = stmt.where(CollectionLog.sequence <= until_sequence)
    stmt = stmt.order_by(CollectionLog.sequence.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_last_sequence(db: AsyncSession, incident_id: str) -> int:
    stmt = (
        select(CollectionLog.sequence)
        .where(CollectionLog.incident_id == incident_id)
        .order_by(CollectionLog.sequence.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    last = result.scalar_one_or_none()
    return last or 0


async def create_log_entries(
    db: AsyncSession, incident_id: str, start_sequence: int, logs: list[dict]
) -> list[CollectionLog]:
    entries = []
    sequence = start_sequence
    for log in logs:
        entries.append(
            CollectionLog(
                id=f"{incident_id}-{sequence}",
                incident_id=incident_id,
                sequence=sequence,
                level=log["level"],
                message=log["message"],
            )
        )
        sequence += 1
    db.add_all(entries)
    await db.flush()
    return entries


async def delete_logs_for_incident(db: AsyncSession, incident_id: str) -> None:
    await db.execute(delete(CollectionLog).where(CollectionLog.incident_id == incident_id))
    await db.flush()
