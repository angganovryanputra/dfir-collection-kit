from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    claims: dict | None = None,
) -> tuple[str, datetime]:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode = {"sub": subject, "exp": expire}
    if claims:
        to_encode.update(claims)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM), expire


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
    hasher = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()
