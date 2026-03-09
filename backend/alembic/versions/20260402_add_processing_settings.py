"""add processing tool settings to system_settings

Revision ID: 20260402_processing_settings
Revises: 20260401_processing_pipeline
Create Date: 2026-04-02 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "20260402_processing_settings"
down_revision = "20260401_processing_pipeline"
branch_labels = None
depends_on = None


def _existing_columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    cols = _existing_columns("system_settings")

    new_cols = [
        ("ez_tools_path", sa.String(), None),
        ("chainsaw_path", sa.String(), None),
        ("hayabusa_path", sa.String(), None),
        ("sigma_rules_path", sa.String(), None),
        ("timesketch_url", sa.String(), None),
        ("timesketch_token", sa.String(), None),
        ("auto_process", sa.Boolean(), None),
    ]

    for col_name, col_type, default in new_cols:
        if col_name not in cols:
            kwargs: dict = {"nullable": True}
            if default is not None:
                kwargs["server_default"] = str(default) if not isinstance(default, str) else default
            if col_name == "auto_process":
                kwargs["server_default"] = "true"
                kwargs["nullable"] = False
            op.add_column("system_settings", sa.Column(col_name, col_type, **kwargs))


def downgrade() -> None:
    for col in ["auto_process", "timesketch_token", "timesketch_url",
                "sigma_rules_path", "hayabusa_path", "chainsaw_path", "ez_tools_path"]:
        op.drop_column("system_settings", col)
