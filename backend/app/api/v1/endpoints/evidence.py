import asyncio
import functools
from datetime import datetime, timezone
import logging
from pathlib import Path
import re
import zipfile

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.system_settings_service import get_runtime_settings
from app.core.deps import get_current_user, get_db, require_roles
from app.core.security import compute_export_signature
from app.crud.chain_of_custody import create_entry
from app.crud.evidence import create_folder, create_item, get_item, list_folders, list_items
from app.crud.incident import get_incident
from app.crud.evidence_export import build_export_url
from app.models.user import User
from app.schemas.chain_of_custody import ChainOfCustodyEntryCreate
from app.schemas.evidence import (
    EvidenceFolderCreate,
    EvidenceFolderOut,
    EvidenceItemCreate,
    EvidenceItemOut,
)
from app.schemas.evidence_export import EvidenceExportRequest, EvidenceExportResponse
from app.services.audit_log_service import safe_record_event

router = APIRouter()


def _validate_identifier(value: str, label: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", value):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return value


def _select_recent_zip(root: Path) -> Path:
    zips = sorted(root.glob("**/*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not zips:
        raise HTTPException(status_code=404, detail="Incident export not found")
    return zips[0]


def _ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _enforce_export_retention(export_dir: Path, limit: int) -> None:
    exports = sorted(
        export_dir.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True
    )
    for stale in exports[limit:]:
        try:
            stale.unlink()
        except OSError:
            continue


def _build_export_zip(incident_id: str, storage_path: str, max_bytes: int) -> Path:
    base_path = Path(storage_path) / incident_id
    if not base_path.exists():
        raise HTTPException(status_code=404, detail="Incident export not found")
    export_dir = base_path / "exports"
    _ensure_directory(export_dir)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    zip_path = export_dir / f"{incident_id}-{timestamp}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for file_path in base_path.rglob("*"):
            if not file_path.is_file():
                continue
            if export_dir in file_path.parents:
                continue
            rel_path = file_path.relative_to(base_path)
            zip_file.write(file_path, rel_path)
    if zip_path.stat().st_size > max_bytes:
        try:
            zip_path.unlink()
        except OSError as exc:
            logger.warning("Failed to delete oversized export %s: %s", zip_path, exc)
        raise HTTPException(status_code=413, detail="Export exceeds size limit")
    _enforce_export_retention(export_dir, 5)
    return zip_path


def _build_evidence_export_zip(
    incident_id: str,
    evidence_id: str,
    evidence_name: str,
    storage_path: str,
    max_bytes: int,
) -> Path:
    base_path = Path(storage_path) / incident_id
    if not base_path.exists():
        raise HTTPException(status_code=404, detail="Evidence not found")
    export_dir = base_path / "exports"
    _ensure_directory(export_dir)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    zip_path = export_dir / f"{incident_id}-{evidence_id}-{timestamp}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for file_path in base_path.rglob(evidence_name):
            if not file_path.is_file():
                continue
            if export_dir in file_path.parents:
                continue
            rel_path = file_path.relative_to(base_path)
            zip_file.write(file_path, rel_path)
            break
    if not zip_path.exists() or zip_path.stat().st_size == 0:
        raise HTTPException(status_code=404, detail="Evidence not found")
    if zip_path.stat().st_size > max_bytes:
        try:
            zip_path.unlink()
        except OSError as exc:
            logger.warning("Failed to delete oversized export %s: %s", zip_path, exc)
        raise HTTPException(status_code=413, detail="Export exceeds size limit")
    _enforce_export_retention(export_dir, 5)
    return zip_path


def _resolve_evidence_export(
    incident_id: str,
    evidence_id: str,
    evidence_name: str,
    storage_path: str,
    max_bytes: int,
) -> Path:
    base_path = Path(storage_path) / incident_id
    if not base_path.exists():
        raise HTTPException(status_code=404, detail="Evidence not found")
    export_dir = base_path / "exports"
    if export_dir.exists():
        existing = sorted(
            export_dir.glob(f"{incident_id}-{evidence_id}-*.zip"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if existing:
            return existing[0]
    return _build_evidence_export_zip(incident_id, evidence_id, evidence_name, storage_path, max_bytes)


def _resolve_incident_export(incident_id: str, storage_path: str, max_bytes: int) -> Path:
    base_path = Path(storage_path) / incident_id
    if not base_path.exists():
        raise HTTPException(status_code=404, detail="Incident export not found")
    export_dir = base_path / "exports"
    if export_dir.exists():
        try:
            return _select_recent_zip(export_dir)
        except HTTPException:
            pass
    return _build_export_zip(incident_id, storage_path, max_bytes)


def _require_signature(export_path: Path, signature: str | None) -> None:
    if not signature:
        raise HTTPException(status_code=401, detail="Missing export signature")
    expected = compute_export_signature(str(export_path))
    if signature != expected:
        raise HTTPException(status_code=403, detail="Invalid export signature")


@router.get("/folders", response_model=list[EvidenceFolderOut])
async def get_folders(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[EvidenceFolderOut]:
    folders = await list_folders(db)
    return [EvidenceFolderOut.model_validate(folder) for folder in folders]


@router.post(
    "/folders",
    response_model=EvidenceFolderOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def create_folder_endpoint(
    payload: EvidenceFolderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EvidenceFolderOut:
    incident = await get_incident(db, payload.incident_id)
    if incident and incident.status == "CLOSED":
        raise HTTPException(status_code=409, detail="Incident is closed; evidence is locked")
    folder = await create_folder(db, payload)
    await safe_record_event(
        db,
        event_type="evidence.folder.create",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="create evidence folder",
        target_type="evidence",
        target_id=folder.id,
        status="success",
        message="Evidence folder created",
        metadata={"incident_id": folder.incident_id},
    )
    return EvidenceFolderOut.model_validate(folder)


@router.get("/items", response_model=list[EvidenceItemOut])
async def get_items(
    incident_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[EvidenceItemOut]:
    safe_incident_id = _validate_identifier(incident_id, "incident_id") if incident_id else None
    items = await list_items(db, safe_incident_id)
    return [EvidenceItemOut.model_validate(item) for item in items]


@router.post(
    "/items",
    response_model=EvidenceItemOut,
    dependencies=[Depends(require_roles("operator", "admin"))],
)
async def create_item_endpoint(
    payload: EvidenceItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EvidenceItemOut:
    incident = await get_incident(db, payload.incident_id)
    if incident and incident.status == "CLOSED":
        raise HTTPException(status_code=409, detail="Incident is closed; evidence is locked")
    item = await create_item(db, payload)
    await safe_record_event(
        db,
        event_type="evidence.item.create",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="create evidence item",
        target_type="evidence",
        target_id=item.id,
        status="success",
        message="Evidence item created",
        metadata={"incident_id": item.incident_id, "name": item.name},
    )
    return EvidenceItemOut.model_validate(item)


@router.post("/exports", response_model=EvidenceExportResponse)
async def create_export_endpoint(
    payload: EvidenceExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EvidenceExportResponse:
    runtime_settings = await get_runtime_settings(db)
    max_bytes = runtime_settings.max_file_size_gb * 1024 * 1024 * 1024
    export_path: Path | None = None
    incident_id: str | None = payload.incident_id
    target_id: str | None = payload.evidence_id or payload.incident_id
    item = None
    if not payload.incident_id and not payload.evidence_id:
        raise HTTPException(status_code=400, detail="incident_id or evidence_id is required")
    if payload.incident_id:
        _validate_identifier(payload.incident_id, "incident_id")
        export_path = await asyncio.to_thread(
            _resolve_incident_export,
            payload.incident_id,
            runtime_settings.evidence_storage_path,
            max_bytes,
        )
    if payload.evidence_id:
        _validate_identifier(payload.evidence_id, "evidence_id")
        item = await get_item(db, payload.evidence_id)
        if not item:
            raise HTTPException(status_code=404, detail="Evidence not found")
        incident_id = item.incident_id
        export_path = await asyncio.to_thread(
            _resolve_evidence_export,
            item.incident_id,
            payload.evidence_id,
            item.name,
            runtime_settings.evidence_storage_path,
            max_bytes,
        )
    signature = await asyncio.to_thread(compute_export_signature, str(export_path)) if export_path else None
    response = build_export_url(payload.incident_id, payload.evidence_id)
    await safe_record_event(
        db,
        event_type="evidence_exported",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="export evidence",
        target_type="evidence",
        target_id=payload.evidence_id or payload.incident_id,
        status="success",
        message="Evidence export prepared",
        metadata={"incident_id": payload.incident_id, "evidence_id": payload.evidence_id},
    )
    try:
        await create_entry(
            db,
            ChainOfCustodyEntryCreate(
                id=f"coc-export-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{current_user.id}",
                incident_id=str(incident_id or "unknown"),
                timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                action="EVIDENCE EXPORT PREPARED",
                actor=current_user.username,
                target=str(target_id or "unknown"),
            ),
        )
    except Exception as exc:
        logger.warning("CoC entry failed: %s", exc)
    return EvidenceExportResponse(
        download_url=response.download_url,
        signature=signature,
        status=response.status,
        format=runtime_settings.export_format,
    )


@router.get("/exports/incident/{incident_id}")
async def download_incident_export(
    incident_id: str,
    signature: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    runtime_settings = await get_runtime_settings(db)
    max_bytes = runtime_settings.max_file_size_gb * 1024 * 1024 * 1024
    safe_incident_id = _validate_identifier(incident_id, "incident_id")
    export_path = await asyncio.to_thread(
        _resolve_incident_export, safe_incident_id, runtime_settings.evidence_storage_path, max_bytes
    )
    _require_signature(export_path, signature)
    await safe_record_event(
        db,
        event_type="evidence_downloaded",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="download incident export",
        target_type="incident",
        target_id=safe_incident_id,
        status="success",
        message="Incident export downloaded",
        metadata={},
    )
    try:
        await create_entry(
            db,
            ChainOfCustodyEntryCreate(
                id=f"coc-download-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{current_user.id}",
                incident_id=safe_incident_id,
                timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                action="EVIDENCE EXPORT DOWNLOADED",
                actor=current_user.username,
                target=export_path.name,
            ),
        )
    except Exception as exc:
        logger.warning("CoC entry failed: %s", exc)
    return FileResponse(export_path)


@router.get("/exports/{evidence_id}")
async def download_evidence_export(
    evidence_id: str,
    signature: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    runtime_settings = await get_runtime_settings(db)
    max_bytes = runtime_settings.max_file_size_gb * 1024 * 1024 * 1024
    safe_evidence_id = _validate_identifier(evidence_id, "evidence_id")
    item = await get_item(db, safe_evidence_id)
    if not item:
        raise HTTPException(status_code=404, detail="Evidence not found")
    export_path = await asyncio.to_thread(
        _resolve_evidence_export,
        item.incident_id,
        safe_evidence_id,
        item.name,
        runtime_settings.evidence_storage_path,
        max_bytes,
    )
    _require_signature(export_path, signature)
    await safe_record_event(
        db,
        event_type="evidence_downloaded",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="download evidence export",
        target_type="evidence",
        target_id=safe_evidence_id,
        status="success",
        message="Evidence export downloaded",
        metadata={"incident_id": item.incident_id},
    )
    try:
        await create_entry(
            db,
            ChainOfCustodyEntryCreate(
                id=f"coc-download-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{current_user.id}",
                incident_id=item.incident_id,
                timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                action="EVIDENCE EXPORT DOWNLOADED",
                actor=current_user.username,
                target=export_path.name,
            ),
        )
    except Exception as exc:
        logger.warning("CoC entry failed: %s", exc)
    return FileResponse(export_path)


@router.get("/incident/{incident_id}", response_model=list[EvidenceItemOut])
async def list_incident_evidence(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[EvidenceItemOut]:
    safe_incident_id = _validate_identifier(incident_id, "incident_id")
    items = await list_items(db, safe_incident_id)
    return [EvidenceItemOut.model_validate(item) for item in items]

from pydantic import BaseModel

def _has_duckdb() -> bool:
    try:
        import duckdb  # noqa: F401
        return True
    except ImportError:
        return False

_HAS_DUCKDB = _has_duckdb()

class TimelineResponse(BaseModel):
    data: list[dict]
    total: int
    page: int
    limit: int

@router.get("/timeline/{evidence_id}", response_model=TimelineResponse)
async def get_timeline_data(
    evidence_id: str,
    q: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=100, ge=10, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TimelineResponse:
    """
    Returns paginated and filtered contents of a timeline file (JSONL or CSV).
    Auto-detects format by file extension.
    Uses DuckDB for production-scale queries when available.
    """
    safe_evidence_id = _validate_identifier(evidence_id, "evidence_id")
    item = await get_item(db, safe_evidence_id)
    if not item:
        raise HTTPException(status_code=404, detail="Evidence not found")

    if item.type != "PROCESSED_TIMELINE":
        raise HTTPException(status_code=400, detail="Evidence is not a timeline")

    runtime_settings = await get_runtime_settings(db)
    base_path = Path(runtime_settings.evidence_storage_path) / item.incident_id

    # Search for matching file; also check pipeline output path timeline/timeline.jsonl
    timeline_path: Path | None = None
    search_candidates = list(base_path.rglob(item.name)) + [
        base_path / "timeline" / "timeline.jsonl",
    ]
    for p in search_candidates:
        if p.is_file():
            timeline_path = p
            break

    if not timeline_path or not timeline_path.exists():
        raise HTTPException(status_code=404, detail="Timeline file not found on disk")

    is_jsonl = timeline_path.suffix.lower() in (".jsonl", ".ndjson", ".json")

    # Prefer persistent DuckDB store when available (built by pipeline after export)
    duckdb_store = timeline_path.parent / "duckdb.db"
    if _HAS_DUCKDB and duckdb_store.exists():
        return await asyncio.to_thread(_query_duckdb_store, duckdb_store, q, page, limit)
    elif _HAS_DUCKDB:
        return await asyncio.to_thread(functools.partial(_query_duckdb, timeline_path, q, page, limit, is_jsonl=is_jsonl))
    else:
        if is_jsonl:
            return _query_jsonl_fallback(timeline_path, q, page, limit)
        return _query_csv_fallback(timeline_path, q, page, limit)


def _query_duckdb(
    file_path: Path, q: str, page: int, limit: int, *, is_jsonl: bool = False
) -> TimelineResponse:
    """High-performance query using DuckDB's in-process engine.
    Supports both CSV and JSONL (newline-delimited JSON) formats."""
    import duckdb  # optional dependency — caller checks _HAS_DUCKDB first

    offset = (page - 1) * limit
    path_str = str(file_path).replace("'", "''")

    try:
        con = duckdb.connect(":memory:")

        if is_jsonl:
            reader = f"read_json_auto('{path_str}', ignore_errors=true)"
        else:
            reader = f"read_csv_auto('{path_str}', ignore_errors=true)"

        # Build WHERE clause using schema-discovered columns
        params: list = []
        if q.strip():
            schema = con.execute(
                f"SELECT column_name FROM (DESCRIBE SELECT * FROM {reader})"
            ).fetchall()
            col_names = [row[0] for row in schema]
            like_val = f"%{q.strip().lower()}%"
            conditions = " OR ".join(
                f"LOWER(CAST(\"{col.replace(chr(34), chr(34)*2)}\" AS VARCHAR)) LIKE ?"
                for col in col_names
            )
            if conditions:
                where_clause = f"WHERE ({conditions})"
                params = [like_val] * len(col_names)
            else:
                where_clause = ""
        else:
            where_clause = ""

        total = con.execute(
            f"SELECT COUNT(*) FROM {reader} {where_clause}", params
        ).fetchone()[0]

        result = con.execute(
            f"SELECT * FROM {reader} {where_clause} LIMIT {limit} OFFSET {offset}", params
        )
        columns = [desc[0] for desc in result.description]
        rows = [
            {col: (str(val) if val is not None else None) for col, val in zip(columns, row)}
            for row in result.fetchall()
        ]
        con.close()

        return TimelineResponse(data=rows, total=total, page=page, limit=limit)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DuckDB query failed: {str(e)}")


def _query_duckdb_store(db_path: Path, q: str, page: int, limit: int) -> TimelineResponse:
    """Query the persistent DuckDB store built by the pipeline (much faster than re-reading JSONL)."""
    import duckdb  # noqa: F401

    offset = (page - 1) * limit

    try:
        con = duckdb.connect(str(db_path), read_only=True)
        try:
            params: list = []
            if q.strip():
                schema = con.execute("DESCRIBE timeline_events").fetchall()
                col_names = [row[0] for row in schema]
                like_val = f"%{q.strip().lower()}%"
                conditions = " OR ".join(
                    f"LOWER(CAST(\"{col.replace(chr(34), chr(34)*2)}\" AS VARCHAR)) LIKE ?"
                    for col in col_names
                )
                if conditions:
                    where_clause = f"WHERE ({conditions})"
                    params = [like_val] * len(col_names)
                else:
                    where_clause = ""
            else:
                where_clause = ""

            total = con.execute(
                f"SELECT COUNT(*) FROM timeline_events {where_clause}", params
            ).fetchone()[0]
            result = con.execute(
                f"SELECT * FROM timeline_events {where_clause} "
                f"ORDER BY datetime LIMIT {limit} OFFSET {offset}",
                params,
            )
            columns = [d[0] for d in result.description]
            rows = [
                {col: (str(val) if val is not None else None) for col, val in zip(columns, row)}
                for row in result.fetchall()
            ]
            return TimelineResponse(data=rows, total=total, page=page, limit=limit)
        finally:
            con.close()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DuckDB store query failed: {exc}")


def _query_csv_fallback(csv_path: Path, q: str, page: int, limit: int) -> TimelineResponse:
    """Fallback CSV reader for environments without DuckDB."""
    import csv as _csv
    results = []
    total_matched = 0
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    query = q.lower()

    try:
        with open(csv_path, "r", encoding="utf-8", errors="replace") as csvfile:
            reader = _csv.DictReader(csvfile)
            for row in reader:
                if query:
                    if not any(query in str(v).lower() for v in row.values() if v):
                        continue
                if start_idx <= total_matched < end_idx:
                    results.append(dict(row))
                total_matched += 1
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read timeline: {exc}")

    return TimelineResponse(data=results, total=total_matched, page=page, limit=limit)


def _query_jsonl_fallback(jsonl_path: Path, q: str, page: int, limit: int) -> TimelineResponse:
    """Fallback JSONL reader for environments without DuckDB. Streams line-by-line."""
    import json as _json
    results = []
    total_matched = 0
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    query = q.lower()

    try:
        with open(jsonl_path, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = _json.loads(line)
                except _json.JSONDecodeError:
                    continue
                if query:
                    if not any(query in str(v).lower() for v in entry.values() if v is not None):
                        continue
                if start_idx <= total_matched < end_idx:
                    results.append({k: (str(v) if v is not None else None) for k, v in entry.items()})
                total_matched += 1
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read timeline: {exc}")

    return TimelineResponse(data=results, total=total_matched, page=page, limit=limit)



# ── Super Timeline ─────────────────────────────────────────────────────────────


class SuperTimelineResponse(BaseModel):
    data: list[dict]
    total: int
    page: int
    limit: int
    hosts: list[str]


@router.get("/super-timeline/{incident_id}", response_model=SuperTimelineResponse)
async def get_super_timeline_data(
    incident_id: str,
    q: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=100, ge=10, le=1000),
    hosts: str = Query(default="", description="Comma-separated host filter"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuperTimelineResponse:
    """Query the merged cross-host super timeline for an incident."""
    from app.crud.super_timeline import get_super_timeline_by_incident

    suptl = await get_super_timeline_by_incident(db, incident_id)
    if not suptl or suptl.status != "DONE":
        raise HTTPException(
            status_code=404,
            detail="Super timeline not built — trigger /processing/incident/{id}/super-timeline/trigger first",
        )
    if not suptl.duckdb_path:
        raise HTTPException(status_code=404, detail="Super timeline DuckDB file path not set")

    duckdb_path = Path(suptl.duckdb_path)
    if not duckdb_path.exists():
        raise HTTPException(status_code=404, detail="Super timeline DuckDB file not found on disk")

    host_filter = [h.strip() for h in hosts.split(",") if h.strip()] if hosts else []

    return await asyncio.to_thread(
        functools.partial(_query_super_timeline_duckdb, duckdb_path, q, page, limit, host_filter)
    )


def _query_super_timeline_duckdb(
    duckdb_path: Path,
    q: str,
    page: int,
    limit: int,
    host_filter: list[str],
) -> SuperTimelineResponse:
    """Query the persistent super timeline DuckDB store."""
    import duckdb
    import json as _json

    offset = (page - 1) * limit
    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        hosts_rows = con.execute("SELECT DISTINCT host FROM timeline_events ORDER BY host").fetchall()
        all_hosts = [row[0] for row in hosts_rows if row[0]]

        where_parts: list[str] = []
        params: list = []

        if q:
            q_like = f"%{q.lower()}%"
            where_parts.append(
                "(LOWER(message) LIKE ? OR LOWER(source) LIKE ? OR LOWER(timestamp_desc) LIKE ?)"
            )
            params.extend([q_like, q_like, q_like])

        if host_filter:
            placeholders = ", ".join("?" for _ in host_filter)
            where_parts.append(f"host IN ({placeholders})")
            params.extend(host_filter)

        where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

        total = con.execute(
            f"SELECT COUNT(*) FROM timeline_events {where_sql}", params
        ).fetchone()[0]

        rows = con.execute(
            f"""
            SELECT row_id, host, job_id, event_dt, message, timestamp_desc, source, source_short, extra
            FROM timeline_events {where_sql}
            ORDER BY event_dt ASC NULLS LAST, row_id ASC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()

        results = []
        for row in rows:
            _, host, job_id, event_dt, message, ts_desc, source, source_short, extra_json = row
            entry: dict = {
                "host": host,
                "job_id": job_id,
                "datetime": event_dt.isoformat() if event_dt else None,
                "message": message,
                "timestamp_desc": ts_desc,
                "source": source,
                "source_short": source_short,
            }
            if extra_json:
                try:
                    entry.update(
                        _json.loads(extra_json) if isinstance(extra_json, str) else extra_json
                    )
                except Exception:
                    pass
            results.append(entry)

        return SuperTimelineResponse(
            data=results, total=total, page=page, limit=limit, hosts=all_hosts
        )
    finally:
        con.close()
