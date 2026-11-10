from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class RoleEnum(str, Enum):
    admin = "admin"
    operator = "operator"
    viewer = "viewer"


class UserBase(BaseModel):
    username: str
    role: RoleEnum
    status: str


class UserCreate(BaseModel):
    username: str
    role: RoleEnum
    status: str
    password: str


class UserUpdate(BaseModel):
    role: RoleEnum | None = None
    status: str | None = None
    password: str | None = None


class UserResponse(UserBase):
    id: str
    last_login: datetime | str | None = None
    created_at: datetime | str

    class Config:
        from_attributes = True


UserOut = UserResponse
