"""Seed additional mock data: collectors + active incidents for UI / super timeline testing.

Creates:
  - 3 extra collectors (ONLINE / DEGRADED / OFFLINE)
  - 5 incidents at different lifecycle stages
  - 1 COLLECTION_COMPLETE incident (INC-APT-NIGHTFALL) with full super timeline

Run inside the backend container:
    docker exec dfir-backend python3 -m app.seed_mock_active
    docker exec dfir-backend python3 -m app.seed_mock_active --clean
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.db.session import AsyncSessionLocal
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

_APT_INCIDENT_ID = "INC-APT-NIGHTFALL"
_NOW = datetime.now(timezone.utc)

# ---------------------------------------------------------------------------
# Collectors
# ---------------------------------------------------------------------------

_NEW_COLLECTORS = [
    {"id": "COLLECTOR-GAMMA", "name": "GAMMA-NODE", "endpoint": "http://192.168.1.202:8080", "status": "ONLINE"},
    {"id": "COLLECTOR-DELTA", "name": "DELTA-NODE", "endpoint": "http://192.168.2.10:8080",  "status": "DEGRADED"},
    {"id": "COLLECTOR-ECHO",  "name": "ECHO-NODE",  "endpoint": "http://192.168.2.11:8080",  "status": "OFFLINE"},
]

_HEARTBEAT_AGE = {"ONLINE": 1, "DEGRADED": 8, "OFFLINE": 120}

# ---------------------------------------------------------------------------
# Devices for APT NIGHTFALL
# ---------------------------------------------------------------------------

_APT_HOSTS = [
    {"device_id": "DEVICE-APT-CEO", "hostname": "LAPTOP-CEO01",    "ip": "10.10.1.5",  "type": "laptop",      "os": "windows", "job_id": "job-apt-ceo", "proc_job_id": "proc-apt-ceo"},
    {"device_id": "DEVICE-APT-SRV", "hostname": "INTRANET-SRV01",  "ip": "10.10.1.20", "type": "server",      "os": "linux",   "job_id": "job-apt-srv", "proc_job_id": "proc-apt-srv"},
    {"device_id": "DEVICE-APT-ADM", "hostname": "ADMIN-WS01",      "ip": "10.10.1.30", "type": "workstation", "os": "windows", "job_id": "job-apt-adm", "proc_job_id": "proc-apt-adm"},
]

_EXTRA_DEVICES = [
    {"device_id": "DEVICE-NET01", "hostname": "CORE-SW-01",     "ip": "10.10.0.1",  "type": "server",  "os": "linux"},
    {"device_id": "DEVICE-VPN01", "hostname": "VPN-GW-01",      "ip": "10.10.0.5",  "type": "server",  "os": "linux"},
    {"device_id": "DEVICE-DEV01", "hostname": "LAPTOP-DEV02",   "ip": "10.10.1.88", "type": "laptop",  "os": "windows"},
    {"device_id": "DEVICE-FIN01", "hostname": "LAPTOP-FINANCE",  "ip": "10.10.1.90", "type": "laptop",  "os": "windows"},
]

# ---------------------------------------------------------------------------
# Active incidents (non-APT)
# ---------------------------------------------------------------------------

_ACTIVE_INCIDENTS = [
    {
        "id": "INC-RANSOM-TEMPEST",
        "type": "ransomware",
        "status": "COLLECTING",
        "target_endpoints": ["LAPTOP-CEO01", "INTRANET-SRV01", "FILESERVER-03"],
        "collection_progress": 65,
        "collection_phase": "Collecting volatile data",
        "age_days": 0,
    },
    {
        "id": "INC-BREACH-TIDE",
        "type": "data_breach",
        "status": "ANALYZING",
        "target_endpoints": ["MAILSERVER-02", "SHAREPOINT-01"],
        "collection_progress": 100,
        "collection_phase": "Processing pipeline",
        "age_days": 1,
    },
    {
        "id": "INC-INSIDER-FROST",
        "type": "insider_threat",
        "status": "PENDING",
        "target_endpoints": ["LAPTOP-FINANCE", "CORE-SW-01", "LAPTOP-DEV02", "VPN-GW-01"],
        "collection_progress": 0,
        "collection_phase": None,
        "age_days": 0,
    },
    {
        "id": "INC-MALWARE-STORM",
        "type": "malware",
        "status": "COLLECTING",
        "target_endpoints": ["LAPTOP-HR03", "WORKSTATION-03"],
        "collection_progress": 40,
        "collection_phase": "Collecting logs",
        "age_days": 0,
    },
    {
        "id": "INC-APT-AURORA",
        "type": "apt",
        "status": "CLOSED",
        "target_endpoints": ["LAPTOP-CEO01", "ADMIN-WS01"],
        "collection_progress": 100,
        "collection_phase": None,
        "age_days": 30,
    },
]

_APT_EVIDENCE_FOLDERS = [
    {"id": f"evfolder-{h['job_id']}", "incident_id": _APT_INCIDENT_ID,
     "type": "collection", "files_count": fc, "total_size": sz, "status": "locked"}
    for h, fc, sz in zip(_APT_HOSTS, [178, 234, 156], ["680 MB", "1.1 GB", "520 MB"])
]

# ---------------------------------------------------------------------------
# Timeline events — APT NIGHTFALL
# timeline.jsonl fields: datetime (ISO8601 UTC), timestamp_desc, message,
#   source, source_short, display_name, user, machine_id
# ---------------------------------------------------------------------------

def _events_ceo() -> list[dict]:
    b = datetime(2026, 3, 10, 6, 30, 0, tzinfo=timezone.utc)
    return [
        {"datetime": (b+timedelta(minutes=2)).isoformat(),  "timestamp_desc": "LAST ACCESSED", "source": "LNK",      "source_short": "LNK",      "display_name": r"C:\Users\ceo\Downloads\BoardPresentation_March2026.pdf.lnk",        "message": "LNK opened: BoardPresentation_March2026.pdf.lnk — spear phishing attachment",            "user": "ceo",    "machine_id": "LAPTOP-CEO01"},
        {"datetime": (b+timedelta(minutes=3)).isoformat(),  "timestamp_desc": "LAST EXECUTED", "source": "PREFETCH", "source_short": "PREFETCH", "display_name": "MSHTA.EXE-AB12CD34.pf",                                               "message": "Prefetch: MSHTA.EXE — HTML application dropper launched via LNK",                        "user": "ceo",    "machine_id": "LAPTOP-CEO01"},
        {"datetime": (b+timedelta(minutes=4)).isoformat(),  "timestamp_desc": "CREATED",       "source": "MFT",      "source_short": "MFT",      "display_name": r"C:\Users\ceo\AppData\Roaming\Microsoft\BEACON.DLL",                   "message": "MFT: BEACON.DLL dropped — Cobalt Strike beacon staged in AppData",                        "user": "ceo",    "machine_id": "LAPTOP-CEO01"},
        {"datetime": (b+timedelta(minutes=6)).isoformat(),  "timestamp_desc": "LAST EXECUTED", "source": "PREFETCH", "source_short": "PREFETCH", "display_name": "RUNDLL32.EXE-9F3A1B22.pf",                                             "message": "Prefetch: RUNDLL32.EXE — beacon DLL loaded",                                              "user": "ceo",    "machine_id": "LAPTOP-CEO01"},
        {"datetime": (b+timedelta(minutes=8)).isoformat(),  "timestamp_desc": "INFO",          "source": "EVTX",     "source_short": "EVTX",     "display_name": "Security.evtx",                                                       "message": "EVTX 4624: Successful logon Type 3 — DOMAIN\\ceo from 185.220.101.42",                    "user": "ceo",    "machine_id": "LAPTOP-CEO01"},
        {"datetime": (b+timedelta(minutes=12)).isoformat(), "timestamp_desc": "INFO",          "source": "SIGMA",    "source_short": "SIGMA",    "display_name": "cobalt_strike_beacon_http.yml",                                       "message": "SIGMA T1071.001 — HTTP C2 beacon to 185.220.101.42:443 every 60s",                        "user": "ceo",    "machine_id": "LAPTOP-CEO01"},
        {"datetime": (b+timedelta(minutes=35)).isoformat(), "timestamp_desc": "LAST EXECUTED", "source": "PREFETCH", "source_short": "PREFETCH", "display_name": "NET.EXE-A1B2C3D4.pf",                                                 "message": "Prefetch: NET.EXE — net user /domain (domain recon)",                                     "user": "ceo",    "machine_id": "LAPTOP-CEO01"},
        {"datetime": (b+timedelta(minutes=36)).isoformat(), "timestamp_desc": "LAST EXECUTED", "source": "PREFETCH", "source_short": "PREFETCH", "display_name": "NLTEST.EXE-B2C3D4E5.pf",                                              "message": "Prefetch: NLTEST.EXE — domain trust enumeration",                                         "user": "ceo",    "machine_id": "LAPTOP-CEO01"},
        {"datetime": (b+timedelta(hours=1, minutes=10)).isoformat(), "timestamp_desc": "CREATED", "source": "MFT",   "source_short": "MFT",      "display_name": r"C:\Windows\PSEXESVC.EXE",                                            "message": "MFT: PSEXESVC.EXE created — PsExec service binary for lateral movement",                  "user": "SYSTEM", "machine_id": "LAPTOP-CEO01"},
        {"datetime": (b+timedelta(hours=1, minutes=12)).isoformat(), "timestamp_desc": "INFO",    "source": "EVTX",  "source_short": "EVTX",     "display_name": "System.evtx",                                                         "message": "EVTX 7045: Service PSEXESVC installed on INTRANET-SRV01 from LAPTOP-CEO01",               "user": "SYSTEM", "machine_id": "LAPTOP-CEO01"},
    ]


def _events_server() -> list[dict]:
    b = datetime(2026, 3, 10, 7, 45, 0, tzinfo=timezone.utc)
    return [
        {"datetime": (b+timedelta(minutes=0)).isoformat(),  "timestamp_desc": "INFO",    "source": "EVTX",     "source_short": "EVTX",     "display_name": "Security.evtx",                                  "message": "EVTX 4624: Lateral movement — DOMAIN\\ceo via PsExec from LAPTOP-CEO01",          "user": "ceo",  "machine_id": "INTRANET-SRV01"},
        {"datetime": (b+timedelta(minutes=2)).isoformat(),  "timestamp_desc": "INFO",    "source": "SIGMA",    "source_short": "SIGMA",    "display_name": "uac_bypass_com_object.yml",                       "message": "SIGMA T1548.002 — UAC bypass via COM object hijack",                               "user": "ceo",  "machine_id": "INTRANET-SRV01"},
        {"datetime": (b+timedelta(minutes=5)).isoformat(),  "timestamp_desc": "CREATED", "source": "MFT",      "source_short": "MFT",      "display_name": "/opt/backup/EXFIL_STAGE/",                        "message": "MFT: EXFIL_STAGE/ directory created — staging for data collection",               "user": "root", "machine_id": "INTRANET-SRV01"},
        {"datetime": (b+timedelta(minutes=8)).isoformat(),  "timestamp_desc": "CREATED", "source": "MFT",      "source_short": "MFT",      "display_name": "/opt/backup/EXFIL_STAGE/contracts_2025.tar.gz",  "message": "MFT: contracts_2025.tar.gz created — sensitive data archived for exfiltration",   "user": "root", "machine_id": "INTRANET-SRV01"},
        {"datetime": (b+timedelta(minutes=15)).isoformat(), "timestamp_desc": "INFO",    "source": "SIGMA",    "source_short": "SIGMA",    "display_name": "exfil_over_https.yml",                            "message": "SIGMA T1041 — Data exfiltration via HTTPS to 185.220.101.42:443 (14.3 GB)",       "user": "root", "machine_id": "INTRANET-SRV01"},
        {"datetime": (b+timedelta(minutes=45)).isoformat(), "timestamp_desc": "MODIFIED","source": "MFT",      "source_short": "MFT",      "display_name": "/var/log/auth.log",                              "message": "MFT: auth.log modified — attacker cleared authentication logs",                   "user": "root", "machine_id": "INTRANET-SRV01"},
        {"datetime": (b+timedelta(minutes=46)).isoformat(), "timestamp_desc": "MODIFIED","source": "MFT",      "source_short": "MFT",      "display_name": "/var/log/syslog",                                "message": "MFT: syslog modified — system logs tampered",                                     "user": "root", "machine_id": "INTRANET-SRV01"},
        {"datetime": (b+timedelta(hours=1)).isoformat(),    "timestamp_desc": "INFO",    "source": "EVTX",     "source_short": "EVTX",     "display_name": "Security.evtx",                                  "message": "EVTX 4634: Logoff — DOMAIN\\ceo session terminated on INTRANET-SRV01",             "user": "ceo",  "machine_id": "INTRANET-SRV01"},
    ]


def _events_admin() -> list[dict]:
    b = datetime(2026, 3, 10, 9, 0, 0, tzinfo=timezone.utc)
    return [
        {"datetime": (b+timedelta(minutes=0)).isoformat(),  "timestamp_desc": "INFO",          "source": "EVTX",    "source_short": "EVTX",    "display_name": "Security.evtx",    "message": "EVTX 4624: DOMAIN\\ceo logged onto ADMIN-WS01 via RDP from LAPTOP-CEO01",       "user": "ceo",    "machine_id": "ADMIN-WS01"},
        {"datetime": (b+timedelta(minutes=3)).isoformat(),  "timestamp_desc": "LAST ACCESSED",  "source": "REGISTRY","source_short": "REGISTRY", "display_name": "NTUSER.DAT",       "message": "Registry: HKCU\\...\\Run — persistence key written (BEACON.DLL autorun)",       "user": "ceo",    "machine_id": "ADMIN-WS01"},
        {"datetime": (b+timedelta(minutes=5)).isoformat(),  "timestamp_desc": "CREATED",        "source": "MFT",     "source_short": "MFT",     "display_name": r"C:\Windows\System32\svchost32.exe", "message": "MFT: svchost32.exe created — backdoor masquerading as system process", "user": "SYSTEM", "machine_id": "ADMIN-WS01"},
        {"datetime": (b+timedelta(minutes=8)).isoformat(),  "timestamp_desc": "INFO",           "source": "SIGMA",   "source_short": "SIGMA",   "display_name": "process_injection_lsass.yml", "message": "SIGMA T1055.001 — svchost32.exe injecting into lsass.exe",               "user": "SYSTEM", "machine_id": "ADMIN-WS01"},
        {"datetime": (b+timedelta(minutes=12)).isoformat(), "timestamp_desc": "INFO",           "source": "EVTX",    "source_short": "EVTX",    "display_name": "Security.evtx",    "message": "EVTX 4720: New account created — DOMAIN\\svc_backup$ (shadow admin)",           "user": "ceo",    "machine_id": "ADMIN-WS01"},
        {"datetime": (b+timedelta(minutes=14)).isoformat(), "timestamp_desc": "INFO",           "source": "EVTX",    "source_short": "EVTX",    "display_name": "Security.evtx",    "message": "EVTX 4728: svc_backup$ added to Domain Admins",                                 "user": "ceo",    "machine_id": "ADMIN-WS01"},
        {"datetime": (b+timedelta(hours=2)).isoformat(),    "timestamp_desc": "LAST ACCESSED",  "source": "AMCACHE", "source_short": "AMCACHE", "display_name": "Amcache.hve",      "message": "AMCACHE: svchost32.exe first execution recorded",                               "user": "SYSTEM", "machine_id": "ADMIN-WS01"},
    ]


_EVENTS_BY_HOST = {
    "LAPTOP-CEO01":   _events_ceo,
    "INTRANET-SRV01": _events_server,
    "ADMIN-WS01":     _events_admin,
}

ALL_INCIDENT_IDS = [_APT_INCIDENT_ID] + [i["id"] for i in _ACTIVE_INCIDENTS]
ALL_DEVICE_IDS   = [h["device_id"] for h in _APT_HOSTS] + [d["device_id"] for d in _EXTRA_DEVICES]
ALL_COLLECTOR_IDS = [c["id"] for c in _NEW_COLLECTORS]


# ---------------------------------------------------------------------------
# Clean
# ---------------------------------------------------------------------------

async def _clean(db) -> None:
    from sqlalchemy import delete
    from app.models.super_timeline import SuperTimeline

    for inc_id in ALL_INCIDENT_IDS:
        await db.execute(delete(SuperTimeline).where(SuperTimeline.incident_id == inc_id))
        await db.execute(delete(ProcessingJob).where(ProcessingJob.incident_id == inc_id))
        await db.execute(delete(EvidenceFolder).where(EvidenceFolder.incident_id == inc_id))
        await db.execute(delete(Job).where(Job.incident_id == inc_id))
        await db.execute(delete(Incident).where(Incident.id == inc_id))
    for dev_id in ALL_DEVICE_IDS:
        from sqlalchemy import delete as _del
        from app.models.device import Device as _Dev
        await db.execute(_del(_Dev).where(_Dev.id == dev_id))
    for col_id in ALL_COLLECTOR_IDS:
        await db.execute(delete(Collector).where(Collector.id == col_id))
    await db.commit()
    print("[clean] Removed existing mock-active records.")


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

async def seed_all(clean: bool = False) -> None:
    evidence_base = Path(os.environ.get("EVIDENCE_STORAGE_PATH", "/vault/evidence"))

    async with AsyncSessionLocal() as db:
        if clean:
            await _clean(db)

        # Collectors
        for col in _NEW_COLLECTORS:
            if await db.get(Collector, col["id"]):
                print(f"[skip] Collector {col['id']} already exists")
                continue
            db.add(Collector(
                id=col["id"],
                name=col["name"],
                endpoint=col["endpoint"],
                status=col["status"],
                last_heartbeat=_NOW - timedelta(minutes=_HEARTBEAT_AGE[col["status"]]),
            ))
        await db.commit()
        print(f"[ok] {len(_NEW_COLLECTORS)} collectors seeded")

        # Extra devices (populate device list)
        for d in _EXTRA_DEVICES:
            if await db.get(Device, d["device_id"]):
                continue
            db.add(Device(
                id=d["device_id"], hostname=d["hostname"], ip_address=d["ip"],
                type=d["type"], os=d["os"], agent_version="1.3.0",
                status="online", collection_status="idle",
                last_seen=_NOW - timedelta(minutes=5),
                registered_at=_NOW - timedelta(days=30),
            ))
        await db.commit()

        # APT NIGHTFALL devices
        for h in _APT_HOSTS:
            if await db.get(Device, h["device_id"]):
                continue
            db.add(Device(
                id=h["device_id"], hostname=h["hostname"], ip_address=h["ip"],
                type=h["type"], os=h["os"], agent_version="1.3.0",
                status="online", collection_status="complete",
                last_seen=_NOW - timedelta(minutes=3),
                registered_at=_NOW - timedelta(days=15),
            ))
        await db.commit()

        # APT NIGHTFALL incident
        if not await db.get(Incident, _APT_INCIDENT_ID):
            db.add(Incident(
                id=_APT_INCIDENT_ID, type="apt", status="COLLECTION_COMPLETE",
                target_endpoints=[h["hostname"] for h in _APT_HOSTS],
                operator="admin", collection_progress=100, collection_phase=None,
                created_at=_NOW - timedelta(days=2),
            ))
        await db.commit()

        # Jobs + processing jobs for APT NIGHTFALL
        for h in _APT_HOSTS:
            if not await db.get(Job, h["job_id"]):
                db.add(Job(
                    id=h["job_id"], incident_id=_APT_INCIDENT_ID, agent_id=h["device_id"],
                    status="COMPLETED",
                    modules=[{"id": "windows_logs"}, {"id": "windows_artifacts"}],
                    output_path=str(evidence_base / _APT_INCIDENT_ID / h["hostname"]),
                    created_at=_NOW - timedelta(days=2, hours=2),
                ))
            if not await db.get(ProcessingJob, h["proc_job_id"]):
                db.add(ProcessingJob(
                    id=h["proc_job_id"], incident_id=_APT_INCIDENT_ID,
                    job_id=h["job_id"],
                    status="DONE", phase="complete",
                    started_at=_NOW - timedelta(days=2),
                    completed_at=_NOW - timedelta(days=1, hours=22),
                ))
        await db.commit()

        # Evidence folders for APT NIGHTFALL
        for ef in _APT_EVIDENCE_FOLDERS:
            if not await db.get(EvidenceFolder, ef["id"]):
                db.add(EvidenceFolder(
                    id=ef["id"], incident_id=ef["incident_id"], type=ef["type"],
                    date=_NOW.strftime("%Y-%m-%d"),
                    files_count=ef["files_count"], total_size=ef["total_size"],
                    status=ef["status"],
                ))
        await db.commit()
        print(f"[ok] INC-APT-NIGHTFALL incident + devices + jobs seeded")

        # Active incidents
        for inc in _ACTIVE_INCIDENTS:
            if await db.get(Incident, inc["id"]):
                print(f"[skip] {inc['id']} already exists")
                continue
            db.add(Incident(
                id=inc["id"], type=inc["type"], status=inc["status"],
                target_endpoints=inc["target_endpoints"],
                operator="admin",
                collection_progress=inc["collection_progress"],
                collection_phase=inc["collection_phase"],
                created_at=_NOW - timedelta(days=inc["age_days"], hours=3),
            ))
        await db.commit()
        print(f"[ok] {len(_ACTIVE_INCIDENTS)} active incidents seeded")

        # Write timeline.jsonl files — path expected by super_timeline_service:
        # {evidence_base}/{incident_id}/{proc_job_id}/timeline/timeline.jsonl
        for h in _APT_HOSTS:
            hostname = h["hostname"]
            fn = _EVENTS_BY_HOST[hostname]
            events = fn()
            tl_dir = evidence_base / _APT_INCIDENT_ID / h["job_id"] / "timeline"
            tl_dir.mkdir(parents=True, exist_ok=True)
            jsonl_path = tl_dir / "timeline.jsonl"
            with jsonl_path.open("w") as fh:
                for ev in events:
                    fh.write(json.dumps(ev) + "\n")
            print(f"[ok] {len(events)} events → {jsonl_path}")

    # Build super timeline (outside the session — opens its own DB connections)
    print("[...] Building super timeline for INC-APT-NIGHTFALL ...")
    await build_super_timeline_background(_APT_INCIDENT_ID, evidence_base)

    print("\n=== seed_mock_active complete ===")
    print(f"  New collectors : {len(_NEW_COLLECTORS)}  (GAMMA=ONLINE, DELTA=DEGRADED, ECHO=OFFLINE)")
    print(f"  New incidents  : {len(_ACTIVE_INCIDENTS) + 1}")
    print(f"    INC-APT-NIGHTFALL       COLLECTION_COMPLETE  (super timeline built)")
    print(f"    INC-RANSOM-TEMPEST      COLLECTING           65%")
    print(f"    INC-BREACH-TIDE         ANALYZING            100%")
    print(f"    INC-INSIDER-FROST       PENDING              0%")
    print(f"    INC-MALWARE-STORM       COLLECTING           40%")
    print(f"    INC-APT-AURORA          CLOSED")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Seed mock collectors + active incidents")
    p.add_argument("--clean", action="store_true", help="Delete existing mock-active records first")
    args = p.parse_args()
    asyncio.run(seed_all(clean=args.clean))
