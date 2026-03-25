"""Pydantic v2 schemas for SuperTimeline and LateralMovement."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class SuperTimelineOut(BaseModel):
    """Public representation of a SuperTimeline record."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    incident_id: str
    status: str
    host_count: int | None = None
    event_count: int | None = None
    duckdb_path: str | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime


class LateralMovementOut(BaseModel):
    """Public representation of a LateralMovement detection record."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    incident_id: str
    super_timeline_id: str
    detection_type: str
    source_host: str
    target_host: str
    actor: str | None = None
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    event_count: int
    confidence: float
    details: dict[str, Any]
    detected_at: datetime


class SuperTimelineTriggerResponse(BaseModel):
    """Response returned when a super timeline build is queued."""

    incident_id: str
    status: str
    message: str


class SuperTimelineQueryResponse(BaseModel):
    """Paginated response for querying events from the merged DuckDB store."""

    data: list[dict[str, Any]]
    total: int
    page: int
    limit: int
    hosts: list[str]
