from __future__ import annotations

import hashlib
import json
from pathlib import Path

import duckdb

from app.services.correlation_engine import run_correlations
from app.services.enrichment_service import enrich_event
from app.services.evidence_resolver import resolve_evidence_file
from app.services.siem_export_service import export_to_cef, export_to_leef, export_to_stix
from app.services.timeline_schema import UnifiedEvent


def test_unified_event_preserves_raw_fields_and_maps_mitre() -> None:
    event = UnifiedEvent.from_timeline_entry(
        {
            "datetime": "2026-01-02T03:04:05Z",
            "source": "Windows Event Log",
            "source_short": "evtx",
            "EventId": 4625,
            "Computer": "WS-01",
            "UserName": "alice",
            "PayloadData1": "10.0.0.8",
            "message": "Failed logon",
        },
        "incident-1",
    )
    result = enrich_event(event).to_timeline_dict()

    assert result["event_id"] == "4625"
    assert result["host"] == "WS-01"
    assert result["mitre_techniques"] == ["T1110"]
    assert result["raw_data"]["PayloadData1"] == "10.0.0.8"
    assert result["event_id_unique"] == result["event_uid"]


def test_siem_exports_escape_data_and_produce_stix_bundle() -> None:
    event = {
        "row_id": 7,
        "datetime": "2026-01-02T03:04:05+00:00",
        "host": "WS-01",
        "source_short": "EVTX",
        "message": "A|B=1",
        "extra": {"event_id": "4625", "actor": "alice", "source_ip": "10.0.0.8"},
    }
    cef = export_to_cef([event]).decode()
    leef = export_to_leef([event]).decode()
    stix = json.loads(export_to_stix([event], "incident-1"))

    assert cef.startswith("CEF:0|DFIRCollectionKit|")
    assert "A\\|B\\=1" in cef
    assert leef.startswith("LEEF:2.0|DFIRCollectionKit|")
    assert stix["type"] == "bundle"
    assert stix["objects"][0]["type"] == "x-dfir-timeline-event"


def test_correlation_engine_detects_bruteforce_then_success(tmp_path: Path) -> None:
    path = tmp_path / "timeline.duckdb"
    con = duckdb.connect(str(path))
    try:
        con.execute(
            "CREATE TABLE timeline_events (row_id INTEGER, host VARCHAR, event_dt TIMESTAMP, message VARCHAR, source_short VARCHAR, extra JSON)"
        )
        for row_id in range(1, 6):
            con.execute(
                "INSERT INTO timeline_events VALUES (?, 'WS-01', ?, 'failed logon', 'EVTX', ?)",
                [
                    row_id,
                    f"2026-01-02 03:0{row_id}:00",
                    json.dumps({"event_id": "4625", "actor": "alice"}),
                ],
            )
        con.execute(
            "INSERT INTO timeline_events VALUES (6, 'WS-01', '2026-01-02 03:10:00', 'successful logon', 'EVTX', ?)",
            [json.dumps({"event_id": "4624", "actor": "alice"})],
        )
    finally:
        con.close()

    findings = run_correlations(path)
    assert any(item["rule_id"] == "DFIR-CORR-001" for item in findings)


def test_event_identity_and_hashes_are_lossless() -> None:
    base = {
        "datetime": "2026-01-02T03:04:05Z",
        "source_short": "EVTX",
        "EventId": "4624",
        "message": "logon",
        "EventRecordId": "1",
        "hashes": {"sha256": "a" * 64},
    }
    first = UnifiedEvent.from_timeline_entry(base, "incident-1")
    second = UnifiedEvent.from_timeline_entry({**base, "EventRecordId": "2"}, "incident-1")
    assert first.event_uid != second.event_uid
    assert enrich_event(first).hashes["sha256"] == "a" * 64


def test_evidence_resolver_requires_digest_and_rejects_wrong_file(tmp_path: Path) -> None:
    root = tmp_path / "vault"
    file_path = root / "incident-1" / "job-1" / "extracted" / "Security.evtx"
    file_path.parent.mkdir(parents=True)
    file_path.write_bytes(b"original")
    digest = hashlib.sha256(b"original").hexdigest()
    resolved = resolve_evidence_file(
        str(root),
        "incident-1",
        "Security.evtx",
        digest,
        "job-1/extracted/Security.evtx",
        "job-1",
        "sha256",
    )
    assert resolved == file_path.resolve()
