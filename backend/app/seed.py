import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models import (
    IncidentTemplate,
    SystemSettings,
    User,
)


async def seed_data(session: AsyncSession) -> None:
    admin_password = os.getenv("DFIR_DEFAULT_ADMIN_PASSWORD") or "admin123!"

    users = [
        User(
            id="seed-admin",
            username="admin",
            role="admin",
            status="active",
            last_login="-",
            created_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            password_hash=get_password_hash(admin_password),
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
            created_at=datetime.now(timezone.utc),
            created_by="admin",
            usage_count=0,
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
            created_at=datetime.now(timezone.utc),
            created_by="admin",
            usage_count=0,
        ),
    ]

    settings = SystemSettings(
        id="1",
        evidence_storage_path="/vault/evidence",
        max_file_size_gb=10,
        hash_algorithm="SHA-256",
        collection_timeout_min=30,
        max_concurrent_jobs=5,
        concurrency_limit=4,
        retry_attempts=3,
        session_timeout_min=15,
        max_failed_logins=5,
        log_retention_days=365,
        export_format="ZIP",
        ez_tools_path=None,
        chainsaw_path=None,
        hayabusa_path=None,
        sigma_rules_path=None,
        yara_rules_path=None,
        timesketch_url=None,
        timesketch_token=None,
        auto_process=False,
    )

    session.add_all(users)
    await session.flush()
    session.add_all(templates)
    session.add(settings)
