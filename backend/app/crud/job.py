from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job
from app.schemas.job import JobCreate


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
            Job.status.not_in(["complete", "failed", "cancelled"])
        )
    )
    return int(result.scalar_one())
