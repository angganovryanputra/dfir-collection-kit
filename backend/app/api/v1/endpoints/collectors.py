from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.collector import create_collector, delete_collector, get_collector, list_collectors, update_collector_status
from app.models.user import User
from app.schemas.collector import CollectorCreate, CollectorOut, CollectorUpdate
from app.services.audit_log_service import safe_record_event

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
    payload: CollectorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CollectorOut:
    collector = await create_collector(db, payload)
    await safe_record_event(
        db,
        event_type="collector.create",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="create collector",
        target_type="collector",
        target_id=collector.id,
        status="success",
        message="Collector created",
        metadata={"name": collector.name, "endpoint": collector.endpoint},
    )
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
    collector_id: str,
    payload: CollectorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CollectorOut:
    if not payload.status:
        raise HTTPException(status_code=400, detail="Status is required")
    collector = await update_collector_status(db, collector_id, payload.status)
    if not collector:
        raise HTTPException(status_code=404, detail="Collector not found")
    await safe_record_event(
        db,
        event_type="collector.update",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="update collector status",
        target_type="collector",
        target_id=collector.id,
        status="success",
        message="Collector status updated",
        metadata={"status": collector.status},
    )
    return CollectorOut.model_validate(collector)


@router.delete(
    "/{collector_id}",
    dependencies=[Depends(require_roles("admin"))],
)
async def delete_collector_endpoint(
    collector_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    deleted = await delete_collector(db, collector_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Collector not found")
    await safe_record_event(
        db,
        event_type="collector.delete",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="delete collector",
        target_type="collector",
        target_id=collector_id,
        status="success",
        message="Collector deleted",
        metadata={},
    )
    return {"status": "deleted"}
