from datetime import datetime

from pydantic import BaseModel


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
