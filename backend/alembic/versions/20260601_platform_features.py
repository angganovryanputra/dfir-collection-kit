"""Add platform feature tables and webhook_secret column.

Creates: custom_modules, attack_hypotheses, scheduled_collections,
         threat_hunt_queries, legal_holds.
Alters:  system_settings — adds webhook_secret column.

Revision ID: 20260601_platform_features
Revises: 20260503_device_datetime_fix
Create Date: 2026-06-01 00:00:00.000000
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "20260601_platform_features"
down_revision = "20260503_device_datetime_fix"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── system_settings: add webhook_secret ───────────────────────────────────
    op.add_column(
        "system_settings",
        sa.Column("webhook_secret", sa.String(), nullable=True),
    )

    # ── custom_modules ────────────────────────────────────────────────────────
    op.create_table(
        "custom_modules",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("os", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("command", sa.Text(), nullable=False),
        sa.Column("output_relpath", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_custom_modules_name", "custom_modules", ["name"])

    # ── attack_hypotheses ─────────────────────────────────────────────────────
    op.create_table(
        "attack_hypotheses",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tactic", sa.String(), nullable=True),
        sa.Column("technique_id", sa.String(), nullable=True),
        sa.Column("confidence", sa.String(), server_default="LOW", nullable=False),
        sa.Column("status", sa.String(), server_default="OPEN", nullable=False),
        sa.Column(
            "evidence_refs",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_attack_hypotheses_incident_id", "attack_hypotheses", ["incident_id"])

    # ── scheduled_collections ─────────────────────────────────────────────────
    op.create_table(
        "scheduled_collections",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id"), nullable=False),
        sa.Column("cron_expr", sa.String(), nullable=False),
        sa.Column("profile", sa.String(), nullable=True),
        sa.Column(
            "module_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_scheduled_collections_incident_id", "scheduled_collections", ["incident_id"]
    )

    # ── threat_hunt_queries ───────────────────────────────────────────────────
    op.create_table(
        "threat_hunt_queries",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("sigma_rule", sa.Text(), nullable=True),
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("mitre_technique", sa.String(), nullable=True),
        sa.Column("is_public", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_threat_hunt_queries_name", "threat_hunt_queries", ["name"])

    # ── legal_holds ───────────────────────────────────────────────────────────
    op.create_table(
        "legal_holds",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("custodian", sa.String(), nullable=False),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), server_default="ACTIVE", nullable=False),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_legal_holds_incident_id", "legal_holds", ["incident_id"])


def downgrade() -> None:
    op.drop_index("ix_legal_holds_incident_id", table_name="legal_holds")
    op.drop_table("legal_holds")
    op.drop_index("ix_threat_hunt_queries_name", table_name="threat_hunt_queries")
    op.drop_table("threat_hunt_queries")
    op.drop_index(
        "ix_scheduled_collections_incident_id", table_name="scheduled_collections"
    )
    op.drop_table("scheduled_collections")
    op.drop_index("ix_attack_hypotheses_incident_id", table_name="attack_hypotheses")
    op.drop_table("attack_hypotheses")
    op.drop_index("ix_custom_modules_name", table_name="custom_modules")
    op.drop_table("custom_modules")
    op.drop_column("system_settings", "webhook_secret")
