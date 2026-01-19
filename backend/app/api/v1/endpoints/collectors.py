from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.collector import create_collector, delete_collector, get_collector, list_collectors, update_collector_status
from app.models.user import User
from app.schemas.collector import CollectorCreate, CollectorOut, CollectorUpdate

router = APIRouter()


@router.get("/", response_model=list[CollectorOut])
async def get_collectors(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CollectorOut]:
    collectors = await list_collectors(db)
    return [CollectorOut.model_validate(collector) for collector in collectors]


@router.post(
    "/",
    response_model=CollectorOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def create_collector_endpoint(
    payload: CollectorCreate, db: AsyncSession = Depends(get_db)
) -> CollectorOut:
    collector = await create_collector(db, payload)
    return CollectorOut.model_validate(collector)


@router.get("/{collector_id}", response_model=CollectorOut)
async def get_collector_endpoint(
    collector_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CollectorOut:
    collector = await get_collector(db, collector_id)
    if not collector:
        raise HTTPException(status_code=404, detail="Collector not found")
    return CollectorOut.model_validate(collector)


@router.patch(
    "/{collector_id}",
    response_model=CollectorOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def update_collector_status_endpoint(
    collector_id: str, payload: CollectorUpdate, db: AsyncSession = Depends(get_db)
) -> CollectorOut:
    if not payload.status:
        raise HTTPException(status_code=400, detail="Status is required")
    collector = await update_collector_status(db, collector_id, payload.status)
    if not collector:
        raise HTTPException(status_code=404, detail="Collector not found")
    return CollectorOut.model_validate(collector)


@router.delete(
    "/{collector_id}",
    dependencies=[Depends(require_roles("admin"))],
)
async def delete_collector_endpoint(
    collector_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    deleted = await delete_collector(db, collector_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Collector not found")
    return {"status": "deleted"}
