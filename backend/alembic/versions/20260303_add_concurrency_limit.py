"""add concurrency_limit to system_settings

Revision ID: 20260303_concurrency_limit
Revises: 20260122_template_id
Create Date: 2026-03-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


def _get_existing_columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


revision = "20260303_concurrency_limit"
down_revision = "20260122_template_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    settings_columns = _get_existing_columns("system_settings")
    if "concurrency_limit" not in settings_columns:
        op.add_column(
            "system_settings",
            sa.Column("concurrency_limit", sa.Integer(), nullable=False, server_default="4"),
        )


def downgrade() -> None:
    op.drop_column("system_settings", "concurrency_limit")
