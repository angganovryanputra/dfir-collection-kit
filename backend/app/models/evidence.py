from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EvidenceFolder(Base):
    __tablename__ = "evidence_folders"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), index=True)
    type: Mapped[str] = mapped_column(String, index=True)
    date: Mapped[str] = mapped_column(String)
    files_count: Mapped[int] = mapped_column()
    total_size: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)
    size: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    hash: Mapped[str] = mapped_column(String)
    collected_at: Mapped[str] = mapped_column(String)
