"""Fix Device.last_seen and registered_at from String to DateTime

Revision ID: 20260503_device_datetime_fix
Revises: 20260502_notifications_and_binary
Create Date: 2026-05-03 00:00:00.000000
"""
import sqlalchemy as sa
from alembic import op

revision = "20260503_device_datetime_fix"
down_revision = "20260502_notifications_and_binary"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # devices table
    dev_cols = {c["name"]: c for c in inspector.get_columns("devices")}

    for col_name in ("last_seen", "registered_at"):
        if col_name in dev_cols:
            col_type = str(dev_cols[col_name]["type"]).upper()
            if "VARCHAR" in col_type or "TEXT" in col_type or "CHAR" in col_type:
                op.execute(sa.text(f"""
                    ALTER TABLE devices
                    ALTER COLUMN {col_name} TYPE TIMESTAMP WITH TIME ZONE
                    USING (CASE WHEN {col_name} = '' OR {col_name} IS NULL
                                THEN NOW()
                                ELSE {col_name}::TIMESTAMP WITH TIME ZONE END)
                """))

    # collectors table — fix last_heartbeat
    coll_cols = {c["name"]: c for c in inspector.get_columns("collectors")}
    if "last_heartbeat" in coll_cols:
        col_type = str(coll_cols["last_heartbeat"]["type"]).upper()
        if "VARCHAR" in col_type or "TEXT" in col_type or "CHAR" in col_type:
            op.execute(sa.text("""
                ALTER TABLE collectors
                ALTER COLUMN last_heartbeat TYPE TIMESTAMP WITH TIME ZONE
                USING (CASE WHEN last_heartbeat = '' OR last_heartbeat IS NULL
                            THEN NOW()
                            ELSE last_heartbeat::TIMESTAMP WITH TIME ZONE END)
            """))


def downgrade() -> None:
    op.alter_column("devices", "last_seen", type_=sa.String())
    op.alter_column("devices", "registered_at", type_=sa.String())
    op.alter_column("collectors", "last_heartbeat", type_=sa.String())
