from __future__ import annotations

from dataclasses import dataclass

from app.crud.settings import get_settings
from app.schemas.settings import SystemSettingsOut


@dataclass(slots=True)
class RuntimeSettings:
    id: str
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


DEFAULT_SETTINGS = RuntimeSettings(
    id="default",
    evidence_storage_path="/vault/evidence",
    max_file_size_gb=10,
    hash_algorithm="SHA-256",
    collection_timeout_min=30,
    max_concurrent_jobs=5,
    concurrency_limit=4,
    retry_attempts=3,
    session_timeout_min=15,
    max_failed_logins=5,
    log_retention_days=365,
    export_format="ZIP",
    ez_tools_path="/opt/eztools",
    chainsaw_path="/usr/local/bin/chainsaw",
    hayabusa_path="/usr/local/bin/hayabusa",
    sigma_rules_path="/opt/sigma-rules",
    yara_rules_path="/opt/yara-rules",
    timesketch_url=None,
    timesketch_token=None,
    auto_process=True,
)

_runtime_cache: RuntimeSettings | None = None


def _from_schema(schema: SystemSettingsOut) -> RuntimeSettings:
    return RuntimeSettings(**schema.model_dump())


async def get_runtime_settings(db) -> RuntimeSettings:
    global _runtime_cache
    if _runtime_cache:
        return _runtime_cache
    settings = await get_settings(db)
    if not settings:
        _runtime_cache = DEFAULT_SETTINGS
        return _runtime_cache
    _runtime_cache = _from_schema(SystemSettingsOut.model_validate(settings))
    return _runtime_cache


def set_runtime_settings(settings: SystemSettingsOut) -> None:
    global _runtime_cache
    _runtime_cache = _from_schema(settings)
