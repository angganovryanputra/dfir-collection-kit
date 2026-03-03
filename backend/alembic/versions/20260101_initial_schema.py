"""initial schema

Revision ID: initial
Revises:
Create Date: 2026-01-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("username", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("last_login", sa.String(), nullable=False),
            sa.Column("created_at", sa.String(), nullable=False),
            sa.Column("password_hash", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="users_pkey"),
            sa.UniqueConstraint("username", name="users_username_key"),
        )
        op.create_index("ix_users_username", "users", ["username"])

    if "devices" not in existing:
        op.create_table(
            "devices",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("hostname", sa.String(), nullable=False),
            sa.Column("ip_address", sa.String(), nullable=False),
            sa.Column("type", sa.String(), nullable=False),
            sa.Column("os", sa.String(), nullable=False),
            sa.Column("agent_version", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("last_seen", sa.String(), nullable=False),
            sa.Column("cpu_usage", sa.Integer(), nullable=True),
            sa.Column("memory_usage", sa.Integer(), nullable=True),
            sa.Column("collection_status", sa.String(), nullable=False),
            sa.Column("registered_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="devices_pkey"),
        )
        op.create_index("ix_devices_hostname", "devices", ["hostname"])
        op.create_index("ix_devices_ip_address", "devices", ["ip_address"])
        op.create_index("ix_devices_type", "devices", ["type"])
        op.create_index("ix_devices_status", "devices", ["status"])

    if "incidents" not in existing:
        op.create_table(
            "incidents",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("type", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column(
                "target_endpoints", postgresql.ARRAY(sa.String()), nullable=False
            ),
            sa.Column("operator", sa.String(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id", name="incidents_pkey"),
        )
        op.create_index("ix_incidents_type", "incidents", ["type"])
        op.create_index("ix_incidents_status", "incidents", ["status"])

    if "incident_templates" not in existing:
        op.create_table(
            "incident_templates",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("incident_type", sa.String(), nullable=False),
            sa.Column(
                "default_endpoints", postgresql.ARRAY(sa.String()), nullable=False
            ),
            sa.Column("description", sa.String(), nullable=False),
            sa.Column(
                "preflight_checklist", postgresql.ARRAY(sa.String()), nullable=False
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("created_by", sa.String(), nullable=False),
            sa.Column(
                "usage_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.PrimaryKeyConstraint("id", name="incident_templates_pkey"),
        )
        op.create_index("ix_incident_templates_name", "incident_templates", ["name"])
        op.create_index(
            "ix_incident_templates_incident_type",
            "incident_templates",
            ["incident_type"],
        )

    if "collectors" not in existing:
        op.create_table(
            "collectors",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("endpoint", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("last_heartbeat", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="collectors_pkey"),
        )
        op.create_index("ix_collectors_name", "collectors", ["name"])

    if "jobs" not in existing:
        op.create_table(
            "jobs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("incident_id", sa.String(), nullable=False),
            sa.Column("agent_id", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("modules", postgresql.JSONB(), nullable=False),
            sa.Column("output_path", sa.String(), nullable=False),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["incident_id"], ["incidents.id"], name="jobs_incident_id_fkey"
            ),
            sa.ForeignKeyConstraint(
                ["agent_id"], ["devices.id"], name="jobs_agent_id_fkey"
            ),
            sa.PrimaryKeyConstraint("id", name="jobs_pkey"),
        )
        op.create_index("ix_jobs_incident_id", "jobs", ["incident_id"])
        op.create_index("ix_jobs_agent_id", "jobs", ["agent_id"])
        op.create_index("ix_jobs_status", "jobs", ["status"])

    if "evidence_folders" not in existing:
        op.create_table(
            "evidence_folders",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("incident_id", sa.String(), nullable=False),
            sa.Column("type", sa.String(), nullable=False),
            sa.Column("date", sa.String(), nullable=False),
            sa.Column("files_count", sa.Integer(), nullable=False),
            sa.Column("total_size", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.ForeignKeyConstraint(
                ["incident_id"],
                ["incidents.id"],
                name="evidence_folders_incident_id_fkey",
            ),
            sa.PrimaryKeyConstraint("id", name="evidence_folders_pkey"),
        )
        op.create_index(
            "ix_evidence_folders_incident_id", "evidence_folders", ["incident_id"]
        )
        op.create_index("ix_evidence_folders_type", "evidence_folders", ["type"])

    if "evidence_items" not in existing:
        op.create_table(
            "evidence_items",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("incident_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("type", sa.String(), nullable=False),
            sa.Column("size", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("hash", sa.String(), nullable=False),
            sa.Column("collected_at", sa.String(), nullable=False),
            sa.ForeignKeyConstraint(
                ["incident_id"],
                ["incidents.id"],
                name="evidence_items_incident_id_fkey",
            ),
            sa.PrimaryKeyConstraint("id", name="evidence_items_pkey"),
        )
        op.create_index(
            "ix_evidence_items_incident_id", "evidence_items", ["incident_id"]
        )

    if "chain_of_custody_entries" not in existing:
        op.create_table(
            "chain_of_custody_entries",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("incident_id", sa.String(), nullable=False),
            sa.Column("timestamp", sa.String(), nullable=False),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("actor", sa.String(), nullable=False),
            sa.Column("target", sa.String(), nullable=False),
            sa.Column("sequence", sa.Integer(), nullable=False),
            sa.Column("previous_hash", sa.String(), nullable=True),
            sa.Column("entry_hash", sa.String(), nullable=False),
            sa.ForeignKeyConstraint(
                ["incident_id"],
                ["incidents.id"],
                name="chain_of_custody_entries_incident_id_fkey",
            ),
            sa.PrimaryKeyConstraint("id", name="chain_of_custody_entries_pkey"),
        )
        op.create_index(
            "ix_chain_of_custody_entries_incident_id",
            "chain_of_custody_entries",
            ["incident_id"],
        )
        op.create_index(
            "ix_chain_of_custody_entries_sequence",
            "chain_of_custody_entries",
            ["sequence"],
        )
        op.create_index(
            "ix_chain_of_custody_entries_entry_hash",
            "chain_of_custody_entries",
            ["entry_hash"],
        )

    if "audit_logs" not in existing:
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("event_id", sa.String(), nullable=False),
            sa.Column(
                "timestamp",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("actor_type", sa.String(), nullable=False),
            sa.Column("actor_id", sa.String(), nullable=False),
            sa.Column("source", sa.String(), nullable=False),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("target_type", sa.String(), nullable=True),
            sa.Column("target_id", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("metadata", postgresql.JSONB(), nullable=False),
            sa.Column("previous_hash", sa.String(), nullable=True),
            sa.Column("entry_hash", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="audit_logs_pkey"),
            sa.UniqueConstraint("event_id", name="audit_logs_event_id_key"),
        )
        op.create_index("ix_audit_logs_event_id", "audit_logs", ["event_id"])
        op.create_index("ix_audit_logs_event_type", "audit_logs", ["event_type"])
        op.create_index("ix_audit_logs_entry_hash", "audit_logs", ["entry_hash"])

    if "system_settings" not in existing:
        op.create_table(
            "system_settings",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("evidence_storage_path", sa.String(), nullable=False),
            sa.Column("max_file_size_gb", sa.Integer(), nullable=False),
            sa.Column("hash_algorithm", sa.String(), nullable=False),
            sa.Column("collection_timeout_min", sa.Integer(), nullable=False),
            sa.Column("max_concurrent_jobs", sa.Integer(), nullable=False),
            sa.Column("retry_attempts", sa.Integer(), nullable=False),
            sa.Column("session_timeout_min", sa.Integer(), nullable=False),
            sa.Column("max_failed_logins", sa.Integer(), nullable=False),
            sa.Column("log_retention_days", sa.Integer(), nullable=False),
            sa.Column("export_format", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="system_settings_pkey"),
        )


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_table("audit_logs")
    op.drop_table("chain_of_custody_entries")
    op.drop_table("evidence_items")
    op.drop_table("evidence_folders")
    op.drop_table("jobs")
    op.drop_table("collectors")
    op.drop_table("incident_templates")
    op.drop_table("incidents")
    op.drop_table("devices")
    op.drop_table("users")
