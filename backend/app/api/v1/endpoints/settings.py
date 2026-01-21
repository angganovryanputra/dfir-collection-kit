from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.settings import get_settings, upsert_settings
from app.models.user import User
from app.schemas.settings import SystemSettingsCreate, SystemSettingsOut
from app.services.audit_log_service import safe_record_event
from app.crud.audit_log import prune_old_entries
from app.services.system_settings_service import get_runtime_settings, set_runtime_settings

router = APIRouter()


@router.get("/", response_model=SystemSettingsOut | None, dependencies=[Depends(require_roles("admin"))])
async def get_system_settings(db: AsyncSession = Depends(get_db)) -> SystemSettingsOut | None:
    settings = await get_settings(db)
    if settings:
        return SystemSettingsOut.model_validate(settings)
    runtime = await get_runtime_settings(db)
    return SystemSettingsOut(**runtime.__dict__)


@router.put("/", response_model=SystemSettingsOut, dependencies=[Depends(require_roles("admin"))])
async def put_system_settings(
    payload: SystemSettingsCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SystemSettingsOut:
    if not payload.evidence_storage_path.strip().startswith("/"):
        raise HTTPException(status_code=400, detail="evidence_storage_path must be an absolute path")
    if payload.max_file_size_gb <= 0:
        raise HTTPException(status_code=400, detail="max_file_size_gb must be greater than 0")
    if payload.collection_timeout_min <= 0:
        raise HTTPException(status_code=400, detail="collection_timeout_min must be greater than 0")
    if payload.max_concurrent_jobs < 0:
        raise HTTPException(status_code=400, detail="max_concurrent_jobs cannot be negative")
    if payload.retry_attempts < 0:
        raise HTTPException(status_code=400, detail="retry_attempts cannot be negative")
    if payload.session_timeout_min <= 0:
        raise HTTPException(status_code=400, detail="session_timeout_min must be greater than 0")
    if payload.max_failed_logins < 0:
        raise HTTPException(status_code=400, detail="max_failed_logins cannot be negative")
    if payload.log_retention_days < 0:
        raise HTTPException(status_code=400, detail="log_retention_days cannot be negative")
    if payload.hash_algorithm.upper() not in {"SHA-256", "SHA-1"}:
        raise HTTPException(status_code=400, detail="hash_algorithm must be SHA-256 or SHA-1")
    if payload.export_format.upper() != "ZIP":
        raise HTTPException(status_code=400, detail="export_format must be ZIP")
    current = await get_settings(db)
    settings = await upsert_settings(db, payload)
    settings_out = SystemSettingsOut.model_validate(settings)
    set_runtime_settings(settings_out)
    try:
        await prune_old_entries(db, settings_out.log_retention_days)
    except Exception:
        pass
    changed_keys = []
    if current:
        for key, value in payload.model_dump().items():
            if getattr(current, key) != value:
                changed_keys.append(key)
    else:
        changed_keys = list(payload.model_dump().keys())
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
        metadata={"changed": changed_keys},
    )
    return settings_out
