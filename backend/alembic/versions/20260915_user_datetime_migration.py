"""User Model Timestamp Migration.

Revision ID: 20260915_user_datetime_migration
Revises: 20260914_case_investigation
Create Date: 2026-09-15 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260915_user_datetime_migration"
down_revision = "20260914_case_investigation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_cols = {c["name"]: c for c in inspector.get_columns("users")}

    if bind.dialect.name == "postgresql":
        if "last_login" in user_cols:
            col_type = str(user_cols["last_login"]["type"]).upper()
            if "VARCHAR" in col_type or "TEXT" in col_type or "CHAR" in col_type:
                op.execute(sa.text("""
                    ALTER TABLE users
                    ALTER COLUMN last_login TYPE TIMESTAMP WITH TIME ZONE
                    USING (CASE WHEN last_login IS NULL OR last_login IN ('', '-')
                                THEN NULL
                                ELSE last_login::TIMESTAMP WITH TIME ZONE END)
                """))

        if "created_at" in user_cols:
            col_type = str(user_cols["created_at"]["type"]).upper()
            if "VARCHAR" in col_type or "TEXT" in col_type or "CHAR" in col_type:
                op.execute(sa.text("""
                    ALTER TABLE users
                    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
                    USING (CASE WHEN created_at IS NULL OR created_at = ''
                                THEN NOW()
                                ELSE created_at::TIMESTAMP WITH TIME ZONE END)
                """))
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column("last_login", type_=sa.DateTime(timezone=True), nullable=True)
            batch_op.alter_column(
                "created_at",
                type_=sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.alter_column("users", "last_login", type_=sa.String(), nullable=True)
        op.alter_column("users", "created_at", type_=sa.String(), nullable=False)
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.alter_column("last_login", type_=sa.String(), nullable=True)
            batch_op.alter_column("created_at", type_=sa.String(), nullable=False)
