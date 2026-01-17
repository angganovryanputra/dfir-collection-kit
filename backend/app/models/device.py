from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    hostname: Mapped[str] = mapped_column(String, index=True)
    ip_address: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String, index=True)
    os: Mapped[str] = mapped_column(String)
    agent_version: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, index=True)
    last_seen: Mapped[str] = mapped_column(String)
    cpu_usage: Mapped[int | None] = mapped_column(nullable=True)
    memory_usage: Mapped[int | None] = mapped_column(nullable=True)
    collection_status: Mapped[str] = mapped_column(String)
    registered_at: Mapped[str] = mapped_column(String)
