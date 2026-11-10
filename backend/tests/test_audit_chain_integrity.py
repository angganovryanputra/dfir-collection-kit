from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.audit_log import list_entries, prune_old_entries
from app.main import app
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services.audit_log_service import (
    compute_entry_payload_hash,
    record_event,
    verify_audit_log_chain,
)


def make_audit_entry(
    event_type: str = "user.login",
    actor_id: str = "admin",
    action: str = "login",
    timestamp: datetime | None = None,
    previous_hash: str | None = None,
    message: str = "User logged in",
) -> AuditLog:
    ts = timestamp or datetime.now(timezone.utc)
    entry_id = str(uuid4())
    event_id = str(uuid4())
    payload = "|".join(
        [
            event_type,
            "user",
            actor_id,
            "backend",
            action,
            "",
            "",
            "success",
            message,
            ts.isoformat(),
            previous_hash or "",
        ]
    )
    entry_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return AuditLog(
        id=entry_id,
        event_id=event_id,
        timestamp=ts,
        event_type=event_type,
        actor_type="user",
        actor_id=actor_id,
        source="backend",
        action=action,
        target_type=None,
        target_id=None,
        status="success",
        message=message,
        event_metadata={},
        previous_hash=previous_hash,
        entry_hash=entry_hash,
    )


def make_chain(n: int = 5, start_time: datetime | None = None) -> list[AuditLog]:
    base_time = start_time or (datetime.now(timezone.utc) - timedelta(hours=n))
    entries = []
    prev_hash = None
    for i in range(n):
        entry_time = base_time + timedelta(minutes=i * 10)
        entry = make_audit_entry(
            event_type=f"event.{i}",
            actor_id="user1",
            action=f"action_{i}",
            timestamp=entry_time,
            previous_hash=prev_hash,
            message=f"Log message {i}",
        )
        entries.append(entry)
        prev_hash = entry.entry_hash
    return entries


def test_audit_log_chain_verification_intact():
    """Verify an intact hash chain passes validation."""
    chain = make_chain(5)
    is_valid, error = verify_audit_log_chain(chain)
    assert is_valid is True
    assert error is None


def test_audit_log_chain_empty_returns_valid():
    """Verify empty list returns valid."""
    is_valid, error = verify_audit_log_chain([])
    assert is_valid is True
    assert error is None


def test_audit_log_chain_tampered_payload_detected():
    """Verify modifying any payload field is detected as a hash mismatch."""
    chain = make_chain(5)
    chain[2].message = "Unauthorized alteration"
    is_valid, error = verify_audit_log_chain(chain)
    assert is_valid is False
    assert error == f"Hash mismatch at entry {chain[2].id}"


def test_audit_log_chain_tampered_entry_hash_detected():
    """Verify forging an entry_hash is detected as a mismatch."""
    chain = make_chain(5)
    chain[1].entry_hash = "0" * 64
    is_valid, error = verify_audit_log_chain(chain)
    assert is_valid is False
    assert error == f"Hash mismatch at entry {chain[1].id}"


def test_audit_log_chain_broken_previous_hash_link_detected():
    """Verify an omitted intermediate entry breaks chain linkage."""
    chain = make_chain(5)
    # Skip chain[2], so chain[3].previous_hash points to chain[2], but preceding is chain[1]
    broken_chain = [chain[0], chain[1], chain[3], chain[4]]
    is_valid, error = verify_audit_log_chain(broken_chain)
    assert is_valid is False
    assert error == f"Broken chain link at entry {chain[3].id}"


def test_checkpoint_preserves_chain_continuity():
    """Verify an Archival Genesis Checkpoint preserves continuity for subsequent entries."""
    chain = make_chain(5)
    # Simulate pruning entries 0 and 1; entry 1 is last pruned
    last_pruned = chain[1]
    cutoff = last_pruned.timestamp + timedelta(seconds=1)

    cp_id = str(uuid4())
    cp_event_id = str(uuid4())
    cp_event_type = "audit.archive_checkpoint"
    cp_action = "archive_checkpoint"
    cp_message = f"Archival checkpoint: pruned 2 logs prior to {cutoff.isoformat()}"
    cp_prev = last_pruned.entry_hash

    checkpoint = AuditLog(
        id=cp_id,
        event_id=cp_event_id,
        timestamp=cutoff,
        event_type=cp_event_type,
        actor_type="system",
        actor_id="system",
        source="backend",
        action=cp_action,
        target_type="audit_log",
        target_id=None,
        status="success",
        message=cp_message,
        event_metadata={"pruned_count": 2, "cutoff": cutoff.isoformat()},
        previous_hash=cp_prev,
        entry_hash="",
    )
    checkpoint.entry_hash = compute_entry_payload_hash(checkpoint)

    # Remaining chain contains the checkpoint and the unpruned entries (which linked to last_pruned)
    pruned_chain = [checkpoint, chain[2], chain[3], chain[4]]
    is_valid, error = verify_audit_log_chain(pruned_chain)
    assert is_valid is True
    assert error is None


def test_checkpoint_with_newly_recorded_entries():
    """Verify new entries recorded after checkpoint link to checkpoint's entry_hash."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    last_pruned_hash = hashlib.sha256(b"historical").hexdigest()

    cp_id = str(uuid4())
    cp_message = f"Archival checkpoint: pruned 10 logs prior to {cutoff.isoformat()}"
    checkpoint = AuditLog(
        id=cp_id,
        event_id=str(uuid4()),
        timestamp=cutoff,
        event_type="audit.archive_checkpoint",
        actor_type="system",
        actor_id="system",
        source="backend",
        action="archive_checkpoint",
        target_type="audit_log",
        target_id=None,
        status="success",
        message=cp_message,
        event_metadata={},
        previous_hash=last_pruned_hash,
        entry_hash="",
    )
    checkpoint.entry_hash = compute_entry_payload_hash(checkpoint)

    # New entry created after checkpoint points to checkpoint.entry_hash
    new_entry = make_audit_entry(
        event_type="job.created",
        timestamp=cutoff + timedelta(hours=1),
        previous_hash=checkpoint.entry_hash,
        message="New job started",
    )

    is_valid, error = verify_audit_log_chain([checkpoint, new_entry])
    assert is_valid is True
    assert error is None


@pytest.mark.asyncio
async def test_prune_old_entries_creates_checkpoint():
    """Verify prune_old_entries creates an Archival Genesis Checkpoint before deleting rows."""
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=30)
    fake_entry = make_audit_entry(
        event_type="old.event",
        timestamp=cutoff_dt - timedelta(days=1),
        message="old log",
    )

    mock_db = AsyncMock()
    mock_db.add = MagicMock()

    # Configure execute to return fake_entry on newest query, 5 on count query, 5 on delete
    mock_newest_result = MagicMock()
    mock_newest_result.scalar_one_or_none.return_value = fake_entry

    mock_count_result = MagicMock()
    mock_count_result.scalar.return_value = 5

    mock_delete_result = MagicMock()
    mock_delete_result.rowcount = 5

    mock_db.execute.side_effect = [mock_newest_result, mock_count_result, mock_delete_result]

    pruned = await prune_old_entries(mock_db, 30)
    assert pruned == 5

    # Verify db.add was called with an audit.archive_checkpoint AuditLog
    mock_db.add.assert_called_once()
    added_entry = mock_db.add.call_args[0][0]
    assert isinstance(added_entry, AuditLog)
    assert added_entry.event_type == "audit.archive_checkpoint"
    assert added_entry.action == "archive_checkpoint"
    assert added_entry.previous_hash == fake_entry.entry_hash
    assert "pruned 5 logs" in added_entry.message
    assert added_entry.event_metadata["pruned_count"] == 5
    assert added_entry.event_metadata["last_pruned_hash"] == fake_entry.entry_hash

    # Verify checkpoint payload hash integrity
    assert added_entry.entry_hash == compute_entry_payload_hash(added_entry)


@pytest.mark.asyncio
async def test_get_audit_logs_does_not_trigger_pruning():
    """Verify GET /api/v1/audit-logs/ does NOT trigger retention pruning."""
    admin_user = User(
        id=str(uuid4()),
        username="ADMIN",
        role="admin",
        status="active",
        last_login="-",
        created_at=datetime.now(timezone.utc).isoformat(),
        password_hash="hash",
    )

    app.dependency_overrides[require_roles("admin")] = lambda: admin_user
    app.dependency_overrides[get_current_user] = lambda: admin_user
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        with (
            patch("app.api.v1.endpoints.audit_logs.prune_old_entries") as mock_prune,
            patch(
                "app.api.v1.endpoints.audit_logs.list_entries_with_total",
                AsyncMock(return_value=([], 0)),
            ),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="https://test",
                follow_redirects=True,
            ) as client:
                response = await client.get("/api/v1/audit-logs/")
                assert response.status_code == 200
                mock_prune.assert_not_called()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_verify_endpoint_admin_allowed():
    """Verify GET /api/v1/audit-logs/verify returns valid status for admin."""
    admin_user = User(
        id=str(uuid4()),
        username="ADMIN",
        role="admin",
        status="active",
        last_login="-",
        created_at=datetime.now(timezone.utc).isoformat(),
        password_hash="hash",
    )

    app.dependency_overrides[require_roles("admin")] = lambda: admin_user
    app.dependency_overrides[get_current_user] = lambda: admin_user
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    chain = make_chain(3)

    try:
        with patch("app.api.v1.endpoints.audit_logs.list_entries", AsyncMock(return_value=chain)):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="https://test",
                follow_redirects=True,
            ) as client:
                response = await client.get("/api/v1/audit-logs/verify")
                assert response.status_code == 200
                data = response.json()
                assert data["valid"] is True
                assert data["count"] == 3
                assert data["error"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_verify_endpoint_unprivileged_rejected():
    """Verify GET /api/v1/audit-logs/verify rejects unauthenticated or non-admin requests."""
    # With no credentials/overrides, require_roles("admin") should reject
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="https://test",
        follow_redirects=True,
    ) as client:
        response = await client.get("/api/v1/audit-logs/verify")
        assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_audit_log_chain_verification_db(db_session):
    """Database-backed test: verify an intact chain created via record_event passes verification."""
    await record_event(
        db_session,
        event_type="test.event1",
        actor_type="user",
        actor_id="admin",
        source="backend",
        action="test",
        target_type=None,
        target_id=None,
        status="success",
        message="first event",
    )
    await record_event(
        db_session,
        event_type="test.event2",
        actor_type="user",
        actor_id="admin",
        source="backend",
        action="test",
        target_type=None,
        target_id=None,
        status="success",
        message="second event",
    )
    entries = await list_entries(db_session, limit=100)
    is_valid, error = verify_audit_log_chain(entries)
    assert is_valid is True
    assert error is None
