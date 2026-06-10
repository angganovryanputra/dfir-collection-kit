"""Add AI/LLM settings to system_settings

Revision ID: 20260603_ai_settings
Revises: 20260602_performance_indexes
Create Date: 2026-06-03
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260603_ai_settings"
down_revision = "20260602_performance_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("system_settings", sa.Column("ai_provider", sa.String(), nullable=True))
    op.add_column("system_settings", sa.Column("ai_model", sa.String(), nullable=True))
    op.add_column("system_settings", sa.Column("ai_api_key", sa.String(), nullable=True))
    op.add_column("system_settings", sa.Column("ai_api_url", sa.String(), nullable=True))
    op.add_column("system_settings", sa.Column("google_oauth_client_id", sa.String(), nullable=True))
    op.add_column("system_settings", sa.Column("google_oauth_client_secret", sa.String(), nullable=True))
    op.add_column("system_settings", sa.Column("google_oauth_refresh_token", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("system_settings", "google_oauth_refresh_token")
    op.drop_column("system_settings", "google_oauth_client_secret")
    op.drop_column("system_settings", "google_oauth_client_id")
    op.drop_column("system_settings", "ai_api_url")
    op.drop_column("system_settings", "ai_api_key")
    op.drop_column("system_settings", "ai_model")
    op.drop_column("system_settings", "ai_provider")
