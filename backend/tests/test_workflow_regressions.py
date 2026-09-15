import asyncio
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import duckdb
import pytest
from fastapi import HTTPException
from jwt import InvalidTokenError

from app.api.v1.endpoints import agent_commands, processing
from app.api.v1.endpoints.evidence import (
    _export_super_timeline_duckdb,
    _query_super_timeline_duckdb,
)
from app.core.evidence_files import hash_file, safe_join
from app.services.timeline_filters import timeline_where
from app.services.workspace_lock import WorkspaceBusy, WorkspaceLock


@pytest.fixture
def timeline_path(tmp_path):
    path = tmp_path / "timeline.duckdb"
    con = duckdb.connect(str(path))
    con.execute(
        "CREATE TABLE timeline_events (row_id INTEGER, host VARCHAR, job_id VARCHAR, event_dt TIMESTAMP, message VARCHAR, timestamp_desc VARCHAR, source VARCHAR, source_short VARCHAR, extra JSON)"
    )
    for row in range(31):
        con.execute(
            "INSERT INTO timeline_events VALUES (?, ?, 'job-1', TIMESTAMP '2026-09-09 00:00:00' + ? * INTERVAL '1 hour', 'logon event', 'created', 'Windows', 'EVTX', ?)",
            [
                row,
                "WS-01" if row < 30 else "WS-02",
                row,
                json.dumps(
                    {"event_id": "4624", "actor": "alice", "datetime": "bad metadata", "host": None}
                ),
            ],
        )
    con.close()
    return path


def test_histogram_covers_all_pages_and_host_metadata(timeline_path):
    page = _query_super_timeline_duckdb(
        timeline_path, "host:WS-01 user:alice eid:4624", 2, 10, [], [], "", ""
    )
    assert page.total == 30
    assert len(page.data) == 10
    assert sum(b["count"] for b in page.histogram) == 30
    assert page.data[0]["host"] == "WS-01"
    assert page.data[0]["datetime"].endswith("Z")


def test_browse_and_export_share_negation_and_utc_filters(timeline_path):
    args = (
        "NOT host:WS-02 AND eid:4624",
        [],
        [],
        "2026-09-09T07:00:00+07:00",
        "2026-09-09T08:00:00+07:00",
    )
    page = _query_super_timeline_duckdb(timeline_path, args[0], 1, 10, *args[1:])
    content, _, _ = _export_super_timeline_duckdb(timeline_path, "jsonl", "incident-1", *args)
    assert page.total == len(content.splitlines()) == 2


@pytest.mark.parametrize("query", ["host:WS-01 OR", "AND test", '"unclosed', "NOT"])
def test_malformed_search_has_actionable_error(query):
    with pytest.raises(HTTPException) as exc:
        timeline_where(query)
    assert exc.value.status_code == 422


def test_sql_payload_is_only_a_parameter(timeline_path):
    page = _query_super_timeline_duckdb(
        timeline_path, '"x\'; DROP TABLE timeline_events; --"', 1, 10, [], [], "", ""
    )
    assert page.total == 0
    assert _query_super_timeline_duckdb(timeline_path, "", 1, 10, [], [], "", "").total == 31


def test_search_preserves_windows_path_backslashes():
    _, parameters = timeline_where(r"C:\Windows\System32")
    assert parameters == [r"%c:\\windows\\system32%"] * 4


@pytest.mark.parametrize("identifier", [".", ".."])
def test_export_identifier_cannot_target_parent(identifier):
    from app.api.v1.endpoints.evidence import _validate_identifier

    with pytest.raises(HTTPException):
        _validate_identifier(identifier, "incident")


def test_evidence_provenance_cannot_switch_collection_job(tmp_path):
    from app.services.evidence_resolver import resolve_evidence_file

    evidence = tmp_path / "incident" / "job-b" / "extracted" / "evidence"
    evidence.parent.mkdir(parents=True)
    evidence.write_bytes(b"original")
    with pytest.raises(HTTPException, match="recorded collection job"):
        resolve_evidence_file(
            str(tmp_path),
            "incident",
            "evidence",
            hashlib.sha256(b"original").hexdigest(),
            "job-b/extracted/evidence",
            "job-a",
        )


def test_export_budget_rejects_before_materializing(timeline_path):
    con = duckdb.connect(str(timeline_path))
    con.execute(
        "INSERT INTO timeline_events SELECT t.* FROM timeline_events t CROSS JOIN range(1700)"
    )
    con.close()
    with pytest.raises(HTTPException) as exc:
        _export_super_timeline_duckdb(timeline_path, "jsonl", "incident-1", "", [], [], "", "")
    assert exc.value.status_code == 413


def test_beacon_detection_excludes_private_172_network(timeline_path):
    from app.services.super_timeline_service import _detect_beaconing

    con = duckdb.connect(str(timeline_path))
    con.execute("DELETE FROM timeline_events")
    for ip in ("172.20.1.8", "8.8.8.8"):
        for row in range(8):
            con.execute(
                "INSERT INTO timeline_events VALUES (?, 'WS-01', 'job', TIMESTAMP '2026-09-09 00:00:00' + ? * INTERVAL '60 seconds', 'network', 'created', 'Windows', 'EVTX', ?)",
                [row, row, json.dumps({"DestinationIp": ip})],
            )
    con.close()
    results = _detect_beaconing(timeline_path, "incident", "st-1")
    assert results
    assert {row["target_host"] for row in results} == {"8.8.8.8"}


@pytest.mark.parametrize("algorithm", ["md5", "sha1", "sha256", "sha512"])
def test_evidence_hash_algorithms(tmp_path, algorithm):
    path = tmp_path / "evidence"
    path.write_bytes(b"original evidence")
    assert hash_file(path, algorithm) == hashlib.new(algorithm, b"original evidence").hexdigest()


def test_sibling_directory_is_not_inside_vault(tmp_path):
    with pytest.raises(HTTPException):
        safe_join(tmp_path / "vault", "../vault-other/private")


def test_workspace_lock_excludes_other_build_and_releases_after_error(tmp_path):
    path = tmp_path / ".super-timeline.lock"
    with pytest.raises(RuntimeError, match="interrupted"):
        with WorkspaceLock(path):
            with pytest.raises(WorkspaceBusy):
                with WorkspaceLock(path):
                    pytest.fail("second builder entered")
            raise RuntimeError("interrupted")
    with WorkspaceLock(path):
        pass


@pytest.mark.parametrize(
    "payload",
    [
        [],
        {"cmd": 1},
        {"cmd": ""},
        {"cmd": "x" * 4097},
        {"cmd": "whoami", "timeout_sec": -1},
        {"cmd": "whoami", "timeout_sec": True},
    ],
)
def test_command_rejects_invalid_payload(payload):
    with pytest.raises(ValueError):
        agent_commands._validate_command(payload)


async def test_console_checks_current_database_role(monkeypatch):
    from app.core import security
    from app.crud import user
    from app.db import session

    monkeypatch.setattr(
        security,
        "decode_access_token",
        lambda _: {"sub": "analyst", "role": "admin", "jti": "test"},
    )
    monkeypatch.setattr(security, "is_token_revoked", lambda _: False)
    monkeypatch.setattr(session, "AsyncSessionLocal", lambda: AsyncMock())
    lookup = AsyncMock(
        return_value=SimpleNamespace(username="analyst", role="operator", status="active")
    )
    monkeypatch.setattr(user, "get_user_by_username", lookup)
    assert await agent_commands._authorize_console_session("token") == "analyst"
    lookup.return_value.role = "viewer"
    with pytest.raises(InvalidTokenError):
        await agent_commands._authorize_console_session("token")
    lookup.return_value.role, lookup.return_value.status = "admin", "disabled"
    with pytest.raises(InvalidTokenError):
        await agent_commands._authorize_console_session("token")


async def test_rest_command_can_be_polled_and_cleans_up(monkeypatch):
    monkeypatch.setattr(
        agent_commands, "get_device", AsyncMock(return_value=SimpleNamespace(id="agent-test"))
    )
    monkeypatch.setattr(agent_commands, "verify_agent_secret", lambda *_: None)
    monkeypatch.setattr(agent_commands, "record_event", AsyncMock())
    db = AsyncMock()
    task = asyncio.create_task(
        agent_commands.run_command_sync(
            "agent-test", {"cmd": "whoami"}, SimpleNamespace(role="admin", username="alice"), db
        )
    )
    for _ in range(20):
        await asyncio.sleep(0)
        if agent_commands._pending.get("agent-test"):
            break
    try:
        command = await agent_commands.poll_for_command("agent-test", "secret", db)
        assert command["cmd"] == "whoami"
        assert db.commit.await_count == 1
        await agent_commands.post_command_result(
            command["command_id"], {"output": "alice", "exit_code": 0}, "secret", db
        )
        response = await asyncio.wait_for(task, 1)
        assert response["output"] == "alice"
        assert command["command_id"] not in agent_commands._ws_queues
        assert "agent-test" not in agent_commands._pending
    finally:
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


async def test_incident_trigger_uses_newest_collection(monkeypatch):
    from app.crud import job

    monkeypatch.setattr(
        job,
        "list_jobs_for_incident",
        AsyncMock(return_value=[SimpleNamespace(id="new-job", status="completed")]),
    )
    trigger = AsyncMock(return_value="queued")
    monkeypatch.setattr(processing, "trigger_processing", trigger)
    assert (
        await processing.trigger_processing_for_incident(
            "incident", Mock(), AsyncMock(), Mock(), False
        )
        == "queued"
    )
    assert trigger.call_args.args[0] == "new-job"


@pytest.mark.parametrize("broker_fails", [False, True])
async def test_processing_is_reserved_before_dispatch(monkeypatch, tmp_path, broker_fails):
    from app.crud import processing as crud
    from app.services import artifact_parser_service

    (tmp_path / "incident" / "job" / "extracted").mkdir(parents=True)
    db = AsyncMock()
    db.execute.return_value = Mock(
        scalar_one_or_none=lambda: SimpleNamespace(
            id="job", incident_id="incident", status="completed"
        )
    )
    proc = SimpleNamespace(
        id="proc-job", status="FAILED", error_message="old error", completed_at=None
    )
    monkeypatch.setattr(
        processing, "enforce_expensive_operation_limit", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        processing, "get_processing_job_by_evidence_job_id", AsyncMock(return_value=proc)
    )
    monkeypatch.setattr(
        processing,
        "get_runtime_settings",
        AsyncMock(return_value=SimpleNamespace(evidence_storage_path=str(tmp_path))),
    )

    def dispatch(*args, **kwargs):
        assert db.commit.await_count == 1
        assert proc.status == "PENDING"
        if broker_fails:
            raise ConnectionError("offline")

    monkeypatch.setattr(artifact_parser_service, "dispatch_pipeline", dispatch)
    if broker_fails:
        with pytest.raises(HTTPException) as exc:
            await processing.trigger_processing("job", Mock(), db, Mock(), False)
        assert exc.value.status_code == 503
        assert proc.status == "FAILED"
    else:
        response = await processing.trigger_processing("job", Mock(), db, Mock(), False)
        assert response.status == "PENDING"


@pytest.mark.parametrize("detection_fails", [False, True])
async def test_timeline_builder_publishes_only_after_detection(
    monkeypatch, tmp_path, detection_fails
):
    from app.crud import super_timeline as crud
    from app.db import session
    from app.services import super_timeline_service as service
    from app.services import system_settings_service

    source = tmp_path / "incident" / "job" / "timeline" / "timeline.jsonl"
    source.parent.mkdir(parents=True)
    source.write_text(
        json.dumps(
            {
                "datetime": "2026-09-09T07:00:00+07:00",
                "message": "test",
                "source_short": "EVTX",
                "source": "Windows",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    published = tmp_path / "incident" / "super_timeline.duckdb"
    published.write_bytes(b"previous snapshot")
    db = AsyncMock()
    result = Mock()
    result.scalars.return_value.all.return_value = [SimpleNamespace(job_id="job")]
    db.execute.side_effect = [
        result,
        Mock(scalar_one_or_none=lambda: SimpleNamespace(agent_id=None)),
    ]
    context = AsyncMock()
    context.__aenter__.return_value = db
    monkeypatch.setattr(session, "AsyncSessionLocal", lambda: context)
    monkeypatch.setattr(
        crud, "get_super_timeline_by_incident", AsyncMock(return_value=SimpleNamespace(id="st-1"))
    )
    monkeypatch.setattr(crud, "update_super_timeline", AsyncMock())
    monkeypatch.setattr(crud, "delete_lateral_movements_by_super_timeline", AsyncMock())
    monkeypatch.setattr(
        system_settings_service,
        "get_runtime_settings",
        AsyncMock(return_value=SimpleNamespace(webhook_url=None)),
    )

    def detect(path, *_args):
        assert path != published
        assert published.read_bytes() == b"previous snapshot"
        if detection_fails:
            raise RuntimeError("detector failed")
        return []

    monkeypatch.setattr(service, "_detect_lateral_movement", detect)
    monkeypatch.setattr(service, "_detect_beaconing", lambda *_: [])
    if detection_fails:
        with pytest.raises(RuntimeError, match="detector failed"):
            await service.build_super_timeline_background("incident", tmp_path)
        assert published.read_bytes() == b"previous snapshot"
    else:
        await service.build_super_timeline_background("incident", tmp_path)
        con = duckdb.connect(str(published), read_only=True)
        assert (
            str(con.execute("SELECT event_dt FROM timeline_events").fetchone()[0])
            == "2026-09-09 00:00:00"
        )
        con.close()
    compiled = db.execute.call_args_list[0].args[0].compile()
    assert ["DONE", "PARTIAL"] in compiled.params.values()


async def test_annotation_patch_preserves_other_fields_in_sql(monkeypatch):
    from sqlalchemy.dialects import postgresql

    from app.schemas.super_timeline import TimelineAnnotationPatch
    from app.services import audit_log_service

    db = AsyncMock()
    db.get.return_value = SimpleNamespace(id="incident")
    db.execute.return_value = Mock(
        scalar_one=lambda: {"bookmark": {"note": "existing"}, "tag": "suspicious"}
    )
    audit = AsyncMock()
    monkeypatch.setattr(audit_log_service, "record_event", audit)
    result = await processing.save_timeline_annotation(
        "incident",
        "event-1",
        TimelineAnnotationPatch(tag="suspicious"),
        db,
        SimpleNamespace(username="alice"),
    )
    assert result["bookmark"]["note"] == "existing"
    statement = db.execute.call_args.args[0].compile(dialect=postgresql.dialect())
    assert "timeline_annotations.payload || excluded.payload" in str(statement)
    assert statement.params["payload"] == {"tag": "suspicious"}
    audit.assert_awaited_once()
    db.commit.assert_awaited_once()


async def test_annotations_http_rejects_viewer_writes(monkeypatch):
    from httpx import ASGITransport, AsyncClient

    from app.core import deps
    from app.core.deps import get_current_user, get_db
    from app.main import app

    monkeypatch.setattr(deps, "safe_record_event", AsyncMock())
    overrides = dict(app.dependency_overrides)

    async def current_user():
        return SimpleNamespace(id="viewer-id", username="viewer", role="viewer", status="active")

    async def database():
        yield AsyncMock()

    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_db] = database
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as client:
            response = await client.patch(
                "/api/v1/processing/incident/incident/annotations/event-1",
                json={"tag": "confirmed"},
            )
            assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)


async def test_annotation_database_merge_and_incident_isolation(db_session):
    from app.models.incident import Incident
    from app.schemas.super_timeline import TimelineAnnotationPatch

    user = SimpleNamespace(username="analyst")
    for incident_id in ("annotation-case-a", "annotation-case-b"):
        db_session.add(
            Incident(
                id=incident_id,
                type="MALWARE",
                status="OPEN",
                target_endpoints=["WS-01"],
                operator="analyst",
            )
        )
    await db_session.commit()
    bookmark = {
        "eventHash": "event-1",
        "note": "Review this event",
        "createdAt": "2026-09-09T00:00:00Z",
        "datetime": "2026-09-09T00:00:00Z",
        "host": "WS-01",
        "message": "logon",
        "source_short": "EVTX",
    }
    await processing.save_timeline_annotation(
        "annotation-case-a", "event-1", TimelineAnnotationPatch(bookmark=bookmark), db_session, user
    )
    saved = await processing.save_timeline_annotation(
        "annotation-case-a", "event-1", TimelineAnnotationPatch(tag="suspicious"), db_session, user
    )
    assert saved["bookmark"]["note"] == "Review this event"
    empty = await processing.list_timeline_annotations(
        "annotation-case-b", "", 200, db_session, user
    )
    assert empty["items"] == []
    await processing.save_timeline_annotation(
        "annotation-case-a", "event-1", TimelineAnnotationPatch(bookmark=None), db_session, user
    )
    result = await processing.list_timeline_annotations(
        "annotation-case-a", "", 200, db_session, user
    )
    assert result["items"][0]["bookmark"] is None
    assert result["items"][0]["tag"] == "suspicious"
