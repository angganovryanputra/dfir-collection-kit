from pydantic import BaseModel


class EvidenceExportRequest(BaseModel):
    incident_id: str | None = None
    evidence_id: str | None = None


class EvidenceExportResponse(BaseModel):
    download_url: str
    signature: str | None = None
    status: str = "ready"
