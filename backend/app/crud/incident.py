from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.incident import Incident
from app.schemas.incident import IncidentCreate, IncidentUpdate


async def list_incidents(
    db: AsyncSession,
    limit: int = 100,
    offset: int = 0,
    status: str | None = None,
    incident_type: str | None = None,
    search: str | None = None,
    operator: str | None = None,
) -> tuple[list[Incident], int]:
    """Return (incidents, total_count) with optional server-side filters.

    All filters are AND-combined; ``search`` does a partial match on id and operator.
    """
    q = select(Incident)
    if status:
        q = q.where(Incident.status == status.upper())
    if incident_type:
        q = q.where(Incident.type == incident_type)
    if operator:
        q = q.where(Incident.operator.ilike(f"%{operator}%"))
    if search:
        q = q.where(
            or_(
                Incident.id.ilike(f"%{search}%"),
                Incident.operator.ilike(f"%{search}%"),
            )
        )
    total: int = (await db.scalar(select(func.count()).select_from(q.subquery()))) or 0
    incidents = list(
        (await db.execute(q.order_by(Incident.updated_at.desc()).offset(offset).limit(limit))).scalars()
    )
    return incidents, total


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
