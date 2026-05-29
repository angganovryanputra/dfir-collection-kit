"""
Case Management Integrations (R-13): TheHive · Jira · Slack.

Environment variables (configure in .env):
  THEHIVE_URL, THEHIVE_API_KEY   — TheHive 5 case creation
  JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY — Jira issue creation
  SLACK_WEBHOOK_URL              — Slack incoming webhook
"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


class ExportResult(BaseModel):
    service: str
    success: bool
    external_id: str | None = None
    url: str | None = None
    error: str | None = None


async def _incident_summary(incident_id: str, db: AsyncSession) -> dict[str, Any]:
    from app.crud.incident import get_incident
    incident = await get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    sigma: dict[str, int] = {}
    try:
        from app.crud.analytics import count_sigma_hits_by_severity
        sigma = await count_sigma_hits_by_severity(db, incident_id)
    except Exception:
        pass
    return {
        "id": incident.id,
        "type": incident.type,
        "status": incident.status,
        "operator": incident.operator,
        "targets": incident.target_endpoints,
        "created_at": incident.created_at.isoformat() if incident.created_at else "",
        "sigma": sigma,
        "sigma_total": sum(sigma.values()),
    }


@router.post("/export/thehive/{incident_id}", response_model=ExportResult)
async def export_to_thehive(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _cu: User = Depends(get_current_user),
) -> ExportResult:
    url = os.getenv("THEHIVE_URL", "")
    key = os.getenv("THEHIVE_API_KEY", "")
    if not url or not key:
        return ExportResult(service="thehive", success=False, error="THEHIVE_URL or THEHIVE_API_KEY not configured")

    inc = await _incident_summary(incident_id, db)
    sev = max(1, min(4, inc["sigma_total"] // 5 + 1))
    body = {
        "title": f"[DFIR] {inc['type']} — {incident_id}",
        "description": (
            f"Incident: {incident_id}\nOperator: {inc['operator']}\n"
            f"Targets: {', '.join(inc['targets'])}\nSigma: {inc['sigma_total']} hits\n"
            f"Status: {inc['status']}"
        ),
        "severity": sev,
        "flag": inc["sigma_total"] > 0,
        "tags": ["dfir", inc["type"].lower()],
    }
    try:
        import httpx
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            resp = await client.post(f"{url.rstrip('/')}/api/v1/case", json=body, headers=headers)
        if resp.status_code not in (200, 201):
            return ExportResult(service="thehive", success=False, error=f"HTTP {resp.status_code}: {resp.text[:150]}")
        data = resp.json()
        cid = data.get("_id") or data.get("id", "")
        return ExportResult(service="thehive", success=True, external_id=cid,
                            url=f"{url}/cases/{cid}/details" if cid else None)
    except ImportError:
        return ExportResult(service="thehive", success=False, error="httpx not installed")
    except Exception as exc:
        return ExportResult(service="thehive", success=False, error=str(exc)[:200])


@router.post("/export/jira/{incident_id}", response_model=ExportResult)
async def export_to_jira(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _cu: User = Depends(get_current_user),
) -> ExportResult:
    jira_url = os.getenv("JIRA_URL", "")
    jira_email = os.getenv("JIRA_EMAIL", "")
    jira_token = os.getenv("JIRA_API_TOKEN", "")
    project = os.getenv("JIRA_PROJECT_KEY", "DFIR")
    if not jira_url or not jira_email or not jira_token:
        return ExportResult(service="jira", success=False, error="JIRA_URL/JIRA_EMAIL/JIRA_API_TOKEN not configured")

    inc = await _incident_summary(incident_id, db)
    priority = "Highest" if inc["sigma_total"] > 20 else "High" if inc["sigma_total"] > 5 else "Medium"
    body = {
        "fields": {
            "project": {"key": project},
            "summary": f"[DFIR] {inc['type']} — {incident_id}",
            "description": {
                "type": "doc", "version": 1,
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": (
                    f"Incident {incident_id} | Operator: {inc['operator']} | "
                    f"Targets: {', '.join(inc['targets'])} | "
                    f"Sigma: {inc['sigma_total']} hits | Status: {inc['status']}"
                )}]}],
            },
            "issuetype": {"name": "Bug"},
            "priority": {"name": priority},
            "labels": ["dfir", "security"],
        }
    }
    try:
        import httpx, base64
        auth = base64.b64encode(f"{jira_email}:{jira_token}".encode()).decode()
        headers = {"Authorization": f"Basic {auth}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(f"{jira_url.rstrip('/')}/rest/api/3/issue", json=body, headers=headers)
        if resp.status_code not in (200, 201):
            return ExportResult(service="jira", success=False, error=f"HTTP {resp.status_code}: {resp.text[:150]}")
        key_val = resp.json().get("key", "")
        return ExportResult(service="jira", success=True, external_id=key_val,
                            url=f"{jira_url}/browse/{key_val}" if key_val else None)
    except ImportError:
        return ExportResult(service="jira", success=False, error="httpx not installed")
    except Exception as exc:
        return ExportResult(service="jira", success=False, error=str(exc)[:200])


@router.post("/notify/slack/{incident_id}", response_model=ExportResult)
async def notify_slack(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _cu: User = Depends(get_current_user),
) -> ExportResult:
    webhook = os.getenv("SLACK_WEBHOOK_URL", "")
    if not webhook:
        return ExportResult(service="slack", success=False, error="SLACK_WEBHOOK_URL not configured")

    inc = await _incident_summary(incident_id, db)
    crit = inc["sigma"].get("critical", 0)
    emoji = ":rotating_light:" if crit > 0 else ":warning:" if inc["sigma_total"] > 0 else ":white_check_mark:"
    msg = {
        "text": f"{emoji} DFIR Alert — Incident `{incident_id}`",
        "blocks": [
            {"type": "header", "text": {"type": "plain_text", "text": f"{emoji} DFIR Incident: {incident_id}"}},
            {"type": "section", "fields": [
                {"type": "mrkdwn", "text": f"*Type:*\n{inc['type']}"},
                {"type": "mrkdwn", "text": f"*Status:*\n{inc['status']}"},
                {"type": "mrkdwn", "text": f"*Operator:*\n{inc['operator']}"},
                {"type": "mrkdwn", "text": f"*Sigma Hits:*\n{inc['sigma_total']} ({crit} critical)"},
                {"type": "mrkdwn", "text": f"*Targets:*\n{', '.join(inc['targets']) or '—'}"},
            ]},
        ],
    }
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook, json=msg)
        if resp.status_code != 200:
            return ExportResult(service="slack", success=False, error=f"HTTP {resp.status_code}: {resp.text[:100]}")
        return ExportResult(service="slack", success=True)
    except ImportError:
        return ExportResult(service="slack", success=False, error="httpx not installed")
    except Exception as exc:
        return ExportResult(service="slack", success=False, error=str(exc)[:200])


@router.post("/export/all/{incident_id}", response_model=list[ExportResult])
async def export_all(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    cu: User = Depends(get_current_user),
) -> list[ExportResult]:
    """Push to all configured case management services simultaneously."""
    import asyncio as _aio
    return list(await _aio.gather(
        export_to_thehive(incident_id, db, cu),
        export_to_jira(incident_id, db, cu),
        notify_slack(incident_id, db, cu),
    ))
