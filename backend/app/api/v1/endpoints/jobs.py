from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.core.modules import build_modules
from app.crud.device import get_device
from app.crud.job import create_job, get_job, list_jobs_for_incident
from app.schemas.job import JobCreate, JobOut

router = APIRouter()


@router.post("/", response_model=JobOut, dependencies=[Depends(require_roles("operator", "admin"))])
async def create_job_endpoint(payload: JobCreate, db: AsyncSession = Depends(get_db)) -> JobOut:
    device = await get_device(db, payload.agent_id) if payload.agent_id else None
    if not payload.module_ids and not device:
        raise HTTPException(status_code=400, detail="module_ids required when agent_id is missing")
    modules = build_modules(payload.module_ids, device.os if device else None)
    output_path = f"{payload.incident_id}/{payload.id}"
    job = await create_job(db, payload, modules, output_path)
    return JobOut.model_validate(job)


@router.get("/{job_id}", response_model=JobOut)
async def get_job_endpoint(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> JobOut:
    job = await get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobOut.model_validate(job)


@router.get("/incident/{incident_id}", response_model=list[JobOut])
async def list_jobs_endpoint(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[JobOut]:
    jobs = await list_jobs_for_incident(db, incident_id)
    return [JobOut.model_validate(job) for job in jobs]
