from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict


class IncidentTemplateBase(BaseModel):
    name: str
    incident_type: str
    default_endpoints: List[str]
    description: str
    preflight_checklist: List[str]
    # Server-set fields — optional in create requests; always overridden by the endpoint
    created_by: str = ""
    usage_count: int = 0


class IncidentTemplateCreate(IncidentTemplateBase):
    id: str | None = None


class IncidentTemplateUpdate(BaseModel):
    name: str | None = None
    incident_type: str | None = None
    default_endpoints: List[str] | None = None
    description: str | None = None
    preflight_checklist: List[str] | None = None


class IncidentTemplateOut(IncidentTemplateBase):
    id: str
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
