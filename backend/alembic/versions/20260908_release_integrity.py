"""Evidence provenance, processing coverage and shared timeline annotations."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20260908_release_integrity"
down_revision = "20260902_agent_credentials"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("evidence_items", sa.Column("job_id", sa.String(), nullable=True))
    op.create_index("ix_evidence_items_job_id", "evidence_items", ["job_id"])
    op.add_column("evidence_items", sa.Column("relative_path", sa.String(), nullable=True))
    op.add_column("evidence_items", sa.Column("hash_algorithm", sa.String(), nullable=True))
    op.add_column("processing_jobs", sa.Column("stage_results", postgresql.JSONB(), nullable=True))
    op.create_table(
        "timeline_annotations",
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id"), primary_key=True),
        sa.Column("event_uid", sa.String(), primary_key=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("updated_by", sa.String(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade():
    op.drop_table("timeline_annotations")
    op.drop_column("processing_jobs", "stage_results")
    op.drop_column("evidence_items", "hash_algorithm")
    op.drop_column("evidence_items", "relative_path")
    op.drop_index("ix_evidence_items_job_id", table_name="evidence_items")
    op.drop_column("evidence_items", "job_id")
