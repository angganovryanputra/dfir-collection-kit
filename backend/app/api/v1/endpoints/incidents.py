import logging
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response

logger = logging.getLogger(__name__)

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.core.modules import build_modules, get_profile_modules, normalize_os_name
from app.crud.collection_log import create_log_entries, delete_logs_for_incident, list_logs
from app.crud.chain_of_custody import create_entry
from app.crud.evidence import has_evidence_for_incident, lock_evidence_for_incident
from app.crud.incident import create_incident, delete_incident, get_incident, list_incidents, update_incident
from app.crud.job import count_active_jobs, create_job
from app.models.device import Device
from app.models.user import User
from app.schemas.chain_of_custody import ChainOfCustodyEntryCreate
from app.schemas.collection import CollectionLogEntry, CollectionStartRequest, CollectionStartResponse, CollectionStatusResponse
from app.schemas.incident import IncidentCreate, IncidentOut, IncidentUpdate
from app.schemas.job import JobCreate
from app.services.audit_log_service import safe_record_event
from app.services.system_settings_service import get_runtime_settings

router = APIRouter()

# ── Incident status state machine ─────────────────────────────────────────────
# Maps current status → set of valid next statuses.
# CLOSED is a terminal state — no transitions allowed from it.
_VALID_TRANSITIONS: dict[str, set[str]] = {
    "PENDING": {"ACTIVE", "COLLECTION_IN_PROGRESS", "CLOSED"},
    "ACTIVE": {"COLLECTION_IN_PROGRESS", "CLOSED", "PENDING"},
    "COLLECTION_IN_PROGRESS": {"COLLECTION_COMPLETE", "COLLECTION_FAILED", "ACTIVE", "CLOSED"},
    "COLLECTION_COMPLETE": {"CLOSED", "ACTIVE"},
    "COLLECTION_FAILED": {"ACTIVE", "CLOSED"},
    "CLOSED": set(),
}

PHASE_STEPS = [
    ("volatile", "Volatile Data"),
    ("persistence", "Persistence Mechanisms"),
    ("logs", "System Logs"),
    ("hashing", "Evidence Hashing"),
]


@router.get("/", response_model=list[IncidentOut])
async def get_incidents(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[IncidentOut]:
    incidents = await list_incidents(db)
    return [IncidentOut.model_validate(incident) for incident in incidents]


@router.get("/{incident_id}", response_model=IncidentOut)
async def get_incident_endpoint(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> IncidentOut:
    incident = await get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return IncidentOut.model_validate(incident)


@router.post("/", response_model=IncidentOut, dependencies=[Depends(require_roles("operator", "admin"))])
async def create_incident_endpoint(
    payload: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IncidentOut:
    runtime_settings = await get_runtime_settings(db)
    if runtime_settings.max_concurrent_jobs > 0:
        active_jobs = await count_active_jobs(db)
        if active_jobs >= runtime_settings.max_concurrent_jobs:
            raise HTTPException(status_code=409, detail="Job concurrency limit reached")
    incident = await create_incident(db, payload)
    await safe_record_event(
        db,
        event_type="incident_created",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="create incident",
        target_type="incident",
        target_id=incident.id,
        status="success",
        message="Incident created",
        metadata={"type": incident.type, "status": incident.status},
    )
    try:
        await create_entry(
            db,
            ChainOfCustodyEntryCreate(
                id=f"coc-{incident.id}-{uuid4().hex[:8]}",
                incident_id=incident.id,
                timestamp=datetime.utcnow().isoformat() + "Z",
                action="INCIDENT CREATED",
                actor=current_user.username,
                target=incident.id,
            ),
        )
    except Exception as exc:
        logger.warning("CoC entry failed for incident %s (INCIDENT CREATED): %s", incident.id, exc)
    return IncidentOut.model_validate(incident)


@router.post(
    "/{incident_id}/collect",
    response_model=CollectionStartResponse,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def start_collection_endpoint(
    incident_id: str,
    payload: CollectionStartRequest = CollectionStartRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CollectionStartResponse:
    incident = await get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if incident.status != "COLLECTION_IN_PROGRESS":
        updated = await update_incident(
            db,
            incident_id,
            IncidentUpdate(
                status="COLLECTION_IN_PROGRESS",
                collection_progress=0,
                collection_phase=PHASE_STEPS[0][0],
                last_log_index=0,
            ),
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Incident not found")
        incident = updated

    await delete_logs_for_incident(db, incident_id)
    await create_log_entries(
        db,
        incident_id,
        1,
        [{"level": "info", "message": "Collection job initialized"}],
    )
    try:
        await create_entry(
            db,
            ChainOfCustodyEntryCreate(
                id=f"coc-{incident_id}-{uuid4().hex[:8]}",
                incident_id=incident_id,
                timestamp=datetime.utcnow().isoformat() + "Z",
                action="COLLECTION STARTED",
                actor=current_user.username,
                target=incident_id,
            ),
        )
    except Exception as exc:
        logger.warning("CoC entry failed for incident %s (COLLECTION STARTED): %s", incident_id, exc)

    os_name = "windows"
    if incident.target_endpoints:
        result = await db.execute(
            select(Device).where(Device.hostname == incident.target_endpoints[0])
        )
        device = result.scalar_one_or_none()
        if device and device.os:
            os_name = normalize_os_name(device.os) or "windows"

    # Resolve which modules to collect: explicit IDs > profile > all for OS
    try:
        if payload.module_ids:
            modules = build_modules(module_ids=payload.module_ids, os_name=os_name)
        elif payload.profile:
            profile_module_ids = get_profile_modules(payload.profile, os_name)
            modules = build_modules(module_ids=profile_module_ids, os_name=os_name)
        else:
            modules = build_modules(os_name=os_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    runtime_settings = await get_runtime_settings(db)
    if runtime_settings.max_concurrent_jobs > 0:
        active_jobs = await count_active_jobs(db)
        if active_jobs >= runtime_settings.max_concurrent_jobs:
            raise HTTPException(status_code=409, detail="Job concurrency limit reached")
    # Idempotent: only create the job if it doesn't already exist.
    # Re-triggering collection (e.g. navigate back) must not cause a PK conflict.
    from app.crud.job import get_job
    if not await get_job(db, f"JOB-{incident_id}"):
        await create_job(
            db,
            JobCreate(id=f"JOB-{incident_id}", incident_id=incident_id),
            modules,
            f"{incident_id}/JOB-{incident_id}",
        )

    await safe_record_event(
        db,
        event_type="job_created",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="start collection",
        target_type="incident",
        target_id=incident_id,
        status="success",
        message="Collection started",
        metadata={
            "job_id": f"JOB-{incident_id}",
            "module_count": len(modules),
            "profile": payload.profile,
            "custom_module_ids": bool(payload.module_ids),
        },
    )

    return CollectionStartResponse(
        incident_id=incident.id,
        status="started",
        progress=0,
        phase=PHASE_STEPS[0][0],
    )


@router.get("/{incident_id}/collect", response_model=CollectionStatusResponse)
async def get_collection_status_endpoint(
    incident_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
) -> CollectionStatusResponse:
    incident = await get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    log_index = incident.last_log_index
    progress = incident.collection_progress
    phase = incident.collection_phase or PHASE_STEPS[0][0]

    return CollectionStatusResponse(
        incident_id=incident.id,
        status=incident.status,
        progress=progress,
        phase=phase,
        last_log_index=log_index,
        logs=[],
    )


@router.post("/{incident_id}/collect/poll", response_model=CollectionStatusResponse)
async def poll_collection_endpoint(
    incident_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)
) -> CollectionStatusResponse:
    incident = await get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    log_index = incident.last_log_index
    log_entries = await list_logs(db, incident_id, log_index)
    last_sequence = log_index
    if log_entries:
        last_sequence = log_entries[-1].sequence
        if last_sequence != log_index:
            await update_incident(
                db,
                incident_id,
                IncidentUpdate(last_log_index=last_sequence),
            )

    return CollectionStatusResponse(
        incident_id=incident.id,
        status=incident.status,
        progress=incident.collection_progress,
        phase=incident.collection_phase or PHASE_STEPS[0][0],
        last_log_index=last_sequence,
        logs=[
            CollectionLogEntry(
                sequence=entry.sequence,
                level=entry.level,
                message=entry.message,
                timestamp=entry.created_at,
            )
            for entry in log_entries
        ],
    )


@router.patch(
    "/{incident_id}",
    response_model=IncidentOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def update_incident_endpoint(
    incident_id: str,
    payload: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IncidentOut:
    # Validate status transition before writing
    if payload.status is not None:
        current = await get_incident(db, incident_id)
        if not current:
            raise HTTPException(status_code=404, detail="Incident not found")
        allowed = _VALID_TRANSITIONS.get(current.status, set())
        if payload.status != current.status and payload.status not in allowed:
            raise HTTPException(
                status_code=409,
                detail=f"Invalid status transition: {current.status} → {payload.status}",
            )
    if payload.status == "CLOSED":
        await lock_evidence_for_incident(db, incident_id)
    incident = await update_incident(db, incident_id, payload)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    await safe_record_event(
        db,
        event_type="incident_updated",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="update incident",
        target_type="incident",
        target_id=incident.id,
        status="success",
        message="Incident updated",
        metadata=payload.model_dump(exclude_unset=True),
    )
    return IncidentOut.model_validate(incident)


@router.get("/{incident_id}/report")
async def get_incident_report(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Response:
    from app.services.report_service import generate_incident_report
    try:
        html_content = await generate_incident_report(incident_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(content=html_content, media_type="text/html")


@router.delete(
    "/{incident_id}",
    dependencies=[Depends(require_roles("admin"))],
)
async def delete_incident_endpoint(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if await has_evidence_for_incident(db, incident_id):
        raise HTTPException(status_code=409, detail="Incident has evidence; deletion blocked")
    deleted = await delete_incident(db, incident_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Incident not found")
    await safe_record_event(
        db,
        event_type="incident.delete",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="delete incident",
        target_type="incident",
        target_id=incident_id,
        status="success",
        message="Incident deleted",
        metadata={},
    )
    return {"status": "deleted"}
