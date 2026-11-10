"""Tests for User Model Timestamp Migration & Alembic Script (BE-GAP-09)."""

import importlib.util
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy import DateTime

from app.crud.user import create_user, update_last_login
from app.models.user import User
from app.schemas.user import RoleEnum, UserCreate, UserOut, UserResponse

pytestmark = pytest.mark.asyncio


def test_user_model_column_types():
    """Verify User model column types for last_login and created_at."""
    cols = User.__table__.c

    # last_login column
    assert "last_login" in cols
    last_login_col = cols["last_login"]
    assert isinstance(last_login_col.type, DateTime)
    assert last_login_col.type.timezone is True
    assert last_login_col.nullable is True

    # created_at column
    assert "created_at" in cols
    created_at_col = cols["created_at"]
    assert isinstance(created_at_col.type, DateTime)
    assert created_at_col.type.timezone is True
    assert created_at_col.nullable is False
    assert created_at_col.server_default is not None


async def test_crud_create_user_sets_datetime_and_nullable_last_login():
    """crud.create_user sets last_login=None and created_at to timezone-aware datetime."""
    db = AsyncMock()
    db.add = MagicMock()
    payload = UserCreate(
        username="newuser",
        role=RoleEnum.operator,
        status="active",
        password="secretpassword123",
    )

    created = await create_user(db, payload)

    assert created.username == "newuser"
    assert created.role == "operator"
    assert created.status == "active"
    assert created.last_login is None
    assert isinstance(created.created_at, datetime)
    assert created.created_at.tzinfo == timezone.utc
    db.add.assert_called_once_with(created)
    db.flush.assert_awaited_once()


async def test_crud_update_last_login_sets_datetime():
    """crud.update_last_login assigns datetime.now(timezone.utc) to user.last_login."""
    user = User(
        id=str(uuid4()),
        username="testlogin",
        role="operator",
        status="active",
        last_login=None,
        created_at=datetime.now(timezone.utc),
        password_hash="hashed",
    )
    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=mock_result)

    await update_last_login(db, user.id)

    assert isinstance(user.last_login, datetime)
    assert user.last_login.tzinfo == timezone.utc
    db.flush.assert_awaited_once()


async def test_crud_update_last_login_nonexistent_user():
    """crud.update_last_login gracefully handles nonexistent user ID."""
    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=mock_result)

    await update_last_login(db, "nonexistent-user-id")
    db.flush.assert_not_awaited()


def test_user_response_serialization_datetime():
    """UserResponse properly serializes datetime objects for last_login and created_at."""
    now = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)
    resp = UserResponse(
        id="usr-123",
        username="alice",
        role=RoleEnum.admin,
        status="active",
        last_login=now,
        created_at=now,
    )

    data = resp.model_dump(mode="json")
    assert data["id"] == "usr-123"
    assert data["username"] == "alice"
    assert data["role"] == "admin"
    assert data["status"] == "active"
    assert data["last_login"] == "2026-09-15T12:00:00Z"
    assert data["created_at"] == "2026-09-15T12:00:00Z"


def test_user_response_serialization_nullable_last_login():
    """UserResponse handles last_login=None as default or explicit."""
    now = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)
    resp = UserResponse(
        id="usr-123",
        username="bob",
        role=RoleEnum.viewer,
        status="active",
        created_at=now,
    )
    assert resp.last_login is None
    data = resp.model_dump(mode="json")
    assert data["last_login"] is None

    resp_explicit = UserResponse(
        id="usr-124",
        username="bob",
        role=RoleEnum.viewer,
        status="active",
        last_login=None,
        created_at=now,
    )
    assert resp_explicit.last_login is None
    assert resp_explicit.model_dump(mode="json")["last_login"] is None


def test_user_response_serialization_string_timestamps():
    """UserResponse accepts string timestamps for backward compatibility."""
    resp = UserResponse(
        id="usr-legacy",
        username="charlie",
        role=RoleEnum.operator,
        status="active",
        last_login="-",
        created_at="2026-01-01T00:00:00Z",
    )
    assert resp.last_login == "-"
    assert resp.created_at == "2026-01-01T00:00:00Z"


def test_user_response_from_orm_model():
    """UserResponse and UserOut work seamlessly with model_validate from ORM User model."""
    now = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)
    user = User(
        id="usr-orm",
        username="david",
        role="admin",
        status="active",
        last_login=now,
        created_at=now,
        password_hash="hash123",
    )

    out = UserResponse.model_validate(user)
    assert out.id == "usr-orm"
    assert out.username == "david"
    assert out.role == RoleEnum.admin
    assert out.last_login == now
    assert out.created_at == now

    # Also test UserOut alias
    out_alias = UserOut.model_validate(user)
    assert out_alias.id == out.id

    # User with None last_login
    user_no_login = User(
        id="usr-orm-2",
        username="eve",
        role="viewer",
        status="active",
        last_login=None,
        created_at=now,
        password_hash="hash123",
    )
    out_no_login = UserOut.model_validate(user_no_login)
    assert out_no_login.last_login is None


def test_alembic_migration_revision_chain_and_syntax():
    """Verify the Alembic migration file syntax, revision ID, down_revision, and SQL contents."""
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "20260915_user_datetime_migration.py"
    )
    assert migration_path.exists(), f"Migration file not found at {migration_path}"

    spec = importlib.util.spec_from_file_location("migration_mod", migration_path)
    assert spec is not None
    assert spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    # Check Alembic metadata
    assert mod.revision == "20260915_user_datetime_migration"
    assert mod.down_revision == "20260914_case_investigation"
    assert callable(mod.upgrade)
    assert callable(mod.downgrade)

    # Verify SQL expressions in file source
    content = migration_path.read_text(encoding="utf-8")
    assert "CASE WHEN last_login IS NULL OR last_login IN ('', '-')" in content
    assert "THEN NULL" in content
    assert "ELSE last_login::TIMESTAMP WITH TIME ZONE END" in content
    assert "CASE WHEN created_at IS NULL OR created_at = ''" in content
    assert "THEN NOW()" in content
    assert "ELSE created_at::TIMESTAMP WITH TIME ZONE END" in content


def test_alembic_migration_upgrade_and_downgrade_postgres():
    """Test upgrade and downgrade execution logic under simulated PostgreSQL dialect."""
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "20260915_user_datetime_migration.py"
    )
    spec = importlib.util.spec_from_file_location("migration_mod", migration_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    mock_bind = MagicMock()
    mock_bind.dialect.name = "postgresql"

    mock_inspector = MagicMock()
    mock_inspector.get_columns.return_value = [
        {"name": "last_login", "type": sa.VARCHAR(length=64)},
        {"name": "created_at", "type": sa.VARCHAR(length=64)},
    ]

    executed_sqls = []

    def capture_execute(statement, *args, **kwargs):
        executed_sqls.append(str(statement))

    with patch("alembic.op.get_bind", return_value=mock_bind), patch(
        "sqlalchemy.inspect", return_value=mock_inspector
    ), patch("alembic.op.execute", side_effect=capture_execute), patch(
        "alembic.op.alter_column"
    ) as mock_alter_column:
        mod.upgrade()
        assert len(executed_sqls) == 2
        assert "ALTER TABLE users" in executed_sqls[0]
        assert "ALTER COLUMN last_login TYPE TIMESTAMP WITH TIME ZONE" in executed_sqls[0]
        assert "ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE" in executed_sqls[1]

        mod.downgrade()
        assert mock_alter_column.call_count == 2
