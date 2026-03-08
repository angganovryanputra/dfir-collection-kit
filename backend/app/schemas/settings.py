from pydantic import BaseModel


class SystemSettingsBase(BaseModel):
    evidence_storage_path: str
    max_file_size_gb: int
    hash_algorithm: str
    collection_timeout_min: int
    max_concurrent_jobs: int
    concurrency_limit: int
    retry_attempts: int
    session_timeout_min: int
    max_failed_logins: int
    log_retention_days: int
    export_format: str
    # Processing pipeline settings
    ez_tools_path: str | None = "/opt/eztools"
    chainsaw_path: str | None = "/usr/local/bin/chainsaw"
    hayabusa_path: str | None = "/usr/local/bin/hayabusa"
    sigma_rules_path: str | None = "/opt/sigma-rules"
    yara_rules_path: str | None = "/opt/yara-rules"
    timesketch_url: str | None = None
    timesketch_token: str | None = None
    auto_process: bool = True


class SystemSettingsCreate(SystemSettingsBase):
    id: str


class SystemSettingsOut(SystemSettingsBase):
    id: str

    class Config:
        from_attributes = True
