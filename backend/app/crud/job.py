from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.incident import Incident
from app.models.job import Job
from app.schemas.job import JobCreate


# Status values are written by agents, S3 ingestion, and demo fixtures.  Keep
# their accepted terminal forms in one place so a completed acquisition cannot
# be mistaken for an active job by a later workflow stage.
SUCCESSFUL_JOB_STATUSES = frozenset({"complete", "completed", "done"})
FAILED_JOB_STATUSES = frozenset({"failed", "cancelled", "canceled", "error"})
TERMINAL_JOB_STATUSES = SUCCESSFUL_JOB_STATUSES | FAILED_JOB_STATUSES


def normalized_job_status(status: str | None) -> str:
    return (status or "").strip().lower()


def is_successful_job_status(status: str | None) -> bool:
    return normalized_job_status(status) in SUCCESSFUL_JOB_STATUSES


def is_terminal_job_status(status: str | None) -> bool:
    return normalized_job_status(status) in TERMINAL_JOB_STATUSES


async def sync_incident_collection_status(db: AsyncSession, incident_id: str) -> Incident | None:
    """Apply the aggregate collection state after a terminal job update.

    An incident represents all selected targets.  It becomes complete only
    when every job completed successfully; any terminal failure makes the
    collection retryable only after all outstanding jobs have settled.
    """
    incident = await db.get(Incident, incident_id)
    if not incident or incident.status == "CLOSED":
        return incident

    jobs = await list_jobs_for_incident(db, incident_id)
    if not jobs:
        return incident

    if all(is_terminal_job_status(job.status) for job in jobs):
        if all(is_successful_job_status(job.status) for job in jobs):
            incident.status = "COLLECTION_COMPLETE"
            incident.collection_progress = 100
            incident.collection_phase = "uploading"
        else:
            incident.status = "COLLECTION_FAILED"
    else:
        incident.status = "COLLECTION_IN_PROGRESS"
        incident.collection_phase = "collecting"
    await db.flush()
    return incident


async def create_job(db: AsyncSession, payload: JobCreate, modules: list[dict], output_path: str) -> Job:
    job = Job(
        id=payload.id,
        incident_id=payload.incident_id,
        agent_id=payload.agent_id,
        status="pending",
        modules=modules,
        output_path=output_path,
    )
    db.add(job)
    await db.flush()
    return job


async def get_job(db: AsyncSession, job_id: str) -> Job | None:
    result = await db.execute(select(Job).where(Job.id == job_id))
    return result.scalar_one_or_none()


async def list_jobs_for_incident(db: AsyncSession, incident_id: str) -> list[Job]:
    result = await db.execute(select(Job).where(Job.incident_id == incident_id).order_by(Job.created_at.desc()))
    return list(result.scalars().all())


async def get_next_job_for_agent(db: AsyncSession, agent_id: str) -> Job | None:
    # Filter by the pre-assigned agent_id so an agent only picks up its own jobs.
    # FOR UPDATE SKIP LOCKED prevents two concurrent agents from claiming the same row.
    result = await db.execute(
        select(Job)
        .where(Job.status == "pending", Job.agent_id == agent_id)
        .order_by(Job.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    job = result.scalar_one_or_none()
    if not job:
        return None
    job.status = "assigned"
    await db.flush()
    return job


async def update_job_status(db: AsyncSession, job_id: str, status: str, message: str | None = None) -> Job | None:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        return None
    job.status = status
    if message is not None:
        job.message = message
    await db.flush()
    return job


async def count_active_jobs(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).select_from(Job).where(
            func.lower(Job.status).not_in(TERMINAL_JOB_STATUSES)
        )
    )
    return int(result.scalar_one())
