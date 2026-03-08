from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ProcessingJobOut(BaseModel):
    id: str
    incident_id: str
    job_id: str
    status: str
    phase: str | None
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class SigmaHitOut(BaseModel):
    id: str
    incident_id: str
    processing_job_id: str
    rule_id: str
    rule_name: str
    rule_tags: list[str]
    severity: str
    description: str
    artifact_file: str
    event_timestamp: datetime | None
    event_record_id: str | None
    event_data: dict
    detected_at: datetime

    class Config:
        from_attributes = True


class SigmaHitListOut(BaseModel):
    total: int
    items: list[SigmaHitOut]
    severity_counts: dict[str, int]


class ProcessingTriggerResponse(BaseModel):
    processing_job_id: str
    status: str
    message: str
