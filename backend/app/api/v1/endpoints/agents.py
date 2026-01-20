from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_db, require_roles
from app.core.evidence_files import (
    append_chain_log,
    extract_zip,
    hash_file,
    save_upload,
    write_hash_manifest,
    write_lock_marker,
)
from app.core.modules import build_modules
from app.crud.chain_of_custody import create_entry
from app.crud.collection_log import create_log_entries, get_last_sequence
from app.crud.device import create_device, get_device, update_device
from app.crud.evidence import create_folder, create_item
from app.crud.incident import update_incident
from app.crud.job import create_job, get_job, get_next_job_for_agent, update_job_status
from app.models.user import User
from app.schemas.chain_of_custody import ChainOfCustodyEntryCreate
from app.schemas.device import DeviceCreate, DeviceOut, DeviceUpdate
from app.schemas.evidence import EvidenceFolderCreate, EvidenceItemCreate
from app.schemas.incident import IncidentUpdate
from app.schemas.job import JobCreate, JobInstruction, JobModule, JobOut, JobStatusUpdate
from app.services.audit_log_service import safe_record_event

router = APIRouter()


def verify_agent_secret(agent_token: str | None) -> None:
    if not settings.AGENT_SHARED_SECRET:
        raise HTTPException(status_code=503, detail="Agent shared secret not configured")
    if not agent_token or agent_token != settings.AGENT_SHARED_SECRET:
        raise HTTPException(status_code=401, detail="Invalid agent token")


@router.get("/", response_model=list[DeviceOut])
async def list_agents(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[DeviceOut]:
    from app.crud.device import list_devices

    agents = await list_devices(db)
    return [DeviceOut.model_validate(agent) for agent in agents]


@router.get("/{agent_id}", response_model=DeviceOut)
async def get_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DeviceOut:
    agent = await get_device(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return DeviceOut.model_validate(agent)


@router.post("/register", response_model=DeviceOut)
async def register_agent(
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
) -> DeviceOut:
    verify_agent_secret(agent_token)
    existing = await get_device(db, payload.id)
    if existing:
        updated = await update_device(db, payload.id, DeviceUpdate(**payload.model_dump()))
        if not updated:
            raise HTTPException(status_code=404, detail="Agent not found")
        assert updated is not None
        await safe_record_event(
            db,
            event_type="agent_registered",
            actor_type="agent",
            actor_id=updated.id,
            source="agent",
            action="agent re-register",
            target_type="agent",
            target_id=updated.id,
            status="success",
            message="Agent re-registered",
            metadata={"hostname": updated.hostname, "os": updated.os},
        )
        return DeviceOut.model_validate(updated)
    device = await create_device(db, payload)
    await safe_record_event(
        db,
        event_type="agent_registered",
        actor_type="agent",
        actor_id=device.id,
        source="agent",
        action="agent register",
        target_type="agent",
        target_id=device.id,
        status="success",
        message="Agent registered",
        metadata={"hostname": device.hostname, "os": device.os},
    )
    return DeviceOut.model_validate(device)


@router.post("/{agent_id}/heartbeat", response_model=DeviceOut)
async def agent_heartbeat(
    agent_id: str,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
) -> DeviceOut:
    verify_agent_secret(agent_token)
    updated = await update_device(db, agent_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Agent not found")
    await safe_record_event(
        db,
        event_type="agent_heartbeat_received",
        actor_type="agent",
        actor_id=updated.id,
        source="agent",
        action="heartbeat",
        target_type="agent",
        target_id=updated.id,
        status="success",
        message="Heartbeat received",
        metadata={"status": updated.status, "last_seen": updated.last_seen},
    )
    return DeviceOut.model_validate(updated)


@router.post("/{agent_id}/jobs", response_model=JobOut, dependencies=[Depends(require_roles("operator", "admin"))])
async def create_job_for_agent(
    agent_id: str,
    payload: JobCreate,
    db: AsyncSession = Depends(get_db),
) -> JobOut:
    if payload.agent_id and payload.agent_id != agent_id:
        raise HTTPException(status_code=400, detail="agent_id mismatch")
    device = await get_device(db, agent_id)
    if not device and not payload.module_ids:
        raise HTTPException(status_code=400, detail="module_ids required when agent is unknown")
    modules = build_modules(payload.module_ids, device.os if device else None)
    output_path = str(Path(settings.EVIDENCE_STORAGE_PATH) / payload.incident_id / payload.id)
    job = await create_job(db, payload, modules, output_path)
    await safe_record_event(
        db,
        event_type="job_created",
        actor_type="user",
        actor_id="system",
        source="backend",
        action="create job",
        target_type="job",
        target_id=job.id,
        status="success",
        message="Job created for agent",
        metadata={"incident_id": job.incident_id, "agent_id": job.agent_id},
    )
    return JobOut.model_validate(job)


@router.get("/{agent_id}/jobs/next", response_model=JobInstruction)
async def get_next_job(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
) -> JobInstruction:
    verify_agent_secret(agent_token)
    job = await get_next_job_for_agent(db, agent_id)
    if not job:
        raise HTTPException(status_code=404, detail="No pending jobs")

    device_os = None
    if job.agent_id:
        device = await get_device(db, job.agent_id)
        if device:
            device_os = device.os

    modules = [JobModule(**entry) for entry in job.modules]
    await safe_record_event(
        db,
        event_type="job_assigned",
        actor_type="agent",
        actor_id=agent_id,
        source="backend",
        action="assign job",
        target_type="job",
        target_id=job.id,
        status="success",
        message="Job assigned to agent",
        metadata={"incident_id": job.incident_id},
    )
    return JobInstruction(
        job_id=job.id,
        incident_id=job.incident_id,
        os=device_os,
        work_dir=job.output_path,
        modules=modules,
    )


@router.get("/{agent_id}/jobs/{job_id}")
async def get_job_status_for_agent(
    agent_id: str,
    job_id: str,
    db: AsyncSession = Depends(get_db),
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
) -> dict:
    verify_agent_secret(agent_token)
    job = await get_job(db, job_id)
    if not job or job.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": job.status}


@router.post("/{agent_id}/jobs/{job_id}/status", response_model=JobOut)
async def update_job_status_endpoint(
    agent_id: str,
    job_id: str,
    payload: JobStatusUpdate,
    db: AsyncSession = Depends(get_db),
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
) -> JobOut:
    verify_agent_secret(agent_token)
    job = await get_job(db, job_id)
    if not job or job.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Job not found")
    updated = await update_job_status(db, job_id, payload.status, payload.message)
    if payload.progress is not None or payload.status:
        incident_update = {}
        if payload.progress is not None:
            incident_update["collection_progress"] = payload.progress
        status_upper = payload.status.upper()
        if status_upper in {"COMPLETE", "COMPLETED", "COLLECTION_COMPLETE"}:
            incident_update["status"] = "COLLECTION_COMPLETE"
            incident_update["collection_phase"] = "hashing"
        elif status_upper in {"FAILED", "ERROR", "CANCELLED", "CANCELED"}:
            incident_update["status"] = "COLLECTION_FAILED"
        else:
            incident_update["status"] = "COLLECTION_IN_PROGRESS"
        if incident_update:
            await update_incident(db, job.incident_id, IncidentUpdate(**incident_update))

    status_upper = payload.status.upper() if payload.status else ""
    event_type = "job_updated"
    if status_upper.startswith("COLLECTING") or status_upper in {"IN_PROGRESS", "RUNNING", "STARTED"}:
        event_type = "job_started"
    elif status_upper in {"COMPLETE", "COMPLETED", "COLLECTION_COMPLETE"}:
        event_type = "job_completed"
    elif status_upper in {"FAILED", "ERROR"}:
        event_type = "job_failed"
    elif status_upper in {"CANCELLED", "CANCELED"}:
        event_type = "job_cancelled"
    await safe_record_event(
        db,
        event_type=event_type,
        actor_type="agent",
        actor_id=agent_id,
        source="agent",
        action="update job status",
        target_type="job",
        target_id=job_id,
        status="success",
        message="Job status updated",
        metadata={"status": payload.status, "progress": payload.progress},
    )

    log_entries = []
    if payload.message:
        log_entries.append({"level": "info", "message": payload.message})
    if payload.log_tail:
        log_entries.extend({"level": "info", "message": entry} for entry in payload.log_tail)
    if log_entries:
        start_sequence = await get_last_sequence(db, job.incident_id) + 1
        await create_log_entries(db, job.incident_id, start_sequence, log_entries)
    return JobOut.model_validate(updated)


@router.post("/{agent_id}/jobs/{job_id}/upload")
async def upload_job_evidence(
    agent_id: str,
    job_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
) -> dict:
    verify_agent_secret(agent_token)
    job = await get_job(db, job_id)
    if not job or job.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Job not found")

    base_path = Path(settings.EVIDENCE_STORAGE_PATH) / job.incident_id / job.id
    zip_path = base_path / "collection.zip"
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    size = save_upload(file, zip_path, max_bytes)

    await safe_record_event(
        db,
        event_type="evidence_upload_received",
        actor_type="agent",
        actor_id=agent_id,
        source="agent",
        action="upload evidence",
        target_type="job",
        target_id=job_id,
        status="success",
        message="Evidence upload received",
        metadata={"bytes": size, "incident_id": job.incident_id},
    )

    extracted_dir = base_path / "extracted"
    extracted_files = extract_zip(zip_path, extracted_dir)

    manifest_path = base_path / "hashes.sha256"
    write_hash_manifest(extracted_files, manifest_path, extracted_dir)
    await safe_record_event(
        db,
        event_type="evidence_hashed",
        actor_type="system",
        actor_id="backend",
        source="backend",
        action="hash evidence",
        target_type="incident",
        target_id=job.incident_id,
        status="success",
        message="Evidence hash manifest generated",
        metadata={"files": len(extracted_files)},
    )

    timestamp = datetime.utcnow().isoformat() + "Z"
    chain_log_path = base_path / "chain-of-custody.log"
    append_chain_log(chain_log_path, f"{timestamp} | UPLOAD | AGENT {agent_id} | {zip_path.name}")
    chain_log_hash = hash_file(chain_log_path)
    append_chain_log(chain_log_path, f"{timestamp} | HASH | {chain_log_hash}")

    total_size = sum(p.stat().st_size for p in extracted_files)
    folder_payload = EvidenceFolderCreate(
        id=job.id,
        incident_id=job.incident_id,
        type="COLLECTION",
        date=datetime.utcnow().date().isoformat(),
        files_count=len(extracted_files),
        total_size=str(total_size),
        status="LOCKED",
    )
    await create_folder(db, folder_payload)

    for idx, item in enumerate(extracted_files, start=1):
        item_hash = hash_file(item)
        item_payload = EvidenceItemCreate(
            id=f"{job.id}-{idx}",
            incident_id=job.incident_id,
            name=item.name,
            type="FILE",
            size=str(item.stat().st_size),
            status="HASH_VERIFIED",
            hash=item_hash,
            collected_at=timestamp,
        )
        await create_item(db, item_payload)

    await create_entry(
        db,
        ChainOfCustodyEntryCreate(
            id=f"coc-{job.id}",
            incident_id=job.incident_id,
            timestamp=timestamp,
            action="EVIDENCE UPLOAD",
            actor=f"AGENT {agent_id}",
            target=zip_path.name,
        ),
    )

    write_lock_marker(base_path / "LOCKED")
    await safe_record_event(
        db,
        event_type="evidence_locked",
        actor_type="system",
        actor_id="backend",
        source="backend",
        action="lock evidence",
        target_type="incident",
        target_id=job.incident_id,
        status="success",
        message="Evidence locked",
        metadata={"job_id": job_id},
    )
    await update_job_status(db, job_id, "completed")

    return {"status": "uploaded", "bytes": size}
