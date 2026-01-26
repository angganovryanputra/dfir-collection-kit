"""add incident collection state

Revision ID: 20260117_add_incident_collection_state
Revises: 
Create Date: 2026-01-17 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


def _get_existing_columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}

revision = "20260117_collection_state"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    incident_columns = _get_existing_columns("incidents")
    if "collection_progress" not in incident_columns:
        op.add_column(
            "incidents",
            sa.Column("collection_progress", sa.Integer(), nullable=False, server_default="0"),
        )
    if "collection_phase" not in incident_columns:
        op.add_column("incidents", sa.Column("collection_phase", sa.String(), nullable=True))
    if "last_log_index" not in incident_columns:
        op.add_column(
            "incidents",
            sa.Column("last_log_index", sa.Integer(), nullable=False, server_default="0"),
        )

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "collection_logs" not in existing_tables:
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

    if "collection_progress" not in incident_columns:
        op.alter_column("incidents", "collection_progress", server_default=None)
    if "last_log_index" not in incident_columns:
        op.alter_column("incidents", "last_log_index", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_collection_logs_sequence", table_name="collection_logs")
    op.drop_index("ix_collection_logs_incident_id", table_name="collection_logs")
    op.drop_table("collection_logs")

    op.drop_column("incidents", "last_log_index")
    op.drop_column("incidents", "collection_phase")
    op.drop_column("incidents", "collection_progress")
