"""add phase2 analytics tables: attack_chains, ioc_indicators, ioc_matches, yara_matches

Revision ID: 20260403_phase2_analytics
Revises: 20260402_processing_settings
Create Date: 2026-04-03 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260403_phase2_analytics"
down_revision = "20260402_processing_settings"
branch_labels = None
depends_on = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def _existing_columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


def _existing_indexes(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    try:
        return {idx["name"] for idx in inspector.get_indexes(table_name)}
    except Exception:
        return set()


def _create_index_if_missing(name: str, table: str, columns: list[str]) -> None:
    if name not in _existing_indexes(table):
        op.create_index(name, table, columns)


def upgrade() -> None:
    # Add yara_rules_path to system_settings if missing
    settings_cols = _existing_columns("system_settings")
    if "yara_rules_path" not in settings_cols:
        op.add_column(
            "system_settings",
            sa.Column("yara_rules_path", sa.String(), nullable=True),
        )

    existing = _existing_tables()

    if "attack_chains" not in existing:
        op.create_table(
            "attack_chains",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id"), nullable=False),
            sa.Column(
                "processing_job_id",
                sa.String(),
                sa.ForeignKey("processing_jobs.id"),
                nullable=True,
            ),
            sa.Column("window_start", sa.DateTime(timezone=True), nullable=True),
            sa.Column("window_end", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "tactics",
                postgresql.ARRAY(sa.String()),
                nullable=False,
                server_default="{}",
            ),
            sa.Column(
                "techniques",
                postgresql.ARRAY(sa.String()),
                nullable=False,
                server_default="{}",
            ),
            sa.Column(
                "graph_nodes", postgresql.JSONB(), nullable=False, server_default="[]"
            ),
            sa.Column(
                "graph_edges", postgresql.JSONB(), nullable=False, server_default="[]"
            ),
            sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "severity",
                sa.String(),
                nullable=False,
                server_default="informational",
            ),
            sa.Column(
                "sigma_hit_ids",
                postgresql.ARRAY(sa.String()),
                nullable=False,
                server_default="{}",
            ),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
        )
        _create_index_if_missing("ix_attack_chains_incident_id", "attack_chains", ["incident_id"])

    if "ioc_indicators" not in existing:
        op.create_table(
            "ioc_indicators",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("ioc_type", sa.String(), nullable=False),
            sa.Column("value", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("source", sa.String(), nullable=True),
            sa.Column("severity", sa.String(), nullable=False, server_default="high"),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
            sa.Column("created_by", sa.String(), nullable=True),
        )
        _create_index_if_missing("ix_ioc_type_value", "ioc_indicators", ["ioc_type", "value"])

    if "ioc_matches" not in existing:
        op.create_table(
            "ioc_matches",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id"), nullable=False),
            sa.Column(
                "processing_job_id",
                sa.String(),
                sa.ForeignKey("processing_jobs.id"),
                nullable=True,
            ),
            sa.Column(
                "indicator_id",
                sa.String(),
                sa.ForeignKey("ioc_indicators.id"),
                nullable=False,
            ),
            sa.Column("ioc_type", sa.String(), nullable=False),
            sa.Column("ioc_value", sa.String(), nullable=False),
            sa.Column("matched_field", sa.String(), nullable=False),
            sa.Column("matched_value", sa.String(), nullable=False),
            sa.Column("event_source", sa.String(), nullable=True),
            sa.Column("event_timestamp", sa.DateTime(timezone=True), nullable=True),
            sa.Column("event_data", postgresql.JSONB(), nullable=False, server_default="{}"),
            sa.Column("severity", sa.String(), nullable=False, server_default="high"),
            sa.Column(
                "detected_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
        )
        _create_index_if_missing("ix_ioc_matches_incident_id", "ioc_matches", ["incident_id"])
        _create_index_if_missing("ix_ioc_matches_incident_type", "ioc_matches", ["incident_id", "ioc_type"])

    if "yara_matches" not in existing:
        op.create_table(
            "yara_matches",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id"), nullable=False),
            sa.Column(
                "processing_job_id",
                sa.String(),
                sa.ForeignKey("processing_jobs.id"),
                nullable=True,
            ),
            sa.Column("rule_name", sa.String(), nullable=False),
            sa.Column("rule_namespace", sa.String(), nullable=True),
            sa.Column("matched_file", sa.String(), nullable=False),
            sa.Column("file_size", sa.Integer(), nullable=True),
            sa.Column("file_sha256", sa.String(), nullable=True),
            sa.Column("strings", postgresql.JSONB(), nullable=False, server_default="[]"),
            sa.Column("severity", sa.String(), nullable=False, server_default="high"),
            sa.Column(
                "detected_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
        )
        _create_index_if_missing("ix_yara_matches_incident_id", "yara_matches", ["incident_id"])


def downgrade() -> None:
    op.drop_column("system_settings", "yara_rules_path")
    for tbl in ["yara_matches", "ioc_matches", "ioc_indicators", "attack_chains"]:
        op.drop_table(tbl)
