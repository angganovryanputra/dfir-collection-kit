"""
AI-Assisted Event Annotation and Analysis (R-6).

Requires env vars: LLM_API_URL, LLM_API_KEY, LLM_MODEL
  - Point LLM_API_URL to http://localhost:11434/v1 + LLM_API_KEY=ollama for local Ollama.
  - Any OpenAI-compatible endpoint works (OpenAI, Azure OpenAI, LM Studio, etc.)

Endpoints:
  POST /ai/annotate          — annotate timeline events with MITRE ATT&CK
  POST /ai/summary/{id}      — generate executive summary for an incident
  POST /ai/query             — answer natural-language questions about evidence
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.models.user import User
from app.services.system_settings_service import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Provider → default API URL (all providers expose OpenAI-compatible /chat/completions)
_PROVIDER_DEFAULTS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "openrouter": "https://openrouter.ai/api/v1",
    "ollama": "http://localhost:11434/v1",
}

_PROVIDER_DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-sonnet-4-6",
    "gemini": "gemini-2.0-flash",
    "openrouter": "openai/gpt-4o-mini",
    "ollama": "llama3",
}


async def _google_get_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    try:
        import httpx
    except ImportError:
        raise RuntimeError("httpx not installed")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Token refresh failed: {resp.text[:200]}")
    return resp.json()["access_token"]


async def _llm_cfg(db: AsyncSession) -> tuple[str, str, str]:
    """Resolve LLM config: DB settings take precedence over env vars."""
    try:
        s = await get_settings(db)
        provider = s.ai_provider or os.getenv("AI_PROVIDER", "openai")
        model = s.ai_model or os.getenv("LLM_MODEL") or _PROVIDER_DEFAULT_MODELS.get(provider, "gpt-4o-mini")
        if provider == "gemini" and s.google_oauth_refresh_token and s.google_oauth_client_id and s.google_oauth_client_secret:
            try:
                access_token = await _google_get_access_token(
                    s.google_oauth_client_id,
                    s.google_oauth_client_secret,
                    s.google_oauth_refresh_token,
                )
                url = s.ai_api_url or _PROVIDER_DEFAULTS["gemini"]
                return url, access_token, model
            except Exception as exc:
                logger.warning("Google OAuth token refresh failed: %s", exc)
        api_key = s.ai_api_key or os.getenv("LLM_API_KEY", "")
        url = s.ai_api_url or os.getenv("LLM_API_URL") or _PROVIDER_DEFAULTS.get(provider, "https://api.openai.com/v1")
        return url, api_key, model
    except Exception:
        return (
            os.getenv("LLM_API_URL", "https://api.openai.com/v1"),
            os.getenv("LLM_API_KEY", ""),
            os.getenv("LLM_MODEL", "gpt-4o-mini"),
        )


async def _chat(system: str, user: str, max_tokens: int = 1024, db: AsyncSession | None = None) -> str:
    if db is None:
        raise HTTPException(status_code=503, detail="DB session required for AI config")
    url, key, model = await _llm_cfg(db)
    if not key:
        raise HTTPException(status_code=503, detail="AI API key not configured — set it in Settings → AI Config")
    try:
        import httpx
    except ImportError:
        raise HTTPException(status_code=503, detail="httpx not installed")

    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{url.rstrip('/')}/chat/completions",
            json=body,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"LLM error {resp.status_code}: {resp.text[:200]}")
    return resp.json()["choices"][0]["message"]["content"]


# ── Event Annotation ──────────────────────────────────────────────────────────

class AnnotateRequest(BaseModel):
    events: list[dict[str, Any]]
    max_events: int = 20


class AnnotatedEvent(BaseModel):
    original: dict[str, Any]
    mitre_technique: str | None = None
    mitre_tactic: str | None = None
    description: str | None = None
    severity: str | None = None


@router.get("/config")
async def get_ai_config(
    _: User = Depends(require_roles("admin", "operator")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return current AI provider config (keys masked)."""
    try:
        s = await get_settings(db)
        provider = s.ai_provider or os.getenv("AI_PROVIDER", "openai")
        model = s.ai_model or os.getenv("LLM_MODEL") or _PROVIDER_DEFAULT_MODELS.get(provider, "gpt-4o-mini")
        return {
            "provider": provider,
            "model": model,
            "api_url": s.ai_api_url or os.getenv("LLM_API_URL") or _PROVIDER_DEFAULTS.get(provider, ""),
            "api_key_set": bool(s.ai_api_key or os.getenv("LLM_API_KEY")),
            "google_oauth_client_id": s.google_oauth_client_id or "",
            "google_oauth_connected": bool(s.google_oauth_refresh_token),
            "default_url": _PROVIDER_DEFAULTS.get(provider, ""),
        }
    except Exception:
        return {"provider": "openai", "model": "gpt-4o-mini", "api_key_set": False, "google_oauth_connected": False}


class GoogleOAuthExchangeRequest(BaseModel):
    code: str
    redirect_uri: str
    code_verifier: str


@router.post("/oauth/google/exchange", dependencies=[Depends(require_roles("admin", "operator"))])
async def google_oauth_exchange(
    payload: GoogleOAuthExchangeRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Exchange Google OAuth authorization code for refresh token and store in settings."""
    try:
        import httpx
    except ImportError:
        raise HTTPException(status_code=503, detail="httpx not installed")

    s = await get_settings(db)
    if not s.google_oauth_client_id or not s.google_oauth_client_secret:
        raise HTTPException(status_code=400, detail="Google OAuth client_id/client_secret not configured in Settings")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": s.google_oauth_client_id,
                "client_secret": s.google_oauth_client_secret,
                "code": payload.code,
                "redirect_uri": payload.redirect_uri,
                "code_verifier": payload.code_verifier,
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Google token exchange failed: {resp.text[:200]}")

    token_data = resp.json()
    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=502, detail="Google did not return a refresh_token — ensure 'access_type=offline' was sent")

    s.google_oauth_refresh_token = refresh_token
    await db.commit()
    return {"connected": True, "scope": token_data.get("scope", "")}


@router.delete("/oauth/google/disconnect", dependencies=[Depends(require_roles("admin", "operator"))])
async def google_oauth_disconnect(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Remove stored Google OAuth refresh token."""
    s = await get_settings(db)
    s.google_oauth_refresh_token = None
    await db.commit()
    return {"connected": False}


# ── Event Annotation ──────────────────────────────────────────────────────────

@router.post("/annotate", response_model=list[AnnotatedEvent])
async def annotate_events(
    payload: AnnotateRequest,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AnnotatedEvent]:
    """Annotate timeline events with MITRE ATT&CK technique IDs and severity."""
    events = payload.events[: payload.max_events]
    if not events:
        return []

    system = (
        "You are a DFIR analyst. Annotate each event in the JSON array. "
        "Return a JSON array of the same length, each element with: "
        "mitre_technique (e.g. T1059.001 or null), "
        "mitre_tactic (e.g. Execution or null), "
        "description (1 sentence, what's significant about this event), "
        "severity (low | medium | high | critical). "
        "Return ONLY valid JSON, no markdown fences, no explanation."
    )
    sanitized = [{k: str(v)[:200] for k, v in e.items()} for e in events]
    user = json.dumps(sanitized, indent=2)[:6000]

    raw = await _chat(system, user, max_tokens=2048, db=db)
    try:
        raw_clean = raw.strip()
        if raw_clean.startswith("```"):
            raw_clean = raw_clean.split("\n", 1)[-1].rsplit("```", 1)[0]
        annotations: list[dict] = json.loads(raw_clean)
        if not isinstance(annotations, list):
            raise ValueError("Expected JSON array")
    except Exception as exc:
        logger.warning("AI annotation parse error: %s | raw=%s", exc, raw[:300])
        raise HTTPException(status_code=502, detail=f"Failed to parse LLM response: {exc}") from exc

    return [
        AnnotatedEvent(
            original=ev,
            mitre_technique=annotations[i].get("mitre_technique") if i < len(annotations) else None,
            mitre_tactic=annotations[i].get("mitre_tactic") if i < len(annotations) else None,
            description=annotations[i].get("description") if i < len(annotations) else None,
            severity=annotations[i].get("severity") if i < len(annotations) else None,
        )
        for i, ev in enumerate(events)
    ]


# ── Executive Summary ─────────────────────────────────────────────────────────

@router.post("/summary/{incident_id}")
async def generate_summary(
    incident_id: str,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate an executive summary of the incident's super timeline using an LLM."""
    import pathlib
    from app.core.config import settings as app_settings

    db_path = pathlib.Path(app_settings.EVIDENCE_STORAGE_PATH) / incident_id / "timeline" / "super_timeline.duckdb"
    sample: list[dict] = []

    if db_path.exists():
        def _fetch(p: pathlib.Path) -> list[dict]:
            import duckdb
            con = duckdb.connect(str(p), read_only=True)
            try:
                rows = con.execute(
                    "SELECT datetime, source, host, message FROM events "
                    "ORDER BY datetime NULLS LAST LIMIT 40"
                ).fetchall()
                return [{"dt": str(r[0]), "src": r[1], "host": r[2], "msg": str(r[3])[:200]} for r in rows]
            finally:
                con.close()
        try:
            sample = await asyncio.to_thread(_fetch, db_path)
        except Exception as exc:
            logger.debug("Timeline fetch for summary failed: %s", exc)

    system = (
        "You are a senior DFIR analyst writing an executive summary for a security incident. "
        "Write 3-5 paragraphs: (1) what happened, (2) likely attack vector and techniques, "
        "(3) most critical findings with timestamps, (4) recommended immediate containment. "
        "Use professional, third-person past tense. Be specific."
    )
    context = json.dumps(sample, indent=2) if sample else "No timeline data available yet."
    user = f"Incident: {incident_id}\n\nTimeline sample ({len(sample)} events):\n{context}"

    _, _, model = await _llm_cfg(db)
    summary = await _chat(system, user, max_tokens=1200, db=db)
    return {"incident_id": incident_id, "summary": summary, "sample_events": len(sample), "model": model}


# ── Natural Language Query ────────────────────────────────────────────────────

class NLQueryRequest(BaseModel):
    incident_id: str
    question: str
    context_limit: int = 25


@router.post("/query")
async def nl_query(
    payload: NLQueryRequest,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Answer a natural-language question about an incident's collected evidence."""
    import pathlib
    from app.core.config import settings as app_settings

    db_path = pathlib.Path(app_settings.EVIDENCE_STORAGE_PATH) / payload.incident_id / "timeline" / "super_timeline.duckdb"
    context: list[dict] = []

    if db_path.exists():
        def _get(p: pathlib.Path, q: str, limit: int) -> list[dict]:
            import duckdb
            safe_q = q.replace("'", "''")[:80]
            con = duckdb.connect(str(p), read_only=True)
            try:
                rows = con.execute(
                    f"SELECT datetime, source, host, message FROM events "
                    f"WHERE CAST(message AS VARCHAR) ILIKE '%{safe_q}%' "
                    f"ORDER BY datetime NULLS LAST LIMIT {limit}"
                ).fetchall()
                if not rows:
                    rows = con.execute(
                        f"SELECT datetime, source, host, message FROM events "
                        f"ORDER BY datetime NULLS LAST LIMIT {limit}"
                    ).fetchall()
                return [{"dt": str(r[0]), "src": r[1], "host": r[2], "msg": str(r[3])[:300]} for r in rows]
            finally:
                con.close()
        try:
            context = await asyncio.to_thread(_get, db_path, payload.question, payload.context_limit)
        except Exception as exc:
            logger.debug("Context fetch failed: %s", exc)

    system = (
        "You are a DFIR analyst assistant. Answer concisely based on provided evidence. "
        "Cite event timestamps and hostnames when relevant. If evidence is insufficient, say so."
    )
    user = (
        f"Question: {payload.question}\n\n"
        f"Evidence ({len(context)} events):\n"
        f"{json.dumps(context, indent=2) if context else 'No timeline data available.'}"
    )

    _, _, model = await _llm_cfg(db)
    answer = await _chat(system, user, max_tokens=600, db=db)
    return {
        "incident_id": payload.incident_id,
        "question": payload.question,
        "answer": answer,
        "context_events": len(context),
        "model": model,
    }
