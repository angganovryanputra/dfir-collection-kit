from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.device import create_device, delete_device, get_device, list_devices, update_device
from app.models.user import User
from app.schemas.device import DeviceCreate, DeviceOut, DeviceUpdate

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
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def create_device_endpoint(
    payload: DeviceCreate, db: AsyncSession = Depends(get_db)
) -> DeviceOut:
    device = await create_device(db, payload)
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
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def update_device_endpoint(
    device_id: str, payload: DeviceUpdate, db: AsyncSession = Depends(get_db)
) -> DeviceOut:
    device = await update_device(db, device_id, payload)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return DeviceOut.model_validate(device)


@router.delete(
    "/{device_id}",
    dependencies=[Depends(require_roles("admin"))],
)
async def delete_device_endpoint(device_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    deleted = await delete_device(db, device_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"status": "deleted"}
