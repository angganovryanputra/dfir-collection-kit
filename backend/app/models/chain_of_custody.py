from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column


from app.db.base import Base


class ChainOfCustodyEntry(Base):
    __tablename__ = "chain_of_custody_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"), index=True)
    timestamp: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    actor: Mapped[str] = mapped_column(String)
    target: Mapped[str] = mapped_column(String)
    sequence: Mapped[int] = mapped_column(index=True)
    previous_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    entry_hash: Mapped[str] = mapped_column(String, index=True)
