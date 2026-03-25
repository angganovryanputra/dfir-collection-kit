"""Super Timeline models: merged cross-host timeline + lateral movement detections."""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SuperTimeline(Base):
    """Merged timeline across all hosts in an incident."""

    __tablename__ = "super_timelines"
    __table_args__ = (Index("ix_super_timelines_incident_id", "incident_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), index=True)
    status: Mapped[str] = mapped_column(String, default="PENDING")  # PENDING|BUILDING|DONE|FAILED
    host_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    duckdb_path: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class LateralMovement(Base):
    """Detected lateral movement pattern between hosts."""

    __tablename__ = "lateral_movements"
    __table_args__ = (Index("ix_lateral_movements_incident_id", "incident_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), index=True)
    super_timeline_id: Mapped[str] = mapped_column(
        String, ForeignKey("super_timelines.id"), index=True
    )
    detection_type: Mapped[str] = mapped_column(
        String
    )  # account_pivot|process_spread|credential_reuse
    source_host: Mapped[str] = mapped_column(String)
    target_host: Mapped[str] = mapped_column(String)
    actor: Mapped[str | None] = mapped_column(String, nullable=True)
    first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    event_count: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
