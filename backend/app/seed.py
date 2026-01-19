import os
import secrets
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models import (
    ChainOfCustodyEntry,
    Collector,
    Device,
    EvidenceFolder,
    EvidenceItem,
    Incident,
    IncidentTemplate,
    SystemSettings,
    User,
)


def parse_dt(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


async def seed_data(session: AsyncSession) -> None:
    default_password = os.getenv("DFIR_SEED_PASSWORD")
    if not default_password:
        default_password = secrets.token_urlsafe(16)
    password_hash = get_password_hash(default_password)
    if not os.getenv("DFIR_SEED_PASSWORD"):
        print(f"Seed password: {default_password}")

    users = [
        User(
            id="1",
            username="J.SMITH",
            role="operator",
            status="active",
            last_login="2025-01-09T10:30:00Z",
            created_at="2024-06-15T08:00:00Z",
            password_hash=password_hash,
        ),
        User(
            id="2",
            username="M.CHEN",
            role="operator",
            status="active",
            last_login="2025-01-08T16:45:00Z",
            created_at="2024-07-20T10:00:00Z",
            password_hash=password_hash,
        ),
        User(
            id="3",
            username="K.JOHNSON",
            role="viewer",
            status="active",
            last_login="2025-01-09T09:00:00Z",
            created_at="2024-09-01T14:00:00Z",
            password_hash=password_hash,
        ),
        User(
            id="4",
            username="ADMIN",
            role="admin",
            status="active",
            last_login="2025-01-09T08:00:00Z",
            created_at="2024-01-01T00:00:00Z",
            password_hash=password_hash,
        ),
        User(
            id="5",
            username="R.WILLIAMS",
            role="operator",
            status="locked",
            last_login="2025-01-05T12:00:00Z",
            created_at="2024-08-10T09:00:00Z",
            password_hash=password_hash,
        ),
    ]

    incidents = [
        Incident(
            id="INC-2025-0142",
            type="RANSOMWARE",
            status="COLLECTION_IN_PROGRESS",
            target_endpoints=["WS-FINANCE-01", "WS-FINANCE-02"],
            operator="J.SMITH",
            created_at=parse_dt("2025-01-09T08:30:00Z"),
            updated_at=parse_dt("2025-01-09T09:15:00Z"),
        ),
        Incident(
            id="INC-2025-0141",
            type="ACCOUNT_COMPROMISE",
            status="COLLECTION_COMPLETE",
            target_endpoints=["DC-PRIMARY"],
            operator="M.CHEN",
            created_at=parse_dt("2025-01-08T14:20:00Z"),
            updated_at=parse_dt("2025-01-08T16:45:00Z"),
        ),
        Incident(
            id="INC-2025-0140",
            type="DATA_EXFILTRATION",
            status="ACTIVE",
            target_endpoints=["SRV-DB-01"],
            operator="K.JOHNSON",
            created_at=parse_dt("2025-01-09T10:00:00Z"),
            updated_at=parse_dt("2025-01-09T10:00:00Z"),
        ),
        Incident(
            id="INC-2025-0139",
            type="MALWARE",
            status="CLOSED",
            target_endpoints=["WS-HR-01"],
            operator="J.SMITH",
            created_at=parse_dt("2025-01-07T09:00:00Z"),
            updated_at=parse_dt("2025-01-07T15:00:00Z"),
        ),
    ]

    devices = [
        Device(
            id="DEV-001",
            hostname="WS-FINANCE-01",
            ip_address="192.168.1.101",
            type="workstation",
            os="Windows 11 Pro",
            agent_version="2.1.0",
            status="online",
            last_seen="2026-01-14T17:15:00Z",
            cpu_usage=23,
            memory_usage=67,
            collection_status="idle",
            registered_at="2025-06-15T08:00:00Z",
        ),
        Device(
            id="DEV-002",
            hostname="WS-FINANCE-02",
            ip_address="192.168.1.102",
            type="workstation",
            os="Windows 11 Pro",
            agent_version="2.1.0",
            status="online",
            last_seen="2026-01-14T17:14:30Z",
            cpu_usage=45,
            memory_usage=72,
            collection_status="collecting",
            registered_at="2025-06-15T08:30:00Z",
        ),
        Device(
            id="DEV-003",
            hostname="SRV-DB-01",
            ip_address="192.168.1.10",
            type="server",
            os="Windows Server 2022",
            agent_version="2.1.0",
            status="online",
            last_seen="2026-01-14T17:15:00Z",
            cpu_usage=12,
            memory_usage=45,
            collection_status="idle",
            registered_at="2025-05-01T10:00:00Z",
        ),
    ]

    templates = [
        IncidentTemplate(
            id="TPL-001",
            name="RANSOMWARE STANDARD",
            incident_type="RANSOMWARE",
            default_endpoints=["DC-01", "FILE-SERVER-01"],
            description="Standard ransomware response template for enterprise environments",
            preflight_checklist=[
                "Isolate affected systems from network",
                "Notify security operations center",
                "Preserve initial evidence state",
                "Document ransom note if present",
            ],
            created_at=parse_dt("2024-01-15T08:00:00Z"),
            created_by="ADMIN",
            usage_count=24,
        ),
        IncidentTemplate(
            id="TPL-002",
            name="ACCOUNT TAKEOVER",
            incident_type="ACCOUNT_COMPROMISE",
            default_endpoints=["EXCHANGE-01", "AD-DC-01"],
            description="Response template for compromised user account incidents",
            preflight_checklist=[
                "Reset affected account credentials",
                "Check for mailbox forwarding rules",
                "Review recent login activity",
                "Notify affected user",
            ],
            created_at=parse_dt("2024-01-20T10:30:00Z"),
            created_by="SOC-OPS",
            usage_count=18,
        ),
    ]

    evidence_folders = [
        EvidenceFolder(
            id="1",
            incident_id="INC-2025-0142",
            type="RANSOMWARE",
            date="2025-01-09",
            files_count=47,
            total_size="2.4 GB",
            status="HASH_VERIFIED",
        ),
        EvidenceFolder(
            id="2",
            incident_id="INC-2025-0141",
            type="ACCOUNT_COMPROMISE",
            date="2025-01-08",
            files_count=32,
            total_size="1.8 GB",
            status="LOCKED",
        ),
    ]

    evidence_items = [
        EvidenceItem(
            id="1",
            incident_id="INC-2025-0142",
            name="memory_dump.raw",
            type="Memory Dump",
            size="1.2 GB",
            status="HASH_VERIFIED",
            hash="a3f2b8c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
            collected_at="2025-01-09T09:15:00Z",
        ),
    ]

    custody = [
        ChainOfCustodyEntry(
            id="1",
            incident_id="INC-2025-0142",
            timestamp="2025-01-09T10:45:23Z",
            action="EVIDENCE EXPORTED",
            actor="J.SMITH",
            target="INC-2025-0142_full_package.zip",
        ),
        ChainOfCustodyEntry(
            id="2",
            incident_id="INC-2025-0142",
            timestamp="2025-01-09T09:30:12Z",
            action="HASH VERIFICATION COMPLETE",
            actor="SYSTEM",
            target="All artifacts (47 files)",
        ),
    ]

    collectors = [
        Collector(
            id="COL-01",
            name="COLLECTOR-ALPHA",
            endpoint="https://col-alpha.internal:8443",
            status="online",
            last_heartbeat="2025-01-09T10:30:00Z",
        ),
        Collector(
            id="COL-02",
            name="COLLECTOR-BRAVO",
            endpoint="https://col-bravo.internal:8443",
            status="online",
            last_heartbeat="2025-01-09T10:30:00Z",
        ),
        Collector(
            id="COL-03",
            name="COLLECTOR-CHARLIE",
            endpoint="https://col-charlie.internal:8443",
            status="online",
            last_heartbeat="2025-01-09T10:28:00Z",
        ),
        Collector(
            id="COL-04",
            name="COLLECTOR-DELTA",
            endpoint="https://col-delta.internal:8443",
            status="offline",
            last_heartbeat="2025-01-09T08:15:00Z",
        ),
    ]

    settings = SystemSettings(
        id="1",
        evidence_storage_path="/vault/evidence",
        max_file_size_gb=10,
        hash_algorithm="SHA-256",
        collection_timeout_min=30,
        max_concurrent_jobs=5,
        retry_attempts=3,
        session_timeout_min=15,
        max_failed_logins=5,
        log_retention_days=365,
        export_format="JSON",
    )

    session.add_all(users)
    session.add_all(incidents)
    await session.flush()
    session.add_all(devices)
    session.add_all(templates)
    session.add_all(evidence_folders)
    session.add_all(evidence_items)
    session.add_all(custody)
    session.add_all(collectors)
    session.add(settings)
