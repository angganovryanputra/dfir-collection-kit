"""Add non-reversible per-agent credential hashes.

Revision ID: 20260902_agent_credentials
Revises: 20260902_chain_custody_hardening
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260902_agent_credentials"
down_revision = "20260902_chain_custody_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("devices", sa.Column("agent_token_hash", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("devices", "agent_token_hash")
