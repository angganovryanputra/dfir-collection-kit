from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.analytics import (
    create_ioc_indicator,
    delete_ioc_indicator,
    list_attack_chains,
    list_ioc_indicators,
    list_ioc_matches,
    list_yara_matches,
)
from app.crud.processing import (
    count_sigma_hits_by_severity,
    get_latest_processing_job_by_incident_id,
    get_processing_job_by_evidence_job_id,
    list_sigma_hits,
)
from app.models.user import User
from app.schemas.analytics import (
    AttackChainOut,
    IOCIndicatorCreate,
    IOCIndicatorOut,
    IOCMatchListOut,
    IOCMatchOut,
    YaraMatchListOut,
    YaraMatchOut,
)
from app.schemas.processing import (
    ProcessingJobOut,
    ProcessingTriggerResponse,
    SigmaHitListOut,
    SigmaHitOut,
)
from app.services.system_settings_service import get_runtime_settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/{job_id}/trigger",
    response_model=ProcessingTriggerResponse,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def trigger_processing(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProcessingTriggerResponse:
    """Manually trigger the parsing pipeline for a completed evidence job."""
    from app.crud.job import get_job

    job = await get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = await get_processing_job_by_evidence_job_id(db, job_id)
    if existing and existing.status == "RUNNING":
        return ProcessingTriggerResponse(
            processing_job_id=existing.id,
            status="RUNNING",
            message="Pipeline already running",
        )
    if existing and existing.status == "DONE":
        return ProcessingTriggerResponse(
            processing_job_id=existing.id,
            status="DONE",
            message="Pipeline already completed — re-trigger not supported; check /status",
        )

    runtime = await get_runtime_settings(db)
    base_path = Path(runtime.evidence_storage_path) / job.incident_id / job_id

    from app.services.artifact_parser_service import dispatch_pipeline

    dispatch_pipeline(job.incident_id, job_id, base_path)

    return ProcessingTriggerResponse(
        processing_job_id=f"proc-{job_id}",
        status="PENDING",
        message="Pipeline triggered — poll /processing/{job_id}/status for progress",
    )


@router.get("/{job_id}/status", response_model=ProcessingJobOut)
async def get_processing_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProcessingJobOut:
    """Poll the status of a processing pipeline for a given evidence job ID."""
    proc_job = await get_processing_job_by_evidence_job_id(db, job_id)
    if not proc_job:
        raise HTTPException(status_code=404, detail="No processing job found for this evidence job")
    return ProcessingJobOut.model_validate(proc_job)


@router.get("/{job_id}/sigma-hits", response_model=SigmaHitListOut)
async def get_sigma_hits_for_job(
    job_id: str,
    severity: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SigmaHitListOut:
    """List Sigma detection hits for a specific evidence job."""
    proc_job = await get_processing_job_by_evidence_job_id(db, job_id)
    if not proc_job:
        raise HTTPException(status_code=404, detail="No processing job found for this evidence job")

    hits, total = await list_sigma_hits(db, proc_job.incident_id, severity, limit, offset)
    severity_counts = await count_sigma_hits_by_severity(db, proc_job.incident_id)

    return SigmaHitListOut(
        total=total,
        items=[SigmaHitOut.model_validate(h) for h in hits],
        severity_counts=severity_counts,
    )


@router.get("/incident/{incident_id}/status", response_model=ProcessingJobOut)
async def get_latest_processing_status_for_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProcessingJobOut:
    """Return the latest processing job for an incident (for frontend polling)."""
    proc_job = await get_latest_processing_job_by_incident_id(db, incident_id)
    if not proc_job:
        raise HTTPException(status_code=404, detail="No processing job found for this incident")
    return ProcessingJobOut.model_validate(proc_job)


@router.get("/incident/{incident_id}/sigma-hits", response_model=SigmaHitListOut)
async def get_sigma_hits_for_incident(
    incident_id: str,
    severity: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SigmaHitListOut:
    """List all Sigma detection hits for an incident."""
    hits, total = await list_sigma_hits(db, incident_id, severity, limit, offset)
    severity_counts = await count_sigma_hits_by_severity(db, incident_id)

    return SigmaHitListOut(
        total=total,
        items=[SigmaHitOut.model_validate(h) for h in hits],
        severity_counts=severity_counts,
    )


@router.get("/{job_id}/timeline/download")
async def download_timeline(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> FileResponse:
    """Download the Timesketch JSONL timeline for a completed evidence job."""
    from app.crud.job import get_job

    job = await get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    proc_job = await get_processing_job_by_evidence_job_id(db, job_id)
    if not proc_job or proc_job.status != "DONE":
        raise HTTPException(
            status_code=404,
            detail="Timeline not ready — processing must complete first",
        )

    runtime = await get_runtime_settings(db)
    timeline_path = (
        Path(runtime.evidence_storage_path) / job.incident_id / job_id / "timeline" / "timeline.jsonl"
    )
    if not timeline_path.exists():
        raise HTTPException(status_code=404, detail="timeline.jsonl not found on disk")

    return FileResponse(
        path=str(timeline_path),
        filename=f"{job.incident_id}-{job_id}-timeline.jsonl",
        media_type="application/x-ndjson",
    )


@router.post(
    "/{job_id}/timeline/push-timesketch",
    dependencies=[Depends(require_roles("admin"))],
)
async def push_to_timesketch(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Push the timeline.jsonl to a configured Timesketch instance."""
    from app.crud.job import get_job

    job = await get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    runtime = await get_runtime_settings(db)
    timesketch_url = getattr(runtime, "timesketch_url", None) or ""
    timesketch_token = getattr(runtime, "timesketch_token", None) or ""
    if not timesketch_url:
        raise HTTPException(status_code=400, detail="Timesketch URL not configured in settings")

    timeline_path = (
        Path(runtime.evidence_storage_path) / job.incident_id / job_id / "timeline" / "timeline.jsonl"
    )
    if not timeline_path.exists():
        raise HTTPException(status_code=404, detail="timeline.jsonl not found — run pipeline first")

    from app.services.timesketch_export_service import push_to_timesketch as _push

    sketch_name = f"DFIR-{job.incident_id}"
    result = await _push(timeline_path, sketch_name, timesketch_url, timesketch_token)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "Timesketch push failed"))
    return result


# ── Attack Chain ──────────────────────────────────────────────────────────────


@router.get("/incident/{incident_id}/attack-chains", response_model=list[AttackChainOut])
async def get_attack_chains(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AttackChainOut]:
    """Return reconstructed ATT&CK kill chains for an incident."""
    chains = await list_attack_chains(db, incident_id)
    return [AttackChainOut.model_validate(c) for c in chains]


# ── IOC Indicators (admin-managed feed) ───────────────────────────────────────


@router.get("/ioc/indicators", response_model=list[IOCIndicatorOut])
async def get_ioc_indicators(
    ioc_type: str | None = Query(default=None),
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[IOCIndicatorOut]:
    """List known bad indicators."""
    indicators, _total = await list_ioc_indicators(db, ioc_type, limit, offset)
    return [IOCIndicatorOut.model_validate(i) for i in indicators]


@router.post(
    "/ioc/indicators",
    response_model=IOCIndicatorOut,
    status_code=201,
    dependencies=[Depends(require_roles("admin"))],
)
async def add_ioc_indicator(
    body: IOCIndicatorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IOCIndicatorOut:
    """Add a new known bad indicator (admin only)."""
    ind = await create_ioc_indicator(
        db,
        ioc_type=body.ioc_type,
        value=body.value,
        description=body.description,
        source=body.source,
        severity=body.severity,
        created_by=current_user.username,
    )
    return IOCIndicatorOut.model_validate(ind)


@router.delete(
    "/ioc/indicators/{indicator_id}",
    status_code=204,
    dependencies=[Depends(require_roles("admin"))],
)
async def remove_ioc_indicator(
    indicator_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    """Delete an IOC indicator (admin only)."""
    deleted = await delete_ioc_indicator(db, indicator_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Indicator not found")


# ── IOC Matches ───────────────────────────────────────────────────────────────


@router.get("/incident/{incident_id}/ioc-matches", response_model=IOCMatchListOut)
async def get_ioc_matches(
    incident_id: str,
    ioc_type: str | None = Query(default=None),
    limit: int = Query(default=200, le=500),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> IOCMatchListOut:
    """List IOC matches found in an incident's timeline."""
    matches, total = await list_ioc_matches(db, incident_id, ioc_type, limit, offset)
    return IOCMatchListOut(
        total=total,
        items=[IOCMatchOut.model_validate(m) for m in matches],
    )


# ── YARA Matches ──────────────────────────────────────────────────────────────


@router.get("/incident/{incident_id}/yara-matches", response_model=YaraMatchListOut)
async def get_yara_matches(
    incident_id: str,
    limit: int = Query(default=200, le=500),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> YaraMatchListOut:
    """List YARA rule matches found in an incident's collected files."""
    matches, total = await list_yara_matches(db, incident_id, limit, offset)
    return YaraMatchListOut(
        total=total,
        items=[YaraMatchOut.model_validate(m) for m in matches],
    )
