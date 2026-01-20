from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.security import create_access_token, verify_password
from app.crud.user import get_user_by_username, update_last_login
from app.models.user import User
from app.schemas.auth import LoginRequest, Token
from app.schemas.user import RoleEnum
from app.services.audit_log_service import safe_record_event

router = APIRouter()


@router.post("/login", response_model=Token)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> Token:
    user = await get_user_by_username(db, payload.username.upper())
    if not user or not verify_password(payload.password, user.password_hash):
        await safe_record_event(
            db,
            event_type="auth.login_failure",
            actor_type="user",
            actor_id=payload.username.upper(),
            source="backend",
            action="login attempt",
            target_type="auth",
            target_id=None,
            status="failure",
            message="Login failed",
            metadata={"reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.status.lower() != "active":
        await safe_record_event(
            db,
            event_type="auth.login_failure",
            actor_type="user",
            actor_id=user.id,
            source="backend",
            action="login attempt",
            target_type="auth",
            target_id=None,
            status="failure",
            message="Login blocked",
            metadata={"reason": "user_inactive"},
        )
        raise HTTPException(status_code=403, detail="User is not active")
    await update_last_login(db, user.id)
    await safe_record_event(
        db,
        event_type="auth.login_success",
        actor_type="user",
        actor_id=user.id,
        source="backend",
        action="login",
        target_type="auth",
        target_id=None,
        status="success",
        message="Login succeeded",
        metadata={"username": user.username, "role": user.role},
    )
    token, expires_at = create_access_token(
        user.username,
        claims={"user_id": user.id, "role": user.role, "username": user.username},
    )
    return Token(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        username=user.username,
        role=RoleEnum(user.role),
        expires_at=expires_at.isoformat() + "Z",
    )


@router.post("/logout", status_code=204)
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await safe_record_event(
        db,
        event_type="auth.logout",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="logout",
        target_type="auth",
        target_id=None,
        status="success",
        message="Logout succeeded",
        metadata={"username": current_user.username},
    )
    return None
