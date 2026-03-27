"""Demo data seeder for the DFIR Collection Kit.

Seeds a realistic "CORAL REEF" ransomware incident with 4 hosts, evidence folders,
timeline JSONL files, and builds the Super Timeline so the full feature set is
immediately available after ``docker compose up --build``.

Environment variable:
    SEED_DEMO_DATA=true   — auto-run at backend startup (via seed_run.py)

Standalone cleanup (inside container or via docker compose run):
    python app/seed_demo.py --clean
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from app.db.session import AsyncSessionLocal
from app.models.analytics import AttackChain
from app.models.collector import Collector
from app.models.device import Device
from app.models.evidence import EvidenceFolder
from app.models.incident import Incident
from app.models.job import Job
from app.models.processing import ProcessingJob
from app.services.super_timeline_service import build_super_timeline_background

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEMO_INCIDENT_ID = "INC-MOCK-SUPERTL"
_NOW = datetime.now(timezone.utc).isoformat()

_HOSTS = [
    {"device_id": "DEVICE-WS01", "hostname": "WORKSTATION-01", "ip": "192.168.1.50",
     "type": "workstation", "job_id": "job-mock-ws01", "proc_job_id": "proc-job-mock-ws01"},
    {"device_id": "DEVICE-DC01", "hostname": "DC01",           "ip": "192.168.1.10",
     "type": "server",      "job_id": "job-mock-dc01", "proc_job_id": "proc-job-mock-dc01"},
    {"device_id": "DEVICE-FS02", "hostname": "FILESERVER-02",  "ip": "192.168.1.20",
     "type": "server",      "job_id": "job-mock-fs02", "proc_job_id": "proc-job-mock-fs02"},
    {"device_id": "DEVICE-HR03", "hostname": "LAPTOP-HR03",    "ip": "192.168.1.75",
     "type": "laptop",      "job_id": "job-mock-hr03", "proc_job_id": "proc-job-mock-hr03"},
]

_EXTRA_DEVICES = [
    {"device_id": "DEVICE-OBS01", "hostname": "WORKSTATION-02",  "ip": "192.168.1.51", "type": "workstation", "os": "windows"},
    {"device_id": "DEVICE-OBS02", "hostname": "MAILSERVER-01",   "ip": "192.168.1.15", "type": "server",      "os": "linux"},
    {"device_id": "DEVICE-OBS03", "hostname": "LAPTOP-DEV01",    "ip": "192.168.1.80", "type": "laptop",      "os": "windows"},
]

_COLLECTORS = [
    {"id": "COLLECTOR-ALPHA", "name": "ALPHA-NODE", "endpoint": "http://192.168.1.200:8080", "status": "ONLINE"},
    {"id": "COLLECTOR-BETA",  "name": "BETA-NODE",  "endpoint": "http://192.168.1.201:8080", "status": "ONLINE"},
]

_ATTACK_CHAINS = [
    {
        "id": "chain-mock-initial-access",
        "tactics": ["initial-access", "execution"],
        "techniques": ["T1566.001", "T1204.002", "T1059.001"],
        "hit_count": 12,
        "severity": "critical",
        "window_start": "2026-01-15T07:45:00+00:00",
        "window_end":   "2026-01-15T08:20:00+00:00",
        "graph_nodes": [
            {"id": "n1", "label": "Phishing Email", "type": "technique"},
            {"id": "n2", "label": "Invoice_Q4_2025.docx", "type": "artifact"},
            {"id": "n3", "label": "STAGE_LOADER.EXE", "type": "process"},
            {"id": "n4", "label": "PowerShell Execution", "type": "technique"},
        ],
        "graph_edges": [
            {"source": "n1", "target": "n2", "label": "delivered"},
            {"source": "n2", "target": "n3", "label": "dropped"},
            {"source": "n3", "target": "n4", "label": "spawned"},
        ],
        "sigma_hit_ids": [],
    },
    {
        "id": "chain-mock-lateral-movement",
        "tactics": ["lateral-movement", "credential-access", "privilege-escalation"],
        "techniques": ["T1550.002", "T1003.001", "T1078", "T1021.002"],
        "hit_count": 23,
        "severity": "critical",
        "window_start": "2026-01-15T09:10:00+00:00",
        "window_end":   "2026-01-15T11:45:00+00:00",
        "graph_nodes": [
            {"id": "n1", "label": "WORKSTATION-01",   "type": "host"},
            {"id": "n2", "label": "LSASS Dump",       "type": "technique"},
            {"id": "n3", "label": "Pass-the-Hash",    "type": "technique"},
            {"id": "n4", "label": "DC01",             "type": "host"},
            {"id": "n5", "label": "FILESERVER-02",    "type": "host"},
            {"id": "n6", "label": "jsmith (admin)",   "type": "actor"},
        ],
        "graph_edges": [
            {"source": "n1", "target": "n2", "label": "executed"},
            {"source": "n2", "target": "n6", "label": "harvested"},
            {"source": "n6", "target": "n3", "label": "used"},
            {"source": "n3", "target": "n4", "label": "accessed"},
            {"source": "n3", "target": "n5", "label": "accessed"},
        ],
        "sigma_hit_ids": [],
    },
    {
        "id": "chain-mock-ransomware-deploy",
        "tactics": ["impact", "collection", "exfiltration"],
        "techniques": ["T1486", "T1560.001", "T1041", "T1490"],
        "hit_count": 18,
        "severity": "critical",
        "window_start": "2026-01-15T14:00:00+00:00",
        "window_end":   "2026-01-15T15:30:00+00:00",
        "graph_nodes": [
            {"id": "n1", "label": "CORAL_LOCKER.exe",       "type": "process"},
            {"id": "n2", "label": "Shadow Copy Deletion",   "type": "technique"},
            {"id": "n3", "label": "File Encryption",        "type": "technique"},
            {"id": "n4", "label": "C2 Exfiltration",        "type": "technique"},
            {"id": "n5", "label": "RANSOM_NOTE.txt",        "type": "artifact"},
        ],
        "graph_edges": [
            {"source": "n1", "target": "n2", "label": "executed"},
            {"source": "n1", "target": "n3", "label": "executed"},
            {"source": "n1", "target": "n4", "label": "executed"},
            {"source": "n3", "target": "n5", "label": "dropped"},
        ],
        "sigma_hit_ids": [],
    },
]

_EVIDENCE_FOLDERS = [
    {"id": f"evfolder-mock-{h['job_id']}", "incident_id": DEMO_INCIDENT_ID,
     "type": "collection", "files_count": fc, "total_size": ts, "status": "locked"}
    for h, fc, ts in zip(
        _HOSTS,
        [312, 289, 347, 198],
        ["1.2 GB", "980 MB", "1.5 GB", "650 MB"],
    )
]

# ---------------------------------------------------------------------------
# Timeline events per host
# (compact set — enough to trigger lateral movement detection and show
#  multiple source types in the Super Timeline)
# ---------------------------------------------------------------------------

def _events_workstation01() -> list[dict]:
    return [
        {"datetime": "2026-01-15T07:52:11Z", "timestamp_desc": "LAST ACCESSED",
         "source": "LNK", "source_short": "LNK", "host": "WORKSTATION-01",
         "user": "jsmith",
         "display_name": r"C:\Users\jsmith\AppData\Roaming\Microsoft\Windows\Recent\Invoice_Q4_2025.docx.lnk",
         "message": "LNK opened: Invoice_Q4_2025.docx.lnk — phishing attachment via Outlook"},
        {"datetime": "2026-01-15T07:53:44Z", "timestamp_desc": "CREATED",
         "source": "MFT", "source_short": "MFT", "host": "WORKSTATION-01",
         "user": "jsmith",
         "display_name": r"C:\Users\jsmith\AppData\Local\Temp\stage_loader.exe",
         "message": "MFT: C:\\Users\\jsmith\\AppData\\Local\\Temp\\stage_loader.exe created"},
        {"datetime": "2026-01-15T07:54:01Z", "timestamp_desc": "PREFETCH EXECUTION",
         "source": "PREFETCH", "source_short": "PREFETCH", "host": "WORKSTATION-01",
         "user": "jsmith",
         "display_name": r"C:\Windows\Prefetch\STAGE_LOADER.EXE-A1B2C3D4.pf",
         "message": "PREFETCH: stage_loader.exe executed — run count 1"},
        {"datetime": "2026-01-15T08:01:15Z", "timestamp_desc": "LOGON",
         "source": "Windows Event Log", "source_short": "EVTX", "host": "WORKSTATION-01",
         "user": "jsmith", "event_id": 4624,
         "display_name": "Security.evtx",
         "message": "EventID 4624: Successful logon — jsmith on WORKSTATION-01 (Type 2 Interactive)"},
        {"datetime": "2026-01-15T08:15:30Z", "timestamp_desc": "PROCESS CREATION",
         "source": "Sysmon", "source_short": "SYSMON", "host": "WORKSTATION-01",
         "user": "jsmith",
         "display_name": "Microsoft-Windows-Sysmon%4Operational.evtx",
         "message": "Sysmon EventID 1: lsass.exe accessed by stage_loader.exe — credential dump attempt"},
        {"datetime": "2026-01-15T08:22:10Z", "timestamp_desc": "REGISTRY VALUE SET",
         "source": "Registry", "source_short": "REGISTRY", "host": "WORKSTATION-01",
         "user": "jsmith",
         "display_name": r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
         "message": r"Registry: HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run\Updater set — persistence established"},
        {"datetime": "2026-01-15T09:00:05Z", "timestamp_desc": "SIGMA DETECTION",
         "source": "SIGMA/Hayabusa", "source_short": "SIGMA", "host": "WORKSTATION-01",
         "user": "jsmith", "rule_name": "Credential Dumping via LSASS",
         "display_name": "credential_dumping_lsass.yml",
         "message": "SIGMA ALERT [critical]: Credential Dumping via LSASS — stage_loader.exe → lsass.exe"},
        {"datetime": "2026-01-15T09:45:00Z", "timestamp_desc": "PROCESS CREATION",
         "source": "MFT", "source_short": "MFT", "host": "WORKSTATION-01",
         "user": "jsmith",
         "display_name": r"C:\Windows\Temp\coral_reef_ransom.exe",
         "message": "MFT: coral_reef_ransom.exe created at C:\\Windows\\Temp\\coral_reef_ransom.exe"},
        {"datetime": "2026-01-15T09:46:22Z", "timestamp_desc": "PREFETCH EXECUTION",
         "source": "PREFETCH", "source_short": "PREFETCH", "host": "WORKSTATION-01",
         "user": "jsmith",
         "display_name": r"C:\Windows\Prefetch\CORAL_REEF_RANSOM.EXE-F1E2D3C4.pf",
         "message": "PREFETCH: coral_reef_ransom.exe executed — ransomware detonated on WORKSTATION-01"},
        {"datetime": "2026-01-15T09:48:00Z", "timestamp_desc": "SIGMA DETECTION",
         "source": "SIGMA/Hayabusa", "source_short": "SIGMA", "host": "WORKSTATION-01",
         "user": "jsmith", "rule_name": "Ransomware File Extension Pattern",
         "display_name": "ransomware_file_extension_pattern.yml",
         "message": "SIGMA ALERT [critical]: Mass file rename with .coralreef extension detected"},
    ]


def _events_dc01() -> list[dict]:
    return [
        {"datetime": "2026-01-15T08:05:00Z", "timestamp_desc": "LOGON",
         "source": "Windows Event Log", "source_short": "EVTX", "host": "DC01",
         "user": "jsmith", "event_id": 4624,
         "display_name": "Security.evtx",
         "message": "EventID 4624: Successful network logon — jsmith on DC01 from WORKSTATION-01 (Type 3)"},
        {"datetime": "2026-01-15T08:06:15Z", "timestamp_desc": "LOGON",
         "source": "Windows Event Log", "source_short": "EVTX", "host": "DC01",
         "user": "jsmith", "event_id": 4672,
         "display_name": "Security.evtx",
         "message": "EventID 4672: Special privileges assigned to jsmith — SeDebugPrivilege, SeImpersonatePrivilege"},
        {"datetime": "2026-01-15T08:10:00Z", "timestamp_desc": "PROCESS CREATION",
         "source": "Sysmon", "source_short": "SYSMON", "host": "DC01",
         "user": "jsmith",
         "display_name": "Microsoft-Windows-Sysmon%4Operational.evtx",
         "message": "Sysmon EventID 1: ntdsutil.exe executed by jsmith — AD database dump attempt"},
        {"datetime": "2026-01-15T08:12:00Z", "timestamp_desc": "REGISTRY VALUE SET",
         "source": "Registry", "source_short": "REGISTRY", "host": "DC01",
         "user": "jsmith",
         "display_name": r"HKLM\SYSTEM\CurrentControlSet\Services",
         "message": r"Registry: HKLM\SYSTEM\CurrentControlSet\Services\coral_reef_svc installed — malicious service"},
        {"datetime": "2026-01-15T08:30:00Z", "timestamp_desc": "SIGMA DETECTION",
         "source": "SIGMA/Hayabusa", "source_short": "SIGMA", "host": "DC01",
         "user": "jsmith", "rule_name": "AD Replication Abuse",
         "display_name": "win_dcsync_attack.yml",
         "message": "SIGMA ALERT [high]: DCSync — jsmith performed unauthorized directory replication"},
        {"datetime": "2026-01-15T09:46:45Z", "timestamp_desc": "PROCESS CREATION",
         "source": "MFT", "source_short": "MFT", "host": "DC01",
         "user": "jsmith",
         "display_name": r"C:\Windows\Temp\coral_reef_ransom.exe",
         "message": "MFT: coral_reef_ransom.exe created and executed on DC01"},
        {"datetime": "2026-01-15T09:47:00Z", "timestamp_desc": "PREFETCH EXECUTION",
         "source": "PREFETCH", "source_short": "PREFETCH", "host": "DC01",
         "user": "jsmith",
         "display_name": r"C:\Windows\Prefetch\CORAL_REEF_RANSOM.EXE-F1E2D3C4.pf",
         "message": "PREFETCH: coral_reef_ransom.exe — run count 1 on DC01"},
        {"datetime": "2026-01-15T09:50:00Z", "timestamp_desc": "AMCACHE",
         "source": "Amcache", "source_short": "AMCACHE", "host": "DC01",
         "user": "jsmith",
         "display_name": r"C:\Windows\Temp\coral_reef_ransom.exe",
         "message": "Amcache: coral_reef_ransom.exe SHA1=a1b2c3d4e5f6... first seen 2026-01-15T09:46:45Z"},
    ]


def _events_fileserver02() -> list[dict]:
    return [
        {"datetime": "2026-01-15T08:08:00Z", "timestamp_desc": "LOGON",
         "source": "Windows Event Log", "source_short": "EVTX", "host": "FILESERVER-02",
         "user": "jsmith", "event_id": 4624,
         "display_name": "Security.evtx",
         "message": "EventID 4624: Successful network logon — jsmith on FILESERVER-02 (Type 3 Network)"},
        {"datetime": "2026-01-15T08:20:00Z", "timestamp_desc": "CREATED",
         "source": "MFT", "source_short": "MFT", "host": "FILESERVER-02",
         "user": "jsmith",
         "display_name": r"D:\Shares\Finance\Q4_Budget.xlsx.coralreef",
         "message": r"MFT: D:\Shares\Finance\Q4_Budget.xlsx renamed to Q4_Budget.xlsx.coralreef"},
        {"datetime": "2026-01-15T08:25:00Z", "timestamp_desc": "SIGMA DETECTION",
         "source": "SIGMA/Hayabusa", "source_short": "SIGMA", "host": "FILESERVER-02",
         "user": "jsmith", "rule_name": "Mass File Encryption",
         "display_name": "ransomware_mass_file_encryption.yml",
         "message": "SIGMA ALERT [critical]: 847 files renamed with .coralreef extension in 90 seconds"},
        {"datetime": "2026-01-15T08:26:00Z", "timestamp_desc": "CREATED",
         "source": "MFT", "source_short": "MFT", "host": "FILESERVER-02",
         "user": "jsmith",
         "display_name": r"D:\Shares\HOW_TO_DECRYPT.txt",
         "message": r"MFT: D:\Shares\HOW_TO_DECRYPT.txt dropped in every encrypted directory"},
        {"datetime": "2026-01-15T09:46:50Z", "timestamp_desc": "PREFETCH EXECUTION",
         "source": "PREFETCH", "source_short": "PREFETCH", "host": "FILESERVER-02",
         "user": "jsmith",
         "display_name": r"C:\Windows\Prefetch\CORAL_REEF_RANSOM.EXE-F1E2D3C4.pf",
         "message": "PREFETCH: coral_reef_ransom.exe — executed on FILESERVER-02"},
        {"datetime": "2026-01-15T09:50:00Z", "timestamp_desc": "REGISTRY VALUE SET",
         "source": "Registry", "source_short": "REGISTRY", "host": "FILESERVER-02",
         "user": "jsmith",
         "display_name": r"HKLM\SOFTWARE\coral_reef",
         "message": r"Registry: HKLM\SOFTWARE\coral_reef — C2 config written (encrypted blob)"},
        {"datetime": "2026-01-15T09:51:00Z", "timestamp_desc": "AMCACHE",
         "source": "Amcache", "source_short": "AMCACHE", "host": "FILESERVER-02",
         "user": "jsmith",
         "display_name": r"C:\Windows\Temp\coral_reef_ransom.exe",
         "message": "Amcache: coral_reef_ransom.exe SHA1=a1b2c3d4e5f6... first seen 2026-01-15T09:46:50Z"},
    ]


def _events_laptop_hr03() -> list[dict]:
    return [
        {"datetime": "2026-01-15T07:55:00Z", "timestamp_desc": "LOGON",
         "source": "Windows Event Log", "source_short": "EVTX", "host": "LAPTOP-HR03",
         "user": "jsmith", "event_id": 4624,
         "display_name": "Security.evtx",
         "message": "EventID 4624: Successful logon — jsmith on LAPTOP-HR03 (Type 10 RemoteInteractive)"},
        {"datetime": "2026-01-15T07:58:00Z", "timestamp_desc": "LAST ACCESSED",
         "source": "LNK", "source_short": "LNK", "host": "LAPTOP-HR03",
         "user": "jsmith",
         "display_name": r"C:\Users\jsmith\AppData\Roaming\Microsoft\Windows\Recent\HR_Payroll_2026.xlsx.lnk",
         "message": "LNK: HR_Payroll_2026.xlsx.lnk opened — lateral phishing from WORKSTATION-01"},
        {"datetime": "2026-01-15T08:00:00Z", "timestamp_desc": "PREFETCH EXECUTION",
         "source": "PREFETCH", "source_short": "PREFETCH", "host": "LAPTOP-HR03",
         "user": "jsmith",
         "display_name": r"C:\Windows\Prefetch\STAGE_LOADER.EXE-A1B2C3D4.pf",
         "message": "PREFETCH: stage_loader.exe first executed on LAPTOP-HR03"},
        {"datetime": "2026-01-15T09:47:10Z", "timestamp_desc": "PROCESS CREATION",
         "source": "Sysmon", "source_short": "SYSMON", "host": "LAPTOP-HR03",
         "user": "jsmith",
         "display_name": "Microsoft-Windows-Sysmon%4Operational.evtx",
         "message": "Sysmon EventID 1: coral_reef_ransom.exe spawned by stage_loader.exe on LAPTOP-HR03"},
        {"datetime": "2026-01-15T09:47:30Z", "timestamp_desc": "SIGMA DETECTION",
         "source": "SIGMA/Hayabusa", "source_short": "SIGMA", "host": "LAPTOP-HR03",
         "user": "jsmith", "rule_name": "Ransomware File Extension Pattern",
         "display_name": "ransomware_file_extension_pattern.yml",
         "message": "SIGMA ALERT [critical]: Ransomware activity — .coralreef extension on LAPTOP-HR03"},
        {"datetime": "2026-01-15T09:48:00Z", "timestamp_desc": "AMCACHE",
         "source": "Amcache", "source_short": "AMCACHE", "host": "LAPTOP-HR03",
         "user": "jsmith",
         "display_name": r"C:\Windows\Temp\coral_reef_ransom.exe",
         "message": "Amcache: coral_reef_ransom.exe SHA1=a1b2c3d4e5f6... first seen 2026-01-15T09:47:10Z"},
    ]


_HOST_EVENTS = {
    "job-mock-ws01": _events_workstation01,
    "job-mock-dc01": _events_dc01,
    "job-mock-fs02": _events_fileserver02,
    "job-mock-hr03": _events_laptop_hr03,
}


# ---------------------------------------------------------------------------
# Core async helpers
# ---------------------------------------------------------------------------


async def seed_all(base_path: str | Path | None = None) -> None:
    """Idempotently seed all demo records and build the Super Timeline.

    Safe to call multiple times — skips records that already exist.

    Args:
        base_path: Evidence storage root (default: EVIDENCE_STORAGE_PATH env or /vault/evidence).
    """
    evidence_root = Path(
        str(base_path)
        if base_path
        else os.environ.get("EVIDENCE_STORAGE_PATH", "/vault/evidence")
    )

    async with AsyncSessionLocal() as db:
        await _seed_db(db, evidence_root)

    _write_jsonl_files(evidence_root)

    print("[demo] Building Super Timeline …")
    await build_super_timeline_background(DEMO_INCIDENT_ID, evidence_root)
    print("[demo] Super Timeline ready.\n")


async def clean_all() -> None:
    """Delete all demo records created by seed_all().

    Safe to call when records do not exist.
    """
    async with AsyncSessionLocal() as db:
        await _clean_db(db)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _seed_db(db, evidence_root: Path) -> None:
    started = datetime.now(timezone.utc)

    # Incident
    if not await db.get(Incident, DEMO_INCIDENT_ID):
        db.add(Incident(
            id=DEMO_INCIDENT_ID,
            type="ransomware",
            status="COLLECTION_COMPLETE",
            operator="admin",
            target_endpoints=[h["hostname"] for h in _HOSTS],
            collection_progress=100,
            template_id=None,
        ))
        await db.flush()
        print(f"[demo] Created Incident {DEMO_INCIDENT_ID}")

    # Devices, Jobs, ProcessingJobs
    for host in _HOSTS:
        did, jid, pjid = host["device_id"], host["job_id"], host["proc_job_id"]

        if not await db.get(Device, did):
            db.add(Device(
                id=did,
                hostname=host["hostname"],
                ip_address=host["ip"],
                type=host["type"],
                os="windows",
                agent_version="1.4.0",
                status="online",
                last_seen=_NOW,
                cpu_usage=None,
                memory_usage=None,
                collection_status="idle",
                registered_at=_NOW,
            ))
            await db.flush()
            print(f"[demo] Created Device {did} ({host['hostname']})")

        if not await db.get(Job, jid):
            db.add(Job(
                id=jid,
                incident_id=DEMO_INCIDENT_ID,
                agent_id=did,
                status="done",
                modules=[
                    {"id": "windows_logs"},
                    {"id": "windows_artifacts"},
                    {"id": "windows_process_network"},
                    {"id": "windows_system"},
                ],
                output_path=str(evidence_root / DEMO_INCIDENT_ID / jid),
                message="Collection completed successfully.",
            ))
            await db.flush()
            print(f"[demo] Created Job {jid}")

        if not await db.get(ProcessingJob, pjid):
            db.add(ProcessingJob(
                id=pjid,
                incident_id=DEMO_INCIDENT_ID,
                job_id=jid,
                status="DONE",
                phase="timeline",
                started_at=started,
                completed_at=started,
                error_message=None,
            ))
            await db.flush()
            print(f"[demo] Created ProcessingJob {pjid}")

    # Evidence Folders
    for spec in _EVIDENCE_FOLDERS:
        if not await db.get(EvidenceFolder, spec["id"]):
            db.add(EvidenceFolder(
                id=spec["id"],
                incident_id=spec["incident_id"],
                type=spec["type"],
                date=_NOW,
                files_count=spec["files_count"],
                total_size=spec["total_size"],
                status=spec["status"],
            ))
            await db.flush()
            print(f"[demo] Created EvidenceFolder {spec['id']} ({spec['files_count']} files)")

    # Extra observer devices
    for spec in _EXTRA_DEVICES:
        if not await db.get(Device, spec["device_id"]):
            db.add(Device(
                id=spec["device_id"],
                hostname=spec["hostname"],
                ip_address=spec["ip"],
                type=spec["type"],
                os=spec["os"],
                agent_version="1.4.0",
                status="online",
                last_seen=_NOW,
                cpu_usage=None,
                memory_usage=None,
                collection_status="idle",
                registered_at=_NOW,
            ))
            await db.flush()
            print(f"[demo] Created extra Device {spec['device_id']} ({spec['hostname']})")

    # Collectors
    for spec in _COLLECTORS:
        if not await db.get(Collector, spec["id"]):
            db.add(Collector(
                id=spec["id"],
                name=spec["name"],
                endpoint=spec["endpoint"],
                status=spec["status"],
                last_heartbeat=_NOW,
            ))
            await db.flush()
            print(f"[demo] Created Collector {spec['id']} ({spec['name']})")

    # Attack Chains
    for spec in _ATTACK_CHAINS:
        if not await db.get(AttackChain, spec["id"]):
            db.add(AttackChain(
                id=spec["id"],
                incident_id=DEMO_INCIDENT_ID,
                processing_job_id=_HOSTS[0]["proc_job_id"],
                window_start=datetime.fromisoformat(spec["window_start"]),
                window_end=datetime.fromisoformat(spec["window_end"]),
                tactics=spec["tactics"],
                techniques=spec["techniques"],
                graph_nodes=spec["graph_nodes"],
                graph_edges=spec["graph_edges"],
                hit_count=spec["hit_count"],
                severity=spec["severity"],
                sigma_hit_ids=spec["sigma_hit_ids"],
            ))
            await db.flush()
            print(f"[demo] Created AttackChain {spec['id']} ({spec['severity']})")

    await db.commit()
    print("[demo] All DB records committed.\n")


async def _clean_db(db) -> None:
    print(f"[demo] Cleaning demo data for incident {DEMO_INCIDENT_ID} …")

    for spec in _EVIDENCE_FOLDERS:
        obj = await db.get(EvidenceFolder, spec["id"])
        if obj:
            await db.delete(obj)
            print(f"  deleted EvidenceFolder {spec['id']}")

    for host in _HOSTS:
        pjid, jid, did = host["proc_job_id"], host["job_id"], host["device_id"]
        for Model, pk in [(ProcessingJob, pjid), (Job, jid), (Device, did)]:
            obj = await db.get(Model, pk)
            if obj:
                await db.delete(obj)
                print(f"  deleted {Model.__name__} {pk}")

    incident = await db.get(Incident, DEMO_INCIDENT_ID)
    if incident:
        await db.delete(incident)
        print(f"  deleted Incident {DEMO_INCIDENT_ID}")

    for spec in _EXTRA_DEVICES:
        obj = await db.get(Device, spec["device_id"])
        if obj:
            await db.delete(obj)
            print(f"  deleted extra Device {spec['device_id']}")

    for spec in _COLLECTORS:
        obj = await db.get(Collector, spec["id"])
        if obj:
            await db.delete(obj)
            print(f"  deleted Collector {spec['id']}")

    for spec in _ATTACK_CHAINS:
        obj = await db.get(AttackChain, spec["id"])
        if obj:
            await db.delete(obj)
            print(f"  deleted AttackChain {spec['id']}")

    await db.commit()
    print("[demo] Clean complete.\n")


def _write_jsonl_files(evidence_root: Path) -> None:
    """Write per-host timeline.jsonl files to the evidence vault."""
    for host in _HOSTS:
        jid = host["job_id"]
        events = _HOST_EVENTS[jid]()
        out_path = evidence_root / DEMO_INCIDENT_ID / jid / "timeline" / "timeline.jsonl"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as fh:
            for event in events:
                fh.write(json.dumps(event, ensure_ascii=False) + "\n")
        print(f"[demo] Wrote {len(events)} events → {out_path}")


# ---------------------------------------------------------------------------
# Standalone entry point  (python app/seed_demo.py [--clean])
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed or clean DFIR demo data.")
    parser.add_argument("--clean", action="store_true", help="Remove all demo records")
    parser.add_argument(
        "--base-path",
        default=os.environ.get("EVIDENCE_STORAGE_PATH", "/vault/evidence"),
        help="Evidence storage root (default: $EVIDENCE_STORAGE_PATH or /vault/evidence)",
    )
    args = parser.parse_args()

    if args.clean:
        asyncio.run(clean_all())
    else:
        asyncio.run(seed_all(args.base_path))
