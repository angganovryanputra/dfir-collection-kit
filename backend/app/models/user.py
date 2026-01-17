from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    role: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    last_login: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    password_hash: Mapped[str] = mapped_column(String)
