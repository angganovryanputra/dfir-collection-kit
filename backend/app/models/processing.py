from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), index=True)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id"), index=True)
    status: Mapped[str] = mapped_column(String, index=True)  # PENDING | RUNNING | DONE | FAILED
    phase: Mapped[str | None] = mapped_column(String, nullable=True)  # parsing | sigma | timeline
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SigmaHit(Base):
    __tablename__ = "sigma_hits"
    __table_args__ = (
        # Composite index for the primary query pattern: filter incident + severity
        Index("ix_sigma_hits_incident_severity", "incident_id", "severity"),
        # Index for chronological ordering within an incident
        Index("ix_sigma_hits_incident_event_ts", "incident_id", "event_timestamp"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), index=True)
    processing_job_id: Mapped[str] = mapped_column(
        String, ForeignKey("processing_jobs.id"), index=True
    )
    rule_id: Mapped[str] = mapped_column(String, index=True)
    rule_name: Mapped[str] = mapped_column(String)
    rule_tags: Mapped[list[str]] = mapped_column(ARRAY(String))
    severity: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[str] = mapped_column(Text)
    artifact_file: Mapped[str] = mapped_column(String)
    event_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    event_record_id: Mapped[str | None] = mapped_column(String, nullable=True)
    event_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
