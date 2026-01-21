from datetime import datetime
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.core.security import get_password_hash


async def list_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.username.asc()))
    return list(result.scalars().all())


async def create_user(db: AsyncSession, payload: UserCreate) -> User:
    data = payload.model_dump()
    password = data.pop("password")
    username = data.get("username", "").strip().lower()
    user = User(
        id=str(uuid4()),
        username=username,
        role=data.get("role"),
        status=data.get("status"),
        last_login="-",
        created_at=datetime.utcnow().isoformat() + "Z",
        password_hash=get_password_hash(password),
    )
    db.add(user)
    await db.flush()
    return user


async def update_user(db: AsyncSession, user_id: str, payload: UserUpdate) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return None
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(user, key, value)
    await db.flush()
    return user


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    normalized = username.strip().lower()
    result = await db.execute(select(User).where(func.lower(User.username) == normalized))
    return result.scalar_one_or_none()


async def get_user(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def count_admins(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User).where(User.role == "admin"))
    return int(result.scalar_one())


async def update_last_login(db: AsyncSession, user_id: str) -> None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return
    user.last_login = datetime.utcnow().isoformat() + "Z"
    await db.flush()


async def delete_user(db: AsyncSession, user_id: str) -> bool:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return False
    await db.delete(user)
    await db.flush()
    return True
