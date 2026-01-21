from datetime import datetime

from pydantic import BaseModel


class JobModule(BaseModel):
    module_id: str
    output_relpath: str
    params: dict = {}


class JobCreate(BaseModel):
    id: str
    incident_id: str
    agent_id: str | None = None
    module_ids: list[str] | None = None


class JobOut(BaseModel):
    id: str
    incident_id: str
    agent_id: str | None = None
    status: str
    modules: list[JobModule]
    output_path: str
    message: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class JobInstruction(BaseModel):
    job_id: str
    incident_id: str
    os: str | None = None
    work_dir: str | None = None
    modules: list[JobModule]
    collection_timeout_min: int | None = None
    retry_attempts: int | None = None


class JobStatusUpdate(BaseModel):
    status: str
    message: str | None = None
    progress: int | None = None
    log_tail: list[str] | None = None
