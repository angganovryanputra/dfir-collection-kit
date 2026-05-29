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

from app.core.deps import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


def _llm_cfg() -> tuple[str, str, str]:
    return (
        os.getenv("LLM_API_URL", "https://api.openai.com/v1"),
        os.getenv("LLM_API_KEY", ""),
        os.getenv("LLM_MODEL", "gpt-4o-mini"),
    )


async def _chat(system: str, user: str, max_tokens: int = 1024) -> str:
    url, key, model = _llm_cfg()
    if not key:
        raise HTTPException(status_code=503, detail="LLM_API_KEY not configured — set it in .env")
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


@router.post("/annotate", response_model=list[AnnotatedEvent])
async def annotate_events(
    payload: AnnotateRequest,
    _: User = Depends(get_current_user),
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

    raw = await _chat(system, user, max_tokens=2048)
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

    summary = await _chat(system, user, max_tokens=1200)
    return {"incident_id": incident_id, "summary": summary, "sample_events": len(sample), "model": _llm_cfg()[2]}


# ── Natural Language Query ────────────────────────────────────────────────────

class NLQueryRequest(BaseModel):
    incident_id: str
    question: str
    context_limit: int = 25


@router.post("/query")
async def nl_query(
    payload: NLQueryRequest,
    _: User = Depends(get_current_user),
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

    answer = await _chat(system, user, max_tokens=600)
    return {
        "incident_id": payload.incident_id,
        "question": payload.question,
        "answer": answer,
        "context_events": len(context),
        "model": _llm_cfg()[2],
    }
