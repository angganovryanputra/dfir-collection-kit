from datetime import datetime, timezone
import shutil

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.models.collector import Collector
from app.schemas.status import DiagnosticsResponse
from app.services.system_settings_service import get_runtime_settings

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """Lightweight liveness probe — no auth, no DB queries."""
    return {"status": "ok"}


@router.get("/diagnostics", response_model=DiagnosticsResponse, dependencies=[Depends(require_roles("admin", "operator"))])
async def get_diagnostics(request: Request, db: AsyncSession = Depends(get_db)) -> DiagnosticsResponse:
    db_status = "unknown"
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"

    client_ip = request.client.host if request.client else None

    collectors_total = 0
    collectors_online = 0
    try:
        collectors_total = await db.scalar(select(func.count()).select_from(Collector)) or 0
        collectors_online = (
            await db.scalar(select(func.count()).select_from(Collector).where(Collector.status == "online"))
        ) or 0
    except Exception:
        collectors_total = 0
        collectors_online = 0

    storage_total_bytes = None
    storage_used_bytes = None
    storage_free_bytes = None
    storage_used_percent = None
    try:
        runtime_settings = await get_runtime_settings(db)
        usage = shutil.disk_usage(runtime_settings.evidence_storage_path)
        storage_total_bytes = usage.total
        storage_used_bytes = usage.used
        storage_free_bytes = usage.free
        if usage.total > 0:
            storage_used_percent = (usage.used / usage.total) * 100
    except Exception:
        storage_total_bytes = None
        storage_used_bytes = None
        storage_free_bytes = None
        storage_used_percent = None

    return DiagnosticsResponse(
        db_status=db_status,
        server_time=datetime.now(timezone.utc),
        backend_version=settings.BACKEND_VERSION,
        client_ip=client_ip,
        collectors_online=collectors_online,
        collectors_total=collectors_total,
        storage_total_bytes=storage_total_bytes,
        storage_used_bytes=storage_used_bytes,
        storage_free_bytes=storage_free_bytes,
        storage_used_percent=storage_used_percent,
    )
