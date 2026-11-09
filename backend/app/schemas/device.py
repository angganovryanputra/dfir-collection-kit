from datetime import datetime, timezone

from pydantic import BaseModel, Field


class DeviceBase(BaseModel):
    hostname: str
    ip_address: str
    type: str
    os: str = "unknown"
    agent_version: str
    status: str
    last_seen: datetime
    cpu_usage: int | None = None
    memory_usage: int | None = None
    collection_status: str
    registered_at: datetime


class DeviceCreate(BaseModel):
    id: str
    hostname: str
    ip_address: str
    type: str = "workstation"
    os: str = "unknown"
    agent_version: str = "1.0.0"
    status: str = "ONLINE"
    last_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    collection_status: str = "IDLE"
    registered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    cpu_usage: int | None = None
    memory_usage: int | None = None


class DeviceUpdate(BaseModel):
    hostname: str | None = None
    ip_address: str | None = None
    type: str | None = None
    os: str | None = None
    agent_version: str | None = None
    status: str | None = None
    last_seen: datetime | None = None
    cpu_usage: int | None = None
    memory_usage: int | None = None
    collection_status: str | None = None
    registered_at: datetime | None = None


class DeviceOut(DeviceBase):
    id: str

    class Config:
        from_attributes = True
