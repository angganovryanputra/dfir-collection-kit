from datetime import datetime

from pydantic import BaseModel


class CollectionStartRequest(BaseModel):
    """
    Optional body for POST /incidents/{id}/collect.

    If module_ids is provided, only those modules are collected.
    If profile is provided (e.g. "triage", "ransomware", "full"), the profile's modules are used.
    If neither is provided, all modules for the detected OS are collected.
    agent_ids, if provided, restricts collection to the specified device IDs instead of
    looking up devices by hostname from incident.target_endpoints.
    """
    module_ids: list[str] | None = None
    profile: str | None = None
    agent_ids: list[str] | None = None  # explicit agent device IDs to target


class CollectionStartResponse(BaseModel):
    incident_id: str
    status: str
    progress: int
    phase: str
    job_ids: list[str] = []  # IDs of all created/existing jobs


class CollectionLogEntry(BaseModel):
    sequence: int
    level: str
    message: str
    timestamp: datetime


class CollectionPollRequest(BaseModel):
    since_sequence: int = 0


class PerHostJobStatus(BaseModel):
    """Status summary for a single collection job (one per target host)."""
    job_id: str
    hostname: str | None = None
    status: str
    module_count: int = 0
    message: str | None = None


class CollectionStatusResponse(BaseModel):
    incident_id: str
    status: str
    progress: int
    phase: str
    last_log_index: int
    logs: list[CollectionLogEntry]
    jobs: list[PerHostJobStatus] = []
