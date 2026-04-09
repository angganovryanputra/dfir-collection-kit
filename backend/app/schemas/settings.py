from pydantic import BaseModel, Field, field_serializer, field_validator
from pydantic import ConfigDict


class SystemSettingsBase(BaseModel):
    evidence_storage_path: str
    max_file_size_gb: int = Field(ge=1, le=500)
    hash_algorithm: str
    collection_timeout_min: int = Field(ge=1, le=1440)
    max_concurrent_jobs: int = Field(ge=0, le=50)
    concurrency_limit: int = Field(ge=1, le=32)
    retry_attempts: int = Field(ge=0, le=10)
    session_timeout_min: int
    max_failed_logins: int
    log_retention_days: int
    export_format: str
    # Processing pipeline settings (paths set manually via Settings UI)
    ez_tools_path: str | None = None
    chainsaw_path: str | None = None
    hayabusa_path: str | None = None
    sigma_rules_path: str | None = None
    yara_rules_path: str | None = None
    timesketch_url: str | None = None
    timesketch_token: str | None = None
    auto_process: bool = True

    @field_validator("timesketch_url", mode="before")
    @classmethod
    def _validate_timesketch_url(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return v
        if not v.startswith(("http://", "https://")):
            raise ValueError("timesketch_url must start with http:// or https://")
        return v


class SystemSettingsCreate(SystemSettingsBase):
    id: str


class SystemSettingsOut(SystemSettingsBase):
    """Internal schema — includes the real timesketch_token for pipeline use."""
    id: str

    model_config = ConfigDict(from_attributes=True)


class SystemSettingsApiOut(SystemSettingsBase):
    """API response schema — masks timesketch_token so it is never returned in plaintext."""
    id: str

    @field_serializer("timesketch_token")
    def _mask_token(self, v: str | None) -> str | None:
        return "***" if v else None

    model_config = ConfigDict(from_attributes=True)
