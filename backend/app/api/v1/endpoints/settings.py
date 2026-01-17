from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.crud.settings import get_settings, upsert_settings
from app.schemas.settings import SystemSettingsCreate, SystemSettingsOut

router = APIRouter()


@router.get("/", response_model=SystemSettingsOut | None)
async def get_system_settings(db: AsyncSession = Depends(get_db)) -> SystemSettingsOut | None:
    settings = await get_settings(db)
    if not settings:
        return None
    return SystemSettingsOut.model_validate(settings)


@router.put("/", response_model=SystemSettingsOut)
async def put_system_settings(
    payload: SystemSettingsCreate, db: AsyncSession = Depends(get_db)
) -> SystemSettingsOut:
    settings = await upsert_settings(db, payload)
    return SystemSettingsOut.model_validate(settings)
