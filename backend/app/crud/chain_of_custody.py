from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import compute_chain_hash
from app.models.chain_of_custody import ChainOfCustodyEntry
from app.schemas.chain_of_custody import ChainOfCustodyEntryCreate


async def list_entries(db: AsyncSession, incident_id: str | None = None) -> list[ChainOfCustodyEntry]:
    stmt = select(ChainOfCustodyEntry)
    if incident_id:
        stmt = stmt.where(ChainOfCustodyEntry.incident_id == incident_id)
    result = await db.execute(stmt.order_by(ChainOfCustodyEntry.sequence.asc()))
    return list(result.scalars().all())


def verify_entries(entries: list[ChainOfCustodyEntry]) -> None:
    previous_hash = None
    for entry in entries:
        expected_hash = compute_chain_hash(
            entry.incident_id,
            entry.sequence,
            entry.timestamp,
            entry.action,
            entry.actor,
            entry.target,
            previous_hash,
        )
        if entry.previous_hash != previous_hash or entry.entry_hash != expected_hash:
            raise ValueError("Chain-of-custody integrity check failed")
        previous_hash = entry.entry_hash


async def create_entry(db: AsyncSession, payload: ChainOfCustodyEntryCreate) -> ChainOfCustodyEntry:
    existing = await db.execute(select(ChainOfCustodyEntry).where(ChainOfCustodyEntry.id == payload.id))
    if existing.scalar_one_or_none():
        raise ValueError("Chain-of-custody entry already exists")
    last_entry = await db.execute(
        select(ChainOfCustodyEntry)
        .where(ChainOfCustodyEntry.incident_id == payload.incident_id)
        .order_by(ChainOfCustodyEntry.sequence.desc())
        .limit(1)
    )
    previous = last_entry.scalar_one_or_none()
    sequence = 1 if not previous else previous.sequence + 1
    previous_hash = previous.entry_hash if previous else None
    entry_hash = compute_chain_hash(
        payload.incident_id,
        sequence,
        payload.timestamp,
        payload.action,
        payload.actor,
        payload.target,
        previous_hash,
    )
    entry = ChainOfCustodyEntry(
        **payload.model_dump(),
        sequence=sequence,
        previous_hash=previous_hash,
        entry_hash=entry_hash,
    )
    db.add(entry)
    await db.flush()
    return entry
