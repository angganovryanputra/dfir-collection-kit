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


class UserOut(UserBase):
    id: str
    last_login: str
    created_at: str

    class Config:
        from_attributes = True
