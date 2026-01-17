from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.crud.evidence import create_folder, create_item, list_folders, list_items
from app.crud.evidence_export import build_export_url
from app.schemas.evidence import (
    EvidenceFolderCreate,
    EvidenceFolderOut,
    EvidenceItemCreate,
    EvidenceItemOut,
)
from app.schemas.evidence_export import EvidenceExportRequest, EvidenceExportResponse

router = APIRouter()


@router.get("/folders", response_model=list[EvidenceFolderOut])
async def get_folders(db: AsyncSession = Depends(get_db)) -> list[EvidenceFolderOut]:
    folders = await list_folders(db)
    return [EvidenceFolderOut.model_validate(folder) for folder in folders]


@router.post("/folders", response_model=EvidenceFolderOut)
async def create_folder_endpoint(
    payload: EvidenceFolderCreate, db: AsyncSession = Depends(get_db)
) -> EvidenceFolderOut:
    folder = await create_folder(db, payload)
    return EvidenceFolderOut.model_validate(folder)


@router.get("/items", response_model=list[EvidenceItemOut])
async def get_items(
    incident_id: str | None = Query(default=None), db: AsyncSession = Depends(get_db)
) -> list[EvidenceItemOut]:
    items = await list_items(db, incident_id)
    return [EvidenceItemOut.model_validate(item) for item in items]


@router.post("/items", response_model=EvidenceItemOut)
async def create_item_endpoint(
    payload: EvidenceItemCreate, db: AsyncSession = Depends(get_db)
) -> EvidenceItemOut:
    item = await create_item(db, payload)
    return EvidenceItemOut.model_validate(item)


@router.post("/exports", response_model=EvidenceExportResponse)
async def create_export_endpoint(payload: EvidenceExportRequest) -> EvidenceExportResponse:
    if not payload.incident_id and not payload.evidence_id:
        raise HTTPException(status_code=400, detail="incident_id or evidence_id is required")
    return build_export_url(payload.incident_id, payload.evidence_id)


@router.get("/exports/incident/{incident_id}", response_model=EvidenceExportResponse)
async def download_incident_export(incident_id: str) -> EvidenceExportResponse:
    return build_export_url(incident_id, None)


@router.get("/exports/{evidence_id}", response_model=EvidenceExportResponse)
async def download_evidence_export(evidence_id: str) -> EvidenceExportResponse:
    return build_export_url(None, evidence_id)
