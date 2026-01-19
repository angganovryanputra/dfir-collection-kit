from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.incident import Incident
from app.schemas.incident import IncidentCreate, IncidentUpdate


async def list_incidents(db: AsyncSession) -> list[Incident]:
    result = await db.execute(select(Incident).order_by(Incident.updated_at.desc()))
    return list(result.scalars().all())


async def get_incident(db: AsyncSession, incident_id: str) -> Incident | None:
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    return result.scalar_one_or_none()


async def create_incident(db: AsyncSession, payload: IncidentCreate) -> Incident:
    incident = Incident(**payload.model_dump())
    db.add(incident)
    await db.flush()
    return incident


async def update_incident(db: AsyncSession, incident_id: str, payload: IncidentUpdate) -> Incident | None:
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        return None
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(incident, key, value)
    await db.flush()
    return incident


async def delete_incident(db: AsyncSession, incident_id: str) -> bool:
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        return False
    await db.delete(incident)
    await db.flush()
    return True
