from datetime import datetime

from pydantic import BaseModel


class CollectionStartRequest(BaseModel):
    """
    Optional body for POST /incidents/{id}/collect.

    If module_ids is provided, only those modules are collected.
    If profile is provided (e.g. "triage", "ransomware", "full"), the profile's modules are used.
    If neither is provided, all modules for the detected OS are collected.
    """
    module_ids: list[str] | None = None
    profile: str | None = None


class CollectionStartResponse(BaseModel):
    incident_id: str
    status: str
    progress: int
    phase: str


class CollectionLogEntry(BaseModel):
    sequence: int
    level: str
    message: str
    timestamp: datetime


class CollectionPollRequest(BaseModel):
    since_sequence: int = 0


class CollectionStatusResponse(BaseModel):
    incident_id: str
    status: str
    progress: int
    phase: str
    last_log_index: int
    logs: list[CollectionLogEntry]
