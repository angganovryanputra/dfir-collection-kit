from datetime import datetime
from typing import List

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IncidentTemplate(Base):
    __tablename__ = "incident_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, index=True)
    incident_type: Mapped[str] = mapped_column(String, index=True)
    default_endpoints: Mapped[List[str]] = mapped_column(ARRAY(String))
    description: Mapped[str] = mapped_column(String)
    preflight_checklist: Mapped[List[str]] = mapped_column(ARRAY(String))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[str] = mapped_column(String)
    usage_count: Mapped[int] = mapped_column(default=0)
