import asyncio
import logging
import os

from sqlalchemy import select

from app.db.base import Base
from app.db.session import AsyncSessionLocal, engine
from app.models import User
from app.seed import seed_data

logger = logging.getLogger(__name__)


async def _sync_admin_password(session: AsyncSessionLocal) -> None:  # type: ignore[valid-type]
    """Update admin password from env var on every startup.

    Allows operators to reset the admin password by setting
    DFIR_DEFAULT_ADMIN_PASSWORD and restarting the container.
    """
    admin_password = os.getenv("DFIR_DEFAULT_ADMIN_PASSWORD")
    if not admin_password:
        return

    from app.core.security import get_password_hash, verify_password

    result = await session.execute(select(User).where(User.username == "admin"))
    admin = result.scalar_one_or_none()
    if admin is None:
        return

    if verify_password(admin_password, admin.password_hash):
        return  # already matches, nothing to do

    admin.password_hash = get_password_hash(admin_password)
    await session.commit()
    logger.info("[seed_run] Admin password updated from DFIR_DEFAULT_ADMIN_PASSWORD")


async def init_db() -> None:
    last_error: Exception | None = None
    for _ in range(30):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

            async with AsyncSessionLocal() as session:
                result = await session.execute(select(User).limit(1))
                if result.scalar_one_or_none() is None:
                    await seed_data(session)
                    await session.commit()

            async with AsyncSessionLocal() as session:
                await _sync_admin_password(session)
            break
        except Exception as exc:
            last_error = exc
            await asyncio.sleep(2)
    else:
        if last_error:
            raise last_error

    if os.environ.get("SEED_DEMO_DATA", "").lower() == "true":
        from app.seed_demo import seed_all
        print("[seed_run] SEED_DEMO_DATA=true — seeding demo data …")
        await seed_all()


if __name__ == "__main__":
    asyncio.run(init_db())
