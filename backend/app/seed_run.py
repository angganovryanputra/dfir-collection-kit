import asyncio

from sqlalchemy import select

from app.db.base import Base
from app.db.session import AsyncSessionLocal, engine
from app.models import User
from app.seed import seed_data


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
            return
        except Exception as exc:
            last_error = exc
            await asyncio.sleep(2)

    if last_error:
        raise last_error


if __name__ == "__main__":
    asyncio.run(init_db())
