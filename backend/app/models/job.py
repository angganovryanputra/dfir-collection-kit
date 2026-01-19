from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), index=True)
    agent_id: Mapped[str | None] = mapped_column(String, ForeignKey("devices.id"), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String, index=True)
    modules: Mapped[list[dict]] = mapped_column(JSONB)
    output_path: Mapped[str] = mapped_column(String)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
