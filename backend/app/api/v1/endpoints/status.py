from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db
from app.models.collector import Collector
from app.schemas.status import DiagnosticsResponse

router = APIRouter()


@router.get("/diagnostics", response_model=DiagnosticsResponse)
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

    return DiagnosticsResponse(
        db_status=db_status,
        server_time=datetime.utcnow(),
        backend_version=settings.BACKEND_VERSION,
        client_ip=client_ip,
        collectors_online=collectors_online,
        collectors_total=collectors_total,
    )
