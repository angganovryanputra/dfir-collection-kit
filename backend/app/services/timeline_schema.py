"""Canonical, backwards-compatible representation for timeline events.

The parsers in this project intentionally retain source-specific fields.  This
module gives downstream features a stable core without discarding that
forensic context: ``raw_data`` is always retained in the JSONL payload.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any

from pydantic import BaseModel, Field

SOURCE_NAMES: dict[str, dict[str, str]] = {
    "evtx": {"full": "Windows Event Log", "short": "EVTX"},
    "mft": {"full": "NTFS Master File Table", "short": "MFT"},
    "usnjrnl": {"full": "NTFS USN Journal", "short": "USNJRNL"},
    "registry": {"full": "Windows Registry", "short": "REG"},
    "prefetch": {"full": "Windows Prefetch", "short": "PREFETCH"},
    "lnk": {"full": "Windows LNK File", "short": "LNK"},
    "jumplists": {"full": "Windows Jump Lists", "short": "JUMPLIST"},
    "amcache": {"full": "Windows Amcache", "short": "AMCACHE"},
    "shellbags": {"full": "Windows Shellbags", "short": "SHELLBAG"},
    "srum": {"full": "Windows SRUM Database", "short": "SRUM"},
    "sysmon": {"full": "Sysmon", "short": "SYSMON"},
    "sigma": {"full": "Sigma Detection", "short": "SIGMA"},
    "yara": {"full": "YARA Match", "short": "YARA"},
    "ioc": {"full": "IOC Match", "short": "IOC"},
    "browser": {"full": "Web Browser Artifact", "short": "BROWSER"},
    "chrome": {"full": "Google Chrome Artifact", "short": "CHROME"},
    "edge": {"full": "Microsoft Edge Artifact", "short": "EDGE"},
    "firefox": {"full": "Mozilla Firefox Artifact", "short": "FIREFOX"},
    "linux": {"full": "Linux System Artifact", "short": "LINUX"},
    "macos": {"full": "macOS System Artifact", "short": "MACOS"},
    "network": {"full": "Network Artifact", "short": "NETWORK"},
}

MITRE_EVENT_MAPPING: dict[str, dict[str, str]] = {
    "4624": {"technique": "T1078", "tactic": "Initial Access", "category": "Logon"},
    "4625": {"technique": "T1110", "tactic": "Credential Access", "category": "Failed Logon"},
    "4648": {
        "technique": "T1078",
        "tactic": "Initial Access",
        "category": "Explicit Credential Logon",
    },
    "4672": {
        "technique": "T1078",
        "tactic": "Privilege Escalation",
        "category": "Special Privileges",
    },
    "4688": {"technique": "T1059", "tactic": "Execution", "category": "Process Creation"},
    "4697": {"technique": "T1543.003", "tactic": "Persistence", "category": "Service Installed"},
    "4698": {
        "technique": "T1053.005",
        "tactic": "Persistence",
        "category": "Scheduled Task Created",
    },
    "4720": {"technique": "T1136", "tactic": "Persistence", "category": "User Created"},
    "4728": {"technique": "T1098", "tactic": "Persistence", "category": "Security Group Changed"},
    "4732": {"technique": "T1098", "tactic": "Persistence", "category": "Local Group Changed"},
    "4756": {"technique": "T1098", "tactic": "Persistence", "category": "Universal Group Changed"},
    "7045": {"technique": "T1543.003", "tactic": "Persistence", "category": "Service Installed"},
    "1102": {
        "technique": "T1070.001",
        "tactic": "Defense Evasion",
        "category": "Audit Log Cleared",
    },
}


def get_mitre_mapping(event_id: str | int | None) -> dict[str, str]:
    return MITRE_EVENT_MAPPING.get(str(event_id), {})


def _json_safe(value: Any) -> Any:
    """Return a JSON-serialisable value without losing useful source data."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    return str(value)


def _first(record: dict[str, Any], *names: str) -> str | None:
    lowered = {str(key).lower(): value for key, value in record.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value not in (None, ""):
            return str(value)
    return None


def _collect_hashes(record: dict[str, Any]) -> dict[str, str]:
    """Collect common hash spellings while preserving raw parser fields."""
    nested = record.get("hashes")
    result = {str(k).lower(): str(v) for k, v in nested.items() if v not in (None, "")} if isinstance(nested, dict) else {}
    aliases = {"md5": ("md5", "hash_md5"), "sha1": ("sha1", "hash_sha1"), "sha256": ("sha256", "hash_sha256", "sha-256"), "sha512": ("sha512", "hash_sha512")}
    for name, keys in aliases.items():
        value = _first(record, *keys)
        if value:
            result.setdefault(name, value)
    return result


def _int_value(record: dict[str, Any], *names: str) -> int | None:
    value = _first(record, *names)
    try:
        return int(value) if value else None
    except (TypeError, ValueError):
        return None


def _normalise_timestamp(value: Any) -> str:
    """Produce an offset-aware ISO timestamp; unknown dates remain searchable."""
    if not value:
        # Unknown is preferable to a fabricated collection-time timestamp.
        # DuckDB turns the empty value into NULL while raw_data remains intact.
        return ""
    raw = str(value).strip()
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except ValueError:
        # DuckDB will leave unparseable legacy timestamps as NULL.  Keeping the
        # original string is more defensible than silently inventing a date.
        return raw


class UnifiedEvent(BaseModel):
    """Stable schema shared by parsers, correlation, and SIEM exports."""

    timestamp: str
    source: str = "Unknown"
    source_short: str = "UNKNOWN"
    incident_id: str
    message: str = ""
    timestamp_desc: str = "Event Recorded"
    host: str | None = None
    computer: str | None = None
    event_id: str | None = None
    event_uid: str
    actor: str | None = None
    target: str | None = None
    source_ip: str | None = None
    dest_ip: str | None = None
    severity: str | None = None
    level: str | None = None
    category: str | None = None
    action: str | None = None
    result: str | None = None
    source_port: int | None = None
    dest_port: int | None = None
    protocol: str | None = None
    process: str | None = None
    command_line: str | None = None
    hashes: dict[str, str] = Field(default_factory=dict)
    mitre_techniques: list[str] = Field(default_factory=list)
    mitre_tactic: str | None = None
    confidence: float = 0.5
    tags: list[str] = Field(default_factory=list)
    raw_data: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_timeline_entry(cls, entry: dict[str, Any], incident_id: str) -> "UnifiedEvent":
        raw_data = _json_safe(dict(entry))
        timestamp = _normalise_timestamp(_first(entry, "datetime", "timestamp", "TimeCreated"))
        source = _first(entry, "source", "source_long", "dataset", "parser") or "Unknown"
        source_short = (_first(entry, "source_short", "source_type") or "UNKNOWN").upper()
        message = _first(entry, "message", "description", "MapDescription") or ""
        event_id = _first(entry, "event_id", "eventid", "EventId", "Event ID")
        host = _first(entry, "host", "computer", "Computer", "hostname", "HostName")
        actor = _first(entry, "actor", "user", "username", "UserName", "subjectusername")
        target = _first(entry, "target", "targetuser", "TargetUserName", "objectname", "FullPath")
        source_ip = _first(entry, "source_ip", "sourceip", "IpAddress", "SourceIp")
        dest_ip = _first(entry, "dest_ip", "destinationip", "DestIp", "DestinationIp")
        severity = _first(entry, "severity", "level", "Severity", "risk")
        # Identity includes all source discriminators (record ID, channel, file,
        # row/job provenance). A display message is not a forensic identity.
        identity = json.dumps(
            {"incident_id": incident_id, "timestamp": timestamp, "raw": raw_data},
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        event_uid = sha256(identity.encode("utf-8", errors="replace")).hexdigest()
        return cls(
            timestamp=timestamp,
            source=source,
            source_short=source_short,
            incident_id=incident_id,
            message=message,
            timestamp_desc=_first(entry, "timestamp_desc") or "Event Recorded",
            host=host,
            computer=host,
            event_id=event_id,
            event_uid=event_uid,
            actor=actor,
            target=target,
            source_ip=source_ip,
            dest_ip=dest_ip,
            severity=severity,
            level=_first(entry, "level", "Level", "severity", "Severity"),
            action=_first(entry, "action", "Action", "event_action"),
            result=_first(entry, "result", "Result", "status", "Status"),
            process=_first(entry, "process", "Process", "Image", "Executable"),
            command_line=_first(entry, "command_line", "CommandLine", "command"),
            source_port=_int_value(entry, "source_port", "src_port", "SourcePort"),
            dest_port=_int_value(entry, "dest_port", "dst_port", "DestinationPort"),
            hashes=_collect_hashes(entry),
            raw_data=raw_data,
        )

    def to_timeline_dict(self) -> dict[str, Any]:
        """Emit canonical keys plus legacy aliases expected by existing views."""
        result = self.model_dump(exclude_none=True)
        result["datetime"] = self.timestamp
        result["event_id_unique"] = self.event_uid
        # Retain source columns at top-level for existing Super Timeline filters.
        for key, value in self.raw_data.items():
            result.setdefault(key, value)
        return result

    def fingerprint(self) -> str:
        return self.event_uid


def serialise_event(event: UnifiedEvent) -> str:
    """Consistent JSON representation used by the streaming timeline writer."""
    return json.dumps(event.to_timeline_dict(), ensure_ascii=False, default=str)
