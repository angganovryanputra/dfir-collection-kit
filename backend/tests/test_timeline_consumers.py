"""Regression tests for consumers of the published Super Timeline snapshot."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import duckdb
import httpx
import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import platform_features as platform
from app.services.timeline_access import normalize_timeline_row, published_timeline_path


@pytest.fixture
def published(tmp_path, monkeypatch):
    from app.crud import super_timeline

    path = tmp_path / "published.duckdb"
    con = duckdb.connect(str(path))
    con.execute(
        "CREATE TABLE timeline_events AS SELECT i AS row_id, 'HOST' AS host, TIMESTAMP '2026-09-10' AS event_dt, 'audit cleared' AS message, 'EVTX' AS source_short, '{\"event_id\":\"1102\"}'::JSON AS extra FROM range(1002) t(i)"
    )
    con.close()
    lookup = AsyncMock(return_value=SimpleNamespace(status="DONE", duckdb_path=str(path)))
    monkeypatch.setattr(super_timeline, "get_super_timeline_by_incident", lookup)
    return path, lookup


async def test_consumers_use_published_record_not_environment(published):
    path, lookup = published
    assert await published_timeline_path(AsyncMock(), "incident") == path
    lookup.assert_awaited_once()


@pytest.mark.parametrize("state", [None, "PENDING", "BUILDING", "FAILED", "missing"])
async def test_unavailable_snapshot_is_actionable(published, state):
    _, lookup = published
    lookup.return_value = (
        None
        if state is None
        else SimpleNamespace(
            status=state if state != "missing" else "DONE", duckdb_path="not-present.duckdb"
        )
    )
    with pytest.raises(HTTPException) as exc:
        await published_timeline_path(AsyncMock(), "incident")
    assert exc.value.status_code == 404


async def test_saved_hunts_support_legacy_events_and_bound_results(published):
    db = AsyncMock()
    db.execute.return_value = Mock(
        scalar_one_or_none=Mock(
            return_value=SimpleNamespace(query="SELECT datetime, host FROM events")
        )
    )
    result = await platform.run_threat_hunt_query("hunt", "incident", db, None)
    assert result["row_count"] == 1000 and result["truncated"]
    assert result["rows"][0]["datetime"] == datetime(2026, 9, 10)


async def test_saved_hunts_cannot_read_external_files(published):
    db = AsyncMock()
    db.execute.return_value = Mock(
        scalar_one_or_none=Mock(
            return_value=SimpleNamespace(query="SELECT * FROM read_csv_auto('/etc/passwd')")
        )
    )
    with pytest.raises(HTTPException) as exc:
        await platform.run_threat_hunt_query("hunt", "incident", db, None)
    assert exc.value.status_code == 400


def test_splunk_time_is_numeric_utc_and_extra_stays_structured():
    event = {"event_dt": "2026-09-10T07:00:00+07:00", "host": "WS", "extra": '{"user":"alice"}'}
    result = platform._splunk_event(event)
    assert result["time"] == datetime(2026, 9, 10, tzinfo=timezone.utc).timestamp()
    assert result["event"]["extra"] == {"user": "alice"}
    assert result["event"]["datetime"] == "2026-09-10T00:00:00+00:00"
    assert event["event_dt"] == "2026-09-10T07:00:00+07:00"
    assert normalize_timeline_row({"event_dt": "invalid"})["datetime"] is None


async def test_elastic_partial_success_is_not_reported_as_all_sent(monkeypatch):
    post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={
                "errors": True,
                "items": [{"index": {"status": 201}}, {"index": {"status": 400}}],
            },
        )
    )
    monkeypatch.setattr(platform, "_post_siem", post)
    payload = SimpleNamespace(
        elastic_url="https://example.invalid", elastic_index="dfir", elastic_api_key=None
    )
    result = await platform._push_elastic(payload, [{"event_dt": datetime(2026, 9, 10)}] * 2)
    assert result == {"target": "elastic", "sent": 1, "failed": 1, "errors": True}
    assert '"@timestamp": "2026-09-10T00:00:00+00:00"' in post.call_args.kwargs["content"]


@pytest.mark.parametrize(
    "body",
    [{"items": None}, {"items": []}, {"items": [None]}, {"items": [{"index": {"status": "bad"}}]}],
)
async def test_elastic_malformed_acknowledgement_is_502(monkeypatch, body):
    monkeypatch.setattr(
        platform, "_post_siem", AsyncMock(return_value=httpx.Response(200, json=body))
    )
    with pytest.raises(HTTPException) as exc:
        await platform._push_elastic(
            SimpleNamespace(
                elastic_url="https://example.invalid", elastic_index="dfir", elastic_api_key=None
            ),
            [{}],
        )
    assert exc.value.status_code == 502


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="not JSON"),
        httpx.Response(200, json=[]),
        httpx.Response(200, json={"code": 6}),
    ],
)
async def test_splunk_rejects_missing_or_negative_acknowledgement(monkeypatch, response):
    monkeypatch.setattr(platform, "_post_siem", AsyncMock(return_value=response))
    with pytest.raises(HTTPException) as exc:
        await platform._push_splunk(
            SimpleNamespace(splunk_hec_url="https://example.invalid", splunk_hec_token="test"), [{}]
        )
    assert exc.value.status_code == 502


async def test_siem_network_failure_has_uncertain_delivery_message(monkeypatch):
    client = AsyncMock()
    client.__aenter__.return_value.post.side_effect = httpx.ConnectError("unavailable")
    monkeypatch.setattr(httpx, "AsyncClient", Mock(return_value=client))
    with pytest.raises(HTTPException) as exc:
        await platform._post_siem("https://example.invalid")
    assert exc.value.status_code == 502
    assert "unconfirmed" in exc.value.detail


def test_correlation_reports_candidate_truncation(published):
    from app.services.correlation_engine import run_correlations

    coverage = {}
    run_correlations(published[0], max_events=5, coverage=coverage)
    assert coverage == {"examined_candidates": 5, "candidate_limit": 5, "truncated": True}


async def test_missing_extracted_evidence_does_not_leave_processing_running(tmp_path, monkeypatch):
    from app.services import artifact_parser_service as parser

    db = AsyncMock()
    monkeypatch.setattr(
        parser,
        "get_processing_job_by_evidence_job_id",
        AsyncMock(return_value=SimpleNamespace(id="proc", status="PENDING", stage_results={})),
    )
    update = AsyncMock()
    monkeypatch.setattr(parser, "update_processing_job", update)
    with pytest.raises(RuntimeError, match="Extracted evidence is unavailable"):
        await parser._run_parsing_pipeline_locked("incident", "job", tmp_path, db)
    assert update.call_args.kwargs["status"] == "FAILED"
    assert "Extracted evidence" in update.call_args.kwargs["error_message"]
    db.rollback.assert_awaited_once()
    assert db.commit.await_count == 2
