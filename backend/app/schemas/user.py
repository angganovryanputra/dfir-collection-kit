from pydantic import BaseModel


class UserBase(BaseModel):
    username: str
    role: str
    status: str
    last_login: str
    created_at: str


class UserCreate(UserBase):
    id: str
    password: str


class UserUpdate(BaseModel):
    role: str | None = None
    status: str | None = None
    last_login: str | None = None


class UserOut(UserBase):
    id: str

    class Config:
        from_attributes = True
