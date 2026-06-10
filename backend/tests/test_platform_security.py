"""
Regression tests for the June 2026 platform security audit fixes:
  - Agent command poll/result endpoints require X-Agent-Token (P0)
  - AI endpoints validate incident_id against path traversal (P0)
  - Threat intel POST /enrich validates IOC values (P1)
  - Outbound TLS verification is on by default for MISP/TheHive (P1)
"""
import pytest
from fastapi import HTTPException


# ── Agent command endpoint authentication (P0) ──────────────────────────────

def _set_agent_secret(monkeypatch, value: str) -> None:
    from app.core.config import settings
    monkeypatch.setattr(settings, "AGENT_SHARED_SECRET", value)


async def test_poll_rejects_missing_token(monkeypatch):
    from app.api.v1.endpoints.agent_commands import poll_for_command
    _set_agent_secret(monkeypatch, "unit-test-secret")
    with pytest.raises(HTTPException) as exc:
        await poll_for_command("AGT-TEST", agent_token=None)
    assert exc.value.status_code == 401


async def test_poll_rejects_wrong_token(monkeypatch):
    from app.api.v1.endpoints.agent_commands import poll_for_command
    _set_agent_secret(monkeypatch, "unit-test-secret")
    with pytest.raises(HTTPException) as exc:
        await poll_for_command("AGT-TEST", agent_token="wrong")
    assert exc.value.status_code == 401


async def test_poll_accepts_valid_token(monkeypatch):
    from app.api.v1.endpoints.agent_commands import poll_for_command
    _set_agent_secret(monkeypatch, "unit-test-secret")
    result = await poll_for_command("AGT-EMPTY", agent_token="unit-test-secret")
    assert result == {}


async def test_result_rejects_missing_token(monkeypatch):
    from app.api.v1.endpoints.agent_commands import post_command_result
    _set_agent_secret(monkeypatch, "unit-test-secret")
    with pytest.raises(HTTPException) as exc:
        await post_command_result("CMD-X", {"output": "x"}, agent_token=None)
    assert exc.value.status_code == 401


async def test_result_accepts_valid_token_no_subscriber(monkeypatch):
    from app.api.v1.endpoints.agent_commands import post_command_result
    _set_agent_secret(monkeypatch, "unit-test-secret")
    result = await post_command_result(
        "CMD-NOSUB", {"output": "x", "exit_code": 0}, agent_token="unit-test-secret"
    )
    assert result == {"status": "no_subscriber"}


# ── AI endpoint incident_id validation (P0) ─────────────────────────────────

def test_ai_incident_id_rejects_traversal():
    from app.api.v1.endpoints.ai_analysis import _validate_incident_id
    for bad in ("../other", "a/b", "..", "x" * 129, "inc id", "inc\x00"):
        with pytest.raises(HTTPException) as exc:
            _validate_incident_id(bad)
        assert exc.value.status_code == 422


def test_ai_incident_id_accepts_valid():
    from app.api.v1.endpoints.ai_analysis import _validate_incident_id
    assert _validate_incident_id("INC-MOCK-SUPERTL") == "INC-MOCK-SUPERTL"
    assert _validate_incident_id("inc_2026_001") == "inc_2026_001"


def test_ai_disclaimer_present():
    from app.api.v1.endpoints.ai_analysis import _AI_DISCLAIMER
    assert "analyst validation" in _AI_DISCLAIMER.lower()


# ── Threat intel IOC validation (P1) ────────────────────────────────────────

def test_ioc_hash_validation():
    from app.api.v1.endpoints.threat_intel import _validate_ioc
    _validate_ioc("hash", "d41d8cd98f00b204e9800998ecf8427e")  # valid MD5
    _validate_ioc("hash", "a" * 64)  # valid SHA256
    for bad in ("../etc/passwd", "zz" * 20, "abc", "a" * 65):
        with pytest.raises(HTTPException):
            _validate_ioc("hash", bad)


def test_ioc_ip_validation():
    from app.api.v1.endpoints.threat_intel import _validate_ioc
    _validate_ioc("ip", "10.0.0.1")
    for bad in ("10.0.0", "evil.com/../x", "1.2.3.4.5"):
        with pytest.raises(HTTPException):
            _validate_ioc("ip", bad)


def test_ioc_domain_validation():
    from app.api.v1.endpoints.threat_intel import _validate_ioc
    _validate_ioc("domain", "evil-domain.example.com")
    for bad in ("a/b.com", "x", "dom ain.com"):
        with pytest.raises(HTTPException):
            _validate_ioc("domain", bad)


def test_ioc_url_rejects_control_chars():
    from app.api.v1.endpoints.threat_intel import _validate_ioc
    _validate_ioc("url", "https://example.com/path?q=1")
    with pytest.raises(HTTPException):
        _validate_ioc("url", "https://example.com/\r\nHost: evil")
    with pytest.raises(HTTPException):
        _validate_ioc("url", "x" * 3000)


def test_ioc_unknown_type_rejected():
    from app.api.v1.endpoints.threat_intel import _validate_ioc
    with pytest.raises(HTTPException):
        _validate_ioc("email", "a@b.com")
