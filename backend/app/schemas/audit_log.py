from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogBase(BaseModel):
    event_id: str
    timestamp: datetime
    event_type: str
    actor_type: str
    actor_id: str
    source: str
    action: str
    target_type: str | None = None
    target_id: str | None = None
    status: str
    message: str
    metadata: dict[str, Any]


class AuditLogOut(AuditLogBase):
    id: str
    previous_hash: str | None = None
    entry_hash: str

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    total: int
    entries: list[AuditLogOut]
