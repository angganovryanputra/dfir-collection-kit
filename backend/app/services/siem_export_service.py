"""Portable Super Timeline exports for CEF, LEEF, and STIX consumers."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import NAMESPACE_URL, uuid5


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _extra(record: dict[str, Any]) -> dict[str, Any]:
    value = record.get("extra", record.get("raw_data", {}))
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return {}
    return value if isinstance(value, dict) else {}


def _event_value(record: dict[str, Any], key: str) -> Any:
    return record.get(key) if record.get(key) not in (None, "") else _extra(record).get(key)


def _escape_cef(value: Any) -> str:
    return (
        _text(value)
        .replace("\\", "\\\\")
        .replace("=", "\\=")
        .replace("|", "\\|")
        .replace("\r", " ")
        .replace("\n", " ")
    )


def _escape_leef(value: Any) -> str:
    return (
        _text(value).replace("\\", "\\\\").replace("\t", " ").replace("\r", " ").replace("\n", " ")
    )


def export_to_cef(events: list[dict[str, Any]]) -> bytes:
    """Render ArcSight-compatible CEF without interpreting or dropping events."""
    lines: list[str] = []
    for event in events:
        severity = _text(_event_value(event, "severity")).lower()
        cef_severity = {"critical": "10", "high": "8", "medium": "5", "low": "3"}.get(severity, "4")
        event_id = _event_value(event, "event_id") or "timeline-event"
        extension = {
            "rt": event.get("datetime") or event.get("event_dt"),
            "dhost": event.get("host"),
            "src": _event_value(event, "source_ip"),
            "dst": _event_value(event, "dest_ip"),
            "suser": _event_value(event, "actor") or _event_value(event, "user"),
            "duser": _event_value(event, "target"),
            "externalId": event.get("row_id")
            or event.get("event_uid")
            or _event_value(event, "event_id_unique"),
            "cs1": _event_value(event, "mitre_techniques"),
            "cs1Label": "MITRE ATT&CK",
        }
        extension_text = " ".join(
            f"{key}={_escape_cef(value)}"
            for key, value in extension.items()
            if value not in (None, "")
        )
        header = "|".join(
            (
                "CEF:0",
                "DFIRCollectionKit",
                "SuperTimeline",
                "1.0",
                _escape_cef(event_id),
                _escape_cef(event.get("message")),
                cef_severity,
            )
        )
        lines.append(f"{header}|{extension_text}")
    return ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8")


def export_to_leef(events: list[dict[str, Any]]) -> bytes:
    """Render IBM QRadar-compatible LEEF 2.0 records."""
    lines: list[str] = []
    for event in events:
        event_id = _event_value(event, "event_id") or "timeline-event"
        fields = {
            "devTime": event.get("datetime") or event.get("event_dt"),
            "devTimeFormat": "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "src": _event_value(event, "source_ip"),
            "dst": _event_value(event, "dest_ip"),
            "usrName": _event_value(event, "actor") or _event_value(event, "user"),
            "dstUsrName": _event_value(event, "target"),
            "cat": event.get("source_short"),
            "sev": _event_value(event, "severity") or "medium",
            "msg": event.get("message"),
        }
        payload = "\t".join(
            f"{key}={_escape_leef(value)}"
            for key, value in fields.items()
            if value not in (None, "")
        )
        lines.append(
            f"LEEF:2.0|DFIRCollectionKit|SuperTimeline|1.0|{_escape_leef(event_id)}|{payload}"
        )
    return ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8")


def export_to_stix(events: list[dict[str, Any]], incident_id: str = "unknown") -> bytes:
    """Produce a STIX 2.1 bundle using a namespaced custom event type.

    A custom object preserves arbitrary forensic evidence faithfully; creating
    Indicators for every row would incorrectly imply a detection pattern.
    """
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    objects: list[dict[str, Any]] = []
    for event in events:
        uid = _text(
            event.get("event_uid") or _event_value(event, "event_id_unique") or event.get("row_id")
        )
        identifier = f"x-dfir-timeline-event--{uuid5(NAMESPACE_URL, f'{incident_id}:{uid}') }"
        objects.append(
            {
                "type": "x-dfir-timeline-event",
                "spec_version": "2.1",
                "id": identifier,
                "created": now,
                "modified": now,
                "x_dfir_incident_id": incident_id,
                "x_dfir_timestamp": _text(event.get("datetime") or event.get("event_dt")),
                "x_dfir_host": _text(event.get("host")),
                "x_dfir_source": _text(event.get("source_short")),
                "x_dfir_message": _text(event.get("message")),
                "x_dfir_event_id": _text(_event_value(event, "event_id")),
                "x_dfir_raw": _extra(event),
            }
        )
    bundle = {
        "type": "bundle",
        "id": f"bundle--{uuid5(NAMESPACE_URL, f'dfir:{incident_id}:{len(events)}')}",
        "objects": objects,
    }
    return json.dumps(bundle, ensure_ascii=False, indent=2, default=str).encode("utf-8")


def render_export(
    events: list[dict[str, Any]], fmt: str, incident_id: str
) -> tuple[bytes, str, str]:
    """Return (bytes, media type, extension) for a requested SIEM format."""
    if fmt == "cef":
        return export_to_cef(events), "application/cef", "cef"
    if fmt == "leef":
        return export_to_leef(events), "application/leef", "leef"
    if fmt == "stix":
        return export_to_stix(events, incident_id), "application/stix+json", "stix.json"
    raise ValueError(f"Unsupported SIEM export format: {fmt}")
