from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_roles
from app.crud.settings import get_settings, upsert_settings
from app.schemas.settings import SystemSettingsCreate, SystemSettingsOut

router = APIRouter()


@router.get("/", response_model=SystemSettingsOut | None, dependencies=[Depends(require_roles("admin"))])
async def get_system_settings(db: AsyncSession = Depends(get_db)) -> SystemSettingsOut | None:
    settings = await get_settings(db)
    if not settings:
        return None
    return SystemSettingsOut.model_validate(settings)


@router.put("/", response_model=SystemSettingsOut, dependencies=[Depends(require_roles("admin"))])
async def put_system_settings(
    payload: SystemSettingsCreate, db: AsyncSession = Depends(get_db)
) -> SystemSettingsOut:
    settings = await upsert_settings(db, payload)
    return SystemSettingsOut.model_validate(settings)
