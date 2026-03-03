from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class JobModule(BaseModel):
    module_id: str
    output_relpath: str
    params: dict = Field(default_factory=dict)


class JobCreate(BaseModel):
    id: str
    incident_id: str
    agent_id: str | None = None
    module_ids: list[str] | None = None

    @field_validator("module_ids")
    @classmethod
    def validate_module_ids(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        cleaned = [item.strip() for item in value if item and item.strip()]
        if not cleaned:
            return None
        return list(dict.fromkeys(cleaned))


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
    concurrency_limit: int = 4


class JobStatusUpdate(BaseModel):
    status: str
    message: str | None = None
    progress: int | None = None
    log_tail: list[str] | None = None

    @field_validator("status")
    @classmethod
    def normalize_status(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("status is required")
        return normalized
