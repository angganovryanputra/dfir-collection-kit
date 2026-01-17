from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Collector(Base):
    __tablename__ = "collectors"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, index=True)
    endpoint: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    last_heartbeat: Mapped[str] = mapped_column(String)
