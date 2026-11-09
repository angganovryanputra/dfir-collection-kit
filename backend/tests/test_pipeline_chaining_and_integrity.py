from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock

import pytest
from fastapi import HTTPException


def test_pipeline_chaining_imports_cleanly():
    """Verify get_runtime_settings imports from app.services.system_settings_service."""
    from app.services.system_settings_service import get_runtime_settings

    assert callable(get_runtime_settings)


def test_integrity_task_path_resolution():
    """Verify safe_join resolves relative evidence paths correctly."""
    from app.core.evidence_files import safe_join

    evidence_base = Path("/vault/evidence")
    incident_id = "INC-1234"

    # Case 1: item has relative_path set
    relative_path = "job-5678/extracted/Security.evtx"
    file_path = safe_join(evidence_base / incident_id, relative_path)
    expected = (evidence_base / incident_id / relative_path).resolve()
    assert file_path == expected

    # Case 2: item relative_path is None, fallback uses job_id/extracted/name
    job_id = "job-9999"
    name = "System.evtx"
    rel_path_computed = f"{job_id}/extracted/{name}"
    file_path2 = safe_join(evidence_base / incident_id, rel_path_computed)
    assert file_path2 == (evidence_base / incident_id / rel_path_computed).resolve()

    # Case 3: item relative_path and job_id are None, fallback uses name
    rel_path_fallback = name
    file_path3 = safe_join(evidence_base / incident_id, rel_path_fallback)
    assert file_path3 == (evidence_base / incident_id / rel_path_fallback).resolve()


def test_integrity_path_resolution_rejects_traversal():
    """Verify safe_join rejects directory traversal attacks."""
    from app.core.evidence_files import safe_join

    evidence_base = Path("/vault/evidence")
    incident_id = "INC-1234"

    malicious_paths = [
        "../../etc/passwd",
        "../INC-OTHER/stolen.txt",
        "..\\..\\Windows\\System32\\cmd.exe",
        "nested/../../../../etc/shadow",
    ]

    for bad_path in malicious_paths:
        with pytest.raises(HTTPException) as exc_info:
            safe_join(evidence_base / incident_id, bad_path)
        assert exc_info.value.status_code == 400
        assert "traversal" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_auto_chaining_dispatches_super_timeline_with_root_path(monkeypatch, tmp_path):
    """Verify that auto-dispatch passes the root evidence storage path to dispatch_super_timeline."""
    from app.crud import super_timeline
    from app.services import artifact_parser_service as parser
    from app.services import attack_chain_service, super_timeline_service, system_settings_service

    incident_id = "INC-TEST-001"
    job_id = "JOB-TEST-001"
    evidence_root = tmp_path / "vault"
    base_path = evidence_root / incident_id / job_id
    extracted = base_path / "extracted"
    extracted.mkdir(parents=True, exist_ok=True)

    db = AsyncMock()
    db.execute.return_value = Mock(scalar_one=Mock(return_value=0))

    mock_runtime = SimpleNamespace(
        auto_process=True,
        evidence_storage_path=str(evidence_root),
        ez_tools_path=None,
        hayabusa_path=None,
        chainsaw_path=None,
        sigma_rules_path=None,
        yara_rules_path=None,
        timesketch_url=None,
    )

    existing_job = SimpleNamespace(
        id=f"proc-{job_id}",
        status="RUNNING",
        stage_results={},
        error_message=None,
        completed_at=None,
    )
    monkeypatch.setattr(
        parser, "get_processing_job_by_evidence_job_id", AsyncMock(return_value=existing_job)
    )
    monkeypatch.setattr(parser, "update_processing_job", AsyncMock())
    monkeypatch.setattr(parser, "_pipeline_log", AsyncMock())
    monkeypatch.setattr(
        parser, "_run_parsing_phase", AsyncMock(return_value=SimpleNamespace(stages={}))
    )
    monkeypatch.setattr(parser, "_run_sigma_phase", AsyncMock())
    monkeypatch.setattr(parser, "export_to_jsonl", AsyncMock(return_value=0))

    monkeypatch.setattr(attack_chain_service, "build_attack_chains", AsyncMock(return_value=[]))

    monkeypatch.setattr(
        system_settings_service, "get_runtime_settings", AsyncMock(return_value=mock_runtime)
    )

    monkeypatch.setattr(
        super_timeline, "get_super_timeline_by_incident", AsyncMock(return_value=None)
    )
    mock_st = SimpleNamespace(id="st-001", status="PENDING", error_message=None)
    monkeypatch.setattr(super_timeline, "create_super_timeline", AsyncMock(return_value=mock_st))

    mock_dispatch = MagicMock()
    monkeypatch.setattr(super_timeline_service, "dispatch_super_timeline", mock_dispatch)

    proc_job_id = await parser._run_parsing_pipeline_locked(incident_id, job_id, base_path, db)
    assert proc_job_id == f"proc-{job_id}"

    # Verify dispatch_super_timeline was called with (incident_id, Path(runtime.evidence_storage_path))
    # NOT base_path!
    mock_dispatch.assert_called_once_with(incident_id, Path(mock_runtime.evidence_storage_path))


@pytest.mark.asyncio
async def test_auto_chaining_disabled_when_auto_process_false(monkeypatch, tmp_path):
    """Verify that super timeline dispatch is skipped when auto_process is False."""
    from app.crud import super_timeline
    from app.services import artifact_parser_service as parser
    from app.services import attack_chain_service, super_timeline_service, system_settings_service

    incident_id = "INC-TEST-002"
    job_id = "JOB-TEST-002"
    evidence_root = tmp_path / "vault"
    base_path = evidence_root / incident_id / job_id
    extracted = base_path / "extracted"
    extracted.mkdir(parents=True, exist_ok=True)

    db = AsyncMock()
    db.execute.return_value = Mock(scalar_one=Mock(return_value=0))

    mock_runtime = SimpleNamespace(
        auto_process=False,
        evidence_storage_path=str(evidence_root),
        ez_tools_path=None,
        hayabusa_path=None,
        chainsaw_path=None,
        sigma_rules_path=None,
        yara_rules_path=None,
        timesketch_url=None,
    )

    existing_job = SimpleNamespace(
        id=f"proc-{job_id}",
        status="RUNNING",
        stage_results={},
        error_message=None,
        completed_at=None,
    )
    monkeypatch.setattr(
        parser, "get_processing_job_by_evidence_job_id", AsyncMock(return_value=existing_job)
    )
    monkeypatch.setattr(parser, "update_processing_job", AsyncMock())
    monkeypatch.setattr(parser, "_pipeline_log", AsyncMock())
    monkeypatch.setattr(
        parser, "_run_parsing_phase", AsyncMock(return_value=SimpleNamespace(stages={}))
    )
    monkeypatch.setattr(parser, "_run_sigma_phase", AsyncMock())
    monkeypatch.setattr(parser, "export_to_jsonl", AsyncMock(return_value=0))

    monkeypatch.setattr(attack_chain_service, "build_attack_chains", AsyncMock(return_value=[]))

    monkeypatch.setattr(
        system_settings_service, "get_runtime_settings", AsyncMock(return_value=mock_runtime)
    )

    mock_dispatch = MagicMock()
    monkeypatch.setattr(super_timeline_service, "dispatch_super_timeline", mock_dispatch)

    proc_job_id = await parser._run_parsing_pipeline_locked(incident_id, job_id, base_path, db)
    assert proc_job_id == f"proc-{job_id}"

    # Verify dispatch_super_timeline was NOT called
    mock_dispatch.assert_not_called()


@pytest.mark.asyncio
async def test_verify_evidence_integrity_skips_missing_and_handles_traversal(monkeypatch, tmp_path):
    """Verify evidence integrity worker skips missing files and safely handles traversal attempts."""
    import hashlib

    from app import worker
    from app.db import session as db_session
    from app.services import audit_log_service, system_settings_service

    vault = tmp_path / "vault"
    incident_id = "INC-INT-001"
    incident_dir = vault / incident_id
    incident_dir.mkdir(parents=True, exist_ok=True)

    valid_file = incident_dir / "valid.txt"
    valid_file.write_bytes(b"hello world")
    valid_hash = hashlib.sha256(b"hello world").hexdigest()

    item_valid = SimpleNamespace(
        id="ev-1",
        incident_id=incident_id,
        name="valid.txt",
        job_id=None,
        relative_path="valid.txt",
        hash=valid_hash,
        status="LOCKED",
        hash_algorithm="sha256",
    )
    item_missing = SimpleNamespace(
        id="ev-2",
        incident_id=incident_id,
        name="missing.txt",
        job_id="job-1",
        relative_path=None,
        hash="abcdef123456",
        status="LOCKED",
        hash_algorithm="sha256",
    )
    item_traversal = SimpleNamespace(
        id="ev-3",
        incident_id=incident_id,
        name="shadow",
        job_id=None,
        relative_path="../../etc/shadow",
        hash="abcdef123456",
        status="LOCKED",
        hash_algorithm="sha256",
    )

    runtime_mock = SimpleNamespace(
        evidence_storage_path=str(vault),
        hash_algorithm="sha256",
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value = [item_valid, item_missing, item_traversal]
    mock_db.execute.return_value = mock_result

    class MockSessionContext:
        async def __aenter__(self):
            return mock_db

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(db_session, "AsyncSessionLocal", lambda: MockSessionContext())
    monkeypatch.setattr(
        system_settings_service, "get_runtime_settings", AsyncMock(return_value=runtime_mock)
    )

    mock_record_event = AsyncMock()
    monkeypatch.setattr(audit_log_service, "safe_record_event", mock_record_event)

    await worker._verify_evidence_integrity()

    # Neither valid, missing, nor traversal should trigger a tamper event
    mock_record_event.assert_not_called()


@pytest.mark.asyncio
async def test_verify_evidence_integrity_detects_tampering(monkeypatch, tmp_path):
    """Verify evidence integrity worker logs tamper event on hash mismatch."""
    from app import worker
    from app.db import session as db_session
    from app.services import audit_log_service, system_settings_service

    vault = tmp_path / "vault"
    incident_id = "INC-INT-002"
    incident_dir = vault / incident_id
    incident_dir.mkdir(parents=True, exist_ok=True)

    tampered_file = incident_dir / "tampered.txt"
    tampered_file.write_bytes(b"tampered content")

    item_tampered = SimpleNamespace(
        id="ev-4",
        incident_id=incident_id,
        name="tampered.txt",
        job_id=None,
        relative_path="tampered.txt",
        hash="0000000000000000000000000000000000000000000000000000000000000000",
        status="LOCKED",
        hash_algorithm="sha256",
    )

    runtime_mock = SimpleNamespace(
        evidence_storage_path=str(vault),
        hash_algorithm="sha256",
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value = [item_tampered]
    mock_db.execute.return_value = mock_result

    class MockSessionContext:
        async def __aenter__(self):
            return mock_db

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(db_session, "AsyncSessionLocal", lambda: MockSessionContext())
    monkeypatch.setattr(
        system_settings_service, "get_runtime_settings", AsyncMock(return_value=runtime_mock)
    )

    mock_record_event = AsyncMock()
    monkeypatch.setattr(audit_log_service, "safe_record_event", mock_record_event)

    await worker._verify_evidence_integrity()

    mock_record_event.assert_awaited_once()
    call_kwargs = mock_record_event.call_args.kwargs
    assert call_kwargs["event_type"] == "evidence.tamper_detected"
    assert call_kwargs["target_id"] == "ev-4"
