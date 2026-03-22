from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib
import hmac

import bcrypt
import jwt
from jwt import InvalidTokenError  # noqa: F401 — re-exported for deps.py

from app.core.config import settings

ALGORITHM = "HS256"


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
    to_encode: dict = {"sub": subject, "exp": expire}
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
