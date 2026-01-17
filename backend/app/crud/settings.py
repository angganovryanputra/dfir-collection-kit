from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import SystemSettings
from app.schemas.settings import SystemSettingsCreate


async def get_settings(db: AsyncSession) -> SystemSettings | None:
    result = await db.execute(select(SystemSettings).limit(1))
    return result.scalar_one_or_none()


async def upsert_settings(db: AsyncSession, payload: SystemSettingsCreate) -> SystemSettings:
    current = await get_settings(db)
    data = payload.model_dump()
    if current:
        for key, value in data.items():
            setattr(current, key, value)
        await db.flush()
        return current
    settings = SystemSettings(**data)
    db.add(settings)
    await db.flush()
    return settings
