from datetime import datetime
from typing import List

from pydantic import BaseModel


class IncidentBase(BaseModel):
    type: str
    status: str
    template_id: str | None = None
    target_endpoints: List[str]
    operator: str


class IncidentCreate(IncidentBase):
    id: str


class IncidentUpdate(BaseModel):
    status: str | None = None
    collection_progress: int | None = None
    collection_phase: str | None = None
    last_log_index: int | None = None


class IncidentOut(IncidentBase):
    id: str
    collection_progress: int | None = None
    collection_phase: str | None = None
    last_log_index: int | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
