from typing import List

from pydantic import BaseModel


class IncidentTemplateBase(BaseModel):
    name: str
    incident_type: str
    default_endpoints: List[str]
    description: str
    preflight_checklist: List[str]
    created_by: str
    usage_count: int = 0


class IncidentTemplateCreate(IncidentTemplateBase):
    id: str


class IncidentTemplateUpdate(BaseModel):
    name: str | None = None
    incident_type: str | None = None
    default_endpoints: List[str] | None = None
    description: str | None = None
    preflight_checklist: List[str] | None = None
    created_by: str | None = None
    usage_count: int | None = None


class IncidentTemplateOut(IncidentTemplateBase):
    id: str

    class Config:
        from_attributes = True
