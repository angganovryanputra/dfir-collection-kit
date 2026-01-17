from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db
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

    return DiagnosticsResponse(
        db_status=db_status,
        server_time=datetime.utcnow(),
        backend_version=settings.BACKEND_VERSION,
        client_ip=client_ip,
    )
