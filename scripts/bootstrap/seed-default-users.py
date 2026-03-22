import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
BACKEND_PATH = ROOT / "backend"

sys.path.append(str(BACKEND_PATH))

from app.core.security import get_password_hash  # noqa: E402
from app.crud.user import get_user_by_username  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.audit_log_service import safe_record_event  # noqa: E402


DEFAULT_USERS = [
    {
        "username": "admin",
        "role": "admin",
        "env": "DFIR_DEFAULT_ADMIN_PASSWORD",
        "default_password": "admin123!",
    },
]


async def ensure_user(db, *, username: str, role: str, password: str) -> tuple[User, bool]:
    normalized = username.strip().lower()
    existing = await get_user_by_username(db, normalized)
    if existing:
        return existing, False
    now = datetime.utcnow().isoformat() + "Z"
    user = User(
        id=str(uuid4()),
        username=normalized,
        role=role,
        status="active",
        last_login="-",
        created_at=now,
        password_hash=get_password_hash(password),
    )
    db.add(user)
    await db.flush()
    return user, True


async def main() -> None:
    created = []
    existing = []
    async with AsyncSessionLocal() as db:
        for entry in DEFAULT_USERS:
            password = os.getenv(entry["env"], entry["default_password"])
            user, was_created = await ensure_user(
                db,
                username=entry["username"],
                role=entry["role"],
                password=password,
            )
            if was_created:
                created.append(user.username)
            else:
                existing.append(user.username)
        await db.commit()
        await safe_record_event(
            db,
            event_type="default_users_seeded",
            actor_type="system",
            actor_id="seed-script",
            source="backend",
            action="seed default users",
            target_type="user",
            target_id=None,
            status="success",
            message="Default users ensured",
            metadata={"created": created, "existing": existing},
        )

    print("Default user seeding complete.")
    if created:
        print(f"Created: {', '.join(created)}")
    if existing:
        print(f"Already present: {', '.join(existing)}")


if __name__ == "__main__":
    asyncio.run(main())
