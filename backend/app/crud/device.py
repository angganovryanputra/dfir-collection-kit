from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.schemas.device import DeviceCreate, DeviceUpdate


async def list_devices(db: AsyncSession, limit: int = 1000, offset: int = 0) -> list[Device]:
    result = await db.execute(select(Device).order_by(Device.hostname.asc()).offset(offset).limit(limit))
    return list(result.scalars().all())


async def get_device(db: AsyncSession, device_id: str) -> Device | None:
    result = await db.execute(select(Device).where(Device.id == device_id))
    return result.scalar_one_or_none()


async def create_device(db: AsyncSession, payload: DeviceCreate) -> Device:
    device = Device(**payload.model_dump())
    db.add(device)
    await db.flush()
    return device


async def update_device(db: AsyncSession, device_id: str, payload: DeviceUpdate) -> Device | None:
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        return None
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(device, key, value)
    await db.flush()
    return device


async def delete_device(db: AsyncSession, device_id: str) -> bool:
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        return False
    await db.delete(device)
    await db.flush()
    return True
