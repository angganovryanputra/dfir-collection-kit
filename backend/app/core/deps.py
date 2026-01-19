from typing import AsyncGenerator

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decode_access_token
from app.crud.user import get_user_by_username
from app.db.session import AsyncSessionLocal
from app.models.user import User

security_scheme = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not settings.REQUIRE_AUTH:
        user = await get_user_by_username(db, "ADMIN")
        if user:
            return user
        raise HTTPException(status_code=401, detail="Auth disabled but user missing")
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    subject = payload.get("sub")
    if not subject:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await get_user_by_username(db, str(subject))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.status.lower() != "active":
        raise HTTPException(status_code=403, detail="User is not active")
    return user


def require_roles(*roles: str):
    async def _require_roles(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return _require_roles
