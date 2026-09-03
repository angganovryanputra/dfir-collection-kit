from datetime import datetime, timezone
import ipaddress
import shutil

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.core.request_context import get_client_ip, is_secure_transport
from app.models.collector import Collector
from app.schemas.status import ConnectionContextResponse, DiagnosticsResponse
from app.services.system_settings_service import get_runtime_settings

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """Lightweight liveness probe — no auth, no DB queries."""
    return {"status": "ok"}


@router.get("/connection-context", response_model=ConnectionContextResponse)
async def get_connection_context(request: Request, response: Response) -> ConnectionContextResponse:
    """Expose only visitor metadata required by the unauthenticated login UI."""
    client_ip = get_client_ip(request)
    try:
        address = ipaddress.ip_address(client_ip)
        ip_version = address.version
        ip_scope = "public" if address.is_global else "private"
    except ValueError:
        ip_version = None
        ip_scope = "unknown"
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return ConnectionContextResponse(
        client_ip=client_ip if client_ip != "unknown" else None,
        ip_version=ip_version,
        ip_scope=ip_scope,
        secure_transport=is_secure_transport(request),
        server_time=datetime.now(timezone.utc),
    )


@router.get("/diagnostics", response_model=DiagnosticsResponse, dependencies=[Depends(require_roles("admin", "operator"))])
async def get_diagnostics(request: Request, db: AsyncSession = Depends(get_db)) -> DiagnosticsResponse:
    db_status = "unknown"
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"

    client_ip = get_client_ip(request)

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
