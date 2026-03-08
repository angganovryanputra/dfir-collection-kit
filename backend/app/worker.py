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
)


@celery_app.task(bind=True, name="dfir.run_pipeline", max_retries=1)
def run_pipeline_task(self, incident_id: str, job_id: str, base_path: str) -> dict:
    """
    Celery task wrapper for the forensics parsing pipeline.
    Runs the async pipeline inside a fresh event loop.
    """
    from app.services.artifact_parser_service import run_pipeline_background

    logger.info("Celery: starting pipeline for job %s (incident %s)", job_id, incident_id)
    try:
        asyncio.run(run_pipeline_background(incident_id, job_id, Path(base_path)))
        logger.info("Celery: pipeline completed for job %s", job_id)
        return {"status": "done", "job_id": job_id}
    except Exception as exc:
        logger.error("Celery: pipeline failed for job %s: %s", job_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=30)
