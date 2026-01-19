from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.chain_of_custody import create_entry, list_entries, verify_entries
from app.models.user import User
from app.schemas.chain_of_custody import ChainOfCustodyEntryCreate, ChainOfCustodyEntryOut

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



