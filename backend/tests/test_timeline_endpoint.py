"""
Tests for the forensics timeline and processing-status endpoints.

Requires DFIR_TEST_DATABASE_URL to be set (skipped otherwise).
"""
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.evidence import EvidenceItem
from app.models.processing import ProcessingJob
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
        created_at=datetime.now(timezone.utc).isoformat(),
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
        collected_at=datetime.now(timezone.utc).isoformat(),
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
# Processing-status endpoint (new: /processing/incident/{id}/status)
# ---------------------------------------------------------------------------

class TestProcessingStatus:
    async def test_404_when_no_processing_job(self, client, db_session):
        """Returns 404 when no processing job exists for the incident yet."""
        user = _build_user()
        db_session.add(user)
        await db_session.commit()
        token = await _login(client)

        resp = await client.get(
            "/api/v1/processing/incident/INC-EMPTY/status",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404

    async def test_returns_job_status_when_job_exists(self, client, db_session):
        """Returns job details when a processing job record exists."""
        user = _build_user()
        db_session.add(user)
        job = ProcessingJob(
            id="proc-JOB-INC-004",
            incident_id="INC-004",
            job_id="JOB-INC-004",
            status="DONE",
            phase="analytics",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(job)
        await db_session.commit()
        token = await _login(client)

        resp = await client.get(
            "/api/v1/processing/incident/INC-004/status",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "DONE"
        assert body["incident_id"] == "INC-004"
        assert body["job_id"] == "JOB-INC-004"
