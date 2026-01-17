from pydantic import BaseModel


class EvidenceFolderBase(BaseModel):
    incident_id: str
    type: str
    date: str
    files_count: int
    total_size: str
    status: str


class EvidenceFolderCreate(EvidenceFolderBase):
    id: str


class EvidenceFolderOut(EvidenceFolderBase):
    id: str

    class Config:
        from_attributes = True


class EvidenceItemBase(BaseModel):
    incident_id: str
    name: str
    type: str
    size: str
    status: str
    hash: str
    collected_at: str


class EvidenceItemCreate(EvidenceItemBase):
    id: str


class EvidenceItemOut(EvidenceItemBase):
    id: str

    class Config:
        from_attributes = True
