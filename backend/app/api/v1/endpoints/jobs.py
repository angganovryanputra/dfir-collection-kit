from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.core.modules import build_modules
from app.crud.device import get_device
from app.crud.job import count_active_jobs, create_job, get_job, list_jobs_for_incident, update_job_status
from app.schemas.job import JobCreate, JobOut
from app.services.audit_log_service import safe_record_event
from app.services.system_settings_service import get_runtime_settings

router = APIRouter()


@router.post("/", response_model=JobOut, dependencies=[Depends(require_roles("operator", "admin"))])
async def create_job_endpoint(
    payload: JobCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> JobOut:
    runtime_settings = await get_runtime_settings(db)
    if runtime_settings.max_concurrent_jobs > 0:
        active_jobs = await count_active_jobs(db)
        if active_jobs >= runtime_settings.max_concurrent_jobs:
            raise HTTPException(status_code=409, detail="Job concurrency limit reached")
    device = await get_device(db, payload.agent_id) if payload.agent_id else None
    if not payload.module_ids and not device:
        raise HTTPException(status_code=400, detail="module_ids required when agent_id is missing")
    modules = build_modules(payload.module_ids, device.os if device else None)
    output_path = f"{payload.incident_id}/{payload.id}"
    job = await create_job(db, payload, modules, output_path)
    await safe_record_event(
        db,
        event_type="job_created",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="create job",
        target_type="job",
        target_id=job.id,
        status="success",
        message="Job created",
        metadata={"incident_id": job.incident_id, "agent_id": job.agent_id},
    )
    return JobOut.model_validate(job)


@router.get("/{job_id}", response_model=JobOut)
async def get_job_endpoint(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> JobOut:
    job = await get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await safe_record_event(
        db,
        event_type="job.read",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="read job",
        target_type="job",
        target_id=job.id,
        status="success",
        message="Job fetched",
        metadata={"incident_id": job.incident_id},
    )
    return JobOut.model_validate(job)


@router.get("/incident/{incident_id}", response_model=list[JobOut])
async def list_jobs_endpoint(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[JobOut]:
    jobs = await list_jobs_for_incident(db, incident_id)
    await safe_record_event(
        db,
        event_type="job.list",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="list jobs",
        target_type="incident",
        target_id=incident_id,
        status="success",
        message="Jobs listed",
        metadata={"count": len(jobs)},
    )
    return [JobOut.model_validate(job) for job in jobs]


@router.post(
    "/{job_id}/cancel",
    response_model=JobOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def cancel_job_endpoint(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> JobOut:
    job = await update_job_status(db, job_id, "cancelled", "Job cancelled by operator")
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await safe_record_event(
        db,
        event_type="job.cancel",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="cancel job",
        target_type="job",
        target_id=job.id,
        status="success",
        message="Job cancelled",
        metadata={"incident_id": job.incident_id},
    )
    return JobOut.model_validate(job)
