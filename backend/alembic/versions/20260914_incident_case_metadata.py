"""Add case-management metadata to incidents."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260914_incident_case_metadata"
down_revision = "20260908_release_integrity"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("incidents", sa.Column("title", sa.String(length=240), nullable=True))
    op.add_column("incidents", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("incidents", sa.Column("severity", sa.String(length=16), nullable=False, server_default="MEDIUM"))
    op.add_column("incidents", sa.Column("priority", sa.String(length=16), nullable=False, server_default="P2"))
    op.add_column("incidents", sa.Column("assignee", sa.String(length=128), nullable=True))
    op.add_column("incidents", sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"))
    for name, column in (("title", "title"), ("severity", "severity"), ("priority", "priority"), ("assignee", "assignee")):
        op.create_index(f"ix_incidents_{name}", "incidents", [column])


def downgrade():
    for name in ("assignee", "priority", "severity", "title"):
        op.drop_index(f"ix_incidents_{name}", table_name="incidents")
    op.drop_column("incidents", "tags")
    op.drop_column("incidents", "assignee")
    op.drop_column("incidents", "priority")
    op.drop_column("incidents", "severity")
    op.drop_column("incidents", "description")
    op.drop_column("incidents", "title")
