from datetime import datetime

from pydantic import BaseModel


class DiagnosticsResponse(BaseModel):
    db_status: str
    server_time: datetime
    backend_version: str
    client_ip: str | None = None
