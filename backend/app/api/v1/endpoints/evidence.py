from datetime import datetime
from pathlib import Path
import re
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_db, require_roles
from app.core.security import compute_export_signature
from app.crud.evidence import create_folder, create_item, get_item, list_folders, list_items
from app.crud.incident import get_incident
from app.crud.evidence_export import build_export_url
from app.models.user import User
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


def _build_export_zip(incident_id: str) -> Path:
    base_path = Path(settings.EVIDENCE_STORAGE_PATH) / incident_id
    if not base_path.exists():
        raise HTTPException(status_code=404, detail="Incident export not found")
    export_dir = base_path / "exports"
    _ensure_directory(export_dir)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    zip_path = export_dir / f"{incident_id}-{timestamp}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for file_path in base_path.rglob("*"):
            if not file_path.is_file():
                continue
            if export_dir in file_path.parents:
                continue
            rel_path = file_path.relative_to(base_path)
            zip_file.write(file_path, rel_path)
    if zip_path.stat().st_size > settings.MAX_EXPORT_SIZE_MB * 1024 * 1024:
        try:
            zip_path.unlink()
        finally:
            raise HTTPException(status_code=413, detail="Export exceeds size limit")
    _enforce_export_retention(export_dir, settings.MAX_EXPORTS_PER_INCIDENT)
    return zip_path


def _build_evidence_export_zip(incident_id: str, evidence_id: str, evidence_name: str) -> Path:
    base_path = Path(settings.EVIDENCE_STORAGE_PATH) / incident_id
    if not base_path.exists():
        raise HTTPException(status_code=404, detail="Evidence not found")
    export_dir = base_path / "exports"
    _ensure_directory(export_dir)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
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
    if zip_path.stat().st_size > settings.MAX_EXPORT_SIZE_MB * 1024 * 1024:
        try:
            zip_path.unlink()
        finally:
            raise HTTPException(status_code=413, detail="Export exceeds size limit")
    _enforce_export_retention(export_dir, settings.MAX_EXPORTS_PER_INCIDENT)
    return zip_path


def _resolve_evidence_export(incident_id: str, evidence_id: str, evidence_name: str) -> Path:
    base_path = Path(settings.EVIDENCE_STORAGE_PATH) / incident_id
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
    return _build_evidence_export_zip(incident_id, evidence_id, evidence_name)


def _resolve_incident_export(incident_id: str) -> Path:
    base_path = Path(settings.EVIDENCE_STORAGE_PATH) / incident_id
    if not base_path.exists():
        raise HTTPException(status_code=404, detail="Incident export not found")
    export_dir = base_path / "exports"
    if export_dir.exists():
        try:
            return _select_recent_zip(export_dir)
        except HTTPException:
            pass
    return _build_export_zip(incident_id)


def _resolve_export_path(root: Path, identifier: str) -> Path:
    candidates = [path for path in root.rglob("*") if path.is_file() and path.name == identifier]
    if not candidates:
        raise HTTPException(status_code=404, detail="Evidence not found")
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


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
    export_path: Path | None = None
    if not payload.incident_id and not payload.evidence_id:
        raise HTTPException(status_code=400, detail="incident_id or evidence_id is required")
    if payload.incident_id:
        _validate_identifier(payload.incident_id, "incident_id")
        export_path = _resolve_incident_export(payload.incident_id)
    if payload.evidence_id:
        _validate_identifier(payload.evidence_id, "evidence_id")
        item = await get_item(db, payload.evidence_id)
        if not item:
            raise HTTPException(status_code=404, detail="Evidence not found")
        export_path = _resolve_evidence_export(item.incident_id, payload.evidence_id, item.name)
    signature = compute_export_signature(str(export_path)) if export_path else None
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
    return EvidenceExportResponse(download_url=response.download_url, signature=signature, status=response.status)


@router.get("/exports/incident/{incident_id}")
async def download_incident_export(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    safe_incident_id = _validate_identifier(incident_id, "incident_id")
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
    return FileResponse(_resolve_incident_export(safe_incident_id))


@router.get("/exports/{evidence_id}")
async def download_evidence_export(
    evidence_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    safe_evidence_id = _validate_identifier(evidence_id, "evidence_id")
    item = await get_item(db, safe_evidence_id)
    if not item:
        raise HTTPException(status_code=404, detail="Evidence not found")
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
    return FileResponse(_resolve_evidence_export(item.incident_id, safe_evidence_id, item.name))


@router.get("/incident/{incident_id}", response_model=list[EvidenceItemOut])
async def list_incident_evidence(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[EvidenceItemOut]:
    safe_incident_id = _validate_identifier(incident_id, "incident_id")
    items = await list_items(db, safe_incident_id)
    return [EvidenceItemOut.model_validate(item) for item in items]
