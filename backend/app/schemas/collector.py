from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel, Field


class CollectorBase(BaseModel):
    name: str
    endpoint: str
    status: str
    last_heartbeat: datetime


class CollectorCreate(BaseModel):
    id: str = Field(default_factory=lambda: f"COL-{uuid4().hex[:8].upper()}")
    name: str
    endpoint: str
    status: str = "ONLINE"
    last_heartbeat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CollectorUpdate(BaseModel):
    status: str | None = None


class CollectorOut(CollectorBase):
    id: str

    class Config:
        from_attributes = True
