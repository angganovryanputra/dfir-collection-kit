"""Convert parsed EZ Tools CSVs, Sigma hits, and Linux text logs to Timesketch JSONL format."""
from __future__ import annotations

import csv
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Per-source column mappings ─────────────────────────────────────────────────
# Each entry: {timestamp_col, timestamp_desc, source, source_short, message_cols, extra_cols}
_SOURCE_MAPS: dict[str, dict] = {
    "evtx": {
        "timestamp_cols": ["TimeCreated", "TimeStamp", "Timestamp"],
        "timestamp_desc": "Event Logged",
        "source": "Windows Event Log",
        "source_short": "EVTX",
        "message_cols": ["MapDescription", "PayloadData1", "Description"],
        "extra_cols": ["EventId", "Channel", "Computer", "UserName", "EventRecordId",
                       "PayloadData2", "PayloadData3"],
    },
    "mft": {
        "timestamp_cols": ["Created0x10", "LastModified0x10", "SourceCreated"],
        "timestamp_desc": "File Created (MFT)",
        "source": "NTFS Master File Table",
        "source_short": "MFT",
        "message_cols": ["FullPath", "FileName"],
        "extra_cols": ["FileSize", "IsDirectory", "LastModified0x10", "LastAccess0x10",
                       "LastAttrChange0x10", "EntryNumber"],
    },
    "usnjrnl": {
        "timestamp_cols": ["UpdateTimestamp", "TimeStamp"],
        "timestamp_desc": "USN Record",
        "source": "NTFS USN Journal",
        "source_short": "USNJRNL",
        "message_cols": ["Name", "FullPath"],
        "extra_cols": ["Reason", "FileAttributes", "ParentPath", "SecurityDescriptor"],
    },
    "registry": {
        "timestamp_cols": ["LastWriteTimestamp", "LastWrite"],
        "timestamp_desc": "Registry Modified",
        "source": "Windows Registry",
        "source_short": "REG",
        "message_cols": ["KeyPath", "ValueName"],
        "extra_cols": ["ValueType", "ValueData", "Hive"],
    },
    "prefetch": {
        "timestamp_cols": ["LastRun", "SourceCreated", "SourceModified"],
        "timestamp_desc": "Prefetch Executed",
        "source": "Windows Prefetch",
        "source_short": "PREFETCH",
        "message_cols": ["ExecutableName", "SourceFilename"],
        "extra_cols": ["RunCount", "Size", "Hash", "Volume0Name"],
    },
    "lnk": {
        "timestamp_cols": ["SourceCreated", "TargetCreated", "SourceModified"],
        "timestamp_desc": "LNK File Created",
        "source": "Windows LNK File",
        "source_short": "LNK",
        "message_cols": ["LocalPath", "Name"],
        "extra_cols": ["TargetMD5", "FileSize", "WorkingDirectory", "Arguments"],
    },
    "jumplists": {
        "timestamp_cols": ["SourceCreated", "LastModified", "TargetCreated"],
        "timestamp_desc": "Jump List Entry",
        "source": "Windows Jump Lists",
        "source_short": "JUMPLIST",
        "message_cols": ["Path", "LocalPath", "Name"],
        "extra_cols": ["AppId", "AppIdDescription"],
    },
    "amcache": {
        "timestamp_cols": ["FileKeyLastWriteTimestamp", "ProgramId"],
        "timestamp_desc": "Amcache Entry",
        "source": "Windows Amcache",
        "source_short": "AMCACHE",
        "message_cols": ["ApplicationName", "ProgramName", "Name"],
        "extra_cols": ["SHA1", "FileVersion", "Publisher", "Language"],
    },
    # ── Additional Windows artifact source maps ────────────────────────────
    "bits_jobs": {
        "timestamp_cols": ["CreationTime", "ModificationTime"],
        "timestamp_desc": "BITS Job",
        "source": "Windows BITS Jobs",
        "source_short": "BITS",
        "message_cols": ["DisplayName", "JobId"],
        "extra_cols": ["JobState", "TransferType", "OwnerAccount"],
    },
    "user_assist": {
        "timestamp_cols": ["LastRun"],
        "timestamp_desc": "Program Executed (UserAssist)",
        "source": "Windows UserAssist",
        "source_short": "USERASSIST",
        "message_cols": ["Program"],
        "extra_cols": ["RunCount", "GUID"],
    },
    "firewall_rules": {
        "timestamp_cols": [],   # no timestamps — static rules
        "timestamp_desc": "Firewall Rule",
        "source": "Windows Firewall Rules",
        "source_short": "FWRULE",
        "message_cols": ["DisplayName", "Name"],
        "extra_cols": ["Direction", "Action", "Enabled", "Profile"],
    },
}


def _parse_timestamp(value: str) -> str | None:
    """Try to parse a timestamp string and return ISO 8601 with timezone."""
    if not value or value.strip() in ("", "0", "N/A", "null"):
        return None
    value = value.strip()

    # Already ISO-ish with Z or +
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    if "+" in value or (value.count("-") >= 3):
        try:
            dt = datetime.fromisoformat(value)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except (ValueError, OverflowError):
            pass

    # Common EZ Tools format: "2026-01-01 12:00:00.000"
    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
    ):
        try:
            dt = datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue

    return None


def _row_to_entry(row: dict, source_map: dict, incident_id: str) -> dict | None:
    """Convert a single CSV row to a Timesketch JSONL dict. Returns None if no timestamp."""
    # Find first valid timestamp
    ts_iso: str | None = None
    for col in source_map["timestamp_cols"]:
        if col in row:
            ts_iso = _parse_timestamp(row[col])
            if ts_iso:
                break

    if not ts_iso:
        # Try any column that looks like a timestamp (fallback)
        for key, val in row.items():
            if any(k in key.lower() for k in ("time", "date", "created", "modified", "last")):
                ts_iso = _parse_timestamp(val)
                if ts_iso:
                    break

    if not ts_iso:
        return None

    # Build message from message columns (first non-empty)
    msg_parts = []
    for col in source_map["message_cols"]:
        if col in row and row[col] and row[col].strip():
            msg_parts.append(row[col].strip())
    message = " | ".join(msg_parts) if msg_parts else f"{source_map['source']} event"

    entry: dict = {
        "message": message,
        "datetime": ts_iso,
        "timestamp_desc": source_map["timestamp_desc"],
        "source": source_map["source"],
        "source_short": source_map["source_short"],
        "incident_id": incident_id,
    }

    # Add extra columns (lower-cased keys)
    for col in source_map.get("extra_cols", []):
        if col in row and row[col] and row[col].strip():
            entry[col.lower()] = row[col].strip()

    return entry


def _csv_to_entries(csv_path: Path, source_key: str, incident_id: str) -> list[dict]:
    """Parse one CSV file and return Timesketch JSONL entries."""
    source_map = _SOURCE_MAPS.get(source_key)
    if not source_map:
        logger.warning("No source map for %s — skipping %s", source_key, csv_path.name)
        return []

    entries: list[dict] = []
    try:
        with csv_path.open(encoding="utf-8-sig", errors="replace", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                entry = _row_to_entry(row, source_map, incident_id)
                if entry:
                    entries.append(entry)
    except (OSError, csv.Error) as exc:
        logger.warning("Failed to read CSV %s: %s", csv_path, exc)
    return entries


# ── Linux text-log parsers ─────────────────────────────────────────────────────

# syslog/rsyslog timestamp format: "Jan  2 15:04:05" (no year — assume current year)
_SYSLOG_RE = re.compile(
    r"^(?P<month>[A-Za-z]{3})\s+(?P<day>\d{1,2})\s+(?P<time>\d{2}:\d{2}:\d{2})\s+"
    r"(?P<host>\S+)\s+(?P<process>[^\[:\s]+)(?:\[(?P<pid>\d+)\])?\s*:\s*(?P<message>.+)$"
)

# ISO-8601 journal timestamp: "2026-01-02T15:04:05+0000"
_JOURNAL_RE = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+\-]\d{4})\s+"
    r"(?P<host>\S+)\s+(?P<process>[^\[:\s]+)(?:\[(?P<pid>\d+)\])?\s*:\s*(?P<message>.+)$"
)

# auditd: "type=... msg=audit(1700000000.123:456): ..."
_AUDIT_TS_RE = re.compile(r"msg=audit\((?P<epoch>\d+)\.\d+:\d+\)")

_MONTH_MAP = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


def _syslog_ts_to_iso(month: str, day: str, time_str: str) -> str | None:
    """Convert syslog 'Jan  2 15:04:05' to ISO 8601 (current year assumed)."""
    try:
        m = _MONTH_MAP.get(month)
        if not m:
            return None
        year = datetime.now(timezone.utc).year
        dt = datetime(year, m, int(day), *[int(p) for p in time_str.split(":")], tzinfo=timezone.utc)
        return dt.isoformat()
    except (ValueError, TypeError):
        return None


def _linux_syslog_to_entries(log_path: Path, incident_id: str, source_label: str, source_short: str) -> list[dict]:
    """Parse syslog/auth.log text file into timeline entries."""
    entries: list[dict] = []
    try:
        with log_path.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.rstrip()
                if not line:
                    continue

                # Try ISO-8601 journal format first (journalctl --output=short-iso)
                m = _JOURNAL_RE.match(line)
                if m:
                    ts_iso = _parse_timestamp(m.group("timestamp"))
                    if ts_iso:
                        entries.append({
                            "message": m.group("message"),
                            "datetime": ts_iso,
                            "timestamp_desc": source_label,
                            "source": source_label,
                            "source_short": source_short,
                            "incident_id": incident_id,
                            "hostname": m.group("host"),
                            "process": m.group("process"),
                            "pid": m.group("pid") or "",
                        })
                    continue

                # Try classic syslog format
                m = _SYSLOG_RE.match(line)
                if m:
                    ts_iso = _syslog_ts_to_iso(m.group("month"), m.group("day"), m.group("time"))
                    if ts_iso:
                        entries.append({
                            "message": m.group("message"),
                            "datetime": ts_iso,
                            "timestamp_desc": source_label,
                            "source": source_label,
                            "source_short": source_short,
                            "incident_id": incident_id,
                            "hostname": m.group("host"),
                            "process": m.group("process"),
                            "pid": m.group("pid") or "",
                        })
    except (OSError, UnicodeDecodeError) as exc:
        logger.warning("Failed to parse %s: %s", log_path.name, exc)
    return entries


def _linux_audit_to_entries(log_path: Path, incident_id: str) -> list[dict]:
    """Parse Linux audit.log lines into timeline entries."""
    entries: list[dict] = []
    try:
        with log_path.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.rstrip()
                if not line:
                    continue

                # Extract Unix epoch from msg=audit(1700000000.123:456)
                ts_match = _AUDIT_TS_RE.search(line)
                if not ts_match:
                    continue
                try:
                    epoch = int(ts_match.group("epoch"))
                    dt = datetime.fromtimestamp(epoch, tz=timezone.utc)
                    ts_iso = dt.isoformat()
                except (ValueError, OSError):
                    continue

                # Extract type= field
                type_match = re.search(r"type=(\S+)", line)
                audit_type = type_match.group(1) if type_match else "UNKNOWN"

                # Build concise message from key fields
                msg_parts = [f"type={audit_type}"]
                for field in ("exe", "comm", "key", "subj", "saddr"):
                    fm = re.search(rf'{field}="?([^"\s]+)"?', line)
                    if fm:
                        msg_parts.append(f"{field}={fm.group(1)}")

                entries.append({
                    "message": " | ".join(msg_parts),
                    "datetime": ts_iso,
                    "timestamp_desc": "Audit Event",
                    "source": "Linux Audit Log",
                    "source_short": "AUDIT",
                    "incident_id": incident_id,
                    "audit_type": audit_type,
                    "raw": line[:300],
                })
    except (OSError, UnicodeDecodeError) as exc:
        logger.warning("Failed to parse audit.log %s: %s", log_path.name, exc)
    return entries


def _linux_bash_history_to_entries(history_path: Path, incident_id: str, shell: str = "bash") -> list[dict]:
    """Parse bash/zsh history files into timeline entries.

    Supports both plain (no timestamps) and extended_history format
    (lines prefixed with ': <epoch>:<elapsed>;').
    """
    entries: list[dict] = []
    # Extended history format: ": 1700000000:0;command"
    ext_re = re.compile(r"^:\s*(\d+):\d+;(.+)$")
    try:
        with history_path.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.rstrip()
                if not line or line.startswith("#"):
                    continue

                m = ext_re.match(line)
                if m:
                    try:
                        dt = datetime.fromtimestamp(int(m.group(1)), tz=timezone.utc)
                        ts_iso = dt.isoformat()
                    except (ValueError, OSError):
                        ts_iso = datetime.now(timezone.utc).isoformat()
                    cmd = m.group(2).strip()
                else:
                    # Plain history — no timestamp available, use a sentinel
                    ts_iso = "1970-01-01T00:00:00+00:00"
                    cmd = line.strip()

                if not cmd:
                    continue

                entries.append({
                    "message": cmd,
                    "datetime": ts_iso,
                    "timestamp_desc": f"{shell.capitalize()} Command",
                    "source": f"Linux {shell.capitalize()} History",
                    "source_short": shell.upper(),
                    "incident_id": incident_id,
                    "shell": shell,
                    "user": history_path.parts[-2] if len(history_path.parts) >= 2 else "",
                })
    except (OSError, UnicodeDecodeError) as exc:
        logger.warning("Failed to parse %s history %s: %s", shell, history_path.name, exc)
    return entries


def _linux_wtmp_to_entries(wtmp_path: Path, incident_id: str) -> list[dict]:
    """Parse wtmp.txt (output of `last -F`) into timeline entries."""
    entries: list[dict] = []
    # Format from `last -F`: "username  pts/0  192.168.1.1  Mon Jan  2 15:04:05 2026  still logged in"
    last_re = re.compile(
        r"^(?P<user>\S+)\s+(?P<tty>\S+)\s+(?P<host>\S+)\s+"
        r"(?P<day>\w{3})\s+(?P<month>\w{3})\s+(?P<mday>\d+)\s+(?P<time>\d{2}:\d{2}:\d{2})\s+(?P<year>\d{4})"
        r"\s*(?P<status>.+)?$"
    )
    try:
        with wtmp_path.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.rstrip()
                if not line or line.startswith("wtmp") or line.startswith("btmp"):
                    continue
                m = last_re.match(line)
                if not m:
                    continue
                try:
                    mon = _MONTH_MAP.get(m.group("month"), 1)
                    dt = datetime(
                        int(m.group("year")), mon, int(m.group("mday")),
                        *[int(p) for p in m.group("time").split(":")],
                        tzinfo=timezone.utc,
                    )
                    ts_iso = dt.isoformat()
                except (ValueError, TypeError):
                    continue
                user = m.group("user")
                if user in ("reboot", "shutdown", "runlevel"):
                    source_short = "WTMP_SYS"
                else:
                    source_short = "WTMP"
                entries.append({
                    "message": f"{user} logged in from {m.group('host')} on {m.group('tty')}",
                    "datetime": ts_iso,
                    "timestamp_desc": "Login Event",
                    "source": "Linux wtmp (last)",
                    "source_short": source_short,
                    "incident_id": incident_id,
                    "username": user,
                    "tty": m.group("tty"),
                    "remote_host": m.group("host"),
                    "status": (m.group("status") or "").strip(),
                })
    except (OSError, UnicodeDecodeError) as exc:
        logger.warning("Failed to parse wtmp %s: %s", wtmp_path.name, exc)
    return entries


def _windows_text_artifacts_to_entries(extracted_dir: Path, incident_id: str) -> list[dict]:
    """Parse Windows text artifacts that are not processed by EZ Tools.

    Covers:
    - PowerShell history files (one command per line)
    - USB history text (structured plain text from registry)
    - Firewall log files (W3C Extended Log format)
    """
    all_entries: list[dict] = []

    # ── PowerShell console history (PSReadLine) ────────────────────────────────
    ps_hist_dir = extracted_dir / "artifacts" / "windows" / "powershell_history"
    if ps_hist_dir.exists():
        for hist_file in ps_hist_dir.glob("*ConsoleHost_history.txt"):
            user = hist_file.stem.replace("_ConsoleHost_history", "")
            try:
                with hist_file.open(encoding="utf-8", errors="replace") as fh:
                    for line in fh:
                        cmd = line.strip()
                        if not cmd:
                            continue
                        all_entries.append({
                            "message": cmd,
                            "datetime": "1970-01-01T00:00:00+00:00",  # no timestamps in plain history
                            "timestamp_desc": "PowerShell Command",
                            "source": "Windows PowerShell History",
                            "source_short": "PSHIST",
                            "incident_id": incident_id,
                            "username": user,
                        })
            except (OSError, UnicodeDecodeError) as exc:
                logger.warning("PowerShell history parse failed %s: %s", hist_file.name, exc)
        if all_entries:
            logger.info("PowerShell history: %d commands", len(all_entries))

    # ── Windows Firewall log (W3C Extended Log Format) ─────────────────────────
    fw_log_dir = extracted_dir / "artifacts" / "windows" / "firewall_logs"
    if fw_log_dir.exists():
        fw_entries: list[dict] = []
        for log_file in fw_log_dir.rglob("pfirewall*.log"):
            try:
                with log_file.open(encoding="utf-8", errors="replace") as fh:
                    fields: list[str] = []
                    for line in fh:
                        line = line.rstrip()
                        if line.startswith("#Fields:"):
                            fields = line[len("#Fields:"):].strip().split()
                            continue
                        if line.startswith("#") or not line:
                            continue
                        if not fields:
                            continue
                        parts = line.split()
                        if len(parts) < len(fields):
                            continue
                        row = dict(zip(fields, parts))
                        # W3C fields: date time action protocol src-ip dst-ip src-port dst-port ...
                        date_str = row.get("date", "")
                        time_str = row.get("time", "")
                        if date_str and time_str:
                            ts_iso = _parse_timestamp(f"{date_str} {time_str}")
                        else:
                            continue
                        if not ts_iso:
                            continue
                        action = row.get("action", "-")
                        proto = row.get("protocol", "-")
                        src = f"{row.get('src-ip', '-')}:{row.get('src-port', '-')}"
                        dst = f"{row.get('dst-ip', '-')}:{row.get('dst-port', '-')}"
                        fw_entries.append({
                            "message": f"{action} {proto} {src} → {dst}",
                            "datetime": ts_iso,
                            "timestamp_desc": "Firewall Packet",
                            "source": "Windows Firewall Log",
                            "source_short": "FWLOG",
                            "incident_id": incident_id,
                            "action": action,
                            "protocol": proto,
                            "src_ip": row.get("src-ip", ""),
                            "dst_ip": row.get("dst-ip", ""),
                        })
            except (OSError, UnicodeDecodeError) as exc:
                logger.warning("Firewall log parse failed %s: %s", log_file.name, exc)
        if fw_entries:
            logger.info("Firewall log: %d entries", len(fw_entries))
        all_entries.extend(fw_entries)

    return all_entries


def _linux_logs_to_entries(extracted_dir: Path, incident_id: str) -> list[dict]:
    """Scan extracted/logs/linux/ for known log files and parse into timeline entries."""
    all_entries: list[dict] = []
    linux_log_dir = extracted_dir / "logs" / "linux"
    if not linux_log_dir.exists():
        return all_entries

    for log_file in linux_log_dir.iterdir():
        if not log_file.is_file() or log_file.stat().st_size == 0:
            continue
        name = log_file.name.lower()

        if name in ("auth.log", "secure", "auth.log.1"):
            entries = _linux_syslog_to_entries(log_file, incident_id, "Auth Event", "AUTH")
        elif name in ("syslog", "messages", "syslog.1"):
            entries = _linux_syslog_to_entries(log_file, incident_id, "Syslog Event", "SYSLOG")
        elif name in ("audit.log",):
            entries = _linux_audit_to_entries(log_file, incident_id)
        elif name in ("journalctl.log", "journalctl"):
            entries = _linux_syslog_to_entries(log_file, incident_id, "Journal Event", "JOURNAL")
        elif name in ("dmesg.txt", "dmesg"):
            entries = _linux_syslog_to_entries(log_file, incident_id, "Kernel Message", "DMESG")
        elif name in ("wtmp.txt", "wtmp"):
            entries = _linux_wtmp_to_entries(log_file, incident_id)
        else:
            continue

        if entries:
            logger.info("Linux log parser: %d entries from %s", len(entries), name)
            all_entries.extend(entries)

    # Also parse bash/zsh history from system/linux/
    linux_sys_dir = extracted_dir / "system" / "linux"
    if linux_sys_dir.exists():
        for hist_file in linux_sys_dir.iterdir():
            if not hist_file.is_file():
                continue
            name = hist_file.name.lower()
            if "bash_history" in name:
                entries = _linux_bash_history_to_entries(hist_file, incident_id, shell="bash")
                if entries:
                    logger.info("Bash history: %d commands from %s", len(entries), hist_file.name)
                    all_entries.extend(entries)
            elif "zsh_history" in name:
                entries = _linux_bash_history_to_entries(hist_file, incident_id, shell="zsh")
                if entries:
                    logger.info("Zsh history: %d commands from %s", len(entries), hist_file.name)
                    all_entries.extend(entries)

    return all_entries


def _agent_parsed_to_entries(extracted_dir: Path, incident_id: str) -> list[dict]:
    """Ingest structured outputs produced by the Go agent's parse phase.

    The agent writes parsed artefacts to ``<workdir>/parsed/`` which, after
    extraction, appears at ``extracted/parsed/`` inside the evidence folder.
    Sub-directories:
      evtx/        *.jsonl  — one JSON object per event line
      prefetch/    prefetch.csv
      lnk/         lnk_files.csv
      browser/     *.csv
    """
    agent_parsed = extracted_dir / "parsed"
    if not agent_parsed.exists():
        return []

    entries: list[dict] = []

    # ── EVTX JSONL ─────────────────────────────────────────────────────────────
    evtx_dir = agent_parsed / "evtx"
    if evtx_dir.exists():
        for jl_file in sorted(evtx_dir.glob("*.jsonl")):
            count = 0
            try:
                for line in jl_file.read_text(encoding="utf-8", errors="replace").splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    # The agent already sets datetime, source, source_short, message.
                    # Ensure incident_id is present.
                    obj["incident_id"] = incident_id
                    # Flatten data dict into top-level keys for Timesketch
                    if isinstance(obj.get("data"), dict):
                        for k, v in obj["data"].items():
                            if k not in obj:
                                obj[k] = v
                        del obj["data"]
                    entries.append(obj)
                    count += 1
            except OSError as exc:
                logger.warning("agent_parsed/evtx: cannot read %s: %s", jl_file.name, exc)
                continue
            logger.info("agent_parsed/evtx: %d events from %s", count, jl_file.name)

    # ── Prefetch CSV ────────────────────────────────────────────────────────────
    prefetch_csv = agent_parsed / "prefetch" / "prefetch.csv"
    if prefetch_csv.exists():
        count = 0
        try:
            with prefetch_csv.open(newline="", encoding="utf-8-sig", errors="replace") as fh:
                for row in csv.DictReader(fh):
                    ts = row.get("LastRunTime", "").strip()
                    if not ts:
                        continue
                    dt = _parse_timestamp(ts)
                    if not dt:
                        continue
                    exe = row.get("ExeName", "").strip()
                    run_count = row.get("RunCount", "").strip()
                    entries.append({
                        "datetime": dt,
                        "timestamp_desc": "Program Last Executed (Prefetch)",
                        "source": "Windows Prefetch",
                        "source_short": "PREFETCH",
                        "message": f"{exe} executed (run count: {run_count})",
                        "incident_id": incident_id,
                        "ExeName": exe,
                        "RunCount": run_count,
                        "PrefetchHash": row.get("PrefetchHash", ""),
                        "Version": row.get("Version", ""),
                        "display_name": exe,
                    })
                    count += 1
        except OSError as exc:
            logger.warning("agent_parsed/prefetch: %s", exc)
        logger.info("agent_parsed/prefetch: %d entries", count)

    # ── LNK CSV ─────────────────────────────────────────────────────────────────
    lnk_csv = agent_parsed / "lnk" / "lnk_files.csv"
    if lnk_csv.exists():
        count = 0
        try:
            with lnk_csv.open(newline="", encoding="utf-8-sig", errors="replace") as fh:
                for row in csv.DictReader(fh):
                    target = row.get("TargetPath", "").strip()
                    # Use TargetModified as the primary timestamp; fall back to TargetCreated
                    for ts_col in ("TargetModified", "TargetCreated", "TargetAccessed"):
                        ts = row.get(ts_col, "").strip()
                        if ts:
                            dt = _parse_timestamp(ts)
                            if dt:
                                entries.append({
                                    "datetime": dt,
                                    "timestamp_desc": f"LNK {ts_col.replace('Target', '')}",
                                    "source": "Windows LNK Files",
                                    "source_short": "LNK",
                                    "message": f"LNK → {target}",
                                    "incident_id": incident_id,
                                    "LNKPath": row.get("LNKPath", ""),
                                    "TargetPath": target,
                                    "TargetSize": row.get("TargetSize", ""),
                                    "WorkingDir": row.get("WorkingDir", ""),
                                    "Arguments": row.get("Arguments", ""),
                                    "display_name": target,
                                })
                                count += 1
                                break
        except OSError as exc:
            logger.warning("agent_parsed/lnk: %s", exc)
        logger.info("agent_parsed/lnk: %d entries", count)

    # ── Browser History CSV ─────────────────────────────────────────────────────
    browser_dir = agent_parsed / "browser"
    if browser_dir.exists():
        for csv_file in sorted(browser_dir.glob("*.csv")):
            count = 0
            try:
                with csv_file.open(newline="", encoding="utf-8-sig", errors="replace") as fh:
                    for row in csv.DictReader(fh):
                        browser = row.get("Browser", "").strip() or "Browser"
                        url = row.get("URL", "").strip()
                        title = row.get("Title", "").strip()
                        # Prefer VisitTime over LastVisitTime for per-row timestamp
                        for ts_col in ("VisitTime", "LastVisitTime"):
                            ts = row.get(ts_col, "").strip()
                            if not ts:
                                continue
                            dt = _parse_timestamp(ts)
                            if not dt:
                                continue
                            entries.append({
                                "datetime": dt,
                                "timestamp_desc": f"{browser} URL Visit",
                                "source": f"{browser} Browser History",
                                "source_short": "BROWSER",
                                "message": f"{url} ({title})" if title else url,
                                "incident_id": incident_id,
                                "URL": url,
                                "Title": title,
                                "VisitCount": row.get("VisitCount", ""),
                                "Browser": browser,
                                "display_name": url,
                            })
                            count += 1
                            break
            except OSError as exc:
                logger.warning("agent_parsed/browser: cannot read %s: %s", csv_file.name, exc)
                continue
            logger.info("agent_parsed/browser: %d entries from %s", count, csv_file.name)

    return entries


def _sigma_hits_to_entries(sigma_dir: Path, incident_id: str) -> list[dict]:
    """Convert chainsaw JSON hits to Timesketch JSONL entries."""
    hits_file = sigma_dir / "chainsaw_hits.json"
    if not hits_file.exists():
        return []

    entries: list[dict] = []
    try:
        hits = json.loads(hits_file.read_text())
        if not isinstance(hits, list):
            return []
        for hit in hits:
            ts_raw = hit.get("timestamp") or ""
            ts_iso = _parse_timestamp(str(ts_raw)) if ts_raw else None
            if not ts_iso:
                ts_iso = datetime.now(timezone.utc).isoformat()

            rule_name = hit.get("name") or hit.get("rule") or "Sigma Detection"
            level = (hit.get("level") or "informational").lower()
            tags = hit.get("tags") or []
            doc = hit.get("document") or {}

            entry: dict = {
                "message": f"[SIGMA/{level.upper()}] {rule_name}",
                "datetime": ts_iso,
                "timestamp_desc": "Sigma Detection",
                "source": "Sigma Rule Detection",
                "source_short": "SIGMA",
                "incident_id": incident_id,
                "sigma_rule": rule_name,
                "sigma_level": level,
                "tag": tags if isinstance(tags, list) else [str(tags)],
            }
            if isinstance(doc, dict):
                for k in ("Computer", "EventId", "Channel", "UserName"):
                    if k in doc and doc[k]:
                        entry[k.lower()] = str(doc[k])
            entries.append(entry)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Failed to parse sigma hits: %s", exc)
    return entries


async def export_to_jsonl(
    parsed_dir: Path,
    sigma_dir: Path,
    timeline_dir: Path,
    incident_id: str,
) -> int:
    """
    Merge all parsed CSVs and sigma hits into a single Timesketch JSONL file.
    Returns number of entries written.
    """
    timeline_dir.mkdir(parents=True, exist_ok=True)
    timeline_path = timeline_dir / "timeline.jsonl"

    all_entries: list[dict] = []

    # Collect entries from each parsed artifact subdirectory (EZ Tools CSVs)
    if parsed_dir.exists():
        for source_dir in sorted(parsed_dir.iterdir()):
            if not source_dir.is_dir():
                continue
            source_key = source_dir.name  # e.g. "evtx", "mft", "prefetch"
            for csv_file in sorted(source_dir.glob("*.csv")):
                entries = _csv_to_entries(csv_file, source_key, incident_id)
                all_entries.extend(entries)
                logger.info(
                    "Timeline: %d entries from %s/%s",
                    len(entries), source_key, csv_file.name,
                )

    # Parse Linux text logs (auth.log, audit.log, syslog, journalctl, bash/zsh history)
    # extracted_dir is the parent of parsed_dir
    extracted_dir = parsed_dir.parent / "extracted"
    if extracted_dir.exists():
        linux_entries = _linux_logs_to_entries(extracted_dir, incident_id)
        if linux_entries:
            logger.info("Linux log entries: %d total", len(linux_entries))
        all_entries.extend(linux_entries)

        windows_text_entries = _windows_text_artifacts_to_entries(extracted_dir, incident_id)
        if windows_text_entries:
            logger.info("Windows text artifact entries: %d total", len(windows_text_entries))
        all_entries.extend(windows_text_entries)

        # Ingest agent-side parsed outputs (EVTX JSONL, Prefetch, LNK, Browser)
        agent_entries = _agent_parsed_to_entries(extracted_dir, incident_id)
        if agent_entries:
            logger.info("Agent-parsed entries: %d total", len(agent_entries))
        all_entries.extend(agent_entries)

    # Add sigma hits
    sigma_entries = _sigma_hits_to_entries(sigma_dir, incident_id)
    all_entries.extend(sigma_entries)

    # Sort by datetime (best-effort)
    def _sort_key(e: dict) -> str:
        return e.get("datetime") or ""

    all_entries.sort(key=_sort_key)

    # Write JSONL
    try:
        with timeline_path.open("w", encoding="utf-8") as fh:
            for entry in all_entries:
                fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError as exc:
        logger.error("Failed to write timeline.jsonl: %s", exc)
        raise

    logger.info("Timeline export complete: %d entries → %s", len(all_entries), timeline_path)

    # Build persistent DuckDB store for fast ad-hoc queries
    _build_duckdb_store(timeline_path, timeline_dir)

    return len(all_entries)


def _build_duckdb_store(timeline_path: Path, timeline_dir: Path) -> None:
    """Load timeline.jsonl into a persistent DuckDB file for fast queries.
    Silently skips if duckdb is not installed."""
    try:
        import duckdb  # type: ignore[import]
    except ImportError:
        logger.debug("duckdb not installed — skipping persistent store build")
        return

    db_path = timeline_dir / "duckdb.db"
    try:
        # Remove stale DB before rebuilding
        if db_path.exists():
            db_path.unlink()

        con = duckdb.connect(str(db_path))
        try:
            path_str = str(timeline_path).replace("\\", "/")
            con.execute(
                f"""
                CREATE TABLE timeline_events AS
                SELECT * FROM read_json_auto('{path_str}', ignore_errors=true)
                """
            )
            count = con.execute("SELECT COUNT(*) FROM timeline_events").fetchone()[0]
            logger.info("DuckDB store built: %d rows → %s", count, db_path)
        finally:
            con.close()
    except Exception as exc:
        logger.warning("Failed to build DuckDB store: %s", exc)
        # Don't leave a broken DB file
        if db_path.exists():
            try:
                db_path.unlink()
            except OSError:
                pass


async def push_to_timesketch(
    timeline_path: Path,
    sketch_name: str,
    timesketch_url: str,
    timesketch_token: str,
) -> dict:
    """
    Push timeline.jsonl to a Timesketch instance via the import client.
    Requires: pip install timesketch-import-client
    """
    try:
        from timesketch_import_client import importer  # type: ignore[import]
        from timesketch_api_client import config as ts_config  # type: ignore[import]
    except ImportError:
        return {"success": False, "error": "timesketch-import-client not installed"}

    try:
        ts_client = ts_config.get_client(
            host_uri=timesketch_url,
            auth_mode="http-basic",
        )
        with importer.ImportStreamer() as streamer:
            streamer.set_sketch(ts_client.create_sketch(sketch_name))
            streamer.set_timeline_name(sketch_name)
            streamer.add_file(str(timeline_path))
        return {"success": True, "sketch_name": sketch_name}
    except Exception as exc:
        logger.error("Timesketch push failed: %s", exc)
        return {"success": False, "error": str(exc)}
