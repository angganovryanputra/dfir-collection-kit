"""
Unit and integration tests for evidence export signature validation (Task 6).

Covers:
  - _require_signature with None or empty string raises 401 (Missing export signature).
  - _require_signature with invalid/mismatched signature raises 403 (Invalid export signature).
  - _require_signature with valid HMAC signature succeeds.
  - hmac.compare_digest is explicitly invoked for constant-time comparison.
  - hmac.compare_digest is not called when signature is missing (short-circuit).
  - Resistance to timing attacks via constant-time verification across varied lengths and prefixes.
  - File content tampering invalidates previously valid signature.
  - Endpoint GET /api/v1/evidence/exports/incident/{incident_id}:
      - Missing signature -> 401
      - Invalid signature -> 403
      - Valid signature -> 200
  - Endpoint GET /api/v1/evidence/incident/{incident_id}/download (alias):
      - Missing signature -> 401
      - Invalid signature -> 403
      - Valid signature -> 200
  - Endpoint GET /api/v1/evidence/exports/{evidence_id}:
      - Missing signature -> 401
      - Invalid signature -> 403
      - Valid signature -> 200
"""

from __future__ import annotations

import hmac
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.v1.endpoints.evidence import _require_signature
from app.core.deps import get_current_user, get_db
from app.core.security import compute_export_signature
from app.main import app
from app.models.evidence import EvidenceItem
from app.models.user import User


@pytest.fixture
def sample_export_file(tmp_path: Path) -> Path:
    """Create a temporary valid zip export file."""
    zip_path = tmp_path / "test-export.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("test.txt", "forensic evidence test payload")
    return zip_path


@pytest.fixture
def mock_user() -> User:
    """Return a mock analyst user for authenticated endpoints."""
    return User(
        id="usr-test-1",
        username="analyst_bob",
        role="analyst",
        status="active",
        last_login="2026-11-10T00:00:00Z",
        created_at="2026-11-10T00:00:00Z",
        password_hash="mock_hash",
    )


@pytest.fixture
def mock_runtime_settings():
    """Return mock runtime settings with generous limits for testing."""
    settings = MagicMock()
    settings.max_file_size_gb = 10
    settings.evidence_storage_path = "/tmp"
    return settings


def test_require_signature_missing_signature_raises_401(sample_export_file: Path):
    """None or empty signature parameter raises HTTPException 401."""
    with pytest.raises(HTTPException) as exc_info:
        _require_signature(sample_export_file, None)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Missing export signature"

    with pytest.raises(HTTPException) as exc_info:
        _require_signature(sample_export_file, "")
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Missing export signature"


def test_require_signature_invalid_signature_raises_403(sample_export_file: Path):
    """Mismatched or forged signature raises HTTPException 403."""
    with pytest.raises(HTTPException) as exc_info:
        _require_signature(sample_export_file, "invalid_signature_hex_value")
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Invalid export signature"


def test_require_signature_valid_signature_succeeds(sample_export_file: Path):
    """Signature matching HMAC-SHA256 of file passes cleanly without error."""
    valid_sig = compute_export_signature(str(sample_export_file))
    _require_signature(sample_export_file, valid_sig)


def test_require_signature_invokes_hmac_compare_digest(sample_export_file: Path):
    """Verify hmac.compare_digest is explicitly called for constant-time comparison."""
    valid_sig = compute_export_signature(str(sample_export_file))
    with patch(
        "app.api.v1.endpoints.evidence.hmac.compare_digest", wraps=hmac.compare_digest
    ) as mock_cmp:
        _require_signature(sample_export_file, valid_sig)
        mock_cmp.assert_called_once_with(valid_sig, valid_sig)


def test_require_signature_short_circuits_without_digest_comparison_when_missing(
    sample_export_file: Path,
):
    """Missing signature aborts at status 401 before compute_export_signature or compare_digest."""
    with patch(
        "app.api.v1.endpoints.evidence.hmac.compare_digest", wraps=hmac.compare_digest
    ) as mock_cmp:
        with pytest.raises(HTTPException) as exc_info:
            _require_signature(sample_export_file, None)
        assert exc_info.value.status_code == 401
        mock_cmp.assert_not_called()


def test_require_signature_constant_time_comparison_mismatch_branches(sample_export_file: Path):
    """Verify prefix and suffix variations are verified through hmac.compare_digest and rejected."""
    valid_sig = compute_export_signature(str(sample_export_file))
    # Alter the last character (timing side-channel attempt on suffixes)
    tampered_last_char = valid_sig[:-1] + ("0" if valid_sig[-1] != "0" else "1")
    # Alter the first character (timing side-channel attempt on prefixes)
    tampered_first_char = ("0" if valid_sig[0] != "0" else "1") + valid_sig[1:]

    for bad_sig in (tampered_last_char, tampered_first_char):
        with patch(
            "app.api.v1.endpoints.evidence.hmac.compare_digest", wraps=hmac.compare_digest
        ) as mock_cmp:
            with pytest.raises(HTTPException) as exc_info:
                _require_signature(sample_export_file, bad_sig)
            assert exc_info.value.status_code == 403
            assert exc_info.value.detail == "Invalid export signature"
            mock_cmp.assert_called_once_with(bad_sig, valid_sig)


def test_tampered_file_invalidates_signature(sample_export_file: Path):
    """Modifying the target file causes previously computed signature to mismatch with 403."""
    valid_sig = compute_export_signature(str(sample_export_file))
    with open(sample_export_file, "ab") as f:
        f.write(b"\x00tampered_payload_data")

    with pytest.raises(HTTPException) as exc_info:
        _require_signature(sample_export_file, valid_sig)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Invalid export signature"


@pytest.mark.asyncio
async def test_endpoint_incident_export_signature_verification(
    sample_export_file: Path, mock_user: User, mock_runtime_settings
):
    """GET /api/v1/evidence/exports/incident/{incident_id} enforces signature check."""
    valid_sig = compute_export_signature(str(sample_export_file))
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: AsyncMock()

    try:
        with (
            patch(
                "app.api.v1.endpoints.evidence.get_runtime_settings",
                new=AsyncMock(return_value=mock_runtime_settings),
            ),
            patch(
                "app.api.v1.endpoints.evidence._resolve_incident_export",
                return_value=sample_export_file,
            ),
            patch("app.api.v1.endpoints.evidence.safe_record_event", new=AsyncMock()),
            patch("app.api.v1.endpoints.evidence.create_entry", new=AsyncMock()),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="https://test",
                follow_redirects=True,
            ) as client:
                # 1. Missing signature -> 401
                resp_missing = await client.get("/api/v1/evidence/exports/incident/INC-1001")
                assert resp_missing.status_code == 401
                assert resp_missing.json()["detail"] == "Missing export signature"

                # 2. Invalid signature -> 403
                resp_invalid = await client.get(
                    "/api/v1/evidence/exports/incident/INC-1001",
                    params={"signature": "bad_signature_hex"},
                )
                assert resp_invalid.status_code == 403
                assert resp_invalid.json()["detail"] == "Invalid export signature"

                # 3. Valid signature -> 200
                resp_valid = await client.get(
                    "/api/v1/evidence/exports/incident/INC-1001",
                    params={"signature": valid_sig},
                )
                assert resp_valid.status_code == 200
                assert resp_valid.content == sample_export_file.read_bytes()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_endpoint_incident_download_alias_signature_verification(
    sample_export_file: Path, mock_user: User, mock_runtime_settings
):
    """GET /api/v1/evidence/incident/{incident_id}/download alias enforces signature check."""
    valid_sig = compute_export_signature(str(sample_export_file))
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: AsyncMock()

    try:
        with (
            patch(
                "app.api.v1.endpoints.evidence.get_runtime_settings",
                new=AsyncMock(return_value=mock_runtime_settings),
            ),
            patch(
                "app.api.v1.endpoints.evidence._resolve_incident_export",
                return_value=sample_export_file,
            ),
            patch("app.api.v1.endpoints.evidence.safe_record_event", new=AsyncMock()),
            patch("app.api.v1.endpoints.evidence.create_entry", new=AsyncMock()),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="https://test",
                follow_redirects=True,
            ) as client:
                # 1. Missing signature -> 401
                resp_missing = await client.get("/api/v1/evidence/incident/INC-1001/download")
                assert resp_missing.status_code == 401
                assert resp_missing.json()["detail"] == "Missing export signature"

                # 2. Invalid signature -> 403
                resp_invalid = await client.get(
                    "/api/v1/evidence/incident/INC-1001/download",
                    params={"signature": "bad_signature_hex"},
                )
                assert resp_invalid.status_code == 403
                assert resp_invalid.json()["detail"] == "Invalid export signature"

                # 3. Valid signature -> 200
                resp_valid = await client.get(
                    "/api/v1/evidence/incident/INC-1001/download",
                    params={"signature": valid_sig},
                )
                assert resp_valid.status_code == 200
                assert resp_valid.content == sample_export_file.read_bytes()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_endpoint_evidence_item_export_signature_verification(
    sample_export_file: Path, mock_user: User, mock_runtime_settings
):
    """GET /api/v1/evidence/exports/{evidence_id} enforces signature check."""
    valid_sig = compute_export_signature(str(sample_export_file))
    mock_item = EvidenceItem(
        id="EV-101",
        incident_id="INC-1001",
        name="memory.dmp",
        type="memory",
        size="1024",
        status="stored",
        hash="abc123hash",
        collected_at="2026-11-10T00:00:00Z",
        job_id="job-1",
        relative_path="INC-1001/EV-101.zip",
        hash_algorithm="sha256",
    )
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: AsyncMock()

    try:
        with (
            patch(
                "app.api.v1.endpoints.evidence.get_runtime_settings",
                new=AsyncMock(return_value=mock_runtime_settings),
            ),
            patch("app.api.v1.endpoints.evidence.get_item", new=AsyncMock(return_value=mock_item)),
            patch(
                "app.api.v1.endpoints.evidence._resolve_evidence_export",
                return_value=sample_export_file,
            ),
            patch("app.api.v1.endpoints.evidence.safe_record_event", new=AsyncMock()),
            patch("app.api.v1.endpoints.evidence.create_entry", new=AsyncMock()),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="https://test",
                follow_redirects=True,
            ) as client:
                # 1. Missing signature -> 401
                resp_missing = await client.get("/api/v1/evidence/exports/EV-101")
                assert resp_missing.status_code == 401
                assert resp_missing.json()["detail"] == "Missing export signature"

                # 2. Invalid signature -> 403
                resp_invalid = await client.get(
                    "/api/v1/evidence/exports/EV-101",
                    params={"signature": "bad_signature_hex"},
                )
                assert resp_invalid.status_code == 403
                assert resp_invalid.json()["detail"] == "Invalid export signature"

                # 3. Valid signature -> 200
                resp_valid = await client.get(
                    "/api/v1/evidence/exports/EV-101",
                    params={"signature": valid_sig},
                )
                assert resp_valid.status_code == 200
                assert resp_valid.content == sample_export_file.read_bytes()
    finally:
        app.dependency_overrides.clear()
