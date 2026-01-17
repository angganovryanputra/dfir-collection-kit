from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evidence import EvidenceFolder, EvidenceItem
from app.schemas.evidence import EvidenceFolderCreate, EvidenceItemCreate



async def list_folders(db: AsyncSession) -> list[EvidenceFolder]:
    result = await db.execute(select(EvidenceFolder).order_by(EvidenceFolder.date.desc()))
    return list(result.scalars().all())


async def create_folder(db: AsyncSession, payload: EvidenceFolderCreate) -> EvidenceFolder:
    folder = EvidenceFolder(**payload.model_dump())
    db.add(folder)
    await db.flush()
    return folder


async def list_items(db: AsyncSession, incident_id: str | None = None) -> list[EvidenceItem]:
    stmt = select(EvidenceItem)
    if incident_id:
        stmt = stmt.where(EvidenceItem.incident_id == incident_id)
    result = await db.execute(stmt.order_by(EvidenceItem.collected_at.desc()))
    return list(result.scalars().all())


async def create_item(db: AsyncSession, payload: EvidenceItemCreate) -> EvidenceItem:
    item = EvidenceItem(**payload.model_dump())
    db.add(item)
    await db.flush()
    return item
