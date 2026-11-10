"""
Threat Intelligence enrichment endpoint (R-12).

Enriches IOCs using configured threat intel feeds:
  - VirusTotal v3 API (hashes, IPs, domains, URLs)
  - MISP REST search (all types)

Requires environment variables:
  VIRUSTOTAL_API_KEY   — free or premium VT API key
  MISP_URL             — base URL of your MISP instance
  MISP_API_KEY         — MISP automation key

If a service is not configured its result is returned with found=False and
an explanatory error string — the endpoint never raises 500 for missing creds.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import threading
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user, require_roles
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

_HASH_RE = re.compile(r"^[0-9a-fA-F]{32,64}$")
_IP_RE = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")
_DOMAIN_RE = re.compile(r"^[a-zA-Z0-9._\-]{3,253}$")
# URLs are base64-encoded before being placed in the VT path, so only length is bounded.
_URL_MAX_LEN = 2048

_IOC_VALIDATORS = {"hash": _HASH_RE, "ip": _IP_RE, "domain": _DOMAIN_RE}


def _validate_ioc(ioc_type: str, ioc_value: str) -> None:
    """Reject malformed IOC values before they reach outbound API URLs."""
    if ioc_type == "url":
        if not (1 <= len(ioc_value) <= _URL_MAX_LEN) or any(c in ioc_value for c in "\r\n\x00"):
            raise HTTPException(status_code=422, detail="Invalid URL IOC value")
        return
    pattern = _IOC_VALIDATORS.get(ioc_type)
    if pattern is None:
        raise HTTPException(status_code=422, detail=f"Unsupported ioc_type: {ioc_type}")
    if not pattern.match(ioc_value):
        raise HTTPException(status_code=422, detail=f"Invalid {ioc_type} IOC value format")


class EnrichRequest(BaseModel):
    ioc_type: str  # hash | ip | domain | url
    ioc_value: str
    services: list[str] = []  # ["virustotal","misp"] or [] = all configured


class EnrichResult(BaseModel):
    ioc_type: str
    ioc_value: str
    service: str
    found: bool
    score: int | None = None
    labels: list[str] = []
    permalink: str | None = None
    raw: dict[str, Any] | None = None
    error: str | None = None


# ── Threat Intel Cache Layer (24h TTL) ────────────────────────────────────────

THREAT_INTEL_CACHE_TTL = 86400  # 24 hours in seconds

_memory_cache: dict[str, tuple[float, str]] = {}
_memory_cache_lock = threading.Lock()
_redis_client: Any = None


def _threat_intel_cache_key(service: str, ioc_type: str, ioc_value: str) -> str:
    return f"threat_intel:{service}:{ioc_type}:{ioc_value.strip().lower()}"


def _get_memory_cache(key: str) -> EnrichResult | None:
    now = time.time()
    with _memory_cache_lock:
        if key in _memory_cache:
            expires_at, data = _memory_cache[key]
            if now < expires_at:
                try:
                    return EnrichResult.model_validate_json(data)
                except Exception:
                    pass
            _memory_cache.pop(key, None)
    return None


def _set_memory_cache(key: str, result: EnrichResult) -> None:
    now = time.time()
    with _memory_cache_lock:
        _memory_cache[key] = (now + THREAT_INTEL_CACHE_TTL, result.model_dump_json())


async def _get_redis_client() -> Any:
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        try:
            from app.core.config import settings

            redis_url = settings.REDIS_URL
        except Exception:
            redis_url = ""

    if not redis_url:
        return None

    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(
            redis_url,
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
        )
        await client.ping()
        _redis_client = client
        return _redis_client
    except Exception as exc:
        logger.warning(
            "Redis connection to %s failed, using in-memory cache fallback: %s", redis_url, exc
        )
        _redis_client = None
        return None


async def _get_cached_enrichment(service: str, ioc_type: str, ioc_value: str) -> EnrichResult | None:
    key = _threat_intel_cache_key(service, ioc_type, ioc_value)
    client = await _get_redis_client()
    if client is not None:
        try:
            cached_val = await client.get(key)
            if cached_val:
                return EnrichResult.model_validate_json(cached_val)
        except Exception as exc:
            logger.warning("Redis GET error for %s, falling back to memory: %s", key, exc)

    return _get_memory_cache(key)


async def _set_cached_enrichment(
    service: str, ioc_type: str, ioc_value: str, result: EnrichResult
) -> None:
    key = _threat_intel_cache_key(service, ioc_type, ioc_value)
    _set_memory_cache(key, result)

    client = await _get_redis_client()
    if client is not None:
        try:
            payload = result.model_dump_json()
            if hasattr(client, "setex"):
                await client.setex(key, THREAT_INTEL_CACHE_TTL, payload)
            else:
                await client.set(key, payload, ex=THREAT_INTEL_CACHE_TTL)
        except Exception as exc:
            logger.warning("Redis SETEX error for %s: %s", key, exc)


async def _async_clear_threat_intel_cache() -> None:
    with _memory_cache_lock:
        _memory_cache.clear()
    client = await _get_redis_client()
    if client is not None:
        try:
            if hasattr(client, "keys"):
                keys = await client.keys("threat_intel:*")
            elif hasattr(client, "scan_iter"):
                keys = [k async for k in client.scan_iter("threat_intel:*")]
            else:
                keys = []
            if keys:
                await client.delete(*keys)
        except Exception as exc:
            logger.warning("Error clearing Redis threat intel cache: %s", exc)


def clear_threat_intel_cache() -> Any:
    """Clear threat intel cache (both Redis and in-memory). Works in sync and async contexts."""
    with _memory_cache_lock:
        _memory_cache.clear()
    try:
        loop = asyncio.get_running_loop()
        return loop.create_task(_async_clear_threat_intel_cache())
    except RuntimeError:
        return asyncio.run(_async_clear_threat_intel_cache())


@router.post("/enrich", response_model=list[EnrichResult])
async def enrich_ioc(
    payload: EnrichRequest,
    _: User = Depends(require_roles("operator", "admin")),
) -> list[EnrichResult]:
    """Enrich a single IOC against all configured threat intel services."""
    payload.ioc_value = payload.ioc_value.strip()
    _validate_ioc(payload.ioc_type, payload.ioc_value)
    services = payload.services or ["virustotal", "misp"]
    results: list[EnrichResult] = []
    for svc in services:
        cached = await _get_cached_enrichment(svc, payload.ioc_type, payload.ioc_value)
        if cached is not None:
            results.append(cached)
            continue

        res: EnrichResult | None = None
        if svc == "virustotal":
            res = await _vt_enrich(payload.ioc_type, payload.ioc_value)
        elif svc == "misp":
            res = await _misp_enrich(payload.ioc_type, payload.ioc_value)

        if res is not None:
            await _set_cached_enrichment(svc, payload.ioc_type, payload.ioc_value, res)
            results.append(res)
    return results


@router.get("/enrich/hash/{file_hash}", response_model=list[EnrichResult])
async def enrich_hash(
    file_hash: str,
    current_user: User = Depends(require_roles("operator", "admin")),
) -> list[EnrichResult]:
    if not _HASH_RE.match(file_hash):
        raise HTTPException(
            status_code=422, detail="Invalid hash format (MD5/SHA1/SHA256 expected)"
        )
    return await enrich_ioc(EnrichRequest(ioc_type="hash", ioc_value=file_hash), current_user)


@router.get("/enrich/ip/{ip_address}", response_model=list[EnrichResult])
async def enrich_ip(
    ip_address: str,
    current_user: User = Depends(require_roles("operator", "admin")),
) -> list[EnrichResult]:
    if not _IP_RE.match(ip_address):
        raise HTTPException(status_code=422, detail="Invalid IP address format")
    return await enrich_ioc(EnrichRequest(ioc_type="ip", ioc_value=ip_address), current_user)


@router.get("/enrich/domain/{domain}", response_model=list[EnrichResult])
async def enrich_domain(
    domain: str,
    current_user: User = Depends(require_roles("operator", "admin")),
) -> list[EnrichResult]:
    if not _DOMAIN_RE.match(domain):
        raise HTTPException(status_code=422, detail="Invalid domain format")
    return await enrich_ioc(EnrichRequest(ioc_type="domain", ioc_value=domain), current_user)


# ── VirusTotal v3 ─────────────────────────────────────────────────────────────


async def _vt_enrich(ioc_type: str, ioc_value: str) -> EnrichResult:
    import os

    api_key = os.getenv("VIRUSTOTAL_API_KEY", "")
    if not api_key:
        return EnrichResult(
            ioc_type=ioc_type,
            ioc_value=ioc_value,
            service="virustotal",
            found=False,
            error="VIRUSTOTAL_API_KEY not configured",
        )
    path_map = {
        "hash": f"/files/{ioc_value}",
        "ip": f"/ip_addresses/{ioc_value}",
        "domain": f"/domains/{ioc_value}",
    }
    try:
        import httpx

        base = "https://www.virustotal.com/api/v3"
        headers = {"x-apikey": api_key}
        if ioc_type == "url":
            import base64 as _b64

            url_id = _b64.urlsafe_b64encode(ioc_value.encode()).decode().rstrip("=")
            vt_url = f"{base}/urls/{url_id}"
        elif ioc_type in path_map:
            vt_url = base + path_map[ioc_type]
        else:
            return EnrichResult(
                ioc_type=ioc_type,
                ioc_value=ioc_value,
                service="virustotal",
                found=False,
                error=f"Unsupported ioc_type: {ioc_type}",
            )

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(vt_url, headers=headers)

        if resp.status_code == 404:
            return EnrichResult(
                ioc_type=ioc_type, ioc_value=ioc_value, service="virustotal", found=False
            )
        if resp.status_code != 200:
            return EnrichResult(
                ioc_type=ioc_type,
                ioc_value=ioc_value,
                service="virustotal",
                found=False,
                error=f"VT HTTP {resp.status_code}: {resp.text[:100]}",
            )

        data = resp.json()
        attrs = data.get("data", {}).get("attributes", {})
        stats = attrs.get("last_analysis_stats", {})
        malicious = int(stats.get("malicious", 0))
        total = max(sum(stats.values()), 1)
        score = int(malicious / total * 100)
        label = attrs.get("popular_threat_classification", {}).get("suggested_threat_label", "")
        labels = [l for l in label.split("/") if l] if label else []
        entity = "file" if ioc_type == "hash" else ioc_type
        permalink = f"https://www.virustotal.com/gui/{entity}/{ioc_value}"
        return EnrichResult(
            ioc_type=ioc_type,
            ioc_value=ioc_value,
            service="virustotal",
            found=True,
            score=score,
            labels=labels,
            permalink=permalink,
            raw={
                "malicious": malicious,
                "total": int(total),
                "harmless": int(stats.get("harmless", 0)),
            },
        )
    except ImportError:
        return EnrichResult(
            ioc_type=ioc_type,
            ioc_value=ioc_value,
            service="virustotal",
            found=False,
            error="httpx not installed",
        )
    except Exception as exc:
        logger.warning("VirusTotal lookup failed (%s): %s", ioc_value, exc)
        return EnrichResult(
            ioc_type=ioc_type,
            ioc_value=ioc_value,
            service="virustotal",
            found=False,
            error=str(exc)[:200],
        )


# ── MISP ──────────────────────────────────────────────────────────────────────


async def _misp_enrich(ioc_type: str, ioc_value: str) -> EnrichResult:
    import os

    misp_url = os.getenv("MISP_URL", "")
    misp_key = os.getenv("MISP_API_KEY", "")
    if not misp_url or not misp_key:
        return EnrichResult(
            ioc_type=ioc_type,
            ioc_value=ioc_value,
            service="misp",
            found=False,
            error="MISP_URL or MISP_API_KEY not configured",
        )
    type_map = {"hash": "sha256", "ip": "ip-dst", "domain": "domain", "url": "url"}
    if ioc_type not in type_map:
        return EnrichResult(
            ioc_type=ioc_type,
            ioc_value=ioc_value,
            service="misp",
            found=False,
            error=f"Unsupported ioc_type: {ioc_type}",
        )
    try:
        import httpx

        headers = {
            "Authorization": misp_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        body = {"value": ioc_value, "type": type_map[ioc_type], "limit": 10, "returnFormat": "json"}
        verify_tls = os.getenv("MISP_VERIFY_TLS", "true").lower() not in ("false", "0", "no")
        async with httpx.AsyncClient(timeout=15.0, verify=verify_tls) as client:
            resp = await client.post(
                f"{misp_url.rstrip('/')}/attributes/restSearch", json=body, headers=headers
            )
        if resp.status_code != 200:
            return EnrichResult(
                ioc_type=ioc_type,
                ioc_value=ioc_value,
                service="misp",
                found=False,
                error=f"MISP HTTP {resp.status_code}",
            )
        attrs = resp.json().get("response", {}).get("Attribute", [])
        if not attrs:
            return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="misp", found=False)
        categories = list({a.get("category", "") for a in attrs if a.get("category")})
        tags = list({t.get("name", "") for a in attrs for t in a.get("Tag", []) if t.get("name")})
        return EnrichResult(
            ioc_type=ioc_type,
            ioc_value=ioc_value,
            service="misp",
            found=True,
            score=min(len(attrs) * 15, 100),
            labels=categories + tags,
            permalink=f"{misp_url}/attributes/search",
            raw={"event_count": len(attrs)},
        )
    except ImportError:
        return EnrichResult(
            ioc_type=ioc_type,
            ioc_value=ioc_value,
            service="misp",
            found=False,
            error="httpx not installed",
        )
    except Exception as exc:
        logger.warning("MISP lookup failed (%s): %s", ioc_value, exc)
        return EnrichResult(
            ioc_type=ioc_type,
            ioc_value=ioc_value,
            service="misp",
            found=False,
            error=str(exc)[:200],
        )
