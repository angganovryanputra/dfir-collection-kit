from datetime import datetime
from typing import List, Literal

from pydantic import BaseModel, Field

IncidentStatus = Literal[
    "PENDING",
    "ACTIVE",
    "COLLECTION_IN_PROGRESS",
    "COLLECTION_COMPLETE",
    "COLLECTION_FAILED",
    "CLOSED",
]


class IncidentBase(BaseModel):
    title: str | None = None
    description: str | None = None
    type: str
    status: IncidentStatus
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"] = "MEDIUM"
    priority: Literal["P0", "P1", "P2", "P3"] = "P2"
    assignee: str | None = None
    tags: List[str] = Field(default_factory=list)
    template_id: str | None = None
    target_endpoints: List[str]
    operator: str


class IncidentCreate(IncidentBase):
    id: str


class IncidentUpdate(BaseModel):
    status: IncidentStatus | None = None
    collection_progress: int | None = None
    collection_phase: str | None = None
    last_log_index: int | None = None
    title: str | None = None
    description: str | None = None
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"] | None = None
    priority: Literal["P0", "P1", "P2", "P3"] | None = None
    assignee: str | None = None
    tags: List[str] | None = None


class IncidentOut(IncidentBase):
    id: str
    collection_progress: int | None = None
    collection_phase: str | None = None
    last_log_index: int | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
