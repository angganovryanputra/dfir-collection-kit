"""Add incident tasks and detection triage state."""

import sqlalchemy as sa
from alembic import op

revision = "20260914_case_investigation"
down_revision = "20260914_incident_notes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("incident_tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id"), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="OPEN"),
        sa.Column("assignee", sa.String(length=128), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_incident_tasks_incident_id", "incident_tasks", ["incident_id"])
    op.create_table("detection_triage",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id"), nullable=False),
        sa.Column("detection_type", sa.String(length=16), nullable=False),
        sa.Column("detection_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="NEW"),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_detection_triage_incident_id", "detection_triage", ["incident_id"])


def downgrade():
    op.drop_index("ix_detection_triage_incident_id", table_name="detection_triage")
    op.drop_table("detection_triage")
    op.drop_index("ix_incident_tasks_incident_id", table_name="incident_tasks")
    op.drop_table("incident_tasks")
