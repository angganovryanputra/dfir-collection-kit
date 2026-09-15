"""Trusted request metadata supplied by the internal reverse proxy."""

from __future__ import annotations

import ipaddress

from fastapi import Request


def _valid_ip(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def get_client_ip(request: Request) -> str:
    """Return the IP normalized by nginx, falling back safely to the peer IP.

    The Docker backend has no host port and nginx overwrites ``X-Real-IP`` for
    every proxied request. Deliberately do not consume raw X-Forwarded-For:
    clients can supply that header themselves and must not influence audit or
    rate-limit identity.
    """
    return _valid_ip(request.headers.get("X-Real-IP")) or (
        request.client.host if request.client else "unknown"
    )


def is_secure_transport(request: Request) -> bool:
    """Return whether the trusted reverse proxy terminated HTTPS."""
    return request.headers.get("X-Forwarded-Proto", request.url.scheme).lower() == "https"
