from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.settings import get_settings, upsert_settings
from app.models.user import User
from app.schemas.settings import SystemSettingsCreate, SystemSettingsOut
from app.services.audit_log_service import safe_record_event

router = APIRouter()


@router.get("/", response_model=SystemSettingsOut | None, dependencies=[Depends(require_roles("admin"))])
async def get_system_settings(db: AsyncSession = Depends(get_db)) -> SystemSettingsOut | None:
    settings = await get_settings(db)
    if not settings:
        return None
    return SystemSettingsOut.model_validate(settings)


@router.put("/", response_model=SystemSettingsOut, dependencies=[Depends(require_roles("admin"))])
async def put_system_settings(
    payload: SystemSettingsCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SystemSettingsOut:
    settings = await upsert_settings(db, payload)
    await safe_record_event(
        db,
        event_type="admin_settings_changed",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="update settings",
        target_type="settings",
        target_id=settings.id if settings else None,
        status="success",
        message="System settings updated",
        metadata=payload.model_dump(),
    )
    return SystemSettingsOut.model_validate(settings)
