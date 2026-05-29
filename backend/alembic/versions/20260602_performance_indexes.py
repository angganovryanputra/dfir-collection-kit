"""Add compound performance indexes for common query patterns.

Adds indexes that are frequently used but missing:
  - audit_logs: (target_type, target_id), (actor_type, actor_id), created_at DESC
  - incidents: (status, updated_at) for dashboard status-filtered listing
  - jobs: (incident_id, status) for per-incident job monitoring
  - super_timeline: (incident_id, datetime) for timeline pagination
  - collection_logs: (incident_id, sequence) for incremental log polling
  - sigma_hits: (incident_id, severity, event_timestamp) for analytics

Revision ID: 20260602_performance_indexes
Revises: 20260601_platform_features
Create Date: 2026-06-02 00:00:00.000000
"""
from alembic import op

revision = "20260602_performance_indexes"
down_revision = "20260601_platform_features"
branch_labels = None
depends_on = None


def _safe_idx(name: str, table: str, *columns: str) -> None:
    """CREATE INDEX IF NOT EXISTS — idempotent, safe on repeated runs."""
    col_str = ", ".join(columns)
    op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({col_str})")


def upgrade() -> None:
    # audit_logs — filtered by resource being audited (most common audit query)
    _safe_idx("ix_audit_logs_target_type_id", "audit_logs", "target_type", "target_id")
    # audit_logs — filtered by actor
    _safe_idx("ix_audit_logs_actor_type_id", "audit_logs", "actor_type", "actor_id")
    # audit_logs — time-range queries (retention pruning, recent events)
    _safe_idx("ix_audit_logs_created_at_desc", "audit_logs", "created_at DESC")

    # incidents — dashboard status filter + sort by updated_at
    _safe_idx("ix_incidents_status_updated", "incidents", "status", "updated_at DESC")
    # incidents — type filter + sort
    _safe_idx("ix_incidents_type_updated", "incidents", "type", "updated_at DESC")

    # jobs — per-incident job monitoring with status filter
    _safe_idx("ix_jobs_incident_status", "jobs", "incident_id", "status")

    # super_timelines — paginated datetime queries per incident
    _safe_idx("ix_super_timeline_incident_dt", "super_timelines", "incident_id", "datetime")

    # collection_logs — incremental poll (sequence > last_seen per incident)
    _safe_idx("ix_collection_logs_incident_seq", "collection_logs", "incident_id", "sequence")

    # sigma_hits — common analytics filter (incident + severity)
    _safe_idx("ix_sigma_hits_incident_sev", "sigma_hits", "incident_id", "severity")


def downgrade() -> None:
    for name in [
        "ix_sigma_hits_incident_sev",
        "ix_collection_logs_incident_seq",
        "ix_super_timeline_incident_dt",
        "ix_jobs_incident_status",
        "ix_incidents_type_updated",
        "ix_incidents_status_updated",
        "ix_audit_logs_created_at_desc",
        "ix_audit_logs_actor_type_id",
        "ix_audit_logs_target_type_id",
    ]:
        op.execute(f"DROP INDEX IF EXISTS {name}")
