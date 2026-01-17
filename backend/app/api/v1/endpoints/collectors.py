from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.crud.collector import create_collector, list_collectors, update_collector_status
from app.schemas.collector import CollectorCreate, CollectorOut, CollectorUpdate

router = APIRouter()


@router.get("/", response_model=list[CollectorOut])
async def get_collectors(db: AsyncSession = Depends(get_db)) -> list[CollectorOut]:
    collectors = await list_collectors(db)
    return [CollectorOut.model_validate(collector) for collector in collectors]


@router.post("/", response_model=CollectorOut)
async def create_collector_endpoint(
    payload: CollectorCreate, db: AsyncSession = Depends(get_db)
) -> CollectorOut:
    collector = await create_collector(db, payload)
    return CollectorOut.model_validate(collector)


@router.patch("/{collector_id}", response_model=CollectorOut)
async def update_collector_status_endpoint(
    collector_id: str, payload: CollectorUpdate, db: AsyncSession = Depends(get_db)
) -> CollectorOut:
    if not payload.status:
        raise HTTPException(status_code=400, detail="Status is required")
    collector = await update_collector_status(db, collector_id, payload.status)
    if not collector:
        raise HTTPException(status_code=404, detail="Collector not found")
    return CollectorOut.model_validate(collector)
