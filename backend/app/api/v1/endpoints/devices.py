from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.device import create_device, delete_device, get_device, list_devices, update_device
from app.models.user import User
from app.schemas.device import DeviceCreate, DeviceOut, DeviceUpdate
from app.services.audit_log_service import safe_record_event

router = APIRouter()


@router.get("/", response_model=list[DeviceOut])
async def get_devices(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[DeviceOut]:
    devices = await list_devices(db)
    return [DeviceOut.model_validate(device) for device in devices]


@router.post(
    "/",
    response_model=DeviceOut,
    dependencies=[Depends(require_roles("admin"))],
)
async def create_device_endpoint(
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeviceOut:
    device = await create_device(db, payload)
    device_name = getattr(device, "name", getattr(device, "hostname", device.id))
    await safe_record_event(
        db,
        event_type="device_enrolled",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="enroll device",
        target_type="device",
        target_id=device.id,
        status="success",
        message="Device enrolled",
        metadata={"name": device_name, "ip": device.ip_address, "os": device.os},
    )
    return DeviceOut.model_validate(device)


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device_endpoint(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DeviceOut:
    device = await get_device(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return DeviceOut.model_validate(device)


@router.patch(
    "/{device_id}",
    response_model=DeviceOut,
    dependencies=[Depends(require_roles("admin"))],
)
async def update_device_endpoint(
    device_id: str,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeviceOut:
    device = await update_device(db, device_id, payload)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await safe_record_event(
        db,
        event_type="device_updated",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="update device",
        target_type="device",
        target_id=device.id,
        status="success",
        message="Device updated",
        metadata={"changed": sorted(payload.model_dump(exclude_unset=True).keys())},
    )
    return DeviceOut.model_validate(device)


@router.delete(
    "/{device_id}",
    dependencies=[Depends(require_roles("admin"))],
)
async def delete_device_endpoint(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    device = await get_device(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    device_name = (
        getattr(device, "name", getattr(device, "hostname", device_id)) if device else device_id
    )
    await delete_device(db, device_id)
    await safe_record_event(
        db,
        event_type="device_deleted",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="delete device",
        target_type="device",
        target_id=device_id,
        status="success",
        message="Device deleted",
        metadata={"name": device_name},
    )
    return {"status": "deleted"}
