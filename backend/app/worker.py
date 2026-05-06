"""
Celery application for background forensics pipeline tasks.

Workers are started with:
    celery -A app.worker.celery_app worker --loglevel=info --pool=solo

Note: Pipeline tasks are CPU/IO-bound long-running operations.
Use --pool=solo or --concurrency=1 to avoid event loop conflicts with asyncio.
"""
import asyncio
import logging
import os
from pathlib import Path

from celery import Celery
from celery.exceptions import SoftTimeLimitExceeded

logger = logging.getLogger(__name__)

broker_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
result_backend = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

celery_app = Celery(
    "dfir_tasks",
    broker=broker_url,
    backend=result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_reject_on_worker_lost=True,
    task_acks_late=True,
    # One long forensics task per worker process at a time
    worker_prefetch_multiplier=1,
    # Hard kill after 2 h; soft warning at 1 h 50 min (pipeline tasks)
    task_time_limit=7200,
    task_soft_time_limit=6600,
)


@celery_app.task(bind=True, name="dfir.run_pipeline", max_retries=1, time_limit=7200, soft_time_limit=6600)
def run_pipeline_task(self, incident_id: str, job_id: str, base_path: str) -> dict:
    """
    Celery task wrapper for the forensics parsing pipeline.
    Runs the async pipeline inside a fresh event loop.
    Hard limit: 2 h. Soft limit: 1 h 50 min (logs warning, allows graceful cleanup).
    """
    from app.services.artifact_parser_service import run_pipeline_background

    logger.info("Celery: starting pipeline for job %s (incident %s)", job_id, incident_id)
    try:
        asyncio.run(run_pipeline_background(incident_id, job_id, Path(base_path)))
        logger.info("Celery: pipeline completed for job %s", job_id)
        return {"status": "done", "job_id": job_id}
    except SoftTimeLimitExceeded:
        logger.error("Celery: pipeline soft time limit exceeded for job %s — aborting", job_id)
        raise
    except Exception as exc:
        logger.error("Celery: pipeline failed for job %s: %s", job_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(bind=True, name="dfir.process_s3_upload", max_retries=3, time_limit=7200, soft_time_limit=6600)
def process_s3_upload_task(self, incident_id: str, job_id: str, base_path: str, object_key: str) -> dict:
    """
    Celery task wrapper for downloading, extracting, and initiating the pipeline for an S3 upload.
    """
    logger.info("Celery: starting S3 processing for job %s", job_id)
    try:
        asyncio.run(process_s3_upload_background(incident_id, job_id, Path(base_path), object_key))
        logger.info("Celery: S3 processing completed for job %s", job_id)
        return {"status": "done", "job_id": job_id}
    except SoftTimeLimitExceeded:
        logger.error("Celery: S3 processing soft time limit exceeded for job %s", job_id)
        raise
    except Exception as exc:
        logger.error("Celery: S3 processing failed for job %s: %s", job_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=60)


async def process_s3_upload_background(incident_id: str, job_id: str, base_path: Path, object_key: str) -> None:
    from app.db.session import AsyncSessionLocal
    from app.services.s3_service import get_s3_service
    from app.services.system_settings_service import get_runtime_settings
    from app.services.evidence_files import extract_zip, analyze_extracted_files, write_hash_manifest, hash_file
    from app.crud.evidence import create_folder, create_evidence_file
    from app.models.agent import Job
    from sqlalchemy import select
    from datetime import datetime, timezone
    from app.core.evidence_files import append_chain_log
    from app.services.artifact_parser_service import run_parsing_pipeline
    from app.services.audit_log_service import safe_record_event

    async with AsyncSessionLocal() as db:
        try:
            # 1. Download from S3
            s3_service = await get_s3_service(db)
            if not s3_service:
                logger.error("S3 service not enabled but s3 processing task started.")
                return

            zip_path = base_path / "collection.zip"
            base_path.mkdir(parents=True, exist_ok=True)
            
            await s3_service.download_file(object_key, str(zip_path))

            runtime_settings = await get_runtime_settings(db)
            
            await safe_record_event(
                db,
                event_type="evidence_s3_downloaded",
                actor_type="system",
                actor_id="backend",
                source="backend",
                action="download S3 evidence",
                target_type="job",
                target_id=job_id,
                status="success",
                message="Evidence successfully downloaded from S3",
                metadata={"incident_id": incident_id, "object_key": object_key},
            )

            # 2. Extract and hash
            extracted_dir = base_path / "extracted"
            extracted_files = await asyncio.to_thread(extract_zip, zip_path, extracted_dir)

            manifest_path = base_path / "hashes.sha256"
            await asyncio.to_thread(
                write_hash_manifest, extracted_files, manifest_path, extracted_dir, runtime_settings.hash_algorithm
            )

            await safe_record_event(
                db,
                event_type="evidence_hashed",
                actor_type="system",
                actor_id="backend",
                source="backend",
                action="hash evidence",
                target_type="incident",
                target_id=incident_id,
                status="success",
                message="Evidence hash manifest generated",
                metadata={"files": len(extracted_files)},
            )

            files_data = await analyze_extracted_files(extracted_dir)

            # 3. Create DB records
            folder = await create_folder(db, incident_id, name="root", parent_id=None)

            for fd in files_data:
                await create_evidence_file(
                    db,
                    incident_id=incident_id,
                    folder_id=folder.id,
                    name=fd["name"],
                    original_path=fd["original_path"],
                    size=fd["size"],
                    hash_val=fd["hash"],
                    hash_type=runtime_settings.hash_algorithm,
                )

            # 4. Update Job and CoC
            result = await db.execute(select(Job).where(Job.id == job_id))
            job = result.scalar_one_or_none()
            if job:
                job.status = "completed"
                job.completed_at = datetime.now(timezone.utc)
                await db.commit()
                
                timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                chain_log_path = base_path / "chain-of-custody.log"
                await asyncio.to_thread(
                    append_chain_log, chain_log_path, f"{timestamp} | UPLOAD_S3 | AGENT {job.agent_id} | {zip_path.name}"
                )
                chain_log_hash = await asyncio.to_thread(hash_file, chain_log_path, runtime_settings.hash_algorithm)
                await asyncio.to_thread(
                    append_chain_log, chain_log_path, f"{timestamp} | HASH | {chain_log_hash}"
                )

            # 5. Start parsing pipeline
            await run_parsing_pipeline(incident_id, job_id, base_path, db)

        except Exception as exc:
            logger.error("Error processing S3 upload: %s", exc, exc_info=True)
            result = await db.execute(select(Job).where(Job.id == job_id))
            job = result.scalar_one_or_none()
            if job:
                job.status = "failed"
                job.error_message = str(exc)[:500]
                await db.commit()
            raise


@celery_app.task(bind=True, name="dfir.run_super_timeline", max_retries=1, time_limit=3600, soft_time_limit=3300)
def run_super_timeline_task(self, incident_id: str, base_path: str) -> dict:
    """
    Celery task wrapper for the Super Timeline merge + lateral movement detection.
    Runs the async service inside a fresh event loop.
    Hard limit: 1 h. Soft limit: 55 min.
    """
    from app.services.super_timeline_service import build_super_timeline_background

    logger.info("Celery: starting super timeline for incident %s", incident_id)
    try:
        asyncio.run(build_super_timeline_background(incident_id, Path(base_path)))
        logger.info("Celery: super timeline completed for incident %s", incident_id)
        return {"status": "done", "incident_id": incident_id}
    except SoftTimeLimitExceeded:
        logger.error("Celery: super timeline soft time limit exceeded for incident %s — aborting", incident_id)
        raise
    except Exception as exc:
        logger.error(
            "Celery: super timeline failed for incident %s: %s", incident_id, exc, exc_info=True
        )
        raise self.retry(exc=exc, countdown=30)
