"""
Webhook notification service for pipeline and collection events.

Sends HTTP POST callbacks to a configured webhook_url when key events occur.
All functions are fire-and-forget (errors are logged, never propagated).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

_WEBHOOK_TIMEOUT_S = 10.0


async def _post_webhook(webhook_url: str, payload: dict[str, Any]) -> None:
    """POST payload to webhook_url. Errors are swallowed after logging."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=_WEBHOOK_TIMEOUT_S) as client:
            resp = await client.post(webhook_url, json=payload)
            if resp.status_code >= 400:
                logger.warning(
                    "Webhook %s returned HTTP %d: %s",
                    webhook_url,
                    resp.status_code,
                    resp.text[:200],
                )
    except ImportError:
        logger.debug("httpx not installed — webhook delivery skipped")
    except Exception as exc:
        logger.warning("Webhook delivery to %s failed: %s", webhook_url, exc)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def notify_pipeline_complete(
    incident_id: str,
    job_id: str,
    sigma_hits: int,
    ioc_matches: int,
    webhook_url: str | None,
) -> None:
    """Fire webhook after the processing pipeline completes successfully."""
    if not webhook_url:
        return
    payload = {
        "event": "pipeline_complete",
        "incident_id": incident_id,
        "job_id": job_id,
        "sigma_hits": sigma_hits,
        "ioc_matches": ioc_matches,
        "timestamp": _now_iso(),
    }
    await _post_webhook(webhook_url, payload)


async def notify_pipeline_failed(
    incident_id: str,
    job_id: str,
    error: str,
    webhook_url: str | None,
) -> None:
    """Fire webhook when the processing pipeline fails."""
    if not webhook_url:
        return
    payload = {
        "event": "pipeline_failed",
        "incident_id": incident_id,
        "job_id": job_id,
        "error": error[:500],
        "timestamp": _now_iso(),
    }
    await _post_webhook(webhook_url, payload)


async def notify_super_timeline_complete(
    incident_id: str,
    host_count: int,
    event_count: int,
    webhook_url: str | None,
) -> None:
    """Fire webhook when the super timeline build finishes."""
    if not webhook_url:
        return
    payload = {
        "event": "super_timeline_complete",
        "incident_id": incident_id,
        "host_count": host_count,
        "event_count": event_count,
        "timestamp": _now_iso(),
    }
    await _post_webhook(webhook_url, payload)


async def notify_critical_sigma_hit(
    incident_id: str,
    job_id: str,
    rule_name: str,
    severity: str,
    webhook_url: str | None,
) -> None:
    """Fire webhook when a critical/high Sigma rule is triggered."""
    if not webhook_url:
        return
    payload = {
        "event": "sigma_alert",
        "incident_id": incident_id,
        "job_id": job_id,
        "rule_name": rule_name,
        "severity": severity,
        "timestamp": _now_iso(),
    }
    await _post_webhook(webhook_url, payload)
