from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Collector(Base):
    __tablename__ = "collectors"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, index=True)
    endpoint: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    last_heartbeat: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
