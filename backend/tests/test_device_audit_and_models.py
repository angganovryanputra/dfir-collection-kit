"""Tests for Backend Model Registration (BE-GAP-03) and Device Audit Logging (BE-GAP-06)."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

import app.models as models_module
from app.api.v1.endpoints.devices import (
    create_device_endpoint,
    delete_device_endpoint,
    update_device_endpoint,
)
from app.core.deps import require_roles
from app.db.base import Base
from app.models.device import Device
from app.models.user import User
from app.schemas.device import DeviceCreate, DeviceUpdate

pytestmark = pytest.mark.asyncio


def test_platform_models_in_all():
    """Verify that all 5 platform models are exported in app.models.__all__."""
    required_models = [
        "AttackHypothesis",
        "CustomModule",
        "LegalHold",
        "ScheduledCollection",
        "ThreatHuntQuery",
    ]
    for model_name in required_models:
        assert model_name in models_module.__all__, f"{model_name} missing from app.models.__all__"
        assert hasattr(models_module, model_name), f"{model_name} not exported on app.models"


def test_base_metadata_contains_platform_tables():
    """Verify that all platform model tables are registered in Base.metadata."""
    expected_tables = {
        "custom_modules",
        "attack_hypotheses",
        "scheduled_collections",
        "threat_hunt_queries",
        "legal_holds",
        "incident_notes",
        "incident_tasks",
        "detection_triage",
    }
    registered_tables = set(Base.metadata.tables.keys())
    missing = expected_tables - registered_tables
    assert not missing, f"Tables missing from Base.metadata: {missing}"


def test_all_sqlalchemy_models_registered_in_all():
    """Verify every SQLAlchemy model class inheriting from Base is present in __all__."""
    all_set = set(models_module.__all__)
    expected_models = [
        "AttackChain",
        "IOCIndicator",
        "IOCMatch",
        "YaraMatch",
        "AuditLog",
        "ChainOfCustodyEntry",
        "CollectionLog",
        "Collector",
        "Device",
        "EvidenceFolder",
        "EvidenceItem",
        "Incident",
        "Job",
        "ProcessingJob",
        "SigmaHit",
        "SystemSettings",
        "SuperTimeline",
        "LateralMovement",
        "TimelineAnnotation",
        "IncidentTemplate",
        "User",
        "DetectionTriage",
        "IncidentNote",
        "IncidentTask",
        "CustomModule",
        "AttackHypothesis",
        "ScheduledCollection",
        "ThreatHuntQuery",
        "LegalHold",
    ]
    for m in expected_models:
        assert m in all_set, f"Model {m} missing from app.models.__all__"


def _build_test_user(role: str = "admin") -> User:
    return User(
        id=str(uuid4()),
        username=role.upper(),
        role=role,
        status="active",
        created_at=datetime.now(timezone.utc).isoformat(),
        last_login="-",
        password_hash="mocked",
    )


def _build_test_device(device_id: str = "DEV-001", hostname: str = "WS-TEST-01") -> Device:
    now = datetime.now(timezone.utc)
    return Device(
        id=device_id,
        hostname=hostname,
        ip_address="192.168.1.100",
        type="workstation",
        os="windows",
        agent_version="1.0.0",
        status="ONLINE",
        collection_status="IDLE",
        last_seen=now,
        registered_at=now,
    )


async def test_create_device_records_audit_event():
    """create_device_endpoint must record 'device_enrolled' audit event."""
    admin_user = _build_test_user("admin")
    db = AsyncMock()
    created_device = _build_test_device("DEV-ENROLL-01", "WS-ENROLL-01")

    payload = DeviceCreate(
        id="DEV-ENROLL-01",
        hostname="WS-ENROLL-01",
        ip_address="192.168.1.100",
        type="workstation",
        os="windows",
        agent_version="1.0.0",
        status="ONLINE",
        collection_status="IDLE",
    )

    with patch(
        "app.api.v1.endpoints.devices.create_device", new=AsyncMock(return_value=created_device)
    ) as mock_create, patch(
        "app.api.v1.endpoints.devices.safe_record_event", new=AsyncMock()
    ) as mock_audit:

        out = await create_device_endpoint(payload=payload, db=db, current_user=admin_user)

        assert out.id == "DEV-ENROLL-01"
        assert out.hostname == "WS-ENROLL-01"
        mock_create.assert_awaited_once_with(db, payload)
        mock_audit.assert_awaited_once()

        call_kwargs = mock_audit.await_args.kwargs
        assert call_kwargs["event_type"] == "device_enrolled"
        assert call_kwargs["actor_type"] == "user"
        assert call_kwargs["actor_id"] == admin_user.id
        assert call_kwargs["source"] == "backend"
        assert call_kwargs["action"] == "enroll device"
        assert call_kwargs["target_type"] == "device"
        assert call_kwargs["target_id"] == "DEV-ENROLL-01"
        assert call_kwargs["status"] == "success"
        assert call_kwargs["message"] == "Device enrolled"
        assert call_kwargs["metadata"] == {
            "name": "WS-ENROLL-01",
            "ip": "192.168.1.100",
            "os": "windows",
        }


async def test_update_device_records_audit_event():
    """update_device_endpoint must record 'device_updated' audit event with changed fields."""
    admin_user = _build_test_user("admin")
    db = AsyncMock()
    updated_device = _build_test_device("DEV-UPD-01", "WS-UPD-RENAMED")

    payload = DeviceUpdate(hostname="WS-UPD-RENAMED", status="OFFLINE")

    with patch(
        "app.api.v1.endpoints.devices.update_device", new=AsyncMock(return_value=updated_device)
    ) as mock_update, patch(
        "app.api.v1.endpoints.devices.safe_record_event", new=AsyncMock()
    ) as mock_audit:

        out = await update_device_endpoint(
            device_id="DEV-UPD-01", payload=payload, db=db, current_user=admin_user
        )

        assert out.id == "DEV-UPD-01"
        assert out.hostname == "WS-UPD-RENAMED"
        mock_update.assert_awaited_once_with(db, "DEV-UPD-01", payload)
        mock_audit.assert_awaited_once()

        call_kwargs = mock_audit.await_args.kwargs
        assert call_kwargs["event_type"] == "device_updated"
        assert call_kwargs["actor_type"] == "user"
        assert call_kwargs["actor_id"] == admin_user.id
        assert call_kwargs["source"] == "backend"
        assert call_kwargs["action"] == "update device"
        assert call_kwargs["target_type"] == "device"
        assert call_kwargs["target_id"] == "DEV-UPD-01"
        assert call_kwargs["status"] == "success"
        assert call_kwargs["message"] == "Device updated"
        assert call_kwargs["metadata"] == {"changed": ["hostname", "status"]}


async def test_update_device_not_found_raises_404():
    """update_device_endpoint must raise 404 when device is absent and not record audit event."""
    admin_user = _build_test_user("admin")
    db = AsyncMock()
    payload = DeviceUpdate(status="OFFLINE")

    with patch(
        "app.api.v1.endpoints.devices.update_device", new=AsyncMock(return_value=None)
    ), patch("app.api.v1.endpoints.devices.safe_record_event", new=AsyncMock()) as mock_audit:

        with pytest.raises(HTTPException) as exc_info:
            await update_device_endpoint(
                device_id="NONEXISTENT", payload=payload, db=db, current_user=admin_user
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Device not found"
        mock_audit.assert_not_awaited()


async def test_delete_device_records_audit_event():
    """delete_device_endpoint must fetch device first, delete it, and record 'device_deleted' audit."""
    admin_user = _build_test_user("admin")
    db = AsyncMock()
    target_device = _build_test_device("DEV-DEL-01", "WS-DEL-TARGET")

    with patch(
        "app.api.v1.endpoints.devices.get_device", new=AsyncMock(return_value=target_device)
    ) as mock_get, patch(
        "app.api.v1.endpoints.devices.delete_device", new=AsyncMock(return_value=True)
    ) as mock_delete, patch(
        "app.api.v1.endpoints.devices.safe_record_event", new=AsyncMock()
    ) as mock_audit:

        result = await delete_device_endpoint(
            device_id="DEV-DEL-01", db=db, current_user=admin_user
        )

        assert result == {"status": "deleted"}
        mock_get.assert_awaited_once_with(db, "DEV-DEL-01")
        mock_delete.assert_awaited_once_with(db, "DEV-DEL-01")
        mock_audit.assert_awaited_once()

        call_kwargs = mock_audit.await_args.kwargs
        assert call_kwargs["event_type"] == "device_deleted"
        assert call_kwargs["actor_type"] == "user"
        assert call_kwargs["actor_id"] == admin_user.id
        assert call_kwargs["source"] == "backend"
        assert call_kwargs["action"] == "delete device"
        assert call_kwargs["target_type"] == "device"
        assert call_kwargs["target_id"] == "DEV-DEL-01"
        assert call_kwargs["status"] == "success"
        assert call_kwargs["message"] == "Device deleted"
        assert call_kwargs["metadata"] == {"name": "WS-DEL-TARGET"}


async def test_delete_device_not_found_raises_404():
    """delete_device_endpoint must raise 404 if device does not exist, without calling delete or audit."""
    admin_user = _build_test_user("admin")
    db = AsyncMock()

    with patch(
        "app.api.v1.endpoints.devices.get_device", new=AsyncMock(return_value=None)
    ) as mock_get, patch(
        "app.api.v1.endpoints.devices.delete_device", new=AsyncMock()
    ) as mock_delete, patch(
        "app.api.v1.endpoints.devices.safe_record_event", new=AsyncMock()
    ) as mock_audit:

        with pytest.raises(HTTPException) as exc_info:
            await delete_device_endpoint(device_id="NONEXISTENT", db=db, current_user=admin_user)

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Device not found"
        mock_get.assert_awaited_once_with(db, "NONEXISTENT")
        mock_delete.assert_not_awaited()
        mock_audit.assert_not_awaited()


async def test_device_mutations_require_admin_role():
    """Verify require_roles('admin') denies non-admin users and emits permission_denied audit event."""
    operator_user = _build_test_user("operator")
    db = AsyncMock()

    admin_guard = require_roles("admin")
    with patch("app.core.deps.safe_record_event", new=AsyncMock()) as mock_audit:
        with pytest.raises(HTTPException) as exc_info:
            await admin_guard(user=operator_user, db=db)

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Insufficient permissions"
        mock_audit.assert_awaited_once()
        assert mock_audit.await_args.kwargs["event_type"] == "auth.permission_denied"
