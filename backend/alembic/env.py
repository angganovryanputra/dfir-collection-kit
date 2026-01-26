from logging.config import fileConfig
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, inspect, pool, text

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_sync_database_url
import app.models  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", get_sync_database_url())

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        inspector = inspect(connection)
        if "alembic_version" in inspector.get_table_names():
            connection.execute(
                text(
                    "ALTER TABLE alembic_version "
                    "ALTER COLUMN version_num TYPE VARCHAR(64)"
                )
            )
            connection.commit()

        if "incidents" in inspector.get_table_names():
            incident_columns = {col["name"] for col in inspector.get_columns("incidents")}
            if "template_id" not in incident_columns:
                connection.execute(
                    text("ALTER TABLE incidents ADD COLUMN template_id VARCHAR")
                )
                connection.commit()

        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
