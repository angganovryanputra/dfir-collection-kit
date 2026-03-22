from pydantic import BaseModel


class DeviceBase(BaseModel):
    hostname: str
    ip_address: str
    type: str
    os: str = "unknown"
    agent_version: str
    status: str
    last_seen: str
    cpu_usage: int | None = None
    memory_usage: int | None = None
    collection_status: str
    registered_at: str


class DeviceCreate(DeviceBase):
    id: str


class DeviceUpdate(BaseModel):
    hostname: str | None = None
    ip_address: str | None = None
    type: str | None = None
    os: str | None = None
    agent_version: str | None = None
    status: str | None = None
    last_seen: str | None = None
    cpu_usage: int | None = None
    memory_usage: int | None = None
    collection_status: str | None = None
    registered_at: str | None = None


class DeviceOut(DeviceBase):
    id: str

    class Config:
        from_attributes = True
