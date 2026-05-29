from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib
import hmac
import threading
import time
from uuid import uuid4

import bcrypt
import jwt
from jwt import InvalidTokenError  # noqa: F401 — re-exported for deps.py

from app.core.config import settings

ALGORITHM = "HS256"

# ─────────────────────────────────────────────────────────────────────────────
# In-memory JWT revocation list
#
# Stores (jti → expiry_unix_timestamp) for tokens that have been explicitly
# revoked via the logout endpoint.  Expired entries are swept periodically.
#
# NOTE: For multi-worker deployments (uvicorn --workers N) this list is
# per-process.  Migrate to a Redis SET with per-entry TTL for full coverage.
# ─────────────────────────────────────────────────────────────────────────────
_revoked_jtis: dict[str, float] = {}
_revoked_lock = threading.Lock()
_REVOKED_CLEANUP_INTERVAL_SEC = 3600
_last_revoked_cleanup: float = 0.0


def revoke_token(jti: str, exp: float) -> None:
    """Add the given JTI to the revocation list until it expires."""
    global _last_revoked_cleanup
    with _revoked_lock:
        _revoked_jtis[jti] = exp
        now = time.time()
        if now - _last_revoked_cleanup > _REVOKED_CLEANUP_INTERVAL_SEC:
            expired = [j for j, e in _revoked_jtis.items() if e <= now]
            for j in expired:
                del _revoked_jtis[j]
            _last_revoked_cleanup = now


def is_token_revoked(jti: str) -> bool:
    """Return True if the token has been explicitly revoked and has not yet expired."""
    now = time.time()
    with _revoked_lock:
        exp = _revoked_jtis.get(jti)
        if exp is None:
            return False
        if exp <= now:
            del _revoked_jtis[jti]
            return False
        return True


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    claims: dict | None = None,
) -> tuple[str, datetime]:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    jti = uuid4().hex  # unique per-token ID for revocation tracking
    to_encode: dict = {"sub": subject, "exp": expire, "jti": jti}
    if claims:
        to_encode.update(claims)
    token = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return token, expire


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


def compute_chain_hash(
    incident_id: str,
    sequence: int,
    timestamp: str,
    action: str,
    actor: str,
    target: str,
    previous_hash: str | None,
) -> str:
    payload = "|".join(
        [
            incident_id,
            str(sequence),
            timestamp,
            action,
            actor,
            target,
            previous_hash or "",
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def compute_export_signature(path: str) -> str:
    """HMAC-SHA256 of the file content, keyed by SECRET_KEY.

    Unlike a plain SHA-256 hash, an HMAC signature cannot be forged by
    anyone who does not possess the server's secret key, even if they
    have a copy of the file.
    """
    mac = hmac.new(settings.SECRET_KEY.encode(), digestmod=hashlib.sha256)
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            mac.update(chunk)
    return mac.hexdigest()
