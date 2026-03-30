from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evidence import EvidenceFolder, EvidenceItem
from app.schemas.evidence import EvidenceFolderCreate, EvidenceItemCreate



async def list_folders(db: AsyncSession, limit: int = 1000) -> list[EvidenceFolder]:
    result = await db.execute(select(EvidenceFolder).order_by(EvidenceFolder.date.desc()).limit(limit))
    return list(result.scalars().all())


async def get_folder(db: AsyncSession, folder_id: str) -> EvidenceFolder | None:
    result = await db.execute(select(EvidenceFolder).where(EvidenceFolder.id == folder_id))
    return result.scalar_one_or_none()


async def create_folder(db: AsyncSession, payload: EvidenceFolderCreate) -> EvidenceFolder:
    folder = EvidenceFolder(**payload.model_dump())
    db.add(folder)
    await db.flush()
    return folder


async def list_items(db: AsyncSession, incident_id: str | None = None, limit: int = 5000) -> list[EvidenceItem]:
    stmt = select(EvidenceItem)
    if incident_id:
        stmt = stmt.where(EvidenceItem.incident_id == incident_id)
    result = await db.execute(stmt.order_by(EvidenceItem.collected_at.desc()).limit(limit))
    return list(result.scalars().all())


async def get_item(db: AsyncSession, evidence_id: str) -> EvidenceItem | None:
    result = await db.execute(select(EvidenceItem).where(EvidenceItem.id == evidence_id))
    return result.scalar_one_or_none()


async def create_item(db: AsyncSession, payload: EvidenceItemCreate) -> EvidenceItem:
    item = EvidenceItem(**payload.model_dump())
    db.add(item)
    await db.flush()
    return item


async def has_evidence_for_incident(db: AsyncSession, incident_id: str) -> bool:
    result = await db.execute(
        select(EvidenceItem.id).where(EvidenceItem.incident_id == incident_id).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def lock_evidence_for_incident(db: AsyncSession, incident_id: str) -> None:
    await db.execute(
        update(EvidenceFolder)
        .where(EvidenceFolder.incident_id == incident_id)
        .values(status="LOCKED")
    )
    await db.execute(
        update(EvidenceItem)
        .where(EvidenceItem.incident_id == incident_id)
        .values(status="LOCKED")
    )
