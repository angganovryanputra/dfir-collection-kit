from sqlalchemy import select
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
    user = User(**data, password_hash=get_password_hash(password))
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
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def delete_user(db: AsyncSession, user_id: str) -> bool:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return False
    await db.delete(user)
    await db.flush()
    return True
