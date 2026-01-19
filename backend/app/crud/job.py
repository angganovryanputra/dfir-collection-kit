from sqlalchemy import select
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
    result = await db.execute(
        select(Job)
        .where(Job.status == "pending")
        .order_by(Job.created_at.asc())
        .limit(1)
    )
    job = result.scalar_one_or_none()
    if not job:
        return None
    job.agent_id = agent_id
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
