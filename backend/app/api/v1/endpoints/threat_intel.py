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

import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

_HASH_RE = re.compile(r"^[0-9a-fA-F]{32,64}$")
_IP_RE = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")
_DOMAIN_RE = re.compile(r"^[a-zA-Z0-9._\-]{3,253}$")


class EnrichRequest(BaseModel):
    ioc_type: str           # hash | ip | domain | url
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


@router.post("/enrich", response_model=list[EnrichResult])
async def enrich_ioc(
    payload: EnrichRequest,
    _: User = Depends(get_current_user),
) -> list[EnrichResult]:
    """Enrich a single IOC against all configured threat intel services."""
    services = payload.services or ["virustotal", "misp"]
    results: list[EnrichResult] = []
    for svc in services:
        if svc == "virustotal":
            results.append(await _vt_enrich(payload.ioc_type, payload.ioc_value))
        elif svc == "misp":
            results.append(await _misp_enrich(payload.ioc_type, payload.ioc_value))
    return results


@router.get("/enrich/hash/{file_hash}", response_model=list[EnrichResult])
async def enrich_hash(
    file_hash: str,
    current_user: User = Depends(get_current_user),
) -> list[EnrichResult]:
    if not _HASH_RE.match(file_hash):
        raise HTTPException(status_code=422, detail="Invalid hash format (MD5/SHA1/SHA256 expected)")
    return await enrich_ioc(EnrichRequest(ioc_type="hash", ioc_value=file_hash), current_user)


@router.get("/enrich/ip/{ip_address}", response_model=list[EnrichResult])
async def enrich_ip(
    ip_address: str,
    current_user: User = Depends(get_current_user),
) -> list[EnrichResult]:
    if not _IP_RE.match(ip_address):
        raise HTTPException(status_code=422, detail="Invalid IP address format")
    return await enrich_ioc(EnrichRequest(ioc_type="ip", ioc_value=ip_address), current_user)


@router.get("/enrich/domain/{domain}", response_model=list[EnrichResult])
async def enrich_domain(
    domain: str,
    current_user: User = Depends(get_current_user),
) -> list[EnrichResult]:
    if not _DOMAIN_RE.match(domain):
        raise HTTPException(status_code=422, detail="Invalid domain format")
    return await enrich_ioc(EnrichRequest(ioc_type="domain", ioc_value=domain), current_user)


# ── VirusTotal v3 ─────────────────────────────────────────────────────────────

async def _vt_enrich(ioc_type: str, ioc_value: str) -> EnrichResult:
    import os
    api_key = os.getenv("VIRUSTOTAL_API_KEY", "")
    if not api_key:
        return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="virustotal",
                            found=False, error="VIRUSTOTAL_API_KEY not configured")
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
            return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="virustotal",
                                found=False, error=f"Unsupported ioc_type: {ioc_type}")

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(vt_url, headers=headers)

        if resp.status_code == 404:
            return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="virustotal", found=False)
        if resp.status_code != 200:
            return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="virustotal",
                                found=False, error=f"VT HTTP {resp.status_code}: {resp.text[:100]}")

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
            ioc_type=ioc_type, ioc_value=ioc_value, service="virustotal",
            found=True, score=score, labels=labels, permalink=permalink,
            raw={"malicious": malicious, "total": int(total), "harmless": int(stats.get("harmless", 0))},
        )
    except ImportError:
        return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="virustotal",
                            found=False, error="httpx not installed")
    except Exception as exc:
        logger.warning("VirusTotal lookup failed (%s): %s", ioc_value, exc)
        return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="virustotal",
                            found=False, error=str(exc)[:200])


# ── MISP ──────────────────────────────────────────────────────────────────────

async def _misp_enrich(ioc_type: str, ioc_value: str) -> EnrichResult:
    import os
    misp_url = os.getenv("MISP_URL", "")
    misp_key = os.getenv("MISP_API_KEY", "")
    if not misp_url or not misp_key:
        return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="misp",
                            found=False, error="MISP_URL or MISP_API_KEY not configured")
    type_map = {"hash": "sha256", "ip": "ip-dst", "domain": "domain", "url": "url"}
    if ioc_type not in type_map:
        return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="misp",
                            found=False, error=f"Unsupported ioc_type: {ioc_type}")
    try:
        import httpx
        headers = {"Authorization": misp_key, "Accept": "application/json", "Content-Type": "application/json"}
        body = {"value": ioc_value, "type": type_map[ioc_type], "limit": 10, "returnFormat": "json"}
        async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
            resp = await client.post(f"{misp_url.rstrip('/')}/attributes/restSearch", json=body, headers=headers)
        if resp.status_code != 200:
            return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="misp",
                                found=False, error=f"MISP HTTP {resp.status_code}")
        attrs = resp.json().get("response", {}).get("Attribute", [])
        if not attrs:
            return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="misp", found=False)
        categories = list({a.get("category", "") for a in attrs if a.get("category")})
        tags = list({t.get("name", "") for a in attrs for t in a.get("Tag", []) if t.get("name")})
        return EnrichResult(
            ioc_type=ioc_type, ioc_value=ioc_value, service="misp",
            found=True, score=min(len(attrs) * 15, 100),
            labels=categories + tags,
            permalink=f"{misp_url}/attributes/search",
            raw={"event_count": len(attrs)},
        )
    except ImportError:
        return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="misp",
                            found=False, error="httpx not installed")
    except Exception as exc:
        logger.warning("MISP lookup failed (%s): %s", ioc_value, exc)
        return EnrichResult(ioc_type=ioc_type, ioc_value=ioc_value, service="misp",
                            found=False, error=str(exc)[:200])
