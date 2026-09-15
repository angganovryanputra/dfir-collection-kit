"""Add shared investigator notes per incident."""

import sqlalchemy as sa
from alembic import op

revision = "20260914_incident_notes"
down_revision = "20260914_incident_case_metadata"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "incident_notes",
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id"), primary_key=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_by", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table("incident_notes")
