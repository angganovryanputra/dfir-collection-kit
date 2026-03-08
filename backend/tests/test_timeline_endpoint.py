"""
Tests for the forensics timeline and processing-status endpoints.

Requires DFIR_TEST_DATABASE_URL to be set (skipped otherwise).
"""
from datetime import datetime
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.evidence import EvidenceFolder, EvidenceItem
from app.models.user import User
from app.core.security import get_password_hash

pytestmark = pytest.mark.asyncio


def _build_user(username: str = "ADMIN", role: str = "admin") -> User:
    return User(
        id=str(uuid4()),
        username=username.upper(),
        role=role,
        status="active",
        last_login="-",
        created_at=datetime.utcnow().isoformat() + "Z",
        password_hash=get_password_hash("secret"),
    )


def _build_evidence_item(
    incident_id: str,
    *,
    name: str = "test.evtx",
    etype: str = "RAW",
) -> EvidenceItem:
    return EvidenceItem(
        id=str(uuid4()),
        incident_id=incident_id,
        name=name,
        type=etype,
        size="1.0 MB",
        status="HASH_VERIFIED",
        hash="abcdef1234567890",
        collected_at=datetime.utcnow().isoformat() + "Z",
    )


async def _login(client, username: str = "ADMIN") -> str:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "secret"},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# Timeline endpoint
# ---------------------------------------------------------------------------

class TestTimelineEndpoint:
    async def test_404_when_evidence_not_found(self, client, db_session):
        user = _build_user()
        db_session.add(user)
        await db_session.commit()
        token = await _login(client)

        resp = await client.get(
            "/api/v1/evidence/timeline/nonexistent",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404

    async def test_400_when_not_timeline_type(self, client, db_session):
        user = _build_user()
        db_session.add(user)
        item = _build_evidence_item("INC-001", name="test.evtx", etype="RAW")
        db_session.add(item)
        await db_session.commit()
        token = await _login(client)

        resp = await client.get(
            f"/api/v1/evidence/timeline/{item.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        assert "not a timeline" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Processing-status endpoint
# ---------------------------------------------------------------------------

class TestProcessingStatus:
    async def test_not_started_when_no_evidence(self, client, db_session):
        user = _build_user()
        db_session.add(user)
        await db_session.commit()
        token = await _login(client)

        resp = await client.get(
            "/api/v1/evidence/processing-status/INC-EMPTY",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "NOT_STARTED"
        assert body["timeline_evidence_id"] is None

    async def test_processing_when_raw_evidence_exists(self, client, db_session):
        user = _build_user()
        db_session.add(user)
        item = _build_evidence_item("INC-002", name="system.evtx", etype="RAW")
        db_session.add(item)
        await db_session.commit()
        token = await _login(client)

        resp = await client.get(
            "/api/v1/evidence/processing-status/INC-002",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "PROCESSING"

    async def test_complete_when_timeline_exists(self, client, db_session):
        user = _build_user()
        db_session.add(user)
        timeline = _build_evidence_item(
            "INC-003",
            name="super_timeline.csv",
            etype="PROCESSED_TIMELINE",
        )
        db_session.add(timeline)
        await db_session.commit()
        token = await _login(client)

        resp = await client.get(
            "/api/v1/evidence/processing-status/INC-003",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "COMPLETE"
        assert body["timeline_evidence_id"] == timeline.id
