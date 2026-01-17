from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collector import Collector
from app.schemas.collector import CollectorCreate


async def list_collectors(db: AsyncSession) -> list[Collector]:
    result = await db.execute(select(Collector).order_by(Collector.name.asc()))
    return list(result.scalars().all())


async def create_collector(db: AsyncSession, payload: CollectorCreate) -> Collector:
    collector = Collector(**payload.model_dump())
    db.add(collector)
    await db.flush()
    return collector


async def update_collector_status(
    db: AsyncSession, collector_id: str, status: str
) -> Collector | None:
    result = await db.execute(select(Collector).where(Collector.id == collector_id))
    collector = result.scalar_one_or_none()
    if not collector:
        return None
    collector.status = status
    await db.flush()
    return collector
