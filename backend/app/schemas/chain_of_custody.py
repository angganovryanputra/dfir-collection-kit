from pydantic import BaseModel


class ChainOfCustodyEntryBase(BaseModel):
    incident_id: str
    timestamp: str
    action: str
    actor: str
    target: str


class ChainOfCustodyEntryCreate(ChainOfCustodyEntryBase):
    id: str


class ChainOfCustodyEntryOut(ChainOfCustodyEntryBase):
    id: str

    class Config:
        from_attributes = True
