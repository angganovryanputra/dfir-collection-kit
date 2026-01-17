from app.schemas.evidence_export import EvidenceExportResponse


def build_export_url(incident_id: str | None, evidence_id: str | None) -> EvidenceExportResponse:
    if evidence_id:
        return EvidenceExportResponse(download_url=f"/api/v1/evidence/exports/{evidence_id}")
    if incident_id:
        return EvidenceExportResponse(download_url=f"/api/v1/evidence/exports/incident/{incident_id}")
    return EvidenceExportResponse(download_url="/api/v1/evidence/exports")
