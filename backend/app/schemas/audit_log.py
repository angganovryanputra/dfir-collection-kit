from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AuditLogBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
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
    event_metadata: dict[str, Any] = Field(serialization_alias="metadata")


class AuditLogOut(AuditLogBase):
    id: str
    previous_hash: str | None = None
    entry_hash: str


class AuditLogListResponse(BaseModel):
    total: int
    entries: list[AuditLogOut]
