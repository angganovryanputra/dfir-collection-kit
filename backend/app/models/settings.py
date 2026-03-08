from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    evidence_storage_path: Mapped[str] = mapped_column(String)
    max_file_size_gb: Mapped[int] = mapped_column()
    hash_algorithm: Mapped[str] = mapped_column(String)
    collection_timeout_min: Mapped[int] = mapped_column()
    max_concurrent_jobs: Mapped[int] = mapped_column()
    concurrency_limit: Mapped[int] = mapped_column(server_default="4")
    retry_attempts: Mapped[int] = mapped_column()
    session_timeout_min: Mapped[int] = mapped_column()
    max_failed_logins: Mapped[int] = mapped_column()
    log_retention_days: Mapped[int] = mapped_column()
    export_format: Mapped[str] = mapped_column(String)
    # Processing pipeline settings
    ez_tools_path: Mapped[str | None] = mapped_column(String, nullable=True, default="/opt/eztools")
    chainsaw_path: Mapped[str | None] = mapped_column(String, nullable=True, default="/usr/local/bin/chainsaw")
    hayabusa_path: Mapped[str | None] = mapped_column(String, nullable=True, default="/usr/local/bin/hayabusa")
    sigma_rules_path: Mapped[str | None] = mapped_column(String, nullable=True, default="/opt/sigma-rules")
    yara_rules_path: Mapped[str | None] = mapped_column(String, nullable=True, default="/opt/yara-rules")
    timesketch_url: Mapped[str | None] = mapped_column(String, nullable=True)
    timesketch_token: Mapped[str | None] = mapped_column(String, nullable=True)
    auto_process: Mapped[bool] = mapped_column(Boolean, server_default="true", default=True)
