from datetime import datetime

from pydantic import BaseModel


class CollectionStartRequest(BaseModel):
    """
    Body for POST /incidents/{id}/collect.

    Priority for module selection:
      1. module_ids — explicit list overrides everything
      2. profile    — named profile (triage / ransomware / insider_threat / full)
      3. Neither    — all modules for the detected / overridden OS

    agent_ids restricts to specific registered device IDs instead of resolving
    by hostname from incident.target_endpoints.

    os_override forces a specific OS for module validation, bypassing the
    auto-detection from the registered device record.  REQUIRED when the
    user has manually changed the OS selector in the UI — without it,
    validate_modules_for_os() will reject the selected modules with HTTP 400.
    """
    module_ids: list[str] | None = None
    profile: str | None = None
    agent_ids: list[str] | None = None
    os_override: str | None = None  # "windows" | "linux" | "macos"


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
