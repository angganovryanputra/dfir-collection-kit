from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AttackChainOut(BaseModel):
    id: str
    incident_id: str
    processing_job_id: str | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    tactics: list[str]
    techniques: list[str]
    graph_nodes: list[dict[str, Any]]
    graph_edges: list[dict[str, Any]]
    hit_count: int
    severity: str
    sigma_hit_ids: list[str]
    created_at: datetime

    class Config:
        from_attributes = True


class IOCIndicatorCreate(BaseModel):
    ioc_type: str  # ip | domain | sha256 | md5 | sha1 | url
    value: str
    description: str | None = None
    source: str | None = None
    severity: str = "high"


class IOCIndicatorOut(BaseModel):
    id: str
    ioc_type: str
    value: str
    description: str | None = None
    source: str | None = None
    severity: str
    created_at: datetime
    created_by: str | None = None

    class Config:
        from_attributes = True


class IOCMatchOut(BaseModel):
    id: str
    incident_id: str
    processing_job_id: str | None = None
    indicator_id: str
    ioc_type: str
    ioc_value: str
    matched_field: str
    matched_value: str
    event_source: str | None = None
    event_timestamp: datetime | None = None
    event_data: dict[str, Any]
    severity: str
    detected_at: datetime

    class Config:
        from_attributes = True


class IOCMatchListOut(BaseModel):
    total: int
    items: list[IOCMatchOut]


class YaraMatchOut(BaseModel):
    id: str
    incident_id: str
    processing_job_id: str | None = None
    rule_name: str
    rule_namespace: str | None = None
    matched_file: str
    file_size: int | None = None
    file_sha256: str | None = None
    strings: list[dict[str, Any]]
    severity: str
    detected_at: datetime

    class Config:
        from_attributes = True


class YaraMatchListOut(BaseModel):
    total: int
    items: list[YaraMatchOut]
