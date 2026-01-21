from datetime import datetime
from typing import List

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    type: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, index=True)
    template_id: Mapped[str | None] = mapped_column(String, nullable=True)
    target_endpoints: Mapped[List[str]] = mapped_column(ARRAY(String))
    operator: Mapped[str] = mapped_column(String)
    collection_progress: Mapped[int] = mapped_column(default=0)
    collection_phase: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    last_log_index: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

