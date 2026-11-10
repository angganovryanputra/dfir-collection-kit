"""Tests for User Password Management & Admin Password Reset (BE-GAP-04)."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.users import update_user_endpoint
from app.core.deps import require_roles
from app.core.security import get_password_hash, verify_password
from app.crud.user import update_user
from app.models.user import User
from app.schemas.user import RoleEnum, UserUpdate

pytestmark = pytest.mark.asyncio


def _build_test_user(
    username: str = "TARGET_USER",
    role: str = "operator",
    password: str = "initial_secret_123",
    user_id: str | None = None,
) -> User:
    return User(
        id=user_id or str(uuid4()),
        username=username.upper(),
        role=role,
        status="active",
        created_at=datetime.now(timezone.utc).isoformat(),
        last_login="-",
        password_hash=get_password_hash(password),
    )


def test_user_update_schema_accepts_password():
    """UserUpdate schema must accept optional password field and default to None."""
    payload_empty = UserUpdate()
    assert payload_empty.password is None

    payload_with_pw = UserUpdate(password="new_secret_123")
    assert payload_with_pw.password == "new_secret_123"
    assert payload_with_pw.model_dump(exclude_unset=True) == {"password": "new_secret_123"}

    payload_combined = UserUpdate(role=RoleEnum.admin, password="secure_password")
    assert payload_combined.role == RoleEnum.admin
    assert payload_combined.password == "secure_password"


async def test_crud_update_user_hashes_password_and_cleans_model():
    """crud.update_user must hash the password into password_hash and not set 'password'."""
    initial_user = _build_test_user("alice", "operator", "old_password_123")
    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = initial_user
    db.execute = AsyncMock(return_value=mock_result)

    payload = UserUpdate(password="new_password_456")
    updated = await update_user(db, initial_user.id, payload)

    assert updated is not None
    assert updated.id == initial_user.id
    assert updated.role == "operator"
    assert updated.status == "active"
    assert verify_password("new_password_456", updated.password_hash) is True
    assert verify_password("old_password_123", updated.password_hash) is False
    assert not hasattr(updated, "password")
    db.flush.assert_awaited_once()


async def test_crud_update_user_combined_password_and_role():
    """crud.update_user correctly updates both role/status and password_hash together."""
    initial_user = _build_test_user("alice", "operator", "old_password_123")
    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = initial_user
    db.execute = AsyncMock(return_value=mock_result)

    payload = UserUpdate(role=RoleEnum.admin, password="  trimmed_password_123  ")
    updated = await update_user(db, initial_user.id, payload)

    assert updated is not None
    assert updated.role == "admin"
    assert verify_password("trimmed_password_123", updated.password_hash) is True
    assert not hasattr(updated, "password")
    db.flush.assert_awaited_once()


async def test_crud_update_user_explicit_none_password():
    """crud.update_user leaves password_hash intact if password=None is explicitly provided."""
    initial_user = _build_test_user("alice", "operator", "old_password_123")
    old_hash = initial_user.password_hash
    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = initial_user
    db.execute = AsyncMock(return_value=mock_result)

    payload = UserUpdate(password=None, status="inactive")
    updated = await update_user(db, initial_user.id, payload)

    assert updated is not None
    assert updated.status == "inactive"
    assert updated.password_hash == old_hash
    assert not hasattr(updated, "password")
    db.flush.assert_awaited_once()


async def test_crud_update_user_leaves_password_unchanged_when_omitted():
    """crud.update_user must leave password_hash intact if password is not in payload."""
    initial_user = _build_test_user("bob", "viewer", "existing_password_123")
    old_hash = initial_user.password_hash
    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = initial_user
    db.execute = AsyncMock(return_value=mock_result)

    payload = UserUpdate(status="inactive")
    updated = await update_user(db, initial_user.id, payload)

    assert updated is not None
    assert updated.status == "inactive"
    assert updated.role == "viewer"
    assert updated.password_hash == old_hash
    db.flush.assert_awaited_once()


async def test_crud_update_user_not_found_returns_none():
    """crud.update_user returns None if user does not exist."""
    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=mock_result)

    payload = UserUpdate(password="some_new_password")
    result = await update_user(db, "nonexistent-id", payload)
    assert result is None


async def test_endpoint_password_shorter_than_6_chars_raises_422():
    """update_user_endpoint must reject passwords shorter than 6 chars with 422."""
    admin_user = _build_test_user("admin", "admin", "admin_secret")
    target_user = _build_test_user("charlie", "operator", "current_secret")
    db = AsyncMock()

    with patch(
        "app.api.v1.endpoints.users.get_user", new=AsyncMock(return_value=target_user)
    ), patch("app.api.v1.endpoints.users.update_user", new=AsyncMock()) as mock_update:
        # Test short password (< 6 chars)
        with pytest.raises(HTTPException) as exc_info:
            await update_user_endpoint(
                user_id=target_user.id,
                payload=UserUpdate(password="12345"),
                db=db,
                current_user=admin_user,
            )
        assert exc_info.value.status_code == 422
        assert exc_info.value.detail == "Password must be at least 6 characters"

        # Test whitespace padded short password
        with pytest.raises(HTTPException) as exc_info_ws:
            await update_user_endpoint(
                user_id=target_user.id,
                payload=UserUpdate(password="  abc  "),
                db=db,
                current_user=admin_user,
            )
        assert exc_info_ws.value.status_code == 422
        assert exc_info_ws.value.detail == "Password must be at least 6 characters"

        # Test empty string password
        with pytest.raises(HTTPException) as exc_info_empty:
            await update_user_endpoint(
                user_id=target_user.id,
                payload=UserUpdate(password=""),
                db=db,
                current_user=admin_user,
            )
        assert exc_info_empty.value.status_code == 422
        assert exc_info_empty.value.detail == "Password must be at least 6 characters"

        mock_update.assert_not_awaited()


async def test_endpoint_admin_password_reset_emits_audit_event():
    """update_user_endpoint must record 'admin_password_reset' audit event on password reset."""
    admin_user = _build_test_user("admin", "admin", "admin_secret")
    target_user = _build_test_user("target", "operator", "target_secret")
    db = AsyncMock()

    updated_target = _build_test_user(
        "target", "operator", "new_secret_password", user_id=target_user.id
    )
    payload = UserUpdate(password="new_secret_password")

    with patch(
        "app.api.v1.endpoints.users.get_user", new=AsyncMock(return_value=target_user)
    ), patch(
        "app.api.v1.endpoints.users.update_user", new=AsyncMock(return_value=updated_target)
    ) as mock_update, patch(
        "app.api.v1.endpoints.users.safe_record_event", new=AsyncMock()
    ) as mock_audit:

        out = await update_user_endpoint(
            user_id=target_user.id,
            payload=payload,
            db=db,
            current_user=admin_user,
        )

        assert out.id == target_user.id
        mock_update.assert_awaited_once_with(db, target_user.id, payload)

        # safe_record_event should be called twice: admin_user_updated and admin_password_reset
        assert mock_audit.await_count == 2
        calls = mock_audit.await_args_list

        update_call = calls[0].kwargs
        assert update_call["event_type"] == "admin_user_updated"

        pw_reset_call = calls[1].kwargs
        assert pw_reset_call["event_type"] == "admin_password_reset"
        assert pw_reset_call["actor_type"] == "user"
        assert pw_reset_call["actor_id"] == admin_user.id
        assert pw_reset_call["source"] == "backend"
        assert pw_reset_call["action"] == "reset password"
        assert pw_reset_call["target_type"] == "user"
        assert pw_reset_call["target_id"] == target_user.id
        assert pw_reset_call["status"] == "success"
        assert pw_reset_call["message"] == "User password reset by admin"
        assert pw_reset_call["metadata"] == {"username": updated_target.username}


async def test_endpoint_update_without_password_does_not_emit_password_reset_audit():
    """update_user_endpoint must NOT emit 'admin_password_reset' if password was not set."""
    admin_user = _build_test_user("admin", "admin", "admin_secret")
    target_user = _build_test_user("target", "operator", "target_secret")
    db = AsyncMock()

    updated_target = _build_test_user("target", "operator", "target_secret", user_id=target_user.id)
    updated_target.status = "inactive"
    payload = UserUpdate(status="inactive")

    with patch(
        "app.api.v1.endpoints.users.get_user", new=AsyncMock(return_value=target_user)
    ), patch(
        "app.api.v1.endpoints.users.update_user", new=AsyncMock(return_value=updated_target)
    ), patch(
        "app.api.v1.endpoints.users.safe_record_event", new=AsyncMock()
    ) as mock_audit:

        out = await update_user_endpoint(
            user_id=target_user.id,
            payload=payload,
            db=db,
            current_user=admin_user,
        )

        assert out.id == target_user.id
        assert mock_audit.await_count == 1
        call_kwargs = mock_audit.await_args.kwargs
        assert call_kwargs["event_type"] == "admin_user_updated"


async def test_endpoint_admin_can_reset_own_password():
    """Admin updating their own password succeeds and emits admin_password_reset."""
    admin_user = _build_test_user("admin", "admin", "admin_secret")
    db = AsyncMock()

    updated_admin = _build_test_user(
        "admin", "admin", "brand_new_admin_pass", user_id=admin_user.id
    )
    payload = UserUpdate(password="brand_new_admin_pass")

    with patch(
        "app.api.v1.endpoints.users.get_user", new=AsyncMock(return_value=admin_user)
    ), patch(
        "app.api.v1.endpoints.users.update_user", new=AsyncMock(return_value=updated_admin)
    ) as mock_update, patch(
        "app.api.v1.endpoints.users.safe_record_event", new=AsyncMock()
    ) as mock_audit:

        out = await update_user_endpoint(
            user_id=admin_user.id,
            payload=payload,
            db=db,
            current_user=admin_user,
        )

        assert out.id == admin_user.id
        mock_update.assert_awaited_once_with(db, admin_user.id, payload)
        assert mock_audit.await_count == 2
        pw_reset_call = mock_audit.await_args_list[1].kwargs
        assert pw_reset_call["event_type"] == "admin_password_reset"
        assert pw_reset_call["target_id"] == admin_user.id


async def test_endpoint_user_not_found_raises_404():
    """update_user_endpoint raises 404 when target user is not found."""
    admin_user = _build_test_user("admin", "admin", "admin_secret")
    db = AsyncMock()

    with patch("app.api.v1.endpoints.users.get_user", new=AsyncMock(return_value=None)), patch(
        "app.api.v1.endpoints.users.update_user", new=AsyncMock()
    ) as mock_update, patch(
        "app.api.v1.endpoints.users.safe_record_event", new=AsyncMock()
    ) as mock_audit:

        with pytest.raises(HTTPException) as exc_info:
            await update_user_endpoint(
                user_id="nonexistent-id",
                payload=UserUpdate(password="valid_new_secret"),
                db=db,
                current_user=admin_user,
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "User not found"
        mock_update.assert_not_awaited()
        mock_audit.assert_not_awaited()


async def test_endpoint_password_exactly_6_chars_accepted():
    """update_user_endpoint accepts passwords with exactly 6 characters."""
    admin_user = _build_test_user("admin", "admin", "admin_secret")
    target_user = _build_test_user("target", "operator", "target_secret")
    db = AsyncMock()

    updated_target = _build_test_user("target", "operator", "123456", user_id=target_user.id)
    payload = UserUpdate(password="123456")

    with patch(
        "app.api.v1.endpoints.users.get_user", new=AsyncMock(return_value=target_user)
    ), patch(
        "app.api.v1.endpoints.users.update_user", new=AsyncMock(return_value=updated_target)
    ), patch(
        "app.api.v1.endpoints.users.safe_record_event", new=AsyncMock()
    ) as mock_audit:

        out = await update_user_endpoint(
            user_id=target_user.id,
            payload=payload,
            db=db,
            current_user=admin_user,
        )

        assert out.id == target_user.id
        assert mock_audit.await_count == 2


async def test_endpoint_combined_role_and_password_update_emits_all_audits():
    """update_user_endpoint emits admin_user_updated, admin_role_changed, and admin_password_reset."""
    admin_user = _build_test_user("admin", "admin", "admin_secret")
    target_user = _build_test_user("target", "operator", "target_secret")
    db = AsyncMock()

    updated_target = _build_test_user("target", "admin", "new_secret_123", user_id=target_user.id)
    payload = UserUpdate(role=RoleEnum.admin, password="new_secret_123")

    with patch(
        "app.api.v1.endpoints.users.get_user", new=AsyncMock(return_value=target_user)
    ), patch(
        "app.api.v1.endpoints.users.update_user", new=AsyncMock(return_value=updated_target)
    ), patch(
        "app.api.v1.endpoints.users.safe_record_event", new=AsyncMock()
    ) as mock_audit:

        out = await update_user_endpoint(
            user_id=target_user.id,
            payload=payload,
            db=db,
            current_user=admin_user,
        )

        assert out.id == target_user.id
        assert mock_audit.await_count == 3
        events = [call.kwargs["event_type"] for call in mock_audit.await_args_list]
        assert events == ["admin_user_updated", "admin_role_changed", "admin_password_reset"]


async def test_endpoint_requires_admin_role():
    """Non-admin user (e.g. operator) is rejected by require_roles('admin') with 403."""
    operator_user = _build_test_user("operator", "operator", "operator_secret")
    db = AsyncMock()

    admin_guard = require_roles("admin")
    with patch("app.core.deps.safe_record_event", new=AsyncMock()) as mock_audit:
        with pytest.raises(HTTPException) as exc_info:
            await admin_guard(user=operator_user, db=db)

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Insufficient permissions"
        mock_audit.assert_awaited_once()
        assert mock_audit.await_args.kwargs["event_type"] == "auth.permission_denied"
