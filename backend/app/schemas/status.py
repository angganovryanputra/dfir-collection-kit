from datetime import datetime

from pydantic import BaseModel


class DiagnosticsResponse(BaseModel):
    db_status: str
    server_time: datetime
    backend_version: str
    client_ip: str | None = None
    collectors_online: int = 0
    collectors_total: int = 0
    storage_total_bytes: int | None = None
    storage_used_bytes: int | None = None
    storage_free_bytes: int | None = None
    storage_used_percent: float | None = None
