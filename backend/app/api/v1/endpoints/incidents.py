from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.core.modules import build_modules
from app.crud.collection_log import create_log_entries, delete_logs_for_incident, list_logs
from app.crud.incident import create_incident, delete_incident, get_incident, list_incidents, update_incident
from app.crud.job import create_job
from app.models.user import User
from app.schemas.collection import CollectionLogEntry, CollectionStartResponse, CollectionStatusResponse
from app.schemas.incident import IncidentCreate, IncidentOut, IncidentUpdate
from app.schemas.job import JobCreate

router = APIRouter()

SIMULATED_COLLECTION_LOGS = [
    {"level": "info", "message": "Initializing collection engine..."},
    {"level": "success", "message": "Connection established to target: WS-FINANCE-01"},
    {"level": "info", "message": "Starting volatile data acquisition..."},
    {"level": "info", "message": "Collecting process list..."},
    {"level": "success", "message": "Process list captured (342 processes)"},
    {"level": "info", "message": "Collecting network connections..."},
    {"level": "success", "message": "Network state captured (89 connections)"},
    {"level": "info", "message": "Collecting memory dump..."},
    {"level": "warning", "message": "Large memory footprint detected (32GB) - this may take time"},
    {"level": "success", "message": "Memory acquisition complete"},
    {"level": "info", "message": "Starting persistence mechanism scan..."},
    {"level": "info", "message": "Scanning registry autorun keys..."},
    {"level": "success", "message": "Registry scan complete (23 entries)"},
    {"level": "info", "message": "Scanning scheduled tasks..."},
    {"level": "success", "message": "Scheduled tasks captured (45 tasks)"},
    {"level": "info", "message": "Scanning services..."},
    {"level": "success", "message": "Services enumeration complete (189 services)"},
    {"level": "info", "message": "Starting log collection..."},
    {"level": "info", "message": "Collecting Windows Event Logs..."},
    {"level": "success", "message": "Security log captured (50,000 events)"},
    {"level": "success", "message": "System log captured (25,000 events)"},
    {"level": "success", "message": "Application log captured (15,000 events)"},
    {"level": "info", "message": "Generating evidence hashes..."},
    {"level": "success", "message": "SHA-256 hashes computed for all artifacts"},
    {"level": "success", "message": "Collection complete - transferring to vault..."},
]

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
    payload: IncidentCreate, db: AsyncSession = Depends(get_db)
) -> IncidentOut:
    incident = await create_incident(db, payload)
    return IncidentOut.model_validate(incident)


@router.post(
    "/{incident_id}/collect",
    response_model=CollectionStartResponse,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def start_collection_endpoint(
    incident_id: str, db: AsyncSession = Depends(get_db)
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
    await create_log_entries(db, incident_id, 1, SIMULATED_COLLECTION_LOGS)

    modules = build_modules()
    await create_job(
        db,
        JobCreate(id=f"JOB-{incident_id}", incident_id=incident_id),
        modules,
        f"{incident_id}/JOB-{incident_id}",
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

    if incident.status == "COLLECTION_COMPLETE":
        return CollectionStatusResponse(
            incident_id=incident.id,
            status=incident.status,
            progress=incident.collection_progress,
            phase=incident.collection_phase or PHASE_STEPS[-1][0],
            last_log_index=log_index,
            logs=[],
        )

    if incident.status != "COLLECTION_IN_PROGRESS":
        return CollectionStatusResponse(
            incident_id=incident.id,
            status=incident.status,
            progress=incident.collection_progress,
            phase=incident.collection_phase or PHASE_STEPS[0][0],
            last_log_index=log_index,
            logs=[],
        )

    next_index = min(log_index + 1, len(SIMULATED_COLLECTION_LOGS))
    log_entries = await list_logs(db, incident_id, log_index, next_index)

    progress = int(next_index / len(SIMULATED_COLLECTION_LOGS) * 100) if SIMULATED_COLLECTION_LOGS else 0
    phase_index = min(len(PHASE_STEPS) - 1, int(progress / 25)) if PHASE_STEPS else 0
    phase = PHASE_STEPS[phase_index][0]

    status = "COLLECTION_IN_PROGRESS"
    if next_index >= len(SIMULATED_COLLECTION_LOGS):
        status = "COLLECTION_COMPLETE"

    await update_incident(
        db,
        incident_id,
        IncidentUpdate(
            status=status,
            collection_progress=progress,
            collection_phase=phase,
            last_log_index=next_index,
        ),
    )

    return CollectionStatusResponse(
        incident_id=incident.id,
        status=status,
        progress=progress,
        phase=phase,
        last_log_index=next_index,
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
    incident_id: str, payload: IncidentUpdate, db: AsyncSession = Depends(get_db)
) -> IncidentOut:
    incident = await update_incident(db, incident_id, payload)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return IncidentOut.model_validate(incident)


@router.delete(
    "/{incident_id}",
    dependencies=[Depends(require_roles("admin"))],
)
async def delete_incident_endpoint(
    incident_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    deleted = await delete_incident(db, incident_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"status": "deleted"}
