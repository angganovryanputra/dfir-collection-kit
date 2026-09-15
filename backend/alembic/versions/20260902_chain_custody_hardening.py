"""Harden chain-of-custody integrity.

Revision ID: 20260902_chain_custody_hardening
Revises: 20260603_ai_settings
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260902_chain_custody_hardening"
down_revision = "20260603_ai_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chain_of_custody_entries", sa.Column("entry_signature", sa.String(), nullable=True)
    )
    op.create_unique_constraint(
        "uq_coc_incident_sequence", "chain_of_custody_entries", ["incident_id", "sequence"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_coc_incident_sequence", "chain_of_custody_entries", type_="unique")
    op.drop_column("chain_of_custody_entries", "entry_signature")
