import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.chain_of_custody import create_entry, list_entries, verify_entries
from app.models.user import User
from app.schemas.chain_of_custody import ChainOfCustodyEntryCreate, ChainOfCustodyEntryOut
from app.services.audit_log_service import safe_record_event

router = APIRouter()


@router.get("/", response_model=list[ChainOfCustodyEntryOut])
async def get_entries(
    incident_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ChainOfCustodyEntryOut]:
    entries = await list_entries(db, incident_id)
    try:
        verify_entries(entries)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return [ChainOfCustodyEntryOut.model_validate(entry) for entry in entries]


@router.post(
    "/",
    response_model=ChainOfCustodyEntryOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def create_entry_endpoint(
    payload: ChainOfCustodyEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChainOfCustodyEntryOut:
    try:
        entry = await create_entry(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await safe_record_event(
        db,
        event_type="chain_of_custody_entry_created",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="create chain of custody entry",
        target_type="incident",
        target_id=entry.incident_id,
        status="success",
        message="Chain of custody entry created",
        metadata={"entry_id": entry.id, "action": entry.action},
    )
    return ChainOfCustodyEntryOut.model_validate(entry)


@router.get("/export", dependencies=[Depends(require_roles("admin", "operator", "viewer"))])
async def export_entries(
    incident_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    entries = await list_entries(db, incident_id)
    try:
        verify_entries(entries)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "incident_id", "timestamp", "action", "actor", "target", "sequence", "entry_hash"])
    for entry in entries:
        writer.writerow(
            [
                entry.id,
                entry.incident_id,
                entry.timestamp,
                entry.action,
                entry.actor,
                entry.target,
                entry.sequence,
                entry.entry_hash,
            ]
        )
    output.seek(0)
    filename = "chain_of_custody.csv" if not incident_id else f"chain_of_custody_{incident_id}.csv"
    await safe_record_event(
        db,
        event_type="chain_of_custody_exported",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="export chain of custody",
        target_type="incident",
        target_id=incident_id,
        status="success",
        message="Chain of custody exported",
        metadata={"incident_id": incident_id},
    )
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


