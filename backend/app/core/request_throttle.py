"""Lightweight per-IP throttles for expensive authenticated operations.

SlowAPI provides the application-wide limit.  This module deliberately adds a
small in-process second limit for endpoints that trigger exports, uploads, or
cross-event scans. It is dependency-free and safe when Redis is unavailable.
"""

from __future__ import annotations

import time
from collections import defaultdict

from fastapi import HTTPException, Request

from app.core.request_context import get_client_ip

_WINDOW_SECONDS = 60
_requests: dict[tuple[str, str], list[float]] = defaultdict(list)
_last_cleanup = 0.0


def enforce_expensive_operation_limit(request: Request, operation: str, limit: int = 12) -> None:
    """Allow ``limit`` calls/IP/minute for an explicitly named costly action."""
    global _last_cleanup
    now = time.monotonic()
    if now - _last_cleanup >= 300:
        stale = [
            key
            for key, values in _requests.items()
            if not any(now - item < _WINDOW_SECONDS for item in values)
        ]
        for key in stale:
            del _requests[key]
        _last_cleanup = now

    key = (operation, get_client_ip(request))
    values = _requests[key]
    values[:] = [item for item in values if now - item < _WINDOW_SECONDS]
    if len(values) >= limit:
        raise HTTPException(
            status_code=429,
            detail="Too many requests for this expensive operation. Please wait before retrying.",
            headers={"Retry-After": str(_WINDOW_SECONDS)},
        )
    values.append(now)
