from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.audit_log import list_entries_with_total, prune_old_entries
from app.schemas.audit_log import AuditLogListResponse, AuditLogOut
from app.services.audit_log_service import safe_record_event
from app.services.system_settings_service import get_runtime_settings

router = APIRouter()


@router.get("/", response_model=AuditLogListResponse, dependencies=[Depends(require_roles("admin"))])
async def get_audit_logs(
    db: AsyncSession = Depends(get_db),
    event_type: str | None = Query(default=None),
    actor_id: str | None = Query(default=None),
    target_id: str | None = Query(default=None),
    incident_id: str | None = Query(default=None),
    job_id: str | None = Query(default=None),
    evidence_id: str | None = Query(default=None),
    start_time: str | None = Query(default=None),
    end_time: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> AuditLogListResponse:
    def parse_time(value: str | None, label: str) -> datetime | None:
        if not value:
            return None
        try:
            normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
            return datetime.fromisoformat(normalized)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid {label}") from exc

    target_type = None
    target_filter = target_id
    if incident_id:
        target_type = "incident"
        target_filter = incident_id
    if job_id:
        target_type = "job"
        target_filter = job_id
    if evidence_id:
        target_type = "evidence"
        target_filter = evidence_id

    try:
        runtime_settings = await get_runtime_settings(db)
        await prune_old_entries(db, runtime_settings.log_retention_days)
    except Exception:
        pass

    entries, total = await list_entries_with_total(
        db,
        event_type=event_type,
        actor_id=actor_id,
        target_id=target_filter,
        target_type=target_type,
        start_time=parse_time(start_time, "start_time"),
        end_time=parse_time(end_time, "end_time"),
        limit=limit,
        offset=offset,
    )
    return AuditLogListResponse(
        total=total,
        entries=[AuditLogOut.model_validate(entry) for entry in entries],
    )


@router.post("/prune", dependencies=[Depends(require_roles("admin"))])
async def prune_audit_logs(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> dict:
    runtime_settings = await get_runtime_settings(db)
    pruned = await prune_old_entries(db, runtime_settings.log_retention_days)
    await safe_record_event(
        db,
        event_type="audit_logs_pruned",
        actor_type="user",
        actor_id=user.id,
        source="backend",
        action="prune audit logs",
        target_type="audit_log",
        target_id=None,
        status="success",
        message="Audit logs pruned",
        metadata={"retention_days": runtime_settings.log_retention_days, "deleted": pruned},
    )
    return {"deleted": pruned}
