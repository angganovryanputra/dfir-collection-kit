from sqlalchemy import String
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
    retry_attempts: Mapped[int] = mapped_column()
    session_timeout_min: Mapped[int] = mapped_column()
    max_failed_logins: Mapped[int] = mapped_column()
    log_retention_days: Mapped[int] = mapped_column()
    export_format: Mapped[str] = mapped_column(String)
