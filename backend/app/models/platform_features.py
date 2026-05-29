"""ORM models for production-grade DFIR platform features.

Tables:
  custom_modules         — user-defined collection modules
  attack_hypotheses      — per-incident ATT&CK hypothesis tracking
  scheduled_collections  — cron-based automatic collection triggers
  threat_hunt_queries    — reusable DuckDB queries for threat hunting
  legal_holds            — legal hold / retention policy records
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CustomModule(Base):
    """User-authored collection module executed by the agent."""
    __tablename__ = "custom_modules"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    os: Mapped[str] = mapped_column(String, nullable=False)           # windows/linux/macos
    category: Mapped[str] = mapped_column(String, nullable=False)     # volatile/logs/persistence/system/artifacts
    command: Mapped[str] = mapped_column(Text, nullable=False)        # shell command
    output_relpath: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, server_default="true", default=True)
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AttackHypothesis(Base):
    """ATT&CK-framed hypothesis for an incident under investigation."""
    __tablename__ = "attack_hypotheses"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tactic: Mapped[str | None] = mapped_column(String, nullable=True)
    technique_id: Mapped[str | None] = mapped_column(String, nullable=True)
    confidence: Mapped[str] = mapped_column(String, nullable=False, server_default="LOW")
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="OPEN")
    evidence_refs: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ScheduledCollection(Base):
    """Cron-triggered automatic collection for a given incident."""
    __tablename__ = "scheduled_collections"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), nullable=False, index=True)
    cron_expr: Mapped[str] = mapped_column(String, nullable=False)
    profile: Mapped[str | None] = mapped_column(String, nullable=True)
    module_ids: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    enabled: Mapped[bool] = mapped_column(Boolean, server_default="true", default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ThreatHuntQuery(Base):
    """Reusable DuckDB / Sigma query for threat hunting across timelines."""
    __tablename__ = "threat_hunt_queries"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String, nullable=False)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    sigma_rule: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    mitre_technique: Mapped[str | None] = mapped_column(String, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, server_default="true", default=True)
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class LegalHold(Base):
    """Legal hold / retention policy applied to an incident's evidence."""
    __tablename__ = "legal_holds"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    custodian: Mapped[str] = mapped_column(String, nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="ACTIVE")
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
