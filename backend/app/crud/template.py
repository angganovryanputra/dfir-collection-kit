from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.template import IncidentTemplate
from app.schemas.template import IncidentTemplateCreate, IncidentTemplateUpdate


async def list_templates(db: AsyncSession) -> list[IncidentTemplate]:
    result = await db.execute(select(IncidentTemplate).order_by(IncidentTemplate.created_at.desc()))
    return list(result.scalars().all())


async def get_template(db: AsyncSession, template_id: str) -> IncidentTemplate | None:
    result = await db.execute(select(IncidentTemplate).where(IncidentTemplate.id == template_id))
    return result.scalar_one_or_none()


async def create_template(db: AsyncSession, payload: IncidentTemplateCreate) -> IncidentTemplate:
    template = IncidentTemplate(**payload.model_dump())
    db.add(template)
    await db.flush()
    return template


async def update_template(
    db: AsyncSession, template_id: str, payload: IncidentTemplateUpdate
) -> IncidentTemplate | None:
    result = await db.execute(select(IncidentTemplate).where(IncidentTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        return None
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(template, key, value)
    await db.flush()
    return template


async def increment_usage(db: AsyncSession, template_id: str) -> IncidentTemplate | None:
    result = await db.execute(select(IncidentTemplate).where(IncidentTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        return None
    template.usage_count += 1
    await db.flush()
    return template


async def delete_template(db: AsyncSession, template_id: str) -> bool:
    result = await db.execute(select(IncidentTemplate).where(IncidentTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        return False
    await db.delete(template)
    await db.flush()
    return True
