import time
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

# Simple in-memory per-IP rate limiter (GIL-safe for single-process deployments)
_IP_WINDOW_SEC = 60        # sliding window length
_IP_MAX_ATTEMPTS = 20      # max login attempts per IP per window
_ip_attempt_log: dict[str, list[float]] = defaultdict(list)

# Periodic full-sweep to prevent unbounded growth from IPs that never return
_CLEANUP_INTERVAL_SEC = 300   # sweep every 5 minutes
_last_cleanup: float = 0.0


def _check_ip_rate_limit(client_ip: str) -> None:
    """Raise 429 if the IP has exceeded the login rate limit."""
    global _last_cleanup
    now = time.monotonic()

    # Periodic full-dict sweep: drop IPs whose entry list is empty after pruning
    if now - _last_cleanup > _CLEANUP_INTERVAL_SEC:
        stale = [ip for ip, ts in _ip_attempt_log.items() if not any(now - t < _IP_WINDOW_SEC for t in ts)]
        for ip in stale:
            del _ip_attempt_log[ip]
        _last_cleanup = now

    times = _ip_attempt_log[client_ip]
    # Evict entries outside the sliding window
    times[:] = [t for t in times if now - t < _IP_WINDOW_SEC]
    times.append(now)
    if len(times) > _IP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Please wait before trying again.",
            headers={"Retry-After": str(_IP_WINDOW_SEC)},
        )

from app.core.deps import get_current_user, get_db
from app.core.security import create_access_token, verify_password
from app.crud.audit_log import count_recent_login_failures
from app.crud.user import get_user_by_username, update_last_login
from app.models.user import User
from app.schemas.auth import LoginRequest, Token
from app.schemas.user import RoleEnum
from app.services.audit_log_service import safe_record_event
from app.services.system_settings_service import get_runtime_settings

router = APIRouter()


@router.post("/login", response_model=Token)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Token:
    runtime_settings = await get_runtime_settings(db)
    forwarded = request.headers.get("X-Forwarded-For", "")
    forwarded_ip = forwarded.split(",")[0].strip() if forwarded else ""
    client_ip = forwarded_ip or (request.client.host if request.client else "unknown")
    _check_ip_rate_limit(client_ip)
    user = await get_user_by_username(db, payload.username)
    normalized_username = payload.username.strip().lower()
    if user and runtime_settings.max_failed_logins > 0:
        # Use a rolling window based on log retention for failed login attempts.
        window_days = max(runtime_settings.log_retention_days, 1)
        failure_count = await count_recent_login_failures(db, user.username, window_days)
        if failure_count >= runtime_settings.max_failed_logins:
            await safe_record_event(
                db,
                event_type="auth.login_failure",
                actor_type="user",
                actor_id=normalized_username,
                source="backend",
                action="login attempt",
                target_type="auth",
                target_id=None,
                status="failure",
                message="Login blocked",
            metadata={"reason": "max_failed_logins", "client_ip": client_ip},
            )
            raise HTTPException(
                status_code=403,
                detail={"message": "Login failed. Please check your credentials.", "client_ip": client_ip},
            )
    if not user or not verify_password(payload.password, user.password_hash):
        await safe_record_event(
            db,
            event_type="auth.login_failure",
            actor_type="user",
            actor_id=normalized_username,
            source="backend",
            action="login attempt",
            target_type="auth",
            target_id=None,
            status="failure",
            message="Login failed",
            metadata={"reason": "invalid_credentials", "client_ip": client_ip},
        )
        raise HTTPException(
            status_code=401,
            detail={"message": "Login failed. Please check your credentials.", "client_ip": client_ip},
        )
    if user.status.lower() != "active":
        await safe_record_event(
            db,
            event_type="auth.login_failure",
            actor_type="user",
            actor_id=normalized_username,
            source="backend",
            action="login attempt",
            target_type="auth",
            target_id=None,
            status="failure",
            message="Login blocked",
            metadata={"reason": "user_inactive", "client_ip": client_ip},
        )
        raise HTTPException(
            status_code=403,
            detail={"message": "Login failed. Please check your credentials.", "client_ip": client_ip},
        )
    if payload.role and user.role != "admin" and payload.role != user.role:
        await safe_record_event(
            db,
            event_type="auth.login_failure",
            actor_type="user",
            actor_id=normalized_username,
            source="backend",
            action="login attempt",
            target_type="auth",
            target_id=None,
            status="failure",
            message="Login blocked",
            metadata={
                "reason": "role_mismatch",
                "selected_role": payload.role,
                "client_ip": client_ip,
            },
        )
        raise HTTPException(
            status_code=403,
            detail={"message": "Role selection does not match account role.", "client_ip": client_ip},
        )
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
        metadata={"username": user.username, "role": user.role, "client_ip": client_ip},
    )
    token, expires_at = create_access_token(
        user.username,
        expires_delta=timedelta(minutes=runtime_settings.session_timeout_min),
        claims={"user_id": user.id, "role": user.role, "username": user.username},
    )
    return Token(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        username=user.username,
        role=RoleEnum(user.role),
        expires_at=expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
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
