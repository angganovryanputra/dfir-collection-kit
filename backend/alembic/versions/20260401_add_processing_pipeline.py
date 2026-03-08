"""add processing_jobs and sigma_hits tables

Revision ID: 20260401_processing_pipeline
Revises: 20260303_concurrency_limit
Create Date: 2026-04-01 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260401_processing_pipeline"
down_revision = "20260303_concurrency_limit"
branch_labels = None
depends_on = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    tables = _existing_tables()

    if "processing_jobs" not in tables:
        op.create_table(
            "processing_jobs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("incident_id", sa.String(), nullable=False),
            sa.Column("job_id", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("phase", sa.String(), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"]),
            sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_processing_jobs_incident_id", "processing_jobs", ["incident_id"])
        op.create_index("ix_processing_jobs_job_id", "processing_jobs", ["job_id"])
        op.create_index("ix_processing_jobs_status", "processing_jobs", ["status"])

    if "sigma_hits" not in tables:
        op.create_table(
            "sigma_hits",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("incident_id", sa.String(), nullable=False),
            sa.Column("processing_job_id", sa.String(), nullable=False),
            sa.Column("rule_id", sa.String(), nullable=False),
            sa.Column("rule_name", sa.String(), nullable=False),
            sa.Column("rule_tags", postgresql.ARRAY(sa.String()), nullable=False),
            sa.Column("severity", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("artifact_file", sa.String(), nullable=False),
            sa.Column("event_timestamp", sa.DateTime(timezone=True), nullable=True),
            sa.Column("event_record_id", sa.String(), nullable=True),
            sa.Column("event_data", postgresql.JSONB(), nullable=False),
            sa.Column(
                "detected_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"]),
            sa.ForeignKeyConstraint(["processing_job_id"], ["processing_jobs.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_sigma_hits_incident_id", "sigma_hits", ["incident_id"])
        op.create_index("ix_sigma_hits_severity", "sigma_hits", ["severity"])
        op.create_index("ix_sigma_hits_rule_id", "sigma_hits", ["rule_id"])
        # Composite index for the most common query pattern: filter by incident + severity
        op.create_index(
            "ix_sigma_hits_incident_severity",
            "sigma_hits",
            ["incident_id", "severity"],
        )
        # Index for time-ordering within an incident
        op.create_index(
            "ix_sigma_hits_incident_event_ts",
            "sigma_hits",
            ["incident_id", "event_timestamp"],
        )


def downgrade() -> None:
    op.drop_table("sigma_hits")
    op.drop_table("processing_jobs")
