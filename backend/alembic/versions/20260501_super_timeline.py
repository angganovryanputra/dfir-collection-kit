"""add super_timelines and lateral_movements tables

Revision ID: 20260501_super_timeline
Revises: 20260403_phase2_analytics
Create Date: 2026-05-01 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260501_super_timeline"
down_revision = "20260403_phase2_analytics"
branch_labels = None
depends_on = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def _create_index_if_missing(name: str, table: str, columns: list[str]) -> None:
    """Create index using PostgreSQL IF NOT EXISTS — safe to call even if index already exists."""
    col_str = ", ".join(columns)
    op.execute(sa.text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({col_str})"))


def upgrade() -> None:
    existing = _existing_tables()

    if "super_timelines" not in existing:
        op.create_table(
            "super_timelines",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "incident_id",
                sa.String(),
                sa.ForeignKey("incidents.id"),
                nullable=False,
            ),
            sa.Column("status", sa.String(), nullable=False, server_default="PENDING"),
            sa.Column("host_count", sa.Integer(), nullable=True),
            sa.Column("event_count", sa.BigInteger(), nullable=True),
            sa.Column("duckdb_path", sa.String(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
        )
        _create_index_if_missing(
            "ix_super_timelines_incident_id", "super_timelines", ["incident_id"]
        )

    if "lateral_movements" not in existing:
        op.create_table(
            "lateral_movements",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "incident_id",
                sa.String(),
                sa.ForeignKey("incidents.id"),
                nullable=False,
            ),
            sa.Column(
                "super_timeline_id",
                sa.String(),
                sa.ForeignKey("super_timelines.id"),
                nullable=False,
            ),
            sa.Column("detection_type", sa.String(), nullable=False),
            sa.Column("source_host", sa.String(), nullable=False),
            sa.Column("target_host", sa.String(), nullable=False),
            sa.Column("actor", sa.String(), nullable=True),
            sa.Column("first_seen", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
            sa.Column("event_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column(
                "details", postgresql.JSONB(), nullable=False, server_default="{}"
            ),
            sa.Column(
                "detected_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
        )
        _create_index_if_missing(
            "ix_lateral_movements_incident_id", "lateral_movements", ["incident_id"]
        )
        _create_index_if_missing(
            "ix_lateral_movements_super_timeline_id",
            "lateral_movements",
            ["super_timeline_id"],
        )


def downgrade() -> None:
    op.drop_table("lateral_movements")
    op.drop_table("super_timelines")
