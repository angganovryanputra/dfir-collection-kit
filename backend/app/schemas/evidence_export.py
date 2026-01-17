from pydantic import BaseModel


class EvidenceExportRequest(BaseModel):
    incident_id: str | None = None
    evidence_id: str | None = None


class EvidenceExportResponse(BaseModel):
    download_url: str
    status: str = "ready"
