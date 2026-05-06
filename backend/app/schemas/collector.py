from datetime import datetime

from pydantic import BaseModel


class CollectorBase(BaseModel):
    name: str
    endpoint: str
    status: str
    last_heartbeat: datetime


class CollectorCreate(CollectorBase):
    id: str


class CollectorUpdate(BaseModel):
    status: str | None = None


class CollectorOut(CollectorBase):
    id: str

    class Config:
        from_attributes = True
