from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.security import decode_access_token, get_password_hash
from app.models.audit_log import AuditLog
from app.models.user import User

pytestmark = pytest.mark.asyncio


def build_user(username: str, role: str, password: str) -> User:
    return User(
        id=str(uuid4()),
        username=username.upper(),
        role=role,
        status="active",
        last_login="-",
        created_at=datetime.now(timezone.utc).isoformat(),
        password_hash=get_password_hash(password),
    )


async def test_login_success_includes_role_and_audit(client, db_session):
    user = build_user("ADMIN", "admin", "secret")
    db_session.add(user)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "ADMIN", "password": "secret"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["username"] == "ADMIN"
    assert payload["role"] == "admin"
    assert payload["user_id"] == user.id
    assert payload["expires_at"]
    assert payload["access_token"] is None

    session_cookie = response.cookies.get("dfir_session")
    assert session_cookie
    assert "HttpOnly" in response.headers["set-cookie"]
    claims = decode_access_token(session_cookie)
    assert claims.get("role") == "admin"
    assert claims.get("user_id") == user.id
    assert claims.get("username") == "ADMIN"

    result = await db_session.execute(
        select(AuditLog).where(AuditLog.event_type == "auth.login_success")
    )
    assert result.scalar_one_or_none() is not None


async def test_login_failure_records_audit(client, db_session):
    user = build_user("OPERATOR", "operator", "secret")
    db_session.add(user)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "OPERATOR", "password": "wrong"},
    )
    assert response.status_code == 401

    result = await db_session.execute(
        select(AuditLog).where(AuditLog.event_type == "auth.login_failure")
    )
    assert result.scalar_one_or_none() is not None


async def test_viewer_denied_for_write_endpoint(client, db_session):
    user = build_user("VIEWER", "viewer", "secret")
    db_session.add(user)
    await db_session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        json={"username": "VIEWER", "password": "secret"},
    )
    assert login.status_code == 200
    response = await client.post(
        "/api/v1/incidents",
        json={
            "id": "INC-TEST-001",
            "type": "RANSOMWARE",
            "status": "ACTIVE",
            "target_endpoints": ["HOST-1"],
            "operator": "VIEWER",
        },
    )
    assert response.status_code == 403

    result = await db_session.execute(
        select(AuditLog).where(AuditLog.event_type == "auth.permission_denied")
    )
    assert result.scalar_one_or_none() is not None


async def test_viewer_cannot_prepare_evidence_export(client, db_session):
    user = build_user("VIEWER_EXPORT", "viewer", "secret")
    db_session.add(user)
    await db_session.commit()
    login = await client.post("/api/v1/auth/login", json={"username": "VIEWER_EXPORT", "password": "secret"})
    assert login.status_code == 200
    response = await client.post("/api/v1/evidence/exports", json={"incident_id": "INC-TEST-EXPORT"})
    assert response.status_code == 403


async def test_viewer_cannot_trigger_outbound_threat_enrichment(client, db_session):
    user = build_user("VIEWER_TI", "viewer", "secret")
    db_session.add(user)
    await db_session.commit()
    login = await client.post("/api/v1/auth/login", json={"username": "VIEWER_TI", "password": "secret"})
    assert login.status_code == 200
    response = await client.post("/api/v1/threat-intel/enrich", json={"ioc_type": "domain", "ioc_value": "example.com"})
    assert response.status_code == 403


async def test_incident_creation_records_audit(client, db_session):
    user = build_user("OPERATOR", "operator", "secret")
    db_session.add(user)
    await db_session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        json={"username": "OPERATOR", "password": "secret"},
    )
    assert login.status_code == 200
    response = await client.post(
        "/api/v1/incidents",
        json={
            "id": "INC-TEST-002",
            "type": "RANSOMWARE",
            "status": "ACTIVE",
            "target_endpoints": ["HOST-2"],
            "operator": "OPERATOR",
        },
    )
    assert response.status_code == 200

    result = await db_session.execute(
        select(AuditLog).where(AuditLog.event_type == "incident_created")
    )
    assert result.scalar_one_or_none() is not None
