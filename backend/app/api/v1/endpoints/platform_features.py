"""Platform feature endpoints: custom modules, attack hypotheses, scheduled
collections, threat hunt queries, legal holds, cross-incident correlation,
and SIEM export.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.models.platform_features import (
    AttackHypothesis,
    CustomModule,
    LegalHold,
    ScheduledCollection,
    ThreatHuntQuery,
)
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# Security validators (shared)
# ─────────────────────────────────────────────────────────────────────────────

# Incident/module IDs from user input — same pattern as agents.py
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{1,128}$")

# Cron expression: 5-field standard format (minute hour dom month dow)
_CRON_RE = re.compile(
    r"^"
    r"(\*|[0-9]{1,2}|\*/[0-9]{1,2}|[0-9]{1,2}-[0-9]{1,2}(,[0-9]{1,2})*)\s+"
    r"(\*|[0-9]{1,2}|\*/[0-9]{1,2}|[0-9]{1,2}-[0-9]{1,2}(,[0-9]{1,2})*)\s+"
    r"(\*|[0-9]{1,2}|\*/[0-9]{1,2}|[0-9]{1,2}-[0-9]{1,2}(,[0-9]{1,2})*)\s+"
    r"(\*|[0-9]{1,2}|\*/[0-9]{1,2}|[0-9]{1,2}-[0-9]{1,2}(,[0-9]{1,2})*)\s+"
    r"(\*|[0-6]|\*/[0-6]|[0-6]-[0-6](,[0-6])*)"
    r"$"
)

# DuckDB operations that would allow reading arbitrary filesystem paths or
# executing destructive statements even in read_only mode.
_DANGEROUS_SQL_RE = re.compile(
    r"\b("
    r"ATTACH|DETACH|INSTALL|LOAD\s|IMPORT\s|EXPORT\s|"
    r"COPY\s|CREATE\s|DROP\s|ALTER\s|TRUNCATE\s|"
    r"DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\w|"
    r"read_csv|read_parquet|read_json|glob\s*\(|"
    r"httpfs|http_get|http_post|load_extension|"
    r"pragma_|current_setting|set\s+"
    r")\b",
    re.IGNORECASE,
)

# Elastic index names must be safe for use in URL path segments
_ELASTIC_INDEX_RE = re.compile(r"^[a-z0-9][a-z0-9_\-\.]{0,254}$")


def _validate_safe_id(value: str, field_name: str = "id") -> str:
    """Raise 422 if *value* doesn't match the safe ID pattern."""
    if not _SAFE_ID_RE.match(value):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {field_name}: must be 1-128 alphanumeric/hyphen/underscore characters",
        )
    return value


def _validate_hunt_query_sql(sql: str) -> None:
    """Raise ValueError if *sql* contains operations that escape the DuckDB sandbox."""
    if _DANGEROUS_SQL_RE.search(sql):
        raise ValueError(
            "Query contains blocked operations (ATTACH, read_csv, COPY, filesystem functions, etc.)"
        )

# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────


class CustomModuleCreate(BaseModel):
    name: str
    description: str | None = None
    os: str
    category: str
    command: str
    output_relpath: str
    enabled: bool = True


class CustomModuleOut(BaseModel):
    id: str
    name: str
    description: str | None
    os: str
    category: str
    command: str
    output_relpath: str
    enabled: bool
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class AttackHypothesisCreate(BaseModel):
    title: str
    description: str | None = None
    tactic: str | None = None
    technique_id: str | None = None
    confidence: str = "LOW"
    status: str = "OPEN"
    evidence_refs: list[str] = []


class AttackHypothesisUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    tactic: str | None = None
    technique_id: str | None = None
    confidence: str | None = None
    status: str | None = None
    evidence_refs: list[str] | None = None


class AttackHypothesisOut(BaseModel):
    id: str
    incident_id: str
    title: str
    description: str | None
    tactic: str | None
    technique_id: str | None
    confidence: str
    status: str
    evidence_refs: list[Any]
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScheduledCollectionCreate(BaseModel):
    incident_id: str
    cron_expr: str
    profile: str | None = None
    module_ids: list[str] = []
    enabled: bool = True

    @field_validator("cron_expr")
    @classmethod
    def _validate_cron(cls, v: str) -> str:
        if not _CRON_RE.match(v.strip()):
            raise ValueError(
                "cron_expr must be a valid 5-field cron expression "
                "(e.g. '0 2 * * 1' for every Monday at 02:00)"
            )
        return v.strip()


class ScheduledCollectionOut(BaseModel):
    id: str
    incident_id: str
    cron_expr: str
    profile: str | None
    module_ids: list[Any]
    enabled: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class ThreatHuntQueryCreate(BaseModel):
    name: str
    description: str | None = None
    category: str
    query: str
    sigma_rule: str | None = None
    tags: list[str] = []
    mitre_technique: str | None = None
    is_public: bool = True

    @field_validator("query")
    @classmethod
    def _validate_sql(cls, v: str) -> str:
        try:
            _validate_hunt_query_sql(v)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        return v


class ThreatHuntQueryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    query: str | None = None
    sigma_rule: str | None = None
    tags: list[str] | None = None
    mitre_technique: str | None = None
    is_public: bool | None = None

    @field_validator("query")
    @classmethod
    def _validate_sql(cls, v: str | None) -> str | None:
        if v is not None:
            try:
                _validate_hunt_query_sql(v)
            except ValueError as exc:
                raise ValueError(str(exc)) from exc
        return v


class ThreatHuntQueryOut(BaseModel):
    id: str
    name: str
    description: str | None
    category: str
    query: str
    sigma_rule: str | None
    tags: list[Any]
    mitre_technique: str | None
    is_public: bool
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class LegalHoldCreate(BaseModel):
    reason: str
    custodian: str
    retention_days: int = Field(ge=0, default=0)


class LegalHoldOut(BaseModel):
    id: str
    incident_id: str
    reason: str
    custodian: str
    retention_days: int
    status: str
    created_by: str
    created_at: datetime
    expires_at: datetime | None
    released_at: datetime | None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# Custom Modules
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/custom-modules", response_model=list[CustomModuleOut])
async def list_custom_modules(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CustomModuleOut]:
    result = await db.execute(select(CustomModule).order_by(CustomModule.name))
    return [CustomModuleOut.model_validate(m) for m in result.scalars()]


@router.post(
    "/custom-modules",
    response_model=CustomModuleOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def create_custom_module(
    payload: CustomModuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CustomModuleOut:
    if payload.os not in {"windows", "linux", "macos"}:
        raise HTTPException(status_code=422, detail="os must be windows, linux, or macos")
    module = CustomModule(
        id=f"CM-{uuid4().hex[:12].upper()}",
        created_by=current_user.id,
        **payload.model_dump(),
    )
    db.add(module)
    await db.commit()
    await db.refresh(module)
    return CustomModuleOut.model_validate(module)


@router.delete(
    "/custom-modules/{module_id}",
    dependencies=[Depends(require_roles("admin"))],
)
async def delete_custom_module(
    module_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(
        delete(CustomModule).where(CustomModule.id == module_id).returning(CustomModule.id)
    )
    if not result.scalar():
        raise HTTPException(status_code=404, detail="Custom module not found")
    await db.commit()
    return {"deleted": module_id}


# ─────────────────────────────────────────────────────────────────────────────
# Attack Hypotheses
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/incidents/{incident_id}/hypotheses", response_model=list[AttackHypothesisOut])
async def list_hypotheses(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AttackHypothesisOut]:
    result = await db.execute(
        select(AttackHypothesis)
        .where(AttackHypothesis.incident_id == incident_id)
        .order_by(AttackHypothesis.created_at.desc())
    )
    return [AttackHypothesisOut.model_validate(h) for h in result.scalars()]


@router.post(
    "/incidents/{incident_id}/hypotheses",
    response_model=AttackHypothesisOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def create_hypothesis(
    incident_id: str,
    payload: AttackHypothesisCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AttackHypothesisOut:
    hypothesis = AttackHypothesis(
        id=f"HYP-{uuid4().hex[:12].upper()}",
        incident_id=incident_id,
        created_by=current_user.id,
        **payload.model_dump(),
    )
    db.add(hypothesis)
    await db.commit()
    await db.refresh(hypothesis)
    return AttackHypothesisOut.model_validate(hypothesis)


@router.patch(
    "/incidents/{incident_id}/hypotheses/{hyp_id}",
    response_model=AttackHypothesisOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def update_hypothesis(
    incident_id: str,
    hyp_id: str,
    payload: AttackHypothesisUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AttackHypothesisOut:
    result = await db.execute(
        select(AttackHypothesis)
        .where(AttackHypothesis.id == hyp_id, AttackHypothesis.incident_id == incident_id)
    )
    hyp = result.scalar_one_or_none()
    if not hyp:
        raise HTTPException(status_code=404, detail="Hypothesis not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(hyp, field, value)
    hyp.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(hyp)
    return AttackHypothesisOut.model_validate(hyp)


@router.delete(
    "/incidents/{incident_id}/hypotheses/{hyp_id}",
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def delete_hypothesis(
    incident_id: str,
    hyp_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(
        delete(AttackHypothesis)
        .where(AttackHypothesis.id == hyp_id, AttackHypothesis.incident_id == incident_id)
        .returning(AttackHypothesis.id)
    )
    if not result.scalar():
        raise HTTPException(status_code=404, detail="Hypothesis not found")
    await db.commit()
    return {"deleted": hyp_id}


# ─────────────────────────────────────────────────────────────────────────────
# Scheduled Collections
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/scheduled-collections", response_model=list[ScheduledCollectionOut])
async def list_scheduled_collections(
    incident_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ScheduledCollectionOut]:
    q = select(ScheduledCollection).order_by(ScheduledCollection.created_at.desc())
    if incident_id:
        q = q.where(ScheduledCollection.incident_id == incident_id)
    result = await db.execute(q)
    return [ScheduledCollectionOut.model_validate(s) for s in result.scalars()]


@router.post(
    "/scheduled-collections",
    response_model=ScheduledCollectionOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def create_scheduled_collection(
    payload: ScheduledCollectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScheduledCollectionOut:
    sc = ScheduledCollection(
        id=f"SC-{uuid4().hex[:12].upper()}",
        created_by=current_user.id,
        **payload.model_dump(),
    )
    db.add(sc)
    await db.commit()
    await db.refresh(sc)
    return ScheduledCollectionOut.model_validate(sc)


@router.patch(
    "/scheduled-collections/{sc_id}/toggle",
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def toggle_scheduled_collection(
    sc_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(select(ScheduledCollection).where(ScheduledCollection.id == sc_id))
    sc = result.scalar_one_or_none()
    if not sc:
        raise HTTPException(status_code=404, detail="Scheduled collection not found")
    sc.enabled = not sc.enabled
    await db.commit()
    return {"id": sc_id, "enabled": sc.enabled}


@router.delete(
    "/scheduled-collections/{sc_id}",
    dependencies=[Depends(require_roles("admin"))],
)
async def delete_scheduled_collection(
    sc_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(
        delete(ScheduledCollection).where(ScheduledCollection.id == sc_id).returning(ScheduledCollection.id)
    )
    if not result.scalar():
        raise HTTPException(status_code=404, detail="Scheduled collection not found")
    await db.commit()
    return {"deleted": sc_id}


# ─────────────────────────────────────────────────────────────────────────────
# Threat Hunt Queries
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/threat-hunt-queries", response_model=list[ThreatHuntQueryOut])
async def list_threat_hunt_queries(
    category: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ThreatHuntQueryOut]:
    q = select(ThreatHuntQuery).order_by(ThreatHuntQuery.name)
    if category:
        q = q.where(ThreatHuntQuery.category == category)
    result = await db.execute(q)
    return [ThreatHuntQueryOut.model_validate(t) for t in result.scalars()]


@router.post(
    "/threat-hunt-queries",
    response_model=ThreatHuntQueryOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def create_threat_hunt_query(
    payload: ThreatHuntQueryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ThreatHuntQueryOut:
    thq = ThreatHuntQuery(
        id=f"THQ-{uuid4().hex[:12].upper()}",
        created_by=current_user.id,
        **payload.model_dump(),
    )
    db.add(thq)
    await db.commit()
    await db.refresh(thq)
    return ThreatHuntQueryOut.model_validate(thq)


@router.patch(
    "/threat-hunt-queries/{thq_id}",
    response_model=ThreatHuntQueryOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def update_threat_hunt_query(
    thq_id: str,
    payload: ThreatHuntQueryUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ThreatHuntQueryOut:
    result = await db.execute(select(ThreatHuntQuery).where(ThreatHuntQuery.id == thq_id))
    thq = result.scalar_one_or_none()
    if not thq:
        raise HTTPException(status_code=404, detail="Query not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(thq, field, value)
    thq.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(thq)
    return ThreatHuntQueryOut.model_validate(thq)


@router.delete(
    "/threat-hunt-queries/{thq_id}",
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def delete_threat_hunt_query(
    thq_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(
        delete(ThreatHuntQuery).where(ThreatHuntQuery.id == thq_id).returning(ThreatHuntQuery.id)
    )
    if not result.scalar():
        raise HTTPException(status_code=404, detail="Query not found")
    await db.commit()
    return {"deleted": thq_id}


@router.post("/threat-hunt-queries/{thq_id}/run")
async def run_threat_hunt_query(
    thq_id: str,
    incident_id: str = Query(..., description="Incident whose timeline to query"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Execute a stored threat hunt query against an incident's super timeline DuckDB."""
    safe_incident_id = _validate_safe_id(incident_id, "incident_id")

    result = await db.execute(select(ThreatHuntQuery).where(ThreatHuntQuery.id == thq_id))
    thq = result.scalar_one_or_none()
    if not thq:
        raise HTTPException(status_code=404, detail="Query not found")

    import pathlib
    from app.core.config import settings as app_settings

    evidence_base = pathlib.Path(app_settings.EVIDENCE_STORAGE_PATH)
    db_path = evidence_base / safe_incident_id / "timeline" / "super_timeline.duckdb"
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Super timeline not available for this incident")

    def _run_query(db_path: pathlib.Path, sql: str) -> list[dict]:
        import duckdb
        con = duckdb.connect(str(db_path), read_only=True)
        try:
            rows = con.execute(sql).fetchall()
            cols = [d[0] for d in con.description or []]
            return [dict(zip(cols, row)) for row in rows[:1000]]
        finally:
            con.close()

    # Re-validate at execution time — defense-in-depth even if DB record was created before
    # the blocklist was added.
    try:
        _validate_hunt_query_sql(thq.query)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        rows = await asyncio.to_thread(_run_query, db_path, thq.query)
        return {"query_id": thq_id, "incident_id": incident_id, "row_count": len(rows), "rows": rows}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Query failed: {exc}") from exc


# ─────────────────────────────────────────────────────────────────────────────
# Legal Holds
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/incidents/{incident_id}/legal-holds", response_model=list[LegalHoldOut])
async def list_legal_holds(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[LegalHoldOut]:
    result = await db.execute(
        select(LegalHold)
        .where(LegalHold.incident_id == incident_id)
        .order_by(LegalHold.created_at.desc())
    )
    return [LegalHoldOut.model_validate(h) for h in result.scalars()]


@router.post(
    "/incidents/{incident_id}/legal-holds",
    response_model=LegalHoldOut,
    dependencies=[Depends(require_roles("admin"))],
)
async def create_legal_hold(
    incident_id: str,
    payload: LegalHoldCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LegalHoldOut:
    now = datetime.now(timezone.utc)
    expires_at = None
    if payload.retention_days > 0:
        from datetime import timedelta
        expires_at = now + timedelta(days=payload.retention_days)
    hold = LegalHold(
        id=f"LH-{uuid4().hex[:12].upper()}",
        incident_id=incident_id,
        created_by=current_user.id,
        expires_at=expires_at,
        **payload.model_dump(),
    )
    db.add(hold)
    await db.commit()
    await db.refresh(hold)
    return LegalHoldOut.model_validate(hold)


@router.post(
    "/incidents/{incident_id}/legal-holds/{hold_id}/release",
    dependencies=[Depends(require_roles("admin"))],
)
async def release_legal_hold(
    incident_id: str,
    hold_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(
        select(LegalHold).where(LegalHold.id == hold_id, LegalHold.incident_id == incident_id)
    )
    hold = result.scalar_one_or_none()
    if not hold:
        raise HTTPException(status_code=404, detail="Legal hold not found")
    if hold.status != "ACTIVE":
        raise HTTPException(status_code=409, detail=f"Hold is already {hold.status}")
    hold.status = "RELEASED"
    hold.released_at = datetime.now(timezone.utc)
    await db.commit()
    return {"id": hold_id, "status": "RELEASED"}


# ─────────────────────────────────────────────────────────────────────────────
# Cross-incident Timeline Correlation
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/correlate-timelines")
async def correlate_timelines(
    incident_ids: str = Query(..., description="Comma-separated incident IDs (max 10)"),
    q: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    _: User = Depends(get_current_user),
) -> dict:
    """Merge super timeline events from multiple incidents for cross-incident correlation."""
    import pathlib
    from app.core.config import settings as app_settings

    ids = [i.strip() for i in incident_ids.split(",") if i.strip()]
    if not ids or len(ids) > 10:
        raise HTTPException(status_code=422, detail="Provide 1–10 incident IDs")

    # Validate every incident_id before using in filesystem paths or SQL
    for iid in ids:
        if not _SAFE_ID_RE.match(iid):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid incident_id '{iid[:32]}': must be alphanumeric/hyphen/underscore only",
            )

    evidence_base = pathlib.Path(app_settings.EVIDENCE_STORAGE_PATH)
    available: list[str] = []
    db_paths: list[pathlib.Path] = []
    for iid in ids:
        p = evidence_base / iid / "timeline" / "super_timeline.duckdb"
        if p.exists():
            available.append(iid)
            db_paths.append(p)

    if not db_paths:
        raise HTTPException(
            status_code=404, detail="No super timelines available for the given incidents"
        )

    def _correlate(
        paths: list[pathlib.Path],
        avail: list[str],
        search: str | None,
        d_from: str | None,
        d_to: str | None,
    ) -> list[dict]:
        import duckdb
        con = duckdb.connect()
        selects: list[str] = []
        for idx, p in enumerate(paths):
            alias = f"db{idx}"
            # ATTACH only supports literal strings — escape any embedded single quotes
            escaped_path = str(p).replace("'", "''")
            con.execute(f"ATTACH '{escaped_path}' AS {alias} (READ_ONLY)")
            # avail[idx] already validated by _SAFE_ID_RE (no quotes possible)
            selects.append(f"SELECT *, '{avail[idx]}' AS corr_incident_id FROM {alias}.events")
        union_sql = " UNION ALL ".join(selects)

        # Build WHERE clause using DuckDB positional parameters — no string interpolation
        where: list[str] = []
        params: list[Any] = []
        if search:
            where.append("(CAST(message AS VARCHAR) ILIKE ? OR CAST(source AS VARCHAR) ILIKE ?)")
            params.extend([f"%{search}%", f"%{search}%"])
        if d_from:
            where.append("CAST(datetime AS VARCHAR) >= ?")
            params.append(d_from)
        if d_to:
            where.append("CAST(datetime AS VARCHAR) <= ?")
            params.append(d_to)

        sql = f"SELECT * FROM ({union_sql}) t"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY datetime NULLS LAST LIMIT 500"

        rows = con.execute(sql, params).fetchall()
        cols = [d[0] for d in con.description or []]
        con.close()
        return [dict(zip(cols, row)) for row in rows]

    try:
        rows = await asyncio.to_thread(_correlate, db_paths, available, q, date_from, date_to)
        return {"incident_ids": available, "row_count": len(rows), "rows": rows}
    except Exception as exc:
        logger.warning("Correlation query failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Correlation failed: {exc}") from exc


# ─────────────────────────────────────────────────────────────────────────────
# SIEM Export
# ─────────────────────────────────────────────────────────────────────────────


class SIEMExportRequest(BaseModel):
    target: str  # splunk | elastic | timesketch
    incident_id: str
    splunk_hec_url: str | None = None
    splunk_hec_token: str | None = None
    elastic_url: str | None = None
    elastic_index: str | None = None
    elastic_api_key: str | None = None
    timesketch_url: str | None = None
    timesketch_token: str | None = None
    timesketch_sketch_id: int | None = None
    max_events: int = Field(default=10_000, ge=1, le=100_000)

    @field_validator("target")
    @classmethod
    def _validate_target(cls, v: str) -> str:
        if v not in {"splunk", "elastic", "timesketch"}:
            raise ValueError("target must be splunk, elastic, or timesketch")
        return v

    @field_validator("splunk_hec_url", "elastic_url", "timesketch_url", mode="before")
    @classmethod
    def _validate_url(cls, v: str | None) -> str | None:
        if v and not v.startswith(("https://", "http://")):
            raise ValueError("URL must start with https:// or http://")
        return v

    @field_validator("elastic_index", mode="before")
    @classmethod
    def _validate_index(cls, v: str | None) -> str | None:
        if v and not _ELASTIC_INDEX_RE.match(v):
            raise ValueError(
                "elastic_index must contain only lowercase alphanumeric characters, hyphens, underscores, and dots"
            )
        return v


@router.post(
    "/siem-export",
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def siem_export(
    payload: SIEMExportRequest,
    _: User = Depends(get_current_user),
) -> dict:
    """Push super timeline events to an external SIEM (Splunk HEC, Elastic, Timesketch)."""
    safe_incident_id = _validate_safe_id(payload.incident_id, "incident_id")

    import pathlib
    from app.core.config import settings as app_settings

    evidence_base = pathlib.Path(app_settings.EVIDENCE_STORAGE_PATH)
    db_path = evidence_base / safe_incident_id / "timeline" / "super_timeline.duckdb"
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Super timeline not available")

    def _fetch(path: pathlib.Path, limit: int) -> list[dict]:
        import duckdb
        con = duckdb.connect(str(path), read_only=True)
        try:
            # limit is already validated by Field(ge=1, le=100_000) — safe to embed
            rows = con.execute(
                f"SELECT * FROM events ORDER BY datetime NULLS LAST LIMIT {int(limit)}"
            ).fetchall()
            cols = [d[0] for d in con.description or []]
            return [dict(zip(cols, row)) for row in rows]
        finally:
            con.close()

    events = await asyncio.to_thread(_fetch, db_path, payload.max_events)
    if not events:
        return {"target": payload.target, "sent": 0, "message": "No events to export"}

    if payload.target == "splunk":
        return await _push_splunk(payload, events)
    if payload.target == "elastic":
        return await _push_elastic(payload, events)
    if payload.target == "timesketch":
        return await _push_timesketch(payload, events)
    raise HTTPException(status_code=422, detail=f"Unknown target: {payload.target}")


async def _push_splunk(payload: SIEMExportRequest, events: list[dict]) -> dict:
    if not payload.splunk_hec_url or not payload.splunk_hec_token:
        raise HTTPException(status_code=422, detail="splunk_hec_url and splunk_hec_token required")
    try:
        import httpx
        batch = "\n".join(
            json.dumps({"time": str(e.get("datetime", "")), "event": {k: str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v for k, v in e.items()}})
            for e in events
        )
        headers = {"Authorization": f"Splunk {payload.splunk_hec_token}"}
        async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
            resp = await client.post(payload.splunk_hec_url, content=batch, headers=headers)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Splunk HEC returned {resp.status_code}: {resp.text[:200]}")
        return {"target": "splunk", "sent": len(events), "http_status": resp.status_code}
    except ImportError:
        raise HTTPException(status_code=503, detail="httpx not installed")


async def _push_elastic(payload: SIEMExportRequest, events: list[dict]) -> dict:
    if not payload.elastic_url or not payload.elastic_index:
        raise HTTPException(status_code=422, detail="elastic_url and elastic_index required")
    try:
        import httpx
        lines: list[str] = []
        for ev in events:
            lines.append(json.dumps({"index": {"_index": payload.elastic_index}}))
            safe = {k: (str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v) for k, v in ev.items()}
            lines.append(json.dumps(safe))
        body = "\n".join(lines) + "\n"
        headers: dict[str, str] = {"Content-Type": "application/x-ndjson"}
        if payload.elastic_api_key:
            headers["Authorization"] = f"ApiKey {payload.elastic_api_key}"
        async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
            resp = await client.post(f"{payload.elastic_url.rstrip('/')}/_bulk", content=body, headers=headers)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Elastic returned {resp.status_code}: {resp.text[:200]}")
        result = resp.json()
        return {"target": "elastic", "sent": len(events), "errors": result.get("errors", False)}
    except ImportError:
        raise HTTPException(status_code=503, detail="httpx not installed")


async def _push_timesketch(payload: SIEMExportRequest, events: list[dict]) -> dict:
    if not payload.timesketch_url or not payload.timesketch_token or not payload.timesketch_sketch_id:
        raise HTTPException(
            status_code=422,
            detail="timesketch_url, timesketch_token, and timesketch_sketch_id required",
        )
    try:
        import httpx
        url = f"{payload.timesketch_url.rstrip('/')}/api/v1/sketches/{payload.timesketch_sketch_id}/import"
        headers = {"Authorization": f"Bearer {payload.timesketch_token}"}
        jsonl = "\n".join(json.dumps(e, default=str) for e in events)
        files = {"file": ("timeline.jsonl", jsonl.encode(), "application/jsonlines")}
        async with httpx.AsyncClient(timeout=120.0, verify=False) as client:
            resp = await client.post(url, headers=headers, files=files)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Timesketch returned {resp.status_code}: {resp.text[:200]}")
        return {"target": "timesketch", "sent": len(events), "http_status": resp.status_code}
    except ImportError:
        raise HTTPException(status_code=503, detail="httpx not installed")
