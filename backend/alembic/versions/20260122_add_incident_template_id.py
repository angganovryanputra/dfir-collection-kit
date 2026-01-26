"""add incident template id

Revision ID: 20260122_add_incident_template_id
Revises: 20260117_add_incident_collection_state
Create Date: 2026-01-22 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


def _get_existing_columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}

revision = "20260122_template_id"
down_revision = "20260117_collection_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    incident_columns = _get_existing_columns("incidents")
    if "template_id" not in incident_columns:
        op.add_column("incidents", sa.Column("template_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("incidents", "template_id")
