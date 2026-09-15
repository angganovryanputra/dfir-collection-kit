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
from typing import Awaitable, TypeVar

from celery import Celery
from celery.exceptions import SoftTimeLimitExceeded

logger = logging.getLogger(__name__)
_TaskResult = TypeVar("_TaskResult")


async def _run_with_disposed_engine(coroutine: Awaitable[_TaskResult]) -> _TaskResult:
    """Run a task coroutine and release asyncpg connections in its own loop.

    Celery prefork workers execute more than one task over their lifetime while
    ``asyncio.run`` creates a new event loop for each task.  An asyncpg
    connection kept in SQLAlchemy's pool belongs to the loop that created it;
    retaining it caused the next scheduled task to fail with "attached to a
    different loop".  Dispose in the originating loop so later tasks open a
    connection bound to their own loop.
    """
    try:
        return await coroutine
    finally:
        from app.db.session import engine

        await engine.dispose()


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
    worker_prefetch_multiplier=1,
    task_time_limit=7200,
    task_soft_time_limit=6600,
    beat_schedule={
        "check-scheduled-collections": {
            "task": "dfir.check_scheduled_collections",
            "schedule": 60.0,  # every minute
        },
        "expire-legal-holds": {
            "task": "dfir.expire_legal_holds",
            "schedule": 3600.0,  # every hour
        },
        "verify-evidence-integrity": {
            "task": "dfir.verify_evidence_integrity",
            "schedule": 21600.0,  # every 6 hours
        },
    },
)


@celery_app.task(
    bind=True, name="dfir.run_pipeline", max_retries=1, time_limit=7200, soft_time_limit=6600
)
def run_pipeline_task(
    self, incident_id: str, job_id: str, base_path: str, force: bool = False
) -> dict:
    """
    Celery task wrapper for the forensics parsing pipeline.
    Runs the async pipeline inside a fresh event loop.
    Hard limit: 2 h. Soft limit: 1 h 50 min (logs warning, allows graceful cleanup).
    """
    from app.services.artifact_parser_service import run_pipeline_background

    logger.info("Celery: starting pipeline for job %s (incident %s)", job_id, incident_id)
    try:
        asyncio.run(
            _run_with_disposed_engine(
                run_pipeline_background(incident_id, job_id, Path(base_path), force=force)
            )
        )
        logger.info("Celery: pipeline completed for job %s", job_id)
        return {"status": "done", "job_id": job_id}
    except SoftTimeLimitExceeded:
        logger.error("Celery: pipeline soft time limit exceeded for job %s — aborting", job_id)
        raise
    except Exception as exc:
        logger.error("Celery: pipeline failed for job %s: %s", job_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(
    bind=True, name="dfir.process_s3_upload", max_retries=3, time_limit=7200, soft_time_limit=6600
)
def process_s3_upload_task(
    self, incident_id: str, job_id: str, base_path: str, object_key: str
) -> dict:
    """
    Celery task wrapper for downloading, extracting, and initiating the pipeline for an S3 upload.
    """
    logger.info("Celery: starting S3 processing for job %s", job_id)
    try:
        asyncio.run(
            _run_with_disposed_engine(
                process_s3_upload_background(incident_id, job_id, Path(base_path), object_key)
            )
        )
        logger.info("Celery: S3 processing completed for job %s", job_id)
        return {"status": "done", "job_id": job_id}
    except SoftTimeLimitExceeded:
        logger.error("Celery: S3 processing soft time limit exceeded for job %s", job_id)
        raise
    except Exception as exc:
        logger.error("Celery: S3 processing failed for job %s: %s", job_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=60)


async def process_s3_upload_background(
    incident_id: str, job_id: str, base_path: Path, object_key: str
) -> None:
    from datetime import datetime, timezone

    from sqlalchemy import select

    # Keep the S3 path on the same evidence primitives and data model as the
    # streamed agent upload.  The old imports referred to a removed service
    # and an obsolete CRUD API, so S3 processing failed at task startup.
    from app.core.evidence_files import (
        append_chain_log,
        extract_zip,
        hash_file,
        write_hash_manifest,
        write_lock_marker,
    )
    from app.crud.chain_of_custody import create_entry
    from app.crud.evidence import create_folder, create_item
    from app.crud.job import sync_incident_collection_status
    from app.db.session import AsyncSessionLocal
    from app.models.job import Job
    from app.schemas.chain_of_custody import ChainOfCustodyEntryCreate
    from app.schemas.evidence import EvidenceFolderCreate, EvidenceItemCreate
    from app.services.artifact_parser_service import run_parsing_pipeline
    from app.services.audit_log_service import safe_record_event
    from app.services.s3_service import get_s3_service
    from app.services.system_settings_service import get_runtime_settings

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
                write_hash_manifest,
                extracted_files,
                manifest_path,
                extracted_dir,
                runtime_settings.hash_algorithm,
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

            # 3. Create DB records using the canonical evidence schema.
            total_size = await asyncio.to_thread(
                lambda: sum(p.stat().st_size for p in extracted_files)
            )
            await create_folder(
                db,
                EvidenceFolderCreate(
                    id=job_id,
                    incident_id=incident_id,
                    type="COLLECTION",
                    date=datetime.now(timezone.utc).date().isoformat(),
                    files_count=len(extracted_files),
                    total_size=str(total_size),
                    status="LOCKED",
                ),
            )
            for idx, evidence_file in enumerate(extracted_files, start=1):
                await create_item(
                    db,
                    EvidenceItemCreate(
                        id=f"{job_id}-{idx}",
                        incident_id=incident_id,
                        name=evidence_file.name,
                        job_id=job_id,
                        relative_path=evidence_file.relative_to(base_path.parent).as_posix(),
                        hash_algorithm=runtime_settings.hash_algorithm,
                        type="FILE",
                        size=str(evidence_file.stat().st_size),
                        status="HASH_VERIFIED",
                        hash=await asyncio.to_thread(
                            hash_file, evidence_file, runtime_settings.hash_algorithm
                        ),
                        collected_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    ),
                )

            timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            await create_entry(
                db,
                ChainOfCustodyEntryCreate(
                    id=f"coc-{job_id}",
                    incident_id=incident_id,
                    timestamp=timestamp,
                    action="EVIDENCE UPLOAD",
                    actor="SYSTEM S3 INGEST",
                    target=zip_path.name,
                ),
            )

            # 4. Update Job and CoC
            result = await db.execute(select(Job).where(Job.id == job_id))
            job = result.scalar_one_or_none()
            if job:
                job.status = "completed"
                job.completed_at = datetime.now(timezone.utc)
                await sync_incident_collection_status(db, incident_id)
                await db.commit()

                timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                chain_log_path = base_path / "chain-of-custody.log"
                await asyncio.to_thread(
                    append_chain_log,
                    chain_log_path,
                    f"{timestamp} | UPLOAD_S3 | AGENT {job.agent_id} | {zip_path.name}",
                )
                chain_log_hash = await asyncio.to_thread(
                    hash_file, chain_log_path, runtime_settings.hash_algorithm
                )
                await asyncio.to_thread(
                    append_chain_log, chain_log_path, f"{timestamp} | HASH | {chain_log_hash}"
                )
                await asyncio.to_thread(write_lock_marker, base_path / "LOCKED")

            # 5. Start parsing pipeline
            await run_parsing_pipeline(incident_id, job_id, base_path, db)

        except Exception as exc:
            logger.error("Error processing S3 upload: %s", exc, exc_info=True)
            result = await db.execute(select(Job).where(Job.id == job_id))
            job = result.scalar_one_or_none()
            if job:
                job.status = "failed"
                job.error_message = str(exc)[:500]
                await sync_incident_collection_status(db, incident_id)
                await db.commit()
            raise


@celery_app.task(name="dfir.check_scheduled_collections")
def check_scheduled_collections_task() -> dict:
    """Celery Beat task: dispatch pending scheduled collections whose next_run_at has passed."""
    asyncio.run(_run_with_disposed_engine(_run_scheduled_collections()))
    return {"status": "checked"}


async def _run_scheduled_collections() -> None:
    """Find enabled scheduled collections that are due and trigger them."""
    from datetime import datetime, timezone

    from sqlalchemy import select, update

    from app.db.session import AsyncSessionLocal
    from app.models.platform_features import ScheduledCollection

    try:
        from croniter import croniter  # type: ignore[import]
    except ImportError:
        logger.warning("croniter not installed — scheduled collections disabled")
        return

    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ScheduledCollection).where(
                ScheduledCollection.enabled == True,  # noqa: E712
            )
        )
        schedules = list(result.scalars())
        for sc in schedules:
            # Compute next run time if not yet set
            if sc.next_run_at is None:
                try:
                    cron = croniter(sc.cron_expr, now)
                    sc.next_run_at = cron.get_next(datetime)
                except Exception as exc:
                    logger.warning("Invalid cron expression for SC %s: %s", sc.id, exc)
                    continue

            if sc.next_run_at > now:
                continue  # not due yet

            logger.info(
                "Dispatching scheduled collection %s for incident %s", sc.id, sc.incident_id
            )
            try:
                # Trigger collection via HTTP to the backend (uses the same pipeline)
                from app.services.system_settings_service import get_runtime_settings

                # Just dispatch a Celery pipeline task directly
                run_scheduled_collection_task.delay(sc.incident_id, sc.id)
                # Update last_run_at and compute next_run_at
                cron = croniter(sc.cron_expr, now)
                await db.execute(
                    update(ScheduledCollection)
                    .where(ScheduledCollection.id == sc.id)
                    .values(last_run_at=now, next_run_at=cron.get_next(datetime))
                )
                await db.commit()
            except Exception as exc:
                logger.error("Failed to dispatch scheduled collection %s: %s", sc.id, exc)


@celery_app.task(bind=True, name="dfir.run_scheduled_collection", max_retries=1, time_limit=7200)
def run_scheduled_collection_task(self, incident_id: str, schedule_id: str) -> dict:
    """Trigger a collection for a scheduled collection entry."""
    logger.info("Running scheduled collection %s for incident %s", schedule_id, incident_id)
    try:
        asyncio.run(
            _run_with_disposed_engine(_trigger_scheduled_collection(incident_id, schedule_id))
        )
        return {"status": "done", "schedule_id": schedule_id}
    except Exception as exc:
        logger.error("Scheduled collection %s failed: %s", schedule_id, exc, exc_info=True)
        raise self.retry(exc=exc, countdown=300)


async def _trigger_scheduled_collection(incident_id: str, schedule_id: str) -> None:
    """Create one uniquely identified, OS-compatible job per scheduled target."""
    from uuid import uuid4

    from sqlalchemy import select

    from app.core.modules import build_modules, get_profile_modules, normalize_os_name
    from app.crud.incident import get_incident, update_incident
    from app.crud.job import create_job
    from app.db.session import AsyncSessionLocal
    from app.models.device import Device
    from app.models.platform_features import CustomModule, ScheduledCollection
    from app.schemas.incident import IncidentUpdate
    from app.schemas.job import JobCreate

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ScheduledCollection).where(ScheduledCollection.id == schedule_id)
        )
        sc = result.scalar_one_or_none()
        if not sc:
            logger.warning("Scheduled collection %s not found", schedule_id)
            return

        incident = await get_incident(db, incident_id)
        if not incident or incident.status in ("CLOSED",):
            logger.warning("Incident %s not available for scheduled collection", incident_id)
            return

        device_result = await db.execute(
            select(Device).where(Device.hostname.in_(incident.target_endpoints or []))
        )
        devices = list(device_result.scalars().all())
        custom_result = await db.execute(
            select(CustomModule).where(CustomModule.enabled == True)
        )  # noqa: E712
        custom_by_os: dict[str, list[dict]] = {}
        for module in custom_result.scalars():
            custom_by_os.setdefault(module.os, []).append(
                {
                    "module_id": module.id,
                    "output_relpath": module.output_relpath,
                    "params": {},
                    "command": module.command,
                }
            )

        targets: list[Device | None] = devices or [None]
        job_ids: list[str] = []
        for device in targets:
            os_name = normalize_os_name(device.os if device else None) or "windows"
            try:
                if sc.module_ids:
                    modules = build_modules(module_ids=list(sc.module_ids), os_name=os_name)
                elif sc.profile:
                    modules = build_modules(
                        module_ids=get_profile_modules(sc.profile, os_name), os_name=os_name
                    )
                else:
                    modules = build_modules(os_name=os_name)
            except ValueError as exc:
                logger.error(
                    "Scheduled collection %s for OS %s: module build failed: %s",
                    schedule_id,
                    os_name,
                    exc,
                )
                continue

            modules.extend(custom_by_os.get(os_name, []))
            # Each due occurrence needs its own ID. The prior deterministic ID
            # prevented every schedule from running more than once.
            job_id = f"JOB-{incident_id}-SCHED-{schedule_id[:8]}-{uuid4().hex[:10]}"
            await create_job(
                db,
                JobCreate(
                    id=job_id, incident_id=incident_id, agent_id=device.id if device else None
                ),
                modules,
                f"{incident_id}/{job_id}",
            )
            job_ids.append(job_id)

        if not job_ids:
            logger.error("Scheduled collection %s did not create any compatible jobs", schedule_id)
            return
        await update_incident(db, incident_id, IncidentUpdate(status="COLLECTION_IN_PROGRESS"))
        await db.commit()
        logger.info("Scheduled collection jobs created: %s", ", ".join(job_ids))


@celery_app.task(name="dfir.expire_legal_holds")
def expire_legal_holds_task() -> dict:
    """Celery Beat task: mark expired legal holds as EXPIRED."""
    asyncio.run(_run_with_disposed_engine(_expire_legal_holds()))
    return {"status": "checked"}


async def _expire_legal_holds() -> None:
    """Set status=EXPIRED for all ACTIVE holds whose expires_at has passed."""
    from datetime import datetime, timezone

    from sqlalchemy import update

    from app.db.session import AsyncSessionLocal
    from app.models.platform_features import LegalHold

    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            update(LegalHold)
            .where(
                LegalHold.status == "ACTIVE",
                LegalHold.expires_at != None,  # noqa: E711
                LegalHold.expires_at <= now,
            )
            .values(status="EXPIRED")
            .returning(LegalHold.id)
        )
        expired_ids = [row[0] for row in result]
        if expired_ids:
            await db.commit()
            logger.info("Expired %d legal hold(s): %s", len(expired_ids), expired_ids)


@celery_app.task(name="dfir.verify_evidence_integrity")
def verify_evidence_integrity_task() -> dict:
    """
    Periodically re-hash all LOCKED evidence files and compare against the stored
    manifest.  Any mismatch is logged as a TAMPER_DETECTED audit event.
    """
    asyncio.run(_run_with_disposed_engine(_verify_evidence_integrity()))
    return {"status": "done"}


async def _verify_evidence_integrity() -> None:
    """Re-hash all LOCKED evidence items and compare against DB hashes."""
    import hashlib
    from pathlib import Path

    from sqlalchemy import select

    from app.db.session import AsyncSessionLocal
    from app.models.evidence import EvidenceItem
    from app.services.audit_log_service import safe_record_event
    from app.services.system_settings_service import get_runtime_settings

    async with AsyncSessionLocal() as db:
        runtime = await get_runtime_settings(db)
        evidence_base = Path(runtime.evidence_storage_path)

        result = await db.execute(
            select(EvidenceItem).where(EvidenceItem.status.in_(["LOCKED", "HASH_VERIFIED"]))
        )
        items = list(result.scalars())
        logger.info("Evidence integrity check: %d items to verify", len(items))

        tamper_count = 0
        for item in items:
            if not item.hash:
                continue
            file_path = evidence_base / item.incident_id / item.name
            if not file_path.exists():
                continue
            try:
                h = hashlib.new(runtime.hash_algorithm.replace("-", "").lower())
                with open(file_path, "rb") as fh:
                    for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                        h.update(chunk)
                computed = h.hexdigest()
                if computed != item.hash:
                    tamper_count += 1
                    logger.error(
                        "TAMPER DETECTED: %s/%s — expected %s got %s",
                        item.incident_id,
                        item.name,
                        item.hash[:16],
                        computed[:16],
                    )
                    await safe_record_event(
                        db,
                        event_type="evidence.tamper_detected",
                        actor_type="system",
                        actor_id="integrity_monitor",
                        source="background",
                        action="evidence hash mismatch",
                        target_type="evidence",
                        target_id=item.id,
                        status="failure",
                        message=f"Hash mismatch for {item.name}",
                        metadata={
                            "incident_id": item.incident_id,
                            "expected_hash": item.hash,
                            "computed_hash": computed,
                        },
                    )
                    await db.commit()
            except Exception as exc:
                logger.warning("Integrity check failed for %s: %s", item.id, exc)

        logger.info(
            "Evidence integrity check complete: %d tamper(s) detected in %d items",
            tamper_count,
            len(items),
        )


@celery_app.task(
    bind=True, name="dfir.run_super_timeline", max_retries=1, time_limit=3600, soft_time_limit=3300
)
def run_super_timeline_task(self, incident_id: str, base_path: str) -> dict:
    """
    Celery task wrapper for the Super Timeline merge + lateral movement detection.
    Runs the async service inside a fresh event loop.
    Hard limit: 1 h. Soft limit: 55 min.
    """
    from app.services.super_timeline_service import build_super_timeline_background

    logger.info("Celery: starting super timeline for incident %s", incident_id)
    try:
        asyncio.run(
            _run_with_disposed_engine(build_super_timeline_background(incident_id, Path(base_path)))
        )
        logger.info("Celery: super timeline completed for incident %s", incident_id)
        return {"status": "done", "incident_id": incident_id}
    except SoftTimeLimitExceeded:
        logger.error(
            "Celery: super timeline soft time limit exceeded for incident %s — aborting",
            incident_id,
        )
        raise
    except Exception as exc:
        logger.error(
            "Celery: super timeline failed for incident %s: %s", incident_id, exc, exc_info=True
        )
        raise self.retry(exc=exc, countdown=30)
