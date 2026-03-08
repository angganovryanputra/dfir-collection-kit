from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.processing import ProcessingJob, SigmaHit


async def create_processing_job(
    db: AsyncSession,
    id: str,
    incident_id: str,
    job_id: str,
) -> ProcessingJob:
    job = ProcessingJob(
        id=id,
        incident_id=incident_id,
        job_id=job_id,
        status="PENDING",
    )
    db.add(job)
    await db.flush()
    return job


async def get_processing_job(db: AsyncSession, id: str) -> ProcessingJob | None:
    result = await db.execute(select(ProcessingJob).where(ProcessingJob.id == id))
    return result.scalar_one_or_none()


async def get_processing_job_by_evidence_job_id(
    db: AsyncSession, job_id: str
) -> ProcessingJob | None:
    result = await db.execute(
        select(ProcessingJob).where(ProcessingJob.job_id == job_id).limit(1)
    )
    return result.scalar_one_or_none()


async def update_processing_job(
    db: AsyncSession,
    id: str,
    *,
    status: str | None = None,
    phase: str | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
    error_message: str | None = None,
) -> ProcessingJob | None:
    result = await db.execute(select(ProcessingJob).where(ProcessingJob.id == id))
    job = result.scalar_one_or_none()
    if not job:
        return None
    if status is not None:
        job.status = status
    if phase is not None:
        job.phase = phase
    if started_at is not None:
        job.started_at = started_at
    if completed_at is not None:
        job.completed_at = completed_at
    if error_message is not None:
        job.error_message = error_message
    await db.flush()
    return job


async def list_sigma_hits(
    db: AsyncSession,
    incident_id: str,
    severity: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[SigmaHit], int]:
    from sqlalchemy import func

    stmt = select(SigmaHit).where(SigmaHit.incident_id == incident_id)
    count_stmt = select(func.count()).select_from(SigmaHit).where(
        SigmaHit.incident_id == incident_id
    )

    if severity:
        stmt = stmt.where(SigmaHit.severity == severity)
        count_stmt = count_stmt.where(SigmaHit.severity == severity)

    stmt = stmt.order_by(SigmaHit.detected_at.desc()).limit(limit).offset(offset)

    result = await db.execute(stmt)
    count_result = await db.execute(count_stmt)
    return list(result.scalars().all()), int(count_result.scalar() or 0)


async def get_latest_processing_job_by_incident_id(
    db: AsyncSession, incident_id: str
) -> ProcessingJob | None:
    result = await db.execute(
        select(ProcessingJob)
        .where(ProcessingJob.incident_id == incident_id)
        .order_by(ProcessingJob.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def count_sigma_hits_by_severity(
    db: AsyncSession, incident_id: str
) -> dict[str, int]:
    from sqlalchemy import func

    result = await db.execute(
        select(SigmaHit.severity, func.count().label("cnt"))
        .where(SigmaHit.incident_id == incident_id)
        .group_by(SigmaHit.severity)
    )
    return {row.severity: row.cnt for row in result.all()}
