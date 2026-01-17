"""add incident collection state

Revision ID: 20260117_add_incident_collection_state
Revises: 
Create Date: 2026-01-17 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "20260117_add_incident_collection_state"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("incidents", sa.Column("collection_progress", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("incidents", sa.Column("collection_phase", sa.String(), nullable=True))
    op.add_column("incidents", sa.Column("last_log_index", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "collection_logs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("incident_id", sa.String(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("level", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], name="collection_logs_incident_id_fkey"),
        sa.PrimaryKeyConstraint("id", name="collection_logs_pkey"),
    )
    op.create_index("ix_collection_logs_incident_id", "collection_logs", ["incident_id"])
    op.create_index("ix_collection_logs_sequence", "collection_logs", ["sequence"])

    op.alter_column("incidents", "collection_progress", server_default=None)
    op.alter_column("incidents", "last_log_index", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_collection_logs_sequence", table_name="collection_logs")
    op.drop_index("ix_collection_logs_incident_id", table_name="collection_logs")
    op.drop_table("collection_logs")

    op.drop_column("incidents", "last_log_index")
    op.drop_column("incidents", "collection_phase")
    op.drop_column("incidents", "collection_progress")
