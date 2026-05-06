"""add webhook_url, notification_email, agent_binary_path to system_settings

Revision ID: 20260502_notifications_and_binary
Revises: 20260501_super_timeline
Create Date: 2026-05-02 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "20260502_notifications_and_binary"
down_revision = "79fe3e192d10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = {c["name"] for c in inspector.get_columns("system_settings")}

    if "webhook_url" not in existing_cols:
        op.add_column("system_settings", sa.Column("webhook_url", sa.String(), nullable=True))
    if "notification_email" not in existing_cols:
        op.add_column("system_settings", sa.Column("notification_email", sa.String(), nullable=True))
    if "agent_binary_path" not in existing_cols:
        op.add_column("system_settings", sa.Column("agent_binary_path", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("system_settings", "agent_binary_path")
    op.drop_column("system_settings", "notification_email")
    op.drop_column("system_settings", "webhook_url")
