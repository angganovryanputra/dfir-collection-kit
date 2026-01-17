from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.crud.chain_of_custody import create_entry, list_entries
from app.schemas.chain_of_custody import ChainOfCustodyEntryCreate, ChainOfCustodyEntryOut

router = APIRouter()


@router.get("/", response_model=list[ChainOfCustodyEntryOut])
async def get_entries(
    incident_id: str | None = Query(default=None), db: AsyncSession = Depends(get_db)
) -> list[ChainOfCustodyEntryOut]:
    entries = await list_entries(db, incident_id)
    return [ChainOfCustodyEntryOut.model_validate(entry) for entry in entries]


@router.post("/", response_model=ChainOfCustodyEntryOut)
async def create_entry_endpoint(
    payload: ChainOfCustodyEntryCreate, db: AsyncSession = Depends(get_db)
) -> ChainOfCustodyEntryOut:
    entry = await create_entry(db, payload)
    return ChainOfCustodyEntryOut.model_validate(entry)
