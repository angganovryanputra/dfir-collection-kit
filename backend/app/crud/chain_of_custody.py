from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chain_of_custody import ChainOfCustodyEntry
from app.schemas.chain_of_custody import ChainOfCustodyEntryCreate


async def list_entries(db: AsyncSession, incident_id: str | None = None) -> list[ChainOfCustodyEntry]:
    stmt = select(ChainOfCustodyEntry)
    if incident_id:
        stmt = stmt.where(ChainOfCustodyEntry.incident_id == incident_id)
    result = await db.execute(stmt.order_by(ChainOfCustodyEntry.timestamp.desc()))
    return list(result.scalars().all())


async def create_entry(db: AsyncSession, payload: ChainOfCustodyEntryCreate) -> ChainOfCustodyEntry:
    entry = ChainOfCustodyEntry(**payload.model_dump())
    db.add(entry)
    await db.flush()
    return entry
