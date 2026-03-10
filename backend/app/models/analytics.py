"""Phase 2 analytics models: AttackChain, IOCIndicator, IOCMatch, YaraMatch."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AttackChain(Base):
    """Reconstructed ATT&CK kill chain from clustered sigma hits."""

    __tablename__ = "attack_chains"
    __table_args__ = (Index("ix_attack_chains_incident_id", "incident_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"))
    processing_job_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("processing_jobs.id"), nullable=True
    )
    # Temporal cluster window
    window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    window_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # MITRE ATT&CK taxonomy
    tactics: Mapped[list] = mapped_column(ARRAY(String), default=list)
    techniques: Mapped[list] = mapped_column(ARRAY(String), default=list)
    # Graph representation [{id, label, type}, ...] and [{source, target, label}, ...]
    graph_nodes: Mapped[list] = mapped_column(JSONB, default=list)
    graph_edges: Mapped[list] = mapped_column(JSONB, default=list)
    # Summary
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    severity: Mapped[str] = mapped_column(String, default="informational")
    sigma_hit_ids: Mapped[list] = mapped_column(ARRAY(String), default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IOCIndicator(Base):
    """Known bad indicator (IP, domain, hash). Admin-managed feed."""

    __tablename__ = "ioc_indicators"
    __table_args__ = (Index("ix_ioc_type_value", "ioc_type", "value"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ioc_type: Mapped[str] = mapped_column(String, index=True)  # ip | domain | sha256 | md5 | sha1 | url
    value: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String, nullable=True)  # e.g. "MISP", "manual"
    severity: Mapped[str] = mapped_column(String, default="high")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[str | None] = mapped_column(String, nullable=True)


class IOCMatch(Base):
    """Match between a timeline event and a known IOC indicator."""

    __tablename__ = "ioc_matches"
    __table_args__ = (
        Index("ix_ioc_matches_incident_id", "incident_id"),
        Index("ix_ioc_matches_incident_type", "incident_id", "ioc_type"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"))
    processing_job_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("processing_jobs.id"), nullable=True
    )
    indicator_id: Mapped[str] = mapped_column(String, ForeignKey("ioc_indicators.id"), index=True)
    ioc_type: Mapped[str] = mapped_column(String)
    ioc_value: Mapped[str] = mapped_column(String)
    matched_field: Mapped[str] = mapped_column(String)  # field in event where value was found
    matched_value: Mapped[str] = mapped_column(String)
    event_source: Mapped[str | None] = mapped_column(String, nullable=True)  # EVTX, MFT, etc.
    event_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    event_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    severity: Mapped[str] = mapped_column(String, default="high")
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class YaraMatch(Base):
    """YARA rule match against a collected file."""

    __tablename__ = "yara_matches"
    __table_args__ = (Index("ix_yara_matches_incident_id", "incident_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), index=True)
    processing_job_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("processing_jobs.id"), nullable=True
    )
    rule_name: Mapped[str] = mapped_column(String)
    rule_namespace: Mapped[str | None] = mapped_column(String, nullable=True)
    matched_file: Mapped[str] = mapped_column(String)  # relative path within extracted/
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    strings: Mapped[list] = mapped_column(JSONB, default=list)  # [{offset, name, data}]
    severity: Mapped[str] = mapped_column(String, default="high")
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
